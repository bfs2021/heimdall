import { describe, it, expect } from 'vitest'
import { radialTreeLayout } from '../radialTreeLayout'
import { buildStructuralForest } from '../graphHierarchy'
import type { LayoutNode } from '../graphLayout'
import type { HierarchyEdge } from '../graphHierarchy'

describe('radialTreeLayout', () => {
  // Helper to create a mock dimension map
  const mockDims = (nodes: LayoutNode[]): Map<string, { width: number; height: number }> => {
    const dims = new Map<string, { width: number; height: number }>()
    for (const node of nodes) {
      dims.set(node.id, { width: node.width, height: node.height })
    }
    return dims
  }

  // Helper to calculate distance between two points
  const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Helper to check if two boxes overlap
  const boxesOverlap = (
    box1: { x: number; y: number; width: number; height: number },
    box2: { x: number; y: number; width: number; height: number },
  ): boolean => {
    const left1 = box1.x - box1.width / 2
    const right1 = box1.x + box1.width / 2
    const top1 = box1.y - box1.height / 2
    const bottom1 = box1.y + box1.height / 2

    const left2 = box2.x - box2.width / 2
    const right2 = box2.x + box2.width / 2
    const top2 = box2.y - box2.height / 2
    const bottom2 = box2.y + box2.height / 2

    return left1 < right2 && right1 > left2 && top1 < bottom2 && bottom1 > top2
  }

  describe('single-node trunk', () => {
    it('places a single orphan node at its trunk origin', () => {
      const allNodes: LayoutNode[] = [
        { id: 'a', x: 0, y: 0, width: 40, height: 40 },
      ]
      const visibleNodes: LayoutNode[] = allNodes
      const edges: HierarchyEdge[] = []
      const dims = mockDims(allNodes)
      const forest = buildStructuralForest(allNodes.map(n => n.id), edges)

      const result = radialTreeLayout(visibleNodes, edges, dims, forest)

      expect(result.positions.has('a')).toBe(true)
      expect(result.trunkBoundaries.has('a')).toBe(true)
    })
  })

  describe('multi-level single trunk', () => {
    it('places root at trunk origin with descendants on concentric rings', () => {
      // 3-level tree: root -> children -> grandchildren
      const allNodes: LayoutNode[] = [
        { id: 'root', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child1', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child2', x: 0, y: 0, width: 40, height: 40 },
        { id: 'grand1', x: 0, y: 0, width: 40, height: 40 },
        { id: 'grand2', x: 0, y: 0, width: 40, height: 40 },
      ]
      const visibleNodes = allNodes

      const edges: HierarchyEdge[] = [
        { source: 'root', target: 'child1', structural: true },
        { source: 'root', target: 'child2', structural: true },
        { source: 'child1', target: 'grand1', structural: true },
        { source: 'child2', target: 'grand2', structural: true },
      ]

      const dims = mockDims(allNodes)
      const forest = buildStructuralForest(allNodes.map(n => n.id), edges)

      const result = radialTreeLayout(visibleNodes, edges, dims, forest)

      // All nodes should be positioned
      for (const node of allNodes) {
        expect(result.positions.has(node.id)).toBe(true)
      }

      // Root should be at or near the trunk's center
      const rootPos = result.positions.get('root')!
      const trunkBoundary = result.trunkBoundaries.get('root')!
      const rootDistance = distance(rootPos, { x: trunkBoundary.x, y: trunkBoundary.y })
      expect(rootDistance).toBeLessThan(trunkBoundary.r)

      // Children should be farther from center than root
      const child1Pos = result.positions.get('child1')!
      const rootToChild1 = distance(
        { x: trunkBoundary.x, y: trunkBoundary.y },
        { x: child1Pos.x, y: child1Pos.y },
      )
      expect(rootToChild1).toBeGreaterThan(rootDistance)

      // Grandchildren should be farther from center than children
      const grand1Pos = result.positions.get('grand1')!
      const rootToGrand1 = distance(
        { x: trunkBoundary.x, y: trunkBoundary.y },
        { x: grand1Pos.x, y: grand1Pos.y },
      )
      expect(rootToGrand1).toBeGreaterThan(rootToChild1)
    })

    it('does not overlap sibling nodes at the same depth', () => {
      const allNodes: LayoutNode[] = [
        { id: 'root', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child1', x: 0, y: 0, width: 50, height: 50 },
        { id: 'child2', x: 0, y: 0, width: 50, height: 50 },
        { id: 'child3', x: 0, y: 0, width: 50, height: 50 },
      ]
      const visibleNodes = allNodes

      const edges: HierarchyEdge[] = [
        { source: 'root', target: 'child1', structural: true },
        { source: 'root', target: 'child2', structural: true },
        { source: 'root', target: 'child3', structural: true },
      ]

      const dims = mockDims(allNodes)
      const forest = buildStructuralForest(allNodes.map(n => n.id), edges)

      const result = radialTreeLayout(visibleNodes, edges, dims, forest)

      // Check that no two siblings overlap
      const child1Pos = result.positions.get('child1')!
      const child2Pos = result.positions.get('child2')!
      const child3Pos = result.positions.get('child3')!

      const child1Box = { x: child1Pos.x, y: child1Pos.y, width: 50, height: 50 }
      const child2Box = { x: child2Pos.x, y: child2Pos.y, width: 50, height: 50 }
      const child3Box = { x: child3Pos.x, y: child3Pos.y, width: 50, height: 50 }

      expect(boxesOverlap(child1Box, child2Box)).toBe(false)
      expect(boxesOverlap(child1Box, child3Box)).toBe(false)
      expect(boxesOverlap(child2Box, child3Box)).toBe(false)
    })
  })

  describe('multiple disconnected trunks', () => {
    it('arranges multiple trunks without overlap', () => {
      // Three disconnected single nodes
      const allNodes: LayoutNode[] = [
        { id: 'root1', x: 0, y: 0, width: 40, height: 40 },
        { id: 'root2', x: 0, y: 0, width: 40, height: 40 },
        { id: 'root3', x: 0, y: 0, width: 40, height: 40 },
      ]
      const visibleNodes = allNodes

      const edges: HierarchyEdge[] = []
      const dims = mockDims(allNodes)
      const forest = buildStructuralForest(allNodes.map(n => n.id), edges)

      const result = radialTreeLayout(visibleNodes, edges, dims, forest)

      // All nodes should be positioned
      for (const node of allNodes) {
        expect(result.positions.has(node.id)).toBe(true)
      }

      // All trunks should have boundaries
      expect(result.trunkBoundaries.size).toBe(3)

      // No two trunk boundaries should overlap
      const boundaries = Array.from(result.trunkBoundaries.values())
      for (let i = 0; i < boundaries.length; i++) {
        for (let j = i + 1; j < boundaries.length; j++) {
          const b1 = boundaries[i]
          const b2 = boundaries[j]
          const dist = distance({ x: b1.x, y: b1.y }, { x: b2.x, y: b2.y })
          const minDist = b1.r + b2.r
          expect(dist).toBeGreaterThanOrEqual(minDist - 1) // allow tiny tolerance
        }
      }
    })

    it('handles mixed single-node and multi-node trunks', () => {
      // One small tree, one single node
      const allNodes: LayoutNode[] = [
        { id: 'tree1_root', x: 0, y: 0, width: 40, height: 40 },
        { id: 'tree1_child', x: 0, y: 0, width: 40, height: 40 },
        { id: 'orphan', x: 0, y: 0, width: 40, height: 40 },
      ]
      const visibleNodes = allNodes

      const edges: HierarchyEdge[] = [
        { source: 'tree1_root', target: 'tree1_child', structural: true },
      ]

      const dims = mockDims(allNodes)
      const forest = buildStructuralForest(allNodes.map(n => n.id), edges)

      const result = radialTreeLayout(visibleNodes, edges, dims, forest)

      // All nodes should be positioned
      expect(result.positions.size).toBe(3)

      // Two trunk boundaries
      expect(result.trunkBoundaries.size).toBe(2)
    })
  })

  describe('collapsed nodes', () => {
    it('excludes descendants of collapsed nodes from placement', () => {
      const allNodes: LayoutNode[] = [
        { id: 'root', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child1', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child2', x: 0, y: 0, width: 40, height: 40 },
        { id: 'grand1', x: 0, y: 0, width: 40, height: 40 },
      ]
      // Only root, child1, child2 are visible; grand1 is hidden because child1 is collapsed
      const visibleNodes: LayoutNode[] = [
        { id: 'root', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child1', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child2', x: 0, y: 0, width: 40, height: 40 },
      ]

      const edges: HierarchyEdge[] = [
        { source: 'root', target: 'child1', structural: true },
        { source: 'root', target: 'child2', structural: true },
        { source: 'child1', target: 'grand1', structural: true },
      ]

      const dims = mockDims(allNodes)
      const forest = buildStructuralForest(allNodes.map(n => n.id), edges)

      const result = radialTreeLayout(visibleNodes, edges, dims, forest)

      // Grand1 should not be in positions (it's not visible)
      expect(result.positions.has('grand1')).toBe(false)

      // Other nodes should be positioned
      expect(result.positions.has('root')).toBe(true)
      expect(result.positions.has('child1')).toBe(true)
      expect(result.positions.has('child2')).toBe(true)
    })

    it('maintains stable trunk size for fully expanded tree', () => {
      const allNodes: LayoutNode[] = [
        { id: 'root', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child1', x: 0, y: 0, width: 40, height: 40 },
        { id: 'grand1', x: 0, y: 0, width: 40, height: 40 },
      ]

      const edges: HierarchyEdge[] = [
        { source: 'root', target: 'child1', structural: true },
        { source: 'child1', target: 'grand1', structural: true },
      ]

      const dims = mockDims(allNodes)
      const forest = buildStructuralForest(allNodes.map(n => n.id), edges)

      // First layout: all visible
      const visibleAll: LayoutNode[] = allNodes
      const resultExpanded = radialTreeLayout(visibleAll, edges, dims, forest)
      const expandedRadius = resultExpanded.trunkBoundaries.get('root')?.r ?? 0

      // Second layout: only root and child visible
      const visibleCollapsed: LayoutNode[] = allNodes.slice(0, 2)
      const resultCollapsed = radialTreeLayout(visibleCollapsed, edges, dims, forest)
      const collapsedRadius = resultCollapsed.trunkBoundaries.get('root')?.r ?? 0

      // Trunk radius should be the same (based on fully expanded size from forest)
      expect(Math.abs(expandedRadius - collapsedRadius)).toBeLessThan(1)
    })
  })

  describe('ring geometry', () => {
    it('produces ring geometry for occupied depth levels', () => {
      const allNodes: LayoutNode[] = [
        { id: 'root', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child1', x: 0, y: 0, width: 40, height: 40 },
        { id: 'grand1', x: 0, y: 0, width: 40, height: 40 },
      ]
      const visibleNodes = allNodes

      const edges: HierarchyEdge[] = [
        { source: 'root', target: 'child1', structural: true },
        { source: 'child1', target: 'grand1', structural: true },
      ]

      const dims = mockDims(allNodes)
      const forest = buildStructuralForest(allNodes.map(n => n.id), edges)

      const result = radialTreeLayout(visibleNodes, edges, dims, forest)

      // Should have ring geometry entries
      expect(result.ringGeometry.length).toBeGreaterThan(0)

      // Each ring should have cx, cy, r, depth, and trunkId
      for (const ring of result.ringGeometry) {
        expect(ring.trunkId).toBe('root')
        expect(typeof ring.cx).toBe('number')
        expect(typeof ring.cy).toBe('number')
        expect(typeof ring.r).toBe('number')
        expect(typeof ring.depth).toBe('number')
        expect(ring.r).toBeGreaterThan(0)
      }

      // Ring depths should correspond to tree depths (depth 0 is skipped as it's a zero-radius point)
      const depths = new Set(result.ringGeometry.map(r => r.depth))
      expect(depths.has(1)).toBe(true) // child at depth 1
      expect(depths.has(2)).toBe(true) // grandchild at depth 2
    })
  })

  describe('empty graphs', () => {
    it('returns empty result for empty node list', () => {
      const visibleNodes: LayoutNode[] = []
      const edges: HierarchyEdge[] = []
      const dims = new Map<string, { width: number; height: number }>()
      const forest = buildStructuralForest([], edges)

      const result = radialTreeLayout(visibleNodes, edges, dims, forest)

      expect(result.positions.size).toBe(0)
      expect(result.trunkBoundaries.size).toBe(0)
      expect(result.ringGeometry.length).toBe(0)
    })
  })

  describe('non-structural edges', () => {
    it('ignores non-structural edges', () => {
      const allNodes: LayoutNode[] = [
        { id: 'root', x: 0, y: 0, width: 40, height: 40 },
        { id: 'child', x: 0, y: 0, width: 40, height: 40 },
        { id: 'other', x: 0, y: 0, width: 40, height: 40 },
      ]
      const visibleNodes = allNodes

      const edges: HierarchyEdge[] = [
        { source: 'root', target: 'child', structural: true },
        { source: 'child', target: 'other', structural: false }, // non-structural relation
      ]

      const dims = mockDims(allNodes)
      const forest = buildStructuralForest(allNodes.map(n => n.id), edges)

      const result = radialTreeLayout(visibleNodes, edges, dims, forest)

      // 'other' should be its own trunk (orphan), not a child of 'child'
      expect(result.trunkBoundaries.size).toBe(2) // 'root' trunk and 'other' trunk
    })
  })

  // Default measured card size in GraphCanvas.
  const CARD = { width: 138, height: 30 }

  // A tree with `fanout` children per node down to `depth` levels below the root.
  const buildTree = (fanout: number, depth: number) => {
    const ids = ['n']
    const edges: HierarchyEdge[] = []
    let frontier = ['n']
    for (let d = 0; d < depth; d++) {
      const next: string[] = []
      for (const parent of frontier) {
        for (let i = 0; i < fanout; i++) {
          const id = `${parent}.${i}`
          ids.push(id)
          edges.push({ source: parent, target: id, structural: true })
          next.push(id)
        }
      }
      frontier = next
    }
    const nodes: LayoutNode[] = ids.map(id => ({ id, x: 0, y: 0, ...CARD }))
    return { ids, nodes, edges, dims: mockDims(nodes), forest: buildStructuralForest(ids, edges) }
  }

  const countOverlaps = (
    positions: Map<string, { x: number; y: number }>,
    size = CARD,
  ): number => {
    const boxes = [...positions.values()].map(p => ({ ...p, ...size }))
    let n = 0
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxesOverlap(boxes[i], boxes[j])) n++
      }
    }
    return n
  }

  // On-screen node height when the layout is fit into a 1280x800 viewport.
  const fitToViewNodeHeight = (positions: Map<string, { x: number; y: number }>): number => {
    const pts = [...positions.values()]
    const w = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x)) + CARD.width
    const h = Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y)) + CARD.height
    return CARD.height * Math.min(1, 1280 / w, 800 / h)
  }

  describe('ring sizing', () => {
    it('sizes rings from their own population, keeping a ~30-node tree legible at fit-to-view', () => {
      // Regression: maxRadius = nodeCount * ringSpacing made a 31-node tree ~5000px wide, so
      // fit-to-view rendered 30px nodes at under 5px.
      const { nodes, edges, dims, forest } = buildTree(5, 2) // 31 nodes
      const { positions } = radialTreeLayout(nodes, edges, dims, forest)

      expect(fitToViewNodeHeight(positions)).toBeGreaterThanOrEqual(12)
      expect(countOverlaps(positions)).toBe(0)
    })

    it('does not overlap nodes along a chain', () => {
      // Regression: ring spacing was maxRadius / maxDepth (~89px for a 10-node chain), narrower
      // than a 138px card, so every parent/child pair overlapped.
      const { nodes, edges, dims, forest } = buildTree(1, 9)
      const { positions } = radialTreeLayout(nodes, edges, dims, forest)

      expect(countOverlaps(positions)).toBe(0)
    })

    it('keeps adjacent rings at least ringSpacing apart beyond the node boxes', () => {
      const { nodes, edges, dims, forest } = buildTree(3, 3)
      const { ringGeometry } = radialTreeLayout(nodes, edges, dims, forest, { ringSpacing: 80 })
      const radii = ringGeometry.map(r => r.r).sort((a, b) => a - b)
      const diagonal = Math.hypot(CARD.width, CARD.height)

      expect(radii[0]).toBeGreaterThanOrEqual(diagonal + 80 - 1e-6)
      for (let i = 1; i < radii.length; i++) {
        expect(radii[i] - radii[i - 1]).toBeGreaterThanOrEqual(diagonal + 80 - 1e-6)
      }
    })

    it('keeps every node of a depth on one ring around the root', () => {
      const { ids, nodes, edges, dims, forest } = buildTree(4, 3)
      const { positions } = radialTreeLayout(nodes, edges, dims, forest)
      const root = positions.get('n')!
      const byDepth = new Map<number, number[]>()
      for (const id of ids) {
        const depth = id.split('.').length - 1
        const list = byDepth.get(depth) ?? []
        list.push(distance(root, positions.get(id)!))
        byDepth.set(depth, list)
      }
      for (const dists of byDepth.values()) {
        expect(Math.max(...dists) - Math.min(...dists)).toBeLessThan(1e-6)
      }
    })
  })

  describe('collapse stability', () => {
    it('does not move any visible node when a subtree is collapsed', () => {
      // Regression: the placement pass re-derived ring radii from the visible subset, so
      // collapsing one subtree moved nearly every other node.
      const { nodes, edges, dims, forest } = buildTree(3, 3)
      const expanded = radialTreeLayout(nodes, edges, dims, forest).positions

      const hidden = new Set(nodes.map(n => n.id).filter(id => id.startsWith('n.0.')))
      const visible = nodes.filter(n => !hidden.has(n.id))
      // Collapsed descendants are never measured, so they're missing from dims too.
      const visibleDims = new Map([...dims].filter(([id]) => !hidden.has(id)))
      const collapsed = radialTreeLayout(visible, edges, visibleDims, forest).positions

      expect(collapsed.size).toBe(visible.length)
      for (const node of visible) {
        expect(collapsed.get(node.id)).toEqual(expanded.get(node.id))
      }
    })

    it('sizes unmeasured (hidden) nodes like the largest measured node', () => {
      const { nodes, edges, dims, forest } = buildTree(3, 2)
      const full = radialTreeLayout(nodes, edges, dims, forest)

      // Only the root measured: the rest are sized from it, giving the same layout.
      const rootOnly = new Map([['n', dims.get('n')!]])
      const partial = radialTreeLayout(nodes, edges, rootOnly, forest)

      expect(partial.positions).toEqual(full.positions)
    })
  })

  describe('trunk boundaries', () => {
    it('does not overlap boundaries of packed trunks', () => {
      // Regression: boundaries were recomputed with each node's half-diagonal (~70px for a
      // 138x30 card) after packing with only 6px of slack, so neighbors' circles overlapped.
      const parts = [buildTree(2, 2), buildTree(1, 3), buildTree(3, 1), buildTree(1, 1)]
      const ids: string[] = []
      const edges: HierarchyEdge[] = []
      parts.forEach((p, i) => {
        ids.push(...p.ids.map(id => `t${i}:${id}`))
        edges.push(...p.edges.map(e => ({ ...e, source: `t${i}:${e.source}`, target: `t${i}:${e.target}` })))
      })
      for (let i = 0; i < 4; i++) ids.push(`solo${i}`)
      const nodes: LayoutNode[] = ids.map(id => ({ id, x: 0, y: 0, ...CARD }))
      const forest = buildStructuralForest(ids, edges)
      const { positions, trunkBoundaries } = radialTreeLayout(nodes, edges, mockDims(nodes), forest)

      expect(countOverlaps(positions)).toBe(0)
      const circles = [...trunkBoundaries.values()]
      expect(circles.length).toBe(8)
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const gap = distance(circles[i], circles[j]) - circles[i].r - circles[j].r
          expect(gap).toBeGreaterThan(-1e-6)
        }
      }
    })
  })
})
