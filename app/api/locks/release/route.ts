import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return err('Invalid JSON', 400)

  const { cardId, userName } = body
  if (!cardId || !userName) return err('cardId and userName are required', 400)

  // Only delete the lock if the current user holds it
  const { error } = await supabaseAdmin
    .from('edit_locks')
    .delete()
    .eq('card_id', cardId)
    .eq('user_name', userName)

  if (error) return err(error.message, 500)

  return NextResponse.json({ released: true })
}
