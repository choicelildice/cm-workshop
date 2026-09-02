import type { Node } from '@xyflow/react'

/** How close (in flow units) an edge must be before it snaps. */
const THRESHOLD = 8

export interface Guides {
  /** Vertical guide lines, as flow-space x coordinates. */
  x: number[]
  /** Horizontal guide lines, as flow-space y coordinates. */
  y: number[]
}

export interface SnapResult {
  position: { x: number; y: number }
  guides: Guides
}

export const NO_GUIDES: Guides = { x: [], y: [] }

function dims(n: Node): { w: number; h: number } {
  return {
    w: n.measured?.width ?? (n.width as number | undefined) ?? 200,
    h: n.measured?.height ?? (n.height as number | undefined) ?? 100,
  }
}

/**
 * Miro-style smart alignment. Compares the dragged node's left / centre / right
 * and top / centre / bottom against the same six anchors on every other node,
 * and nudges it onto the nearest one within THRESHOLD.
 *
 * Each axis is resolved independently, so a node can snap horizontally to one
 * neighbour while snapping vertically to a different one.
 */
export function snapPosition(
  dragged: Node,
  desired: { x: number; y: number },
  all: Node[]
): SnapResult {
  const { w, h } = dims(dragged)
  const others = all.filter((n) => n.id !== dragged.id && !n.hidden)
  if (others.length === 0) return { position: desired, guides: NO_GUIDES }

  // Offsets from the node's origin to each of its own anchors
  const selfX = [0, w / 2, w]
  const selfY = [0, h / 2, h]

  let bestX: { shift: number; guide: number } | null = null
  let bestY: { shift: number; guide: number } | null = null

  for (const other of others) {
    const od = dims(other)
    const otherX = [other.position.x, other.position.x + od.w / 2, other.position.x + od.w]
    const otherY = [other.position.y, other.position.y + od.h / 2, other.position.y + od.h]

    for (const off of selfX) {
      for (const ox of otherX) {
        const shift = ox - off - desired.x
        if (Math.abs(shift) <= THRESHOLD && (!bestX || Math.abs(shift) < Math.abs(bestX.shift))) {
          bestX = { shift, guide: ox }
        }
      }
    }

    for (const off of selfY) {
      for (const oy of otherY) {
        const shift = oy - off - desired.y
        if (Math.abs(shift) <= THRESHOLD && (!bestY || Math.abs(shift) < Math.abs(bestY.shift))) {
          bestY = { shift, guide: oy }
        }
      }
    }
  }

  return {
    position: {
      x: bestX ? desired.x + bestX.shift : desired.x,
      y: bestY ? desired.y + bestY.shift : desired.y,
    },
    guides: {
      x: bestX ? [bestX.guide] : [],
      y: bestY ? [bestY.guide] : [],
    },
  }
}
