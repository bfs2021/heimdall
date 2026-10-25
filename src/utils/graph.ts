export interface Point {
  x: number
  y: number
}

export interface BezierPathResult {
  d: string
  mid: Point
  angle: number
  /** Control polygon behind `d` — [p1, c, p2] for a quadratic curve, [p1, c1, c2, p2] for a
   *  cubic one. Lets a caller sample the curve at points other than t=0.5 (see
   *  findClearLabelPosition) without reparsing the path string. */
  points: Point[]
}

export function rectEdgePoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number): Point {
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  const hw = w / 2
  const hh = h / 2

  if (adx * hh > ady * hw) {
    const sign = dx > 0 ? 1 : -1
    return { x: cx + sign * hw, y: cy + (dy * hw) / adx }
  } else {
    const sign = dy > 0 ? 1 : -1
    return { x: cx + (dx * hh) / ady, y: cy + sign * hh }
  }
}

export interface BoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface FitViewportResult {
  zoom: number
  panX: number
  panY: number
}

/** Computes the zoom/pan needed to fit `bbox` within a container, centered, clamped to [minZoom, maxZoom]. */
export function computeFitViewport(
  bbox: BoundingBox,
  containerWidth: number,
  containerHeight: number,
  padding: number,
  minZoom: number,
  maxZoom: number
): FitViewportResult {
  const bbW = bbox.maxX - bbox.minX
  const bbH = bbox.maxY - bbox.minY
  const zoom = Math.min(
    maxZoom,
    Math.max(
      minZoom,
      Math.min((containerWidth - 2 * padding) / (bbW || 1), (containerHeight - 2 * padding) / (bbH || 1))
    )
  )
  const centroidX = (bbox.minX + bbox.maxX) / 2
  const centroidY = (bbox.minY + bbox.maxY) / 2
  return {
    zoom,
    panX: containerWidth / 2 - centroidX * zoom,
    panY: containerHeight / 2 - centroidY * zoom,
  }
}

export const DEFAULT_QUADRATIC_CURVATURE = 0.22

export function bezierPath(p1: Point, p2: Point, curvature: number = DEFAULT_QUADRATIC_CURVATURE): BezierPathResult {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const dist = Math.hypot(dx, dy)

  const nx = -dy / (dist || 1)
  const ny = dx / (dist || 1)
  const offset = Math.min(80, dist * curvature)

  const mx = (p1.x + p2.x) / 2 + nx * offset
  const my = (p1.y + p2.y) / 2 + ny * offset

  return {
    d: `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`,
    mid: { x: (p1.x + 2 * mx + p2.x) / 4, y: (p1.y + 2 * my + p2.y) / 4 },
    angle: Math.atan2(p2.y - my, p2.x - mx),
    points: [p1, { x: mx, y: my }, p2],
  }
}

export type EdgeAnchor = 'auto' | 'left' | 'right' | 'top' | 'bottom'

const ANCHOR_DIRECTION: Record<Exclude<EdgeAnchor, 'auto'>, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

/**
 * The outward-facing direction of whichever side of the rectangle rectEdgePoint would put the
 * point on for the same (cx, cy, w, h, tx, ty) — i.e. the tangent a bezier control point should
 * project along so it approaches from the side the point is actually on, rather than a generic
 * line-of-sight offset that can disagree with it.
 *
 * This matters specifically for a mixed anchor pair (one fixed, one 'auto'): cubicBezierPath,
 * given only the resolved points, has no way to know which rectangle side an 'auto' point landed
 * on and falls back to offsetting perpendicular to the straight line between the two points. When
 * that guessed direction doesn't match the side rectEdgePoint actually chose, the curve's tangent
 * at that endpoint fights its way onto the correct side, producing a visible curl right at the
 * node instead of a clean approach. computeEdgePath uses this to give the 'auto' side its real
 * direction instead of relying on that fallback.
 */
export function rectEdgeDirection(cx: number, cy: number, w: number, h: number, tx: number, ty: number): Point {
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: 0, y: 0 }

  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  const hw = w / 2
  const hh = h / 2

  if (adx * hh > ady * hw) {
    return { x: dx > 0 ? 1 : -1, y: 0 }
  } else {
    return { x: 0, y: dy > 0 ? 1 : -1 }
  }
}

/**
 * Endpoint on a node's rectangle. For a fixed anchor, the midpoint of that side regardless
 * of (tx, ty). For 'auto', the perimeter point facing (tx, ty), i.e. rectEdgePoint.
 */
export function anchoredEdgePoint(cx: number, cy: number, w: number, h: number, anchor: EdgeAnchor, tx: number, ty: number): Point {
  switch (anchor) {
    case 'left':
      return { x: cx - w / 2, y: cy }
    case 'right':
      return { x: cx + w / 2, y: cy }
    case 'top':
      return { x: cx, y: cy - h / 2 }
    case 'bottom':
      return { x: cx, y: cy + h / 2 }
    default:
      return rectEdgePoint(cx, cy, w, h, tx, ty)
  }
}

function endpointFor(rect: EdgeEndpointRect, anchor: EdgeAnchor, tx: number, ty: number): Point {
  if (anchor === 'auto' && rect.radius !== undefined && rect.radius > 0) {
    const dx = tx - rect.x
    const dy = ty - rect.y
    const d = Math.hypot(dx, dy)
    if (d === 0) return { x: rect.x, y: rect.y }
    return { x: rect.x + (dx / d) * rect.radius, y: rect.y + (dy / d) * rect.radius }
  }
  return anchoredEdgePoint(rect.x, rect.y, rect.width, rect.height, anchor, tx, ty)
}

export const DEFAULT_CUBIC_CURVATURE = 0.22

/**
 * Cubic bezier whose control points project outward from each endpoint's anchor direction
 * (or, for 'auto', the perpendicular offset used by bezierPath). Midpoint and tangent angle
 * are found via De Casteljau subdivision at t=0.5 rather than approximated from the control points.
 *
 * sourceDirection/targetDirection override the anchor-derived direction for that endpoint —
 * computeEdgePath passes rectEdgeDirection's result here for an 'auto' side paired with a fixed
 * one, so its tangent matches the rectangle side the point is actually on. Called without them
 * (e.g. directly, with only points and no rectangle to derive a better direction from), 'auto'
 * still falls back to the perpendicular-of-line-of-sight offset, same as always.
 */
export function cubicBezierPath(
  p1: Point,
  p2: Point,
  sourceAnchor: EdgeAnchor = 'auto',
  targetAnchor: EdgeAnchor = 'auto',
  curvature: number = DEFAULT_CUBIC_CURVATURE,
  sourceDirection?: Point,
  targetDirection?: Point
): BezierPathResult {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const dist = Math.hypot(dx, dy) || 1
  const offset = Math.min(120, dist * curvature)

  const nx = -dy / dist
  const ny = dx / dist

  const dir1 = sourceDirection ?? (sourceAnchor === 'auto' ? { x: nx, y: ny } : ANCHOR_DIRECTION[sourceAnchor])
  const dir2 = targetDirection ?? (targetAnchor === 'auto' ? { x: nx, y: ny } : ANCHOR_DIRECTION[targetAnchor])

  const c1 = { x: p1.x + dir1.x * offset, y: p1.y + dir1.y * offset }
  const c2 = { x: p2.x + dir2.x * offset, y: p2.y + dir2.y * offset }

  // De Casteljau subdivision at t=0.5: exact midpoint and tangent, not a control-point approximation.
  const q0 = { x: (p1.x + c1.x) / 2, y: (p1.y + c1.y) / 2 }
  const q1 = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }
  const q2 = { x: (c2.x + p2.x) / 2, y: (c2.y + p2.y) / 2 }
  const r0 = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 }
  const r1 = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 }
  const mid = { x: (r0.x + r1.x) / 2, y: (r0.y + r1.y) / 2 }

  return {
    d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`,
    mid,
    angle: Math.atan2(r1.y - r0.y, r1.x - r0.x),
    points: [p1, c1, c2, p2],
  }
}

export interface EdgeEndpointRect {
  x: number
  y: number
  width: number
  height: number
  /** Set for a round body (galaxy's default node): an 'auto' endpoint sits on the circle, not on
   *  the bounding box — box corners stick out past the circle, so two close round bodies left a
   *  diagonal edge almost no visible line. */
  radius?: number
}

export interface EdgePathOptions {
  sourceAnchor?: EdgeAnchor
  targetAnchor?: EdgeAnchor
  curvature?: number
}

/**
 * Resolves the full path between two node rectangles, choosing a quadratic bezier when both
 * anchors are 'auto' (today's center-facing behavior) or a cubic bezier when either is fixed.
 */
export function computeEdgePath(source: EdgeEndpointRect, target: EdgeEndpointRect, options: EdgePathOptions = {}): BezierPathResult {
  const sourceAnchor = options.sourceAnchor ?? 'auto'
  const targetAnchor = options.targetAnchor ?? 'auto'

  const sp = endpointFor(source, sourceAnchor, target.x, target.y)
  const tp = endpointFor(target, targetAnchor, source.x, source.y)

  if (sourceAnchor === 'auto' && targetAnchor === 'auto') {
    return bezierPath(sp, tp, options.curvature ?? DEFAULT_QUADRATIC_CURVATURE)
  }

  // Give an 'auto' side its real rectangle-side direction rather than letting cubicBezierPath
  // fall back to guessing from the straight line between the two points — see rectEdgeDirection.
  const sourceDirection = sourceAnchor === 'auto'
    ? rectEdgeDirection(source.x, source.y, source.width, source.height, target.x, target.y)
    : undefined
  const targetDirection = targetAnchor === 'auto'
    ? rectEdgeDirection(target.x, target.y, target.width, target.height, source.x, source.y)
    : undefined

  return cubicBezierPath(sp, tp, sourceAnchor, targetAnchor, options.curvature ?? DEFAULT_CUBIC_CURVATURE, sourceDirection, targetDirection)
}

// ─── Edge label placement ──────────────────────────────────────────────────

const LABEL_CHAR_WIDTH = 6.6
const LABEL_PADDING_X = 14
const LABEL_HEIGHT = 18

/** The rendered footprint of an edge label pill — same sizing GraphEdgeShape draws, reused here
 *  so collision-avoidance checks against the exact box that will actually be on screen. */
export function edgeLabelSize(label: string): { width: number; height: number } {
  return { width: label.length * LABEL_CHAR_WIDTH + LABEL_PADDING_X, height: LABEL_HEIGHT }
}

function quadraticPointAt(p1: Point, c: Point, p2: Point, t: number): Point {
  const mt = 1 - t
  return {
    x: mt * mt * p1.x + 2 * mt * t * c.x + t * t * p2.x,
    y: mt * mt * p1.y + 2 * mt * t * c.y + t * t * p2.y,
  }
}

function cubicPointAt(p1: Point, c1: Point, c2: Point, p2: Point, t: number): Point {
  const mt = 1 - t
  return {
    x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p2.x,
    y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p2.y,
  }
}

function polylinePointAt(points: readonly Point[], t: number): Point {
  const totalLength = points.length - 1
  const segmentIndex = Math.floor(t * totalLength)
  const localT = (t * totalLength) - segmentIndex

  const p1 = points[Math.min(segmentIndex, points.length - 1)]
  const p2 = points[Math.min(segmentIndex + 1, points.length - 1)]

  return {
    x: p1.x + (p2.x - p1.x) * localT,
    y: p1.y + (p2.y - p1.y) * localT,
  }
}

// Tried in order, starting at the curve's true midpoint and stepping outward toward each
// endpoint — the first candidate whose label footprint clears every obstacle wins, so the label
// stays as close to the visual middle of the edge as the nearby nodes allow.
const LABEL_CANDIDATE_TS = [0.5, 0.38, 0.62, 0.26, 0.74, 0.15, 0.85]

/**
 * Where to center an edge label so it clears every node in `obstacles` by `margin` px, without
 * moving the edge or any node — just samples a handful of points along the path `points` already
 * describes and picks the first that's clear. Falls back to the path's exact midpoint (t=0.5)
 * if every candidate collides; occasionally sitting a label over a node beats a more complex
 * routing/repositioning scheme for what's meant to stay "just that".
 *
 * Handles both bezier control polygons (3-4 points) and orthogonal polylines (3+ points).
 * Polylines use linear interpolation; bezier paths use curve functions.
 * @param isPolyline - If true, treats points as an orthogonal polyline (linear sampling).
 *                     If false/undefined, interprets based on point count (3=quadratic, 4=cubic).
 */
export function findClearLabelPosition(
  points: readonly Point[],
  size: { width: number; height: number },
  obstacles: readonly EdgeEndpointRect[],
  margin: number = 6,
  isPolyline?: boolean
): Point {
  const sampleAt =
    isPolyline
      ? (t: number) => polylinePointAt(points, t)
      : points.length === 4
      ? (t: number) => cubicPointAt(points[0], points[1], points[2], points[3], t)
      : (t: number) => quadraticPointAt(points[0], points[1], points[2], t)

  const halfW = size.width / 2 + margin
  const halfH = size.height / 2 + margin

  for (const t of LABEL_CANDIDATE_TS) {
    const p = sampleAt(t)
    const clear = obstacles.every(o => {
      const oHalfW = o.width / 2
      const oHalfH = o.height / 2
      return Math.abs(p.x - o.x) >= halfW + oHalfW || Math.abs(p.y - o.y) >= halfH + oHalfH
    })
    if (clear) return p
  }
  return sampleAt(0.5)
}
