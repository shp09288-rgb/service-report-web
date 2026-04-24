import type { GanttTask } from '@/types/db'

export const GANTT_CATEGORIES = [
  'Installation',
  'Utillization Check',
  'Teaching',
  'Basic Performance',
  'Acceptance Test',
] as const

export type GanttCategory = typeof GANTT_CATEGORIES[number]

export interface CategoryProgress {
  total: number
  completed: number
  pct: number   // 0–1
}

export interface GanttProgress {
  total: number
  completed: number
  totalPct: number  // 0–1
  categories: Record<string, CategoryProgress>
}

export function getProgress(tasks: GanttTask[]): GanttProgress {
  const total = tasks.length
  const completed = tasks.filter(t => t.status === 'Completed').length
  const categories: Record<string, CategoryProgress> = {}
  for (const cat of GANTT_CATEGORIES) {
    const ts = tasks.filter(t => t.action === cat)
    const done = ts.filter(t => t.status === 'Completed').length
    categories[cat] = {
      total: ts.length,
      completed: done,
      pct: ts.length > 0 ? done / ts.length : 0,
    }
  }
  return { total, completed, totalPct: total > 0 ? completed / total : 0, categories }
}

export function getProgressAsOf(reportDate: string, tasks: GanttTask[]): GanttProgress {
  const rd = new Date(reportDate)
  const effective = tasks.map(t => {
    if (t.status === 'Completed') {
      const dateStr = t.complete_date || t.plan_complete_date
      const cd = dateStr ? new Date(dateStr) : null
      if (cd && cd <= rd) return t
      return { ...t, status: 'Started' }
    }
    return t
  })
  return getProgress(effective)
}
