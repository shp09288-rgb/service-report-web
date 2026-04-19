'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FieldServiceEditor } from '@/components/editors/FieldServiceEditor'
import { InstallationEditor } from '@/components/editors/InstallationEditor'
import { useAutoSave, type SaveStatus } from '@/hooks/useAutoSave'
import { useLock } from '@/hooks/useLock'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { CardRow, DocumentRow } from '@/types/db'
import type { FieldServiceContent, InstallationContent } from '@/types/report'

type Content = FieldServiceContent | InstallationContent

interface Props {
  cardId: string
  docId: string
}

function formatDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const SAVE_TEXT: Record<SaveStatus, string> = {
  idle:   '',
  saving: 'Saving…',
  saved:  'Saved',
  error:  'Save failed — check connection',
}
const SAVE_COLOR: Record<SaveStatus, string> = {
  idle:   '',
  saving: 'text-gray-400',
  saved:  'text-green-500',
  error:  'text-red-500',
}

export function DocumentEditorClient({ cardId, docId }: Props) {
  // ── User identity ────────────────────────────────────────────
  const { userName, userTeam, displayName, saveProfile, ready } = useCurrentUser()
  const [nameInput, setNameInput] = useState('')
  const [teamInput, setTeamInput] = useState('')

  // ── Lock ─────────────────────────────────────────────────────
  const lockState = useLock(cardId, displayName ?? '')
  const readOnly  = lockState.status !== 'acquired'

  // ── Document load ────────────────────────────────────────────
  const [card, setCard]       = useState<CardRow | null>(null)
  const [doc, setDoc]         = useState<DocumentRow | null>(null)
  const [content, setContent] = useState<Content | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // ── Auto-save ────────────────────────────────────────────────
  const [saveEnabled, setSaveEnabled] = useState(false)
  // Only save when this user holds the lock
  const saveStatus = useAutoSave(content, docId, saveEnabled && !readOnly)

  // ── Sync ─────────────────────────────────────────────────────
  const [syncing, setSyncing]           = useState(false)
  const [syncedDocId, setSyncedDocId]   = useState<string | null>(null)
  const [syncError, setSyncError]       = useState('')

  // ── Export ───────────────────────────────────────────────────
  const [exporting, setExporting]       = useState(false)
  const [exportError, setExportError]   = useState('')

  useEffect(() => {
    setLoading(true)
    setLoadError('')
    setSaveEnabled(false)

    Promise.all([
      fetch(`/api/documents/${docId}`),
      fetch(`/api/cards/${cardId}`),
    ])
      .then(async ([docRes, cardRes]) => {
        if (docRes.status === 404) { setLoadError('Document not found.'); return }
        if (!docRes.ok)            { setLoadError('Failed to load document.'); return }
        if (!cardRes.ok)           { setLoadError('Failed to load card.'); return }
        const [docData, cardData]: [DocumentRow, CardRow] = await Promise.all([
          docRes.json(), cardRes.json(),
        ])
        setDoc(docData)
        setCard(cardData)
        setContent(docData.content as Content)
      })
      .catch(() => setLoadError('Network error. Check your Supabase connection.'))
      .finally(() => setLoading(false))
  }, [cardId, docId])

  function handleChange(next: Content) {
    setContent(next)
    setSaveEnabled(true)
  }

  async function handleExport() {
    if (!doc || !card) return
    setExporting(true)
    setExportError('')
    try {
      const res = await fetch('/api/export/docx', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId: docId }),
      })
      if (!res.ok) {
        const body = await res.json()
        setExportError(body.error ?? 'Export failed.')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const prefix = card?.type === 'installation' ? 'installation' : 'field-service'
      a.download = `${prefix}-${doc.report_date}.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Network error during export.')
    } finally {
      setExporting(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncError('')
    setSyncedDocId(null)
    try {
      const res = await fetch(`/api/documents/${docId}/sync`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json()
        setSyncError(body.error ?? 'Sync failed.')
        return
      }
      const { externalId } = await res.json()
      setSyncedDocId(externalId)
    } catch {
      setSyncError('Network error during sync.')
    } finally {
      setSyncing(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────

  // Wait for localStorage read to finish (avoids hydration mismatch)
  if (!ready) return null

  // Username prompt — must enter name before editing
  if (!userName) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
          <h2 className="text-base font-bold text-gray-800 mb-1">Identify yourself</h2>
          <p className="text-sm text-gray-500 mb-4">
            Required to track who is editing this document.
          </p>
          <div className="space-y-3 mb-4">
            <input
              type="text"
              autoFocus
              placeholder="Your name"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveProfile(nameInput, teamInput)}
            />
            <input
              type="text"
              placeholder="Team / Department (optional)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={teamInput}
              onChange={e => setTeamInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveProfile(nameInput, teamInput)}
            />
          </div>
          <button
            onClick={() => saveProfile(nameInput, teamInput)}
            disabled={!nameInput.trim()}
            className="w-full bg-blue-600 text-white text-sm py-2 rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  // Document load error
  if (!loading && (loadError || !card || !doc || !content)) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-3">
          {loadError || 'Unexpected error.'}
        </div>
        <Link href={`/cards/${cardId}`} className="inline-block text-sm text-blue-600 hover:underline">
          ← Back to Card
        </Link>
      </div>
    )
  }

  // Loading skeleton
  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading document…</div>
  }

  // ── Main editor view ─────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Lock banner — shown when another user holds the lock */}
      {lockState.status === 'denied' && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          <span className="text-base">🔒</span>
          <span>
            Currently being edited by <strong>{lockState.lockedBy}</strong>.
            You are in <strong>read-only</strong> mode.
          </span>
        </div>
      )}

      {lockState.status === 'error' && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          Lock error: {lockState.message}
        </div>
      )}

      {/* Sync success banner */}
      {syncedDocId && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3">
          <span>Synced to external successfully.</span>
          <Link
            href={`/cards/${cardId}/documents/${syncedDocId}`}
            className="font-medium underline hover:no-underline ml-4 shrink-0"
          >
            View External →
          </Link>
        </div>
      )}

      {/* Sync error */}
      {syncError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {syncError}
        </div>
      )}

      {/* Export error */}
      {exportError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {exportError}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            doc!.is_external ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {doc!.is_external ? 'External' : 'Internal'}
          </span>
          <span className="text-sm font-medium text-gray-700">{formatDate(doc!.report_date)}</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Save status — hidden when idle or read-only */}
          {!readOnly && saveStatus !== 'idle' && (
            <span className={`text-xs ${SAVE_COLOR[saveStatus]}`}>
              {SAVE_TEXT[saveStatus]}
            </span>
          )}

          {/* Lock indicator */}
          <span className="text-xs text-gray-400">
            {lockState.status === 'loading'  && 'Checking edit access…'}
            {lockState.status === 'acquired' && (
              <span>
                Editing as <strong className="text-gray-600">{userName}</strong>
                {userTeam && <span className="text-gray-400"> · {userTeam}</span>}
              </span>
            )}
            {lockState.status === 'denied'   && 'Read-only'}
          </span>

          {/* Internal doc: sync button */}
          {!doc!.is_external && lockState.status === 'acquired' && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-sm border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {syncing ? 'Syncing…' : 'Sync to External'}
            </button>
          )}

          {/* External doc: link back to internal source */}
          {doc!.is_external && doc!.parent_document_id && (
            <Link
              href={`/cards/${cardId}/documents/${doc!.parent_document_id}`}
              className="text-sm border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              ← View Internal
            </Link>
          )}

          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-sm bg-gray-700 text-white rounded px-3 py-1.5 hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export .docx'}
          </button>
        </div>
      </div>

      {/* Editor */}
      {card!.type === 'installation' ? (
        <InstallationEditor
          content={content as InstallationContent}
          onChange={c => handleChange(c)}
          readOnly={readOnly}
        />
      ) : (
        <FieldServiceEditor
          content={content as FieldServiceContent}
          onChange={c => handleChange(c)}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}
