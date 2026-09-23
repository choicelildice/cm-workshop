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
      'This runs on a sample model so there is something real to look at \u2014 one is created ' +
      'if you don\u2019t have it. Takes about a minute, and you can leave at any time.',
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
    target: 'canvas',
    title: 'Follow the references',
    body:
      'Click any Reference field to light up where it points and fade everything else. ' +
      '\u2318-click a second one to compare them: anything both reference is called out, ' +
      'which is how you spot types doing overlapping jobs.',
    placement: 'top',
  },
  {
    target: 'arrange',
    title: 'Arrange untangles it',
    body:
      'Lays the model out left to right: types nothing references on the left, flowing to types ' +
      'that reference nothing. Circular references are drawn dashed and listed, and types with no ' +
      'references either way are grouped below. Most useful on a model you have just imported.',
    placement: 'bottom',
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
    target: 'share',
    title: 'Send it to someone',
    body:
      'Share packs the whole model into a link, so anyone can open a copy without an account. ' +
      'It is a snapshot rather than a live board, so send a fresh link when the model changes.',
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
      'Everything autosaves to this browser, and Cmd+Z undoes anything \u2014 including an Arrange. ' +
      'Use the project menu for separate boards; this sample is just another project, so rename it ' +
      'and build on it or delete it. Reopen this tour from Help any time.',
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
