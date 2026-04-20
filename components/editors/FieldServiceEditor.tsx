'use client'

import Image from 'next/image'
import { useEffect } from 'react'
import type { FieldServiceContent, CriticalItem, NoteImage } from '@/types/report'
import { normalizeFieldServiceContent } from '@/lib/content-defaults'

// ── Option lists ─────────────────────────────────────────────
const SITE_SURVEY_OPTIONS   = ['VC-C', 'VC-D', 'VC-E', 'Other']
const NOISE_LEVEL_OPTIONS   = ['< 60dB', '60~65dB', '65~70dB', '> 70dB']
const SERVICE_TYPE_OPTIONS  = ['Warranty', 'Service Contract', 'Billable', 'Non-Billable']
const TOOL_STATUS_OPTIONS   = ['Tool Up', 'Tool is scheduled down', 'Tool Down', 'Partial Tool Down']
const WORK_COMPLETION_TYPES = ['사무실 복귀', '재택근무 전환', '추가 업무 수행', '업무 종료']

// ── Safe array accessors ──────────────────────────────────────
function safeItems(content: FieldServiceContent): CriticalItem[] {
  return Array.isArray(content.critical_items) ? content.critical_items : []
}
function safeNoteImages(item: CriticalItem): NoteImage[] {
  return Array.isArray(item.note_images) ? item.note_images : []
}

// ── Read a clipboard/file image → NoteImage ──────────────────
function readImageFile(
  file: File,
  onDone: (img: NoteImage) => void,
) {
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

// ── Style constants ───────────────────────────────────────────
const S = {
  lc: 'bg-[#e5e7eb] text-[#111827] text-[11px] font-semibold px-2 py-[3px] border border-[#6b7280] whitespace-nowrap align-middle',
  vc: 'bg-white border border-[#6b7280] px-1 py-[2px] align-middle',
  sh: 'bg-[#2f5597] text-white text-[11px] font-bold px-2 py-[3px] border border-[#6b7280] tracking-wide',
  inp: 'w-full bg-white text-[#111827] text-[11px] py-[1px] px-0.5 focus:outline-none focus:ring-1 focus:ring-[#2f5597] disabled:bg-[#f3f4f6] disabled:text-[#6b7280] leading-snug',
  ta:  'w-full bg-white text-[#111827] text-[11px] px-0.5 focus:outline-none focus:ring-1 focus:ring-[#2f5597] disabled:bg-[#f3f4f6] disabled:text-[#6b7280] resize-y leading-snug',
} as const

// ── Props ─────────────────────────────────────────────────────
interface Props {
  content: FieldServiceContent
  onChange: (content: FieldServiceContent) => void
  readOnly?: boolean
  cardSeeded?: boolean
}

export function FieldServiceEditor({ content, onChange, readOnly = false, cardSeeded = false }: Props) {
  const metaRO = readOnly || cardSeeded

  // Secondary guard — DocumentEditorClient normalizes at load time, but
  // catch anything that slips through (e.g. test harness, direct prop).
  useEffect(() => {
    const n = normalizeFieldServiceContent(content)
    if (JSON.stringify(n.critical_items) !== JSON.stringify(content.critical_items)) {
      onChange(n)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Scalar field setters ──────────────────────────────────────
  function set<K extends keyof FieldServiceContent>(key: K, value: FieldServiceContent[K]) {
    onChange({ ...content, [key]: value })
  }
  function setWC(key: keyof FieldServiceContent['work_completion'], value: string) {
    onChange({ ...content, work_completion: { ...content.work_completion, [key]: value } })
  }

  // ── Critical item helpers ─────────────────────────────────────
  function updateItem(i: number, patch: Partial<CriticalItem>) {
    set('critical_items', safeItems(content).map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }
  function addItem() {
    set('critical_items', [...safeItems(content), { title: '', note: '', progress_pct: 0, note_images: [] }])
  }
  function removeItem(i: number) {
    set('critical_items', safeItems(content).filter((_, idx) => idx !== i))
  }

  // ── Note image helpers ────────────────────────────────────────
  function addNoteImage(itemIdx: number, img: NoteImage) {
    set('critical_items', safeItems(content).map((it, i) =>
      i === itemIdx
        ? { ...it, note_images: [...safeNoteImages(it), img] }
        : it
    ))
  }
  function updateNoteImage(itemIdx: number, imgIdx: number, patch: Partial<NoteImage>) {
    set('critical_items', safeItems(content).map((it, i) => {
      if (i !== itemIdx) return it
      return {
        ...it,
        note_images: safeNoteImages(it).map((img, j) => j === imgIdx ? { ...img, ...patch } : img),
      }
    }))
  }
  function removeNoteImage(itemIdx: number, imgIdx: number) {
    set('critical_items', safeItems(content).map((it, i) => {
      if (i !== itemIdx) return it
      return { ...it, note_images: safeNoteImages(it).filter((_, j) => j !== imgIdx) }
    }))
  }

  // ── Image paste handler (attached to textarea + paste zone) ──
  function handlePasteOnNote(e: React.ClipboardEvent, itemIdx: number) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault() // don't paste garbled text
        const file = item.getAsFile()
        if (file) readImageFile(file, img => addNoteImage(itemIdx, img))
        return
      }
    }
    // No image — let normal text paste proceed
  }

  // ── File-picker fallback ──────────────────────────────────────
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>, itemIdx: number) {
    const file = e.target.files?.[0]
    if (file) readImageFile(file, img => addNoteImage(itemIdx, img))
    e.target.value = '' // reset so same file can be picked again
  }

  // Column count: 4 data cols + 1 Del col when editing
  const CI_COLS = readOnly ? 4 : 5

  return (
    <div className="bg-white border border-[#9ca3af] shadow overflow-x-auto">

      {/* ══════════════════════════════════════════════════════════
          TITLE BAND
      ══════════════════════════════════════════════════════════ */}
      <div className="flex items-stretch" style={{ background: '#1f2937' }}>
        <div className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0">
          <Image
            src="/park-logo.png"
            alt="Park Systems"
            width={95}
            height={73}
            style={{ height: 36, width: 'auto', objectFit: 'contain' }}
            priority
          />
          <div className="leading-tight">
            <div className="text-white font-bold text-[13px]">Park Systems Field Service Passdown Report</div>
            <div className="text-[#9ca3af] text-[10px]">Service Report Tool</div>
          </div>
        </div>
        <table className="border-collapse shrink-0 self-stretch">
          <tbody>
            <tr>
              <td className="bg-[#374151] text-[#d1d5db] text-[11px] font-semibold px-2 py-[3px] border border-[#4b5563] whitespace-nowrap align-middle">Report Date</td>
              <td className="bg-white px-1 py-[2px] border border-[#4b5563] align-middle" style={{ minWidth: 130 }}>
                <input type="date" className={S.inp} value={content.report_date}
                  onChange={e => set('report_date', e.target.value)} disabled={readOnly} />
              </td>
            </tr>
            <tr>
              <td className="bg-[#374151] text-[#d1d5db] text-[11px] font-semibold px-2 py-[3px] border border-[#4b5563] whitespace-nowrap align-middle">FSE Name</td>
              <td className="bg-white px-1 py-[2px] border border-[#4b5563] align-middle">
                <input type="text" className={S.inp} value={content.fse_name}
                  onChange={e => set('fse_name', e.target.value)} disabled={readOnly} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════════
          STATUS STRIP
      ══════════════════════════════════════════════════════════ */}
      <table className="w-full border-collapse text-[11px]">
        <tbody>
          <tr>
            <td className={S.lc} style={{ width: 140 }}>Current Tool Status</td>
            <td className={S.vc}>
              <select className={S.inp} value={content.tool_status}
                onChange={e => set('tool_status', e.target.value)} disabled={readOnly}>
                <option value="">— select —</option>
                {TOOL_STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </td>
            <td className={S.lc} style={{ width: 100 }}>Service Type</td>
            <td className={S.vc}>
              <select className={S.inp} value={content.service_type}
                onChange={e => set('service_type', e.target.value)} disabled={readOnly}>
                <option value="">— select —</option>
                {SERVICE_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </td>
            <td className={S.lc} style={{ width: 90 }}>CRM Case ID</td>
            <td className={S.vc} style={{ width: 160 }}>
              <input type="text" className={S.inp} value={content.crm_case_id}
                onChange={e => set('crm_case_id', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* ══════════════════════════════════════════════════════════
          3-COLUMN INFORMATION (single table, 6 cols)
      ══════════════════════════════════════════════════════════ */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <td colSpan={2} className={S.sh}>System Information</td>
            <td colSpan={2} className={S.sh}>Service Information</td>
            <td colSpan={2} className={S.sh}>Contact Information</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={S.lc} style={{ width: '10%' }}>Customer</td>
            <td className={S.vc} style={{ width: '23%' }}>
              <input type="text" className={S.inp} value={content.customer}
                onChange={e => set('customer', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lc} style={{ width: '9%' }}>Location</td>
            <td className={S.vc} style={{ width: '24%' }}>
              <input type="text" className={S.inp} value={content.location}
                onChange={e => set('location', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lc} style={{ width: '9%' }}>CRM Contact</td>
            <td className={S.vc} style={{ width: '25%' }}>
              <input type="text" className={S.inp} value={content.main_user}
                onChange={e => set('main_user', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          <tr>
            <td className={S.lc}>Model</td>
            <td className={S.vc}>
              <input type="text" className={S.inp} value={content.model}
                onChange={e => set('model', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lc}>Site Survey</td>
            <td className={S.vc}>
              <select className={S.inp} value={content.site_survey}
                onChange={e => set('site_survey', e.target.value)} disabled={readOnly}>
                <option value="">— select —</option>
                {SITE_SURVEY_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </td>
            <td className={S.lc}>Tel #</td>
            <td className={S.vc}>
              <input type="text" className={S.inp} value={content.tel}
                onChange={e => set('tel', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          <tr>
            <td className={S.lc}>SID</td>
            <td className={S.vc}>
              <input type="text" className={S.inp} value={content.sid}
                onChange={e => set('sid', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lc}>Start Date</td>
            <td className={S.vc}>
              <input type="date" className={S.inp} value={content.start_date}
                onChange={e => set('start_date', e.target.value)} disabled={readOnly} />
            </td>
            <td className={S.lc}>Email</td>
            <td className={S.vc}>
              <input type="email" className={S.inp} value={content.email}
                onChange={e => set('email', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          <tr>
            <td className={S.lc}>EQ ID</td>
            <td className={S.vc}>
              <input type="text" className={S.inp} value={content.eq_id}
                onChange={e => set('eq_id', e.target.value)} disabled={metaRO} />
            </td>
            <td className={S.lc}>Start Time</td>
            <td className={S.vc}>
              <input type="time" className={S.inp} value={content.start_time}
                onChange={e => set('start_time', e.target.value)} disabled={readOnly} />
            </td>
            <td className={S.lc}>Noise Level</td>
            <td className={S.vc}>
              <select className={S.inp} value={content.noise_level}
                onChange={e => set('noise_level', e.target.value)} disabled={readOnly}>
                <option value="">— select —</option>
                {NOISE_LEVEL_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <td className={S.lc}>Service Type</td>
            <td className={S.vc}>
              <select className={S.inp} value={content.service_type}
                onChange={e => set('service_type', e.target.value)} disabled={readOnly}>
                <option value="">— select —</option>
                {SERVICE_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </td>
            <td className={S.lc}>End Date</td>
            <td className={S.vc}>
              <input type="date" className={S.inp} value={content.end_date}
                onChange={e => set('end_date', e.target.value)} disabled={readOnly} />
            </td>
            <td className={S.lc}>End Time Note</td>
            <td className={S.vc}>
              <input type="text" className={S.inp} value={content.end_time_note}
                onChange={e => set('end_time_note', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          <tr>
            <td className="bg-[#f9fafb] border border-[#6b7280]" />
            <td className="bg-[#f9fafb] border border-[#6b7280]" />
            <td className={S.lc}>End Time</td>
            <td className={S.vc}>
              <input type="time" className={S.inp} value={content.end_time}
                onChange={e => set('end_time', e.target.value)} disabled={readOnly} />
            </td>
            <td className="bg-[#f9fafb] border border-[#6b7280]" />
            <td className="bg-[#f9fafb] border border-[#6b7280]" />
          </tr>
        </tbody>
      </table>

      {/* ══════════════════════════════════════════════════════════
          PROBLEM / TARGET
      ══════════════════════════════════════════════════════════ */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <td className={S.sh} style={{ width: '50%' }}>Current Problem Statement</td>
            <td className={S.sh} style={{ width: '50%' }}>Current Target Statement</td>
          </tr>
        </thead>
        <tbody>
          <tr className="align-top">
            <td className="bg-white border border-[#6b7280] p-1">
              <textarea rows={5} className={`${S.ta} min-h-[80px]`}
                value={content.problem_statement}
                onChange={e => set('problem_statement', e.target.value)} disabled={readOnly} />
            </td>
            <td className="bg-white border border-[#6b7280] p-1">
              <textarea rows={5} className={`${S.ta} min-h-[80px]`}
                value={content.target_statement}
                onChange={e => set('target_statement', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* ══════════════════════════════════════════════════════════
          CRITICAL ITEMS
          Columns: No | Title | Note (with inline images) | Progress | [Del]
      ══════════════════════════════════════════════════════════ */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <td colSpan={CI_COLS} className={S.sh}>Critical Items</td>
          </tr>
          <tr>
            <td className={`${S.lc} text-center`} style={{ width: 28 }}>No.</td>
            <td className={S.lc} style={{ width: 160 }}>Title</td>
            <td className={S.lc}>Note / Images</td>
            <td className={`${S.lc} text-center`} style={{ width: 88 }}>Progress</td>
            {!readOnly && <td className={S.lc} style={{ width: 32 }} />}
          </tr>
        </thead>
        <tbody>
          {safeItems(content).map((item, i) => (
            <tr key={i} className="align-top">

              {/* No. */}
              <td className="border border-[#6b7280] bg-[#f3f4f6] text-center font-semibold px-1 py-1 text-[11px] align-middle">
                {i + 1}
              </td>

              {/* Title */}
              <td className="border border-[#6b7280] bg-white px-1 py-[2px] align-top">
                <input type="text" className={S.inp}
                  placeholder="Title"
                  value={item.title}
                  onChange={e => updateItem(i, { title: e.target.value })}
                  disabled={readOnly} />
              </td>

              {/* Note + inline images */}
              <td className="border border-[#6b7280] bg-white px-1 py-[2px] align-top">

                {/* Note textarea — paste handler intercepts image paste */}
                <textarea
                  rows={4}
                  className={S.ta}
                  placeholder="Note text…"
                  value={item.note}
                  onChange={e => updateItem(i, { note: e.target.value })}
                  onPaste={e => handlePasteOnNote(e, i)}
                  disabled={readOnly}
                />

                {/* Inline image figures — ordered below note text */}
                {safeNoteImages(item).map((img, j) => (
                  <div key={img.key} className="mt-1 pt-1 border-t border-[#e5e7eb]">
                    <div className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.data_url}
                        alt={img.caption || `Screenshot ${j + 1}`}
                        style={{ maxWidth: 280, maxHeight: 200, display: 'block', objectFit: 'contain' }}
                      />
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeNoteImage(i, j)}
                          title="Remove image"
                          className="absolute top-0 right-0 bg-white border border-[#d1d5db] text-[#9ca3af] hover:text-[#ef4444] text-[9px] leading-none px-[3px] py-[1px]"
                        >✕</button>
                      )}
                    </div>
                    {readOnly ? (
                      img.caption
                        ? <div className="text-[10px] text-[#6b7280] italic mt-[2px]">{img.caption}</div>
                        : null
                    ) : (
                      <input
                        type="text"
                        className="mt-[2px] block border-0 border-b border-[#e5e7eb] px-0 py-[1px] text-[10px] text-[#6b7280] italic bg-transparent focus:outline-none focus:border-[#2f5597] w-full"
                        style={{ maxWidth: 280 }}
                        placeholder="Add caption…"
                        value={img.caption}
                        onChange={e => updateNoteImage(i, j, { caption: e.target.value })}
                      />
                    )}
                  </div>
                ))}

                {/* Hint + file-picker fallback — only when editing */}
                {!readOnly && (
                  <div className="mt-[4px] flex items-center gap-2">
                    <span className="text-[10px] text-[#b0b7c3] select-none">Ctrl+V to paste screenshot</span>
                    <label className="text-[10px] text-[#6b7280] hover:text-[#2f5597] cursor-pointer border border-[#d1d5db] px-1.5 py-[1px] rounded-sm select-none">
                      Insert image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { handleFilePick(e, i) }}
                      />
                    </label>
                  </div>
                )}
              </td>

              {/* Progress */}
              <td className="border border-[#6b7280] bg-white px-1 py-1 text-center align-top">
                <input type="range" min={0} max={100} step={5}
                  className="w-full accent-[#2f5597]"
                  value={item.progress_pct}
                  onChange={e => updateItem(i, { progress_pct: Number(e.target.value) })}
                  disabled={readOnly} />
                <div className="text-[#2f5597] font-semibold text-[11px]">{item.progress_pct}%</div>
              </td>

              {/* Del */}
              {!readOnly && (
                <td className="border border-[#6b7280] bg-[#fff8f8] text-center align-middle px-[2px]">
                  <button type="button" onClick={() => removeItem(i)}
                    className="text-[#ef4444] hover:text-[#b91c1c] text-[10px] font-medium">
                    Del
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {!readOnly && (
          <tfoot>
            <tr>
              <td colSpan={CI_COLS} className="border border-[#6b7280] bg-[#f9fafb] px-2 py-[3px]">
                <button type="button" onClick={addItem}
                  className="text-[11px] text-[#2f5597] hover:underline font-semibold">
                  + Add Critical Item
                </button>
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {/* ══════════════════════════════════════════════════════════
          DATA LOCATION
      ══════════════════════════════════════════════════════════ */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr><td colSpan={2} className={S.sh}>Data Location</td></tr>
        </thead>
        <tbody>
          <tr className="align-top">
            <td className={`${S.lc} align-top pt-1`} style={{ width: 110 }}>File Path / URL</td>
            <td className="bg-white border border-[#6b7280] p-1">
              <textarea rows={2} className={S.ta}
                placeholder="e.g. C:/ParkSystems/Reports/2026/04/&#10;https://onedrive.live.com/…"
                value={content.data_location}
                onChange={e => set('data_location', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* ══════════════════════════════════════════════════════════
          WORK COMPLETION
      ══════════════════════════════════════════════════════════ */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr><td colSpan={4} className={S.sh}>Work Completion</td></tr>
        </thead>
        <tbody>
          <tr>
            <td className={S.lc} style={{ width: 90 }}>Type</td>
            <td className={S.vc} style={{ width: 190 }}>
              <select className={S.inp} value={content.work_completion.type}
                onChange={e => setWC('type', e.target.value)} disabled={readOnly}>
                <option value="">— select —</option>
                {WORK_COMPLETION_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </td>
            <td className={S.lc} style={{ width: 70 }}>Time Log</td>
            <td className={S.vc}>
              <input type="text" className={S.inp} placeholder="09:00 ~ 19:00"
                value={content.work_completion.time_log}
                onChange={e => setWC('time_log', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          <tr>
            <td className={S.lc}>Reason</td>
            <td colSpan={3} className={S.vc}>
              <input type="text" className={S.inp} placeholder="선택 사유"
                value={content.work_completion.reason}
                onChange={e => setWC('reason', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
          <tr className="align-top">
            <td className={`${S.lc} align-top pt-1`}>Detail</td>
            <td colSpan={3} className="bg-white border border-[#6b7280] p-1">
              <textarea rows={3} className={S.ta} placeholder="상세 설명"
                value={content.work_completion.detail}
                onChange={e => setWC('detail', e.target.value)} disabled={readOnly} />
            </td>
          </tr>
        </tbody>
      </table>

    </div>
  )
}

