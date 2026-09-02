import { FieldType } from './types'

/**
 * Labels and colours only — deliberately free of React imports so server code
 * (the Miro export route) can use it. Icons live in `field-types.ts`, which
 * pulls in @phosphor-icons/react and is therefore client-only.
 */
/**
 * Order matches Contentful's "Add new field" dialog, reading left-to-right.
 *
 * Every type gets its own hue so a field is identifiable by colour alone at
 * small sizes. All nine are real Contentful design tokens
 * (@contentful/f36-tokens v6.3.1) — the six core hues plus the dataviz
 * sequential teal and pink, which exist precisely for categorical encoding:
 *
 *   blue600 · datavizSeqBlue500 · orange500 · yellow700 · red500
 *   datavizSeqTeal500 · green500 · gray600 · purple500
 *
 * Text and Rich text stay in the blue family since they are the two text
 * types, but use distinct steps so they don't read as the same badge.
 */
export const FIELD_TYPE_META: Record<FieldType, { label: string; color: string }> = {
  richText:   { label: 'Rich text',     color: '#0059C8' }, // blue600
  text:       { label: 'Text',          color: '#456cd3' }, // datavizSeqBlue500
  number:     { label: 'Number',        color: '#CC4500' }, // orange500
  dateTime:   { label: 'Date and time', color: '#B78300' }, // yellow700
  location:   { label: 'Location',      color: '#DA294A' }, // red500
  media:      { label: 'Media',         color: '#389480' }, // datavizSeqTeal500
  boolean:    { label: 'Boolean',       color: '#008539' }, // green500
  json:       { label: 'JSON object',   color: '#5A657C' }, // gray600
  reference:  { label: 'Reference',     color: '#9d5ceb' }, // purple500
}

/**
 * Field types removed when the list was corrected to Contentful's real nine.
 * Boards saved before that still hold these ids, so they are remapped on load.
 */
const LEGACY_FIELD_TYPES: Record<string, FieldType> = {
  shortText: 'text',
  longText: 'text',
  integer: 'number',
  array: 'reference',   // the old "Array" was only ever used for linked lists
}

/** Maps a stored field type onto a current one. */
export function migrateFieldType(t: string): FieldType {
  if (t in FIELD_TYPE_META) return t as FieldType
  return LEGACY_FIELD_TYPES[t] ?? 'text'
}

/**
 * Content type kinds, following the Topic / Assembly / Config modelling
 * pattern. Colours are real Contentful design tokens (@contentful/f36-tokens
 * v6.3.1) rather than approximations.
 *
 * `text` is specified per kind because yellow500 needs dark text to stay
 * readable, where blue600 and red500 need white.
 */
/**
 * Kind ids are stable strings stored on each node. Labels and colours are
 * user-configurable (see `kind-config.ts`), so renaming "Topic" to "Content"
 * or recolouring it never invalidates existing boards.
 */
export type ContentTypeKind = string

export interface KindDef {
  id: ContentTypeKind
  label: string
  color: string
  /** Text colour for the header; must contrast with `color`. */
  text: string
}

/**
 * Shipping defaults, following the Topic / Assembly / Config modelling
 * pattern. Colours are real Contentful design tokens (@contentful/f36-tokens
 * v6.3.1): blue600, yellow500, red500.
 *
 * `text` differs per kind because yellow500 needs dark text to stay readable
 * where blue600 and red500 need white.
 */
export const DEFAULT_KINDS: KindDef[] = [
  { id: 'topic',    label: 'Topic',    color: '#0059C8', text: '#ffffff' },
  { id: 'assembly', label: 'Assembly', color: '#FFC835', text: '#111B2B' },
  { id: 'config',   label: 'Config',   color: '#DA294A', text: '#ffffff' },
]

/** Contentful token palette offered in the kind editor. */
export const CONTENTFUL_PALETTE: { name: string; color: string; text: string }[] = [
  { name: 'Blue',   color: '#0059C8', text: '#ffffff' },
  { name: 'Yellow', color: '#FFC835', text: '#111B2B' },
  { name: 'Red',    color: '#DA294A', text: '#ffffff' },
  { name: 'Green',  color: '#008539', text: '#ffffff' },
  { name: 'Orange', color: '#CC4500', text: '#ffffff' },
  { name: 'Navy',   color: '#0f1042', text: '#ffffff' },
  { name: 'Slate',  color: '#5A657C', text: '#ffffff' },
  { name: 'Purple', color: '#7c3aed', text: '#ffffff' },
]

/** Header colour for a content type with no kind assigned. */
export const DEFAULT_TYPE_COLOR = '#0f1042'
export const DEFAULT_TYPE_TEXT = '#ffffff'

/**
 * Shortlist for the content type emoji picker, skewed toward the things
 * content models actually describe. Any emoji can still be pasted in.
 */
export const COMMON_EMOJI: string[] = [
  '📄', '📝', '📰', '📚', '🏠', '🧩', '⚙️', '🔧',
  '👤', '👥', '🏷️', '📦', '🗂️', '📁', '🖼️', '🎬',
  '🔗', '📍', '🌐', '🛒', '💳', '📊', '📈', '🧭',
  '⭐', '❤️', '🔔', '📧', '💬', '🗓️', '🔍', '🎯',
  '🚀', '💡', '🧠', '🔒', '🏢', '🎓', '✅', '❓',
]

/**
 * Resolves header colours from a kind list. Falls back to the neutral default
 * when the node has no kind, or when its kind was deleted from the config.
 */
export function resolveTypeColors(
  kind: ContentTypeKind | undefined,
  kinds: KindDef[]
): { color: string; text: string } {
  const def = kind ? kinds.find((k) => k.id === kind) : undefined
  return def
    ? { color: def.color, text: def.text }
    : { color: DEFAULT_TYPE_COLOR, text: DEFAULT_TYPE_TEXT }
}

/** Label for a kind id, or undefined if unset/unknown. */
export function resolveKindLabel(
  kind: ContentTypeKind | undefined,
  kinds: KindDef[]
): string | undefined {
  return kind ? kinds.find((k) => k.id === kind)?.label : undefined
}
