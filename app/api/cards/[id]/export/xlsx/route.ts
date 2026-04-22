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

type Params = Promise<{ id: string }>

function errRes(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

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

// Generate a single-sheet xlsx buffer via ExcelJS from the template
async function generateSheetBuffer(
  templatePath: string,
  content: FieldServiceContent,
  reportDate: string,
  tabName: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(templatePath)
  const ws = wb.worksheets[0]
  ws.name = tabName
  applyContent(ws, content, reportDate)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

// Remove drawing/legacyDrawing tags from sheet XML (self-closing only — safe targeted removal)
function stripDrawingTags(xml: string): string {
  return xml
    .replace(/<drawing\s[^>]*\/>/g, '')
    .replace(/<legacyDrawing\s[^>]*\/>/g, '')
}

// GET /api/cards/[id]/export/xlsx
// Multi-sheet workbook: all internal field_service reports, newest first.
// Each sheet is generated cleanly via ExcelJS; JSZip is used only for structural combination.
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id: cardId } = await params

  const { data: card } = await supabaseAdmin.from('cards').select('*').eq('id', cardId).single()
  if (!card) return errRes('Card not found', 404)
  const cardRow = card as CardRow
  if (cardRow.type !== 'field_service') return errRes('Excel export is only supported for field_service cards')

  const { data: docs } = await supabaseAdmin
    .from('documents').select('*')
    .eq('card_id', cardId).eq('is_external', false)
    .order('report_date', { ascending: false })

  if (!docs || docs.length === 0) return errRes('No internal reports found for this card', 404)

  const templatePath = path.join(process.cwd(), 'references', 'Park Systems Field Service Passdown Report.xlsx')
  if (!fs.existsSync(templatePath)) return errRes('Excel template not found on server', 500)

  // ── Step 1: Generate individual xlsx buffers via ExcelJS (no XML manipulation) ──

  const sheetBufs: Buffer[] = []
  for (const docRow of docs as DocumentRow[]) {
    const content = normalizeFieldServiceContent(docRow.content) as FieldServiceContent
    const tabName = docRow.report_date.replace(/-/g, '.')
    sheetBufs.push(await generateSheetBuffer(templatePath, content, docRow.report_date, tabName))
  }

  // ── Step 2: Combine into multi-sheet workbook via JSZip (structural only) ──
  //
  // Strategy:
  // - Use first buffer as base (keeps styles, theme, shared strings, media, drawing)
  // - Add sheets 2+ from other buffers
  // - All sheets 2+: strip <drawing>/<legacyDrawing> tags since they share drawing1.xml
  //   from the base but we can't safely have multiple rels pointing to the same drawing
  // - Sheets 2+ have no sheet rels file → no broken drawing references
  // - workbook.xml / workbook.xml.rels / [Content_Types].xml updated structurally

  const baseZip    = await JSZip.loadAsync(sheetBufs[0])
  const baseWbXml  = await baseZip.file('xl/workbook.xml')?.async('text') ?? ''
  const baseWbRels = await baseZip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? ''
  const baseCT     = await baseZip.file('[Content_Types].xml')?.async('text') ?? ''

  // Resolve the first sheet file name in the base zip (ExcelJS uses sheet1.xml)
  const firstRId    = baseWbXml.match(/<sheet\b[^>]*\br:id="(rId\d+)"/)?.[1]
  let   baseSheetFile = 'xl/worksheets/sheet1.xml'
  if (firstRId) {
    const t = baseWbRels.match(new RegExp(`Id="${firstRId}"[^>]*Target="([^"]+)"`))?.[1]
    if (t) baseSheetFile = t.startsWith('xl/') ? t : `xl/${t}`
  }

  const sheetEntries: string[] = []
  const wsRelEntries: string[] = []
  const ctAddEntries: string[] = []

  for (let i = 0; i < sheetBufs.length; i++) {
    const n       = i + 1
    const wsId    = `wsId${n}`
    const docRow  = (docs as DocumentRow[])[i]
    const tabName = docRow.report_date.replace(/-/g, '.')

    if (i === 0) {
      // First sheet is already in the base zip as baseSheetFile.
      // Rename to sheet1.xml if it differs (normally it's already sheet1.xml from ExcelJS).
      if (baseSheetFile !== 'xl/worksheets/sheet1.xml') {
        const origData = await baseZip.file(baseSheetFile)?.async('uint8array')
        if (origData) {
          baseZip.file('xl/worksheets/sheet1.xml', origData)
          baseZip.remove(baseSheetFile)
        }
        const baseSheetNum = baseSheetFile.match(/sheet(\d+)\.xml$/)?.[1] ?? '1'
        const origRels = await baseZip.file(`xl/worksheets/_rels/sheet${baseSheetNum}.xml.rels`)?.async('uint8array')
        if (origRels) {
          baseZip.file('xl/worksheets/_rels/sheet1.xml.rels', origRels)
          baseZip.remove(`xl/worksheets/_rels/sheet${baseSheetNum}.xml.rels`)
        }
      }
      // sheet1 content type already exists in base [Content_Types].xml
    } else {
      // Extract sheet1.xml from this buffer (ExcelJS-generated, valid structure)
      const sheetZip = await JSZip.loadAsync(sheetBufs[i])
      const rawXml   = await sheetZip.file('xl/worksheets/sheet1.xml')?.async('text')

      if (rawXml) {
        // Remove drawing refs: these sheets don't get their own rels file, so any
        // drawing reference in the XML would be a dangling relationship → strip it
        baseZip.file(`xl/worksheets/sheet${n}.xml`, stripDrawingTags(rawXml))
      }

      ctAddEntries.push(
        `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
    }

    sheetEntries.push(`<sheet name="${escapeXml(tabName)}" sheetId="${n}" r:id="${wsId}"/>`)
    wsRelEntries.push(
      `<Relationship Id="${wsId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`,
    )
  }

  // Replace <sheets> block in workbook.xml
  baseZip.file('xl/workbook.xml', baseWbXml.replace(
    /<sheets>[\s\S]*?<\/sheets>/,
    `<sheets>${sheetEntries.join('')}</sheets>`,
  ))

  // Replace worksheet relationships in workbook.xml.rels
  baseZip.file('xl/_rels/workbook.xml.rels', baseWbRels
    .replace(/<Relationship\b[^>]*\bType="[^"]*\/worksheet"[^>]*\/>/g, '')
    .replace('</Relationships>', `${wsRelEntries.join('')}</Relationships>`),
  )

  // Add content type entries for sheets 2+
  if (ctAddEntries.length > 0) {
    baseZip.file('[Content_Types].xml', baseCT.replace('</Types>', `${ctAddEntries.join('')}</Types>`))
  }

  const buf      = await baseZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const seg      = (s: string) => (s ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
  const filename = `${seg(cardRow.customer)}_${seg(cardRow.eq_id)}_field-service-reports.xlsx`

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
