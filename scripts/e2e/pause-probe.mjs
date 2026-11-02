#!/usr/bin/env node
/**
 * Proves the save pause end to end. Run it against a build whose load path
 * has been DELIBERATELY broken, and it asserts the banner shows and the
 * stored board is byte-identical after an edit and after a reload. Against a
 * correct build it reports the banner absent, which is also useful.
 *
 * Manual procedure (never commit the broken build):
 *   1. In src/components/Canvas.tsx, in the project load effect, change
 *        ({ ...f, type: migrateFieldType(f.type) })
 *      to
 *        ({ ...f, type: migrateFieldType(f.type), localized: undefined })
 *   2. npm run build && PORT=3123 npm run start &
 *   3. node scripts/e2e/pause-probe.mjs        # expect bannerShown: true
 *   4. Revert step 1 and rebuild.
 *
 * Needs Google Chrome and APP_PASSWORD in .env.local. Timing relies on fixed
 * sleeps around the save debounce (see lib.mjs).
 */
import { launch, openApp } from './lib.mjs'

const base = process.argv[2] ?? 'http://localhost:3123'

const browser = await launch()
const { page } = await openApp(browser, base)

const raw = JSON.stringify({ nodes: [
  { id: 'a', type: 'contentType', position: { x: 0, y: 0 }, data: { label: 'A', fields: [
    { id: 'f', name: 'title', type: 'text', required: true, isArray: false, localized: true },
  ] } },
], edges: [] })
await page.evaluate((raw) => {
  localStorage.clear()
  localStorage.setItem('cm-workshop-projects', JSON.stringify([{ id: 'px', name: 'X', updatedAt: 1 }]))
  localStorage.setItem('cm-workshop-project-px', raw)
  localStorage.setItem('cm-workshop-current', 'px')
  localStorage.setItem('cm-workshop-tour-seen', '1')
}, raw)
await page.goto(`${base}/`)
await page.waitForSelector('.react-flow__node')

// An edit that would normally save: drag the card
const box = await (await page.$('.react-flow__node')).boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + 4)
await page.mouse.down()
await page.mouse.move(box.x + 100, box.y + 60, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(1500)

const r = await page.evaluate((raw) => ({
  bannerShown: !!document.querySelector('[data-testid="save-paused"]'),
  storedUnchangedAfterDrag: localStorage.getItem('cm-workshop-project-px') === raw,
  backupExists: localStorage.getItem('cm-workshop-backup-v1-px') === raw,
}), raw)
await page.goto(`${base}/`)
await page.waitForSelector('.react-flow__node')
await page.waitForTimeout(1000)
r.storedUnchangedAfterReload = await page.evaluate((raw) => localStorage.getItem('cm-workshop-project-px') === raw, raw)
console.log(JSON.stringify(r, null, 2))
await browser.close()

if (r.bannerShown) {
  const ok = r.storedUnchangedAfterDrag && r.storedUnchangedAfterReload && r.backupExists
  console.log(ok ? 'Pause held: nothing was written over the stored board' : 'FAIL: paused but storage changed')
  process.exit(ok ? 0 : 1)
} else {
  console.log('Banner absent: this build loads the fixture intact (break the load path first to test the pause)')
}
