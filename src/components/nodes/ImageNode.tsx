'use client'

import { useState } from 'react'
import { NodeProps, Handle, Position } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { ImageNodeData } from '@/lib/types'

export default function ImageNode({ id, data: rawData }: NodeProps) {
  const data = rawData as unknown as ImageNodeData
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="relative rounded-lg overflow-hidden border border-gray-200 shadow-md bg-white"
      style={{ width: 320 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 8, height: 8, background: '#6B7280', border: '2px solid white' }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.imageUrl} alt={data.label} className="w-full block" draggable={false} />

      <div className="px-2 py-1 bg-gray-50 border-t border-gray-100">
        <span className="text-[10px] text-gray-500 truncate block">{data.label}</span>
      </div>

      {hovered && (
        <button
          className="nodrag absolute top-2 right-2 bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded p-1 shadow transition-colors"
          onClick={() => data.onDelete(id)}
          title="Remove image"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}
