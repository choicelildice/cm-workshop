#!/usr/bin/env node
/**
 * Guards the one invariant that matters most in this app: a customer's saved
 * boards are the only copy of their work, and nothing we add may erase them.
 *
 * This is a static check, not a unit test. It fails the build when a change
 * introduces a way to destroy stored data without going through a reviewed
 * path, which is the failure mode a test suite tends to miss because the
 * dangerous call looks innocuous at the call site.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../src', import.meta.url).pathname

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
  })
}

const files = walk(SRC)
const problems = []
const rel = (f) => f.slice(SRC.length + 1)

// ── 1. Nothing may wipe storage wholesale ──────────────────────────────
// Individual removeItem calls are judged by WHICH key they remove (below);
// clearing everything or dropping the database can never be right here.
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const [i, line] of src.split('\n').entries()) {
    if (/^\s*(\/\/|\*)/.test(line)) continue
    if (/localStorage\.clear\(\)|sessionStorage\.clear\(\)|indexedDB\.deleteDatabase/.test(line)) {
      problems.push(`${rel(f)}:${i + 1} wipes storage wholesale`)
    }
  }
}

// ── 2. Board and project-index keys are off limits ─────────────────────
// Credentials, tokens and the kinds config are fine to remove anywhere; a
// board or the index that lists them is not.
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const [i, line] of src.split('\n').entries()) {
    if (/^\s*(\/\/|\*)/.test(line)) continue
    const removal = line.match(/removeItem\(\s*([^)]*)\)/)
    if (!removal) continue
    const arg = removal[1]

    if (/cm-workshop-projects/.test(arg)) {
      problems.push(`${rel(f)}:${i + 1} removes the project index`)
    }
    // dataKey(id) and the literal prefix both address a board. Legitimate only
    // inside deleteProject.
    if (/cm-workshop-project-|dataKey\(/.test(arg) && rel(f) !== 'lib/projects.ts') {
      problems.push(`${rel(f)}:${i + 1} removes a project board outside projects.ts`)
    }
  }
}

// Pre-upgrade backups exist for the case where the code is wrong, so code
// may remove them in exactly one place: pruneBackupGenerations, which keeps
// the two most recent generations so backups cannot starve live saves of
// quota. Its selection is pure and unit-tested (backupKeysToPrune). Any
// other removal of a backup key, or of the version marker, fails the build.
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const [i, line] of src.split('\n').entries()) {
    if (/^\s*(\/\/|\*)/.test(line)) continue
    const removal = line.match(/removeItem\(\s*([^)]*)\)/)
    if (removal && /cm-workshop-backup-|cm-workshop-storage-version|backupKey\(|backupIndexKey\(|VERSION_KEY/.test(removal[1])) {
      problems.push(`${rel(f)}:${i + 1} removes a pre-upgrade backup or the storage version marker`)
    }
  }
}
{
  const projectsSrc = readFileSync(join(SRC, 'lib/projects.ts'), 'utf8')
  const pruneBody = projectsSrc.match(/export function pruneBackupGenerations\(\)[\s\S]*?\n\}/)?.[0] ?? ''
  const pruneRemovals = [...pruneBody.matchAll(/removeItem\(/g)].length
  const genericRemovals = [...projectsSrc.matchAll(/removeItem\(\s*k\s*\)/g)].length
  if (pruneRemovals !== 1) {
    problems.push('lib/projects.ts: pruneBackupGenerations must contain exactly one removeItem (found ' + pruneRemovals + ')')
  }
  if (genericRemovals !== pruneRemovals) {
    problems.push('lib/projects.ts: a loop removes keys outside pruneBackupGenerations')
  }
  if (!/pruneBackupGenerations\(\)/.test(projectsSrc.split('export function pruneBackupGenerations')[0].split('localStorage.setItem(VERSION_KEY')[1] ?? '')) {
    problems.push('lib/projects.ts: pruning must run only AFTER the version marker is written in snapshotBeforeUpgrade')
  }
  if (!/backupKeysToPrune\(keys\)/.test(pruneBody)) {
    problems.push('lib/projects.ts: pruneBackupGenerations must select keys through backupKeysToPrune (the tested selector)')
  }
}

// deleteProject is the only function allowed to remove a board
const projectsSrc = readFileSync(join(SRC, 'lib/projects.ts'), 'utf8')
const boardRemovals = [...projectsSrc.matchAll(/removeItem\(\s*dataKey\(/g)].length
const insideDelete = /export function deleteProject[\s\S]*?removeItem\(\s*dataKey\(/.test(projectsSrc)
if (boardRemovals > 0 && !insideDelete) {
  problems.push('lib/projects.ts: a board is removed outside deleteProject')
}
if (boardRemovals > 1) {
  problems.push(`lib/projects.ts: ${boardRemovals} places remove a board; expected only deleteProject`)
}

// A pre-projects board (LEGACY_NODES/EDGES) is the only copy until its
// adoption into a project has been written. Its keys may be removed only in
// adoptLegacyBoard, and only after write() confirmed the copy landed.
{
  const adopt = projectsSrc.match(/function adoptLegacyBoard\(\)[\s\S]*?\n\}/)?.[0] ?? ''
  const legacyRemovals = [...projectsSrc.matchAll(/removeItem\(\s*LEGACY_(NODES|EDGES)\s*\)/g)].length
  const inAdopt = [...adopt.matchAll(/removeItem\(\s*LEGACY_(NODES|EDGES)\s*\)/g)].length
  if (legacyRemovals !== inAdopt || inAdopt === 0) {
    problems.push('lib/projects.ts: legacy board keys are removed outside adoptLegacyBoard')
  }
  const writeCheck = adopt.indexOf('if (!write(dataKey(meta.id)')
  const removal = adopt.indexOf('removeItem(LEGACY_NODES)')
  if (writeCheck === -1 || removal === -1 || writeCheck > removal) {
    problems.push('lib/projects.ts: adoptLegacyBoard must check write() succeeded BEFORE removing the legacy keys')
  }
}

// ── 3. The empty-overwrite guard must stay in place ─────────────────────
const projects = readFileSync(join(SRC, 'lib/projects.ts'), 'utf8')
if (!/incomingEmpty\s*&&\s*!opts\.allowEmpty/.test(projects)) {
  problems.push('lib/projects.ts: saveProjectData no longer refuses to overwrite content with an empty board')
}
if (!/lastRefusedSave/.test(projects)) {
  problems.push('lib/projects.ts: the refused-save record is gone')
}

// ── 4. Image cleanup must consider every project, not just the open one ─
const canvas = readFileSync(join(SRC, 'components/Canvas.tsx'), 'utf8')
if (/deleteImages\(/.test(canvas) && !/allImageNodeIds\(\)/.test(canvas)) {
  problems.push(
    'components/Canvas.tsx: deletes image blobs without unioning ids across all projects, ' +
      'which would destroy other projects images'
  )
}

// ── 4b. Anything that must see EVERY board enumerates by key prefix ─────
// The project index is one more JSON value that can be corrupt, and read()
// turns a corrupt index into an empty list. Backups, export and image-blob
// cleanup must therefore find boards through allBoardIds(), never the index.
{
  const bodyOf = (name) => projects.match(new RegExp(`export function ${name}\\([^)]*\\)[\\s\\S]*?\\n\\}`))?.[0] ?? ''
  for (const fn of ['snapshotBeforeUpgrade', 'exportAllBoards', 'allImageNodeIds']) {
    const body = bodyOf(fn)
    if (!/allBoardIds\(\)/.test(body) || /listProjects\(\)|read<ProjectMeta\[\]>\(INDEX_KEY/.test(body.replace(/const index = read<ProjectMeta\[\]>\(INDEX_KEY, \[\]\)/, ''))) {
      problems.push(`lib/projects.ts: ${fn} must enumerate boards with allBoardIds(), not through the project index`)
    }
  }
}

// ── 5. The load must be checked for integrity, after a snapshot ─────────
// Canvas must compare what it loaded against what was stored and pause saving
// on a mismatch, and WorkshopApp must snapshot every board before the first
// code path that can write one runs.
if (!/checkLoadIntegrity\(/.test(canvas) || !/savePausedRef\.current\s*=\s*true/.test(canvas)) {
  problems.push('components/Canvas.tsx: boards are no longer integrity-checked on load (checkLoadIntegrity + savePausedRef)')
}
const app = readFileSync(join(SRC, 'components/WorkshopApp.tsx'), 'utf8')
const snapAt = app.indexOf('snapshotBeforeUpgrade()')
const ensureAt = app.indexOf('ensureCurrentProject(')
if (snapAt === -1 || ensureAt === -1 || snapAt > ensureAt) {
  problems.push('components/WorkshopApp.tsx: snapshotBeforeUpgrade() must run before ensureCurrentProject()')
}

// ── 6. A failed save must never be silent ───────────────────────────────
// write() reports failure, saveProjectData surfaces it as 'storage-failed',
// and Canvas routes it to the banner as 'write-failed'. If any link breaks, a
// full store would leave the board on screen newer than storage with no sign.
if (!/function write\(key: string, value: unknown\): boolean/.test(projects) || !/reason: 'storage-failed'/.test(projects)) {
  problems.push('lib/projects.ts: write() no longer reports failure, or saveProjectData no longer surfaces it')
}
if (!/status: 'write-failed'/.test(canvas) || /\bsaveProjectData\(target|\bsaveProjectData\(previous/.test(canvas)) {
  problems.push('components/Canvas.tsx: board writes must go through persist() so a storage failure reaches the banner')
}
// Writes that do not go through Canvas (new/duplicate project, share open,
// sample, legacy adoption) are covered by write() firing STORAGE_FAILED_EVENT
// and WorkshopApp listening for it.
if (!/dispatchEvent\([\s\S]*?STORAGE_FAILED_EVENT/.test(projects)) {
  problems.push('lib/projects.ts: write() no longer fires STORAGE_FAILED_EVENT on a refused write')
}
{
  const appSrc = readFileSync(join(SRC, 'components/WorkshopApp.tsx'), 'utf8')
  if (!/addEventListener\(STORAGE_FAILED_EVENT/.test(appSrc)) {
    problems.push('components/WorkshopApp.tsx: nothing listens for STORAGE_FAILED_EVENT, so failed non-Canvas writes are silent')
  }
}

// ── 7. New fields on saved data must be optional ────────────────────────
// A required field breaks every board saved before it existed.
const types = readFileSync(join(SRC, 'lib/types.ts'), 'utf8')
const contentField = types.match(/export interface ContentField \{([^}]*)\}/s)?.[1] ?? ''
for (const line of contentField.split('\n')) {
  const m = line.match(/^\s*(\w+)\s*:/)
  // id, name, type, required, isArray predate persistence and are always written
  if (m && !['id', 'name', 'type', 'required', 'isArray'].includes(m[1])) {
    problems.push(
      `lib/types.ts: ContentField.${m[1]} is required; fields added after launch must be optional ` +
        'or boards saved earlier will not load'
    )
  }
}

if (problems.length) {
  console.error('\nData-safety check FAILED:\n')
  for (const p of problems) console.error('  ' + p)
  console.error('\nBoards live only in the user’s browser and a customer is using this.')
  console.error('If a change here is genuinely intended, update scripts/check-data-safety.mjs.\n')
  process.exit(1)
}

console.log('Data-safety check passed')
