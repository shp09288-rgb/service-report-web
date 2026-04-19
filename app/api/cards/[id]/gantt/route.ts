import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { GanttPayload } from '@/types/db'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function getInstallationCard(id: string) {
  const { data, error } = await supabaseAdmin
    .from('cards')
    .select('id, type')
    .eq('id', id)
    .single()

  if (error || !data) return null
  if (data.type !== 'installation') return false
  return data
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const card = await getInstallationCard(id)
  if (card === null)  return err('Card not found', 404)
  if (card === false) return err('Gantt is only available for installation cards', 400)

  const { data } = await supabaseAdmin
    .from('gantt')
    .select('payload')
    .eq('card_id', id)
    .maybeSingle()

  const payload: GanttPayload = data?.payload ?? { tasks: [] }
  return NextResponse.json(payload)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const card = await getInstallationCard(id)
  if (card === null)  return err('Card not found', 404)
  if (card === false) return err('Gantt is only available for installation cards', 400)

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.tasks))
    return err('Body must be { tasks: GanttTask[] }', 400)

  const payload: GanttPayload = { tasks: body.tasks }

  const { error } = await supabaseAdmin
    .from('gantt')
    .upsert({ card_id: id, payload }, { onConflict: 'card_id' })

  if (error) return err(error.message, 500)

  return NextResponse.json({ saved: true })
}
