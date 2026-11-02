/**
 * Pins lib/load-integrity, which the save-pause net rests on. The "loaded"
 * side of every case is shaped the way serializeNodes leaves a node (plain
 * data, no callbacks), because that is what Canvas passes.
 *
 * Two kinds of case:
 *
 * - Boards that MUST compare equal: identical, and every historical stored
 *   shape the load path deliberately normalises (legacy field type ids,
 *   legacy transient keys, stickies saved before dimensions and colours
 *   existed, key order). Each of these corresponds to one entry in
 *   normalizeStoredNode. A false positive here pauses saving on a good board.
 * - Boards that MUST be caught: any value changed, dropped or reordered,
 *   including keys this module has never heard of. A false negative here is
 *   a lossy load reaching storage.
 *
 * Run with `npm test`; the build runs it too.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkLoadIntegrity, type Board } from '../src/lib/load-integrity'
import { DEFAULT_STICKY_COLOR } from '../src/lib/sticky-colors'

type Rec = Record<string, unknown>
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

function contentType(): Rec {
  return {
    id: 'n1',
    type: 'contentType',
    position: { x: 1, y: 2 },
    measured: { width: 220, height: 96 },
    data: {
      label: 'Page',
      kind: 'topic',
      emoji: '🚀',
      fields: [
        { id: 'f1', name: 'title', type: 'text', required: true, isArray: false, localized: true },
        { id: 'f2', name: 'refs', type: 'reference', required: false, isArray: true },
      ],
    },
  }
}
const edges: Rec[] = [{ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'field-f2', style: { stroke: '#0891B2' } }]
const board = (nodes: unknown[], e?: unknown[]): Board => (e ? { nodes, edges: e } : { nodes })
const fieldsOf = (n: Rec) => (n.data as Rec).fields as Rec[]

const expectOk = (name: string, stored: Board, loaded: Board) =>
  test(name, () => {
    const r = checkLoadIntegrity(stored, loaded)
    assert.equal(r.ok, true, `expected intact, got: ${r.detail}`)
  })
const expectCaught = (name: string, stored: Board, loaded: Board) =>
  test(name, () => {
    const r = checkLoadIntegrity(stored, loaded)
    assert.equal(r.ok, false, 'expected the difference to be caught')
    assert.ok(r.detail, 'a caught difference carries a detail')
  })

// ── Must compare equal: one case per deliberate normalisation ───────────

expectOk('identical boards', board([contentType()]), board([clone(contentType())]))

{
  const stored = clone(contentType())
  const d = stored.data as Rec
  d.kinds = [{ id: 'topic', label: 'Topic', color: '#000', text: '#fff' }]
  d.hasClipboard = true
  expectOk('legacy transient data keys (kinds, hasClipboard) are dropped on load', board([stored]), board([contentType()]))
}

{
  const stored = clone(contentType())
  fieldsOf(stored)[0].type = 'shortText'
  fieldsOf(stored)[1].type = 'array'
  expectOk('legacy field type ids compare equal to their migrated form', board([stored]), board([contentType()]))
}

{
  const stored = clone(contentType())
  delete (stored.data as Rec).fields
  const loaded = clone(contentType())
  ;(loaded.data as Rec).fields = []
  expectOk('missing fields array reads as empty', board([stored]), board([loaded]))
}

{
  const stickyOld = { id: 's', type: 'sticky', position: { x: 0, y: 0 }, data: { text: 'hi' } }
  const stickyLoaded = {
    id: 's', type: 'sticky', position: { x: 0, y: 0 }, width: 200, height: 200,
    data: { text: 'hi', color: DEFAULT_STICKY_COLOR },
  }
  expectOk('sticky saved before dimensions and colour existed gets the load defaults', board([stickyOld]), board([stickyLoaded]))
}

{
  const image = { id: 'i', type: 'image', position: { x: 0, y: 0 }, data: { label: 'pic' } }
  expectOk('image node (imageUrl is attached on load and stripped on save)', board([image]), board([clone(image)]))
}

{
  const ct = contentType()
  const reordered = { data: ct.data, measured: ct.measured, position: ct.position, type: ct.type, id: ct.id }
  expectOk('object key order is not a difference', board([ct]), board([reordered]))
}

{
  const stored = clone(contentType())
  delete (stored.data as Rec).emoji
  const loaded = clone(contentType())
  ;(loaded.data as Rec).emoji = undefined
  expectOk('absent key equals explicit undefined', board([stored]), board([loaded]))
}

expectOk('empty board', board([]), board([]))
expectOk('edges omitted on both sides are skipped', board([contentType()]), board([clone(contentType())]))
expectOk('edges omitted on one side are skipped', board([contentType()], edges), board([clone(contentType())]))
expectOk('edges identical', board([contentType()], edges), board([clone(contentType())], clone(edges)))

// ── Must be caught ──────────────────────────────────────────────────────

function lossy(name: string, mutate: (loaded: Rec) => void) {
  const loaded = clone(contentType())
  mutate(loaded)
  expectCaught(name, board([contentType()]), board([loaded]))
}

// The reason the comparison is whole rather than a whitelist
{
  const stored = clone(contentType())
  fieldsOf(stored)[0].helpText = 'added next month'
  expectCaught('unknown field property dropped on load', board([stored]), board([contentType()]))
}
{
  const stored = clone(contentType())
  ;(stored.data as Rec).description = 'added next month'
  expectCaught('unknown data key dropped on load', board([stored]), board([contentType()]))
}
{
  const stored = clone(contentType())
  stored.locked = true
  expectCaught('unknown node key dropped on load', board([stored]), board([contentType()]))
}

lossy('dropped localized flag', (n) => { delete fieldsOf(n)[0].localized })
lossy('absent flag turned into explicit false', (n) => { fieldsOf(n)[1].localized = false })
lossy('dropped kind', (n) => { delete (n.data as Rec).kind })
lossy('dropped emoji', (n) => { (n.data as Rec).emoji = undefined })
lossy('dropped field', (n) => { fieldsOf(n).pop() })
lossy('renamed field', (n) => { fieldsOf(n)[1].name = 'ref' })
lossy('changed field type', (n) => { fieldsOf(n)[0].type = 'richText' })
lossy('isArray flipped', (n) => { fieldsOf(n)[1].isArray = false })
lossy('required flipped', (n) => { fieldsOf(n)[0].required = false })
lossy('changed label', (n) => { (n.data as Rec).label = 'Pag' })
lossy('moved node', (n) => { (n.position as Rec).x = 5 })
lossy('fields reordered', (n) => { fieldsOf(n).reverse() })
lossy('transient key leaked into the serialised node', (n) => { (n.data as Rec).hasClipboard = false })

{
  const stickyOld = { id: 's', type: 'sticky', position: { x: 0, y: 0 }, data: { text: 'hi' } }
  expectCaught('missing node', board([contentType(), stickyOld]), board([contentType()]))
  const recoloured = { ...stickyOld, width: 200, height: 200, data: { text: 'hi', color: '#FFCEE0' } }
  expectCaught('sticky colour changed (not the default)', board([stickyOld]), board([recoloured]))
  const resized = { ...stickyOld, width: 300, height: 200, data: { text: 'hi', color: DEFAULT_STICKY_COLOR } }
  expectCaught('sticky resized on load', board([stickyOld]), board([resized]))
}

expectCaught('missing edge', board([contentType()], edges), board([contentType()], []))
{
  const e = clone(edges)
  e[0].sourceHandle = null
  expectCaught('edge lost its field handle', board([contentType()], edges), board([contentType()], e))
}
{
  const e = clone(edges)
  delete e[0].style
  expectCaught('edge lost a key', board([contentType()], edges), board([contentType()], e))
}
