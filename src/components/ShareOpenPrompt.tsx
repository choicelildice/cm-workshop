'use client'

import { DownloadCloud, RefreshCw, X } from 'lucide-react'

interface Props {
  name: string
  typeCount: number
  stickyCount: number
  /** Set when a project with this share's name already exists, so overwriting it is offered. */
  existingProjectName?: string
  onOpenAsNew: () => void
  /** Present only when there's something to overwrite. */
  onOverwrite?: () => void
  onDismiss: () => void
}

/**
 * Shown when the URL carries a shared board. Deliberately a prompt rather than
 * an automatic import: a link should never silently add or replace projects on
 * someone's board list, and the recipient should see what they are about to
 * get and choose.
 */
export default function ShareOpenPrompt({
  name,
  typeCount,
  stickyCount,
  existingProjectName,
  onOpenAsNew,
  onOverwrite,
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

        <div className="border border-gray-200 rounded-lg px-3 py-2.5 mb-3">
          <p className="font-semibold text-sm text-gray-900 mb-0.5">{name}</p>
          <p className="text-xs text-gray-500">
            {typeCount} content type{typeCount === 1 ? '' : 's'}
            {stickyCount > 0 && `, ${stickyCount} sticky note${stickyCount === 1 ? '' : 's'}`}
          </p>
        </div>

        <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4 leading-relaxed">
          This becomes your own copy to edit freely. Changes you make here don&rsquo;t reach whoever
          sent the link, anyone else who opened it, or the Contentful space it may have come from.
        </p>

        {existingProjectName && onOverwrite && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 leading-relaxed">
            You already have a project called <strong>{existingProjectName}</strong>, most likely
            from opening this same link before. Update it with the latest version, or add another
            copy alongside it.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            onClick={onDismiss}
          >
            Not now
          </button>
          {existingProjectName && onOverwrite && (
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={onOverwrite}
            >
              <RefreshCw size={14} /> Update &ldquo;{existingProjectName}&rdquo;
            </button>
          )}
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#1773eb' }}
            onClick={onOpenAsNew}
          >
            <DownloadCloud size={14} /> {existingProjectName ? 'Add as new' : 'Open as a new project'}
          </button>
        </div>
      </div>
    </div>
  )
}
