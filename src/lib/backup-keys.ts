/**
 * Which pre-upgrade backup keys are old enough to prune. Pure and free of
 * imports so it can be unit-tested without a browser; projects.ts applies it
 * in pruneBackupGenerations, the one place a backup may be removed.
 */
const BACKUP_KEY_PATTERN = /^cm-workshop-backup-v(\d+)-/

/** How many backup generations to keep. The newest is always one of them. */
export const BACKUP_GENERATIONS_KEPT = 2

/**
 * Given every localStorage key, the backup keys belonging to generations
 * older than the newest `keep`. Non-backup keys are never selected.
 */
export function backupKeysToPrune(keys: string[], keep = BACKUP_GENERATIONS_KEPT): string[] {
  const byVersion = new Map<number, string[]>()
  for (const k of keys) {
    const m = BACKUP_KEY_PATTERN.exec(k)
    if (!m) continue
    const v = Number(m[1])
    byVersion.set(v, [...(byVersion.get(v) ?? []), k])
  }
  const versions = [...byVersion.keys()].sort((a, b) => b - a)
  return versions.slice(keep).flatMap((v) => byVersion.get(v) ?? [])
}
