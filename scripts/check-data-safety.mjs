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

// ── 5. New fields on saved data must be optional ────────────────────────
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
