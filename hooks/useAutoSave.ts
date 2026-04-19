'use client'

import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useAutoSave(
  content: unknown,
  docId: string,
  enabled: boolean,
  delay = 1500
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !docId) return

    if (timer.current) clearTimeout(timer.current)

    timer.current = setTimeout(async () => {
      setStatus('saving')
      try {
        const res = await fetch(`/api/documents/${docId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ content }),
        })
        setStatus(res.ok ? 'saved' : 'error')
      } catch {
        setStatus('error')
      }
    }, delay)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [content, docId, enabled, delay])

  return status
}
