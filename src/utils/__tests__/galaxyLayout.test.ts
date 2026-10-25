import { describe, expect, it } from 'vitest'
import {
  galaxyEffectiveWeights,
  galaxyBodyRadii,
  galaxyLayout,
  galaxyRadiusOf,
  GALAXY_BODY_MIN_RADIUS,
  GALAXY_BODY_MAX_RADIUS,
  type GalaxyLayoutEdge,
  type GalaxyLayoutNode,
} from '../galaxyLayout'

// root -> a (a1, a2, a3), b (b1), c
const childrenOf = new Map<string, string[]>([
  ['root', ['a', 'b', 'c']],
  ['a', ['a1', 'a2', 'a3']],
  ['b', ['b1']],
])
const ids = ['root', 'a', 'b', 'c', 'a1', 'a2', 'a3', 'b1']

describe('galaxyEffectiveWeights', () => {
  it('uses subtree leaf counts when no node has a weight', () => {
    const w = galaxyEffectiveWeights(ids, childrenOf, () => undefined)
    expect(w.get('root')).toBe(5)
    expect(w.get('a')).toBe(3)
    expect(w.get('b')).toBe(1)
    expect(w.get('c')).toBe(1)
  })

  it('sums children for an unweighted parent, and a given weight wins over the sum', () => {
    const given: Record<string, number> = { a1: 10, a2: 20, a3: 30, b: 999, b1: 1, c: 5 }
    const w = galaxyEffectiveWeights(ids, childrenOf, id => given[id])
    expect(w.get('a')).toBe(60)
    expect(w.get('b')).toBe(999)
    expect(w.get('root')).toBe(60 + 999 + 5)
  })

  it('treats NaN, negative and missing weights as missing (unweighted leaf = 0 once any weight is given)', () => {
    const given: Record<string, number> = { a1: Number.NaN, a2: -4, a3: 7 }
    const w = galaxyEffectiveWeights(ids, childrenOf, id => given[id])
    expect(w.get('a1')).toBe(0)
    expect(w.get('a2')).toBe(0)
    expect(w.get('a')).toBe(7)
    expect(w.get('c')).toBe(0)
  })
})

describe('galaxyBodyRadii', () => {
  it('maps the square root of weight to area between the min and max radius', () => {
    const r = galaxyBodyRadii(new Map([['lo', 0], ['quarter', 25], ['hi', 100]]))
    expect(r.get('lo')).toBeCloseTo(GALAXY_BODY_MIN_RADIUS)
    expect(r.get('hi')).toBeCloseTo(GALAXY_BODY_MAX_RADIUS)
    // sqrt(25) is halfway between sqrt(0) and sqrt(100), so its area is halfway too.
    const midArea = (GALAXY_BODY_MIN_RADIUS ** 2 + GALAXY_BODY_MAX_RADIUS ** 2) / 2
    expect(r.get('quarter')! ** 2).toBeCloseTo(midArea)
  })

  it('keeps small weights distinguishable across a wide range', () => {
    const r = galaxyBodyRadii(new Map([['root', 956129], ['a', 264], ['b', 4000]]))
    expect(r.get('b')! - r.get('a')!).toBeGreaterThan(1)
  })

  it('gives all-equal weights the middle area instead of dividing by zero', () => {
    const r = galaxyBodyRadii(new Map([['x', 3], ['y', 3]]))
    expect(Number.isFinite(r.get('x'))).toBe(true)
    expect(r.get('x')).toBe(r.get('y'))
  })
})

describe('galaxyRadiusOf', () => {
  it('prefers an explicit radius over the box half-diagonal', () => {
    expect(galaxyRadiusOf({ width: 20, height: 20, radius: 10 })).toBe(10)
    expect(galaxyRadiusOf({ width: 30, height: 40 })).toBe(25)
  })
})

describe('galaxyLayout ordering and shape', () => {
  const edges: GalaxyLayoutEdge[] = [...childrenOf].flatMap(([p, kids]) => kids.map(k => ({ source: p, target: k, structural: true })))
  const weights: Record<string, number> = { a1: 5, a2: 40, a3: 15, b1: 30, c: 80 }
  const w = galaxyEffectiveWeights(ids, childrenOf, id => weights[id])
  const radii = galaxyBodyRadii(w)
  const nodes: GalaxyLayoutNode[] = ids.map(id => ({ id, width: 2 * radii.get(id)!, height: 2 * radii.get(id)!, radius: radii.get(id), weight: w.get(id) }))

  it('places the heaviest satellite closest to the parent\'s outward heading', () => {
    const pos = galaxyLayout(nodes, edges)
    const angle = (from: string, to: string) => Math.atan2(pos.get(to)!.y - pos.get(from)!.y, pos.get(to)!.x - pos.get(from)!.x)
    const heading = angle('root', 'a')
    const off = (k: string) => Math.abs(Math.atan2(Math.sin(angle('a', k) - heading), Math.cos(angle('a', k) - heading)))
    // a's satellites: a2 (40) is heaviest, so it should sit nearest the root->a heading.
    expect(off('a2')).toBeLessThan(off('a1'))
    expect(off('a2')).toBeLessThan(off('a3'))
  })

  it('does not squash a single-root tree to fit a wide aspect ratio', () => {
    const natural = galaxyLayout(nodes, edges)
    const wide = galaxyLayout(nodes, edges, { aspectRatio: 3 })
    const extent = (p: Map<string, { x: number; y: number }>) => {
      const xs = [...p.values()].map(v => v.x), ys = [...p.values()].map(v => v.y)
      return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))
    }
    expect(extent(wide)).toBeCloseTo(extent(natural), 1)
  })
})
