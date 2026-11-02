/**
 * Sticky note colours. `value` is the on-canvas hex, and `text` keeps contrast
 * readable on each.
 */
export interface StickyColor {
  name: string
  value: string
  text: string
}

export const STICKY_COLORS: StickyColor[] = [
  { name: 'Yellow', value: '#FFF6CC', text: '#111B2B' },
  { name: 'Amber',  value: '#FFD960', text: '#111B2B' },
  { name: 'Orange', value: '#FDB882', text: '#111B2B' },
  { name: 'Pink',   value: '#FFCEE0', text: '#111B2B' },
  { name: 'Green',  value: '#CDF3C6', text: '#111B2B' },
  { name: 'Teal',   value: '#A0FAE4', text: '#111B2B' },
  { name: 'Blue',   value: '#CEECFF', text: '#111B2B' },
  { name: 'Violet', value: '#EDE3FF', text: '#111B2B' },
]

export const DEFAULT_STICKY_COLOR = STICKY_COLORS[0].value
