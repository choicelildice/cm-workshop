import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE = 'cmw-auth'
/** Cookie lifetime. Long enough not to nag during a workshop. */
const MAX_AGE = 60 * 60 * 24 * 30

/**
 * Server-only gate. The password lives in the APP_PASSWORD env var and is never
 * shipped to the client.
 *
 * Note on the cookie: it holds an HMAC keyed by the password over a fixed
 * label. That resists *inversion*, but not guessing — anyone holding a cookie
 * value can dictionary-attack it offline at full hashing speed, and the fixed
 * label means one precomputed table works against every deployment. So the
 * cookie is only as strong as the password is unguessable. Use a long random
 * value, not a word.
 */
function secret(): string {
  return process.env.APP_PASSWORD ?? ''
}

/**
 * Explicit opt-in for running with no password. Without this, production
 * refuses to serve rather than silently going public.
 */
function noPasswordAllowed(): boolean {
  return process.env.ALLOW_NO_PASSWORD === '1'
}

/**
 * Whether a password gate is active.
 *
 * Fails CLOSED in production: a missing or misspelled APP_PASSWORD would
 * otherwise open the app and every API route to the internet with no warning
 * anywhere. Locally it stays open, which is the useful default for development.
 */
export function isAuthConfigured(): boolean {
  if (secret().length > 0) return true
  if (process.env.NODE_ENV === 'production' && !noPasswordAllowed()) {
    throw new Error(
      'APP_PASSWORD is not set. Set it in your hosting environment, or set ' +
        'ALLOW_NO_PASSWORD=1 to deliberately run without a password gate.'
    )
  }
  return false
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
