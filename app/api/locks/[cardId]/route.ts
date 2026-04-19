import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params

  const { data } = await supabaseAdmin
    .from('edit_locks')
    .select('*')
    .eq('card_id', cardId)
    .single()

  if (!data || new Date(data.expires_at) <= new Date()) {
    return NextResponse.json({ locked: false })
  }

  return NextResponse.json({
    locked:    true,
    lockedBy:  data.user_name,
    expiresAt: data.expires_at,
  })
}
