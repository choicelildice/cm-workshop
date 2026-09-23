'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ViewportPortal,
  Connection,
  Node,
  NodeChange,
  Edge,
} from '@xyflow/react'
import { v4 as uuidv4 } from 'uuid'
import ContentTypeNode from './nodes/ContentTypeNode'
import ImageNode from './nodes/ImageNode'
import StickyNode from './nodes/StickyNode'
import AddFieldModal from './AddFieldModal'
import { ContentField, ContentTypeNodeData, ImageNodeData, StickyNodeData } from '@/lib/types'
import { migrateFieldType, type ContentTypeKind, type KindDef } from '@/lib/field-type-meta'
import { saveImage, loadImage, deleteImages, listImageIds } from '@/lib/image-store'
import { snapPosition, NO_GUIDES, type Guides } from '@/lib/snap'
import { layoutModel, edgeKey, type LayoutEdge } from '@/lib/layout'
import { TRACE_COLORS, SHARED_COLOR } from '@/lib/trace-colors'
import { DEFAULT_STICKY_COLOR } from '@/lib/sticky-colors'
import { loadProjectData, saveProjectData, allImageNodeIds } from '@/lib/projects'

interface CanvasProps {
  /** Active project. Changing it flushes the old board and loads the new one. */
  projectId: string
  /** Configured content type kinds, passed into every CT node. */
  kinds: KindDef[]
  onReady: (actions: {
    addContentType: (name: string) => void
    addImageNode: (file: File) => void
    addSticky: () => void
    arrangeBoard: () => { cycles: string[][]; orphans: number }
    clearBoard: () => void
    getExportData: () => { nodes: unknown[]; edges: unknown[] }
    importContentTypes: (types: {
      cmaId: string
      name: string
      fields: { cmaId: string; name: string; type: string; required: boolean; isArray: boolean; localized?: boolean; linkTargets: string[] }[]
    }[]) => void
  }) => void
}

interface TraceSummary {
  fields: { label: string; fieldName: string; colorIndex: number; targetCount: number }[]
  /** Types reached by more than one traced field. */
  sharedLabels: string[]
}

type PlacementData =
  | { type: 'contentType'; name: string }
  | { type: 'image'; file: File; imageUrl: string }
  | { type: 'sticky' }

function FlowControls({
  fitViewRef,
  screenToFlowRef,
}: {
  fitViewRef: React.MutableRefObject<(() => void) | null>
  screenToFlowRef: React.MutableRefObject<((pos: { x: number; y: number }) => { x: number; y: number }) | null>
}) {
  const { zoomIn, zoomOut, fitView, screenToFlowPosition } = useReactFlow()

  useEffect(() => {
    fitViewRef.current = () => fitView({ padding: 0.2 })
    screenToFlowRef.current = screenToFlowPosition
  }, [fitView, fitViewRef, screenToFlowPosition, screenToFlowRef])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn() }
      if (mod && e.key === '-') { e.preventDefault(); zoomOut() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomIn, zoomOut])

  return null
}


/**
 * Estimated card size for layout, since a freshly created node has not been
 * measured yet. Mirrors ContentTypeNode: auto-width from the title between 200
 * and 420, header plus a row per field plus the footer.
 */
function estimateCardSize(label: string, fieldCount: number): { width: number; height: number } {
  const TITLE_CH = 7.2      // ~7px per char at the header's bold 12px
  const CHROME = 92         // padding, emoji slot, hover buttons
  const width = Math.min(420, Math.max(200, Math.round(label.length * TITLE_CH + CHROME)))
  const HEADER = 26
  const ROW = 26
  const FOOTER = 24
  const height = HEADER + Math.max(fieldCount, 1) * ROW + FOOTER
  return { width, height }
}

const nodeTypes = {
  contentType: ContentTypeNode,
  image: ImageNode,
  sticky: StickyNode,
}

export default function Canvas({ projectId, kinds, onReady }: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [addFieldTarget, setAddFieldTarget] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<ContentField | null>(null)

  // Placement mode state
  const placementRef = useRef<PlacementData | null>(null)
  const [isPlacing, setIsPlacing] = useState(false)
  const [guides, setGuides] = useState<Guides>(NO_GUIDES)
  // Last snapped position during a drag, re-applied on release so the final
  // change from React Flow doesn't revert the node off the guide.
  const lastSnapRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null)
  // True between the first drag frame and release, so a drag records one
  // history entry rather than one per animation frame.
  const draggingRef = useRef(false)
  // Same, for resize gestures.
  const resizingRef = useRef(false)
  // Image ids already written to IndexedDB. A node's imageUrl never changes
  // after creation, so each blob only ever needs to be stored once.
  const savedImagesRef = useRef<Set<string>>(new Set())
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const screenToFlowRef = useRef<((pos: { x: number; y: number }) => { x: number; y: number }) | null>(null)

  // pushHistory is defined further down (it needs serializeNodes), so handlers
  // above it call through this ref.
  const pushHistoryRef = useRef<() => void>(() => {})
  const mark = useCallback(() => pushHistoryRef.current(), [])

  const onConnect = useCallback(
    (connection: Connection) => {
      mark()
      return setEdges((eds) =>
        addEdge(
          { ...connection, animated: false, style: { stroke: '#0891B2', strokeWidth: 2 } },
          eds
        )
      )
    },
    [setEdges, mark]
  )

  const handleAddField = useCallback((nodeId: string) => {
    setAddFieldTarget(nodeId)
  }, [])

  /**
   * Reference fields being traced. Each gets its own colour so several can be
   * compared at once, which answers "do these two fields point at the same
   * types?" — the shared targets are the interesting part.
   */
  const [tracedFields, setTracedFields] = useState<{ nodeId: string; fieldId: string }[]>([])

  const handleTraceField = useCallback((nodeId: string, fieldId: string, additive: boolean) => {
    setTracedFields((prev) => {
      const at = prev.findIndex((f) => f.nodeId === nodeId && f.fieldId === fieldId)

      // Clicking a traced field always removes it, additive or not
      if (at !== -1) return prev.filter((_, i) => i !== at)
      // Plain click replaces the selection; Cmd/Ctrl-click adds to it
      if (!additive) return [{ nodeId, fieldId }]
      // Past TRACE_COLORS.length the colours stop being tellable apart and the
      // dimming stops meaning anything, so ignore further additions
      if (prev.length >= TRACE_COLORS.length) return prev
      return [...prev, { nodeId, fieldId }]
    })
  }, [])

  const handleDeleteField = useCallback(
    (nodeId: string, fieldId: string) => {
      mark()
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as unknown as ContentTypeNodeData
          return { ...n, data: { ...data, fields: data.fields.filter((f) => f.id !== fieldId) } as unknown as Record<string, unknown> }
        })
      )
    },
    [setNodes, mark]
  )

  const handleRenameType = useCallback(
    (nodeId: string, newName: string) => {
      mark()
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          return { ...n, data: { ...n.data, label: newName } }
        })
      )
    },
    [setNodes, mark]
  )

  const handleSetTypeKind = useCallback(
    (nodeId: string, kind?: ContentTypeKind) => {
      mark()
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          return { ...n, data: { ...n.data, kind } }
        })
      )
    },
    [setNodes, mark]
  )

  const handleSetTypeEmoji = useCallback(
    (nodeId: string, emoji?: string) => {
      mark()
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          return { ...n, data: { ...n.data, emoji } }
        })
      )
    },
    [setNodes, mark]
  )

  const handleDeleteType = useCallback(
    (nodeId: string) => {
      mark()
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    },
    [setNodes, setEdges, mark]
  )

  const handleDeleteImage = useCallback(
    (nodeId: string) => {
      mark()
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    },
    [setNodes, mark]
  )

  const handleStickyText = useCallback(
    (nodeId: string, text: string) => {
      mark()
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, text } } : n))
      )
    },
    [setNodes, mark]
  )

  const handleStickyColor = useCallback(
    (nodeId: string, color: string) => {
      mark()
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, color } } : n))
      )
    },
    [setNodes, mark]
  )

  const makeStickyData = useCallback(
    (text = '', color = DEFAULT_STICKY_COLOR): StickyNodeData => ({
      text,
      color,
      onChangeText: handleStickyText,
      onChangeColor: handleStickyColor,
      onDelete: handleDeleteImage,
    }),
    [handleStickyText, handleStickyColor, handleDeleteImage]
  )

  const handleDropField = useCallback(
    (nodeId: string, field: Omit<ContentField, 'id'>) => {
      mark()
      const newField: ContentField = { ...field, id: uuidv4() }
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as unknown as ContentTypeNodeData
          return { ...n, data: { ...data, fields: [...data.fields, newField] } as unknown as Record<string, unknown> }
        })
      )
    },
    [setNodes, mark]
  )

  const handleCopyField = useCallback((field: ContentField) => {
    setClipboard({ ...field })
  }, [])

  const handlePasteField = useCallback(
    (nodeId: string) => {
      if (!clipboard) return
      mark()
      const newField: ContentField = { ...clipboard, id: uuidv4() }
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as unknown as ContentTypeNodeData
          return { ...n, data: { ...data, fields: [...data.fields, newField] } as unknown as Record<string, unknown> }
        })
      )
    },
    [clipboard, setNodes, mark]
  )

  const handleFieldAdded = useCallback(
    (nodeId: string, field: Omit<ContentField, 'id'>) => {
      mark()
      const newField: ContentField = { ...field, id: uuidv4() }
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as unknown as ContentTypeNodeData
          return { ...n, data: { ...data, fields: [...data.fields, newField] } as unknown as Record<string, unknown> }
        })
      )
    },
    [setNodes, mark]
  )

  // Patch one field in place. Takes a partial so a single checkbox toggle
  // doesn't have to restate the whole field.
  const handleUpdateField = useCallback(
    (nodeId: string, fieldId: string, patch: Partial<Omit<ContentField, 'id'>>) => {
      mark()
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as unknown as ContentTypeNodeData
          return {
            ...n,
            data: {
              ...data,
              fields: data.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
            } as unknown as Record<string, unknown>,
          }
        })
      )
    },
    [setNodes, mark]
  )

  // Move a field to a new index within its own content type
  const handleReorderField = useCallback(
    (nodeId: string, fieldId: string, toIndex: number) => {
      mark()
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as unknown as ContentTypeNodeData
          const from = data.fields.findIndex((f) => f.id === fieldId)
          if (from === -1) return n
          const next = [...data.fields]
          const [moved] = next.splice(from, 1)
          // toIndex is measured against the original array, so account for
          // the gap left by the removal when dropping further down the list.
          const target = Math.max(0, Math.min(from < toIndex ? toIndex - 1 : toIndex, next.length))
          if (target === from) return n
          next.splice(target, 0, moved)
          return { ...n, data: { ...data, fields: next } as unknown as Record<string, unknown> }
        })
      )
    },
    [setNodes, mark]
  )

  const makeContentTypeData = useCallback(
    (label: string, fields: ContentField[] = [], kind?: ContentTypeKind, emoji?: string): ContentTypeNodeData => ({
      label,
      fields,
      kind,
      emoji,
      kinds,
      hasClipboard: clipboard !== null,
      onAddField: handleAddField,
      onDeleteField: handleDeleteField,
      onCopyField: handleCopyField,
      onPasteField: handlePasteField,
      onDropField: handleDropField,
      onReorderField: handleReorderField,
      onUpdateField: handleUpdateField,
      onTraceField: handleTraceField,
      onRenameType: handleRenameType,
      onSetTypeKind: handleSetTypeKind,
      onSetTypeEmoji: handleSetTypeEmoji,
      onDeleteType: handleDeleteType,
    }),
    [clipboard, kinds, handleAddField, handleDeleteField, handleCopyField, handlePasteField, handleDropField, handleReorderField, handleUpdateField, handleTraceField, handleRenameType, handleSetTypeKind, handleSetTypeEmoji, handleDeleteType]
  )

  // Sync clipboard state to all existing CT nodes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== 'contentType') return n
        return { ...n, data: { ...n.data, hasClipboard: clipboard !== null, onCopyField: handleCopyField, onPasteField: handlePasteField, onDropField: handleDropField } }
      })
    )
  }, [clipboard, handleCopyField, handlePasteField, handleDropField, setNodes])

  // Push kind-config edits into existing nodes so renames and recolours show
  // up immediately rather than only on newly created cards.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => (n.type === 'contentType' ? { ...n, data: { ...n.data, kinds } } : n))
    )
  }, [kinds, setNodes])

  // Internal: actually create a CT node at a flow position
  const placeContentTypeAt = useCallback(
    (name: string, position: { x: number; y: number }) => {
      mark()
      const id = uuidv4()
      const data = makeContentTypeData(name)
      setNodes((nds) => [...nds, { id, type: 'contentType', position, data: data as unknown as Record<string, unknown> }])
    },
    [setNodes, makeContentTypeData]
  )

  // Internal: actually create an image node at a flow position
  const placeImageAt = useCallback(
    (file: File, imageUrl: string, position: { x: number; y: number }) => {
      mark()
      const id = uuidv4()
      const data: ImageNodeData = { imageUrl, label: file.name, onDelete: handleDeleteImage }
      setNodes((nds) => [...nds, { id, type: 'image', position, data: data as unknown as Record<string, unknown> }])
    },
    [setNodes, handleDeleteImage]
  )


  /**
   * Adds content types imported from a Contentful space.
   *
   * Laid out on a grid to the right of whatever is already on the board, so an
   * import never lands on top of existing work. Reference arrows are recreated
   * from each field's linkContentType validations.
   */
  const importContentTypes = useCallback(
    (types: {
      cmaId: string
      name: string
      fields: { cmaId: string; name: string; type: string; required: boolean; isArray: boolean; localized?: boolean; linkTargets: string[] }[]
    }[]) => {
      if (!types.length) return
      mark()

      // Placed clear of existing content, to the right of whatever is there
      const existing = nodesRef.current
      const startX = existing.length
        ? Math.max(...existing.map((n) => n.position.x + (n.measured?.width ?? 220))) + 160
        : 0
      const startY = existing.length ? Math.min(...existing.map((n) => n.position.y)) : 0

      // cmaId -> new node id, so edges can be wired after all nodes exist
      const idMap = new Map<string, string>()
      // cmaId -> field cmaId -> generated field id, for edge source handles
      const fieldMap = new Map<string, Map<string, string>>()

      const newNodes: Node[] = types.map((t) => {
        const nodeId = uuidv4()
        idMap.set(t.cmaId, nodeId)

        const fieldIds = new Map<string, string>()
        const fields: ContentField[] = t.fields.map((f) => {
          const fid = uuidv4()
          fieldIds.set(f.cmaId, fid)
          return {
            id: fid,
            name: f.name,
            type: migrateFieldType(f.type),
            required: f.required,
            isArray: f.isArray,
            localized: f.localized,
          }
        })
        fieldMap.set(t.cmaId, fieldIds)

        return {
          id: nodeId,
          type: 'contentType',
          // Overwritten by the layered layout below
          position: { x: 0, y: 0 },
          data: makeContentTypeData(t.name, fields) as unknown as Record<string, unknown>,
        }
      })

      // ── Layered layout ────────────────────────────────────────────────
      // Types nothing references on the left, flowing right to types that
      // reference nothing. Reference arrows become the graph edges.
      const layoutEdges: LayoutEdge[] = []
      for (const t of types) {
        const sourceId = idMap.get(t.cmaId)!
        for (const f of t.fields) {
          for (const target of f.linkTargets) {
            const targetId = idMap.get(target)
            if (targetId) layoutEdges.push({ source: sourceId, target: targetId })
          }
        }
      }

      const sizeById = new Map(
        types.map((t) => [idMap.get(t.cmaId)!, estimateCardSize(t.name, t.fields.length)])
      )
      const layout = layoutModel(
        newNodes.map((n) => ({ id: n.id, ...sizeById.get(n.id)! })),
        layoutEdges
      )

      for (const n of newNodes) {
        const at = layout.positions.get(n.id)
        if (at) n.position = { x: startX + at.x, y: startY + at.y }
      }

      const newEdges: Edge[] = []
      for (const t of types) {
        const sourceId = idMap.get(t.cmaId)!
        const fieldIds = fieldMap.get(t.cmaId)!
        for (const f of t.fields) {
          for (const target of f.linkTargets) {
            const targetId = idMap.get(target)
            if (!targetId) continue
            // A back edge closes a circular reference. Dashed rather than
            // coloured: a loop is usually intentional (Page <-> Section), so
            // it is information, not a warning.
            const isLoop = layout.backEdges.has(edgeKey(sourceId, targetId))
            newEdges.push({
              id: `e-${sourceId}-${fieldIds.get(f.cmaId)}-${targetId}`,
              source: sourceId,
              target: targetId,
              sourceHandle: `field-${fieldIds.get(f.cmaId)}`,
              animated: false,
              style: isLoop
                ? { stroke: '#0891B2', strokeWidth: 2, strokeDasharray: '6 4' }
                : { stroke: '#0891B2', strokeWidth: 2 },
            })
          }
        }
      }

      setNodes((nds) => [...nds, ...newNodes])
      setEdges((eds) => [...eds, ...newEdges])
      setTimeout(() => fitViewRef.current?.(), 60)
    },
    [setNodes, setEdges, makeContentTypeData, mark]
  )

  // Internal: actually create a sticky note at a flow position
  const placeStickyAt = useCallback(
    (position: { x: number; y: number }) => {
      mark()
      const id = uuidv4()
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: 'sticky',
          position,
          // Explicit dimensions so the node has size before any resize. React
          // Flow resolves width as `node.width ?? initialWidth ?? style.width`,
          // and a sticky has no Handle or intrinsic content to measure, so
          // without these it mounts collapsed and appears to vanish.
          width: 200,
          height: 200,
          data: makeStickyData() as unknown as Record<string, unknown>,
        },
      ])
    },
    [setNodes, makeStickyData, mark]
  )

  const addSticky = useCallback(() => {
    placementRef.current = { type: 'sticky' }
    setIsPlacing(true)
    setGhostPos(null)
  }, [])

  // Enter placement mode for a content type
  const addContentType = useCallback((name: string) => {
    placementRef.current = { type: 'contentType', name }
    setIsPlacing(true)
    setGhostPos(null)
  }, [])

  // Enter placement mode for an image (read file first)
  const addImageNode = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string
      placementRef.current = { type: 'image', file, imageUrl }
      setIsPlacing(true)
      setGhostPos(null)
    }
    reader.readAsDataURL(file)
  }, [])

  // Mouse tracking + click-to-place + escape during placement
  useEffect(() => {
    if (!isPlacing) return

    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setGhostPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }

    function clearPlacement() {
      placementRef.current = null
      setIsPlacing(false)
      setGhostPos(null)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') clearPlacement()
    }

    // Placement completes on mousedown in the capture phase rather than via
    // React Flow's onPaneClick. onPaneClick never fires when the click lands
    // on an existing node, and a click carrying a pixel of drift is treated
    // as a drag instead, which left the ghost stuck to the cursor.
    function onMouseDownCapture(e: MouseEvent) {
      if (e.button !== 0) return
      const el = containerRef.current
      const target = e.target as HTMLElement | null
      if (!el || !target || !el.contains(target)) return
      // Leave React Flow's own overlays clickable while placing
      if (target.closest('.react-flow__controls, .react-flow__minimap, .react-flow__attribution')) return
      const p = placementRef.current
      if (!p) {
        // Not placing: a bare canvas click clears any active trace
        setTracedFields([])
        return
      }
      const pos = screenToFlowRef.current?.({ x: e.clientX, y: e.clientY })
      if (!pos) return
      // Keep React Flow from starting a node drag or selection from this press
      e.preventDefault()
      e.stopPropagation()
      if (p.type === 'contentType') placeContentTypeAt(p.name, pos)
      else if (p.type === 'sticky') placeStickyAt(pos)
      else placeImageAt(p.file, p.imageUrl, pos)
      clearPlacement()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDownCapture, true)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onMouseDownCapture, true)
    }
  }, [isPlacing, placeContentTypeAt, placeImageAt, placeStickyAt])


  /**
   * Re-lays out the content types already on the board, left to right by
   * reference depth. Sticky notes and images are left where they are: they are
   * annotations, not part of the graph.
   *
   * Returns what it found, so the caller can report circular references.
   */
  const arrangeBoard = useCallback((): { cycles: string[][]; orphans: number } => {
    const all = nodesRef.current
    const cts = all.filter((n) => n.type === 'contentType')
    if (cts.length === 0) return { cycles: [], orphans: 0 }

    mark()

    const labelOf = (id: string) =>
      (all.find((n) => n.id === id)?.data as unknown as ContentTypeNodeData | undefined)?.label ?? id

    // Prefer React Flow's measurement; fall back to an estimate for a card that
    // has not rendered yet.
    const sized = cts.map((n) => {
      const d = n.data as unknown as ContentTypeNodeData
      const est = estimateCardSize(d.label ?? '', d.fields?.length ?? 0)
      return {
        id: n.id,
        width: n.measured?.width ?? n.width ?? est.width,
        height: n.measured?.height ?? n.height ?? est.height,
      }
    })

    const ctIds = new Set(cts.map((n) => n.id))
    const layoutEdges: LayoutEdge[] = edgesRef.current
      .filter((e) => ctIds.has(e.source) && ctIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))

    const layout = layoutModel(sized, layoutEdges)

    // Anchor the result at the current top-left, so an arrange doesn't jump the
    // diagram to the origin
    const originX = Math.min(...cts.map((n) => n.position.x))
    const originY = Math.min(...cts.map((n) => n.position.y))

    setNodes((nds) =>
      nds.map((n) => {
        const at = layout.positions.get(n.id)
        return at ? { ...n, position: { x: originX + at.x, y: originY + at.y } } : n
      })
    )

    // Re-style edges so loops read as dashed here too
    setEdges((eds) =>
      eds.map((e) => {
        if (!ctIds.has(e.source) || !ctIds.has(e.target)) return e
        const isLoop = layout.backEdges.has(edgeKey(e.source, e.target))
        return {
          ...e,
          style: isLoop
            ? { stroke: '#0891B2', strokeWidth: 2, strokeDasharray: '6 4' }
            : { stroke: '#0891B2', strokeWidth: 2 },
        }
      })
    )

    setTimeout(() => fitViewRef.current?.(), 60)

    return {
      cycles: layout.cycles.map((path) => path.map(labelOf)),
      orphans: layout.orphanIds.length,
    }
  }, [setNodes, setEdges, mark])

  const getExportData = useCallback(() => {
    const exportNodes = nodes
      .filter((n) => n.type === 'contentType')
      .map((n) => {
        const d = n.data as unknown as ContentTypeNodeData
        return { id: n.id, position: n.position, data: { label: d.label, fields: d.fields, kind: d.kind, emoji: d.emoji } }
      })
    // sourceHandle identifies which field an arrow leaves from, which the
    // Contentful export needs to scope link validations to that field.
    const exportEdges = edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null,
    }))
    // Sticky notes go to Miro as real sticky notes; Contentful ignores them.
    const stickies = nodes
      .filter((n) => n.type === 'sticky')
      .map((n) => {
        const d = n.data as unknown as StickyNodeData
        return { id: n.id, position: n.position, text: d.text, color: d.color }
      })
      .filter((s) => s.text.trim().length > 0)
    return { nodes: exportNodes, edges: exportEdges, stickies }
  }, [nodes, edges])

  // Empties the open project only. Images referenced by other projects are
  // left alone; the blob cleanup effect removes whatever is now unreferenced.
  const clearBoard = useCallback(() => {
    mark()
    setNodes([])
    setEdges([])
  }, [setNodes, setEdges])

  useEffect(() => {
    onReady({ addContentType, addImageNode, addSticky, arrangeBoard, clearBoard, getExportData, importContentTypes })
  }, [onReady, addContentType, addImageNode, addSticky, arrangeBoard, clearBoard, getExportData, importContentTypes])

  const restoredRef = useRef(false)
  const fitViewRef = useRef<(() => void) | null>(null)

  // Always-current nodes, so the image effect can read them without taking
  // `nodes` as a dependency (which would re-run it on every drag frame).
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  // Changes only when images are added or removed — NOT when nodes move.
  const imageKey = nodes
    .filter((n) => n.type === 'image')
    .map((n) => n.id)
    .sort()
    .join(',')

  // Persist image blobs. Keyed on imageKey so dragging never rewrites
  // multi-megabyte base64 payloads to IndexedDB.
  useEffect(() => {
    if (!restoredRef.current) return

    const imageNodes = nodesRef.current.filter((n) => n.type === 'image')

    listImageIds().then((storedIds) => {
      // Keep any blob referenced by ANY project, plus the open board (whose
      // newest images may not be written to the project record yet). Scoping
      // this to the current board would delete other projects' images.
      const keep = allImageNodeIds()
      imageNodes.forEach((n) => keep.add(n.id))

      const stale = storedIds.filter((id) => !keep.has(id))
      if (stale.length) {
        deleteImages(stale).catch(() => {})
        stale.forEach((id) => savedImagesRef.current.delete(id))
      }
      for (const n of imageNodes) {
        if (savedImagesRef.current.has(n.id)) continue
        const { imageUrl } = n.data as unknown as ImageNodeData
        if (!imageUrl) continue
        savedImagesRef.current.add(n.id)
        saveImage(n.id, imageUrl).catch(() => savedImagesRef.current.delete(n.id))
      }
    }).catch(() => {})
  }, [imageKey])

  // Strip callbacks and image blobs so only plain data is persisted
  const serializeNodes = useCallback(
    (ns: Node[]) =>
      ns.map((n) => {
        if (n.type === 'contentType') {
          // Everything callback-shaped is dropped, plus two pieces of derived
          // state: `hasClipboard` is transient, and `kinds` is global config
          // re-injected on load — persisting it would copy the whole kinds
          // array into every single node.
          const {
            onAddField, onDeleteField, onCopyField, onPasteField, onDropField,
            onReorderField, onUpdateField, onTraceField, onRenameType, onSetTypeKind,
            onSetTypeEmoji, onDeleteType, hasClipboard, kinds: _kinds,
            // Transient UI state: never persisted. It only ever exists on the
            // render-time copy, but strip it so a future change can't leak it.
            tracedFieldColors: _tc, traceTargetColor: _ttc, ...rest
          } = n.data as unknown as ContentTypeNodeData
          void onAddField; void onDeleteField; void onCopyField; void onPasteField
          void onDropField; void onReorderField; void onUpdateField; void onRenameType
          void onSetTypeKind; void onSetTypeEmoji; void onDeleteType; void onTraceField
          void hasClipboard; void _kinds; void _tc; void _ttc
          return { ...n, data: rest }
        }
        if (n.type === 'image') {
          const { onDelete, imageUrl, ...rest } = n.data as unknown as ImageNodeData
          void onDelete; void imageUrl
          return { ...n, data: rest }
        }
        if (n.type === 'sticky') {
          const { onChangeText, onChangeColor, onDelete, ...rest } = n.data as unknown as StickyNodeData
          void onChangeText; void onChangeColor; void onDelete
          return { ...n, data: rest }
        }
        return n
      }),
    []
  )

  const edgesRef = useRef(edges)
  edgesRef.current = edges
  // Which project the in-memory board belongs to
  const loadedProjectRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Undo / redo ─────────────────────────────────────────────────────
  // Snapshots hold serialized nodes (no callbacks or image blobs) plus edges.
  // Callbacks are re-attached on restore, exactly as the project loader does,
  // so an undone node stays interactive.
  interface Snapshot { nodes: Node[]; edges: Edge[] }
  const undoStackRef = useRef<Snapshot[]>([])
  const redoStackRef = useRef<Snapshot[]>([])
  // Set while an undo/redo is being applied, so the resulting state change
  // isn't itself recorded as a new history entry.
  const applyingHistoryRef = useRef(false)
  const HISTORY_LIMIT = 50

  const snapshot = useCallback(
    (): Snapshot => ({
      nodes: serializeNodes(nodesRef.current) as Node[],
      edges: edgesRef.current.map((e) => ({ ...e })),
    }),
    [serializeNodes]
  )

  /** Records the current state as an undo point. Call BEFORE mutating. */
  const pushHistory = useCallback(() => {
    if (applyingHistoryRef.current || !restoredRef.current) return
    undoStackRef.current.push(snapshot())
    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift()
    // Any new action invalidates the redo branch
    redoStackRef.current = []
  }, [snapshot])

  /** Re-attaches callbacks to serialized nodes so they work after restore. */
  const rehydrate = useCallback(
    (ns: Node[]): Node[] =>
      ns.map((n) => {
        if (n.type === 'contentType') {
          const d = n.data as unknown as {
            label: string; fields: ContentField[]; kind?: ContentTypeKind; emoji?: string
          }
          return {
            ...n,
            data: makeContentTypeData(d.label, d.fields, d.kind, d.emoji) as unknown as Record<string, unknown>,
          }
        }
        if (n.type === 'image') {
          // imageUrl was stripped for the snapshot; recover it from the live
          // node, since the blob itself never changes once created.
          const live = nodesRef.current.find((x) => x.id === n.id)
          const imageUrl = (live?.data as unknown as ImageNodeData | undefined)?.imageUrl ?? ''
          return { ...n, data: { ...n.data, imageUrl, onDelete: handleDeleteImage } }
        }
        if (n.type === 'sticky') {
          const d = n.data as unknown as { text: string; color?: string }
          return {
            ...n,
            width: n.width ?? 200,
            height: n.height ?? 200,
            data: makeStickyData(d.text, d.color) as unknown as Record<string, unknown>,
          }
        }
        return n
      }),
    [makeContentTypeData, handleDeleteImage, makeStickyData]
  )

  const applySnapshot = useCallback(
    (snap: Snapshot) => {
      applyingHistoryRef.current = true
      setNodes(rehydrate(snap.nodes))
      setEdges(snap.edges)
      // Cleared after the state updates have flushed
      setTimeout(() => { applyingHistoryRef.current = false }, 0)
    },
    [rehydrate, setNodes, setEdges]
  )

  // Handlers above reach pushHistory through this ref
  pushHistoryRef.current = pushHistory

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop()
    if (!prev) return
    redoStackRef.current.push(snapshot())
    applySnapshot(prev)
  }, [snapshot, applySnapshot])

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop()
    if (!next) return
    undoStackRef.current.push(snapshot())
    applySnapshot(next)
  }, [snapshot, applySnapshot])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return

      // Let text fields keep their own native undo
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return
      }

      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  // Persist the board, debounced so a drag produces one write on settle
  // rather than one per animation frame.
  useEffect(() => {
    if (!restoredRef.current) return
    const target = loadedProjectRef.current
    if (!target) return

    saveTimerRef.current = setTimeout(() => {
      saveProjectData(target, { nodes: serializeNodes(nodes), edges })
      saveTimerRef.current = null
    }, 400)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [nodes, edges, serializeNodes])

  // Load the active project; on switch, flush the outgoing one first
  useEffect(() => {
    if (loadedProjectRef.current === projectId) return

    const previous = loadedProjectRef.current
    if (previous) {
      // A debounced save may still be pending for the project we're leaving
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      saveProjectData(previous, { nodes: serializeNodes(nodesRef.current), edges: edgesRef.current })
    }

    // History belongs to one board; carrying it across a switch would let an
    // undo paste another project's contents in.
    undoStackRef.current = []
    redoStackRef.current = []
    // A trace names node ids from the outgoing board
    setTracedFields([])

    // Block saving until the incoming board is in memory, so an empty canvas
    // can't overwrite the project we're about to read.
    restoredRef.current = false
    loadedProjectRef.current = projectId

    let cancelled = false
    const load = async () => {
      const data = loadProjectData(projectId)
      const parsed = (data?.nodes ?? []) as Node[]

      const restored = await Promise.all(
        parsed.map(async (n) => {
          if (n.type === 'contentType') {
            const d = n.data as { label: string; fields: ContentField[]; kind?: ContentTypeKind; emoji?: string }
            // Boards saved before the field-type list was corrected may hold
            // retired ids (shortText, integer, array); remap them on load.
            const fields = (d.fields ?? []).map((f) => ({ ...f, type: migrateFieldType(f.type) }))
            return { ...n, data: makeContentTypeData(d.label, fields, d.kind, d.emoji) as unknown as Record<string, unknown> }
          }
          if (n.type === 'image') {
            const imageUrl = await loadImage(n.id) ?? ''
            // Came out of IndexedDB, so it's already persisted
            if (imageUrl) savedImagesRef.current.add(n.id)
            return { ...n, data: { ...n.data, imageUrl, onDelete: handleDeleteImage } }
          }
          if (n.type === 'sticky') {
            const d = n.data as unknown as { text: string; color?: string }
            return {
              ...n,
              // Stickies saved before resizing existed carry no dimensions
              width: n.width ?? 200,
              height: n.height ?? 200,
              data: makeStickyData(d.text, d.color) as unknown as Record<string, unknown>,
            }
          }
          return n
        })
      )

      // A newer switch may have started while we awaited the image reads
      if (cancelled || loadedProjectRef.current !== projectId) return

      setNodes(restored)
      setEdges((data?.edges ?? []) as Edge[])
      restoredRef.current = true
      setTimeout(() => fitViewRef.current?.(), 50)
    }

    load()
    return () => { cancelled = true }
  }, [projectId, makeContentTypeData, handleDeleteImage, makeStickyData, setNodes, setEdges, serializeNodes])

  // Delete selected nodes/edges.
  //
  // Handled here rather than via React Flow's `deleteKeyCode` for two reasons:
  // on macOS the key labelled "delete" reports as Backspace (forward-delete is
  // Fn+Delete), and doing it ourselves guarantees the shortcut can never fire
  // while a text field has focus, so backspacing in a name field edits text
  // instead of destroying the selection.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setTracedFields([]); return }
      if (e.key !== 'Backspace' && e.key !== 'Delete') return

      // Never hijack a keystroke meant for a text field
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return
      }

      // Placement mode owns the keyboard until it resolves (Esc cancels)
      if (placementRef.current) return

      const nodeIds = new Set(nodesRef.current.filter((n) => n.selected).map((n) => n.id))
      const edgeIds = new Set(edgesRef.current.filter((ed) => ed.selected).map((ed) => ed.id))
      if (nodeIds.size === 0 && edgeIds.size === 0) return

      e.preventDefault()
      pushHistoryRef.current()
      setNodes((nds) => nds.filter((n) => !nodeIds.has(n.id)))
      // Drop selected edges, and any edge left dangling by a deleted node
      setEdges((eds) =>
        eds.filter(
          (ed) => !edgeIds.has(ed.id) && !nodeIds.has(ed.source) && !nodeIds.has(ed.target)
        )
      )
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setNodes, setEdges])

  // Flush on tab close. Saves are debounced 400ms, so a change made just
  // before closing would otherwise never reach storage.
  useEffect(() => {
    function flush() {
      if (!restoredRef.current) return
      const target = loadedProjectRef.current
      if (!target) return
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      saveProjectData(target, { nodes: serializeNodes(nodesRef.current), edges: edgesRef.current })
    }

    window.addEventListener('beforeunload', flush)
    // pagehide also covers the cases where beforeunload doesn't fire reliably
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [serializeNodes])

  // Apply alignment snapping by correcting the position change before React
  // Flow commits it, rather than overriding position mid-drag (which fights
  // the drag handler and causes jitter).
  const onNodesChangeSnapped = useCallback(
    (changes: NodeChange<Node>[]) => {
      type PosChange = Extract<NodeChange<Node>, { type: 'position' }>
      const posChanges = changes.filter((c): c is PosChange => c.type === 'position')
      const drag = posChanges[0]

      // Resizing emits a dimensions change per frame with resizing:true, so
      // record once at the start of the gesture, as with dragging.
      type DimChange = Extract<NodeChange<Node>, { type: 'dimensions' }>
      const resize = changes.find(
        (c): c is DimChange => c.type === 'dimensions' && !!(c as DimChange).resizing
      )
      if (resize) {
        if (!resizingRef.current) {
          resizingRef.current = true
          pushHistoryRef.current()
        }
      } else if (resizingRef.current && changes.some((c) => c.type === 'dimensions')) {
        resizingRef.current = false
      }

      if (drag?.dragging && drag.position) {
        // One history entry per gesture: record on the first frame only.
        if (!draggingRef.current) {
          draggingRef.current = true
          pushHistoryRef.current()
        }
        // Snap only for a single-node drag; multi-select keeps relative layout
        if (posChanges.length === 1) {
          const dragged = nodes.find((n) => n.id === drag.id)
          if (dragged) {
            const { position, guides: g } = snapPosition(dragged, drag.position, nodes)
            drag.position = position
            lastSnapRef.current = { id: drag.id, position }
            setGuides(g)
          }
        }
      } else if (drag && !drag.dragging) {
        draggingRef.current = false
        // Drag released. React Flow derives this final position from its own
        // drag delta, not from the snapped value we wrote during the drag, so
        // without this the node jumps back off the guide by the snap offset.
        if (drag.position && lastSnapRef.current?.id === drag.id) {
          drag.position = lastSnapRef.current.position
        }
        lastSnapRef.current = null
        setGuides(NO_GUIDES)
      }

      onNodesChange(changes)
    },
    [nodes, onNodesChange]
  )

  /**
   * Edges and nodes as rendered, with trace highlights applied.
   *
   * Derived rather than written into the edges themselves: each edge's `style`
   * already carries whether it is a dashed back edge, so overwriting it would
   * lose that. Deriving also means clearing a trace needs no restore.
   */
  const { displayEdges, dimmedNodeIds, nodeTint, traceSummary } = (() => {
    const none = {
      displayEdges: edges,
      dimmedNodeIds: null as Set<string> | null,
      nodeTint: null as Map<string, string> | null,
      traceSummary: null as TraceSummary | null,
    }
    if (tracedFields.length === 0) return none

    // Which traced fields reach each edge, and each target type
    const edgeColor = new Map<string, number>()
    const targetHits = new Map<string, number[]>()
    const perField: { nodeId: string; fieldId: string; colorIndex: number; targets: string[] }[] = []

    tracedFields.forEach((tf, i) => {
      const handle = `field-${tf.fieldId}`
      const lit = edges.filter((e) => e.source === tf.nodeId && e.sourceHandle === handle)
      for (const e of lit) {
        // First traced field to claim an edge owns its colour. An edge can only
        // belong to one field anyway, since the handle identifies the field.
        if (!edgeColor.has(e.id)) edgeColor.set(e.id, i)
        const hits = targetHits.get(e.target) ?? []
        if (!hits.includes(i)) hits.push(i)
        targetHits.set(e.target, hits)
      }
      perField.push({ ...tf, colorIndex: i, targets: lit.map((e) => e.target) })
    })

    // No arrows drawn from any selected field: leave the board alone rather
    // than dimming everything to no purpose
    if (edgeColor.size === 0) return none

    const sourceIds = new Set(tracedFields.map((f) => f.nodeId))
    const involved = new Set<string>([...sourceIds, ...targetHits.keys()])

    // A target reached by more than one traced field is the answer to "do these
    // reference the same things?", so it gets its own marker colour.
    const shared = new Set(
      [...targetHits.entries()].filter(([, hits]) => hits.length > 1).map(([id]) => id)
    )

    const tint = new Map<string, string>()
    for (const [target, hits] of targetHits) {
      tint.set(target, hits.length > 1 ? SHARED_COLOR.line : TRACE_COLORS[hits[0]].line)
    }

    return {
      displayEdges: edges.map((e) => {
        const ci = edgeColor.get(e.id)
        if (ci === undefined) return { ...e, style: { ...e.style, opacity: 0.1 } }
        const isShared = shared.has(e.target)
        return {
          ...e,
          animated: true,
          zIndex: isShared ? 11 : 10,
          style: {
            ...e.style,
            stroke: TRACE_COLORS[ci].line,
            strokeWidth: isShared ? 4 : 3,
          },
        }
      }),
      dimmedNodeIds: new Set(
        nodes.filter((n) => n.type === 'contentType' && !involved.has(n.id)).map((n) => n.id)
      ),
      nodeTint: tint,
      traceSummary: {
        fields: perField.map((f) => ({
          label:
            (nodes.find((n) => n.id === f.nodeId)?.data as unknown as ContentTypeNodeData | undefined)
              ?.label ?? f.nodeId,
          fieldName:
            (
              (nodes.find((n) => n.id === f.nodeId)?.data as unknown as ContentTypeNodeData | undefined)
                ?.fields ?? []
            ).find((x) => x.id === f.fieldId)?.name ?? 'field',
          colorIndex: f.colorIndex,
          targetCount: f.targets.length,
        })),
        sharedLabels: [...shared].map(
          (id) =>
            (nodes.find((n) => n.id === id)?.data as unknown as ContentTypeNodeData | undefined)
              ?.label ?? id
        ),
      },
    }
  })()

  // The traced field ids go only to the cards that own them, so a card can mark
  // its active rows without every card re-rendering on each trace.
  const displayNodes = nodes.map((n) => {
    const dimmed = dimmedNodeIds?.has(n.id)
    const owned = tracedFields.filter((f) => f.nodeId === n.id)
    const tint = nodeTint?.get(n.id)
    if (!dimmed && owned.length === 0 && !tint) return n

    const traced: Record<string, string> = {}
    for (const f of owned) traced[f.fieldId] = TRACE_COLORS[tracedFields.indexOf(f)].line

    return {
      ...n,
      ...(dimmed ? { style: { ...n.style, opacity: 0.3 } } : {}),
      data: {
        ...n.data,
        ...(owned.length ? { tracedFieldColors: traced } : {}),
        ...(tint ? { traceTargetColor: tint } : {}),
      },
    }
  })

  const placementData = placementRef.current

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', cursor: isPlacing ? 'crosshair' : 'default' }}>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChangeSnapped}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        deleteKeyCode={null}
        minZoom={0.1}
        maxZoom={8}
        panOnDrag={!isPlacing}
      >
        <FlowControls fitViewRef={fitViewRef} screenToFlowRef={screenToFlowRef} />

        {/* Alignment guides, drawn in flow space so they pan/zoom with the canvas */}
        <ViewportPortal>
          {guides.x.map((x) => (
            <div
              key={`gx-${x}`}
              style={{
                position: 'absolute',
                left: x,
                top: -50000,
                width: 1,
                height: 100000,
                background: '#ec4899',
                pointerEvents: 'none',
                zIndex: 1000,
              }}
            />
          ))}
          {guides.y.map((y) => (
            <div
              key={`gy-${y}`}
              style={{
                position: 'absolute',
                top: y,
                left: -50000,
                height: 1,
                width: 100000,
                background: '#ec4899',
                pointerEvents: 'none',
                zIndex: 1000,
              }}
            />
          ))}
        </ViewportPortal>
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e5e7eb" />
        <Controls />
        <MiniMap
          nodeColor={(n) => (n.type === 'image' ? '#e5e7eb' : '#0f1042')}
          maskColor="rgba(255,255,255,0.7)"
        />
      </ReactFlow>

      {/* Placement ghost */}
      {isPlacing && ghostPos && placementData && (
        <div
          style={{
            position: 'absolute',
            left: ghostPos.x,
            top: ghostPos.y,
            pointerEvents: 'none',
            opacity: 0.75,
            transform: 'translate(0, 0)',
          }}
        >
          {placementData.type === 'sticky' ? (
            <div
              style={{
                width: 200,
                height: 200,
                background: DEFAULT_STICKY_COLOR,
                borderRadius: 2,
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            />
          ) : placementData.type === 'contentType' ? (
            <div style={{ width: 200, background: '#0f1042', borderRadius: 6, padding: '4px 10px', color: 'white', fontSize: 12, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
              {placementData.name}
            </div>
          ) : (
            <img
              src={placementData.imageUrl}
              alt=""
              style={{ width: 320, borderRadius: 8, border: '2px solid #1773eb', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', display: 'block' }}
            />
          )}
          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, color: '#6b7280', background: 'white', borderRadius: 4, padding: '2px 6px', display: 'inline-block' }}>
            Click to place · Esc to cancel
          </div>
        </div>
      )}

      {/* Trace legend. The shared list is the point of comparing two fields. */}
      {traceSummary && (
        <div className="absolute bottom-4 left-4 z-40 bg-white border border-gray-200 rounded-xl shadow-xl p-3 max-w-xs">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[11px] font-bold text-gray-900">Tracing</p>
            <button
              className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
              onClick={() => setTracedFields([])}
            >
              Clear
            </button>
          </div>

          <div className="space-y-1">
            {traceSummary.fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span
                  className="flex-shrink-0 rounded"
                  style={{ width: 10, height: 10, backgroundColor: TRACE_COLORS[f.colorIndex].line }}
                />
                <span className="text-gray-700 truncate">
                  {f.label}.<strong>{f.fieldName}</strong>
                </span>
                <span className="text-gray-400 flex-shrink-0 ml-auto">
                  {f.targetCount === 0 ? 'none' : `${f.targetCount} target${f.targetCount === 1 ? '' : 's'}`}
                </span>
              </div>
            ))}
          </div>

          {traceSummary.fields.length > 1 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              {traceSummary.sharedLabels.length > 0 ? (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="flex-shrink-0 rounded"
                      style={{ width: 10, height: 10, backgroundColor: SHARED_COLOR.line }}
                    />
                    <span className="text-[11px] font-medium text-gray-700">
                      Both reference
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 break-words">
                    {traceSummary.sharedLabels.join(', ')}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-gray-500">No targets in common.</p>
              )}
            </div>
          )}

          {traceSummary.fields.length === 1 && (
            <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
              &#8984;-click another reference field to compare
            </p>
          )}
        </div>
      )}

      {addFieldTarget && (
        <AddFieldModal
          nodeId={addFieldTarget}
          onAdd={handleFieldAdded}
          onClose={() => setAddFieldTarget(null)}
        />
      )}
    </div>
  )
}
