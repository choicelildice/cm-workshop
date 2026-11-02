import { migrateFieldType } from './field-type-meta'
import { DEFAULT_STICKY_COLOR } from './sticky-colors'
import type { ProjectData } from './projects'

/**
 * Did a board survive loading intact?
 *
 * The only copy of a board lives in the browser, and the app writes the
 * in-memory board back over it a few hundred milliseconds after any change.
 * A load that quietly drops a flag, a kind or a field would therefore be
 * persisted on the next save and the original gone. saveProjectData refuses
 * an empty board, but it cannot see a board that is merely incomplete. This
 * can.
 *
 * Canvas calls it right after a load with two things: the nodes exactly as
 * read from storage, and the freshly loaded nodes run through serializeNodes,
 * which is precisely what the next save would write. The two are compared
 * whole, every key, after the stored side has had the load path's known,
 * deliberate normalisations applied (see normalizeStoredNode). Any other
 * difference means the load changed or lost something, and saving for that
 * project is paused until the page is reloaded.
 *
 * Comparing whole objects rather than a list of known model keys matters
 * because this net exists ahead of a refactor of the node data shape, which
 * is exactly when new model keys appear. A key added next month and dropped
 * by a buggy load is caught here without anyone updating this file.
 *
 * What this cannot see: a lossy load whose loss is also added below as a
 * "known normalisation". Every entry in normalizeStoredNode is therefore a
 * deliberate statement that the load path changes stored data in that one
 * way on purpose, and each has a test in tests/load-integrity.test.ts.
 */

/**
 * A stored board, with edges optional. Reserved: the load path currently sets
 * edges from storage untouched, so there is nothing to compare and Canvas
 * passes nodes only. When loading starts transforming edges (migrating ids,
 * regenerating handles), pass the stored edges on one side and the loaded
 * edges on the other, and the comparison switches on. Omitted on either side
 * means "skip".
 */
export type Board = Pick<ProjectData, 'nodes'> & Partial<Pick<ProjectData, 'edges'>>

export interface IntegrityResult {
  ok: boolean
  /** Human-readable reason for the first difference, for the banner and the console. */
  detail?: string
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Keys that versions before serializeNodes existed wrote into a content
 * type's data, and that the load path drops on purpose: `kinds` is global
 * config re-injected from kind-config, `hasClipboard` is transient UI state.
 * Boards saved by those versions still carry them; dropping them is not loss.
 */
const LEGACY_TRANSIENT_DATA_KEYS = ['kinds', 'hasClipboard'] as const

/**
 * The stored node as the load path is MEANT to change it. This is the
 * complete list of deliberate normalisations; anything the load does beyond
 * these shows up as a difference.
 */
function normalizeStoredNode(raw: unknown): unknown {
  if (!isRec(raw)) return raw
  const node: Rec = { ...raw }
  const data: Rec = isRec(raw.data) ? { ...raw.data } : {}

  if (raw.type === 'contentType') {
    for (const k of LEGACY_TRANSIENT_DATA_KEYS) delete data[k]
    // Retired field type ids are remapped on load (migrateFieldType), and a
    // missing fields array reads as empty.
    const fields = Array.isArray(data.fields) ? data.fields : []
    data.fields = fields.map((f) => (isRec(f) ? { ...f, type: migrateFieldType(f.type as string) } : f))
  } else if (raw.type === 'sticky') {
    // Stickies saved before resizing existed get the default size, and ones
    // saved before colours existed get the default colour (makeStickyData).
    node.width = raw.width ?? 200
    node.height = raw.height ?? 200
    data.text = data.text ?? ''
    data.color = data.color ?? DEFAULT_STICKY_COLOR
  }
  // Image nodes: imageUrl is attached on load and stripped again by
  // serializeNodes, so the stored and serialised forms already match.

  node.data = data
  return node
}

/**
 * JSON with object keys sorted, so key order never counts as a difference.
 * JSON.stringify already drops undefined-valued keys, so absent and
 * explicitly-undefined compare equal too.
 */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (!isRec(val)) return val
    const out: Rec = {}
    for (const k of Object.keys(val).sort()) out[k] = val[k]
    return out
  })
}

const idOf = (n: unknown) => (isRec(n) && typeof n.id === 'string' ? n.id : '?')

export function checkLoadIntegrity(stored: Board, loaded: Board): IntegrityResult {
  if (stored.nodes.length !== loaded.nodes.length) {
    return { ok: false, detail: `stored ${stored.nodes.length} nodes, loaded ${loaded.nodes.length}` }
  }
  for (let i = 0; i < stored.nodes.length; i++) {
    if (stable(normalizeStoredNode(stored.nodes[i])) !== stable(loaded.nodes[i])) {
      return { ok: false, detail: `node ${idOf(stored.nodes[i])} differs after load` }
    }
  }
  if (stored.edges && loaded.edges) {
    if (stored.edges.length !== loaded.edges.length) {
      return { ok: false, detail: `stored ${stored.edges.length} edges, loaded ${loaded.edges.length}` }
    }
    for (let i = 0; i < stored.edges.length; i++) {
      if (stable(stored.edges[i]) !== stable(loaded.edges[i])) {
        return { ok: false, detail: `edge ${idOf(stored.edges[i])} differs after load` }
      }
    }
  }
  return { ok: true }
}
