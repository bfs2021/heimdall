---
name: heimdall-graph
description: Heimdall component guide for Graph: GraphCanvas (layout modes, popovers, tooltips, custom node renderers), headless layout engines, GraphNode, GraphEdge, GraphInspector, TopologyNode, HierarchyRow, HierarchyTree
---

Import all components from `@tinkermonkey/heimdall-ui`. Import the CSS once at your app entry point:

```tsx
import '@tinkermonkey/heimdall-ui/css'
```

## GraphCanvas

Pan/zoom canvas for interactive node-edge graphs. Measures each node, runs the chosen layout engine, and draws edges between the measured boxes. Provides context consumed by `GraphEdge`.

```tsx
import { GraphCanvas, type GraphNodeData, type GraphEdgeData } from '@tinkermonkey/heimdall-ui'
```

The edge data type is declared as `GraphEdge` in `GraphCanvas.tsx` but exported as `GraphEdgeData`, because `GraphEdge` is the edge component.

### Props

Core:

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `nodes` | `GraphNodeData[]` | required | Nodes to render |
| `edges` | `GraphEdgeData[]` | `[]` | Edges to render |
| `layout` | `'manual' \| 'force' \| 'organic' \| 'orthogonal' \| 'galaxy' \| 'force-clustered' \| 'radial-tree' \| 'ux-navigation'` | `'manual'` | Layout engine. See [Choosing a layout](#choosing-a-layout) |
| `selectedNodeId` | `string` | — | Controlled selected node ID |
| `onNodeSelect` | `(nodeId: string) => void` | — | Called when a node is clicked or activated with Enter/Space |
| `selectedEdgeId` | `string` | — | Controlled selected edge ID |
| `onEdgeSelect` | `(edgeId: string) => void` | — | Makes edge lines and labels clickable |
| `onNodeHover` / `onEdgeHover` | `(id: string \| undefined) => void` | — | Pointer enter (id) and leave (`undefined`) |
| `onBackgroundClick` | `() => void` | — | Click on empty canvas, not after a pan drag. Clear selection here |
| `renderNode` | `(node, selected, hierarchy?, props?) => ReactNode` | — | Custom node content. See [Custom node renderers](#custom-node-renderers) |
| `renderEdge` | `(edge, geometry: EdgeGeometry) => ReactNode` | — | Custom SVG for an edge, given its computed path, midpoint, label position and angle |
| `fitView` | `boolean` | `false` | Fit the whole graph in view on first layout |
| `fitPadding` | `number` | `40` | Padding (px) around the fitted bounding box |
| `centerOnSelect` | `boolean` | `false` | Pan (keeping zoom) to center `selectedNodeId` when it changes. Use when selection can come from outside the canvas |
| `minZoom` / `maxZoom` | `number` | `0.05` / `8` | Zoom bounds |
| `draggable` | `boolean` | `true` | Nodes can be dragged. The position persists locally until the node list changes |
| `onNodeDragEnd` | `(nodeId, { x, y }) => void` | — | Fires after a real drag (past a small threshold), not a click |
| `showToolbar` | `boolean` | `true` | Built-in zoom / fit / lock / fullscreen toolbar |
| `toolbarPosition` | `GraphToolbarPosition` | `'bottom-right'` | Any corner or edge center |
| `fullscreenContainerRef` | `RefObject<HTMLElement \| null>` | — | Ancestor to fullscreen instead of the canvas root. Must contain the canvas |
| `...HTMLAttributes` | | | Standard div attributes |

Layout and hierarchy (each row says which layouts read it):

| Prop | Type | Default | Read by | Description |
| ---- | ---- | ------- | ------- | ----------- |
| `isStructuralEdge` | `(edge) => boolean` | — | all | `true` = parent/child edge (source is the parent). Builds the hierarchy for `galaxy`, `radial-tree`, `ux-navigation`, `orthogonal` rows, and collapse. When set, non-structural edges are hidden under every layout until an endpoint is hovered or selected |
| `showAllRelations` | `boolean` | `false` | all | With `isStructuralEdge` set, draw every non-structural edge instead of hiding it |
| `structuralEdgeCurvature` | `number` | `0.22` | all | Curvature of structural edges without their own `curvature`. `0` = straight |
| `collapsedNodeIds` | `ReadonlySet<string>` | — | all | Nodes whose structural descendants are hidden. Controlled |
| `onToggleCollapse` | `(nodeId) => void` | — | all | Called when a node's collapse toggle is activated. Update `collapsedNodeIds` here; without it no toggle appears |
| `nodeMargin` | `number` | per engine | `force`, `force-clustered`, `organic`, `galaxy` | Extra clear space around each node. See each layout below |
| `showClusterBoundaries` | `boolean` | `true` (`false` for `galaxy`) | `galaxy`, `force-clustered`, `radial-tree` | Circle around each top-level group |
| `showHierarchyRings` | `boolean` | `false` | `radial-tree` | Ring per occupied depth around each trunk. Visual only |
| `isPageNode` | `(node) => boolean` | — | `ux-navigation`, `orthogonal` | `true` = page, `false` = view. Omitted = every node is a page |
| `isNavigationRoute` | `(edge) => boolean` | — | `ux-navigation`, `orthogonal` | Marks user-flow route edges. Omitted = no routes |

Interaction overlays:

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `nodeTooltip` | `(node) => ReactNode` | — | Content shown near a hovered (or clicked) node |
| `nodeTooltipTrigger` | `'hover' \| 'click'` | `'hover'` | `'click'` renders the content in a `Popover` (`role="dialog"`), so it can hold buttons and links |
| `edgeTooltip` | `(edge) => ReactNode` | — | Same, at the edge path's midpoint |
| `edgeTooltipTrigger` | `'hover' \| 'click'` | `'hover'` | Same as `nodeTooltipTrigger`, for edges |
| `nodePopover` | `(node) => ReactNode` | — | Interactive `role="dialog"` popover on node click or Enter/Space |
| `edgePopover` | `(edge) => ReactNode` | — | Same, anchored at the edge midpoint |

```ts
interface GraphNodeData {
  id: string
  label: string
  kind?: string
  domainColor?: string
  x?: number      // required for layout='manual'; pins the node under every other layout
  y?: number
  weight?: number // layout='galaxy' only: body area grows with weight. Ignored elsewhere
}

interface GraphEdgeData {
  id: string
  sourceId: string
  targetId: string
  label?: string
  variant?: 'default' | 'hot' | 'irrelevant'
  weight?: number                       // 0-100 → 1-8px stroke width. Unrelated to node weight
  opacity?: number                      // 0-1
  strokeDash?: number | [number, number]
  sourceAnchor?: 'auto' | 'left' | 'right' | 'top' | 'bottom'
  targetAnchor?: 'auto' | 'left' | 'right' | 'top' | 'bottom'
  curvature?: number                    // overrides the 0.22 default
}
```

### Choosing a layout

| `layout` | Data shape | Needs | Status |
| -------- | ---------- | ----- | ------ |
| `manual` | Positions known in advance | `x`/`y` on every node | Stable |
| `force` | Arbitrary graphs | — | Kept for compatibility. Prefer `organic` |
| `organic` | General graphs: meshes, dependency graphs, no single hierarchy | — | Proof of concept |
| `orthogonal` | Sparse, mostly-tree graphs of 15-60 nodes; diagrams with right-angle edges | `isStructuralEdge` recommended | Proof of concept |
| `galaxy` | Weighted hierarchy: budgets, headcount, package sizes | `isStructuralEdge`, `weight` | Stable |
| `force-clustered` | Graphs with real community structure | — | Stable |
| `radial-tree` | Strict trees or forests, up to about 35 nodes per trunk | `isStructuralEdge` | Stable |
| `ux-navigation` | App screen maps: pages, views, navigation routes | `isStructuralEdge`, `isPageNode`, `isNavigationRoute` | Stable |

Every engine layout pins nodes that have both `x` and `y`. Nodes without them are placed by the engine.

#### `manual`

Renders each node at its `x`/`y`. A node without both is drawn at `(0, 0)`. No engine runs.

#### `force`

Spring simulation for arbitrary graphs. Nodes without `x`/`y` start on a circle. `nodeMargin` defaults to each node's own rendered width. Kept for compatibility: `organic` gives lower stress and no overlaps on the same data.

#### `organic`

General graphs: stress majorization with guaranteed zero overlap and a minimum gap. Deterministic. Successor to `force`.

- `nodeMargin` is the guaranteed smallest box-to-box gap. Default 24 px.
- Labelled edges reserve room for their label between the two cards.
- Pinned nodes are held exactly.
- Limits (proof of concept): no clustering option yet. Isolated nodes are gridded in one block beneath the connected components. Strict trees read better as `radial-tree` or `orthogonal`.

#### `orthogonal`

Cell-grid placement with axis-parallel edge routes that never cross a node or share a segment. Successor to `ux-navigation`. The routes replace the bezier paths; an edge touching a node being dragged falls back to a live bezier.

- With `isStructuralEdge`, rows follow the structural forest. Without it, rows come from the BFS layering with the fewest crossings.
- With `isPageNode`, a page's views fan out to its right in the same row. `isNavigationRoute` edges are routed last, around everything else.
- `nodeMargin` has no effect.
- Pass `showAllRelations` when `isStructuralEdge` is set: routing every edge is the point of this layout, and non-structural edges are otherwise hidden until hovered.
- Limits (proof of concept): best on sparse, mostly-tree graphs of 15-60 nodes. No edge bundling or incremental routing; trunk sharing (`busTreeEdges`) is available from `orthogonalLayout()` only.

#### `galaxy`

Weighted hierarchy as orbits: body area grows with weight, children orbit their parent heaviest first, nothing overlaps.

- Needs `isStructuralEdge`. Without it every edge counts as structural.
- `GraphNodeData.weight` sets body area (square-root scaled). A node without a weight weighs the sum of its structural children; when no node has one, each node weighs its subtree leaf count. Weights resolve over the full tree, so collapsing a subtree never resizes its parent.
- Without `renderNode`, nodes draw as round bodies coloured by `domainColor`, labelled inside when the body is large enough and named on hover otherwise. With a custom `renderNode`, nodes keep their card shape.
- `nodeMargin` replaces the default gap (0.6 × median body radius, at least 12 px). `0` means touching.
- `showClusterBoundaries` defaults to `false` here.
- Structural edge labels show only when the edge or one of its nodes is hovered or selected. `structuralEdgeCurvature={0}` draws orbit links straight.
- Limits: relational edges can cross bodies.

#### `force-clustered`

Louvain communities laid out as separate bubbles, each rotated to face the clusters it links to. One boundary circle per top-level cluster (`showClusterBoundaries`). `nodeMargin` defaults to each node's width, as in `force`.

- Limits: only as good as the community structure in the data. Flat or single-blob graphs give arbitrary bubbles, and bubbles spread wide on graphs with many cross-community edges.

#### `radial-tree`

One structural tree per trunk, root at the centre and each depth on its own ring. Several trees are packed as separate trunks without overlap.

- Needs `isStructuralEdge`.
- `showClusterBoundaries` (default `true`) draws a circle per trunk. `showHierarchyRings` draws a ring per depth.
- The layout is computed from the fully expanded tree, so collapsing a node hides its descendants without moving any other node.
- Limits: labels stay readable up to about 35 nodes per trunk. Forests get one set of rings per trunk.

#### `ux-navigation`

Page trees top to bottom with view fans to the side; navigation routes appear on hover.

- `isStructuralEdge` is required: under this layout an omitted classifier means no edge is structural, so every node lands in one flat row and every edge is hidden until hovered.
- `isPageNode`: without it every node is a page, so there are no view fans.
- `isNavigationRoute`: route edges stay hidden until a page or view touching them is hovered. Which routes show depends on whether the hovered node is a collapsed page, an expanded page or a view.
- Structural and route labels show only when the edge is in focus.

### Hierarchy and collapse

`collapsedNodeIds` + `onToggleCollapse` work under every layout. The hierarchy comes from `isStructuralEdge` (every edge counts as structural when it is omitted, except under `ux-navigation`).

```tsx
const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
const toggle = useCallback((id: string) => setCollapsed(prev => {
  const next = new Set(prev)
  next.has(id) ? next.delete(id) : next.add(id)
  return next
}), [])

<GraphCanvas
  nodes={nodes}
  edges={edges}
  layout="radial-tree"
  isStructuralEdge={e => e.label === 'contains'}
  collapsedNodeIds={collapsed}
  onToggleCollapse={toggle}
  fitView
  style={{ width: '100%', height: 540 }}
/>
```

On a flat graph, leave `isStructuralEdge`, `collapsedNodeIds` and `onToggleCollapse` unset: without a classifier every edge is structural, so collapse toggles would hide arbitrary neighbours.

### Tooltips and popovers

- `nodeTooltip` / `edgeTooltip` with the default `'hover'` trigger: a non-interactive `role="tooltip"` overlay after a 200 ms hover delay, linked to its target with `aria-describedby`.
- `nodeTooltipTrigger="click"` / `edgeTooltipTrigger="click"`: the same content opens in a `Popover` on click, so it can hold buttons and links.
- `nodePopover` / `edgePopover`: a `role="dialog"` popover that opens on click, or on Enter/Space when focused, and moves focus to its first focusable element. It tracks pan and zoom, and closes on Escape, background click, or click outside the canvas. Only one popover is open at a time.
- A popover and a hover tooltip can be set on the same node. A content callback that returns `null` or `undefined` opens nothing.

```tsx
<GraphCanvas
  nodes={nodes}
  edges={edges}
  layout="organic"
  nodeTooltip={node => <span className="font-mono">{node.id}</span>}
  nodePopover={node => (
    <div>
      <p>{node.label}</p>
      <Button size="sm" onClick={() => openDetail(node.id)}>Open</Button>
    </div>
  )}
  edgePopover={edge => <span>{edge.label}</span>}
  style={{ width: '100%', height: 500 }}
/>
```

### Custom node renderers

`renderNode(node, selected, hierarchy, props)`:

- `hierarchy: GraphNodeHierarchyMeta` — `{ hasChildren, collapsed, hiddenDescendantCount, onToggleCollapse? }`. Use it to draw your own collapse affordance.
- `props: { nodeId, tooltipId?, onSelect?, onPopoverOpen? }`:
  - `onSelect` is `onNodeSelect`. GraphCanvas does not select a custom node on click; the renderer must call it.
  - `onPopoverOpen(element)` is defined when `nodePopover` is set, or `nodeTooltip` with `nodeTooltipTrigger="click"`. Call it on click and on Enter/Space with the node's element, or the popover and click tooltip never open.
  - `tooltipId` is set while the node's hover tooltip is shown. Put it in the node's `aria-describedby`.

The simplest correct renderer forwards everything to `GraphNode`, which already wires click, keyboard, ARIA and `onPopoverOpen`:

```tsx
const renderNode = useCallback<NonNullable<GraphCanvasProps['renderNode']>>(
  (node, selected, hierarchy, props) => (
    <GraphNode
      id={node.id}
      label={node.label}
      kind={node.kind}
      domainColor={node.domainColor}
      selected={selected}
      onSelect={props?.onSelect}
      onPopoverOpen={props?.onPopoverOpen}
      tooltipId={props?.tooltipId}
      hasChildren={hierarchy?.hasChildren}
      collapsed={hierarchy?.collapsed}
      hiddenDescendantCount={hierarchy?.hiddenDescendantCount}
      onToggleCollapse={hierarchy?.onToggleCollapse}
    />
  ),
  [],
)
```

A fully custom element must do the same wiring itself:

```tsx
(node, selected, _hierarchy, props) => {
  const interactive = !!(props?.onSelect || props?.onPopoverOpen)
  const activate = (el: HTMLElement) => {
    props?.onSelect?.(node.id)
    props?.onPopoverOpen?.(el)
  }
  return (
    <div
      className={selected ? 'my-node my-node--selected' : 'my-node'}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-haspopup={props?.onPopoverOpen ? 'dialog' : undefined}
      aria-describedby={props?.tooltipId}
      onClick={e => { e.stopPropagation(); activate(e.currentTarget) }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(e.currentTarget) }
      }}
    >
      {node.label}
    </div>
  )
}
```

### Usage

```tsx
// Manual layout with explicit positions
<GraphCanvas
  nodes={[
    { id: 'cls_cell', x: 200, y: 160, label: 'Cell', kind: 'C', domainColor: 'life' },
    { id: 'cls_nucleus', x: 60, y: 50, label: 'Nucleus', kind: 'C', domainColor: 'life' },
  ]}
  edges={[
    { id: 'e1', sourceId: 'cls_cell', targetId: 'cls_nucleus', label: 'contains' },
  ]}
  selectedNodeId={selectedId}
  onNodeSelect={setSelectedId}
  onBackgroundClick={() => setSelectedId(undefined)}
  style={{ width: '100%', height: 500 }}
/>
```

```tsx
// Organic layout for a general graph (omit x/y)
<GraphCanvas
  nodes={nodes}
  edges={edges}
  layout="organic"
  nodeMargin={32}
  fitView
  selectedNodeId={selectedId}
  onNodeSelect={setSelectedId}
  style={{ width: '100%', height: 500 }}
/>
```

```tsx
// Galaxy: weighted hierarchy
<GraphCanvas
  nodes={[
    { id: 'org', label: 'Org', weight: 1200 },
    { id: 'eng', label: 'Engineering', weight: 700, domainColor: 'software' },
    { id: 'ops', label: 'Operations', weight: 300, domainColor: 'climate' },
  ]}
  edges={[
    { id: 'e1', sourceId: 'org', targetId: 'eng' },
    { id: 'e2', sourceId: 'org', targetId: 'ops' },
  ]}
  layout="galaxy"   // every edge is structural, so isStructuralEdge can be omitted
  fitView
  style={{ width: '100%', height: 540 }}
/>
```

```tsx
// UX navigation: pages, views, routes
interface ScreenNode extends GraphNodeData { isPage: boolean }
interface ScreenLink extends GraphEdgeData { role: 'child' | 'route' }

const isChild = (e: GraphEdgeData) => (e as ScreenLink).role === 'child'
const isRoute = (e: GraphEdgeData) => (e as ScreenLink).role === 'route'
const isPage = (n: GraphNodeData) => (n as ScreenNode).isPage

<GraphCanvas
  nodes={screens}
  edges={links}
  layout="ux-navigation"
  isStructuralEdge={isChild}
  isPageNode={isPage}
  isNavigationRoute={isRoute}
  fitView
  style={{ width: '100%', height: 600 }}
/>
```

The classifiers receive the objects you passed in, so extra fields on your own node and edge types are available after a cast. Define them at module scope or memoize them.

### Gotchas

- **Canvas requires explicit dimensions**: set `style={{ width: '100%', height: 500 }}` or similar on the container.
- Memoize `renderNode`, `renderEdge` and the classifier callbacks with `useCallback`. A new `renderNode` re-measures every node; a new classifier re-runs the layout.
- `isStructuralEdge` also hides edges: once set, a non-structural edge is not rendered (not just dimmed) until an endpoint is hovered or selected, under every layout. Pass `showAllRelations` to keep them all visible, or leave `isStructuralEdge` unset on flat graphs.
- `nodeMargin` means something different per engine: a gap added on top of the node footprint for `force`/`force-clustered` (default: node width), a hard minimum gap for `organic` (default 24), and a replacement orbit gap for `galaxy`.
- Dragging under an engine layout holds the dropped position only until the node list changes. Set `draggable={false}` for read-only views, or persist with `onNodeDragEnd`.
- Errors thrown by `renderNode` and `renderEdge` are logged and that node or edge renders nothing. A throwing classifier is logged and falls back to its omitted-prop default.
- Pan via mouse drag on empty areas; zoom via mouse wheel or the toolbar (0.05×–8× by default).

---

## Headless layout functions

The engines behind GraphCanvas are exported for use outside it: precomputing positions, server-side layout, or a custom renderer. All are deterministic. Positions are node **centers**.

```tsx
import {
  organicLayout,
  orthogonalLayout,
  radialTreeLayout,
  uxNavLayout,
  galaxyLayout,
  buildStructuralForest,
} from '@tinkermonkey/heimdall-ui'
```

Nodes are `LayoutNode`: `{ id, x, y, width, height, pinned? }`. `width`/`height` are the rendered box size. Pass `x: NaN, y: NaN` for a node with no position yet. `organicLayout`, `orthogonalLayout` and `galaxyLayout` hold a node with `pinned: true` and finite `x`/`y`; `radialTreeLayout` and `uxNavLayout` ignore input positions.

| Function | Signature | Returns |
| -------- | --------- | ------- |
| `organicLayout` | `(nodes, edges: { source, target, length?, label? }[], options?: OrganicLayoutOptions)` | `{ positions, stressHistory, stats }` |
| `orthogonalLayout` | `(nodes, edges: { source, target, structural?, navigationRoute? }[], options?: OrthogonalLayoutOptions)` | `{ positions, routes, groups, cell, origin, stats }` |
| `radialTreeLayout` | `(nodes, edges: HierarchyEdge[], dims, forest: StructuralForest, options?: RadialTreeLayoutOptions)` | `{ positions, trunkBoundaries, ringGeometry }` |
| `uxNavLayout` | `(nodes, edges: HierarchyEdge[], dims, isPageNode: (node) => boolean, options?: UxNavLayoutOptions)` | `Map<id, { x, y }>` |
| `galaxyLayout` | `(nodes: GalaxyLayoutNode[], edges: GalaxyLayoutEdge[], options?: GalaxyLayoutOptions)` | `Map<id, { x, y }>` |

`HierarchyEdge` and `GalaxyLayoutEdge` are `{ source, target, structural: boolean }` (source = parent). `dims` is a `Map<id, { width, height }>`.

Options:

- **`OrganicLayoutOptions`**: `preferredEdgeLength` (160), `minimumNodeDistance` (24), `compactness` 0-1 (0.5), `componentSpacing` (40), `maxIterations` (300), `tolerance` (1e-4), `scope` (`'auto' | 'all' | 'affected'`), `affectedIds`. Re-running on its own output is a no-op; after changing the graph, name the nodes to re-settle in `affectedIds` or pass `scope: 'all'`.
- **`OrthogonalLayoutOptions`**: `clearance` (10), `laneSpacing` (16), `lanes` (4), `bendPenalty`, `crossingPenalty`, `componentGap` (1 cell), `orderingSweeps` (6), `isPageNode: (id) => boolean`, `busTreeEdges` (false), `scope` (`'auto' | 'cold' | 'sketch'`). `routes[i]` is the polyline for `edges[i]`, from source box boundary to target box boundary.
- **`RadialTreeLayoutOptions`**: `ringSpacing` (80), `nodeSeparationGap` (12), `trunkPadding` (6). Build `forest` with `buildStructuralForest(allNodeIds, edges)` over the full node list, so collapsed nodes keep their slots.
- **`UxNavLayoutOptions`**: `rowSpacing` (80), `columnSpacing` (60), `viewFanGap` (40), `viewSpacing` (20), `trunkSpacing` (120), `maxRowWidth` (1024). A view with several parent pages appears once per parent, keyed `viewId:parentId`.
- **`GalaxyLayoutOptions`**: `nodeSpread` (0.6 × median body radius), `nodeMargin` (replaces that gap), `startAngle` (π, 9 o'clock), `aspectRatio`, `homeStrength`. `GalaxyLayoutNode` adds `weight?` and `radius?` (true radius of a round body) to `LayoutNode`. `settleCycles`, `separateGroups` and `resolvedAspectScale` are deprecated and ignored.

```ts
const { positions, routes } = orthogonalLayout(
  nodes.map(n => ({ id: n.id, x: NaN, y: NaN, width: 140, height: 32 })),
  edges.map(e => ({ source: e.sourceId, target: e.targetId, structural: e.label === 'contains' })),
)
```

Also exported: `forceLayout`, `clusteredForceLayout`, `buildStructuralForest`, `structuralDescendants`, `visibleNavigationEdgeIds`, `louvainCluster`, `packClusters`.

---

## GraphNode

Node card for use inside `GraphCanvas` via the `renderNode` prop.

```tsx
import { GraphNode } from '@tinkermonkey/heimdall-ui'
```

### Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `id` | `string` | required | Node identifier |
| `label` | `string` | required | Display text |
| `kind` | `string` | — | Type badge (e.g. `'C'` for class) |
| `domainColor` | `string` | `'default'` | Domain color key |
| `selected` | `boolean` | `false` | Selected state |
| `onSelect` | `(id: string) => void` | — | Makes node keyboard-focusable when provided |
| `onPopoverOpen` | `(el: HTMLElement) => void` | — | Called on click and Enter/Space. Forward `renderNode`'s `props.onPopoverOpen` |
| `tooltipId` | `string` | — | Set as `aria-describedby`. Forward `renderNode`'s `props.tooltipId` |
| `popoverOpen` | `boolean` | — | Sets `aria-expanded` when `onPopoverOpen` is set |
| `popoverPanelId` | `string` | — | Sets `aria-controls` when `onPopoverOpen` is set |
| `hasChildren` | `boolean` | `false` | Node has structural children |
| `collapsed` | `boolean` | `false` | Children are collapsed |
| `hiddenDescendantCount` | `number` | `0` | Descendants hidden by the collapse; shown as a badge when collapsed |
| `onToggleCollapse` | `() => void` | — | Shift+Enter toggles collapse |
| `bodyRadius` | `number` | — | Draws a round body of this radius instead of a card (the `galaxy` default) |
| `...HTMLAttributes` | | | Standard div attributes |

### Usage

```tsx
// Inside GraphCanvas renderNode callback
renderNode={(node, selected, hierarchy, props) => (
  <GraphNode
    id={node.id}
    label={node.label}
    kind={node.kind}
    domainColor={node.domainColor}
    selected={selected}
    onSelect={props?.onSelect}
    onPopoverOpen={props?.onPopoverOpen}
    tooltipId={props?.tooltipId}
  />
)}
```

### Gotchas

- When `onSelect` or `onPopoverOpen` is provided: sets `role="button"` and `tabIndex={0}`; Enter/Space trigger selection and the popover. `aria-pressed={selected}` is set only with `onSelect`
- Click handler stops propagation so canvas pan is not triggered
- When used without `onSelect`, the node is read-only with no keyboard interaction

---

## GraphEdge

SVG bezier edge between two nodes. Must be used inside `GraphCanvas` (requires its context).

```tsx
import { GraphEdge } from '@tinkermonkey/heimdall-ui'
```

### Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `id` | `string` | required | Unique edge identifier |
| `sourceId` | `string` | required | Source node ID |
| `targetId` | `string` | required | Target node ID |
| `label` | `string` | — | Text label at path midpoint |
| `variant` | `'default' \| 'hot' \| 'irrelevant'` | `'default'` | Visual style |
| `...SVGAttributes` | | | Standard SVG `<g>` attributes |

Variants: `default`=neutral gray, `hot`=cyan (active/highlighted), `irrelevant`=rose (deprecated).

### Usage

```tsx
// Passed via GraphCanvas edges prop (preferred)
<GraphCanvas
  edges={[
    { id: 'e1', sourceId: 'node_a', targetId: 'node_b', label: 'contains' },
    { id: 'e2', sourceId: 'node_c', targetId: 'node_d', variant: 'hot', label: 'encodes' },
    { id: 'e3', sourceId: 'node_e', targetId: 'node_f', variant: 'irrelevant', label: 'deprecated' },
  ]}
  ...
/>
```

### Gotchas

- **Must be used inside `GraphCanvas`** — `GraphEdge` calls `useGraphCanvas()` internally and will throw if used outside a canvas
- Returns `null` silently if either the source or target node rect is not yet available (e.g. during initial layout)
- Bezier curves connect the edges of node rectangles, not center points

---

## GraphInspector

Structured detail panel for a selected graph node with relationship links.

```tsx
import { GraphInspector } from '@tinkermonkey/heimdall-ui'
```

### Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `node` | `GraphNodeMetadata \| null` | — | Node to inspect; `null` shows empty state |
| `relationships` | `RelationshipLink[]` | `[]` | Incoming and outgoing links |
| `onNodeSelect` | `(nodeId: string) => void` | — | Called when a relationship target is clicked |
| `emptyStateText` | `string` | `'Select a node to inspect.'` | Empty state message |
| `...HTMLAttributes` | | | Standard div attributes |

```ts
interface GraphNodeMetadata {
  id: string
  title: string
  kind?: string
  domain?: string
  description?: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}

interface RelationshipLink {
  id: string
  target: string
  targetTitle: string
  targetDomain?: string
  predicate: string
  direction: 'in' | 'out'
}
```

### Usage

```tsx
<GraphInspector
  node={selectedNode}
  relationships={relationships}
  onNodeSelect={setSelectedId}
  emptyStateText="Click a node to inspect it."
/>
```

```tsx
// Full example
const node: GraphNodeMetadata = {
  id: 'cls_organism',
  title: 'Organism',
  kind: 'C',
  domain: 'life',
  description: 'Any individual living entity.',
  metadata: { kind: 'Class', domain: 'life', individuals: 428 },
}

const relationships: RelationshipLink[] = [
  { id: 'r1', predicate: 'contains', target: 'cls_cell', targetTitle: 'Cell', targetDomain: 'life', direction: 'out' },
  { id: 'r2', predicate: 'instanceOf', target: 'cls_eukaryote', targetTitle: 'Eukaryote', direction: 'in' },
]

<GraphInspector node={node} relationships={relationships} onNodeSelect={setSelectedId} />
```

### Gotchas

- Relationships are split into incoming (`direction='in'`) and outgoing (`direction='out'`) sections by the component
- Relationship target labels are clickable buttons that call `onNodeSelect`

---

## TopologyNode

Infrastructure/service node card with status indicator and metric progress bars. Supports absolute positioning for canvas layouts.

```tsx
import { TopologyNode } from '@tinkermonkey/heimdall-ui'
```

### Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `title` | `string` | required | Service name |
| `nodeRole` | `string` | `''` | Role label below title |
| `status` | `'ok' \| 'warning' \| 'error' \| 'idle'` | `'idle'` | Status dot color |
| `metrics` | `TopologyNodeMetric[]` | `[]` | Metric rows with progress bars |
| `selected` | `boolean` | `false` | Amber border ring |
| `x` | `number` | — | Absolute left position (px) |
| `y` | `number` | — | Absolute top position (px) |
| `onSelect` | `() => void` | — | Makes node keyboard-focusable when provided |
| `...HTMLAttributes` | | | Standard div attributes |

```ts
interface TopologyNodeMetric {
  label: string
  value: number | string
  unit?: string
  percent: number           // progress bar fill 0–100 (clamped)
  sparklineData: number[]   // reserved, not currently rendered
  color?: StatusColor
}
```

Status → dot color: `ok`=emerald, `warning`=amber, `error`=rose, `idle`=neutral.

### Usage

```tsx
// In a positioned canvas
<div style={{ position: 'relative', height: 400 }}>
  <TopologyNode
    title="API Server"
    nodeRole="backend"
    status="ok"
    metrics={[
      { label: 'CPU', value: '45%', percent: 45, sparklineData: [], color: 'emerald' },
      { label: 'Memory', value: '62%', percent: 62, sparklineData: [], color: 'amber' },
    ]}
    x={100}
    y={80}
    selected={selected === 'api'}
    onSelect={() => setSelected('api')}
  />
</div>
```

### Gotchas

- When `x` and `y` are provided, the component uses `position: absolute` — the parent must be `position: relative`
- `percent` is clamped to `[0, 100]`
- When `onSelect` is not provided, the node is non-interactive (no `role`, no `tabIndex`)

---

## HierarchyRow

A single row in a taxonomy/hierarchy tree with depth indentation, domain color swatch, and kind badge.

```tsx
import { HierarchyRow } from '@tinkermonkey/heimdall-ui'
```

### Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `domain` | `'life' \| 'climate' \| 'software' \| 'default' \| string` | required | Controls swatch color |
| `kind` | `'taxonomy' \| 'scheme' \| 'class'` | required | Type badge |
| `label` | `string` | required | Display text |
| `depth` | `number` | `0` | Indentation level |
| `meta` | `string` | — | Metadata (e.g. item count) |
| `description` | `string` | — | Secondary text on the right |
| `selected` | `boolean` | `false` | Selected state |
| `onSelect` | `() => void` | — | Makes row keyboard-interactive when provided |
| `showKind` | `boolean` | `true` | Show the kind badge |
| `...HTMLAttributes` | | | Standard div attributes |

### Usage

```tsx
// Inside HierarchyTree
<HierarchyRow
  depth={0}
  kind="taxonomy"
  label="root_taxonomy"
  domain="life"
  description="Root taxonomy for life sciences"
/>
```

```tsx
// Interactive with selection
<HierarchyRow
  depth={1}
  kind="scheme"
  label="public_scheme"
  domain="life"
  meta="8 classes"
  description="Public classification scheme"
  selected={selected === 'public_scheme'}
  onSelect={() => setSelected('public_scheme')}
/>
```

### Gotchas

- A connector line renders at `depth > 0` only — depth-0 rows have no left connector
- Domain color falls back to `--dom-default` for unknown domain strings
- When `onSelect` is not provided, the row is non-interactive (no `role`, no `tabIndex`)

---

## HierarchyTree

Semantic container for `HierarchyRow` items.

```tsx
import { HierarchyTree } from '@tinkermonkey/heimdall-ui'
```

### Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `children` | `ReactNode` | required | `HierarchyRow` components |
| `...HTMLAttributes` | | | Standard div attributes |

### Usage

```tsx
<HierarchyTree>
  <HierarchyRow depth={0} kind="taxonomy" label="root_taxonomy" domain="life" />
  <HierarchyRow depth={1} kind="scheme" label="public_scheme" domain="life" meta="8 classes" selected={selected === 1} onSelect={() => setSelected(1)} />
  <HierarchyRow depth={2} kind="class" label="cls_organism" domain="life" description="Individual organisms" />
</HierarchyTree>
```

```tsx
// Dynamic with selection
<HierarchyTree>
  {rows.map((row, idx) => (
    <HierarchyRow
      key={idx}
      {...row}
      selected={selected === idx}
      onSelect={() => setSelected(selected === idx ? null : idx)}
    />
  ))}
</HierarchyTree>
```

### Gotchas

- `HierarchyTree` is a simple container with no built-in selection, expand/collapse, or virtualization logic — manage these in the parent
