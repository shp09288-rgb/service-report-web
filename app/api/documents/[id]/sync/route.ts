import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: internalId } = await params

  // Load the source (internal) document
  const { data: internal, error: fetchError } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', internalId)
    .single()

  if (fetchError || !internal) return err('Document not found', 404)
  if (internal.is_external)   return err('Cannot sync from an external document', 400)

  // Check for an existing external child
  const { data: existing } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('parent_document_id', internalId)
    .eq('is_external', true)
    .maybeSingle()

  if (existing) {
    // Overwrite external content with latest internal content
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({ content: internal.content })
      .eq('id', existing.id)

    if (updateError) return err(updateError.message, 500)

    return NextResponse.json({ externalId: existing.id })
  }

  // Create a new external document
  const { data: created, error: insertError } = await supabaseAdmin
    .from('documents')
    .insert({
      card_id:            internal.card_id,
      report_date:        internal.report_date,
      is_external:        true,
      parent_document_id: internalId,
      content:            internal.content,
    })
    .select('id')
    .single()

  if (insertError) return err(insertError.message, 500)

  return NextResponse.json({ externalId: created.id }, { status: 201 })
}
