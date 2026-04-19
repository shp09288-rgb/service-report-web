import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const [
    { data: cards,     error: cardsErr },
    { data: documents, error: docsErr  },
    { data: gantt,     error: ganttErr },
  ] = await Promise.all([
    supabaseAdmin.from('cards').select('*').order('created_at', { ascending: true }),
    supabaseAdmin.from('documents').select('*').order('created_at', { ascending: true }),
    supabaseAdmin.from('gantt').select('*').order('created_at', { ascending: true }),
  ])

  if (cardsErr || docsErr || ganttErr) {
    const message = cardsErr?.message ?? docsErr?.message ?? ganttErr?.message ?? 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const payload = {
    exported_at: new Date().toISOString(),
    cards:       cards     ?? [],
    documents:   documents ?? [],
    gantt:       gantt     ?? [],
  }

  const json     = JSON.stringify(payload, null, 2)
  const date     = new Date().toISOString().split('T')[0]
  const filename = `backup-${date}.json`

  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
