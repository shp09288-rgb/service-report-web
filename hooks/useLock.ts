'use client'

import { useEffect, useRef, useState } from 'react'

const HEARTBEAT_MS = 20_000 // 20 seconds

export type LockState =
  | { status: 'loading' }
  | { status: 'acquired' }
  | { status: 'denied'; lockedBy: string; expiresAt: string }
  | { status: 'error'; message: string }

export function useLock(cardId: string, userName: string): LockState {
  const [lockState, setLockState] = useState<LockState>({ status: 'loading' })
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heldRef      = useRef(false)

  useEffect(() => {
    // Skip API calls until we have both identifiers
    if (!cardId || !userName) return

    heldRef.current = false
    setLockState({ status: 'loading' })

    async function acquire(): Promise<boolean> {
      try {
        const res = await fetch('/api/locks/acquire', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ cardId, userName }),
        })

        if (res.ok) {
          heldRef.current = true
          setLockState({ status: 'acquired' })
          return true
        }

        if (res.status === 409) {
          const data = await res.json()
          heldRef.current = false
          setLockState({ status: 'denied', lockedBy: data.lockedBy, expiresAt: data.expiresAt })
          return false
        }

        setLockState({ status: 'error', message: 'Failed to acquire lock.' })
        return false
      } catch {
        setLockState({ status: 'error', message: 'Network error.' })
        return false
      }
    }

    async function release() {
      if (!heldRef.current) return
      heldRef.current = false
      try {
        await fetch('/api/locks/release', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ cardId, userName }),
        })
      } catch {
        // best-effort release — ignore errors on unmount
      }
    }

    acquire().then(acquired => {
      if (acquired) {
        heartbeatRef.current = setInterval(acquire, HEARTBEAT_MS)
      }
    })

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      release()
    }
  }, [cardId, userName])

  return lockState
}
