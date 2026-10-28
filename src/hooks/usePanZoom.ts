import { useCallback, useEffect, useRef, useState } from 'react'

export interface UsePanZoomOptions {
  minZoom?: number
  maxZoom?: number
  bounds?: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void
  /**
   * The element to zoom/pan from wheel and pinch-zoom gestures. Required for those to work:
   * React registers onWheel as a passive listener, so calling event.preventDefault() inside a
   * synthetic handler is silently a no-op — the browser's own native scroll/pinch-zoom then
   * fires *alongside* ours, uncoordinated, which is what actually causes the "jumpy, snaps to a
   * random center" symptom (not React state, and not the cursor-anchor math — both were already
   * correct). Wheel handling is instead attached here as a real { passive: false } native
   * listener, which can genuinely suppress the browser default.
   */
  containerRef: React.RefObject<HTMLElement>
  /** Freezes wheel-zoom, drag-to-pan, and the keyboard zoom/pan shortcuts. Doesn't affect
   *  imperative calls (zoomTo/panTo/reset) — those are deliberate actions, not the accidental
   *  scroll/drag input this is meant to guard against. Default false. */
  locked?: boolean
}

export interface UsePanZoomReturn {
  transform: string
  viewport: { x: number; y: number; zoom: number }
  bind: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
    tabIndex: number
    role: string
  }
  zoomTo: (zoom: number, x?: number, y?: number) => void
  panTo: (x: number, y: number) => void
  reset: () => void
}

const DEFAULT_MIN_ZOOM = 0.25
const DEFAULT_MAX_ZOOM = 4
const ZOOM_STEP = 0.1
const PAN_STEP = 20
const INERTIA_DECAY = 0.95
const MIN_VELOCITY = 0.1

// Wheel-to-zoom sensitivity, ported from d3-zoom's default wheelDelta: zoom scales
// exponentially with deltaY (2^(-deltaY * sensitivity)) instead of jumping ZOOM_STEP per
// event regardless of magnitude. That's what makes a light trackpad scroll produce a light
// zoom change — a flat per-event step blows past the target after a couple of the dozens of
// small events one scroll gesture fires. deltaMode distinguishes pixel (0, trackpads and most
// mice), line (1), and page (2) delta units, which otherwise differ by 1-2 orders of magnitude.
// ctrlKey is how browsers report a trackpad pinch gesture over 'wheel'; its deltaY tends to be
// much smaller per event than a scroll's, so it gets amplified to match — also straight from d3.
const WHEEL_PIXEL_SENSITIVITY = 0.002
const WHEEL_LINE_SENSITIVITY = 0.05
const WHEEL_PAGE_SENSITIVITY = 1
const WHEEL_CTRL_MULTIPLIER = 10

function wheelZoomFactor(e: WheelEvent): number {
  const sensitivity =
    e.deltaMode === 1 ? WHEEL_LINE_SENSITIVITY : e.deltaMode === 2 ? WHEEL_PAGE_SENSITIVITY : WHEEL_PIXEL_SENSITIVITY
  const multiplier = e.ctrlKey ? WHEEL_CTRL_MULTIPLIER : 1
  return Math.pow(2, -e.deltaY * sensitivity * multiplier)
}

// The exact point-under-cursor-stays-under-cursor solution for transform matrix(zoom,0,0,zoom,panX,panY)
// (screen = world * zoom + pan): a linear approximation (pan - (cursor/zoom)*Δzoom, used here
// previously) only holds for infinitesimally small Δzoom and drifts visibly as either the step
// size or the distance from zoom=1 grows — this is correct for any zoom change.
function anchoredPan(
  cx: number,
  cy: number,
  prevZoom: number,
  nextZoom: number,
  prevPan: { x: number; y: number }
): { x: number; y: number } {
  const ratio = nextZoom / prevZoom
  return {
    x: cx - ratio * (cx - prevPan.x),
    y: cy - ratio * (cy - prevPan.y),
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function usePanZoom({
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
  bounds,
  onViewportChange,
  containerRef,
  locked = false,
}: UsePanZoomOptions): UsePanZoomReturn {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  // Read from input handlers instead of taking `locked` as a dependency — those handlers
  // (attached as a native listener, or otherwise expensive to reattach) shouldn't need to be
  // torn down and recreated just because lock was toggled.
  const lockedRef = useRef(locked)
  useEffect(() => {
    lockedRef.current = locked
  }, [locked])
  const dragRef = useRef<{ x: number; y: number; lastX: number; lastY: number; panX: number; panY: number; vx: number; vy: number; time: number } | null>(null)
  const listenersAttachedRef = useRef(false)
  const handlePointerMoveRef = useRef<(e: PointerEvent) => void>()
  const handlePointerUpRef = useRef<() => void>()
  // Separate per-gesture rAF refs — drag-pan, wheel-zoom, and keyboard pan/zoom can all fire in
  // the same frame (e.g. a trackpad pinch with a hand also resting near a mouse button, or wheel
  // input arriving just as a keyboard shortcut fires), and previously shared a single `rafRef`:
  // whichever gesture's handler ran last would silently cancelAnimationFrame() the others'
  // already-scheduled update before it ever committed, dropping that gesture's zoom/pan change
  // entirely for the frame — not a rendering glitch so much as one input source stomping another.
  const dragRafRef = useRef<number | null>(null)
  const wheelRafRef = useRef<number | null>(null)
  const keyRafRef = useRef<number | null>(null)
  const inertiaRafRef = useRef<number | null>(null)

  // Inertia keeps its own `currentPan`, captured when the glide started. Any
  // deliberate viewport change (wheel, keys, toolbar zoom/pan, reset) must stop
  // it first, or the next frame overwrites the new pan with one computed for
  // the old zoom — the "wheel zooms around an unrelated point" case in #306.
  const cancelInertia = useCallback(() => {
    if (inertiaRafRef.current !== null) {
      cancelAnimationFrame(inertiaRafRef.current)
      inertiaRafRef.current = null
    }
  }, [])

  // Keep refs current for event handlers
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  // Notify viewport changes. The callback is read through a ref so a new function identity
  // (an inline arrow in the caller) doesn't re-fire it: a caller that sets state from it would
  // otherwise re-render, pass a new callback, and loop forever.
  const onViewportChangeRef = useRef(onViewportChange)
  onViewportChangeRef.current = onViewportChange
  useEffect(() => {
    onViewportChangeRef.current?.({ x: pan.x, y: pan.y, zoom })
  }, [pan, zoom])

  const clampPan = useCallback(
    (panX: number, panY: number): { x: number; y: number } => {
      if (!bounds) return { x: panX, y: panY }

      const minPanX = -bounds.maxX * zoomRef.current
      const maxPanX = -bounds.minX * zoomRef.current
      const minPanY = -bounds.maxY * zoomRef.current
      const maxPanY = -bounds.minY * zoomRef.current

      return {
        x: Math.max(minPanX, Math.min(maxPanX, panX)),
        y: Math.max(minPanY, Math.min(maxPanY, panY)),
      }
    },
    [bounds]
  )

  const stableHandlePointerMove = useCallback((e: PointerEvent) => {
    handlePointerMoveRef.current?.(e)
  }, [])

  const stableHandlePointerUp = useCallback(() => {
    handlePointerUpRef.current?.()
  }, [])

  const attachListeners = useCallback(() => {
    if (listenersAttachedRef.current) return
    document.addEventListener('pointermove', stableHandlePointerMove)
    document.addEventListener('pointerup', stableHandlePointerUp)
    listenersAttachedRef.current = true
  }, [stableHandlePointerMove, stableHandlePointerUp])

  const detachListeners = useCallback(() => {
    if (!listenersAttachedRef.current) return
    document.removeEventListener('pointermove', stableHandlePointerMove)
    document.removeEventListener('pointerup', stableHandlePointerUp)
    listenersAttachedRef.current = false
  }, [stableHandlePointerMove, stableHandlePointerUp])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return

    const dx = e.clientX - dragRef.current.lastX
    const dy = e.clientY - dragRef.current.lastY
    const now = performance.now()
    const dt = Math.max(1, now - dragRef.current.time) / 1000

    dragRef.current.vx = dx / dt
    dragRef.current.vy = dy / dt
    dragRef.current.time = now
    dragRef.current.lastX = e.clientX
    dragRef.current.lastY = e.clientY

    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current)
    }

    dragRafRef.current = requestAnimationFrame(() => {
      if (!dragRef.current) return

      const newPan = clampPan(
        dragRef.current.panX + (e.clientX - dragRef.current.x),
        dragRef.current.panY + (e.clientY - dragRef.current.y)
      )

      setPan(newPan)
      dragRafRef.current = null
    })
  }, [clampPan])

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) {
      detachListeners()
      return
    }

    const shouldReduceMotion = prefersReducedMotion()
    const vx = dragRef.current.vx
    const vy = dragRef.current.vy
    const velocity = Math.sqrt(vx * vx + vy * vy)

    dragRef.current = null
    detachListeners()

    if (shouldReduceMotion || velocity < MIN_VELOCITY) {
      return
    }

    let currentVx = vx
    let currentVy = vy
    let currentPan = panRef.current
    let lastFrameTime = performance.now()

    const animate = () => {
      const now = performance.now()
      const dt = (now - lastFrameTime) / 1000
      lastFrameTime = now

      currentVx *= Math.pow(INERTIA_DECAY, dt * 60)
      currentVy *= Math.pow(INERTIA_DECAY, dt * 60)

      const velocity = Math.sqrt(currentVx * currentVx + currentVy * currentVy)
      if (velocity < MIN_VELOCITY) {
        inertiaRafRef.current = null
        return
      }

      currentPan = clampPan(currentPan.x + currentVx * dt, currentPan.y + currentVy * dt)
      setPan(currentPan)

      inertiaRafRef.current = requestAnimationFrame(animate)
    }

    inertiaRafRef.current = requestAnimationFrame(animate)
  }, [detachListeners, clampPan])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (lockedRef.current) return
    cancelInertia()

    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
      vx: 0,
      vy: 0,
      time: performance.now(),
    }
    attachListeners()
  }, [attachListeners, cancelInertia])

  // Keep refs in sync with the current implementations
  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove
  }, [handlePointerMove])

  useEffect(() => {
    handlePointerUpRef.current = handlePointerUp
  }, [handlePointerUp])

  // Cleanup listeners and animations on unmount
  useEffect(() => {
    return () => {
      detachListeners()
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current)
      }
      if (wheelRafRef.current !== null) {
        cancelAnimationFrame(wheelRafRef.current)
      }
      if (keyRafRef.current !== null) {
        cancelAnimationFrame(keyRafRef.current)
      }
      if (inertiaRafRef.current !== null) {
        cancelAnimationFrame(inertiaRafRef.current)
      }
    }
  }, [detachListeners])

  // Native WheelEvent, not React.WheelEvent — this is attached directly via addEventListener
  // below (with { passive: false }) rather than as a React onWheel prop, specifically so
  // preventDefault() actually works. See UsePanZoomOptions.containerRef for why.
  const handleWheel = useCallback((e: WheelEvent) => {
    if (lockedRef.current) return
    e.preventDefault()
    cancelInertia()

    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return

    const prev = zoomRef.current
    const next = Math.min(maxZoom, Math.max(minZoom, prev * wheelZoomFactor(e)))
    const anchored = anchoredPan(cx, cy, prev, next, panRef.current)
    const newPan = clampPan(anchored.x, anchored.y)

    // Write the refs now, not after the next passive effect: wheel events that
    // arrive within one frame then compound instead of all reading the same
    // base and dropping the earlier deltas.
    zoomRef.current = next
    panRef.current = newPan

    if (wheelRafRef.current !== null) {
      cancelAnimationFrame(wheelRafRef.current)
    }

    wheelRafRef.current = requestAnimationFrame(() => {
      setZoom(next)
      setPan(newPan)
      wheelRafRef.current = null
    })
  }, [cancelInertia, clampPan, minZoom, maxZoom])

  // A real, non-passive native listener — see UsePanZoomOptions.containerRef.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [containerRef, handleWheel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (lockedRef.current) return
      const key = e.key
      let updateZoom: number | null = null
      let updatePan: { x: number; y: number } | null = null

      if (key === '+' || key === '=') {
        e.preventDefault()
        updateZoom = Math.min(maxZoom, zoomRef.current + ZOOM_STEP)
      } else if (key === '-' || key === '_') {
        e.preventDefault()
        updateZoom = Math.max(minZoom, zoomRef.current - ZOOM_STEP)
      } else if (key === 'ArrowUp') {
        e.preventDefault()
        updatePan = clampPan(panRef.current.x, panRef.current.y + PAN_STEP)
      } else if (key === 'ArrowDown') {
        e.preventDefault()
        updatePan = clampPan(panRef.current.x, panRef.current.y - PAN_STEP)
      } else if (key === 'ArrowLeft') {
        e.preventDefault()
        updatePan = clampPan(panRef.current.x + PAN_STEP, panRef.current.y)
      } else if (key === 'ArrowRight') {
        e.preventDefault()
        updatePan = clampPan(panRef.current.x - PAN_STEP, panRef.current.y)
      }

      if (updateZoom !== null || updatePan !== null) {
        cancelInertia()

        // Same synchronous-target rule as the wheel handler.
        if (updateZoom !== null) {
          zoomRef.current = updateZoom
        }
        if (updatePan !== null) {
          panRef.current = updatePan
        }

        if (keyRafRef.current !== null) {
          cancelAnimationFrame(keyRafRef.current)
        }

        keyRafRef.current = requestAnimationFrame(() => {
          if (updateZoom !== null) {
            setZoom(updateZoom)
          }
          if (updatePan !== null) {
            setPan(updatePan)
          }
          keyRafRef.current = null
        })
      }
    },
    [cancelInertia, clampPan, minZoom, maxZoom]
  )

  const zoomTo = useCallback(
    (targetZoom: number, cx?: number, cy?: number) => {
      const clamped = Math.min(maxZoom, Math.max(minZoom, targetZoom))
      const prev = zoomRef.current

      cancelInertia()
      zoomRef.current = clamped
      setZoom(clamped)

      if (cx !== undefined && cy !== undefined) {
        const anchored = anchoredPan(cx, cy, prev, clamped, panRef.current)
        const newPan = clampPan(anchored.x, anchored.y)
        panRef.current = newPan
        setPan(newPan)
      }
    },
    [cancelInertia, clampPan, minZoom, maxZoom]
  )

  const panTo = useCallback(
    (x: number, y: number) => {
      cancelInertia()
      const newPan = clampPan(x, y)
      panRef.current = newPan
      setPan(newPan)
    },
    [cancelInertia, clampPan]
  )

  const reset = useCallback(() => {
    cancelInertia()
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [cancelInertia])

  // matrix(a, b, c, d, e, f) represents:
  // | a  c  e |
  // | b  d  f |
  // | 0  0  1 |
  // For translate(x, y) scale(z), we get: matrix(z, 0, 0, z, x, y)
  const transform = `matrix(${zoom}, 0, 0, ${zoom}, ${pan.x}, ${pan.y})`

  return {
    transform,
    viewport: { x: pan.x, y: pan.y, zoom },
    bind: {
      onPointerDown: handlePointerDown,
      onKeyDown: handleKeyDown,
      tabIndex: 0,
      role: 'region',
    },
    zoomTo,
    panTo,
    reset,
  }
}
