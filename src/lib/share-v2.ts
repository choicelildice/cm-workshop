/**
 * Compact board encoding for share links.
 *
 * v1 serialised the board as-is, which meant UUIDs — a third of the payload,
 * and incompressible because they are random hex. A full customer space came to
 * ~31,000 characters of URL, past what chat clients and some browsers tolerate.
 *
 * v2 replaces every id with an array index, so edges become
 * [sourceIndex, fieldIndex, targetIndex]. Positions round to integers, flags
 * pack into one number, field types become indices into a fixed list, and
 * derived edge styling is dropped because the app regenerates it. An 84-type
 * space lands at roughly 1,300 characters.
 *
 * Ids are regenerated on decode. They only need to be internally consistent,
 * never to match the sender's.
 */

import { FIELD_TYPE_IDS, migrateFieldType } from './field-type-meta'
import type { FieldType } from './types'

/** Field type order is part of the wire format: append only, never reorder. */
const TYPE_ORDER: FieldType[] = [...FIELD_TYPE_IDS]

/** Kind order likewise. Index 0 means no kind. */
const KIND_ORDER = ['', 'topic', 'assembly', 'config'] as const

const REQUIRED = 1
const IS_ARRAY = 2
const LOCALIZED = 4

/** [name, typeIndex, flags] */
type WireField = [string, number, number]
/** [x, y, label, kindIndex, emoji, fields] */
type WireType = [number, number, string, number, string, WireField[]]
/** [x, y, w, h, text, color] */
type WireSticky = [number, number, number, number, string, string]
/** [sourceTypeIndex, fieldIndex | null, targetTypeIndex] */
type WireEdge = [number, number | null, number]

export interface WirePayloadV2 {
  v: 2
  /** Board name. */
  n: string
  /** Content types. */
  t: WireType[]
  /** Sticky notes. */
  s: WireSticky[]
  /** Edges. */
  e: WireEdge[]
}

interface BoardNode {
  id: string
  type?: string
  width?: number
  height?: number
  position: { x: number; y: number }
  data: Record<string, unknown>
}

interface BoardEdge {
  source: string
  target: string
  sourceHandle?: string | null
}

export function encodeV2(name: string, nodes: unknown[], edges: unknown[]): WirePayloadV2 {
  const ns = nodes as BoardNode[]
  const cts = ns.filter((n) => n.type === 'contentType')
  const stickies = ns.filter((n) => n.type === 'sticky')

  // Node id -> index, and field id -> [typeIndex, fieldIndex]
  const typeIndex = new Map<string, number>()
  const fieldIndex = new Map<string, number>()
  cts.forEach((n, i) => {
    typeIndex.set(n.id, i)
    const fields = (n.data.fields as { id: string }[] | undefined) ?? []
    fields.forEach((f, j) => fieldIndex.set(f.id, j))
  })

  const t: WireType[] = cts.map((n) => {
    const d = n.data as {
      label?: string
      kind?: string
      emoji?: string
      fields?: { name: string; type: string; required?: boolean; isArray?: boolean; localized?: boolean }[]
    }
    const fields: WireField[] = (d.fields ?? []).map((f) => {
      const ti = TYPE_ORDER.indexOf(migrateFieldType(f.type))
      const flags =
        (f.required ? REQUIRED : 0) | (f.isArray ? IS_ARRAY : 0) | (f.localized ? LOCALIZED : 0)
      return [f.name ?? '', ti === -1 ? 0 : ti, flags]
    })
    const ki = KIND_ORDER.indexOf((d.kind ?? '') as (typeof KIND_ORDER)[number])
    return [
      Math.round(n.position.x),
      Math.round(n.position.y),
      d.label ?? 'Untitled',
      ki === -1 ? 0 : ki,
      d.emoji ?? '',
      fields,
    ]
  })

  const s: WireSticky[] = stickies.map((n) => {
    const d = n.data as { text?: string; color?: string }
    return [
      Math.round(n.position.x),
      Math.round(n.position.y),
      Math.round(n.width ?? 200),
      Math.round(n.height ?? 200),
      d.text ?? '',
      d.color ?? '',
    ]
  })

  const e: WireEdge[] = []
  for (const raw of edges as BoardEdge[]) {
    const si = typeIndex.get(raw.source)
    const ti = typeIndex.get(raw.target)
    // Edges touching anything that isn't an exported content type are dropped
    if (si === undefined || ti === undefined) continue
    const handle = raw.sourceHandle?.replace(/^field-/, '')
    const fi = handle !== undefined ? fieldIndex.get(handle) : undefined
    e.push([si, fi ?? null, ti])
  }

  return { v: 2, n: name, t, s, e }
}

/** Rebuilt board, with fresh ids. */
export interface DecodedBoard {
  name: string
  nodes: unknown[]
  edges: unknown[]
}

const isArr = (v: unknown): v is unknown[] => Array.isArray(v)
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/**
 * Rebuilds a board from the wire format.
 *
 * Every value is checked, since the payload is attacker-supplied: a hostile
 * link must not be able to introduce a field type the canvas can't render or an
 * edge pointing at a node that doesn't exist.
 */
export function decodeV2(payload: unknown, newId: () => string): DecodedBoard {
  const p = payload as Partial<WirePayloadV2>
  if (!isArr(p.t)) throw new Error('This link doesn’t contain a readable board.')

  const typeIds: string[] = []
  const fieldIds: string[][] = []

  const nodes: unknown[] = []

  for (const raw of p.t) {
    if (!isArr(raw)) continue
    const [x, y, label, kindIdx, emoji, rawFields] = raw as WireType

    const nodeId = newId()
    const perField: string[] = []

    const fields = (isArr(rawFields) ? rawFields : []).flatMap((rf) => {
      if (!isArr(rf)) return []
      const [name, ti, flags] = rf as WireField
      const fid = newId()
      perField.push(fid)
      const type = TYPE_ORDER[num(ti, 0)] ?? 'text'
      const fl = num(flags, 0)
      return [
        {
          id: fid,
          name: str(name, 'field'),
          type,
          required: (fl & REQUIRED) !== 0,
          isArray: (fl & IS_ARRAY) !== 0,
          localized: (fl & LOCALIZED) !== 0,
        },
      ]
    })

    typeIds.push(nodeId)
    fieldIds.push(perField)

    const kind = KIND_ORDER[num(kindIdx, 0)] || undefined
    nodes.push({
      id: nodeId,
      type: 'contentType',
      position: { x: num(x), y: num(y) },
      data: {
        label: str(label, 'Untitled'),
        kind,
        // One code point only: a multi-byte emoji must not be sliced in half
        emoji: str(emoji) ? [...str(emoji)][0] : undefined,
        fields,
      },
    })
  }

  for (const raw of isArr(p.s) ? p.s : []) {
    if (!isArr(raw)) continue
    const [x, y, w, h, text, color] = raw as WireSticky
    nodes.push({
      id: newId(),
      type: 'sticky',
      position: { x: num(x), y: num(y) },
      width: num(w, 200),
      height: num(h, 200),
      data: { text: str(text), color: str(color) || undefined },
    })
  }

  const edges: unknown[] = []
  for (const raw of isArr(p.e) ? p.e : []) {
    if (!isArr(raw)) continue
    const [si, fi, ti] = raw as WireEdge
    const source = typeIds[num(si, -1)]
    const target = typeIds[num(ti, -1)]
    if (!source || !target) continue

    const handleId = fi === null || fi === undefined ? undefined : fieldIds[num(si, -1)]?.[num(fi, -1)]

    edges.push({
      id: `e-${source}-${handleId ?? 'x'}-${target}`,
      source,
      target,
      sourceHandle: handleId ? `field-${handleId}` : null,
      animated: false,
      style: { stroke: '#0891B2', strokeWidth: 2 },
    })
  }

  if (nodes.length === 0) throw new Error('This link doesn’t contain a readable board.')

  return { name: str(p.n, 'Shared board').slice(0, 120), nodes, edges }
}
