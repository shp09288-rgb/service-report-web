import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { CardInsert } from '@/types/db'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('cards')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) return err(error.message, 500)
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return err('Invalid JSON', 400)

  const { type, site, equipment } = body

  if (!type || !site || !equipment)
    return err('type, site, and equipment are required', 400)

  if (type !== 'field_service' && type !== 'installation')
    return err('type must be field_service or installation', 400)

  const insert: CardInsert = {
    type,
    site: site.trim(),
    equipment: equipment.trim(),
  }

  const { data, error } = await supabaseAdmin
    .from('cards')
    .insert(insert)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return NextResponse.json(data, { status: 201 })
}
