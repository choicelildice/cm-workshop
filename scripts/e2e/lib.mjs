/**
 * Shared scaffolding for the manual end-to-end scripts in this directory.
 *
 * These scripts drive a real Chrome against a running production build. They
 * use fixed sleeps (waitForTimeout) around the app's 400ms save debounce and
 * React Flow's layout rather than polling for state, which is fine for a
 * script a person runs and reads, and would not be for CI.
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

export const ROOT = new URL('../../', import.meta.url).pathname

/** APP_PASSWORD from .env.local; empty when unset (the app then has no gate). */
export function readPassword() {
  const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  return envText.match(/^APP_PASSWORD=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, '') ?? ''
}

/** Local Google Chrome through playwright-core's channel; no browser download. */
export function launch() {
  return chromium.launch({ channel: 'chrome', headless: true })
}

/**
 * A fresh context and page, logged in and on the board. 1920 wide because the
 * toolbar collapses into a menu under 1760px and hides the add-type input.
 */
export async function openApp(browser, base, { acceptDownloads = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads })
  const page = await context.newPage()
  await page.goto(`${base}/login`)
  if (page.url().includes('/login')) {
    await page.fill('input[name="password"]', readPassword())
    await page.keyboard.press('Enter')
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 })
  }
  await page.waitForSelector('[data-tour="canvas"]')
  return { context, page }
}

/**
 * Fills localStorage with junk under keys the app never reads, in shrinking
 * chunks down to single bytes so essentially nothing is left. Returns the
 * number of junk keys written. Replacing an existing key with a same-sized
 * value still fits in a full store, so an edit meant to fail must grow a board.
 */
export function fillStorage(page) {
  return page.evaluate(() => {
    let n = 0
    for (const size of [256 * 1024, 16 * 1024, 1024, 64, 8, 1]) {
      const chunk = 'x'.repeat(size)
      try { for (;;) { localStorage.setItem(`e2e-junk-${n}`, chunk); n++ } } catch { /* this size no longer fits */ }
    }
    return n
  })
}

/** Removes the junk written by fillStorage. */
export function freeStorage(page) {
  return page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('e2e-junk-')) localStorage.removeItem(k)
  })
}
