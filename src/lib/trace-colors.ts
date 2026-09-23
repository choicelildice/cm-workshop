/**
 * Colours for tracing several reference fields at once.
 *
 * Capped at four deliberately: beyond that the hues stop being tellable apart
 * and dimming everything else stops conveying anything. All four are Contentful
 * tokens, chosen to be distinct from the default edge teal (#0891B2) so a traced
 * edge never reads as untraced.
 */
export const TRACE_COLORS = [
  { line: '#1773eb', soft: '#e8f5ff', name: 'Blue' },   // blue500-ish
  { line: '#9d5ceb', soft: '#f3ebff', name: 'Purple' }, // datavizSeqPurple500
  { line: '#CC4500', soft: '#fff2e4', name: 'Orange' }, // orange500
  { line: '#008539', soft: '#eaf9e8', name: 'Green' },  // green500
] as const

/** Marks a target reached by more than one traced field. */
export const SHARED_COLOR = { line: '#111B2B', soft: '#fff6cc', name: 'Shared' } as const
