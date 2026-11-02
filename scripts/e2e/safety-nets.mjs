#!/usr/bin/env node
/**
 * End-to-end proof that a release does not break stored boards.
 *
 * Seeds boards in every historical stored shape into a fresh browser profile
 * with NO storage version marker (a browser arriving from the previous
 * release), loads each, and asserts:
 *   - every board and the index were backed up byte-identical before anything
 *     was written, and the version marker was set
 *   - no board is paused, and a legacy board is normalised exactly as before
 *     (types migrated, sticky given default dimensions) with nothing else
 *     changed and no callbacks leaked into storage
 *   - a second visit touches no backup
 *   - "Download all boards" produces a file containing every project
 *
 * Usage, against a PRODUCTION build (dev mode double-runs effects):
 *   npm run build && PORT=3123 npm run start &
 *   npm run e2e:safety            # defaults to http://localhost:3123
 *   npm run e2e:safety -- http://localhost:3000
 *
 * Needs Google Chrome installed (launched through playwright-core's `chrome`
 * channel) and APP_PASSWORD in .env.local. Exits non-zero on any failure.
 * Timing relies on fixed sleeps around the save debounce (see lib.mjs).
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, launch, openApp, fillStorage, freeStorage } from './lib.mjs'

const base = process.argv[2] ?? 'http://localhost:3123'

/** Sorted-key JSON with undefined dropped and React Flow's runtime `measured` ignored. */
const canonical = (v) =>
  JSON.stringify(v, (k, val) => {
    if (k === 'measured') return undefined
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.keys(val).sort().filter((x) => val[x] !== undefined).map((x) => [x, val[x]]))
    }
    return val
  })

const browser = await launch()
const { page } = await openApp(browser, base, { acceptDownloads: true })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 200)))

// ── Fixtures: three stored shapes ───────────────────────────────────────
const modern = {
  nodes: [
    { id: 'm1', type: 'contentType', position: { x: 0, y: 0 }, data: { label: 'Article', kind: 'topic', emoji: '📰', fields: [
      { id: 'mf1', name: 'title', type: 'text', required: true, isArray: false, localized: true },
      { id: 'mf2', name: 'tags', type: 'text', required: false, isArray: true },
      { id: 'mf3', name: 'author', type: 'reference', required: false, isArray: false },
    ] } },
    { id: 'm2', type: 'contentType', position: { x: 400, y: 0 }, data: { label: 'Author', kind: 'custom-kind-made-in-settings', fields: [
      { id: 'mf4', name: 'name', type: 'text', required: true, isArray: false },
    ] } },
    { id: 'ms', type: 'sticky', position: { x: 0, y: 400 }, width: 240, height: 180, data: { text: 'open question', color: '#FFCEE0' } },
  ],
  edges: [{ id: 'e-m1-mf3-m2', source: 'm1', target: 'm2', sourceHandle: 'field-mf3', animated: false, style: { stroke: '#0891B2', strokeWidth: 2 } }],
}
const legacy = {
  nodes: [
    // kinds/hasClipboard: keys an early version persisted and the load path drops on purpose
    { id: 'l1', type: 'contentType', position: { x: 0, y: 0 }, data: { label: 'Old Page', kinds: [{ id: 'topic' }], hasClipboard: false, fields: [
      { id: 'lf1', name: 'headline', type: 'shortText', required: true, isArray: false },
      { id: 'lf2', name: 'body', type: 'longText', required: false, isArray: false },
      { id: 'lf3', name: 'count', type: 'integer', required: false, isArray: false },
      { id: 'lf4', name: 'links', type: 'array', required: false, isArray: true },
    ] } },
    { id: 'ls', type: 'sticky', position: { x: 0, y: 300 }, data: { text: 'pre-resize sticky' } },
    { id: 'li', type: 'image', position: { x: 300, y: 300 }, data: { label: 'whiteboard.png' } },
  ],
  edges: [],
}
const empty = { nodes: [], edges: [] }
const projects = [
  { id: 'p-modern', name: 'Modern', updatedAt: 3 },
  { id: 'p-legacy', name: 'Legacy', updatedAt: 2 },
  { id: 'p-empty', name: 'Empty', updatedAt: 1 },
]
const rawBoards = {
  'p-modern': JSON.stringify(modern),
  'p-legacy': JSON.stringify(legacy, null, 1), // odd formatting on purpose: backups must be byte copies
  'p-empty': JSON.stringify(empty),
}
await page.evaluate(({ projects, rawBoards }) => {
  localStorage.clear()
  localStorage.setItem('cm-workshop-projects', JSON.stringify(projects))
  for (const [id, raw] of Object.entries(rawBoards)) localStorage.setItem(`cm-workshop-project-${id}`, raw)
  localStorage.setItem('cm-workshop-current', 'p-modern')
  localStorage.setItem('cm-workshop-tour-seen', '1')
  // deliberately no cm-workshop-storage-version
}, { projects, rawBoards })

async function openProject(id) {
  await page.evaluate((id) => localStorage.setItem('cm-workshop-current', id), id)
  await page.goto(`${base}/`)
  await page.waitForSelector('[data-tour="canvas"]')
  await page.waitForTimeout(2500) // past the 400ms save debounce, with margin
  return page.evaluate((id) => ({
    mounted: document.querySelectorAll('.react-flow__node').length,
    paused: !!document.querySelector('[data-testid="save-paused"]'),
    stored: localStorage.getItem(`cm-workshop-project-${id}`),
    marker: localStorage.getItem('cm-workshop-storage-version'),
    backups: Object.keys(localStorage).filter((k) => k.startsWith('cm-workshop-backup-')).sort(),
    backupsIdentical: Object.fromEntries(
      ['p-modern', 'p-legacy', 'p-empty'].map((p) => [p, localStorage.getItem(`cm-workshop-backup-v1-${p}`)])
    ),
    backupIndex: localStorage.getItem('cm-workshop-backup-v1-projects'),
  }), id)
}

const failures = []
const check = (name, cond, extra) => { if (!cond) failures.push(name + (extra ? ` (${extra})` : '')); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`) }

// 1. First load under the new version: snapshot before anything is written
const first = await openProject('p-modern')
check('version marker set to 2', first.marker === '2', first.marker)
check('all three boards backed up', ['p-modern', 'p-legacy', 'p-empty'].every((p) => first.backups.includes(`cm-workshop-backup-v1-${p}`)), first.backups.join(','))
check('backups are byte-identical to the originals', Object.entries(rawBoards).every(([p, raw]) => first.backupsIdentical[p] === raw))
check('project index backed up', first.backupIndex === JSON.stringify(projects))
check('modern board: 3 nodes mounted', first.mounted === 3, first.mounted)
check('modern board: not paused', !first.paused)
check('modern board: stored content equivalent after the post-load save', canonical(JSON.parse(first.stored)) === canonical(modern))

// 2. Legacy board: the load path normalises it, which is expected; nothing else may change
const leg = await openProject('p-legacy')
const legStored = JSON.parse(leg.stored)
const l1 = legStored.nodes.find((n) => n.id === 'l1')
check('legacy board: 3 nodes mounted', leg.mounted === 3, leg.mounted)
check('legacy board: not paused', !leg.paused)
check('legacy board: field types migrated', l1.data.fields.map((f) => f.type).join(',') === 'text,text,number,reference')
check('legacy board: field names kept', l1.data.fields.map((f) => f.name).join(',') === 'headline,body,count,links')
check('legacy board: flags kept', l1.data.fields[0].required === true && l1.data.fields[3].isArray === true)
check('legacy board: sticky given default dimensions', legStored.nodes.find((n) => n.id === 'ls').width === 200)
check('legacy board: image node kept', !!legStored.nodes.find((n) => n.id === 'li'))
check('legacy board: no callbacks or kinds leaked into storage', !leg.stored.includes('onAddField') && !leg.stored.includes('"kinds"'))
check('legacy board: backup still the original bytes', leg.backupsIdentical['p-legacy'] === rawBoards['p-legacy'])

// 3. Empty board
const emp = await openProject('p-empty')
check('empty board: loads empty, not paused, stored unchanged', emp.mounted === 0 && !emp.paused && emp.stored === rawBoards['p-empty'])

// 4. Second visit must not re-snapshot or touch backups
const again = await openProject('p-modern')
check('second visit: still exactly 4 backup keys', again.backups.length === 4, again.backups.length)
check('second visit: modern backup still the original bytes', again.backupsIdentical['p-modern'] === rawBoards['p-modern'])

// 5. Download all boards from the project menu
await page.click('[title="Switch project"]')
const dl = page.waitForEvent('download', { timeout: 30000 })
await page.click('text=Download all boards')
const d = await dl
const file = path.join(ROOT, '.test-out', 'boards-download.json')
fs.mkdirSync(path.dirname(file), { recursive: true })
await d.saveAs(file)
const dumped = JSON.parse(fs.readFileSync(file, 'utf8'))
check('download: contains all three projects', dumped.projects.length === 3)
check('download: modern board intact', canonical(dumped.projects.find((p) => p.meta.id === 'p-modern').data) === canonical(modern))
check('download: carries storage version', dumped.storageVersion === 2)

// 6. Pruning: with only one backup generation present nothing may be removed
check('pruning: one generation present, all 4 backup keys still there', again.backups.length === 4)

// 7. Storage full: a save that storage refuses must show the banner, leave the
//    stored copy as it was, and clear once a save succeeds again. The edit
//    must GROW the board: replacing a key with a same-sized value fits even
//    in a full store, so a drag is not enough; adding a content type is.
await page.evaluate((id) => localStorage.setItem('cm-workshop-current', id), 'p-modern')
await page.goto(`${base}/`)
await page.waitForSelector('.react-flow__node')
await page.waitForTimeout(1000)
const beforeFull = await page.evaluate(() => localStorage.getItem('cm-workshop-project-p-modern'))
const filled = await fillStorage(page)
async function addType(name) {
  const before = await page.$$eval('.react-flow__node', (e) => e.length)
  await page.fill('[data-tour="add-type"] input, input[placeholder="New content type…"]', name)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  if ((await page.$$eval('.react-flow__node', (e) => e.length)) === before) {
    // click-to-place mode: drop it on an empty part of the canvas
    const c = await page.locator('[data-tour="canvas"]').boundingBox()
    await page.mouse.click(c.x + c.width * 0.8, c.y + c.height * 0.8)
  }
  await page.waitForTimeout(1500) // past the save debounce
}
await addType('Quota Test One')
const full = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.react-flow__node').length,
  banner: !!document.querySelector('[data-testid="save-failed"]'),
  stored: localStorage.getItem('cm-workshop-project-p-modern'),
}))
check(`storage full (${filled} junk keys): new card is on screen`, full.nodes === 4, full.nodes)
check('storage full: write-failed banner shown', full.banner)
check('storage full: stored copy left as it was', full.stored === beforeFull)
// Free the space and edit again: the save goes through and the banner clears
await freeStorage(page)
await addType('Quota Test Two')
const freed = await page.evaluate(() => ({
  banner: !!document.querySelector('[data-testid="save-failed"]'),
  stored: localStorage.getItem('cm-workshop-project-p-modern'),
}))
check('storage freed: next save succeeds and the stored copy now holds both new cards', freed.stored !== beforeFull && freed.stored.includes('Quota Test One') && freed.stored.includes('Quota Test Two'))
check('storage freed: write-failed banner cleared', !freed.banner)
check('backups untouched by the storage-full episode', await page.evaluate((raw) => localStorage.getItem('cm-workshop-backup-v1-p-modern') === raw, rawBoards['p-modern']))

// 7b. A write that does not go through Canvas (Duplicate in the project menu)
//     on a full store must reach the same banner
await fillStorage(page)
await page.click('[title="Switch project"]')
await page.click('text=Duplicate')
await page.waitForTimeout(800)
check('storage full: Duplicate project (non-Canvas write) shows the write-failed banner', await page.evaluate(() => !!document.querySelector('[data-testid="save-failed"]')))
await freeStorage(page)

// 8. Legacy single-board adoption on a full store must not destroy the board.
//    Fresh profile: only the pre-projects keys exist, and storage is filled
//    before the app first runs.
const { context: legacyCtx, page: lp } = await openApp(browser, base)
const legacyNodesRaw = JSON.stringify([
  { id: 'old1', type: 'contentType', position: { x: 0, y: 0 }, data: { label: 'Pre-projects Page', fields: [{ id: 'o1', name: 'title', type: 'text', required: true, isArray: false }] } },
])
await lp.evaluate((raw) => {
  localStorage.clear()
  localStorage.setItem('cm-workshop-nodes', raw)
  localStorage.setItem('cm-workshop-edges', '[]')
  localStorage.setItem('cm-workshop-tour-seen', '1')
}, legacyNodesRaw)
await fillStorage(lp)
await lp.goto(`${base}/`)
await lp.waitForSelector('[data-tour="canvas"]')
await lp.waitForTimeout(1500)
const fullLegacy = await lp.evaluate((raw) => ({
  legacyStillThere: localStorage.getItem('cm-workshop-nodes') === raw,
  adopted: (JSON.parse(localStorage.getItem('cm-workshop-projects') || '[]')).some((p) => p.name === 'My Content Model'),
}), legacyNodesRaw)
check('legacy board on a full store: original keys left in place', fullLegacy.legacyStillThere)
check('legacy board on a full store: no half-made "My Content Model" project left behind', !fullLegacy.adopted)
// Free space and load again: adoption must now succeed and remove the originals
await freeStorage(lp)
await lp.goto(`${base}/`)
await lp.waitForSelector('.react-flow__node')
await lp.waitForTimeout(1500)
const freedLegacy = await lp.evaluate(() => {
  const projects = JSON.parse(localStorage.getItem('cm-workshop-projects') || '[]')
  const mine = projects.find((p) => p.name === 'My Content Model')
  const data = mine ? JSON.parse(localStorage.getItem(`cm-workshop-project-${mine.id}`) || 'null') : null
  return {
    adopted: !!mine,
    nodeLabel: data?.nodes?.[0]?.data?.label,
    legacyGone: localStorage.getItem('cm-workshop-nodes') === null && localStorage.getItem('cm-workshop-edges') === null,
    current: localStorage.getItem('cm-workshop-current') === mine?.id,
  }
})
check('legacy board after freeing space: adopted into "My Content Model" with its content', freedLegacy.adopted && freedLegacy.nodeLabel === 'Pre-projects Page')
check('legacy board after freeing space: original keys removed only now', freedLegacy.legacyGone)
check('legacy board after freeing space: adopted project is current', freedLegacy.current)
await legacyCtx.close()

// 9. Corrupt project index: boards it no longer lists must still be backed up
//    and exported. Fresh profile, index is not JSON, two boards present.
const { context: corruptCtx, page: cp } = await openApp(browser, base, { acceptDownloads: true })
const orphanA = JSON.stringify({ nodes: [{ id: 'oa', type: 'contentType', position: { x: 0, y: 0 }, data: { label: 'Orphan A', fields: [] } }], edges: [] })
const orphanB = JSON.stringify({ nodes: [{ id: 'ob', type: 'contentType', position: { x: 0, y: 0 }, data: { label: 'Orphan B', fields: [] } }], edges: [] })
const corruptIndex = '{"this is not": json'
await cp.evaluate(({ orphanA, orphanB, corruptIndex }) => {
  localStorage.clear()
  localStorage.setItem('cm-workshop-projects', corruptIndex)
  localStorage.setItem('cm-workshop-project-orphan-a', orphanA)
  localStorage.setItem('cm-workshop-project-orphan-b', orphanB)
  localStorage.setItem('cm-workshop-tour-seen', '1')
}, { orphanA, orphanB, corruptIndex })
await cp.goto(`${base}/`)
await cp.waitForSelector('[data-tour="canvas"]')
await cp.waitForTimeout(1500)
const corrupt = await cp.evaluate(({ orphanA, orphanB, corruptIndex }) => ({
  marker: localStorage.getItem('cm-workshop-storage-version'),
  backupA: localStorage.getItem('cm-workshop-backup-v1-orphan-a') === orphanA,
  backupB: localStorage.getItem('cm-workshop-backup-v1-orphan-b') === orphanB,
  backupIndexRaw: localStorage.getItem('cm-workshop-backup-v1-projects') === corruptIndex,
  boardsStillPresent: localStorage.getItem('cm-workshop-project-orphan-a') === orphanA && localStorage.getItem('cm-workshop-project-orphan-b') === orphanB,
}), { orphanA, orphanB, corruptIndex })
check('corrupt index: both unlisted boards backed up byte-identical', corrupt.backupA && corrupt.backupB)
check('corrupt index: the unreadable index text itself backed up', corrupt.backupIndexRaw)
check('corrupt index: version marker set', corrupt.marker === '2')
check('corrupt index: unlisted boards still in storage after load', corrupt.boardsStillPresent)
await cp.click('[title="Switch project"]')
const cdl = cp.waitForEvent('download', { timeout: 30000 })
await cp.click('text=Download all boards')
const cfile = path.join(ROOT, '.test-out', 'boards-download-corrupt.json')
await (await cdl).saveAs(cfile)
const cdump = JSON.parse(fs.readFileSync(cfile, 'utf8'))
const ids = cdump.projects.map((p) => p.id)
check('corrupt index: export includes both unlisted boards', ids.includes('orphan-a') && ids.includes('orphan-b'))
check('corrupt index: unlisted boards exported with meta null and their data', cdump.projects.filter((p) => p.id.startsWith('orphan-')).every((p) => p.meta === null && p.data?.nodes?.length === 1))
await corruptCtx.close()

const realErrors = consoleErrors.filter((e) => !e.includes('Could not save project') && !e.includes('Storage refused a write'))
check('no console errors other than the expected save failure', realErrors.length === 0, realErrors.join(' | '))

await browser.close()
if (failures.length) { console.error(`\n${failures.length} FAILED`); process.exit(1) }
console.log('\nAll safety-net checks passed')
