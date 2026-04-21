/**
 * Shared Excel parser for Park Systems Field Service reports.
 * Used by both the CLI import script and the web import API route.
 *
 * Template A: sheet name = YYYY.MM.DD  (~30 rows, base col = B)
 * Template B: sheet name = YYMMDD      (~58 rows, base col = C)
 */

import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import * as crypto from 'crypto'
import type { FieldServiceContent, NoteImage } from '@/types/report'
import type { ImportSourceMeta } from '@/types/db'

// ── Exported types ────────────────────────────────────────────────────────────

export interface ParsedSheet {
  sheet_name:       string
  report_date:      string   // YYYY-MM-DD
  content:          FieldServiceContent
  source_meta:      ImportSourceMeta
  images_extracted: number
}

export interface WorkbookParseResult {
  parsed:  ParsedSheet[]
  skipped: string[]   // non-date sheet names that were ignored
}

// ── Template detection ────────────────────────────────────────────────────────

export type TemplateType = 'A' | 'B'

export function detectTemplate(sheetName: string): TemplateType | null {
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(sheetName)) return 'A'
  if (/^\d{6}$/.test(sheetName)) return 'B'
  return null
}

export function parseDateFromSheet(name: string, tpl: TemplateType): string {
  if (tpl === 'A') return name.replace(/\./g, '-')
  return `20${name.slice(0, 2)}-${name.slice(2, 4)}-${name.slice(4, 6)}`
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

function cv(ws: XLSX.WorkSheet, col: number, row: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })]
  if (!cell || cell.v == null) return ''
  return String(cell.v).trim()
}

function toDateISO(raw: string): string {
  if (!raw) return ''
  const n = Number(raw)
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = XLSX.SSF.parse_date_code(n)
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    }
  }
  return raw.replace(/\./g, '-').replace(/\//g, '-').trim()
}

function toTimeHHMM(raw: string): string {
  if (!raw) return ''
  const n = Number(raw)
  if (!isNaN(n) && n >= 0 && n < 1) {
    const totalMin = Math.round(n * 24 * 60)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return raw
}

// ── Cell maps (verified against real xlsx files) ──────────────────────────────
// All positions are 0-indexed [col, row].
// Template A (YYYY.MM.DD, ~30 rows): base col B = c=1
// Template B (YYMMDD, ~58 rows):     base col C = c=2 (all cols +1 vs A)

interface CellMap {
  report_date:   [number, number]
  fse_name:      [number, number]
  tool_status:   [number, number]
  customer:      [number, number]
  location:      [number, number]
  crm_case_id:   [number, number]
  model:         [number, number]
  site_survey:   [number, number]
  noise_level:   [number, number]
  main_user:     [number, number]
  sid:           [number, number]
  start_date:    [number, number]
  tel:           [number, number]
  eq_id:         [number, number]
  start_time:    [number, number]
  email:         [number, number]
  service_type:  [number, number]
  end_time:      [number, number]
  problem:       [number, number]
  target:        [number, number]
  daily_note:    [number, number]
  data_location: [number, number]
}

const MAP_A: CellMap = {
  report_date:   [21, 3],  // V4
  fse_name:      [21, 4],  // V5
  tool_status:   [8,  4],  // I5
  customer:      [2,  8],  // C9
  location:      [11, 8],  // L9
  crm_case_id:   [19, 8],  // T9
  model:         [2,  9],  // C10
  site_survey:   [11, 9],  // L10
  noise_level:   [14, 9],  // O10
  main_user:     [19, 9],  // T10
  sid:           [2,  10], // C11
  start_date:    [11, 10], // L11
  tel:           [19, 10], // T11
  eq_id:         [2,  11], // C12
  start_time:    [11, 11], // L12
  email:         [19, 11], // T12
  service_type:  [2,  12], // C13
  end_time:      [11, 12], // L13
  problem:       [1,  15], // B16 (merged B16:M21)
  target:        [13, 15], // N16 (merged N16:X21)
  daily_note:    [1,  22], // B23
  data_location: [2,  29], // C30 (label B30, value C30)
}

const MAP_B: CellMap = {
  report_date:   [22, 3],  // W4
  fse_name:      [22, 4],  // W5
  tool_status:   [9,  4],  // J5
  customer:      [3,  8],  // D9
  location:      [12, 8],  // M9
  crm_case_id:   [20, 8],  // U9
  model:         [3,  9],  // D10
  site_survey:   [12, 9],  // M10
  noise_level:   [15, 9],  // P10
  main_user:     [20, 9],  // U10
  sid:           [3,  10], // D11
  start_date:    [12, 10], // M11
  tel:           [20, 10], // U11
  eq_id:         [3,  11], // D12
  start_time:    [12, 11], // M12
  email:         [20, 11], // U12
  service_type:  [3,  12], // D13
  end_time:      [12, 12], // M13
  problem:       [2,  15], // C16
  target:        [14, 15], // O16
  daily_note:    [2,  21], // C22
  data_location: [3,  57], // D58
}

// ── Image extraction ──────────────────────────────────────────────────────────
// Path: workbook.xml + workbook.xml.rels → sheetN.xml → drawingM.xml → media

async function extractSheetImages(
  fileBuffer: Buffer,
  sheetName: string,
): Promise<NoteImage[]> {
  const zip = await JSZip.loadAsync(fileBuffer)

  // rId → sheet file number
  const wbRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? ''
  const ridToNum: Record<string, string> = {}
  for (const m of wbRelsXml.matchAll(/Id="(rId\d+)"[^>]*Target="worksheets\/sheet(\d+)\.xml"/g)) {
    ridToNum[m[1]] = m[2]
  }

  // sheet name → file number via workbook.xml
  const wbXml = await zip.file('xl/workbook.xml')?.async('text') ?? ''
  let fileNum: string | null = null
  for (const m of wbXml.matchAll(/name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) {
    if (m[1] === sheetName) { fileNum = ridToNum[m[2]] ?? null; break }
  }
  if (!fileNum) return []

  const sheetRels = zip.file(`xl/worksheets/_rels/sheet${fileNum}.xml.rels`)
  if (!sheetRels) return []
  const sheetRelsXml = await sheetRels.async('text')
  const drawingMatch = sheetRelsXml.match(/drawings\/drawing(\d+)\.xml/)
  if (!drawingMatch) return []

  const drawingRels = zip.file(`xl/drawings/_rels/drawing${drawingMatch[1]}.xml.rels`)
  if (!drawingRels) return []
  const drawingRelsXml = await drawingRels.async('text')

  const images: NoteImage[] = []
  for (const m of drawingRelsXml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)) {
    const imgFile = zip.file(`xl/media/${m[1]}`)
    if (!imgFile) continue
    const ext = m[1].split('.').pop()?.toLowerCase() ?? 'png'
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'gif' ? 'image/gif' : 'image/png'
    const b64 = await imgFile.async('base64')
    images.push({ key: crypto.randomUUID(), data_url: `data:${mime};base64,${b64}`, caption: '' })
  }
  return images
}

// ── Single sheet parser ───────────────────────────────────────────────────────

async function parseSheet(
  wb: XLSX.WorkBook,
  fileBuffer: Buffer,
  fileName: string,
  sheetName: string,
): Promise<ParsedSheet | null> {
  const tpl = detectTemplate(sheetName)
  if (!tpl) return null
  const ws = wb.Sheets[sheetName]
  if (!ws) return null

  const map = tpl === 'B' ? MAP_B : MAP_A
  const r = (key: keyof CellMap) => cv(ws, map[key][0], map[key][1])

  const reportDate = parseDateFromSheet(sheetName, tpl)
  const dailyNote  = r('daily_note')

  let noteImages: NoteImage[] = []
  try { noteImages = await extractSheetImages(fileBuffer, sheetName) } catch { /* best-effort */ }

  const content: FieldServiceContent = {
    fse_name:          r('fse_name'),
    report_date:       reportDate,
    customer:          r('customer'),
    location:          r('location'),
    crm_case_id:       r('crm_case_id'),
    model:             r('model'),
    site_survey:       r('site_survey'),
    noise_level:       r('noise_level'),
    main_user:         r('main_user'),
    sid:               r('sid'),
    tel:               r('tel'),
    eq_id:             r('eq_id'),
    email:             r('email'),
    service_type:      r('service_type'),
    tool_status:       r('tool_status'),
    start_date:        toDateISO(r('start_date')),
    start_time:        toTimeHHMM(r('start_time')),
    end_date:          '',
    end_time:          toTimeHHMM(r('end_time')),
    end_time_note:     '고객사 출문 시간',
    problem_statement: r('problem'),
    target_statement:  r('target'),
    daily_note:        dailyNote,
    progress_pct:      0,
    critical_items:    [{ title: '', note: dailyNote, progress_pct: 0, note_images: noteImages }],
    data_location:     r('data_location'),
    work_completion:   { type: '', reason: '', detail: '', time_log: '' },
    images:            [],
  }

  const hashInput  = `${fileName}::${sheetName}`
  const importHash = crypto.createHash('sha256').update(hashInput).digest('hex')

  return {
    sheet_name:       sheetName,
    report_date:      reportDate,
    content,
    source_meta:      { import_hash: importHash, file_name: fileName, sheet_name: sheetName, imported_at: new Date().toISOString() },
    images_extracted: noteImages.length,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ParseWorkbookOptions {
  onlySheet?: string   // if set, parse only this sheet
  maxSheets?: number   // if set, cap at N sheets (default: all)
}

export async function parseWorkbook(
  fileBuffer: Buffer,
  fileName: string,
  opts: ParseWorkbookOptions = {},
): Promise<WorkbookParseResult> {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' })

  let sheetNames = wb.SheetNames
  if (opts.onlySheet) {
    sheetNames = sheetNames.filter(n => n === opts.onlySheet)
  }

  const skipped: string[] = []
  const parsed:  ParsedSheet[] = []

  let count = 0
  for (const name of sheetNames) {
    if (detectTemplate(name) === null) { skipped.push(name); continue }
    if (opts.maxSheets != null && count >= opts.maxSheets) break
    const result = await parseSheet(wb, fileBuffer, fileName, name)
    if (result) { parsed.push(result); count++ }
    else skipped.push(name)
  }

  return { parsed, skipped }
}
