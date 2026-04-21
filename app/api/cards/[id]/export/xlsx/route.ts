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

type Params = Promise<{ id: string }>

function errRes(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function patchCell(xml: string, addr: string, value: string): string {
  const escaped = escapeXml(value)
  const inner   = value ? `<is><t>${escaped}</t></is>` : ''
  const tAttr   = value ? ' t="inlineStr"' : ''

  const marker    = `r="${addr}"`
  const markerIdx = xml.indexOf(marker)

  if (markerIdx !== -1) {
    let start = markerIdx
    while (start > 0 && xml[start] !== '<') start--
    let openEnd = markerIdx + marker.length
    while (openEnd < xml.length && xml[openEnd] !== '>') openEnd++
    openEnd++
    const end = xml[openEnd - 2] === '/'
      ? openEnd
      : (() => { const ci = xml.indexOf('</c>', openEnd); return ci === -1 ? openEnd : ci + 4 })()

    const openTag    = xml.slice(start, openEnd)
    const attrsMatch = openTag.match(/^<c([\s\S]*?)(?:\s*\/?>)$/)
    const rawAttrs   = attrsMatch ? attrsMatch[1] : ` r="${addr}"`
    const cleanAttrs = rawAttrs.replace(/\s+t="[^"]*"/g, '')
    return xml.slice(0, start) + `<c${cleanAttrs}${tAttr}>${inner}</c>` + xml.slice(end)
  }

  const excelRow = XLSX.utils.decode_cell(addr).r + 1
  const newCell  = `<c r="${addr}"${tAttr}>${inner}</c>`
  const rowMatch = new RegExp(`(<row\\b[^>]*\\br="${excelRow}"[^>]*>)`).exec(xml)
  if (rowMatch) {
    const pos = rowMatch.index + rowMatch[0].length
    return xml.slice(0, pos) + newCell + xml.slice(pos)
  }
  return xml.replace('</sheetData>', `<row r="${excelRow}">${newCell}</row></sheetData>`)
}

function buildUpdates(content: FieldServiceContent, reportDate: string): [string, string][] {
  const enc = ([col, row]: [number, number]) => XLSX.utils.encode_cell({ r: row, c: col })
  return [
    [enc(MAP_A.report_date),   reportDate],
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
}

// GET /api/cards/[id]/export/xlsx
// Exports all internal field_service reports as a multi-sheet workbook
// using the Park Systems template (styles/logo/merges preserved via raw ZIP patching).
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id: cardId } = await params

  const { data: card } = await supabaseAdmin.from('cards').select('*').eq('id', cardId).single()
  if (!card) return errRes('Card not found', 404)
  const cardRow = card as CardRow
  if (cardRow.type !== 'field_service') return errRes('Excel export is only supported for field_service cards')

  const { data: docs } = await supabaseAdmin
    .from('documents').select('*')
    .eq('card_id', cardId).eq('is_external', false)
    .order('report_date', { ascending: true })

  if (!docs || docs.length === 0) return errRes('No internal reports found for this card', 404)

  const templatePath = path.join(process.cwd(), 'references', 'Park Systems Field Service Passdown Report.xlsx')
  let templateBuffer: Buffer
  try { templateBuffer = fs.readFileSync(templatePath) }
  catch { return errRes('Excel template not found on server', 500) }

  const zip = await JSZip.loadAsync(templateBuffer)

  // Resolve template worksheet file via workbook relationships
  const wbXml     = await zip.file('xl/workbook.xml')?.async('text') ?? ''
  const wbRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? ''
  const firstRId  = wbXml.match(/<sheet\b[^>]*\br:id="(rId\d+)"/)?.[1]
  let   tmplFile  = 'xl/worksheets/sheet1.xml'
  if (firstRId) {
    const t = wbRelsXml.match(new RegExp(`Id="${firstRId}"[^>]*Target="([^"]+)"`))?.[1]
    if (t) tmplFile = t.startsWith('xl/') ? t : `xl/${t}`
  }
  const tmplSheetNum = tmplFile.match(/sheet(\d+)\.xml$/)?.[1] ?? '1'

  const tmplXml = await zip.file(tmplFile)?.async('text')
  if (!tmplXml) return errRes('Template worksheet not found in file', 500)

  // Check if template sheet has drawing (logo)
  const tmplSheetRels = await zip.file(`xl/worksheets/_rels/sheet${tmplSheetNum}.xml.rels`)?.async('text') ?? null
  const drawingNumStr = tmplSheetRels?.match(/drawings\/drawing(\d+)\.xml/)?.[1] ?? null
  const drawingXml    = drawingNumStr
    ? await zip.file(`xl/drawings/drawing${drawingNumStr}.xml`)?.async('text') ?? null
    : null
  const drawingRels   = drawingNumStr
    ? await zip.file(`xl/drawings/_rels/drawing${drawingNumStr}.xml.rels`)?.async('text') ?? null
    : null

  const contentTypesXml = await zip.file('[Content_Types].xml')?.async('text') ?? ''

  const sheetEntries:  string[] = []
  const wsRelEntries:  string[] = []
  const ctAddEntries:  string[] = []

  for (let i = 0; i < docs.length; i++) {
    const docRow  = docs[i] as DocumentRow
    const content = normalizeFieldServiceContent(docRow.content) as FieldServiceContent
    const n       = i + 1                                          // 1-indexed sheet number
    const wsId    = `wsId${n}`                                     // unique rels ID
    const tabName = docRow.report_date.replace(/-/g, '.')          // YYYY.MM.DD

    // Patch template XML for this document's data
    let patchedXml = tmplXml
    for (const [addr, value] of buildUpdates(content, docRow.report_date)) {
      patchedXml = patchCell(patchedXml, addr, value)
    }
    zip.file(`xl/worksheets/sheet${n}.xml`, patchedXml)

    // Clone drawing (logo) for each sheet so all sheets render the header image
    if (drawingNumStr && tmplSheetRels && drawingXml && drawingRels) {
      zip.file(`xl/drawings/drawing${n}.xml`, drawingXml)
      zip.file(`xl/drawings/_rels/drawing${n}.xml.rels`, drawingRels)
      const patchedSheetRels = tmplSheetRels.replace(
        /drawings\/drawing\d+\.xml/g,
        `drawings/drawing${n}.xml`
      )
      zip.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, patchedSheetRels)
      if (n > 1) {
        // sheet1 entries already exist in Content_Types; only add for n≥2
        ctAddEntries.push(
          `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          `<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
        )
      }
    } else if (n > 1) {
      ctAddEntries.push(
        `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
    }

    sheetEntries.push(`<sheet name="${escapeXml(tabName)}" sheetId="${n}" r:id="${wsId}"/>`)
    wsRelEntries.push(
      `<Relationship Id="${wsId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`,
    )
  }

  // Update workbook.xml — replace entire <sheets> block
  zip.file('xl/workbook.xml', wbXml.replace(
    /<sheets>[\s\S]*?<\/sheets>/,
    `<sheets>${sheetEntries.join('')}</sheets>`,
  ))

  // Update workbook.xml.rels — remove old worksheet rels, append new ones
  zip.file('xl/_rels/workbook.xml.rels', wbRelsXml
    .replace(/<Relationship\b[^>]*\bType="[^"]*\/worksheet"[^>]*\/>/g, '')
    .replace('</Relationships>', `${wsRelEntries.join('')}</Relationships>`),
  )

  // Update [Content_Types].xml — insert new overrides for sheets 2+
  if (ctAddEntries.length > 0) {
    zip.file('[Content_Types].xml', contentTypesXml.replace('</Types>', `${ctAddEntries.join('')}</Types>`))
  }

  const buf      = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
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
