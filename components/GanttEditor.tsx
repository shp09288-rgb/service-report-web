'use client'

import type { GanttTask } from '@/types/db'

const STATUS_OPTIONS = ['', 'Not Started', 'In Progress', 'Completed', 'Delayed', 'On Hold']
const CATEGORY_OPTIONS = [
  '',
  'Delivery & Positioning',
  'Set-up',
  'Utilization Check',
  'Teaching',
  'Basic Performance',
  'Acceptance Test',
  'VOC',
]

interface Props {
  tasks: GanttTask[]
  onChange: (tasks: GanttTask[]) => void
}

function emptyTask(no: number): GanttTask {
  return { no, action: '', category: '', item: '', remark: '', status: '', duration: 0, start_date: '', complete_date: '' }
}

const STATUS_COLOR: Record<string, string> = {
  'Completed':   'bg-green-100 text-green-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Delayed':     'bg-red-100 text-red-700',
  'On Hold':     'bg-gray-100 text-gray-500',
  'Not Started': 'bg-yellow-50 text-yellow-700',
}

export function GanttEditor({ tasks, onChange }: Props) {
  function setTask<K extends keyof GanttTask>(index: number, key: K, value: GanttTask[K]) {
    onChange(tasks.map((t, i) => i === index ? { ...t, [key]: value } : t))
  }

  function addRow() {
    onChange([...tasks, emptyTask(tasks.length + 1)])
  }

  function removeRow(index: number) {
    onChange(tasks.filter((_, i) => i !== index))
  }

  // ── shared input styles ──────────────────────────────────────
  const cell = 'w-full bg-transparent text-xs px-1 py-0.5 focus:outline-none focus:bg-blue-50 rounded'

  return (
    <div className="space-y-3">

      {/* Add row */}
      <div className="flex justify-end">
        <button
          onClick={addRow}
          className="text-xs border border-blue-300 text-blue-600 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors"
        >
          + Add Row
        </button>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="text-xs w-full min-w-[1100px]">
          <thead>
            <tr className="bg-gray-700 text-white text-left">
              <th className="px-2 py-2 w-10 font-medium">No</th>
              <th className="px-2 py-2 w-28 font-medium">Action</th>
              <th className="px-2 py-2 w-36 font-medium">Category</th>
              <th className="px-2 py-2 w-48 font-medium">Item</th>
              <th className="px-2 py-2 w-28 font-medium">Remark</th>
              <th className="px-2 py-2 w-32 font-medium">Status</th>
              <th className="px-2 py-2 w-16 font-medium">Days</th>
              <th className="px-2 py-2 w-28 font-medium">Start</th>
              <th className="px-2 py-2 w-28 font-medium">Complete</th>
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-gray-400 italic">
                  No tasks yet. Click &ldquo;+ Add Row&rdquo; to start.
                </td>
              </tr>
            ) : (
              tasks.map((task, i) => (
                <tr key={i} className="hover:bg-gray-50 group">
                  {/* No */}
                  <td className="px-1 py-1 border-r border-gray-100">
                    <input
                      type="number"
                      className={cell}
                      value={task.no}
                      onChange={e => setTask(i, 'no', Number(e.target.value))}
                    />
                  </td>
                  {/* Action */}
                  <td className="px-1 py-1 border-r border-gray-100">
                    <input
                      type="text"
                      className={cell}
                      value={task.action}
                      onChange={e => setTask(i, 'action', e.target.value)}
                      placeholder="e.g. Install"
                    />
                  </td>
                  {/* Category */}
                  <td className="px-1 py-1 border-r border-gray-100">
                    <select
                      className={cell}
                      value={task.category}
                      onChange={e => setTask(i, 'category', e.target.value)}
                    >
                      {CATEGORY_OPTIONS.map(o => (
                        <option key={o} value={o}>{o || '— select —'}</option>
                      ))}
                    </select>
                  </td>
                  {/* Item */}
                  <td className="px-1 py-1 border-r border-gray-100">
                    <input
                      type="text"
                      className={cell}
                      value={task.item}
                      onChange={e => setTask(i, 'item', e.target.value)}
                      placeholder="Task description"
                    />
                  </td>
                  {/* Remark */}
                  <td className="px-1 py-1 border-r border-gray-100">
                    <input
                      type="text"
                      className={cell}
                      value={task.remark}
                      onChange={e => setTask(i, 'remark', e.target.value)}
                    />
                  </td>
                  {/* Status */}
                  <td className="px-1 py-1 border-r border-gray-100">
                    <select
                      className={`${cell} ${STATUS_COLOR[task.status] ?? ''} rounded`}
                      value={task.status}
                      onChange={e => setTask(i, 'status', e.target.value)}
                    >
                      {STATUS_OPTIONS.map(o => (
                        <option key={o} value={o}>{o || '— select —'}</option>
                      ))}
                    </select>
                  </td>
                  {/* Duration */}
                  <td className="px-1 py-1 border-r border-gray-100">
                    <input
                      type="number"
                      min={0}
                      className={cell}
                      value={task.duration}
                      onChange={e => setTask(i, 'duration', Number(e.target.value))}
                    />
                  </td>
                  {/* Start Date */}
                  <td className="px-1 py-1 border-r border-gray-100">
                    <input
                      type="date"
                      className={cell}
                      value={task.start_date}
                      onChange={e => setTask(i, 'start_date', e.target.value)}
                    />
                  </td>
                  {/* Complete Date */}
                  <td className="px-1 py-1 border-r border-gray-100">
                    <input
                      type="date"
                      className={cell}
                      value={task.complete_date}
                      onChange={e => setTask(i, 'complete_date', e.target.value)}
                    />
                  </td>
                  {/* Delete */}
                  <td className="px-1 py-1 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Lightweight duration timeline hint */}
      {tasks.length > 0 && tasks.some(t => t.start_date && t.complete_date) && (
        <DurationBar tasks={tasks} />
      )}
    </div>
  )
}

// ── Lightweight visual: relative duration bars ────────────────
function DurationBar({ tasks }: { tasks: GanttTask[] }) {
  const dated = tasks.filter(t => t.start_date && t.complete_date)
  if (dated.length === 0) return null

  const allDates = dated.flatMap(t => [new Date(t.start_date), new Date(t.complete_date)])
  const minMs = Math.min(...allDates.map(d => d.getTime()))
  const maxMs = Math.max(...allDates.map(d => d.getTime()))
  const spanMs = maxMs - minMs || 1

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="bg-gray-700 text-white text-xs font-medium px-3 py-1.5">
        Timeline Overview
      </div>
      <div className="p-3 space-y-1.5">
        {dated.map((task, i) => {
          const start   = (new Date(task.start_date).getTime()    - minMs) / spanMs * 100
          const end     = (new Date(task.complete_date).getTime() - minMs) / spanMs * 100
          const width   = Math.max(end - start, 1)
          const color   = task.status === 'Completed'   ? 'bg-green-400'
                        : task.status === 'In Progress' ? 'bg-blue-400'
                        : task.status === 'Delayed'     ? 'bg-red-400'
                        : 'bg-gray-300'

          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 w-32 truncate shrink-0">{task.item || task.action || `Task ${task.no}`}</span>
              <div className="flex-1 bg-gray-100 rounded h-4 relative">
                <div
                  className={`absolute h-full rounded ${color} opacity-80`}
                  style={{ left: `${start}%`, width: `${width}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
