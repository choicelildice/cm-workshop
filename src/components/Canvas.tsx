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
import AddFieldModal from './AddFieldModal'
import { ContentField, ContentTypeNodeData, ImageNodeData } from '@/lib/types'
import { migrateFieldType, type ContentTypeKind, type KindDef } from '@/lib/field-type-meta'
import { saveImage, loadImage, deleteImages, listImageIds } from '@/lib/image-store'
import { snapPosition, NO_GUIDES, type Guides } from '@/lib/snap'
import { loadProjectData, saveProjectData, allImageNodeIds } from '@/lib/projects'

interface CanvasProps {
  /** Active project. Changing it flushes the old board and loads the new one. */
  projectId: string
  /** Configured content type kinds, passed into every CT node. */
  kinds: KindDef[]
  onReady: (actions: {
    addContentType: (name: string) => void
    addImageNode: (file: File) => void
    clearBoard: () => void
    getExportData: () => { nodes: unknown[]; edges: unknown[] }
    importContentTypes: (types: {
      cmaId: string
      name: string
      fields: { cmaId: string; name: string; type: string; required: boolean; isArray: boolean; linkTargets: string[] }[]
    }[]) => void
  }) => void
}

type PlacementData =
  | { type: 'contentType'; name: string }
  | { type: 'image'; file: File; imageUrl: string }

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

const nodeTypes = {
  contentType: ContentTypeNode,
  image: ImageNode,
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
      onRenameType: handleRenameType,
      onSetTypeKind: handleSetTypeKind,
      onSetTypeEmoji: handleSetTypeEmoji,
      onDeleteType: handleDeleteType,
    }),
    [clipboard, kinds, handleAddField, handleDeleteField, handleCopyField, handlePasteField, handleDropField, handleReorderField, handleRenameType, handleSetTypeKind, handleSetTypeEmoji, handleDeleteType]
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
      fields: { cmaId: string; name: string; type: string; required: boolean; isArray: boolean; linkTargets: string[] }[]
    }[]) => {
      if (!types.length) return
      mark()

      // Start clear of existing content
      const existing = nodesRef.current
      const startX = existing.length
        ? Math.max(...existing.map((n) => n.position.x + (n.measured?.width ?? 220))) + 120
        : 0
      const startY = existing.length ? Math.min(...existing.map((n) => n.position.y)) : 0

      const COLS = 3
      const COL_W = 260
      const ROW_H = 320

      // cmaId -> new node id, so edges can be wired after all nodes exist
      const idMap = new Map<string, string>()
      // cmaId -> field cmaId -> generated field id, for edge source handles
      const fieldMap = new Map<string, Map<string, string>>()

      const newNodes: Node[] = types.map((t, i) => {
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
          }
        })
        fieldMap.set(t.cmaId, fieldIds)

        return {
          id: nodeId,
          type: 'contentType',
          position: {
            x: startX + (i % COLS) * COL_W,
            y: startY + Math.floor(i / COLS) * ROW_H,
          },
          data: makeContentTypeData(t.name, fields) as unknown as Record<string, unknown>,
        }
      })

      const newEdges: Edge[] = []
      for (const t of types) {
        const sourceId = idMap.get(t.cmaId)!
        const fieldIds = fieldMap.get(t.cmaId)!
        for (const f of t.fields) {
          for (const target of f.linkTargets) {
            const targetId = idMap.get(target)
            if (!targetId) continue
            newEdges.push({
              id: `e-${sourceId}-${fieldIds.get(f.cmaId)}-${targetId}`,
              source: sourceId,
              target: targetId,
              sourceHandle: `field-${fieldIds.get(f.cmaId)}`,
              animated: false,
              style: { stroke: '#0891B2', strokeWidth: 2 },
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
      if (!p) return
      const pos = screenToFlowRef.current?.({ x: e.clientX, y: e.clientY })
      if (!pos) return
      // Keep React Flow from starting a node drag or selection from this press
      e.preventDefault()
      e.stopPropagation()
      if (p.type === 'contentType') placeContentTypeAt(p.name, pos)
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
  }, [isPlacing, placeContentTypeAt, placeImageAt])

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
    return { nodes: exportNodes, edges: exportEdges }
  }, [nodes, edges])

  // Empties the open project only. Images referenced by other projects are
  // left alone; the blob cleanup effect removes whatever is now unreferenced.
  const clearBoard = useCallback(() => {
    mark()
    setNodes([])
    setEdges([])
  }, [setNodes, setEdges])

  useEffect(() => {
    onReady({ addContentType, addImageNode, clearBoard, getExportData, importContentTypes })
  }, [onReady, addContentType, addImageNode, clearBoard, getExportData, importContentTypes])

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
          const { onAddField, onDeleteField, onCopyField, onPasteField, onDropField, onReorderField, onRenameType, onDeleteType, hasClipboard, ...rest } =
            n.data as unknown as ContentTypeNodeData
          void onAddField; void onDeleteField; void onCopyField; void onPasteField; void onDropField; void onReorderField; void onRenameType; void onDeleteType; void hasClipboard
          return { ...n, data: rest }
        }
        if (n.type === 'image') {
          const { onDelete, imageUrl, ...rest } = n.data as unknown as ImageNodeData
          void onDelete; void imageUrl
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
        return n
      }),
    [makeContentTypeData, handleDeleteImage]
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
  }, [projectId, makeContentTypeData, handleDeleteImage, setNodes, setEdges, serializeNodes])

  // Delete selected nodes/edges.
  //
  // Handled here rather than via React Flow's `deleteKeyCode` for two reasons:
  // on macOS the key labelled "delete" reports as Backspace (forward-delete is
  // Fn+Delete), and doing it ourselves guarantees the shortcut can never fire
  // while a text field has focus, so backspacing in a name field edits text
  // instead of destroying the selection.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
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

  const placementData = placementRef.current

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', cursor: isPlacing ? 'crosshair' : 'default' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
          {placementData.type === 'contentType' ? (
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
