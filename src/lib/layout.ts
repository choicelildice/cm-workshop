/**
 * Layered left-to-right layout for a content model.
 *
 * Content types become nodes, reference fields become edges, and each type is
 * assigned to a column by how deep it sits from the entry points. Types nothing
 * references start on the left; types that reference nothing end up on the
 * right. This is standard layered graph drawing (Sugiyama), adapted to the fact
 * that a content model is a DAG-with-cycles rather than a tree.
 *
 * Why left-to-right: reference handles are fixed at Left for targets and Right
 * for sources, so horizontal flow means arrows leave and enter where the handles
 * already point. A vertical layout would loop every edge around the card.
 */

export interface LayoutNode {
  id: string
  /** Measured width, so a column is sized to its widest card. */
  width: number
  height: number
}

export interface LayoutEdge {
  source: string
  target: string
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>
  /** Edges excluded from layering to break a cycle. Drawn dashed. */
  backEdges: Set<string>
  /**
   * Circular reference paths, e.g. ['Page', 'Section', 'Page']. Reported as
   * whole loops rather than blaming one edge, since which edge counts as the
   * "back" one depends on where the traversal happened to start.
   */
  cycles: string[][]
  /** Column index per node, for labelling or diagnostics. */
  layers: Map<string, number>
  orphanIds: string[]
}

export const edgeKey = (source: string, target: string) => `${source}\u0000${target}`

export interface LayoutOptions {
  /** Horizontal gap between columns. */
  columnGap?: number
  /** Vertical gap between cards in a column. */
  rowGap?: number
  /** Gap above the orphan group. */
  orphanGap?: number
  /** Cards per row in the orphan group. */
  orphanColumns?: number
}

const DEFAULTS: Required<LayoutOptions> = {
  columnGap: 110,
  rowGap: 60,
  orphanGap: 140,
  orphanColumns: 4,
}

/**
 * Finds edges whose removal makes the graph acyclic, plus the loops they close.
 *
 * Standard DFS back-edge detection: an edge into a node currently on the
 * recursion stack closes a cycle. Node order is sorted so the same input always
 * produces the same choice of back edge, which matters because that choice is
 * otherwise arbitrary.
 *
 * Iterative rather than recursive: a deeply chained model would blow the call
 * stack, and an imported space can be arbitrarily deep.
 */
function findBackEdges(
  ids: string[],
  outgoing: Map<string, string[]>
): { backEdges: Set<string>; cycles: string[][] } {
  const backEdges = new Set<string>()
  const cycles: string[][] = []
  const state = new Map<string, 'unvisited' | 'open' | 'done'>()
  for (const id of ids) state.set(id, 'unvisited')

  for (const root of ids) {
    if (state.get(root) !== 'unvisited') continue

    // Explicit stack of (node, index of next child to examine)
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }]
    const path: string[] = [root]
    state.set(root, 'open')

    while (stack.length) {
      const frame = stack[stack.length - 1]
      const children = outgoing.get(frame.id) ?? []

      if (frame.next >= children.length) {
        state.set(frame.id, 'done')
        stack.pop()
        path.pop()
        continue
      }

      const child = children[frame.next++]

      // A self-reference is always a back edge. Excluded from layering but not
      // reported: Category -> Category is a routine hierarchy, not a finding.
      if (child === frame.id) {
        backEdges.add(edgeKey(frame.id, child))
        continue
      }

      const s = state.get(child)
      if (s === 'unvisited') {
        state.set(child, 'open')
        stack.push({ id: child, next: 0 })
        path.push(child)
      } else if (s === 'open') {
        // `child` is on the current path, so this edge closes a loop
        backEdges.add(edgeKey(frame.id, child))
        const at = path.indexOf(child)
        if (at !== -1) cycles.push([...path.slice(at), child])
      }
      // 'done' means already fully explored on another branch: a forward or
      // cross edge, not a cycle.
    }
  }

  return { backEdges, cycles }
}

/**
 * Longest-path layering: a node sits one column right of its deepest parent.
 *
 * Chosen over shortest-path so types that reference nothing land at the right
 * edge, which is what "going down to the end" means visually. The cost is more
 * long edges reaching across columns toward popular leaf types.
 */
function assignLayers(
  ids: string[],
  incoming: Map<string, string[]>,
  isBack: (source: string, target: string) => boolean
): Map<string, number> {
  const layer = new Map<string, number>()

  // Iterative post-order, for the same stack-safety reason as above
  for (const start of ids) {
    if (layer.has(start)) continue
    const stack: { id: string; expanded: boolean }[] = [{ id: start, expanded: false }]
    const onPath = new Set<string>()

    while (stack.length) {
      const frame = stack[stack.length - 1]
      if (layer.has(frame.id)) { stack.pop(); onPath.delete(frame.id); continue }

      const parents = (incoming.get(frame.id) ?? []).filter((p) => !isBack(p, frame.id))

      if (!frame.expanded) {
        frame.expanded = true
        onPath.add(frame.id)
        let pushedAny = false
        for (const p of parents) {
          // onPath guards against any residual loop; back edges should
          // already prevent this, so treat such a parent as depth 0
          if (!layer.has(p) && !onPath.has(p)) {
            stack.push({ id: p, expanded: false })
            pushedAny = true
          }
        }
        if (pushedAny) continue
      }

      let best = 0
      for (const p of parents) best = Math.max(best, (layer.get(p) ?? 0) + 1)
      layer.set(frame.id, best)
      onPath.delete(frame.id)
      stack.pop()
    }
  }

  return layer
}

/**
 * Orders nodes within each column to reduce edge crossings.
 *
 * Barycenter heuristic: place each node near the average position of its
 * neighbours in the previous column, sweeping left to right a few times. Not
 * optimal (crossing minimisation is NP-hard) but cheap and visibly better than
 * arbitrary order.
 */
function orderWithinLayers(
  byLayer: Map<number, string[]>,
  incoming: Map<string, string[]>,
  isBack: (source: string, target: string) => boolean,
  passes = 4
): void {
  const layerIndices = [...byLayer.keys()].sort((a, b) => a - b)

  for (let pass = 0; pass < passes; pass++) {
    for (const li of layerIndices) {
      if (li === layerIndices[0]) continue
      const prev = byLayer.get(li - 1)
      if (!prev?.length) continue

      const rankInPrev = new Map(prev.map((id, i) => [id, i]))
      const current = byLayer.get(li)!

      const barycentre = new Map<string, number>()
      current.forEach((id, i) => {
        const ranks = (incoming.get(id) ?? [])
          .filter((p) => !isBack(p, id))
          .map((p) => rankInPrev.get(p))
          .filter((r): r is number => r !== undefined)
        // No parent in the previous column: keep its current position, so a
        // node isn't yanked to the top by a missing value
        barycentre.set(id, ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : i)
      })

      current.sort((a, b) => (barycentre.get(a) ?? 0) - (barycentre.get(b) ?? 0))
    }
  }
}

export function layoutModel(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions = {}
): LayoutResult {
  const opts = { ...DEFAULTS, ...options }
  const positions = new Map<string, { x: number; y: number }>()

  if (nodes.length === 0) {
    return { positions, backEdges: new Set(), cycles: [], layers: new Map(), orphanIds: [] }
  }

  const known = new Set(nodes.map((n) => n.id))
  // Sorted for determinism: the choice of back edge depends on traversal order
  const ids = nodes.map((n) => n.id).sort()
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const id of ids) {
    outgoing.set(id, [])
    incoming.set(id, [])
  }
  // Deduplicated: several reference fields can point at the same type, which
  // would otherwise skew the barycentre toward it
  const seenEdge = new Set<string>()
  for (const e of edges) {
    if (!known.has(e.source) || !known.has(e.target)) continue
    const k = edgeKey(e.source, e.target)
    if (seenEdge.has(k)) continue
    seenEdge.add(k)
    outgoing.get(e.source)!.push(e.target)
    incoming.get(e.target)!.push(e.source)
  }
  for (const id of ids) {
    outgoing.get(id)!.sort()
    incoming.get(id)!.sort()
  }

  // Orphans: no references either way. Technically roots, but putting them in
  // column 0 buries the real entry points, so they get their own group.
  const orphanIds = ids.filter(
    (id) => outgoing.get(id)!.length === 0 && incoming.get(id)!.length === 0
  )
  const orphanSet = new Set(orphanIds)
  const connected = ids.filter((id) => !orphanSet.has(id))

  const { backEdges, cycles } = findBackEdges(connected, outgoing)
  const isBack = (s: string, t: string) => backEdges.has(edgeKey(s, t))

  const layers = assignLayers(connected, incoming, isBack)

  const byLayer = new Map<number, string[]>()
  for (const id of connected) {
    const li = layers.get(id) ?? 0
    if (!byLayer.has(li)) byLayer.set(li, [])
    byLayer.get(li)!.push(id)
  }
  orderWithinLayers(byLayer, incoming, isBack)

  // ── Positions ───────────────────────────────────────────────────────
  // Each column is as wide as its widest card, so auto-sized cards never
  // overlap the next column.
  const layerIndices = [...byLayer.keys()].sort((a, b) => a - b)
  const columnWidth = new Map<number, number>()
  for (const li of layerIndices) {
    columnWidth.set(li, Math.max(...byLayer.get(li)!.map((id) => byId.get(id)!.width)))
  }

  const columnX = new Map<number, number>()
  let x = 0
  for (const li of layerIndices) {
    columnX.set(li, x)
    x += columnWidth.get(li)! + opts.columnGap
  }

  // Centre each column vertically against the tallest one, so the diagram
  // reads as a band rather than hanging off the top edge
  const columnHeight = new Map<number, number>()
  for (const li of layerIndices) {
    const members = byLayer.get(li)!
    columnHeight.set(
      li,
      members.reduce((sum, id) => sum + byId.get(id)!.height, 0) +
        opts.rowGap * Math.max(0, members.length - 1)
    )
  }
  const tallest = Math.max(0, ...columnHeight.values())

  let maxBottom = 0
  for (const li of layerIndices) {
    const members = byLayer.get(li)!
    let y = (tallest - columnHeight.get(li)!) / 2
    const cx = columnX.get(li)!
    const colW = columnWidth.get(li)!
    for (const id of members) {
      const node = byId.get(id)!
      // Centre narrower cards within their column
      positions.set(id, { x: cx + (colW - node.width) / 2, y })
      y += node.height + opts.rowGap
      maxBottom = Math.max(maxBottom, y)
    }
  }

  // Orphans in a grid below everything, so they are visibly set apart
  if (orphanIds.length) {
    const orphanTop = (connected.length ? maxBottom - opts.rowGap : 0) + opts.orphanGap
    const cellW = Math.max(...orphanIds.map((id) => byId.get(id)!.width)) + opts.columnGap
    const cellH = Math.max(...orphanIds.map((id) => byId.get(id)!.height)) + opts.rowGap
    orphanIds.forEach((id, i) => {
      positions.set(id, {
        x: (i % opts.orphanColumns) * cellW,
        y: orphanTop + Math.floor(i / opts.orphanColumns) * cellH,
      })
    })
  }

  return { positions, backEdges, cycles, layers, orphanIds }
}
