import { v4 as uuidv4 } from 'uuid'

/**
 * Named Contentful space credentials, so a customer with several spaces
 * (e.g. one per region or brand) doesn't mean re-typing a space id,
 * environment and token every time the Import/Export modal opens.
 *
 * Entirely additive to the pre-existing single-credential keys
 * (cf-space-id / cf-environment-id / cf-cma-token, still read/written by
 * both modals as the "last typed" values). Nothing here ever removes or
 * depends on those — a user who never saves a connection sees no change
 * at all, and an existing customer's current setup keeps working exactly
 * as it did before this file existed.
 */
export interface SpaceConnection {
  id: string
  label: string
  spaceId: string
  environmentId: string
  token: string
}

const KEY = 'cm-workshop-space-connections'

function available(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

export function listSpaceConnections(): SpaceConnection[] {
  if (!available()) return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SpaceConnection[]
    if (!Array.isArray(parsed)) return []
    // Drop malformed entries rather than letting one bad row break the
    // whole dropdown
    return parsed.filter(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        typeof c.label === 'string' &&
        typeof c.spaceId === 'string' &&
        typeof c.environmentId === 'string' &&
        typeof c.token === 'string'
    )
  } catch {
    return []
  }
}

function writeAll(connections: SpaceConnection[]): void {
  if (!available()) return
  try {
    localStorage.setItem(KEY, JSON.stringify(connections))
  } catch {
    // quota or unavailable; saved connections are a convenience, not the
    // customer's modelling work, so failing silently here is acceptable
  }
}

/** Adds a new saved connection and returns it. */
export function saveSpaceConnection(
  label: string,
  spaceId: string,
  environmentId: string,
  token: string
): SpaceConnection {
  const connection: SpaceConnection = {
    id: uuidv4(),
    label: label.trim() || spaceId,
    spaceId,
    environmentId,
    token,
  }
  writeAll([...listSpaceConnections(), connection])
  return connection
}

export function deleteSpaceConnection(id: string): void {
  writeAll(listSpaceConnections().filter((c) => c.id !== id))
}

export function findSpaceConnection(id: string): SpaceConnection | undefined {
  return listSpaceConnections().find((c) => c.id === id)
}
