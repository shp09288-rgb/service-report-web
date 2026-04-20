import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeFieldServiceContent } from '@/lib/content-defaults'
import type { CardRow, DocumentRow } from '@/types/db'
import type { FieldServiceContent } from '@/types/report'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// ── Cell helpers ─────────────────────────────────────────────────────────────

function setCell(ws: XLSX.WorkSheet, col: number, row: number, value: string | number) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  ws[addr] = { v: value, t: typeof value === 'number' ? 'n' : 's' }
}

function ensureRange(ws: XLSX.WorkSheet) {
  const cells = Object.keys(ws).filter(k => !k.startsWith('!'))
  if (cells.length === 0) return
  let minR = Infinity, minC = Infinity, maxR = 0, maxC = 0
  for (const addr of cells) {
    const ref = XLSX.utils.decode_cell(addr)
    minR = Math.min(minR, ref.r)
    minC = Math.min(minC, ref.c)
    maxR = Math.max(maxR, ref.r)
    maxC = Math.max(maxC, ref.c)
  }
  ws['!ref'] = XLSX.utils.encode_range({ r: minR, c: minC }, { r: maxR, c: maxC })
}

// ── Sheet builder ─────────────────────────────────────────────────────────────
// Uses Template A layout (YYYY.MM.DD sheet naming, base col = B = c=1)

function buildSheet(content: FieldServiceContent, reportDate: string): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}
  const b = 1  // base col index (B = 1 in 0-indexed)

  // Row 4: report date, FSE name
  setCell(ws, b + 20, 3, reportDate)        // V4
  setCell(ws, b + 1,  3, content.fse_name)  // C4

  // Row 5: tool status
  setCell(ws, b + 7, 4, content.tool_status)  // I5

  // Row 6: model
  setCell(ws, b + 1, 4, content.model)  // C5

  // Row 7: service type
  setCell(ws, b + 1, 6, content.service_type)  // C7

  // Row 9: system info
  setCell(ws, b + 1,  8, content.customer)     // C9
  setCell(ws, b + 7,  8, content.sid)          // I9
  setCell(ws, b + 10, 8, content.eq_id)        // L9
  setCell(ws, b + 13, 8, content.location)     // O9  (was +10 but noise_level is +13)
  setCell(ws, b + 17, 8, content.crm_case_id)  // S9

  // Row 10: noise level, service dates
  setCell(ws, b + 13, 9, content.noise_level)  // O10
  setCell(ws, b + 1,  9, content.start_date)   // C10
  setCell(ws, b + 4,  9, content.start_time)   // F10
  setCell(ws, b + 7,  9, content.end_date)     // I10
  setCell(ws, b + 10, 9, content.end_time)     // L10

  // Rows 5-7: contact info
  setCell(ws, b + 18, 4, content.main_user)  // T5
  setCell(ws, b + 18, 5, content.tel)         // T6
  setCell(ws, b + 18, 6, content.email)       // T7

  // Row 16+: problem statement (multi-line)
  const problemLines = content.problem_statement.split('\n')
  for (let i = 0; i < Math.min(problemLines.length, 6); i++) {
    setCell(ws, b, 15 + i, problemLines[i])  // B16–B21
  }

  // Row 16+: target statement (multi-line)
  const targetLines = content.target_statement.split('\n')
  for (let i = 0; i < Math.min(targetLines.length, 6); i++) {
    setCell(ws, b + 12, 15 + i, targetLines[i])  // N16–N21
  }

  // Row 23: daily note
  const noteText = content.critical_items?.[0]?.note ?? content.daily_note
  setCell(ws, b, 22, noteText)  // B23

  // Row 30: data location
  setCell(ws, b, 29, content.data_location)  // B30

  ensureRange(ws)
  return ws
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.documentId !== 'string') {
    return err('Body must be { documentId: string }', 400)
  }

  const { documentId } = body as { documentId: string }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (docErr || !doc) return err('Document not found', 404)
  const docRow = doc as DocumentRow

  const { data: card, error: cardErr } = await supabaseAdmin
    .from('cards')
    .select('*')
    .eq('id', docRow.card_id)
    .single()

  if (cardErr || !card) return err('Card not found', 404)
  const cardRow = card as CardRow

  if (cardRow.type !== 'field_service') {
    return err('Excel export is currently only supported for field_service cards', 400)
  }

  const content = normalizeFieldServiceContent(docRow.content) as FieldServiceContent

  function seg(s: string): string {
    return (s ?? '').replace(/[/\\:*?"<>|]/g, '').trim()
  }

  const date     = docRow.report_date
  const docType  = docRow.is_external ? 'External' : 'Internal'
  const customer = seg(cardRow.customer)
  const eqId     = seg(cardRow.eq_id)

  const wb = XLSX.utils.book_new()
  const sheetName = date.replace(/-/g, '.')  // YYYY.MM.DD
  const ws = buildSheet(content, date)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `${date}_${docType}_${customer}_${eqId}_field-service.xlsx`

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
