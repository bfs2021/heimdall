import { louvainCluster, type ClusterTreeNode } from './graphClustering.ts'
import { packClusters } from './graphPacking.ts'

export interface LayoutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  pinned?: boolean
  /**
   * Optional point the center-gravity term pulls this node toward, instead
   * of the shared origin. Unset ⇒ {x:0,y:0}. (clusteredForceLayout() used
   * this before it switched to laying out each cluster separately; kept as
   * part of the public LayoutNode type.)
   */
  gravityTarget?: { x: number; y: number }
  /**
   * Multiplier on centerStrength for this node's gravity term. Unset ⇒ 1
   * (uniform gravity for every node).
   */
  gravityStrength?: number
}

export interface LayoutEdge {
  source: string
  target: string
}

export interface ForceLayoutOptions {
  iterations?: number
  springLength?: number
  springStrength?: number
  repulsion?: number
  damping?: number
  centerStrength?: number
  collisionStrength?: number
  /**
   * Extra breathing room kept clear around each node's own footprint, on top of what's needed to
   * just avoid overlap. This is what actually leaves room for an edge to be visible between two
   * connected nodes instead of their boxes settling nearly flush — with substantial cards
   * (renderNode content), the tightest-legal-packing default previously used left edges with
   * almost no visible line, reading as if edges were missing entirely.
   *
   * Defaults to each node's own width, which reads well for both compact chips and substantial
   * cards without extra configuration — a wider card asks for more clearance around itself.
   * Pass a fixed number to use the same margin for every node regardless of size, or 0 to go back
   * to the tightest legal packing.
   */
  nodeMargin?: number
}

export function forceLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: ForceLayoutOptions = {}
): Map<string, { x: number; y: number }> {
  const {
    iterations = 300,
    springLength = 160,
    springStrength = 0.04,
    repulsion = 8000,
    damping = 0.85,
    centerStrength = 0.005,
    collisionStrength = 0.3,
    nodeMargin,
  } = options

  if (nodes.length === 0) return new Map()

  // See ForceLayoutOptions.nodeMargin. undefined -> each node's own width; a number -> that
  // fixed margin for every node.
  const marginFor = (n: LayoutNode): number => nodeMargin ?? n.width

  // Rest length actually used for a given edge — never shorter than what the two connected
  // boxes' own footprints need to clear each other, plus their averaged margin. springLength
  // alone is a flat constant with no awareness of node size: fine for default-ish chip-sized
  // nodes (where it's already larger than two half-diagonals combined, so this is a no-op), but
  // for substantially larger nodes (e.g. card-style renderNode content) a 160px rest length can
  // be shorter than the boxes themselves — the spring then permanently pulls connected large
  // nodes into overlap, and the capped separation-pass post-process below can only partially
  // fight that every cycle, never fully winning for bushier graphs with several large nodes
  // competing around one hub.
  const restLength = (a: LayoutNode, b: LayoutNode): number =>
    Math.max(
      springLength,
      (Math.hypot(a.width, a.height) + Math.hypot(b.width, b.height)) / 2 * 1.1 + (marginFor(a) + marginFor(b)) / 2
    )

  const vx = new Map<string, number>(nodes.map(n => [n.id, 0]))
  const vy = new Map<string, number>(nodes.map(n => [n.id, 0]))
  const pos = new Map<string, { x: number; y: number }>(
    nodes.map(n => [n.id, { x: n.x, y: n.y }])
  )
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        if (a.pinned && b.pinned) continue
        const pa = pos.get(a.id)!
        const pb = pos.get(b.id)!
        const dx = pb.x - pa.x || 0.1
        const dy = pb.y - pa.y || 0.1
        const dist = Math.max(Math.hypot(dx, dy), 1)
        const force = repulsion / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        if (!a.pinned) { vx.set(a.id, vx.get(a.id)! - fx); vy.set(a.id, vy.get(a.id)! - fy) }
        if (!b.pinned) { vx.set(b.id, vx.get(b.id)! + fx); vy.set(b.id, vy.get(b.id)! + fy) }

        // Collision: an extra corrective push for any pair currently closer than their combined
        // margin-padded footprints, proportional to the overlap depth — same idea as the
        // separationPass post-process below (which stays literal/unpadded — see resolveOverlaps),
        // but applied continuously as a soft force during the simulation, against padded
        // footprints so it also contributes to the "spread out" effect nodeMargin asks for,
        // instead of only in a fixed-budget pass at the end. Generic inverse-square repulsion
        // above has no notion of node size, so for large nodes (e.g. card-style renderNode
        // content) — especially several of them fanned out as siblings around one hub, which
        // aren't spring-connected to each other at all — it alone settles into an equilibrium
        // with real box overlap that repulsion never resolves on its own.
        const paddedWidthA = a.width + marginFor(a)
        const paddedWidthB = b.width + marginFor(b)
        const paddedHeightA = a.height + marginFor(a)
        const paddedHeightB = b.height + marginFor(b)
        const overlapX = (paddedWidthA + paddedWidthB) / 2 - Math.abs(dx)
        const overlapY = (paddedHeightA + paddedHeightB) / 2 - Math.abs(dy)
        if (overlapX > 0 && overlapY > 0) {
          const depth = Math.min(overlapX, overlapY) * collisionStrength
          const cfx = (dx / dist) * depth
          const cfy = (dy / dist) * depth
          if (!a.pinned) { vx.set(a.id, vx.get(a.id)! - cfx); vy.set(a.id, vy.get(a.id)! - cfy) }
          if (!b.pinned) { vx.set(b.id, vx.get(b.id)! + cfx); vy.set(b.id, vy.get(b.id)! + cfy) }
        }
      }
    }

    // Spring forces along edges
    for (const edge of edges) {
      const src = nodeMap.get(edge.source)
      const tgt = nodeMap.get(edge.target)
      if (!src || !tgt || (src.pinned && tgt.pinned)) continue
      const ps = pos.get(src.id)!
      const pt = pos.get(tgt.id)!
      const dx = pt.x - ps.x || 0.1
      const dy = pt.y - ps.y || 0.1
      const dist = Math.max(Math.hypot(dx, dy), 1)
      const force = springStrength * (dist - restLength(src, tgt))
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      if (!src.pinned) { vx.set(src.id, vx.get(src.id)! + fx); vy.set(src.id, vy.get(src.id)! + fy) }
      if (!tgt.pinned) { vx.set(tgt.id, vx.get(tgt.id)! - fx); vy.set(tgt.id, vy.get(tgt.id)! - fy) }
    }

    // Center gravity + damping + position update
    for (const node of nodes) {
      if (node.pinned) continue
      const p = pos.get(node.id)!
      const gx = node.gravityTarget?.x ?? 0
      const gy = node.gravityTarget?.y ?? 0
      const gStrength = node.gravityStrength ?? 1
      const nvx = (vx.get(node.id)! - (p.x - gx) * centerStrength * gStrength) * damping
      const nvy = (vy.get(node.id)! - (p.y - gy) * centerStrength * gStrength) * damping
      vx.set(node.id, nvx)
      vy.set(node.id, nvy)
      pos.set(node.id, { x: p.x + nvx, y: p.y + nvy })
    }
  }

  resolveOverlaps(nodes, edges, pos, vx, vy, nodeMap, { restLength, springStrength, damping })

  return pos
}

// The main loop above treats nodes as points, so a pair can settle at force
// equilibrium while their rendered bounding boxes still overlap. This
// post-process resolves that without undoing the converged layout:
//
//   - each separation PASS nudges every currently-overlapping pair apart
//     along whichever axis needs the least movement to clear (split evenly
//     between the two nodes), capped to a small per-node distance so no
//     single correction is large enough to swing a node across a
//     neighboring edge — an earlier, uncapped version did exactly that,
//     trading one overlap for one extra edge crossing;
//   - separation passes are interleaved with spring-only RELAXATION steps
//     (spring force + damping, no repulsion/gravity) so edge lengths pull
//     back toward springLength between corrections, instead of drifting
//     across many consecutive separation-only passes;
//   - a final cleanup phase repeats capped separation passes (no more
//     relaxation mixed in) until either no overlap remains or a generous
//     pass budget is exhausted, rather than ending on one uncapped pass
//     that could itself overshoot into a new overlap or crossing.
//
// FINAL_CLEANUP_MAX_PASSES is generous (well beyond what small/default-sized nodes ever need)
// because with substantially larger nodes (e.g. card-style renderNode content) a bushy topology
// can leave several nodes mutually overlapping at once — resolving one pair can nudge a third
// node into a new marginal overlap, so full convergence takes noticeably more passes than a
// single pair would. It's still bounded and each pass is O(n²) but cheap; the loop exits as soon
// as a pass finds nothing to fix, so this only costs extra time in that dense-overlap case, never
// in the common one. In rare, extreme cases (verified: 18 large cards in one dense hub-and-spoke
// topology) a single sub-pixel-to-few-pixel sliver of overlap can still survive even this budget —
// increasing it further empirically stopped helping past this point, suggesting a genuine
// two-pair oscillation rather than a budget shortfall; harmless in practice but worth knowing.
const OVERLAP_RESOLUTION_CYCLES = 40
const RELAXATION_STEPS_PER_CYCLE = 3
// Exported so other layout engines sharing separationPass (see below) use the same budget
// instead of an independent, easy-to-miss-when-tuning magic number of their own — galaxyLayout's
// own final cleanup loop hit the identical large-node non-convergence case this was raised for.
export const FINAL_CLEANUP_MAX_PASSES = 400
const SEPARATION_STEP_CAP = 6

function resolveOverlaps(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  pos: Map<string, { x: number; y: number }>,
  vx: Map<string, number>,
  vy: Map<string, number>,
  nodeMap: Map<string, LayoutNode>,
  options: { restLength: (a: LayoutNode, b: LayoutNode) => number; springStrength: number; damping: number }
): void {
  for (let cycle = 0; cycle < OVERLAP_RESOLUTION_CYCLES; cycle++) {
    separationPass(nodes, pos)
    for (let r = 0; r < RELAXATION_STEPS_PER_CYCLE; r++) {
      relaxationStep(nodes, edges, pos, vx, vy, nodeMap, options)
    }
  }
  for (let pass = 0; pass < FINAL_CLEANUP_MAX_PASSES; pass++) {
    if (!separationPass(nodes, pos)) break
  }
}

// One separation pass: for every currently-overlapping pair, push both
// nodes apart along whichever axis (x or y) needs the least movement to
// clear the overlap, split evenly, capped at SEPARATION_STEP_CAP per node.
// Returns whether any overlap was found (used for the final cleanup's
// early exit). All pairs are evaluated against the pass's STARTING
// positions and moves are applied afterward, so resolving one pair in a
// pass never skews another pair's overlap check within that same pass.
//
// Exported so other layout engines (e.g. galaxyLayout) can reuse the same
// box-overlap resolution instead of duplicating it.
export function separationPass(nodes: readonly LayoutNode[], pos: Map<string, { x: number; y: number }>): boolean {
  let anyOverlap = false
  const moves = new Map<string, { x: number; y: number }>(nodes.map(n => [n.id, { x: 0, y: 0 }]))

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      if (a.pinned && b.pinned) continue
      const pa = pos.get(a.id)!
      const pb = pos.get(b.id)!
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const overlapX = (a.width + b.width) / 2 - Math.abs(dx)
      const overlapY = (a.height + b.height) / 2 - Math.abs(dy)
      if (overlapX <= 0 || overlapY <= 0) continue

      anyOverlap = true
      let pushX = 0
      let pushY = 0
      if (overlapX < overlapY) {
        pushX = (dx >= 0 ? 1 : -1) * overlapX
      } else {
        pushY = (dy >= 0 ? 1 : -1) * overlapY
      }
      let halfX = pushX / 2
      let halfY = pushY / 2
      const mag = Math.hypot(halfX, halfY)
      if (mag > SEPARATION_STEP_CAP) {
        const scale = SEPARATION_STEP_CAP / mag
        halfX *= scale
        halfY *= scale
      }

      if (a.pinned) {
        moves.get(b.id)!.x += halfX * 2
        moves.get(b.id)!.y += halfY * 2
      } else if (b.pinned) {
        moves.get(a.id)!.x -= halfX * 2
        moves.get(a.id)!.y -= halfY * 2
      } else {
        moves.get(a.id)!.x -= halfX
        moves.get(a.id)!.y -= halfY
        moves.get(b.id)!.x += halfX
        moves.get(b.id)!.y += halfY
      }
    }
  }

  for (const node of nodes) {
    if (node.pinned) continue
    const move = moves.get(node.id)!
    if (move.x === 0 && move.y === 0) continue
    const p = pos.get(node.id)!
    pos.set(node.id, { x: p.x + move.x, y: p.y + move.y })
  }
  return anyOverlap
}

// One spring-only relaxation step: spring force + damping, no repulsion or
// center gravity — lets edge lengths pull back toward springLength between
// separation passes without reintroducing the repulsion that created the
// overlaps' original equilibrium.
function relaxationStep(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  pos: Map<string, { x: number; y: number }>,
  vx: Map<string, number>,
  vy: Map<string, number>,
  nodeMap: Map<string, LayoutNode>,
  { restLength, springStrength, damping }: { restLength: (a: LayoutNode, b: LayoutNode) => number; springStrength: number; damping: number }
): void {
  for (const edge of edges) {
    const src = nodeMap.get(edge.source)
    const tgt = nodeMap.get(edge.target)
    if (!src || !tgt || (src.pinned && tgt.pinned)) continue
    const ps = pos.get(src.id)!
    const pt = pos.get(tgt.id)!
    const dx = pt.x - ps.x || 0.1
    const dy = pt.y - ps.y || 0.1
    const dist = Math.max(Math.hypot(dx, dy), 1)
    const force = springStrength * (dist - restLength(src, tgt))
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    if (!src.pinned) { vx.set(src.id, vx.get(src.id)! + fx); vy.set(src.id, vy.get(src.id)! + fy) }
    if (!tgt.pinned) { vx.set(tgt.id, vx.get(tgt.id)! - fx); vy.set(tgt.id, vy.get(tgt.id)! - fy) }
  }
  for (const node of nodes) {
    if (node.pinned) continue
    const p = pos.get(node.id)!
    const nvx = vx.get(node.id)! * damping
    const nvy = vy.get(node.id)! * damping
    vx.set(node.id, nvx)
    vy.set(node.id, nvy)
    pos.set(node.id, { x: p.x + nvx, y: p.y + nvy })
  }
}
// ─── Opt-in clustering: nested bubble-packing + a two-level force pass ────
//
// forceLayout() above treats every node as equally repelled from every
// other node, pulled toward one shared center — it spreads nodes evenly,
// which is the opposite of what a graph with real community structure
// wants for readability (see docs/layout-loop-design.md's clustering
// section). clusteredForceLayout() is strictly additive/opt-in: it doesn't
// change forceLayout()'s behavior for any existing caller, and is only
// reached if a caller explicitly chooses it (GraphCanvas's
// layout="force-clustered").
//
// Pipeline, reusing forceLayout() itself for both the micro and macro
// passes rather than writing new physics:
//   1. louvainCluster() derives a nested community dendrogram purely from
//      edge structure (graphClustering.ts) — the "bubbles containing
//      bubbles" hierarchy.
//   2. packClusters() (graphPacking.ts, d3-hierarchy) packs that whole
//      dendrogram into non-overlapping nested circles. Used as the seed:
//      each node's pack offset within its top-level cluster seeds the
//      micro pass, and each cluster's packed center seeds the macro pass.
//   3. Micro pass: forceLayout() runs once per top-level cluster, in that
//      cluster's own local frame, over its members and only its internal
//      edges. Each cluster's real footprint (radius) is measured from the
//      result.
//   4. Macro pass: forceLayout() runs on a coarsened graph of one
//      pseudo-node per cluster, sized to its measured footprint, with one
//      LayoutEdge per real cross-cluster edge (capped per pair), so
//      clusters connected by more edges pull harder together. Collision on
//      the footprint boxes keeps clusters from overlapping.
//   5. orientClusters() rotates/mirrors each cluster's local layout so its
//      nodes face the clusters they connect to, then every node is placed
//      at macro center + local offset.
//
// An earlier version ran the micro pass as one global simulation over all
// nodes and edges, gravity-biased toward each cluster's centroid. On dense
// modular graphs the cross-cluster springs and all-pairs repulsion beat
// that gravity and every cluster smeared across the drawing (football:
// 93% of cluster bubbles overlapping, community separation ~1.4).

export interface ClusteredLayoutOptions extends ForceLayoutOptions {
  /** Gap between sibling circles in the pack layout. See graphPacking.ts's PackOptions.padding. */
  clusterPadding?: number | ((depth: number) => number)
  /**
   * Overrides for the macro (cluster-to-cluster) force pass. Unset fields
   * fall back to a size-derived default — see MACRO_SPRING_LENGTH_FACTOR
   * below — not forceLayout()'s own defaults, which assume individual
   * node-sized (not cluster-sized) geometry.
   */
  macro?: ForceLayoutOptions
}

// Macro-pass defaults are derived from cluster size rather than reusing
// forceLayout()'s node-scale constants (springLength 160 / repulsion 8000)
// as-is: a cluster pseudo-node's diameter can be much larger than a single
// node's, and using node-scale constants unmodified would under-space
// clusters relative to their own size. These are a reasonable starting
// heuristic, not a tuned result — expected to be refined like any other
// forceLayout constant via this repo's normal PROPOSE loop
// (docs/layout-loop-design.md), not treated as final here.
const MACRO_SPRING_LENGTH_FACTOR = 1.2
const MACRO_MIN_SPRING_LENGTH = 160
const BASE_SPRING_LENGTH = 160
const BASE_REPULSION = 8000
const MACRO_EDGE_CAP = 8
// Default clear space between neighboring cluster footprints in the macro pass.
const MACRO_CLUSTER_GAP = 60

function collectLeafToTopCluster(topClusters: readonly ClusterTreeNode[]): Map<string, string> {
  const leafToTop = new Map<string, string>()
  const visit = (node: ClusterTreeNode, topId: string): void => {
    if (!node.children) {
      leafToTop.set(node.id, topId)
      return
    }
    for (const child of node.children) visit(child, topId)
  }
  for (const top of topClusters) visit(top, top.id)
  return leafToTop
}

export interface ClusteredLayoutResult {
  positions: Map<string, { x: number; y: number }>
  /**
   * Approximate bounding circle per top-level cluster (center + radius),
   * for optional visual rendering of bubble boundaries. Computed from
   * FINAL post-simulation node positions, not the pre-relaxation pack
   * geometry, so it actually contains the rendered nodes — a simple
   * centroid + max-member-reach circle, not a minimal enclosing circle,
   * which is enough for a boundary outline and keeps this deterministic
   * and cheap.
   */
  clusterBoundaries: Map<string, { x: number; y: number; r: number }>
}

export function clusteredForceLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: ClusteredLayoutOptions = {}
): ClusteredLayoutResult {
  if (nodes.length === 0) return { positions: new Map(), clusterBoundaries: new Map() }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const tree = louvainCluster(nodes.map(n => n.id), edges)
  const radiusOf = (id: string): number => {
    const n = nodeMap.get(id)
    return n ? Math.hypot(n.width, n.height) / 2 : 20
  }
  const circles = packClusters(tree, { radiusOf, padding: options.clusterPadding })

  const topClusters = tree.children ?? []
  const leafToTop = collectLeafToTopCluster(topClusters)
  // A node Louvain left outside every top-level cluster (e.g. a single-node graph) is its own group.
  const groupOf = (id: string): string => leafToTop.get(id) ?? id
  const membersByGroup = new Map<string, LayoutNode[]>()
  for (const n of nodes) {
    const g = groupOf(n.id)
    if (!membersByGroup.has(g)) membersByGroup.set(g, [])
    membersByGroup.get(g)!.push(n)
  }

  // Micro pass — each cluster on its own, in its own local frame, with only
  // its own internal edges. Running this as one global simulation (the
  // original design) let cross-cluster springs and all-pairs repulsion
  // outweigh the weak pull toward each cluster's centroid: on a dense,
  // modular graph (real/football.json, 179 of 613 edges cross clusters) the
  // pack's clean separation was erased and every cluster smeared across the
  // whole drawing. Laying clusters out independently is what makes the
  // layout "nested force within each bubble", and gives the macro pass each
  // cluster's real footprint instead of a pack radius the force pass then
  // outgrows (forceLayout's nodeMargin spacing is much looser than
  // d3.pack's tight packing).
  //
  // Pinned nodes are laid out with their cluster here and restored to their
  // fixed position at the end (local frames can't honor absolute coordinates).
  const intraEdges = new Map<string, LayoutEdge[]>()
  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue
    const g = groupOf(edge.source)
    if (g !== groupOf(edge.target)) continue
    if (!intraEdges.has(g)) intraEdges.set(g, [])
    intraEdges.get(g)!.push(edge)
  }
  const local = new Map<string, Map<string, { x: number; y: number }>>()
  const footprint = new Map<string, number>()
  for (const [g, members] of membersByGroup) {
    const groupCircle = circles.get(g)
    const seeded = members.map(n => {
      const c = circles.get(n.id)
      return {
        ...n,
        pinned: false,
        gravityTarget: undefined,
        gravityStrength: undefined,
        x: c && groupCircle && c !== groupCircle ? c.x - groupCircle.x : 0,
        y: c && groupCircle && c !== groupCircle ? c.y - groupCircle.y : 0,
      }
    })
    const pos = forceLayout(seeded, intraEdges.get(g) ?? [], options)
    // Recenter on the bounding box so the macro pass's pseudo-node center
    // matches the drawn cluster.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of members) {
      const p = pos.get(n.id)!
      minX = Math.min(minX, p.x - n.width / 2)
      maxX = Math.max(maxX, p.x + n.width / 2)
      minY = Math.min(minY, p.y - n.height / 2)
      maxY = Math.max(maxY, p.y + n.height / 2)
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    let r = 0
    for (const n of members) {
      const p = pos.get(n.id)!
      const q = { x: p.x - cx, y: p.y - cy }
      pos.set(n.id, q)
      r = Math.max(r, Math.hypot(q.x, q.y) + radiusOf(n.id))
    }
    local.set(g, pos)
    footprint.set(g, r)
  }

  // Macro pass — one pseudo-node per group, sized to its real micro-pass
  // footprint, seeded at its packed position.
  const macroNodes: LayoutNode[] = [...membersByGroup.keys()].map(g => {
    const circle = circles.get(g) ?? { x: 0, y: 0 }
    const r = footprint.get(g)!
    return { id: g, x: circle.x, y: circle.y, width: r * 2, height: r * 2 }
  })
  // One macro LayoutEdge per real cross-cluster edge, capped per cluster
  // pair — more real connections between two clusters should still pull
  // them harder together, but uncapped this diverges exactly like the
  // hub-topology bug in "Known scaling/stability issue"
  // (docs/layout-loop-design.md): a near-complete pathological graph can
  // put hundreds of real edges between the same two clusters (measured:
  // 564 on pathological/dense-cluster), and forceLayout's spring force is
  // additive per edge, so that many duplicates at full springStrength
  // overwhelms the simulation. MACRO_EDGE_CAP is a no-op on every other
  // corpus fixture (measured max duplicate count elsewhere: 6).
  const macroEdgeCounts = new Map<string, number>()
  const macroEdges: LayoutEdge[] = []
  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue
    const a = groupOf(edge.source)
    const b = groupOf(edge.target)
    if (a === b) continue
    const pairKey = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
    const count = macroEdgeCounts.get(pairKey) ?? 0
    if (count >= MACRO_EDGE_CAP) continue
    macroEdgeCounts.set(pairKey, count + 1)
    macroEdges.push({ source: a, target: b })
  }

  const maxClusterDiameter = macroNodes.reduce((max, n) => Math.max(max, n.width), 0)
  const macroSpringLength =
    options.macro?.springLength ?? Math.max(maxClusterDiameter * MACRO_SPRING_LENGTH_FACTOR, MACRO_MIN_SPRING_LENGTH)
  const macroScale = (macroSpringLength / BASE_SPRING_LENGTH) ** 2
  const macroOptions: ForceLayoutOptions = {
    iterations: options.macro?.iterations ?? 300,
    springLength: macroSpringLength,
    springStrength: options.macro?.springStrength ?? 0.04,
    repulsion: options.macro?.repulsion ?? BASE_REPULSION * macroScale,
    damping: options.macro?.damping ?? 0.85,
    centerStrength: options.macro?.centerStrength ?? 0.005,
    // forceLayout's default margin is each node's own width — for a cluster
    // pseudo-node that's its whole diameter, which would push clusters a
    // full cluster-width apart. A fixed gap keeps them distinct but close.
    nodeMargin: options.macro?.nodeMargin ?? MACRO_CLUSTER_GAP,
  }
  const macroPositions = forceLayout(macroNodes, macroEdges, macroOptions)

  orientClusters(local, macroPositions, edges, groupOf, nodeMap)

  // Compose: each cluster's local layout translated to its macro position.
  const positions = new Map<string, { x: number; y: number }>()
  for (const [g, pos] of local) {
    const center = macroPositions.get(g)!
    for (const [id, p] of pos) positions.set(id, { x: center.x + p.x, y: center.y + p.y })
  }
  for (const n of nodes) if (n.pinned) positions.set(n.id, { x: n.x, y: n.y })

  // Macro spacing uses square boxes around each cluster's circle, so clusters
  // shouldn't overlap; this only resolves pinned-node or edge-case residue.
  for (let pass = 0; pass < FINAL_CLEANUP_MAX_PASSES; pass++) {
    if (!separationPass(nodes, positions)) break
  }

  const clusterBoundaries = boundingCirclesByGroup(nodes, positions, leafToTop, radiusOf)
  return { positions, clusterBoundaries }
}

// Each cluster is laid out in isolation, so its internal arrangement ignores
// where its cross-cluster neighbors ended up. Rotating (and optionally
// mirroring) each cluster's local layout so nodes face the clusters they
// connect to shortens cross-cluster edges and removes crossings, without
// touching the cluster's internal shape. Greedy: one cluster at a time,
// others held fixed, a couple of sweeps.
const ORIENT_ANGLE_STEPS = 24
const ORIENT_SWEEPS = 2

function orientClusters(
  local: Map<string, Map<string, { x: number; y: number }>>,
  centers: Map<string, { x: number; y: number }>,
  edges: readonly LayoutEdge[],
  groupOf: (id: string) => string,
  nodeMap: Map<string, LayoutNode>
): void {
  // Cross-cluster edges grouped by the cluster on each end: [own node, other node, other cluster].
  const crossByGroup = new Map<string, Array<[string, string, string]>>()
  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue
    const a = groupOf(edge.source)
    const b = groupOf(edge.target)
    if (a === b) continue
    if (!crossByGroup.has(a)) crossByGroup.set(a, [])
    if (!crossByGroup.has(b)) crossByGroup.set(b, [])
    crossByGroup.get(a)!.push([edge.source, edge.target, b])
    crossByGroup.get(b)!.push([edge.target, edge.source, a])
  }
  const absolute = (g: string, id: string): { x: number; y: number } => {
    const c = centers.get(g)!
    const p = local.get(g)!.get(id)!
    return { x: c.x + p.x, y: c.y + p.y }
  }

  for (let sweep = 0; sweep < ORIENT_SWEEPS; sweep++) {
    for (const [g, cross] of crossByGroup) {
      const pos = local.get(g)!
      if (pos.size < 2) continue
      const c = centers.get(g)!
      const targets = cross.map(([own, other, otherGroup]) => ({ own, at: absolute(otherGroup, other) }))
      let best = { cos: 1, sin: 0, mirror: 1, cost: Infinity }
      for (const mirror of [1, -1]) {
        for (let step = 0; step < ORIENT_ANGLE_STEPS; step++) {
          const angle = (2 * Math.PI * step) / ORIENT_ANGLE_STEPS
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          let cost = 0
          for (const { own, at } of targets) {
            const p = pos.get(own)!
            const px = p.x * mirror
            cost += Math.hypot(c.x + px * cos - p.y * sin - at.x, c.y + px * sin + p.y * cos - at.y)
          }
          // Strictly better only, so ties keep the unrotated layout.
          if (cost < best.cost - 1e-6) best = { cos, sin, mirror, cost }
        }
      }
      if (best.cos === 1 && best.mirror === 1) continue
      for (const [id, p] of pos) {
        const px = p.x * best.mirror
        pos.set(id, { x: px * best.cos - p.y * best.sin, y: px * best.sin + p.y * best.cos })
      }
    }
  }
}

// Simple (non-minimal) enclosing circle per top-level group: center is either the centroid of
// its members' final positions, or (see anchorToHead below) the group's own head node's
// position; radius = furthest member's own bounding radius plus its distance from that center.
// Cheap and deterministic; not as tight as a true minimal-enclosing-circle algorithm, which
// isn't needed just to draw a boundary outline.
//
// Exported so any layout engine that produces a "member -> top-level group" mapping can draw the
// same boundary-circle visual — clusteredForceLayout uses it for Louvain's top-level clusters
// (see above); GraphCanvas reuses it directly for galaxyLayout's root subtrees (each root's id ->
// itself, each descendant's id -> its root), since galaxyLayout itself has no "cluster" concept
// of its own to return one from.
export function boundingCirclesByGroup(
  nodes: readonly LayoutNode[],
  positions: Map<string, { x: number; y: number }>,
  leafToGroup: Map<string, string>,
  radiusOf: (id: string) => number,
  /**
   * When true, centers each circle on the group head's own position (`positions.get(topId)`) —
   * valid whenever `topId` is itself a real, positioned member of its own group, which galaxy's
   * leafToGroup always arranges (see galaxyGroupHeads). Falls back to the centroid if the head
   * has no position. Galaxy passes true: its groups radiate outward from one "sun" node rather
   * than spreading symmetrically, so a deep, lopsided subtree (a long one-directional chain, say)
   * can drift its members' average position well away from the sun itself — centering on the
   * centroid there would draw a circle over empty space nowhere near the node it's meant to
   * encircle. Louvain clusters (force-clustered) have no such single natural anchor, so that
   * caller leaves this false and keeps the centroid, which is the more space-efficient choice
   * when there's no specific node the circle needs to stay anchored to.
   */
  anchorToHead = false
): Map<string, { x: number; y: number; r: number }> {
  const membersByTop = new Map<string, LayoutNode[]>()
  for (const n of nodes) {
    const topId = leafToGroup.get(n.id)
    if (!topId) continue
    if (!membersByTop.has(topId)) membersByTop.set(topId, [])
    membersByTop.get(topId)!.push(n)
  }

  const boundaries = new Map<string, { x: number; y: number; r: number }>()
  for (const [topId, members] of membersByTop) {
    let cx: number
    let cy: number
    const headPos = anchorToHead ? positions.get(topId) : undefined
    if (headPos) {
      cx = headPos.x
      cy = headPos.y
    } else {
      cx = 0
      cy = 0
      for (const m of members) {
        const p = positions.get(m.id)
        if (!p) continue
        cx += p.x
        cy += p.y
      }
      cx /= members.length
      cy /= members.length
    }

    let r = 0
    for (const m of members) {
      const p = positions.get(m.id)
      if (!p) continue
      r = Math.max(r, Math.hypot(p.x - cx, p.y - cy) + radiusOf(m.id))
    }
    boundaries.set(topId, { x: cx, y: cy, r })
  }
  return boundaries
}
