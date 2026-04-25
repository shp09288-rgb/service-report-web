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

// ── Installation auto-calculation ────────────────────────────────────────────
// All values derived from Gantt tasks + date range, matching Excel formulas:
//   Actual Progress    = SUM(completed per category) / SUM(total per category)
//   Committed Progress = (reportDate - startDate) / (estCompleteDate - startDate)
//   Total Days         = estCompleteDate - startDate
//   Progress Days      = 1 + reportDate - startDate

export interface InstallationCycleTime {
  /** 0–100 integer. SUM(Completed) / SUM(Total) across all Gantt tasks. */
  actualProgress: number
  /** 0–100 integer. Date-based: elapsed / total plan duration. */
  committedProgress: number
  /** Total planned days (estCompleteDate − startDate). */
  totalDays: number
  /** Elapsed days (reportDate − startDate + 1). */
  progressDays: number
  /** Per-category progress 0–100 integer, keyed by GANTT_CATEGORIES value. */
  categoryProgress: Record<string, number>
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000
  const ta = new Date(a + 'T00:00:00').getTime()
  const tb = new Date(b + 'T00:00:00').getTime()
  return Math.round((tb - ta) / msPerDay)
}

export function computeInstallationProgress(
  tasks: GanttTask[],
  startDate:       string,   // 'YYYY-MM-DD' from content.start_date
  estCompleteDate: string,   // 'YYYY-MM-DD' from content.est_complete_date
  reportDate:      string,   // 'YYYY-MM-DD' from document.report_date
): InstallationCycleTime {
  const progress = getProgress(tasks)

  // Actual Progress — mirrors Excel: =SUM(A3:A7)/SUM(C3:C7)
  const actualProgress = progress.total > 0
    ? Math.round(progress.totalPct * 100)
    : 0

  // Committed Progress — mirrors Excel: =(reportDate−startDate)/(estComplete−startDate)
  let committedProgress = 0
  if (startDate && estCompleteDate && reportDate) {
    const span = daysBetween(startDate, estCompleteDate)
    if (span > 0) {
      const elapsed = daysBetween(startDate, reportDate)
      committedProgress = Math.round(Math.min(100, Math.max(0, (elapsed / span) * 100)))
    }
  }

  // Total Days — mirrors Excel: =L10−L9
  const totalDays = startDate && estCompleteDate
    ? Math.max(0, daysBetween(startDate, estCompleteDate))
    : 0

  // Progress Days — mirrors Excel: =1+V4−L9
  const progressDays = startDate && reportDate
    ? Math.max(0, 1 + daysBetween(startDate, reportDate))
    : 0

  // Category progress 0–100
  const categoryProgress: Record<string, number> = {}
  for (const cat of GANTT_CATEGORIES) {
    const cp = progress.categories[cat]
    categoryProgress[cat] = cp && cp.total > 0 ? Math.round(cp.pct * 100) : 0
  }

  return { actualProgress, committedProgress, totalDays, progressDays, categoryProgress }
}
