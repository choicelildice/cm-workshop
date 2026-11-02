import { v4 as uuidv4 } from 'uuid'
import { backupKeysToPrune } from './backup-keys'

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
  /**
   * Which saved space connection (see space-connections.ts) this project
   * last imported from or exported to, so reopening it re-selects the
   * right one instead of blank/last-typed fields. Optional: every project
   * saved before this existed simply has none, which just means "no
   * remembered connection yet" — never breaks loading or saving.
   */
  spaceConnectionId?: string
}

export interface ProjectData {
  nodes: unknown[]
  edges: unknown[]
}

const INDEX_KEY = 'cm-workshop-projects'
const CURRENT_KEY = 'cm-workshop-current'
const BOARD_KEY_PREFIX = 'cm-workshop-project-'
const dataKey = (id: string) => `${BOARD_KEY_PREFIX}${id}`

/**
 * Every board actually in storage, found by key prefix rather than through
 * the project index. The index is one more JSON value that can be corrupt or
 * out of step, and read() turns a corrupt index into an empty list; anything
 * that must see EVERY board (backups, export, image-blob cleanup) enumerates
 * this way so a broken index cannot hide boards from it.
 */
function allBoardIds(): string[] {
  if (!available()) return []
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(BOARD_KEY_PREFIX))
      .map((k) => k.slice(BOARD_KEY_PREFIX.length))
  } catch {
    return []
  }
}

/**
 * Storage version. Bump this whenever a release changes how boards are read
 * or written. On the first run under a new version, snapshotBeforeUpgrade
 * copies every board to a backup key before any save can happen, so a load
 * bug in the new code can never be the only copy's last word.
 *
 * Each bump leaves one more full copy of every board behind. Backups share
 * the browser's ~5MB quota with live saves, and a live save losing that
 * contest is the worse outcome, so generations are pruned to the two most
 * recent by pruneBackupGenerations: the one place a backup may be removed
 * (check-data-safety allowlists exactly that function), and only after the
 * new snapshot has fully succeeded and its marker is written.
 *
 * History: 1 = everything before Nov 2026. 2 = integrity check + backups.
 */
export const STORAGE_VERSION = 2
const VERSION_KEY = 'cm-workshop-storage-version'
const backupKey = (fromVersion: number, id: string) => `cm-workshop-backup-v${fromVersion}-${id}`
const backupIndexKey = (fromVersion: number) => `cm-workshop-backup-v${fromVersion}-projects`

// Pre-projects storage, migrated into a project on first run
const LEGACY_NODES = 'cm-workshop-nodes'
const LEGACY_EDGES = 'cm-workshop-edges'

function available(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function read<T>(key: string, fallback: T): T {
  if (!available()) return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Why the last write failed, for the banner. */
let lastWriteError: string | null = null

/**
 * Fired on window whenever storage refuses a write from this module, with
 * { key, detail }. Every board write in the app goes through write(), so
 * listening to this one event (WorkshopApp does) means no failed save is
 * silent, whichever caller made it: Canvas's autosave, a new or duplicated
 * project, a share link being opened, the sample board, a legacy adoption.
 * Callers that can act on a failure (Canvas, the share flow) also get the
 * boolean; the event is the floor beneath them.
 */
export const STORAGE_FAILED_EVENT = 'cm-workshop:storage-failed'
export interface StorageFailedDetail {
  key: string
  detail: string
}

/**
 * Writes one key. Returns false, and records why, when storage refused it
 * (quota exceeded or unavailable). Callers that persist a board must check
 * this: a save that fails silently leaves the board on screen newer than the
 * stored copy with nothing telling the user, which is the worst outcome
 * this module can produce.
 */
function write(key: string, value: unknown): boolean {
  if (!available()) return false
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    lastWriteError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    try {
      window.dispatchEvent(
        new CustomEvent<StorageFailedDetail>(STORAGE_FAILED_EVENT, { detail: { key, detail: lastWriteError } })
      )
    } catch {
      // no window (SSR) or CustomEvent unavailable; the boolean still reports it
    }
    return false
  }
}

export function listProjects(): ProjectMeta[] {
  return read<ProjectMeta[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt)
}

function writeIndex(projects: ProjectMeta[]): void {
  write(INDEX_KEY, projects)
}

export function loadProjectData(id: string): ProjectData | null {
  return read<ProjectData | null>(dataKey(id), null)
}

/**
 * Refused overwrite: a save that would empty a project that currently has
 * content. Exposed for diagnostics; there is no legitimate path that does this.
 */
let lastRefusedSave: { id: string; had: number; at: number } | null = null
export const getLastRefusedSave = () => lastRefusedSave

export type SaveResult =
  | { ok: true }
  /** The empty-board guard declined; the stored board is unchanged. */
  | { ok: false; reason: 'refused-empty' }
  /** Storage refused the write; the stored board is unchanged and now stale. */
  | { ok: false; reason: 'storage-failed'; detail: string }

/**
 * Writes a project's board.
 *
 * Refuses to replace a board that has content with an empty one. Clearing a
 * board is a real user action, but it routes through clearBoard on a board the
 * user is looking at; a save arriving with zero nodes for a project that has
 * some is far more likely to be a bug upstream (a load that raced, a switch
 * that half-applied) than an intention. Since the only copy of a customer's
 * work lives in their browser, the safe default is to decline and keep the
 * existing data.
 *
 * Emptying a board deliberately still works: the in-memory board becomes empty
 * and `allowEmpty` is passed by the paths that mean it.
 */
export function saveProjectData(
  id: string,
  data: ProjectData,
  opts: { allowEmpty?: boolean } = {}
): SaveResult {
  const incomingEmpty = (data.nodes?.length ?? 0) === 0
  if (incomingEmpty && !opts.allowEmpty) {
    const existing = loadProjectData(id)
    const had = existing?.nodes?.length ?? 0
    if (had > 0) {
      lastRefusedSave = { id, had, at: Date.now() }
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[cm-workshop] Refused to overwrite project ${id} (${had} nodes) with an empty board. ` +
            'Pass allowEmpty if this was deliberate.'
        )
      }
      return { ok: false, reason: 'refused-empty' }
    }
  }

  if (!write(dataKey(id), data)) {
    return { ok: false, reason: 'storage-failed', detail: lastWriteError ?? 'storage unavailable' }
  }
  const projects = read<ProjectMeta[]>(INDEX_KEY, [])
  const i = projects.findIndex((p) => p.id === id)
  if (i !== -1) {
    projects[i] = { ...projects[i], updatedAt: Date.now() }
    writeIndex(projects)
  }
  return { ok: true }
}

export function createProject(name: string): ProjectMeta {
  const meta: ProjectMeta = { id: uuidv4(), name: name.trim() || 'Untitled', updatedAt: Date.now() }
  writeIndex([...read<ProjectMeta[]>(INDEX_KEY, []), meta])
  write(dataKey(meta.id), { nodes: [], edges: [] })
  return meta
}

export function renameProject(id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const projects = read<ProjectMeta[]>(INDEX_KEY, [])
  const i = projects.findIndex((p) => p.id === id)
  if (i === -1) return
  projects[i] = { ...projects[i], name: trimmed, updatedAt: Date.now() }
  writeIndex(projects)
}

/** Which saved space connection (if any) this project last used. */
export function getProjectSpaceConnection(id: string): string | undefined {
  return read<ProjectMeta[]>(INDEX_KEY, []).find((p) => p.id === id)?.spaceConnectionId
}

/**
 * Remembers which saved space connection a project last used, so reopening
 * it re-selects the right one in Import/Export. Deliberately does not bump
 * updatedAt — picking a space connection isn't a change to the board's
 * content, and bumping it would reorder the project list in ProjectMenu
 * just from opening an export modal.
 */
export function setProjectSpaceConnection(id: string, spaceConnectionId: string | undefined): void {
  const projects = read<ProjectMeta[]>(INDEX_KEY, [])
  const i = projects.findIndex((p) => p.id === id)
  if (i === -1) return
  projects[i] = { ...projects[i], spaceConnectionId }
  writeIndex(projects)
}

export function deleteProject(id: string): void {
  writeIndex(read<ProjectMeta[]>(INDEX_KEY, []).filter((p) => p.id !== id))
  if (available()) {
    try {
      localStorage.removeItem(dataKey(id))
    } catch {
      // ignore
    }
  }
}

/**
 * Copies a project's layout under a new name. Image node ids are intentionally
 * kept, so both projects point at the same (immutable) IndexedDB blob. Since
 * blob cleanup unions image ids across every project, neither copy can delete
 * an image the other still uses.
 */
export function duplicateProject(id: string, name: string): ProjectMeta | null {
  const data = loadProjectData(id)
  if (!data) return null
  const meta = createProject(name)
  write(dataKey(meta.id), data)
  return meta
}

/**
 * Creates a NEW project from shared data. Never overwrites an existing one:
 * opening a share link must not be able to destroy the recipient's work, so a
 * name collision gets a suffix rather than replacing anything.
 */
export function createProjectFromShare(name: string, data: ProjectData): ProjectMeta {
  const existing = listProjects()
  let finalName = name.trim() || 'Shared board'
  if (existing.some((p) => p.name === finalName)) {
    let i = 2
    while (existing.some((p) => p.name === `${finalName} (${i})`)) i++
    finalName = `${finalName} (${i})`
  }
  const meta = createProject(finalName)
  write(dataKey(meta.id), data)
  return meta
}

/**
 * Overwrites an EXISTING project's board with shared data, keeping its id
 * (and so its place in the project list). For when a recipient opens the same
 * link twice and wants the reopened link to update their existing copy
 * instead of piling up another "(2)" project. This is an explicit user choice
 * made in ShareOpenPrompt, never an automatic behaviour.
 */
export function replaceProjectFromShare(id: string, data: ProjectData): SaveResult {
  return saveProjectData(id, data)
}

export function getCurrentProjectId(): string | null {
  if (!available()) return null
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

export function setCurrentProjectId(id: string): void {
  if (!available()) return
  try {
    localStorage.setItem(CURRENT_KEY, id)
  } catch {
    // ignore
  }
}

/**
 * Every image node id referenced by ANY project. Blob cleanup must use this
 * rather than the open board, or switching projects would delete the images
 * belonging to all the others.
 */
export function allImageNodeIds(): Set<string> {
  const ids = new Set<string>()
  // By key prefix, not the index: an unlisted board's images must survive too
  for (const id of allBoardIds()) {
    const data = loadProjectData(id)
    if (!data?.nodes) continue
    for (const n of data.nodes as { id?: string; type?: string }[]) {
      if (n?.type === 'image' && n.id) ids.add(n.id)
    }
  }
  return ids
}

/** Finds a project by name, for locating the sample board. */
export function findProjectByName(name: string): ProjectMeta | undefined {
  return listProjects().find((p) => p.name === name)
}

/**
 * Creates a project with given contents. Used for the sample board; suffixes a
 * name collision rather than overwriting, like createProjectFromShare.
 */
export function createProjectWithData(name: string, data: ProjectData): ProjectMeta {
  return createProjectFromShare(name, data)
}

/**
 * Snapshots every board before this release's code can write to any of them.
 *
 * Runs once per storage version, before ensureCurrentProject, so it sees
 * storage exactly as the previous release left it. Copies the raw strings
 * rather than parsing and re-serialising, so a backup is byte-identical to
 * what it protects. An existing backup for the same version is never
 * overwritten: if the marker failed to write last time, a later run must not
 * replace a pristine snapshot with a board the new code has since touched.
 *
 * Nothing in the app removes a backup key (check-data-safety enforces this).
 * Boards are a few kilobytes, so the cost is negligible; if a write does hit
 * the quota, the marker is left unset so the next load tries again, and
 * nothing else is affected.
 *
 * Returns what was done, for logging, or null when there was nothing to do.
 */
export function snapshotBeforeUpgrade(): { fromVersion: number; copied: number; alreadyBackedUp: number; pruned: number } | null {
  if (!available()) return null
  let seen: number
  try {
    const raw = localStorage.getItem(VERSION_KEY)
    seen = raw === null ? 1 : Number(raw)
  } catch {
    return null
  }
  if (!Number.isFinite(seen) || seen < 1) seen = 1
  if (seen >= STORAGE_VERSION) return null

  // Copies made this run versus boards a previous (interrupted) run had
  // already saved, so the log line after a quota retry does not over-report
  let copied = 0
  let alreadyBackedUp = 0
  try {
    // Every board key, not the index: a corrupt index must not mean "no boards"
    for (const id of allBoardIds()) {
      const raw = localStorage.getItem(dataKey(id))
      if (raw === null) continue
      const key = backupKey(seen, id)
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, raw)
        copied++
      } else {
        alreadyBackedUp++
      }
    }
    const rawIndex = localStorage.getItem(INDEX_KEY)
    if (rawIndex !== null && localStorage.getItem(backupIndexKey(seen)) === null) {
      localStorage.setItem(backupIndexKey(seen), rawIndex)
    }
    // A pre-projects single board, if this browser never ran the projects
    // migration, is backed up too; ensureCurrentProject removes the originals.
    for (const legacy of [LEGACY_NODES, LEGACY_EDGES]) {
      const raw = localStorage.getItem(legacy)
      const key = backupKey(seen, legacy)
      if (raw !== null && localStorage.getItem(key) === null) localStorage.setItem(key, raw)
    }
    localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION))
  } catch {
    // Quota or storage failure mid-way: leave the marker unset so this runs
    // again next load. Whatever was copied stays; nothing was removed.
    return null
  }
  // Only now, with the new generation complete and recorded, drop the old
  const pruned = pruneBackupGenerations().length
  return { fromVersion: seen, copied, alreadyBackedUp, pruned }
}

/**
 * Keeps the two most recent backup generations so backups cannot grow without
 * bound and starve live saves of quota. This is the one function that may
 * remove a backup; check-data-safety fails the build if a backup key is
 * removed anywhere else. Called from snapshotBeforeUpgrade after the new
 * generation is fully written and the marker set, never before, so a complete
 * generation always exists.
 */
export function pruneBackupGenerations(): string[] {
  if (!available()) return []
  let keys: string[]
  try {
    keys = Object.keys(localStorage)
  } catch {
    return []
  }
  const doomed = backupKeysToPrune(keys)
  for (const k of doomed) {
    try {
      localStorage.removeItem(k)
    } catch {
      // ignore; a stale backup that lingers is harmless
    }
  }
  return doomed
}

/**
 * Every project with its board, as one JSON document, for the "Download all
 * boards" action. The only way to get a copy of the work off the machine it
 * was made on. Images are not included: their blobs live in IndexedDB and
 * are megabytes each; the image nodes themselves (position, label) are.
 */
export function exportAllBoards(): { filename: string; json: string } {
  // Boards by key prefix, so an unlisted board is exported too; its meta is
  // null when the index does not know it. If the index itself is unreadable,
  // its raw text goes in the file rather than being silently dropped.
  const index = read<ProjectMeta[]>(INDEX_KEY, [])
  let indexRaw: string | null = null
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (raw !== null) {
      try {
        JSON.parse(raw)
      } catch {
        indexRaw = raw
      }
    }
  } catch {
    // storage unavailable: nothing more to record
  }
  const exportedAt = new Date().toISOString()
  const payload = {
    app: 'cm-workshop',
    storageVersion: STORAGE_VERSION,
    exportedAt,
    currentProjectId: getCurrentProjectId(),
    projects: allBoardIds().map((id) => ({
      meta: index.find((p) => p.id === id) ?? null,
      id,
      data: loadProjectData(id),
    })),
    ...(indexRaw !== null ? { indexUnreadable: indexRaw } : {}),
  }
  return { filename: `cm-workshop-boards-${exportedAt.slice(0, 10)}.json`, json: JSON.stringify(payload, null, 2) }
}

/**
 * Folds a pre-projects single board (the layout before projects existed) into
 * a new project. Returns the new project's id, or null when there is nothing
 * to adopt or the copy could not be written.
 *
 * The legacy keys are the ONLY copy of that board, so they are removed only
 * after write() has confirmed the copy landed. On a full store the copy
 * fails, the empty project created for it is dropped again, and the originals
 * stay put for the next attempt. Removing them unconditionally, as this once
 * did, would have destroyed the board in exactly the case this module is
 * meant to survive.
 */
function adoptLegacyBoard(): string | null {
  const legacyNodes = read<unknown[] | null>(LEGACY_NODES, null)
  if (!legacyNodes?.length) return null
  const legacyEdges = read<unknown[] | null>(LEGACY_EDGES, null)

  const meta = createProject('My Content Model')
  if (!write(dataKey(meta.id), { nodes: legacyNodes, edges: legacyEdges ?? [] })) {
    deleteProject(meta.id)
    return null
  }
  if (available()) {
    try {
      localStorage.removeItem(LEGACY_NODES)
      localStorage.removeItem(LEGACY_EDGES)
    } catch {
      // The copy exists; a lingering original is harmless and goes next load
    }
  }
  return meta.id
}

/**
 * Ensures a current project exists, folding any pre-projects board into one.
 * Returns the id to open.
 *
 * `sample` is used only when there are genuinely no projects and no legacy
 * board, so an existing user never has a sample dropped into their list.
 */
export function ensureCurrentProject(sample?: { name: string; data: ProjectData }): string {
  // A pre-projects single board is adopted whenever one is present, not only
  // on a first run, so an adoption that storage refused is retried on a later
  // load once space has been freed.
  const adopted = adoptLegacyBoard()
  if (adopted) {
    setCurrentProjectId(adopted)
    return adopted
  }

  const existing = listProjects()
  const current = getCurrentProjectId()
  if (current && existing.some((p) => p.id === current)) return current

  if (existing.length > 0) {
    setCurrentProjectId(existing[0].id)
    return existing[0].id
  }

  // Genuinely empty: start on the sample so there is something to look at,
  // and so the tour has real cards to point at
  const meta = sample
    ? createProject(sample.name)
    : createProject('Untitled')
  if (sample) write(dataKey(meta.id), sample.data)
  setCurrentProjectId(meta.id)
  return meta.id
}
