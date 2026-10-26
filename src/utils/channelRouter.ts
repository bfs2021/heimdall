import type { Point, EdgeEndpointRect } from './graph'

export interface RoutedEdge {
  d: string
  mid: Point
  angle: number
  points: Point[]
  /** Marks this as an orthogonal polyline (not a bezier curve). Used to distinguish from
   *  BezierPathResult when sampling label positions — polylines use linear interpolation,
   *  while beziers use curve functions. */
  isPolyline: true
}

/** Default spacing (px) between parallel segments when nudging overlapping edges apart */
export const DEFAULT_TRACE_SPACING = 16

/**
 * Router contract version, read by callers that need to know how to build the obstacle set:
 *   1 — the caller removed every route endpoint from `obstacles` itself.
 *   2 — the caller passes every node rect; the router drops each route's own two endpoints
 *       (and only those) when routing that route. GraphCanvas passes all node rects.
 */
export const ROUTER_CONTRACT_VERSION = 2

/** Clearance kept between a route and any node box it detours around. */
const OBSTACLE_PADDING = 20

/** A port is kept at least this far from its node's corner when nudged along the side. */
const PORT_CORNER_MARGIN = 2

export function routeNavigationEdge(
  source: EdgeEndpointRect,
  target: EdgeEndpointRect,
  obstacles: readonly EdgeEndpointRect[] = []
): RoutedEdge {
  const points = buildOrthogonalPath(source, target, withoutEndpoints(obstacles, source, target))
  return finishRoute(points)
}

/**
 * Routes multiple navigation edges at once with obstacle avoidance: each route is built
 * against the node boxes (never against other routes), then collinear overlapping segments of
 * different routes are nudged apart by `traceSpacing` without moving a port off its node side.
 */
export function routeNavigationEdges(
  edges: Array<{ id: string; source: EdgeEndpointRect; target: EdgeEndpointRect }>,
  allObstacles: readonly EdgeEndpointRect[] = [],
  traceSpacing: number = DEFAULT_TRACE_SPACING
): Map<string, RoutedEdge> {
  const routes = new Map<string, RoutedEdge>()
  const endpoints = new Map<string, { source: EdgeEndpointRect; target: EdgeEndpointRect }>()

  for (const edge of edges) {
    const points = buildOrthogonalPath(edge.source, edge.target, withoutEndpoints(allObstacles, edge.source, edge.target))
    routes.set(edge.id, finishRoute(points))
    endpoints.set(edge.id, { source: edge.source, target: edge.target })
  }

  nudgeOverlappingSegments(routes, endpoints, allObstacles, traceSpacing)

  return routes
}

function finishRoute(points: Point[]): RoutedEdge {
  const route = { d: '', mid: points[0], angle: 0, points, isPolyline: true as const }
  updateRouteMetadata(route)
  return route
}

function sameRect(a: EdgeEndpointRect, b: EdgeEndpointRect): boolean {
  return a === b || (a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)
}

/** The obstacle set for one route: every box except the route's own two endpoints. */
function withoutEndpoints(
  obstacles: readonly EdgeEndpointRect[],
  source: EdgeEndpointRect,
  target: EdgeEndpointRect
): EdgeEndpointRect[] {
  return obstacles.filter(o => !sameRect(o, source) && !sameRect(o, target))
}

// ─── nudging ────────────────────────────────────────────────────────────────

interface SegmentRef {
  id: string
  segmentIndex: number
  lo: number
  hi: number
}

/**
 * Post-processes routed edges to spread overlapping collinear segments by applying perpendicular
 * offsets, so parallel segments from different routes stay visually distinct. Overlapping
 * segments on one line form a cluster that is fanned out symmetrically around the line,
 * `traceSpacing` apart, in one assignment — the earlier pairwise nudge accumulated ±8 px per
 * pair, so four routes sharing a lane pushed one of them 32 px, into the boxes the lane was
 * routed around. A shift is applied only if it keeps every port on its node side (a first or
 * last segment can slide along the side, never off it) and does not run the route into a box.
 */
function nudgeOverlappingSegments(
  routes: Map<string, RoutedEdge>,
  endpoints: Map<string, { source: EdgeEndpointRect; target: EdgeEndpointRect }>,
  obstacles: readonly EdgeEndpointRect[],
  traceSpacing: number = DEFAULT_TRACE_SPACING
): void {
  const horizontal = new Map<number, SegmentRef[]>()
  const vertical = new Map<number, SegmentRef[]>()

  for (const [id, route] of routes) {
    for (let i = 0; i < route.points.length - 1; i++) {
      const p1 = route.points[i]
      const p2 = route.points[i + 1]
      if (p1.x === p2.x && p1.y === p2.y) continue
      if (p1.y === p2.y) {
        const key = Math.round(p1.y)
        if (!horizontal.has(key)) horizontal.set(key, [])
        horizontal.get(key)!.push({ id, segmentIndex: i, lo: Math.min(p1.x, p2.x), hi: Math.max(p1.x, p2.x) })
      } else if (p1.x === p2.x) {
        const key = Math.round(p1.x)
        if (!vertical.has(key)) vertical.set(key, [])
        vertical.get(key)!.push({ id, segmentIndex: i, lo: Math.min(p1.y, p2.y), hi: Math.max(p1.y, p2.y) })
      }
    }
  }

  for (const [axis, groups] of [['y', horizontal], ['x', vertical]] as const) {
    for (const segments of groups.values()) {
      // Clusters of mutually overlapping intervals (connected components along the line).
      const sorted = [...segments].sort((a, b) => a.lo - b.lo || a.id.localeCompare(b.id))
      let cluster: SegmentRef[] = []
      let clusterHi = -Infinity
      const clusters: SegmentRef[][] = []
      for (const seg of sorted) {
        if (cluster.length > 0 && seg.lo < clusterHi) {
          cluster.push(seg)
          clusterHi = Math.max(clusterHi, seg.hi)
        } else {
          if (cluster.length > 1) clusters.push(cluster)
          cluster = [seg]
          clusterHi = seg.hi
        }
      }
      if (cluster.length > 1) clusters.push(cluster)

      for (const members of clusters) {
        // One slot per route (a route with two collinear segments here keeps one offset).
        const ids = [...new Set(members.map(m => m.id))]
        if (ids.length < 2) continue
        // A route whose slot would run it into a box or off a port takes the nearest free
        // slot instead (mirrored first, then further out), never one another route holds.
        const taken = new Set<number>()
        ids.forEach((id, slot) => {
          const delta = (slot - (ids.length - 1) / 2) * traceSpacing
          const route = routes.get(id)!
          const ends = endpoints.get(id)!
          const own = withoutEndpoints(obstacles, ends.source, ends.target)
          const options = [delta, -delta]
          for (let k = Math.ceil(ids.length / 2); k <= ids.length; k++) options.push(k * traceSpacing, -k * traceSpacing)
          for (const d of options) {
            if (taken.has(d)) continue
            if (d === 0) {
              taken.add(d)
              break
            }
            const segs = members.filter(m => m.id === id)
            if (!segs.every(seg => canShiftSegment(route, seg.segmentIndex, axis, d, ends))) continue
            let points = route.points
            for (const seg of segs) points = shiftedPoints(points, seg.segmentIndex, axis, d)
            if (pathHits(points, own, 0) > pathHits(route.points, own, 0)) continue
            route.points = points
            updateRouteMetadata(route)
            taken.add(d)
            break
          }
        })
      }
    }
  }
}

/** Whether shifting segment `index` of `route` by `delta` along `axis` keeps both ports on their node sides. */
function canShiftSegment(
  route: RoutedEdge,
  index: number,
  axis: 'x' | 'y',
  delta: number,
  ends: { source: EdgeEndpointRect; target: EdgeEndpointRect }
): boolean {
  const last = route.points.length - 2
  if (index === 0 && !portStaysOnSide(route.points[0], ends.source, axis, delta)) return false
  if (index === last && !portStaysOnSide(route.points[last + 1], ends.target, axis, delta)) return false
  return true
}

function portStaysOnSide(port: Point, rect: EdgeEndpointRect, axis: 'x' | 'y', delta: number): boolean {
  // A port on the left/right side may slide in y within the side; one on the top/bottom side
  // may slide in x. Sliding it in the other direction would take it off the box.
  const onVerticalSide = Math.abs(Math.abs(port.x - rect.x) - rect.width / 2) < 0.01
  const onHorizontalSide = Math.abs(Math.abs(port.y - rect.y) - rect.height / 2) < 0.01
  if (axis === 'y') {
    if (!onVerticalSide) return false
    return Math.abs(port.y + delta - rect.y) <= rect.height / 2 - PORT_CORNER_MARGIN
  }
  if (!onHorizontalSide) return false
  return Math.abs(port.x + delta - rect.x) <= rect.width / 2 - PORT_CORNER_MARGIN
}

function shiftedPoints(points: Point[], index: number, axis: 'x' | 'y', delta: number): Point[] {
  return points.map((p, k) => (k === index || k === index + 1 ? (axis === 'y' ? { x: p.x, y: p.y + delta } : { x: p.x + delta, y: p.y }) : p))
}

/**
 * Updates the path string and metadata (mid, angle) of a route after points have been modified.
 */
function updateRouteMetadata(route: RoutedEdge): void {
  route.d = pointsToPathString(route.points)
  route.mid = route.points[Math.floor(route.points.length / 2)]
  const n = route.points.length
  route.angle = n >= 2
    ? Math.atan2(route.points[n - 1].y - route.points[n - 2].y, route.points[n - 1].x - route.points[n - 2].x)
    : 0
}

// ─── path construction ──────────────────────────────────────────────────────

type Side = 'left' | 'right' | 'top' | 'bottom'

function portOn(rect: EdgeEndpointRect, side: Side): Point {
  switch (side) {
    case 'left': return { x: rect.x - rect.width / 2, y: rect.y }
    case 'right': return { x: rect.x + rect.width / 2, y: rect.y }
    case 'top': return { x: rect.x, y: rect.y - rect.height / 2 }
    case 'bottom': return { x: rect.x, y: rect.y + rect.height / 2 }
  }
}

function hSegmentIntersectsBox(x1: number, x2: number, y: number, box: EdgeEndpointRect, padding: number = 0): boolean {
  const boxLeft = box.x - box.width / 2 - padding
  const boxRight = box.x + box.width / 2 + padding
  const boxTop = box.y - box.height / 2 - padding
  const boxBottom = box.y + box.height / 2 + padding
  // Strict: a lane that runs exactly `padding` outside a box is clear of it.
  return y > boxTop && y < boxBottom && Math.min(x1, x2) < boxRight && Math.max(x1, x2) > boxLeft
}

function vSegmentIntersectsBox(x: number, y1: number, y2: number, box: EdgeEndpointRect, padding: number = 0): boolean {
  const boxLeft = box.x - box.width / 2 - padding
  const boxRight = box.x + box.width / 2 + padding
  const boxTop = box.y - box.height / 2 - padding
  const boxBottom = box.y + box.height / 2 + padding
  return x > boxLeft && x < boxRight && Math.min(y1, y2) < boxBottom && Math.max(y1, y2) > boxTop
}

/** Number of (segment, obstacle) pairs where a segment of the path crosses a padded obstacle box. */
function pathHits(points: Point[], obstacles: readonly EdgeEndpointRect[], padding: number): number {
  let hits = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a.x === b.x && a.y === b.y) continue
    for (const obs of obstacles) {
      if (a.y === b.y ? hSegmentIntersectsBox(a.x, b.x, a.y, obs, padding) : vSegmentIntersectsBox(a.x, a.y, b.y, obs, padding)) hits++
    }
  }
  return hits
}

function dropDuplicatePoints(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p)
  }
  return out
}

/**
 * Builds the orthogonal path between two boxes. Every candidate's ports are chosen to match the
 * direction the path actually leaves and arrives in (a vertical first segment starts on the
 * top or bottom side, a horizontal one on the left or right), and every candidate — the two
 * direct L shapes, then horizontal and vertical detour lanes past the blocking boxes, then
 * lanes past every obstacle — is checked segment by segment against the obstacles. The first
 * clear candidate wins; if none is clear, the one crossing the fewest padded boxes.
 *
 * Earlier the detour's own segments were never re-checked (its lane could run through another
 * box), the ports were picked by the dominant axis regardless of the path's first move (a
 * route could leave the right side and immediately run up along that side), and a blocked
 * route fell back to a lane above or below every obstacle unconditionally.
 */
function buildOrthogonalPath(
  source: EdgeEndpointRect,
  target: EdgeEndpointRect,
  obstacles: readonly EdgeEndpointRect[]
): Point[] {
  const padding = OBSTACLE_PADDING
  const dx = target.x - source.x
  const dy = target.y - source.y
  const hSide = (from: Point | EdgeEndpointRect, to: Point | EdgeEndpointRect): Side => (to.x >= from.x ? 'right' : 'left')
  const vSide = (from: Point | EdgeEndpointRect, to: Point | EdgeEndpointRect): Side => (to.y >= from.y ? 'bottom' : 'top')
  const opposite = (side: Side): Side => ({ left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const)[side]

  if (dx === 0 && dy === 0) {
    return [portOn(source, 'right'), portOn(target, 'right')]
  }

  const candidates: Point[][] = []

  // Direct connections: same row or column.
  if (dy === 0) candidates.push([portOn(source, hSide(source, target)), portOn(target, opposite(hSide(source, target)))])
  if (dx === 0) candidates.push([portOn(source, vSide(source, target)), portOn(target, opposite(vSide(source, target)))])

  if (dx !== 0 && dy !== 0) {
    // Horizontal-first L: leave sideways, arrive from above/below.
    const exitH = portOn(source, hSide(source, target))
    const entryV = portOn(target, opposite(vSide(source, target)))
    candidates.push([exitH, { x: entryV.x, y: exitH.y }, entryV])
    // Vertical-first L: leave up/down, arrive sideways.
    const exitV = portOn(source, vSide(source, target))
    const entryH = portOn(target, opposite(hSide(source, target)))
    candidates.push([exitV, { x: exitV.x, y: entryH.y }, entryH])
  }

  // Horizontal lanes: up/down from the source, across, up/down into the target.
  const hLanes = (boxes: readonly EdgeEndpointRect[]): number[] => {
    if (boxes.length === 0) return []
    const above = Math.min(...boxes.map(o => o.y - o.height / 2)) - padding
    const below = Math.max(...boxes.map(o => o.y + o.height / 2)) + padding
    return Math.abs(above - source.y) <= Math.abs(below - source.y) ? [above, below] : [below, above]
  }
  const vLanes = (boxes: readonly EdgeEndpointRect[]): number[] => {
    if (boxes.length === 0) return []
    const left = Math.min(...boxes.map(o => o.x - o.width / 2)) - padding
    const right = Math.max(...boxes.map(o => o.x + o.width / 2)) + padding
    return Math.abs(right - source.x) <= Math.abs(left - source.x) ? [right, left] : [left, right]
  }
  const hLanePath = (laneY: number): Point[] => {
    const exit = portOn(source, vSide(source, { x: source.x, y: laneY }))
    const entry = portOn(target, vSide(target, { x: target.x, y: laneY }))
    return [exit, { x: exit.x, y: laneY }, { x: entry.x, y: laneY }, entry]
  }
  const vLanePath = (laneX: number): Point[] => {
    const exit = portOn(source, hSide(source, { x: laneX, y: source.y }))
    const entry = portOn(target, hSide(target, { x: laneX, y: target.y }))
    return [exit, { x: laneX, y: exit.y }, { x: laneX, y: entry.y }, entry]
  }

  // Lanes past the boxes that block the direct horizontal / vertical run, then past everything.
  const sourceExitH = portOn(source, hSide(source, target))
  const onHRun = obstacles.filter(o => hSegmentIntersectsBox(sourceExitH.x, target.x, source.y, o, padding))
  const sourceExitV = portOn(source, vSide(source, target))
  const onVRun = obstacles.filter(o => vSegmentIntersectsBox(source.x, sourceExitV.y, target.y, o, padding))
  for (const laneY of hLanes(onHRun)) candidates.push(hLanePath(laneY))
  for (const laneX of vLanes(onVRun)) candidates.push(vLanePath(laneX))
  for (const laneY of hLanes(obstacles)) candidates.push(hLanePath(laneY))
  for (const laneX of vLanes(obstacles)) candidates.push(vLanePath(laneX))

  // Three-bend combinations of a horizontal and a vertical lane past every obstacle, for the
  // case neither single lane clears (e.g. a target directly below another box, reached from a
  // source whose row is full): up/down to the lane, across to the vertical lane, down/up to
  // the target's row, and in from the side — or the mirrored order.
  const laneYs = [...new Set([...hLanes(onHRun), ...hLanes(obstacles)])]
  const laneXs = [...new Set([...vLanes(onVRun), ...vLanes(obstacles)])]
  for (const laneY of laneYs) {
    for (const laneX of laneXs) {
      const exitV = portOn(source, vSide(source, { x: source.x, y: laneY }))
      const entryH = portOn(target, hSide(target, { x: laneX, y: target.y }))
      candidates.push([exitV, { x: exitV.x, y: laneY }, { x: laneX, y: laneY }, { x: laneX, y: entryH.y }, entryH])
      const exitH = portOn(source, hSide(source, { x: laneX, y: source.y }))
      const entryV = portOn(target, vSide(target, { x: target.x, y: laneY }))
      candidates.push([exitH, { x: laneX, y: exitH.y }, { x: laneX, y: laneY }, { x: entryV.x, y: laneY }, entryV])
    }
  }

  let best: Point[] | null = null
  let bestHits = Infinity
  for (const candidate of candidates) {
    const points = dropDuplicatePoints(candidate)
    const hits = pathHits(points, obstacles, padding)
    if (hits === 0) return points
    if (hits < bestHits) {
      best = points
      bestHits = hits
    }
  }
  return best ?? [portOn(source, 'right'), portOn(target, 'left')]
}

function pointsToPathString(points: Point[]): string {
  if (points.length === 0) return ''
  const parts = [
    `M ${Math.round(points[0].x)} ${Math.round(points[0].y)}`,
    ...points.slice(1).map(p => `L ${Math.round(p.x)} ${Math.round(p.y)}`),
  ]
  return parts.join(' ')
}
