/**
 * Share a board by encoding it into the URL fragment.
 *
 * The fragment (`#p=…`) is deliberate rather than a query string: fragments are
 * never sent to the server, so a shared model never lands in Vercel's request
 * logs, and no length limit from server header caps applies. Gzip gets a
 * realistic 12-type board to roughly 1.5KB of URL.
 *
 * There is no backend, so a link is a self-contained snapshot: opening one
 * copies the board into the recipient's browser. It does not stay in sync.
 */

import { isFieldType, migrateFieldType } from './field-type-meta'
import { decodeV2, encodeV2 } from './share-v2'

export const SHARE_PREFIX = '#p='
/** A blob-backed link carries only its id, in this query param. */
export const SHARE_BLOB_PARAM = 's'
/**
 * Above this, some chat clients and email clients start mangling links. With
 * the compact v2 format even a 200-type space lands near 2,800 characters, so
 * reaching this now means something unusual.
 */
export const URL_WARN_LENGTH = 12000
/**
 * Hard caps on untrusted input. A realistic board is ~1.5KB encoded, so 64KB is
 * generous, and both limits together make a zip bomb (gzip reaches ~1000:1)
 * unable to exhaust memory. Also the request-body cap for /api/share.
 */
export const MAX_ENCODED_LENGTH = 64 * 1024
const MAX_DECODED_BYTES = 4 * 1024 * 1024

export interface SharePayload {
  /** Schema version, so a future format change can be detected not misread. */
  v: 1
  name: string
  nodes: unknown[]
  edges: unknown[]
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function gzip(str: string): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(new TextEncoder().encode(str))
  writer.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}

/**
 * Decompresses with a hard output cap, read chunk by chunk so a zip bomb is
 * abandoned partway rather than being buffered whole and OOMing the tab.
 */
async function gunzip(bytes: Uint8Array, maxBytes: number): Promise<string> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  // Copy into a fresh ArrayBuffer-backed view: the stream types require
  // ArrayBuffer specifically, not the wider ArrayBufferLike.
  const buf = new Uint8Array(bytes.length)
  buf.set(bytes)
  // Cancelling the reader below rejects these, which would surface as an
  // unhandled rejection alongside the error we throw deliberately.
  writer.write(buf).catch(() => {})
  writer.close().catch(() => {})

  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new Error('This link is too large to open safely.')
    }
    chunks.push(value)
  }

  const joined = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { joined.set(c, at); at += c.byteLength }
  return new TextDecoder().decode(joined)
}

/**
 * Image nodes are dropped: the blobs live in IndexedDB and are megabytes of
 * base64 each, which no URL can carry. Returns the count so the UI can say so
 * rather than silently losing them.
 */
export function stripUnshareable(nodes: unknown[]): { nodes: unknown[]; droppedImages: number } {
  const kept = nodes.filter((n) => (n as { type?: string }).type !== 'image')
  return { nodes: kept, droppedImages: nodes.length - kept.length }
}

export async function encodeShare(payload: SharePayload): Promise<string> {
  // v2: ids become array indices, which removes the UUIDs that dominated v1 and
  // are incompressible. A full customer space goes from ~31k characters to ~1.3k.
  const wire = encodeV2(payload.name, payload.nodes, payload.edges)
  return toBase64Url(await gzip(JSON.stringify(wire)))
}

/**
 * Large models (100+ types with a dense reference graph) still overflow even
 * the compact v2 fragment. Past this point the encoded string is uploaded to
 * blob storage instead, and the link carries a URL to it rather than the data
 * itself. Chosen well under URL_WARN_LENGTH so the fragment path never gets
 * close enough to matter in practice.
 */
export const BLOB_FALLBACK_LENGTH = 6000

export interface ShareLink {
  url: string
  /** Whether the model had to be stored server-side rather than fitting in the link itself. */
  usedBlobStorage: boolean
}

/**
 * Builds the link to share, uploading to blob storage first when the encoded
 * board is too large for a fragment. The upload is a private blob — readable
 * only through this app's own login-gated /api/share route, not by anyone who
 * happens to obtain the storage URL by other means.
 */
export async function buildShareUrl(encoded: string): Promise<ShareLink> {
  const base = `${window.location.origin}${window.location.pathname}`
  if (encoded.length <= BLOB_FALLBACK_LENGTH) {
    return { url: `${base}${SHARE_PREFIX}${encoded}`, usedBlobStorage: false }
  }

  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: encoded,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.error || 'Could not store this model for sharing.')
  }
  const { id } = (await res.json()) as { id: string }
  return { url: `${base}?${SHARE_BLOB_PARAM}=${id}`, usedBlobStorage: true }
}

/** Node types the canvas can render. Anything else is dropped on import. */
const KNOWN_NODE_TYPES = new Set(['contentType', 'image', 'sticky'])

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/**
 * Rebuilds a node from untrusted input, keeping only known keys with checked
 * types. Anything unrecognised is dropped rather than trusted, so a crafted
 * link cannot introduce a field type or node shape the canvas can't render.
 */
function sanitizeNode(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null
  const type = raw.type
  if (typeof type !== 'string' || !KNOWN_NODE_TYPES.has(type)) return null
  if (typeof raw.id !== 'string' || !raw.id) return null

  const pos = isPlainObject(raw.position) ? raw.position : {}
  const data = isPlainObject(raw.data) ? raw.data : {}

  const node: Record<string, unknown> = {
    id: raw.id,
    type,
    position: { x: num(pos.x, 0), y: num(pos.y, 0) },
  }

  if (type === 'contentType') {
    const fields = Array.isArray(data.fields) ? data.fields : []
    node.data = {
      label: typeof data.label === 'string' ? data.label : 'Untitled',
      kind: typeof data.kind === 'string' ? data.kind : undefined,
      emoji: typeof data.emoji === 'string' ? [...data.emoji][0] : undefined,
      fields: fields.flatMap((f) => {
        if (!isPlainObject(f) || typeof f.id !== 'string') return []
        return [{
          id: f.id,
          name: typeof f.name === 'string' ? f.name : 'field',
          // Validated against the real ids, so an inherited property name
          // like "constructor" can never reach the icon lookup
          type: isFieldType(f.type) ? f.type : migrateFieldType(String(f.type ?? '')),
          required: f.required === true,
          isArray: f.isArray === true,
          localized: f.localized === true,
        }]
      }),
    }
  } else if (type === 'sticky') {
    node.width = num(raw.width, 200)
    node.height = num(raw.height, 200)
    node.data = {
      text: typeof data.text === 'string' ? data.text : '',
      color: typeof data.color === 'string' ? data.color : undefined,
    }
  } else {
    // Image nodes are never shared, but tolerate one appearing: imageUrl is
    // always re-read from IndexedDB by id, so no attacker value can reach an
    // <img src>.
    node.data = { label: typeof data.label === 'string' ? data.label : 'image' }
  }

  return node
}

function sanitizeEdge(raw: unknown, nodeIds: Set<string>): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null
  const { id, source, target, sourceHandle } = raw
  if (typeof id !== 'string' || typeof source !== 'string' || typeof target !== 'string') return null
  // Drop edges pointing at nodes that aren't in the payload
  if (!nodeIds.has(source) || !nodeIds.has(target)) return null
  return {
    id,
    source,
    target,
    sourceHandle: typeof sourceHandle === 'string' ? sourceHandle : null,
    animated: false,
    style: { stroke: '#0891B2', strokeWidth: 2 },
  }
}

export async function decodeShare(encoded: string): Promise<SharePayload> {
  // Cap the input before decompressing. gzip reaches ~1000:1, so an
  // unbounded fragment could expand to gigabytes and kill the tab.
  if (encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error('This link is too large to open safely.')
  }

  const json = await gunzip(fromBase64Url(encoded), MAX_DECODED_BYTES)
  const parsed = JSON.parse(json) as unknown

  if (!isPlainObject(parsed)) {
    throw new Error('This link was made by a different version of the app.')
  }

  // v2 is the compact format. v1 is still decoded so links already sent keep
  // working — a shared link is out of our hands once it is sent.
  if (parsed.v === 2) {
    const board = decodeV2(parsed, () => crypto.randomUUID())
    return { v: 1, name: board.name, nodes: board.nodes, edges: board.edges }
  }

  if (parsed.v !== 1 || !Array.isArray(parsed.nodes)) {
    throw new Error('This link was made by a different version of the app.')
  }

  const nodes = parsed.nodes.map(sanitizeNode).filter((n): n is Record<string, unknown> => !!n)
  const nodeIds = new Set(nodes.map((n) => n.id as string))
  const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : []
  const edges = rawEdges
    .map((e) => sanitizeEdge(e, nodeIds))
    .filter((e): e is Record<string, unknown> => !!e)

  if (nodes.length === 0) {
    throw new Error('This link doesn\u2019t contain a readable board.')
  }

  return {
    v: 1,
    name: typeof parsed.name === 'string' ? parsed.name.slice(0, 120) : 'Shared board',
    nodes,
    edges,
  }
}

/**
 * Reads a shared board's encoded payload from the current URL, if there is
 * one — either inline in the fragment, or fetched through /api/share when the
 * link used the `?s=` fallback. That route re-checks the session cookie, so a
 * recipient with a valid link still needs a valid login, same as every other
 * board operation.
 */
export async function readShareFromUrl(): Promise<string | null> {
  if (typeof window === 'undefined') return null

  const hash = window.location.hash
  if (hash.startsWith(SHARE_PREFIX)) return hash.slice(SHARE_PREFIX.length)

  const id = new URLSearchParams(window.location.search).get(SHARE_BLOB_PARAM)
  if (!id) return null

  const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error('This link has expired or no longer exists.')
  return res.text()
}

export function clearShareFromUrl(): void {
  if (typeof window === 'undefined') return
  window.history.replaceState({}, '', window.location.pathname)
}
