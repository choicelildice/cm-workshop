'use client'

import { useState } from 'react'
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'

/**
 * Without this, a render error unmounts the whole tree and leaves a blank page.
 * That mattered because the crashing board is already saved as the current
 * project, so every reload crashed again with no way out but devtools.
 *
 * The recovery button deletes only the *current* project pointer, never the
 * saved boards, so a bad board can be escaped without losing anyone's work.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const [cleared, setCleared] = useState(false)

  function openADifferentBoard() {
    try {
      // Clearing the pointer makes the app pick another project on next load.
      // Board data itself is left untouched.
      localStorage.removeItem('cm-workshop-current')
      setCleared(true)
    } catch {
      // storage unavailable; the reload below is still worth trying
    }
    window.location.href = window.location.pathname
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-3 text-amber-600">
          <AlertTriangle size={16} />
          <h1 className="text-sm font-bold text-gray-900">Something went wrong</h1>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-5">
          The board couldn&rsquo;t be drawn. Trying again is usually enough. If it keeps happening,
          the board itself may be damaged &mdash; opening a different one will get you back in, and
          your other boards are left alone.
        </p>

        <div className="flex flex-col gap-2">
          <button
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#1773eb' }}
            onClick={reset}
          >
            <RotateCcw size={13} /> Try again
          </button>
          <button
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
            onClick={openADifferentBoard}
            disabled={cleared}
          >
            <Trash2 size={13} /> Open a different board
          </button>
        </div>
      </div>
    </div>
  )
}
