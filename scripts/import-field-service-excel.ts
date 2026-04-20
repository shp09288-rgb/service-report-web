#!/usr/bin/env tsx
/**
 * Import Park Systems Field Service Excel reports into the web DB.
 *
 * Usage:
 *   npm run import-excel -- --file <path.xlsx> [--dry-run]
 *   npm run import-excel -- --file <path.xlsx> --import [--sheet <name>] [--all]
 *
 * Flags:
 *   --file <path>    Path to .xlsx file (required)
 *   --dry-run        Print JSON preview without writing to DB (default)
 *   --import         Write to Supabase (requires SUPABASE_SERVICE_ROLE_KEY)
 *   --sheet <name>   Process only this sheet
 *   --all            Process all date sheets (default: first 3)
 *
 * Template detection:
 *   Template A: sheet name = YYYY.MM.DD  (e.g. 2025.01.15)  ~30 rows, base col = B
 *   Template B: sheet name = YYMMDD      (e.g. 250115)       ~58 rows, base col = C
 */

import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

// ── Types ─────────────────────────────────────────────────────────────────────

interface NoteImage {
  key: string
  data_url: string
  caption: string
  width?: number
  height?: number
}

interface FieldServiceContent {
  is_card_seeded?: boolean
  fse_name: string
  report_date: string
  customer: string
  location: string
  crm_case_id: string
  model: string
  site_survey: string
  noise_level: string
  main_user: string
  sid: string
  tel: string
  eq_id: string
  email: string
  service_type: string
  tool_status: string
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  end_time_note: string
  problem_statement: string
  target_statement: string
  daily_note: string
  progress_pct: number
  critical_items: {
    title: string
    note: string
    progress_pct: number
    note_images: NoteImage[]
  }[]
  data_location: string
  work_completion: { type: string; reason: string; detail: string; time_log: string }
  images: []
}

interface ImportSourceMeta {
  import_hash: string
  file_name: string
  sheet_name: string
  imported_at: string
}

interface ParsedSheet {
  sheet_name: string
  report_date: string
  content: FieldServiceContent
  source_meta: ImportSourceMeta
  images_extracted: number
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

function cv(ws: XLSX.WorkSheet, col: number, row: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })]
  if (!cell || cell.v == null) return ''
  return String(cell.v).trim()
}

/** Convert an Excel cell value to ISO date string (YYYY-MM-DD).
 *  Handles: numeric serial, string "YYYYMMDD" or "YYYY.MM.DD", already-ISO. */
function toDateISO(raw: string): string {
  if (!raw) return ''
  // Numeric serial → parse via SheetJS
  const n = Number(raw)
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = XLSX.SSF.parse_date_code(n)
    if (d) {
      const mm = String(d.m).padStart(2, '0')
      const dd = String(d.d).padStart(2, '0')
      return `${d.y}-${mm}-${dd}`
    }
  }
  // String formats
  return raw.replace(/\./g, '-').replace(/\//g, '-').trim()
}

/** Convert an Excel time fraction (0-1) or already-formatted string to HH:MM. */
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

// ── Template detection ────────────────────────────────────────────────────────

type TemplateType = 'A' | 'B'

function detectTemplate(sheetName: string): TemplateType | null {
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(sheetName)) return 'A'
  if (/^\d{6}$/.test(sheetName)) return 'B'
  return null
}

function parseDateFromSheet(name: string, tpl: TemplateType): string {
  if (tpl === 'A') return name.replace(/\./g, '-')                   // YYYY.MM.DD
  return `20${name.slice(0, 2)}-${name.slice(2, 4)}-${name.slice(4, 6)}`  // YYMMDD
}

// ── Field maps ────────────────────────────────────────────────────────────────
//
// Verified against actual xlsx files. All positions are 0-indexed [col, row].
// Excel col letters for reference: A=0 B=1 C=2 D=3 ... I=8 J=9 K=10 L=11
//                                  M=12 N=13 O=14 P=15 ... T=19 U=20 V=21 W=22
//
// Template A (YYYY.MM.DD, ~30 rows, base col = B=1):
//   Row  4: V4=report_date(serial), I5=tool_status, V5=fse_name
//   Rows 9-13: System + Service + Contact info
//   Rows 16-21: B16=problem (merged), N16=target (merged)
//   Row 23: B23=daily_note, Row 30: C30=data_location
//
// Template B (YYMMDD, ~58 rows, base col = C=2):
//   All columns shifted +1 vs Template A
//   Row 22: C22=daily_note, Row 58: D58=data_location

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
  start_date:    [11, 10], // L11  (Excel serial)
  tel:           [19, 10], // T11
  eq_id:         [2,  11], // C12
  start_time:    [11, 11], // L12  (Excel time fraction)
  email:         [19, 11], // T12
  service_type:  [2,  12], // C13
  end_time:      [11, 12], // L13  (Excel time fraction)
  problem:       [1,  15], // B16  (merged B16:M21 — value at top-left)
  target:        [13, 15], // N16  (merged N16:X21 — value at top-left)
  daily_note:    [1,  22], // B23  (merged B23:X23)
  data_location: [2,  29], // C30  (label at B30, value merged C30:X30)
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
  data_location: [3,  57], // D58  (label at C58)
}

// ── Image extraction ──────────────────────────────────────────────────────────
// Images in xlsx go through a drawing layer:
//   workbook.xml + workbook.xml.rels → sheetName → sheetN.xml
//   xl/worksheets/_rels/sheetN.xml.rels → drawingM.xml
//   xl/drawings/_rels/drawingM.xml.rels → media/imageK.png

async function extractSheetImages(xlsxPath: string, sheetName: string): Promise<NoteImage[]> {
  const buf = fs.readFileSync(xlsxPath)
  const zip = await JSZip.loadAsync(buf)

  // Build rId → file-number mapping from workbook.xml.rels
  const wbRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text') ?? ''
  const ridToNum: Record<string, string> = {}
  for (const m of wbRelsXml.matchAll(/Id="(rId\d+)"[^>]*Target="worksheets\/sheet(\d+)\.xml"/g)) {
    ridToNum[m[1]] = m[2]
  }

  // Resolve sheetName → file number from workbook.xml
  const wbXml = await zip.file('xl/workbook.xml')?.async('text') ?? ''
  let fileNum: string | null = null
  for (const m of wbXml.matchAll(/name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) {
    if (m[1] === sheetName) { fileNum = ridToNum[m[2]] ?? null; break }
  }
  if (!fileNum) return []

  // Sheet rels → drawing reference
  const sheetRels = zip.file(`xl/worksheets/_rels/sheet${fileNum}.xml.rels`)
  if (!sheetRels) return []
  const sheetRelsXml = await sheetRels.async('text')
  const drawingMatch = sheetRelsXml.match(/drawings\/drawing(\d+)\.xml/)
  if (!drawingMatch) return []

  // Drawing rels → image references
  const drawingRels = zip.file(`xl/drawings/_rels/drawing${drawingMatch[1]}.xml.rels`)
  if (!drawingRels) return []
  const drawingRelsXml = await drawingRels.async('text')

  const images: NoteImage[] = []
  for (const m of drawingRelsXml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)) {
    const mediaPath = `xl/media/${m[1]}`
    const ext = m[1].split('.').pop()?.toLowerCase() ?? 'png'
    const imgFile = zip.file(mediaPath)
    if (!imgFile) continue
    const b64 = await imgFile.async('base64')
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'gif' ? 'image/gif' : 'image/png'
    images.push({ key: crypto.randomUUID(), data_url: `data:${mime};base64,${b64}`, caption: '' })
  }

  return images
}

// ── Sheet parser ──────────────────────────────────────────────────────────────

async function parseSheet(
  wb: XLSX.WorkBook,
  xlsxPath: string,
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
  try {
    noteImages = await extractSheetImages(xlsxPath, sheetName)
  } catch { /* best-effort */ }

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
    critical_items: [{
      title:        '',
      note:         dailyNote,
      progress_pct: 0,
      note_images:  noteImages,
    }],
    data_location:    r('data_location'),
    work_completion:  { type: '', reason: '', detail: '', time_log: '' },
    images:           [],
  }

  const fileName   = path.basename(xlsxPath)
  const hashInput  = `${fileName}::${sheetName}`
  const importHash = crypto.createHash('sha256').update(hashInput).digest('hex')

  return {
    sheet_name:       sheetName,
    report_date:      reportDate,
    content,
    source_meta: {
      import_hash: importHash,
      file_name:   fileName,
      sheet_name:  sheetName,
      imported_at: new Date().toISOString(),
    },
    images_extracted: noteImages.length,
  }
}

// ── Card resolution ───────────────────────────────────────────────────────────

async function resolveCard(
  supabaseUrl: string,
  serviceKey: string,
  content: FieldServiceContent,
): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(supabaseUrl, serviceKey)
  const eq_id    = content.eq_id.trim()
  const customer = content.customer.trim()
  const model    = content.model.trim()

  if (eq_id) {
    const { data } = await admin.from('cards').select('id').eq('eq_id', eq_id).maybeSingle()
    if (data) return data.id
  }
  if (customer && model) {
    const { data } = await admin.from('cards')
      .select('id')
      .eq('customer', customer).eq('model', model).eq('type', 'field_service')
      .maybeSingle()
    if (data) return data.id
  }

  const { data: newCard, error } = await admin.from('cards').insert({
    type: 'field_service',
    customer: customer || 'Unknown',
    model:    model    || 'Unknown',
    sid:      content.sid      || '',
    eq_id:    eq_id            || '',
    location: content.location || '',
  }).select('id').single()

  if (error || !newCard) throw new Error(`Failed to create card: ${error?.message}`)
  return newCard.id
}

// ── Import ────────────────────────────────────────────────────────────────────

async function importSheet(parsed: ParsedSheet): Promise<'inserted' | 'skipped' | 'error'> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }

  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: existing } = await admin.from('documents')
    .select('id')
    .eq('source_meta->>import_hash', parsed.source_meta.import_hash)
    .maybeSingle()
  if (existing) return 'skipped'

  const cardId = await resolveCard(supabaseUrl, serviceKey, parsed.content)

  const { error } = await admin.from('documents').insert({
    card_id:            cardId,
    report_date:        parsed.report_date,
    is_external:        false,
    parent_document_id: null,
    content:            parsed.content as unknown as Record<string, unknown>,
    source_meta:        parsed.source_meta as unknown as Record<string, unknown>,
  })

  if (error) {
    if (error.code === '23505') return 'skipped'
    throw new Error(`Insert failed: ${error.message}`)
  }
  return 'inserted'
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)

  const fileIdx  = args.indexOf('--file')
  const sheetIdx = args.indexOf('--sheet')

  const fileArg    = fileIdx  >= 0 ? args[fileIdx + 1]  : null
  const sheetArg   = sheetIdx >= 0 ? args[sheetIdx + 1] : null
  const dryRun     = !args.includes('--import')
  const processAll = args.includes('--all')

  if (!fileArg) {
    console.error('Usage: npm run import-excel -- --file <path.xlsx> [--dry-run|--import] [--sheet <name>] [--all]')
    process.exit(1)
  }

  const xlsxPath = path.resolve(fileArg)
  if (!fs.existsSync(xlsxPath)) {
    console.error(`File not found: ${xlsxPath}`)
    process.exit(1)
  }

  console.log(`\n📂  ${path.basename(xlsxPath)}`)
  console.log(`🔧  Mode: ${dryRun ? 'DRY RUN (preview)' : 'IMPORT TO SUPABASE'}`)

  const wb         = XLSX.readFile(xlsxPath)
  let dateSheets   = wb.SheetNames.filter(n => detectTemplate(n) !== null)

  if (sheetArg) {
    dateSheets = dateSheets.filter(n => n === sheetArg)
    if (dateSheets.length === 0) {
      console.error(`Sheet "${sheetArg}" not found. Available: ${wb.SheetNames.filter(n => detectTemplate(n)).slice(0, 8).join(', ')}`)
      process.exit(1)
    }
  } else if (!processAll) {
    console.log(`ℹ️   Showing first 3 of ${dateSheets.length} date sheets. Pass --all to process all.\n`)
    dateSheets = dateSheets.slice(0, 3)
  }

  console.log(`📋  Sheets: ${dateSheets.join(', ')}\n`)

  let inserted = 0, skipped = 0, errors = 0

  for (const sheetName of dateSheets) {
    process.stdout.write(`  "${sheetName}" … `)
    try {
      const parsed = await parseSheet(wb, xlsxPath, sheetName)
      if (!parsed) { console.log('skip (unrecognized)'); continue }

      if (dryRun) {
        console.log(`✓ (${parsed.images_extracted} images)\n`)
        console.log(JSON.stringify(parsed.content, null, 2))
        console.log('\n  source_meta:', JSON.stringify(parsed.source_meta))
        console.log('\n' + '─'.repeat(60) + '\n')
      } else {
        const result = await importSheet(parsed)
        if (result === 'inserted') { inserted++; console.log(`✓ inserted (${parsed.images_extracted} images)`) }
        else                       { skipped++;  console.log('⟳ already exists') }
      }
    } catch (e) {
      errors++
      console.log(`✗ ${(e as Error).message}`)
    }
  }

  if (!dryRun) {
    console.log(`\n✅  Done — inserted: ${inserted}  skipped: ${skipped}  errors: ${errors}`)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
