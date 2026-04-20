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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-bold text-gray-800">User Profile</h2>
          <p className="text-xs text-gray-500 mt-0.5">Used to identify you when editing reports.</p>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. 홍길동"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Team</label>
            <input
              type="text"
              placeholder="e.g. AFM Team"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={team}
              onChange={e => setTeam(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
