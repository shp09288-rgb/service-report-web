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

  const { type, customer, model, sid, eq_id, location, site_survey, noise_level } = body as {
    type?: string
    customer?: string
    model?: string
    sid?: string
    eq_id?: string
    location?: string
    site_survey?: string
    noise_level?: string
  }

  if (!type || !customer?.trim() || !model?.trim()) {
    return err('type, customer, and model are required', 400)
  }
  if (type !== 'field_service' && type !== 'installation') {
    return err('type must be field_service or installation', 400)
  }

  const insert: CardInsert & { site: string; equipment: string } = {
    type:        type as CardInsert['type'],
    customer:    customer.trim(),
    model:       model.trim(),
    sid:         (sid ?? '').trim(),
    eq_id:       (eq_id ?? '').trim(),
    location:    (location ?? '').trim(),
    site_survey: (site_survey ?? '').trim(),
    noise_level: (noise_level ?? '').trim(),
    site:        customer.trim(),
    equipment:   model.trim(),
  }

  const { data, error } = await supabaseAdmin
    .from('cards')
    .insert(insert)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return NextResponse.json(data, { status: 201 })
}
