import { v4 as uuidv4 } from 'uuid'

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
}

export interface ProjectData {
  nodes: unknown[]
  edges: unknown[]
}

const INDEX_KEY = 'cm-workshop-projects'
const CURRENT_KEY = 'cm-workshop-current'
const dataKey = (id: string) => `cm-workshop-project-${id}`

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

function write(key: string, value: unknown): void {
  if (!available()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota exceeded or storage unavailable
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

export function saveProjectData(id: string, data: ProjectData): void {
  write(dataKey(id), data)
  const projects = read<ProjectMeta[]>(INDEX_KEY, [])
  const i = projects.findIndex((p) => p.id === id)
  if (i !== -1) {
    projects[i] = { ...projects[i], updatedAt: Date.now() }
    writeIndex(projects)
  }
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
  for (const p of listProjects()) {
    const data = loadProjectData(p.id)
    if (!data?.nodes) continue
    for (const n of data.nodes as { id?: string; type?: string }[]) {
      if (n?.type === 'image' && n.id) ids.add(n.id)
    }
  }
  return ids
}

/**
 * Ensures a current project exists, folding any pre-projects board into one.
 * Returns the id to open.
 */
export function ensureCurrentProject(): string {
  const existing = listProjects()
  const current = getCurrentProjectId()
  if (current && existing.some((p) => p.id === current)) return current

  if (existing.length > 0) {
    setCurrentProjectId(existing[0].id)
    return existing[0].id
  }

  // First run: adopt a legacy single-board layout if one is there
  const legacyNodes = read<unknown[] | null>(LEGACY_NODES, null)
  const legacyEdges = read<unknown[] | null>(LEGACY_EDGES, null)
  const meta = createProject(legacyNodes?.length ? 'My Content Model' : 'Untitled')
  if (legacyNodes?.length) {
    write(dataKey(meta.id), { nodes: legacyNodes, edges: legacyEdges ?? [] })
    if (available()) {
      try {
        localStorage.removeItem(LEGACY_NODES)
        localStorage.removeItem(LEGACY_EDGES)
      } catch {
        // ignore
      }
    }
  }
  setCurrentProjectId(meta.id)
  return meta.id
}
