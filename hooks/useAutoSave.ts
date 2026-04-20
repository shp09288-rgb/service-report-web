'use client'

import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface AutoSaveOptions {
  delay?: number
  lockedBy?: string
  onLockLost?: () => void
}

export function useAutoSave(
  content: unknown,
  docId: string,
  enabled: boolean,
  options: AutoSaveOptions = {}
): SaveStatus {
  const { delay = 1500, lockedBy, onLockLost } = options

  const [status, setStatus] = useState<SaveStatus>('idle')
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef  = useRef<AbortController | null>(null)
  // Keep onLockLost in a ref so the timer closure always sees the latest version
  // without adding it as an effect dependency (it's a function, not a value).
  const onLockLostRef = useRef(onLockLost)
  useEffect(() => { onLockLostRef.current = onLockLost }, [onLockLost])

  useEffect(() => {
    if (!enabled || !docId) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      // Cancel any in-flight save before starting a new one
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setStatus('saving')
      try {
        const body: Record<string, unknown> = { content }
        if (lockedBy) body.lockedBy = lockedBy

        const res = await fetch(`/api/documents/${docId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal:  controller.signal,
        })

        if (controller.signal.aborted) return

        if (res.status === 409) {
          // Lock was lost server-side — notify the editor
          setStatus('error')
          onLockLostRef.current?.()
          return
        }

        setStatus(res.ok ? 'saved' : 'error')
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setStatus('error')
      }
    }, delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [content, docId, enabled, delay, lockedBy])

  return status
}
