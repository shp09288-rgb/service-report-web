'use client'

import React, { useMemo } from 'react'
import type { GanttTask } from '@/types/db'
import { GANTT_CATEGORIES, getProgress } from '@/lib/gantt-progress'

// ── Date utilities (local, no timezone shift) ─────────────────
function parseLocal(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * plan_end = plan_start + (days − 1)
 * e.g. start=2026-04-26, days=4 → end=2026-04-29
 */
function calcPlanEnd(startIso: string, days: number): string {
  if (!startIso || !(days > 0)) return ''
  const s = parseLocal(startIso)
  return s ? toISO(addDays(s, days - 1)) : ''
}

function isWeekend(d: Date): boolean {
  const w = d.getDay()
  return w === 0 || w === 6
}

const DOW2  = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MON3  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── Status config ─────────────────────────────────────────────
const STATUS_OPTS = ['', 'Planned', 'Started', 'Completed'] as const

const STATUS_ROW: Record<string, string> = {
  Completed: 'bg-green-50',
  Started:   'bg-blue-50',
}
const STATUS_SEL: Record<string, string> = {
  Completed: 'bg-green-100 text-green-800',
  Started:   'bg-blue-100  text-blue-800',
  Planned:   'bg-gray-100  text-gray-600',
}

// ── Task factory ──────────────────────────────────────────────
function emptyTask(no: number): GanttTask {
  return {
    no,
    action:   '',
    category: '',
    item:     '',
    remark:   '',
    status:   'Planned',
    duration: 0,
    start_date:    '',
    complete_date: '',
    plan_duration:      0,
    plan_start_date:    '',
    plan_complete_date: '',
  }
}

// ── Component ─────────────────────────────────────────────────
interface Props {
  tasks:    GanttTask[]
  onChange: (tasks: GanttTask[]) => void
}

export function GanttEditor({ tasks, onChange }: Props) {
  const progress = getProgress(tasks)

  // setTask — updates a single field and auto-recalculates Plan End
  function setTask<K extends keyof GanttTask>(idx: number, key: K, val: GanttTask[K]) {
    onChange(
      tasks.map((t, i) => {
        if (i !== idx) return t
        const u = { ...t, [key]: val }
        // Recalculate Plan End whenever Plan Start or Plan Days change
        if (key === 'plan_start_date' || key === 'plan_duration') {
          const s = (key === 'plan_start_date' ? val : u.plan_start_date) as string
          const n = (key === 'plan_duration'   ? val : u.plan_duration)   as number
          u.plan_complete_date = calcPlanEnd(s ?? '', Number(n) || 0)
        }
        return u
      }),
    )
  }

  const addRow    = () => onChange([...tasks, emptyTask(tasks.length + 1)])
  const removeRow = (i: number) => onChange(tasks.filter((_, j) => j !== i))

  // ── Timeline date range ───────────────────────────────────
  const tlDays = useMemo((): Date[] => {
    const ms: number[] = []
    for (const t of tasks) {
      // plan dates first, fall back to action dates for old data
      for (const iso of [
        t.plan_start_date ?? t.start_date,
        t.plan_complete_date ?? t.complete_date,
        t.start_date,
        t.complete_date,
      ]) {
        const d = iso ? parseLocal(iso) : null
        if (d) ms.push(d.getTime())
      }
    }
    if (!ms.length) return []
    const minMs = Math.min(...ms)
    const maxMs = Math.max(...ms)
    const span  = Math.ceil((maxMs - minMs) / 86_400_000) + 1
    const start = new Date(minMs)
    // 1-day padding each side, max 180 days total
    return Array.from({ length: Math.min(span + 2, 180) }, (_, i) => addDays(start, i - 1))
  }, [tasks])

  // Month-group header for timeline
  const monthGroups = useMemo(() => {
    const g: { label: string; span: number }[] = []
    for (const d of tlDays) {
      const lbl = `${MON3[d.getMonth()]} ${d.getFullYear()}`
      if (!g.length || g[g.length - 1].label !== lbl) g.push({ label: lbl, span: 1 })
      else g[g.length - 1].span++
    }
    return g
  }, [tlDays])

  // Check whether a day falls within a date range
  function inRange(d: Date, s: string | null | undefined, e: string | null | undefined): boolean {
    const sd = s ? parseLocal(s) : null
    const ed = e ? parseLocal(e) : null
    return !!(sd && ed && d >= sd && d <= ed)
  }

  // Fixed left-column px totals:
  // No=36 + Action=130 + Cat=130 + Item=160 + Remark=100 + Status=100 + P/A=46 + Days=50 + Start=90 + End=90 + Del=26 = 958
  const FIXED_W  = 958
  const COL_W    = 20          // px per timeline day
  const hasTl    = tlDays.length > 0
  const totalCols = 10 + tlDays.length + 1   // left-info cols + timeline + delete

  const inp = 'w-full bg-transparent text-xs px-1 py-0.5 focus:outline-none focus:bg-white/80 rounded'

  return (
    <div className="space-y-3">

      {/* ── Progress Summary ──────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <div className="bg-gray-700 text-white text-xs font-semibold px-3 py-1.5">
          Progress Summary
        </div>
        <div className="p-3 space-y-2">
          {/* Total */}
          <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700 w-44 shrink-0">Total</span>
            <div className="flex-1 h-2.5 bg-gray-100 rounded overflow-hidden">
              <div className="h-full bg-gray-500 transition-all"
                   style={{ width: `${Math.round(progress.totalPct * 100)}%` }} />
            </div>
            <span className="text-xs text-gray-600 w-28 text-right shrink-0">
              {progress.completed}/{progress.total} ({Math.round(progress.totalPct * 100)}%)
            </span>
          </div>
          {/* Per-category */}
          {GANTT_CATEGORIES.map(cat => {
            const cp  = progress.categories[cat]
            const pct = Math.round((cp?.pct ?? 0) * 100)
            return (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-44 shrink-0 truncate">{cat}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-28 text-right shrink-0">
                  {cp?.completed ?? 0}/{cp?.total ?? 0} ({pct}%)
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={addRow}
          className="text-xs border border-blue-300 text-blue-600 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors"
        >
          + Add Row
        </button>
      </div>

      {/* ── Gantt Table ───────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table
          className="text-xs border-collapse"
          style={{
            tableLayout: 'fixed',
            width:       `${FIXED_W + tlDays.length * COL_W}px`,
            minWidth:    hasTl ? undefined : '900px',
          }}
        >
          <thead>
            {/* ── Header row 1: fixed column labels + month groups ── */}
            <tr className="bg-gray-700 text-white">
              <th rowSpan={2} style={{ width: 36  }} className="px-1 py-1.5 font-semibold border border-gray-600 text-center">No</th>
              <th rowSpan={2} style={{ width: 130 }} className="px-1 py-1.5 font-semibold border border-gray-600 text-left">Action</th>
              <th rowSpan={2} style={{ width: 130 }} className="px-1 py-1.5 font-semibold border border-gray-600 text-left">Category</th>
              <th rowSpan={2} style={{ width: 160 }} className="px-1 py-1.5 font-semibold border border-gray-600 text-left">Item</th>
              <th rowSpan={2} style={{ width: 100 }} className="px-1 py-1.5 font-semibold border border-gray-600 text-left">Remark</th>
              <th rowSpan={2} style={{ width: 100 }} className="px-1 py-1.5 font-semibold border border-gray-600 text-left">Status</th>
              <th rowSpan={2} style={{ width: 46  }} className="px-0 py-1.5 font-semibold border border-gray-600 text-center">P/A</th>
              <th rowSpan={2} style={{ width: 50  }} className="px-1 py-1.5 font-semibold border border-gray-600 text-center">Days</th>
              <th rowSpan={2} style={{ width: 90  }} className="px-1 py-1.5 font-semibold border border-gray-600 text-center">Start</th>
              <th rowSpan={2} style={{ width: 90  }} className="px-1 py-1.5 font-semibold border border-gray-600 text-center">End</th>
              {monthGroups.map((g, mi) => (
                <th
                  key={mi}
                  colSpan={g.span}
                  style={{ width: g.span * COL_W }}
                  className="py-1 font-semibold border border-gray-600 text-center overflow-hidden"
                  title={g.label}
                >
                  <span style={{ fontSize: 10 }}>{g.label}</span>
                </th>
              ))}
              <th rowSpan={2} style={{ width: 26 }} className="border border-gray-600" />
            </tr>

            {/* ── Header row 2: day / DOW ── */}
            <tr className="bg-gray-600 text-white">
              {tlDays.map((d, di) => (
                <th
                  key={di}
                  style={{ width: COL_W, fontSize: 9, lineHeight: 1.15 }}
                  className={`border border-gray-500 text-center font-normal py-0 leading-tight ${isWeekend(d) ? 'bg-gray-500' : ''}`}
                >
                  <div>{d.getDate()}</div>
                  <div>{DOW2[d.getDay()]}</div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-4 py-8 text-center text-gray-400 italic"
                >
                  No tasks yet — click &ldquo;+ Add Row&rdquo; to start.
                </td>
              </tr>
            ) : (
              tasks.map((task, i) => {
                const rowBg  = STATUS_ROW[task.status] ?? ''
                const selCls = STATUS_SEL[task.status] ?? ''

                // Plan bar dates (fallback to action dates for backward-compat)
                const planS = task.plan_start_date    || task.start_date    || ''
                const planE = task.plan_complete_date || task.complete_date || ''
                // Action bar dates
                const actS  = task.start_date    || ''
                const actE  = task.complete_date  || ''

                return (
                  <React.Fragment key={i}>

                    {/* ══ Plan row ══════════════════════════════════ */}
                    <tr className={rowBg}>

                      {/* ── Shared cells (rowSpan=2) ─────────────── */}
                      {/* No */}
                      <td rowSpan={2} style={{ width: 36 }}
                          className="border border-gray-200 text-center align-middle">
                        <input type="number"
                               className={`${inp} text-center`}
                               value={task.no}
                               onChange={e => setTask(i, 'no', Number(e.target.value))} />
                      </td>
                      {/* Action */}
                      <td rowSpan={2} style={{ width: 130 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <select className={inp} value={task.action}
                                onChange={e => setTask(i, 'action', e.target.value)}>
                          <option value="">— select —</option>
                          {GANTT_CATEGORIES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      {/* Category */}
                      <td rowSpan={2} style={{ width: 130 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <input type="text" className={inp}
                               value={task.category} placeholder="Sub-category"
                               onChange={e => setTask(i, 'category', e.target.value)} />
                      </td>
                      {/* Item */}
                      <td rowSpan={2} style={{ width: 160 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <input type="text" className={inp}
                               value={task.item} placeholder="Task description"
                               onChange={e => setTask(i, 'item', e.target.value)} />
                      </td>
                      {/* Remark */}
                      <td rowSpan={2} style={{ width: 100 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <input type="text" className={inp}
                               value={task.remark}
                               onChange={e => setTask(i, 'remark', e.target.value)} />
                      </td>
                      {/* Status */}
                      <td rowSpan={2} style={{ width: 100 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <select className={`${inp} ${selCls} rounded`}
                                value={task.status}
                                onChange={e => setTask(i, 'status', e.target.value)}>
                          {STATUS_OPTS.map(o => (
                            <option key={o} value={o}>{o || '— select —'}</option>
                          ))}
                        </select>
                      </td>

                      {/* ── Plan-only cells ──────────────────────── */}
                      {/* P/A label */}
                      <td style={{ width: 46 }}
                          className="border border-gray-200 text-center align-middle font-semibold text-blue-700 bg-blue-50">
                        <span style={{ fontSize: 10 }}>Plan</span>
                      </td>
                      {/* Plan Days */}
                      <td style={{ width: 50 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <input type="number" min={0}
                               className={`${inp} text-center`}
                               value={task.plan_duration ?? ''}
                               onChange={e => setTask(i, 'plan_duration', Number(e.target.value))} />
                      </td>
                      {/* Plan Start */}
                      <td style={{ width: 90 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <input type="date" className={inp}
                               value={task.plan_start_date ?? ''}
                               onChange={e => setTask(i, 'plan_start_date', e.target.value)} />
                      </td>
                      {/* Plan End — auto-calculated, read-only */}
                      <td style={{ width: 90 }}
                          className="border border-gray-200 align-middle px-0.5 bg-blue-50/50"
                          title="Auto-calculated: Plan Start + (Plan Days − 1)">
                        <input type="date"
                               className={`${inp} text-blue-600 cursor-default select-none`}
                               value={task.plan_complete_date ?? ''}
                               readOnly
                               tabIndex={-1} />
                      </td>
                      {/* Timeline — Plan bar */}
                      {tlDays.map((d, di) => {
                        const onBar = inRange(d, planS, planE)
                        const wkend = isWeekend(d)
                        return (
                          <td key={di}
                              style={{ width: COL_W, height: 18, padding: 0 }}
                              className={`border-r border-gray-100 ${
                                onBar  ? 'bg-blue-400'
                                : wkend ? 'bg-gray-100'
                                :         ''
                              }`}
                          />
                        )
                      })}
                      {/* Delete — rowSpan=2 */}
                      <td rowSpan={2} style={{ width: 26 }}
                          className="border border-gray-200 text-center align-middle">
                        <button
                          onClick={() => removeRow(i)}
                          className="text-gray-300 hover:text-red-500 transition-colors text-xs leading-none"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>

                    {/* ══ Action row ════════════════════════════════ */}
                    <tr className={rowBg}>
                      {/* P/A label */}
                      <td style={{ width: 46 }}
                          className="border border-gray-200 text-center align-middle font-semibold text-green-700 bg-green-50">
                        <span style={{ fontSize: 10 }}>Action</span>
                      </td>
                      {/* Actual Days */}
                      <td style={{ width: 50 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <input type="number" min={0}
                               className={`${inp} text-center`}
                               value={task.duration ?? ''}
                               onChange={e => setTask(i, 'duration', Number(e.target.value))} />
                      </td>
                      {/* Action Start */}
                      <td style={{ width: 90 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <input type="date" className={inp}
                               value={task.start_date ?? ''}
                               onChange={e => setTask(i, 'start_date', e.target.value)} />
                      </td>
                      {/* Action End */}
                      <td style={{ width: 90 }}
                          className="border border-gray-200 align-middle px-0.5">
                        <input type="date" className={inp}
                               value={task.complete_date ?? ''}
                               onChange={e => setTask(i, 'complete_date', e.target.value)} />
                      </td>
                      {/* Timeline — Action bar */}
                      {tlDays.map((d, di) => {
                        const onBar = inRange(d, actS, actE)
                        const wkend = isWeekend(d)
                        return (
                          <td key={di}
                              style={{ width: COL_W, height: 18, padding: 0 }}
                              className={`border-r border-gray-100 ${
                                onBar  ? 'bg-green-400'
                                : wkend ? 'bg-gray-100'
                                :         ''
                              }`}
                          />
                        )
                      })}
                    </tr>

                    {/* ── Task separator ───────────────────────────── */}
                    {i < tasks.length - 1 && (
                      <tr>
                        <td colSpan={totalCols} style={{ height: 3, padding: 0 }}
                            className="bg-gray-300" />
                      </tr>
                    )}

                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Legend ───────────────────────────────────────────────── */}
      {hasTl && (
        <div className="flex flex-wrap items-center gap-5 text-xs text-gray-500 px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-3 rounded bg-blue-400 inline-block" />
            Plan bar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-3 rounded bg-green-400 inline-block" />
            Action bar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-3 rounded bg-gray-100 border border-gray-200 inline-block" />
            Weekend
          </span>
          <span className="text-gray-400">
            Plan End is auto-calculated from Plan Start + (Plan Days − 1)
          </span>
        </div>
      )}

    </div>
  )
}
