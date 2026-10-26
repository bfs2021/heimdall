import { Delaunay } from 'd3-delaunay'
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
 *   6. components shelf-packed into a block of roughly the viewport's aspect, isolated nodes as
 *      one grid block beneath them (cold start only).
 *   7. Procrustes alignment to the supplied positions (warm start with scope 'all').
 *
 * Warm start. Node x/y are the start positions. They are a *sketch* only when at least 70% of
 * the nodes have finite coordinates; `scope: 'auto'` (default) then re-solves only nodes without coordinates,
 * those in `affectedIds`, and their graph neighbors, and leaves an already valid layout
 * untouched — which is what makes re-running the engine on its own output a no-op and what
 * animated transitions need. A start whose positioned nodes overlap or sit closer than
 * minimumNodeDistance (e.g. GraphCanvas's circle seed) is not a sketch and is solved cold.
 * Note that a valid sketch with no new nodes and no affectedIds is returned unchanged: a caller
 * that changed the graph (removed a node, re-wired an edge) names the nodes to re-settle in
 * `affectedIds`, or asks for `scope: 'all'`.
 *
 * Pinned nodes (`pinned: true` with finite x/y) are never moved by the stress solve. On a cold
 * start each component's MDS frame is rigidly aligned onto its pins, and a component with pins
 * keeps its absolute place while the other components are packed beside it. The overlap stage
 * grows its tree from a pinned root, which never moves; a second pin in the same component can
 * still be displaced if the two pins conflict with the no-overlap post-condition, which wins.
 */
/**
 * An edge with optional layout hints:
 *  - `length`: preferred center-to-center length in px, a floor on the ideal distance of its
 *    endpoints in the stress solve (the longest wins when several edges join the same pair);
 *  - `label`: the footprint (already padded by whatever margin the renderer keeps clear) of a label
 *    drawn at the edge's midpoint, displaced `offset` px to the left of the source->target
 *    direction when the renderer bows its edges. The overlap stage then guarantees, like node
 *    separation, that the label clears every box in its component and the labels of the other
 *    labelled edges at either endpoint — a hub's labels fan out instead of piling up.
 */
export interface OrganicLayoutEdge extends LayoutEdge {
  length?: number
  label?: { width: number; height: number; offset?: number }
}

/** A labelled edge inside one component: source/target indices, label box size and offset. */
interface LabelHint { a: number; b: number; w: number; h: number; offset: number }

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
// No single grow factor exceeds this per pass: a near-coincident pair would otherwise ask for a
// hundredfold stretch at once (and an exactly coincident one for an infinite one), which cascades
// through the tree into NaN. The loop re-checks, so a larger need is met over several passes.
const GROW_CAP = 50
// Cold solves nudge boxes off third-party labels (best effort) only this many passes, so the
// remaining passes are the plain hard-constraint loop that is known to converge.
const NUDGE_PASSES = 25

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
  return Math.min(Math.min(rx, ry) * GROW_SLACK, GROW_CAP)
}

// ─── main ────────────────────────────────────────────────────────────────────

export function organicLayout(
  nodes: readonly LayoutNode[],
  edges: readonly OrganicLayoutEdge[],
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
  // Preferred lengths and label boxes per unordered pair (the longest / largest when edges repeat).
  const pairLength = new Map<string, number>()
  // Labels are kept per direction: an A->B and a B->A edge draw two labels, bowed to opposite sides.
  const pairLabel = new Map<string, LabelHint>()
  for (const e of edges) {
    const a = index.get(e.source)
    const b = index.get(e.target)
    if (a === undefined || b === undefined || a === b) continue
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (Number.isFinite(e.length) && (e.length as number) > 0) pairLength.set(key, Math.max(pairLength.get(key) ?? 0, e.length as number))
    if (e.label && e.label.width > 0 && e.label.height > 0) {
      const prev = pairLabel.get(`${a}>${b}`)
      pairLabel.set(`${a}>${b}`, { a, b, w: Math.max(prev?.w ?? 0, e.label.width), h: Math.max(prev?.h ?? 0, e.label.height), offset: Math.max(prev?.offset ?? 0, e.label.offset ?? 0) })
    }
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

  // Warm start detection: a sketch is a (mostly) positioned layout that already honors the
  // post-conditions. Anything else (NaN coordinates, overlaps, a circle seed) is solved cold.
  const scope = options.scope ?? 'auto'
  const labels = [...pairLabel.values()].sort((p, q) => p.a - q.a || p.b - q.b)
  const placedLabels = labels.filter(l => positioned[l.a] && positioned[l.b])
  const valid = mostPositioned && !anyTooClose(boxes.filter((_, i) => positioned[i]), gap) && labelViolations(placedLabels, boxes, pos).length === 0
  const warm = mostPositioned && (scope === 'auto' ? valid : true)
  const stats: OrganicLayoutStats = { iterations: 0, overlapIterations: 0, scaledUp: 0, components: components.length, warmStart: warm, solvedNodes: 0 }
  const pinned = sorted.map((nd, i) => Boolean(nd.pinned) && positioned[i])
  // The input positions of the nodes that had them: the Procrustes reference for a re-solved
  // sketch and the anchors for pinned nodes. Captured before any node is placed or moved.
  const originalPos = pos.map(q => ({ ...q }))
  const originallyPositioned = positioned.slice()

  // Which nodes the stress solve may move.
  const movable = new Uint8Array(n)
  if (!warm || scope === 'all') {
    for (let i = 0; i < n; i++) movable[i] = pinned[i] ? 0 : 1
  } else {
    const affected = new Set<number>()
    for (let i = 0; i < n; i++) if (!positioned[i]) affected.add(i)
    for (const id of options.affectedIds ?? []) { const i = index.get(id); if (i !== undefined) affected.add(i) }
    for (const i of [...affected]) for (const v of adj[i]) affected.add(v)
    for (const i of affected) if (!pinned[i]) movable[i] = 1
  }
  stats.solvedNodes = movable.reduce((s, v) => s + v, 0)

  // Stages 1–3 per component (lockstep sweeps so the total stress history is monotone).
  const solvers = components
    .filter(m => m.length > 1)
    .map(m => buildComponentSolver(m, adj, sorted, pos, movable, L, gap, pairLength))

  if (!warm) {
    // Cold start: MDS per component, then each component's frame anchored onto its pins (or
    // centered at the origin when it has none).
    for (const s of solvers) s.initFromMds()
    for (const m of components) if (m.length === 1) pos[m[0]] = pinned[m[0]] ? { ...originalPos[m[0]] } : { x: 0, y: 0 }
    for (const m of components) {
      const pins = m.filter(i => pinned[i])
      if (pins.length) { rigidAlign(pos, pins, originalPos, m); for (const i of pins) pos[i] = { ...originalPos[i] } }
    }
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
      boxes[i].x = pos[i].x; boxes[i].y = pos[i].y
      positioned[i] = true
    }
  }

  const stressHistory: number[] = []
  if (solvers.length && stats.solvedNodes > 0) {
    let stress = solvers.reduce((s, c) => s + c.stress(), 0)
    stressHistory.push(stress)
    for (let it = 0; it < maxIterations; it++) {
      let maxMove = 0
      for (const s of solvers) maxMove = Math.max(maxMove, s.sweep())
      const next = solvers.reduce((s, c) => s + c.stress(), 0)
      stressHistory.push(next)
      stats.iterations = it + 1
      // Converged when stress stops falling, in relative terms or because nothing moved by more
      // than a hundredth of a pixel (an exactly embeddable graph drives stress to 0, where a
      // relative test alone never fires).
      if (stress - next <= tolerance * Math.max(stress, 1e-12) || maxMove < 0.01) break
      stress = next
    }
  } else if (solvers.length) {
    stressHistory.push(solvers.reduce((s, c) => s + c.stress(), 0))
  }

  // Stage 7 — a sketch re-solved in full keeps its input's orientation: align the solved frame
  // onto the input positions BEFORE the overlap stage, so the axis-aligned post-conditions that
  // stage establishes are never rotated away afterwards. Pins are then restored exactly.
  if (warm && scope === 'all') {
    const ref = sorted.map((_, i) => i).filter(i => originallyPositioned[i])
    rigidAlign(pos, ref, originalPos, sorted.map((_, i) => i))
    for (let i = 0; i < n; i++) if (pinned[i]) pos[i] = { ...originalPos[i] }
  }

  // Stage 5 — overlap removal, guaranteed, per component.
  syncBoxes()
  const inComponent = new Map<number, LabelHint[]>()
  for (const l of labels) { const c = compOf[l.a]; (inComponent.get(c) ?? inComponent.set(c, []).get(c)!).push(l) }
  components.forEach((m, c) => {
    if (m.length < 2) return
    removeOverlaps(m, boxes, pos, sorted, pinned, gap, stats, inComponent.get(c) ?? [], !warm)
  })
  syncBoxes()

  // Stage 6 — pack components (cold only; a sketch keeps its arrangement).
  if (!warm) packComponents(components, boxes, pos, pinned, gap, componentSpacing)
  if (warm || components.some(m => m.some(i => pinned[i]))) {
    syncBoxes()
    // New nodes placed into a sketch, or components anchored by pins, can still collide across
    // components: one global pass over everything.
    if (anyTooClose(boxes, gap) || labelViolations(labels, boxes, pos).length) removeOverlaps(components.flat(), boxes, pos, sorted, pinned, gap, stats, labels)
  }

  const positions = new Map<string, Pt>()
  sorted.forEach((nd, i) => positions.set(nd.id, { x: pos[i].x, y: pos[i].y }))
  return { positions, stressHistory, stats }
}

// ─── stress majorization per component ──────────────────────────────────────

interface ComponentSolver {
  initFromMds(): void
  /** One Gauss-Seidel sweep over the movable nodes; returns the largest displacement in px. */
  sweep(): number
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
  pairLength: ReadonlyMap<string, number>,
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
  const preferred = (a: number, b: number) => {
    const ga = members[a], gb = members[b]
    return pairLength.get(ga < gb ? `${ga}|${gb}` : `${gb}|${ga}`) ?? 0
  }
  for (let a = 0; a < m; a++) for (const b of nbrs[a]) if (a < b) {
    const f = Math.max(d[a * m + b], sep(a, b), preferred(a, b))
    d[a * m + b] = f; d[b * m + a] = f
  }
  // Stage 4 — stars: leaves of one hub (>= 3 leaves) sit on a ring instead of a stress clump.
  // Deliberate deviation from design-material's `min(L, 2L·sin(π/k))`: the ring is capped at the
  // hop-2 ideal (2L), not L. Capping at L pulls every star's leaves inside their hop distance and
  // raised scale-fitted stress on real/miserables (many stars) from 0.129 to 0.142, past the
  // Stage 1 gate's 0.132; the cap only matters for k <= 6 anyway.
  // A star whose spokes carry preferred lengths (edge labels) puts its leaves on a ring of that
  // radius, so the leaves spread with the spokes instead of bunching at the shorter chord.
  for (let hub = 0; hub < m; hub++) {
    const leaves = nbrs[hub].filter(v => nbrs[v].length === 1)
    if (leaves.length < 3) continue
    const r = Math.max(L, ...leaves.map(v => preferred(hub, v)))
    const ring = Math.max(0, Math.min(2 * r, 2 * r * Math.sin(Math.PI / leaves.length)))
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
    },
    sweep() {
      const q = p()
      let maxMove = 0
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
        if (den > 0) {
          const nxv = nx / den, nyv = ny / den
          maxMove = Math.max(maxMove, Math.hypot(nxv - xi.x, nyv - xi.y))
          xi.x = nxv; xi.y = nyv
        }
      }
      return maxMove
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
  // The projection C·v is in singular-value units, not distance units (classical MDS's √λ·u
  // is). Fit one uniform scale so node-to-pivot distances match their ideals in least squares.
  let num = 0, den = 0
  for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) {
    const pj = pivots[j]
    if (pj === i) continue
    const e = Math.hypot(out[2 * i] - out[2 * pj], out[2 * i + 1] - out[2 * pj + 1])
    num += d[i * m + pj] * e; den += e * e
  }
  const scale = den > 0 ? num / den : 1
  for (let i = 0; i < 2 * m; i++) out[i] *= scale
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

/** The label box of a labelled edge: the straight midpoint of its endpoints, displaced `offset` px
 *  to the left of the source->target direction (where a bowed edge carries its midpoint). */
function labelBox(l: LabelHint, pos: Pt[]): Box {
  const dx = pos[l.b].x - pos[l.a].x, dy = pos[l.b].y - pos[l.a].y
  const dist = Math.hypot(dx, dy) || 1
  return { x: (pos[l.a].x + pos[l.b].x) / 2 - (dy / dist) * l.offset, y: (pos[l.a].y + pos[l.b].y) / 2 + (dx / dist) * l.offset, w: l.w, h: l.h }
}

/**
 * Label post-conditions, as pairs that must grow apart: a label overlapping one of its own
 * endpoint boxes grows that edge; two labels at a shared endpoint overlapping each other grow the
 * distance between their far endpoints (both midpoints move with it, the shared endpoint does
 * not). Growing the edge by `t` grows the label's distance from the endpoint by the same `t`,
 * so the factors are exactly those of the ordinary box pairs.
 */
function labelViolations(labels: readonly LabelHint[], boxes: Box[], pos: Pt[]): Array<{ a: number; b: number; t: number }> {
  const out: Array<{ a: number; b: number; t: number }> = []
  const lb = labels.map(l => labelBox(l, pos))
  const atNode = new Map<number, number[]>()
  const pair = (a: number, b: number, t: number) => out.push({ a: Math.min(a, b), b: Math.max(a, b), t })
  labels.forEach((l, i) => {
    for (const end of [l.a, l.b]) {
      if (tooClose(boxes[end], lb[i], 0)) pair(l.a, l.b, growFactor(boxes[end], lb[i], 0))
      ;(atNode.get(end) ?? atNode.set(end, []).get(end)!).push(i)
    }
  })
  for (const [u, idx] of atNode) {
    for (let i = 0; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) {
      const li = labels[idx[i]], lj = labels[idx[j]]
      const vi = li.a === u ? li.b : li.a
      const vj = lj.a === u ? lj.b : lj.a
      if (vi === vj || !tooClose(lb[idx[i]], lb[idx[j]], 0)) continue
      pair(vi, vj, growFactor(lb[idx[i]], lb[idx[j]], 0))
    }
  }
  return out
}

/**
 * Best effort, not a post-condition: a box that is neither endpoint of a labelled edge but sits
 * on that edge's label is nudged off it along the axis of least penetration (a renderer that
 * steers labels away from boxes would otherwise slide the label along its edge and back into a
 * sibling label). Growing a tree edge for this instead stretches the whole drawing, so the nudge
 * is a plain translation; the ordinary overlap pass that follows repairs any box overlap it
 * causes, and the loop re-checks. Pinned boxes are left alone. Returns how many boxes moved.
 */
function nudgeOffLabels(labels: readonly LabelHint[], members: readonly number[], boxes: Box[], pos: Pt[], pinned: boolean[]): number {
  let moved = 0
  for (const l of labels) {
    const lb = labelBox(l, pos)
    for (const c of members) {
      if (c === l.a || c === l.b || pinned[c] || !tooClose(boxes[c], lb, 0)) continue
      const px = (boxes[c].w + lb.w) / 2 - Math.abs(boxes[c].x - lb.x) + 0.5
      const py = (boxes[c].h + lb.h) / 2 - Math.abs(boxes[c].y - lb.y) + 0.5
      if (px < py) pos[c].x += boxes[c].x >= lb.x ? px : -px
      else pos[c].y += boxes[c].y >= lb.y ? py : -py
      boxes[c].x = pos[c].x; boxes[c].y = pos[c].y
      moved++
    }
  }
  return moved
}

function removeOverlaps(members: number[], boxes: Box[], pos: Pt[], nodes: readonly LayoutNode[], pinned: boolean[], gap: number, stats: OrganicLayoutStats, labels: readonly LabelHint[] = [], nudge = false): void {
  const sync = () => members.forEach(g => { boxes[g].x = pos[g].x; boxes[g].y = pos[g].y })
  // Coincident centers have no direction to grow along (growFactor would be infinite): nudge
  // them apart deterministically. Run before every pass, since a grow pass can create new ones.
  const separateCoincident = () => {
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      const a = members[i], b = members[j]
      if (Math.abs(pos[a].x - pos[b].x) < 1e-6 && Math.abs(pos[a].y - pos[b].y) < 1e-6) {
        const mover = pinned[b] && !pinned[a] ? a : b
        const u = unitFor(nodes[mover].id)
        pos[mover].x += u.x; pos[mover].y += u.y
      }
    }
    sync()
  }
  for (let pass = 0; pass < OVERLAP_MAX_PASSES; pass++) {
    separateCoincident()
    const nudged = nudge && pass < NUDGE_PASSES ? nudgeOffLabels(labels, members, boxes, pos, pinned) : 0
    const overlapping: Array<[number, number]> = []
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      if (tooClose(boxes[members[i]], boxes[members[j]], gap)) overlapping.push([members[i], members[j]])
    }
    const labelPairs = labelViolations(labels, boxes, pos)
    if (overlapping.length === 0 && labelPairs.length === 0) { if (nudged === 0) return; continue }
    stats.overlapIterations++
    // Candidate tree edges: Delaunay edges plus every overlapping pair (wide boxes can overlap
    // without being Delaunay-adjacent) and every label pair that must grow. Heaviest overlaps
    // enter the tree first.
    const cand = proximityEdges(members, boxes)
    const seen = new Set(cand.map(([a, b]) => `${a}|${b}`))
    for (const [a, b] of overlapping) if (!seen.has(`${a}|${b}`)) { seen.add(`${a}|${b}`); cand.push([a, b]) }
    for (const { a, b } of labelPairs) if (!seen.has(`${a}|${b}`)) { seen.add(`${a}|${b}`); cand.push([a, b]) }
    const needed = new Map<string, number>()
    for (const { a, b, t } of labelPairs) needed.set(`${a}|${b}`, Math.max(needed.get(`${a}|${b}`) ?? 1, t))
    const weighted = cand.map(([a, b]) => ({ a, b, t: Math.max(growFactor(boxes[a], boxes[b], gap), needed.get(`${a}|${b}`) ?? 1) }))
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
    // Grow from a pinned node if there is one (the root never moves), else from the node
    // nearest the centroid.
    let cx = 0, cy = 0
    for (const g of members) { cx += pos[g].x; cy += pos[g].y }
    cx /= members.length; cy /= members.length
    let root = members[0], best = Infinity
    for (const g of members) { const dd = Math.hypot(pos[g].x - cx, pos[g].y - cy); if (dd < best) { best = dd; root = g } }
    const pinnedRoot = members.find(g => pinned[g])
    if (pinnedRoot !== undefined) root = pinnedRoot
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
  // Fallback: uniform scale about the anchor (a pinned node, else the centroid) preserves the
  // shape exactly and must terminate: every factor is finite once no two centers coincide.
  for (let pass = 0; pass < SCALE_MAX_PASSES; pass++) {
    separateCoincident()
    let t = 1
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) t = Math.max(t, growFactor(boxes[members[i]], boxes[members[j]], gap))
    for (const v of labelViolations(labels, boxes, pos)) t = Math.max(t, v.t)
    if (t <= 1) return
    stats.scaledUp++
    const anchor = members.find(g => pinned[g])
    let cx = 0, cy = 0
    if (anchor !== undefined) { cx = pos[anchor].x; cy = pos[anchor].y }
    else { for (const g of members) { cx += pos[g].x; cy += pos[g].y } cx /= members.length; cy /= members.length }
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

// Viewport aspect the component packing targets (GraphCanvas fits the whole layout to the view,
// so the packed arrangement should have roughly the view's shape, not a disc's).
const PACK_ASPECT = 1.6

/** Shelf-pack rectangles (largest first) into rows no wider than `maxW`; returns row-relative offsets. */
function shelfPack(rects: Array<{ w: number; h: number }>, maxW: number, pad: number): { offsets: Pt[]; w: number; h: number } {
  const offsets: Pt[] = rects.map(() => ({ x: 0, y: 0 }))
  const rows: Array<{ items: number[]; w: number; h: number }> = []
  rects.forEach((r, i) => {
    const row = rows[rows.length - 1]
    if (row && row.w + pad + r.w <= maxW) {
      offsets[i] = { x: row.w + pad, y: 0 }
      row.items.push(i); row.w += pad + r.w; row.h = Math.max(row.h, r.h)
    } else {
      rows.push({ items: [i], w: r.w, h: r.h })
      offsets[i] = { x: 0, y: 0 }
    }
  })
  const totalW = Math.max(...rows.map(r => r.w))
  let y = 0
  for (const row of rows) {
    const inset = (totalW - row.w) / 2 // rows are centered, so the block reads as one shape
    for (const i of row.items) { offsets[i].x += inset; offsets[i].y = y + (row.h - rects[i].h) / 2 }
    y += row.h + pad
  }
  return { offsets, w: totalW, h: y - pad }
}

/**
 * Stage 6: cold-start component arrangement. Connected components are shelf-packed as
 * rectangles into a block of roughly PACK_ASPECT shape (largest first, rows centered), and
 * isolated nodes form one compact grid block beneath them (vision item 13) instead of orbiting
 * the main component as circle-packed singletons. Components anchored by a pinned node keep
 * their absolute place; the packed block sits to their right when the two would collide.
 */
function packComponents(components: number[][], boxes: Box[], pos: Pt[], pinned: boolean[], gap: number, spacing: number): void {
  const anchored = components.filter(m => m.some(i => pinned[i]))
  const free = components.filter(m => !m.some(i => pinned[i]))
  if (free.length === 0) return
  const pad = Math.max(gap, spacing)
  const multi = free.filter(m => m.length > 1)
  const singles = free.filter(m => m.length === 1).map(m => m[0])
  const moveTo = (members: number[], bb: { cx: number; cy: number }, x: number, y: number) => {
    for (const g of members) { pos[g].x += x - bb.cx; pos[g].y += y - bb.cy }
  }

  // Connected components: rectangles, tallest first (ties by width, then by the component's
  // lowest member index — components are already in deterministic id order).
  const rects = multi.map((m, i) => { const bb = bbox(m.map(g => boxes[g])); return { i, m, bb, w: bb.w, h: bb.h } })
  rects.sort((a, b) => b.h - a.h || b.w - a.w || a.i - b.i)
  let blockW = 0, blockH = 0
  if (rects.length) {
    const area = rects.reduce((s, r) => s + (r.w + pad) * (r.h + pad), 0)
    const widest = Math.max(...rects.map(r => r.w))
    // Try a few target widths around the aspect-ideal one and keep the arrangement that fits a
    // PACK_ASPECT view best (largest common scale), ties to the narrower target.
    let best: { offsets: Pt[]; w: number; h: number } | undefined
    let bestScore = -Infinity
    for (const f of [0.75, 1, 1.25, 1.5, 2]) {
      const packed = shelfPack(rects, Math.max(widest, Math.sqrt(area * PACK_ASPECT) * f), pad)
      const score = Math.min(PACK_ASPECT / packed.w, 1 / packed.h)
      if (score > bestScore + 1e-12) { bestScore = score; best = packed }
    }
    const { offsets, w, h } = best!
    rects.forEach((r, i) => moveTo(r.m, r.bb, offsets[i].x + r.w / 2, offsets[i].y + r.h / 2))
    blockW = w; blockH = h
  }

  // Isolated nodes: one grid block below the components, as wide as they are (or, with no
  // connected component, a block of PACK_ASPECT shape on its own).
  if (singles.length) {
    const cellW = Math.max(...singles.map(g => boxes[g].w)) + pad
    const cellH = Math.max(...singles.map(g => boxes[g].h)) + pad
    const cols = rects.length
      ? Math.max(1, Math.min(singles.length, Math.floor((blockW + pad) / cellW)))
      : Math.max(1, Math.min(singles.length, Math.ceil(Math.sqrt((singles.length * PACK_ASPECT * cellH) / cellW))))
    const rows = Math.ceil(singles.length / cols)
    const gridW = cols * cellW - pad
    const y0 = rects.length ? blockH + pad : 0
    singles.forEach((g, k) => {
      const col = k % cols, row = Math.floor(k / cols)
      pos[g].x = (blockW - gridW) / 2 + col * cellW + (cellW - pad) / 2
      pos[g].y = y0 + row * cellH + (cellH - pad) / 2
    })
    blockW = Math.max(blockW, gridW)
    blockH = y0 + rows * cellH - pad
  }

  // Center the whole packed block on the origin.
  const packed = free.flat()
  for (const g of packed) { pos[g].x -= blockW / 2; pos[g].y -= blockH / 2 }
  if (anchored.length === 0) return
  const anchoredBb = bbox(anchored.flat().map(g => boxes[g]))
  const packedBb = bbox(packed.map(g => ({ ...boxes[g], x: pos[g].x, y: pos[g].y })))
  const overlapX = Math.abs(packedBb.cx - anchoredBb.cx) < (packedBb.w + anchoredBb.w) / 2 + pad
  const overlapY = Math.abs(packedBb.cy - anchoredBb.cy) < (packedBb.h + anchoredBb.h) / 2 + pad
  if (overlapX && overlapY) {
    const dx = anchoredBb.cx + anchoredBb.w / 2 + pad + packedBb.w / 2 - packedBb.cx
    for (const g of packed) pos[g].x += dx
  }
}

/**
 * Rigidly align `pos` onto `ref` (translation, rotation, reflection; no scaling): the transform
 * is fitted on `fitIdx` (least squares, 2-D orthogonal Procrustes) and applied to `applyIdx`.
 * With one fit point this is a translation; with none, a no-op.
 */
function rigidAlign(pos: Pt[], fitIdx: number[], ref: Pt[], applyIdx: number[]): void {
  const k = fitIdx.length
  if (k === 0) return
  const mp = { x: 0, y: 0 }, mr = { x: 0, y: 0 }
  for (const i of fitIdx) { mp.x += pos[i].x / k; mp.y += pos[i].y / k; mr.x += ref[i].x / k; mr.y += ref[i].y / k }
  const fit = (flip: boolean) => {
    let sxx = 0, sxy = 0, syx = 0, syy = 0
    for (const i of fitIdx) {
      const px = pos[i].x - mp.x, py = (pos[i].y - mp.y) * (flip ? -1 : 1)
      const rx = ref[i].x - mr.x, ry = ref[i].y - mr.y
      sxx += px * rx; sxy += px * ry; syx += py * rx; syy += py * ry
    }
    const theta = k >= 2 ? Math.atan2(sxy - syx, sxx + syy) : 0
    const c = Math.cos(theta), sn = Math.sin(theta)
    const map = (q: Pt): Pt => {
      const px = q.x - mp.x, py = (q.y - mp.y) * (flip ? -1 : 1)
      return { x: c * px - sn * py + mr.x, y: sn * px + c * py + mr.y }
    }
    let err = 0
    for (const i of fitIdx) { const q = map(pos[i]); err += (q.x - ref[i].x) ** 2 + (q.y - ref[i].y) ** 2 }
    return { err, map }
  }
  const a = fit(false)
  const best = k >= 3 ? (() => { const b = fit(true); return b.err < a.err ? b : a })() : a
  const mapped = applyIdx.map(i => best.map(pos[i]))
  applyIdx.forEach((i, j) => { pos[i].x = mapped[j].x; pos[i].y = mapped[j].y })
}
