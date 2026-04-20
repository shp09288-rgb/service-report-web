import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const cardIdsParam = searchParams.get('cardIds')
    const cardIds = cardIdsParam
      ? cardIdsParam.split(',').map(id => id.trim()).filter(Boolean)
      : []

    let cardsQuery = supabaseAdmin
      .from('cards')
      .select('*')
      .order('created_at', { ascending: true })

    if (cardIds.length > 0) {
      cardsQuery = cardsQuery.in('id', cardIds)
    }

    const { data: cards, error: cardsErr } = await cardsQuery
    if (cardsErr) {
      return NextResponse.json(
        { error: `Failed to fetch cards: ${cardsErr.message}` },
        { status: 500 }
      )
    }

    const selectedCardIds = (cards ?? []).map(card => card.id)
    const shouldFilterChildren = cardIds.length > 0

    let documentsQuery = supabaseAdmin
      .from('documents')
      .select('*')
      .order('created_at', { ascending: true })

    if (shouldFilterChildren) {
      if (selectedCardIds.length === 0) {
        documentsQuery = documentsQuery.in('card_id', ['__no_match__'])
      } else {
        documentsQuery = documentsQuery.in('card_id', selectedCardIds)
      }
    }

    const { data: documents, error: docsErr } = await documentsQuery
    if (docsErr) {
      return NextResponse.json(
        { error: `Failed to fetch documents: ${docsErr.message}` },
        { status: 500 }
      )
    }

    let ganttQuery = supabaseAdmin
      .from('gantt')
      .select('*')

    if (shouldFilterChildren) {
      if (selectedCardIds.length === 0) {
        ganttQuery = ganttQuery.in('card_id', ['__no_match__'])
      } else {
        ganttQuery = ganttQuery.in('card_id', selectedCardIds)
      }
    }

    const { data: gantt, error: ganttErr } = await ganttQuery
    if (ganttErr) {
      return NextResponse.json(
        { error: `Failed to fetch gantt: ${ganttErr.message}` },
        { status: 500 }
      )
    }

    const payload = {
      exported_at: new Date().toISOString(),
      cards: cards ?? [],
      documents: documents ?? [],
      gantt: gantt ?? [],
    }

    const json = JSON.stringify(payload, null, 2)
    const date = new Date().toISOString().split('T')[0]
    const filename = `backup-${date}.json`

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected backup error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
