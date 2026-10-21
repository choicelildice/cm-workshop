'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react'
import {
  deleteSpaceConnection,
  listSpaceConnections,
  saveSpaceConnection,
  type SpaceConnection,
} from '@/lib/space-connections'
import { setProjectSpaceConnection } from '@/lib/projects'

interface Props {
  projectId: string | null
  spaceId: string
  environmentId: string
  token: string
  onSelect: (connection: SpaceConnection) => void
}

/**
 * Shared by ContentfulImportModal and ContentfulExportModal: a dropdown of
 * saved space connections, plus a way to save the fields currently typed
 * in as a new one. Picking a connection fills the three fields in the
 * parent modal (still freely editable afterward — this never locks them);
 * saving one persists the pick onto the current project, so reopening it
 * re-selects the right space instead of starting blank.
 *
 * Purely additive on top of the pre-existing single-credential storage
 * (cf-space-id etc.): a user who never opens this dropdown or clicks Save
 * sees no behavior change at all.
 */
export default function SpaceConnectionPicker({
  projectId,
  spaceId,
  environmentId,
  token,
  onSelect,
}: Props) {
  const [connections, setConnections] = useState<SpaceConnection[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setConnections(listSpaceConnections())
  }, [])

  // This picker lives inside a plain fixed-overlay modal, not the React
  // Flow canvas, so the ordinary bubble-phase listener (unlike the
  // capture-phase one Canvas.tsx needs to beat d3-zoom) is enough here.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  function select(c: SpaceConnection) {
    onSelect(c)
    setOpen(false)
    if (projectId) setProjectSpaceConnection(projectId, c.id)
  }

  function startSaving() {
    setLabelDraft(spaceId)
    setSaving(true)
    setOpen(false)
  }

  function commitSave() {
    const c = saveSpaceConnection(labelDraft, spaceId, environmentId, token)
    setConnections(listSpaceConnections())
    setSaving(false)
    if (projectId) setProjectSpaceConnection(projectId, c.id)
  }

  function remove(id: string) {
    deleteSpaceConnection(id)
    setConnections(listSpaceConnections())
  }

  const canSave = spaceId.trim() && token.trim()

  if (connections.length === 0 && !saving) {
    // Nothing saved yet: offer just the entry point, not an empty dropdown
    return (
      <button
        type="button"
        className="text-xs text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
        onClick={startSaving}
        disabled={!canSave}
        title={canSave ? 'Save these credentials for next time' : 'Fill in space id and token first'}
      >
        + Save this space for next time
      </button>
    )
  }

  if (saving) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          className="flex-1 border border-blue-400 rounded-lg px-2 py-1 text-xs outline-none text-gray-900"
          placeholder="Label, e.g. Helly Hansen — EU"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitSave()
            if (e.key === 'Escape') setSaving(false)
          }}
        />
        <button
          type="button"
          className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          onClick={commitSave}
        >
          Save
        </button>
        <button
          type="button"
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          onClick={() => setSaving(false)}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:border-blue-300 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">
          {connections.find((c) => c.spaceId === spaceId && c.environmentId === environmentId)?.label ??
            'Choose a saved space…'}
        </span>
        <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5 max-h-56 overflow-y-auto">
          {connections.map((c) => (
            <div
              key={c.id}
              className="group flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
            >
              <button
                type="button"
                className="flex-1 flex items-center gap-2 text-left truncate"
                onClick={() => select(c)}
              >
                {c.spaceId === spaceId && c.environmentId === environmentId ? (
                  <Check size={13} className="text-blue-600 flex-shrink-0" />
                ) : (
                  <span className="w-[13px] flex-shrink-0" />
                )}
                <span className="truncate text-gray-800">{c.label}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{c.environmentId}</span>
              </button>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                onClick={() => remove(c.id)}
                title="Remove this saved space"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:text-gray-300 disabled:cursor-not-allowed"
              onClick={startSaving}
              disabled={!canSave}
            >
              <Plus size={13} className="text-gray-400" /> Save current fields as new
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
