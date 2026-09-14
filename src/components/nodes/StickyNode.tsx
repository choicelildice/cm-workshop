'use client'

import { useEffect, useRef, useState } from 'react'
import { NodeProps } from '@xyflow/react'
import { Palette, Trash2 } from 'lucide-react'
import { StickyNodeData } from '@/lib/types'
import { STICKY_COLORS, DEFAULT_STICKY_COLOR } from '@/lib/sticky-colors'

export default function StickyNode({ id, data: rawData }: NodeProps) {
  const data = rawData as unknown as StickyNodeData
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.text)
  const [colorOpen, setColorOpen] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const swatch =
    STICKY_COLORS.find((c) => c.value === data.color) ??
    STICKY_COLORS.find((c) => c.value === DEFAULT_STICKY_COLOR)!

  useEffect(() => { setDraft(data.text) }, [data.text])

  useEffect(() => {
    if (editing) {
      const el = areaRef.current
      el?.focus()
      // Cursor to the end rather than selecting everything, so typing appends
      el?.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  function commit() {
    setEditing(false)
    if (draft !== data.text) data.onChangeText(id, draft)
  }

  return (
    <div
      className="relative shadow-md"
      style={{
        width: 200,
        minHeight: 200,
        backgroundColor: swatch.value,
        // Sticky notes read as paper: square corners, no border
        borderRadius: 2,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setColorOpen(false) }}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <textarea
          ref={areaRef}
          className="nodrag nowheel w-full h-full bg-transparent outline-none resize-none p-3 text-sm leading-snug"
          style={{ color: swatch.text, minHeight: 200 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Enter commits; Shift+Enter makes a new line
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') { setDraft(data.text); setEditing(false) }
          }}
        />
      ) : (
        <div
          className="p-3 text-sm leading-snug whitespace-pre-wrap break-words"
          style={{ color: swatch.text, minHeight: 200 }}
        >
          {data.text || (
            <span className="opacity-40 italic">Double-click to edit</span>
          )}
        </div>
      )}

      {hovered && !editing && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
          <button
            className="nodrag rounded p-1 transition-colors hover:bg-black/10"
            style={{ color: swatch.text, opacity: 0.55 }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setColorOpen((v) => !v) }}
            title="Change colour"
          >
            <Palette size={12} />
          </button>
          <button
            className="nodrag rounded p-1 transition-colors hover:bg-black/10"
            style={{ color: swatch.text, opacity: 0.55 }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); data.onDelete(id) }}
            title="Remove note"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

      {colorOpen && (
        <div
          className="nodrag absolute top-8 right-1.5 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-1.5"
          style={{ width: 112 }}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-4 gap-1">
            {STICKY_COLORS.map((c) => (
              <button
                key={c.value}
                className="rounded transition-transform hover:scale-110"
                style={{
                  backgroundColor: c.value,
                  width: 22,
                  height: 22,
                  outline: c.value === swatch.value ? '2px solid #1773eb' : '1px solid #e5e7eb',
                  outlineOffset: 1,
                }}
                title={c.name}
                onClick={() => { data.onChangeColor(id, c.value); setColorOpen(false) }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
