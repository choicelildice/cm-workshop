#!/usr/bin/env node
/**
 * End-to-end proof of the pull gesture: dragging Sticky off the field
 * library's stack of notes and onto the board, Miro-style.
 *
 * Mouse (real Playwright input, so pointer capture behaves as in Chrome):
 *   a) a pull lands a sticky where released
 *   b) releasing back over the panel cancels, ghost and hint gone
 *   c) Escape mid-pull cancels even when released on the canvas
 *   d) a plain click on the row still arms click-to-place
 *   e) the click Chrome fires on the row after a pull (pointer capture) does
 *      not arm placement by itself
 *
 * Touch (second context with hasTouch; the gesture is synthetic PointerEvents
 * with pointerType 'touch' dispatched from page.evaluate, because Playwright
 * has no touch drag):
 *   f) pull lands with pointerup dispatched on the element under the finger
 *   g) pull lands with pointerup dispatched on the ROW, as under implicit
 *      touch capture, where every event in the gesture targets the row
 *   h) pointercancel mid-pull leaves no sticky and the row's lifted state
 *      resets
 *   i) a tap after a completed pull does not place a second sticky
 *
 * Usage, against a PRODUCTION build (dev mode double-runs effects):
 *   npm run build && PORT=3123 npm run start &
 *   node scripts/e2e/pull-gesture.mjs            # defaults to http://localhost:3123
 *   node scripts/e2e/pull-gesture.mjs http://localhost:3000
 *
 * Needs Google Chrome installed (launched through playwright-core's `chrome`
 * channel) and APP_PASSWORD in .env.local. Exits non-zero on any failure.
 * Timing relies on fixed sleeps around React state updates and the save
 * debounce (see lib.mjs).
 */
import { launch, openApp } from './lib.mjs'

const base = process.argv[2] ?? 'http://localhost:3123'

const ROW = '[data-tour="sticky"]'
const PANEL = '[data-tour="field-library"]'
const CANVAS = '[data-tour="canvas"]'
const STICKY = '.react-flow__node-sticky'
const HINT = 'text=Release to place'
/** How far the landed sticky may sit from the release point and still count as "where released". */
const LAND_TOLERANCE_PX = 60
const SETTLE_MS = 600

const failures = []
const check = (name, cond, extra) => {
  if (!cond) failures.push(name + (extra ? ` (${extra})` : ''))
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra ? `  [${extra}]` : ''}`)
}

/** An empty board under a fresh project, tour already seen, then the app loaded on it. */
// A fresh project id per scenario: navigating away flushes the previous
// board on pagehide, which would otherwise overwrite a reseeded empty board
// under the same id a moment after it was written.
let seedN = 0
async function seed(page) {
  const id = `g${++seedN}`
  await page.evaluate((id) => {
    localStorage.clear()
    localStorage.setItem('cm-workshop-projects', JSON.stringify([{ id, name: 'Gesture', updatedAt: 1 }]))
    // Two cards far apart, so the fitView that runs after a board loads has
    // something to fit and resolves at load. On an EMPTY board React Flow keeps
    // that fitView queued and fires it on the first node that appears, zooming
    // onto the freshly placed sticky and moving it on screen (pre-existing app
    // behaviour, outside this script's subject). Counts below use the sticky
    // node class, so these cards never interfere.
    localStorage.setItem(`cm-workshop-project-${id}`, JSON.stringify({ nodes: [
      { id: 'c1', type: 'contentType', position: { x: 0, y: 0 }, data: { label: 'Anchor A', fields: [] } },
      { id: 'c2', type: 'contentType', position: { x: 1500, y: 800 }, data: { label: 'Anchor B', fields: [] } },
    ], edges: [] }))
    localStorage.setItem('cm-workshop-current', id)
    localStorage.setItem('cm-workshop-tour-seen', '1')
  }, id)
  await page.goto(`${base}/`)
  await page.waitForSelector(CANVAS)
  await page.waitForSelector(ROW)
  await page.waitForTimeout(400)
}

const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/** Screen points for one gesture: the row centre, a landing spot deep in the canvas, a spot back on the panel. */
async function points(page) {
  const row = await page.locator(ROW).boundingBox()
  const canvas = await page.locator(CANVAS).boundingBox()
  const panel = await page.locator(PANEL).boundingBox()
  return {
    row: centre(row),
    land: { x: canvas.x + canvas.width * 0.6, y: canvas.y + canvas.height * 0.6 },
    panel: { x: panel.x + panel.width * 0.5, y: panel.y + panel.height * 0.15 },
  }
}

const stickyCount = (page) => page.locator(STICKY).count()

/**
 * Distance from the release point to the landed sticky. The node's top-left
 * is what placeStickyAt puts at the release point (the ghost hangs off the
 * cursor the same way), so that corner is what is compared.
 */
async function landedOffset(page, release) {
  const box = await page.locator(STICKY).first().boundingBox()
  if (!box) return Infinity
  return Math.hypot(box.x - release.x, box.y - release.y)
}

/** A real mouse pull from the row to `to`, with a short first hop so the pull threshold is crossed over the row. */
async function mousePull(page, from, to, { escapeMidway = false } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 12, from.y + 2, { steps: 2 })
  await page.waitForTimeout(80)
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.waitForTimeout(80)
  if (escapeMidway) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(80)
  }
  await page.mouse.up()
  await page.waitForTimeout(SETTLE_MS)
}

/**
 * Dispatches one synthetic touch PointerEvent. `target` is 'under' (the
 * element under the point, as a non-capturing browser would target) or 'row'
 * (the sidebar row, as implicit touch capture targets everything).
 */
function dispatchTouch(page, type, point, target, extra = {}) {
  return page.evaluate(({ type, point, target, extra, ROW }) => {
    const el = target === 'row' ? document.querySelector(ROW) : document.elementFromPoint(point.x, point.y)
    if (!el) return null
    const ev = new PointerEvent(type, {
      pointerType: 'touch',
      pointerId: 7,
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x,
      screenY: point.y,
      ...extra,
    })
    el.dispatchEvent(ev)
    return el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '')
  }, { type, point, target, extra, ROW })
}

/**
 * A synthetic touch pull: pointerdown on the row, a short hop over the row to
 * cross the pull threshold, ~10 moves to `to`, then either pointerup (at `to`,
 * targeted per `upTarget`) or pointercancel. Moves target the element under
 * each point unless `moveTarget` is 'row'.
 */
async function touchPull(page, from, to, { upTarget = 'under', moveTarget = 'under', cancel = false } = {}) {
  await dispatchTouch(page, 'pointerdown', from, 'row', { button: 0, buttons: 1 })
  await page.waitForTimeout(30)
  // The hop is still over the row, so it targets the row either way
  const hop = { x: from.x + 12, y: from.y + 2 }
  await dispatchTouch(page, 'pointermove', hop, 'row', { button: -1, buttons: 1 })
  await page.waitForTimeout(30)
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    const p = { x: hop.x + ((to.x - hop.x) * i) / steps, y: hop.y + ((to.y - hop.y) * i) / steps }
    await dispatchTouch(page, 'pointermove', p, moveTarget, { button: -1, buttons: 1 })
    await page.waitForTimeout(15)
  }
  if (cancel) {
    await dispatchTouch(page, 'pointercancel', to, 'row', { button: 0, buttons: 0 })
  } else {
    await dispatchTouch(page, 'pointerup', to, upTarget, { button: 0, buttons: 0 })
  }
  await page.waitForTimeout(SETTLE_MS)
}

/** True while some element inside the row carries the lifted glyph's inline `opacity: 0`. */
const rowLifted = (page) =>
  page.evaluate((ROW) => {
    const row = document.querySelector(ROW)
    if (!row) return null
    return Array.from(row.querySelectorAll('*')).some((el) => el.style && el.style.opacity === '0')
  }, ROW)

const browser = await launch()

// ---------------------------------------------------------------- mouse
{
  const { context, page } = await openApp(browser, base)
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e)))

  // a) pull lands where released
  await seed(page)
  let pt = await points(page)
  await mousePull(page, pt.row, pt.land)
  let n = await stickyCount(page)
  let off = await landedOffset(page, pt.land)
  check('a) mouse pull: exactly one sticky placed', n === 1, `count=${n}`)
  check(`a) mouse pull: sticky lands within ${LAND_TOLERANCE_PX}px of the release point`, off <= LAND_TOLERANCE_PX, `offset=${off.toFixed(1)}px`)
  check('a) mouse pull: hint gone after release', (await page.locator(HINT).count()) === 0)

  // e) Under pointer capture both pointerdown and pointerup target the row, so
  //    Chrome dispatches `click` on the row after the pull above even though
  //    the mouse was released over the board. The row suppresses that click
  //    (pulledRef) so it must not arm click-to-place; a following click on the
  //    canvas therefore places nothing.
  await page.mouse.click(pt.land.x - 150, pt.land.y - 150)
  await page.waitForTimeout(SETTLE_MS)
  n = await stickyCount(page)
  check('e) click on canvas after a completed pull places nothing more', n === 1, `count=${n}`)
  check('e) no click-to-place hint armed after the pull', (await page.locator('text=Click to place').count()) === 0)

  // b) release back over the panel cancels
  await seed(page)
  pt = await points(page)
  await page.mouse.move(pt.row.x, pt.row.y)
  await page.mouse.down()
  await page.mouse.move(pt.row.x + 12, pt.row.y + 2, { steps: 2 })
  await page.mouse.move(pt.land.x, pt.land.y, { steps: 10 })
  await page.waitForTimeout(80)
  const hintMidPull = await page.locator(HINT).count()
  await page.mouse.move(pt.panel.x, pt.panel.y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(SETTLE_MS)
  n = await stickyCount(page)
  check('b) hint visible mid-pull', hintMidPull === 1, `count=${hintMidPull}`)
  check('b) release over the panel: no sticky placed', n === 0, `count=${n}`)
  check('b) release over the panel: hint gone', (await page.locator(HINT).count()) === 0)
  check('b) release over the panel: row no longer lifted', (await rowLifted(page)) === false)

  // c) Escape mid-pull cancels even if released over the canvas
  await seed(page)
  pt = await points(page)
  await mousePull(page, pt.row, pt.land, { escapeMidway: true })
  n = await stickyCount(page)
  check('c) Escape mid-pull then release on canvas: no sticky placed', n === 0, `count=${n}`)
  check('c) Escape mid-pull: hint gone', (await page.locator(HINT).count()) === 0)

  // d) a plain click still arms click-to-place
  await seed(page)
  pt = await points(page)
  await page.mouse.click(pt.row.x, pt.row.y)
  await page.waitForTimeout(200)
  await page.mouse.move(pt.land.x, pt.land.y, { steps: 5 })
  await page.waitForTimeout(100)
  const armedHint = await page.locator('text=Click to place').count()
  await page.mouse.click(pt.land.x, pt.land.y)
  await page.waitForTimeout(SETTLE_MS)
  n = await stickyCount(page)
  off = await landedOffset(page, pt.land)
  check('d) click on row arms click-to-place (hint shows)', armedHint === 1, `count=${armedHint}`)
  check('d) click-to-place: exactly one sticky placed', n === 1, `count=${n}`)
  check(`d) click-to-place: sticky lands within ${LAND_TOLERANCE_PX}px of the click`, off <= LAND_TOLERANCE_PX, `offset=${off.toFixed(1)}px`)

  if (pageErrors.length) console.log(`info: mouse context page errors:\n  ${pageErrors.join('\n  ')}`)
  await context.close()
}

// ---------------------------------------------------------------- touch
{
  const { context, page } = await openApp(browser, base, { hasTouch: true })
  const pageErrors = []
  // Synthetic pointer events have no active pointer behind them, so a
  // setPointerCapture(pointerId) in the row's pointerdown handler throws
  // NotFoundError in Chrome. Reported as info, not as a failure: the real
  // gesture never hits it.
  page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e)))

  check('touch context reports a touchscreen', (await page.evaluate(() => navigator.maxTouchPoints > 0)) === true)

  // f) pull lands, pointerup dispatched on the element under the finger
  await seed(page)
  let pt = await points(page)
  await touchPull(page, pt.row, pt.land, { upTarget: 'under' })
  let n = await stickyCount(page)
  let off = await landedOffset(page, pt.land)
  check('f) touch pull (pointerup on pane): exactly one sticky placed', n === 1, `count=${n}`)
  check(`f) touch pull (pointerup on pane): lands within ${LAND_TOLERANCE_PX}px`, off <= LAND_TOLERANCE_PX, `offset=${off.toFixed(1)}px`)
  // No lifted-state check here: with the release dispatched on the pane the
  // row never hears it. A real touch pointer is implicitly captured by the row
  // and does deliver it; scenario g covers that.

  // i) a tap after the completed pull places nothing. Real touch via
  //    Playwright's touchscreen, which also fires the compat mouse events and
  //    click a finger would.
  await page.touchscreen.tap(pt.land.x - 160, pt.land.y - 160)
  await page.waitForTimeout(SETTLE_MS)
  n = await stickyCount(page)
  check('i) tap after a completed touch pull places nothing more', n === 1, `count=${n}`)
  // ...and the same with a synthetic touch down/up pair with no movement
  const tapAt = { x: pt.land.x - 160, y: pt.land.y + 120 }
  await dispatchTouch(page, 'pointerdown', tapAt, 'under', { button: 0, buttons: 1 })
  await dispatchTouch(page, 'pointerup', tapAt, 'under', { button: 0, buttons: 0 })
  await page.waitForTimeout(SETTLE_MS)
  n = await stickyCount(page)
  check('i) synthetic pointerdown+pointerup on canvas after a pull places nothing more', n === 1, `count=${n}`)

  // g) pull lands with every event, including pointerup, targeted at the row
  //    (implicit touch capture) but carrying canvas coordinates
  await seed(page)
  pt = await points(page)
  await touchPull(page, pt.row, pt.land, { upTarget: 'row', moveTarget: 'row' })
  n = await stickyCount(page)
  off = await landedOffset(page, pt.land)
  check('g) touch pull (pointerup on row, implicit capture): exactly one sticky placed', n === 1, `count=${n}`)
  check(`g) touch pull (pointerup on row): lands within ${LAND_TOLERANCE_PX}px`, off <= LAND_TOLERANCE_PX, `offset=${off.toFixed(1)}px`)

  // h) pointercancel mid-pull: nothing placed, row back together
  await seed(page)
  pt = await points(page)
  await dispatchTouch(page, 'pointerdown', pt.row, 'row', { button: 0, buttons: 1 })
  await dispatchTouch(page, 'pointermove', { x: pt.row.x + 12, y: pt.row.y + 2 }, 'row', { button: -1, buttons: 1 })
  await dispatchTouch(page, 'pointermove', { x: pt.row.x + 300, y: pt.row.y + 200 }, 'row', { button: -1, buttons: 1 })
  await page.waitForTimeout(120)
  const liftedMidPull = await rowLifted(page)
  const hintMidPull = await page.locator(HINT).count()
  await touchPull(page, pt.row, pt.land, { cancel: true })
  n = await stickyCount(page)
  check('h) touch pull: row lifted mid-pull', liftedMidPull === true)
  check('h) touch pull: hint visible mid-pull', hintMidPull === 1, `count=${hintMidPull}`)
  check('h) pointercancel mid-pull: no sticky placed', n === 0, `count=${n}`)
  check('h) pointercancel mid-pull: row lifted state reset', (await rowLifted(page)) === false)
  check('h) pointercancel mid-pull: hint gone', (await page.locator(HINT).count()) === 0)

  if (pageErrors.length) console.log(`info: touch context page errors:\n  ${pageErrors.join('\n  ')}`)
  await context.close()
}

await browser.close()

if (failures.length) {
  console.log(`\n${failures.length} FAILED:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log('\nAll pull gesture checks passed')
