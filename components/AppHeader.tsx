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
  const isUnset = !userName

  return (
    <>
      <header className="bg-[#0F172A] text-white px-8 py-0 flex items-stretch justify-between border-b border-[#1E293B] shadow-sm">
        {/* Left — logo + subtitle */}
        <div className="flex items-center gap-4 py-3.5">
          <Link
            href="/dashboard"
            className="font-bold text-sm tracking-wide text-white hover:text-blue-300 transition-colors"
          >
            Park Systems
          </Link>
          <span className="w-px h-4 bg-slate-600 shrink-0" />
          <span className="text-slate-400 text-xs font-normal">Service Report Tool</span>
        </div>

        {/* Right — user profile control */}
        {ready && (
          <button
            onClick={() => setShowProfile(true)}
            className={`flex items-center gap-2.5 py-3.5 group rounded px-2 -mr-2 transition-colors ${
              isUnset ? 'ring-1 ring-slate-600 hover:ring-slate-400' : ''
            }`}
            aria-label="Edit user profile"
          >
            {/* Avatar circle */}
            <span className="w-7 h-7 rounded-full bg-[#2563EB] group-hover:bg-[#1D4ED8] flex items-center justify-center text-xs font-bold text-white shrink-0 transition-colors">
              {initial}
            </span>
            {/* Name / prompt */}
            <span className={`text-sm transition-colors ${
              isUnset
                ? 'text-slate-500 italic group-hover:text-slate-300'
                : 'text-slate-200 group-hover:text-white'
            }`}>
              {label}
            </span>
            {/* Edit indicator */}
            <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-xs leading-none">
              ✎
            </span>
          </button>
        )}
      </header>

      {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}
