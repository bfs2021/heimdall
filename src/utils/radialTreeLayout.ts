import { hierarchy, tree as d3tree, packSiblings, type HierarchyNode } from 'd3-hierarchy'
import { type HierarchyEdge, type StructuralForest } from './graphHierarchy'
import { separationPass, type LayoutNode } from './graphLayout'

export interface RadialTreeLayoutOptions {
  /**
   * Minimum clear space (px) between adjacent depth rings, measured between the node boxes on
   * them (each ring is also pushed out by its nodes' half-diagonals, so boxes on neighboring
   * rings never touch whatever the branch angle). Default 80.
   */
  ringSpacing?: number
  /** Minimum clear space (px) between neighboring node boxes on the same ring. Default 12. */
  nodeSeparationGap?: number
  /** Padding around trunk bubbles during packing. Default 6. */
  trunkPadding?: number
}

export interface RingGeometry {
  trunkId: string
  cx: number
  cy: number
  r: number
  depth: number
}

export interface RadialTreeLayoutResult {
  positions: Map<string, { x: number; y: number }>
  trunkBoundaries: Map<string, { x: number; y: number; r: number }>
  ringGeometry: RingGeometry[]
}

// Extra angular separation between neighbors with different parents, so sibling subtrees read as
// distinct wedges rather than one continuous ring.
const COUSIN_SEPARATION = 1.5

/**
 * Radial tree layout engine for hierarchical graph visualization.
 *
 * Each trunk (structural root) is a concentric-ring tree: every node of a depth sits on one circle
 * around the root, and sibling subtrees occupy disjoint angular wedges (from d3.tree()).
 *
 * Ring radii come from what each ring's own nodes need, not from the total node count: a ring is
 * the smallest circle on which its neighboring node boxes don't overlap, and at least
 * `ringSpacing` plus both rings' node half-diagonals beyond the previous ring. That keeps
 * fit-to-view legible for human-scale trees.
 *
 * The whole layout (angles, radii, trunk bubble) is computed once from the fully expanded tree, and
 * visible nodes take their full-tree positions. Collapsing or expanding a node therefore never moves
 * any other node; it only hides or reveals that node's descendants.
 *
 * Execution phases:
 * 1. Per trunk: lay out the full tree and size its bubble from it
 * 2. Pack trunk bubbles in 2D space without overlap
 * 3. Place visible nodes at their full-tree positions, offset by their trunk's packed center
 * 4. Global separation pass (safety net; a no-op when the analytic placement is clean)
 * 5. Recompute trunk boundaries in case the separation pass moved anything outward
 *
 * @param visibleNodes - Only currently visible (non-collapsed) nodes for placement
 * @param edges - Unused; accepted for API consistency with other layout functions
 * @param dims - Measured dimensions per node. Nodes missing from it (e.g. hidden inside a collapsed
 *   subtree, so never measured) are sized as the largest measured node.
 * @param fullForest - Structural forest from ALL nodes (used for sizing pass)
 * @param options - Layout configuration
 */
export function radialTreeLayout(
  visibleNodes: readonly LayoutNode[],
  _edges: readonly HierarchyEdge[],
  dims: ReadonlyMap<string, { width: number; height: number }>,
  fullForest: StructuralForest,
  options: RadialTreeLayoutOptions = {},
): RadialTreeLayoutResult {
  const {
    ringSpacing = 80,
    nodeSeparationGap = 12,
    trunkPadding = 6,
  } = options

  const result: RadialTreeLayoutResult = {
    positions: new Map(),
    trunkBoundaries: new Map(),
    ringGeometry: [],
  }

  if (visibleNodes.length === 0) return result

  const forest = fullForest
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id))

  // Unmeasured nodes (hidden in a collapsed subtree) are sized as the largest measured node, so the
  // full-tree sizing reserves enough room for them and nothing shifts much once they're revealed.
  let fallbackDims = { width: 40, height: 40 }
  if (dims.size > 0) {
    let width = 0
    let height = 0
    for (const d of dims.values()) {
      width = Math.max(width, d.width)
      height = Math.max(height, d.height)
    }
    fallbackDims = { width, height }
  }
  const getDims = (id: string): { width: number; height: number } => dims.get(id) ?? fallbackDims
  const halfDiagonal = (id: string): number => {
    const d = getDims(id)
    return Math.hypot(d.width, d.height) / 2
  }

  interface TrunkLayout {
    /** Root-relative positions of every node in the trunk (fully expanded). */
    positions: Map<string, { x: number; y: number }>
    /** Depth of every node in the trunk. */
    depthOf: Map<string, number>
    /** Ring radius per depth (depth 0 = 0). */
    ringRadii: number[]
    /** Radius enclosing every node box in the trunk. */
    bubbleRadius: number
  }

  // Smallest radius at which two boxes at angles a and b (same ring) don't overlap. Axis-aligned
  // boxes are clear when their centers are far enough apart on either axis.
  const minRadiusForPair = (idA: string, angleA: number, idB: string, angleB: number): number => {
    const a = getDims(idA)
    const b = getDims(idB)
    const ux = Math.abs(Math.cos(angleB) - Math.cos(angleA))
    const uy = Math.abs(Math.sin(angleB) - Math.sin(angleA))
    const needX = (a.width + b.width) / 2 + nodeSeparationGap
    const needY = (a.height + b.height) / 2 + nodeSeparationGap
    return Math.min(
      ux > 1e-9 ? needX / ux : Infinity,
      uy > 1e-9 ? needY / uy : Infinity,
    )
  }

  const layoutTrunk = (rootId: string): TrunkLayout => {
    interface Datum { id: string; children?: Datum[] }
    const seen = new Set<string>()
    const build = (id: string): Datum => {
      seen.add(id)
      const children = (forest.childrenOf.get(id) ?? []).filter(c => !seen.has(c))
      return { id, children: children.length > 0 ? children.map(build) : undefined }
    }
    const root = hierarchy(build(rootId))

    // Angles from d3.tree() on a unit radius. Separation is proportional to the space two
    // neighbors need, divided by depth since deeper rings have more circumference per radian.
    const tree = d3tree<Datum>()
      .size([2 * Math.PI, 1])
      .separation((a: HierarchyNode<Datum>, b: HierarchyNode<Datum>) => {
        const need = (getDims(a.data.id).width + getDims(b.data.id).width) / 2 + nodeSeparationGap
        const cousin = a.parent === b.parent ? 1 : COUSIN_SEPARATION
        return (need * cousin) / Math.max(a.depth, 1)
      })
    tree(root)

    const byDepth: Array<Array<{ id: string; angle: number }>> = []
    const depthOf = new Map<string, number>()
    root.each(node => {
      depthOf.set(node.data.id, node.depth)
      ;(byDepth[node.depth] ??= []).push({ id: node.data.id, angle: node.x ?? 0 })
    })

    const ringRadii: number[] = [0]
    const maxHalfDiag = (depth: number) => Math.max(...byDepth[depth].map(n => halfDiagonal(n.id)))
    for (let depth = 1; depth < byDepth.length; depth++) {
      let r = ringRadii[depth - 1] + maxHalfDiag(depth - 1) + maxHalfDiag(depth) + ringSpacing
      const ring = [...byDepth[depth]].sort((p, q) => p.angle - q.angle)
      if (ring.length > 1) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]
          const b = ring[(i + 1) % ring.length]
          r = Math.max(r, minRadiusForPair(a.id, a.angle, b.id, b.angle))
        }
      }
      ringRadii.push(r)
    }

    const positions = new Map<string, { x: number; y: number }>()
    let bubbleRadius = halfDiagonal(rootId) + 10
    byDepth.forEach((ring, depth) => {
      const r = ringRadii[depth]
      for (const { id, angle } of ring) {
        positions.set(id, { x: r * Math.cos(angle), y: r * Math.sin(angle) })
        bubbleRadius = Math.max(bubbleRadius, r + halfDiagonal(id))
      }
    })

    return { positions, depthOf, ringRadii, bubbleRadius }
  }

  // Phase 1: Lay out each trunk's fully expanded tree; its bubble is sized from that.
  const trunks = forest.roots
  const trunkLayouts = trunks.map(rootId => layoutTrunk(rootId))
  const trunkBubbles = trunkLayouts.map(t => ({ radius: t.bubbleRadius }))

  // Phase 2: Pack trunk bubbles without overlap
  const packedTrunks = packSiblings(
    trunkBubbles.map(b => ({ r: b.radius + trunkPadding })),
  )

  const trunkOffsets = new Map<string, { x: number; y: number }>()
  for (let i = 0; i < trunks.length; i++) {
    trunkOffsets.set(trunks[i], {
      x: packedTrunks[i].x,
      y: packedTrunks[i].y,
    })
  }

  // Phase 3: Placement — visible nodes take their full-tree positions
  const allPositions = new Map<string, { x: number; y: number }>()
  const trunkMembership = new Map<string, string>()

  for (let i = 0; i < trunks.length; i++) {
    const rootId = trunks[i]
    const trunk = trunkLayouts[i]
    const offset = trunkOffsets.get(rootId)!
    const occupiedDepths = new Set<number>()

    for (const [id, pos] of trunk.positions) {
      if (!visibleNodeIds.has(id)) continue
      allPositions.set(id, {
        x: pos.x + offset.x,
        y: pos.y + offset.y,
      })
      trunkMembership.set(id, rootId)
      occupiedDepths.add(trunk.depthOf.get(id)!)
    }

    // Record ring geometry for each depth that has a visible node (depth 0 is a point, not a ring)
    for (const depth of [...occupiedDepths].sort((a, b) => a - b)) {
      if (depth === 0) continue
      result.ringGeometry.push({
        trunkId: rootId,
        cx: offset.x,
        cy: offset.y,
        r: trunk.ringRadii[depth],
        depth,
      })
    }
  }

  // Phase 4: Final separation pass (runs globally across all trunks)
  const layoutNodesForSeparation = visibleNodes.filter(n => allPositions.has(n.id))
  separationPass(layoutNodesForSeparation, allPositions)

  result.positions = allPositions

  // Phase 5: Recompute trunk boundaries after separation pass
  // The separation pass may move nodes outward, so we recompute bounds based on final positions
  for (let i = 0; i < trunks.length; i++) {
    const rootId = trunks[i]
    const offset = trunkOffsets.get(rootId)!
    const bubble = trunkBubbles[i]

    let maxDistFromCenter = bubble.radius

    // Find the farthest node in this trunk from its center
    for (const [id, pos] of allPositions) {
      if (trunkMembership.get(id) !== rootId) continue

      const nodeDims = getDims(id)
      const nodeRadius = Math.hypot(nodeDims.width, nodeDims.height) / 2
      const distFromCenter = Math.hypot(
        pos.x - offset.x,
        pos.y - offset.y,
      ) + nodeRadius
      maxDistFromCenter = Math.max(maxDistFromCenter, distFromCenter)
    }

    result.trunkBoundaries.set(rootId, {
      x: offset.x,
      y: offset.y,
      r: maxDistFromCenter,
    })
  }

  return result
}
