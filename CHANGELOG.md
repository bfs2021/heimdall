# Changelog

All notable changes to `@tinkermonkey/heimdall-ui` are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.1]

### Fixed

- **`GraphCanvas`** — `layout="force-clustered"` no longer smears clusters into each other on
  dense graphs. Each Louvain cluster is now laid out on its own (internal edges only), clusters
  are spaced by their real size, and each cluster is rotated to face the clusters it connects
  to. On the college-football benchmark (115 nodes, 613 edges) node overlaps go from 53 to 0
  and overlapping cluster bubbles from 93% to 2%; layout is also 2-10x faster.

### Added

- **`ChatComposer`** — `enterBehavior` prop (`'send' | 'newline'`, default `'send'`): controls Enter key behavior in the message textarea. When set to `'send'`, bare Enter submits the message and Shift+Enter inserts a newline (default behavior). When set to `'newline'`, bare Enter inserts a newline and Shift+Enter also inserts a newline — Submit only via the Send button. Enables touch-friendly and mobile-optimized input modes without forking or DOM-patching the component. The shortcut hint text automatically hides desktop-specific wording when `enterBehavior='newline'`.

## [0.8.0]

### Added

- **`Tooltip`** — new component (`content`, `children`, `placement`, `delay`, `offset`,
  `disabled`, `open`). Positions relative to its trigger with automatic edge-flip, and supports an
  `open` prop for external/controlled visibility (used by `GraphCanvas`'s node/edge tooltip
  overlays, whose hover state lives on the node or edge rather than on whatever wraps the
  tooltip) — when set, the trigger's own pointer/focus tracking and `delay` are bypassed.
- **`GraphCanvas`** — `nodeTooltip` and `edgeTooltip` render-prop options to show a `Tooltip` over
  a hovered node or edge.
- **`GraphCanvas`** — `onEdgeHover` event, mirroring the existing `onNodeHover`.
- **`GraphCanvas`** — `renderEdge` render-prop (paired with the new exported `EdgeGeometry` type
  and `GraphEdgeShape` component) for fully custom edge rendering, mirroring the existing
  `renderNode`.
- **`useMediaQuery`** — new hook: subscribes to a media query string and returns whether it
  currently matches, updating on change. SSR-safe (returns `false` until mounted).
- **`ShellLayout`** — `mobileBreakpoint` prop (default `768`, matching `Topbar`/`Statusbar`; pass
  `false` to disable): below the breakpoint the sidebar collapses into a slide-over overlay opened
  via a mobile menu toggle instead of the persistent rail.
- **`Drawer`** — `keepMounted` prop: keeps the drawer in the DOM (hidden) while closed instead of
  unmounting it, for consumers that need to preserve its internal state across opens.

### Fixed

- **`Tooltip`** — pointer moving from the trigger onto the tooltip's own content no longer hides
  it immediately; hover now persists across that boundary as intended.

## [0.7.0]

### Added

- **`GraphCanvas`** — `centerOnSelect` prop (default `false`): pans to keep `selectedNodeId`
  centered in the viewport whenever it changes, preserving the current zoom (never re-fits or
  re-zooms). Off by default so existing consumers relying on `selectedNodeId` purely for
  highlighting/inspector wiring see no behavior change. Motivating case: an external selection
  origin — a sidebar, a nav tree — can select a node that's currently off-screen, unlike clicking
  a node directly on the canvas (you had to see it to click it); `centerOnSelect` closes that gap.
  Skipped until the initial mount center/fit has run and while pan/zoom is `locked`, and only acts
  on a genuine change to `selectedNodeId` — it never fights a user's own subsequent pan away from
  the selected node on a re-render. Combining `centerOnSelect` with `fitView` and an already-set
  `selectedNodeId` at mount correctly uses the post-fit zoom rather than a stale pre-fit one; a
  `selectedNodeId` that isn't resolvable yet (e.g. inside a currently-collapsed subtree) is
  retried on a later render instead of being silently given up on.
- **`GraphCanvas`** — `fullscreenContainerRef` prop: pass a ref to an ancestor element and the
  built-in toolbar's Fullscreen button (and `toggleFullscreen`/`isFullscreen` from
  `useGraphCanvas()`) request/track fullscreen on that ancestor instead of GraphCanvas's own root.
  Motivating case: GraphCanvas doesn't accept `children` — it fully owns its internal tree — so a
  consumer composing sibling overlay content next to it (a control strip above it, a
  `DetailDrawer` beside it, the same pattern GraphLayoutsShowcase itself uses) previously lost
  that content the instant Fullscreen was used, since the native Fullscreen API only renders the
  fullscreened element's own DOM subtree. GraphCanvas still measures and lays out against its own
  container's size regardless of which ancestor is actually fullscreened, so nothing else about
  its behavior changes; omitting the prop is identical to previous behavior. Entering/exiting
  fullscreen is bounded and failure-safe: a rejected `requestFullscreen()`/`exitFullscreen()` (no
  permissions-policy grant, a detached or mid-unmount target, ...) is caught and logged via
  `console.warn` instead of surfacing as an unhandled rejection, and the fit applied on entering
  fullscreen no longer stays armed indefinitely waiting for a container resize that may never
  come (a target that's already viewport-sized on entry, say) — it's bounded to a short window
  after entry, so it can't fire later against an unrelated resize instead.

## [0.6.0]

### Added

- **`GraphCanvas`** — opt-in nested bubble-packing layout: `layout="force-clustered"`
  groups nodes into clusters (and clusters of clusters) derived purely from
  edge structure via deterministic Louvain modularity clustering, packs
  them with `d3-hierarchy`, then runs the existing spring simulation within
  each bubble. Trades a larger canvas for a less even, more legible node
  distribution. Renders an additional `.graph-cluster-boundary` circle per
  top-level cluster (see the new `showClusterBoundaries` prop below). New exports: `clusteredForceLayout`,
  `ClusteredLayoutOptions`, `ClusteredLayoutResult`, `louvainCluster`,
  `ClusterEdge`, `ClusterTreeNode`, `LouvainOptions`, `packClusters`,
  `PackedCircle`, `PackOptions`. New dependency: `d3-hierarchy`.
- **`GraphCanvas`** — `onBackgroundClick` prop fires the typical "click empty
  space to deselect" gesture: a press-and-release within a few px of each
  other on genuine canvas background (not a node, edge, or opted-out
  element). A real pan drag never fires it, and it works independently of
  `usePanZoom`'s own drag tracking so it still works while pan/zoom is locked.
- **`DetailDrawer`** — an auto-hiding overlay panel: floats over its nearest
  `position: relative` ancestor (a `GraphCanvas`, for instance) instead of
  reserving dedicated layout space, expanding only once `open` and its
  children are truthy. Translucent/blurred background, no border by default,
  and a left-edge resize handle that highlights in the accent color on hover
  so users can tell it's resizable without a visible seam at rest. New
  exports: `DetailDrawer`, `DetailDrawerProps`.
- **`GraphToolbar`** — a built-in zoom/pan/lock control cluster for
  `GraphCanvas`, shown by default (`showToolbar`, default `true`) in any of
  the 4 corners or 4 edge-centers (`toolbarPosition`, default
  `'bottom-right'`): zoom in, zoom out, zoom to fit, and lock pan/zoom (backed
  by `usePanZoom`'s new `locked` option, which gates wheel/drag/keyboard
  input but not imperative `setZoom`/`setPan`/`zoomToFit` calls). New
  exports: `GraphToolbar`, `GraphToolbarProps`, `GraphToolbarPosition`.
- **`galaxyLayout`** — opt-in `nodeMargin` option, and `GraphCanvas`'s
  existing `nodeMargin` prop (previously `layout="force"` only) now applies
  to `layout="galaxy"` and `layout="force-clustered"` too. Padding is applied
  only during galaxy's settle-cycle separation passes, never its final
  cleanup pass, so the "zero literal overlap" guarantee still holds
  regardless of the margin value. Defaults to `0` (unpadded) for `"galaxy"`
  specifically — unlike `"force"`/`"force-clustered"`, which default to each
  node's own rendered width — since galaxy's radial placement already spaces
  most layouts generously and defaulting padding on would shift every
  existing galaxy layout's node positions for what's a narrow, opt-in-worthy
  edge case (verified on a real 57-node/4-level hierarchy with heavy size
  variance: the tightest sibling pairs went from under 1px apart to 8px+
  with `nodeMargin={12}`, zero overlaps either way).
- **`GraphCanvas`** — `showClusterBoundaries` prop (default `true`) and
  boundary circles now also render under `layout="galaxy"`, not just
  `"force-clustered"` — one per independent root subtree. A root with
  children delegates its group-headship down to each of its own children
  rather than drawing one circle around its entire subtree, so a single deep
  hierarchy (e.g. one root with a dozen direct branches) still reads as
  several legible groups instead of one all-encompassing circle; a childless
  root (an orphan, or a node reachable only via a relational edge) keeps its
  own single-node boundary. Both engines share the same underlying helper,
  newly exported as `boundingCirclesByGroup`.
- **`GraphCanvas`** — non-structural edges (per `isStructuralEdge`) are now
  hidden entirely by default instead of dimmed to a low opacity — line,
  arrow marker, and label all disappear, and the edge isn't clickable while
  hidden. Hovering/selecting a touching node, or `showAllRelations`, still
  reveals them at full opacity, same as before. Removes the internal
  `NON_STRUCTURAL_DIM_OPACITY` constant this replaces.
- **`GraphToolbar`** — a fifth button toggles the canvas container in and out
  of the Fullscreen API. Tracks the platform's own fullscreen state (not
  just its own clicks), so Esc or any other exit path updates the icon too.
  Entering fullscreen also zooms/pans to fit the current nodes once the
  container has actually resized to its new (larger) fullscreen dimensions
  — a previously zoomed-in view no longer stays zoomed into a random corner
  when the canvas suddenly has much more room. Skipped while pan/zoom is
  locked, same as every other automatic viewport change in `GraphCanvas`.
- **`galaxyLayout`** — top-level group boundary circles (the same ones
  `showClusterBoundaries` renders) no longer overlap each other, on by
  default. After the existing per-node settle cycles, a macro separation
  pass treats each group's boundary circle as a single pseudo-node, pushes
  apart any that overlap, then rigidly shifts each group's members by the
  resulting delta — preserving each group's already-correct internal
  arrangement. Computed unconditionally, independent of whether boundaries
  are actually rendered. New `GalaxyLayoutOptions.separateGroups` option
  (default `true`) opts back out. New export: `galaxyGroupHeads` (from
  `utils/graphHierarchy`) — the "a root with children delegates
  group-headship to each of its own children" rule, now shared between this
  pass and `GraphCanvas`'s own boundary rendering so the two always agree on
  what a "group" is.
- **`GraphCanvas`** — opt-in live simulation for `layout="galaxy"`: instead
  of a one-shot computed-then-frozen layout, run a continuous elastic
  simulation. Drag any node ("sun") and its descendants follow in real time,
  spring-pulled toward their algorithmic home position with collision
  detection keeping siblings apart throughout; releasing a node leaves it
  exactly where it was dropped, permanently pinned, same as a static-mode
  drag. A sixth `GraphToolbar` button (galaxy layout only) toggles it —
  purely internal state, no controlling prop. The simulation self-idles
  (stops scheduling animation frames) once movement drops below a small
  threshold for about half a second, and wakes on the next drag. New
  exports: `galaxySimulationStep` (from `utils/galaxyLayout`, the
  single-step primitive `galaxyLayout` itself now loops over),
  `useGalaxySimulation` (new hook, `hooks/useGalaxySimulation`), and a new
  `orbit` icon. `GraphCanvasContextValue` gains `layout` (read-only),
  `liveSimulation`, and `setLiveSimulation`.
  New exports on `GraphCanvasContextValue`: `isFullscreen`,
  `toggleFullscreen`. New icons: `fullscreen`, `fullscreenExit`.
- **`galaxyLayout`** — aspect-ratio-aware placement: a new
  `GalaxyLayoutOptions.aspectRatio` option (container width/height) warps
  every orbital ring from a circle into an ellipse so the layout's overall
  shape leans toward the container's own proportions, instead of always
  producing a footprint that a wide-short or tall-narrow container then has
  to letterbox — the established technique radial tree layouts (e.g.
  Perforce's `IlvTree`, the `d3-radial` library) use for the same problem.
  The correction is computed *relative to the tree's own natural, unwarped
  shape* (measured with a first placement pass) rather than relative to a
  hypothetical circle — a tree with a long single-child chain, in
  particular, is often already far from circular on its own, and correcting
  against the wrong baseline can misjudge the needed warp badly enough to
  move the result in the wrong direction entirely. Both the target ratio and
  the resulting correction factor are clamped to `[1/8, 8]`; the correction
  is then bounded, not by a fixed damping constant, but by a binary search
  over how strong a correction the graph can actually take — `separationPass`'s
  collision floor resists *compression* but not *expansion*, so an
  undamped correction doesn't trade width for height the way it looks like
  it should, it mostly just adds width, and how much depends heavily on the
  graph's own structure (a single fixed damping constant measurably
  under-corrected some real graphs while over-inflating others). The search
  finds the strongest correction whose actual rendered area — measured via
  one real settle step per trial, not just the raw elliptical placement,
  which meaningfully overestimates distortion for graphs with several small
  sibling groups — stays within roughly double the natural (unwarped) area.
  New export `resolveAspectRatioScale` performs this resolution and is what
  `galaxyLayout` calls once per invocation (rather than once per settle
  cycle) and what a live-simulation caller driving `galaxySimulationStep`
  directly should call once per structural/target-ratio change (via its own
  new `resolvedAspectScale` option) rather than paying the search's cost on
  every animation frame. Omitted `aspectRatio` (or exactly `1`) reproduces
  prior circular placement bit-for-bit. `GraphCanvas` feeds its own real
  container aspect ratio in automatically for `layout="galaxy"` (rounded to
  the nearest 5% so sub-pixel resize noise doesn't churn it) and pre-resolves
  it the same way for its own live-simulation loop, and redraws the layout —
  respecting a currently-pinned/dropped node's position exactly — whenever
  that ratio changes meaningfully and pan/zoom isn't locked; live-simulation
  mode eases toward a new shape smoothly via its existing spring mechanism
  instead of snapping. No new `GraphCanvas` prop — the existing lock toggle
  is the complete opt-out. Known limitation: even the strongest correction
  the search allows has a practical ceiling — `separationPass` refuses to
  compress nodes past their own rendered size — so a layout dominated by one
  long chain won't ever fully reach an extreme target ratio; the area-growth
  bound means the *drawn* result deliberately stops short of that ceiling
  too, in exchange for not ballooning the layout's absolute size to get
  there.

### Fixed

- **`GraphCanvas`**: the viewport's visual center didn't survive a container
  resize — most noticeably, toggling Fullscreen would leave pan/zoom at the
  same raw values even though the container had just jumped to a completely
  different size, snapping whatever was centered on screen off to one side.
  A resize (Fullscreen, window resize, a host layout change) now re-anchors
  pan so the same point stays centered.
- **`galaxyLayout`/`boundingCirclesByGroup`**: a group's boundary circle
  (`showClusterBoundaries`) was centered on the plain centroid of its
  members' positions, not on the group's own "sun" node — fine for a
  symmetric subtree, but a deep, lopsided one (a long one-directional chain)
  could drift the centroid well away from the sun itself, drawing the circle
  over empty space and letting members spill past its edge. New
  `boundingCirclesByGroup(..., anchorToHead)` parameter (`GraphCanvas`'s
  galaxy branch passes `true`) centers each circle on the group head's own
  position instead; force-clustered's Louvain clusters, which have no single
  natural anchor, keep the centroid.
- **`GraphCanvas`** live-simulation mode: `showClusterBoundaries`'s rendered
  circles were computed once by the static one-shot layout effect and then
  frozen — while live mode ran, dragging a "sun" moved its own boundary
  circle not at all, even though its descendants correctly followed in real
  time. The live tick now recomputes cluster boundaries too (skipped
  entirely when boundaries aren't shown, to avoid the extra per-frame work).
- **`galaxySimulationStep`**: group separation eroded within the first few
  animation frames of live mode, even with zero user interaction — every
  tick's `homeStrength` nudge pulled each unpinned node straight back toward
  a raw, un-separated home position, since only `galaxyLayout`'s one-shot
  final pass applied `separateGroups` as a single rigid shift on top of
  already-settled positions; nothing kept correcting for it tick after tick.
  `galaxySimulationStep` now group-separates its own per-tick home
  positions too (the group-boundary macro pass only — the individual-node
  safety-net cleanup galaxyLayout's own final pass also runs stays a
  one-shot-only cost), so live mode holds the same non-overlapping bubbles
  its seed layout started with instead of drifting back to full overlap
  within about a second of idling.
- **`galaxySimulationStep`**: dragging a "sun" close enough to another
  group's territory left that OTHER group's real nodes sitting exactly
  where they were, while the dragged group's honestly-reaching boundary
  circle simply grew to enclose them — reading as "I dragged a node into
  another group" even though membership never changed (the fix two commits
  ago kept the *algorithmic target* layout separated, but nothing reacted
  to a group's *actual, currently-dragged* footprint growing into a
  neighbor's actual space). Live ticks now push the other group's real
  positions out of the way instead, the same collision-avoidance reaction
  individual nodes already get — whichever group contains a currently
  pinned/dragged node stays exactly where the user put it; every other
  group yields.
- **`usePanZoom`**: wheel-zoom, drag-to-pan, and keyboard pan/zoom shared a
  single `requestAnimationFrame` ref — if two of those gestures' handlers
  both fired before the frame committed (plausible any time a trackpad
  pinch and a stray pointer event land close together), whichever ran last
  would cancel the others' already-scheduled update before it committed,
  silently dropping that gesture's change for the frame. Each now gets its
  own rAF ref so one input source can no longer clobber another's pending
  update.
- **`GraphCanvas`**: mouse-wheel zoom could occasionally jump to an unrelated
  pan/zoom mid-gesture — `usePanZoom`'s wheel listener calls
  `preventDefault()` to fully own zoom/pan, but that only stops the
  browser's own native handling if JS wins the race for that event; under
  any main-thread load the browser can occasionally act on a wheel event
  first, firing its own native page zoom/scroll for that one event. Adds
  `touch-action: none` to `.graph-canvas`, opting it out of the browser's
  native gesture handling entirely instead of just trying to out-race it —
  the standard fix for a custom-zoom surface (same guidance d3-zoom and
  Mapbox GL give for their own interactive elements).
- **`galaxyLayout`**: root-ring placement sized a root's distance from the
  shared hub off only its own (tiny) radius, with no regard for how far its
  own subtree would go on to spread — a lone orphan and the root of a deep,
  many-node chain started at essentially the same tiny distance. In
  practice this read as a large subtree's own root landing in the shared
  hub's crowded middle, visually disconnected from (and often overlapping)
  its own far-flung descendants, and sitting inside whatever unrelated
  neighboring group happened to also be near that hub — the `GALAXY_DEMO_NODES`
  dataset's "organism" (parent of an entire 9-node biology tree) was the
  case that surfaced it. Root-ring seeding now adds each root's own
  subtree reach (the same recursive orbital-distance math `place()` already
  uses, run once bottom-up first) on top of its existing own-radius term —
  a childless root's placement is unchanged; a root with descendants now
  seeds proportionally farther out, landing on the same radial line as the
  rest of its subtree instead of near the hub.

## [0.5.2]

### Added

- **`GraphCanvas`/`GraphEdge`** — weighted, styled edges: a new `weight`
  prop (0-100) maps to a 1-8px stroke width via a square-root curve so
  low-end differences stay visually distinguishable, plus independent
  `opacity` and `strokeDash` (single value or `[dash, gap]` tuple) controls.
  Arrow markers scale proportionally with stroke width. New export
  `EdgeAnchor` type from `utils/graph`.
- **`Icon`** — six new icons: `image`, `code`, `map`, `sparkles`, `share`,
  `ellipsis`.

### Changed

- **`ShellLayout`** canvas panel is now responsive instead of a fixed
  `min-width: 1100px` — padding steps down at the `1024px` and `640px`
  breakpoints and the canvas reflows instead of forcing horizontal scroll
  on narrower viewports.

### Fixed

- **Graph force layout** (`forceLayout`, used by `GraphCanvas`): nodes could
  settle at force equilibrium with their rendered bounding boxes still
  overlapping, since the simulation treated nodes as dimensionless points.
  Adds a post-process `resolveOverlaps()` pass — capped-displacement
  separation interleaved with spring-only relaxation, then a bounded
  early-exit cleanup — that resolves overlaps without perturbing edge
  crossings. Verified against a real 31-node/33-edge reference layer via the
  project's own layout-quality test loop: node overlaps 7 → 1, zero
  edge-crossing regression (exact parity with the unmodified baseline),
  edge-length-deviation and neighborhood-preservation both improved. The
  first of 8 proposed changes to that loop's regression-gated test to
  actually pass it.
- **Playwright visual regression suite**: `loadSelfHostedFonts()` computed
  the fonts directory via a hardcoded relative `file://` path that broke
  when the package moved to the repo root, silently falling back to a
  system font in every test run and blocked outright by Chromium's
  local-resource policy. Fonts are now loaded through the dev server's
  same-origin `/fonts/` URL instead. `assertFontsLoaded()` previously only
  checked that `@font-face` rules were declared, not that they actually
  loaded — it now checks `document.fonts` status directly. Also fixes
  `calendar.spec.ts`'s "accessibility attributes in month view" test, which
  depended on the real wall-clock date falling inside the fixture's
  hardcoded June 2026 month; the clock is now frozen to that month.
  Linux screenshot baselines regenerated against the corrected renderer.

## [0.5.1]

### Fixed

- **`TraceViewer`** detail panel: long attribute names and values no longer
  overlap. Key and value cells now truncate to a single line with an ellipsis
  and reveal the full text on hover (native `title`); the parent link, service,
  and host values truncate the same way.

## [0.5.0]

### Added

- **`TraceViewer`** — an OpenTelemetry distributed-trace waterfall: span tree,
  service-colored waterfall with a parent→child connector bus, and a fly-out
  detail panel (timing/self-time, identity, attributes, status/exception, trace
  minimap), over a header summary strip. Light + dark canvas, keyboard-navigable
  (ARIA tree), row-virtualized, with brush-to-zoom, hover-sync, and error-jump.
- **Native trace ingestion** — `TraceViewer` accepts `trace` (normalized),
  `otlp` (OTLP/JSON), or `xray` (AWS X-Ray segment document) props.
- **`fromOTLP(payload, opts?)`** — adapter from OTLP/JSON trace data to the
  normalized model (hex/base64 id handling, BigInt nanosecond math, enum
  mapping, attribute flattening, exception events).
- **`fromXRay(segments, opts?)`** — adapter from AWS X-Ray segment documents
  (trace-id reformat, epoch-seconds timing, namespace→kind, fault→error,
  `cause.exceptions`→exception, recursive subsegments).
- Exported trace model + helpers: `Trace`, `TraceSpan`, `TraceMeta`,
  `ServiceInfo`, `SpanStatus`, `SpanKind`, `SpanEvent`, `TraceModel`,
  `TraceModelNode`, `buildTraceModel`, `paletteColor`, `DEFAULT_SERVICE_PALETTE`,
  and the OTLP/X-Ray input types.
