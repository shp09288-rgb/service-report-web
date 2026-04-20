'use client'

import Link from 'next/link'
import type { CardRow } from '@/types/db'

interface Props {
  card: CardRow
  lockedBy?: string | null
  onEdit: (card: CardRow) => void
  onDelete: (id: string) => void
}

const TYPE_LABEL: Record<CardRow['type'], string> = {
  field_service: 'Field Service',
  installation:  'Installation',
}

const TYPE_BADGE: Record<CardRow['type'], string> = {
  field_service: 'bg-blue-100 text-blue-700',
  installation:  'bg-green-100 text-green-700',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function DashboardCard({ card, lockedBy, onEdit, onDelete }: Props) {
  function handleEdit(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onEdit(card)
  }

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onDelete(card.id)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow flex flex-col">
      <Link href={`/cards/${card.id}`} className="flex-1 block p-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${TYPE_BADGE[card.type]}`}>
            {TYPE_LABEL[card.type]}
          </span>
          {lockedBy && (
            <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
              <span>🔒</span>
              <span className="truncate max-w-[120px]">{lockedBy}</span>
            </span>
          )}
        </div>

        <p className="font-semibold text-gray-800 leading-snug">{card.customer}</p>
        <p className="text-sm text-gray-500 mt-0.5">{card.model}</p>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
          {card.eq_id && (
            <span className="text-xs text-gray-400">EQ: {card.eq_id}</span>
          )}
          {card.sid && (
            <span className="text-xs text-gray-400">SID: {card.sid}</span>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">Updated {formatDate(card.updated_at)}</p>
      </Link>

      <div className="border-t border-gray-100 px-5 py-2 flex justify-end gap-3">
        <button
          onClick={handleEdit}
          className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
