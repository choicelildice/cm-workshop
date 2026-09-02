import type { Icon } from '@phosphor-icons/react'
import {
  BracketsCurly,
  CalendarBlank,
  Hash,
  IdentificationCard,
  Images,
  Intersect,
  MapPin,
  Repeat,
  TextT,
} from '@phosphor-icons/react'
import { FieldType } from './types'
import { FIELD_TYPE_META } from './field-type-meta'

// Re-exported for convenience; these live in the React-free meta module
export {
  DEFAULT_KINDS,
  CONTENTFUL_PALETTE,
  COMMON_EMOJI,
  DEFAULT_TYPE_COLOR,
  DEFAULT_TYPE_TEXT,
  resolveTypeColors,
  resolveKindLabel,
  migrateFieldType,
  type ContentTypeKind,
  type KindDef,
} from './field-type-meta'

/**
 * Phosphor Icons — the same set the Contentful web app uses. Contentful's
 * design system (Forma 36) wraps @phosphor-icons/react as its icon vendor, so
 * these are the identical glyphs without the f36 wrapper's dependency weight.
 *
 * Rich Text and Reference are Forma 36 *custom* icons (RichTextIcon, EntryIcon)
 * rather than Phosphor ones, so those two use the nearest Phosphor equivalent.
 *
 * NOTE: this module imports React components, so it is client-only. Server code
 * wanting labels or colours should import `field-type-meta` instead.
 */
const FIELD_ICONS: Record<FieldType, Icon> = {
  richText:   IdentificationCard,  // card w/ image + lines
  text:       TextT,               // serif "T"
  number:     Hash,
  dateTime:   CalendarBlank,
  location:   MapPin,
  media:      Images,              // stacked photos
  boolean:    Intersect,           // two overlapping circles
  json:       BracketsCurly,
  reference:  Repeat,              // box w/ looping arrow
}

export const FIELD_TYPES = Object.fromEntries(
  (Object.keys(FIELD_TYPE_META) as FieldType[]).map((k) => [
    k,
    { ...FIELD_TYPE_META[k], Icon: FIELD_ICONS[k] },
  ])
) as Record<FieldType, { label: string; color: string; Icon: Icon }>

export const FIELD_TYPE_OPTIONS = Object.entries(FIELD_TYPES).map(([key, meta]) => ({
  value: key as FieldType,
  ...meta,
}))

/**
 * Weight used for field type glyphs.
 *
 * Verified against Forma 36: `generateForma36Icon` passes NO weight for the
 * default variant, so Contentful renders Phosphor's "regular". (It only uses
 * "duotone", for the active state.) An earlier "bold" here made every glyph
 * noticeably heavier than the web app.
 */
export const ICON_WEIGHT = 'regular' as const

/**
 * Forma 36's own icon size scale, from its Icon component. Sized up from the
 * 12px badges used previously, because regular weight is a 1.5px stroke on a
 * 24px grid and goes faint below ~14px.
 */
export const ICON_SIZE = {
  tiny: 14,
  small: 16,
  medium: 20,
} as const
