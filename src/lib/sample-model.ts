import { v4 as uuidv4 } from 'uuid'
import type { ProjectData } from './projects'

/**
 * The sample model the tour runs against, and the first-run state of the app.
 *
 * Deliberately imperfect: it carries a self-referencing Category, a
 * Page <-> Article cycle, and an unreferenced Config type. That way Arrange has
 * real cycles and orphans to find, and the tour demonstrates the features
 * rather than describing them against an empty canvas.
 *
 * Positions are left at the origin-ish spread below; the tour calls Arrange,
 * which lays it out properly.
 */

interface SampleField {
  name: string
  type: string
  required?: boolean
  isArray?: boolean
  localized?: boolean
  /** Labels of the types this reference points at. */
  refs?: string[]
}

interface SampleType {
  label: string
  kind?: 'topic' | 'assembly' | 'config'
  emoji?: string
  at: { x: number; y: number }
  fields: SampleField[]
}

const TYPES: SampleType[] = [
  {
    label: 'Page',
    kind: 'assembly',
    emoji: '🏠',
    at: { x: 0, y: 0 },
    fields: [
      { name: 'Title', type: 'text', required: true, localized: true },
      { name: 'Slug', type: 'text', required: true },
      { name: 'SEO', type: 'reference', refs: ['SEO Metadata'] },
      { name: 'Sections', type: 'reference', isArray: true, refs: ['Article', 'Hero Banner'] },
    ],
  },
  {
    label: 'Article',
    kind: 'topic',
    emoji: '📄',
    at: { x: 420, y: 0 },
    fields: [
      { name: 'Headline', type: 'text', required: true, localized: true },
      { name: 'Body', type: 'richText', localized: true },
      { name: 'Published', type: 'dateTime' },
      { name: 'Author', type: 'reference', required: true, refs: ['Author'] },
      { name: 'Category', type: 'reference', refs: ['Category'] },
      { name: 'Hero image', type: 'media' },
      // Closes a cycle with Page: normal modelling, and gives Arrange
      // something real to detect
      { name: 'Related page', type: 'reference', refs: ['Page'] },
    ],
  },
  {
    label: 'Hero Banner',
    kind: 'assembly',
    emoji: '🖼️',
    at: { x: 420, y: 380 },
    fields: [
      { name: 'Heading', type: 'text', required: true, localized: true },
      { name: 'Image', type: 'media', required: true },
      { name: 'Link target', type: 'reference', refs: ['Page'] },
    ],
  },
  {
    label: 'Author',
    kind: 'topic',
    emoji: '👤',
    at: { x: 840, y: 0 },
    fields: [
      { name: 'Name', type: 'text', required: true },
      { name: 'Bio', type: 'richText', localized: true },
      { name: 'Photo', type: 'media' },
    ],
  },
  {
    label: 'Category',
    kind: 'topic',
    emoji: '🏷️',
    at: { x: 840, y: 300 },
    fields: [
      { name: 'Name', type: 'text', required: true, localized: true },
      // Self-reference: a routine hierarchy. Excluded from layering, and
      // deliberately not reported as a finding.
      { name: 'Parent', type: 'reference', refs: ['Category'] },
    ],
  },
  {
    label: 'SEO Metadata',
    kind: 'config',
    emoji: '🔍',
    at: { x: 840, y: 560 },
    fields: [
      { name: 'Meta title', type: 'text', localized: true },
      { name: 'Meta description', type: 'text', localized: true },
      { name: 'No index', type: 'boolean' },
    ],
  },
  {
    label: 'Site Config',
    kind: 'config',
    emoji: '⚙️',
    at: { x: 0, y: 560 },
    // Referenced by nothing and references nothing, so Arrange groups it as an
    // orphan — which is the kind of thing worth noticing in a real model
    fields: [
      { name: 'Site name', type: 'text', required: true },
      { name: 'Analytics ID', type: 'text' },
      { name: 'Feature flags', type: 'json' },
    ],
  },
]

const STICKIES = [
  {
    text: 'Do we need per-locale slugs for the regional sites?',
    color: '#FFF6CC',
    at: { x: 0, y: 300 },
  },
]

/**
 * Builds the sample board. Fresh ids each call, so two copies never collide.
 */
export function buildSampleModel(): ProjectData {
  const idByLabel = new Map<string, string>()
  for (const t of TYPES) idByLabel.set(t.label, uuidv4())

  // label -> field name -> field id, so edges can name a source handle
  const fieldIds = new Map<string, Map<string, string>>()

  const nodes = TYPES.map((t) => {
    const perField = new Map<string, string>()
    const fields = t.fields.map((f) => {
      const id = uuidv4()
      perField.set(f.name, id)
      return {
        id,
        name: f.name,
        type: f.type,
        required: !!f.required,
        isArray: !!f.isArray,
        localized: !!f.localized,
      }
    })
    fieldIds.set(t.label, perField)

    return {
      id: idByLabel.get(t.label)!,
      type: 'contentType',
      position: { ...t.at },
      data: { label: t.label, kind: t.kind, emoji: t.emoji, fields },
    }
  })

  const edges: unknown[] = []
  for (const t of TYPES) {
    const source = idByLabel.get(t.label)!
    const perField = fieldIds.get(t.label)!
    for (const f of t.fields) {
      for (const targetLabel of f.refs ?? []) {
        const target = idByLabel.get(targetLabel)
        if (!target) continue
        const fid = perField.get(f.name)!
        edges.push({
          id: `e-${source}-${fid}-${target}`,
          source,
          target,
          sourceHandle: `field-${fid}`,
          animated: false,
          style: { stroke: '#0891B2', strokeWidth: 2 },
        })
      }
    }
  }

  const stickyNodes = STICKIES.map((s) => ({
    id: uuidv4(),
    type: 'sticky',
    position: { ...s.at },
    width: 200,
    height: 200,
    data: { text: s.text, color: s.color },
  }))

  return { nodes: [...nodes, ...stickyNodes], edges }
}

export const SAMPLE_PROJECT_NAME = 'Sample content model'
