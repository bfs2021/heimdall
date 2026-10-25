import { packEnclose, packSiblings } from 'd3-hierarchy'
import { separationPass, FINAL_CLEANUP_MAX_PASSES, type LayoutNode } from './graphLayout'
import { buildStructuralForest, type HierarchyEdge } from './graphHierarchy'

/*
 * Galaxy layout — a weighted hierarchy drawn as nested orbital systems, after the original galaxy
 * charts (Risacher's D3 galaxy chart; Galaxies of the Guardian): body area encodes weight, each
 * parent's satellites orbit it in a full circle, heaviest first, and independent trees are separate
 * galaxies.
 *
 * Construction (rewritten 2026-10-25; the previous version placed each satellite by its own body
 * size alone, then spent ~300 lines of settle loops, group shifts and an aspect-ratio warp
 * compensating for the collisions that caused):
 *
 *   1. Bottom-up, every node gets a SYSTEM radius: a leaf's is its body radius; a parent's is the
 *      farthest extent of its satellites' systems around it.
 *   2. Top-down, a parent's k satellites take k equal angular slots (heaviest at the parent's
 *      outward heading). Each sits at the smallest distance where its whole system fits inside its
 *      own slot's wedge and clears the parent's body:
 *        d = max(r(parent) + gap + R(sat),  (R(sat) + gap/2) / sin(π/k))
 *      Adjacent wedges are disjoint and every system lies inside its wedge, so no two systems
 *      anywhere in the tree overlap — by construction, with no relaxation pass.
 *   3. Independent trees (galaxies, including one-node orphans) are packed together by their
 *      system circles, heaviest first (d3 packSiblings), so a forest reads as one compact sky.
 *
 * Pinned nodes keep their given position and carry their subtree with them; only then can bodies
 * collide, so a separation pass runs as a safety net.
 */

export interface GalaxyLayoutNode {
  id: string
  width: number
  height: number
  /** Explicit position pins the node in place — same convention as forceLayout. A pinned node's
   *  structural subtree is laid out around the pinned position, so dragging/pinning a "sun"
   *  carries its whole system with it. */
  x?: number
  y?: number
  pinned?: boolean
  /** Size weight (galaxy's primary encoding — area ∝ weight). Children orbit their parent
   *  heaviest-first. Optional: see galaxyEffectiveWeights for how a missing weight resolves. */
  weight?: number
  /** True body radius for a round body. When set, it replaces the box half-diagonal as this node's
   *  radius (a circle's half-diagonal overstates it by √2). */
  radius?: number
}

/** A node's radius for orbit placement: its explicit `radius` (round bodies), otherwise the
 *  half-diagonal of its box (cards). */
export function galaxyRadiusOf(n: Pick<GalaxyLayoutNode, 'width' | 'height' | 'radius'>): number {
  return n.radius !== undefined && Number.isFinite(n.radius) && n.radius > 0 ? n.radius : Math.hypot(n.width, n.height) / 2
}

/**
 * Effective size weight per node (design-material/galaxy/vision-statement.md, "Weight"): a node's
 * own weight when it has one (finite, >= 0); otherwise the sum of its structural children's. If no
 * node has a weight at all, every leaf weighs 1, so each node weighs its subtree leaf count.
 * `childrenOf` should be the FULL forest (not just currently visible nodes), so collapsing a
 * subtree doesn't change its parent's weight.
 */
export function galaxyEffectiveWeights(
  ids: readonly string[],
  childrenOf: ReadonlyMap<string, readonly string[]>,
  givenWeight: (id: string) => number | undefined
): Map<string, number> {
  const given = new Map<string, number>()
  for (const id of ids) {
    const w = givenWeight(id)
    if (w !== undefined && Number.isFinite(w) && w >= 0) given.set(id, w)
  }
  const anyGiven = given.size > 0
  const weightOf = new Map<string, number>()
  // Iterative post-order (children before parents): a 3000-node chain overflowed the call stack
  // when this recursed. The visited set also guards cycles.
  for (const id of postOrder(ids, childrenOf)) {
    const own = given.get(id)
    const kids = childrenOf.get(id) ?? []
    weightOf.set(id, own !== undefined ? own : kids.length ? kids.reduce((sum, k) => sum + (weightOf.get(k) ?? 0), 0) : anyGiven ? 0 : 1)
  }
  return weightOf
}

/** Nodes in pre-order from `starts` (each with its depth), without recursion; nodes already seen
 *  are skipped, so cycles terminate. */
function preOrder(starts: readonly string[], childrenOf: ReadonlyMap<string, readonly string[]>): { id: string; depth: number; hasParent: boolean }[] {
  const out: { id: string; depth: number; hasParent: boolean }[] = []
  const seen = new Set<string>()
  for (const start of starts) {
    if (seen.has(start)) continue
    const stack = [{ id: start, depth: 0, hasParent: false }]
    while (stack.length) {
      const item = stack.pop()!
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
      const kids = childrenOf.get(item.id) ?? []
      for (let i = kids.length - 1; i >= 0; i--) stack.push({ id: kids[i], depth: item.depth + 1, hasParent: true })
    }
  }
  return out
}

/** Every node once, children before their parents (no recursion). */
function postOrder(ids: readonly string[], childrenOf: ReadonlyMap<string, readonly string[]>): string[] {
  return preOrder(ids, childrenOf).map(x => x.id).reverse()
}

/** Smallest and largest round-body radius (px) galaxy draws when it sizes bodies by weight. */
export const GALAXY_BODY_MIN_RADIUS = 8
export const GALAXY_BODY_MAX_RADIUS = 64
/** Floor used when sizes come from leaf counts (no node has a weight): leaves stay big enough to
 *  carry a label, since "small" carries no data meaning there. */
export const GALAXY_UNWEIGHTED_MIN_RADIUS = 15

/**
 * Body radius per node from effective weights. Body AREA grows with the square root of weight,
 * rescaled into [MIN², MAX²] across all the given nodes: area still rises strictly with weight, but
 * a 3-4 orders-of-magnitude range (flare: 264 to 956,129) no longer flattens every small item onto
 * the floor — with area ∝ weight, all of flare's leaves were identical dots (Austin, 2026-10-25:
 * compress the scale). A floor keeps the smallest items visible. All-equal weights (including a
 * single node) get the middle area.
 */
export function galaxyBodyRadii(
  weightOf: ReadonlyMap<string, number>,
  { minRadius = GALAXY_BODY_MIN_RADIUS, maxRadius = GALAXY_BODY_MAX_RADIUS }: { minRadius?: number; maxRadius?: number } = {}
): Map<string, number> {
  const scaled = new Map([...weightOf].map(([id, w]) => [id, Math.sqrt(Math.max(0, w))]))
  const ws = [...scaled.values()]
  const lo = Math.min(...ws)
  const hi = Math.max(...ws)
  const minA = minRadius ** 2
  const maxA = maxRadius ** 2
  const radii = new Map<string, number>()
  for (const [id, w] of scaled) {
    const t = hi > lo ? (w - lo) / (hi - lo) : 0.5
    radii.set(id, Math.sqrt(minA + t * (maxA - minA)))
  }
  return radii
}

/** Heaviest first; ties keep their original (data) order. Returns a new array. */
function heaviestFirst(ids: readonly string[], weightOf: ReadonlyMap<string, number>): string[] {
  return ids
    .map((id, i) => ({ id, i, w: weightOf.get(id) ?? 0 }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map(x => x.id)
}

/**
 * Same shape as `HierarchyEdge` (source = parent, target = child for a structural edge) — kept as
 * its own named type because it's the name galaxy layout's public API already shipped under.
 */
export interface GalaxyLayoutEdge extends HierarchyEdge {
  /** Structural edges define the orbital hierarchy (source = parent, target = child).
   *  Non-structural edges are ignored by the layout entirely. */
  structural: boolean
}

export interface GalaxyLayoutOptions {
  /** Default gap between a satellite's system and its parent's body, and between neighbouring
   *  systems, as a multiple of the median body radius (at least 12 px). Default 0.6. Before
   *  2026-10-25 this multiplied a child's own radius to set its orbit distance (default 3.2);
   *  distance now comes from the satellite's system size. */
  nodeSpread?: number
  /** Radians. Heading of the first (heaviest) satellite around each galaxy's root. Default π
   *  (9 o'clock, as in Risacher's chart: wide screens get a landscape-leaning layout). */
  startAngle?: number
  /** @deprecated Ignored since 2026-10-25 (the construction needs no settle loop). Kept for API
   *  compatibility. */
  settleCycles?: number
  /** 0-1. Live simulation only: fraction of the remaining distance to home closed per tick.
   *  Default 0.18. */
  homeStrength?: number
  /** Gap (px) between systems and bodies; when set, it REPLACES the default gap (nodeSpread ×
   *  median body radius, at least 12 px), so 0 means they touch. Also pads the overlap resolution
   *  used when nodes are pinned. */
  nodeMargin?: number
  /** @deprecated Ignored since 2026-10-25: independent galaxies are always packed so they can't
   *  overlap, and systems inside a galaxy are disjoint by construction. Kept for API compatibility. */
  separateGroups?: boolean
  /** Container width/height. Leans a forest's arrangement of whole galaxies toward this shape
   *  (arrangeToAspect). Never warps orbits inside a galaxy (vision item 5). */
  aspectRatio?: number
  /** @deprecated Ignored since 2026-10-25 (orbits are never warped; see `aspectRatio`). Kept for
   *  API compatibility. */
  resolvedAspectScale?: { x: number; y: number }
}

/** Forests with more galaxies than this skip arrangeToAspect (quadratic). */
const ARRANGE_MAX_GALAXIES = 150

/** Smallest default gap (px) between bodies/systems; see buildForest. */
const MIN_GAP = 12

interface Forest {
  childrenOf: Map<string, string[]>
  roots: string[]
  weightOf: Map<string, number>
  radiusOf: (id: string) => number
  gap: number
}

function buildForest(nodes: readonly GalaxyLayoutNode[], edges: readonly GalaxyLayoutEdge[], options: GalaxyLayoutOptions): Forest {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const { childrenOf, roots } = buildStructuralForest(nodes.map(n => n.id), edges)
  // A caller that knows the full hierarchy (GraphCanvas) passes each node's already-effective
  // weight; resolving again here is then a no-op. A direct caller with no weights gets leaf counts.
  const weightOf = galaxyEffectiveWeights(nodes.map(n => n.id), childrenOf, id => nodeMap.get(id)?.weight)
  const radiusOf = (id: string): number => {
    const n = nodeMap.get(id)
    return n ? galaxyRadiusOf(n) : 20
  }
  const radii = nodes.map(n => galaxyRadiusOf(n)).sort((a, b) => a - b)
  const medianR = radii.length ? radii[radii.length >> 1] : 20
  // At least MIN_GAP, so an edge between two neighbouring bodies stays visible.
  const gap = options.nodeMargin ?? Math.max(MIN_GAP, (options.nodeSpread ?? 0.6) * medianR)
  return { childrenOf: childrenOf as Map<string, string[]>, roots: [...roots], weightOf, radiusOf, gap }
}

/**
 * Angular slot per satellite. Size-proportional slots (a balloon tree's) are the most compact, but
 * the vision asks for evenly spaced orbits (design-material/galaxy/vision-statement.md item 3:
 * every gap within ±50% of an equal 2π/k share). So: start proportional to system radius, then
 * clamp every slot into [0.5, 1.5] × 2π/k, redistributing the excess among the unclamped slots
 * (water-filling). Equal slots (Risacher's) waste space on deep trees: a big system in a narrow
 * slot must sit far out, compounding level by level.
 */
const SLOT_EVENNESS_BAND: readonly [number, number] = [0.5, 1.5]
/** Extra clearance between a satellite and its parent body, as a fraction of the satellite's own
 *  radius. Without it a 60px planet sat 5px from its parent and read as overlapping. */
const SATELLITE_SPREAD = 0.5
/** An only child turns this far off its parent's heading, so a chain curls like a galaxy's arm
 *  instead of running off in a straight line. */
const ONLY_CHILD_BEND = 0.7

function slotAngles(systemRadii: readonly number[]): number[] {
  const k = systemRadii.length
  const ideal = (2 * Math.PI) / k
  const [lo, hi] = [SLOT_EVENNESS_BAND[0] * ideal, SLOT_EVENNESS_BAND[1] * ideal]
  const slot = new Map<number, number>()
  // Water-filling: cap oversized shares first, then floor undersized ones, re-sharing the rest
  // in proportion each round.
  for (let round = 0; round <= 2 * k; round++) {
    const free = systemRadii.map((_, i) => i).filter(i => !slot.has(i))
    if (free.length === 0) break
    const remaining = 2 * Math.PI - [...slot.values()].reduce((a, b) => a + b, 0)
    const weight = free.reduce((a, i) => a + systemRadii[i], 0)
    const share = (i: number) => (weight > 0 ? (remaining * systemRadii[i]) / weight : remaining / free.length)
    const over = free.filter(i => share(i) > hi)
    if (over.length) { for (const i of over) slot.set(i, hi); continue }
    const under = free.filter(i => share(i) < lo)
    if (under.length) { for (const i of under) slot.set(i, lo); continue }
    for (const i of free) slot.set(i, share(i))
    break
  }
  // Everything clamped: hand any leftover to the floored slots (or take an excess from the capped
  // ones), so slots always fill the circle exactly.
  let leftover = 2 * Math.PI - [...slot.values()].reduce((a, b) => a + b, 0)
  if (Math.abs(leftover) > 1e-9) {
    const pool = systemRadii.map((_, i) => i).filter(i => (leftover > 0 ? slot.get(i)! <= lo + 1e-12 : slot.get(i)! >= hi - 1e-12))
    const targets = pool.length ? pool : systemRadii.map((_, i) => i)
    for (const i of targets) slot.set(i, slot.get(i)! + leftover / targets.length)
    leftover = 0
  }
  return systemRadii.map((_, i) => slot.get(i)!)
}

/** Smallest distance at which a satellite system of radius `sysR`, given an angular slot of
 *  `theta`, clears its parent's body and stays inside its own slot's wedge (file header, step 2). */
function orbitDistance(parentR: number, sysR: number, theta: number, gap: number): number {
  const clearParent = parentR + gap + sysR
  // A slot of π or more is no narrower than a half-plane: clearing the parent body is enough.
  if (theta >= Math.PI) return clearParent
  return Math.max(clearParent, (sysR + gap / 2) / Math.sin(theta / 2))
}

/**
 * Smallest distance along a slot's bisector at which every body of a satellite's subtree clears the
 * parent's body and stays inside the slot's wedge, both with the gap. `sub` is the subtree in its
 * own frame (root at the origin, outward along +x = the bisector). Binary search between the
 * nearest legal distance for the satellite's own body and the disc bound (the whole system as a
 * disc of radius R inside the wedge), which is always feasible — so the result is never farther
 * than the disc bound, and usually much nearer: a subtree mostly sits on its far side.
 */
function fitDistance(
  parentR: number,
  sub: LocalSystem,
  satelliteR: number,
  theta: number,
  gap: number,
  radiusOf: (id: string) => number
): number {
  const h = theta / 2
  const bounded = theta < 2 * Math.PI - 1e-9
  const rays = bounded ? [{ x: Math.cos(h), y: Math.sin(h) }, { x: Math.cos(h), y: -Math.sin(h) }] : []
  const pts = [...sub.pts].map(([id, p]) => ({ p, rho: radiusOf(id) }))
  const fits = (d: number): boolean => {
    for (const { p, rho } of pts) {
      const x = d + p.x
      const y = p.y
      // Clearance from the parent body grows with the body's own size, so a big planet swings
      // visibly wide while a small moon still hugs its parent (Risacher: parent.r + 4 × child.r).
      if (Math.hypot(x, y) < parentR + gap + rho * (1 + SATELLITE_SPREAD)) return false
      if (!bounded) continue
      if (Math.abs(Math.atan2(y, x)) > h) return false
      for (const v of rays) {
        const t = Math.max(0, x * v.x + y * v.y)
        if (Math.hypot(x - t * v.x, y - t * v.y) < rho + gap / 2) return false
      }
    }
    return true
  }
  let lo = parentR + gap + satelliteR * (1 + SATELLITE_SPREAD)
  let hi = Math.max(lo, orbitDistance(parentR, sub.R * (1 + SATELLITE_SPREAD), theta, gap))
  if (fits(lo)) return lo
  for (let i = 0; i < 28 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/** A subtree laid out around its own root at the origin, outward heading along +x. */
interface LocalSystem {
  pts: Map<string, { x: number; y: number }>
  /** Exact extent: farthest body edge from the root's centre. */
  R: number
}

/**
 * Bottom-up (file header, steps 1-2): each subtree is laid out once in its own frame — root at the
 * origin, heading +x — and placed into its parent's frame by rotation + translation. Galaxy
 * placement is rotation-invariant (every angle is relative to the heading), so this is exact, and
 * each system's extent R is measured, not bounded.
 */
function buildLocalSystems(forest: Forest): Map<string, LocalSystem> {
  const { childrenOf, roots, weightOf, radiusOf, gap } = forest
  const out = new Map<string, LocalSystem>()
  // Children before parents, iteratively (deep chains overflowed the stack when this recursed).
  const order = preOrder(roots, childrenOf).reverse()
  for (const { id, depth, hasParent } of order) {
    const r = radiusOf(id)
    const pts = new Map<string, { x: number; y: number }>([[id, { x: 0, y: 0 }]])
    const kids = heaviestFirst((childrenOf.get(id) ?? []).filter(k => out.has(k)), weightOf)
    const subs = kids.map(k => out.get(k)!)
    const k = kids.length
    let angles: number[] = []
    let distances: number[] = []
    if (k === 1) {
      angles = [hasParent ? ONLY_CHILD_BEND : 0]
      distances = [fitDistance(r, subs[0], radiusOf(kids[0]), 2 * Math.PI, gap, radiusOf)]
    } else if (k > 1) {
      const thetas = slotAngles(subs.map(sub => sub.R))
      let cursor = -thetas[0] / 2
      for (const t of thetas) {
        angles.push(cursor + t / 2)
        cursor += t
      }
      // Below the root, rotate so the line back to the grandparent (angle π) falls on a slot
      // boundary, not through a satellite's system (Risacher's half-slot offset, "to prevent lunar
      // eclipses"); at most half a slot, so the heaviest stays within one slot of the heading.
      // The turn alternates direction by depth: always turning the same way made a deep spine
      // coil on itself and grow exponentially (a 3-leaf caterpillar reached 1e23 px at depth 250).
      if (hasParent) {
        const preferred = depth % 2 === 0 ? 1 : -1
        let best = Infinity
        let bestSigned = Infinity
        let edge = -thetas[0] / 2
        for (const t of thetas) {
          const delta = Math.atan2(Math.sin(Math.PI - edge), Math.cos(Math.PI - edge))
          if (Math.abs(delta) < Math.abs(best)) best = delta
          if (Math.sign(delta) === preferred && Math.abs(delta) < Math.abs(bestSigned)) bestSigned = delta
          edge += t
        }
        const rotation = Math.abs(bestSigned) <= thetas[0] ? bestSigned : best
        angles = angles.map(a => a + rotation)
      }
      distances = subs.map((sub, i) => fitDistance(r, sub, radiusOf(kids[i]), thetas[i], gap, radiusOf))
    }
    let R = r
    kids.forEach((_childId, i) => {
      const a = angles[i]
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      const cx = distances[i] * cos
      const cy = distances[i] * sin
      for (const [mid, p] of subs[i].pts) {
        const q = { x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }
        pts.set(mid, q)
        R = Math.max(R, Math.hypot(q.x, q.y) + radiusOf(mid))
      }
    })
    out.set(id, { pts, R })
  }
  return out
}

/**
 * Leans a packed forest toward a container's width/height ratio: repeatedly compress galaxy
 * centres along the short axis and push apart any galaxy circles that then overlap, until the
 * arrangement's bounding box reaches the ratio (or stops changing). Moves whole galaxies only —
 * orbits inside a galaxy are never warped (vision item 5).
 */
function arrangeToAspect(circles: { x: number; y: number; r: number }[], aspectRatio: number): void {
  const target = Math.min(8, Math.max(1 / 8, aspectRatio))
  const extent = (): { w: number; h: number } => ({
    w: Math.max(...circles.map(c => c.x + c.r)) - Math.min(...circles.map(c => c.x - c.r)),
    h: Math.max(...circles.map(c => c.y + c.r)) - Math.min(...circles.map(c => c.y - c.r)),
  })
  // How large the arrangement can be drawn in a target-shaped container: keep whichever round's
  // arrangement fits best (squeezing a forest of very unequal galaxies can overshoot).
  const fit = (): number => {
    const { w, h } = extent()
    return Math.min(target / w, 1 / h)
  }
  let best = { fit: fit(), at: circles.map(c => ({ x: c.x, y: c.y })) }
  const wide = target >= 1
  for (let round = 0; round < 80; round++) {
    const { w, h } = extent()
    if (wide ? w / h >= target : w / h <= target) break
    for (const c of circles) {
      if (wide) c.y *= 0.94
      else c.x *= 0.94
    }
    for (let pass = 0; pass < 60; pass++) {
      let moved = false
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i], b = circles[j]
          let dx = b.x - a.x, dy = b.y - a.y
          let d = Math.hypot(dx, dy)
          const need = a.r + b.r - d
          if (need <= 1e-6) continue
          if (d < 1e-9) { dx = wide ? 1 : 0; dy = wide ? 0 : 1; d = 1 }
          a.x -= (dx / d) * need / 2; a.y -= (dy / d) * need / 2
          b.x += (dx / d) * need / 2; b.y += (dy / d) * need / 2
          moved = true
        }
      }
      if (!moved) break
    }
    const f = fit()
    if (f > best.fit) best = { fit: f, at: circles.map(c => ({ x: c.x, y: c.y })) }
  }
  circles.forEach((c, i) => {
    c.x = best.at[i].x
    c.y = best.at[i].y
  })
}

function computeBaseHome(
  forest: Forest,
  startAngle: number,
  aspectRatio?: number
): Map<string, { x: number; y: number }> {
  const { childrenOf, roots, weightOf, gap } = forest
  const systems = buildLocalSystems(forest)
  const home = new Map<string, { x: number; y: number }>()

  // Step 3: pack the galaxies (each root's system circle) heaviest first, lean the arrangement
  // toward the container's shape, then place each one.
  // Lone nodes (no structural parent or children) are packed together as one cluster of their own,
  // set apart by a wide gap: tucked into the gaps between galaxies they read as members of
  // whichever galaxy they happened to land beside.
  const ordered = heaviestFirst(roots, weightOf)
  const lone = ordered.filter(id => (childrenOf.get(id) ?? []).length === 0)
  const galaxies = ordered.filter(id => (childrenOf.get(id) ?? []).length > 0)
  type Placed = { id: string; r: number; x: number; y: number }
  const circles: Placed[] = galaxies.map(id => ({ id, r: systems.get(id)!.R + gap / 2, x: 0, y: 0 }))
  let loneCircles: Placed[] = []
  let loneGroup: Placed | undefined
  if (lone.length && galaxies.length) {
    loneCircles = lone.map(id => ({ id, r: systems.get(id)!.R + gap / 2, x: 0, y: 0 }))
    packSiblings(loneCircles)
    const enclosing = packEnclose(loneCircles)!
    loneGroup = { id: '\u0000lone', r: enclosing.r + 2 * gap, x: 0, y: 0 }
    loneCircles = loneCircles.map(c => ({ ...c, x: c.x - enclosing.x, y: c.y - enclosing.y }))
    circles.push(loneGroup)
  } else {
    circles.push(...lone.map(id => ({ id, r: systems.get(id)!.R + gap / 2, x: 0, y: 0 })))
  }
  packSiblings(circles)
  // arrangeToAspect is quadratic in galaxy count; past ARRANGE_MAX_GALAXIES the plain compact
  // packing is kept (2 s at ~1500 galaxies otherwise).
  if (aspectRatio !== undefined && Number.isFinite(aspectRatio) && circles.length > 1 && circles.length <= ARRANGE_MAX_GALAXIES) {
    arrangeToAspect(circles, aspectRatio)
  }
  const cos = Math.cos(startAngle)
  const sin = Math.sin(startAngle)
  const placeGalaxy = (id: string, cx: number, cy: number): void => {
    for (const [mid, p] of systems.get(id)!.pts) {
      home.set(mid, { x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos })
    }
  }
  for (const c of circles) {
    if (c === loneGroup) for (const l of loneCircles) placeGalaxy(l.id, c.x + l.x, c.y + l.y)
    else placeGalaxy(c.id, c.x, c.y)
  }

  return home
}

/** Shifts each pinned node's subtree so the node lands on its given position (outer pins first). */
function applyPins(nodes: readonly GalaxyLayoutNode[], forest: Forest, base: ReadonlyMap<string, { x: number; y: number }>): Map<string, { x: number; y: number }> {
  const { childrenOf, roots } = forest
  const home = new Map(base)
  const descendants = (id: string): string[] => preOrder([id], childrenOf).slice(1).map(x => x.id)
  const depth = new Map(preOrder(roots, childrenOf).map(x => [x.id, x.depth]))
  const pinned = nodes
    .filter(n => n.pinned && n.x !== undefined && n.y !== undefined && home.has(n.id))
    .sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0))
  for (const n of pinned) {
    const at = home.get(n.id)!
    const dx = n.x! - at.x
    const dy = n.y! - at.y
    if (dx === 0 && dy === 0) continue
    for (const id of [n.id, ...descendants(n.id)]) {
      const p = home.get(id)!
      home.set(id, { x: p.x + dx, y: p.y + dy })
    }
  }
  return home
}

// Live simulation calls galaxySimulationStep every animation frame. The pin-free construction only
// changes when the structure, sizes or options do, and the pinned target only when a pin moves, so
// both are cached (one entry each) instead of rebuilt per frame — arrangeToAspect alone is
// quadratic in galaxy count (300 ms/frame at 500 roots before this).
let baseCache: { key: string; edges: readonly GalaxyLayoutEdge[]; home: Map<string, { x: number; y: number }> } | undefined
let pinnedCache: { key: string; edges: readonly GalaxyLayoutEdge[]; home: Map<string, { x: number; y: number }> } | undefined

function structureKey(nodes: readonly GalaxyLayoutNode[], options: GalaxyLayoutOptions, startAngle: number): string {
  const parts = nodes.map(n => `${n.id}|${n.width}|${n.height}|${n.radius ?? ''}|${n.weight ?? ''}`)
  return `${startAngle}|${options.aspectRatio ?? ''}|${options.nodeMargin ?? ''}|${options.nodeSpread ?? ''}#${parts.join(';')}`
}

/** Home positions, pins applied and (when pinned) overlaps resolved on the target. Cached. */
function computeHome(
  nodes: readonly GalaxyLayoutNode[],
  edges: readonly GalaxyLayoutEdge[],
  forest: Forest,
  options: GalaxyLayoutOptions,
  startAngle: number
): Map<string, { x: number; y: number }> {
  const key = structureKey(nodes, options, startAngle)
  if (!baseCache || baseCache.key !== key || baseCache.edges !== edges) {
    baseCache = { key, edges, home: computeBaseHome(forest, startAngle, options.aspectRatio) }
    pinnedCache = undefined
  }
  const pins = nodes.filter(n => n.pinned && n.x !== undefined && n.y !== undefined)
  if (pins.length === 0) return new Map(baseCache.home)
  const pinKey = pins.map(n => `${n.id}@${n.x},${n.y}`).join(';')
  if (!pinnedCache || pinnedCache.key !== pinKey || pinnedCache.edges !== edges) {
    const home = applyPins(nodes, forest, baseCache.home)
    // Pins can push a dragged system into its neighbours: resolve that on the TARGET (pinned nodes
    // fixed). Separating the moving positions every tick fought the pull toward home forever.
    separateUntilClear(nodes, home, forest.gap / 2)
    pinnedCache = { key: pinKey, edges, home }
  }
  return new Map(pinnedCache.home)
}

/**
 * @deprecated Kept for API compatibility. Since 2026-10-25 galaxy never warps its orbits to suit the
 * container's aspect ratio — a galaxy's systems are round by definition (vision item 5) — so this
 * always returns the identity scale.
 */
export function resolveAspectRatioScale(
  _nodes: readonly GalaxyLayoutNode[],
  _edges: readonly GalaxyLayoutEdge[],
  _options: GalaxyLayoutOptions = {}
): { x: number; y: number } {
  return { x: 1, y: 1 }
}

/** Overlap safety net, only needed when pinned nodes break the construction. */
function separateUntilClear(nodes: readonly GalaxyLayoutNode[], pos: Map<string, { x: number; y: number }>, margin: number): void {
  const padded: LayoutNode[] = nodes.map(n => ({ id: n.id, width: n.width + margin, height: n.height + margin, pinned: n.pinned, x: 0, y: 0 }))
  for (let pass = 0; pass < FINAL_CLEANUP_MAX_PASSES; pass++) {
    if (!separationPass(padded, pos)) break
  }
}

/**
 * One live-simulation tick: recomputes every node's home (pinned/dragged nodes anchor their
 * subtrees), then moves each unpinned node `homeStrength` of the way from `prevPositions` toward
 * its home. Drive it once per animation frame, feeding back its own output; a dragged node passed
 * as `pinned` carries its system with it. With nothing pinned, it converges to galaxyLayout's
 * result.
 */
export function galaxySimulationStep(
  nodes: readonly GalaxyLayoutNode[],
  edges: readonly GalaxyLayoutEdge[],
  prevPositions: Map<string, { x: number; y: number }> | undefined,
  options: GalaxyLayoutOptions = {}
): Map<string, { x: number; y: number }> {
  const { startAngle = Math.PI, homeStrength = 0.18 } = options
  if (nodes.length === 0) return new Map()
  const forest = buildForest(nodes, edges, options)
  const home = computeHome(nodes, edges, forest, options, startAngle)
  const pos = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    const h = home.get(node.id)!
    if (node.pinned && node.x !== undefined && node.y !== undefined) {
      pos.set(node.id, { x: node.x, y: node.y })
      continue
    }
    const p = prevPositions?.get(node.id) ?? h
    pos.set(node.id, { x: p.x + (h.x - p.x) * homeStrength, y: p.y + (h.y - p.y) * homeStrength })
  }
  return pos
}

/**
 * Positions nodes as galaxies: see the file header for the construction. Only `structural` edges
 * shape the hierarchy; other edges are layout-irrelevant (callers still render them — see
 * GraphCanvas's isStructuralEdge prop). A node with no structural parent (including one connected
 * only by non-structural edges, or not at all) is the root of its own galaxy.
 */
export function galaxyLayout(
  nodes: readonly GalaxyLayoutNode[],
  edges: readonly GalaxyLayoutEdge[],
  options: GalaxyLayoutOptions = {}
): Map<string, { x: number; y: number }> {
  const { startAngle = Math.PI } = options
  if (nodes.length === 0) return new Map()
  const forest = buildForest(nodes, edges, options)
  return computeHome(nodes, edges, forest, options, startAngle)
}

/**
 * Boundary disc per group: the smallest circle enclosing every member's body (d3 packEnclose).
 * Galaxy's satellites mostly extend outward from their head, so a disc centred on the head and
 * sized to its farthest member (boundingCirclesByGroup's anchorToHead) swings back over the
 * parent and neighbouring systems; the minimal enclosing circle hugs the system instead.
 */
export function galaxySystemCircles(
  positions: ReadonlyMap<string, { x: number; y: number }>,
  leafToGroup: ReadonlyMap<string, string>,
  radiusOf: (id: string) => number
): Map<string, { x: number; y: number; r: number }> {
  const members = new Map<string, { x: number; y: number; r: number }[]>()
  for (const [id, group] of leafToGroup) {
    const p = positions.get(id)
    if (!p) continue
    if (!members.has(group)) members.set(group, [])
    members.get(group)!.push({ x: p.x, y: p.y, r: radiusOf(id) })
  }
  const out = new Map<string, { x: number; y: number; r: number }>()
  for (const [group, circles] of members) {
    const c = packEnclose(circles)
    if (c) out.set(group, { x: c.x, y: c.y, r: c.r })
  }
  return out
}
