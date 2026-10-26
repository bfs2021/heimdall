import type { LayoutNode, LayoutEdge } from './graphLayout'
import type { Point } from './graph'

/**
 * Orthogonal layout — phase-1 proof of concept of the engine described in
 * heimdall-layout-loop/design-material/orthogonal/algorithm-research.md: place-then-route.
 *
 * Placement (grid). Each connected component is layered by BFS depth from its highest-degree
 * node (the BFS tree is the structural skeleton; non-tree edges are the cyclic core, which
 * BFS confines to the same or adjacent rows). Rows are ordered by barycenter sweeps over all
 * edges, columns assigned by the priority method (each node as close as possible to the mean
 * column of its neighbors in the row above, left to right, no two nodes in one cell).
 * Components sit side by side, isolates in a row beneath. Every node owns one cell, so zero
 * overlap is a property of the occupancy map, not a cleanup pass; anchors are cell centers at
 * `origin + (col·cw, row·ch)`.
 *
 * Routing (lattice). The cell pitch leaves a channel of `lanes` parallel routing lanes between
 * neighboring rows and columns, `laneSpacing` apart and `clearance` + half a spacing away from
 * any node box. Each node side also exposes port slots on its own lines. Edges are routed one
 * at a time, longest first, by A* over the lattice with the cost `length + bendPenalty·bends +
 * crossingPenalty·crossings`; a lattice segment already used by a route, or one that enters
 * another node's clearance box, is simply unavailable, so routed edges never share a segment
 * and never pass through a node (hard requirements, not penalties). Each route is a polyline
 * from the source box boundary to the target box boundary, index-aligned with `edges`.
 *
 * Deterministic throughout: nodes are processed in id order, edges in a fixed order, and A*
 * breaks ties by vertex index. No Math.random, no wall-clock stopping.
 */
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
}

export interface OrthogonalLayoutStats {
  components: number
  rows: number
  cols: number
  /** Edges whose A* found no lattice path and fell back to a direct L; 0 is the goal. */
  fallbackRoutes: number
  droppedEdges: number
}

export interface OrthogonalLayoutResult {
  positions: Map<string, Point>
  /** One polyline per input edge (same index), source box boundary to target box boundary. */
  routes: Point[][]
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
  edges: readonly LayoutEdge[],
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

  // ─── placement ─────────────────────────────────────────────────────────────
  const col = new Int32Array(n), row = new Int32Array(n)
  const { components, isolates } = placeComponents(n, adj, col, row, componentGap, sweeps)

  const positions = new Map<string, Point>()
  const center: Point[] = sorted.map((nd, i) => {
    const p = { x: col[i] * cw, y: row[i] * ch }
    positions.set(nd.id, p)
    return p
  })

  // ─── routing ───────────────────────────────────────────────────────────────
  const routes = routeAll(sorted, center, edgeEnds, col, row, cw, ch, {
    clearance, laneSpacing, lanes,
    bendPenalty: options.bendPenalty ?? Math.max(cw, ch),
    crossingPenalty: options.crossingPenalty ?? 3 * Math.max(cw, ch),
  })

  const cols = n ? Math.max(...Array.from(col)) + 1 : 0
  const rows = n ? Math.max(...Array.from(row)) + 1 : 0
  return {
    positions,
    routes: routes.points,
    cell: { w: cw, h: ch },
    origin: { x: 0, y: 0 },
    stats: { components: components + (isolates ? 1 : 0), rows, cols, fallbackRoutes: routes.fallbacks, droppedEdges: dropped },
  }
}

// ─── placement ────────────────────────────────────────────────────────────────

function placeComponents(n: number, adj: number[][], col: Int32Array, row: Int32Array, gap: number, sweeps: number): { components: number; isolates: number } {
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
    const local = layoutComponent(m, adj, sweeps)
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

function layoutComponent(members: number[], adj: number[][], sweeps: number): { col: Map<number, number>; row: Map<number, number> } {
  // Candidate roots: BFS layerings whose widest layer is within one of the narrowest keep the
  // grid close to square (fit-to-view rewards that); among them, the root whose ordered layering
  // commits to the fewest crossings wins, then the shallowest, then the lowest id.
  const bfs = (root: number) => {
    const depth = new Map<number, number>([[root, 0]])
    const order: number[] = [root]
    for (let h = 0; h < order.length; h++) {
      const u = order[h]
      for (const v of adj[u]) if (!depth.has(v)) { depth.set(v, depth.get(u)! + 1); order.push(v) }
    }
    const widths = new Map<number, number>()
    for (const d of depth.values()) widths.set(d, (widths.get(d) ?? 0) + 1)
    return { root, depth, order, widest: Math.max(...widths.values()), rows: widths.size }
  }
  const layerings = members.map(bfs)
  const narrowest = Math.min(...layerings.map(l => l.widest))
  let best: { crossings: number; widest: number; rows: number; root: number; layers: number[][]; depth: Map<number, number> } | null = null
  for (const l of layerings) {
    if (l.widest > narrowest + ROOT_WIDTH_SLACK) continue
    const ordered = orderLayers(l.depth, l.order, l.rows, adj, sweeps)
    if (!best || ordered.crossings < best.crossings || (ordered.crossings === best.crossings && (l.widest < best.widest || (l.widest === best.widest && l.rows < best.rows)))) {
      best = { crossings: ordered.crossings, widest: l.widest, rows: l.rows, root: l.root, layers: ordered.layers, depth: l.depth }
    }
  }
  const { layers, depth } = best!
  const rows = layers.length

  // Column assignment: priority method, top down then bottom up, integer columns, in-order.
  const colOf = new Map<number, number>()
  layers[0].forEach((g, i) => colOf.set(g, i))
  const assign = (r: number, other: number) => {
    const want = layers[r].map(g => {
      const ns = adj[g].filter(v => depth.get(v) === other)
      return ns.length ? ns.reduce((s, v) => s + colOf.get(v)!, 0) / ns.length : NaN
    })
    // Nodes without a neighbor in the other row want to sit next to their left neighbor.
    for (let i = 0; i < want.length; i++) if (!Number.isFinite(want[i])) want[i] = i > 0 ? want[i - 1] + 1 : 0
    const out = spacedPlacement(want)
    layers[r].forEach((g, i) => colOf.set(g, out[i]))
  }
  for (let r = 1; r < rows; r++) assign(r, r - 1)
  for (let r = rows - 2; r >= 0; r--) assign(r, r + 1)
  for (let r = 1; r < rows; r++) assign(r, r - 1)

  // Normalize to column 0 and compact empty columns.
  const used = [...new Set(colOf.values())].sort((a, b) => a - b)
  const remap = new Map(used.map((c, i) => [c, i]))
  const col = new Map<number, number>()
  const row = new Map<number, number>()
  for (const g of members) { col.set(g, remap.get(colOf.get(g)!)!); row.set(g, depth.get(g)!) }
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
function spacedPlacement(desired: number[]): number[] {
  const blocks: Array<{ start: number; end: number; sum: number }> = []
  for (let i = 0; i < desired.length; i++) {
    blocks.push({ start: i, end: i, sum: desired[i] - i })
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2]
      const meanA = a.sum / (a.end - a.start + 1), meanB = b.sum / (b.end - b.start + 1)
      if (meanA <= meanB) break
      blocks.pop(); blocks.pop()
      blocks.push({ start: a.start, end: b.end, sum: a.sum + b.sum })
    }
  }
  const out = new Array<number>(desired.length)
  let prev = -Infinity
  for (const b of blocks) {
    const mean = b.sum / (b.end - b.start + 1)
    for (let i = b.start; i <= b.end; i++) { out[i] = Math.max(Math.round(mean + i), prev + 1); prev = out[i] }
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
  for (let c = minCol - 1; c <= maxCol; c++) for (const off of laneOffsets) xsSet.add(c * cw + cw / 2 + off)
  for (let r = minRow - 1; r <= maxRow; r++) for (const off of laneOffsets) ysSet.add(r * ch + ch / 2 + off)
  for (let c = minCol; c <= maxCol; c++) for (const off of portX) xsSet.add(c * cw + off)
  for (let r = minRow; r <= maxRow; r++) for (const off of portY) ysSet.add(r * ch + off)
  const xs = [...xsSet].sort((a, b) => a - b)
  const ys = [...ysSet].sort((a, b) => a - b)
  const xIndex = new Map(xs.map((v, i) => [v, i]))
  const yIndex = new Map(ys.map((v, i) => [v, i]))
  const W = xs.length, H = ys.length
  const vid = (ix: number, iy: number) => iy * W + ix

  // Segment blocking: a lattice segment that enters any node's clearance box is unavailable.
  // Horizontal segment h[iy][ix] joins (ix,iy)-(ix+1,iy); vertical v[iy][ix] joins (ix,iy)-(ix,iy+1).
  const hBlocked = new Uint8Array(W * H), vBlocked = new Uint8Array(W * H)
  const hUsed = new Int32Array(W * H).fill(-1), vUsed = new Int32Array(W * H).fill(-1)
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

  // Route order: longest Manhattan distance first, ties by edge index.
  const order = edgeEnds.map((e, i) => ({ i, d: e ? Math.abs(center[e[0]].x - center[e[1]].x) + Math.abs(center[e[0]].y - center[e[1]].y) : -1 }))
    .filter(x => x.d >= 0)
    .sort((a, b) => b.d - a.d || a.i - b.i)

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
      if (d === 0 || d === 2) hUsed[key] = sign > 0 ? ei : -1
      else vUsed[key] = sign > 0 ? ei : -1
      // Straight-through at the previous vertex (arrival and departure directions agree).
      if (states[k - 1] % 4 === d) { if (d === 0 || d === 2) throughH[pv] += sign; else throughV[pv] += sign }
    }
    const goal = states[states.length - 1]
    const lastV = Math.floor(goal / 4)
    if (goal % 4 === 0 || goal % 4 === 2) throughH[lastV] += sign; else throughV[lastV] += sign
    c.startSlot.used = sign > 0
    c.endSlot.used = sign > 0
  }

  const routeOne = (ei: number): Commit | null => {
    const [s, t] = edgeEnds[ei]!
    const sSlots = slotsOf[s].filter(sl => !sl.used)
    const tSlots = slotsOf[t].filter(sl => !sl.used)
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
        if (horizontal ? hBlocked[segKey] || hUsed[segKey] >= 0 : vBlocked[segKey] || vUsed[segKey] >= 0) continue
        const straight = nd === dir
        let cost = horizontal ? Math.abs(xs[nix] - xs[ix]) : Math.abs(ys[niy] - ys[iy])
        if (!straight) cost += o.bendPenalty
        // Passing straight through a vertex that another route crosses perpendicularly.
        if (straight && (horizontal ? throughV[v] : throughH[v])) cost += o.crossingPenalty
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
      if (!c) continue
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
