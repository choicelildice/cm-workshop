import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const cookieStore = await cookies()
  const clientId = cookieStore.get('miro-client-id')?.value
  const clientSecret = cookieStore.get('miro-client-secret')?.value
  const redirectUri = cookieStore.get('miro-redirect-uri')?.value

  // Fixed codes in the fragment, never the upstream error body: a query param
  // would be logged, and echoing an upstream body risks leaking request detail.
  // Nothing reads this yet; it exists so a failed connect doesn't look like a
  // silent success.
  const fail = (code: 'auth_incomplete' | 'token_exchange_failed') => {
    const dest = new URL('/', req.nextUrl.origin)
    dest.hash = `miro_error=${code}`
    return NextResponse.redirect(dest)
  }

  if (!code || !clientId || !clientSecret || !redirectUri) return fail('auth_incomplete')

  try {
    const tokenRes = await fetch('https://api.miro.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) throw new Error(await tokenRes.text())
    const { access_token } = await tokenRes.json()

    // Pass the token back in the FRAGMENT, not a query param. A query param
    // means the browser makes a real request carrying the token, so it lands in
    // the server's request logs; fragments are never sent to the server.
    // WorkshopApp reads it from location.hash and clears it.
    const dest = new URL('/', req.nextUrl.origin)
    dest.hash = `miro_token=${encodeURIComponent(access_token)}`

    const res = NextResponse.redirect(dest)
    res.cookies.delete('miro-client-id')
    res.cookies.delete('miro-client-secret')
    res.cookies.delete('miro-redirect-uri')
    return res
  } catch {
    return fail('token_exchange_failed')
  }
}
