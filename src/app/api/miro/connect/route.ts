import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
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

  // Stash credentials in short-lived cookies for the callback to use
  const opts = { httpOnly: true, maxAge: 600, path: '/' } as const
  res.cookies.set('miro-client-id', clientId, opts)
  res.cookies.set('miro-client-secret', clientSecret, opts)
  res.cookies.set('miro-redirect-uri', redirectUri, opts)
  return res
}
