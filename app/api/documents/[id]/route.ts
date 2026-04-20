import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return err('Document not found', 404)
    return err(error.message, 500)
  }

  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return err('Invalid JSON', 400)

  const { content, lockedBy } = body
  if (content === undefined) return err('content is required', 400)
  if (!lockedBy)             return err('lockedBy is required', 400)

  // Resolve the document's card_id, then verify the caller holds the lock
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('card_id')
    .eq('id', id)
    .maybeSingle()

  if (!doc) return err('Document not found', 404)

  const { data: lock } = await supabaseAdmin
    .from('edit_locks')
    .select('user_name, expires_at')
    .eq('card_id', doc.card_id)
    .maybeSingle()

  const lockValid =
    lock &&
    lock.user_name === lockedBy &&
    new Date(lock.expires_at) > new Date()

  if (!lockValid) {
    return NextResponse.json(
      { error: 'Lock not held — save rejected', code: 'LOCK_LOST' },
      { status: 409 }
    )
  }

  const { data: updated, error } = await supabaseAdmin
    .from('documents')
    .update({ content })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return err('Document not found', 404)
    return err(error.message, 500)
  }

  return NextResponse.json(updated)
}
