'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ContentField, FieldType } from '@/lib/types'
import { FIELD_TYPE_OPTIONS, FIELD_TYPES, ICON_WEIGHT, ICON_SIZE } from '@/lib/field-types'

interface Props {
  nodeId: string
  onAdd: (nodeId: string, field: Omit<ContentField, 'id'>) => void
  onClose: () => void
}

export default function AddFieldModal({ nodeId, onAdd, onClose }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const [required, setRequired] = useState(false)
  const [isArray, setIsArray] = useState(false)

  const [typeQuery, setTypeQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const nameRef = useRef<HTMLInputElement>(null)
  const typeInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filtered = FIELD_TYPE_OPTIONS.filter((opt) =>
    opt.label.toLowerCase().includes(typeQuery.toLowerCase())
  )

  const selectedMeta = FIELD_TYPES[type]

  useEffect(() => { nameRef.current?.focus() }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (dropdownOpen) { setDropdownOpen(false); e.stopPropagation() }
        else onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose, dropdownOpen])

  useEffect(() => { setHighlightedIndex(0) }, [typeQuery])

  const selectType = useCallback((value: FieldType) => {
    setType(value)
    setTypeQuery('')
    setDropdownOpen(false)
  }, [])

  function handleTypeKeyDown(e: React.KeyboardEvent) {
    if (!dropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setDropdownOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (filtered[highlightedIndex]) selectType(filtered[highlightedIndex].value)
    } else if (e.key === 'Escape') {
      setDropdownOpen(false)
      setTypeQuery('')
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!name.trim()) return
    onAdd(nodeId, { name: name.trim(), type, required, isArray })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-[380px] p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Add Field</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Field Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Field Name</label>
            <input
              ref={nameRef}
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': '#1773eb' } as React.CSSProperties}
              placeholder="e.g. Title, Body, Author"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); typeInputRef.current?.focus(); setDropdownOpen(true) }
              }}
            />
          </div>

          {/* Field Type autocomplete */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Field Type</label>
            <div className="relative">
              {/* Trigger input */}
              <div
                className="flex items-center gap-2 w-full border border-gray-200 rounded-lg px-3 py-2 cursor-text"
                style={{ borderColor: dropdownOpen ? '#1773eb' : undefined, boxShadow: dropdownOpen ? '0 0 0 2px #1773eb33' : undefined }}
                onClick={() => { typeInputRef.current?.focus(); setDropdownOpen(true) }}
              >
                <span
                  className="flex-shrink-0 inline-flex items-center justify-center rounded text-white"
                  style={{ backgroundColor: selectedMeta.color, width: 26, height: 22 }}
                >
                  <selectedMeta.Icon size={ICON_SIZE.small} weight={ICON_WEIGHT} />
                </span>
                <input
                  ref={typeInputRef}
                  type="text"
                  className="flex-1 text-sm outline-none bg-transparent min-w-0"
                  placeholder={selectedMeta.label}
                  value={typeQuery}
                  onChange={(e) => { setTypeQuery(e.target.value); setDropdownOpen(true) }}
                  onFocus={() => setDropdownOpen(true)}
                  onKeyDown={handleTypeKeyDown}
                />
                {!dropdownOpen && (
                  <span className="text-xs text-gray-400 flex-shrink-0">{selectedMeta.label}</span>
                )}
              </div>

              {/* Dropdown */}
              {dropdownOpen && filtered.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                >
                  {filtered.map((opt, i) => (
                    <button
                      key={opt.value}
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors"
                      style={{ backgroundColor: i === highlightedIndex ? '#f4f7ff' : undefined }}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      onMouseDown={(e) => { e.preventDefault(); selectType(opt.value) }}
                    >
                      <span
                        className="flex-shrink-0 inline-flex items-center justify-center rounded text-white"
                        style={{ backgroundColor: opt.color, width: 26, height: 22 }}
                      >
                        <opt.Icon size={ICON_SIZE.small} weight={ICON_WEIGHT} />
                      </span>
                      <span className="text-gray-700">{opt.label}</span>
                      {opt.value === type && (
                        <span className="ml-auto text-[10px] text-gray-400">current</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input type="checkbox" className="rounded" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Required
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input type="checkbox" className="rounded" checked={isArray} onChange={(e) => setIsArray(e.target.checked)} />
              Array (list of)
            </label>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-xs font-medium text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: '#1773eb' }}
            >
              Add Field
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
