'use client'

import { AlertTriangle, X } from 'lucide-react'

export interface PendingDelete {
  /** Content types about to be removed, for naming what's at stake. */
  types: { label: string; fieldCount: number }[]
  /** Connections (either direction) touching any type in the batch. */
  edgeCount: number
  /** Non-content-type nodes riding along in the same delete (stickies, images). */
  otherCount: number
}

interface Props {
  pending: PendingDelete
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirms before a content type with real work in it — fields, or a
 * connection to another type — is deleted. Both the header trash button and
 * the Backspace/Delete keyboard shortcut route through this, so there is one
 * place that decides what counts as "worth confirming" rather than two
 * checks that could drift apart.
 *
 * An empty, unconnected content type skips this entirely: there is nothing to
 * lose, and a confirmation on every delete would just train people to click
 * through it without reading.
 */
export default function DeleteTypeConfirm({ pending, onConfirm, onCancel }: Props) {
  const { types, edgeCount, otherCount } = pending
  const totalFields = types.reduce((n, t) => n + t.fieldCount, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
          onClick={onCancel}
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-2 mb-1 text-red-600">
          <AlertTriangle size={16} />
          <h2 className="text-lg font-bold text-gray-900">
            Delete {types.length === 1 ? 'this content type' : `${types.length} content types`}?
          </h2>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {types.length === 1 ? (
            <>
              <strong className="text-gray-700">{types[0].label}</strong> has {totalFields} field
              {totalFields === 1 ? '' : 's'}
              {edgeCount > 0 && (
                <> and {edgeCount} connection{edgeCount === 1 ? '' : 's'} to other content types</>
              )}
              . This can be undone with Cmd+Z right after, but won&rsquo;t survive a reload.
            </>
          ) : (
            <>
              Together they carry {totalFields} field{totalFields === 1 ? '' : 's'}
              {edgeCount > 0 && (
                <> and {edgeCount} connection{edgeCount === 1 ? '' : 's'}</>
              )}
              {otherCount > 0 && (
                <>, plus {otherCount} other item{otherCount === 1 ? '' : 's'} in the selection</>
              )}
              . This can be undone with Cmd+Z right after, but won&rsquo;t survive a reload.
            </>
          )}
        </p>

        {types.length > 1 && (
          <div className="border border-gray-200 rounded-lg px-3 py-2 mb-4 max-h-32 overflow-y-auto">
            {types.map((t, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-0.5">
                <span className="text-gray-700 truncate">{t.label}</span>
                <span className="text-gray-400 flex-shrink-0 ml-2">
                  {t.fieldCount} field{t.fieldCount === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
