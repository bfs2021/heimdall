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
  /** Label anchors in order of preference: the midpoint of each straight segment, longest first
   *  (polylineToRoutedEdge). A renderer tries these before sampling the path by parameter, which
   *  lands on a bend corner for an L-shaped route. */
  labelAnchors?: Point[]
}

/** Default spacing (px) between parallel segments when nudging overlapping edges apart */
export const DEFAULT_TRACE_SPACING = 16

/**
 * Wraps a precomputed orthogonal polyline (e.g. from utils/orthogonalLayout) in the RoutedEdge
 * shape GraphCanvas renders: SVG path, label midpoint and end angle, same formulas as
 * routeNavigationEdge. Returns null for anything shorter than two points.
 */
export function polylineToRoutedEdge(points: readonly Point[]): RoutedEdge | null {
  if (points.length < 2) return null
  const pts = points.map(p => ({ x: p.x, y: p.y }))
  const d = pointsToPathString(pts)
  // Label anchors: three points on every segment (its midpoint, then 30% and 70% along it),
  // longest segment first (ties by segment order), so a label sits on a straight run instead of a
  // corner and a renderer has alternatives when two labels would collide; `mid` (tooltips,
  // popovers) is the longest segment's midpoint.
  const labelAnchors = pts.slice(1)
    .map((p, i) => ({ len: Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y), a: pts[i], b: p, i }))
    .sort((a, b) => b.len - a.len || a.i - b.i)
    .flatMap(s => [0.5, 0.3, 0.7].map(t => ({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t })))
  const mid = labelAnchors[0]
  const angle = Math.atan2(pts[pts.length - 1].y - pts[pts.length - 2].y, pts[pts.length - 1].x - pts[pts.length - 2].x)
  return { d, mid, angle, points: pts, isPolyline: true, labelAnchors }
}

export function routeNavigationEdge(
  source: EdgeEndpointRect,
  target: EdgeEndpointRect,
  obstacles: readonly EdgeEndpointRect[] = []
): RoutedEdge {
  // Exit point from source (middle of right/left edge depending on target position)
  const sourceExit = getExitPoint(source, target)

  // Entry point to target (middle of right/left edge depending on source position)
  const targetEntry = getEntryPoint(target, source)

  // Build the orthogonal path with obstacle avoidance
  const points = buildOrthogonalPath(sourceExit, targetEntry, obstacles)

  // Convert points to SVG path string
  const d = pointsToPathString(points)

  // Compute midpoint and angle for label placement
  const mid = points[Math.floor(points.length / 2)]
  const angle = Math.atan2(
    points[points.length - 1].y - points[points.length - 2].y,
    points[points.length - 1].x - points[points.length - 2].x
  )

  return { d, mid, angle, points, isPolyline: true }
}

/**
 * Routes multiple navigation edges at once with obstacle avoidance.
 * Routes each edge individually and applies a nudge pass to spread overlapping segments.
 */
export function routeNavigationEdges(
  edges: Array<{ id: string; source: EdgeEndpointRect; target: EdgeEndpointRect }>,
  allObstacles: readonly EdgeEndpointRect[] = [],
  traceSpacing: number = DEFAULT_TRACE_SPACING
): Map<string, RoutedEdge> {
  // Route each edge individually, but consider previous routes as soft obstacles
  const routes = new Map<string, RoutedEdge>()
  const routedRects: EdgeEndpointRect[] = []

  for (const edge of edges) {
    const obstacles = [...allObstacles, ...routedRects]
    const routed = routeNavigationEdge(edge.source, edge.target, obstacles)
    routes.set(edge.id, routed)

    // Create a bounding rect for this route to use as obstacle for subsequent edges
    const allX = routed.points.map(p => p.x)
    const allY = routed.points.map(p => p.y)
    routedRects.push({
      x: (Math.min(...allX) + Math.max(...allX)) / 2,
      y: (Math.min(...allY) + Math.max(...allY)) / 2,
      width: Math.max(...allX) - Math.min(...allX) + 10,
      height: Math.max(...allY) - Math.min(...allY) + 10,
    })
  }

  // Apply nudge pass to spread overlapping segments
  nudgeOverlappingSegments(routes, traceSpacing)

  return routes
}

/**
 * Post-processes routed edges to spread overlapping segments by applying perpendicular offsets.
 * This ensures that parallel segments from different routes are visually distinct and don't
 * completely overlap.
 */
function nudgeOverlappingSegments(
  routes: Map<string, RoutedEdge>,
  traceSpacing: number = DEFAULT_TRACE_SPACING
): void {
  // Track which route pairs have already been nudged to avoid double-nudging
  const nudgedPairs = new Set<string>()

  // Group segments by their axis and position
  const horizontalSegments = new Map<number, Array<{ id: string; segmentIndex: number; x1: number; x2: number }>>()
  const verticalSegments = new Map<number, Array<{ id: string; segmentIndex: number; y1: number; y2: number }>>()

  for (const [id, route] of routes) {
    for (let i = 0; i < route.points.length - 1; i++) {
      const p1 = route.points[i]
      const p2 = route.points[i + 1]

      // Horizontal segment
      if (p1.y === p2.y) {
        const y = Math.round(p1.y)
        if (!horizontalSegments.has(y)) {
          horizontalSegments.set(y, [])
        }
        horizontalSegments.get(y)!.push({
          id,
          segmentIndex: i,
          x1: Math.min(p1.x, p2.x),
          x2: Math.max(p1.x, p2.x),
        })
      }

      // Vertical segment
      if (p1.x === p2.x) {
        const x = Math.round(p1.x)
        if (!verticalSegments.has(x)) {
          verticalSegments.set(x, [])
        }
        verticalSegments.get(x)!.push({
          id,
          segmentIndex: i,
          y1: Math.min(p1.y, p2.y),
          y2: Math.max(p1.y, p2.y),
        })
      }
    }
  }

  // Detect overlapping horizontal segments and nudge them apart vertically
  for (const segments of horizontalSegments.values()) {
    for (let i = 0; i < segments.length - 1; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const seg1 = segments[i]
        const seg2 = segments[j]

        // Check if segments overlap in x
        if (seg1.x1 < seg2.x2 && seg1.x2 > seg2.x1) {
          const pairKey = [seg1.id, seg2.id].sort().join(':')
          if (!nudgedPairs.has(pairKey)) {
            const route1 = routes.get(seg1.id)!
            const route2 = routes.get(seg2.id)!
            if (route1 && route2) {
              nudgeHorizontalSegment(route1, seg1.segmentIndex, route2, seg2.segmentIndex, traceSpacing)
              nudgedPairs.add(pairKey)
            }
          }
        }
      }
    }
  }

  // Detect overlapping vertical segments and nudge them apart horizontally
  for (const segments of verticalSegments.values()) {
    for (let i = 0; i < segments.length - 1; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const seg1 = segments[i]
        const seg2 = segments[j]

        // Check if segments overlap in y
        if (seg1.y1 < seg2.y2 && seg1.y2 > seg2.y1) {
          const pairKey = [seg1.id, seg2.id].sort().join(':')
          if (!nudgedPairs.has(pairKey)) {
            const route1 = routes.get(seg1.id)!
            const route2 = routes.get(seg2.id)!
            if (route1 && route2) {
              nudgeVerticalSegment(route1, seg1.segmentIndex, route2, seg2.segmentIndex, traceSpacing)
              nudgedPairs.add(pairKey)
            }
          }
        }
      }
    }
  }
}

/**
 * Nudges a specific horizontal segment of a route vertically to separate from another.
 * Nudging the endpoints maintains 90° joints at the shared corner points.
 */
function nudgeHorizontalSegment(
  route1: RoutedEdge,
  segmentIndex1: number,
  route2: RoutedEdge,
  segmentIndex2: number,
  spacing: number
): void {
  const offset = spacing / 2

  // Nudge the two endpoints of each segment
  const seg1Start = segmentIndex1
  const seg1End = segmentIndex1 + 1
  const seg2Start = segmentIndex2
  const seg2End = segmentIndex2 + 1

  route1.points[seg1Start] = { x: route1.points[seg1Start].x, y: route1.points[seg1Start].y - offset }
  route1.points[seg1End] = { x: route1.points[seg1End].x, y: route1.points[seg1End].y - offset }

  route2.points[seg2Start] = { x: route2.points[seg2Start].x, y: route2.points[seg2Start].y + offset }
  route2.points[seg2End] = { x: route2.points[seg2End].x, y: route2.points[seg2End].y + offset }

  // Recompute path string and metadata after nudging
  updateRouteMetadata(route1)
  updateRouteMetadata(route2)
}

/**
 * Nudges a specific vertical segment of a route horizontally to separate from another.
 * Nudging the endpoints maintains 90° joints at the shared corner points.
 */
function nudgeVerticalSegment(
  route1: RoutedEdge,
  segmentIndex1: number,
  route2: RoutedEdge,
  segmentIndex2: number,
  spacing: number
): void {
  const offset = spacing / 2

  // Nudge the two endpoints of each segment
  const seg1Start = segmentIndex1
  const seg1End = segmentIndex1 + 1
  const seg2Start = segmentIndex2
  const seg2End = segmentIndex2 + 1

  route1.points[seg1Start] = { x: route1.points[seg1Start].x - offset, y: route1.points[seg1Start].y }
  route1.points[seg1End] = { x: route1.points[seg1End].x - offset, y: route1.points[seg1End].y }

  route2.points[seg2Start] = { x: route2.points[seg2Start].x + offset, y: route2.points[seg2Start].y }
  route2.points[seg2End] = { x: route2.points[seg2End].x + offset, y: route2.points[seg2End].y }

  // Recompute path string and metadata after nudging
  updateRouteMetadata(route1)
  updateRouteMetadata(route2)
}

/**
 * Updates the path string and metadata (mid, angle) of a route after points have been modified.
 */
function updateRouteMetadata(route: RoutedEdge): void {
  route.d = pointsToPathString(route.points)
  route.mid = route.points[Math.floor(route.points.length / 2)]
  route.angle = Math.atan2(
    route.points[route.points.length - 1].y - route.points[route.points.length - 2].y,
    route.points[route.points.length - 1].x - route.points[route.points.length - 2].x
  )
}

function getExitPoint(source: EdgeEndpointRect, target: EdgeEndpointRect): Point {
  const sourceCenter = { x: source.x, y: source.y }
  const targetCenter = { x: target.x, y: target.y }

  // Prefer horizontal exit (right/left sides) if target is significantly left or right
  if (Math.abs(targetCenter.x - sourceCenter.x) > Math.abs(targetCenter.y - sourceCenter.y)) {
    return {
      x: targetCenter.x > sourceCenter.x
        ? source.x + source.width / 2  // exit right
        : source.x - source.width / 2, // exit left
      y: source.y, // middle height of source
    }
  }

  // Otherwise exit top or bottom
  return {
    x: source.x,
    y: targetCenter.y > sourceCenter.y
      ? source.y + source.height / 2  // exit bottom
      : source.y - source.height / 2, // exit top
  }
}

function getEntryPoint(target: EdgeEndpointRect, source: EdgeEndpointRect): Point {
  const sourceCenter = { x: source.x, y: source.y }
  const targetCenter = { x: target.x, y: target.y }

  // Prefer horizontal entry (right/left sides) if source is significantly left or right
  if (Math.abs(sourceCenter.x - targetCenter.x) > Math.abs(sourceCenter.y - targetCenter.y)) {
    return {
      x: sourceCenter.x > targetCenter.x
        ? target.x + target.width / 2  // enter from right
        : target.x - target.width / 2, // enter from left
      y: target.y, // middle height of target
    }
  }

  // Otherwise enter from top or bottom
  return {
    x: target.x,
    y: sourceCenter.y > targetCenter.y
      ? target.y + target.height / 2  // enter from bottom
      : target.y - target.height / 2, // enter from top
  }
}

function hSegmentIntersectsBox(
  x1: number,
  x2: number,
  y: number,
  box: EdgeEndpointRect,
  padding: number = 0
): boolean {
  const boxLeft = box.x - box.width / 2 - padding
  const boxRight = box.x + box.width / 2 + padding
  const boxTop = box.y - box.height / 2 - padding
  const boxBottom = box.y + box.height / 2 + padding

  const segLeft = Math.min(x1, x2)
  const segRight = Math.max(x1, x2)

  return (
    y >= boxTop &&
    y <= boxBottom &&
    segLeft < boxRight &&
    segRight > boxLeft
  )
}

function vSegmentIntersectsBox(
  x: number,
  y1: number,
  y2: number,
  box: EdgeEndpointRect,
  padding: number = 0
): boolean {
  const boxLeft = box.x - box.width / 2 - padding
  const boxRight = box.x + box.width / 2 + padding
  const boxTop = box.y - box.height / 2 - padding
  const boxBottom = box.y + box.height / 2 + padding

  const segTop = Math.min(y1, y2)
  const segBottom = Math.max(y1, y2)

  return (
    x >= boxLeft &&
    x <= boxRight &&
    segTop < boxBottom &&
    segBottom > boxTop
  )
}

function buildOrthogonalPath(
  source: Point,
  target: Point,
  obstacles: readonly EdgeEndpointRect[]
): Point[] {
  const padding = 20

  // Try horizontal-first routing (right/left then up/down)
  const hFirstPath = tryHorizontalFirstPath(source, target, obstacles, padding)
  if (hFirstPath) return hFirstPath

  // Try vertical-first routing (up/down then right/left)
  const vFirstPath = tryVerticalFirstPath(source, target, obstacles, padding)
  if (vFirstPath) return vFirstPath

  // Fallback: route outside the bounding box of all obstacles
  if (obstacles.length > 0) {
    const minY = Math.min(...obstacles.map(o => o.y - o.height / 2))
    const maxY = Math.max(...obstacles.map(o => o.y + o.height / 2))

    // Try routing above or below the obstacle cluster
    const aboveY = minY - padding
    const belowY = maxY + padding

    const distToAbove = Math.abs(aboveY - source.y)
    const distToBelow = Math.abs(belowY - source.y)
    const routeY = distToAbove <= distToBelow ? aboveY : belowY

    return [source, { x: source.x, y: routeY }, { x: target.x, y: routeY }, target]
  }

  // No obstacles: simple L-path
  return [source, { x: target.x, y: source.y }, target]
}

function tryHorizontalFirstPath(
  source: Point,
  target: Point,
  obstacles: readonly EdgeEndpointRect[],
  padding: number
): Point[] | null {
  const corner = { x: target.x, y: source.y }

  // Check if direct path crosses obstacles
  const hSegClear = !obstacles.some(obs =>
    hSegmentIntersectsBox(source.x, target.x, source.y, obs, padding)
  )
  const vSegClear = !obstacles.some(obs =>
    vSegmentIntersectsBox(target.x, source.y, target.y, obs, padding)
  )

  if (hSegClear && vSegClear) {
    return [source, corner, target]
  }

  // If blocked, try routing above/below obstacles
  const obstaclesOnPath = obstacles.filter(obs =>
    hSegmentIntersectsBox(source.x, target.x, source.y, obs, padding)
  )

  if (obstaclesOnPath.length > 0) {
    // Route above the topmost obstacle
    const topmost = obstaclesOnPath.reduce((min, obs) =>
      obs.y - obs.height / 2 < min.y - min.height / 2 ? obs : min
    )
    const routeY = topmost.y - topmost.height / 2 - padding
    const waypoint1 = { x: source.x, y: routeY }
    const waypoint2 = { x: target.x, y: routeY }
    return [source, waypoint1, waypoint2, target]
  }

  return null
}

function tryVerticalFirstPath(
  source: Point,
  target: Point,
  obstacles: readonly EdgeEndpointRect[],
  padding: number
): Point[] | null {
  const corner = { x: source.x, y: target.y }

  // Check if direct path crosses obstacles
  const vSegClear = !obstacles.some(obs =>
    vSegmentIntersectsBox(source.x, source.y, target.y, obs, padding)
  )
  const hSegClear = !obstacles.some(obs =>
    hSegmentIntersectsBox(source.x, target.x, target.y, obs, padding)
  )

  if (vSegClear && hSegClear) {
    return [source, corner, target]
  }

  // If blocked, try routing left/right of obstacles
  const obstaclesOnPath = obstacles.filter(obs =>
    vSegmentIntersectsBox(source.x, source.y, target.y, obs, padding)
  )

  if (obstaclesOnPath.length > 0) {
    // Route right of the rightmost obstacle
    const rightmost = obstaclesOnPath.reduce((max, obs) =>
      obs.x + obs.width / 2 > max.x + max.width / 2 ? obs : max
    )
    const routeX = rightmost.x + rightmost.width / 2 + padding
    const waypoint1 = { x: routeX, y: source.y }
    const waypoint2 = { x: routeX, y: target.y }
    return [source, waypoint1, waypoint2, target]
  }

  return null
}

function pointsToPathString(points: Point[]): string {
  if (points.length === 0) return ''
  const parts = [
    `M ${Math.round(points[0].x)} ${Math.round(points[0].y)}`,
    ...points.slice(1).map(p => `L ${Math.round(p.x)} ${Math.round(p.y)}`),
  ]
  return parts.join(' ')
}
