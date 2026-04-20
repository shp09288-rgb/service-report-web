'use client'

import { useEffect, useRef, useState } from 'react'

const HEARTBEAT_MS = 20_000 // 20 s — heartbeat when held, retry poll when denied

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
    if (!cardId || !userName) return

    // `active` prevents state updates and interval creation after this effect
    // cleans up (e.g. fast navigation away while the first fetch is in-flight).
    let active = true

    heldRef.current = false
    setLockState({ status: 'loading' })

    async function acquire() {
      try {
        const res = await fetch('/api/locks/acquire', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ cardId, userName }),
        })

        if (!active) return // unmounted while fetch was in-flight

        if (res.ok) {
          heldRef.current = true
          setLockState({ status: 'acquired' })
          return
        }

        if (res.status === 409) {
          const data = await res.json()
          if (!active) return
          heldRef.current = false
          setLockState({ status: 'denied', lockedBy: data.lockedBy, expiresAt: data.expiresAt })
          return
        }

        heldRef.current = false
        setLockState({ status: 'error', message: 'Failed to acquire lock.' })
      } catch {
        if (!active) return
        heldRef.current = false
        setLockState({ status: 'error', message: 'Network error.' })
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
        // best-effort — lock expires naturally after 60 s
      }
    }

    // Initial acquire, then start interval unconditionally.
    // While held: interval acts as heartbeat (refreshes TTL).
    // While denied/error: interval acts as retry poll — auto-upgrades to
    // editing when the blocking lock expires.
    acquire().then(() => {
      if (!active) return // cleaned up before fetch resolved — don't create zombie interval
      heartbeatRef.current = setInterval(acquire, HEARTBEAT_MS)
    })

    return () => {
      active = false
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      release()
    }
  }, [cardId, userName])

  return lockState
}
