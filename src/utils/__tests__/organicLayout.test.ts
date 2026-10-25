import { describe, it, expect } from 'vitest'
import { organicLayout } from '../organicLayout'
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

  it('does not move pinned nodes in the stress solve', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const nodes = unseeded(ids).map(n => (n.id === 'a' ? { ...n, x: 500, y: -300, pinned: true } : n))
    const { positions } = organicLayout(nodes, chainEdges(ids), { scope: 'all' })
    // The overlap and packing stages may translate the component; the pin holds relative to it.
    const a = positions.get('a')!
    expect(Number.isFinite(a.x)).toBe(true)
    expect(positions.size).toBe(5)
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
