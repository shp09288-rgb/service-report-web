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
  const [editingCard, setEditingCard]     = useState<CardRow | null>(null)
  const [editForm, setEditForm]           = useState(EMPTY_CARD_FORM)
  const [editAdminPassword, setEditAdminPassword] = useState('')
  const [saving, setSaving]               = useState(false)
  const [editError, setEditError]         = useState('')

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

  // Sort
  type SortKey = 'updated_at' | 'customer'
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')

  // Backup
  const [backing, setBacking]       = useState(false)
  const [backupError, setBackupError] = useState('')
  const [selectedCards, setSelectedCards] = useState<string[]>([])

  useEffect(() => {
    loadCards()
    loadLocks()
  }, [])

  useEffect(() => {
    setSelectedCards(prev => prev.filter(id => cards.some(card => card.id === id)))
  }, [cards])

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
    setEditAdminPassword('')
    setEditError('')
    setSaving(false)
  }

  async function handleSaveEdit() {
    if (!editingCard) return
    if (!editForm.customer.trim() || !editForm.model.trim()) {
      setEditError('Customer and Model are required.')
      return
    }
    if (!editAdminPassword) {
      setEditError('Admin password is required to save changes.')
      return
    }
    setSaving(true)
    setEditError('')
    try {
      const res = await fetch(`/api/cards/${editingCard.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...editForm, password: editAdminPassword }),
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
      setSelectedCards(prev => prev.filter(id => id !== pendingDeleteId))
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
      const query = selectedCards.length > 0
        ? `?cardIds=${encodeURIComponent(selectedCards.join(','))}`
        : ''
      const res = await fetch(`/api/backup${query}`)
      if (!res.ok) {
        let message = `Backup failed (${res.status}).`
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {
          // no-op, keep status-based error
        }
        setBackupError(message)
        return
      }
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

  function handleToggleCardSelect(cardId: string, selected: boolean) {
    setSelectedCards(prev => {
      if (selected) return prev.includes(cardId) ? prev : [...prev, cardId]
      return prev.filter(id => id !== cardId)
    })
  }

  function clearSelection() {
    setSelectedCards([])
  }

  // ── Filtered card list ───────────────────────────────────────

  const filteredCards = cards
    .filter(c => typeFilter === 'all' || c.type === typeFilter)
    .filter(c => {
      if (!searchQuery) return true
      const q = searchQuery.trim().toLowerCase()
      return (
        c.customer.toLowerCase().includes(q) ||
        c.model.toLowerCase().includes(q) ||
        c.eq_id.toLowerCase().includes(q) ||
        c.sid.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sortKey === 'customer') return a.customer.localeCompare(b.customer)
      // 'updated_at' DESC — API already returns this order but we re-sort
      // to keep order correct after local edits
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

  // ── Shared style tokens ──────────────────────────────────────
  const input   = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors'
  const label   = 'block text-xs font-medium text-[#0F172A] mb-1.5'
  const btnPri  = 'text-sm font-medium px-4 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-50 transition-colors'
  const btnSec  = 'text-sm font-medium px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors'
  const btnDng  = 'text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors'
  const overlay = 'fixed inset-0 bg-[#0F172A]/50 flex items-center justify-center z-50'
  const panel   = 'bg-white rounded-xl shadow-2xl w-full mx-4'
  const mHead   = 'border-b border-[#E2E8F0] px-6 py-4'
  const mBody   = 'px-6 py-5 space-y-4'
  const mFoot   = 'border-t border-[#E2E8F0] px-6 py-4 flex justify-end gap-2'

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-7">
        <h1 className="text-xl font-bold text-[#0F172A]">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={openChangePassword} className={btnSec}>
            Change Password
          </button>
          <button
            onClick={clearSelection}
            disabled={selectedCards.length === 0}
            className={btnSec}
          >
            Clear Selection
          </button>
          <button onClick={handleBackup} disabled={backing} className={btnSec}>
            {backing
              ? 'Exporting…'
              : selectedCards.length > 0
                ? `Export Selected (${selectedCards.length})`
                : 'Backup Export'}
          </button>
          <button onClick={openCreate} className={btnPri}>
            + New Card
          </button>
        </div>
      </div>

      {/* ── Search + Filter + Sort bar ───────────────────────────── */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search customer, model, SID, EQ ID, or location…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className={`flex-1 ${input}`}
        />
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as 'updated_at' | 'customer')}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors"
        >
          <option value="updated_at">Recently Updated</option>
          <option value="customer">Customer A–Z</option>
        </select>
        <div className="flex rounded-lg border border-[#E2E8F0] overflow-hidden text-sm">
          {(['all', 'field_service', 'installation'] as TypeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-white text-[#64748B] hover:bg-[#F8FAFC]'
              } ${t !== 'all' ? 'border-l border-[#E2E8F0]' : ''}`}
            >
              {t === 'all' ? 'All' : t === 'field_service' ? 'Field Service' : 'Installation'}
            </button>
          ))}
        </div>
      </div>

      {/* ── States ─────────────────────────────────────────────── */}
      {loading && <p className="text-sm text-[#64748B]">Loading cards…</p>}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {fetchError}
        </div>
      )}
      {backupError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mt-3">
          {backupError}
        </div>
      )}

      {/* ── Card grid ───────────────────────────────────────────── */}
      {!loading && !fetchError && (
        filteredCards.length === 0 ? (
          <div className="border border-dashed border-[#E2E8F0] rounded-xl p-12 text-center text-[#64748B] text-sm">
            {cards.length === 0 ? (
              <div className="space-y-4">
                <p>No cards yet.</p>
                <button onClick={openCreate} className={btnPri}>
                  + New Card
                </button>
              </div>
            ) : (
              'No cards match your search.'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCards.map(card => (
              <DashboardCard
                key={card.id}
                card={card}
                lockedBy={activeLocks[card.id] ?? null}
                selected={selectedCards.includes(card.id)}
                onToggleSelect={handleToggleCardSelect}
                onEdit={openEdit}
                onDelete={requestDelete}
              />
            ))}
          </div>
        )
      )}

      {/* ── Create card modal ─────────────────────────────────── */}
      {showCreateModal && (
        <div className={overlay} onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false) }}>
          <div className={`${panel} max-w-md`}>
            <div className={mHead}>
              <h2 className="text-sm font-semibold text-[#0F172A]">New Card</h2>
            </div>
            <div className={mBody}>
              <div>
                <label className={label}>Type</label>
                <select
                  className={input}
                  value={createForm.type}
                  onChange={e => setCreateForm(f => ({ ...f, type: e.target.value as CardType }))}
                >
                  <option value="field_service">Field Service</option>
                  <option value="installation">Installation</option>
                </select>
              </div>
              {(
                [
                  { key: 'customer', label: 'Customer', placeholder: 'e.g. SDC A6' },
                  { key: 'model',    label: 'Model',    placeholder: 'e.g. NX-TSH2326' },
                  { key: 'sid',      label: 'SID',      placeholder: 'e.g. D25005-190423' },
                  { key: 'eq_id',    label: 'EQ ID',    placeholder: 'e.g. EQ01' },
                  { key: 'location', label: 'Location', placeholder: 'e.g. [ASAN] SDC A6 CR2F M16 기둥열 부근' },
                ] as { key: keyof typeof createForm; label: string; placeholder: string }[]
              ).map(({ key, label: lbl, placeholder }) => (
                <div key={key}>
                  <label className={label}>
                    {lbl}{(key === 'customer' || key === 'model') && <span className="text-red-400"> *</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    className={input}
                    value={createForm[key]}
                    onChange={e => setCreateForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              {createError && <p className="text-xs text-red-500">{createError}</p>}
            </div>
            <div className={mFoot}>
              <button onClick={() => setShowCreateModal(false)} className={btnSec}>Cancel</button>
              <button onClick={handleCreate} disabled={creating} className={btnPri}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit card modal ───────────────────────────────────── */}
      {editingCard && (
        <div className={overlay} onClick={e => { if (e.target === e.currentTarget) setEditingCard(null) }}>
          <div className={`${panel} max-w-md`}>
            <div className={mHead}>
              <h2 className="text-sm font-semibold text-[#0F172A]">Edit Card</h2>
            </div>
            <div className={mBody}>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                This only updates the card master data. Existing reports will not be changed.
              </p>
              {(
                [
                  { key: 'customer', label: 'Customer' },
                  { key: 'model',    label: 'Model' },
                  { key: 'sid',      label: 'SID' },
                  { key: 'eq_id',    label: 'EQ ID' },
                  { key: 'location', label: 'Location' },
                ] as { key: keyof typeof editForm; label: string }[]
              ).map(({ key, label: lbl }) => (
                <div key={key}>
                  <label className={label}>
                    {lbl}{(key === 'customer' || key === 'model') && <span className="text-red-400"> *</span>}
                  </label>
                  <input
                    type="text"
                    className={input}
                    value={editForm[key]}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className={label}>
                  Admin Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  placeholder="Required to save changes"
                  className={input}
                  value={editAdminPassword}
                  onChange={e => setEditAdminPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                />
              </div>
              {editError && <p className="text-xs text-red-500">{editError}</p>}
            </div>
            <div className={mFoot}>
              <button onClick={() => setEditingCard(null)} className={btnSec}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} className={btnPri}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────── */}
      {pendingDeleteId && (
        <div className={overlay} onClick={e => { if (e.target === e.currentTarget) setPendingDeleteId(null) }}>
          <div className={`${panel} max-w-sm`}>
            <div className={mHead}>
              <h2 className="text-sm font-semibold text-[#0F172A]">Confirm Delete</h2>
            </div>
            <div className={mBody}>
              <p className="text-sm text-[#64748B]">
                This will permanently delete the card and all its reports.
                Enter the admin password to continue.
              </p>
              <div>
                <label className={label}>Admin Password</label>
                <input
                  type="password"
                  autoFocus
                  className={input}
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmDelete()}
                />
              </div>
              {verifyError && <p className="text-xs text-red-500">{verifyError}</p>}
            </div>
            <div className={mFoot}>
              <button onClick={() => setPendingDeleteId(null)} className={btnSec}>Cancel</button>
              <button onClick={confirmDelete} disabled={verifying || !deletePassword} className={btnDng}>
                {verifying ? 'Verifying…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change password modal ─────────────────────────────── */}
      {showChangePassword && (
        <div className={overlay} onClick={e => { if (e.target === e.currentTarget) setShowChangePassword(false) }}>
          <div className={`${panel} max-w-sm`}>
            <div className={mHead}>
              <h2 className="text-sm font-semibold text-[#0F172A]">Change Password</h2>
            </div>

            {changePwSuccess ? (
              <div className="px-6 py-8 text-center space-y-4">
                <p className="text-sm text-emerald-700 font-medium">Password changed successfully.</p>
                <button onClick={() => setShowChangePassword(false)} className={btnPri}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className={mBody}>
                  <div>
                    <label className={label}>Current Password</label>
                    <input type="password" autoFocus className={input}
                      value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>New Password</label>
                    <input type="password" className={input}
                      value={newPw} onChange={e => setNewPw(e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>Confirm New Password</label>
                    <input type="password" className={input}
                      value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleChangePassword()} />
                  </div>
                  {changePwError && <p className="text-xs text-red-500">{changePwError}</p>}
                </div>
                <div className={mFoot}>
                  <button onClick={() => setShowChangePassword(false)} className={btnSec}>Cancel</button>
                  <button onClick={handleChangePassword} disabled={changingPw} className={btnPri}>
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
