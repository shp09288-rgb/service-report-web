'use client'

import { InstallationContent } from '@/types/report'

const SITE_SURVEY_OPTIONS = ['VC-C', 'VC-D', 'VC-E', 'Other']
const NOISE_LEVEL_OPTIONS = ['< 60dB', '60~65dB', '65~70dB', '> 70dB']

interface Props {
  content: InstallationContent
  onChange: (content: InstallationContent) => void
  readOnly?: boolean
}

export function InstallationEditor({ content, onChange, readOnly = false }: Props) {
  function set<K extends keyof InstallationContent>(key: K, value: InstallationContent[K]) {
    onChange({ ...content, [key]: value })
  }

  function setActionChart(index: number, key: keyof InstallationContent['action_chart'][0], value: string | number) {
    const next = content.action_chart.map((row, i) =>
      i === index ? { ...row, [key]: value } : row
    )
    set('action_chart', next)
  }

  function addActionRow() {
    set('action_chart', [...content.action_chart, { item: '', committed: '', actual_pct: 0 }])
  }

  function removeActionRow(index: number) {
    set('action_chart', content.action_chart.filter((_, i) => i !== index))
  }

  function setCriticalItem(index: number, key: keyof InstallationContent['critical_items'][0], value: string) {
    const next = content.critical_items.map((item, i) =>
      i === index ? { ...item, [key]: value } : item
    )
    set('critical_items', next)
  }

  function addCriticalItem() {
    set('critical_items', [...content.critical_items, { title: '', detail: '', next_plan: '' }])
  }

  function removeCriticalItem(index: number) {
    set('critical_items', content.critical_items.filter((_, i) => i !== index))
  }

  const input =
    'w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'
  const textarea =
    'w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y disabled:bg-gray-50 disabled:text-gray-500'
  const label =
    'bg-gray-100 border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 flex items-center'
  const sectionHeader =
    'col-span-full bg-gray-700 text-white text-xs font-semibold px-3 py-1.5 tracking-wide uppercase'

  return (
    <div className="font-sans text-sm">
      <div className="bg-gray-800 text-white text-center py-3 text-base font-bold tracking-wide">
        Park Systems — Installation Passdown Report
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
            onChange={e => set('customer', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>Location</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.location}
            onChange={e => set('location', e.target.value)} disabled={readOnly} />
        </div>

        <div className={label}>CRM Case ID</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.crm_case_id}
            onChange={e => set('crm_case_id', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>Model</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.model}
            onChange={e => set('model', e.target.value)} disabled={readOnly} />
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

        {/* ── INSTALLATION INFORMATION ── */}
        <div className={sectionHeader}>Installation Information</div>

        <div className={label}>Main User</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.main_user}
            onChange={e => set('main_user', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>SID</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.sid}
            onChange={e => set('sid', e.target.value)} disabled={readOnly} />
        </div>

        <div className={label}>Tel #</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.tel}
            onChange={e => set('tel', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>EQ ID</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} value={content.eq_id}
            onChange={e => set('eq_id', e.target.value)} disabled={readOnly} />
        </div>

        <div className={label}>Email</div>
        <div className="col-span-3 border border-gray-300 p-1">
          <input type="email" className={input} value={content.email}
            onChange={e => set('email', e.target.value)} disabled={readOnly} />
        </div>

        <div className={label}>Est. Complete Date</div>
        <div className="border border-gray-300 p-1">
          <input type="date" className={input} value={content.est_complete_date}
            onChange={e => set('est_complete_date', e.target.value)} disabled={readOnly} />
        </div>
        <div className={label}>Total Cycle Time</div>
        <div className="border border-gray-300 p-1">
          <input type="text" className={input} placeholder="e.g. 14 days"
            value={content.total_cycle_time}
            onChange={e => set('total_cycle_time', e.target.value)} disabled={readOnly} />
        </div>

        {/* ── INDIVIDUAL ACTION CHART ── */}
        <div className={sectionHeader}>Individual Action Chart</div>

        <div className="col-span-full border border-gray-300 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="text-left px-3 py-2 font-medium text-gray-700 w-1/2">Item</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700 w-1/4">Committed</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700 w-1/5">Actual %</th>
                {!readOnly && <th className="px-2 py-2 w-8" />}
              </tr>
            </thead>
            <tbody>
              {content.action_chart.map((row, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="px-1 py-1">
                    <input type="text" className={input} value={row.item}
                      onChange={e => setActionChart(i, 'item', e.target.value)}
                      disabled={readOnly} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="text" className={input} value={row.committed}
                      onChange={e => setActionChart(i, 'committed', e.target.value)}
                      disabled={readOnly} />
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} max={100} className={`${input} w-16`}
                        value={row.actual_pct}
                        onChange={e => setActionChart(i, 'actual_pct', Number(e.target.value))}
                        disabled={readOnly} />
                      <span className="text-gray-400">%</span>
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => removeActionRow(i)}
                        className="text-red-400 hover:text-red-600">✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="px-3 py-2">
              <button onClick={addActionRow}
                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-2 py-1">
                + Add Row
              </button>
            </div>
          )}
        </div>

        {/* ── CRITICAL ITEMS ── */}
        <div className={sectionHeader}>Critical Items</div>

        <div className="col-span-full border border-gray-300 p-3 space-y-4">
          {content.critical_items.map((item, i) => (
            <div key={i} className="border border-gray-200 rounded p-3 space-y-2">
              <div className="flex gap-2 items-start">
                <span className="text-xs font-bold text-gray-500 w-5 pt-2 shrink-0">{i + 1}.</span>
                <input type="text" className={`${input} flex-1`} placeholder="Title"
                  value={item.title}
                  onChange={e => setCriticalItem(i, 'title', e.target.value)}
                  disabled={readOnly} />
                {!readOnly && (
                  <button onClick={() => removeCriticalItem(i)}
                    className="text-red-400 hover:text-red-600 text-xs pt-2 shrink-0">✕</button>
                )}
              </div>
              <div className="ml-5">
                <label className="block text-xs text-gray-500 mb-0.5">Detail</label>
                <textarea rows={2} className={textarea} placeholder="Detail description"
                  value={item.detail}
                  onChange={e => setCriticalItem(i, 'detail', e.target.value)}
                  disabled={readOnly} />
              </div>
              <div className="ml-5">
                <label className="block text-xs text-gray-500 mb-0.5">Next Plan</label>
                <textarea rows={2} className={textarea} placeholder="Next action plan"
                  value={item.next_plan}
                  onChange={e => setCriticalItem(i, 'next_plan', e.target.value)}
                  disabled={readOnly} />
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

      </div>
    </div>
  )
}
