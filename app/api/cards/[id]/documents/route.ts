import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { DocumentInsert } from '@/types/db'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: card_id } = await params

  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('card_id', card_id)
    .order('report_date', { ascending: false })

  if (error) return err(error.message, 500)
  return NextResponse.json(data)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: card_id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return err('Invalid JSON', 400)

  const { report_date, content } = body
  if (!report_date) return err('report_date is required', 400)

  const insert: DocumentInsert = {
    card_id,
    report_date,
    is_external: false,
    parent_document_id: null,
    content: content ?? {},
  }

  const { data, error } = await supabaseAdmin
    .from('documents')
    .insert(insert)
    .select()
    .single()

  if (error) {
    // Unique constraint violation — duplicate internal doc for this date
    if (error.code === '23505')
      return err('An internal report for this date already exists', 409)
    return err(error.message, 500)
  }

  return NextResponse.json(data, { status: 201 })
}
