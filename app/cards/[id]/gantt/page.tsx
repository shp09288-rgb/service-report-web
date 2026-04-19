'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { GanttEditor } from '@/components/GanttEditor'
import type { CardRow, GanttTask } from '@/types/db'

type Params = Promise<{ id: string }>
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function GanttPage({ params }: { params: Params }) {
  const { id } = use(params)

  const [card, setCard]         = useState<CardRow | null>(null)
  const [tasks, setTasks]       = useState<GanttTask[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [initialized, setInitialized] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ─────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setLoadError('')
    setInitialized(false)

    Promise.all([
      fetch(`/api/cards/${id}`),
      fetch(`/api/cards/${id}/gantt`),
    ])
      .then(async ([cardRes, ganttRes]) => {
        if (cardRes.status === 404) { setLoadError('Card not found.'); return }
        if (!cardRes.ok)            { setLoadError('Failed to load card.'); return }

        const cardData: CardRow = await cardRes.json()
        if (cardData.type !== 'installation') {
          setLoadError('Gantt chart is only available for installation cards.')
          return
        }
        setCard(cardData)

        const ganttData = ganttRes.ok ? await ganttRes.json() : { tasks: [] }
        setTasks(ganttData.tasks ?? [])
      })
      .catch(() => setLoadError('Network error. Check your Supabase connection.'))
      .finally(() => setLoading(false))
  }, [id])

  // ── Debounced auto-save ───────────────────────────────────────
  useEffect(() => {
    if (!initialized) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        const res = await fetch(`/api/cards/${id}/gantt`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ tasks }),
        })
        setSaveStatus(res.ok ? 'saved' : 'error')
      } catch {
        setSaveStatus('error')
      }
    }, 1500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [tasks, initialized, id])

  function handleChange(next: GanttTask[]) {
    setTasks(next)
    setInitialized(true)
  }

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-3">
          {loadError}
        </div>
        <Link href={`/cards/${id}`} className="inline-block text-sm text-blue-600 hover:underline">
          ← Back to Card
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
        <span>/</span>
        <Link href={`/cards/${id}`} className="hover:text-blue-600 transition-colors">
          {card!.site}
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Gantt Chart</span>
      </div>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-block text-xs font-medium px-2 py-0.5 rounded mb-2 bg-green-100 text-green-700">
              Installation
            </span>
            <h1 className="text-xl font-bold text-gray-800">{card!.site}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{card!.equipment}</p>
          </div>

          {/* Save status */}
          <div className="text-xs mt-1">
            {saveStatus === 'saving' && <span className="text-gray-400">Saving…</span>}
            {saveStatus === 'saved'  && <span className="text-green-500">Saved</span>}
            {saveStatus === 'error'  && <span className="text-red-500">Save failed</span>}
          </div>
        </div>
      </div>

      {/* Gantt editor */}
      <GanttEditor tasks={tasks} onChange={handleChange} />
    </div>
  )
}
