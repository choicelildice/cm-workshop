import { DEFAULT_KINDS, type KindDef } from './field-type-meta'

const KEY = 'cm-workshop-kinds'

function available(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

/**
 * Kind definitions are global rather than per-project: the Topic / Assembly /
 * Config vocabulary is a modelling convention, so it should stay consistent
 * across every board rather than being re-created per project.
 */
export function loadKinds(): KindDef[] {
  if (!available()) return DEFAULT_KINDS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_KINDS
    const parsed = JSON.parse(raw) as KindDef[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_KINDS
    // Drop malformed entries rather than rendering a broken header
    const clean = parsed.filter(
      (k) => k && typeof k.id === 'string' && typeof k.label === 'string' && typeof k.color === 'string'
    )
    return clean.length ? clean.map((k) => ({ ...k, text: k.text ?? '#ffffff' })) : DEFAULT_KINDS
  } catch {
    return DEFAULT_KINDS
  }
}

export function saveKinds(kinds: KindDef[]): void {
  if (!available()) return
  try {
    localStorage.setItem(KEY, JSON.stringify(kinds))
  } catch {
    // quota or unavailable
  }
}

export function resetKinds(): void {
  if (!available()) return
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/** Slug for a new kind's stable id, kept unique against existing ids. */
export function makeKindId(label: string, existing: KindDef[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'kind'
  if (!existing.some((k) => k.id === base)) return base
  let i = 2
  while (existing.some((k) => k.id === `${base}-${i}`)) i++
  return `${base}-${i}`
}
