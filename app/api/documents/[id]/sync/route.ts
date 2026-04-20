import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: internalId } = await params

  const body = await req.json().catch(() => null)
  const { lockedBy } = (body ?? {}) as { lockedBy?: string }
  if (!lockedBy) return err('lockedBy is required', 400)

  // Load the source (internal) document
  const { data: internal, error: fetchError } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', internalId)
    .single()

  if (fetchError || !internal) return err('Document not found', 404)
  if (internal.is_external)   return err('Cannot sync from an external document', 400)

  // Verify the caller holds the lock for this card
  const { data: lock } = await supabaseAdmin
    .from('edit_locks')
    .select('user_name, expires_at')
    .eq('card_id', internal.card_id)
    .maybeSingle()

  const lockValid =
    lock &&
    lock.user_name === lockedBy &&
    new Date(lock.expires_at) > new Date()

  if (!lockValid) {
    return NextResponse.json(
      { error: 'Lock not held — sync rejected', code: 'LOCK_LOST' },
      { status: 409 }
    )
  }

  // Check for an existing external child
  const { data: existing } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('parent_document_id', internalId)
    .eq('is_external', true)
    .maybeSingle()

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({ content: internal.content })
      .eq('id', existing.id)

    if (updateError) return err(updateError.message, 500)

    return NextResponse.json({ externalId: existing.id })
  }

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
