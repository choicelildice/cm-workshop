import type { FieldType } from './types'

/**
 * Maps workshop field types onto Contentful CMA field definitions.
 *
 * The workshop deliberately mirrors Contentful's *dialog* (nine types), while
 * the CMA underneath has a wider, lower-level set (Symbol vs Text, Integer vs
 * Number, Link vs Array-of-Link). This module is where that gap is closed.
 */

export interface CmaField {
  id: string
  name: string
  type: string
  required: boolean
  localized: boolean
  linkType?: string
  items?: { type: string; linkType?: string; validations?: unknown[] }
  validations?: unknown[]
}

/** A `type` value the CMA understands, plus whether it needs a linkType. */
interface Mapping {
  type: string
  linkType?: string
  /** CMA type used for each item when the field is a list. */
  arrayItemType?: string
  arrayItemLinkType?: string
}

const MAP: Record<FieldType, Mapping> = {
  // Symbol = single-line text (255 chars). The workshop's "Text" covers both
  // Symbol and Text; Symbol is the safer default since it is filterable and
  // can serve as a displayField, which Text cannot.
  text:      { type: 'Symbol', arrayItemType: 'Symbol' },
  richText:  { type: 'RichText' },
  // Contentful splits this into Integer and Number (decimal). Integer matches
  // the dialog's examples (ID, order number, rating, quantity).
  number:    { type: 'Integer' },
  dateTime:  { type: 'Date' },
  location:  { type: 'Location' },
  media:     { type: 'Link', linkType: 'Asset', arrayItemType: 'Link', arrayItemLinkType: 'Asset' },
  boolean:   { type: 'Boolean' },
  json:      { type: 'Object' },
  reference: { type: 'Link', linkType: 'Entry', arrayItemType: 'Link', arrayItemLinkType: 'Entry' },
}

/** Only Symbol fields can be a content type's displayField. */
export const DISPLAY_FIELD_TYPES = new Set(['Symbol'])

/**
 * Reverse of MAP, for importing an existing space onto the canvas.
 *
 * The CMA has more types than the dialog does, so this collapses them:
 * Symbol and Text both become "text", Integer and Number both "number". An
 * Array field is unwrapped to its item type plus `isArray`.
 */
export function fromCmaField(f: {
  type: string
  linkType?: string
  items?: { type?: string; linkType?: string; validations?: unknown[] }
  validations?: unknown[]
}): { fieldType: FieldType; isArray: boolean; linkTargets: string[] } {
  const isArray = f.type === 'Array'
  const type = isArray ? (f.items?.type ?? 'Symbol') : f.type
  const linkType = isArray ? f.items?.linkType : f.linkType

  const validations = (isArray ? f.items?.validations : f.validations) ?? []
  const linkTargets =
    (validations.find(
      (v): v is { linkContentType: string[] } =>
        !!v && typeof v === 'object' && 'linkContentType' in v
    )?.linkContentType) ?? []

  let fieldType: FieldType
  switch (type) {
    case 'Symbol':
    case 'Text':
      fieldType = 'text'
      break
    case 'RichText':
      fieldType = 'richText'
      break
    case 'Integer':
    case 'Number':
      fieldType = 'number'
      break
    case 'Date':
      fieldType = 'dateTime'
      break
    case 'Location':
      fieldType = 'location'
      break
    case 'Boolean':
      fieldType = 'boolean'
      break
    case 'Object':
      fieldType = 'json'
      break
    case 'Link':
      fieldType = linkType === 'Asset' ? 'media' : 'reference'
      break
    default:
      // Unknown/new CMA type — keep the field rather than dropping it
      fieldType = 'text'
  }

  return { fieldType, isArray, linkTargets }
}

/**
 * camelCase id from a human label. Contentful ids must start with a letter and
 * contain only alphanumerics; anything else is stripped.
 */
export function toId(label: string, fallback = 'field'): string {
  const words = label
    .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
    .split(/[\s_-]+/)
    .filter(Boolean)
  if (words.length === 0) return fallback
  const camel = words
    .map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1)))
    .join('')
  // Must begin with a letter
  return /^[a-zA-Z]/.test(camel) ? camel : `${fallback}${camel[0].toUpperCase()}${camel.slice(1)}`
}

/** Ensures ids are unique within one content type. */
export function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  let i = 2
  while (taken.has(`${base}${i}`)) i++
  const id = `${base}${i}`
  taken.add(id)
  return id
}

/**
 * Builds a CMA field definition.
 *
 * `linkTargets` are content type ids this reference may point at, derived from
 * the board's connection arrows. An empty list means "any entry", which is what
 * Contentful does when no validation is set.
 */
export function toCmaField(opts: {
  id: string
  name: string
  fieldType: FieldType
  required: boolean
  isArray: boolean
  linkTargets?: string[]
}): CmaField {
  const { id, name, fieldType, required, isArray, linkTargets = [] } = opts
  const m = MAP[fieldType]

  const linkValidations =
    fieldType === 'reference' && linkTargets.length
      ? [{ linkContentType: linkTargets }]
      : undefined

  // A list becomes Array with an `items` descriptor. RichText, Location and
  // Object have no meaningful list form in Contentful, so they stay scalar.
  if (isArray && m.arrayItemType) {
    return {
      id,
      name,
      type: 'Array',
      required,
      localized: false,
      items: {
        type: m.arrayItemType,
        ...(m.arrayItemLinkType ? { linkType: m.arrayItemLinkType } : {}),
        ...(linkValidations ? { validations: linkValidations } : {}),
      },
    }
  }

  return {
    id,
    name,
    type: m.type,
    required,
    localized: false,
    ...(m.linkType ? { linkType: m.linkType } : {}),
    ...(linkValidations ? { validations: linkValidations } : {}),
  }
}
