import { NextRequest, NextResponse } from 'next/server'
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

function setCell(ws: XLSX.WorkSheet, col: number, row: number, value: string) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  const existing = ws[addr] ?? {}
  // Overwrite value/type but preserve style metadata
  ws[addr] = { ...existing, v: value, t: 's', r: undefined, h: undefined, w: undefined }
}

function fillSheet(ws: XLSX.WorkSheet, content: FieldServiceContent, reportDate: string) {
  const set = (key: keyof typeof MAP_A, value: string) =>
    setCell(ws, MAP_A[key][0], MAP_A[key][1], value)

  set('report_date',   reportDate)
  set('fse_name',      content.fse_name      ?? '')
  set('tool_status',   content.tool_status   ?? '')
  set('customer',      content.customer      ?? '')
  set('location',      content.location      ?? '')
  set('crm_case_id',   content.crm_case_id   ?? '')
  set('model',         content.model         ?? '')
  set('site_survey',   content.site_survey   ?? '')
  set('noise_level',   content.noise_level   ?? '')
  set('main_user',     content.main_user     ?? '')
  set('sid',           content.sid           ?? '')
  set('start_date',    content.start_date    ?? '')
  set('tel',           content.tel           ?? '')
  set('eq_id',         content.eq_id         ?? '')
  set('start_time',    content.start_time    ?? '')
  set('email',         content.email         ?? '')
  set('service_type',  content.service_type  ?? '')
  set('end_time',      content.end_time      ?? '')
  set('problem',       content.problem_statement ?? '')
  set('target',        content.target_statement  ?? '')
  set('daily_note',    content.critical_items?.[0]?.note ?? content.daily_note ?? '')
  set('data_location', content.data_location ?? '')
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

  // Load blank template to preserve layout, merges, column widths
  const templatePath = path.join(
    process.cwd(), 'references', 'Park Systems Field Service Passdown Report.xlsx'
  )
  let templateBuffer: Buffer
  try {
    templateBuffer = fs.readFileSync(templatePath)
  } catch {
    return err('Excel template not found on server', 500)
  }

  const templateWb = XLSX.read(templateBuffer, { type: 'buffer', cellStyles: true })
  const baseSheetName = templateWb.SheetNames[0]
  const baseSheet = templateWb.Sheets[baseSheetName]

  // Deep-clone sheet so concurrent requests don't mutate shared state
  const ws: XLSX.WorkSheet = JSON.parse(JSON.stringify(baseSheet))

  fillSheet(ws, content, docRow.report_date)

  const wb = XLSX.utils.book_new()
  const sheetName = docRow.report_date.replace(/-/g, '.')  // YYYY.MM.DD
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  function seg(s: string) { return (s ?? '').replace(/[/\\:*?"<>|]/g, '').trim() }
  const docType  = docRow.is_external ? 'External' : 'Internal'
  const filename = `${docRow.report_date}_${docType}_${seg(cardRow.customer)}_${seg(cardRow.eq_id)}_field-service.xlsx`

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
