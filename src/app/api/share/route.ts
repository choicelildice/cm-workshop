import { NextRequest, NextResponse } from 'next/server'
import { get, put } from '@vercel/blob'
import { requireAuth } from '@/lib/require-auth'
import { MAX_ENCODED_LENGTH } from '@/lib/share'

/** Only this shape is ever read back, so a crafted id can't reach another pathname. */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Fallback for share links too long for a URL fragment (large content models,
 * dense reference graphs). The same gzip+base64url payload the fragment would
 * carry is stored instead, and the link carries only its blob id.
 *
 * The blob is private, not public: a public blob would be fetchable by
 * anyone who obtained the URL through any means (a log line, a proxy, a
 * shared screenshot) with no login required at all, which is weaker than
 * every other route in this app. Reads go through GET below instead, behind
 * the same session cookie as the rest of the API.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAuth()
  if (denied) return denied

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'Long-link storage isn’t set up on this deployment yet.' },
      { status: 503 }
    )
  }

  const body = await req.text()
  if (!body || body.length > MAX_ENCODED_LENGTH) {
    return NextResponse.json({ error: 'Nothing to store, or the payload is too large.' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  await put(`shares/${id}.txt`, body, {
    access: 'private',
    contentType: 'text/plain',
    addRandomSuffix: false,
  })

  return NextResponse.json({ id })
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth()
  if (denied) return denied

  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Not a valid link.' }, { status: 400 })
  }

  const result = await get(`shares/${id}.txt`, { access: 'private' }).catch(() => null)
  if (!result) {
    return NextResponse.json({ error: 'This link has expired or no longer exists.' }, { status: 404 })
  }

  return new NextResponse(result.stream, {
    headers: { 'Content-Type': 'text/plain' },
  })
}
