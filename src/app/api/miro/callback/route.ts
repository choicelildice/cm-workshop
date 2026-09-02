import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const cookieStore = await cookies()
  const clientId = cookieStore.get('miro-client-id')?.value
  const clientSecret = cookieStore.get('miro-client-secret')?.value
  const redirectUri = cookieStore.get('miro-redirect-uri')?.value

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/?miro_error=${encodeURIComponent(msg)}`, req.nextUrl.origin))

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

    // Pass token back as a query param — page.tsx stores it in localStorage and removes it
    const dest = new URL('/', req.nextUrl.origin)
    dest.searchParams.set('miro_token', access_token)

    const res = NextResponse.redirect(dest)
    res.cookies.delete('miro-client-id')
    res.cookies.delete('miro-client-secret')
    res.cookies.delete('miro-redirect-uri')
    return res
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'token_exchange_failed')
  }
}
