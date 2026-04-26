'use client'

import { useMemo } from 'react'
import {
  RadarChart as RechartsRadar,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { InstallationContent, NoteImage } from '@/types/report'
import type { GanttTask } from '@/types/db'
import { computeInstallationProgress, GANTT_CATEGORIES } from '@/lib/gantt-progress'

const SITE_SURVEY_OPTIONS = ['VC-A', 'VC-B', 'VC-C', 'VC-D', 'VC-E', 'Other']
const NOISE_LEVEL_OPTIONS = ['< 60dB', '60~65dB', '65~70dB', '> 70dB']
const SERVICE_TYPE_OPTIONS = ['Warranty', 'Service Contract', 'Billable', 'Non-Billable']
const WORK_COMPLETION_TYPES = ['사무실(구미 숙소) 복귀', '재택근무 전환', '추가 외근 수행', '업무 종료']

interface Props {
  content: InstallationContent
  onChange: (content: InstallationContent) => void
  readOnly?: boolean
  cardSeeded?: boolean
  /** Gantt tasks for auto-calculating progress (from card's Gantt Chart) */
  ganttTasks?: GanttTask[]
  /** Document report_date (YYYY-MM-DD) — used for Committed/Progress Days calc */
  reportDate?: string
}

// ── Read a clipboard/file image → NoteImage ──────────────────
function readImageFile(file: File, onDone: (img: NoteImage) => void) {
  const reader = new FileReader()
  reader.onload = ev => {
    const data_url = ev.target?.result as string
    if (!data_url) return
    const htmlImg = new window.Image()
    htmlImg.onload = () => {
      onDone({
        key:     crypto.randomUUID(),
        data_url,
        caption: '',
        width:   htmlImg.naturalWidth,
        height:  htmlImg.naturalHeight,
      })
    }
    htmlImg.src = data_url
  }
  reader.readAsDataURL(file)
}

function safeNoteImages(item: InstallationContent['detail_report'][0]): NoteImage[] {
  return Array.isArray(item.note_images) ? item.note_images : []
}

// ── Simple progress bar ───────────────────────────────────────
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-3 bg-gray-200 rounded overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-9 text-right shrink-0">{clamped}%</span>
    </div>
  )
}

export function InstallationEditor({
  content, onChange, readOnly = false, cardSeeded = false, ganttTasks, reportDate,
}: Props) {
  const metaRO = readOnly || cardSeeded

  // ── Auto-computed values (from Gantt tasks) ───────────────────
  const computed = useMemo(() => {
    if (!ganttTasks || ganttTasks.length === 0) return null
    return computeInstallationProgress(
      ganttTasks,
      content.start_date,
      content.est_complete_date,
      reportDate ?? '',
    )
  }, [ganttTasks, content.start_date, content.est_complete_date, reportDate])

  // Use computed values if available, else fall back to stored content values
  const committed   = computed ? computed.committedProgress : Math.min(100, Math.max(0, content.committed_pct ?? 0))
  const actual      = computed ? computed.actualProgress    : Math.min(100, Math.max(0, content.actual_pct    ?? 0))
  const totalDays   = computed ? computed.totalDays         : (content.total_days ?? 0)
  const progressDays = computed ? computed.progressDays     : (content.progress_days ?? 0)

  function set<K extends keyof InstallationContent>(key: K, val: InstallationContent[K]) {
    onChange({ ...content, [key]: val })
  }

  const wc = content.work_completion ?? { type: '', reason: '', detail: '', time_log: '' }
  function setWC(key: 'type' | 'reason' | 'detail' | 'time_log', val: string) {
    onChange({ ...content, work_completion: { ...wc, [key]: val } })
  }
  const isRemote = wc.type === '재택근무 전환'

  function setDetail(i: number, key: 'title' | 'content', val: string) {
    set('detail_report', content.detail_report.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  }
  function addDetail()             { set('detail_report', [...content.detail_report, { title: '', content: '', note_images: [] }]) }
  function removeDetail(i: number) { set('detail_report', content.detail_report.filter((_, idx) => idx !== i)) }

  function addDetailImage(di: number, img: NoteImage) {
    set('detail_report', content.detail_report.map((it, i) =>
      i === di ? { ...it, note_images: [...safeNoteImages(it), img] } : it
    ))
  }
  function updateDetailImage(di: number, ji: number, patch: Partial<NoteImage>) {
    set('detail_report', content.detail_report.map((it, i) => {
      if (i !== di) return it
      return { ...it, note_images: safeNoteImages(it).map((img, j) => j === ji ? { ...img, ...patch } : img) }
    }))
  }
  function removeDetailImage(di: number, ji: number) {
    set('detail_report', content.detail_report.map((it, i) => {
      if (i !== di) return it
      return { ...it, note_images: safeNoteImages(it).filter((_, j) => j !== ji) }
    }))
  }
  function handlePasteOnDetail(e: React.ClipboardEvent, di: number) {
    for (const item of Array.from(e.clipboardData?.items ?? [])) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) readImageFile(file, img => addDetailImage(di, img))
        return
      }
    }
  }
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>, di: number) {
    const file = e.target.files?.[0]
    if (file) readImageFile(file, img => addDetailImage(di, img))
    e.target.value = ''
  }

  // ── Style tokens ──────────────────────────────────────────────
  const S = {
    inp: 'w-full border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500',
    ta:  'w-full border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y disabled:bg-gray-50 disabled:text-gray-500',
    lbl: 'bg-[#D9E2F3] text-[#1B3769] text-[11px] font-medium px-2 py-1.5 flex items-center whitespace-nowrap shrink-0',
    sh:  'bg-[#4472C4] text-white text-[11px] font-bold px-2 py-[5px] tracking-wide',
    ro:  'w-full border border-gray-200 px-2 py-1.5 text-xs bg-gray-50 text-gray-600',
  }

  return (
    <div className="font-sans text-xs border border-gray-400 shadow-sm">

      {/* ══════════════════════════════════════════════════════════
          TITLE BAR
      ══════════════════════════════════════════════════════════ */}
      <div className="bg-[#1F3864] text-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Logo placeholder */}
          <div className="w-10 h-8 bg-white/20 rounded flex items-center justify-center text-[9px] text-white/70 shrink-0">PS</div>
          <div>
            <div className="text-sm font-bold tracking-wide">Park Systems Installation Passdown Report</div>
            <div className="text-[10px] text-white/60">Service Report Tool</div>
          </div>
        </div>
        <table className="border-collapse shrink-0 self-stretch">
          <tbody>
            <tr>
              <td className="bg-[#2E4D7A] text-white/80 text-[10px] px-2 py-[2px] border border-[#3a5a8a] whitespace-nowrap">Park FSE Name</td>
              <td className="bg-white px-1 py-[2px] border border-[#3a5a8a]" style={{ minWidth: 110 }}>
                <input type="text" className="w-full text-[11px] text-gray-800 bg-transparent focus:outline-none disabled:text-gray-500"
                  value={content.fse_name} onChange={e => set('fse_name', e.target.value)} disabled={readOnly} />
              </td>
            </tr>
            <tr>
              <td className="bg-[#2E4D7A] text-white/80 text-[10px] px-2 py-[2px] border border-[#3a5a8a]">Date</td>
              <td className="bg-white px-1 py-[2px] border border-[#3a5a8a]">
                <input type="date" className="w-full text-[11px] text-gray-800 bg-transparent focus:outline-none disabled:text-gray-500"
                  value={content.report_date} onChange={e => set('report_date', e.target.value)} disabled={readOnly} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════════
          3-COLUMN INFO (System / Installation / Contact)
      ══════════════════════════════════════════════════════════ */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td colSpan={2} className={S.sh}>System Information</td>
            <td colSpan={2} className={`${S.sh} border-l border-white/30`}>Installation Information</td>
            <td colSpan={2} className={`${S.sh} border-l border-white/30`}>Contact Info</td>
          </tr>
        </thead>
        <tbody>
          {/* Row 1 */}
          <tr>
            <td className={S.lbl} style={{ width: '9%' }}>Customer</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]" style={{ width: '24%' }}>
              <input type="text" className={S.inp} value={content.customer} onChange={e => set('customer', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lbl} style={{ width: '9%' }}>Location</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]" style={{ width: '24%' }}>
              <input type="text" className={S.inp} value={content.location} onChange={e => set('location', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lbl} style={{ width: '9%' }}>CRM Case ID</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]" style={{ width: '25%' }}>
              <input type="text" className={S.inp} value={content.crm_case_id} onChange={e => set('crm_case_id', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          {/* Row 2 */}
          <tr>
            <td className={S.lbl}>Model</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="text" className={S.inp} value={content.model} onChange={e => set('model', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lbl}>Site Survey</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <div className="flex gap-1">
                <select className={`${S.inp} flex-1`} value={content.site_survey} onChange={e => set('site_survey', e.target.value)} disabled={readOnly}>
                  <option value="">—</option>
                  {SITE_SURVEY_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
                <select className={`${S.inp} flex-1`} value={content.noise_level} onChange={e => set('noise_level', e.target.value)} disabled={readOnly}>
                  <option value="">—</option>
                  {NOISE_LEVEL_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </td>
            <td className={S.lbl}>Main User</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="text" className={S.inp} value={content.main_user} onChange={e => set('main_user', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          {/* Row 3 */}
          <tr>
            <td className={S.lbl}>SID</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="text" className={S.inp} value={content.sid} onChange={e => set('sid', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lbl}>Start Date</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="date" className={S.inp} value={content.start_date} onChange={e => set('start_date', e.target.value)} disabled={readOnly} />
            </td>
            <td className={S.lbl}>Main User Tel #</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="text" className={S.inp} value={content.tel} onChange={e => set('tel', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          {/* Row 4 */}
          <tr>
            <td className={S.lbl}>EQ ID</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="text" className={S.inp} value={content.eq_id} onChange={e => set('eq_id', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lbl}>Est. Complete Date</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="date" className={S.inp} value={content.est_complete_date} onChange={e => set('est_complete_date', e.target.value)} disabled={readOnly} />
            </td>
            <td className={S.lbl}>Main User E-mail</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="email" className={S.inp} value={content.email} onChange={e => set('email', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          {/* Row 5 */}
          <tr>
            <td className={S.lbl}>Service Type</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <select className={S.inp} value={content.service_type ?? ''} onChange={e => set('service_type', e.target.value)} disabled={readOnly}>
                <option value="">—</option>
                {SERVICE_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </td>
            <td className={S.lbl}>Start Time</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="time" className={S.inp} value={content.start_time ?? ''} onChange={e => set('start_time', e.target.value)} disabled={readOnly} />
            </td>
            <td className={S.lbl}>End Time</td>
            <td className="border border-gray-300 bg-white px-1 py-[2px]">
              <input type="text" className={S.inp} value={content.end_time ?? ''} onChange={e => set('end_time', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* ══════════════════════════════════════════════════════════
          TOTAL CYCLE TIME (left) + INDIVIDUAL ACTION CHART (right)
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 border-t border-gray-300">

        {/* ── LEFT: Total Cycle Time ─────────────────────────── */}
        <div className="border-r border-gray-300">
          <div className={S.sh}>
            Total Cycle Time
            {computed && (
              <span className="ml-2 text-[9px] font-normal text-blue-100 bg-blue-700/40 px-1.5 py-0.5 rounded">
                Auto from Gantt
              </span>
            )}
          </div>

          <div className="px-3 py-2 space-y-3">
            {/* Committed Progress */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-600 w-36 shrink-0 font-medium">Committed Progress</span>
                <ProgressBar pct={committed} color="bg-blue-500" />
              </div>
              {!computed && !readOnly && (
                <div className="flex items-center gap-1 pl-36">
                  <input type="number" min={0} max={100}
                    className="border border-gray-300 px-2 py-0.5 text-xs w-14 focus:outline-none"
                    value={content.committed_pct ?? 0}
                    onChange={e => set('committed_pct', Math.min(100, Math.max(0, Number(e.target.value))))} />
                  <span className="text-[10px] text-gray-500">%</span>
                </div>
              )}
              <div className="flex items-center gap-2 pl-36 text-[10px] text-gray-500">
                <span>Total:</span>
                {computed ? (
                  <span className="font-semibold text-gray-700">{totalDays}</span>
                ) : (
                  !readOnly ? (
                    <input type="number" min={0}
                      className="border border-gray-300 px-1 py-0.5 text-xs w-14 focus:outline-none"
                      value={content.total_days ?? 0}
                      onChange={e => set('total_days', Math.max(0, Number(e.target.value)))} />
                  ) : <span className="font-semibold text-gray-700">{totalDays}</span>
                )}
                <span>Days</span>
              </div>
            </div>

            {/* Actual Progress */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-600 w-36 shrink-0 font-medium">Actual Progress</span>
                <ProgressBar pct={actual} color="bg-emerald-500" />
              </div>
              {!computed && !readOnly && (
                <div className="flex items-center gap-1 pl-36">
                  <input type="number" min={0} max={100}
                    className="border border-gray-300 px-2 py-0.5 text-xs w-14 focus:outline-none"
                    value={content.actual_pct ?? 0}
                    onChange={e => set('actual_pct', Math.min(100, Math.max(0, Number(e.target.value))))} />
                  <span className="text-[10px] text-gray-500">%</span>
                </div>
              )}
              <div className="flex items-center gap-2 pl-36 text-[10px] text-gray-500">
                <span>Progress:</span>
                {computed ? (
                  <span className="font-semibold text-gray-700">{progressDays}</span>
                ) : (
                  !readOnly ? (
                    <input type="number" min={0}
                      className="border border-gray-300 px-1 py-0.5 text-xs w-14 focus:outline-none"
                      value={content.progress_days ?? 0}
                      onChange={e => set('progress_days', Math.max(0, Number(e.target.value)))} />
                  ) : <span className="font-semibold text-gray-700">{progressDays}</span>
                )}
                <span>Days</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Individual Action Chart ─────────────────── */}
        <div>
          <div className={S.sh}>
            Individual Action Chart
            {computed && (
              <span className="ml-2 text-[9px] font-normal text-blue-100 bg-blue-700/40 px-1.5 py-0.5 rounded">
                Auto from Gantt
              </span>
            )}
          </div>

          {computed ? (
            /* Auto-computed RadarChart from GANTT_CATEGORIES */
            <div>
              <ResponsiveContainer width="100%" height={220}>
                <RechartsRadar
                  data={GANTT_CATEGORIES.map(cat => ({
                    subject: cat,
                    value:   computed.categoryProgress[cat] ?? 0,
                    full:    100,
                  }))}
                  margin={{ top: 12, right: 24, bottom: 12, left: 24 }}
                >
                  <PolarGrid stroke="#B8CCE4" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 9, fill: '#1B3769', fontWeight: 600 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 8, fill: '#888' }}
                    tickCount={5}
                  />
                  <Radar
                    name="Progress"
                    dataKey="value"
                    stroke="#4472C4"
                    fill="#4472C4"
                    fillOpacity={0.30}
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#4472C4', stroke: 'white', strokeWidth: 1.5 }}
                  />
                  <Tooltip formatter={(v) => [`${v ?? 0}%`, 'Progress']} />
                </RechartsRadar>
              </ResponsiveContainer>
              {/* Small reference table below the chart */}
              <div className="px-2 pb-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                {GANTT_CATEGORIES.map(cat => {
                  const pct   = computed.categoryProgress[cat] ?? 0
                  const total = ganttTasks?.filter(t => t.action === cat).length ?? 0
                  const done  = ganttTasks?.filter(t => t.action === cat && t.status === 'Completed').length ?? 0
                  return (
                    <div key={cat} className="flex items-center justify-between text-[9px] leading-4">
                      <span className="text-gray-600 truncate flex-1">{cat}</span>
                      <span className="ml-1 shrink-0 font-semibold text-[#4472C4]">
                        {done}/{total} ({pct}%)
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Manual input table (fallback when no Gantt data) */
            <div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-300">
                    <th className="text-left px-2 py-1 font-medium text-gray-600">Item</th>
                    <th className="text-left px-2 py-1 font-medium text-gray-600 w-24">Committed</th>
                    <th className="text-left px-2 py-1 font-medium text-gray-600 w-20">Actual %</th>
                    {!readOnly && <th className="w-6" />}
                  </tr>
                </thead>
                <tbody>
                  {content.action_chart.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-1 py-0.5">
                        <input type="text" className={S.inp} value={row.item}
                          onChange={e => set('action_chart', content.action_chart.map((r, j) => j === i ? { ...r, item: e.target.value } : r))}
                          disabled={readOnly} />
                      </td>
                      <td className="px-1 py-0.5">
                        <input type="text" className={S.inp} value={row.committed}
                          onChange={e => set('action_chart', content.action_chart.map((r, j) => j === i ? { ...r, committed: e.target.value } : r))}
                          disabled={readOnly} />
                      </td>
                      <td className="px-1 py-0.5">
                        <div className="flex items-center gap-1">
                          <input type="number" min={0} max={100} className={`${S.inp} w-12`} value={row.actual_pct}
                            onChange={e => set('action_chart', content.action_chart.map((r, j) => j === i ? { ...r, actual_pct: Number(e.target.value) } : r))}
                            disabled={readOnly} />
                          <span className="text-gray-400">%</span>
                        </div>
                      </td>
                      {!readOnly && (
                        <td className="px-1 py-0.5 text-center">
                          <button onClick={() => set('action_chart', content.action_chart.filter((_, j) => j !== i))}
                            className="text-red-400 hover:text-red-600">✕</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!readOnly && (
                <div className="px-2 py-1">
                  <button onClick={() => set('action_chart', [...content.action_chart, { item: '', committed: '', actual_pct: 0 }])}
                    className="text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-2 py-0.5">
                    + Add Row
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          CRITICAL ITEM SUMMARY
      ══════════════════════════════════════════════════════════ */}
      <div className="border-t border-gray-300">
        <div className={S.sh}>Critical Item Summary</div>
        <div className="p-2">
          <textarea rows={6} className={S.ta}
            placeholder="1. &#13;&#10;2. &#13;&#10;3. "
            value={content.critical_item_summary}
            onChange={e => set('critical_item_summary', e.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DETAIL REPORT (left) + NEXT PLAN UPDATE (right)
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-[1fr_280px] border-t border-gray-300">
        <div className="border-r border-gray-300">
          <div className={S.sh}>Detail Report</div>
          <div className="p-2 space-y-2">
            {content.detail_report.map((item, i) => (
              <div key={i} className="border border-gray-200 rounded p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-500 shrink-0">{i + 1}.</span>
                  <input type="text" className={`${S.inp} flex-1`} placeholder="Title"
                    value={item.title} onChange={e => setDetail(i, 'title', e.target.value)} disabled={readOnly} />
                  {!readOnly && (
                    <button onClick={() => removeDetail(i)} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
                  )}
                </div>
                <textarea rows={4} className={S.ta} placeholder="Detail content (Ctrl+V to paste screenshot)"
                  value={item.content}
                  onChange={e => setDetail(i, 'content', e.target.value)}
                  onPaste={readOnly ? undefined : e => handlePasteOnDetail(e, i)}
                  disabled={readOnly}
                />
                {safeNoteImages(item).map((img, j) => (
                  <div key={img.key} className="mt-1 pt-1 border-t border-gray-100">
                    <div className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.data_url} alt={img.caption || `Screenshot ${j + 1}`}
                        style={{ maxWidth: 320, maxHeight: 240, display: 'block', objectFit: 'contain' }} />
                      {!readOnly && (
                        <button type="button" onClick={() => removeDetailImage(i, j)}
                          className="absolute top-0 right-0 bg-white border border-gray-300 text-gray-400 hover:text-red-500 text-[9px] leading-none px-[3px] py-[1px]">✕</button>
                      )}
                    </div>
                    {readOnly ? (
                      img.caption ? <div className="text-[10px] text-gray-500 italic mt-[2px]">{img.caption}</div> : null
                    ) : (
                      <input type="text"
                        className="mt-[2px] block border-0 border-b border-gray-200 px-0 py-[1px] text-[10px] text-gray-500 italic bg-transparent focus:outline-none focus:border-blue-400 w-full"
                        style={{ maxWidth: 320 }}
                        placeholder="Add caption…"
                        value={img.caption}
                        onChange={e => updateDetailImage(i, j, { caption: e.target.value })}
                      />
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 select-none">Ctrl+V to paste</span>
                    <label className="text-[10px] text-gray-500 hover:text-blue-600 cursor-pointer border border-gray-300 px-1.5 py-[1px] rounded-sm select-none">
                      Insert image
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleFilePick(e, i)} />
                    </label>
                  </div>
                )}
              </div>
            ))}
            {!readOnly && (
              <button onClick={addDetail}
                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-2 py-1">
                + Add Item
              </button>
            )}
          </div>
        </div>
        <div>
          <div className={S.sh}>Next Plan Update</div>
          <div className="p-2">
            <textarea rows={16} className={`${S.ta} min-h-48`}
              placeholder="Next plan..."
              value={content.next_plan}
              onChange={e => set('next_plan', e.target.value)}
              disabled={readOnly}
            />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DATA LOCATION
      ══════════════════════════════════════════════════════════ */}
      <div className="flex border-t border-gray-300">
        <div className={`${S.lbl} border-r border-gray-300`} style={{ minWidth: 100 }}>Data Location</div>
        <div className="flex-1 p-1">
          <input type="text" className={S.inp} value={content.data_location}
            onChange={e => set('data_location', e.target.value)} disabled={readOnly} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          WORK COMPLETION  (재택근무 전환 시 작성 항목)
      ══════════════════════════════════════════════════════════ */}
      <div className="border-t border-gray-300">
        <div className={S.sh}>Work Completion — 작업 종료 후 근무 형태</div>
        <div className="p-2 space-y-2">

          {/* Type + Time Log */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1 shrink-0">
              <span className={`${S.lbl} rounded-sm`} style={{ minWidth: 80 }}>근무 형태</span>
              <select
                className={`${S.inp} border border-gray-300 rounded-sm`}
                style={{ width: 190 }}
                value={wc.type}
                onChange={e => setWC('type', e.target.value)}
                disabled={readOnly}
              >
                <option value="">— 선택 —</option>
                {WORK_COMPLETION_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1 flex-1 min-w-40">
              <span className={`${S.lbl} rounded-sm`} style={{ minWidth: 60 }}>Time Log</span>
              <input
                type="text"
                className={`${S.inp} border border-gray-300 rounded-sm flex-1`}
                placeholder="09:00 ~ 18:00"
                value={wc.time_log}
                onChange={e => setWC('time_log', e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>

          {/* Remote work detail — highlighted when 재택근무 전환 is selected */}
          <div className={`rounded border ${isRemote ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'} p-2 space-y-1.5`}>
            <div className="text-[10px] font-semibold text-gray-500 mb-1">
              재택 근무 전환 시 (재택 선택 시 필수 작성)
              {isRemote && <span className="ml-2 text-blue-600 font-bold">★ 필수</span>}
            </div>

            {/* 전환 사유 */}
            <div className="flex items-center gap-1">
              <span className={`${S.lbl} rounded-sm ${isRemote ? 'ring-1 ring-blue-400' : ''}`} style={{ minWidth: 80 }}>전환 사유</span>
              <input
                type="text"
                className={`${S.inp} border rounded-sm flex-1 ${isRemote ? 'border-blue-400 focus:ring-blue-500' : 'border-gray-300'}`}
                placeholder="재택 전환 사유를 입력하세요"
                value={wc.reason}
                onChange={e => setWC('reason', e.target.value)}
                disabled={readOnly}
              />
            </div>

            {/* 수행 업무 */}
            <div className="flex items-center gap-1">
              <span className={`${S.lbl} rounded-sm ${isRemote ? 'ring-1 ring-blue-400' : ''}`} style={{ minWidth: 80 }}>수행 업무</span>
              <input
                type="text"
                className={`${S.inp} border rounded-sm flex-1 ${isRemote ? 'border-blue-400 focus:ring-blue-500' : 'border-gray-300'}`}
                placeholder="재택 수행 업무를 입력하세요"
                value={wc.detail}
                onChange={e => setWC('detail', e.target.value)}
                disabled={readOnly}
              />
            </div>

            {/* 수행 시간 */}
            <div className="flex items-center gap-1">
              <span className={`${S.lbl} rounded-sm ${isRemote ? 'ring-1 ring-blue-400' : ''}`} style={{ minWidth: 80 }}>수행 시간</span>
              <input
                type="text"
                className={`${S.inp} border rounded-sm flex-1 ${isRemote ? 'border-blue-400 focus:ring-blue-500' : 'border-gray-300'}`}
                placeholder="예: 17:30 ~ 19:00 (1h 30m)"
                value={wc.time_log}
                onChange={e => setWC('time_log', e.target.value)}
                disabled={readOnly || true}   /* driven by Time Log above */
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
