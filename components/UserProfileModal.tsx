'use client'

import { useState } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'

interface Props {
  onClose: () => void
}

export function UserProfileModal({ onClose }: Props) {
  const { userName, userTeam, saveProfile } = useCurrentUser()
  const [name, setName] = useState(userName ?? '')
  const [team, setTeam] = useState(userTeam ?? '')
  const [error, setError] = useState('')

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    saveProfile(name.trim(), team.trim())
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-[#0F172A]/50 flex items-center justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4">

        <div className="border-b border-[#E2E8F0] px-6 py-4">
          <h2 className="text-sm font-semibold text-[#0F172A]">User Profile</h2>
          <p className="text-xs text-[#64748B] mt-0.5">Identifies you when editing reports.</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. 홍길동"
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
              Team <span className="text-[#94A3B8] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. AFM Team"
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors"
              value={team}
              onChange={e => setTeam(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="border-t border-[#E2E8F0] px-6 py-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
