'use client'

import { useState } from 'react'
import { Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { CONTENTFUL_PALETTE, DEFAULT_KINDS, type KindDef } from '@/lib/field-type-meta'
import { makeKindId, resetKinds, saveKinds } from '@/lib/kind-config'

interface Props {
  kinds: KindDef[]
  onChange: (kinds: KindDef[]) => void
  onClose: () => void
}

export default function KindSettingsModal({ kinds, onChange, onClose }: Props) {
  const [draft, setDraft] = useState<KindDef[]>(kinds)
  const [newLabel, setNewLabel] = useState('')

  function commit(next: KindDef[]) {
    setDraft(next)
    saveKinds(next)
    onChange(next)
  }

  function rename(id: string, label: string) {
    commit(draft.map((k) => (k.id === id ? { ...k, label } : k)))
  }

  function recolor(id: string, color: string, text: string) {
    commit(draft.map((k) => (k.id === id ? { ...k, color, text } : k)))
  }

  function remove(id: string) {
    commit(draft.filter((k) => k.id !== id))
  }

  function add() {
    const label = newLabel.trim()
    if (!label) return
    const palette = CONTENTFUL_PALETTE[draft.length % CONTENTFUL_PALETTE.length]
    commit([
      ...draft,
      { id: makeKindId(label, draft), label, color: palette.color, text: palette.text },
    ])
    setNewLabel('')
  }

  function restoreDefaults() {
    resetKinds()
    setDraft(DEFAULT_KINDS)
    onChange(DEFAULT_KINDS)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-1">Content Type Kinds</h2>
        <p className="text-sm text-gray-500 mb-5">
          Rename or recolour these to match your team&rsquo;s vocabulary. Existing cards keep their
          kind, so renaming is safe.
        </p>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {draft.map((k) => (
            <div key={k.id} className="flex items-center gap-2 border border-gray-200 rounded-lg p-2">
              <input
                className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-blue-400 text-gray-900"
                value={k.label}
                onChange={(e) => rename(k.id, e.target.value)}
                placeholder="Kind name"
              />

              <div className="flex items-center gap-1 flex-shrink-0">
                {CONTENTFUL_PALETTE.map((p) => (
                  <button
                    key={p.color}
                    className="rounded transition-transform hover:scale-110"
                    style={{
                      backgroundColor: p.color,
                      width: 18,
                      height: 18,
                      outline: p.color === k.color ? '2px solid #1773eb' : 'none',
                      outlineOffset: 1,
                    }}
                    title={p.name}
                    onClick={() => recolor(k.id, p.color, p.text)}
                  />
                ))}
              </div>

              <button
                className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors p-0.5"
                onClick={() => remove(k.id)}
                title="Remove kind"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {draft.length === 0 && (
            <p className="text-xs text-gray-400 italic py-2">
              No kinds defined. Cards will use the default navy header.
            </p>
          )}
        </div>

        {/* Add new */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 text-gray-900"
            placeholder="New kind (e.g. Content, Page, Layout)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#1773eb', color: 'white' }}
            onClick={add}
            disabled={!newLabel.trim()}
          >
            <Plus size={13} /> Add
          </button>
        </div>

        <div className="flex items-center justify-between mt-5">
          <button
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            onClick={restoreDefaults}
          >
            <RotateCcw size={12} /> Restore defaults
          </button>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#1773eb' }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
