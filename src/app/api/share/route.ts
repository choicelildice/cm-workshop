import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { requireAuth } from '@/lib/require-auth'
import { MAX_ENCODED_LENGTH } from '@/lib/share'

/**
 * Fallback for share links too long for a URL fragment (large content models,
 * dense reference graphs). The same gzip+base64url payload the fragment would
 * carry is stored instead, and the link carries only its blob id.
 *
 * Gated behind the same session cookie as every other API route: this must
 * not become a way to store arbitrary data for someone without a code.
 * Public-access blob (readable by anyone with the exact random URL) is fine —
 * a share link is meant to be openable by whoever receives it, same as the
 * fragment form, and the id is unguessable.
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

  const blob = await put(`shares/${crypto.randomUUID()}.txt`, body, {
    access: 'public',
    contentType: 'text/plain',
    addRandomSuffix: false,
  })

  return NextResponse.json({ url: blob.url })
}
