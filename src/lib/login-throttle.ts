/**
 * In-memory login throttle, keyed by IP.
 *
 * Honest about what this is: serverless instances are per-region and recycled,
 * so a determined attacker can get more attempts than the nominal limit by
 * spreading requests out or across regions. It is not a substitute for a
 * platform rate-limit rule (Vercel Firewall, Cloudflare) or for a long random
 * access code.
 *
 * What it does buy: a naive wordlist run from one host against one instance
 * stops after a handful of tries instead of proceeding at full speed. That is
 * the realistic threat for an unlisted URL, and it costs nothing to run.
 */

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8
/** Cap the map so a spray of forged IPs can't grow it without bound. */
const MAX_TRACKED_IPS = 5000

interface Bucket {
  count: number
  /** When the window started, so it can expire as a whole. */
  startedAt: number
}

const buckets = new Map<string, Bucket>()

function sweep(now: number): void {
  for (const [ip, b] of buckets) {
    if (now - b.startedAt > WINDOW_MS) buckets.delete(ip)
  }
}

export function registerAttempt(
  ip: string,
  now = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  if (buckets.size > MAX_TRACKED_IPS) sweep(now)

  const existing = buckets.get(ip)

  if (!existing || now - existing.startedAt > WINDOW_MS) {
    buckets.set(ip, { count: 1, startedAt: now })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  existing.count += 1

  if (existing.count > MAX_ATTEMPTS) {
    const elapsed = now - existing.startedAt
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000)),
    }
  }

  return { allowed: true, retryAfterSeconds: 0 }
}

/** Clears a bucket after a successful login, so one shared IP isn't punished. */
export function clearAttempts(ip: string): void {
  buckets.delete(ip)
}
