'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { UserProfileModal } from '@/components/UserProfileModal'

export function AppHeader() {
  const { userName, userTeam, ready } = useCurrentUser()
  const [showProfile, setShowProfile] = useState(false)

  const initial = userName ? userName[0].toUpperCase() : '?'
  const label = userName
    ? userTeam ? `${userName} (${userTeam})` : userName
    : 'Set your name'

  return (
    <>
      <header className="bg-[#0F172A] text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="font-bold text-sm tracking-wide hover:text-blue-300 transition-colors"
          >
            Park Systems
          </Link>
          <span className="text-slate-600 text-xs select-none">|</span>
          <span className="text-slate-400 text-xs">Service Report Tool</span>
        </div>

        {ready && (
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors group"
          >
            <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0 group-hover:bg-blue-500 transition-colors">
              {initial}
            </span>
            <span className={userName ? '' : 'text-slate-500 italic'}>
              {label}
            </span>
          </button>
        )}
      </header>

      {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}
