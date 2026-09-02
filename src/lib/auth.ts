import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE = 'cmw-auth'
/** Cookie lifetime. Long enough not to nag during a workshop. */
const MAX_AGE = 60 * 60 * 24 * 30

/**
 * Server-only gate. The password lives in the APP_PASSWORD env var and is never
 * shipped to the client; the browser only ever holds an HMAC of it, so the
 * cookie cannot be reversed into the password.
 */
function secret(): string {
  return process.env.APP_PASSWORD ?? ''
}

/** Set when no password is configured, in which case the app stays open. */
export function isAuthConfigured(): boolean {
  return secret().length > 0
}

function tokenFor(password: string): string {
  // Salted with a fixed label so the token isn't a bare hash of the password
  return createHmac('sha256', password).update('cm-workshop-session-v1').digest('hex')
}

export function expectedToken(): string {
  return tokenFor(secret())
}

/** Constant-time compare, so response timing can't leak the token. */
export function tokenIsValid(candidate: string | undefined): boolean {
  if (!isAuthConfigured()) return true
  if (!candidate) return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(expectedToken())
  return a.length === b.length && timingSafeEqual(a, b)
}

export function passwordIsValid(candidate: string): boolean {
  const expected = secret()
  if (!expected) return true
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const AUTH_COOKIE = COOKIE
export const AUTH_MAX_AGE = MAX_AGE
