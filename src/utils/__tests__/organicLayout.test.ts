import { describe, it, expect } from 'vitest'
import { organicLayout, type OrganicLayoutEdge } from '../organicLayout'
import type { LayoutNode, LayoutEdge } from '../graphLayout'

const W = 138
const H = 30
const GAP = 24

function circleSeed(ids: string[]): LayoutNode[] {
  return ids.map((id, i) => ({
    id,
    x: Math.cos((2 * Math.PI * i) / ids.length) * 120,
    y: Math.sin((2 * Math.PI * i) / ids.length) * 120,
    width: W,
    height: H,
  }))
}
function unseeded(ids: string[]): LayoutNode[] {
  return ids.map(id => ({ id, x: NaN, y: NaN, width: W, height: H }))
}
function chainEdges(ids: string[]): LayoutEdge[] {
  return ids.slice(1).map((id, i) => ({ source: ids[i], target: id }))
}
function star(leaves: number): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const ids = ['hub', ...Array.from({ length: leaves }, (_, i) => `leaf_${i}`)]
  return { nodes: circleSeed(ids), edges: ids.slice(1).map(id => ({ source: 'hub', target: id })) }
}
/** A small two-community graph with a bridge, deterministic. */
function communities(): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const a = ['a0', 'a1', 'a2', 'a3', 'a4']
  const b = ['b0', 'b1', 'b2', 'b3', 'b4']
  const edges: LayoutEdge[] = []
  for (const g of [a, b]) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if ((i + j) % 2 === 0) edges.push({ source: g[i], target: g[j] })
  edges.push({ source: 'a0', target: 'b0' })
  return { nodes: circleSeed([...a, ...b]), edges }
}

function minGap(nodes: LayoutNode[], positions: Map<string, { x: number; y: number }>): number {
  let min = Infinity
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = positions.get(nodes[i].id)!, b = positions.get(nodes[j].id)!
    const gx = Math.abs(a.x - b.x) - (nodes[i].width + nodes[j].width) / 2
    const gy = Math.abs(a.y - b.y) - (nodes[i].height + nodes[j].height) / 2
    const gap = gx > 0 || gy > 0 ? Math.hypot(Math.max(0, gx), Math.max(0, gy)) : Math.max(gx, gy)
    min = Math.min(min, gap)
  }
  return min
}
function maxDisplacement(a: Map<string, { x: number; y: number }>, b: Map<string, { x: number; y: number }>): number {
  let max = 0
  for (const [id, p] of a) { const q = b.get(id)!; max = Math.max(max, Math.hypot(p.x - q.x, p.y - q.y)) }
  return max
}

describe('organicLayout', () => {
  it('is deterministic: identical input gives identical output', () => {
    const { nodes, edges } = communities()
    const a = organicLayout(nodes, edges)
    const b = organicLayout(nodes, edges)
    expect(maxDisplacement(a.positions, b.positions)).toBe(0)
    expect(a.stressHistory).toEqual(b.stressHistory)
  })

  it('never overlaps nodes and honors minimumNodeDistance as a post-condition', () => {
    const { nodes, edges } = communities()
    const { positions, stats } = organicLayout(nodes, edges, { minimumNodeDistance: GAP })
    expect(stats.warmStart).toBe(false)
    expect(minGap(nodes, positions)).toBeGreaterThanOrEqual(GAP)
    for (const p of positions.values()) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true) }
  })

  it('treats a circle seed as a cold start, not a sketch', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `n${i}`)
    const nodes = circleSeed(ids)
    const { stats } = organicLayout(nodes, chainEdges(ids))
    expect(stats.warmStart).toBe(false)
    expect(stats.solvedNodes).toBe(12)
  })

  it('re-running on its own output moves nothing (warm-start idempotence)', () => {
    const { nodes, edges } = communities()
    const first = organicLayout(nodes, edges)
    const warmNodes = nodes.map(n => ({ ...n, ...first.positions.get(n.id)! }))
    const second = organicLayout(warmNodes, edges)
    expect(second.stats.warmStart).toBe(true)
    expect(maxDisplacement(first.positions, second.positions)).toBeLessThan(1)
  })

  it('places new nodes into a sketch without disturbing the rest', () => {
    const { nodes, edges } = communities()
    const first = organicLayout(nodes, edges)
    const warmNodes: LayoutNode[] = [
      ...nodes.map(n => ({ ...n, ...first.positions.get(n.id)! })),
      { id: 'new', x: NaN, y: NaN, width: W, height: H },
    ]
    const second = organicLayout(warmNodes, [...edges, { source: 'a1', target: 'new' }])
    expect(second.stats.warmStart).toBe(true)
    expect(minGap(warmNodes, second.positions)).toBeGreaterThanOrEqual(GAP)
    // Only the new node and its neighbors (a1 and a1's neighbors) were allowed to move.
    const moved = nodes.filter(n => Math.hypot(first.positions.get(n.id)!.x - second.positions.get(n.id)!.x, first.positions.get(n.id)!.y - second.positions.get(n.id)!.y) > 0.5)
    const allowed = new Set(['a1', 'a0', 'a2', 'a3', 'a4', 'b0'])
    for (const n of moved) expect(allowed.has(n.id)).toBe(true)
  })

  it('stress never increases between majorization sweeps', () => {
    const { nodes, edges } = communities()
    const { stressHistory } = organicLayout(nodes, edges)
    expect(stressHistory.length).toBeGreaterThan(2)
    for (let i = 1; i < stressHistory.length; i++) expect(stressHistory[i]).toBeLessThanOrEqual(stressHistory[i - 1] * (1 + 1e-9))
  })

  it('keeps hub graphs finite and compact where the force layout diverged', () => {
    for (const leaves of [150, 200, 400]) {
      const { nodes, edges } = star(leaves)
      const { positions } = organicLayout(nodes, edges)
      let maxR = 0
      for (const p of positions.values()) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
        maxR = Math.max(maxR, Math.hypot(p.x, p.y))
      }
      expect(maxR).toBeLessThan(50 * 160)
      expect(minGap(nodes, positions)).toBeGreaterThanOrEqual(GAP)
    }
  })

  it('packs disconnected components and isolates without overlap', () => {
    const ids = ['p0', 'p1', 'p2', 'q0', 'q1', 'q2', 'q3', 'iso1', 'iso2']
    const edges = [...chainEdges(['p0', 'p1', 'p2']), ...chainEdges(['q0', 'q1', 'q2', 'q3'])]
    const { positions, stats } = organicLayout(unseeded(ids), edges)
    expect(stats.components).toBe(4)
    expect(minGap(unseeded(ids), positions)).toBeGreaterThanOrEqual(GAP)
  })

  it('keeps a pinned node exactly where it was pinned on a cold start', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const nodes = unseeded(ids).map(n => (n.id === 'a' ? { ...n, x: 500, y: -300, pinned: true } : n))
    for (const scope of ['auto', 'all'] as const) {
      const { positions, stats } = organicLayout(nodes, chainEdges(ids), { scope })
      expect(stats.warmStart).toBe(false)
      expect(positions.get('a')).toEqual({ x: 500, y: -300 })
      expect(minGap(nodes, positions)).toBeGreaterThanOrEqual(GAP)
    }
  })

  it('anchors a component onto two pins and keeps the other components clear of it', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'p0', 'p1', 'p2', 'iso']
    const nodes = unseeded(ids).map(n =>
      n.id === 'a' ? { ...n, x: 0, y: 0, pinned: true } : n.id === 'e' ? { ...n, x: 400, y: 0, pinned: true } : n,
    )
    const edges = [...chainEdges(['a', 'b', 'c', 'd', 'e']), ...chainEdges(['p0', 'p1', 'p2'])]
    const { positions } = organicLayout(nodes, edges)
    expect(positions.get('a')).toEqual({ x: 0, y: 0 })
    // The second pin is held unless it conflicts with the no-overlap post-condition (it does not here).
    const e = positions.get('e')!
    expect(Math.hypot(e.x - 400, e.y)).toBeLessThan(1e-6)
    expect(minGap(nodes, positions)).toBeGreaterThanOrEqual(GAP)
  })

  it('re-solves a sketch in full with scope "all", including a new node, and stays finite and valid', () => {
    const ids = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']
    const first = organicLayout(unseeded(ids), chainEdges(ids))
    const warmNodes: LayoutNode[] = [
      ...unseeded(ids).map(n => ({ ...n, ...first.positions.get(n.id)! })),
      { id: 'new', x: NaN, y: NaN, width: W, height: H },
    ]
    const second = organicLayout(warmNodes, [...chainEdges(ids), { source: 's3', target: 'new' }], { scope: 'all', minimumNodeDistance: GAP })
    for (const p of second.positions.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    expect(minGap(warmNodes, second.positions)).toBeGreaterThanOrEqual(GAP)
  })

  it('keeps the post-conditions when a sketch is re-solved in full on its own output', () => {
    const { nodes, edges } = communities()
    const first = organicLayout(nodes, edges, { minimumNodeDistance: GAP })
    const warmNodes = nodes.map(n => ({ ...n, ...first.positions.get(n.id)! }))
    const second = organicLayout(warmNodes, edges, { scope: 'all', minimumNodeDistance: GAP })
    expect(second.stats.warmStart).toBe(true)
    expect(minGap(warmNodes, second.positions)).toBeGreaterThanOrEqual(GAP)
    // Aligned onto the input, so the re-solve reads as the same picture, not a rotated one.
    expect(maxDisplacement(first.positions, second.positions)).toBeLessThan(160)
  })

  it('places several new isolates into a sketch without producing NaN', () => {
    const ids = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']
    const first = organicLayout(unseeded(ids), chainEdges(ids))
    const warmNodes: LayoutNode[] = [
      ...unseeded(ids).map(n => ({ ...n, ...first.positions.get(n.id)! })),
      { id: 'iso1', x: NaN, y: NaN, width: W, height: H },
      { id: 'iso2', x: NaN, y: NaN, width: W, height: H },
    ]
    const second = organicLayout(warmNodes, chainEdges(ids))
    expect(second.stats.warmStart).toBe(true)
    for (const p of second.positions.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    expect(minGap(warmNodes, second.positions)).toBeGreaterThanOrEqual(GAP)
  })

  it('re-settles the nodes named in affectedIds and their neighbors on a valid sketch', () => {
    const { nodes, edges } = communities()
    const first = organicLayout(nodes, edges)
    const warmNodes = nodes.map(n => ({ ...n, ...first.positions.get(n.id)! }))
    const untouched = organicLayout(warmNodes, edges)
    expect(untouched.stats.solvedNodes).toBe(0)
    const nudged = organicLayout(warmNodes, edges, { affectedIds: ['b2'] })
    expect(nudged.stats.solvedNodes).toBeGreaterThan(0)
    expect(minGap(warmNodes, nudged.positions)).toBeGreaterThanOrEqual(GAP)
  })

  it('treats a tiny circle seed that already honors the post-conditions as a sketch (documented)', () => {
    // n <= 4 on a radius-120 circle with 138x30 cards is overlap-free, so the rule keeps it.
    // GraphCanvas never sends a seed (it sends NaN), so this only affects callers who seed by hand.
    const ids = ['a', 'b', 'c']
    const { stats } = organicLayout(circleSeed(ids), chainEdges(ids))
    expect(stats.warmStart).toBe(true)
    expect(stats.solvedNodes).toBe(0)
  })

  it('uses PivotMDS above 600 nodes and seeds at the ideal scale', () => {
    const side = 27 // 729-node grid
    const ids: string[] = []
    const edges: LayoutEdge[] = []
    for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) {
      const id = `g${r}_${c}`
      ids.push(id)
      if (c > 0) edges.push({ source: `g${r}_${c - 1}`, target: id })
      if (r > 0) edges.push({ source: `g${r - 1}_${c}`, target: id })
    }
    const nodes = ids.map(id => ({ id, x: NaN, y: NaN, width: 20, height: 20 }))
    const { positions, stressHistory, stats } = organicLayout(nodes, edges, { maxIterations: 5 })
    expect(stats.warmStart).toBe(false)
    let maxR = 0
    for (const p of positions.values()) maxR = Math.max(maxR, Math.hypot(p.x, p.y))
    // Ideal extent is about side × 160 px across; a seed in singular-value units was 1e8.
    expect(maxR).toBeLessThan(side * 160 * 4)
    expect(stressHistory[0]).toBeLessThan(1e9)
  })

  it('shelf-packs components into a block near the view aspect and grids the isolates beneath them', () => {
    // Five 24-node chains-with-branches plus six isolates: circle packing spread these into a
    // near-square disc with wide gaps; the block should be wider than tall and the isolates rows.
    const ids: string[] = []
    const edges: LayoutEdge[] = []
    for (let c = 0; c < 5; c++) {
      const members = Array.from({ length: 24 }, (_, i) => `c${c}_${i}`)
      ids.push(...members)
      edges.push(...chainEdges(members.slice(0, 12)))
      for (let i = 12; i < 24; i++) edges.push({ source: members[i % 12], target: members[i] })
    }
    const isolates = Array.from({ length: 6 }, (_, i) => `iso${i}`)
    ids.push(...isolates)
    const nodes = unseeded(ids)
    const { positions, stats } = organicLayout(nodes, edges)
    expect(stats.components).toBe(11)
    expect(minGap(nodes, positions)).toBeGreaterThanOrEqual(GAP)
    const xs = [...positions.values()].map(p => p.x), ys = [...positions.values()].map(p => p.y)
    const w = Math.max(...xs) - Math.min(...xs) + W, h = Math.max(...ys) - Math.min(...ys) + H
    expect(w / h).toBeGreaterThan(1.2)
    expect(w / h).toBeLessThan(2.4)
    // Isolates: one row (or more) at the bottom, below every connected node, on a shared y.
    const isoY = isolates.map(id => positions.get(id)!.y)
    const connectedMaxY = Math.max(...ids.filter(id => !id.startsWith('iso')).map(id => positions.get(id)!.y))
    expect(Math.min(...isoY)).toBeGreaterThan(connectedMaxY)
    expect(new Set(isoY.map(y => Math.round(y))).size).toBeLessThanOrEqual(2)
  })

  it('lays a star far past its ring capacity out as a halo of the view aspect', () => {
    const { nodes, edges } = star(400)
    const { positions, stats } = organicLayout(nodes, edges)
    expect(stats.scaledUp).toBe(0)
    const xs = [...positions.values()].map(p => p.x), ys = [...positions.values()].map(p => p.y)
    const w = Math.max(...xs) - Math.min(...xs) + W, h = Math.max(...ys) - Math.min(...ys) + H
    // 400 cards of 162x54 cells cover about 3.5e6 px^2; a 1.6:1 ellipse of that area is 2670x1670.
    expect(w).toBeLessThan(3000)
    expect(h).toBeLessThan(1900)
    expect(w / h).toBeGreaterThan(1.4)
    const hub = positions.get('hub')!
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2
    expect(Math.hypot(hub.x - cx, hub.y - cy)).toBeLessThan(200)
    expect(minGap(nodes, positions)).toBeGreaterThanOrEqual(GAP)
  })

  describe('edge hints', () => {
    const labelBox = (l: { width: number; height: number; offset?: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1
      const off = l.offset ?? 0
      return { x: (a.x + b.x) / 2 - (dy / d) * off, y: (a.y + b.y) / 2 + (dx / d) * off, w: l.width, h: l.height }
    }
    const boxesTouch = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }) =>
      Math.abs(p.x - q.x) < (p.w + q.w) / 2 && Math.abs(p.y - q.y) < (p.h + q.h) / 2

    it('floors adjacent ideal distances at an edge\'s preferred length', () => {
      const ids = ['a', 'b', 'c']
      const short = organicLayout(unseeded(ids), chainEdges(ids))
      const long = organicLayout(unseeded(ids), [{ source: 'a', target: 'b', length: 600 }, { source: 'b', target: 'c' }])
      const dist = (r: { positions: Map<string, { x: number; y: number }> }, u: string, v: string) => {
        const p = r.positions.get(u)!, q = r.positions.get(v)!
        return Math.hypot(p.x - q.x, p.y - q.y)
      }
      // A floor on the ideal distance, not a post-condition: the solve still trades it off against
      // the other pairs (c wants 2 hops = 320 px from a, less than 600 - 165).
      expect(dist(long, 'a', 'b')).toBeGreaterThan(dist(short, 'a', 'b') + 300)
      expect(dist(long, 'a', 'b')).toBeGreaterThan(450)
    })

    it('keeps a labelled hub\'s labels clear of both endpoints and of each other', () => {
      // 12 labelled spokes with wide labels: at the default ring they pile on the hub and each other.
      const ids = ['hub', ...Array.from({ length: 12 }, (_, i) => `n${i}`)]
      const label = { width: 165, height: 30, offset: 18 }
      const edges: OrganicLayoutEdge[] = ids.slice(1).map(id => ({ source: 'hub', target: id, length: 220, label }))
      const nodes = unseeded(ids)
      const { positions, stats } = organicLayout(nodes, edges)
      expect(stats.scaledUp).toBe(0)
      expect(minGap(nodes, positions)).toBeGreaterThanOrEqual(GAP)
      const boxes = edges.map(e => labelBox(label, positions.get(e.source)!, positions.get(e.target)!))
      edges.forEach((e, i) => {
        for (const end of [e.source, e.target]) {
          const p = positions.get(end)!
          expect(boxesTouch(boxes[i], { x: p.x, y: p.y, w: W, h: H })).toBe(false)
        }
        for (let j = i + 1; j < edges.length; j++) expect(boxesTouch(boxes[i], boxes[j])).toBe(false)
      })
    })

    it('re-running a labelled layout on its own output moves nothing', () => {
      const ids = ['hub', ...Array.from({ length: 8 }, (_, i) => `n${i}`), 'far']
      const label = { width: 120, height: 30, offset: 20 }
      const edges: OrganicLayoutEdge[] = [...ids.slice(1, 9).map(id => ({ source: 'hub', target: id, label })), { source: 'n0', target: 'far', label }]
      const first = organicLayout(unseeded(ids), edges)
      const warm = ids.map(id => ({ id, ...first.positions.get(id)!, width: W, height: H }))
      const second = organicLayout(warm, edges)
      expect(second.stats.warmStart).toBe(true)
      expect(maxDisplacement(first.positions, second.positions)).toBeLessThan(1e-9)
    })

    it('stays finite when a labelled sketch is re-solved in full with a new node', () => {
      const ids = ['hub', ...Array.from({ length: 10 }, (_, i) => `n${i}`)]
      const label = { width: 150, height: 30, offset: 25 }
      const edges: OrganicLayoutEdge[] = ids.slice(1).map((id, i) => ({ source: i % 2 ? 'hub' : id, target: i % 2 ? id : 'hub', label }))
      const first = organicLayout(unseeded(ids), edges)
      const warm = [...ids.map(id => ({ id, ...first.positions.get(id)!, width: W, height: H })), { id: 'new', x: NaN, y: NaN, width: W, height: H }]
      const { positions } = organicLayout(warm, [...edges, { source: 'hub', target: 'new', label }], { scope: 'all' })
      for (const p of positions.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      const all = [...ids, 'new'].map(id => ({ id, x: 0, y: 0, width: W, height: H }))
      expect(minGap(all, positions)).toBeGreaterThanOrEqual(GAP)
    })
  })

  it('ignores self-loops, duplicate edges and edges to unknown nodes', () => {
    const ids = ['x', 'y', 'z']
    const edges: LayoutEdge[] = [
      { source: 'x', target: 'y' }, { source: 'y', target: 'x' }, { source: 'x', target: 'x' },
      { source: 'y', target: 'z' }, { source: 'z', target: 'ghost' },
    ]
    const { positions, stats } = organicLayout(unseeded(ids), edges)
    expect(stats.components).toBe(1)
    expect(positions.size).toBe(3)
    expect(minGap(unseeded(ids), positions)).toBeGreaterThanOrEqual(GAP)
  })
})
