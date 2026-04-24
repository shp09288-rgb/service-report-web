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

// ── Borders ───────────────────────────────────────────────────
const THIN  = { style: BorderStyle.SINGLE, size: 4,  color: 'AAAAAA' }
const MED   = { style: BorderStyle.SINGLE, size: 6,  color: '374151' }
const NONE  = { style: BorderStyle.NONE,   size: 0,  color: 'FFFFFF' }
const allB  = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const noneB = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const outerB = { top: MED, bottom: MED, left: MED, right: MED, insideHorizontal: THIN, insideVertical: THIN }

// ── Colors ────────────────────────────────────────────────────
const TITLE_BG  = '1F2937' // gray-800
const SEC_BG    = '4B5563' // gray-600
const LABEL_BG  = 'F3F4F6' // gray-100
const BAR_BLUE  = '3B82F6'
const BAR_GREEN = '10B981'
const BAR_EMPTY = 'E5E7EB'

// ── Width helpers ─────────────────────────────────────────────
const pct  = (n: number) => ({ size: n, type: WidthType.PERCENTAGE })
const dxa  = (n: number) => ({ size: n, type: WidthType.DXA })

// ── Text helpers ──────────────────────────────────────────────
function run(text: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) {
  return new TextRun({ text: text ?? '', bold: opts.bold, color: opts.color, size: opts.size ?? 18, italics: opts.italics })
}

function para(children: TextRun[], align?: (typeof AlignmentType)[keyof typeof AlignmentType]) {
  return new Paragraph({ alignment: align, children })
}

function spacer() {
  return new Paragraph({ children: [new TextRun({ text: '', size: 14 })] })
}

// ── Cell builders ─────────────────────────────────────────────
function labelCell(text: string, span = 1, widthPct?: number): TableCell {
  return new TableCell({
    columnSpan:    span,
    width:         widthPct ? pct(widthPct) : undefined,
    shading:       { type: ShadingType.SOLID, color: LABEL_BG },
    borders:       allB,
    verticalAlign: VerticalAlign.CENTER,
    children: [para([run(text, { bold: true, size: 17 })])],
  })
}

function valueCell(text: string, span = 1, widthPct?: number): TableCell {
  return new TableCell({
    columnSpan:    span,
    width:         widthPct ? pct(widthPct) : undefined,
    borders:       allB,
    verticalAlign: VerticalAlign.CENTER,
    children:      (text ?? '').split('\n').map(line => para([run(line)])),
  })
}

function sectionHeaderCell(text: string, span: number): TableCell {
  return new TableCell({
    columnSpan:    span,
    shading:       { type: ShadingType.SOLID, color: SEC_BG },
    borders:       noneB,
    verticalAlign: VerticalAlign.CENTER,
    children: [para([run(text, { bold: true, color: 'FFFFFF', size: 19 })], AlignmentType.LEFT)],
  })
}

// Progress bar cell — uses shading blocks to simulate a bar
function progressBarCell(percentage: number, color: string, span = 1): TableCell {
  const filled = Math.round(Math.min(100, Math.max(0, percentage)))
  const empty  = 100 - filled
  // Inner table: two cells side-by-side, filled vs empty
  const innerTable = new Table({
    width: pct(100),
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({
      height: { value: 120, rule: 'exact' },
      children: [
        ...(filled > 0 ? [new TableCell({
          width: pct(filled),
          shading: { type: ShadingType.SOLID, color },
          borders: noneB,
          children: [para([run('')])],
        })] : []),
        ...(empty > 0 ? [new TableCell({
          width: pct(empty),
          shading: { type: ShadingType.SOLID, color: BAR_EMPTY },
          borders: noneB,
          children: [para([run('')])],
        })] : []),
      ],
    })],
  })
  return new TableCell({
    columnSpan:    span,
    borders:       allB,
    verticalAlign: VerticalAlign.CENTER,
    children:      [innerTable],
  })
}

function thCell(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan:    span,
    shading:       { type: ShadingType.SOLID, color: LABEL_BG },
    borders:       allB,
    verticalAlign: VerticalAlign.CENTER,
    children: [para([run(text, { bold: true, size: 16 })])],
  })
}

function tdCell(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan:    span,
    borders:       allB,
    verticalAlign: VerticalAlign.CENTER,
    children:      (text ?? '').split('\n').map(line => para([run(line, { size: 16 })])),
  })
}

function emptyRow(cols: number, msg = '(none)'): TableRow {
  return new TableRow({
    children: [new TableCell({
      columnSpan: cols,
      borders:    allB,
      children: [para([run(msg, { italics: true, color: '9CA3AF', size: 16 })])],
    })],
  })
}

// ── Main builder ──────────────────────────────────────────────
export function buildInstallationSections(
  content: InstallationContent,
  _reportDate: string,
  ganttTasks: GanttTask[],
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []

  // ── 1. Title bar ──────────────────────────────────────────
  out.push(new Table({
    width: pct(100),
    borders: { top: MED, bottom: MED, left: MED, right: MED, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({
      children: [
        // Left: title
        new TableCell({
          width:         pct(60),
          shading:       { type: ShadingType.SOLID, color: TITLE_BG },
          borders:       noneB,
          verticalAlign: VerticalAlign.CENTER,
          children: [para([run('Park Systems — Installation Passdown Report', { bold: true, color: 'FFFFFF', size: 26 })])],
        }),
        // Right: FSE + Date
        new TableCell({
          width:         pct(40),
          shading:       { type: ShadingType.SOLID, color: TITLE_BG },
          borders:       noneB,
          verticalAlign: VerticalAlign.CENTER,
          children: [
            para([run('Park FSE Name:  ', { bold: true, color: 'D1D5DB', size: 18 }), run(content.fse_name ?? '', { color: 'FFFFFF', size: 18 })], AlignmentType.RIGHT),
            para([run('Date:  ',          { bold: true, color: 'D1D5DB', size: 18 }), run(content.report_date ?? '', { color: 'FFFFFF', size: 18 })], AlignmentType.RIGHT),
          ],
        }),
      ],
    })],
  }))

  out.push(spacer())

  // ── 2. 3-column info section ──────────────────────────────
  // Columns: [label 10%][value 23%][label 10%][value 24%][label 10%][value 23%]
  const infoTable = new Table({
    width: pct(100),
    borders: outerB,
    rows: [
      // Section header row
      new TableRow({
        children: [
          sectionHeaderCell('System Information',      2),
          sectionHeaderCell('Installation Information', 2),
          sectionHeaderCell('Contact Info',             2),
        ],
      }),
      // Row 1
      new TableRow({ children: [
        labelCell('Customer',   1, 10), valueCell(content.customer,    1, 23),
        labelCell('Location',   1, 10), valueCell(content.location,    1, 24),
        labelCell('CRM Case ID',1, 10), valueCell(content.crm_case_id, 1, 23),
      ]}),
      // Row 2
      new TableRow({ children: [
        labelCell('Model',      1, 10), valueCell(content.model,       1, 23),
        labelCell('Site Survey Result', 1, 10),
        new TableCell({
          columnSpan: 1, width: pct(24), borders: allB, verticalAlign: VerticalAlign.CENTER,
          children: [para([
            run(content.site_survey ?? '', { size: 17 }),
            run('   '), run(content.noise_level ?? '', { size: 17 }),
          ])],
        }),
        labelCell('Main User Name', 1, 10), valueCell(content.main_user, 1, 23),
      ]}),
      // Row 3
      new TableRow({ children: [
        labelCell('SID',        1, 10), valueCell(content.sid,             1, 23),
        labelCell('Start Date', 1, 10), valueCell(content.start_date ?? '', 1, 24),
        labelCell('Main User Tel #', 1, 10), valueCell(content.tel,         1, 23),
      ]}),
      // Row 4
      new TableRow({ children: [
        labelCell('EQ ID',              1, 10), valueCell(content.eq_id,              1, 23),
        labelCell('Est. Complete Date', 1, 10), valueCell(content.est_complete_date ?? '', 1, 24),
        labelCell('Main User E-mail',   1, 10), valueCell(content.email,              1, 23),
      ]}),
    ],
  })
  out.push(infoTable)
  out.push(spacer())

  // ── 3. Total Cycle Time (left) + Individual Action Chart (right) ──
  const chart = content.action_chart ?? []
  const committedPct = Math.min(100, Math.max(0, content.committed_pct ?? 0))
  const actualPct    = Math.min(100, Math.max(0, content.actual_pct    ?? 0))

  // Build action chart rows
  const chartDataRows: TableRow[] = chart.length === 0
    ? [emptyRow(3)]
    : chart.map(row => new TableRow({
        children: [
          tdCell(row.item ?? ''),
          tdCell(row.committed ?? ''),
          tdCell(`${row.actual_pct ?? 0}%`),
        ],
      }))

  // Left column: Total Cycle Time (6 rows: header + committed label/bar + days + actual label/bar + days)
  // Right column: Action Chart (header + th row + data rows)
  // We'll create a 2-cell outer table, each cell containing an inner table
  const cycleTimeInner = new Table({
    width: pct(100),
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: THIN, insideVertical: NONE },
    rows: [
      // Committed label row
      new TableRow({ children: [
        new TableCell({
          borders: allB,
          children: [para([
            run('Committed Progress', { bold: true, size: 17 }),
            run(`   ${committedPct}%`, { size: 17, color: '3B82F6' }),
          ])],
        }),
      ]}),
      // Committed bar
      new TableRow({
        height: { value: 180, rule: 'exact' },
        children: [progressBarCell(committedPct, BAR_BLUE)],
      }),
      // Committed days
      new TableRow({ children: [
        new TableCell({
          borders: allB,
          children: [para([
            run('Total: ', { size: 16 }),
            run(String(content.total_days ?? 0), { bold: true, size: 17 }),
            run(' Days', { size: 16 }),
          ], AlignmentType.RIGHT)],
        }),
      ]}),
      // Actual label row
      new TableRow({ children: [
        new TableCell({
          borders: allB,
          children: [para([
            run('Actual Progress', { bold: true, size: 17 }),
            run(`   ${actualPct}%`, { size: 17, color: '10B981' }),
          ])],
        }),
      ]}),
      // Actual bar
      new TableRow({
        height: { value: 180, rule: 'exact' },
        children: [progressBarCell(actualPct, BAR_GREEN)],
      }),
      // Actual days
      new TableRow({ children: [
        new TableCell({
          borders: allB,
          children: [para([
            run('Progress: ', { size: 16 }),
            run(String(content.progress_days ?? 0), { bold: true, size: 17 }),
            run(' Days', { size: 16 }),
          ], AlignmentType.RIGHT)],
        }),
      ]}),
    ],
  })

  const actionChartInner = new Table({
    width: pct(100),
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: THIN, insideVertical: THIN },
    rows: [
      new TableRow({ children: [thCell('Item'), thCell('Committed'), thCell('Actual %')] }),
      ...chartDataRows,
    ],
  })

  out.push(new Table({
    width: pct(100),
    borders: outerB,
    rows: [
      // Header row
      new TableRow({ children: [
        sectionHeaderCell('Total Cycle Time',         1),
        sectionHeaderCell('Individual Action Chart',  1),
      ]}),
      // Content row
      new TableRow({ children: [
        new TableCell({
          width: pct(45),
          borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
          children: [cycleTimeInner],
        }),
        new TableCell({
          width: pct(55),
          borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
          children: [actionChartInner],
        }),
      ]}),
    ],
  }))

  out.push(spacer())

  // ── 4. Critical Item Summary ──────────────────────────────
  const summary = content.critical_item_summary ?? ''
  out.push(new Table({
    width: pct(100),
    borders: outerB,
    rows: [
      new TableRow({ children: [sectionHeaderCell('Critical Item Summary', 1)] }),
      new TableRow({ children: [
        new TableCell({
          borders: allB,
          children: summary.split('\n').map(line => para([run(line)])),
        }),
      ]}),
    ],
  }))

  out.push(spacer())

  // ── 5. Detail Report (left) + Next Plan (right) ───────────
  const details = content.detail_report ?? []
  const detailChildren: (Paragraph | Table)[] = []
  if (details.length === 0) {
    detailChildren.push(para([run('(none)', { italics: true, color: '9CA3AF' })]))
  } else {
    details.forEach((item, i) => {
      if (item.title) detailChildren.push(para([run(`${i + 1}. ${item.title}`, { bold: true, size: 17 })]))
      if (item.content) {
        item.content.split('\n').forEach(line => detailChildren.push(para([run(line)])))
      }
      if (i < details.length - 1) detailChildren.push(para([run('')]))
    })
  }

  const nextPlanText = content.next_plan ?? ''

  out.push(new Table({
    width: pct(100),
    borders: outerB,
    rows: [
      // Header row
      new TableRow({ children: [
        sectionHeaderCell('  Detail Report', 1),
        sectionHeaderCell('Next Plan Update', 1),
      ]}),
      // Content row
      new TableRow({ children: [
        new TableCell({
          width: pct(60),
          borders: allB,
          children: detailChildren,
        }),
        new TableCell({
          width: pct(40),
          borders: allB,
          children: nextPlanText.split('\n').map(line => para([run(line)])),
        }),
      ]}),
    ],
  }))

  out.push(spacer())

  // ── 6. Data Location ──────────────────────────────────────
  out.push(new Table({
    width: pct(100),
    borders: outerB,
    rows: [
      new TableRow({ children: [
        labelCell('Data Location:', 1, 12),
        valueCell(content.data_location ?? '', 1, 88),
      ]}),
    ],
  }))

  // ── 7. Gantt Task Schedule (if tasks exist) ───────────────
  if (ganttTasks.length > 0) {
    out.push(spacer())
    out.push(new Table({
      width: pct(100),
      borders: outerB,
      rows: [
        new TableRow({ children: [sectionHeaderCell('Gantt — Task Schedule', 9)] }),
        new TableRow({ children: [
          thCell('No'), thCell('Action'), thCell('Category'), thCell('Item'),
          thCell('Remark'), thCell('Status'), thCell('Days'),
          thCell('Start'), thCell('Complete'),
        ]}),
        ...ganttTasks.map(task => new TableRow({
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
        })),
      ],
    }))
  }

  return out
}
