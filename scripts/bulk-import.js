// Bulk import script — run with: node scripts/bulk-import.js
const { createClient } = require('@supabase/supabase-js')
const XLSX = require('xlsx')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const supabase = createClient(
  'https://fpmarxowhzmmnpqlahca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwbWFyeG93aHptbW5wcWxhaGNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjU3OTI1NiwiZXhwIjoyMDkyMTU1MjU2fQ.zDjaZxbRxS4WHKa-2S3orJBzJEMTh2vhZrPP5_6YXN0'
)

const MMDD = /^\d{4}(_\d+)?$/
function detectTemplate(n) {
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(n)) return 'A'
  if (/^\d{6}$/.test(n)) return 'B'
  if (MMDD.test(n)) return 'A'
  return null
}
function cv(ws, col, row) {
  const c = ws[XLSX.utils.encode_cell({ r: row, c: col })]
  return c && c.v != null ? String(c.v).trim() : ''
}
function detectLayout(ws, sn) {
  const tpl = detectTemplate(sn)
  if (tpl !== 'B') return tpl ?? 'A'
  return cv(ws, 3, 8) ? 'B' : 'A'
}
function toDateISO(raw) {
  if (!raw) return ''
  const n = Number(raw)
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = XLSX.SSF.parse_date_code(n)
    if (d) return d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0')
  }
  return raw.replace(/[./]/g, '-').trim()
}
function toTimeHHMM(raw) {
  if (!raw) return ''
  const n = Number(raw)
  if (!isNaN(n) && n >= 0 && n < 1) {
    const m = Math.round(n * 24 * 60)
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
  }
  return raw
}
function parseDateFromSheet(name, tpl) {
  if (tpl === 'A') return name.replace(/\./g, '-')
  return '20' + name.slice(0, 2) + '-' + name.slice(2, 4) + '-' + name.slice(4, 6)
}

const MAP_A = {
  report_date: [21, 3], fse_name: [21, 4], tool_status: [8, 4],
  customer: [2, 8], location: [11, 8], crm_case_id: [19, 8],
  model: [2, 9], site_survey: [11, 9], noise_level: [14, 9], main_user: [19, 9],
  sid: [2, 10], start_date: [11, 10], tel: [19, 10],
  eq_id: [2, 11], start_time: [11, 11], email: [19, 11],
  service_type: [2, 12], end_time: [11, 12],
  problem: [1, 15], target: [13, 15], daily_note: [1, 22], data_location: [2, 29],
}
const MAP_B = {
  report_date: [22, 3], fse_name: [22, 4], tool_status: [9, 4],
  customer: [3, 8], location: [12, 8], crm_case_id: [20, 8],
  model: [3, 9], site_survey: [12, 9], noise_level: [15, 9], main_user: [20, 9],
  sid: [3, 10], start_date: [12, 10], tel: [20, 10],
  eq_id: [3, 11], start_time: [12, 11], email: [20, 11],
  service_type: [3, 12], end_time: [12, 12],
  problem: [2, 15], target: [14, 15], daily_note: [2, 21], data_location: [3, 57],
}

const SKIP_FILES = new Set([
  'Park Systems Installation Passdown Report.xlsx',
  'Park Systems Field Service Passdown Report.xlsx',
  'Gantt Chart.xlsx',
])

const cardCache = {}

async function resolveCard(eq_id, customer, model, sid, location) {
  const cacheKey = eq_id || (customer + '||' + model + '||' + sid)
  if (cardCache[cacheKey]) return cardCache[cacheKey]

  if (eq_id) {
    const { data } = await supabase.from('cards').select('id').eq('eq_id', eq_id).maybeSingle()
    if (data) { cardCache[cacheKey] = { id: data.id, created: false }; return cardCache[cacheKey] }
  } else if (customer && model && sid) {
    const { data } = await supabase.from('cards').select('id')
      .eq('customer', customer).eq('model', model).eq('sid', sid).eq('type', 'field_service').maybeSingle()
    if (data) { cardCache[cacheKey] = { id: data.id, created: false }; return cardCache[cacheKey] }
  } else if (customer && model) {
    const { data } = await supabase.from('cards').select('id')
      .eq('customer', customer).eq('model', model).eq('type', 'field_service').maybeSingle()
    if (data) { cardCache[cacheKey] = { id: data.id, created: false }; return cardCache[cacheKey] }
  }

  const customerVal = customer || 'Unknown'
  const modelVal = model || 'Unknown'
  const { data: newCard, error } = await supabase.from('cards').insert({
    type: 'field_service', customer: customerVal, model: modelVal,
    sid: sid || '', eq_id: eq_id || '', location: location || '',
    site: customerVal, equipment: modelVal,
  }).select('id').single()
  if (error || !newCard) throw new Error('Card create failed: ' + error?.message)
  cardCache[cacheKey] = { id: newCard.id, created: true }
  return cardCache[cacheKey]
}

async function main() {
  const refDir = path.join(process.cwd(), 'references')
  const files = fs.readdirSync(refDir).filter(f =>
    f.endsWith('.xlsx') && !f.startsWith('~') && !SKIP_FILES.has(f)
  )

  let inserted = 0, skippedDedup = 0, skippedDateDupe = 0, cardsCreated = 0
  const dateDupes = [], errors = []

  for (const f of files) {
    const wb = XLSX.readFile(path.join(refDir, f))
    for (const sn of wb.SheetNames) {
      if (!detectTemplate(sn)) continue
      const ws = wb.Sheets[sn]
      const tpl = detectLayout(ws, sn)
      const map = tpl === 'B' ? MAP_B : MAP_A
      const r = k => cv(ws, map[k][0], map[k][1])

      const customer = r('customer')
      if (!customer) continue

      const isMMDD = MMDD.test(sn) || (tpl === 'A' && /^\d{6}$/.test(sn))
      const date = isMMDD ? toDateISO(r('report_date')) : parseDateFromSheet(sn, tpl)
      if (!date) continue

      const eq_id = r('eq_id'), model = r('model'), sid = r('sid')
      const hash = crypto.createHash('sha256').update(f + '::' + sn).digest('hex')

      const { data: dup } = await supabase.from('documents').select('id')
        .eq('source_meta->>import_hash', hash).maybeSingle()
      if (dup) { skippedDedup++; continue }

      let cardResult
      try { cardResult = await resolveCard(eq_id, customer, model, sid, r('location')) }
      catch (e) { errors.push(f + '/' + sn + ': ' + e.message); continue }
      if (cardResult.created) cardsCreated++

      const dailyNote = r('daily_note')
      const content = {
        fse_name: r('fse_name'), report_date: date, customer,
        location: r('location'), crm_case_id: r('crm_case_id'), model,
        site_survey: r('site_survey'), noise_level: r('noise_level'),
        main_user: r('main_user'), sid, tel: r('tel'), eq_id,
        email: r('email'), service_type: r('service_type'),
        tool_status: r('tool_status'), start_date: toDateISO(r('start_date')),
        start_time: toTimeHHMM(r('start_time')), end_date: '',
        end_time: toTimeHHMM(r('end_time')), end_time_note: '고객사 출문 시간',
        problem_statement: r('problem'), target_statement: r('target'),
        daily_note: dailyNote, progress_pct: 0,
        critical_items: [{ title: '', note: dailyNote, progress_pct: 0, note_images: [] }],
        data_location: r('data_location'),
        work_completion: { type: '', reason: '', detail: '', time_log: '' },
        images: [],
      }

      const { error: insErr } = await supabase.from('documents').insert({
        card_id: cardResult.id, report_date: date,
        is_external: false, parent_document_id: null, content,
        source_meta: { import_hash: hash, file_name: f, sheet_name: sn, imported_at: new Date().toISOString() },
      })

      if (insErr) {
        if (insErr.code === '23505') {
          dateDupes.push(f + ' / ' + sn + ' (' + date + ')')
          skippedDateDupe++
        } else {
          errors.push(f + '/' + sn + ': ' + insErr.message)
        }
      } else {
        inserted++
        if (inserted % 10 === 0) process.stdout.write('\r  진행: ' + inserted + '건 삽입...')
      }
    }
  }

  console.log('\n\n=== BULK IMPORT 완료 ===')
  console.log('inserted:         ', inserted)
  console.log('skipped(dedup):   ', skippedDedup)
  console.log('skipped(date중복):', skippedDateDupe)
  if (dateDupes.length) dateDupes.forEach(d => console.log('  → 날짜중복:', d))
  console.log('cards_created:    ', cardsCreated)
  console.log('errors:           ', errors.length)
  if (errors.length) errors.forEach(e => console.log('  →', e))
}

main().catch(console.error)
