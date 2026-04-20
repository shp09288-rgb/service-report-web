import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  ImageRun,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import fs from 'fs'
import path from 'path'
import type { CriticalItem, FieldServiceContent, NoteImage } from '@/types/report'

const COLOR = {
  blue: '4F81BD',
  blueDark: '1F497D',
  headerGray: 'D9D9D9',
  labelGray: 'F2F2F2',
  statusBeige: 'DDD9C3',
  white: 'FFFFFF',
  black: '000000',
  border: '000000',
  muted: '666666',
} as const

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: COLOR.border }
const BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
  insideHorizontal: BORDER,
  insideVertical: BORDER,
}
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const PAD = { top: 30, bottom: 30, left: 70, right: 70 }
const PAD_TEXT = { top: 45, bottom: 45, left: 90, right: 90 }
const PAD_HEADER = { top: 55, bottom: 55, left: 90, right: 90 }

const SZ_TITLE = 30
const SZ_TITLE_SUB = 22
const SZ_SECTION = 18
const SZ_LABEL = 16
const SZ_VALUE = 16
const SZ_SMALL = 14

const COL_WIDTHS = [156, 36, 130, 130, 130, 130, 130, 56, 130, 130, 130, 130, 130, 130, 130, 130, 81, 130, 58, 130, 130, 130, 260]

function sumCols(start: number, span: number): number {
  return COL_WIDTHS.slice(start, start + span).reduce((a, b) => a + b, 0) * 18
}

function loadLogo(): Buffer | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'park-logo.png'),
    path.join(process.cwd(), 'park-logo.png'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p)
    } catch {
      // ignore
    }
  }
  return null
}

function para(children: (TextRun | ImageRun | ExternalHyperlink)[], opts?: Record<string, unknown>): Paragraph {
  return new Paragraph(Object.assign({ spacing: { before: 0, after: 0, line: 240 }, children }, opts ?? {}))
}

function txt(text: string, size = SZ_VALUE, opts?: Record<string, unknown>): TextRun {
  return new TextRun(Object.assign({ text: text ?? '', size, color: COLOR.black }, opts ?? {}))
}

function linkParagraph(line: string): Paragraph {
  const t = line.trim()
  if (isUrl(t)) {
    return para([
      new ExternalHyperlink({
        link: t,
        children: [new TextRun({ text: t, style: 'Hyperlink', size: SZ_VALUE })],
      }),
    ])
  }
  return para([txt(line)])
}

function cell({
  text,
  children,
  span = 1,
  width,
  bg,
  color = COLOR.black,
  bold = false,
  align,
  margins = PAD,
  verticalAlign = VerticalAlign.CENTER,
}: {
  text?: string
  children?: Paragraph[]
  span?: number
  width?: number
  bg?: string
  color?: string
  bold?: boolean
  align?: any
  margins?: { top: number; bottom: number; left: number; right: number }
  verticalAlign?: any
}): TableCell {
  return new TableCell({
    columnSpan: span,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: bg ? { type: ShadingType.SOLID, color: bg } : undefined,
    borders: CELL_BORDERS,
    margins,
    verticalAlign,
    children:
      children ?? [
        new Paragraph({
          alignment: align,
          spacing: { before: 0, after: 0, line: 240 },
          children: [new TextRun({ text: text ?? '', size: SZ_VALUE, color, bold })],
        }),
      ],
  })
}

function sectionHeader(text: string, span = 23): TableRow {
  return new TableRow({
    children: [
      cell({
        text,
        span,
        bg: COLOR.blue,
        color: COLOR.white,
        bold: true,
        margins: PAD_HEADER,
      }),
    ],
  })
}

function table(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: COL_WIDTHS.map((w) => w * 18),
    borders: BORDERS,
    rows,
  })
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /^\\\\/.test(s)
}

function scaleImage(img: NoteImage): { width: number; height: number } {
  const maxW = 320
  const fallbackW = 240
  const fallbackH = 180
  const w = img.width ?? fallbackW
  const h = img.height ?? fallbackH
  if (w <= maxW) return { width: w, height: h }
  const ratio = maxW / w
  return { width: maxW, height: Math.max(60, Math.round(h * ratio)) }
}

function buildCriticalNoteParagraphs(item: CriticalItem, index: number): Paragraph[] {
  const blocks: Paragraph[] = []
  const title = item.title?.trim() || `Item ${index + 1}`
  blocks.push(
    para([
      txt(`□ ${title} `, SZ_VALUE, { bold: true }),
      txt(`(진행률 : ${Math.max(0, Math.min(100, item.progress_pct ?? 0))}%)`, SZ_SMALL, { color: 'E67E22' }),
    ]),
  )

  const noteLines = (item.note ?? '').split('\n')
  for (const line of noteLines) {
    blocks.push(para([txt(line || ' ', SZ_VALUE)]))
  }

  const noteImages = Array.isArray(item.note_images) ? item.note_images : []
  for (const img of noteImages) {
    if (!img?.data_url) continue
    try {
      const [, base64] = img.data_url.split(',')
      if (!base64) continue
      const scaled = scaleImage(img)
      blocks.push(
        new Paragraph({
          spacing: { before: 50, after: 0 },
          children: [new ImageRun({ data: Buffer.from(base64, 'base64'), transformation: scaled, type: 'png' })],
        }),
      )
      if (img.caption?.trim()) {
        blocks.push(para([txt(img.caption.trim(), SZ_SMALL, { italics: true, color: COLOR.muted })]))
      }
    } catch {
      // ignore malformed image
    }
  }

  if (index < 9999) {
    blocks.push(para([txt(' ', 8)]))
  }
  return blocks
}

function buildLargeTextCell(text: string, span: number): TableCell {
  const lines = (text ?? '').split('\n')
  const children = lines.length
    ? lines.map((line) => para([txt(line || ' ', SZ_VALUE)]))
    : [para([txt(' ')])]
  return cell({ span, children, margins: PAD_TEXT, verticalAlign: VerticalAlign.TOP })
}

function buildDataLocationCell(text: string): TableCell {
  const lines = (text ?? '').split('\n')
  return cell({
    span: 20,
    children: lines.length ? lines.map(linkParagraph) : [para([txt(' ')])],
    margins: PAD_TEXT,
    verticalAlign: VerticalAlign.TOP,
  })
}

function buildHeaderTable(content: FieldServiceContent, reportDate: string, logoBuffer: Buffer | null): Table {
  const titleChildren: Paragraph[] = [
    new Paragraph({
      spacing: { before: 0, after: 0, line: 240 },
      children: [
        ...(logoBuffer
          ? [new ImageRun({ data: logoBuffer, transformation: { width: 62, height: 48 }, type: 'png' })]
          : []),
        new TextRun({ text: logoBuffer ? '  ' : '', size: SZ_SMALL }),
        new TextRun({ text: 'Park Systems Field Service Passdown Report', bold: true, size: SZ_TITLE, color: COLOR.black }),
      ],
    }),
  ]

  return table([
    new TableRow({
      children: [
        cell({ span: 17, width: sumCols(0, 17), children: titleChildren, margins: { top: 80, bottom: 80, left: 90, right: 90 } }),
        cell({ span: 3, width: sumCols(17, 3), text: 'Report Date:', bg: COLOR.headerGray, bold: true }),
        cell({ span: 3, width: sumCols(20, 3), text: reportDate, bold: true, align: AlignmentType.CENTER }),
      ],
    }),
    new TableRow({
      children: [
        cell({ span: 1, width: sumCols(0, 1), text: '' }),
        cell({ span: 5, width: sumCols(1, 5), text: 'Current Tool Status', bg: COLOR.labelGray, bold: true, align: AlignmentType.CENTER }),
        cell({ span: 10, width: sumCols(6, 10), text: content.tool_status || '', bg: COLOR.statusBeige, bold: true, align: AlignmentType.CENTER }),
        cell({ span: 4, width: sumCols(16, 4), text: 'Park FSEs Name:', bg: COLOR.headerGray, bold: true }),
        cell({ span: 3, width: sumCols(20, 3), text: content.fse_name || '', bold: true, align: AlignmentType.CENTER }),
      ],
    }),
  ])
}

function buildInfoTable(content: FieldServiceContent): Table {
  return table([
    new TableRow({
      children: [
        cell({ span: 7, width: sumCols(0, 7), text: 'System Information', bg: COLOR.blue, color: COLOR.white, bold: true }),
        cell({ span: 10, width: sumCols(7, 10), text: 'Service Information', bg: COLOR.blue, color: COLOR.white, bold: true }),
        cell({ span: 6, width: sumCols(17, 6), text: 'Contact Info', bg: COLOR.blue, color: COLOR.white, bold: true }),
      ],
    }),
    new TableRow({
      children: [
        cell({ span: 1, width: sumCols(0, 1), text: 'Customer', bg: COLOR.labelGray }),
        cell({ span: 6, width: sumCols(1, 6), text: content.customer, align: AlignmentType.CENTER }),
        cell({ span: 3, width: sumCols(7, 3), text: 'Location', bg: COLOR.labelGray }),
        cell({ span: 7, width: sumCols(10, 7), text: content.location, align: AlignmentType.CENTER }),
        cell({ span: 2, width: sumCols(17, 2), text: 'CRM Case ID', bg: COLOR.labelGray }),
        cell({ span: 4, width: sumCols(19, 4), text: content.crm_case_id, align: AlignmentType.CENTER }),
      ],
    }),
    new TableRow({
      children: [
        cell({ span: 1, width: sumCols(0, 1), text: 'Model', bg: COLOR.labelGray }),
        cell({ span: 6, width: sumCols(1, 6), text: content.model, align: AlignmentType.CENTER }),
        cell({ span: 3, width: sumCols(7, 3), text: 'Site Survey Result', bg: COLOR.labelGray }),
        cell({ span: 7, width: sumCols(10, 7), text: content.site_survey, align: AlignmentType.CENTER }),
        cell({ span: 2, width: sumCols(17, 2), text: 'Main User Name', bg: COLOR.labelGray }),
        cell({ span: 4, width: sumCols(19, 4), text: content.main_user, align: AlignmentType.CENTER }),
      ],
    }),
    new TableRow({
      children: [
        cell({ span: 1, width: sumCols(0, 1), text: 'SID', bg: COLOR.labelGray }),
        cell({ span: 6, width: sumCols(1, 6), text: content.sid, align: AlignmentType.CENTER }),
        cell({ span: 3, width: sumCols(7, 3), text: 'Start Date', bg: COLOR.labelGray }),
        cell({ span: 3, width: sumCols(10, 3), text: content.start_date, align: AlignmentType.CENTER }),
        cell({ span: 4, width: sumCols(13, 4), text: '', align: AlignmentType.CENTER }),
        cell({ span: 2, width: sumCols(17, 2), text: 'Main User Tel#', bg: COLOR.labelGray }),
        cell({ span: 4, width: sumCols(19, 4), text: content.tel, align: AlignmentType.CENTER }),
      ],
    }),
    new TableRow({
      children: [
        cell({ span: 1, width: sumCols(0, 1), text: 'EQ ID', bg: COLOR.labelGray }),
        cell({ span: 6, width: sumCols(1, 6), text: content.eq_id, align: AlignmentType.CENTER }),
        cell({ span: 3, width: sumCols(7, 3), text: 'Start Time', bg: COLOR.labelGray }),
        cell({ span: 3, width: sumCols(10, 3), text: content.start_time, align: AlignmentType.CENTER }),
        cell({ span: 4, width: sumCols(13, 4), text: '', align: AlignmentType.CENTER }),
        cell({ span: 2, width: sumCols(17, 2), text: 'Main User E-mail', bg: COLOR.labelGray }),
        cell({ span: 4, width: sumCols(19, 4), text: content.email, align: AlignmentType.CENTER }),
      ],
    }),
    new TableRow({
      children: [
        cell({ span: 1, width: sumCols(0, 1), text: 'Service Type', bg: COLOR.labelGray }),
        cell({ span: 6, width: sumCols(1, 6), text: content.service_type, align: AlignmentType.CENTER }),
        cell({ span: 3, width: sumCols(7, 3), text: 'End Time', bg: COLOR.labelGray }),
        cell({
          span: 7,
          width: sumCols(10, 7),
          children: [
            para([txt(content.end_time || '', SZ_VALUE)], { alignment: AlignmentType.CENTER }),
            para([txt(content.end_time_note || '고객사 출문 시간', SZ_SMALL, { color: COLOR.muted, italics: true })], {
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
        cell({ span: 2, width: sumCols(17, 2), text: '', bg: COLOR.labelGray }),
        cell({ span: 4, width: sumCols(19, 4), text: '', align: AlignmentType.CENTER }),
      ],
    }),
  ])
}

function buildProblemTable(content: FieldServiceContent): Table {
  return table([
    new TableRow({
      children: [
        cell({ span: 12, width: sumCols(0, 12), text: 'Current Problem Statement', bg: COLOR.blue, color: COLOR.white, bold: true }),
        cell({ span: 11, width: sumCols(12, 11), text: 'Current Target Statement (What is the existing criteria?)', bg: COLOR.blue, color: COLOR.white, bold: true }),
      ],
    }),
    new TableRow({
      children: [
        buildLargeTextCell(content.problem_statement, 12),
        buildLargeTextCell(content.target_statement, 11),
      ],
    }),
  ])
}

function buildCriticalItemsTable(content: FieldServiceContent): Table {
  const items = Array.isArray(content.critical_items) ? content.critical_items : []
  const paragraphs = items.length
    ? items.flatMap((item, index) => buildCriticalNoteParagraphs(item, index))
    : [para([txt('(none)', SZ_VALUE, { italics: true, color: COLOR.muted })])]

  return table([
    sectionHeader('Daily Field Service Note / Critical Items', 23),
    new TableRow({
      children: [
        cell({
          span: 23,
          width: sumCols(0, 23),
          children: paragraphs,
          margins: { top: 70, bottom: 70, left: 90, right: 90 },
          verticalAlign: VerticalAlign.TOP,
        }),
      ],
    }),
    new TableRow({
      children: [cell({ span: 23, width: sumCols(0, 23), text: '+' })],
    }),
  ])
}

function buildDataLocationTable(content: FieldServiceContent): Table {
  return table([
    sectionHeader('Data Location', 23),
    new TableRow({
      children: [
        cell({ span: 2, width: sumCols(0, 2), text: 'File Path / URL', bg: COLOR.labelGray, bold: true }),
        buildDataLocationCell(content.data_location),
        cell({ span: 1, width: sumCols(22, 1), text: '' }),
      ],
    }),
  ])
}

function buildWorkCompletionTable(content: FieldServiceContent): Table {
  const wc = content.work_completion ?? { type: '', reason: '', detail: '', time_log: '' }
  return table([
    sectionHeader('Work Completion', 23),
    new TableRow({
      children: [
        cell({ span: 2, width: sumCols(0, 2), text: 'Type', bg: COLOR.labelGray, bold: true }),
        cell({ span: 6, width: sumCols(2, 6), text: wc.type }),
        cell({ span: 2, width: sumCols(8, 2), text: 'Time Log', bg: COLOR.labelGray, bold: true }),
        cell({ span: 13, width: sumCols(10, 13), text: wc.time_log }),
      ],
    }),
    new TableRow({
      children: [
        cell({ span: 2, width: sumCols(0, 2), text: 'Reason', bg: COLOR.labelGray, bold: true }),
        cell({ span: 21, width: sumCols(2, 21), text: wc.reason, margins: PAD_TEXT, verticalAlign: VerticalAlign.TOP }),
      ],
    }),
    new TableRow({
      children: [
        cell({ span: 2, width: sumCols(0, 2), text: 'Detail', bg: COLOR.labelGray, bold: true }),
        cell({ span: 21, width: sumCols(2, 21), text: wc.detail, margins: PAD_TEXT, verticalAlign: VerticalAlign.TOP }),
      ],
    }),
  ])
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 20 }, children: [new TextRun({ text: '' })] })
}

export function buildFieldServiceSections(content: FieldServiceContent, reportDate: string): (Paragraph | Table)[] {
  const logoBuffer = loadLogo()
  return [
    buildHeaderTable(content, reportDate, logoBuffer),
    spacer(),
    buildInfoTable(content),
    spacer(),
    buildProblemTable(content),
    spacer(),
    buildCriticalItemsTable(content),
    spacer(),
    buildDataLocationTable(content),
    spacer(),
    buildWorkCompletionTable(content),
  ]
}
