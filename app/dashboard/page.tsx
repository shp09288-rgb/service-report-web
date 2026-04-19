'use client'

import { useEffect, useState } from 'react'
import { DashboardCard } from '@/components/DashboardCard'
import type { CardRow } from '@/types/db'

type CardType = 'field_service' | 'installation'
type TypeFilter = 'all' | CardType

const EMPTY_FORM = { type: 'field_service' as CardType, site: '', equipment: '' }

interface ActiveLock { card_id: string; user_name: string }

export default function DashboardPage() {
  const [cards, setCards]           = useState<CardRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [activeLocks, setActiveLocks] = useState<Record<string, string>>({})

  // Search / filter
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>('all')

  // Create card modal
  const [showModal, setShowModal]     = useState(false)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [creating, setCreating]       = useState(false)
  const [createError, setCreateError] = useState('')

  // Delete + admin password modal
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [adminPassword, setAdminPassword]     = useState('')
  const [verifying, setVerifying]             = useState(false)
  const [verifyError, setVerifyError]         = useState('')

  // Backup
  const [backing, setBacking] = useState(false)

  useEffect(() => {
    loadCards()
    loadLocks()
  }, [])

  async function loadCards() {
    setLoading(true)
    setFetchError('')
    try {
      const res = await fetch('/api/cards')
      if (!res.ok) throw new Error(`${res.status}`)
      setCards(await res.json())
    } catch {
      setFetchError('Failed to load cards. Check your Supabase connection.')
    } finally {
      setLoading(false)
    }
  }

  async function loadLocks() {
    try {
      const res = await fetch('/api/locks')
      if (!res.ok) return
      const data: ActiveLock[] = await res.json()
      const map: Record<string, string> = {}
      data.forEach(l => { map[l.card_id] = l.user_name })
      setActiveLocks(map)
    } catch {
      // non-critical — lock status is best-effort on dashboard
    }
  }

  async function handleCreate() {
    if (!form.site.trim() || !form.equipment.trim()) {
      setCreateError('Site and equipment are required.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/cards', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, site: form.site.trim(), equipment: form.equipment.trim() }),
      })
      if (!res.ok) {
        const body = await res.json()
        setCreateError(body.error ?? 'Failed to create card.')
        return
      }
      const card: CardRow = await res.json()
      setCards(prev => [card, ...prev])
      setShowModal(false)
      setForm(EMPTY_FORM)
    } catch {
      setCreateError('Network error.')
    } finally {
      setCreating(false)
    }
  }

  // Delete flow: open password modal
  function requestDelete(id: string) {
    setPendingDeleteId(id)
    setAdminPassword('')
    setVerifyError('')
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return
    setVerifying(true)
    setVerifyError('')
    try {
      const vRes = await fetch('/api/admin/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: adminPassword }),
      })
      const { ok } = await vRes.json()
      if (!ok) { setVerifyError('Incorrect password.'); return }

      await fetch(`/api/cards/${pendingDeleteId}`, { method: 'DELETE' })
      setCards(prev => prev.filter(c => c.id !== pendingDeleteId))
      setPendingDeleteId(null)
    } catch {
      setVerifyError('Network error.')
    } finally {
      setVerifying(false)
    }
  }

  async function handleBackup() {
    setBacking(true)
    try {
      const res = await fetch('/api/backup')
      if (!res.ok) return
      const blob  = await res.blob()
      const url   = URL.createObjectURL(blob)
      const date  = new Date().toISOString().split('T')[0]
      const a     = document.createElement('a')
      a.href      = url
      a.download  = `backup-${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setBacking(false)
    }
  }

  function openModal() {
    setForm(EMPTY_FORM)
    setCreateError('')
    setShowModal(true)
  }

  // ── Filtered card list ───────────────────────────────────────
  const filteredCards = cards
    .filter(c => typeFilter === 'all' || c.type === typeFilter)
    .filter(c => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return c.site.toLowerCase().includes(q) || c.equipment.toLowerCase().includes(q)
    })

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
        <div className="flex gap-2">
          <button
            onClick={handleBackup}
            disabled={backing}
            className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {backing ? 'Exporting…' : 'Backup Export'}
          </button>
          <button
            onClick={openModal}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            + New Card
          </button>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search site or equipment…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex rounded border border-gray-300 overflow-hidden text-sm">
          {(['all', 'field_service', 'installation'] as TypeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 transition-colors ${
                typeFilter === t
                  ? 'bg-gray-700 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              } ${t !== 'all' ? 'border-l border-gray-300' : ''}`}
            >
              {t === 'all' ? 'All' : t === 'field_service' ? 'Field Service' : 'Installation'}
            </button>
          ))}
        </div>
      </div>

      {/* States */}
      {loading && <p className="text-sm text-gray-400">Loading cards…</p>}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-3">
          {fetchError}
        </div>
      )}

      {/* Card grid */}
      {!loading && !fetchError && (
        filteredCards.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center text-gray-400 text-sm">
            {cards.length === 0
              ? <>No cards yet. Click <strong>+ New Card</strong> to get started.</>
              : 'No cards match your search.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCards.map(card => (
              <DashboardCard
                key={card.id}
                card={card}
                lockedBy={activeLocks[card.id] ?? null}
                onDelete={requestDelete}
              />
            ))}
          </div>
        )
      )}

      {/* Create card modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-bold text-gray-800">New Card</h2>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <select
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as CardType }))}
                >
                  <option value="field_service">Field Service</option>
                  <option value="installation">Installation</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Site</label>
                <input
                  type="text"
                  placeholder="e.g. Samsung Display — Asan"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={form.site}
                  onChange={e => setForm(f => ({ ...f, site: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Equipment</label>
                <input
                  type="text"
                  placeholder="e.g. NX20-003"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={form.equipment}
                  onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              {createError && <p className="text-xs text-red-500">{createError}</p>}
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

      {/* Admin password modal (delete confirmation) */}
      {pendingDeleteId && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setPendingDeleteId(null) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-bold text-gray-800">Confirm Delete</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">
                This will permanently delete the card and all its reports.
                Enter the admin password to continue.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Admin Password</label>
                <input
                  type="password"
                  autoFocus
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmDelete()}
                />
              </div>
              {verifyError && <p className="text-xs text-red-500">{verifyError}</p>}
            </div>
            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={verifying || !adminPassword}
                className="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {verifying ? 'Verifying…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
