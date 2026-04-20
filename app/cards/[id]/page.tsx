'use client'

import { use, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { CardRow, DocumentRow } from '@/types/db'
import { defaultFieldServiceContent, defaultInstallationContent } from '@/lib/content-defaults'

type Params = Promise<{ id: string }>

// ── Search utilities ──────────────────────────────────────────

// Flatten all human-readable text out of a document's content
// so keyword search can match across all relevant fields.
// Handles both FieldServiceContent and InstallationContent safely.
function extractSearchableText(content: unknown): string {
  if (!content || typeof content !== 'object') return ''
  const c = content as Record<string, unknown>
  const parts: string[] = []

  // Scalar text fields present in both content types
  for (const f of [
    'fse_name', 'customer', 'model', 'sid', 'eq_id', 'location',
    'crm_case_id', 'main_user', 'tel', 'email', 'service_type',
    'tool_status', 'site_survey', 'noise_level',
    'problem_statement', 'target_statement', 'daily_note', 'data_location',
    'est_complete_date', 'total_cycle_time',
  ]) {
    if (typeof c[f] === 'string') parts.push(c[f] as string)
  }

  // work_completion (FieldService)
  if (c.work_completion && typeof c.work_completion === 'object') {
    const wc = c.work_completion as Record<string, unknown>
    for (const f of ['type', 'reason', 'detail', 'time_log']) {
      if (typeof wc[f] === 'string') parts.push(wc[f] as string)
    }
  }

  // critical_items — both content types have this but different shapes
  if (Array.isArray(c.critical_items)) {
    for (const item of c.critical_items) {
      if (!item || typeof item !== 'object') continue
      const it = item as Record<string, unknown>
      for (const f of ['title', 'note', 'detail', 'next_plan']) {
        if (typeof it[f] === 'string') parts.push(it[f] as string)
      }
    }
  }

  // action_chart (Installation)
  if (Array.isArray(c.action_chart)) {
    for (const row of c.action_chart) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      if (typeof r.item === 'string') parts.push(r.item as string)
    }
  }

  return parts.join(' ')
}

function matchesFilters(
  doc: DocumentRow,
  dateFilter: string,
  keywordFilter: string,
): boolean {
  if (dateFilter && doc.report_date !== dateFilter) return false
  const kw = keywordFilter.trim().toLowerCase()
  if (kw) {
    const text = extractSearchableText(doc.content).toLowerCase()
    if (!text.includes(kw)) return false
  }
  return true
}

// ── Reusable document table section ──────────────────────────
interface DocSectionProps {
  title: string
  docs: DocumentRow[]
  onOpen: (id: string) => void
  emptyText: string
}

function DocSection({ title, docs, onOpen, emptyText }: DocSectionProps) {
  const isExternal = title === 'External'
  return (
    <div>
      <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
        isExternal ? 'text-orange-600' : 'text-gray-500'
      }`}>
        {title}
      </h2>
      {docs.length === 0 ? (
        <p className="text-xs text-gray-400 italic px-1">{emptyText}</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Report Date</th>
                <th className="text-left px-5 py-3">Last Updated</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(doc => (
                <tr
                  key={doc.id}
                  onClick={() => onOpen(doc.id)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-gray-800">
                    {formatDate(doc.report_date)}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{formatDate(doc.updated_at)}</td>
                  <td className="px-5 py-3 text-gray-400 text-right">→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
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
  // iso may be 'YYYY-MM-DD' (report_date) or full ISO timestamp (updated_at).
  // Appending T00:00:00 prevents the date shifting due to UTC interpretation.
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

// ── Search bar component ──────────────────────────────────────
interface SearchBarProps {
  dateFilter: string
  keywordFilter: string
  onDateChange: (v: string) => void
  onKeywordChange: (v: string) => void
  onClear: () => void
}

function SearchBar({ dateFilter, keywordFilter, onDateChange, onKeywordChange, onClear }: SearchBarProps) {
  const isActive = !!(dateFilter || keywordFilter.trim())
  return (
    <div className="flex flex-col sm:flex-row gap-2 bg-white border border-gray-200 rounded-lg px-4 py-3">
      <input
        type="date"
        aria-label="Filter by date"
        className="border border-gray-300 rounded px-3 py-[7px] text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-700 sm:w-44"
        value={dateFilter}
        onChange={e => onDateChange(e.target.value)}
      />
      <input
        type="text"
        placeholder="Search by keyword…"
        aria-label="Filter by keyword"
        className="flex-1 border border-gray-300 rounded px-3 py-[7px] text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-700 min-w-0"
        value={keywordFilter}
        onChange={e => onKeywordChange(e.target.value)}
      />
      <button
        onClick={onClear}
        disabled={!isActive}
        className="shrink-0 border border-gray-300 rounded px-4 py-[7px] text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-default transition-colors"
      >
        Clear
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
export default function CardPage({ params }: { params: Params }) {
  const { id } = use(params)
  const router  = useRouter()
  const searchParams = useSearchParams()

  const [card, setCard]         = useState<CardRow | null>(null)
  const [docs, setDocs]         = useState<DocumentRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [pageError, setPageError] = useState('')

  const [showModal, setShowModal]     = useState(false)
  const [reportDate, setReportDate]   = useState(todayISO())
  const [creating, setCreating]       = useState(false)
  const [createError, setCreateError] = useState('')

  // ── Search state (initialised from URL query params) ─────────
  const [dateFilter, setDateFilter]       = useState(() => searchParams.get('date')    ?? '')
  const [keywordFilter, setKeywordFilter] = useState(() => searchParams.get('keyword') ?? '')

  // Sync search state → URL query string
  function updateUrl(date: string, keyword: string) {
    const qp = new URLSearchParams()
    if (date)    qp.set('date',    date)
    if (keyword) qp.set('keyword', keyword)
    const qs = qp.toString()
    router.replace(`/cards/${id}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  function handleDateChange(v: string) {
    setDateFilter(v)
    updateUrl(v, keywordFilter)
  }

  function handleKeywordChange(v: string) {
    setKeywordFilter(v)
    updateUrl(dateFilter, v)
  }

  function handleClear() {
    setDateFilter('')
    setKeywordFilter('')
    router.replace(`/cards/${id}`, { scroll: false })
  }

  useEffect(() => {
    setLoading(true)
    setPageError('')
    Promise.all([
      fetch(`/api/cards/${id}`),
      fetch(`/api/cards/${id}/documents`),
    ])
      .then(async ([cardRes, docsRes]) => {
        if (cardRes.status === 404) { setPageError('Card not found.'); return }
        if (!cardRes.ok)            { setPageError('Failed to load card.'); return }
        const [cardData, docsData]: [CardRow, DocumentRow[]] = await Promise.all([
          cardRes.json(),
          docsRes.ok ? docsRes.json() : Promise.resolve([]),
        ])
        setCard(cardData)
        setDocs(docsData)
      })
      .catch(() => setPageError('Network error. Check your Supabase connection.'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleCreate() {
    if (!card) return
    setCreating(true)
    setCreateError('')

    const content = card.type === 'installation'
      ? defaultInstallationContent(card)
      : defaultFieldServiceContent(card)

    try {
      const res = await fetch(`/api/cards/${id}/documents`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ report_date: reportDate, content }),
      })
      if (res.status === 409) {
        setCreateError('A report for this date already exists.')
        return
      }
      if (!res.ok) {
        const body = await res.json()
        setCreateError(body.error ?? 'Failed to create report.')
        return
      }
      const doc: DocumentRow = await res.json()
      router.push(`/cards/${id}/documents/${doc.id}`)
    } catch {
      setCreateError('Network error.')
    } finally {
      setCreating(false)
    }
  }

  function openModal() {
    setReportDate(todayISO())
    setCreateError('')
    setShowModal(true)
  }

  // ── Filter derivation ─────────────────────────────────────────
  const isFiltered = !!(dateFilter || keywordFilter.trim())

  const filteredInternal = docs
    .filter(d => !d.is_external)
    .filter(d => !isFiltered || matchesFilters(d, dateFilter, keywordFilter))

  const filteredExternal = docs
    .filter(d => d.is_external)
    .filter(d => !isFiltered || matchesFilters(d, dateFilter, keywordFilter))

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (pageError) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-3">
          {pageError}
        </div>
        <Link href="/dashboard" className="inline-block mt-4 text-sm text-blue-600 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{card!.customer}</span>
      </div>

      {/* Card header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded mb-2 ${TYPE_BADGE[card!.type]}`}>
              {TYPE_LABEL[card!.type]}
            </span>
            <h1 className="text-xl font-bold text-gray-800">{card!.customer}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{card!.model}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {card!.type === 'installation' && (
              <Link
                href={`/cards/${id}/gantt`}
                className="text-sm border border-green-300 text-green-700 rounded px-4 py-2 hover:bg-green-50 transition-colors"
              >
                Gantt Chart →
              </Link>
            )}
            <button
              onClick={openModal}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              + New Report
            </button>
          </div>
        </div>
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center text-gray-400 text-sm">
          No reports yet. Click <strong>+ New Report</strong> to create one.
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Search bar ──────────────────────────────────── */}
          <SearchBar
            dateFilter={dateFilter}
            keywordFilter={keywordFilter}
            onDateChange={handleDateChange}
            onKeywordChange={handleKeywordChange}
            onClear={handleClear}
          />

          {/* ── Internal / External sections ────────────────── */}
          <div className="space-y-6 pt-2">
            <DocSection
              title="Internal"
              docs={filteredInternal}
              onOpen={docId => router.push(`/cards/${id}/documents/${docId}`)}
              emptyText={isFiltered ? 'No internal reports match your search.' : 'No internal reports.'}
            />
            <DocSection
              title="External"
              docs={filteredExternal}
              onOpen={docId => router.push(`/cards/${id}/documents/${docId}`)}
              emptyText={
                isFiltered
                  ? 'No external reports match your search.'
                  : 'No external reports yet. Open an internal report and use "Sync to External".'
              }
            />
          </div>
        </div>
      )}

      {/* New report modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-bold text-gray-800">New Report</h2>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Report Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={reportDate}
                  onChange={e => setReportDate(e.target.value)}
                />
              </div>
              {createError && (
                <p className="text-xs text-red-500">{createError}</p>
              )}
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="text-sm px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
