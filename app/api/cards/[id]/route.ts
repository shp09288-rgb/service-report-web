import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyPassword } from '@/lib/settings'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('cards')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return err('Card not found', 404)
    return err(error.message, 500)
  }

  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(req)
  if (!checkRateLimit(ip)) return err('Too many requests', 429)

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return err('Invalid JSON', 400)

  const { customer, model, sid, eq_id, location, site_survey, noise_level, password } =
    body as {
      customer?: string; model?: string; sid?: string
      eq_id?: string; location?: string
      site_survey?: string; noise_level?: string
      password?: string
    }

  if (!password) return err('Password required', 400)

  const valid = await verifyPassword(password)
  if (!valid) return err('Unauthorized', 401)

  if (!customer?.trim() || !model?.trim()) {
    return err('customer and model are required', 400)
  }

  const { data, error } = await supabaseAdmin
    .from('cards')
    .update({
      customer:    customer.trim(),
      model:       model.trim(),
      sid:         (sid ?? '').trim(),
      eq_id:       (eq_id ?? '').trim(),
      location:    (location ?? '').trim(),
      site_survey: (site_survey ?? '').trim(),
      noise_level: (noise_level ?? '').trim(),
      site:        customer.trim(),
      equipment:   model.trim(),
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return err('Card not found', 404)
    return err(error.message, 500)
  }

  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(req)
  if (!checkRateLimit(ip)) return err('Too many requests', 429)

  const { id } = await params

  const body = await req.json().catch(() => null)
  const { password } = (body ?? {}) as { password?: string }

  if (!password) return err('Password required', 400)

  const valid = await verifyPassword(password)
  if (!valid) return err('Unauthorized', 401)

  const { error } = await supabaseAdmin
    .from('cards')
    .delete()
    .eq('id', id)

  if (error) return err(error.message, 500)
  return NextResponse.json({ success: true })
}
