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
  VerticalMergeType,
  WidthType,
} from 'docx'
import fs from 'fs'
import path from 'path'
import type { FieldServiceContent, NoteImage } from '@/types/report'

const FONT = 'Malgun Gothic'

const COLOR = {
  blue: '5B9BD5',
  blueDark: '1F2937',
  headerGray: 'D9D9D9',
  labelGray: 'F2F2F2',
  statusBeige: 'DDD9C3',
  white: 'FFFFFF',
  black: '000000',
  border: '000000',
  muted: '666666',
  orange: 'E67E22',
} as const

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: COLOR.border }
const NONE = { style: BorderStyle.NONE, size: 0, color: COLOR.white }

const BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
  insideHorizontal: BORDER,
  insideVertical: BORDER,
}

const NO_BORDERS = {
  top: NONE,
  bottom: NONE,
  left: NONE,
  right: NONE,
  insideHorizontal: NONE,
  insideVertical: NONE,
}

const CELL_BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
}

const NO_CELL_BORDERS = {
  top: NONE,
  bottom: NONE,
  left: NONE,
  right: NONE,
}

const PAD = { top: 30, bottom: 30, left: 70, right: 70 }
const PAD_TEXT = { top: 50, bottom: 50, left: 90, right: 90 }
const PAD_HEADER = { top: 45, bottom: 45, left: 80, right: 80 }

const SZ_TITLE = 24
const SZ_VALUE = 16
const SZ_SMALL = 14

const INFO_COL_CM = [1.85, 2.63, 2.77, 4.03, 3.11, 4.04] as const
const INFO_COLS = INFO_COL_CM.map((v) => Math.round(v * 567))
const FULL_WIDTH = INFO_COLS.reduce((a, b) => a + b, 0)

const DATA_LOCATION_LABEL_CM = 2.74
const DATA_LOCATION_LABEL_WIDTH = Math.round(DATA_LOCATION_LABEL_CM * 567)
const DATA_LOCATION_VALUE_WIDTH = FULL_WIDTH - DATA_LOCATION_LABEL_WIDTH

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
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

function txt(text: string, size = SZ_VALUE, opts?: Record<string, unknown>): TextRun {
  return new TextRun({
    text: text ?? '',
    size,
    color: COLOR.black,
    font: FONT,
    ...opts,
  })
}

function para(
  children: (TextRun | ImageRun | ExternalHyperlink)[],
  opts?: Record<string, unknown>,
): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 220 },
    children,
    ...opts,
  })
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /^\\\\/.test(s)
}

function lineParagraph(line: string): Paragraph {
  const t = line.trim()
  if (isUrl(t)) {
    return para([
      new ExternalHyperlink({
        link: t,
        children: [new TextRun({ text: t, style: 'Hyperlink', size: SZ_VALUE, font: FONT })],
      }),
    ])
  }
  return para([txt(line || ' ')])
}

function cell({
  text,
  children,
  span = 1,
  width,
  bg,
  color = COLOR.black,
  bold = false,
  align = AlignmentType.LEFT,
  margins = PAD,
  verticalAlign = VerticalAlign.CENTER,
  borders = CELL_BORDERS,
  verticalMerge,
}: {
  text?: string
  children?: Paragraph[]
  span?: number
  width?: number
  bg?: string
  color?: string
  bold?: boolean
  align?: (typeof AlignmentType)[keyof typeof AlignmentType]
  margins?: { top: number; bottom: number; left: number; right: number }
  verticalAlign?: 'top' | 'center' | 'bottom'
  borders?: typeof CELL_BORDERS
  verticalMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType]
}): TableCell {
  return new TableCell({
    columnSpan: span,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: bg ? { type: ShadingType.SOLID, color: bg, fill: bg } : undefined,
    borders,
    margins,
    verticalAlign,
    verticalMerge,
    children:
      children ?? [
        new Paragraph({
          alignment: align,
          spacing: { before: 0, after: 0, line: 220 },
          children: [txt(text ?? '', SZ_VALUE, { color, bold })],
        }),
      ],
  })
}

function simpleSpacer(): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 35 },
    children: [txt('', 2)],
  })
}

function buildTitleAndMeta(content: FieldServiceContent, reportDate: string, logo: Buffer | null): Table {
  const logoCol = 1350
  const titleCol = Math.round(10 * 567) // 10cm
  const leftWidth = logoCol + titleCol

  const rightLabelWidth = Math.round(3 * 567)   // 3cm
  const rightValueWidth = Math.round(2.6 * 567) // 2.6cm
  const rightWidth = rightLabelWidth + rightValueWidth

  const leftInner = new Table({
    width: { size: leftWidth, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [logoCol, titleCol],
    borders: BORDERS,
    rows: [
      new TableRow({
        height: { value: 900, rule: 'auto' },
        children: [
          new TableCell({
            width: { size: logoCol, type: WidthType.DXA },
            borders: CELL_BORDERS,
            margins: { top: 70, bottom: 70, left: 40, right: 40 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0, line: 220 },
                children: logo
                  ? [
                      new ImageRun({
                        data: logo,
                        transformation: { width: 74, height: 56 },
                        type: 'png',
                      }),
                    ]
                  : [txt('Park', SZ_VALUE, { bold: true })],
              }),
            ],
          }),
          new TableCell({
            width: { size: titleCol, type: WidthType.DXA },
            borders: CELL_BORDERS,
            margins: { top: 80, bottom: 80, left: 80, right: 80 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0, line: 220 },
                children: [
                  txt('Park Systems Field Service Passdown Report', SZ_TITLE, {
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })

  const rightInner = new Table({
    width: { size: rightWidth, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [rightLabelWidth, rightValueWidth],
    borders: BORDERS,
    rows: [
      new TableRow({
        height: { value: 450, rule: 'exact' },
        children: [
          cell({
            text: 'Report Date:',
            width: rightLabelWidth,
            bg: COLOR.headerGray,
            bold: true,
            verticalAlign: VerticalAlign.CENTER,
          }),
          cell({
            text: reportDate,
            width: rightValueWidth,
            bold: true,
            align: AlignmentType.CENTER,
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      }),
      new TableRow({
        height: { value: 450, rule: 'exact' },
        children: [
          cell({
            text: "Park FSE's Name:",
            width: rightLabelWidth,
            bg: COLOR.headerGray,
            bold: true,
            verticalAlign: VerticalAlign.CENTER,
          }),
          cell({
            text: content.fse_name || '',
            width: rightValueWidth,
            bold: true,
            align: AlignmentType.CENTER,
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      }),
    ],
  })

  return new Table({
    width: { size: FULL_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [leftWidth, rightWidth],
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: leftWidth, type: WidthType.DXA },
            borders: NO_CELL_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 120 },
            verticalAlign: VerticalAlign.CENTER,
            children: [leftInner],
          }),
          new TableCell({
            width: { size: rightWidth, type: WidthType.DXA },
            borders: NO_CELL_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            verticalAlign: VerticalAlign.CENTER,
            children: [rightInner],
          }),
        ],
      }),
    ],
  })
}

function buildStatusTable(content: FieldServiceContent): Table {
  const left = 2500
  const right = 4500

  return new Table({
    width: { size: left + right, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [left, right],
    borders: BORDERS,
    rows: [
      new TableRow({
        children: [
          cell({
            text: 'Current Tool Status',
            width: left,
            bg: COLOR.labelGray,
            bold: true,
            align: AlignmentType.CENTER,
            verticalAlign: VerticalAlign.CENTER,
            verticalMerge: VerticalMergeType.RESTART,
          }),
          cell({
            text: content.tool_status || 'Tool Up',
            width: right,
            bg: COLOR.statusBeige,
            bold: true,
            align: AlignmentType.CENTER,
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({
            text: '',
            width: left,
            bg: COLOR.labelGray,
            verticalMerge: VerticalMergeType.CONTINUE,
            borders: CELL_BORDERS,
          }),
          cell({
            text: '',
            width: right,
            bg: COLOR.statusBeige,
            align: AlignmentType.CENTER,
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      }),
    ],
  })
}

function buildInfoTable(content: FieldServiceContent): Table {
  return new Table({
    width: { size: FULL_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: INFO_COLS,
    borders: BORDERS,
    rows: [
      new TableRow({
        children: [
          cell({
            text: 'System Information',
            span: 2,
            width: sum(INFO_COLS.slice(0, 2)),
            bg: COLOR.blue,
            color: COLOR.white,
            bold: true,
            margins: PAD_HEADER,
          }),
          cell({
            text: 'Service Information',
            span: 2,
            width: sum(INFO_COLS.slice(2, 4)),
            bg: COLOR.blue,
            color: COLOR.white,
            bold: true,
            margins: PAD_HEADER,
          }),
          cell({
            text: 'Contact Info',
            span: 2,
            width: sum(INFO_COLS.slice(4, 6)),
            bg: COLOR.blue,
            color: COLOR.white,
            bold: true,
            margins: PAD_HEADER,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({ text: 'Customer', width: INFO_COLS[0], bg: COLOR.labelGray }),
          cell({ text: content.customer || '', width: INFO_COLS[1], align: AlignmentType.CENTER }),
          cell({ text: 'Location', width: INFO_COLS[2], bg: COLOR.labelGray }),
          cell({ text: content.location || '', width: INFO_COLS[3], align: AlignmentType.CENTER }),
          cell({ text: 'CRM Case ID', width: INFO_COLS[4], bg: COLOR.labelGray }),
          cell({ text: content.crm_case_id || '', width: INFO_COLS[5], align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell({ text: 'Model', width: INFO_COLS[0], bg: COLOR.labelGray }),
          cell({ text: content.model || '', width: INFO_COLS[1], align: AlignmentType.CENTER }),
          cell({ text: 'Site Survey Result', width: INFO_COLS[2], bg: COLOR.labelGray }),
          cell({ text: content.site_survey || '', width: INFO_COLS[3], align: AlignmentType.CENTER }),
          cell({ text: 'Main User Name', width: INFO_COLS[4], bg: COLOR.labelGray }),
          cell({ text: content.main_user || '', width: INFO_COLS[5], align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell({ text: 'SID', width: INFO_COLS[0], bg: COLOR.labelGray }),
          cell({ text: content.sid || '', width: INFO_COLS[1], align: AlignmentType.CENTER }),
          cell({ text: 'Start Date', width: INFO_COLS[2], bg: COLOR.labelGray }),
          cell({ text: content.start_date || '', width: INFO_COLS[3], align: AlignmentType.CENTER }),
          cell({ text: 'Main User Tel#', width: INFO_COLS[4], bg: COLOR.labelGray }),
          cell({ text: content.tel || '', width: INFO_COLS[5], align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell({ text: 'EQ ID', width: INFO_COLS[0], bg: COLOR.labelGray }),
          cell({ text: content.eq_id || '', width: INFO_COLS[1], align: AlignmentType.CENTER }),
          cell({ text: 'Start Time', width: INFO_COLS[2], bg: COLOR.labelGray }),
          cell({ text: content.start_time || '', width: INFO_COLS[3], align: AlignmentType.CENTER }),
          cell({ text: 'Main User E-mail', width: INFO_COLS[4], bg: COLOR.labelGray }),
          cell({ text: content.email || '', width: INFO_COLS[5], align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell({ text: 'Service Type', width: INFO_COLS[0], bg: COLOR.labelGray }),
          cell({ text: content.service_type || '', width: INFO_COLS[1], align: AlignmentType.CENTER }),
          cell({ text: 'End Time', width: INFO_COLS[2], bg: COLOR.labelGray }),
          cell({
            width: INFO_COLS[3],
            children: [
              para([txt(content.end_time || '', SZ_VALUE)], { alignment: AlignmentType.CENTER }),
              para(
                [txt(content.end_time_note || '고객사 출문 시간', SZ_SMALL, { color: COLOR.muted, italics: true })],
                { alignment: AlignmentType.CENTER },
              ),
            ],
          }),
          cell({ text: '', width: INFO_COLS[4], bg: COLOR.labelGray }),
          cell({ text: '', width: INFO_COLS[5] }),
        ],
      }),
    ],
  })
}

function scaleImage(img: NoteImage): { width: number; height: number } {
  const maxW = 320
  const fallbackW = 240
  const fallbackH = 180
  const w = img.width ?? fallbackW
  const h = img.height ?? fallbackH

  if (w <= maxW) return { width: w, height: h }

  const ratio = maxW / w
  return {
    width: maxW,
    height: Math.max(60, Math.round(h * ratio)),
  }
}

function buildCriticalParagraphs(items: FieldServiceContent['critical_items']): Paragraph[] {
  if (!items?.length) return [para([txt(' ')])]

  const blocks: Paragraph[] = []

  items.forEach((item, index) => {
    const title = item.title?.trim() || `Item ${index + 1}`

    blocks.push(
      para([
        txt(`□ ${title} `, SZ_VALUE, { bold: true }),
        txt(`(진행률 : ${Math.max(0, Math.min(100, item.progress_pct ?? 0))}%)`, SZ_SMALL, {
          color: COLOR.orange,
        }),
      ]),
    )

    const lines = (item.note ?? '').split('\n')
    lines.forEach((line) => blocks.push(lineParagraph(line || ' ')))

    const noteImages = Array.isArray(item.note_images) ? item.note_images : []
    noteImages.forEach((img) => {
      if (!img?.data_url) return

      try {
        const [, base64] = img.data_url.split(',')
        if (!base64) return

        const scaled = scaleImage(img)

        blocks.push(
          new Paragraph({
            spacing: { before: 40, after: 0 },
            children: [
              new ImageRun({
                data: Buffer.from(base64, 'base64'),
                transformation: scaled,
                type: 'png',
              }),
            ],
          }),
        )

        if (img.caption?.trim()) {
          blocks.push(
            para([
              txt(img.caption.trim(), SZ_SMALL, {
                italics: true,
                color: COLOR.muted,
              }),
            ]),
          )
        }
      } catch {
        // ignore malformed image
      }
    })

    if (index < items.length - 1) {
      blocks.push(para([txt(' ', 8)]))
    }
  })

  return blocks
}

function buildMainBodyTable(content: FieldServiceContent): Table {
  const problemHeaderWidth = sum(INFO_COLS.slice(0, 3))
  const targetHeaderWidth = sum(INFO_COLS.slice(3, 6))
  const criticalParagraphs = buildCriticalParagraphs(
    Array.isArray(content.critical_items) ? content.critical_items : [],
  )
  const dataLocationLines = (content.data_location ?? '').split('\n')
  const work = content.work_completion ?? { type: '', reason: '', detail: '', time_log: '' }

  return new Table({
    width: { size: FULL_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: INFO_COLS,
    borders: BORDERS,
    rows: [
      new TableRow({
        children: [
          cell({
            text: 'Current Problem Statement',
            span: 3,
            width: problemHeaderWidth,
            bg: COLOR.blue,
            color: COLOR.white,
            bold: true,
            margins: PAD_HEADER,
          }),
          cell({
            text: 'Current Target Statement (What is the existing criteria?)',
            span: 3,
            width: targetHeaderWidth,
            bg: COLOR.blue,
            color: COLOR.white,
            bold: true,
            margins: PAD_HEADER,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({
            span: 3,
            width: problemHeaderWidth,
            children: (content.problem_statement || '').split('\n').map((line) => lineParagraph(line || ' ')),
            margins: PAD_TEXT,
            verticalAlign: VerticalAlign.TOP,
          }),
          cell({
            span: 3,
            width: targetHeaderWidth,
            children: (content.target_statement || '').split('\n').map((line) => lineParagraph(line || ' ')),
            margins: PAD_TEXT,
            verticalAlign: VerticalAlign.TOP,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({
            text: 'Daily Field Service Note',
            span: 6,
            width: FULL_WIDTH,
            bg: COLOR.blue,
            color: COLOR.white,
            bold: true,
            margins: PAD_HEADER,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({
            span: 6,
            width: FULL_WIDTH,
            children: criticalParagraphs,
            margins: PAD_TEXT,
            verticalAlign: VerticalAlign.TOP,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({
            text: 'Data Location',
            width: DATA_LOCATION_LABEL_WIDTH,
            bg: COLOR.blue,
            color: COLOR.white,
            bold: true,
            margins: PAD_HEADER,
          }),
          cell({
            span: 5,
            width: DATA_LOCATION_VALUE_WIDTH,
            children: dataLocationLines.length ? dataLocationLines.map(lineParagraph) : [para([txt(' ')])],
            margins: PAD_TEXT,
            verticalAlign: VerticalAlign.TOP,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({
            text: 'Work Completion',
            span: 6,
            width: FULL_WIDTH,
            bg: COLOR.blue,
            color: COLOR.white,
            bold: true,
            margins: PAD_HEADER,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({ text: 'Type', width: INFO_COLS[0], bg: COLOR.labelGray, bold: true }),
          cell({
            text: work.type || '',
            span: 2,
            width: INFO_COLS[1] + INFO_COLS[2],
          }),
          cell({ text: 'Time Log', width: INFO_COLS[3], bg: COLOR.labelGray, bold: true }),
          cell({
            text: work.time_log || '',
            span: 2,
            width: INFO_COLS[4] + INFO_COLS[5],
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({ text: 'Reason', width: INFO_COLS[0], bg: COLOR.labelGray, bold: true }),
          cell({
            text: work.reason || '',
            span: 5,
            width: sum(INFO_COLS.slice(1, 6)),
            margins: PAD_TEXT,
            verticalAlign: VerticalAlign.TOP,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell({ text: 'Detail', width: INFO_COLS[0], bg: COLOR.labelGray, bold: true }),
          cell({
            text: work.detail || '',
            span: 5,
            width: sum(INFO_COLS.slice(1, 6)),
            margins: PAD_TEXT,
            verticalAlign: VerticalAlign.TOP,
          }),
        ],
      }),
    ],
  })
}

export function buildFieldServiceSections(
  content: FieldServiceContent,
  reportDate: string,
): (Paragraph | Table)[] {
  const logo = loadLogo()

  return [
    buildTitleAndMeta(content, reportDate, logo),
    simpleSpacer(),
    buildStatusTable(content),
    simpleSpacer(),
    buildInfoTable(content),
    simpleSpacer(),
    buildMainBodyTable(content),
  ]
}