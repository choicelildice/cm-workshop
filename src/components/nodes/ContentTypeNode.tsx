'use client'

import { useState, useRef, useEffect } from 'react'
import { NodeProps, Handle, Position } from '@xyflow/react'
import { Trash2, X, Copy, Clipboard, ArrowRight, Check, Palette, Pencil, Smile } from 'lucide-react'
import { ContentTypeNodeData, ContentField, FieldType } from '@/lib/types'
import {
  FIELD_TYPES,
  COMMON_EMOJI,
  resolveTypeColors,
  resolveKindLabel,
  ICON_WEIGHT,
  ICON_SIZE,
} from '@/lib/field-types'
import { DRAG_TYPE, REORDER_TYPE, LibraryField } from '@/lib/field-library'

interface PendingField { type: FieldType; isArray: boolean; name: string; required: boolean }

function FieldRow({
  field,
  nodeId,
  index,
  onDelete,
  onCopy,
  onReorder,
}: {
  field: ContentField
  nodeId: string
  index: number
  onDelete: (nodeId: string, fieldId: string) => void
  onCopy: (field: ContentField) => void
  onReorder: (nodeId: string, fieldId: string, toIndex: number) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [insertAt, setInsertAt] = useState<'above' | 'below' | null>(null)
  // On dragstart, e.target is the draggable row itself rather than the element
  // actually under the pointer, so whether the gesture began on the connection
  // handle has to be recorded at mousedown time.
  const startedOnConnectRef = useRef(false)
  const meta = FIELD_TYPES[field.type]
  const isLinkable = field.type === 'reference'

  function handleMouseDown(e: React.MouseEvent) {
    startedOnConnectRef.current = !!(e.target as HTMLElement).closest(
      '[data-connect-zone], .react-flow__handle'
    )
  }

  function handleDragStart(e: React.DragEvent) {
    // A drag off the connection handle must stay a React Flow connect
    // gesture, not become an HTML5 reorder drag of the row it sits in.
    if (startedOnConnectRef.current) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData(REORDER_TYPE, JSON.stringify({ nodeId, fieldId: field.id }))
    e.dataTransfer.effectAllowed = 'move'
    setDragging(true)
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(REORDER_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    // Insert above or below depending on which half of the row we're over
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setInsertAt(e.clientY < rect.top + rect.height / 2 ? 'above' : 'below')
  }

  function handleDrop(e: React.DragEvent) {
    const raw = e.dataTransfer.getData(REORDER_TYPE)
    setInsertAt(null)
    if (!raw) return
    e.preventDefault()
    e.stopPropagation()
    const src = JSON.parse(raw) as { nodeId: string; fieldId: string }
    // Reordering only makes sense within the same content type
    if (src.nodeId !== nodeId || src.fieldId === field.id) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const below = e.clientY >= rect.top + rect.height / 2
    onReorder(nodeId, src.fieldId, below ? index + 1 : index)
  }

  return (
    <div
      className="nodrag relative flex items-center gap-2 px-2 py-1 group"
      draggable
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onDragEnd={() => { setDragging(false); setInsertAt(null) }}
      onDragOver={handleDragOver}
      onDragLeave={() => setInsertAt(null)}
      onDrop={handleDrop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ opacity: dragging ? 0.4 : 1, cursor: 'grab' }}
    >
      {insertAt && (
        <span
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            [insertAt === 'above' ? 'top' : 'bottom']: -1,
            height: 2,
            backgroundColor: '#1773eb',
          }}
        />
      )}
      <span
        className="flex-shrink-0 inline-flex items-center justify-center rounded text-white"
        style={{ backgroundColor: meta.color, width: 22, height: 20 }}
        title={meta.label}
      >
        <meta.Icon size={ICON_SIZE.tiny} weight={ICON_WEIGHT} />
      </span>
      <span className="text-xs text-gray-700 flex-1 truncate">{field.name}</span>
      {field.required && <span className="text-[10px] text-red-400 flex-shrink-0">*</span>}

      {hovered && (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          <button
            className="nodrag text-gray-400 hover:text-blue-500 transition-colors p-0.5"
            onClick={() => onCopy(field)}
            title="Copy field"
          >
            <Copy size={10} />
          </button>
          <button
            className="nodrag text-gray-400 hover:text-red-500 transition-colors p-0.5"
            onClick={() => onDelete(nodeId, field.id)}
            title="Remove field"
          >
            <X size={10} />
          </button>
        </span>
      )}

      {isLinkable && (
        <span
          data-connect-zone
          draggable={false}
          className="flex-shrink-0 flex items-center gap-0.5"
          title="Drag to connect to another content type"
          style={{ cursor: 'crosshair' }}
        >
          <ArrowRight size={10} className="text-teal-500 opacity-60 group-hover:opacity-100" />
          <Handle
            type="source"
            position={Position.Right}
            id={`field-${field.id}`}
            style={{
              width: 10,
              height: 10,
              background: '#2eb67d',
              border: '2px solid white',
              right: -14,
              cursor: 'crosshair',
            }}
          />
        </span>
      )}
    </div>
  )
}

export default function ContentTypeNode({ id, data: rawData }: NodeProps) {
  const data = rawData as unknown as ContentTypeNodeData

  const [headerHovered, setHeaderHovered] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameValue, setNameValue] = useState(data.label)
  const [dropTarget, setDropTarget] = useState(false)
  const [pending, setPending] = useState<PendingField | null>(null)
  const [colorOpen, setColorOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiDraft, setEmojiDraft] = useState('')
  const kinds = data.kinds ?? []
  const { color: headerColor, text: headerText } = resolveTypeColors(data.kind, kinds)
  const kindLabel = resolveKindLabel(data.kind, kinds)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setNameValue(data.label) }, [data.label])
  useEffect(() => { if (renaming) inputRef.current?.focus() }, [renaming])
  useEffect(() => { if (pending) pendingInputRef.current?.focus() }, [pending])

  function commitRename() {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== data.label) data.onRenameType(id, trimmed)
    else setNameValue(data.label)
    setRenaming(false)
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDropTarget(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as HTMLElement)) {
      setDropTarget(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(false)
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    const field = JSON.parse(raw) as LibraryField
    setPending({ type: field.type, isArray: field.isArray ?? false, name: '', required: false })
  }

  function commitPending() {
    if (!pending) return
    const name = pending.name.trim()
    if (name) data.onDropField(id, { name, type: pending.type, required: pending.required, isArray: pending.isArray })
    setPending(null)
  }

  return (
    <div
      className="rounded-lg overflow-visible shadow-md border bg-white transition-colors"
      style={{
        width: 200,
        borderColor: dropTarget ? '#1773eb' : '#e5e7eb',
        boxShadow: dropTarget ? '0 0 0 2px #1773eb55' : undefined,
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 10, height: 10, background: '#1773eb', border: '2px solid white' }}
      />

      <div
        className="relative flex items-center px-2.5 py-1 cursor-pointer select-none rounded-t-lg"
        style={{ backgroundColor: headerColor, minHeight: 26 }}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        onDoubleClick={() => setRenaming(true)}
      >
        {data.emoji && (
          <button
            className="nodrag flex-shrink-0 mr-1 leading-none"
            style={{ fontSize: 13 }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setEmojiOpen((v) => !v) }}
            title="Change emoji"
          >
            {data.emoji}
          </button>
        )}

        {renaming ? (
          <input
            ref={inputRef}
            className="nodrag flex-1 font-bold bg-transparent border-b outline-none text-xs"
            style={{ color: headerText, borderColor: `${headerText}80` }}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setNameValue(data.label); setRenaming(false) }
            }}
          />
        ) : (
          <span className="flex-1 font-bold truncate text-xs" style={{ color: headerText }}>
            {data.label}
          </span>
        )}

        {/* Kind label — colour alone shouldn't be the only signal */}
        {kindLabel && !renaming && !headerHovered && !colorOpen && (
          <span
            className="flex-shrink-0 text-[8px] font-bold uppercase tracking-wider opacity-70"
            style={{ color: headerText }}
          >
            {kindLabel}
          </span>
        )}

        {(headerHovered || colorOpen || emojiOpen) && !renaming && (
          <>
            {!data.emoji && (
              <button
                className="nodrag ml-1 transition-opacity opacity-60 hover:opacity-100"
                style={{ color: headerText }}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setEmojiOpen((v) => !v) }}
                title="Add emoji"
              >
                <Smile size={12} />
              </button>
            )}
            <button
              className="nodrag ml-1 transition-opacity opacity-60 hover:opacity-100"
              style={{ color: headerText }}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setRenaming(true) }}
              title="Rename content type"
            >
              <Pencil size={12} />
            </button>
            <button
              className="nodrag ml-1 transition-opacity opacity-60 hover:opacity-100"
              style={{ color: headerText }}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setColorOpen((v) => !v) }}
              title="Set type kind"
            >
              <Palette size={12} />
            </button>
            <button
              className="nodrag ml-1 transition-opacity opacity-60 hover:opacity-100"
              style={{ color: headerText }}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); data.onDeleteType(id) }}
              title="Delete content type"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}

        {colorOpen && (
          <div
            className="nodrag absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1"
            style={{ width: 132 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {kinds.map((k) => (
              <button
                key={k.id}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-gray-50 transition-colors"
                onClick={() => { data.onSetTypeKind(id, k.id); setColorOpen(false) }}
              >
                <span
                  className="flex-shrink-0 rounded"
                  style={{ backgroundColor: k.color, width: 14, height: 14 }}
                />
                <span className="flex-1 text-gray-800">{k.label}</span>
                {data.kind === k.id && <Check size={11} className="text-blue-600 flex-shrink-0" />}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-gray-50 transition-colors"
                onClick={() => { data.onSetTypeKind(id, undefined); setColorOpen(false) }}
              >
                <span
                  className="flex-shrink-0 rounded border border-gray-200"
                  style={{ backgroundColor: '#0f1042', width: 14, height: 14 }}
                />
                <span className="flex-1 text-gray-500">None</span>
                {!data.kind && <Check size={11} className="text-blue-600 flex-shrink-0" />}
              </button>
            </div>
          </div>
        )}

        {emojiOpen && (
          <div
            className="nodrag absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-1.5"
            style={{ width: 196 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-8 gap-0.5">
              {COMMON_EMOJI.map((em) => (
                <button
                  key={em}
                  className="rounded hover:bg-gray-100 transition-colors leading-none"
                  style={{
                    fontSize: 14,
                    height: 22,
                    outline: em === data.emoji ? '2px solid #1773eb' : 'none',
                  }}
                  onClick={() => { data.onSetTypeEmoji(id, em); setEmojiOpen(false) }}
                >
                  {em}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-100">
              <input
                className="nodrag flex-1 min-w-0 border border-gray-200 rounded px-1.5 py-0.5 text-xs outline-none focus:border-blue-400"
                placeholder="Paste any emoji"
                value={emojiDraft}
                onChange={(e) => setEmojiDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = [...emojiDraft.trim()][0]
                    if (v) data.onSetTypeEmoji(id, v)
                    setEmojiDraft('')
                    setEmojiOpen(false)
                  }
                  if (e.key === 'Escape') { setEmojiDraft(''); setEmojiOpen(false) }
                }}
              />
              {data.emoji && (
                <button
                  className="flex-shrink-0 text-[11px] text-gray-400 hover:text-red-500 transition-colors px-1"
                  onClick={() => { data.onSetTypeEmoji(id, undefined); setEmojiOpen(false) }}
                  title="Remove emoji"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="divide-y divide-gray-50">
        {data.fields.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-gray-400 italic">
            {dropTarget ? 'Drop to add field' : 'No fields yet'}
          </p>
        )}
        {data.fields.map((field: ContentField, i: number) => (
          <FieldRow
            key={field.id}
            field={field}
            nodeId={id}
            index={i}
            onDelete={data.onDeleteField}
            onCopy={data.onCopyField}
            onReorder={data.onReorderField}
          />
        ))}
        {pending && (
          <div className="px-2 py-1.5 bg-blue-50 border-t border-blue-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              {(() => {
                const PendingIcon = FIELD_TYPES[pending.type].Icon
                return (
                  <span
                    className="flex-shrink-0 inline-flex items-center justify-center rounded text-white"
                    style={{ backgroundColor: FIELD_TYPES[pending.type].color, width: 24, height: 22 }}
                    title={FIELD_TYPES[pending.type].label}
                  >
                    <PendingIcon size={ICON_SIZE.small} weight={ICON_WEIGHT} />
                  </span>
                )
              })()}
              <input
                ref={pendingInputRef}
                type="text"
                placeholder="Field name"
                value={pending.name}
                onChange={(e) => setPending((p) => p ? { ...p, name: e.target.value } : null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitPending()
                  if (e.key === 'Escape') setPending(null)
                }}
                className="nodrag flex-1 text-xs border border-blue-300 rounded px-1.5 py-0.5 outline-none focus:border-blue-500 bg-white min-w-0"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="nodrag flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pending.required}
                  onChange={(e) => setPending((p) => p ? { ...p, required: e.target.checked } : null)}
                  className="nodrag w-3 h-3 accent-blue-600"
                />
                Required
              </label>
              <div className="flex items-center gap-1">
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); commitPending() }}
                  className="nodrag text-[11px] px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-0.5"
                >
                  <Check size={9} /> Add
                </button>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setPending(null) }}
                  className="nodrag text-[11px] text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          </div>
        )}
        {dropTarget && data.fields.length > 0 && !pending && (
          <div className="px-3 py-1.5 text-[11px] text-blue-500 italic bg-blue-50">Drop to add field</div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 flex">
        <button
          className="nodrag flex-1 text-left px-2.5 py-1 text-[11px] text-blue-600 hover:bg-blue-50 transition-colors font-medium"
          onClick={() => data.onAddField(id)}
        >
          + Add Field
        </button>
        {data.hasClipboard && (
          <button
            className="nodrag px-2 py-1 text-[11px] text-teal-600 hover:bg-teal-50 transition-colors border-l border-gray-100 flex items-center gap-1"
            onClick={() => data.onPasteField(id)}
            title="Paste copied field"
          >
            <Clipboard size={11} />
            Paste
          </button>
        )}
      </div>
    </div>
  )
}
