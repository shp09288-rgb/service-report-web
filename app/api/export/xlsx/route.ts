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

function patchCell(xml: string, addr: string, value: string): string {
  const escaped = escapeXml(value)
  const inner   = value ? `<is><t xml:space="preserve">${escaped}</t></is>` : ''
  const tAttr   = value ? ' t="inlineStr"' : ''

  const marker    = `r="${addr}"`
  const markerIdx = xml.indexOf(marker)

  if (markerIdx !== -1) {
    let start = markerIdx
    while (start > 0 && xml[start] !== '<') start--

    let openEnd = markerIdx + marker.length
    while (openEnd < xml.length && xml[openEnd] !== '>') openEnd++
    openEnd++

    let end: number
    if (xml[openEnd - 2] === '/') {
      end = openEnd
    } else {
      const closeIdx = xml.indexOf('</c>', openEnd)
      end = closeIdx === -1 ? openEnd : closeIdx + 4
    }

    const openTag    = xml.slice(start, openEnd)
    const attrsMatch = openTag.match(/^<c([\s\S]*?)(?:\s*\/?>)$/)
    const rawAttrs   = attrsMatch ? attrsMatch[1] : ` r="${addr}"`
    const cleanAttrs = rawAttrs.replace(/\s+t="[^"]*"/g, '')

    return xml.slice(0, start) + `<c${cleanAttrs}${tAttr}>${inner}</c>` + xml.slice(end)
  }

  const rowIdx   = XLSX.utils.decode_cell(addr).r
  const excelRow = rowIdx + 1
  const newCell  = `<c r="${addr}"${tAttr}>${inner}</c>`

  const rowOpen  = new RegExp(`(<row\\b[^>]*\\br="${excelRow}"[^>]*>)`)
  const rowMatch = rowOpen.exec(xml)
  if (rowMatch) {
    const pos = rowMatch.index + rowMatch[0].length
    return xml.slice(0, pos) + newCell + xml.slice(pos)
  }

  return xml.replace('</sheetData>', `<row r="${excelRow}">${newCell}</row></sheetData>`)
}

function addWrapTextToStyles(stylesXml: string, styleIndices: number[]): string {
  const cellXfsMatch = stylesXml.match(/<cellXfs>([\s\S]*?)<\/cellXfs>/)
  if (!cellXfsMatch) return stylesXml

  const xfPattern = /<xf\b([\s\S]*?)(?:\/>|>[\s\S]*?<\/xf>)/g
  let xfIndex = 0
  const toModify = new Set(styleIndices)

  const newCellXfs = cellXfsMatch[1].replace(xfPattern, (match) => {
    const idx = xfIndex++
    if (!toModify.has(idx) || match.includes('wrapText="1"')) return match
    if (match.includes('<alignment')) return match.replace('<alignment', '<alignment wrapText="1"')
    if (match.includes('/>')) return match.replace('/>', '><alignment wrapText="1"/></xf>')
    return match.replace('</xf>', '<alignment wrapText="1"/></xf>')
  })

  return stylesXml.replace(/<cellXfs>([\s\S]*?)<\/cellXfs>/, `<cellXfs>${newCellXfs}</cellXfs>`)
}

function setRowHeight(xml: string, excelRow: number, ht: number): string {
  return xml.replace(
    new RegExp(`(<row\\b[^>]*\\br="${excelRow}"[^>]*?)(?:\\s+customHeight="[^"]*")?(?:\\s+ht="[^"]*")?([^>]*>)`),
    (_, before, after) => `${before} customHeight="1" ht="${ht}"${after}`
  )
}

// Remove all drawing/image references from sheet XML to prevent Excel repair errors
function stripDrawingRefs(xml: string): string {
  return xml
    .replace(/<drawing\b[^/]*\/>/g, '')
    .replace(/<drawing\b[^>]*>[\s\S]*?<\/drawing>/g, '')
    .replace(/<legacyDrawing\b[^/]*\/>/g, '')
    .replace(/<legacyDrawing\b[^>]*>[\s\S]*?<\/legacyDrawing>/g, '')
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
  let templateBuffer: Buffer
  try {
    templateBuffer = fs.readFileSync(templatePath)
  } catch {
    return err('Excel template not found on server', 500)
  }

  const zip = await JSZip.loadAsync(templateBuffer)

  const wbXml     = await zip.file('xl/workbook.xml')?.async('text') ?? ''
  const wbRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? ''

  const firstRId  = wbXml.match(/<sheet\b[^>]*\br:id="(rId\d+)"/)?.[1]
  let   sheetFile = 'xl/worksheets/sheet1.xml'
  if (firstRId) {
    const target = wbRelsXml.match(new RegExp(`Id="${firstRId}"[^>]*Target="([^"]+)"`))?.[1]
    if (target) sheetFile = target.startsWith('xl/') ? target : `xl/${target}`
  }

  let sheetXml = await zip.file(sheetFile)?.async('text')
  if (!sheetXml) return err('Template worksheet not found', 500)

  // Strip all drawing/image refs — prevents repair dialog and misplaced images
  sheetXml = stripDrawingRefs(sheetXml)

  const enc = ([col, row]: [number, number]) => XLSX.utils.encode_cell({ r: row, c: col })
  const updates: [string, string][] = [
    [enc(MAP_A.report_date),   docRow.report_date],
    [enc(MAP_A.fse_name),      content.fse_name          ?? ''],
    [enc(MAP_A.tool_status),   content.tool_status       ?? ''],
    [enc(MAP_A.customer),      content.customer          ?? ''],
    [enc(MAP_A.location),      content.location          ?? ''],
    [enc(MAP_A.crm_case_id),   content.crm_case_id       ?? ''],
    [enc(MAP_A.model),         content.model             ?? ''],
    [enc(MAP_A.site_survey),   content.site_survey       ?? ''],
    [enc(MAP_A.noise_level),   content.noise_level       ?? ''],
    [enc(MAP_A.main_user),     content.main_user         ?? ''],
    [enc(MAP_A.sid),           content.sid               ?? ''],
    [enc(MAP_A.start_date),    content.start_date        ?? ''],
    [enc(MAP_A.tel),           content.tel               ?? ''],
    [enc(MAP_A.eq_id),         content.eq_id             ?? ''],
    [enc(MAP_A.start_time),    content.start_time        ?? ''],
    [enc(MAP_A.email),         content.email             ?? ''],
    [enc(MAP_A.service_type),  content.service_type      ?? ''],
    [enc(MAP_A.end_time),      content.end_time          ?? ''],
    [enc(MAP_A.problem),       content.problem_statement ?? ''],
    [enc(MAP_A.target),        content.target_statement  ?? ''],
    [enc(MAP_A.daily_note),    content.critical_items?.[0]?.note ?? content.daily_note ?? ''],
    [enc(MAP_A.data_location), content.data_location     ?? ''],
  ]

  for (const [addr, value] of updates) {
    sheetXml = patchCell(sheetXml, addr, value)
  }

  // Expand rows 16-21 (problem/target merged area) so long text is visible
  for (let r = 16; r <= 21; r++) {
    sheetXml = setRowHeight(sheetXml, r, 40)
  }

  zip.file(sheetFile, sheetXml)

  // Patch styles.xml — add wrapText to styles 68 (problem), 70 (target), 78 (daily_note)
  const stylesXml = await zip.file('xl/styles.xml')?.async('text')
  if (stylesXml) {
    zip.file('xl/styles.xml', addWrapTextToStyles(stylesXml, [68, 70, 78]))
  }

  // Rename sheet tab
  zip.file('xl/workbook.xml', wbXml.replace(
    /(<sheet\b[^>]*\bname=")[^"]*(")/,
    `$1${escapeXml(docRow.report_date.replace(/-/g, '.'))}$2`
  ))

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

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
