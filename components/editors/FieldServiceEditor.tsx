'use client'

import { FieldServiceContent } from '@/types/report'

const SITE_SURVEY_OPTIONS = ['VC-C', 'VC-D', 'VC-E', 'Other']
const NOISE_LEVEL_OPTIONS = ['< 60dB', '60~65dB', '65~70dB', '> 70dB']
const SERVICE_TYPE_OPTIONS = ['Warranty', 'Service Contract', 'Billable', 'Non-Billable']
const TOOL_STATUS_OPTIONS = [
  'Tool Up',
  'Tool is scheduled down',
  'Tool Down',
  'Partial Tool Down',
]
const WORK_COMPLETION_TYPES = [
  '사무실 복귀',
  '재택근무 전환',
  '추가 업무 수행',
  '업무 종료',
]

interface Props {
  content: FieldServiceContent
  onChange: (content: FieldServiceContent) => void
  readOnly?: boolean
  cardSeeded?: boolean
}

export function FieldServiceEditor({ content, onChange, readOnly = false, cardSeeded = false }: Props) {
  // Fields that are locked when the document was created from card master data.
  // Only honour the explicit flag — never infer from field values.
  const metaReadOnly = readOnly || cardSeeded
  function set<K extends keyof FieldServiceContent>(key: K, value: FieldServiceContent[K]) {
    onChange({ ...content, [key]: value })
  }

  function setWC(key: keyof FieldServiceContent['work_completion'], value: string) {
    onChange({ ...content, work_completion: { ...content.work_completion, [key]: value } })
  }

  function setCriticalItem(index: number, text: string) {
    const items = content.critical_items.map((item, i) =>
      i === index ? { ...item, text } : item
    )
    set('critical_items', items)
  }

  function setSubItem(itemIndex: number, subIndex: number, value: string) {
    const items = content.critical_items.map((item, i) => {
      if (i !== itemIndex) return item
      const sub_items = item.sub_items.map((s, j) => (j === subIndex ? value : s))
      return { ...item, sub_items }
    })
    set('critical_items', items)
  }

  function addCriticalItem() {
    set('critical_items', [...content.critical_items, { text: '', sub_items: [''] }])
  }

  function removeCriticalItem(index: number) {
    set('critical_items', content.critical_items.filter((_, i) => i !== index))
  }

  function addSubItem(itemIndex: number) {
    const items = content.critical_items.map((item, i) =>
      i === itemIndex ? { ...item, sub_items: [...item.sub_items, ''] } : item
    )
    set('critical_items', items)
  }

  function removeSubItem(itemIndex: number, subIndex: number) {
    const items = content.critical_items.map((item, i) => {
      if (i !== itemIndex) return item
      return { ...item, sub_items: item.sub_items.filter((_, j) => j !== subIndex) }
    })
    set('critical_items', items)
  }

  const input =
    'w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'
  const textarea =
    'w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y disabled:bg-gray-50 disabled:text-gray-500'
  const label = 'bg-gray-100 border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 flex items-center'
  const sectionHeader = 'col-span-full bg-gray-700 text-white text-xs font-semibold px-3 py-1.5 tracking-wide uppercase'

  return (
    <div className="font-sans text-sm">
      {/* Title */}
      <div className="bg-gray-800 text-white text-center py-3 text-base font-bold tracking-wide mb-0">
        Park Systems — Field Service Passdown Report
      </div>

      <div className="grid grid-cols-[160px_1fr_160px_1fr] border-l border-t border-gray-300">

        {/* ── PERSONNEL ── */}
        <div className={sectionHeader}>Personnel</div>

        <div className={label}>Report Date</div>
        <div className="border border-gray-300 p-1">
          <input type="date" className={input} value={content.report_date}
            onChange={e => set('report_date', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>FSE Name</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.fse_name}
            onChange={e => set('fse_name', e.target.value)} disabled={readOnly} />
        </div>

        {/* ── SYSTEM INFORMATION ── */}
        <div className={sectionHeader}>System Information</div>

        <div className={label}>Customer</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.customer}
            onChange={e => set('customer', e.target.value)} disabled={metaReadOnly} />
        </div>
        <div className={label}>Location</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.location}
            onChange={e => set('location', e.target.value)} disabled={metaReadOnly} />
        </div>

        <div className={label}>CRM Case ID</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.crm_case_id}
            onChange={e => set('crm_case_id', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>Model</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.model}
            onChange={e => set('model', e.target.value)} disabled={metaReadOnly} />
        </div>

        <div className={label}>Site Survey</div>
        <div className="border border-gray-300 p-1">
          <select className={input} value={content.site_survey}
            onChange={e => set('site_survey', e.target.value)} disabled={readOnly}>
            <option value="">— select —</option>
            {SITE_SURVEY_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className={label}>Noise Level</div>
        <div className="border border-gray-300 p-1">
          <select className={input} value={content.noise_level}
            onChange={e => set('noise_level', e.target.value)} disabled={readOnly}>
            <option value="">— select —</option>
            {NOISE_LEVEL_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {/* ── SERVICE INFORMATION ── */}
        <div className={sectionHeader}>Service Information</div>

        <div className={label}>Main User</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.main_user}
            onChange={e => set('main_user', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>SID</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.sid}
            onChange={e => set('sid', e.target.value)} disabled={metaReadOnly} />
        </div>

        <div className={label}>Tel #</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.tel}
            onChange={e => set('tel', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>EQ ID</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.eq_id}
            onChange={e => set('eq_id', e.target.value)} disabled={metaReadOnly} />
        </div>

        <div className={label}>Email</div>
        <div className="col-span-3 border border-gray-300 p-1">
          <input type="email" className={input} value={content.email}
            onChange={e => set('email', e.target.value)} disabled={readOnly} />
        </div>

        <div className={label}>Service Type</div>
        <div className="border border-gray-300 p-1">
          <select className={input} value={content.service_type}
            onChange={e => set('service_type', e.target.value)} disabled={readOnly}>
            <option value="">— select —</option>
            {SERVICE_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className={label}>Tool Status</div>
        <div className="border border-gray-300 p-1">
          <select className={input} value={content.tool_status}
            onChange={e => set('tool_status', e.target.value)} disabled={readOnly}>
            <option value="">— select —</option>
            {TOOL_STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className={label}>Start Date</div>
        <div className="border border-gray-300 p-1">
          <input type="date" className={input} value={content.start_date}
            onChange={e => set('start_date', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>Start Time</div>
        <div className="border border-gray-300 p-1">
          <input type="time" className={input} value={content.start_time}
            onChange={e => set('start_time', e.target.value)} disabled={readOnly} />
        </div>

        <div className={label}>End Date</div>
        <div className="border border-gray-300 p-1">
          <input type="date" className={input} value={content.end_date}
            onChange={e => set('end_date', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>End Time</div>
        <div className="border border-gray-300 p-1">
          <input type="time" className={input} value={content.end_time}
            onChange={e => set('end_time', e.target.value)} disabled={readOnly} />
          <p className="text-xs text-gray-400 mt-0.5 pl-0.5">{content.end_time_note}</p>
        </div>

        {/* ── PROBLEM & TARGET ── */}
        <div className={sectionHeader}>Problem & Target Statements</div>

        <div className={`${label} items-start pt-2`}>Current Problem Statement</div>
        <div className="col-span-3 border border-gray-300 p-1">
          <textarea rows={3} className={textarea} value={content.problem_statement}
            onChange={e => set('problem_statement', e.target.value)} disabled={readOnly} />
        </div>

        <div className={`${label} items-start pt-2`}>Current Target Statement</div>
        <div className="col-span-3 border border-gray-300 p-1">
          <textarea rows={3} className={textarea} value={content.target_statement}
            onChange={e => set('target_statement', e.target.value)} disabled={readOnly} />
        </div>

        {/* ── DAILY FIELD SERVICE NOTE ── */}
        <div className={sectionHeader}>Daily Field Service Note</div>

        <div className={`${label} items-start pt-2`}>Note</div>
        <div className="col-span-3 border border-gray-300 p-1">
          <textarea rows={8} className={textarea} value={content.daily_note}
            onChange={e => set('daily_note', e.target.value)} disabled={readOnly} />
        </div>

        <div className={label}>Progress</div>
        <div className="col-span-3 border border-gray-300 p-1 flex items-center gap-3">
          <input type="range" min={0} max={100} step={5}
            className="flex-1 accent-blue-600"
            value={content.progress_pct}
            onChange={e => set('progress_pct', Number(e.target.value))}
            disabled={readOnly} />
          <span className="text-sm font-semibold w-10 text-right">{content.progress_pct}%</span>
        </div>

        {/* ── CRITICAL ITEMS ── */}
        <div className={sectionHeader}>Critical Items</div>

        <div className="col-span-full border border-gray-300 p-3 space-y-3">
          {content.critical_items.map((item, i) => (
            <div key={i} className="border border-gray-200 rounded p-2 space-y-1">
              <div className="flex gap-2 items-start">
                <span className="text-xs font-bold text-gray-500 w-5 pt-2 shrink-0">{i + 1}.</span>
                <input type="text" className={`${input} flex-1`} placeholder="Item description"
                  value={item.text}
                  onChange={e => setCriticalItem(i, e.target.value)}
                  disabled={readOnly} />
                {!readOnly && (
                  <button onClick={() => removeCriticalItem(i)}
                    className="text-red-400 hover:text-red-600 text-xs pt-2 shrink-0">✕</button>
                )}
              </div>
              <div className="ml-5 space-y-1">
                {item.sub_items.map((sub, j) => (
                  <div key={j} className="flex gap-2 items-center">
                    <span className="text-xs text-gray-400 shrink-0">–</span>
                    <input type="text" className={`${input} flex-1`} placeholder="Sub-item"
                      value={sub}
                      onChange={e => setSubItem(i, j, e.target.value)}
                      disabled={readOnly} />
                    {!readOnly && (
                      <button onClick={() => removeSubItem(i, j)}
                        className="text-red-300 hover:text-red-500 text-xs shrink-0">✕</button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <button onClick={() => addSubItem(i)}
                    className="text-xs text-blue-500 hover:text-blue-700 ml-4">+ sub-item</button>
                )}
              </div>
            </div>
          ))}
          {!readOnly && (
            <button onClick={addCriticalItem}
              className="text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-2 py-1">
              + Add Item
            </button>
          )}
        </div>

        {/* ── DATA LOCATION ── */}
        <div className={sectionHeader}>Data Location</div>

        <div className={`${label} items-start pt-2`}>File Path / Location</div>
        <div className="col-span-3 border border-gray-300 p-1">
          <textarea rows={3} className={textarea}
            placeholder="e.g. C:/ParkSystems/Reports/2026/04/&#10;OneDrive: /Field Reports/2026-Q2/"
            value={content.data_location}
            onChange={e => set('data_location', e.target.value)}
            disabled={readOnly} />
        </div>

        {/* ── WORK COMPLETION ── */}
        <div className={sectionHeader}>Work Completion</div>

        <div className={label}>Type</div>
        <div className="border border-gray-300 p-1">
          <select className={input} value={content.work_completion.type}
            onChange={e => setWC('type', e.target.value)} disabled={readOnly}>
            <option value="">— select —</option>
            {WORK_COMPLETION_TYPES.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className={label}>Time Log</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} placeholder="09:00 ~ 19:00"
            value={content.work_completion.time_log}
            onChange={e => setWC('time_log', e.target.value)}
            disabled={readOnly} />
        </div>

        <div className={label}>Reason</div>
        <div className="col-span-3 border border-gray-300 p-1">
          <input type="text" className={input} placeholder="선택 사유"
            value={content.work_completion.reason}
            onChange={e => setWC('reason', e.target.value)}
            disabled={readOnly} />
        </div>

        <div className={`${label} items-start pt-2`}>Detail</div>
        <div className="col-span-3 border border-gray-300 p-1">
          <textarea rows={3} className={textarea} placeholder="상세 설명"
            value={content.work_completion.detail}
            onChange={e => setWC('detail', e.target.value)}
            disabled={readOnly} />
        </div>

      </div>
    </div>
  )
}
