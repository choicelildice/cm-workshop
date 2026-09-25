/**
 * Structural comparison between two content types: which fields they share,
 * which differ in type/flags, and which are unique to one side.
 *
 * This is for the "do we actually need both of these?" question that comes up
 * in a model review — spotting near-duplicate types worth consolidating, or
 * two fields that are clearly the same thing named inconsistently
 * (`author` vs `authorRef`).
 */

import type { ContentField, FieldType } from './types'

export interface FieldPair {
  a: ContentField | null
  b: ContentField | null
  /** How confidently `a` and `b` were paired as "the same field". */
  match: 'exact' | 'fuzzy' | 'none'
  /** Set when both sides exist but disagree on type, list, or localization. */
  differs: {
    type: boolean
    isArray: boolean
    localized: boolean
  } | null
}

export interface TypeComparison {
  pairs: FieldPair[]
  /** Counts for the headline: "6 of 8 shared, 1 differs, 1 unique to each". */
  summary: {
    shared: number
    differs: number
    onlyA: number
    onlyB: number
  }
}

/** Lowercase, alphanumeric-only, so `Author`, `author_ref`, and `AuthorRef` compare fairly. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Levenshtein edit distance, iterative with a rolling two-row buffer rather
 * than a full matrix, since field name comparisons run in a tight loop (every
 * unmatched field on one side against every unmatched field on the other).
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  let curr = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/**
 * Similarity in [0, 1], 1 meaning identical. Normalised by the longer string's
 * length so short names aren't unfairly punished by a fixed edit-count
 * threshold (a 2-edit difference matters more on "id" than on "publishedAt").
 */
function similarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length)
  if (longer === 0) return 1
  return 1 - editDistance(a, b) / longer
}

/** Below this, two field names are treated as unrelated rather than a fuzzy match. */
const FUZZY_THRESHOLD = 0.6

function fieldDiffers(a: ContentField, b: ContentField): FieldPair['differs'] {
  const d = {
    type: a.type !== b.type,
    isArray: !!a.isArray !== !!b.isArray,
    localized: !!a.localized !== !!b.localized,
  }
  return d.type || d.isArray || d.localized ? d : null
}

/**
 * Pairs up fields between two content types.
 *
 * Two passes: exact matches on normalised name first (claiming both fields so
 * they can't also fuzzy-match something else), then a greedy best-similarity
 * pass over whatever remains. Greedy rather than optimal assignment (which
 * would need a matching algorithm) because field lists are small — tens, not
 * thousands — and a slightly suboptimal pairing here costs nothing but a
 * cosmetic mismatch in an edge case.
 */
export function compareContentTypes(fieldsA: ContentField[], fieldsB: ContentField[]): TypeComparison {
  const pairs: FieldPair[] = []
  const usedA = new Set<string>()
  const usedB = new Set<string>()

  // Pass 1: exact match on normalised name
  const normA = new Map(fieldsA.map((f) => [f.id, normalize(f.name)]))
  const normB = new Map(fieldsB.map((f) => [f.id, normalize(f.name)]))

  for (const a of fieldsA) {
    const b = fieldsB.find((f) => !usedB.has(f.id) && normB.get(f.id) === normA.get(a.id))
    if (b) {
      usedA.add(a.id)
      usedB.add(b.id)
      pairs.push({ a, b, match: 'exact', differs: fieldDiffers(a, b) })
    }
  }

  // Pass 2: best fuzzy match among what's left, one greedy round. Repeated
  // rather than a single pass so the globally-closest pair claims first,
  // instead of order-of-iteration deciding an ambiguous case.
  const remainingA = () => fieldsA.filter((f) => !usedA.has(f.id))
  const remainingB = () => fieldsB.filter((f) => !usedB.has(f.id))

  for (;;) {
    let best: { a: ContentField; b: ContentField; score: number } | null = null
    for (const a of remainingA()) {
      for (const b of remainingB()) {
        const score = similarity(normalize(a.name), normalize(b.name))
        if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
          best = { a, b, score }
        }
      }
    }
    if (!best) break
    usedA.add(best.a.id)
    usedB.add(best.b.id)
    pairs.push({ a: best.a, b: best.b, match: 'fuzzy', differs: fieldDiffers(best.a, best.b) })
  }

  // Leftovers: unique to one side
  for (const a of remainingA()) pairs.push({ a, b: null, match: 'none', differs: null })
  for (const b of remainingB()) pairs.push({ a: null, b, match: 'none', differs: null })

  // Stable order: shared fields first (by A's original order), then A-only,
  // then B-only, so the panel reads top-to-bottom as "shared, then unique"
  // rather than an arbitrary interleaving.
  const orderIndex = new Map<string, number>()
  fieldsA.forEach((f, i) => orderIndex.set(f.id, i))
  fieldsB.forEach((f, i) => orderIndex.set(f.id, 1000 + i))
  pairs.sort((x, y) => {
    const bothX = x.a && x.b ? 0 : 1
    const bothY = y.a && y.b ? 0 : 1
    if (bothX !== bothY) return bothX - bothY
    const ix = orderIndex.get((x.a ?? x.b)!.id) ?? 0
    const iy = orderIndex.get((y.a ?? y.b)!.id) ?? 0
    return ix - iy
  })

  const shared = pairs.filter((p) => p.a && p.b)
  const summary = {
    shared: shared.length,
    differs: shared.filter((p) => p.differs).length,
    onlyA: pairs.filter((p) => p.a && !p.b).length,
    onlyB: pairs.filter((p) => !p.a && p.b).length,
  }

  return { pairs, summary }
}

export type { FieldType }
