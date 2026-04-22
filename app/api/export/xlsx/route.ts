import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeFieldServiceContent } from '@/lib/content-defaults'
import { MAP_A } from '@/lib/excel-parser'
import type { CardRow, DocumentRow } from '@/types/db'
import type { FieldServiceContent } from '@/types/report'

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function removeExternalDefinedNames(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf)
  const wbXml = await zip.file('xl/workbook.xml')?.async('text')
  if (!wbXml) return buf
  const fixed = wbXml.replace(/<definedName\b[^>]*>[^<]*\[\d+\][^<]*<\/definedName>/g, '')
  if (fixed === wbXml) return buf
  zip.file('xl/workbook.xml', fixed)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) as Promise<Buffer>
}

// Convert 0-indexed [col, row] from MAP_A to Excel cell address ('B16' etc.)
function addr([col, row]: [number, number]): string {
  return XLSX.utils.encode_cell({ r: row, c: col })
}

function applyContent(ws: ExcelJS.Worksheet, content: FieldServiceContent, reportDate: string) {
  const set = (key: [number, number], value: string) => {
    ws.getCell(addr(key)).value = value
  }

  set(MAP_A.report_date,   reportDate)
  set(MAP_A.fse_name,      content.fse_name          ?? '')
  set(MAP_A.tool_status,   content.tool_status       ?? '')
  set(MAP_A.customer,      content.customer          ?? '')
  set(MAP_A.location,      content.location          ?? '')
  set(MAP_A.crm_case_id,   content.crm_case_id       ?? '')
  set(MAP_A.model,         content.model             ?? '')
  set(MAP_A.site_survey,   content.site_survey       ?? '')
  set(MAP_A.noise_level,   content.noise_level       ?? '')
  set(MAP_A.main_user,     content.main_user         ?? '')
  set(MAP_A.sid,           content.sid               ?? '')
  set(MAP_A.start_date,    content.start_date        ?? '')
  set(MAP_A.tel,           content.tel               ?? '')
  set(MAP_A.eq_id,         content.eq_id             ?? '')
  set(MAP_A.start_time,    content.start_time        ?? '')
  set(MAP_A.email,         content.email             ?? '')
  set(MAP_A.service_type,  content.service_type      ?? '')
  set(MAP_A.end_time,      content.end_time          ?? '')
  set(MAP_A.problem,       content.problem_statement ?? '')
  set(MAP_A.target,        content.target_statement  ?? '')
  set(MAP_A.daily_note,    content.critical_items?.[0]?.note ?? content.daily_note ?? '')
  set(MAP_A.data_location, content.data_location     ?? '')

  // Enable wrap text on long-text cells and expand merged rows 16-21
  const wrapCells = [MAP_A.problem, MAP_A.target, MAP_A.daily_note]
  for (const key of wrapCells) {
    const cell = ws.getCell(addr(key))
    cell.alignment = { ...(cell.alignment ?? {}), wrapText: true, vertical: 'top', horizontal: 'left' }
  }
  for (let r = 16; r <= 21; r++) {
    const row = ws.getRow(r)
    if (!row.height || row.height < 40) row.height = 40
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.documentId !== 'string') {
    return err('Body must be { documentId: string }')
  }

  const { documentId } = body as { documentId: string }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('documents').select('*').eq('id', documentId).single()
  if (docErr || !doc) return err('Document not found', 404)
  const docRow = doc as DocumentRow

  const { data: card, error: cardErr } = await supabaseAdmin
    .from('cards').select('*').eq('id', docRow.card_id).single()
  if (cardErr || !card) return err('Card not found', 404)
  const cardRow = card as CardRow

  if (cardRow.type !== 'field_service') {
    return err('Excel export is only supported for field_service cards')
  }

  const content = normalizeFieldServiceContent(docRow.content) as FieldServiceContent

  const templatePath = path.join(
    process.cwd(), 'references', 'Park Systems Field Service Passdown Report.xlsx'
  )
  if (!fs.existsSync(templatePath)) return err('Excel template not found on server', 500)

  // Load template with ExcelJS — preserves styles, merges, borders, logo
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(templatePath)

  const ws = wb.worksheets[0]
  if (!ws) return err('Template worksheet not found', 500)

  ws.name = docRow.report_date.replace(/-/g, '.')
  applyContent(ws, content, docRow.report_date)

  const buf = await removeExternalDefinedNames(Buffer.from(await wb.xlsx.writeBuffer()))

  const seg      = (s: string) => (s ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
  const docType  = docRow.is_external ? 'External' : 'Internal'
  const filename = `${docRow.report_date}_${docType}_${seg(cardRow.customer)}_${seg(cardRow.eq_id)}_field-service.xlsx`

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
