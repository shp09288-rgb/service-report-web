'use client'

import type { InstallationContent, NoteImage } from '@/types/report'

const SITE_SURVEY_OPTIONS = ['VC-A', 'VC-B', 'VC-C', 'VC-D', 'VC-E', 'Other']
const NOISE_LEVEL_OPTIONS = ['< 60dB', '60~65dB', '65~70dB', '> 70dB']

interface Props {
  content: InstallationContent
  onChange: (content: InstallationContent) => void
  readOnly?: boolean
  cardSeeded?: boolean
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
        key:      crypto.randomUUID(),
        data_url,
        caption:  '',
        width:    htmlImg.naturalWidth,
        height:   htmlImg.naturalHeight,
      })
    }
    htmlImg.src = data_url
  }
  reader.readAsDataURL(file)
}

// ── Safe accessor for detail_report note_images ───────────────
function safeNoteImages(item: InstallationContent['detail_report'][0]): NoteImage[] {
  return Array.isArray(item.note_images) ? item.note_images : []
}

export function InstallationEditor({ content, onChange, readOnly = false, cardSeeded = false }: Props) {
  const metaRO = readOnly || cardSeeded

  function set<K extends keyof InstallationContent>(key: K, val: InstallationContent[K]) {
    onChange({ ...content, [key]: val })
  }

  function setChart(i: number, key: keyof InstallationContent['action_chart'][0], val: string | number) {
    const next = content.action_chart.map((r, idx) => idx === i ? { ...r, [key]: val } : r)
    set('action_chart', next)
  }
  function addChartRow()           { set('action_chart', [...content.action_chart, { item: '', committed: '', actual_pct: 0 }]) }
  function removeChartRow(i: number) { set('action_chart', content.action_chart.filter((_, idx) => idx !== i)) }

  // ── Detail Report helpers ─────────────────────────────────────
  function setDetail(i: number, key: 'title' | 'content', val: string) {
    const next = content.detail_report.map((r, idx) => idx === i ? { ...r, [key]: val } : r)
    set('detail_report', next)
  }
  function addDetail()           { set('detail_report', [...content.detail_report, { title: '', content: '', note_images: [] }]) }
  function removeDetail(i: number) { set('detail_report', content.detail_report.filter((_, idx) => idx !== i)) }

  // ── Note image helpers for detail items ───────────────────────
  function addDetailImage(detailIdx: number, img: NoteImage) {
    set('detail_report', content.detail_report.map((it, i) =>
      i === detailIdx
        ? { ...it, note_images: [...safeNoteImages(it), img] }
        : it
    ))
  }
  function updateDetailImage(detailIdx: number, imgIdx: number, patch: Partial<NoteImage>) {
    set('detail_report', content.detail_report.map((it, i) => {
      if (i !== detailIdx) return it
      return {
        ...it,
        note_images: safeNoteImages(it).map((img, j) => j === imgIdx ? { ...img, ...patch } : img),
      }
    }))
  }
  function removeDetailImage(detailIdx: number, imgIdx: number) {
    set('detail_report', content.detail_report.map((it, i) => {
      if (i !== detailIdx) return it
      return { ...it, note_images: safeNoteImages(it).filter((_, j) => j !== imgIdx) }
    }))
  }

  // ── Image paste handler ───────────────────────────────────────
  function handlePasteOnDetail(e: React.ClipboardEvent, detailIdx: number) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) readImageFile(file, img => addDetailImage(detailIdx, img))
        return
      }
    }
  }

  // ── File-picker fallback ──────────────────────────────────────
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>, detailIdx: number) {
    const file = e.target.files?.[0]
    if (file) readImageFile(file, img => addDetailImage(detailIdx, img))
    e.target.value = ''
  }

  // ── Style tokens ──────────────────────────────────────────────
  const inp = 'w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'
  const ta  = 'w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y disabled:bg-gray-50 disabled:text-gray-500'
  const lbl = 'bg-gray-100 border-r border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 flex items-center whitespace-nowrap shrink-0'
  const sec = 'bg-gray-600 text-white text-xs font-semibold px-3 py-1.5 tracking-wide uppercase'

  const numInput = (val: number, onChangeFn: (n: number) => void, min = 0, max?: number, cls = 'w-14') => (
    <input
      type="number" min={min} max={max} step={1}
      className={`border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${cls}`}
      value={val}
      onChange={e => onChangeFn(Math.max(min, max !== undefined ? Math.min(max, Number(e.target.value)) : Number(e.target.value)))}
      disabled={readOnly}
    />
  )

  const committed = Math.min(100, Math.max(0, content.committed_pct ?? 0))
  const actual    = Math.min(100, Math.max(0, content.actual_pct ?? 0))

  return (
    <div className="font-sans text-sm border border-gray-300">

      {/* ── Title bar ─────────────────────────────────────────── */}
      <div className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between">
        <span className="text-base font-bold tracking-wide">
          Park Systems — Installation Passdown Report
        </span>
        <div className="flex items-center gap-5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs whitespace-nowrap">Park FSE Name:</span>
            <input type="text"
              className="border border-gray-600 bg-gray-700 text-white px-2 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={content.fse_name}
              onChange={e => set('fse_name', e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">Date:</span>
            <input type="date"
              className="border border-gray-600 bg-gray-700 text-white px-2 py-0.5 text-xs w-34 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={content.report_date}
              onChange={e => set('report_date', e.target.value)}
              disabled={readOnly}
            />
          </div>
        </div>
      </div>

      {/* ── 3-column info section ─────────────────────────────── */}
      <div className="grid grid-cols-3 border-t border-gray-300">

        {/* Column headers */}
        <div className={sec}>System Information</div>
        <div className={`${sec} border-l border-gray-500`}>Installation Information</div>
        <div className={`${sec} border-l border-gray-500`}>Contact Info</div>

        {/* Row 1: Customer | Location | CRM Case ID */}
        <div className="flex border-t border-gray-300">
          <div className={lbl} style={{ minWidth: 90 }}>Customer</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.customer} onChange={e => set('customer', e.target.value)} disabled={metaRO} /></div>
        </div>
        <div className="flex border-t border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 100 }}>Location</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.location} onChange={e => set('location', e.target.value)} disabled={metaRO} /></div>
        </div>
        <div className="flex border-t border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 100 }}>CRM Case ID</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.crm_case_id} onChange={e => set('crm_case_id', e.target.value)} disabled={readOnly} /></div>
        </div>

        {/* Row 2: Model | Site Survey + Noise Level | Main User */}
        <div className="flex border-t border-gray-300">
          <div className={lbl} style={{ minWidth: 90 }}>Model</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.model} onChange={e => set('model', e.target.value)} disabled={metaRO} /></div>
        </div>
        <div className="flex border-t border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 80 }}>Site Survey</div>
          <div className="flex-1 p-1">
            <select className={inp} value={content.site_survey} onChange={e => set('site_survey', e.target.value)} disabled={readOnly}>
              <option value="">—</option>
              {SITE_SURVEY_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className={`${lbl} border-l`} style={{ minWidth: 80 }}>Noise Level</div>
          <div className="flex-1 p-1">
            <select className={inp} value={content.noise_level} onChange={e => set('noise_level', e.target.value)} disabled={readOnly}>
              <option value="">—</option>
              {NOISE_LEVEL_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="flex border-t border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 100 }}>Main User</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.main_user} onChange={e => set('main_user', e.target.value)} disabled={readOnly} /></div>
        </div>

        {/* Row 3: SID | Start Date | Tel # */}
        <div className="flex border-t border-gray-300">
          <div className={lbl} style={{ minWidth: 90 }}>SID</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.sid} onChange={e => set('sid', e.target.value)} disabled={metaRO} /></div>
        </div>
        <div className="flex border-t border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 100 }}>Start Date</div>
          <div className="flex-1 p-1"><input type="date" className={inp} value={content.start_date} onChange={e => set('start_date', e.target.value)} disabled={readOnly} /></div>
        </div>
        <div className="flex border-t border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 100 }}>Main User Tel #</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.tel} onChange={e => set('tel', e.target.value)} disabled={readOnly} /></div>
        </div>

        {/* Row 4: EQ ID | Est. Complete Date | E-mail */}
        <div className="flex border-t border-gray-300">
          <div className={lbl} style={{ minWidth: 90 }}>EQ ID</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.eq_id} onChange={e => set('eq_id', e.target.value)} disabled={metaRO} /></div>
        </div>
        <div className="flex border-t border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 100 }}>Est. Complete Date</div>
          <div className="flex-1 p-1"><input type="date" className={inp} value={content.est_complete_date} onChange={e => set('est_complete_date', e.target.value)} disabled={readOnly} /></div>
        </div>
        <div className="flex border-t border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 100 }}>Main User E-mail</div>
          <div className="flex-1 p-1"><input type="email" className={inp} value={content.email} onChange={e => set('email', e.target.value)} disabled={readOnly} /></div>
        </div>

        {/* Row 5: Service Type | Start Time | End Time */}
        <div className="flex border-t border-b border-gray-300">
          <div className={lbl} style={{ minWidth: 90 }}>Service Type</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.service_type ?? ''} onChange={e => set('service_type', e.target.value)} disabled={readOnly} /></div>
        </div>
        <div className="flex border-t border-b border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 100 }}>Start Time</div>
          <div className="flex-1 p-1"><input type="time" className={inp} value={content.start_time ?? ''} onChange={e => set('start_time', e.target.value)} disabled={readOnly} /></div>
        </div>
        <div className="flex border-t border-b border-l border-gray-300">
          <div className={lbl} style={{ minWidth: 100 }}>End Time</div>
          <div className="flex-1 p-1"><input type="text" className={inp} value={content.end_time ?? ''} onChange={e => set('end_time', e.target.value)} disabled={readOnly} /></div>
        </div>
      </div>

      {/* ── Total Cycle Time (left) + Action Chart (right) ────── */}
      <div className="grid grid-cols-2 border-t border-gray-300">

        {/* LEFT: Total Cycle Time */}
        <div className="border-r border-gray-300">
          <div className={sec}>Total Cycle Time</div>

          {/* Committed Progress */}
          <div className="border-b border-gray-200 px-3 py-2 space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-36 shrink-0">Committed Progress</span>
              <div className="flex-1 h-3 bg-gray-200 rounded overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${committed}%` }} />
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">{committed}%</span>
            </div>
            <div className="flex items-center gap-2 pl-36">
              {numInput(content.committed_pct ?? 0, n => set('committed_pct', n), 0, 100)}
              <span className="text-xs text-gray-500">%</span>
              <span className="text-xs text-gray-400 mx-1">|</span>
              <span className="text-xs text-gray-500">Total:</span>
              {numInput(content.total_days ?? 0, n => set('total_days', n), 0, undefined, 'w-16')}
              <span className="text-xs text-gray-500">Days</span>
            </div>
          </div>

          {/* Actual Progress */}
          <div className="px-3 py-2 space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-36 shrink-0">Actual Progress</span>
              <div className="flex-1 h-3 bg-gray-200 rounded overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${actual}%` }} />
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">{actual}%</span>
            </div>
            <div className="flex items-center gap-2 pl-36">
              {numInput(content.actual_pct ?? 0, n => set('actual_pct', n), 0, 100)}
              <span className="text-xs text-gray-500">%</span>
              <span className="text-xs text-gray-400 mx-1">|</span>
              <span className="text-xs text-gray-500">Progress:</span>
              {numInput(content.progress_days ?? 0, n => set('progress_days', n), 0, undefined, 'w-16')}
              <span className="text-xs text-gray-500">Days</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Individual Action Chart */}
        <div>
          <div className={sec}>Individual Action Chart</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="text-left px-2 py-1.5 font-medium text-gray-700">Item</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-700 w-24">Committed</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-700 w-20">Actual %</th>
                {!readOnly && <th className="w-6" />}
              </tr>
            </thead>
            <tbody>
              {content.action_chart.map((row, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="px-1 py-0.5">
                    <input type="text" className={inp} value={row.item} onChange={e => setChart(i, 'item', e.target.value)} disabled={readOnly} />
                  </td>
                  <td className="px-1 py-0.5">
                    <input type="text" className={inp} value={row.committed} onChange={e => setChart(i, 'committed', e.target.value)} disabled={readOnly} />
                  </td>
                  <td className="px-1 py-0.5">
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} max={100} className={`${inp} w-12`} value={row.actual_pct}
                        onChange={e => setChart(i, 'actual_pct', Number(e.target.value))} disabled={readOnly} />
                      <span className="text-gray-400">%</span>
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="px-1 py-0.5 text-center">
                      <button onClick={() => removeChartRow(i)} className="text-red-400 hover:text-red-600">✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="px-3 py-2">
              <button onClick={addChartRow} className="text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-2 py-1">
                + Add Row
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Critical Item Summary ──────────────────────────────── */}
      <div className="border-t border-gray-300">
        <div className={sec}>Critical Item Summary</div>
        <div className="p-2">
          <textarea rows={6} className={ta}
            placeholder="1. &#13;&#10;2. &#13;&#10;3. "
            value={content.critical_item_summary}
            onChange={e => set('critical_item_summary', e.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      {/* ── Detail Report (left) + Next Plan (right) ──────────── */}
      <div className="grid grid-cols-[1fr_300px] border-t border-gray-300">
        <div className="border-r border-gray-300">
          <div className={`${sec} text-center`}>Detail Report</div>
          <div className="p-2 space-y-2">
            {content.detail_report.map((item, i) => (
              <div key={i} className="border border-gray-200 rounded p-2 space-y-1">
                {/* Title row */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 shrink-0">{i + 1}.</span>
                  <input type="text" className={`${inp} flex-1`} placeholder="Title"
                    value={item.title} onChange={e => setDetail(i, 'title', e.target.value)} disabled={readOnly} />
                  {!readOnly && (
                    <button onClick={() => removeDetail(i)} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
                  )}
                </div>

                {/* Content textarea — paste handler intercepts image paste */}
                <textarea rows={4} className={ta} placeholder="Detail content (Ctrl+V to paste screenshot)"
                  value={item.content}
                  onChange={e => setDetail(i, 'content', e.target.value)}
                  onPaste={readOnly ? undefined : e => handlePasteOnDetail(e, i)}
                  disabled={readOnly}
                />

                {/* Inline images */}
                {safeNoteImages(item).map((img, j) => (
                  <div key={img.key} className="mt-1 pt-1 border-t border-gray-100">
                    <div className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.data_url}
                        alt={img.caption || `Screenshot ${j + 1}`}
                        style={{ maxWidth: 320, maxHeight: 240, display: 'block', objectFit: 'contain' }}
                      />
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeDetailImage(i, j)}
                          title="Remove image"
                          className="absolute top-0 right-0 bg-white border border-gray-300 text-gray-400 hover:text-red-500 text-[9px] leading-none px-[3px] py-[1px]"
                        >✕</button>
                      )}
                    </div>
                    {readOnly ? (
                      img.caption ? <div className="text-[10px] text-gray-500 italic mt-[2px]">{img.caption}</div> : null
                    ) : (
                      <input
                        type="text"
                        className="mt-[2px] block border-0 border-b border-gray-200 px-0 py-[1px] text-[10px] text-gray-500 italic bg-transparent focus:outline-none focus:border-blue-400 w-full"
                        style={{ maxWidth: 320 }}
                        placeholder="Add caption…"
                        value={img.caption}
                        onChange={e => updateDetailImage(i, j, { caption: e.target.value })}
                      />
                    )}
                  </div>
                ))}

                {/* File picker hint — only when editing */}
                {!readOnly && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 select-none">Ctrl+V to paste screenshot</span>
                    <label className="text-[10px] text-gray-500 hover:text-blue-600 cursor-pointer border border-gray-300 px-1.5 py-[1px] rounded-sm select-none">
                      Insert image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => handleFilePick(e, i)}
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
            {!readOnly && (
              <button onClick={addDetail} className="text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-2 py-1">
                + Add Item
              </button>
            )}
          </div>
        </div>
        <div>
          <div className={sec}>Next Plan Update</div>
          <div className="p-2">
            <textarea rows={16} className={`${ta} min-h-48`}
              placeholder="Next plan..."
              value={content.next_plan}
              onChange={e => set('next_plan', e.target.value)}
              disabled={readOnly}
            />
          </div>
        </div>
      </div>

      {/* ── Data Location ─────────────────────────────────────── */}
      <div className="flex border-t border-gray-300">
        <div className={`${lbl} border-r`}>Data Location:</div>
        <div className="flex-1 p-1">
          <input type="text" className={inp} value={content.data_location}
            onChange={e => set('data_location', e.target.value)} disabled={readOnly} />
        </div>
      </div>

    </div>
  )
}
