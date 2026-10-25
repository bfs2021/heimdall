import { useState, useCallback } from 'react'
import {
  GraphCanvas,
  GraphNode,
  GraphInspector,
  GraphEdgeInspector,
  TopologyNode,
  DetailDrawer,
  type GraphNodeData,
  type GraphEdgeData,
  type GraphNodeMetadata,
  type GraphEdgeMetadata,
  type RelationshipLink,
} from '@tinkermonkey/heimdall-ui'
import { PageHeader, ShowcaseSection, DemoCard, PropsTable, PropRow } from '../components/ShowcaseSection'

const NODES: (GraphNodeData & { title?: string; domain?: string; description?: string })[] = [
  { id: 'cls_cell', x: 200, y: 160, label: 'Cell', kind: 'C', domainColor: 'life', title: 'Cell', domain: 'life', description: 'Basic unit of life' },
  { id: 'cls_nucleus', x: 60, y: 50, label: 'Nucleus', kind: 'C', domainColor: 'life', title: 'Nucleus', domain: 'life' },
  { id: 'cls_mito', x: 340, y: 45, label: 'Mitochondrion', kind: 'C', domainColor: 'life', title: 'Mitochondrion', domain: 'life' },
  { id: 'cls_protein', x: 450, y: 200, label: 'Protein', kind: 'C', domainColor: 'life', title: 'Protein', domain: 'life' },
]

const EDGES: GraphEdgeData[] = [
  { id: 'e1', sourceId: 'cls_cell', targetId: 'cls_nucleus', label: 'contains' },
  { id: 'e2', sourceId: 'cls_cell', targetId: 'cls_mito', label: 'contains' },
  { id: 'e3', sourceId: 'cls_nucleus', targetId: 'cls_protein', label: 'encodes' },
]

const TOPOLOGY_NODES = [
  {
    title: 'API Server',
    role: 'backend',
    status: 'ok' as const,
    metrics: [
      { label: 'CPU', value: '45%', percent: 45, sparklineData: [20, 30, 45, 40, 50, 45], color: 'emerald' as const },
      { label: 'Memory', value: '62%', percent: 62, sparklineData: [55, 58, 60, 62, 61, 62], color: 'amber' as const },
    ],
  },
  {
    title: 'Database',
    role: 'storage',
    status: 'warning' as const,
    metrics: [
      { label: 'Connections', value: '342/500', percent: 68, sparklineData: [60, 65, 68, 70, 68, 68], color: 'amber' as const },
    ],
  },
  {
    title: 'Cache',
    role: 'cache',
    status: 'ok' as const,
    metrics: [
      { label: 'Hit Rate', value: '94%', percent: 94, sparklineData: [90, 92, 93, 94, 94, 94], color: 'emerald' as const },
    ],
  },
  {
    title: 'Message Queue',
    role: 'queue',
    status: 'error' as const,
    metrics: [
      { label: 'Backlog', value: '1.2K', percent: 85, sparklineData: [20, 40, 60, 80, 85, 85], color: 'rose' as const },
    ],
  },
]

const EDGE_VARIANT_NODES: GraphNodeData[] = [
  { id: 'ev_a', x: 60, y: 80, label: 'Source A', kind: 'C', domainColor: 'life' },
  { id: 'ev_b', x: 300, y: 80, label: 'Target B', kind: 'C', domainColor: 'life' },
  { id: 'ev_c', x: 60, y: 200, label: 'Source C', kind: 'C', domainColor: 'software' },
  { id: 'ev_d', x: 300, y: 200, label: 'Target D', kind: 'C', domainColor: 'software' },
  { id: 'ev_e', x: 60, y: 320, label: 'Source E', kind: 'C', domainColor: 'climate' },
  { id: 'ev_f', x: 300, y: 320, label: 'Target F', kind: 'C', domainColor: 'climate' },
]

const EDGE_VARIANT_EDGES: GraphEdgeData[] = [
  { id: 'ee1', sourceId: 'ev_a', targetId: 'ev_b', label: 'contains' },
  { id: 'ee2', sourceId: 'ev_c', targetId: 'ev_d', label: 'encodes', variant: 'hot' },
  { id: 'ee3', sourceId: 'ev_e', targetId: 'ev_f', label: 'deprecated', variant: 'irrelevant' },
]

export function GraphEdgeShowcase() {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>()

  const renderNode = useCallback((node: GraphNodeData) => (
    <GraphNode id={node.id} label={node.label} kind={node.kind} domainColor={node.domainColor} />
  ), [])

  return (
    <div>
      <PageHeader name="GraphEdge" description="SVG bezier edge drawn between two nodes inside a GraphCanvas. Supports variant styling for active and deprecated relationships, and click-to-select on either the line or its label." />
      <ShowcaseSection label="Variant comparison" description="Default (neutral), hot (active/highlighted), and irrelevant (deprecated/dashed) variants shown side-by-side. Hover a line or its label; click one to select it.">
        <DemoCard>
          <div style={{ height: 400 }}>
            <GraphCanvas
              nodes={EDGE_VARIANT_NODES}
              edges={EDGE_VARIANT_EDGES}
              renderNode={renderNode}
              selectedEdgeId={selectedEdgeId}
              onEdgeSelect={setSelectedEdgeId}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </DemoCard>
      </ShowcaseSection>
      <ShowcaseSection label="Props">
        <PropsTable>
          <PropRow name="id" type="string" description="Unique edge identifier" />
          <PropRow name="sourceId" type="string" description="ID of the source node" />
          <PropRow name="targetId" type="string" description="ID of the target node" />
          <PropRow name="label" type="string" description="Optional text label rendered along the edge. Automatically nudged off its default midpoint to clear nearby nodes (see findClearLabelPosition), never repositioned onto another edge or node's path." />
          <PropRow name="variant" type="'default' | 'hot' | 'irrelevant'" def="'default'" description="Visual style: default is neutral, hot highlights an active relationship in amber, irrelevant renders a dashed rose line for deprecated links" />
          <PropRow name="selected" type="boolean" def="false" description="Renders the line and label in the accent color" />
          <PropRow name="onSelect" type="(id: string) => void" description="Called when the line or label is clicked, or activated via Enter/Space while focused. Without it the edge renders but isn't interactive." />
        </PropsTable>
      </ShowcaseSection>
    </div>
  )
}

export function GraphNodeShowcase() {
  const [selectedId, setSelectedId] = useState<string | undefined>()

  return (
    <div>
      <PageHeader name="GraphNode" description="Inline node chip used within GraphCanvas. Displays a colored domain swatch, a label, and an optional kind badge." />
      <ShowcaseSection label="Domain color variants">
        <DemoCard>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <GraphNode id="n1" label="Default" onSelect={setSelectedId} selected={selectedId === 'n1'} />
            <GraphNode id="n2" label="Life" domainColor="life" onSelect={setSelectedId} selected={selectedId === 'n2'} />
            <GraphNode id="n3" label="Climate" domainColor="climate" onSelect={setSelectedId} selected={selectedId === 'n3'} />
            <GraphNode id="n4" label="Software" domainColor="software" onSelect={setSelectedId} selected={selectedId === 'n4'} />
          </div>
        </DemoCard>
      </ShowcaseSection>
      <ShowcaseSection label="With kind badge">
        <DemoCard>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <GraphNode id="n5" label="Organism" kind="C" domainColor="life" onSelect={setSelectedId} selected={selectedId === 'n5'} />
            <GraphNode id="n6" label="individual" kind="individual" domainColor="life" onSelect={setSelectedId} selected={selectedId === 'n6'} />
            <GraphNode id="n7" label="API Server" kind="svc" domainColor="software" onSelect={setSelectedId} selected={selectedId === 'n7'} />
          </div>
        </DemoCard>
      </ShowcaseSection>
      <ShowcaseSection label="Selected state">
        <DemoCard>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <GraphNode id="s1" label="Not selected" domainColor="life" onSelect={setSelectedId} selected={false} />
            <GraphNode id="s2" label="Selected" domainColor="life" kind="C" onSelect={setSelectedId} selected />
          </div>
        </DemoCard>
      </ShowcaseSection>
      <ShowcaseSection label="Non-interactive (read-only)">
        <DemoCard>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <GraphNode id="r1" label="Read-only" domainColor="climate" />
            <GraphNode id="r2" label="Read-only with kind" domainColor="software" kind="svc" />
          </div>
        </DemoCard>
      </ShowcaseSection>
      <ShowcaseSection label="Props">
        <PropsTable>
          <PropRow name="id" type="string" description="Unique node identifier passed back to onSelect" />
          <PropRow name="label" type="string" description="Primary text displayed in the node" />
          <PropRow name="kind" type="string" description="Optional type badge rendered in monospace beside the label" />
          <PropRow name="domainColor" type="string" def="'default'" description="Named domain key used to color the left swatch (e.g. 'life', 'climate', 'software')" />
          <PropRow name="selected" type="boolean" def="false" description="Renders the node in the selected/highlighted state" />
          <PropRow name="onSelect" type="(id: string) => void" description="Called when the node is clicked or activated via keyboard. When provided the node is keyboard-focusable." />
        </PropsTable>
      </ShowcaseSection>
    </div>
  )
}

export function GraphCanvasShowcase() {
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>()
  const [drawerWidth, setDrawerWidth] = useState(320)

  const handleNodeSelect = useCallback((id: string) => {
    setSelectedId(id)
    setSelectedEdgeId(undefined)
  }, [])

  const handleEdgeSelect = useCallback((id: string) => {
    setSelectedEdgeId(id)
    setSelectedId(undefined)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setSelectedId(undefined)
    setSelectedEdgeId(undefined)
  }, [])

  const renderNode = useCallback((node: GraphNodeData, selected: boolean) => (
    <GraphNode
      id={node.id}
      label={node.label}
      kind={node.kind}
      domainColor={node.domainColor}
      selected={selected}
      onSelect={handleNodeSelect}
    />
  ), [handleNodeSelect])

  const selectedNode = NODES.find(n => n.id === selectedId)
  const inspectorData: GraphNodeMetadata | undefined = selectedNode
    ? {
        id: selectedNode.id,
        title: selectedNode.title ?? selectedNode.label,
        kind: selectedNode.kind,
        domain: selectedNode.domain,
        description: selectedNode.description,
        metadata: {
          kind: selectedNode.kind ?? '—',
          domain: selectedNode.domain ?? '—',
        },
      }
    : undefined

  const relationships: RelationshipLink[] = EDGES
    .filter(e => selectedId && (e.sourceId === selectedId || e.targetId === selectedId))
    .map(e => {
      const isOutgoing = e.sourceId === selectedId
      const otherId = isOutgoing ? e.targetId : e.sourceId
      const otherNode = NODES.find(n => n.id === otherId)
      return {
        id: e.id,
        predicate: e.label ?? '',
        target: otherId,
        targetTitle: otherNode?.label ?? otherId,
        targetDomain: otherNode?.domain,
        direction: isOutgoing ? 'out' as const : 'in' as const,
      }
    })

  const selectedEdge = EDGES.find(e => e.id === selectedEdgeId)
  const edgeSource = selectedEdge && NODES.find(n => n.id === selectedEdge.sourceId)
  const edgeTarget = selectedEdge && NODES.find(n => n.id === selectedEdge.targetId)
  const edgeInspectorData: GraphEdgeMetadata | undefined = selectedEdge && edgeSource && edgeTarget
    ? {
        id: selectedEdge.id,
        predicate: selectedEdge.label ?? 'related',
        sourceId: edgeSource.id,
        sourceTitle: edgeSource.title ?? edgeSource.label,
        sourceDomain: edgeSource.domain,
        targetId: edgeTarget.id,
        targetTitle: edgeTarget.title ?? edgeTarget.label,
        targetDomain: edgeTarget.domain,
        variant: selectedEdge.variant,
      }
    : undefined

  return (
    <div>
      <PageHeader name="GraphCanvas" description="Pan-and-zoom SVG/HTML graph canvas. Renders GraphNode children positioned at (x, y) and GraphEdge children as bezier curves between nodes." />
      <ShowcaseSection label="Interactive canvas" description="Pan by dragging the canvas; scroll to zoom, anchored under the cursor — or use the corner toolbar, which can also lock pan/zoom and go fullscreen. Click a node or an edge (line or label) to open a detail panel over the canvas.">
        <DemoCard>
          <div style={{ height: 360, position: 'relative' }}>
            <GraphCanvas
              nodes={NODES}
              edges={EDGES}
              selectedNodeId={selectedId}
              onNodeSelect={handleNodeSelect}
              selectedEdgeId={selectedEdgeId}
              onEdgeSelect={handleEdgeSelect}
              onBackgroundClick={handleBackgroundClick}
              renderNode={renderNode}
              style={{ width: '100%', height: '100%' }}
            />

            {/* Floats over the canvas — auto-expands once something's selected, auto-hides
                otherwise, rather than reserving dedicated layout space at all times. */}
            <DetailDrawer open={!!(inspectorData || edgeInspectorData)} width={drawerWidth} onWidthChange={setDrawerWidth}>
              {edgeInspectorData
                ? <GraphEdgeInspector edge={edgeInspectorData} onNodeSelect={handleNodeSelect} />
                : inspectorData && <GraphInspector node={inspectorData} relationships={relationships} />
              }
            </DetailDrawer>
          </div>
        </DemoCard>
      </ShowcaseSection>
      <ShowcaseSection label="Props (GraphCanvas)">
        <PropsTable>
          <PropRow name="nodes" type="GraphNodeData[]" description="Node positions and metadata used to place and render nodes" />
          <PropRow name="edges" type="GraphEdgeData[]" def="[]" description="Edge definitions linking node IDs with optional labels" />
          <PropRow name="selectedNodeId" type="string" description="Currently selected node ID (controlled)" />
          <PropRow name="onNodeSelect" type="(id: string) => void" description="Called when a node is clicked" />
          <PropRow name="centerOnSelect" type="boolean" def="false" description="Pans (preserving the current zoom — never re-fits or re-zooms) to keep selectedNodeId centered whenever it changes. For selection originating outside the canvas (a sidebar, a nav tree, a search result), which can pick a node that's currently off-screen; a click on the canvas doesn't need it, since you had to see the node to click it. Skipped until the initial mount center/fit has run and while pan/zoom is locked." />
          <PropRow name="selectedEdgeId" type="string" description="Currently selected edge ID (controlled)" />
          <PropRow name="onEdgeSelect" type="(id: string) => void" description="Called when an edge's line or label is clicked. Without it, edges render but aren't interactive." />
          <PropRow name="onBackgroundClick" type="() => void" description="Called when empty canvas background is clicked — the 'click away to deselect' gesture. A genuine pan drag never fires it. Pair with clearing selectedNodeId/selectedEdgeId yourself." />
          <PropRow name="renderNode" type="(node: GraphNodeData, selected: boolean) => ReactNode" description="Custom node renderer. Omit to use the default GraphNode." />
          <PropRow name="layout" type="'manual' | 'force' | 'galaxy' | 'force-clustered'" def="'manual'" description="'manual' uses explicit x/y per node; 'force' runs a spring layout; 'galaxy' arranges nodes as a radial hierarchy of orbits built from structural edges; 'force-clustered' groups nodes into nested bubbles by graph structure (Louvain community detection + circle packing), then runs the same spring simulation within each bubble" />
          <PropRow name="nodeMargin" type="number" description="layout='force' | 'galaxy' | 'force-clustered'. Breathing room kept clear around each node's own footprint, on top of what's needed to avoid overlap — without it, connected nodes can settle boxes-nearly-flush, leaving little to no visible edge between them. Defaults differ by engine: 'force' and 'force-clustered' default to each node's own rendered width; 'galaxy' uses its own gap (0.6 × the median body radius, at least 12px), which a number given here replaces. Pass a fixed number to use the same margin for any engine, or 0 for the tightest legal packing." />
          <PropRow name="showClusterBoundaries" type="boolean" def="true (galaxy: false)" description="layout='galaxy' | 'force-clustered' | 'radial-tree'. Shows a boundary circle around each top-level group the engine produced — force-clustered draws one per top-level Louvain cluster; galaxy draws the smallest circle around each planet's system (a root with several children gives each child its own). Off by default for galaxy, whose grouping reads from orbits and colour." />
          <PropRow name="isStructuralEdge" type="(edge: GraphEdgeData) => boolean" description="Classifies an edge as structural (shapes the 'galaxy' hierarchy, source = parent) vs. relational (rendered but layout-irrelevant, hidden entirely unless hovered/selected or showAllRelations is set). Omit to treat every edge as structural." />
          <PropRow name="showAllRelations" type="boolean" def="false" description="With isStructuralEdge set, renders every non-structural edge instead of hiding it (line, marker, and label alike)" />
          <PropRow name="collapsedNodeIds" type="ReadonlySet<string>" description="IDs of nodes whose structural descendants (per isStructuralEdge) should be hidden — the collapsed node itself stays visible. Controlled: pair with onToggleCollapse or nothing changes when a node's toggle is clicked." />
          <PropRow name="onToggleCollapse" type="(nodeId: string) => void" description="Called when a node's collapse/expand affordance is activated. Wiring this is also what makes the default GraphNode render its collapse toggle at all." />
          <PropRow name="draggable" type="boolean" def="true" description="Lets a node be repositioned by dragging it. The dropped position persists locally (overriding explicit x/y or the computed layout position) until the node list changes — it isn't written back to the nodes prop. Set false for a read-only view, or when a force/galaxy layout recomputing would just undo the manual move anyway." />
          <PropRow name="onNodeDragEnd" type="(nodeId: string, position: { x: number; y: number }) => void" description="Called once a drag ends, with the node's new position. Only fires for an actual drag past a small movement threshold, not a plain click." />
          <PropRow name="minZoom" type="number" def="0.05" description="Lower zoom bound. Permissive by default so a large graph can always be zoomed out far enough to fit in frame." />
          <PropRow name="maxZoom" type="number" def="8" description="Upper zoom bound." />
          <PropRow name="showToolbar" type="boolean" def="true" description="Shows the built-in zoom in/out/fit, pan-and-zoom-lock, fullscreen, and (layout='galaxy' only) live-simulation toolbar. Set false to omit it entirely." />
          <PropRow name="toolbarPosition" type="GraphToolbarPosition" def="'bottom-right'" description="Any of the 4 corners or 4 edge-centers. No effect when showToolbar is false." />
          <PropRow name="fullscreenContainerRef" type="React.RefObject<HTMLElement | null>" description="Ancestor element to request/exit the Fullscreen API on instead of GraphCanvas's own root — pass this when GraphCanvas is composed alongside sibling overlay content (a control strip, a DetailDrawer) that should stay visible while fullscreen too, since GraphCanvas doesn't accept children and the native Fullscreen API only renders the fullscreened element's own subtree. Must contain GraphCanvas's rendered root, or the graph itself disappears on entry. Omit for the previous default behavior (fullscreens GraphCanvas's own root)." />
        </PropsTable>
      </ShowcaseSection>
      <ShowcaseSection label="Props (GraphNode)">
        <PropsTable>
          <PropRow name="id" type="string" description="Unique node identifier passed back to onSelect" />
          <PropRow name="label" type="string" description="Primary text displayed in the node" />
          <PropRow name="kind" type="string" description="Optional type badge rendered in monospace beside the label" />
          <PropRow name="domainColor" type="string" def="'default'" description="Named domain key used to color the left swatch (e.g. 'life', 'climate', 'software')" />
          <PropRow name="selected" type="boolean" def="false" description="Renders the node in the selected/highlighted state" />
          <PropRow name="onSelect" type="(id: string) => void" description="Called when the node is clicked or activated via keyboard. When provided the node is keyboard-focusable." />
          <PropRow name="hasChildren" type="boolean" def="false" description="Whether this node has structural children. Draws the collapse/expand toggle when true and onToggleCollapse is also provided." />
          <PropRow name="collapsed" type="boolean" def="false" description="Whether the node's subtree is currently hidden. Flips the toggle's chevron direction." />
          <PropRow name="hiddenDescendantCount" type="number" def="0" description="Shown as a '+N' badge next to the toggle while collapsed." />
          <PropRow name="onToggleCollapse" type="() => void" description="Activates the collapse/expand toggle. Omit to render hasChildren without an interactive toggle." />
        </PropsTable>
      </ShowcaseSection>
      <ShowcaseSection label="Props (DetailDrawer)" description="Floats over the nearest position: relative ancestor — used above for the node/edge inspector, but works for any selection-driven detail panel. No backdrop, no focus trap: unlike Drawer, the content behind it stays interactive.">
        <PropsTable>
          <PropRow name="open" type="boolean" description="Whether there's content to show. Drives auto-expand/auto-hide — animates its own width to/from 0." />
          <PropRow name="width" type="number" def="360" description="Width in px while open. When resizable, only the initial value — width is tracked internally from then on." />
          <PropRow name="onWidthChange" type="(width: number) => void" description="Called as the user drags the left-edge resize handle. Omit to disable resizing — the handle (and its hover highlight) isn't rendered at all without it." />
          <PropRow name="minWidth" type="number" def="260" description="Lower resize bound." />
          <PropRow name="maxWidth" type="number" def="640" description="Upper resize bound." />
        </PropsTable>
      </ShowcaseSection>
      <ShowcaseSection label="Props (GraphToolbar)" description="Floating zoom in / zoom out / zoom to fit / lock / fullscreen controls, plus a live-simulation toggle shown only when layout='galaxy', rendered by GraphCanvas itself by default (see its showToolbar/toolbarPosition props) — exported separately for a custom placement or control set. Live simulation runs galaxy's layout as a continuous elastic simulation instead of a one-shot computed-then-frozen layout: drag any node ('sun') and its descendants follow in real time, spring-pulled toward their algorithmic home position with collision detection keeping siblings apart; releasing a node leaves it exactly where it was dropped, permanently pinned, same as a static-mode drag. Purely internal state — no controlling prop on GraphCanvas.">
        <PropsTable>
          <PropRow name="position" type="GraphToolbarPosition" def="'bottom-right'" description="Any of the 4 corners or 4 edge-centers. left-center/right-center stack the buttons vertically instead of in a row." />
        </PropsTable>
      </ShowcaseSection>
    </div>
  )
}

export function GraphInspectorShowcase() {
  const node: GraphNodeMetadata = {
    id: 'cls_organism',
    title: 'Organism',
    kind: 'C',
    domain: 'life',
    description: 'Any individual living entity that exhibits all properties of life.',
    metadata: {
      kind: 'Class',
      domain: 'life',
      individuals: 428,
    },
  }

  const relationships: RelationshipLink[] = [
    { id: 'r1', predicate: 'contains', target: 'cls_cell', targetTitle: 'Cell', targetDomain: 'life', direction: 'out' },
    { id: 'r2', predicate: 'instanceOf', target: 'cls_eukaryote', targetTitle: 'Eukaryote', targetDomain: 'life', direction: 'in' },
  ]

  return (
    <div>
      <PageHeader name="GraphInspector" description="Side-panel component for displaying node metadata, properties, and relationships when a graph node is selected." />
      <ShowcaseSection label="Node detail panel">
        <div style={{ maxWidth: 320, border: '1px solid rgb(var(--canvas-border, 229 231 235))', borderRadius: 8, overflow: 'hidden' }}>
          <GraphInspector node={node} relationships={relationships} />
        </div>
      </ShowcaseSection>
      <ShowcaseSection label="Empty state (no node selected)">
        <div style={{ maxWidth: 320, height: 120, border: '1px solid rgb(var(--canvas-border, 229 231 235))', borderRadius: 8, overflow: 'hidden' }}>
          <GraphInspector node={null} />
        </div>
      </ShowcaseSection>
      <ShowcaseSection label="Custom empty state text">
        <div style={{ maxWidth: 320, height: 120, border: '1px solid rgb(var(--canvas-border, 229 231 235))', borderRadius: 8, overflow: 'hidden' }}>
          <GraphInspector node={null} emptyStateText="Click a node on the canvas to inspect it." />
        </div>
      </ShowcaseSection>
      <ShowcaseSection label="No relationships">
        <div style={{ maxWidth: 320, border: '1px solid rgb(var(--canvas-border, 229 231 235))', borderRadius: 8, overflow: 'hidden' }}>
          <GraphInspector node={node} relationships={[]} />
        </div>
      </ShowcaseSection>
      <ShowcaseSection label="Props">
        <PropsTable>
          <PropRow name="node" type="GraphNodeMetadata | null" description="Node to inspect. When null or undefined, the empty state is shown." />
          <PropRow name="relationships" type="RelationshipLink[]" def="[]" description="Edges connected to the selected node, split into incoming and outgoing sections." />
          <PropRow name="onNodeSelect" type="(nodeId: string) => void" description="Called when a relationship target button is clicked, enabling navigation to that node." />
          <PropRow name="emptyStateText" type="string" def="'Select a node to inspect.'" description="Text shown when no node is selected." />
        </PropsTable>
      </ShowcaseSection>
    </div>
  )
}

export function GraphEdgeInspectorShowcase() {
  const edge: GraphEdgeMetadata = {
    id: 'o_brca1_protein',
    predicate: 'encodes',
    sourceId: 'cls_brca1',
    sourceTitle: 'BRCA1',
    sourceDomain: 'life',
    targetId: 'cls_protein',
    targetTitle: 'Protein',
    targetDomain: 'life',
    weight: 62,
  }

  const hotEdge: GraphEdgeMetadata = {
    ...edge,
    id: 'ee2',
    predicate: 'callsInto',
    sourceId: 'svc_gateway',
    sourceTitle: 'API Gateway',
    sourceDomain: 'software',
    targetId: 'svc_auth',
    targetTitle: 'Auth Service',
    targetDomain: 'software',
    variant: 'hot',
    weight: 88,
  }

  return (
    <div>
      <PageHeader
        name="GraphEdgeInspector"
        description="Detail panel for a selected edge — same head/body visual language as GraphInspector, so the two read as one family when stacked: source node panel, this, target node panel below it."
      />
      <ShowcaseSection label="Edge detail panel" description="Typical usage: pair with GraphInspector for the edge's source and target, stacked source → edge → target when an edge is selected.">
        <div style={{ maxWidth: 320, border: '1px solid rgb(var(--canvas-border, 229 231 235))', borderRadius: 8, overflow: 'hidden' }}>
          <GraphEdgeInspector edge={edge} onNodeSelect={() => {}} />
        </div>
      </ShowcaseSection>
      <ShowcaseSection label="Hot variant, no endpoint navigation" description="Without onNodeSelect the endpoints render as plain text instead of buttons.">
        <div style={{ maxWidth: 320, border: '1px solid rgb(var(--canvas-border, 229 231 235))', borderRadius: 8, overflow: 'hidden' }}>
          <GraphEdgeInspector edge={hotEdge} />
        </div>
      </ShowcaseSection>
      <ShowcaseSection label="Empty state (no edge selected)">
        <div style={{ maxWidth: 320, height: 100, border: '1px solid rgb(var(--canvas-border, 229 231 235))', borderRadius: 8, overflow: 'hidden' }}>
          <GraphEdgeInspector edge={null} />
        </div>
      </ShowcaseSection>
      <ShowcaseSection label="Props">
        <PropsTable>
          <PropRow name="edge" type="GraphEdgeMetadata | null" description="Edge to inspect. When null or undefined, the empty state is shown." />
          <PropRow name="onNodeSelect" type="(nodeId: string) => void" description="Called when the source or target endpoint is clicked. Omit to render both as plain text." />
          <PropRow name="emptyStateText" type="string" def="'Select an edge to inspect.'" description="Text shown when no edge is selected." />
        </PropsTable>
      </ShowcaseSection>
    </div>
  )
}

export function TopologyNodeShowcase() {
  return (
    <div>
      <PageHeader name="TopologyNode" description="Service/infrastructure node card with status indicator, role label, and live metric rows (MetricRow). Used for infrastructure topology maps." />
      <ShowcaseSection label="Status variants">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {TOPOLOGY_NODES.map(n => (
            <TopologyNode
              key={n.title}
              title={n.title}
              nodeRole={n.role}
              status={n.status}
              metrics={n.metrics}
            />
          ))}
        </div>
      </ShowcaseSection>
      <ShowcaseSection label="Idle / no metrics">
        <TopologyNode title="Load Balancer" nodeRole="network" status="idle" metrics={[]} />
      </ShowcaseSection>
      <ShowcaseSection label="Selected state">
        <div style={{ display: 'flex', gap: 16 }}>
          <TopologyNode title="API Server" nodeRole="backend" status="ok" metrics={[{ label: 'CPU', value: '45%', percent: 45, sparklineData: [], color: 'emerald' }]} selected={false} />
          <TopologyNode title="Database" nodeRole="storage" status="warning" metrics={[{ label: 'Connections', value: '342/500', percent: 68, sparklineData: [], color: 'amber' }]} selected />
        </div>
      </ShowcaseSection>
      <ShowcaseSection label="Props">
        <PropsTable>
          <PropRow name="title" type="string" description="Service name displayed as the card header" />
          <PropRow name="nodeRole" type="string" description="Role label (backend, storage, cache, etc.)" />
          <PropRow name="status" type="'ok' | 'warning' | 'error' | 'idle'" def="'idle'" description="Overall status — drives the colored indicator dot" />
          <PropRow name="metrics" type="TopologyNodeMetric[]" def="[]" description="Array of metric rows shown inside the card" />
          <PropRow name="selected" type="boolean" def="false" description="Renders the card in a visually selected state with an amber border ring" />
          <PropRow name="x" type="number" description="Absolute left position when used inside a canvas layout" />
          <PropRow name="y" type="number" description="Absolute top position when used inside a canvas layout" />
          <PropRow name="onSelect" type="() => void" description="Called when the node is clicked or activated via keyboard; also makes the node focusable" />
        </PropsTable>
      </ShowcaseSection>
    </div>
  )
}
