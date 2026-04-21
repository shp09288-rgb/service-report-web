import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { parseWorkbook, detectTemplate } from '@/lib/excel-parser'
import type { ParsedSheet } from '@/lib/excel-parser'
import type { CardRow } from '@/types/db'

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

// ── Card resolution ───────────────────────────────────────────────────────────

async function resolveCardId(content: ParsedSheet['content']): Promise<string> {
  const eq_id    = content.eq_id.trim()
  const customer = content.customer.trim()
  const model    = content.model.trim()

  if (eq_id) {
    const { data } = await supabaseAdmin.from('cards').select('id').eq('eq_id', eq_id).maybeSingle()
    if (data) return data.id
  }
  if (customer && model) {
    const { data } = await supabaseAdmin.from('cards')
      .select('id').eq('customer', customer).eq('model', model).eq('type', 'field_service')
      .maybeSingle()
    if (data) return data.id
  }

  const insert: Omit<CardRow, 'id' | 'created_at' | 'updated_at' | 'site' | 'equipment'> = {
    type:     'field_service',
    customer: customer || 'Unknown',
    model:    model    || 'Unknown',
    sid:      content.sid      || '',
    eq_id:    eq_id            || '',
    location: content.location || '',
  }
  const { data: newCard, error } = await supabaseAdmin.from('cards').insert(insert).select('id').single()
  if (error || !newCard) throw new Error(`Failed to create card: ${error?.message}`)
  return newCard.id
}

// ── Preview response shape ────────────────────────────────────────────────────

export interface SheetPreview {
  sheet_name:       string
  report_date:      string
  customer:         string
  model:            string
  eq_id:            string
  location:         string
  images_extracted: number
  import_hash:      string
  already_exists:   boolean
}

export interface ImportPreviewResponse {
  file_name:    string
  total_sheets: number
  date_sheets:  number
  skipped:      string[]
  previews:     SheetPreview[]
}

export interface ImportCommitResponse {
  inserted: number
  skipped:  number
  errors:   string[]
}

// ── POST /api/import/excel ────────────────────────────────────────────────────
// Body: multipart/form-data
//   file:   .xlsx file
//   action: 'preview' | 'commit'

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return err('Expected multipart/form-data')
  }

  const file   = formData.get('file')
  const action = formData.get('action')

  if (!(file instanceof File)) return err('Missing file field')
  if (action !== 'preview' && action !== 'commit') return err('action must be "preview" or "commit"')

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return err('Only .xlsx files are supported')
  }

  const MAX_MB = 50
  if (file.size > MAX_MB * 1024 * 1024) return err(`File exceeds ${MAX_MB} MB limit`)

  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const fileName   = file.name

  // ── PREVIEW ───────────────────────────────────────────────────────────────

  if (action === 'preview') {
    let result: Awaited<ReturnType<typeof parseWorkbook>>
    try {
      result = await parseWorkbook(fileBuffer, fileName)
    } catch (e) {
      return err(`Failed to parse file: ${(e as Error).message}`)
    }

    const { parsed, skipped } = result

    // Check which sheets are already in the DB
    const hashes = parsed.map(p => p.source_meta.import_hash)
    const { data: existing } = await supabaseAdmin
      .from('documents')
      .select('source_meta')
      .in('source_meta->>import_hash', hashes)

    const existingHashes = new Set(
      (existing ?? []).map(r => (r.source_meta as { import_hash: string } | null)?.import_hash).filter(Boolean)
    )

    const previews: SheetPreview[] = parsed.map(p => ({
      sheet_name:       p.sheet_name,
      report_date:      p.report_date,
      customer:         p.content.customer,
      model:            p.content.model,
      eq_id:            p.content.eq_id,
      location:         p.content.location,
      images_extracted: p.images_extracted,
      import_hash:      p.source_meta.import_hash,
      already_exists:   existingHashes.has(p.source_meta.import_hash),
    }))

    // Total sheets in workbook (including non-date)
    const allSheetNames = [...new Set([...parsed.map(p => p.sheet_name), ...skipped])]

    const response: ImportPreviewResponse = {
      file_name:    fileName,
      total_sheets: allSheetNames.length,
      date_sheets:  parsed.length,
      skipped,
      previews,
    }
    return NextResponse.json(response)
  }

  // ── COMMIT ────────────────────────────────────────────────────────────────

  // Accept optional sheet filter for committing only specific sheets
  const onlySheetRaw = formData.get('only_sheets')
  const onlySheets: string[] | null = onlySheetRaw
    ? JSON.parse(String(onlySheetRaw))
    : null

  let result: Awaited<ReturnType<typeof parseWorkbook>>
  try {
    result = await parseWorkbook(fileBuffer, fileName)
  } catch (e) {
    return err(`Failed to parse file: ${(e as Error).message}`)
  }

  const toCommit = onlySheets
    ? result.parsed.filter(p => onlySheets.includes(p.sheet_name))
    : result.parsed

  let inserted = 0
  let skippedCount = 0
  const errors: string[] = []

  for (const parsed of toCommit) {
    try {
      // Dedup check
      const { data: existing } = await supabaseAdmin
        .from('documents')
        .select('id')
        .eq('source_meta->>import_hash', parsed.source_meta.import_hash)
        .maybeSingle()

      if (existing) { skippedCount++; continue }

      const cardId = await resolveCardId(parsed.content)

      const { error: insertError } = await supabaseAdmin.from('documents').insert({
        card_id:            cardId,
        report_date:        parsed.report_date,
        is_external:        false,
        parent_document_id: null,
        content:            parsed.content as unknown as Record<string, unknown>,
        source_meta:        parsed.source_meta as unknown as Record<string, unknown>,
      })

      if (insertError) {
        if (insertError.code === '23505') { skippedCount++; continue }
        errors.push(`${parsed.sheet_name}: ${insertError.message}`)
      } else {
        inserted++
      }
    } catch (e) {
      errors.push(`${parsed.sheet_name}: ${(e as Error).message}`)
    }
  }

  const response: ImportCommitResponse = { inserted, skipped: skippedCount, errors }
  return NextResponse.json(response)
}

// ── GET /api/import/excel?sheetName=&fileName= ────────────────────────────────
// Lightweight: check if a sheet has already been imported (dedup check only)

export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get('hash')
  if (!hash) return err('Missing hash parameter')

  const { data } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('source_meta->>import_hash', hash)
    .maybeSingle()

  return NextResponse.json({ exists: !!data })
}
