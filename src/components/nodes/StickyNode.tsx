'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NodeProps, NodeResizer } from '@xyflow/react'
import { Palette, Trash2 } from 'lucide-react'
import { StickyNodeData } from '@/lib/types'
import { STICKY_COLORS, DEFAULT_STICKY_COLOR } from '@/lib/sticky-colors'

/** Default square, and the size the base font is calibrated against. */
const DEFAULT_SIZE = 200
/** Smaller than before, so a note can be a small marker on the board. */
const MIN_SIZE = 80
const BASE_FONT = 14
/**
 * Floor on the fitted size. Below about 8px text stops being readable, so a
 * note with more text than fits clips instead of shrinking indefinitely —
 * an unreadable note is worse than a truncated one, and zooming in still
 * reveals the rest.
 */
const MIN_FONT = 8

export default function StickyNode({ id, data: rawData, width, height, selected }: NodeProps) {
  const data = rawData as unknown as StickyNodeData
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.text)
  const [colorOpen, setColorOpen] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = useState(BASE_FONT)

  const boxW = width ?? DEFAULT_SIZE
  const boxH = height ?? DEFAULT_SIZE
  // Padding scales with the note; a fixed 12px would consume most of a 72px one
  const PAD = Math.max(4, Math.round(12 * (Math.min(boxW, boxH) / DEFAULT_SIZE)))

  /**
   * Font size that fills the note without overflowing, the way Miro behaves:
   * scale with the note, then shrink further if there is too much text to fit.
   *
   * Measured rather than calculated. Text wrapping depends on word lengths and
   * break opportunities, so no formula over character count predicts the
   * rendered height — a binary search on the real element does.
   */
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el || editing) return

    // Proportional ceiling, so a big note gets big text even with little in it
    const ceiling = Math.max(MIN_FONT, Math.round(BASE_FONT * (Math.min(boxW, boxH) / DEFAULT_SIZE)))

    if (!data.text) {
      setFontSize(ceiling)
      return
    }

    const fits = (px: number) => {
      el.style.fontSize = `${px}px`
      // +1 absorbs sub-pixel rounding, which would otherwise reject a size
      // that visually fits
      return el.scrollHeight <= el.clientHeight + 1
    }

    let lo = MIN_FONT
    let hi = ceiling
    let best = MIN_FONT
    // ~5 iterations over this range; terminates on the integer gap
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (fits(mid)) { best = mid; lo = mid + 1 } else { hi = mid - 1 }
    }

    el.style.fontSize = ''
    setFontSize(best)
  }, [data.text, boxW, boxH, editing])

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
      className="relative shadow-md flex"
      style={{
        // Falls back to the default square until a resize sets explicit
        // dimensions on the node.
        width: boxW,
        height: boxH,
        backgroundColor: swatch.value,
        // Sticky notes read as paper: square corners, no border
        borderRadius: 2,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setColorOpen(false) }}
      onDoubleClick={() => setEditing(true)}
    >
      <NodeResizer
        nodeId={id}
        isVisible={!!selected}
        // Stickies are square paper: dragging any handle scales both axes
        keepAspectRatio
        minWidth={MIN_SIZE}
        minHeight={MIN_SIZE}
        color="#1773eb"
        handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
      />

      {editing ? (
        <textarea
          ref={areaRef}
          className="nodrag nowheel flex-1 bg-transparent outline-none resize-none leading-snug"
          style={{ color: swatch.text, fontSize, padding: PAD }}
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
          ref={textRef}
          className="flex-1 leading-snug whitespace-pre-wrap break-words overflow-hidden"
          style={{ color: swatch.text, fontSize, padding: PAD }}
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
