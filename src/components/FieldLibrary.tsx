'use client'

import { GripVertical } from 'lucide-react'
import { FIELD_LIBRARY, DRAG_TYPE, LibraryField } from '@/lib/field-library'
import { FIELD_TYPES, ICON_WEIGHT, ICON_SIZE } from '@/lib/field-types'

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

// Floats over the canvas's top-left corner (see WorkshopApp.tsx) rather than
// sitting in its own full-height column, so it reads as a panel on top of
// the board — same visual language as the Share/Arrange dropdowns and the
// trace/compare panels — and never claims layout space the canvas can't use.
//
// All 9 field types fit on screen with nothing hidden and nothing to filter,
// so there's no search box: it would be solving a problem this list doesn't
// have.
export default function FieldLibrary() {
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
      <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
        <p className="text-xs text-gray-400 leading-tight">Drag any field onto a content type card</p>
      </div>
    </div>
  )
}
