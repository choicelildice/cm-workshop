import { cookies } from 'next/headers'
import { AUTH_COOKIE, tokenIsValid } from '@/lib/auth'

/** Same gate as the page, so the routes can't be called around the login. */
export async function requireAuth(): Promise<Response | null> {
  const store = await cookies()
  if (!tokenIsValid(store.get(AUTH_COOKIE)?.value)) {
    return new Response(JSON.stringify({ error: 'Not authorised' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}
