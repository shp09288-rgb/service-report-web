import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const LOCK_TTL_MS = 60_000 // 60 seconds

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return err('Invalid JSON', 400)

  const { cardId, userName } = body
  if (!cardId || !userName) return err('cardId and userName are required', 400)

  const now = new Date()

  // Check for an existing active lock
  const { data: existing } = await supabaseAdmin
    .from('edit_locks')
    .select('*')
    .eq('card_id', cardId)
    .single()

  const isActiveLock =
    existing &&
    new Date(existing.expires_at) > now &&
    existing.user_name !== userName

  if (isActiveLock) {
    return NextResponse.json(
      { acquired: false, lockedBy: existing.user_name, expiresAt: existing.expires_at },
      { status: 409 }
    )
  }

  // Acquire or refresh the lock (upsert on card_id unique constraint)
  const expires_at = new Date(now.getTime() + LOCK_TTL_MS).toISOString()

  const { error } = await supabaseAdmin
    .from('edit_locks')
    .upsert(
      { card_id: cardId, user_name: userName, acquired_at: now.toISOString(), expires_at },
      { onConflict: 'card_id' }
    )

  if (error) return err(error.message, 500)

  return NextResponse.json({ acquired: true, expiresAt: expires_at })
}
