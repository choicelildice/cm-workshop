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

export const SHARE_PREFIX = '#p='
/** Above this, browsers and chat clients start truncating links. */
export const URL_WARN_LENGTH = 8000

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

async function gunzip(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  // Copy into a fresh ArrayBuffer-backed view: the stream types require
  // ArrayBuffer specifically, not the wider ArrayBufferLike.
  const buf = new Uint8Array(bytes.length)
  buf.set(bytes)
  writer.write(buf)
  writer.close()
  return new Response(ds.readable).text()
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
  return toBase64Url(await gzip(JSON.stringify(payload)))
}

export async function decodeShare(encoded: string): Promise<SharePayload> {
  const json = await gunzip(fromBase64Url(encoded))
  const parsed = JSON.parse(json) as SharePayload
  if (parsed?.v !== 1 || !Array.isArray(parsed.nodes)) {
    throw new Error('This link was made by a different version of the app.')
  }
  return parsed
}

/** Reads and clears a shared board from the current URL, if there is one. */
export function readShareFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (!hash.startsWith(SHARE_PREFIX)) return null
  return hash.slice(SHARE_PREFIX.length)
}

export function clearShareFromUrl(): void {
  if (typeof window === 'undefined') return
  window.history.replaceState({}, '', window.location.pathname + window.location.search)
}
