'use client'

import { useEffect, useState } from 'react'
import { DashboardCard } from '@/components/DashboardCard'
import type { CardRow } from '@/types/db'

type CardType   = 'field_service' | 'installation'
type TypeFilter = 'all' | CardType

interface ActiveLock { card_id: string; user_name: string }

const EMPTY_CARD_FORM = {
  type:     'field_service' as CardType,
  customer: '',
  model:    '',
  sid:      '',
  eq_id:    '',
  location: '',
}

export default function DashboardPage() {
  const [cards, setCards]             = useState<CardRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [fetchError, setFetchError]   = useState('')
  const [activeLocks, setActiveLocks] = useState<Record<string, string>>({})

  // Search / filter
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>('all')

  // Create card modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm]           = useState(EMPTY_CARD_FORM)
  const [creating, setCreating]               = useState(false)
  const [createError, setCreateError]         = useState('')

  // Edit card modal
  const [editingCard, setEditingCard] = useState<CardRow | null>(null)
  const [editForm, setEditForm]       = useState(EMPTY_CARD_FORM)
  const [saving, setSaving]           = useState(false)
  const [editError, setEditError]     = useState('')

  // Delete + admin password modal
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deletePassword, setDeletePassword]   = useState('')
  const [verifying, setVerifying]             = useState(false)
  const [verifyError, setVerifyError]         = useState('')

  // Change password modal
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [currentPw, setCurrentPw]                   = useState('')
  const [newPw, setNewPw]                           = useState('')
  const [confirmPw, setConfirmPw]                   = useState('')
  const [changingPw, setChangingPw]                 = useState(false)
  const [changePwError, setChangePwError]           = useState('')
  const [changePwSuccess, setChangePwSuccess]       = useState(false)

  // Backup
  const [backing, setBacking]       = useState(false)
  const [backupError, setBackupError] = useState('')

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

  // ── Create card ──────────────────────────────────────────────

  function openCreate() {
    setCreateForm(EMPTY_CARD_FORM)
    setCreateError('')
    setShowCreateModal(true)
  }

  async function handleCreate() {
    if (!createForm.customer.trim() || !createForm.model.trim()) {
      setCreateError('Customer and Model are required.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/cards', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(createForm),
      })
      if (!res.ok) {
        const body = await res.json()
        setCreateError(body.error ?? 'Failed to create card.')
        return
      }
      const card: CardRow = await res.json()
      setCards(prev => [card, ...prev])
      setShowCreateModal(false)
    } catch {
      setCreateError('Network error.')
    } finally {
      setCreating(false)
    }
  }

  // ── Edit card ────────────────────────────────────────────────

  function openEdit(card: CardRow) {
    setEditingCard(card)
    setEditForm({
      type:     card.type,
      customer: card.customer,
      model:    card.model,
      sid:      card.sid,
      eq_id:    card.eq_id,
      location: card.location,
    })
    setEditError('')
    setSaving(false)
  }

  async function handleSaveEdit() {
    if (!editingCard) return
    if (!editForm.customer.trim() || !editForm.model.trim()) {
      setEditError('Customer and Model are required.')
      return
    }
    setSaving(true)
    setEditError('')
    try {
      const res = await fetch(`/api/cards/${editingCard.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(editForm),
      })
      if (!res.ok) {
        const body = await res.json()
        setEditError(body.error ?? 'Failed to save card.')
        return
      }
      const updated: CardRow = await res.json()
      setCards(prev => prev.map(c => c.id === updated.id ? updated : c))
      setEditingCard(null)
    } catch {
      setEditError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete card ──────────────────────────────────────────────

  function requestDelete(id: string) {
    setPendingDeleteId(id)
    setDeletePassword('')
    setVerifyError('')
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return
    setVerifying(true)
    setVerifyError('')
    try {
      const delRes = await fetch(`/api/cards/${pendingDeleteId}`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: deletePassword }),
      })
      if (delRes.status === 401) { setVerifyError('Incorrect password.'); return }
      if (!delRes.ok)            { setVerifyError('Delete failed — server error.'); return }
      setCards(prev => prev.filter(c => c.id !== pendingDeleteId))
      setPendingDeleteId(null)
    } catch {
      setVerifyError('Network error.')
    } finally {
      setVerifying(false)
    }
  }

  // ── Change password ──────────────────────────────────────────

  function openChangePassword() {
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    setChangePwError('')
    setChangePwSuccess(false)
    setShowChangePassword(true)
  }

  async function handleChangePassword() {
    if (!currentPw || !newPw || !confirmPw) {
      setChangePwError('All fields are required.')
      return
    }
    if (newPw !== confirmPw) {
      setChangePwError('New passwords do not match.')
      return
    }
    setChangingPw(true)
    setChangePwError('')
    try {
      const res = await fetch('/api/admin/change-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currentPassword: currentPw, newPassword: newPw, confirmPassword: confirmPw }),
      })
      const body = await res.json()
      if (!res.ok) {
        setChangePwError(body.error ?? 'Failed to change password.')
        return
      }
      setChangePwSuccess(true)
    } catch {
      setChangePwError('Network error.')
    } finally {
      setChangingPw(false)
    }
  }

  // ── Backup ───────────────────────────────────────────────────

  async function handleBackup() {
    setBacking(true)
    setBackupError('')
    try {
      const res = await fetch('/api/backup')
      if (!res.ok) { setBackupError('Backup failed. Try again.'); return }
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

  // ── Filtered card list ───────────────────────────────────────

  const filteredCards = cards
    .filter(c => typeFilter === 'all' || c.type === typeFilter)
    .filter(c => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        c.customer.toLowerCase().includes(q) ||
        c.model.toLowerCase().includes(q) ||
        c.eq_id.toLowerCase().includes(q) ||
        c.sid.toLowerCase().includes(q)
      )
    })

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
        <div className="flex gap-2">
          <button
            onClick={openChangePassword}
            className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Change Password
          </button>
          <button
            onClick={handleBackup}
            disabled={backing}
            className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {backing ? 'Exporting…' : 'Backup Export'}
          </button>
          <button
            onClick={openCreate}
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
          placeholder="Search customer, model, EQ ID, SID…"
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
      {backupError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-3 mt-3">
          {backupError}
        </div>
      )}

      {/* Card grid */}
      {!loading && !fetchError && (
        filteredCards.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center text-gray-400 text-sm">
            {cards.length === 0
              ? <><strong>+ New Card</strong> to get started.</>
              : 'No cards match your search.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCards.map(card => (
              <DashboardCard
                key={card.id}
                card={card}
                lockedBy={activeLocks[card.id] ?? null}
                onEdit={openEdit}
                onDelete={requestDelete}
              />
            ))}
          </div>
        )
      )}

      {/* ── Create card modal ─────────────────────────────────── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-bold text-gray-800">New Card</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <select
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={createForm.type}
                  onChange={e => setCreateForm(f => ({ ...f, type: e.target.value as CardType }))}
                >
                  <option value="field_service">Field Service</option>
                  <option value="installation">Installation</option>
                </select>
              </div>
              {(
                [
                  { key: 'customer', label: 'Customer', placeholder: 'e.g. Samsung Display — Asan' },
                  { key: 'model',    label: 'Model',    placeholder: 'e.g. NX20' },
                  { key: 'sid',      label: 'SID',      placeholder: 'e.g. SID-00123' },
                  { key: 'eq_id',    label: 'EQ ID',    placeholder: 'e.g. NX20-003' },
                  { key: 'location', label: 'Location', placeholder: 'e.g. Asan, South Korea' },
                ] as { key: keyof typeof createForm; label: string; placeholder: string }[]
              ).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {label}{(key === 'customer' || key === 'model') && <span className="text-red-400"> *</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={createForm[key]}
                    onChange={e => setCreateForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              {createError && <p className="text-xs text-red-500">{createError}</p>}
            </div>
            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
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

      {/* ── Edit card modal ───────────────────────────────────── */}
      {editingCard && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setEditingCard(null) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-bold text-gray-800">Edit Card</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              {(
                [
                  { key: 'customer', label: 'Customer', placeholder: '' },
                  { key: 'model',    label: 'Model',    placeholder: '' },
                  { key: 'sid',      label: 'SID',      placeholder: '' },
                  { key: 'eq_id',    label: 'EQ ID',    placeholder: '' },
                  { key: 'location', label: 'Location', placeholder: '' },
                ] as { key: keyof typeof editForm; label: string; placeholder: string }[]
              ).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {label}{(key === 'customer' || key === 'model') && <span className="text-red-400"> *</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={editForm[key]}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              {editError && <p className="text-xs text-red-500">{editError}</p>}
            </div>
            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => setEditingCard(null)}
                className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="text-sm px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────── */}
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
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
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
                disabled={verifying || !deletePassword}
                className="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {verifying ? 'Verifying…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change password modal ─────────────────────────────── */}
      {showChangePassword && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowChangePassword(false) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-bold text-gray-800">Change Password</h2>
            </div>

            {changePwSuccess ? (
              <div className="px-6 py-8 text-center space-y-4">
                <p className="text-sm text-green-700 font-medium">Password changed successfully.</p>
                <button
                  onClick={() => setShowChangePassword(false)}
                  className="text-sm px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="px-6 py-5 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Current Password</label>
                    <input
                      type="password"
                      autoFocus
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={currentPw}
                      onChange={e => setCurrentPw(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">New Password</label>
                    <input
                      type="password"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                    />
                  </div>
                  {changePwError && <p className="text-xs text-red-500">{changePwError}</p>}
                </div>
                <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-2">
                  <button
                    onClick={() => setShowChangePassword(false)}
                    className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={changingPw}
                    className="text-sm px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {changingPw ? 'Saving…' : 'Change Password'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
