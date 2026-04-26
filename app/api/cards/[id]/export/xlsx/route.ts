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

async function generateInstallationSheetBuffer(
  templatePath: string,
  content: InstallationContent,
  tabName: string,
  ganttTasks: GanttTask[],
  reportDate: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(templatePath)
  const ws = wb.worksheets[0]
  ws.name = tabName

  const set = (addr: string, value: string | number) => {
    ws.getCell(addr).value = value
  }

  set(INST_MAP.fse_name,          content.fse_name          ?? '')
  set(INST_MAP.report_date,       content.report_date       ?? '')
  set(INST_MAP.customer,          content.customer          ?? '')
  set(INST_MAP.model,             content.model             ?? '')
  set(INST_MAP.sid,               content.sid               ?? '')
  set(INST_MAP.eq_id,             content.eq_id             ?? '')
  set(INST_MAP.location,          content.location          ?? '')
  set(INST_MAP.site_survey,       content.site_survey       ?? '')
  set(INST_MAP.noise_level,       content.noise_level       ?? '')
  set(INST_MAP.start_date,        content.start_date        ?? '')
  set(INST_MAP.est_complete_date, content.est_complete_date ?? '')
  set(INST_MAP.crm_case_id,       content.crm_case_id       ?? '')
  set(INST_MAP.main_user,         content.main_user         ?? '')
  set(INST_MAP.tel,               content.tel               ?? '')
  set(INST_MAP.email,             content.email             ?? '')
  set(INST_MAP.critical_item_summary, content.critical_item_summary ?? '')
  set(INST_MAP.next_plan,         content.next_plan         ?? '')
  set(INST_MAP.data_location,     content.data_location     ?? '')
  set(INST_MAP.service_type,      content.service_type      ?? '')
  set(INST_MAP.start_time,        content.start_time        ?? '')
  set(INST_MAP.end_time,          content.end_time          ?? '')

  // Always recompute progress from Gantt — mirrors Excel formulas
  let committedPct = (content.committed_pct ?? 0) / 100
  let actualPct    = (content.actual_pct    ?? 0) / 100
  let totalDays    = content.total_days    ?? 0
  let progressDays = content.progress_days ?? 0

  if (ganttTasks.length > 0) {
    const cp = computeInstallationProgress(
      ganttTasks,
      content.start_date,
      content.est_complete_date,
      reportDate,
    )
    committedPct = cp.committedProgress / 100
    actualPct    = cp.actualProgress    / 100
    totalDays    = cp.totalDays
    progressDays = cp.progressDays
  }

  // Pct as 0-1 decimal (template cells are formatted as %)
  set(INST_MAP.committed_pct, committedPct)
  set(INST_MAP.actual_pct,    actualPct)
  set(INST_MAP.total_days,    totalDays)
  set(INST_MAP.progress_days, progressDays)

  // Detail report rows: B28, B29, ...
  const details = content.detail_report ?? []
  details.forEach((item, idx) => {
    const addr = `B${28 + idx}`
    const text = item.title ? `${item.title}\n${item.content}` : item.content
    ws.getCell(addr).value = text ?? ''
  })

  // Work Completion — rows 34–38
  const wc = content.work_completion
  if (wc) {
    const NAVY    = '1F3864'
    const BLUE_BG = 'D9E2F3'
    const navyFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${NAVY}` } }
    const blueFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${BLUE_BG}` } }
    const thin     = { style: 'thin' as const }
    const borders  = { top: thin, bottom: thin, left: thin, right: thin }
    const whiteFont = { bold: true, color: { argb: 'FFFFFFFF' } }
    const navyFont  = { bold: true, color: { argb: `FF${NAVY}` } }

    // Row 34: section header
    ws.mergeCells('B34:X34')
    const hdr = ws.getCell('B34')
    hdr.value = 'Work Completion — 작업 종료 후 근무 형태'
    hdr.fill  = navyFill
    hdr.font  = whiteFont
    hdr.alignment = { horizontal: 'center', vertical: 'middle' }
    hdr.border = borders
    ws.getRow(34).height = 18

    // Helper: write label + value row
    const wcRow = (rowNum: number, label: string, value: string) => {
      ws.mergeCells(`B${rowNum}:G${rowNum}`)
      const lbl = ws.getCell(`B${rowNum}`)
      lbl.value = label
      lbl.fill  = blueFill
      lbl.font  = navyFont
      lbl.alignment = { horizontal: 'left', vertical: 'middle' }
      lbl.border = borders

      ws.mergeCells(`H${rowNum}:X${rowNum}`)
      const val = ws.getCell(`H${rowNum}`)
      val.value = value
      val.border = borders
      val.alignment = { wrapText: true, vertical: 'top' }
      ws.getRow(rowNum).height = 18
    }

    // Check mark indicators for type row
    const TYPES = ['사무실(구미 숙소) 복귀', '재택근무 전환', '추가 외근 수행', '업무 종료']
    const typeStr = TYPES.map(t => (t === wc.type ? `☑ ${t}` : `☐ ${t}`)).join('   ')

    wcRow(35, '근무 형태', typeStr)
    wcRow(36, '전환 사유', wc.reason ?? '')
    wcRow(37, '수행 업무', wc.detail ?? '')
    wcRow(38, '수행 시간', wc.time_log ?? '')
  }

  return removeExternalDefinedNames(Buffer.from(await wb.xlsx.writeBuffer()))
}

// ── Gantt Chart sheet builder ──────────────────────────────────
// Cell layout matches template ('Gantt Chart' sheet in LGD AP3 reference):
//   Row 2: B2="Action", C2="Total Case#", D2="Progress %"   (headers)
//   Rows 3-7: A=completed, B=category name, C=total, D=progress (0-1 decimal)
//   Row 10: task table headers (A=No, B=Action, C=Category, D=Item, E=..., F=Remark, G=Status, H=Duration, I=Plan/Action, J=Start, K=Complete)
//   Rows 12+: two rows per task (Plan row + Action row)
//
// Radar charts in date sheets reference 'Gantt Chart'!$B$3:$B$7 (names) and $D$3:$D$7 (pct).
// Writing correct values to those cells makes the chart references valid.
async function generateGanttSheetBuffer(tasks: GanttTask[], tabName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(tabName)

  const NAVY    = '1F3864'
  const BLUE    = '4472C4'
  const WHITE   = 'FFFFFF'
  const GREEN_B = 'D1FAE5'
  const BLUE_B  = 'DBEAFE'
  const GRAY_L  = 'F9FAFB'
  const GRAY_H  = 'E5E7EB'

  const whiteFont  = { bold: true, color: { argb: `FF${WHITE}` } }
  const navyFill   = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${NAVY}` } }
  const blueFill   = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${BLUE}` } }
  const grayHFill  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${GRAY_H}` } }
  const thinBorder = { style: 'thin' as const }
  const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

  // ── Row 1: Title bar ─────────────────────────────────────────
  ws.mergeCells('A1:K1')
  const titleCell = ws.getCell('A1')
  titleCell.value = 'Gantt Chart'
  titleCell.font  = { bold: true, size: 14, color: { argb: `FF${WHITE}` } }
  titleCell.fill  = navyFill
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 22

  // ── Row 2: Progress summary headers ──────────────────────────
  // NOTE: leave A2 blank (template has completed count formula there)
  ws.getCell('B2').value = 'Action'
  ws.getCell('C2').value = 'Total Case#'
  ws.getCell('D2').value = 'Progress %'
  ;['B2','C2','D2'].forEach(addr => {
    const c = ws.getCell(addr)
    c.font   = whiteFont
    c.fill   = blueFill
    c.border = allBorders
    c.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  ws.getRow(2).height = 15

  // ── Rows 3-7: Progress summary data ──────────────────────────
  // Chart references: 'Gantt Chart'!$B$3:$B$7 (names), $D$3:$D$7 (pct 0-1)
  const progress = getProgress(tasks)
  GANTT_CATEGORIES.forEach((cat, idx) => {
    const rowNum = 3 + idx
    const cp = progress.categories[cat]
    const completed = cp?.completed ?? 0
    const total     = cp?.total ?? 0
    const pctVal    = total > 0 ? cp!.pct : 0   // 0-1 decimal for chart reference

    const rA = ws.getCell(`A${rowNum}`)
    rA.value  = completed
    rA.border = allBorders
    rA.alignment = { horizontal: 'center' }

    const rB = ws.getCell(`B${rowNum}`)
    rB.value  = cat
    rB.border = allBorders
    rB.fill   = idx % 2 === 0 ? grayHFill : { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GRAY_L}` } }

    const rC = ws.getCell(`C${rowNum}`)
    rC.value  = total
    rC.border = allBorders
    rC.alignment = { horizontal: 'center' }

    const rD = ws.getCell(`D${rowNum}`)
    rD.value      = pctVal               // 0-1 decimal — chart reads this
    rD.numFmt     = '0%'
    rD.border     = allBorders
    rD.alignment  = { horizontal: 'center' }
  })

  // ── Row 8: TOTAL summary row ──────────────────────────────────
  ws.getCell('A8').value = progress.completed
  ws.getCell('B8').value = 'TOTAL'
  ws.getCell('C8').value = progress.total
  ws.getCell('D8').value = progress.total > 0 ? progress.totalPct : 0
  ws.getCell('D8').numFmt = '0%'
  ;['A8','B8','C8','D8'].forEach(addr => {
    ws.getCell(addr).border = allBorders
    ws.getCell(addr).font   = { bold: true }
    ws.getCell(addr).fill   = grayHFill
  })
  ws.getRow(8).height = 15

  // ── Row 9: empty spacer ──────────────────────────────────────
  ws.getRow(9).height = 6

  // ── Row 10: Task table headers ────────────────────────────────
  const taskHeaders = ['No', 'Action', 'Category', 'Item', 'Remark', 'Status', 'Duration', 'Plan/Action', 'Start Date', 'Complete Date']
  const hRow = ws.getRow(10)
  taskHeaders.forEach((h, ci) => {
    const cell = hRow.getCell(ci + 1)  // A=1, B=2, ...
    cell.value  = h
    cell.font   = whiteFont
    cell.fill   = blueFill
    cell.border = allBorders
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  hRow.height = 20

  // ── Rows 12+: Two rows per task (Plan + Action) ───────────────
  let rowCursor = 12

  tasks.forEach(task => {
    const statusBg = task.status === 'Completed' ? { argb: `FF${GREEN_B}` }
                   : task.status === 'Started'   ? { argb: `FF${BLUE_B}`  }
                   : null
    const taskFill = statusBg
      ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: statusBg }
      : null

    // Plan row
    const planRow = ws.getRow(rowCursor)
    const planVals = [
      task.no,
      task.action      ?? '',
      task.category    ?? '',
      task.item        ?? '',
      task.remark      ?? '',
      task.status      ?? '',
      task.plan_duration != null ? task.plan_duration : '',
      'Plan',
      task.plan_start_date    ?? '',
      task.plan_complete_date ?? '',
    ]
    planVals.forEach((v, ci) => {
      const cell = planRow.getCell(ci + 1)
      cell.value  = v
      cell.border = allBorders
      if (taskFill) cell.fill = taskFill
    })
    planRow.height = 16

    // Action row
    const actRow = ws.getRow(rowCursor + 1)
    const actVals = [
      '',
      '',
      '',
      '',
      '',
      '',
      task.duration != null ? task.duration : '',
      'Action',
      task.start_date    ?? '',
      task.complete_date ?? '',
    ]
    actVals.forEach((v, ci) => {
      const cell = actRow.getCell(ci + 1)
      cell.value  = v
      cell.border = allBorders
      if (taskFill) cell.fill = taskFill
    })
    actRow.height = 16

    rowCursor += 2
  })

  // ── Column widths (matches template) ─────────────────────────
  ws.getColumn(1).width  = 5   // No
  ws.getColumn(2).width  = 21  // Action
  ws.getColumn(3).width  = 16  // Category
  ws.getColumn(4).width  = 26  // Item
  ws.getColumn(5).width  = 22  // Remark
  ws.getColumn(6).width  = 13  // Status
  ws.getColumn(7).width  = 10  // Duration
  ws.getColumn(8).width  = 10  // Plan/Action
  ws.getColumn(9).width  = 13  // Start Date
  ws.getColumn(10).width = 13  // Complete Date

  return removeExternalDefinedNames(Buffer.from(await wb.xlsx.writeBuffer()))
}

// ── Installation multi-sheet combiner (preserves drawings) ────
// Strategy:
//   Sheet 1 = ganttBuf (ExcelJS-built, no drawing files)
//   Sheets 2+ = dateBufs (ExcelJS round-trip of Excel template; preserves drawing)
//   Drawing/chart files are copied once from the first date sheet so that
//   the radar chart referencing 'Gantt Chart'!$B$3:$D$7 remains valid.
async function combineInstallationSheets(
  ganttBuf:  Buffer,
  dateBufs:  Buffer[],
  tabNames:  string[],   // tabNames[0]='Gantt Chart', tabNames[1..]= date tabs
): Promise<Buffer> {
  const baseZip    = await JSZip.loadAsync(ganttBuf)
  const baseWbXml  = await baseZip.file('xl/workbook.xml')?.async('text') ?? ''
  const baseWbRels = await baseZip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? ''
  const baseCT     = await baseZip.file('[Content_Types].xml')?.async('text') ?? ''

  const sheetEntries: string[] = []
  const wsRelEntries: string[] = []
  const ctAddEntries: string[] = []

  // Sheet 1 is already in baseZip as sheet1.xml (ExcelJS always writes sheet1.xml)
  sheetEntries.push(`<sheet name="${escapeXml(tabNames[0])}" sheetId="1" r:id="wsId1"/>`)
  wsRelEntries.push(
    `<Relationship Id="wsId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`,
  )

  let drawingsCopied = false

  for (let i = 0; i < dateBufs.length; i++) {
    const n        = i + 2
    const sheetZip = await JSZip.loadAsync(dateBufs[i])

    // Copy sheet XML as-is (do NOT strip drawing tags)
    const rawXml = await sheetZip.file('xl/worksheets/sheet1.xml')?.async('text')
    if (rawXml) {
      baseZip.file(`xl/worksheets/sheet${n}.xml`, rawXml)
    }

    // Copy sheet rels (carries the <drawing> relationship pointer)
    const relsData = await sheetZip.file('xl/worksheets/_rels/sheet1.xml.rels')?.async('uint8array')
    if (relsData) {
      baseZip.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, relsData)
    }

    // Copy drawing + chart files once (from the first date sheet only)
    if (!drawingsCopied) {
      for (const relPath of Object.keys(sheetZip.files)) {
        const entry = sheetZip.files[relPath]
        if (entry.dir) continue
        if (
          relPath.startsWith('xl/drawings/') ||
          relPath.startsWith('xl/charts/')
        ) {
          const data = await entry.async('uint8array')
          baseZip.file(relPath, data)
        }
      }

      // Harvest CT <Override> entries for drawings/charts from this buffer
      const firstCT = await sheetZip.file('[Content_Types].xml')?.async('text') ?? ''
      for (const m of firstCT.matchAll(/<Override\s[^>]*PartName="([^"]+)"[^>]*\/>/g)) {
        const partName = m[1]
        if (
          (partName.startsWith('/xl/drawings/') || partName.startsWith('/xl/charts/')) &&
          !baseCT.includes(partName)
        ) {
          ctAddEntries.push(m[0])
        }
      }

      drawingsCopied = true
    }

    ctAddEntries.push(
      `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    sheetEntries.push(`<sheet name="${escapeXml(tabNames[i + 1])}" sheetId="${n}" r:id="wsId${n}"/>`)
    wsRelEntries.push(
      `<Relationship Id="wsId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`,
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

// ── Multi-sheet combiner (JSZip structural merge) ─────────────
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
    // Fetch gantt data
    const { data: ganttRow } = await supabaseAdmin
      .from('gantt').select('*').eq('card_id', cardId).single()
    const ganttTasks: GanttTask[] = (ganttRow?.payload?.tasks ?? []) as GanttTask[]

    // Fetch all documents newest first
    const { data: docs } = await supabaseAdmin
      .from('documents').select('*')
      .eq('card_id', cardId).eq('is_external', false)
      .order('report_date', { ascending: false })

    if (!docs || docs.length === 0) return errRes('No internal reports found for this card', 404)

    const instTemplatePath = path.join(process.cwd(), 'references', 'Park Systems Installation Passdown Report.xlsx')
    if (!fs.existsSync(instTemplatePath)) return errRes('Installation Excel template not found on server', 500)

    // Sheet 1: Gantt Chart (fresh, ExcelJS — no drawing files)
    const ganttBuf   = await generateGanttSheetBuffer(ganttTasks, 'Gantt Chart')
    const dateBufs:  Buffer[] = []
    const dateTabNames: string[] = []

    // Sheets 2+: one per document, newest first (Excel template round-trip — preserves drawings)
    for (const docRow of docs as DocumentRow[]) {
      const content = normalizeInstallationContent(docRow.content) as InstallationContent
      const tabName = docRow.report_date.replace(/-/g, '.')
      dateBufs.push(await generateInstallationSheetBuffer(
        instTemplatePath, content, tabName, ganttTasks, docRow.report_date,
      ))
      dateTabNames.push(tabName)
    }

    const buf = await combineInstallationSheets(ganttBuf, dateBufs, ['Gantt Chart', ...dateTabNames])
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
