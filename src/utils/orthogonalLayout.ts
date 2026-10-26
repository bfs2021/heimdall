import type { LayoutNode, LayoutEdge } from './graphLayout'
import type { Point } from './graph'
import { buildStructuralForest } from './graphHierarchy'

/**
 * Orthogonal layout — phase-1 engine described in
 * heimdall-layout-loop/design-material/orthogonal/algorithm-research.md: place-then-route.
 *
 * Placement (grid). Each connected component is layered: by depth in the structural forest when
 * edges carry `structural: true` (parent = source; `buildStructuralForest` semantics), else by
 * BFS depth from the root whose ordered layering commits to the fewest crossings. Rows are
 * ordered by barycenter sweeps and an exact permutation search (rows of up to 8 nodes), columns
 * assigned by least-squares placement so groups center on their desired column. With
 * `isPageNode`, a page's view children form a fan of cells to its right in the same row
 * (ux-navigation's shape). Components sit on shelves, isolates in a wrapped block beneath. Every
 * node owns a cell, so zero overlap is a property of the occupancy map; anchors are cell centers
 * at `origin + (col·cw, row·ch)`.
 *
 * Sketches and pins. Node x/y are a sketch when at least 70% of nodes have finite coordinates
 * and they snap to distinct cells: those nodes keep their cells, and nodes without coordinates
 * take the free cell nearest their neighbors' centroid, so a re-run on the engine's own output
 * keeps every cell. A pinned node (`pinned: true`, finite x/y) holds its cell under any start;
 * the origin is chosen so the first pinned node (by id) sits exactly on its pin, other pins snap
 * to the nearest cell (the grid cannot honor two arbitrary pins exactly). Routes are always
 * recomputed from the cells (no incremental routing yet).
 *
 * Routing (lattice). The cell pitch leaves a channel of `lanes` routing lanes between
 * neighboring rows and columns, `laneSpacing` apart and `clearance` + half a spacing away from
 * any node box. Each node side exposes port slots on its own lines. Edges are routed one at a
 * time (structural first, then relational, navigation routes last, longest first within each)
 * by A* over the lattice, cost `length + bendPenalty·bends + crossingPenalty·crossings`; a
 * lattice segment already used by another route, or entering another node's clearance box, is
 * unavailable, so routes never share a segment and never pass through a node (hard
 * requirements, not penalties). With `busTreeEdges`, a parent's structural edges to children in
 * the row below may share one trunk; the shared edges are reported in `groups` so a scorer can
 * exempt them. Each route is a polyline from the source box boundary to the target box boundary,
 * index-aligned with `edges`.
 *
 * Deterministic throughout: nodes in id order, edges in a fixed order, A* ties by vertex index.
 */
export interface OrthogonalLayoutEdge extends LayoutEdge {
  /** Parent → child containment: shapes the layering and (with busTreeEdges) may share a trunk. */
  structural?: boolean
  /** A user-flow route: routed after every other edge, with a higher crossing penalty. */
  navigationRoute?: boolean
}

export interface OrthogonalLayoutOptions {
  /** Node-to-route clearance in px (default 10). */
  clearance?: number
  /** Distance between parallel routes in one channel (default 16) and lanes per channel (default 4). */
  laneSpacing?: number
  lanes?: number
  /** Extra cost per bend (default: one cell pitch) and per crossing (default: three pitches). */
  bendPenalty?: number
  crossingPenalty?: number
  /** Empty cells kept between side-by-side components (default 1). */
  componentGap?: number
  /** Barycenter ordering sweeps (default 6). */
  orderingSweeps?: number
  /** ux-navigation hook: pages form the tree, a page's non-page structural children fan to its right. */
  isPageNode?: (id: string) => boolean
  /** Let a parent's structural edges to the row below share one trunk (reported in `groups`). Default false. */
  busTreeEdges?: boolean
  /** 'auto' (sketch when the positions qualify, else cold), 'cold' (ignore positions except pins), 'sketch' (force). */
  scope?: 'auto' | 'cold' | 'sketch'
}

export interface OrthogonalLayoutStats {
  components: number
  rows: number
  cols: number
  /** Edges whose A* found no lattice path and fell back to a direct L; 0 is the goal. */
  fallbackRoutes: number
  droppedEdges: number
  sketch: boolean
  pinnedNodes: number
  /** Edges that share a bus trunk (busTreeEdges). */
  busEdges: number
}

export interface OrthogonalLayoutResult {
  positions: Map<string, Point>
  /** One polyline per input edge (same index), source box boundary to target box boundary. */
  routes: Point[][]
  /** Bus group per edge index (undefined when the edge shares nothing); only with busTreeEdges. */
  groups: Array<number | undefined>
  cell: { w: number; h: number }
  origin: Point
  stats: OrthogonalLayoutStats
}

// How much wider than the narrowest BFS layering a candidate root's widest layer may be. Measured
// on the Stage 1 fixtures: 1 leaves the exemplar at 3 crossings, 2 reaches 1; wider buys nothing.
const ROOT_WIDTH_SLACK = 2

const DIRS = [
  { dx: 1, dy: 0 }, // 0 right
  { dx: 0, dy: 1 }, // 1 down
  { dx: -1, dy: 0 }, // 2 left
  { dx: 0, dy: -1 }, // 3 up
]

export function orthogonalLayout(
  nodes: readonly LayoutNode[],
  edges: readonly OrthogonalLayoutEdge[],
  options: OrthogonalLayoutOptions = {},
): OrthogonalLayoutResult {
  const clearance = options.clearance ?? 10
  const laneSpacing = options.laneSpacing ?? 16
  const lanes = Math.max(1, Math.floor(options.lanes ?? 4))
  const componentGap = Math.max(0, Math.floor(options.componentGap ?? 1))
  const sweeps = options.orderingSweeps ?? 6

  // ─── normalize ─────────────────────────────────────────────────────────────
  const sorted = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const n = sorted.length
  const index = new Map<string, number>()
  sorted.forEach((nd, i) => index.set(nd.id, i))
  const adj: number[][] = sorted.map(() => [])
  const edgeEnds: Array<[number, number] | null> = []
  const seenPair = new Set<string>()
  let dropped = 0
  edges.forEach(e => {
    const a = index.get(e.source), b = index.get(e.target)
    if (a === undefined || b === undefined || a === b) { edgeEnds.push(null); dropped++; return }
    edgeEnds.push([a, b])
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seenPair.has(key)) return
    seenPair.add(key)
    adj[a].push(b); adj[b].push(a)
  })
  for (const l of adj) l.sort((a, b) => a - b)

  const maxW = n ? Math.max(...sorted.map(nd => nd.width)) : 0
  const maxH = n ? Math.max(...sorted.map(nd => nd.height)) : 0
  const laneSpan = lanes * laneSpacing
  const cw = maxW + 2 * clearance + laneSpan
  const ch = maxH + 2 * clearance + laneSpan

  // Structural skeleton (only when the caller flags edges), page/view partition.
  const hasStructural = edges.some(e => e.structural)
  const forest = hasStructural
    ? buildStructuralForest(sorted.map(nd => nd.id), edges.filter(e => e.structural).map(e => ({ source: e.source, target: e.target, structural: true })))
    : null
  const isPage = options.isPageNode
  const pageOf = (i: number) => (isPage ? safeBool(isPage, sorted[i].id) : true)

  // ─── placement ─────────────────────────────────────────────────────────────
  const col = new Int32Array(n), row = new Int32Array(n)
  const pinned = sorted.map(nd => Boolean(nd.pinned) && Number.isFinite(nd.x) && Number.isFinite(nd.y))
  const positioned = sorted.map(nd => Number.isFinite(nd.x) && Number.isFinite(nd.y))
  // Origin: the first pinned node sits exactly on its pin; otherwise (0, 0).
  const firstPin = pinned.findIndex(Boolean)
  const origin: Point = firstPin >= 0
    ? { x: sorted[firstPin].x - Math.round(sorted[firstPin].x / cw) * cw, y: sorted[firstPin].y - Math.round(sorted[firstPin].y / ch) * ch }
    : { x: 0, y: 0 }
  const snap = (i: number): [number, number] => [Math.round((sorted[i].x - origin.x) / cw), Math.round((sorted[i].y - origin.y) / ch)]

  const scope = options.scope ?? 'auto'
  const positionedCount = positioned.filter(Boolean).length
  let sketch = scope === 'sketch'
  if (scope === 'auto' && n > 0 && positionedCount >= 2 && positionedCount >= 0.7 * n) {
    const cells = new Set<string>()
    let distinct = true
    for (let i = 0; i < n && distinct; i++) if (positioned[i]) { const k = snap(i).join(','); if (cells.has(k)) distinct = false; cells.add(k) }
    sketch = distinct
  }

  let components: number
  let isolates: number
  if (sketch) {
    ;({ components, isolates } = placeSketch(n, adj, sorted, positioned, pinned, snap, col, row))
  } else {
    ;({ components, isolates } = placeComponents(n, adj, col, row, componentGap, sweeps, forest, index, pageOf, sorted))
    // Pins override cold placement: move each pinned node to its own cell, evicting whatever the
    // layering put there to the nearest free cell (deterministic, in id order).
    const occupied = new Map<string, number>()
    for (let i = 0; i < n; i++) occupied.set(`${col[i]},${row[i]}`, i)
    for (let i = 0; i < n; i++) {
      if (!pinned[i]) continue
      const [c, r] = snap(i)
      const key = `${c},${r}`
      occupied.delete(`${col[i]},${row[i]}`)
      const other = occupied.get(key)
      col[i] = c; row[i] = r; occupied.set(key, i)
      if (other !== undefined && other !== i && !pinned[other]) {
        const free = nearestFreeCell(c, r, occupied)
        col[other] = free[0]; row[other] = free[1]; occupied.set(`${free[0]},${free[1]}`, other)
      }
    }
  }

  const positions = new Map<string, Point>()
  const center: Point[] = sorted.map((nd, i) => {
    const p = { x: origin.x + col[i] * cw, y: origin.y + row[i] * ch }
    positions.set(nd.id, p)
    return p
  })

  // ─── routing ───────────────────────────────────────────────────────────────
  const edgeClass = edges.map(e => (e.navigationRoute ? 2 : e.structural ? 0 : 1))
  // Bus groups: a parent's structural edges to children in the row directly below.
  const groups: Array<number | undefined> = edges.map(() => undefined)
  if (options.busTreeEdges) {
    const byParent = new Map<number, number[]>()
    edges.forEach((e, i) => {
      const ends = edgeEnds[i]
      if (!ends || !e.structural) return
      const [a, b] = ends
      if (row[b] === row[a] + 1) byParent.set(a, [...(byParent.get(a) ?? []), i])
    })
    let g = 0
    for (const [, members] of [...byParent.entries()].sort((x, y) => x[0] - y[0])) {
      if (members.length < 2) continue
      for (const i of members) groups[i] = g
      g++
    }
  }
  const routes = routeAll(sorted, center, edgeEnds, col, row, cw, ch, origin, edgeClass, groups, {
    clearance, laneSpacing, lanes,
    bendPenalty: options.bendPenalty ?? Math.max(cw, ch),
    crossingPenalty: options.crossingPenalty ?? 3 * Math.max(cw, ch),
  })

  const cols = n ? Math.max(...Array.from(col)) - Math.min(...Array.from(col)) + 1 : 0
  const rows = n ? Math.max(...Array.from(row)) - Math.min(...Array.from(row)) + 1 : 0
  return {
    positions,
    routes: routes.points,
    groups,
    cell: { w: cw, h: ch },
    origin,
    stats: {
      components: components + (isolates ? 1 : 0), rows, cols,
      fallbackRoutes: routes.fallbacks, droppedEdges: dropped,
      sketch, pinnedNodes: pinned.filter(Boolean).length, busEdges: groups.filter(g => g !== undefined).length,
    },
  }
}

function safeBool(fn: (id: string) => boolean, id: string): boolean {
  try { return Boolean(fn(id)) } catch { return true }
}

/** Nearest free cell to (c, r) by Manhattan distance, ties broken by column then row. */
function nearestFreeCell(c: number, r: number, occupied: Map<string, number>): [number, number] {
  for (let d = 1; d < 10000; d++) {
    const cands: Array<[number, number]> = []
    for (let dc = -d; dc <= d; dc++) { const dr = d - Math.abs(dc); cands.push([c + dc, r + dr]); if (dr !== 0) cands.push([c + dc, r - dr]) }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    for (const [cc, rr] of cands) if (!occupied.has(`${cc},${rr}`)) return [cc, rr]
  }
  return [c, r]
}

/** Sketch placement: positioned nodes keep their snapped cells; new nodes take the free cell nearest their neighbors. */
function placeSketch(
  n: number, adj: number[][], nodes: readonly LayoutNode[], positioned: boolean[], pinned: boolean[],
  snap: (i: number) => [number, number], col: Int32Array, row: Int32Array,
): { components: number; isolates: number } {
  const occupied = new Map<string, number>()
  // Pins first, then the rest of the sketch in id order; a collision goes to the nearest free cell.
  const order = [...Array(n).keys()].filter(i => positioned[i]).sort((a, b) => (pinned[b] ? 1 : 0) - (pinned[a] ? 1 : 0) || a - b)
  for (const i of order) {
    let [c, r] = snap(i)
    if (occupied.has(`${c},${r}`)) [c, r] = nearestFreeCell(c, r, occupied)
    col[i] = c; row[i] = r; occupied.set(`${c},${r}`, i)
  }
  for (let i = 0; i < n; i++) {
    if (positioned[i]) continue
    const placedNeighbors = adj[i].filter(v => occupied.has(`${col[v]},${row[v]}`) && (positioned[v] || v < i))
    let c = 0, r = 0
    if (placedNeighbors.length) {
      c = Math.round(placedNeighbors.reduce((s, v) => s + col[v], 0) / placedNeighbors.length)
      r = Math.round(placedNeighbors.reduce((s, v) => s + row[v], 0) / placedNeighbors.length) + 1
    } else if (occupied.size) {
      let maxR = -Infinity, minC = Infinity
      for (const k of occupied.keys()) { const [cc, rr] = k.split(',').map(Number); maxR = Math.max(maxR, rr); minC = Math.min(minC, cc) }
      c = minC; r = maxR + 1
    }
    if (occupied.has(`${c},${r}`)) [c, r] = nearestFreeCell(c, r, occupied)
    col[i] = c; row[i] = r; occupied.set(`${c},${r}`, i)
    void nodes
  }
  // Component count for stats only.
  const seen = new Uint8Array(n)
  let components = 0, isolates = 0
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0]) continue
    if (adj[s0].length === 0) { isolates++; seen[s0] = 1; continue }
    components++
    const stack = [s0]; seen[s0] = 1
    while (stack.length) { const u = stack.pop()!; for (const v of adj[u]) if (!seen[v]) { seen[v] = 1; stack.push(v) } }
  }
  return { components, isolates }
}

// ─── placement ─────────────────────────────────────────────────────────────
// ─── placement ────────────────────────────────────────────────────────────────

type Forest = ReturnType<typeof buildStructuralForest>

function placeComponents(
  n: number, adj: number[][], col: Int32Array, row: Int32Array, gap: number, sweeps: number,
  forest: Forest | null, index: Map<string, number>, pageOf: (i: number) => boolean, nodes: readonly LayoutNode[],
): { components: number; isolates: number } {
  const compOf = new Int32Array(n).fill(-1)
  const comps: number[][] = []
  for (let s = 0; s < n; s++) {
    if (compOf[s] !== -1) continue
    const members: number[] = []
    const stack = [s]
    compOf[s] = comps.length
    while (stack.length) {
      const u = stack.pop()!
      members.push(u)
      for (const v of adj[u]) if (compOf[v] === -1) { compOf[v] = comps.length; stack.push(v) }
    }
    members.sort((a, b) => a - b)
    comps.push(members)
  }
  const connected = comps.filter(m => m.length > 1)
  const isolates = comps.filter(m => m.length === 1).map(m => m[0])
  // Largest component first, then by lowest id, left to right.
  connected.sort((a, b) => b.length - a.length || a[0] - b[0])

  // Components are shelf-packed left to right, wrapping to a new shelf once a near-square target
  // width is reached, so a layer of many small trees does not become one endless strip.
  const locals = connected.map(m => {
    const local = layoutComponent(m, adj, sweeps, forest, index, pageOf, nodes)
    let width = 0, height = 0
    for (const g of m) { width = Math.max(width, local.col.get(g)! + 1); height = Math.max(height, local.row.get(g)! + 1) }
    return { m, local, width, height }
  })
  const targetWidth = Math.max(Math.ceil(Math.sqrt(n * 1.6)), ...locals.map(l => l.width))
  let cursor = 0, shelfTop = 0, shelfHeight = 0, usedWidth = 0
  for (const { m, local, width, height } of locals) {
    if (cursor > 0 && cursor + width > targetWidth) { shelfTop += shelfHeight + gap; cursor = 0; shelfHeight = 0 }
    for (const g of m) { col[g] = cursor + local.col.get(g)!; row[g] = shelfTop + local.row.get(g)! }
    usedWidth = Math.max(usedWidth, cursor + width)
    cursor += width + gap
    shelfHeight = Math.max(shelfHeight, height)
  }
  const maxRows = locals.length ? shelfTop + shelfHeight : 0
  // Isolates: a block beneath everything, wrapped to the same width.
  const blockWidth = Math.max(1, usedWidth, Math.ceil(Math.sqrt(isolates.length * 1.6)))
  isolates.forEach((g, i) => { col[g] = i % blockWidth; row[g] = maxRows + Math.floor(i / blockWidth) })
  return { components: connected.length, isolates: isolates.length }
}

function layoutComponent(
  members: number[], adj: number[][], sweeps: number,
  forest: Forest | null, index: Map<string, number>, pageOf: (i: number) => boolean, nodes: readonly LayoutNode[],
): { col: Map<number, number>; row: Map<number, number> } {
  // Views (non-pages with a structural page parent) fan to the right of their page in its row:
  // they leave the layering and become extra cells of width on the page.
  const fanOf = new Map<number, number[]>()
  const fanned = new Set<number>()
  if (forest) {
    // Fan order follows the structural edge order (forest.childrenOf), as ux-navigation's does.
    const memberSet = new Set(members)
    for (const page of members) {
      if (!pageOf(page)) continue
      for (const childId of forest.childrenOf.get(nodes[page].id) ?? []) {
        const v = index.get(childId)
        if (v === undefined || !memberSet.has(v) || pageOf(v)) continue
        fanOf.set(page, [...(fanOf.get(page) ?? []), v]); fanned.add(v)
      }
    }
  }
  const core = members.filter(g => !fanned.has(g))
  const adjCore: number[][] = adj.map(() => [])
  for (const g of core) adjCore[g] = adj[g].filter(v => !fanned.has(v))

  // Candidate roots: BFS layerings whose widest layer is within one of the narrowest keep the
  // grid close to square (fit-to-view rewards that); among them, the root whose ordered layering
  // commits to the fewest crossings wins, then the shallowest, then the lowest id.
  const bfs = (root: number) => {
    const depth = new Map<number, number>([[root, 0]])
    const order: number[] = [root]
    for (let h = 0; h < order.length; h++) {
      const u = order[h]
      for (const v of adjCore[u]) if (!depth.has(v)) { depth.set(v, depth.get(u)! + 1); order.push(v) }
    }
    for (const g of core) if (!depth.has(g)) { depth.set(g, 0); order.push(g) }
    const widths = new Map<number, number>()
    for (const d of depth.values()) widths.set(d, (widths.get(d) ?? 0) + 1)
    return { root, depth, order, widest: Math.max(...widths.values()), rows: widths.size }
  }
  let layerings: ReturnType<typeof bfs>[]
  if (forest) {
    // Structural skeleton over a BFS layering: every edge spreads the nodes into rows from a
    // candidate root (so a layer whose structural forest is sparse is not one row of roots), then
    // each structural child is pushed below its parent, in forest order. A relational edge can
    // move a node down, never above or beside its parent. Candidate roots are the forest roots.
    const coreSet = new Set(core)
    const parentOf = (g: number): number | undefined => {
      const p = forest.parentOf.get(nodes[g].id)
      const v = p === undefined ? undefined : index.get(p)
      return v !== undefined && coreSet.has(v) ? v : undefined
    }
    const roots = core.filter(g => parentOf(g) === undefined)
    const forestOrder: number[] = [...roots]
    for (let h = 0; h < forestOrder.length; h++) {
      for (const childId of forest.childrenOf.get(nodes[forestOrder[h]].id) ?? []) {
        const v = index.get(childId)
        if (v !== undefined && coreSet.has(v) && parentOf(v) === forestOrder[h]) forestOrder.push(v)
      }
    }
    const constrained = (root: number) => {
      const l = bfs(root)
      for (const u of forestOrder) {
        const p = parentOf(u)
        if (p !== undefined && l.depth.get(u)! <= l.depth.get(p)!) l.depth.set(u, l.depth.get(p)! + 1)
      }
      // Pushing down can leave an empty row; close the gaps so rows stay consecutive.
      const used = [...new Set(l.depth.values())].sort((a, b) => a - b)
      const dense = new Map(used.map((d, i) => [d, i]))
      for (const [g, d] of l.depth) l.depth.set(g, dense.get(d)!)
      const widths = new Map<number, number>()
      for (const d of l.depth.values()) widths.set(d, (widths.get(d) ?? 0) + 1)
      return { ...l, widest: Math.max(...widths.values()), rows: widths.size }
    }
    layerings = (roots.length ? roots : core).map(constrained)
  } else {
    layerings = core.map(bfs)
  }
  const narrowest = Math.min(...layerings.map(l => l.widest))
  let best: { crossings: number; widest: number; rows: number; root: number; layers: number[][]; depth: Map<number, number> } | null = null
  for (const l of layerings) {
    if (l.widest > narrowest + ROOT_WIDTH_SLACK) continue
    const ordered = orderLayers(l.depth, l.order, l.rows, adjCore, sweeps)
    if (!best || ordered.crossings < best.crossings || (ordered.crossings === best.crossings && (l.widest < best.widest || (l.widest === best.widest && l.rows < best.rows)))) {
      best = { crossings: ordered.crossings, widest: l.widest, rows: l.rows, root: l.root, layers: ordered.layers, depth: l.depth }
    }
  }
  const { layers, depth } = best!
  const rows = layers.length

  // Column assignment: priority method, top down then bottom up, integer columns, in-order.
  const colOf = new Map<number, number>()
  const widthOf = (g: number) => 1 + (fanOf.get(g)?.length ?? 0)
  { let c0 = 0; for (const g of layers[0]) { colOf.set(g, c0); c0 += widthOf(g) } }
  const assign = (r: number, other: number) => {
    const want = layers[r].map(g => {
      const ns = adjCore[g].filter(v => depth.get(v) === other)
      return ns.length ? ns.reduce((s, v) => s + colOf.get(v)!, 0) / ns.length : NaN
    })
    // Nodes without a neighbor in the other row want to sit next to their left neighbor.
    for (let i = 0; i < want.length; i++) if (!Number.isFinite(want[i])) want[i] = i > 0 ? want[i - 1] + widthOf(layers[r][i - 1]) : 0
    const out = spacedPlacement(want, layers[r].map(widthOf))
    layers[r].forEach((g, i) => colOf.set(g, out[i]))
  }
  for (let r = 1; r < rows; r++) assign(r, r - 1)
  for (let r = rows - 2; r >= 0; r--) assign(r, r + 1)
  for (let r = 1; r < rows; r++) assign(r, r - 1)

  // Fan cells: each view sits in the cell(s) right of its page, same row.
  for (const [page, views] of fanOf) views.forEach((v, k) => colOf.set(v, colOf.get(page)! + 1 + k))
  // Normalize to column 0 and compact empty columns.
  const used = [...new Set(colOf.values())].sort((a, b) => a - b)
  const remap = new Map(used.map((c, i) => [c, i]))
  const col = new Map<number, number>()
  const row = new Map<number, number>()
  for (const g of core) { col.set(g, remap.get(colOf.get(g)!)!); row.set(g, depth.get(g)!) }
  for (const [page, views] of fanOf) for (const v of views) { col.set(v, remap.get(colOf.get(v)!)!); row.set(v, depth.get(page)!) }
  return { col, row }
}

/**
 * Order each BFS layer: barycenter sweeps (neighbors in the adjacent row, same-row neighbors at
 * half weight so a chain along one row stays together), then a local search over adjacent
 * swaps and single-node insertions that accepts any move lowering the committed crossing
 * count (inter-row edge pairs that invert, plus the cells a same-row edge has to span).
 */
function orderLayers(depth: Map<number, number>, order: number[], rows: number, adj: number[][], sweeps: number): { layers: number[][]; crossings: number } {
  const layers: number[][] = Array.from({ length: rows }, () => [])
  for (const g of order) layers[depth.get(g)!].push(g) // BFS order keeps siblings together
  const posIn = new Map<number, number>()
  const refresh = () => layers.forEach(l => l.forEach((g, i) => posIn.set(g, i)))
  refresh()
  const bary = (g: number, otherRow: number): number => {
    const own = depth.get(g)!
    let sum = 0, weight = 0
    for (const v of adj[g]) {
      const d = depth.get(v)!
      if (d === otherRow) { sum += posIn.get(v)!; weight += 1 }
      else if (d === own) { sum += 0.5 * posIn.get(v)!; weight += 0.5 }
    }
    return weight ? sum / weight : posIn.get(g)!
  }
  for (let s = 0; s < sweeps; s++) {
    const down = s % 2 === 0
    const seq = down ? layers.keys() : [...layers.keys()].reverse()
    for (const r of seq) {
      const other = down ? r - 1 : r + 1
      if (other < 0 || other >= rows) continue
      const keyed = layers[r].map(g => ({ g, b: bary(g, other), i: posIn.get(g)! }))
      keyed.sort((a, b) => a.b - b.b || a.i - b.i)
      layers[r] = keyed.map(k => k.g)
      refresh()
    }
  }
  const rowCrossings = (): number => {
    let total = 0
    for (let r = 0; r + 1 < rows; r++) {
      const links: Array<[number, number]> = []
      for (const g of layers[r]) for (const v of adj[g]) if (depth.get(v) === r + 1) links.push([posIn.get(g)!, posIn.get(v)!])
      for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) {
        if ((links[i][0] - links[j][0]) * (links[i][1] - links[j][1]) < 0) total++
      }
    }
    for (let r = 0; r < rows; r++) for (const g of layers[r]) for (const v of adj[g]) if (v > g && depth.get(v) === r) total += Math.abs(posIn.get(g)! - posIn.get(v)!) - 1
    return total
  }
  let current = rowCrossings()
  // Rows of up to 8 nodes: exact — every permutation against the fixed neighboring rows.
  const EXACT_MAX = 8
  for (let pass = 0; pass < 4; pass++) {
    let improved = false
    for (let r = 0; r < rows; r++) {
      const l = layers[r]
      if (l.length < 2 || l.length > EXACT_MAX) continue
      const original = l.slice()
      let bestPerm = original.slice(), bestScore = current
      const perm = original.slice()
      const c = new Array(perm.length).fill(0)
      let i = 1
      // Heap's algorithm; deterministic enumeration order.
      const evaluate = () => { layers[r] = perm.slice(); refresh(); const sc = rowCrossings(); if (sc < bestScore) { bestScore = sc; bestPerm = perm.slice() } }
      evaluate()
      while (i < perm.length) {
        if (c[i] < i) {
          const k = i % 2 === 0 ? 0 : c[i]
          ;[perm[k], perm[i]] = [perm[i], perm[k]]
          evaluate()
          c[i]++; i = 1
        } else { c[i] = 0; i++ }
      }
      layers[r] = bestPerm; refresh()
      if (bestScore < current) { current = bestScore; improved = true }
    }
    if (!improved) break
  }
  for (let pass = 0; pass < 6; pass++) {
    let improved = false
    for (let r = 0; r < rows; r++) {
      const l = layers[r]
      if (l.length <= EXACT_MAX) continue
      for (let i = 0; i < l.length; i++) {
        // Try inserting node i at every other position; keep the first strict improvement.
        for (let j = 0; j < l.length; j++) {
          if (j === i) continue
          const moved = l.splice(i, 1)[0]
          l.splice(j, 0, moved)
          refresh()
          const next = rowCrossings()
          if (next < current) { current = next; improved = true; break }
          l.splice(j, 1)
          l.splice(i, 0, moved)
          refresh()
        }
      }
    }
    if (!improved) break
  }
  return { layers, crossings: current }
}

/**
 * Integer positions for an ordered row, each at least 1 apart, as close as possible (least
 * squares) to the desired positions: pool-adjacent-violators on the shifted values d_i - i, so a
 * group of nodes that all want one column is centered on it instead of pushed to one side.
 */
function spacedPlacement(desired: number[], widths?: number[]): number[] {
  const prefix: number[] = []
  let acc = 0
  for (let i = 0; i < desired.length; i++) { prefix.push(acc); acc += widths ? widths[i] : 1 }
  const blocks: Array<{ start: number; end: number; sum: number }> = []
  for (let i = 0; i < desired.length; i++) {
    blocks.push({ start: i, end: i, sum: desired[i] - prefix[i] })
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2]
      const meanA = a.sum / (a.end - a.start + 1), meanB = b.sum / (b.end - b.start + 1)
      if (meanA <= meanB) break
      blocks.pop(); blocks.pop()
      blocks.push({ start: a.start, end: b.end, sum: a.sum + b.sum })
    }
  }
  const out = new Array<number>(desired.length)
  let prevEnd = -Infinity
  for (const b of blocks) {
    const mean = b.sum / (b.end - b.start + 1)
    for (let i = b.start; i <= b.end; i++) { out[i] = Math.max(Math.round(mean + prefix[i]), prevEnd); prevEnd = out[i] + (widths ? widths[i] : 1) }
  }
  return out
}

// ─── routing ──────────────────────────────────────────────────────────────────

interface RouterOptions { clearance: number; laneSpacing: number; lanes: number; bendPenalty: number; crossingPenalty: number }

interface Box { x: number; y: number; hw: number; hh: number }

function routeAll(
  nodes: readonly LayoutNode[],
  center: Point[],
  edgeEnds: Array<[number, number] | null>,
  col: Int32Array,
  row: Int32Array,
  cw: number,
  ch: number,
  origin: Point,
  edgeClass: number[],
  groups: Array<number | undefined>,
  o: RouterOptions,
): { points: Point[][]; fallbacks: number } {
  const n = nodes.length
  const points: Point[][] = edgeEnds.map(() => [])
  if (n === 0) return { points, fallbacks: 0 }
  const boxes: Box[] = nodes.map((nd, i) => ({ x: center[i].x, y: center[i].y, hw: nd.width / 2, hh: nd.height / 2 }))
  const inflated: Box[] = boxes.map(b => ({ x: b.x, y: b.y, hw: b.hw + o.clearance, hh: b.hh + o.clearance }))

  // Lattice lines: channel lanes between every pair of neighboring grid lines (and one channel
  // outside each edge of the grid), plus port lines through each occupied column / row.
  const minCol = Math.min(...Array.from(col)), maxCol = Math.max(...Array.from(col))
  const minRow = Math.min(...Array.from(row)), maxRow = Math.max(...Array.from(row))
  const laneOffsets = Array.from({ length: o.lanes }, (_, k) => (k - (o.lanes - 1) / 2) * o.laneSpacing)
  const portOffsets = (half: number, step: number, max: number): number[] => {
    const out = [0]
    for (let k = 1; k <= max; k++) { if (k * step <= half - step / 2) { out.push(-k * step); out.push(k * step) } }
    return out.sort((a, b) => a - b)
  }
  const maxHW = Math.max(...boxes.map(b => b.hw)), maxHH = Math.max(...boxes.map(b => b.hh))
  const portX = portOffsets(maxHW, o.laneSpacing, 3)
  const portY = portOffsets(maxHH, Math.max(8, Math.round(o.laneSpacing / 2)), 3)

  const xsSet = new Set<number>(), ysSet = new Set<number>()
  for (let c = minCol - 1; c <= maxCol; c++) for (const off of laneOffsets) xsSet.add(origin.x + c * cw + cw / 2 + off)
  for (let r = minRow - 1; r <= maxRow; r++) for (const off of laneOffsets) ysSet.add(origin.y + r * ch + ch / 2 + off)
  for (let c = minCol; c <= maxCol; c++) for (const off of portX) xsSet.add(origin.x + c * cw + off)
  for (let r = minRow; r <= maxRow; r++) for (const off of portY) ysSet.add(origin.y + r * ch + off)
  const xs = [...xsSet].sort((a, b) => a - b)
  const ys = [...ysSet].sort((a, b) => a - b)
  const xIndex = new Map(xs.map((v, i) => [v, i]))
  const yIndex = new Map(ys.map((v, i) => [v, i]))
  const W = xs.length, H = ys.length
  const vid = (ix: number, iy: number) => iy * W + ix

  // Segment blocking: a lattice segment that enters any node's clearance box is unavailable.
  // Horizontal segment h[iy][ix] joins (ix,iy)-(ix+1,iy); vertical v[iy][ix] joins (ix,iy)-(ix,iy+1).
  const hBlocked = new Uint8Array(W * H), vBlocked = new Uint8Array(W * H)
  // Owner token per used segment: a bus group shares one token, every other edge has its own.
  const hUsed = new Int32Array(W * H).fill(-1), vUsed = new Int32Array(W * H).fill(-1)
  const tokenOf = (ei: number) => (groups[ei] !== undefined ? groups[ei]! : 1_000_000 + ei)
  const intersects = (ax: number, ay: number, bx: number, by: number, b: Box): boolean => {
    // Grazing the box boundary is not entering it (matches the harness's Liang-Barsky test).
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minY = Math.min(ay, by), maxY = Math.max(ay, by)
    return minX < b.x + b.hw - 1e-9 && maxX > b.x - b.hw + 1e-9 && minY < b.y + b.hh - 1e-9 && maxY > b.y - b.hh + 1e-9
  }
  for (const b of inflated) {
    const x0 = lowerBound(xs, b.x - b.hw), x1 = upperBound(xs, b.x + b.hw)
    const y0 = lowerBound(ys, b.y - b.hh), y1 = upperBound(ys, b.y + b.hh)
    for (let iy = Math.max(0, y0 - 1); iy <= Math.min(H - 1, y1); iy++) for (let ix = Math.max(0, x0 - 1); ix <= Math.min(W - 1, x1); ix++) {
      if (ix + 1 < W && intersects(xs[ix], ys[iy], xs[ix + 1], ys[iy], b)) hBlocked[vid(ix, iy)] = 1
      if (iy + 1 < H && intersects(xs[ix], ys[iy], xs[ix], ys[iy + 1], b)) vBlocked[vid(ix, iy)] = 1
    }
  }
  // Straight-through traffic per vertex, by axis (counts, so a route can be ripped up).
  const throughH = new Uint16Array(W * H), throughV = new Uint16Array(W * H)

  // Ports: slots on each side of each node, each with the lattice vertex its stub reaches.
  interface Slot { side: 0 | 1 | 2 | 3; port: Point; vertex: number; used: boolean }
  const slotsOf: Slot[][] = nodes.map((_, i) => {
    const b = boxes[i], ib = inflated[i]
    const out: Slot[] = []
    for (const off of portX) {
      const x = b.x + off
      if (Math.abs(off) > b.hw - 4 || !xIndex.has(x)) continue
      const ix = xIndex.get(x)!
      const upY = ys[upperBound(ys, ib.y - ib.hh) - 1]
      const downY = ys[lowerBound(ys, ib.y + ib.hh)]
      if (upY !== undefined && upY < ib.y - ib.hh + 1e-9) out.push({ side: 3, port: { x, y: b.y - b.hh }, vertex: vid(ix, yIndex.get(upY)!), used: false })
      if (downY !== undefined && downY > ib.y + ib.hh - 1e-9) out.push({ side: 1, port: { x, y: b.y + b.hh }, vertex: vid(ix, yIndex.get(downY)!), used: false })
    }
    for (const off of portY) {
      const y = b.y + off
      if (Math.abs(off) > b.hh - 4 || !yIndex.has(y)) continue
      const iy = yIndex.get(y)!
      const leftX = xs[upperBound(xs, ib.x - ib.hw) - 1]
      const rightX = xs[lowerBound(xs, ib.x + ib.hw)]
      if (leftX !== undefined && leftX < ib.x - ib.hw + 1e-9) out.push({ side: 2, port: { x: b.x - b.hw, y }, vertex: vid(xIndex.get(leftX)!, iy), used: false })
      if (rightX !== undefined && rightX > ib.x + ib.hw - 1e-9) out.push({ side: 0, port: { x: b.x + b.hw, y }, vertex: vid(xIndex.get(rightX)!, iy), used: false })
    }
    return out
  })

  // Route order: structural edges, then relational, then navigation routes; longest Manhattan
  // distance first within a class, ties by edge index. Bus members route right after their first.
  const order = edgeEnds.map((e, i) => ({ i, cls: edgeClass[i], d: e ? Math.abs(center[e[0]].x - center[e[1]].x) + Math.abs(center[e[0]].y - center[e[1]].y) : -1 }))
    .filter(x => x.d >= 0)
    .sort((a, b) => a.cls - b.cls || (groups[a.i] ?? -1) - (groups[b.i] ?? -1) || b.d - a.d || a.i - b.i)

  let fallbacks = 0
  const heap = new MinHeap()
  const gScore = new Float64Array(W * H * 4)
  const cameFrom = new Int32Array(W * H * 4)
  const closed = new Uint8Array(W * H * 4)
  // What each routed edge occupies, so it can be ripped up and re-routed.
  interface Commit { states: number[]; startSlot: Slot; endSlot: Slot; fallback: boolean }
  const commits: Array<Commit | null> = edgeEnds.map(() => null)

  const applyUsage = (ei: number, c: Commit, sign: 1 | -1) => {
    const { states } = c
    for (let k = 1; k < states.length; k++) {
      const pv = Math.floor(states[k - 1] / 4), d = states[k] % 4
      const pix = pv % W, piy = Math.floor(pv / W)
      const key = d === 0 ? vid(pix, piy) : d === 2 ? vid(pix - 1, piy) : d === 1 ? vid(pix, piy) : vid(pix, piy - 1)
      const token = tokenOf(ei)
      if (d === 0 || d === 2) { if (sign > 0) hUsed[key] = token; else if (hUsed[key] === token && groups[ei] === undefined) hUsed[key] = -1 }
      else { if (sign > 0) vUsed[key] = token; else if (vUsed[key] === token && groups[ei] === undefined) vUsed[key] = -1 }
      // Straight-through at the previous vertex (arrival and departure directions agree).
      if (states[k - 1] % 4 === d) { if (d === 0 || d === 2) throughH[pv] += sign; else throughV[pv] += sign }
    }
    const goal = states[states.length - 1]
    const lastV = Math.floor(goal / 4)
    if (goal % 4 === 0 || goal % 4 === 2) throughH[lastV] += sign; else throughV[lastV] += sign
    // A bus shares its parent-side slot; the child-side slot is the edge's own.
    if (groups[ei] === undefined) c.startSlot.used = sign > 0
    else if (sign > 0) c.startSlot.used = true
    c.endSlot.used = sign > 0
  }

  const busSlot = new Map<number, Slot>()
  const routeOne = (ei: number): Commit | null => {
    const [s, t] = edgeEnds[ei]!
    const g = groups[ei]
    const shared = g !== undefined ? busSlot.get(g) : undefined
    const sSlots = shared ? [shared] : slotsOf[s].filter(sl => !sl.used)
    const tSlots = slotsOf[t].filter(sl => !sl.used)
    const myToken = tokenOf(ei)
    const crossingPenalty = edgeClass[ei] === 2 ? 2 * o.crossingPenalty : o.crossingPenalty
    const targetByVertex = new Map<number, Slot>()
    for (const sl of tSlots) targetByVertex.set(sl.vertex, sl)
    const tb = boxes[t]
    const heuristic = (v: number) => Math.abs(xs[v % W] - tb.x) + Math.abs(ys[Math.floor(v / W)] - tb.y) - tb.hw - tb.hh

    gScore.fill(Infinity); closed.fill(0); heap.clear()
    const startSlotOf = new Map<number, Slot>()
    for (const sl of sSlots) {
      // The stub leaves the box along the side's normal; its direction is the incoming direction.
      const dir = sl.side
      const g = Math.hypot(sl.port.x - xs[sl.vertex % W], sl.port.y - ys[Math.floor(sl.vertex / W)])
      const st = sl.vertex * 4 + dir
      if (g < gScore[st]) { gScore[st] = g; cameFrom[st] = -1; startSlotOf.set(st, sl); heap.push(g + heuristic(sl.vertex), g, st) }
    }
    let goal = -1
    while (heap.size) {
      const { state } = heap.pop()
      if (closed[state]) continue
      closed[state] = 1
      const v = Math.floor(state / 4), dir = state % 4
      const tslot = targetByVertex.get(v)
      // Arriving at a target stub vertex heading toward the box (the stub direction is the side's inward normal).
      if (tslot && dir === ((tslot.side + 2) % 4)) { goal = state; break }
      const ix = v % W, iy = Math.floor(v / W)
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (dir + 2) % 4) continue // no U-turns
        const nix = ix + DIRS[nd].dx, niy = iy + DIRS[nd].dy
        if (nix < 0 || niy < 0 || nix >= W || niy >= H) continue
        const segKey = nd === 0 ? vid(ix, iy) : nd === 2 ? vid(nix, iy) : nd === 1 ? vid(ix, iy) : vid(ix, niy)
        const horizontal = nd === 0 || nd === 2
        const used = horizontal ? hUsed[segKey] : vUsed[segKey]
        if ((horizontal ? hBlocked[segKey] : vBlocked[segKey]) || (used >= 0 && used !== myToken)) continue
        const straight = nd === dir
        let cost = horizontal ? Math.abs(xs[nix] - xs[ix]) : Math.abs(ys[niy] - ys[iy])
        if (!straight) cost += o.bendPenalty
        // Passing straight through a vertex that another route crosses perpendicularly.
        if (straight && (horizontal ? throughV[v] : throughH[v])) cost += crossingPenalty
        // Turning on a vertex with through-traffic makes a T-junction; cheap but not free.
        if (!straight && (throughV[v] || throughH[v])) cost += o.bendPenalty / 2
        const nv = vid(nix, niy)
        const ns = nv * 4 + nd
        const g = gScore[state] + cost
        if (g < gScore[ns]) { gScore[ns] = g; cameFrom[ns] = state; heap.push(g + heuristic(nv), g, ns) }
      }
    }
    if (goal < 0) return null
    const states: number[] = []
    for (let st = goal; st >= 0; st = cameFrom[st]) { states.push(st); if (cameFrom[st] === -1) break }
    states.reverse()
    return { states, startSlot: startSlotOf.get(states[0])!, endSlot: targetByVertex.get(Math.floor(goal / 4))!, fallback: false }
  }

  const pathOf = (c: Commit): Point[] => {
    const path: Point[] = [c.startSlot.port]
    for (const st of c.states) { const v = Math.floor(st / 4); path.push({ x: xs[v % W], y: ys[Math.floor(v / W)] }) }
    path.push(c.endSlot.port)
    return mergeCollinear(path)
  }

  for (const { i: ei } of order) {
    const c = routeOne(ei)
    if (!c) { fallbacks++; const [s, t] = edgeEnds[ei]!; points[ei] = fallbackRoute(boxes[s], boxes[t]); continue }
    commits[ei] = c
    applyUsage(ei, c, 1)
    if (groups[ei] !== undefined && !busSlot.has(groups[ei]!)) busSlot.set(groups[ei]!, c.startSlot)
  }

  // Rip-up and re-route: an edge routed early committed to crossings before the routes it
  // crosses existed. With every other route fixed, re-route each crossing edge; keep the new
  // route only when its crossing count does not rise. Two passes, in route order.
  const crossingsOf = (c: Commit): number => {
    let count = 0
    const { states } = c
    for (let k = 1; k < states.length; k++) {
      const pv = Math.floor(states[k - 1] / 4), d = states[k] % 4
      if (states[k - 1] % 4 !== d) continue
      if (d === 0 || d === 2) count += throughV[pv]; else count += throughH[pv]
    }
    return count
  }
  for (let pass = 0; pass < 2; pass++) {
    let changed = false
    for (const { i: ei } of order) {
      const c = commits[ei]
      if (!c || groups[ei] !== undefined) continue
      applyUsage(ei, c, -1)
      const before = crossingsOf(c)
      if (before === 0) { applyUsage(ei, c, 1); continue }
      const alt = routeOne(ei)
      if (alt && crossingsOf(alt) < before) { commits[ei] = alt; applyUsage(ei, alt, 1); changed = true }
      else applyUsage(ei, c, 1)
    }
    if (!changed) break
  }
  commits.forEach((c, ei) => { if (c) points[ei] = pathOf(c) })

  // Dropped edges (self-loops, unknown endpoints) get a degenerate but finite two-point route.
  edgeEnds.forEach((e, i) => { if (!e) points[i] = [{ x: 0, y: 0 }, { x: 0, y: 0 }] })
  return { points, fallbacks }
}

function fallbackRoute(a: Box, b: Box): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sx = a.x + Math.sign(dx) * a.hw
    const tx = b.x - Math.sign(dx) * b.hw
    return mergeCollinear([{ x: sx, y: a.y }, { x: (sx + tx) / 2, y: a.y }, { x: (sx + tx) / 2, y: b.y }, { x: tx, y: b.y }])
  }
  const sy = a.y + Math.sign(dy) * a.hh
  const ty = b.y - Math.sign(dy) * b.hh
  return mergeCollinear([{ x: a.x, y: sy }, { x: a.x, y: (sy + ty) / 2 }, { x: b.x, y: (sy + ty) / 2 }, { x: b.x, y: ty }])
}

function mergeCollinear(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue
    out.push({ x: p.x, y: p.y })
  }
  let i = 1
  while (i < out.length - 1) {
    const a = out[i - 1], b = out[i], c = out[i + 1]
    const collinear = (Math.abs(a.x - b.x) < 1e-9 && Math.abs(b.x - c.x) < 1e-9) || (Math.abs(a.y - b.y) < 1e-9 && Math.abs(b.y - c.y) < 1e-9)
    const between = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0
    if (collinear && between) out.splice(i, 1)
    else i++
  }
  return out
}

function lowerBound(arr: number[], v: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v - 1e-9) lo = m + 1; else hi = m }
  return lo
}
function upperBound(arr: number[], v: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= v + 1e-9) lo = m + 1; else hi = m }
  return lo
}

/** Binary min-heap keyed by (f, g, state): deterministic for equal f. */
class MinHeap {
  private f: number[] = []
  private g: number[] = []
  private s: number[] = []
  get size(): number { return this.f.length }
  clear(): void { this.f.length = 0; this.g.length = 0; this.s.length = 0 }
  private less(i: number, j: number): boolean {
    return this.f[i] < this.f[j] || (this.f[i] === this.f[j] && (this.g[i] > this.g[j] || (this.g[i] === this.g[j] && this.s[i] < this.s[j])))
  }
  private swap(i: number, j: number): void {
    [this.f[i], this.f[j]] = [this.f[j], this.f[i]]; [this.g[i], this.g[j]] = [this.g[j], this.g[i]]; [this.s[i], this.s[j]] = [this.s[j], this.s[i]]
  }
  push(f: number, g: number, state: number): void {
    this.f.push(f); this.g.push(g); this.s.push(state)
    let i = this.f.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (this.less(i, p)) { this.swap(i, p); i = p } else break }
  }
  pop(): { f: number; g: number; state: number } {
    const top = { f: this.f[0], g: this.g[0], state: this.s[0] }
    const lf = this.f.pop()!, lg = this.g.pop()!, ls = this.s.pop()!
    if (this.f.length) {
      this.f[0] = lf; this.g[0] = lg; this.s[0] = ls
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < this.f.length && this.less(l, m)) m = l
        if (r < this.f.length && this.less(r, m)) m = r
        if (m === i) break
        this.swap(i, m); i = m
      }
    }
    return top
  }
}
