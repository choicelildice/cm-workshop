import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE = 'cmw-auth'
/** Session lifetime. Long enough not to nag during a workshop. */
const MAX_AGE = 60 * 60 * 24 * 30

export interface AccessCode {
  /** Who this code was issued to, for revoking and for logging. Never secret. */
  label: string
  code: string
}

/**
 * Server-only access gate.
 *
 * `APP_PASSWORD` accepts either a single password:
 *
 *     APP_PASSWORD=x7Kp2mQ…
 *
 * or a comma-separated list of `label:code` pairs, so each customer or team can
 * be given their own code and revoked independently:
 *
 *     APP_PASSWORD=acme:x7Kp2m…,globex:9Fq4tR…,internal:aB8sN…
 *
 * Revoking is deleting one entry and redeploying, which invalidates only that
 * audience's sessions. Labels appear in the session cookie (so the server knows
 * which code was used) but the codes themselves never reach the client.
 *
 * Codes should be long and random. The session cookie is derived by HMAC, which
 * resists inversion but not guessing, so a dictionary word offers little real
 * protection.
 */
function rawSetting(): string {
  return (process.env.APP_PASSWORD ?? '').trim()
}

/**
 * Secret used to sign session cookies. Falling back to APP_PASSWORD keeps
 * single-password deployments working with no extra configuration, but setting
 * SESSION_SECRET is better: it decouples the cookie from the access codes, so a
 * captured cookie cannot be attacked offline to recover a code, and rotating a
 * code doesn't have to invalidate unrelated sessions.
 */
function signingSecret(): string {
  return process.env.SESSION_SECRET?.trim() || rawSetting()
}

/**
 * Parses the access code setting.
 *
 * Entries may be separated by newlines, commas, or both, so the value can be
 * kept in a readable one-per-line form in a password manager and pasted
 * straight in. `#` starts a comment, which makes it practical to record who a
 * code was issued to and when:
 *
 *     acme:x7Kp2m…      # Acme Corp, issued 2026-09-15
 *     internal:9Fq4tR…  # us
 */
export function parseAccessCodes(setting: string): AccessCode[] {
  if (!setting) return []
  return setting
    .split(/\r?\n/)
    // Strip each line's comment FIRST. Splitting on separators before doing so
    // would let a comma inside a comment ("# Acme, 2026-09-15") break the line
    // in two and turn the rest of the note into a valid access code.
    .map((line) => line.split('#')[0])
    // Commas still separate entries, so a single-line value keeps working
    .flatMap((line) => line.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      // Split on the FIRST colon only, so a code may itself contain colons
      const at = entry.indexOf(':')
      if (at === -1) return { label: 'default', code: entry }
      const label = entry.slice(0, at).trim()
      const code = entry.slice(at + 1).trim()
      // A trailing-colon entry ("acme:") has no code and would otherwise
      // authorise the empty string
      if (!code) return null
      return { label: label || 'default', code }
    })
    .filter((v): v is AccessCode => v !== null)
}

export function accessCodes(): AccessCode[] {
  return parseAccessCodes(rawSetting())
}

/**
 * Explicit opt-in for running with no gate. Without this, production refuses to
 * serve rather than silently going public.
 */
function noPasswordAllowed(): boolean {
  return process.env.ALLOW_NO_PASSWORD === '1'
}

/**
 * Whether an access gate is active.
 *
 * Fails CLOSED in production: a missing or misspelled APP_PASSWORD would
 * otherwise open the app and every API route to the internet with no warning
 * anywhere. Locally it stays open, which is the useful default for development.
 */
export function isAuthConfigured(): boolean {
  if (accessCodes().length > 0) return true
  if (process.env.NODE_ENV === 'production' && !noPasswordAllowed()) {
    throw new Error(
      'APP_PASSWORD is not set. Set it in your hosting environment, or set ' +
        'ALLOW_NO_PASSWORD=1 to deliberately run without an access gate.'
    )
  }
  return false
}

function sign(payload: string): string {
  return createHmac('sha256', signingSecret()).update(payload).digest('hex')
}

/** Timing-safe string compare. Length is compared first, as timingSafeEqual requires equal lengths. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/**
 * Cookie value: `label.expiresAt.signature`.
 *
 * The expiry is inside the signed payload rather than relying on the cookie's
 * own maxAge, which is only a hint the browser may ignore. So a captured cookie
 * stops working on a deadline the server enforces.
 */
export function issueToken(label: string, now = Date.now()): string {
  const expiresAt = now + MAX_AGE * 1000
  const payload = `${label}.${expiresAt}`
  return `${payload}.${sign(payload)}`
}

export interface SessionInfo {
  label: string
  expiresAt: number
}

/** Returns the session if the cookie is authentic and unexpired, else null. */
export function readToken(candidate: string | undefined, now = Date.now()): SessionInfo | null {
  if (!candidate) return null
  const at = candidate.lastIndexOf('.')
  if (at === -1) return null

  const payload = candidate.slice(0, at)
  const signature = candidate.slice(at + 1)
  if (!safeEqual(signature, sign(payload))) return null

  const dot = payload.lastIndexOf('.')
  if (dot === -1) return null
  const label = payload.slice(0, dot)
  const expiresAt = Number(payload.slice(dot + 1))
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null

  // A revoked label must stop working even while its cookie is unexpired
  const codes = accessCodes()
  if (codes.length > 0 && !codes.some((c) => c.label === label)) return null

  return { label, expiresAt }
}

export function tokenIsValid(candidate: string | undefined): boolean {
  if (!isAuthConfigured()) return true
  return readToken(candidate) !== null
}

/**
 * Checks a submitted code against every configured one, returning the matching
 * label. Every code is compared even after a match so the work is constant
 * regardless of which entry matched or how many are configured.
 */
export function matchAccessCode(candidate: string): string | null {
  const codes = accessCodes()
  if (codes.length === 0) return 'default'

  let matched: string | null = null
  for (const { label, code } of codes) {
    if (safeEqual(candidate, code) && matched === null) matched = label
  }
  return matched
}

export const AUTH_COOKIE = COOKIE
export const AUTH_MAX_AGE = MAX_AGE
