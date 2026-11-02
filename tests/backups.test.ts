/**
 * Pins backupKeysToPrune, the selection behind the one code path that may
 * remove a backup (pruneBackupGenerations). Backups share the browser's
 * storage quota with live saves, so they are bounded to the two most recent
 * generations; this makes sure the bound never picks the wrong ones.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backupKeysToPrune, BACKUP_GENERATIONS_KEPT } from '../src/lib/backup-keys'

const gen = (v: number, ids: string[]) => [
  ...ids.map((id) => `cm-workshop-backup-v${v}-${id}`),
  `cm-workshop-backup-v${v}-projects`,
]
const live = ['cm-workshop-projects', 'cm-workshop-project-a', 'cm-workshop-project-b', 'cm-workshop-current', 'cm-workshop-storage-version', 'cm-workshop-kinds']

test('keeps two generations by default', () => {
  assert.equal(BACKUP_GENERATIONS_KEPT, 2)
})

test('nothing to prune with one generation', () => {
  assert.deepEqual(backupKeysToPrune([...live, ...gen(1, ['a', 'b'])]), [])
})

test('nothing to prune with exactly two generations', () => {
  assert.deepEqual(backupKeysToPrune([...live, ...gen(1, ['a', 'b']), ...gen(2, ['a', 'b'])]), [])
})

test('third generation prunes the oldest, every key of it, nothing else', () => {
  const doomed = backupKeysToPrune([...live, ...gen(1, ['a', 'b']), ...gen(2, ['a', 'b', 'c']), ...gen(3, ['a'])])
  assert.deepEqual(doomed.sort(), gen(1, ['a', 'b']).sort())
})

test('several stale generations all go, newest two stay', () => {
  const doomed = backupKeysToPrune([...gen(1, ['a']), ...gen(2, ['a']), ...gen(3, ['a']), ...gen(4, ['a'])])
  assert.deepEqual(doomed.sort(), [...gen(1, ['a']), ...gen(2, ['a'])].sort())
})

test('live keys are never selected, whatever the generation count', () => {
  const doomed = backupKeysToPrune([...live, ...gen(1, ['a']), ...gen(2, ['a']), ...gen(3, ['a'])])
  for (const k of live) assert.ok(!doomed.includes(k), `${k} must never be pruned`)
})

test('generations are compared numerically, not as strings', () => {
  // "10" > "9" numerically; as strings "9" would sort last and survive wrongly
  const doomed = backupKeysToPrune([...gen(9, ['a']), ...gen(10, ['a']), ...gen(11, ['a'])])
  assert.deepEqual(doomed, gen(9, ['a']))
})

test('keys that only look like backups are ignored', () => {
  const odd = ['cm-workshop-backup-vX-a', 'cm-workshop-backup-', 'backup-v1-a', 'cm-workshop-backup-v1']
  assert.deepEqual(backupKeysToPrune([...odd, ...gen(1, ['a']), ...gen(2, ['a']), ...gen(3, ['a'])]), gen(1, ['a']))
})

test('keep count is honoured', () => {
  const keys = [...gen(1, ['a']), ...gen(2, ['a']), ...gen(3, ['a'])]
  assert.deepEqual(backupKeysToPrune(keys, 3), [])
  assert.deepEqual(backupKeysToPrune(keys, 1).sort(), [...gen(1, ['a']), ...gen(2, ['a'])].sort())
})
