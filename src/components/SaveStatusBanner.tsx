'use client'

import { AlertTriangle, DownloadCloud, RotateCcw } from 'lucide-react'
import { downloadAllBoards } from '@/lib/download-boards'

/**
 * Shown over the canvas when the stored copy of a board and the one on
 * screen have come apart (see Canvas's onSaveStatus):
 *
 * - load-mismatch: the board did not load intact, so Canvas paused saving.
 *   The stored copy is untouched; the user should reload.
 * - write-failed: storage refused a save (quota full or unavailable), so the
 *   board on screen is newer than the stored copy and would be lost on
 *   reload. The user should download now, then free space.
 *
 * Both offer Download all boards, the only way to get work off the machine.
 */
const BUTTON = 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors'
const PRIMARY = `${BUTTON} bg-amber-600 text-white hover:bg-amber-700`
const SECONDARY = `${BUTTON} border border-amber-300 text-amber-900 hover:bg-amber-100`

export default function SaveStatusBanner({
  status,
  detail,
}: {
  status: 'load-mismatch' | 'write-failed'
  detail?: string
}) {
  const mismatch = status === 'load-mismatch'
  return (
    <div
      role="alert"
      data-testid={mismatch ? 'save-paused' : 'save-failed'}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[calc(100%-2rem)] bg-amber-50 border border-amber-300 text-amber-900 rounded-xl shadow-lg px-4 py-3 text-sm"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
        <div className="flex-1 min-w-0">
          {mismatch ? (
            <>
              <p className="font-semibold">Saving is paused for this board.</p>
              <p className="mt-0.5 text-amber-800">
                It did not load exactly as it was stored, so nothing you do here will be written
                over your saved copy. Reload to try again. A backup of every board was taken before
                this version first ran.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Your latest change could not be saved.</p>
              <p className="mt-0.5 text-amber-800">
                This browser&rsquo;s storage for the site is full or unavailable, so the board on
                screen is newer than the stored copy and would be lost on reload. Download all boards
                now to keep your work, then free space (delete a project you no longer need) and
                try again.
              </p>
            </>
          )}
          {detail && <p className="mt-1 text-[11px] text-amber-700 font-mono break-words">{detail}</p>}
          <div className="mt-2 flex items-center gap-2">
            {mismatch && (
              <button className={PRIMARY} onClick={() => window.location.reload()}>
                <RotateCcw size={12} /> Reload
              </button>
            )}
            {/* Primary when it is the only action (write failed), secondary beside Reload */}
            <button className={mismatch ? SECONDARY : PRIMARY} onClick={downloadAllBoards}>
              <DownloadCloud size={12} /> Download all boards
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
