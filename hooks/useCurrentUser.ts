'use client'

import { useEffect, useState } from 'react'

const KEY_NAME = 'ps_user_name'
const KEY_TEAM = 'ps_user_team'

export function useCurrentUser() {
  const [userName, setUserName] = useState<string | null>(null)
  const [userTeam, setUserTeam] = useState<string | null>(null)
  // ready=false until localStorage is read — prevents hydration mismatch
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUserName(localStorage.getItem(KEY_NAME) || null)
    setUserTeam(localStorage.getItem(KEY_TEAM) || null)
    setReady(true)
  }, [])

  function saveProfile(name: string, team: string) {
    const n = name.trim()
    const t = team.trim()
    if (!n) return
    localStorage.setItem(KEY_NAME, n)
    // Always write the team key; empty string is fine (cleared on next read)
    localStorage.setItem(KEY_TEAM, t)
    setUserName(n)
    setUserTeam(t || null)
  }

  // Combined display string — used as the lock identity token
  const displayName = userName
    ? userTeam ? `${userName} · ${userTeam}` : userName
    : null

  return { userName, userTeam, displayName, saveProfile, ready }
}
