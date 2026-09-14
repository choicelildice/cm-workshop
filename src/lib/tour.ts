const SEEN_KEY = 'cm-workshop-tour-seen'

export interface TourStep {
  /** `data-tour` value of the element to spotlight. Omit for a centred card. */
  target?: string
  title: string
  body: string
  /** Where the card sits relative to the target. */
  placement?: 'bottom' | 'top' | 'left' | 'right'
}

/**
 * The tour covers the interactions that aren't discoverable by looking:
 * click-to-place, drag-to-reorder, double-click-to-edit. It deliberately
 * doesn't narrate buttons that explain themselves.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to CM Workshop',
    body:
      'Sketch a Contentful content model on a canvas, then push it straight into a space. ' +
      'This takes about a minute and you can leave at any time.',
  },
  {
    target: 'add-type',
    title: 'Start with a content type',
    body:
      'Type a name and press Add. The card then follows your cursor, so click where you want it. ' +
      'Escape cancels.',
    placement: 'bottom',
  },
  {
    target: 'field-library',
    title: 'Drag fields onto a card',
    body:
      'These are the nine field types Contentful actually offers. Drag one onto a content type, ' +
      'name it inline, and mark it Required or Localized.',
    placement: 'right',
  },
  {
    target: 'canvas',
    title: 'Edit anything in place',
    body:
      'Double-click a field to rename it or change its type. Drag fields to reorder them. ' +
      'Drag from a Reference field’s green dot to another card to draw a relationship, ' +
      'which becomes a real validation on export.',
    placement: 'top',
  },
  {
    target: 'sticky',
    title: 'Capture open questions',
    body:
      'Sticky notes hold the things you haven’t decided yet. Double-click to type, ' +
      'drag a corner to resize. They travel to Miro but are ignored by Contentful.',
    placement: 'bottom',
  },
  {
    target: 'kinds',
    title: 'Colour-code by kind',
    body:
      'Tag each card as Topic, Assembly, or Config to colour its header. Rename or recolour ' +
      'these to match your team’s vocabulary.',
    placement: 'bottom',
  },
  {
    target: 'import',
    title: 'Import an existing model',
    body:
      'Pull content types from a space onto the board, all of them or just the ones you pick. ' +
      'Read-only, so it never changes the space.',
    placement: 'bottom',
  },
  {
    target: 'export',
    title: 'Export when you’re ready',
    body:
      'Creates the content types over the CMA. You review the full plan first — ids, field ' +
      'types, link targets — and nothing is written until you confirm. Point it at a sandbox ' +
      'environment while you’re trying it out.',
    placement: 'bottom',
  },
  {
    title: 'A few things worth knowing',
    body:
      'Everything autosaves to this browser, and Cmd+Z undoes. Use the project menu for separate ' +
      'boards. You can reopen this tour from the Help button any time.',
  },
]

export function hasSeenTour(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // If storage is unavailable, don't nag on every load
    return true
  }
}

export function markTourSeen(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // ignore
  }
}
