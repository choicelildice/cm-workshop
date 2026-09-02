'use client'

import { useState } from 'react'
import { GripVertical, Search } from 'lucide-react'
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

function Group({ label, fields, query }: { label: string; fields: LibraryField[]; query: string }) {
  const visible = query
    ? fields.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : fields
  if (visible.length === 0) return null

  return (
    <div>
      {FIELD_LIBRARY.length > 1 && (
        <p className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      )}
      <div className="px-1">
        {visible.map((f) => (
          <FieldItem key={f.name} field={f} />
        ))}
      </div>
    </div>
  )
}

export default function FieldLibrary() {
  const [query, setQuery] = useState('')

  return (
    <div className="w-48 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Field Library</p>
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search fields..."
            className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400 transition-colors"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {FIELD_LIBRARY.map((group) => (
          <Group key={group.label} label={group.label} fields={group.fields} query={query} />
        ))}
      </div>
      <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
        <p className="text-xs text-gray-400 leading-tight">Drag any field onto a content type card</p>
      </div>
    </div>
  )
}
