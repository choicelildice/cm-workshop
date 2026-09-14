/**
 * Sticky note colours.
 *
 * `miro` is one of the 16 named values Miro's sticky note API accepts (verified
 * against its OpenAPI spec), so the export maps straight across rather than
 * approximating a hex. `value` is the on-canvas hex, and `text` keeps contrast
 * readable on each.
 */
export interface StickyColor {
  name: string
  value: string
  text: string
  miro: string
}

export const STICKY_COLORS: StickyColor[] = [
  { name: 'Yellow', value: '#FFF6CC', text: '#111B2B', miro: 'light_yellow' },
  { name: 'Amber',  value: '#FFD960', text: '#111B2B', miro: 'yellow' },
  { name: 'Orange', value: '#FDB882', text: '#111B2B', miro: 'orange' },
  { name: 'Pink',   value: '#FFCEE0', text: '#111B2B', miro: 'light_pink' },
  { name: 'Green',  value: '#CDF3C6', text: '#111B2B', miro: 'light_green' },
  { name: 'Teal',   value: '#A0FAE4', text: '#111B2B', miro: 'cyan' },
  { name: 'Blue',   value: '#CEECFF', text: '#111B2B', miro: 'light_blue' },
  { name: 'Violet', value: '#EDE3FF', text: '#111B2B', miro: 'violet' },
]

export const DEFAULT_STICKY_COLOR = STICKY_COLORS[0].value

/** Miro's name for a hex, falling back to its default sticky colour. */
export function miroStickyColor(hex?: string): string {
  return STICKY_COLORS.find((c) => c.value === hex)?.miro ?? 'light_yellow'
}
