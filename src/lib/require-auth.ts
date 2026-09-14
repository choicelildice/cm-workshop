import { cookies } from 'next/headers'
import { AUTH_COOKIE, tokenIsValid } from '@/lib/auth'

const deny = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Same gate as the page, so the routes can't be called around the login. */
export async function requireAuth(): Promise<Response | null> {
  let ok: boolean
  try {
    const store = await cookies()
    ok = tokenIsValid(store.get(AUTH_COOKIE)?.value)
  } catch (err) {
    // isAuthConfigured throws in production when APP_PASSWORD is missing.
    // Deny rather than letting the throw fall through to the route's own
    // try/catch, which would report it as a generic export failure.
    return deny(503, err instanceof Error ? err.message : 'Auth is misconfigured')
  }
  return ok ? null : deny(401, 'Not authorised')
}
