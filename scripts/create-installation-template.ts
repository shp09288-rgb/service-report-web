#!/usr/bin/env tsx
/**
 * Generates references/templates/installation-report-template.docx
 * Run once (or re-run to regenerate):
 *   npx tsx scripts/create-installation-template.ts
 *
 * The output is a Word document with {placeholder} tags that
 * docxtemplater fills at export time.  Open in Word to refine styles.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'

// ── Colors ────────────────────────────────────────────────────
const C_TITLE  = '1B3769'   // Park Systems navy blue
const C_SEC    = '2E5FA3'   // Section headers – mid blue
const C_LABEL  = 'D9E2F3'   // Label cell background
const C_WHITE  = 'FFFFFF'
const C_DARK   = '1A1A2E'

// ── Border presets ────────────────────────────────────────────
const BD_THIN  = { style: BorderStyle.SINGLE, size: 4,  color: 'AAAAAA' }
const BD_MED   = { style: BorderStyle.SINGLE, size: 8,  color: '2E5FA3' }
const BD_NONE  = { style: BorderStyle.NONE,   size: 0,  color: 'FFFFFF' }
const borders_all  = { top: BD_THIN, bottom: BD_THIN, left: BD_THIN, right: BD_THIN }
const borders_none = { top: BD_NONE, bottom: BD_NONE, left: BD_NONE, right: BD_NONE }
const borders_outer = {
  top: BD_MED, bottom: BD_MED, left: BD_MED, right: BD_MED,
  insideHorizontal: BD_THIN, insideVertical: BD_THIN,
}

// ── Width helpers ─────────────────────────────────────────────
const wp  = (n: number) => ({ size: n, type: WidthType.PERCENTAGE })
const wdx = (n: number) => ({ size: n, type: WidthType.DXA })

// ── Text helpers ──────────────────────────────────────────────
function tr(text: string, opts: {
  bold?: boolean; color?: string; size?: number; italics?: boolean; font?: string
} = {}) {
  return new TextRun({
    text,
    bold:    opts.bold,
    color:   opts.color ?? C_DARK,
    size:    opts.size  ?? 18,
    italics: opts.italics,
    font:    opts.font  ?? 'Calibri',
  })
}

function para(children: TextRun[], align?: typeof AlignmentType[keyof typeof AlignmentType]) {
  return new Paragraph({ alignment: align, children, spacing: { before: 20, after: 20 } })
}

function paraTag(tag: string) {
  return new Paragraph({
    spacing: { before: 20, after: 20 },
    children: [new TextRun({ text: tag, size: 18, font: 'Calibri', color: C_DARK })],
  })
}

function spacer(pt = 60) {
  return new Paragraph({ children: [], spacing: { before: pt, after: 0 } })
}

// ── Cell builders ─────────────────────────────────────────────
function labelCell(text: string, span = 1, pct?: number): TableCell {
  return new TableCell({
    columnSpan:    span,
    width:         pct ? wp(pct) : undefined,
    shading:       { type: ShadingType.SOLID, color: C_LABEL },
    borders:       borders_all,
    verticalAlign: VerticalAlign.CENTER,
    children:      [para([tr(text, { bold: true, size: 17, color: '1B3769' })])],
  })
}

function valueCell(tag: string, span = 1, pct?: number): TableCell {
  return new TableCell({
    columnSpan:    span,
    width:         pct ? wp(pct) : undefined,
    borders:       borders_all,
    verticalAlign: VerticalAlign.CENTER,
    children:      [paraTag(tag)],
  })
}

function sectionHeader(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan:    span,
    shading:       { type: ShadingType.SOLID, color: C_SEC },
    borders:       borders_none,
    verticalAlign: VerticalAlign.CENTER,
    children: [para([tr(text, { bold: true, color: C_WHITE, size: 18 })], AlignmentType.LEFT)],
  })
}

function thCell(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan:    span,
    shading:       { type: ShadingType.SOLID, color: C_LABEL },
    borders:       borders_all,
    verticalAlign: VerticalAlign.CENTER,
    children: [para([tr(text, { bold: true, size: 17, color: '1B3769' })], AlignmentType.CENTER)],
  })
}

function tdCell(tag: string, span = 1, align?: typeof AlignmentType[keyof typeof AlignmentType]): TableCell {
  return new TableCell({
    columnSpan:    span,
    borders:       borders_all,
    verticalAlign: VerticalAlign.CENTER,
    children:      [para([new TextRun({ text: tag, size: 17, font: 'Calibri', color: C_DARK })], align)],
  })
}

// ── Section 1: Header ─────────────────────────────────────────
function buildHeader(logoBuffer: Buffer | null): Table {
  const logoCell = new TableCell({
    width:         wp(15),
    shading:       { type: ShadingType.SOLID, color: C_TITLE },
    borders:       borders_none,
    verticalAlign: VerticalAlign.CENTER,
    children: logoBuffer
      ? [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [new ImageRun({
            data: logoBuffer,
            transformation: { width: 100, height: 40 },
            type: 'png',
          })],
        })]
      : [para([tr('PARK SYSTEMS', { bold: true, color: C_WHITE, size: 16 })], AlignmentType.CENTER)],
  })

  const titleCell = new TableCell({
    width:         wp(55),
    shading:       { type: ShadingType.SOLID, color: C_TITLE },
    borders:       borders_none,
    verticalAlign: VerticalAlign.CENTER,
    children: [para([tr('Park Systems — Installation Passdown Report', {
      bold: true, color: C_WHITE, size: 24,
    })], AlignmentType.CENTER)],
  })

  const infoCell = new TableCell({
    width:         wp(30),
    shading:       { type: ShadingType.SOLID, color: C_TITLE },
    borders:       borders_none,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      para([
        tr('Park FSE Name:  ', { bold: true, color: 'B0C4DE', size: 17 }),
        tr('{fse_name}',       { color: C_WHITE, size: 17 }),
      ], AlignmentType.RIGHT),
      para([
        tr('Date:  ', { bold: true, color: 'B0C4DE', size: 17 }),
        tr('{report_date}', { color: C_WHITE, size: 17 }),
      ], AlignmentType.RIGHT),
    ],
  })

  return new Table({
    width: wp(100),
    borders: { top: BD_MED, bottom: BD_MED, left: BD_MED, right: BD_MED,
               insideHorizontal: BD_NONE, insideVertical: BD_NONE },
    rows: [new TableRow({
      height: { value: 720, rule: 'atLeast' },
      children: [logoCell, titleCell, infoCell],
    })],
  })
}

// ── Section 2: System Information ─────────────────────────────
function buildSystemInfo(): Table {
  return new Table({
    width: wp(100),
    borders: borders_outer,
    rows: [
      // Header row
      new TableRow({ children: [
        sectionHeader('System Information',      2),
        sectionHeader('Installation Information', 2),
        sectionHeader('Contact Info',             2),
      ]}),
      // Row 1: Customer / Location / CRM
      new TableRow({ children: [
        labelCell('Customer',    1, 10), valueCell('{customer}',    1, 23),
        labelCell('Location',    1, 10), valueCell('{location}',    1, 24),
        labelCell('CRM Case ID', 1, 10), valueCell('{crm_case_id}', 1, 23),
      ]}),
      // Row 2: Model / Site Survey + Noise / Main User
      new TableRow({ children: [
        labelCell('Model', 1, 10),
        valueCell('{model}', 1, 23),
        labelCell('Site Survey Result', 1, 10),
        new TableCell({
          columnSpan: 1, width: wp(24), borders: borders_all, verticalAlign: VerticalAlign.CENTER,
          children: [para([
            new TextRun({ text: '{site_survey}', size: 18, font: 'Calibri' }),
            new TextRun({ text: '   ', size: 18 }),
            new TextRun({ text: '{noise_level}', size: 18, font: 'Calibri' }),
          ])],
        }),
        labelCell('Main User Name', 1, 10), valueCell('{main_user}', 1, 23),
      ]}),
      // Row 3: SID / Start Date / Tel
      new TableRow({ children: [
        labelCell('SID',        1, 10), valueCell('{sid}',        1, 23),
        labelCell('Start Date', 1, 10), valueCell('{start_date}', 1, 24),
        labelCell('Main User Tel #', 1, 10), valueCell('{tel}',   1, 23),
      ]}),
      // Row 4: EQ ID / Est. Complete / Email
      new TableRow({ children: [
        labelCell('EQ ID',              1, 10), valueCell('{eq_id}',             1, 23),
        labelCell('Est. Complete Date', 1, 10), valueCell('{est_complete_date}', 1, 24),
        labelCell('Main User E-mail',   1, 10), valueCell('{email}',             1, 23),
      ]}),
      // Row 5: Service Type / Start Time / End Time
      new TableRow({ children: [
        labelCell('Service Type', 1, 10), valueCell('{service_type}', 1, 23),
        labelCell('Start Time',   1, 10), valueCell('{start_time}',   1, 24),
        labelCell('End Time',     1, 10), valueCell('{end_time}',     1, 23),
      ]}),
    ],
  })
}

// ── Section 3: Cycle Time + Action Chart ──────────────────────
function buildCycleTimeAndActionChart(): Table {
  // Left cell: Cycle Time summary
  const cycleInner = new Table({
    width: wp(100),
    borders: { ...borders_none, insideHorizontal: BD_THIN },
    rows: [
      new TableRow({ children: [new TableCell({
        borders: borders_all,
        children: [para([
          tr('Committed Progress', { bold: true, size: 17 }),
          tr('   '),
          tr('{committed_pct}', { bold: true, size: 17, color: '1B3769' }),
        ])],
      })]}),
      new TableRow({ children: [new TableCell({
        borders: borders_all,
        children: [para([
          tr('Total: ', { size: 16 }),
          tr('{total_days}', { bold: true, size: 17 }),
          tr(' Days', { size: 16 }),
        ], AlignmentType.RIGHT)],
      })]}),
      new TableRow({ children: [new TableCell({
        borders: borders_all,
        children: [para([
          tr('Actual Progress', { bold: true, size: 17 }),
          tr('   '),
          tr('{actual_pct}', { bold: true, size: 17, color: '2E5FA3' }),
        ])],
      })]}),
      new TableRow({ children: [new TableCell({
        borders: borders_all,
        children: [para([
          tr('Progress: ', { size: 16 }),
          tr('{progress_days}', { bold: true, size: 17 }),
          tr(' Days', { size: 16 }),
        ], AlignmentType.RIGHT)],
      })]}),
    ],
  })

  // Right cell: Action chart with loop + radar chart image placeholder
  const actionChartInner = new Table({
    width: wp(100),
    borders: { ...borders_none, insideHorizontal: BD_THIN, insideVertical: BD_THIN },
    rows: [
      // Header row
      new TableRow({ children: [
        thCell('Item',      1),
        thCell('Committed', 1),
        thCell('Actual %',  1),
      ]}),
      // Loop row — {#action_chart} in first cell, {/action_chart} in last cell
      new TableRow({ children: [
        new TableCell({
          borders: borders_all, verticalAlign: VerticalAlign.CENTER,
          children: [para([new TextRun({ text: '{#action_chart}{item}', size: 17, font: 'Calibri' })])],
        }),
        new TableCell({
          borders: borders_all, verticalAlign: VerticalAlign.CENTER,
          children: [para([new TextRun({ text: '{committed}', size: 17, font: 'Calibri' })], AlignmentType.CENTER)],
        }),
        new TableCell({
          borders: borders_all, verticalAlign: VerticalAlign.CENTER,
          children: [para([new TextRun({ text: '{actual_pct}{/action_chart}', size: 17, font: 'Calibri' })], AlignmentType.CENTER)],
        }),
      ]}),
    ],
  })

  // Radar chart image placeholder paragraph — docxtemplater-image-module-free
  // replaces {%radar_chart} with the generated PNG at export time.
  const radarPlaceholder = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 40 },
    children: [new TextRun({ text: '{%radar_chart}', size: 18, font: 'Calibri', color: C_DARK })],
  })

  return new Table({
    width: wp(100),
    borders: borders_outer,
    rows: [
      // Header
      new TableRow({ children: [
        sectionHeader('Total Cycle Time',        1),
        sectionHeader('Individual Action Chart',  1),
      ]}),
      // Content
      new TableRow({ children: [
        new TableCell({
          width: wp(40), borders: borders_all, verticalAlign: VerticalAlign.TOP,
          children: [cycleInner],
        }),
        new TableCell({
          width: wp(60), borders: borders_all, verticalAlign: VerticalAlign.TOP,
          children: [actionChartInner, radarPlaceholder],
        }),
      ]}),
    ],
  })
}

// ── Section 4: Critical Item Summary ──────────────────────────
function buildCriticalSummary(): Table {
  return new Table({
    width: wp(100),
    borders: borders_outer,
    rows: [
      new TableRow({ children: [sectionHeader('Critical Item Summary', 1)] }),
      new TableRow({ children: [new TableCell({
        borders: borders_all,
        children: [new Paragraph({
          spacing: { before: 60, after: 60 },
          children: [new TextRun({ text: '{critical_item_summary}', size: 18, font: 'Calibri' })],
        })],
      })]}),
    ],
  })
}

// ── Section 5: Detail Report + Next Plan ──────────────────────
function buildDetailAndNextPlan(): Table {
  // Detail report uses a paragraph-level loop
  // {#detail_report} paragraph / {dt_num}. {dt_title} / {dt_content} / {/detail_report} paragraph
  const detailCell = new TableCell({
    width: wp(60), borders: borders_all, verticalAlign: VerticalAlign.TOP,
    children: [
      // Loop open
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: '{#detail_report}', size: 18, font: 'Calibri' })],
      }),
      // Title (bold)
      new Paragraph({
        spacing: { before: 40, after: 0 },
        children: [new TextRun({ text: '{dt_num}. {dt_title}', bold: true, size: 18, font: 'Calibri' })],
      }),
      // Content
      new Paragraph({
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: '{dt_content}', size: 18, font: 'Calibri' })],
      }),
      // Loop close
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: '{/detail_report}', size: 18, font: 'Calibri' })],
      }),
    ],
  })

  const nextPlanCell = new TableCell({
    width: wp(40), borders: borders_all, verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: '{next_plan}', size: 18, font: 'Calibri' })],
    })],
  })

  return new Table({
    width: wp(100),
    borders: borders_outer,
    rows: [
      new TableRow({ children: [
        sectionHeader('Detail Report',    1),
        sectionHeader('Next Plan Update', 1),
      ]}),
      new TableRow({ children: [detailCell, nextPlanCell] }),
    ],
  })
}

// ── Section 6: Data Location ──────────────────────────────────
function buildDataLocation(): Table {
  return new Table({
    width: wp(100),
    borders: borders_outer,
    rows: [new TableRow({ children: [
      labelCell('Data Location', 1, 12),
      valueCell('{data_location}', 1, 88),
    ]})],
  })
}

// ── Section 7: Work Completion ────────────────────────────────
function buildWorkCompletion(): Table {
  return new Table({
    width: wp(100),
    borders: borders_outer,
    rows: [
      new TableRow({ children: [sectionHeader('Work Completion — 작업 종료 후 근무 형태', 4)] }),
      // Row: type
      new TableRow({ children: [
        labelCell('근무 형태', 1, 12),
        valueCell('{wc_type}', 3, 88),
      ]}),
      // Row: reason
      new TableRow({ children: [
        labelCell('전환 사유', 1, 12),
        valueCell('{wc_reason}', 3, 88),
      ]}),
      // Row: detail
      new TableRow({ children: [
        labelCell('수행 업무', 1, 12),
        valueCell('{wc_detail}', 3, 88),
      ]}),
      // Row: time log
      new TableRow({ children: [
        labelCell('수행 시간', 1, 12),
        valueCell('{wc_time_log}', 3, 88),
      ]}),
    ],
  })
}

// ── Section 8: Gantt Task Schedule ───────────────────────────
function buildGantt(): Table {
  return new Table({
    width: wp(100),
    borders: borders_outer,
    rows: [
      // Section header
      new TableRow({ children: [sectionHeader('Gantt — Task Schedule', 10)] }),
      // Column headers
      new TableRow({ children: [
        thCell('No'),        thCell('Action'),    thCell('Category'),
        thCell('Item'),      thCell('Remark'),    thCell('Status'),
        thCell('Days'),      thCell('Plan/Action'), thCell('Start'), thCell('Complete'),
      ]}),
      // Loop row — {#gantt_rows} opens in first cell, {/gantt_rows} closes in last
      new TableRow({ children: [
        new TableCell({
          borders: borders_all, verticalAlign: VerticalAlign.CENTER,
          children: [para([new TextRun({ text: '{#gantt_rows}{no}', size: 16, font: 'Calibri' })])],
        }),
        tdCell('{action}'),
        tdCell('{category}'),
        tdCell('{item}'),
        tdCell('{remark}'),
        tdCell('{status}'),
        new TableCell({
          borders: borders_all, verticalAlign: VerticalAlign.CENTER,
          children: [para([new TextRun({ text: '{days}', size: 16, font: 'Calibri' })], AlignmentType.CENTER)],
        }),
        new TableCell({
          borders: borders_all, verticalAlign: VerticalAlign.CENTER,
          children: [para([new TextRun({ text: '{type}', size: 16, font: 'Calibri' })], AlignmentType.CENTER)],
        }),
        tdCell('{start}'),
        new TableCell({
          borders: borders_all, verticalAlign: VerticalAlign.CENTER,
          children: [para([new TextRun({ text: '{complete}{/gantt_rows}', size: 16, font: 'Calibri' })])],
        }),
      ]}),
    ],
  })
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const outDir  = path.join(process.cwd(), 'references', 'templates')
  const outPath = path.join(outDir, 'installation-report-template.docx')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  // Load logo if available
  const logoPath = path.join(process.cwd(), 'public', 'park-logo.png')
  const logoBuffer: Buffer | null = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null
  if (!logoBuffer) console.warn('⚠  public/park-logo.png not found — using text fallback')

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
      },
      children: [
        buildHeader(logoBuffer),
        spacer(80),
        buildSystemInfo(),
        spacer(80),
        buildCycleTimeAndActionChart(),
        spacer(80),
        buildCriticalSummary(),
        spacer(80),
        buildDetailAndNextPlan(),
        spacer(80),
        buildDataLocation(),
        spacer(80),
        buildWorkCompletion(),
        spacer(80),
        buildGantt(),
      ],
    }],
  })

  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(outPath, buf)
  console.log(`✅  Template written → ${outPath}`)
  console.log('   Open in Word to adjust colors / logo / layout, then save.')
}

main().catch(e => { console.error(e); process.exit(1) })
