import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'

export async function POST(req: NextRequest) {
  const denied = await requireAuth()
  if (denied) return denied

  const { clientId, clientSecret } = await req.json()
  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/miro/callback`

  const res = NextResponse.json({
    authUrl:
      `https://miro.com/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('boards:read boards:write')}`,
  })

  // Stash credentials in short-lived cookies for the callback to use.
  // `secure` in production so they are never sent over plain HTTP; sameSite
  // 'lax' because the OAuth provider redirects back cross-site.
  const opts = {
    httpOnly: true,
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  } as const
  res.cookies.set('miro-client-id', clientId, opts)
  res.cookies.set('miro-client-secret', clientSecret, opts)
  res.cookies.set('miro-redirect-uri', redirectUri, opts)
  return res
}
