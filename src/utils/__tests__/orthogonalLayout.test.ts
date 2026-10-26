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

  it('layers by the structural forest when edges are flagged, with relational edges never moving a node up', () => {
    const ids = ['root', 'a', 'b', 'a1', 'b1']
    const edges = [
      { source: 'root', target: 'a', structural: true }, { source: 'root', target: 'b', structural: true },
      { source: 'a', target: 'a1', structural: true }, { source: 'b', target: 'b1', structural: true },
      { source: 'a1', target: 'root' }, // relational back-edge
    ]
    const { positions, cell } = orthogonalLayout(nodesOf(ids), edges)
    const rowOf = (id: string) => Math.round(positions.get(id)!.y / cell.h)
    expect(rowOf('root')).toBe(0)
    expect(rowOf('a')).toBe(1); expect(rowOf('b')).toBe(1)
    expect(rowOf('a1')).toBe(2); expect(rowOf('b1')).toBe(2)
  })

  it('fans a page\'s views to its right in the same row (ux-navigation shape)', () => {
    const ids = ['home', 'settings', 'v_table', 'v_chart', 'v_form']
    const edges = [
      { source: 'home', target: 'settings', structural: true },
      { source: 'home', target: 'v_table', structural: true }, { source: 'home', target: 'v_chart', structural: true },
      { source: 'settings', target: 'v_form', structural: true },
    ]
    const { positions, cell, routes, stats } = orthogonalLayout(nodesOf(ids), edges, { isPageNode: id => !id.startsWith('v_') })
    const cellOf = (id: string) => ({ c: Math.round(positions.get(id)!.x / cell.w), r: Math.round(positions.get(id)!.y / cell.h) })
    expect(cellOf('v_table')).toEqual({ c: cellOf('home').c + 1, r: cellOf('home').r })
    expect(cellOf('v_chart')).toEqual({ c: cellOf('home').c + 2, r: cellOf('home').r })
    expect(cellOf('v_form')).toEqual({ c: cellOf('settings').c + 1, r: cellOf('settings').r })
    expect(cellOf('settings').r).toBe(cellOf('home').r + 1)
    expect(stats.fallbackRoutes).toBe(0)
    expect(sharedSegments(routes)).toBe(0)
    expect(boxOverlaps(nodesOf(ids), positions)).toBe(0)
  })

  it('routes navigation routes last and keeps them clear of nodes and other routes', () => {
    const { nodes, edges } = tree()
    const withNav = [...edges, { source: 'a1', target: 'c3', navigationRoute: true }, { source: 'c1', target: 'root', navigationRoute: true }]
    const { positions, routes, stats } = orthogonalLayout(nodes, withNav)
    expect(stats.fallbackRoutes).toBe(0)
    expect(throughNode(nodes, withNav, positions, routes, 10)).toBe(0)
    expect(sharedSegments(routes)).toBe(0)
  })

  it('holds a pinned node exactly on its pin and keeps every anchor on the grid', () => {
    const ids = ['p', 'q', 'r', 's']
    const nodes = nodesOf(ids).map(n => (n.id === 'q' ? { ...n, x: 505, y: -301, pinned: true } : { ...n, x: NaN, y: NaN }))
    const { positions, cell, origin, stats } = orthogonalLayout(nodes, chain(ids))
    expect(stats.pinnedNodes).toBe(1)
    expect(positions.get('q')).toEqual({ x: 505, y: -301 })
    for (const p of positions.values()) {
      expect(Math.abs((p.x - origin.x) / cell.w - Math.round((p.x - origin.x) / cell.w))).toBeLessThan(1e-9)
      expect(Math.abs((p.y - origin.y) / cell.h - Math.round((p.y - origin.y) / cell.h))).toBeLessThan(1e-9)
    }
    expect(boxOverlaps(nodes, positions)).toBe(0)
  })

  it('keeps every cell when re-run on its own output, and places a new node near its neighbors', () => {
    const { nodes, edges } = tree()
    const first = orthogonalLayout(nodes.map(n => ({ ...n, x: NaN, y: NaN })), edges)
    expect(first.stats.sketch).toBe(false)
    const sketchNodes = nodes.map(n => ({ ...n, ...first.positions.get(n.id)! }))
    const second = orthogonalLayout(sketchNodes, edges)
    expect(second.stats.sketch).toBe(true)
    for (const [id, p] of first.positions) expect(second.positions.get(id)).toEqual(p)
    const grown = [...sketchNodes, { id: 'new', x: NaN, y: NaN, width: W, height: H }]
    const third = orthogonalLayout(grown, [...edges, { source: 'c2', target: 'new' }])
    expect(third.stats.sketch).toBe(true)
    for (const [id, p] of first.positions) expect(third.positions.get(id)).toEqual(p)
    const c2 = third.positions.get('c2')!, nw = third.positions.get('new')!
    expect(Math.abs(nw.x - c2.x) + Math.abs(nw.y - c2.y)).toBeLessThanOrEqual(2 * Math.max(third.cell.w, third.cell.h))
    expect(boxOverlaps(grown, third.positions)).toBe(0)
  })

  it('shares one trunk per parent with busTreeEdges and reports the groups', () => {
    const ids = ['p', 'c1', 'c2', 'c3', 'c4']
    const edges = ['c1', 'c2', 'c3', 'c4'].map(c => ({ source: 'p', target: c, structural: true }))
    const off = orthogonalLayout(nodesOf(ids), edges)
    const on = orthogonalLayout(nodesOf(ids), edges, { busTreeEdges: true })
    expect(off.groups.every(g => g === undefined)).toBe(true)
    expect(on.stats.busEdges).toBe(4)
    expect(new Set(on.groups).size).toBe(1)
    expect(sharedSegments(off.routes)).toBe(0)
    // Only members of one group may share; here every edge is in the group, so sharing is allowed.
    expect(sharedSegments(on.routes)).toBeGreaterThan(0)
    expect(throughNode(nodesOf(ids), edges, on.positions, on.routes, 10)).toBe(0)
  })

  it('handles the empty graph and a single node', () => {
    expect(orthogonalLayout([], []).routes).toEqual([])
    const one = orthogonalLayout(nodesOf(['solo']), [])
    expect(one.positions.get('solo')).toEqual({ x: 0, y: 0 })
  })
})
