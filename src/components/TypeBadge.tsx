'use client'

import { FIELD_TYPES, ICON_SIZE, ICON_WEIGHT } from '@/lib/field-types'
import type { FieldType } from '@/lib/types'

/**
 * Badge footprints match the two chip sizes already used on cards (tiny) and
 * in the sidebar / editors (small), so swapping this in changes no row height.
 */
const SIZES = {
  tiny: { w: 22, h: 20, icon: ICON_SIZE.tiny },
  small: { w: 24, h: 22, icon: ICON_SIZE.small },
} as const

/** Tooltip text, in Contentful's own phrasing ("Short text · List"). */
export function typeLabel(type: FieldType, isArray?: boolean): string {
  return `${FIELD_TYPES[type].label}${isArray ? ' · List' : ''}`
}

/**
 * The coloured field-type chip. A list field (Contentful `Array`) draws as a
 * short stack: a second, fainter chip peeks out behind the top-right corner.
 *
 * The badge is already the "what kind of field is this" slot on every row, so
 * cardinality lives there rather than as another pill after the name, where
 * it would compete with the required `*` and `i18n` markers. The stack reads
 * at the zoom levels a workshop board is actually viewed at, where a text
 * suffix would not. The footprint is unchanged: the back chip overflows by
 * 2px, which the rows' padding absorbs.
 */
export default function TypeBadge({
  type,
  isArray = false,
  size = 'tiny',
  title,
  className = '',
}: {
  type: FieldType
  isArray?: boolean
  size?: keyof typeof SIZES
  /** Overrides the default "<type> · List" tooltip. */
  title?: string
  className?: string
}) {
  const meta = FIELD_TYPES[type]
  const s = SIZES[size]
  return (
    <span
      className={`relative flex-shrink-0 inline-flex ${className}`}
      style={{ width: s.w, height: s.h }}
      title={title ?? typeLabel(type, isArray)}
      aria-label={typeLabel(type, isArray)}
    >
      {isArray && (
        <span
          aria-hidden
          className="absolute rounded"
          style={{
            left: 4,
            top: -4,
            width: s.w,
            height: s.h,
            backgroundColor: meta.color,
            opacity: 0.7,
          }}
        />
      )}
      <span
        className="relative inline-flex items-center justify-center rounded text-white"
        style={{
          backgroundColor: meta.color,
          width: s.w,
          height: s.h,
          // A white ring carves the front tile out of the one behind it, so
          // the stack reads as two cards rather than a blurred edge.
          boxShadow: isArray ? '0 0 0 1.5px #fff' : undefined,
        }}
      >
        <meta.Icon size={s.icon} weight={ICON_WEIGHT} />
      </span>
    </span>
  )
}
