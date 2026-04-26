/**
 * Template-based DOCX export for Installation Reports.
 *
 * Loads references/templates/installation-report-template.docx,
 * substitutes all {placeholder} tags via docxtemplater, and returns
 * a Buffer ready to stream as a .docx file download.
 *
 * The template file contains the full layout (logo, colors, tables,
 * merges, fonts).  Only the data values are injected here — never
 * the visual structure.
 */

import * as fs   from 'fs'
import * as path from 'path'
import PizZip        from 'pizzip'
import Docxtemplater from 'docxtemplater'
import sharp         from 'sharp'
import type { InstallationContent } from '@/types/report'
import type { GanttTask }           from '@/types/db'
import { GANTT_CATEGORIES, getProgress } from '@/lib/gantt-progress'
import { generateRadarChartSvg }         from '@/lib/radar-chart-svg'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ImageModule = require('docxtemplater-image-module-free')

// ── Helpers ───────────────────────────────────────────────────

function fmtPct(n: number | null | undefined): string {
  return `${Math.min(100, Math.max(0, Math.round(n ?? 0)))}%`
}

function s(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

// ── Main builder ──────────────────────────────────────────────

export async function buildInstallationDocxFromTemplate(
  content: InstallationContent,
  reportDate: string,
  ganttTasks: GanttTask[],
): Promise<Buffer> {
  // Load template
  const templatePath = path.join(
    process.cwd(),
    'references', 'templates', 'installation-report-template.docx',
  )
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Installation report template not found: ${templatePath}\n` +
      'Run:  npx tsx scripts/create-installation-template.ts',
    )
  }
  const templateBuf = fs.readFileSync(templatePath)

  // ── Progress calculations ─────────────────────────────────
  const progress     = getProgress(ganttTasks)
  const committedPct = Math.min(100, Math.max(0, Math.round(content.committed_pct ?? 0)))
  const actualPct    = Math.min(100, Math.max(0, Math.round(content.actual_pct    ?? 0)))

  // ── action_chart rows ─────────────────────────────────────
  const actionChart = (content.action_chart ?? []).length > 0
    ? content.action_chart.map(row => ({
        item:       s(row.item),
        committed:  s(row.committed),
        actual_pct: fmtPct(row.actual_pct),
      }))
    : GANTT_CATEGORIES.map(cat => {
        const cp = progress.categories[cat]
        return {
          item:       cat,
          committed:  '',
          actual_pct: cp && cp.total > 0 ? fmtPct(Math.round(cp.pct * 100)) : '0%',
        }
      })

  // ── detail_report items ───────────────────────────────────
  const detailReport = (content.detail_report ?? []).map((item, i) => ({
    dt_num:     i + 1,
    dt_title:   s(item.title),
    dt_content: s(item.content),
  }))

  // ── Gantt rows ────────────────────────────────────────────
  const ganttRows: object[] = []
  for (const task of ganttTasks) {
    ganttRows.push({
      no:       s(task.no),
      action:   s(task.action),
      category: s(task.category),
      item:     s(task.item),
      remark:   s(task.remark),
      status:   s(task.status),
      days:     task.plan_duration != null ? String(task.plan_duration) : '',
      type:     'Plan',
      start:    s(task.plan_start_date),
      complete: s(task.plan_complete_date),
    })
    ganttRows.push({
      no:       '',
      action:   '',
      category: '',
      item:     '',
      remark:   '',
      status:   '',
      days:     task.duration != null ? String(task.duration) : '',
      type:     'Action',
      start:    s(task.start_date),
      complete: s(task.complete_date),
    })
  }

  // ── Radar chart PNG ───────────────────────────────────────
  // Generate category values from action_chart or progress data
  const radarValues = GANTT_CATEGORIES.map(cat => {
    const row = actionChart.find(r => r.item === cat)
    if (row) {
      const numStr = String(row.actual_pct).replace('%', '').trim()
      return parseFloat(numStr) || 0
    }
    return 0
  })

  let radarPngBuf: Buffer | null = null
  try {
    const svgStr = generateRadarChartSvg([...GANTT_CATEGORIES], radarValues, 360)
    radarPngBuf  = await sharp(Buffer.from(svgStr)).png().toBuffer()
  } catch (e) {
    console.warn('[installation-template] Radar chart PNG generation failed:', e)
  }

  // ── Docxtemplater setup ───────────────────────────────────
  const zip = new PizZip(templateBuf)

  const modules: object[] = []
  if (radarPngBuf) {
    const pngBuf = radarPngBuf  // captured in closure
    modules.push(new ImageModule({
      centered:  false,
      fileType:  'docx',
      getImage() { return pngBuf },
      getSize()  { return [280, 280] },
    }))
  }

  const doc = new Docxtemplater(zip, {
    modules,
    paragraphLoop: true,
    linebreaks:    true,
    nullGetter()   { return '' },
  })

  doc.render({
    // Header
    fse_name:    s(content.fse_name),
    report_date: s(reportDate),

    // System Information
    customer:    s(content.customer),
    location:    s(content.location),
    crm_case_id: s(content.crm_case_id),
    model:       s(content.model),
    site_survey: s(content.site_survey),
    noise_level: s(content.noise_level),
    main_user:   s(content.main_user),
    sid:         s(content.sid),
    start_date:  s(content.start_date),
    tel:         s(content.tel),
    eq_id:       s(content.eq_id),
    est_complete_date: s(content.est_complete_date),
    email:       s(content.email),
    service_type: s(content.service_type),
    start_time:   s(content.start_time),
    end_time:     s(content.end_time),

    // Progress
    committed_pct:  fmtPct(committedPct),
    actual_pct:     fmtPct(actualPct),
    total_days:     content.total_days    ?? 0,
    progress_days:  content.progress_days ?? 0,

    // Action chart loop
    action_chart: actionChart,

    // Radar chart image (tag: {%radar_chart})
    radar_chart: radarPngBuf ?? Buffer.alloc(0),

    // Summary & detail
    critical_item_summary: s(content.critical_item_summary),
    detail_report:         detailReport,

    // Next plan & data location
    next_plan:      s(content.next_plan),
    data_location:  s(content.data_location),

    // Work Completion
    wc_type:     s(content.work_completion?.type),
    wc_reason:   s(content.work_completion?.reason),
    wc_detail:   s(content.work_completion?.detail),
    wc_time_log: s(content.work_completion?.time_log),

    // Gantt loop
    gantt_rows: ganttRows,
  })

  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer
}
