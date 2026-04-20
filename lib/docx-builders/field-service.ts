import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  ImageRun,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import fs from 'fs'
import path from 'path'
import type { FieldServiceContent, CriticalItem, NoteImage } from '@/types/report'

// ── Logo loader (server-side) ─────────────────────────────────
function loadLogo(): Buffer | null {
  try {
    const p = path.join(process.cwd(), 'public', 'park-logo.png')
    return fs.existsSync(p) ? fs.readFileSync(p) : null
  } catch {
    return null
  }
}

// ── Color palette (resolved from Excel theme XML) ─────────────
// Source: references/Park Systems Field Service Passdown Report.xlsx
// dk1=#000000 lt1=#FFFFFF dk2=#1F497D lt2=#EEECE1 accent1=#4F81BD
// Title/header bg  → theme:0,tint:0   → #000000 (black)
// Section hdr bg   → theme:3,tint:0.4 → #F4F3EC (cream)
// Label cell bg    → theme:0,tint:0   → #000000 (black)
// Value cell bg    → theme:2,tint:-0.1→ #1B4170 (dark navy)
const TITLE_BG   = '000000'  // black  — header row
const SECT_BG    = 'F4F3EC'  // cream  — section header bars
const LABEL_BG   = '000000'  // black  — label cells
const VALUE_BG   = '1B4170'  // navy   — data value cells
const WHITE      = 'FFFFFF'
const BLACK      = '000000'
const ITEM_HDR   = '1F497D'  // dk2    — Critical Items column header

// ── Border configs ────────────────────────────────────────────
const THIN = { style: BorderStyle.SINGLE, size: 4, color: '595959' }
const NONE = { style: BorderStyle.NONE,   size: 0, color: WHITE    }
const allBorders   = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const noBorders    = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const tableBorders = {
  top: THIN, bottom: THIN, left: THIN, right: THIN,
  insideHorizontal: THIN, insideVertical: THIN,
}

// ── Compact cell margins (twips: 1cm = 567) ──────────────────
const CM = { top: 40, bottom: 40, left: 80, right: 80 }   // compact
const CM2 = { top: 50, bottom: 50, left: 100, right: 100 } // slightly looser for text areas

// ── Font sizes (half-points: 22 = 11pt) ──────────────────────
const SZ_TITLE  = 44  // 22pt
const SZ_HDR    = 28  // 14pt
const SZ_LABEL  = 22  // 11pt
const SZ_VALUE  = 22  // 11pt
const SZ_SMALL  = 20  // 10pt

// ── Paragraph helpers ─────────────────────────────────────────
function p(runs: TextRun[]): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0 }, children: runs })
}
function pCenter(runs: TextRun[]): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: runs })
}

// ── Cell factory: dark label (black bg, white text) ───────────
function lc(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan: span,
    shading: { type: ShadingType.SOLID, color: LABEL_BG },
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    margins: CM,
    children: [p([new TextRun({ text, bold: true, color: WHITE, size: SZ_LABEL })])],
  })
}

// ── Cell factory: dark navy value cell ───────────────────────
function vc(text: string, span = 1): TableCell {
  return new TableCell({
    columnSpan: span,
    shading: { type: ShadingType.SOLID, color: VALUE_BG },
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    margins: CM,
    children: [p([new TextRun({ text: text ?? '', color: WHITE, size: SZ_VALUE })])],
  })
}

// ── End time with italic note ────────────────────────────────
function vcWithNote(value: string, note: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.SOLID, color: VALUE_BG },
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    margins: CM,
    children: [
      p([new TextRun({ text: value ?? '', color: WHITE, size: SZ_VALUE })]),
      p([new TextRun({ text: note, italics: true, color: 'B8CBE4', size: SZ_SMALL })]),
    ],
  })
}

// ── White content cell (multi-line text) ─────────────────────
function textCell(text: string, span = 1): TableCell {
  const lines = (text ?? '').split('\n')
  return new TableCell({
    columnSpan: span,
    borders: allBorders,
    margins: CM2,
    children: lines.map(line =>
      new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: line, size: SZ_VALUE })] })
    ),
  })
}

// ── Hyperlink-aware data location cell ───────────────────────
function isUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('\\\\')
}
function hyperlinkCell(text: string, span = 1): TableCell {
  const lines = (text ?? '').split('\n')
  return new TableCell({
    columnSpan: span,
    borders: allBorders,
    margins: CM2,
    children: lines.map(line => {
      const t = line.trim()
      if (isUrl(t)) {
        return new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [
            new ExternalHyperlink({
              link: t,
              children: [new TextRun({ text: t, style: 'Hyperlink', size: SZ_VALUE })],
            }),
          ],
        })
      }
      return new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: line, size: SZ_VALUE })] })
    }),
  })
}

// ── Section header row (cream bg, bold dark text) ─────────────
function sectionHdrRow(text: string, cols: number): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: cols,
        shading: { type: ShadingType.SOLID, color: SECT_BG },
        borders: allBorders,
        verticalAlign: VerticalAlign.CENTER,
        margins: CM,
        children: [p([new TextRun({ text, bold: true, color: BLACK, size: SZ_HDR })])],
      }),
    ],
  })
}

// ── Table wrapper ─────────────────────────────────────────────
function tbl(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows,
  })
}

// ── Tiny gap paragraph between tables ────────────────────────
function gap(): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: '', size: 4 })] })
}

// ── Image scaling (max 280px wide) ──────────────────────────
const MAX_IMG_W = 280
function scaleImage(img: NoteImage): { width: number; height: number } {
  const w = img.width  ?? MAX_IMG_W
  const h = img.height ?? Math.round(MAX_IMG_W * 0.75)
  if (w <= MAX_IMG_W) return { width: w, height: h }
  return { width: MAX_IMG_W, height: Math.round(h * (MAX_IMG_W / w)) }
}

// ── Note cell: text + embedded images + captions ─────────────
function noteCell(item: CriticalItem, span = 1): TableCell {
  const children: Paragraph[] = []

  for (const line of (item.note ?? '').split('\n')) {
    children.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: line, size: SZ_VALUE })] }))
  }

  for (const img of (Array.isArray(item.note_images) ? item.note_images : [])) {
    if (!img.data_url) continue
    try {
      const [, base64] = img.data_url.split(',')
      if (!base64) continue
      const { width, height } = scaleImage(img)
      children.push(new Paragraph({
        spacing: { before: 40, after: 0 },
        children: [new ImageRun({ data: Buffer.from(base64, 'base64'), transformation: { width, height }, type: 'png' })],
      }))
      if (img.caption) {
        children.push(new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: img.caption, italics: true, color: '666666', size: SZ_SMALL })],
        }))
      }
    } catch { /* skip malformed */ }
  }

  if (children.length === 0) children.push(p([new TextRun({ text: '' })]))

  return new TableCell({ columnSpan: span, borders: allBorders, margins: CM2, children })
}

// ═════════════════════════════════════════════════════════════
// MAIN BUILDER
// ═════════════════════════════════════════════════════════════
export function buildFieldServiceSections(
  content: FieldServiceContent,
  reportDate: string,
): (Paragraph | Table)[] {
  const logoBuffer = loadLogo()
  const out: (Paragraph | Table)[] = []

  // ── A. HEADER BLOCK ──────────────────────────────────────
  // Row 1: [Logo (1col)] | [Title text (3col, black bg)] — all black
  // Row 2: [Report Date label] | [Date value] | [FSE label] | [FSE value]
  // Row 3: [Tool Status label] | [Tool Status value] | [Svc Type label] | [Svc Type value]
  // Row 4: [CRM Case ID label] | [CRM Case ID value (3col)]

  const logoCell = new TableCell({
    rowSpan: 2,
    shading: { type: ShadingType.SOLID, color: TITLE_BG },
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    width: { size: 14, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 80 },
    children: logoBuffer
      ? [pCenter([new ImageRun({ data: logoBuffer, transformation: { width: 76, height: 58 }, type: 'png' })])]
      : [pCenter([new TextRun({ text: 'Park\nSystems', bold: true, color: WHITE, size: SZ_LABEL })])],
  })

  const titleCell = new TableCell({
    rowSpan: 2,
    columnSpan: 2,
    shading: { type: ShadingType.SOLID, color: TITLE_BG },
    borders: allBorders,
    verticalAlign: VerticalAlign.CENTER,
    width: { size: 52, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 180, right: 80 },
    children: [
      p([new TextRun({ text: 'Park Systems', color: '8BA7C7', size: SZ_LABEL })]),
      p([new TextRun({ text: 'Field Service Passdown Report', bold: true, color: WHITE, size: SZ_TITLE })]),
    ],
  })

  out.push(tbl([
    new TableRow({
      children: [
        logoCell,
        titleCell,
        // Date label
        new TableCell({
          shading: { type: ShadingType.SOLID, color: LABEL_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: 17, type: WidthType.PERCENTAGE },
          margins: CM,
          children: [p([new TextRun({ text: 'Report Date', bold: true, color: WHITE, size: SZ_LABEL })])],
        }),
        // Date value
        new TableCell({
          shading: { type: ShadingType.SOLID, color: VALUE_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: 17, type: WidthType.PERCENTAGE },
          margins: CM,
          children: [p([new TextRun({ text: reportDate, color: WHITE, size: SZ_VALUE })])],
        }),
      ],
    }),
    // Row 2: FSE Name
    new TableRow({
      children: [
        // Logo + Title continue (handled by rowSpan above)
        new TableCell({
          shading: { type: ShadingType.SOLID, color: LABEL_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          margins: CM,
          children: [p([new TextRun({ text: 'Park FSE Name', bold: true, color: WHITE, size: SZ_LABEL })])],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: VALUE_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          margins: CM,
          children: [p([new TextRun({ text: content.fse_name, color: WHITE, size: SZ_VALUE })])],
        }),
      ],
    }),
    // Row 3: Tool Status
    new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: LABEL_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          columnSpan: 2,
          margins: CM,
          children: [p([new TextRun({ text: 'Current Tool Status', bold: true, color: WHITE, size: SZ_LABEL })])],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: VALUE_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          columnSpan: 2,
          margins: CM,
          children: [p([new TextRun({ text: content.tool_status, color: WHITE, size: SZ_VALUE })])],
        }),
      ],
    }),
  ]))

  out.push(gap())

  // ── B. 3-COLUMN INFORMATION (System / Service / Contact) ──
  // 6-column table: [lbl|val|lbl|val|lbl|val]
  // Column widths: 10% 23% 10% 24% 10% 23%
  out.push(tbl([
    // Section header row: 3 cream bars
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 2,
          shading: { type: ShadingType.SOLID, color: SECT_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          margins: CM,
          children: [p([new TextRun({ text: 'System Information', bold: true, color: BLACK, size: SZ_HDR })])],
        }),
        new TableCell({
          columnSpan: 2,
          shading: { type: ShadingType.SOLID, color: SECT_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          margins: CM,
          children: [p([new TextRun({ text: 'Service Information', bold: true, color: BLACK, size: SZ_HDR })])],
        }),
        new TableCell({
          columnSpan: 2,
          shading: { type: ShadingType.SOLID, color: SECT_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          margins: CM,
          children: [p([new TextRun({ text: 'Contact Info', bold: true, color: BLACK, size: SZ_HDR })])],
        }),
      ],
    }),
    // Row 1
    new TableRow({
      children: [
        lc('Customer'),      vc(content.customer),
        lc('Location'),      vc(content.location),
        lc('CRM Case ID'),   vc(content.crm_case_id),
      ],
    }),
    // Row 2
    new TableRow({
      children: [
        lc('Model'),         vc(content.model),
        lc('Site Survey'),   vc(content.site_survey),
        lc('Main User'),     vc(content.main_user),
      ],
    }),
    // Row 3
    new TableRow({
      children: [
        lc('SID'),           vc(content.sid),
        lc('Start Date'),    vc(content.start_date),
        lc('Tel #'),         vc(content.tel),
      ],
    }),
    // Row 4
    new TableRow({
      children: [
        lc('EQ ID'),         vc(content.eq_id),
        lc('Start Time'),    vc(content.start_time),
        lc('Email'),         vc(content.email),
      ],
    }),
    // Row 5
    new TableRow({
      children: [
        lc('Service Type'),  vc(content.service_type),
        lc('End Date/Time'),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: VALUE_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          margins: CM,
          children: [
            p([new TextRun({ text: `${content.end_date} ${content.end_time}`.trim(), color: WHITE, size: SZ_VALUE })]),
            p([new TextRun({ text: content.end_time_note ?? '고객사 출문 시간', italics: true, color: 'B8CBE4', size: SZ_SMALL })]),
          ],
        }),
        lc('Noise Level'),   vc(content.noise_level),
      ],
    }),
  ]))

  out.push(gap())

  // ── C. PROBLEM / TARGET ───────────────────────────────────
  out.push(tbl([
    // Header: 2 cream bars side by side
    new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: SECT_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: 50, type: WidthType.PERCENTAGE },
          margins: CM,
          children: [p([new TextRun({ text: 'Current Problem Statement', bold: true, color: BLACK, size: SZ_HDR })])],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: SECT_BG },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: 50, type: WidthType.PERCENTAGE },
          margins: CM,
          children: [p([new TextRun({ text: 'Current Target Statement', bold: true, color: BLACK, size: SZ_HDR })])],
        }),
      ],
    }),
    // Content (tall)
    new TableRow({
      children: [
        textCell(content.problem_statement),
        textCell(content.target_statement),
      ],
    }),
  ]))

  out.push(gap())

  // ── D. CRITICAL ITEMS ────────────────────────────────────
  // Cols: No | Title | Note (+ embedded images) | Progress
  const critItems: CriticalItem[] = Array.isArray(content.critical_items) ? content.critical_items : []

  out.push(tbl([
    sectionHdrRow('Daily Field Service Note / Critical Items', 4),
    // Column header
    new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: ITEM_HDR },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: 5, type: WidthType.PERCENTAGE },
          margins: CM,
          children: [pCenter([new TextRun({ text: 'No', bold: true, color: WHITE, size: SZ_LABEL })])],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: ITEM_HDR },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: 20, type: WidthType.PERCENTAGE },
          margins: CM,
          children: [p([new TextRun({ text: 'Title', bold: true, color: WHITE, size: SZ_LABEL })])],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: ITEM_HDR },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: 65, type: WidthType.PERCENTAGE },
          margins: CM,
          children: [p([new TextRun({ text: 'Note', bold: true, color: WHITE, size: SZ_LABEL })])],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: ITEM_HDR },
          borders: allBorders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: 10, type: WidthType.PERCENTAGE },
          margins: CM,
          children: [pCenter([new TextRun({ text: 'Progress', bold: true, color: WHITE, size: SZ_LABEL })])],
        }),
      ],
    }),
    // Data rows
    ...(critItems.length === 0
      ? [new TableRow({
          children: [new TableCell({
            columnSpan: 4,
            borders: allBorders,
            margins: CM2,
            children: [p([new TextRun({ text: '(none)', italics: true, color: '999999', size: SZ_VALUE })])],
          })],
        })]
      : critItems.map((item, idx) =>
          new TableRow({
            children: [
              new TableCell({
                borders: allBorders,
                verticalAlign: VerticalAlign.TOP,
                margins: CM,
                children: [pCenter([new TextRun({ text: String(idx + 1), bold: true, size: SZ_VALUE })])],
              }),
              new TableCell({
                borders: allBorders,
                verticalAlign: VerticalAlign.TOP,
                margins: CM,
                children: [p([new TextRun({ text: item.title ?? '', size: SZ_VALUE })])],
              }),
              noteCell(item),
              new TableCell({
                borders: allBorders,
                verticalAlign: VerticalAlign.TOP,
                margins: CM,
                children: [
                  pCenter([new TextRun({ text: `${item.progress_pct ?? 0}%`, bold: true, size: SZ_VALUE })]),
                ],
              }),
            ],
          })
        )
    ),
  ]))

  out.push(gap())

  // ── E. DATA LOCATION ────────────────────────────────────
  out.push(tbl([
    sectionHdrRow('Data Location', 2),
    new TableRow({
      children: [
        lc('File Path / URL'),
        hyperlinkCell(content.data_location),
      ],
    }),
  ]))

  out.push(gap())

  // ── F. WORK COMPLETION ───────────────────────────────────
  const wc = content.work_completion ?? { type: '', reason: '', detail: '', time_log: '' }
  out.push(tbl([
    sectionHdrRow('Work Completion', 4),
    new TableRow({ children: [lc('Type'), vc(wc.type, 1), lc('Time Log'), vc(wc.time_log, 1)] }),
    new TableRow({ children: [lc('Reason'), textCell(wc.reason, 3)] }),
    new TableRow({ children: [lc('Detail'), textCell(wc.detail, 3)] }),
  ]))

  return out
}
