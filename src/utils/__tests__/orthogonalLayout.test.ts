import { describe, it, expect } from 'vitest'
import { orthogonalLayout } from '../orthogonalLayout'
import type { LayoutNode, LayoutEdge } from '../graphLayout'
import type { Point } from '../graph'

const W = 138
const H = 30

const nodesOf = (ids: string[], w = W, h = H): LayoutNode[] => ids.map(id => ({ id, x: 0, y: 0, width: w, height: h }))
const chain = (ids: string[]): LayoutEdge[] => ids.slice(1).map((id, i) => ({ source: ids[i], target: id }))
function tree(): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const ids = ['root', 'a', 'b', 'c', 'a1', 'a2', 'b1', 'c1', 'c2', 'c3']
  const edges: LayoutEdge[] = [
    { source: 'root', target: 'a' }, { source: 'root', target: 'b' }, { source: 'root', target: 'c' },
    { source: 'a', target: 'a1' }, { source: 'a', target: 'a2' }, { source: 'b', target: 'b1' },
    { source: 'c', target: 'c1' }, { source: 'c', target: 'c2' }, { source: 'c', target: 'c3' },
    { source: 'a2', target: 'b1' }, // one cycle
  ]
  return { nodes: nodesOf(ids), edges }
}

const segs = (pl: Point[]) => pl.slice(1).map((p, i) => [pl[i], p] as [Point, Point])
const axisParallel = (pl: Point[]) => segs(pl).every(([a, b]) => Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5)
function boxOverlaps(nodes: LayoutNode[], pos: Map<string, Point>): number {
  let n = 0
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = pos.get(nodes[i].id)!, b = pos.get(nodes[j].id)!
    if (Math.abs(a.x - b.x) < (nodes[i].width + nodes[j].width) / 2 && Math.abs(a.y - b.y) < (nodes[i].height + nodes[j].height) / 2) n++
  }
  return n
}
/** Segments of one edge entering another node's box grown by `clearance` (grazing allowed). */
function throughNode(nodes: LayoutNode[], edges: LayoutEdge[], pos: Map<string, Point>, routes: Point[][], clearance: number): number {
  let n = 0
  routes.forEach((pl, i) => {
    for (const nd of nodes) {
      if (nd.id === edges[i].source || nd.id === edges[i].target) continue
      const p = pos.get(nd.id)!
      const hw = nd.width / 2 + clearance, hh = nd.height / 2 + clearance
      for (const [a, b] of segs(pl)) {
        const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y)
        if (minX < p.x + hw - 1e-9 && maxX > p.x - hw + 1e-9 && minY < p.y + hh - 1e-9 && maxY > p.y - hh + 1e-9) n++
      }
    }
  })
  return n
}
function sharedSegments(routes: Point[][]): number {
  const all: Array<{ e: number; v: boolean; at: number; lo: number; hi: number }> = []
  routes.forEach((pl, e) => { for (const [a, b] of segs(pl)) { const v = Math.abs(a.x - b.x) < 0.5; all.push({ e, v, at: v ? a.x : a.y, lo: Math.min(v ? a.y : a.x, v ? b.y : b.x), hi: Math.max(v ? a.y : a.x, v ? b.y : b.x) }) } })
  let n = 0
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const s = all[i], t = all[j]
    if (s.e === t.e || s.v !== t.v || Math.abs(s.at - t.at) > 0.5) continue
    if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 0.5) n++
  }
  return n
}

describe('orthogonalLayout', () => {
  it('returns one finite axis-parallel route per edge, index-aligned, boundary to boundary', () => {
    const { nodes, edges } = tree()
    const { positions, routes } = orthogonalLayout(nodes, edges)
    expect(routes).toHaveLength(edges.length)
    routes.forEach((pl, i) => {
      expect(pl.length).toBeGreaterThanOrEqual(2)
      for (const p of pl) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      expect(axisParallel(pl)).toBe(true)
      const s = positions.get(edges[i].source)!, t = positions.get(edges[i].target)!
      const onBoundary = (p: Point, c: Point) => Math.abs(Math.abs(p.x - c.x) - W / 2) < 1e-6 || Math.abs(Math.abs(p.y - c.y) - H / 2) < 1e-6
      expect(onBoundary(pl[0], s)).toBe(true)
      expect(onBoundary(pl[pl.length - 1], t)).toBe(true)
    })
  })

  it('places every node on the reported cell grid with no overlaps', () => {
    const { nodes, edges } = tree()
    const { positions, cell, origin } = orthogonalLayout(nodes, edges)
    for (const p of positions.values()) {
      expect(Math.abs((p.x - origin.x) / cell.w - Math.round((p.x - origin.x) / cell.w))).toBeLessThan(1e-9)
      expect(Math.abs((p.y - origin.y) / cell.h - Math.round((p.y - origin.y) / cell.h))).toBeLessThan(1e-9)
    }
    expect(boxOverlaps(nodes, positions)).toBe(0)
  })

  it('never routes an edge through another node or over another edge', () => {
    const { nodes, edges } = tree()
    const { positions, routes, stats } = orthogonalLayout(nodes, edges)
    expect(stats.fallbackRoutes).toBe(0)
    expect(throughNode(nodes, edges, positions, routes, 10)).toBe(0)
    expect(sharedSegments(routes)).toBe(0)
  })

  it('is deterministic: identical input gives identical positions and routes', () => {
    const { nodes, edges } = tree()
    const a = orthogonalLayout(nodes, edges), b = orthogonalLayout(nodes, edges)
    expect([...a.positions]).toEqual([...b.positions])
    expect(a.routes).toEqual(b.routes)
  })

  it('keeps bidirectional pairs on separate ports and segments', () => {
    const nodes = nodesOf(['p', 'q', 'r'])
    const edges: LayoutEdge[] = [{ source: 'p', target: 'q' }, { source: 'q', target: 'p' }, { source: 'q', target: 'r' }]
    const { routes, stats } = orthogonalLayout(nodes, edges)
    expect(stats.fallbackRoutes).toBe(0)
    expect(sharedSegments(routes)).toBe(0)
    expect(routes[0][0]).not.toEqual(routes[1][routes[1].length - 1])
  })

  it('lays out components side by side and isolates in a block, all on the grid', () => {
    const ids = ['a', 'b', 'c', 'x', 'y', 'i1', 'i2', 'i3', 'i4', 'i5']
    const edges = [...chain(['a', 'b', 'c']), ...chain(['x', 'y'])]
    const { positions, stats, cell } = orthogonalLayout(nodesOf(ids), edges)
    expect(stats.components).toBe(3)
    expect(boxOverlaps(nodesOf(ids), positions)).toBe(0)
    const cols = new Set([...positions.values()].map(p => Math.round(p.x / cell.w)))
    expect(cols.size).toBeLessThan(ids.length) // isolates wrapped, not one endless row
  })

  it('handles self-loops, duplicates and unknown endpoints without throwing', () => {
    const nodes = nodesOf(['a', 'b'])
    const edges: LayoutEdge[] = [{ source: 'a', target: 'a' }, { source: 'a', target: 'b' }, { source: 'a', target: 'b' }, { source: 'b', target: 'ghost' }]
    const { routes, stats } = orthogonalLayout(nodes, edges)
    expect(routes).toHaveLength(4)
    expect(stats.droppedEdges).toBe(2)
    for (const pl of routes) { expect(pl.length).toBeGreaterThanOrEqual(2); for (const p of pl) expect(Number.isFinite(p.x)).toBe(true) }
  })

  it('sizes cells from the largest node and honors mixed node sizes', () => {
    const nodes: LayoutNode[] = [
      { id: 'big', x: 0, y: 0, width: 220, height: 60 },
      { id: 's1', x: 0, y: 0, width: 80, height: 24 },
      { id: 's2', x: 0, y: 0, width: 80, height: 24 },
    ]
    const edges = chain(['big', 's1', 's2'])
    const { positions, routes, cell } = orthogonalLayout(nodes, edges)
    expect(cell.w).toBeGreaterThan(220)
    expect(cell.h).toBeGreaterThan(60)
    expect(boxOverlaps(nodes, positions)).toBe(0)
    expect(throughNode(nodes, edges, positions, routes, 10)).toBe(0)
  })

  it('handles the empty graph and a single node', () => {
    expect(orthogonalLayout([], []).routes).toEqual([])
    const one = orthogonalLayout(nodesOf(['solo']), [])
    expect(one.positions.get('solo')).toEqual({ x: 0, y: 0 })
  })
})
