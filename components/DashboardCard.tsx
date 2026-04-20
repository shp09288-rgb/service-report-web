'use client'

import Link from 'next/link'
import type { CardRow } from '@/types/db'

interface Props {
  card: CardRow
  lockedBy?: string | null
  selected?: boolean
  onToggleSelect?: (id: string, selected: boolean) => void
  onEdit: (card: CardRow) => void
  onDelete: (id: string) => void
}

const TYPE_LABEL: Record<CardRow['type'], string> = {
  field_service: 'Field Service',
  installation:  'Installation',
}

const TYPE_BADGE: Record<CardRow['type'], string> = {
  field_service: 'bg-blue-50 text-blue-700 border border-blue-200',
  installation:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function DashboardCard({ card, lockedBy, selected = false, onToggleSelect, onEdit, onDelete }: Props) {
  return (
    <div
      className={`group/card bg-white border rounded-xl shadow-sm hover:shadow-md transition-all duration-150 flex flex-col cursor-pointer ${
        selected
          ? 'border-[#93C5FD] ring-1 ring-[#DBEAFE]'
          : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
      }`}
    >

      {/* Clickable card body */}
      <Link href={`/cards/${card.id}`} className="flex-1 block p-5 group-hover/card:bg-[#F8FAFC] rounded-t-xl transition-colors duration-150">

        {/* Badges row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-md ${TYPE_BADGE[card.type]}`}>
            {TYPE_LABEL[card.type]}
          </span>
          {lockedBy && (
            <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-1.5 py-0.5">
              <span aria-hidden>🔒</span>
              <span className="truncate max-w-[110px]">{lockedBy}</span>
            </span>
          )}
        </div>

        {/* Primary identity */}
        <p className="font-semibold text-[#0F172A] text-sm leading-snug">{card.customer}</p>
        <p className="text-sm text-[#64748B] mt-0.5">{card.model}</p>

        {/* Secondary metadata tags */}
        {(card.eq_id || card.sid) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2.5">
            {card.eq_id && (
              <span className="inline-flex items-center gap-1 text-xs text-[#64748B]">
                <span className="font-medium text-[#94A3B8]">EQ</span>
                {card.eq_id}
              </span>
            )}
            {card.sid && (
              <span className="inline-flex items-center gap-1 text-xs text-[#64748B]">
                <span className="font-medium text-[#94A3B8]">SID</span>
                {card.sid}
              </span>
            )}
          </div>
        )}

        {/* Updated date */}
        <p className="text-xs text-[#94A3B8] mt-3">Updated {formatDate(card.updated_at)}</p>
      </Link>

      {/* Action bar */}
      <div className="border-t border-[#E2E8F0] px-5 py-2.5 flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-[#64748B] select-none">
          <input
            type="checkbox"
            checked={selected}
            onChange={e => onToggleSelect?.(card.id, e.target.checked)}
            onClick={e => { e.stopPropagation() }}
            className="h-3.5 w-3.5 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]/30"
            aria-label={`Select ${card.customer}`}
          />
          Select
        </label>
        
        <div className="flex items-center justify-end gap-1">
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onEdit(card) }}
          className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          Edit
        </button>
        <span className="text-[#E2E8F0] text-xs select-none">|</span>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(card.id) }}
          className="text-xs font-medium text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
        >
          Delete
        </button>
        </div>
      </div>
    </div>
  )
}
