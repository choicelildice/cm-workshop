'use client'

import { useEffect, useRef, useState } from 'react'
import { GripVertical, ImageIcon } from 'lucide-react'
import { DRAG_TYPE, FIELD_LIBRARY, LibraryField, type ToolDragKind } from '@/lib/field-library'
import { FIELD_TYPES, ICON_WEIGHT, ICON_SIZE } from '@/lib/field-types'
import { STICKY_COLORS, DEFAULT_STICKY_COLOR } from '@/lib/sticky-colors'

function FieldItem({ field }: { field: LibraryField }) {
  const meta = FIELD_TYPES[field.type]

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(field))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 px-2 py-2.5 rounded cursor-grab active:cursor-grabbing hover:bg-gray-100 transition-colors group select-none"
      title={`${meta.label}${field.required ? ' · Required' : ''}${field.isArray ? ' · Array' : ''}`}
    >
      <GripVertical size={11} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
      <span
        className="flex-shrink-0 inline-flex items-center justify-center rounded text-white"
        style={{ backgroundColor: meta.color, width: 24, height: 22 }}
      >
        <meta.Icon size={ICON_SIZE.small} weight={ICON_WEIGHT} />
      </span>
      <span className="text-[15px] text-gray-700 truncate flex-1">{field.name}</span>
      {field.isArray && <span className="text-[10px] text-gray-400 flex-shrink-0">[ ]</span>}
      {field.required && <span className="text-[10px] text-red-400 flex-shrink-0">*</span>}
    </div>
  )
}

/** Same footprint as a field-type chip, so the row heights line up. */
const GLYPH_W = 26
const GLYPH_H = 24

/**
 * A short stack of notes, Miro-style. The two behind peek out in other
 * colours as a hint that stickies come in more than yellow. While a note is
 * being pulled off (`lifted`), the front one slides up and fades, so the
 * stack visibly gives one up and takes it back if the pull is cancelled.
 */
function StickyStackGlyph({ lifted }: { lifted: boolean }) {
  const back = STICKY_COLORS.find((c) => c.name === 'Blue')?.value ?? DEFAULT_STICKY_COLOR
  const mid = STICKY_COLORS.find((c) => c.name === 'Pink')?.value ?? DEFAULT_STICKY_COLOR
  const note = (bg: string, extra: React.CSSProperties) => ({
    position: 'absolute' as const,
    width: 16,
    height: 16,
    background: bg,
    border: '1px solid rgba(17,27,43,0.18)',
    borderRadius: 1.5,
    boxShadow: '0 1px 1.5px rgba(0,0,0,0.12)',
    ...extra,
  })
  return (
    <span className="relative flex-shrink-0 block" style={{ width: GLYPH_W, height: GLYPH_H }} aria-hidden>
      <span style={note(back, { left: 3, top: 2, transform: 'rotate(-9deg)' })} />
      <span style={note(mid, { left: 6, top: 4, transform: 'rotate(5deg)' })} />
      <span
        style={note(DEFAULT_STICKY_COLOR, {
          left: 5,
          top: 6,
          transition: 'transform 140ms ease, opacity 140ms ease',
          transform: lifted ? 'translate(2px, -9px) rotate(-4deg)' : 'none',
          opacity: lifted ? 0 : 1,
        })}
      />
    </span>
  )
}

/** A small photo frame, lifting the same way the sticky does. */
function ImageFrameGlyph({ lifted }: { lifted: boolean }) {
  return (
    <span className="relative flex-shrink-0 block" style={{ width: GLYPH_W, height: GLYPH_H }} aria-hidden>
      <span
        className="absolute inline-flex items-center justify-center bg-white text-gray-500"
        style={{
          left: 3,
          top: 3,
          width: 20,
          height: 17,
          border: '1px solid #9ca3af',
          borderRadius: 2,
          boxShadow: '0 1px 1.5px rgba(0,0,0,0.12)',
          transition: 'transform 140ms ease, opacity 140ms ease',
          transform: lifted ? 'translate(2px, -9px) rotate(-4deg)' : 'none',
          opacity: lifted ? 0 : 1,
        }}
      >
        <ImageIcon size={11} />
      </span>
    </span>
  )
}

/** Pointer travel before a press on a tool item becomes a pull rather than a click. */
const PULL_THRESHOLD_PX = 5

/**
 * Sticky and Upload Image: unlike a field (which only ever drops onto a
 * card), these land on the open canvas. Press and drag pulls one off the
 * stack — Canvas.pullTool takes over the moment the pointer has travelled
 * far enough, draws the note at board scale under the cursor, and places it
 * on release (see the placement effect in Canvas.tsx). A plain click still
 * arms click-to-place, the flow the old toolbar buttons used, for anyone
 * who'd rather click than drag.
 *
 * Pointer events rather than HTML5 drag-and-drop on purpose: a native drag
 * ghost is a fixed bitmap that can't follow the canvas zoom or show the Esc
 * hint, and the placement mode already does both.
 */
function ToolItem({
  kind,
  label,
  onClick,
  onPull,
  dataTour,
}: {
  kind: ToolDragKind
  label: string
  onClick: () => void
  onPull: (kind: ToolDragKind) => void
  dataTour?: string
}) {
  const [lifted, setLifted] = useState(false)
  // Where the press started, while the button is held and no pull has begun
  const pressRef = useRef<{ x: number; y: number } | null>(null)
  // Set once a pull starts, so the click that the browser fires on release
  // over this same row doesn't ALSO arm click-to-place
  const pulledRef = useRef(false)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const start = pressRef.current
      if (!start) return
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < PULL_THRESHOLD_PX) return
      pressRef.current = null
      pulledRef.current = true
      setLifted(true)
      onPull(kind)
    }
    function onUp() {
      pressRef.current = null
      // Canvas has already placed or cancelled by now (its own mouseup
      // listener); either way the stack is whole again
      setLifted(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [kind, onPull])

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    pulledRef.current = false
    pressRef.current = { x: e.clientX, y: e.clientY }
  }

  function handleClick() {
    if (pulledRef.current) {
      pulledRef.current = false
      return
    }
    onClick()
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={handleClick}
      data-tour={dataTour}
      className="flex items-center gap-2 px-2 py-2.5 rounded cursor-grab active:cursor-grabbing hover:bg-gray-100 transition-colors group select-none"
      style={{ touchAction: 'none' }}
      title={`Drag onto the board, or click to place ${label.toLowerCase()}`}
    >
      <GripVertical size={11} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
      {kind === 'sticky' ? <StickyStackGlyph lifted={lifted} /> : <ImageFrameGlyph lifted={lifted} />}
      <span className="text-[15px] text-gray-700 truncate flex-1">{label}</span>
    </div>
  )
}

function Group({ label, fields }: { label: string; fields: LibraryField[] }) {
  return (
    <div>
      {FIELD_LIBRARY.length > 1 && (
        <p className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      )}
      <div className="px-1">
        {fields.map((f) => (
          <FieldItem key={f.name} field={f} />
        ))}
      </div>
    </div>
  )
}

interface Props {
  onAddSticky: () => void
  onUploadImage: () => void
  /** Pointer has been dragged off a board item; Canvas takes over placement. */
  onPullTool: (kind: ToolDragKind) => void
}

// Floats over the canvas's top-left corner (see WorkshopApp.tsx) rather than
// sitting in its own full-height column, so it reads as a panel on top of
// the board — same visual language as the Share/Arrange dropdowns and the
// trace/compare panels — and never claims layout space the canvas can't use.
//
// All 9 field types fit on screen with nothing hidden and nothing to filter,
// so there's no search box: it would be solving a problem this list doesn't
// have.
export default function FieldLibrary({ onAddSticky, onUploadImage, onPullTool }: Props) {
  return (
    <div className="w-48 m-3 bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Field Library</p>
      </div>
      <div className="py-1">
        {FIELD_LIBRARY.map((group) => (
          <Group key={group.label} label={group.label} fields={group.fields} />
        ))}
      </div>
      <div className="py-1 border-t border-gray-100">
        <p className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Board items</p>
        <div className="px-1">
          <ToolItem kind="sticky" label="Sticky" onClick={onAddSticky} onPull={onPullTool} dataTour="sticky" />
          <ToolItem kind="image" label="Upload Image" onClick={onUploadImage} onPull={onPullTool} />
        </div>
      </div>
      <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
        <p className="text-xs text-gray-400 leading-tight">Drag items onto the board</p>
      </div>
    </div>
  )
}
