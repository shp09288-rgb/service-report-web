import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import type { InstallationContent } from '@/types/report'
import type { GanttTask } from '@/types/db'

// ── Border configs ────────────────────────────────────────────
const THIN = { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' }
const NONE = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' }
const allBorders   = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const noBorders    = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const tableBorders = {
  top: THIN, bottom: THIN, left: THIN, right: THIN,
  insideHorizontal: THIN, insideVertical: THIN,
}

// ── Colors ────────────────────────────────────────────────────
const DARK_BG   = '374151' // gray-700
const LABEL_BG  = 'F3F4F6' // gray-100
const HEADER_BG = '4B5563' // gray-600

// ── Cell helpers ──────────────────────────────────────────────
function lc(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan: span,
    shading: { type: ShadingType.SOLID, color: LABEL_BG },
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    width: { size: 20, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18 })] })],
  })
}

function vc(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan: span,
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text: text ?? '', size: 18 })] })],
  })
}

function multilineCell(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan: span,
    borders: allBorders,
    children: (text ?? '').split('\n').map(
      line => new Paragraph({ children: [new TextRun({ text: line, size: 18 })] })
    ),
  })
}

function tbl(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows,
  })
}

function hdrRow(text: string, cols: number): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: cols,
        shading: { type: ShadingType.SOLID, color: HEADER_BG },
        borders: noBorders,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 22 })] })],
      }),
    ],
  })
}

function thCell(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan: span,
    shading: { type: ShadingType.SOLID, color: LABEL_BG },
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 16 })] })],
  })
}

function tdCell(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan: span,
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text: text ?? '', size: 16 })] })],
  })
}

function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: '' })] })
}

// ── Main builder ──────────────────────────────────────────────
export function buildInstallationSections(
  content: InstallationContent,
  reportDate: string,
  ganttTasks: GanttTask[],
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []

  // Title block
  out.push(tbl([
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 4,
          shading: { type: ShadingType.SOLID, color: DARK_BG },
          borders: noBorders,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Park Systems — Installation Passdown Report', bold: true, color: 'FFFFFF', size: 28 })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `Report Date: ${reportDate}    FSE: ${content.fse_name ?? ''}`, color: 'D1D5DB', size: 18 })],
            }),
          ],
        }),
      ],
    }),
  ]))

  out.push(spacer())

  // System Info
  out.push(tbl([
    hdrRow('System Information', 4),
    new TableRow({ children: [lc('Customer'), vc(content.customer), lc('Model'), vc(content.model)] }),
    new TableRow({ children: [lc('Location'), vc(content.location), lc('EQ ID'), vc(content.eq_id)] }),
    new TableRow({ children: [lc('CRM Case ID'), vc(content.crm_case_id), lc('Site Survey'), vc(content.site_survey)] }),
    new TableRow({ children: [lc('Noise Level'), vc(content.noise_level), lc(''), vc('')] }),
  ]))

  out.push(spacer())

  // Contact Info
  out.push(tbl([
    hdrRow('Contact Information', 4),
    new TableRow({ children: [lc('Main User'), vc(content.main_user), lc('Email'), vc(content.email)] }),
    new TableRow({ children: [lc('SID'), vc(content.sid), lc('Tel'), vc(content.tel)] }),
  ]))

  out.push(spacer())

  // Installation Info
  out.push(tbl([
    hdrRow('Installation Information', 4),
    new TableRow({ children: [lc('Est. Complete Date'), vc(content.est_complete_date), lc('Total Cycle Time'), vc(content.total_cycle_time)] }),
  ]))

  out.push(spacer())

  // Individual Action Chart
  const chart = content.action_chart ?? []
  out.push(tbl([
    hdrRow('Individual Action Chart', 3),
    new TableRow({ children: [thCell('Item', 1), thCell('Committed', 1), thCell('Actual %', 1)] }),
    ...(chart.length === 0
      ? [new TableRow({
          children: [new TableCell({
            columnSpan: 3,
            borders: allBorders,
            children: [new Paragraph({ children: [new TextRun({ text: '(none)', italics: true, color: '9CA3AF', size: 18 })] })],
          })],
        })]
      : chart.map(row => new TableRow({
          children: [
            vc(row.item ?? '', 1),
            vc(row.committed ?? '', 1),
            vc(`${row.actual_pct ?? 0}%`, 1),
          ],
        }))
    ),
  ]))

  out.push(spacer())

  // Critical Items
  const critItems = content.critical_items ?? []
  out.push(tbl([
    hdrRow('Critical Items', 3),
    new TableRow({ children: [thCell('Title'), thCell('Detail'), thCell('Next Plan')] }),
    ...(critItems.length === 0
      ? [new TableRow({
          children: [new TableCell({
            columnSpan: 3,
            borders: allBorders,
            children: [new Paragraph({ children: [new TextRun({ text: '(none)', italics: true, color: '9CA3AF', size: 18 })] })],
          })],
        })]
      : critItems.map(item => new TableRow({
          children: [
            multilineCell(item.title ?? ''),
            multilineCell(item.detail ?? ''),
            multilineCell(item.next_plan ?? ''),
          ],
        }))
    ),
  ]))

  out.push(spacer())

  // Gantt Task Table
  out.push(tbl([
    hdrRow('Gantt — Task Schedule', 9),
    new TableRow({
      children: [
        thCell('No'), thCell('Action'), thCell('Category'), thCell('Item'),
        thCell('Remark'), thCell('Status'), thCell('Days'),
        thCell('Start'), thCell('Complete'),
      ],
    }),
    ...(ganttTasks.length === 0
      ? [new TableRow({
          children: [new TableCell({
            columnSpan: 9,
            borders: allBorders,
            children: [new Paragraph({ children: [new TextRun({ text: '(no tasks)', italics: true, color: '9CA3AF', size: 18 })] })],
          })],
        })]
      : ganttTasks.map(task => new TableRow({
          children: [
            tdCell(String(task.no ?? '')),
            tdCell(task.action ?? ''),
            tdCell(task.category ?? ''),
            tdCell(task.item ?? ''),
            tdCell(task.remark ?? ''),
            tdCell(task.status ?? ''),
            tdCell(task.duration != null ? String(task.duration) : ''),
            tdCell(task.start_date ?? ''),
            tdCell(task.complete_date ?? ''),
          ],
        }))
    ),
  ]))

  return out
}
