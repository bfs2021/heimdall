import { Delaunay } from 'd3-delaunay'
import { packSiblings } from 'd3-hierarchy'
import type { LayoutNode, LayoutEdge } from './graphLayout'

/**
 * Organic layout — phase-1 proof of concept of the engine described in
 * heimdall-layout-loop/design-material/organic/algorithm-research.md.
 *
 * Pipeline (all deterministic, no Math.random, no wall-clock stopping):
 *   0. normalize: sort by id, drop self-loops/dangling edges, merge duplicate pairs, split into
 *      connected components (isolates are their own components).
 *   1. ideal distances per component: hop distance × preferred edge length (scaled by
 *      compactness), floored for adjacent pairs so two boxes are never asked to sit closer than
 *      their footprints plus minimumNodeDistance; leaves of one star get a ring distance.
 *   2. initial positions: classical MDS (PivotMDS above MDS_MAX_NODES) on a cold start, the
 *      supplied positions on a warm start.
 *   3. stress majorization with localized (Gauss-Seidel) updates, stress recorded per sweep.
 *   5. overlap removal: GTree-style growing tree over the Delaunay triangulation, looped until a
 *      pairwise scan finds no overlap, with a shape-preserving scale-up as the terminating
 *      fallback — so zero overlap and the minimum node distance are hard post-conditions.
 *   6. components packed with d3.packSiblings (cold start only).
 *   7. Procrustes alignment to the supplied positions (warm start with scope 'all').
 *
 * Warm start. Node x/y are the start positions. They are a *sketch* only when at least 70% of
 * the nodes have finite coordinates; `scope: 'auto'` (default) then re-solves only nodes without coordinates,
 * those in `affectedIds`, and their graph neighbors, and leaves an already valid layout
 * untouched — which is what makes re-running the engine on its own output a no-op and what
 * animated transitions need. A start whose positioned nodes overlap or sit closer than
 * minimumNodeDistance (e.g. GraphCanvas's circle seed) is not a sketch and is solved cold.
 * Pinned nodes are never moved by the stress solve; the overlap stage may still shift them
 * (documented limitation of this POC).
 */
export interface OrganicLayoutOptions {
  /** Ideal length of an edge in px (default 160). */
  preferredEdgeLength?: number
  /** Smallest box-to-box gap guaranteed between any two nodes, in px (default 24). */
  minimumNodeDistance?: number
  /** 0..1, scales every ideal distance: 0 = airy (1.25×), 1 = tight (0.75×). Default 0.5. */
  compactness?: number
  /** 'auto' (see above), 'all' = re-solve every unpinned node from the given positions,
   *  'affected' = only affectedIds, unpositioned nodes and their neighbors. */
  scope?: 'auto' | 'all' | 'affected'
  affectedIds?: Iterable<string>
  /** Majorization sweeps cap (default 300) and relative stress-change tolerance (default 1e-4). */
  maxIterations?: number
  tolerance?: number
  /** Gap between packed components (default 40). */
  componentSpacing?: number
}

export interface OrganicLayoutStats {
  iterations: number
  overlapIterations: number
  /** Times the scale-up fallback fired because growing the tree alone did not clear overlaps. */
  scaledUp: number
  components: number
  warmStart: boolean
  /** Nodes the stress solve was allowed to move. */
  solvedNodes: number
}

export interface OrganicLayoutResult {
  positions: Map<string, { x: number; y: number }>
  /** Total stress before the first sweep and after each sweep; non-increasing. */
  stressHistory: number[]
  stats: OrganicLayoutStats
}

type Pt = { x: number; y: number }

const MDS_MAX_NODES = 600
const PIVOTS = 50
const POWER_ITERATIONS = 120
const OVERLAP_MAX_PASSES = 50
const SCALE_MAX_PASSES = 20
const GROW_SLACK = 1.001

// ─── deterministic per-id helpers ────────────────────────────────────────────

function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}
const unitFor = (id: string): Pt => {
  const a = hash(id) * 2 * Math.PI
  return { x: Math.cos(a), y: Math.sin(a) }
}

// ─── geometry ────────────────────────────────────────────────────────────────

interface Box extends Pt { w: number; h: number }

/** Boxes overlap, or sit closer than `gap`, when both axis separations are short. */
function tooClose(a: Box, b: Box, gap: number): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap
}

/** Factor the center distance must grow by so the two (gap-padded) boxes clear each other. */
function growFactor(a: Box, b: Box, gap: number): number {
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  const rx = dx > 1e-9 ? ((a.w + b.w) / 2 + gap) / dx : Infinity
  const ry = dy > 1e-9 ? ((a.h + b.h) / 2 + gap) / dy : Infinity
  if (!(rx > 1 && ry > 1)) return 1
  return Math.min(rx, ry) * GROW_SLACK
}

// ─── main ────────────────────────────────────────────────────────────────────

export function organicLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: OrganicLayoutOptions = {},
): OrganicLayoutResult {
  const L = (options.preferredEdgeLength ?? 160) * (1.25 - 0.5 * Math.min(1, Math.max(0, options.compactness ?? 0.5)))
  const gap = options.minimumNodeDistance ?? 24
  const maxIterations = options.maxIterations ?? 300
  const tolerance = options.tolerance ?? 1e-4
  const componentSpacing = options.componentSpacing ?? 40

  // Stage 0 — normalize.
  const sorted = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const n = sorted.length
  const index = new Map<string, number>()
  sorted.forEach((nd, i) => index.set(nd.id, i))
  const adj: number[][] = sorted.map(() => [])
  const seenPair = new Set<string>()
  for (const e of edges) {
    const a = index.get(e.source)
    const b = index.get(e.target)
    if (a === undefined || b === undefined || a === b) continue
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seenPair.has(key)) continue
    seenPair.add(key)
    adj[a].push(b)
    adj[b].push(a)
  }
  for (const list of adj) list.sort((a, b) => a - b)

  const pos: Pt[] = sorted.map(nd => ({ x: nd.x, y: nd.y }))
  const boxes: Box[] = sorted.map((nd, i) => ({ x: pos[i].x, y: pos[i].y, w: nd.width, h: nd.height }))
  const syncBoxes = () => boxes.forEach((b, i) => { b.x = pos[i].x; b.y = pos[i].y })
  const positioned = pos.map(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  const positionedCount = positioned.filter(Boolean).length
  // A sketch needs most of the graph placed (Brandes & Pich's warm-start threshold, 70%); the
  // rest are new nodes to be placed next to their neighbors.
  const mostPositioned = n > 0 && positionedCount >= 2 && positionedCount >= 0.7 * n

  // Components (isolates are singletons).
  const compOf = new Int32Array(n).fill(-1)
  const components: number[][] = []
  for (let s = 0; s < n; s++) {
    if (compOf[s] !== -1) continue
    const c = components.length
    const members: number[] = []
    const stack = [s]
    compOf[s] = c
    while (stack.length) {
      const u = stack.pop()!
      members.push(u)
      for (const v of adj[u]) if (compOf[v] === -1) { compOf[v] = c; stack.push(v) }
    }
    members.sort((a, b) => a - b)
    components.push(members)
  }

  // Warm start detection: a sketch is a fully positioned layout that already honors the
  // post-conditions. Anything else (NaN coordinates, overlaps, a circle seed) is solved cold.
  const scope = options.scope ?? 'auto'
  const valid = mostPositioned && !anyTooClose(boxes.filter((_, i) => positioned[i]), gap)
  const warm = mostPositioned && (scope === 'auto' ? valid : true)
  const stats: OrganicLayoutStats = { iterations: 0, overlapIterations: 0, scaledUp: 0, components: components.length, warmStart: warm, solvedNodes: 0 }

  // Which nodes the stress solve may move.
  const movable = new Uint8Array(n)
  if (!warm || scope === 'all') {
    for (let i = 0; i < n; i++) movable[i] = sorted[i].pinned ? 0 : 1
  } else {
    const affected = new Set<number>()
    for (let i = 0; i < n; i++) if (!positioned[i]) affected.add(i)
    for (const id of options.affectedIds ?? []) { const i = index.get(id); if (i !== undefined) affected.add(i) }
    for (const i of [...affected]) for (const v of adj[i]) affected.add(v)
    for (const i of affected) if (!sorted[i].pinned) movable[i] = 1
  }
  stats.solvedNodes = movable.reduce((s, v) => s + v, 0)

  // Stages 1–3 per component (lockstep sweeps so the total stress history is monotone).
  const solvers = components
    .filter(m => m.length > 1)
    .map(m => buildComponentSolver(m, adj, sorted, pos, movable, L, gap, warm))

  const initial = warm ? pos.map(p => ({ ...p })) : null
  if (!warm) {
    // Cold start: MDS per component, every component centered at the origin for now.
    for (const s of solvers) s.initFromMds()
    for (const m of components) if (m.length === 1) { pos[m[0]].x = 0; pos[m[0]].y = 0 }
  } else {
    // Warm start: place nodes that have no coordinates next to their positioned neighbors.
    for (let i = 0; i < n; i++) {
      if (positioned[i]) continue
      const near = adj[i].filter(v => positioned[v])
      const pool = near.length ? near : components[compOf[i]].filter(v => positioned[v])
      const u = unitFor(sorted[i].id)
      if (pool.length) {
        const cx = pool.reduce((s, v) => s + pos[v].x, 0) / pool.length
        const cy = pool.reduce((s, v) => s + pos[v].y, 0) / pool.length
        pos[i] = { x: cx + u.x * L, y: cy + u.y * L }
      } else {
        const bb = bbox(boxes.filter((_, j) => positioned[j]))
        pos[i] = { x: bb.cx + u.x * (bb.w / 2 + L), y: bb.cy + u.y * (bb.h / 2 + L) }
      }
      positioned[i] = true
    }
  }

  const stressHistory: number[] = []
  if (solvers.length && stats.solvedNodes > 0) {
    let stress = solvers.reduce((s, c) => s + c.stress(), 0)
    stressHistory.push(stress)
    for (let it = 0; it < maxIterations; it++) {
      for (const s of solvers) s.sweep()
      const next = solvers.reduce((s, c) => s + c.stress(), 0)
      stressHistory.push(next)
      stats.iterations = it + 1
      if (stress - next <= tolerance * Math.max(stress, 1e-12)) break
      stress = next
    }
  } else if (solvers.length) {
    stressHistory.push(solvers.reduce((s, c) => s + c.stress(), 0))
  }

  // Stage 5 — overlap removal, guaranteed, per component.
  syncBoxes()
  for (const m of components) {
    if (m.length < 2) continue
    removeOverlaps(m, boxes, pos, sorted, gap, stats)
  }
  syncBoxes()

  // Stage 6 — pack components (cold only; a sketch keeps its arrangement).
  if (!warm) packComponents(components, boxes, pos, gap, componentSpacing)
  else if (anyTooClose(boxes, gap)) {
    // New nodes placed into a sketch can still collide across components; one global pass.
    removeOverlaps(components.flat(), boxes, pos, sorted, gap, stats)
  }

  // Stage 7 — keep a re-solved sketch oriented like its input.
  if (warm && scope === 'all' && initial) procrustesAlign(pos, initial)

  const positions = new Map<string, Pt>()
  sorted.forEach((nd, i) => positions.set(nd.id, { x: pos[i].x, y: pos[i].y }))
  return { positions, stressHistory, stats }
}

// ─── stress majorization per component ──────────────────────────────────────

interface ComponentSolver {
  initFromMds(): void
  sweep(): void
  stress(): number
}

function buildComponentSolver(
  members: number[],
  adj: number[][],
  nodes: readonly LayoutNode[],
  pos: Pt[],
  movable: Uint8Array,
  L: number,
  gap: number,
  warm: boolean,
): ComponentSolver {
  const m = members.length
  const local = new Map<number, number>()
  members.forEach((g, i) => local.set(g, i))
  const nbrs: number[][] = members.map(g => adj[g].map(v => local.get(v)!))

  // Stage 1 — ideal distances: BFS hops × L, adjacency floored by footprints, star leaves ringed.
  const d = new Float64Array(m * m)
  const w = new Float64Array(m * m)
  const queue = new Int32Array(m)
  const hop = new Int32Array(m)
  for (let s = 0; s < m; s++) {
    hop.fill(-1)
    hop[s] = 0
    let head = 0, tail = 0
    queue[tail++] = s
    while (head < tail) {
      const u = queue[head++]
      for (const v of nbrs[u]) if (hop[v] === -1) { hop[v] = hop[u] + 1; queue[tail++] = v }
    }
    for (let t = 0; t < m; t++) if (t !== s) d[s * m + t] = hop[t] * L
  }
  const sep = (a: number, b: number) => {
    const na = nodes[members[a]], nb = nodes[members[b]]
    return Math.hypot((na.width + nb.width) / 2, (na.height + nb.height) / 2) + gap
  }
  for (let a = 0; a < m; a++) for (const b of nbrs[a]) if (a < b) {
    const f = Math.max(d[a * m + b], sep(a, b))
    d[a * m + b] = f; d[b * m + a] = f
  }
  // Stage 4 — stars: leaves of one hub (>= 3 leaves) sit on a ring instead of a stress clump.
  for (let hub = 0; hub < m; hub++) {
    const leaves = nbrs[hub].filter(v => nbrs[v].length === 1)
    if (leaves.length < 3) continue
    const ring = Math.max(0, Math.min(2 * L, 2 * L * Math.sin(Math.PI / leaves.length)))
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j]
      const f = Math.max(ring, sep(a, b))
      d[a * m + b] = f; d[b * m + a] = f
    }
  }
  for (let i = 0; i < m * m; i++) w[i] = d[i] > 0 ? 1 / (d[i] * d[i]) : 0

  const p = () => members.map(g => pos[g])

  return {
    initFromMds() {
      const coords = m <= MDS_MAX_NODES ? classicalMds(d, m) : pivotMds(d, m)
      for (let i = 0; i < m; i++) {
        const u = unitFor(nodes[members[i]].id)
        // A tiny id-hashed offset breaks exact ties (collinear or coincident MDS output), which
        // would otherwise trap the localized updates on a line or a point.
        pos[members[i]] = { x: coords[2 * i] + u.x * 0.01 * L, y: coords[2 * i + 1] + u.y * 0.01 * L }
      }
      void warm
    },
    sweep() {
      const q = p()
      for (let i = 0; i < m; i++) {
        if (!movable[members[i]]) continue
        let nx = 0, ny = 0, den = 0
        const xi = q[i]
        for (let j = 0; j < m; j++) {
          if (j === i) continue
          const wij = w[i * m + j]
          if (wij === 0) continue
          const xj = q[j]
          let dx = xi.x - xj.x, dy = xi.y - xj.y
          let dist = Math.hypot(dx, dy)
          if (dist < 1e-9) { const u = unitFor(nodes[members[i]].id); dx = u.x; dy = u.y; dist = 1 }
          const dij = d[i * m + j]
          nx += wij * (xj.x + (dij * dx) / dist)
          ny += wij * (xj.y + (dij * dy) / dist)
          den += wij
        }
        if (den > 0) { xi.x = nx / den; xi.y = ny / den }
      }
    },
    stress() {
      const q = p()
      let s = 0
      for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
        const wij = w[i * m + j]
        if (wij === 0) continue
        const diff = Math.hypot(q[i].x - q[j].x, q[i].y - q[j].y) - d[i * m + j]
        s += wij * diff * diff
      }
      return s
    },
  }
}

// ─── initial positions ───────────────────────────────────────────────────────

/** Top-2 eigenvectors of a symmetric operator given as a matvec, by deterministic power iteration. */
function top2(matvec: (v: Float64Array, out: Float64Array) => void, size: number): { v1: Float64Array; l1: number; v2: Float64Array; l2: number } {
  const start = (k: number) => {
    const v = new Float64Array(size)
    for (let i = 0; i < size; i++) v[i] = Math.sin((i + 1) * (k + 1) * 0.7) + 0.5
    return v
  }
  const normalize = (v: Float64Array) => {
    let s = 0
    for (let i = 0; i < size; i++) s += v[i] * v[i]
    s = Math.sqrt(s) || 1
    for (let i = 0; i < size; i++) v[i] /= s
  }
  const dot = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < size; i++) s += a[i] * b[i]; return s }
  const iterate = (k: number, deflate?: { v: Float64Array; l: number }) => {
    let v = start(k)
    normalize(v)
    let out = new Float64Array(size)
    let lambda = 0
    for (let it = 0; it < POWER_ITERATIONS; it++) {
      matvec(v, out)
      if (deflate) { const c = deflate.l * dot(deflate.v, v); for (let i = 0; i < size; i++) out[i] -= c * deflate.v[i] }
      lambda = dot(v, out)
      normalize(out)
      const t = v; v = out; out = t
    }
    return { v, l: lambda }
  }
  const a = iterate(0)
  const b = iterate(1, a)
  return { v1: a.v, l1: a.l, v2: b.v, l2: b.l }
}

/** Classical (Torgerson) MDS on the full ideal-distance matrix. Returns [x0,y0,x1,y1,...]. */
function classicalMds(d: Float64Array, m: number): Float64Array {
  const sq = new Float64Array(m * m)
  for (let i = 0; i < m * m; i++) sq[i] = d[i] * d[i]
  const rowMean = new Float64Array(m)
  let grand = 0
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < m; j++) s += sq[i * m + j]; rowMean[i] = s / m; grand += s }
  grand /= m * m
  const B = new Float64Array(m * m)
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) B[i * m + j] = -0.5 * (sq[i * m + j] - rowMean[i] - rowMean[j] + grand)
  const { v1, l1, v2, l2 } = top2((v, out) => {
    for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < m; j++) s += B[i * m + j] * v[j]; out[i] = s }
  }, m)
  const out = new Float64Array(2 * m)
  const s1 = Math.sqrt(Math.max(l1, 0)), s2 = Math.sqrt(Math.max(l2, 0))
  for (let i = 0; i < m; i++) { out[2 * i] = v1[i] * s1; out[2 * i + 1] = v2[i] * s2 }
  return out
}

/** PivotMDS (Brandes & Pich 2007): double-centered n×k pivot distances, eigenvectors of CᵀC. */
function pivotMds(d: Float64Array, m: number): Float64Array {
  const k = Math.min(PIVOTS, m)
  const pivots: number[] = [0]
  const minDist = new Float64Array(m).fill(Infinity)
  while (pivots.length < k) {
    const last = pivots[pivots.length - 1]
    let best = -1, bestD = -1
    for (let i = 0; i < m; i++) {
      minDist[i] = Math.min(minDist[i], d[last * m + i])
      if (minDist[i] > bestD) { bestD = minDist[i]; best = i }
    }
    pivots.push(best)
  }
  const C = new Float64Array(m * k)
  const colMean = new Float64Array(k)
  const rowMean = new Float64Array(m)
  let grand = 0
  for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) {
    const v = d[i * m + pivots[j]] ** 2
    C[i * k + j] = v; colMean[j] += v / m; rowMean[i] += v / k; grand += v / (m * k)
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) C[i * k + j] = -0.5 * (C[i * k + j] - rowMean[i] - colMean[j] + grand)
  const { v1, v2 } = top2((v, out) => {
    // out = Cᵀ (C v)
    const tmp = new Float64Array(m)
    for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < k; j++) s += C[i * k + j] * v[j]; tmp[i] = s }
    for (let j = 0; j < k; j++) { let s = 0; for (let i = 0; i < m; i++) s += C[i * k + j] * tmp[i]; out[j] = s }
  }, k)
  const out = new Float64Array(2 * m)
  for (let i = 0; i < m; i++) {
    let x = 0, y = 0
    for (let j = 0; j < k; j++) { x += C[i * k + j] * v1[j]; y += C[i * k + j] * v2[j] }
    out[2 * i] = x; out[2 * i + 1] = y
  }
  return out
}

// ─── overlap removal (GTree) ─────────────────────────────────────────────────

function anyTooClose(boxes: Box[], gap: number): boolean {
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (tooClose(boxes[i], boxes[j], gap)) return true
  return false
}

function proximityEdges(members: number[], boxes: Box[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const seen = new Set<string>()
  const add = (a: number, b: number) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (!seen.has(key)) { seen.add(key); out.push(a < b ? [a, b] : [b, a]) }
  }
  if (members.length >= 3) {
    const pts = new Float64Array(members.length * 2)
    members.forEach((g, i) => { pts[2 * i] = boxes[g].x; pts[2 * i + 1] = boxes[g].y })
    const delaunay = new Delaunay(pts)
    const tri = delaunay.triangles
    for (let t = 0; t < tri.length; t += 3) {
      add(members[tri[t]], members[tri[t + 1]])
      add(members[tri[t + 1]], members[tri[t + 2]])
      add(members[tri[t + 2]], members[tri[t]])
    }
    // Collinear input yields no triangles; the hull is then the path itself.
    if (tri.length === 0) {
      const hull = delaunay.hull
      for (let i = 0; i + 1 < hull.length; i++) add(members[hull[i]], members[hull[i + 1]])
    }
  }
  if (members.length < 3 || out.length === 0) {
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) add(members[i], members[j])
  }
  return out
}

function removeOverlaps(members: number[], boxes: Box[], pos: Pt[], nodes: readonly LayoutNode[], gap: number, stats: OrganicLayoutStats): void {
  const sync = () => members.forEach(g => { boxes[g].x = pos[g].x; boxes[g].y = pos[g].y })
  // Coincident centers have no direction to grow along: nudge them apart deterministically first.
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const a = members[i], b = members[j]
    if (Math.abs(pos[a].x - pos[b].x) < 1e-6 && Math.abs(pos[a].y - pos[b].y) < 1e-6) {
      const u = unitFor(nodes[b].id)
      pos[b].x += u.x; pos[b].y += u.y
    }
  }
  sync()
  for (let pass = 0; pass < OVERLAP_MAX_PASSES; pass++) {
    const overlapping: Array<[number, number]> = []
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      if (tooClose(boxes[members[i]], boxes[members[j]], gap)) overlapping.push([members[i], members[j]])
    }
    if (overlapping.length === 0) return
    stats.overlapIterations++
    // Candidate tree edges: Delaunay edges plus every overlapping pair (wide boxes can overlap
    // without being Delaunay-adjacent). Heaviest overlaps enter the tree first.
    const cand = proximityEdges(members, boxes)
    const seen = new Set(cand.map(([a, b]) => `${a}|${b}`))
    for (const [a, b] of overlapping) if (!seen.has(`${a}|${b}`)) cand.push([a, b])
    const weighted = cand.map(([a, b]) => ({ a, b, t: growFactor(boxes[a], boxes[b], gap) }))
    weighted.sort((p, q) => q.t - p.t || p.a - q.a || p.b - q.b)
    // Kruskal.
    const parent = new Map<number, number>(members.map(g => [g, g]))
    const find = (x: number): number => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)! } return x }
    const tree = new Map<number, Array<{ to: number; t: number }>>(members.map(g => [g, []]))
    for (const e of weighted) {
      const ra = find(e.a), rb = find(e.b)
      if (ra === rb) continue
      parent.set(ra, rb)
      tree.get(e.a)!.push({ to: e.b, t: e.t })
      tree.get(e.b)!.push({ to: e.a, t: e.t })
    }
    // Grow from the node nearest the centroid.
    let cx = 0, cy = 0
    for (const g of members) { cx += pos[g].x; cy += pos[g].y }
    cx /= members.length; cy /= members.length
    let root = members[0], best = Infinity
    for (const g of members) { const dd = Math.hypot(pos[g].x - cx, pos[g].y - cy); if (dd < best) { best = dd; root = g } }
    const next = new Map<number, Pt>([[root, { ...pos[root] }]])
    const stack = [root]
    const visited = new Set([root])
    while (stack.length) {
      const u = stack.pop()!
      const pu = next.get(u)!
      for (const { to, t } of tree.get(u)!) {
        if (visited.has(to)) continue
        visited.add(to)
        next.set(to, { x: pu.x + (pos[to].x - pos[u].x) * t, y: pu.y + (pos[to].y - pos[u].y) * t })
        stack.push(to)
      }
    }
    for (const g of members) { const q = next.get(g); if (q) { pos[g].x = q.x; pos[g].y = q.y } }
    sync()
  }
  // Fallback: uniform scale about the centroid preserves the shape exactly and must terminate.
  for (let pass = 0; pass < SCALE_MAX_PASSES; pass++) {
    let t = 1
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) t = Math.max(t, growFactor(boxes[members[i]], boxes[members[j]], gap))
    if (t <= 1) return
    stats.scaledUp++
    let cx = 0, cy = 0
    for (const g of members) { cx += pos[g].x; cy += pos[g].y }
    cx /= members.length; cy /= members.length
    for (const g of members) { pos[g].x = cx + (pos[g].x - cx) * t; pos[g].y = cy + (pos[g].y - cy) * t }
    sync()
  }
}

// ─── components and alignment ────────────────────────────────────────────────

function bbox(boxes: Box[]): { cx: number; cy: number; w: number; h: number } {
  if (boxes.length === 0) return { cx: 0, cy: 0, w: 0, h: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x - b.w / 2); maxX = Math.max(maxX, b.x + b.w / 2)
    minY = Math.min(minY, b.y - b.h / 2); maxY = Math.max(maxY, b.y + b.h / 2)
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY }
}

function packComponents(components: number[][], boxes: Box[], pos: Pt[], gap: number, spacing: number): void {
  if (components.length === 1) {
    const bb = bbox(components[0].map(g => boxes[g]))
    for (const g of components[0]) { pos[g].x -= bb.cx; pos[g].y -= bb.cy }
    return
  }
  const circles = components.map((m, i) => {
    const bb = bbox(m.map(g => boxes[g]))
    return { i, bb, r: Math.hypot(bb.w, bb.h) / 2 + Math.max(gap, spacing) / 2, x: 0, y: 0 }
  })
  circles.sort((a, b) => b.r - a.r || a.i - b.i)
  packSiblings(circles)
  for (const c of circles) for (const g of components[c.i]) { pos[g].x += c.x - c.bb.cx; pos[g].y += c.y - c.bb.cy }
}

/** Rigidly align `pos` onto `ref` (translation, rotation, reflection; no scaling). */
function procrustesAlign(pos: Pt[], ref: Pt[]): void {
  const n = pos.length
  if (n < 2) return
  const mean = (p: Pt[]) => p.reduce((s, q) => ({ x: s.x + q.x / n, y: s.y + q.y / n }), { x: 0, y: 0 })
  const mp = mean(pos), mr = mean(ref)
  const fit = (flip: boolean) => {
    let sxx = 0, sxy = 0, syx = 0, syy = 0
    for (let i = 0; i < n; i++) {
      const px = pos[i].x - mp.x, py = (pos[i].y - mp.y) * (flip ? -1 : 1)
      const rx = ref[i].x - mr.x, ry = ref[i].y - mr.y
      sxx += px * rx; sxy += px * ry; syx += py * rx; syy += py * ry
    }
    const theta = Math.atan2(sxy - syx, sxx + syy)
    const c = Math.cos(theta), s = Math.sin(theta)
    let err = 0
    const out: Pt[] = []
    for (let i = 0; i < n; i++) {
      const px = pos[i].x - mp.x, py = (pos[i].y - mp.y) * (flip ? -1 : 1)
      const q = { x: c * px - s * py + mr.x, y: s * px + c * py + mr.y }
      out.push(q)
      err += (q.x - ref[i].x) ** 2 + (q.y - ref[i].y) ** 2
    }
    return { err, out }
  }
  const a = fit(false), b = fit(true)
  const bestFit = b.err < a.err ? b : a
  for (let i = 0; i < n; i++) { pos[i].x = bestFit.out[i].x; pos[i].y = bestFit.out[i].y }
}
