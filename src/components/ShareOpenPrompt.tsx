'use client'

import { DownloadCloud, X } from 'lucide-react'

interface Props {
  name: string
  typeCount: number
  stickyCount: number
  onOpen: () => void
  onDismiss: () => void
}

/**
 * Shown when the URL carries a shared board. Deliberately a prompt rather than
 * an automatic import: a link should never silently add projects to someone's
 * board list, and the recipient should see what they are about to get.
 */
export default function ShareOpenPrompt({
  name,
  typeCount,
  stickyCount,
  onOpen,
  onDismiss,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative">
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
          onClick={onDismiss}
          title="Ignore this link"
        >
          <X size={16} />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-1">Someone shared a board with you</h2>
        <p className="text-sm text-gray-500 mb-4">
          Opening it adds a new project. Nothing you already have is changed or replaced.
        </p>

        <div className="border border-gray-200 rounded-lg px-3 py-2.5 mb-5">
          <p className="font-semibold text-sm text-gray-900 mb-0.5">{name}</p>
          <p className="text-xs text-gray-500">
            {typeCount} content type{typeCount === 1 ? '' : 's'}
            {stickyCount > 0 && `, ${stickyCount} sticky note${stickyCount === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            onClick={onDismiss}
          >
            Not now
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#1773eb' }}
            onClick={onOpen}
          >
            <DownloadCloud size={14} /> Open as a new project
          </button>
        </div>
      </div>
    </div>
  )
}
