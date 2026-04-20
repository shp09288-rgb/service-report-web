import { NextRequest, NextResponse } from 'next/server'
import { Document, Packer, Paragraph } from 'docx'
import { supabaseAdmin } from '@/lib/supabase'
import { buildFieldServiceSections } from '@/lib/docx-builders/field-service'
import { buildInstallationSections } from '@/lib/docx-builders/installation'
import type { CardRow, DocumentRow, GanttTask } from '@/types/db'
import type { FieldServiceContent, InstallationContent } from '@/types/report'
import { normalizeFieldServiceContent } from '@/lib/content-defaults'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.documentId !== 'string') {
    return err('Body must be { documentId: string }', 400)
  }

  const { documentId } = body as { documentId: string }

  // Fetch document
  const { data: doc, error: docErr } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (docErr || !doc) return err('Document not found', 404)

  const docRow = doc as DocumentRow

  // Fetch card
  const { data: card, error: cardErr } = await supabaseAdmin
    .from('cards')
    .select('*')
    .eq('id', docRow.card_id)
    .single()

  if (cardErr || !card) return err('Card not found', 404)

  const cardRow = card as CardRow

  let sections: (Paragraph | object)[]
  let filename: string

  if (cardRow.type === 'field_service') {
    sections = buildFieldServiceSections(
      normalizeFieldServiceContent(docRow.content) as FieldServiceContent,
      docRow.report_date,
    )
    filename = `field-service-${docRow.report_date}.docx`

  } else if (cardRow.type === 'installation') {
    // Fetch gantt payload for this card
    const { data: ganttRow } = await supabaseAdmin
      .from('gantt')
      .select('payload')
      .eq('card_id', cardRow.id)
      .maybeSingle()

    const ganttTasks: GanttTask[] = (ganttRow?.payload as { tasks?: GanttTask[] })?.tasks ?? []

    sections = buildInstallationSections(
      docRow.content as InstallationContent,
      docRow.report_date,
      ganttTasks,
    )
    filename = `installation-${docRow.report_date}.docx`

  } else {
    return err('Unsupported card type', 400)
  }

  // 1.27 cm margins (720 twips) to match compact Park Systems report layout
  const docx = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: sections as Paragraph[],
    }],
  })

  const buffer = await Packer.toBuffer(docx)
  const uint8  = new Uint8Array(buffer)

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
