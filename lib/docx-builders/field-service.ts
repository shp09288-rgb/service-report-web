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
import type { FieldServiceContent, CriticalItem } from '@/types/report'

// ── Border configs ────────────────────────────────────────────
const THIN = { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' }
const NONE = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' }
const allBorders  = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const noBorders   = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const tableBorders = {
  top: THIN, bottom: THIN, left: THIN, right: THIN,
  insideHorizontal: THIN, insideVertical: THIN,
}

// ── Color constants ───────────────────────────────────────────
const DARK_BG   = '374151' // gray-700 title
const LABEL_BG  = 'F3F4F6' // gray-100 label cells
const HEADER_BG = '4B5563' // gray-600 section headers

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

function vcWithNote(value: string, note: string): TableCell {
  return new TableCell({
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({ children: [new TextRun({ text: value ?? '', size: 18 })] }),
      new Paragraph({ children: [new TextRun({ text: note, italics: true, color: '9CA3AF', size: 16 })] }),
    ],
  })
}

function multilineCell(text: string, span = 1): TableCell {
  const lines = (text ?? '').split('\n')
  return new TableCell({
    columnSpan: span,
    borders: allBorders,
    children: lines.map(line => new Paragraph({ children: [new TextRun({ text: line, size: 18 })] })),
  })
}

function tbl(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows,
  })
}

function hdrRow(text: string, cols = 4): TableRow {
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

function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: '' })] })
}

// ── Main builder ──────────────────────────────────────────────
export function buildFieldServiceSections(
  content: FieldServiceContent,
  reportDate: string,
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
              children: [new TextRun({ text: 'Park Systems — Field Service Passdown Report', bold: true, color: 'FFFFFF', size: 28 })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `Report Date: ${reportDate}`, color: 'D1D5DB', size: 18 })],
            }),
          ],
        }),
      ],
    }),
  ]))

  out.push(spacer())

  // Personnel / Identity
  out.push(tbl([
    hdrRow('Engineer & Customer'),
    new TableRow({ children: [lc('FSE Name'), vc(content.fse_name), lc('Customer'), vc(content.customer)] }),
    new TableRow({ children: [lc('Location'), vc(content.location), lc('CRM Case ID'), vc(content.crm_case_id)] }),
    new TableRow({ children: [lc('Main User'), vc(content.main_user), lc('Email'), vc(content.email)] }),
    new TableRow({ children: [lc('SID'), vc(content.sid), lc('Tel'), vc(content.tel)] }),
  ]))

  out.push(spacer())

  // System Info
  out.push(tbl([
    hdrRow('System Information'),
    new TableRow({ children: [lc('Model'), vc(content.model), lc('EQ ID'), vc(content.eq_id)] }),
    new TableRow({ children: [lc('Site Survey'), vc(content.site_survey), lc('Noise Level'), vc(content.noise_level)] }),
  ]))

  out.push(spacer())

  // Service Info
  out.push(tbl([
    hdrRow('Service Information'),
    new TableRow({
      children: [
        lc('Start Time'),
        vc(content.start_time),
        lc('End Time'),
        vcWithNote(content.end_time, content.end_time_note ?? '고객사 출문 시간'),
      ],
    }),
    new TableRow({ children: [lc('Service Type'), vc(content.service_type), lc('Tool Status'), vc(content.tool_status)] }),
    new TableRow({ children: [lc('Progress'), vc(`${content.progress_pct ?? 0}%`), lc(''), vc('')] }),
  ]))

  out.push(spacer())

  // Problem / Target
  out.push(tbl([
    hdrRow('Problem & Target'),
    new TableRow({ children: [lc('Problem'), multilineCell(content.problem_statement, 3)] }),
    new TableRow({ children: [lc('Target'), multilineCell(content.target_statement, 3)] }),
  ]))

  out.push(spacer())

  // Daily Note
  out.push(tbl([
    hdrRow('Daily Note'),
    new TableRow({ children: [multilineCell(content.daily_note, 4)] }),
  ]))

  out.push(spacer())

  // Critical Items
  const critItems: CriticalItem[] = content.critical_items ?? []
  out.push(tbl([
    hdrRow('Critical Items'),
    new TableRow({
      children: [
        lc('No'),
        new TableCell({ borders: allBorders, shading: { type: ShadingType.SOLID, color: LABEL_BG }, children: [new Paragraph({ children: [new TextRun({ text: 'Item', bold: true, size: 18 })] })] }),
        new TableCell({ columnSpan: 2, borders: allBorders, shading: { type: ShadingType.SOLID, color: LABEL_BG }, children: [new Paragraph({ children: [new TextRun({ text: 'Sub-items', bold: true, size: 18 })] })] }),
      ],
    }),
    ...(critItems.length === 0
      ? [new TableRow({
          children: [new TableCell({
            columnSpan: 4,
            borders: allBorders,
            children: [new Paragraph({ children: [new TextRun({ text: '(none)', italics: true, color: '9CA3AF', size: 18 })] })],
          })],
        })]
      : critItems.map((item, idx) => new TableRow({
          children: [
            vc(String(idx + 1)),
            vc(item.text ?? ''),
            multilineCell((item.sub_items ?? []).join('\n'), 2),
          ],
        }))
    ),
  ]))

  out.push(spacer())

  // Data Location
  out.push(tbl([
    hdrRow('Data Location'),
    new TableRow({ children: [multilineCell(content.data_location, 4)] }),
  ]))

  out.push(spacer())

  // Work Completion
  const wc = content.work_completion ?? { type: '', reason: '', detail: '', time_log: '' }
  out.push(tbl([
    hdrRow('Work Completion'),
    new TableRow({ children: [lc('Type'), vc(wc.type, 3)] }),
    new TableRow({ children: [lc('Time Log'), vc(wc.time_log, 3)] }),
    new TableRow({ children: [lc('Reason'), vc(wc.reason, 3)] }),
    new TableRow({ children: [lc('Detail'), multilineCell(wc.detail, 3)] }),
  ]))

  return out
}
