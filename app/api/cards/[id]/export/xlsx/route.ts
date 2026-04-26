import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeFieldServiceContent, normalizeInstallationContent } from '@/lib/content-defaults'
import { MAP_A } from '@/lib/excel-parser'
import { getProgress, GANTT_CATEGORIES, computeInstallationProgress } from '@/lib/gantt-progress'
import type { CardRow, DocumentRow, GanttTask } from '@/types/db'
import type { FieldServiceContent, InstallationContent } from '@/types/report'

type Params = Promise<{ id: string }>

function errRes(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
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
  return removeExternalDefinedNames(Buffer.from(await wb.xlsx.writeBuffer()))
}

// Remove drawing/legacyDrawing tags from sheet XML (self-closing only — safe targeted removal)
function stripDrawingTags(xml: string): string {
  return xml
    .replace(/<drawing\s[^>]*\/>/g, '')
    .replace(/<legacyDrawing\s[^>]*\/>/g, '')
}

// ── Installation template cell map ───────────────────────────
// Row/col are 1-based for ExcelJS
const INST_MAP = {
  fse_name:         'V3',
  report_date:      'V4',
  customer:         'C7',
  model:            'C8',
  sid:              'C9',
  eq_id:            'C10',
  location:         'L7',
  site_survey:      'L8',
  noise_level:      'O8',
  start_date:       'L9',
  est_complete_date:'L10',
  crm_case_id:      'T7',
  main_user:        'T8',
  tel:              'T9',
  email:            'T10',
  committed_pct:    'D15',
  total_days:       'P15',
  actual_pct:       'D16',
  progress_days:    'P16',
  critical_item_summary: 'B18',
  // detail_report rows: B28, B29, B30, ...
  next_plan:        'O28',
  data_location:    'C33',
  service_type:     'C11',
  start_time:       'L11',
  end_time:         'T11',
}

// ── Date serial helper ────────────────────────────────────────
// Excel date serial = days since Dec 30, 1899 (1900 leap-year bug accounted for).
function dateToSerial(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor(d.getTime() / 86400000) + 25569 + 1
}

// ── LGD AP3-based Installation Export ────────────────────────
// Uses references/LGD AP3_installation report.xlsx as the single base
// workbook.  Sheet1 (Gantt Chart) is updated in-place; one date sheet
// is cloned per document report (reusing LGD AP3's sheet2+).  All
// drawings, charts, styles, and shared-strings remain untouched so
// Excel opens without repair prompts.

/** Extract column-letter → style-index map from a <row> XML fragment. */
function extractRowStyles(rowXml: string): Record<string, number> {
  const styles: Record<string, number> = {}
  for (const m of rowXml.matchAll(/<c r="([A-Z]+)\d+"[^>]*\bs="(\d+)"/g)) {
    styles[m[1]] = parseInt(m[2])
  }
  return styles
}

/**
 * Replace a cell's value with an inline string.
 * Uses indexOf-based splitting (avoids regex template-literal escape issues).
 * Preserves the s= (style) attribute so visual formatting survives.
 */
function patchCellStr(xml: string, ref: string, value: string): string {
  const openTag = `<c r="${ref}"`
  const idx = xml.indexOf(openTag)
  if (idx < 0) return xml

  const tagEnd = xml.indexOf('>', idx)
  if (tagEnd < 0) return xml

  const isSelfClose = xml[tagEnd - 1] === '/'
  const rawAttrs = isSelfClose
    ? xml.slice(idx + openTag.length, tagEnd - 1)
    : xml.slice(idx + openTag.length, tagEnd)
  const cleanAttrs = rawAttrs
    .replace(/\s*\bt="[^"]*"/g, '')
    .replace(/\s*\bcm="[^"]*"/g, '')

  const replacement = !value.trim()
    ? `<c r="${ref}"${cleanAttrs}/>`
    : `<c r="${ref}"${cleanAttrs} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`

  if (isSelfClose) {
    return xml.slice(0, idx) + replacement + xml.slice(tagEnd + 1)
  }
  const closeIdx = xml.indexOf('</c>', tagEnd)
  if (closeIdx < 0) return xml
  return xml.slice(0, idx) + replacement + xml.slice(closeIdx + 4)
}

/**
 * Replace a cell's value with a plain number, clearing any formula.
 * Preserves the s= (style) attribute.
 */
function patchCellNum(xml: string, ref: string, value: number): string {
  const openTag = `<c r="${ref}"`
  const idx = xml.indexOf(openTag)
  if (idx < 0) return xml

  const tagEnd = xml.indexOf('>', idx)
  if (tagEnd < 0) return xml

  const isSelfClose = xml[tagEnd - 1] === '/'
  const rawAttrs = isSelfClose
    ? xml.slice(idx + openTag.length, tagEnd - 1)
    : xml.slice(idx + openTag.length, tagEnd)
  const cleanAttrs = rawAttrs
    .replace(/\s*\bt="[^"]*"/g, '')
    .replace(/\s*\bcm="[^"]*"/g, '')

  const replacement = `<c r="${ref}"${cleanAttrs}><v>${value}</v></c>`

  if (isSelfClose) {
    return xml.slice(0, idx) + replacement + xml.slice(tagEnd + 1)
  }
  const closeIdx = xml.indexOf('</c>', tagEnd)
  if (closeIdx < 0) return xml
  return xml.slice(0, idx) + replacement + xml.slice(closeIdx + 4)
}

/**
 * Strip date-sheet XML of hyperlinks and vmlDrawing tags (comments layer).
 * The drawing rId2 reference (radar chart) is intentionally preserved.
 */
function cleanDateSheetXml(xml: string): string {
  xml = xml.replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/g, '')
  xml = xml.replace(/<legacyDrawing\s[^>]*\/>/g, '')
  return xml
}

/** Generate Gantt Plan+Action row pairs for LGD AP3's style table. */
function generateGanttTaskRowsXmlLGD(
  tasks: GanttTask[],
  planStyles:   Record<string, number>,
  actionStyles: Record<string, number>,
): string {
  const ps  = (col: string, fb: number) => planStyles[col]   ?? fb
  const asc = (col: string, fb: number) => actionStyles[col] ?? fb

  const iStr = (col: string, row: number, s: number, val: string | null | undefined) => {
    const v = (val ?? '').trim()
    if (!v) return `<c r="${col}${row}" s="${s}"/>`
    return `<c r="${col}${row}" s="${s}" t="inlineStr"><is><t>${escapeXml(v)}</t></is></c>`
  }
  const numC = (col: string, row: number, s: number, val: number | null) =>
    val != null ? `<c r="${col}${row}" s="${s}"><v>${val}</v></c>`
                : `<c r="${col}${row}" s="${s}"/>`

  const rows: string[] = []
  let rn = 12

  for (const task of tasks) {
    const planStart = dateToSerial(task.plan_start_date)
    const planEnd   = dateToSerial(task.plan_complete_date)
    const actStart  = dateToSerial(task.start_date)
    const actEnd    = dateToSerial(task.complete_date)
    const no        = task.no != null ? Number(task.no) : null
    const pr = rn, ar = rn + 1

    const statusVal = actEnd ? 'Completed' : actStart ? 'Started' : 'Planned'
    const durFml    = `IF($K${ar}&lt;&gt;"",$K${ar}-$J${ar}+1,"")`

    rows.push(
      `<row r="${pr}" spans="1:87" ht="15" customHeight="1" thickTop="1" x14ac:dyDescent="0.25">` +
      numC('A', pr, ps('A', 51), no) +
      iStr('B', pr, ps('B', 52), task.action) +
      iStr('C', pr, ps('C', 53), task.category) +
      iStr('D', pr, ps('D', 54), task.item) +
      `<c r="E${pr}" s="${ps('E', 55)}"/>` +
      iStr('F', pr, ps('F', 52), task.remark) +
      iStr('G', pr, ps('G', 56), statusVal) +
      (task.plan_duration != null
        ? `<c r="H${pr}" s="${ps('H', 61)}"><v>${task.plan_duration}</v></c>`
        : `<c r="H${pr}" s="${ps('H', 61)}"/>`) +
      iStr('I', pr, ps('I', 45), 'Plan') +
      numC('J', pr, ps('J', 46), planStart) +
      numC('K', pr, ps('K', 46), planEnd) +
      `</row>`,
    )
    rows.push(
      `<row r="${ar}" spans="1:87" ht="15" customHeight="1" thickBot="1" x14ac:dyDescent="0.3">` +
      `<c r="A${ar}" s="${asc('A', 64)}"/>` +
      `<c r="B${ar}" s="${asc('B', 65)}"/>` +
      `<c r="C${ar}" s="${asc('C', 52)}"/>` +
      `<c r="D${ar}" s="${asc('D', 66)}"/>` +
      `<c r="E${ar}" s="${asc('E', 67)}"/>` +
      `<c r="F${ar}" s="${asc('F', 65)}"/>` +
      iStr('G', ar, asc('G', 68), 'Action') +
      `<c r="H${ar}" s="${asc('H', 69)}"><f>${durFml}</f><v>${task.duration ?? ''}</v></c>` +
      iStr('I', ar, asc('I', 47), 'Action') +
      numC('J', ar, asc('J', 47), actStart) +
      numC('K', ar, asc('K', 48), actEnd) +
      `</row>`,
    )
    rn += 2
  }
  return rows.join('\n')
}

/** Apply InstallationContent values into a cloned LGD AP3 date sheet XML. */
function applyInstallationContentToSheet(
  xml: string,
  content: InstallationContent,
  ganttTasks: GanttTask[],
  reportDate: string,
): string {
  const ps = (v: string | null | undefined) => (v ?? '').trim()

  xml = patchCellStr(xml, 'V3',  ps(content.fse_name))
  xml = patchCellStr(xml, 'V4',  ps(content.report_date ?? reportDate))
  xml = patchCellStr(xml, 'C7',  ps(content.customer))
  xml = patchCellStr(xml, 'C8',  ps(content.model))
  xml = patchCellStr(xml, 'C9',  ps(content.sid))
  xml = patchCellStr(xml, 'C10', ps(content.eq_id))
  xml = patchCellStr(xml, 'L7',  ps(content.location))
  xml = patchCellStr(xml, 'L8',  ps(content.site_survey))
  xml = patchCellStr(xml, 'O8',  ps(content.noise_level))
  xml = patchCellStr(xml, 'L9',  ps(content.start_date))
  xml = patchCellStr(xml, 'L10', ps(content.est_complete_date))
  xml = patchCellStr(xml, 'T7',  ps(content.crm_case_id))
  xml = patchCellStr(xml, 'T8',  ps(content.main_user))
  xml = patchCellStr(xml, 'T9',  ps(content.tel))
  xml = patchCellStr(xml, 'T10', ps(content.email))
  xml = patchCellStr(xml, 'C11', ps(content.service_type))
  xml = patchCellStr(xml, 'L11', ps(content.start_time))
  xml = patchCellStr(xml, 'T11', ps(content.end_time))
  xml = patchCellStr(xml, 'B18', ps(content.critical_item_summary))
  xml = patchCellStr(xml, 'O28', ps(content.next_plan))
  xml = patchCellStr(xml, 'C33', ps(content.data_location))

  // Detail report rows (B28, B29, …)
  const details = content.detail_report ?? []
  for (let i = 0; i < 10; i++) {
    const text = i < details.length
      ? (details[i].title
          ? `${details[i].title}: ${details[i].content ?? ''}`
          : (details[i].content ?? ''))
      : ''
    xml = patchCellStr(xml, `B${28 + i}`, text)
  }

  // Progress (0-1 decimal — cells are formatted as %)
  let committedPct = (content.committed_pct ?? 0) / 100
  let actualPct    = (content.actual_pct    ?? 0) / 100
  let totalDays    = content.total_days    ?? 0
  let progressDays = content.progress_days ?? 0

  if (ganttTasks.length > 0) {
    const cp = computeInstallationProgress(
      ganttTasks, content.start_date, content.est_complete_date, reportDate,
    )
    committedPct = cp.committedProgress / 100
    actualPct    = cp.actualProgress    / 100
    totalDays    = cp.totalDays
    progressDays = cp.progressDays
  }

  xml = patchCellNum(xml, 'D15', committedPct)
  xml = patchCellNum(xml, 'P15', totalDays)
  xml = patchCellNum(xml, 'D16', actualPct)
  xml = patchCellNum(xml, 'P16', progressDays)

  return xml
}

/**
 * Build the final installation xlsx from LGD AP3 as the base workbook.
 *
 * Strategy:
 *  • Load LGD AP3 with JSZip (preserves all drawings/charts/styles/sharedStrings)
 *  • Patch sheet1.xml (Gantt Chart): clear rows 12+, inject new task rows,
 *    update D3:D7 with computed progress values
 *  • Clone sheet2.xml (first date sheet) as template for each document
 *  • Write sheet2, sheet3, … with patched cell values (inline strings)
 *  • Update workbook.xml <sheets> and workbook.xml.rels to reference only
 *    the Gantt Chart sheet + the new date sheets
 *  • [Content_Types].xml needs no changes — all sheetN.xml files are already
 *    registered in LGD AP3's content types
 */
async function buildInstallationXlsxFromLGDAP3(
  ganttTasks: GanttTask[],
  documents: Array<{ content: InstallationContent; reportDate: string; tabName: string }>,
): Promise<Buffer> {
  const lgdPath = path.join(process.cwd(), 'references', 'LGD AP3_installation report.xlsx')
  if (!fs.existsSync(lgdPath)) throw new Error('LGD AP3 base template not found: ' + lgdPath)

  const zip = await JSZip.loadAsync(fs.readFileSync(lgdPath))

  let wbXml  = await zip.file('xl/workbook.xml')?.async('text') ?? ''
  let wbRels = await zip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? ''

  // ── Parse sheet registry ──────────────────────────────────
  const sheets: Array<{ name: string; rId: string; file: string }> = []
  for (const m of wbXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const [, name, rId] = m
    const target = wbRels.match(new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`))?.[1] ?? ''
    const file = target.startsWith('xl/') ? target : `xl/${target}`
    sheets.push({ name, rId, file })
  }

  const ganttSheet  = sheets.find(s => s.name === 'Gantt Chart')
  const dateSheetTpl = sheets.find(s => s.name !== 'Gantt Chart')
  if (!ganttSheet)   throw new Error('LGD AP3 workbook missing "Gantt Chart" sheet')
  if (!dateSheetTpl) throw new Error('LGD AP3 workbook has no date sheet template')

  // ── 1. Update Gantt Chart sheet ───────────────────────────
  let ganttXml = await zip.file(ganttSheet.file)?.async('text') ?? ''

  // Extract style indices from existing plan/action template rows
  const planRowMatch   = ganttXml.match(/<row\s[^>]*r="12"[^>]*>[\s\S]*?<\/row>/)
  const actionRowMatch = ganttXml.match(/<row\s[^>]*r="13"[^>]*>[\s\S]*?<\/row>/)
  const planStyles     = planRowMatch   ? extractRowStyles(planRowMatch[0])   : {}
  const actionStyles   = actionRowMatch ? extractRowStyles(actionRowMatch[0]) : {}

  // Strip existing task rows (12+) from sheetData
  const sdClose  = '</sheetData>'
  const sdCloseI = ganttXml.indexOf(sdClose)
  const beforeSD = ganttXml.slice(0, sdCloseI)
  const afterSD  = ganttXml.slice(sdCloseI)
  const row12I   = beforeSD.search(/<row\s[^>]*r="12"/)
  let   headerPart = row12I >= 0 ? beforeSD.slice(0, row12I) : beforeSD

  // Patch D3:D7 with computed progress (overrides formula-cached values so
  // the radar chart shows real percentages without Excel recalculation)
  const progressData = getProgress(ganttTasks)
  for (let i = 0; i < GANTT_CATEGORIES.length; i++) {
    const cp  = progressData.categories[GANTT_CATEGORIES[i]]
    const pct = cp && cp.total > 0 ? Math.round(cp.pct * 10000) / 10000 : 0
    headerPart = patchCellNum(headerPart, `D${3 + i}`, pct)
  }

  ganttXml = headerPart + generateGanttTaskRowsXmlLGD(ganttTasks, planStyles, actionStyles) + afterSD
  zip.file(ganttSheet.file, ganttXml)

  // ── 2. Get date sheet template XML ────────────────────────
  const dateTplRaw   = await zip.file(dateSheetTpl.file)?.async('text') ?? ''
  const dateTplClean = cleanDateSheetXml(dateTplRaw)

  // Build minimal rels for cloned date sheets: only the radar-chart drawing
  const dateTplNum    = dateSheetTpl.file.match(/sheet(\d+)\.xml$/)?.[1] ?? '2'
  const existingRels  = await zip.file(`xl/worksheets/_rels/sheet${dateTplNum}.xml.rels`)?.async('text') ?? ''
  // Match only the chart-drawing relationship (not vmlDrawing which is for comments)
  const drawingRelRaw = existingRels.match(/<Relationship[^>]*Type="[^"]*\/drawing"[^>]*\/>/)
  const minimalRels   = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    drawingRelRaw
      ? drawingRelRaw[0]
      : '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>',
    '</Relationships>',
  ].join('\n')

  // ── 3. Write date sheets ──────────────────────────────────
  const ganttFileNum  = parseInt(ganttSheet.file.match(/sheet(\d+)\.xml$/)?.[1] ?? '1')
  const sheetEntries  = [`<sheet name="Gantt Chart" sheetId="1" r:id="rWsGantt"/>`]
  const relEntries    = [
    `<Relationship Id="rWsGantt" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
    `Target="worksheets/sheet${ganttFileNum}.xml"/>`,
  ]

  for (let i = 0; i < documents.length; i++) {
    const { content, reportDate, tabName } = documents[i]
    const sheetNum = ganttFileNum + 1 + i
    const rId      = `rWsDate${i + 1}`

    const patched = applyInstallationContentToSheet(dateTplClean, content, ganttTasks, reportDate)
    zip.file(`xl/worksheets/sheet${sheetNum}.xml`, patched)
    zip.file(`xl/worksheets/_rels/sheet${sheetNum}.xml.rels`, minimalRels)

    sheetEntries.push(`<sheet name="${escapeXml(tabName)}" sheetId="${i + 2}" r:id="${rId}"/>`)
    relEntries.push(
      `<Relationship Id="${rId}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
      `Target="worksheets/sheet${sheetNum}.xml"/>`,
    )
  }

  // ── 4. Update workbook.xml ────────────────────────────────
  wbXml = wbXml
    .replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${sheetEntries.join('')}</sheets>`)
    .replace(/<definedNames>[\s\S]*?<\/definedNames>/g, '')
    .replace(/<externalReferences>[\s\S]*?<\/externalReferences>/g, '')
  zip.file('xl/workbook.xml', wbXml)

  // ── 5. Update workbook.xml.rels ───────────────────────────
  wbRels = wbRels
    .replace(/<Relationship\b[^>]*\bType="[^"]*\/worksheet"[^>]*\/>/g, '')
    .replace(/<Relationship\b[^>]*\bType="[^"]*\/externalLink"[^>]*\/>/g, '')
    .replace('</Relationships>', relEntries.join('') + '</Relationships>')
  zip.file('xl/_rels/workbook.xml.rels', wbRels)

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) as Promise<Buffer>
}

// ── Multi-sheet combiner (JSZip structural merge — field service) ──
async function combineSheets(
  sheetBufs: Buffer[],
  tabNames: string[],
): Promise<Buffer> {
  const baseZip    = await JSZip.loadAsync(sheetBufs[0])
  const baseWbXml  = await baseZip.file('xl/workbook.xml')?.async('text') ?? ''
  const baseWbRels = await baseZip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? ''
  const baseCT     = await baseZip.file('[Content_Types].xml')?.async('text') ?? ''

  const firstRId     = baseWbXml.match(/<sheet\b[^>]*\br:id="(rId\d+)"/)?.[1]
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
    const tabName = tabNames[i]

    if (i === 0) {
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
    } else {
      const sheetZip = await JSZip.loadAsync(sheetBufs[i])
      const rawXml   = await sheetZip.file('xl/worksheets/sheet1.xml')?.async('text')
      if (rawXml) {
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

  baseZip.file('xl/workbook.xml', baseWbXml.replace(
    /<sheets>[\s\S]*?<\/sheets>/,
    `<sheets>${sheetEntries.join('')}</sheets>`,
  ))

  baseZip.file('xl/_rels/workbook.xml.rels', baseWbRels
    .replace(/<Relationship\b[^>]*\bType="[^"]*\/worksheet"[^>]*\/>/g, '')
    .replace('</Relationships>', `${wsRelEntries.join('')}</Relationships>`),
  )

  if (ctAddEntries.length > 0) {
    baseZip.file('[Content_Types].xml', baseCT.replace('</Types>', `${ctAddEntries.join('')}</Types>`))
  }

  return baseZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) as Promise<Buffer>
}

// GET /api/cards/[id]/export/xlsx
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id: cardId } = await params

  const { data: card } = await supabaseAdmin.from('cards').select('*').eq('id', cardId).single()
  if (!card) return errRes('Card not found', 404)
  const cardRow = card as CardRow

  // ── Installation export ────────────────────────────────────
  if (cardRow.type === 'installation') {
    const { data: ganttRow } = await supabaseAdmin
      .from('gantt').select('*').eq('card_id', cardId).single()
    const ganttTasks: GanttTask[] = (ganttRow?.payload?.tasks ?? []) as GanttTask[]

    const { data: docs } = await supabaseAdmin
      .from('documents').select('*')
      .eq('card_id', cardId).eq('is_external', false)
      .order('report_date', { ascending: false })

    if (!docs || docs.length === 0) return errRes('No internal reports found for this card', 404)

    const documents = (docs as DocumentRow[]).map(docRow => ({
      content:    normalizeInstallationContent(docRow.content) as InstallationContent,
      reportDate: docRow.report_date,
      tabName:    docRow.report_date.replace(/-/g, '.'),
    }))

    const buf = await buildInstallationXlsxFromLGDAP3(ganttTasks, documents)
    const seg = (s: string) => (s ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
    const filename = `${seg(cardRow.customer)}_${seg(cardRow.eq_id)}_installation-reports.xlsx`

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // ── Field Service export (unchanged) ──────────────────────
  if (cardRow.type !== 'field_service') return errRes('Excel export is only supported for field_service and installation cards')

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
