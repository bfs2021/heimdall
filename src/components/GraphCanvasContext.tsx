import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'

export interface GraphNodeRect {
  x: number
  y: number
  width: number
  height: number
}

export interface GraphCanvasContextValue {
  getNodeRect: (id: string) => GraphNodeRect | null
  /** Every currently-visible node's rect — used by edges to keep their label clear of nodes
   *  (see findClearLabelPosition in utils/graph). Not for hit-testing; use getNodeRect for that. */
  nodeRects: GraphNodeRect[]
  zoom: number
  pan: { x: number; y: number }
  selectedNodeId?: string
  /** Recomputes the current node bounding box and fits it within the container, optionally overriding fitPadding. */
  zoomToFit: (padding?: number) => void
  /** Sets zoom without altering pan — the fixed point of the resulting transform is wherever
   *  world (0, 0) currently projects to, which is usually off-screen after any pan/fitView. For a
   *  zoom step that should visually stay centered in the viewport (e.g. a zoom in/out button),
   *  use `zoomBy` instead. */
  setZoom: (zoom: number) => void
  /** Multiplies the current zoom by `factor`, anchored at the container's own visual center
   *  (falls back to `setZoom(zoom * factor)`'s world-origin anchor only if the container hasn't
   *  been measured yet) — GraphToolbar's zoom in/out buttons use this so the visible content stays
   *  put instead of flinging sideways toward wherever world-origin happens to currently project. */
  zoomBy: (factor: number) => void
  /** Sets pan without altering zoom. */
  setPan: (x: number, y: number) => void
  /** Whether wheel-zoom, drag-to-pan, and the keyboard zoom/pan shortcuts are frozen. Doesn't
   *  affect setZoom/setPan/zoomToFit — those are deliberate calls, not the accidental scroll/drag
   *  input locking is meant to guard against. Read/set by GraphToolbar's lock button. */
  locked: boolean
  setLocked: Dispatch<SetStateAction<boolean>>
  /** Whether the canvas's own container element is the page's current Fullscreen API element.
   *  Kept in sync with the platform's own fullscreen state (not just calls through
   *  toggleFullscreen) — Esc, browser chrome, or any other exit path all update this too. */
  isFullscreen: boolean
  /** Requests/exits fullscreen on the canvas container via the Fullscreen API. A no-op (resolves
   *  immediately) in an environment without Fullscreen API support (e.g. iOS Safari) — check
   *  `document.fullscreenEnabled` yourself first if you need to hide the affordance entirely
   *  there instead of having it silently do nothing. */
  toggleFullscreen: () => void
  /** The canvas's own `layout` prop, exposed read-only — GraphToolbar uses this to conditionally
   *  show controls that are only meaningful for one engine (e.g. its live-simulation button,
   *  galaxy-only). Not settable through context; change the `layout` prop on GraphCanvas itself. */
  layout: 'manual' | 'force' | 'organic' | 'orthogonal' | 'galaxy' | 'force-clustered' | 'ux-navigation' | 'radial-tree'
  /** Whether GraphCanvas is running galaxy layout as a continuous, draggable elastic simulation
   *  instead of a one-shot computed-then-frozen layout. Meaningful only when layout="galaxy" — no
   *  effect otherwise. Read/set by GraphToolbar's live-simulation button. */
  liveSimulation: boolean
  setLiveSimulation: Dispatch<SetStateAction<boolean>>
  /** The currently pointer-hovered node's id, or undefined when none is hovered. Mirrors
   *  GraphCanvas's onNodeHover callback prop — read this instead of wiring up the callback
   *  yourself if a consumer already has access to context. */
  hoveredNodeId?: string
  /** The currently pointer-hovered edge's id (via its invisible hit-stroke), or undefined.
   *  Mirrors GraphCanvas's onEdgeHover callback prop. */
  hoveredEdgeId?: string
}

export const GraphCanvasContext = createContext<GraphCanvasContextValue | null>(null)

export function useGraphCanvas(): GraphCanvasContextValue {
  const ctx = useContext(GraphCanvasContext)
  if (!ctx) throw new Error('useGraphCanvas must be used within a GraphCanvas')
  return ctx
}
