import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Patch a single cell in raw worksheet XML.
 * Converts the target cell to t="inlineStr" so we never touch sharedStrings.xml.
 * Style attribute (s="N") is preserved as-is.
 */
function patchCell(xml: string, addr: string, value: string): string {
  const escaped = escapeXml(value)
  const inner   = value ? `<is><t>${escaped}</t></is>` : ''
  const tAttr   = value ? ' t="inlineStr"' : ''

  // Find r="ADDR" in the XML — unique to the <c> element for this address
  const marker    = `r="${addr}"`
  const markerIdx = xml.indexOf(marker)

  if (markerIdx !== -1) {
    // Walk back to find the opening '<c'
    let start = markerIdx
    while (start > 0 && xml[start] !== '<') start--

    // Find end of opening tag
    let openEnd = markerIdx + marker.length
    while (openEnd < xml.length && xml[openEnd] !== '>') openEnd++
    openEnd++ // include '>'

    // Determine close of element
    let end: number
    if (xml[openEnd - 2] === '/') {
      // Self-closing <c ... />
      end = openEnd
    } else {
      // <c ...>...</c>
      const closeIdx = xml.indexOf('</c>', openEnd)
      end = closeIdx === -1 ? openEnd : closeIdx + 4
    }

    // Extract opening tag attributes, strip t="...", rebuild
    const openTag = xml.slice(start, openEnd)
    const attrsMatch = openTag.match(/^<c([\s\S]*?)(?:\s*\/?>)$/)
    const rawAttrs  = attrsMatch ? attrsMatch[1] : ` r="${addr}"`
    const cleanAttrs = rawAttrs.replace(/\s+t="[^"]*"/g, '')

    return xml.slice(0, start) + `<c${cleanAttrs}${tAttr}>${inner}</c>` + xml.slice(end)
  }

  // Cell doesn't exist — insert into existing row or create row
  const rowIdx   = XLSX.utils.decode_cell(addr).r
  const excelRow = rowIdx + 1
  const newCell  = `<c r="${addr}"${tAttr}>${inner}</c>`

  const rowOpen = new RegExp(`(<row\\b[^>]*\\br="${excelRow}"[^>]*>)`)
  const rowMatch = rowOpen.exec(xml)
  if (rowMatch) {
    const pos = rowMatch.index + rowMatch[0].length
    return xml.slice(0, pos) + newCell + xml.slice(pos)
  }

  // Row doesn't exist — prepend before </sheetData>
  return xml.replace('</sheetData>', `<row r="${excelRow}">${newCell}</row></sheetData>`)
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

  // Load template as raw ZIP — all styles/images/merges are preserved untouched
  const templatePath = path.join(
    process.cwd(), 'references', 'Park Systems Field Service Passdown Report.xlsx'
  )
  let templateBuffer: Buffer
  try {
    templateBuffer = fs.readFileSync(templatePath)
  } catch {
    return err('Excel template not found on server', 500)
  }

  const zip = await JSZip.loadAsync(templateBuffer)

  // Resolve first sheet file via workbook.xml → workbook.xml.rels
  const wbXml     = await zip.file('xl/workbook.xml')?.async('text') ?? ''
  const wbRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? ''

  const firstRId   = wbXml.match(/<sheet\b[^>]*\br:id="(rId\d+)"/)?.[1]
  let   sheetFile  = 'xl/worksheets/sheet1.xml'
  if (firstRId) {
    const target = wbRelsXml.match(new RegExp(`Id="${firstRId}"[^>]*Target="([^"]+)"`))?.[1]
    if (target) sheetFile = target.startsWith('xl/') ? target : `xl/${target}`
  }

  let sheetXml = await zip.file(sheetFile)?.async('text')
  if (!sheetXml) return err('Template worksheet not found', 500)

  // Build cell-address → value list from MAP_A + document content
  const enc = ([col, row]: [number, number]) => XLSX.utils.encode_cell({ r: row, c: col })
  const updates: [string, string][] = [
    [enc(MAP_A.report_date),   docRow.report_date],
    [enc(MAP_A.fse_name),      content.fse_name        ?? ''],
    [enc(MAP_A.tool_status),   content.tool_status     ?? ''],
    [enc(MAP_A.customer),      content.customer        ?? ''],
    [enc(MAP_A.location),      content.location        ?? ''],
    [enc(MAP_A.crm_case_id),   content.crm_case_id     ?? ''],
    [enc(MAP_A.model),         content.model           ?? ''],
    [enc(MAP_A.site_survey),   content.site_survey     ?? ''],
    [enc(MAP_A.noise_level),   content.noise_level     ?? ''],
    [enc(MAP_A.main_user),     content.main_user       ?? ''],
    [enc(MAP_A.sid),           content.sid             ?? ''],
    [enc(MAP_A.start_date),    content.start_date      ?? ''],
    [enc(MAP_A.tel),           content.tel             ?? ''],
    [enc(MAP_A.eq_id),         content.eq_id           ?? ''],
    [enc(MAP_A.start_time),    content.start_time      ?? ''],
    [enc(MAP_A.email),         content.email           ?? ''],
    [enc(MAP_A.service_type),  content.service_type    ?? ''],
    [enc(MAP_A.end_time),      content.end_time        ?? ''],
    [enc(MAP_A.problem),       content.problem_statement ?? ''],
    [enc(MAP_A.target),        content.target_statement  ?? ''],
    [enc(MAP_A.daily_note),    content.critical_items?.[0]?.note ?? content.daily_note ?? ''],
    [enc(MAP_A.data_location), content.data_location   ?? ''],
  ]

  for (const [addr, value] of updates) {
    sheetXml = patchCell(sheetXml, addr, value)
  }

  // Write patched sheet back (only this file changes; all others are untouched)
  zip.file(sheetFile, sheetXml)

  // Rename sheet tab to YYYY.MM.DD in workbook.xml
  const sheetTabName  = docRow.report_date.replace(/-/g, '.')
  const updatedWbXml  = wbXml.replace(
    /(<sheet\b[^>]*\bname=")[^"]*(")/,
    `$1${escapeXml(sheetTabName)}$2`
  )
  zip.file('xl/workbook.xml', updatedWbXml)

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  const seg = (s: string) => (s ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
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
