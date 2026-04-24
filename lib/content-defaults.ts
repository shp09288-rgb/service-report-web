import type { CardRow } from '@/types/db'
import type { CriticalItem, NoteImage, FieldServiceContent, InstallationContent } from '@/types/report'

interface CardMeta {
  customer: string
  model: string
  sid: string
  eq_id: string
  location: string
}

function metaFromCard(card: CardRow): CardMeta {
  return {
    customer: card.customer,
    model:    card.model,
    sid:      card.sid,
    eq_id:    card.eq_id,
    location: card.location,
  }
}

export const defaultFieldServiceContent = (card?: CardRow): FieldServiceContent => {
  const meta = card ? metaFromCard(card) : { customer: '', model: '', sid: '', eq_id: '', location: '' }
  return {
    is_card_seeded: card != null,
    fse_name: '',
    report_date: '',
    customer: meta.customer,
    location: meta.location,
    crm_case_id: '',
    model: meta.model,
    site_survey: '',
    noise_level: '',
    main_user: '',
    sid: meta.sid,
    tel: '',
    eq_id: meta.eq_id,
    email: '',
    service_type: '',
    tool_status: '',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    end_time_note: '고객사 출문 시간',
    problem_statement: '',
    target_statement: '',
    daily_note: '',
    progress_pct: 0,
    critical_items: [{ title: '', note: '', progress_pct: 0, note_images: [] }],
    data_location: '',
    work_completion: { type: '', reason: '', detail: '', time_log: '' },
    images: [],
  }
}

// ── Field Service content normalizer ─────────────────────────────────
// Accepts raw DB JSON (unknown) and returns a fully-valid FieldServiceContent.
// Handles every known legacy format so the editor never receives bad data.
//
// Legacy migration table:
//  { text, sub_items }       → title=text, note=sub_items.join('\n')
//  { images:[{url,caption}]} → convert url-based images → note_images if
//                               they are data_url; otherwise append url as
//                               note text so no information is silently lost
//  no critical_items + daily_note → one item with note=daily_note
//  missing note_images field → []
//  progress_pct out of range → clamped 0–100
export function normalizeFieldServiceContent(raw: unknown): FieldServiceContent {
  const defaults = defaultFieldServiceContent()

  if (!raw || typeof raw !== 'object') return defaults

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as Record<string, any>

  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? v : fallback

  const num = (v: unknown, fallback = 0): number =>
    typeof v === 'number' && isFinite(v) ? v : fallback

  const clamp100 = (v: number): number => Math.max(0, Math.min(100, v))

  // ── work_completion — fill any missing keys ───────────────────
  const wc = r.work_completion && typeof r.work_completion === 'object'
    ? {
        type:     str(r.work_completion.type),
        reason:   str(r.work_completion.reason),
        detail:   str(r.work_completion.detail),
        time_log: str(r.work_completion.time_log),
      }
    : defaults.work_completion

  // ── top-level images (ImageRef[]) — legacy field, keep for compat ─
  const images: FieldServiceContent['images'] = Array.isArray(r.images)
    ? r.images.map((img: unknown) => {
        const m = (img && typeof img === 'object' ? img : {}) as Record<string, unknown>
        return { key: str(m.key), url: str(m.url), caption: str(m.caption) }
      })
    : []

  // ── Helper: normalize a single note_images entry ──────────────
  function normalizeNoteImage(img: unknown): NoteImage | null {
    if (!img || typeof img !== 'object') return null
    const m = img as Record<string, unknown>
    const dataUrl = str(m.data_url)
    if (!dataUrl) return null // skip entries with no embeddable data
    return {
      key:     str(m.key) || crypto.randomUUID(),
      data_url: dataUrl,
      caption: str(m.caption),
      width:   typeof m.width  === 'number' ? m.width  : undefined,
      height:  typeof m.height === 'number' ? m.height : undefined,
    }
  }

  // ── Helper: migrate old url-based images[] to note_images + note text ─
  // Old images had { key, url, caption } — URL-based, not embeddable.
  // If url looks like a data_url, recover it. Otherwise append as note text.
  function migrateOldImages(
    oldImages: unknown[],
    existingNote: string,
  ): { note: string; note_images: NoteImage[] } {
    const note_images: NoteImage[] = []
    const urlFallbacks: string[] = []

    for (const img of oldImages) {
      if (!img || typeof img !== 'object') continue
      const m = img as Record<string, unknown>
      const url = str(m.url)
      const caption = str(m.caption)

      if (url.startsWith('data:')) {
        // It's already a data_url — can embed
        const ni = normalizeNoteImage({ key: str(m.key), data_url: url, caption })
        if (ni) note_images.push(ni)
      } else if (url) {
        // External URL — cannot embed; preserve as note text
        urlFallbacks.push(caption ? `${caption}: ${url}` : url)
      }
    }

    const note = urlFallbacks.length > 0
      ? [existingNote, ...urlFallbacks].filter(Boolean).join('\n')
      : existingNote

    return { note, note_images }
  }

  // ── critical_items — migrate all known legacy formats ─────────
  const rawItems: unknown[] = Array.isArray(r.critical_items) ? r.critical_items : []

  let criticalItems: CriticalItem[] = rawItems.map((item: unknown): CriticalItem => {
    if (!item || typeof item !== 'object') {
      return { title: '', note: '', progress_pct: 0, note_images: [] }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const it = item as Record<string, any>

    // ── Old format A: { text, sub_items } ────────────────────────
    if ('text' in it || 'sub_items' in it) {
      const subItems: string[] = Array.isArray(it.sub_items)
        ? it.sub_items.map((s: unknown) => str(s))
        : []
      return {
        title:       str(it.text),
        note:        subItems.join('\n'),
        progress_pct: clamp100(num(it.progress_pct)),
        note_images: [],
      }
    }

    // ── Old format B: { title, note, images:[{url,caption}] } ────
    // images[] was the old attachment-style field
    if ('images' in it && Array.isArray(it.images) && !('note_images' in it)) {
      const { note, note_images } = migrateOldImages(it.images, str(it.note))
      return {
        title:        str(it.title),
        note,
        progress_pct: clamp100(num(it.progress_pct)),
        note_images,
      }
    }

    // ── Current format: { title, note, progress_pct, note_images } ─
    const note_images: NoteImage[] = Array.isArray(it.note_images)
      ? it.note_images.map(normalizeNoteImage).filter((x): x is NoteImage => x !== null)
      : []

    return {
      title:        str(it.title),
      note:         str(it.note),
      progress_pct: clamp100(num(it.progress_pct)),
      note_images,
    }
  })

  // ── No items at all — migrate from legacy daily_note ─────────
  if (criticalItems.length === 0) {
    criticalItems = [{
      title:        '',
      note:         str(r.daily_note),
      progress_pct: clamp100(num(r.progress_pct)),
      note_images:  [],
    }]
  }

  return {
    is_card_seeded:    typeof r.is_card_seeded === 'boolean' ? r.is_card_seeded : undefined,
    fse_name:          str(r.fse_name),
    report_date:       str(r.report_date),
    customer:          str(r.customer),
    location:          str(r.location),
    crm_case_id:       str(r.crm_case_id),
    model:             str(r.model),
    site_survey:       str(r.site_survey),
    noise_level:       str(r.noise_level),
    main_user:         str(r.main_user),
    sid:               str(r.sid),
    tel:               str(r.tel),
    eq_id:             str(r.eq_id),
    email:             str(r.email),
    service_type:      str(r.service_type),
    tool_status:       str(r.tool_status),
    start_date:        str(r.start_date),
    start_time:        str(r.start_time),
    end_date:          str(r.end_date),
    end_time:          str(r.end_time),
    end_time_note:     str(r.end_time_note, '고객사 출문 시간'),
    problem_statement: str(r.problem_statement),
    target_statement:  str(r.target_statement),
    daily_note:        str(r.daily_note),
    progress_pct:      clamp100(num(r.progress_pct)),
    critical_items:    criticalItems,
    data_location:     str(r.data_location),
    work_completion:   wc,
    images,
  }
}

export const defaultInstallationContent = (card?: CardRow): InstallationContent => {
  const meta = card ? metaFromCard(card) : { customer: '', model: '', sid: '', eq_id: '', location: '' }
  return {
    is_card_seeded:        card != null,
    fse_name:              '',
    report_date:           '',
    customer:              meta.customer,
    model:                 meta.model,
    sid:                   meta.sid,
    eq_id:                 meta.eq_id,
    location:              meta.location,
    site_survey:           '',
    noise_level:           '',
    start_date:            '',
    est_complete_date:     '',
    service_type:          '',
    start_time:            '',
    end_time:              '',
    crm_case_id:           '',
    main_user:             '',
    tel:                   '',
    email:                 '',
    committed_pct:         0,
    actual_pct:            0,
    total_days:            0,
    progress_days:         0,
    action_chart:          [{ item: '', committed: '', actual_pct: 0 }],
    critical_item_summary: '',
    detail_report:         [{ title: '', content: '' }],
    next_plan:             '',
    data_location:         '',
  }
}

// Normalizer — migrates old InstallationContent shapes to the current schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeInstallationContent(raw: any): InstallationContent {
  if (!raw || typeof raw !== 'object') return defaultInstallationContent()

  const r = raw as Record<string, unknown>
  const str  = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
  const num  = (v: unknown, fallback = 0)  => (typeof v === 'number' ? v : fallback)
  const bool = (v: unknown) => v === true

  // Migrate old action_chart
  const oldChart = Array.isArray(r.action_chart) ? r.action_chart : []
  const action_chart = oldChart.map((row: Record<string, unknown>) => ({
    item:       str(row.item),
    committed:  str(row.committed),
    actual_pct: num(row.actual_pct),
  }))
  if (action_chart.length === 0) action_chart.push({ item: '', committed: '', actual_pct: 0 })

  // Migrate old critical_items → critical_item_summary
  let critical_item_summary = str(r.critical_item_summary)
  if (!critical_item_summary && Array.isArray(r.critical_items)) {
    const items = r.critical_items as Record<string, unknown>[]
    critical_item_summary = items
      .map((it, i) => `${i + 1}. ${str(it.title)}`)
      .filter(s => s.trim().length > 2)
      .join('\n')
  }

  // Migrate old critical_items → detail_report
  let detail_report: { title: string; content: string }[] = []
  if (Array.isArray(r.detail_report)) {
    detail_report = (r.detail_report as Record<string, unknown>[]).map(it => ({
      title:   str(it.title),
      content: str(it.content),
    }))
  } else if (Array.isArray(r.critical_items)) {
    detail_report = (r.critical_items as Record<string, unknown>[]).map(it => ({
      title:   str(it.title),
      content: [str(it.detail), str(it.next_plan)].filter(Boolean).join('\n'),
    }))
  }
  if (detail_report.length === 0) detail_report.push({ title: '', content: '' })

  // Migrate total_cycle_time (old string) → total_days
  let total_days = num(r.total_days)
  if (!total_days && typeof r.total_cycle_time === 'string') {
    const m = r.total_cycle_time.match(/\d+/)
    if (m) total_days = parseInt(m[0], 10)
  }

  return {
    is_card_seeded:        bool(r.is_card_seeded),
    fse_name:              str(r.fse_name),
    report_date:           str(r.report_date),
    customer:              str(r.customer),
    model:                 str(r.model),
    sid:                   str(r.sid),
    eq_id:                 str(r.eq_id),
    location:              str(r.location),
    site_survey:           str(r.site_survey),
    noise_level:           str(r.noise_level),
    start_date:            str(r.start_date),
    est_complete_date:     str(r.est_complete_date),
    service_type:          str(r.service_type),
    start_time:            str(r.start_time),
    end_time:              str(r.end_time),
    crm_case_id:           str(r.crm_case_id),
    main_user:             str(r.main_user),
    tel:                   str(r.tel),
    email:                 str(r.email),
    committed_pct:         Math.min(100, Math.max(0, num(r.committed_pct))),
    actual_pct:            Math.min(100, Math.max(0, num(r.actual_pct))),
    total_days,
    progress_days:         num(r.progress_days),
    action_chart,
    critical_item_summary,
    detail_report,
    next_plan:             str(r.next_plan),
    data_location:         str(r.data_location),
  }
}
