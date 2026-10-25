import { useCallback, useContext, useMemo, useState } from 'react'
import { GraphCanvas } from '../components/GraphCanvas'
import { GraphCanvasContext } from '../components/GraphCanvasContext'
import GraphNode from '../components/GraphNode'
import GraphInspector, { type GraphNodeMetadata, type RelationshipLink } from '../components/GraphInspector'
import GraphEdgeInspector, { type GraphEdgeMetadata } from '../components/GraphEdgeInspector'
import { DetailDrawer } from '../components/DetailDrawer'
import TopologyNode, { type TopologyNodeStatus } from '../components/TopologyNode'
import type { EdgeAnchor } from '../utils/graph'
import type { GraphNodeData, GraphNodeHierarchyMeta, EdgeGeometry } from '../components/GraphCanvas'
import { GALAXY_DEMO_NODES, GALAXY_DEMO_EDGES, isGalaxyDemoEdgeStructural } from './galaxyDemoData'
import { weightToStrokeWidth, strokeDashToDasharray } from '../utils/graphEdgeStyle'

interface NodeData extends GraphNodeData {
  title?: string
  domain?: string
  description?: string
}

interface EdgeData {
  id: string
  sourceId: string
  targetId: string
  label?: string
  weight?: number
  opacity?: number
  strokeDash?: number | [number, number]
  sourceAnchor?: EdgeAnchor
  targetAnchor?: EdgeAnchor
  curvature?: number
}

const GRAPH_NODES: NodeData[] = [
  { id: 'cls_cell',    x: 230,  y: 250, label: 'Cell',          kind: 'C', domainColor: 'life',    title: 'Cell',            domain: 'life',    description: 'Basic unit of life' },
  { id: 'cls_nucleus', x: 90,   y: 110, label: 'Nucleus',       kind: 'C', domainColor: 'life',    title: 'Nucleus',         domain: 'life' },
  { id: 'cls_mito',    x: 380,  y: 95,  label: 'Mitochondrion', kind: 'C', domainColor: 'life',    title: 'Mitochondrion',   domain: 'life' },
  { id: 'cls_protein', x: 560,  y: 320, label: 'Protein',       kind: 'C', domainColor: 'life',    title: 'Protein',         domain: 'life' },
  { id: 'cls_co2',     x: 1100, y: 215, label: 'CO2',           kind: 'C', domainColor: 'climate', title: 'CO2',             domain: 'climate' },
  { id: 'cls_warming', x: 920,  y: 365, label: 'Warming',       kind: 'C', domainColor: 'climate', title: 'Global Warming',  domain: 'climate' },
  { id: 'ind_brca1',   x: 380,  y: 575, label: 'BRCA1',         kind: 'I', domainColor: 'life',    title: 'BRCA1',           domain: 'life' },
  { id: 'ind_tp53',    x: 540,  y: 605, label: 'TP53',          kind: 'I', domainColor: 'life',    title: 'TP53',            domain: 'life' },
  { id: 'ind_co2_atm', x: 1115, y: 600, label: 'CO2 Atm',       kind: 'I', domainColor: 'climate', title: 'CO2 Atmosphere',  domain: 'climate' },
]

const GRAPH_EDGES: EdgeData[] = [
  { id: 'edge_1', sourceId: 'cls_cell',    targetId: 'cls_nucleus', label: 'contains'    },
  { id: 'edge_2', sourceId: 'cls_cell',    targetId: 'cls_mito',    label: 'contains'    },
  { id: 'edge_3', sourceId: 'cls_nucleus', targetId: 'cls_protein', label: 'contains'    },
  { id: 'edge_4', sourceId: 'cls_co2',     targetId: 'cls_warming', label: 'causes'      },
  { id: 'edge_5', sourceId: 'ind_brca1',   targetId: 'cls_protein', label: 'encodes'     },
  { id: 'edge_6', sourceId: 'ind_co2_atm', targetId: 'cls_co2',     label: 'instanceOf'  },
  // Weighted-edge demo edges for visual regression.
  { id: 'edge_weight_low',  sourceId: 'cls_cell',    targetId: 'cls_protein', weight: 10 },
  { id: 'edge_weight_mid',  sourceId: 'cls_nucleus', targetId: 'cls_mito',    weight: 50 },
  { id: 'edge_weight_high', sourceId: 'ind_brca1',   targetId: 'cls_warming', weight: 90 },
  { id: 'edge_opacity',     sourceId: 'ind_tp53',    targetId: 'cls_protein', opacity: 0.3 },
  { id: 'edge_dash',        sourceId: 'ind_co2_atm', targetId: 'cls_warming', strokeDash: [6, 2] },
]

// Spans well beyond the 470x320 bounded panel below, so fitView must zoom out to frame it.
const FIT_VIEW_NODES: GraphNodeData[] = [
  { id: 'fv_a', x: 0,   y: 0,   label: 'Node A' },
  { id: 'fv_b', x: 900, y: 0,   label: 'Node B' },
  { id: 'fv_c', x: 0,   y: 500, label: 'Node C' },
  { id: 'fv_d', x: 900, y: 500, label: 'Node D' },
  // Positioned at the centroid so it stays within the other nodes' bounding box.
  { id: 'fv_controls', x: 450, y: 250, label: '' },
]

const FIT_VIEW_EDGES = [
  { id: 'fv_edge_1', sourceId: 'fv_a', targetId: 'fv_b' },
  { id: 'fv_edge_2', sourceId: 'fv_a', targetId: 'fv_c' },
  { id: 'fv_edge_3', sourceId: 'fv_b', targetId: 'fv_d' },
]

// Bus-style directed flow: gateway -> agent -> dependencies, all edges anchored right-to-left.
const BUS_NODES: GraphNodeData[] = [
  { id: 'bus_gateway', x: 40, y: 170, label: 'Gateway' },
  { id: 'bus_agent_a', x: 320, y: 60, label: 'Agent A' },
  { id: 'bus_agent_b', x: 320, y: 280, label: 'Agent B' },
  { id: 'bus_dep_1', x: 600, y: 20, label: 'Dep 1' },
  { id: 'bus_dep_2', x: 600, y: 110, label: 'Dep 2' },
  { id: 'bus_dep_3', x: 600, y: 230, label: 'Dep 3' },
  { id: 'bus_dep_4', x: 600, y: 320, label: 'Dep 4' },
]

const BUS_EDGES: EdgeData[] = [
  { id: 'bus_edge_gateway_a', sourceId: 'bus_gateway', targetId: 'bus_agent_a', sourceAnchor: 'right', targetAnchor: 'left' },
  // Mixed anchor: only the source side is pinned, the target retains center-facing 'auto' behavior.
  { id: 'bus_edge_gateway_b', sourceId: 'bus_gateway', targetId: 'bus_agent_b', sourceAnchor: 'right' },
  { id: 'bus_edge_a_dep1', sourceId: 'bus_agent_a', targetId: 'bus_dep_1', sourceAnchor: 'right', targetAnchor: 'left' },
  // Two edges between the same node pair, separated visually via distinct curvature values.
  { id: 'bus_edge_a_dep2_low', sourceId: 'bus_agent_a', targetId: 'bus_dep_2', sourceAnchor: 'right', targetAnchor: 'left', curvature: 0.15 },
  { id: 'bus_edge_a_dep2_high', sourceId: 'bus_agent_a', targetId: 'bus_dep_2', sourceAnchor: 'right', targetAnchor: 'left', curvature: 0.6 },
  { id: 'bus_edge_b_dep3', sourceId: 'bus_agent_b', targetId: 'bus_dep_3', sourceAnchor: 'right', targetAnchor: 'left' },
  { id: 'bus_edge_b_dep4', sourceId: 'bus_agent_b', targetId: 'bus_dep_4', sourceAnchor: 'right', targetAnchor: 'left', label: 'depends on' },
]

// Status coloring for the "Cards" galaxy demo — purely decorative, one status per domain.
const GALAXY_CARD_STATUS: Record<string, TopologyNodeStatus> = {
  life: 'ok',
  climate: 'warning',
  software: 'idle',
}

// Deterministic 0-100 value derived from the node id, used only to give the "Cards" demo's
// metric bar some visual variety — not a real measurement, and stable across renders/snapshots.
function pseudoMetricPercent(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 100
  return Math.abs(hash)
}

// Two loosely-connected communities with a couple of bridge edges — enough
// structure for Louvain to find real clusters (see graphClustering.ts),
// deliberately WITHOUT explicit x/y so layout="force-clustered" actually
// computes bubble-packed positions instead of just drawing boundary
// circles around pinned coordinates.
const CLUSTERED_NODES: GraphNodeData[] = [
  { id: 'cl_a1', label: 'A1' },
  { id: 'cl_a2', label: 'A2' },
  { id: 'cl_a3', label: 'A3' },
  { id: 'cl_a4', label: 'A4' },
  { id: 'cl_b1', label: 'B1' },
  { id: 'cl_b2', label: 'B2' },
  { id: 'cl_b3', label: 'B3' },
  { id: 'cl_b4', label: 'B4' },
]

const CLUSTERED_EDGES: EdgeData[] = [
  { id: 'cl_edge_a12', sourceId: 'cl_a1', targetId: 'cl_a2' },
  { id: 'cl_edge_a13', sourceId: 'cl_a1', targetId: 'cl_a3' },
  { id: 'cl_edge_a14', sourceId: 'cl_a1', targetId: 'cl_a4' },
  { id: 'cl_edge_a23', sourceId: 'cl_a2', targetId: 'cl_a3' },
  { id: 'cl_edge_a34', sourceId: 'cl_a3', targetId: 'cl_a4' },
  { id: 'cl_edge_b12', sourceId: 'cl_b1', targetId: 'cl_b2' },
  { id: 'cl_edge_b13', sourceId: 'cl_b1', targetId: 'cl_b3' },
  { id: 'cl_edge_b14', sourceId: 'cl_b1', targetId: 'cl_b4' },
  { id: 'cl_edge_b23', sourceId: 'cl_b2', targetId: 'cl_b3' },
  { id: 'cl_edge_b34', sourceId: 'cl_b3', targetId: 'cl_b4' },
  // Single bridge edge between the two communities.
  { id: 'cl_edge_bridge', sourceId: 'cl_a1', targetId: 'cl_b1' },
]

function FitViewControls() {
  // GraphCanvas also renders node content off-screen (outside the context provider) to
  // measure natural size, so this must tolerate a missing context rather than throw.
  const ctx = useContext(GraphCanvasContext)
  if (!ctx) return null
  const { zoomToFit, setZoom, setPan } = ctx
  return (
    <div style={{ display: 'flex', gap: '6px' }} data-no-drag>
      <button type="button" data-testid="fitview-zoom-to-fit" onClick={() => zoomToFit()}>
        Fit
      </button>
      <button type="button" data-testid="fitview-set-zoom" onClick={() => setZoom(1.5)}>
        Zoom 1.5
      </button>
      <button type="button" data-testid="fitview-set-pan" onClick={() => setPan(0, 0)}>
        Pan 0,0
      </button>
    </div>
  )
}

const TOPOLOGY_NODES = [
  {
    title: 'API Server',
    role: 'backend',
    status: 'ok' as const,
    metrics: [
      { label: 'CPU',    value: '45%',     percent: 45, sparklineData: [20, 30, 45, 40, 50, 45], color: 'emerald' as const },
      { label: 'Memory', value: '62%',     percent: 62, sparklineData: [55, 58, 60, 62, 61, 62], color: 'amber'   as const },
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
  {
    title: 'Load Balancer',
    role: 'network',
    status: 'idle' as const,
    metrics: [],
  },
]

export default function GraphShowcase() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>()
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>()
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | undefined>()
  const [canvasMode, setCanvasMode] = useState<'graph' | 'topology' | 'fitview' | 'bus' | 'galaxy' | 'clustered' | 'click-tooltip'>('graph')
  const [showAllRelations, setShowAllRelations] = useState(false)
  const [galaxyCardSize, setGalaxyCardSize] = useState<'compact' | 'cards'>('compact')
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set())
  const [draggable, setDraggable] = useState(true)
  const [drawerWidth, setDrawerWidth] = useState(360)
  const [galaxyNodePositions, setGalaxyNodePositions] = useState<Record<string, { x: number; y: number }>>({})
  const [lastPopoverAction, setLastPopoverAction] = useState<string | undefined>()

  const galaxyNodes = useMemo(() =>
    GALAXY_DEMO_NODES.map(node => {
      const override = galaxyNodePositions[node.id]
      if (!override) return node
      return {
        ...node,
        x: override.x,
        y: override.y,
      }
    }),
    [galaxyNodePositions]
  )

  const handleGalaxyNodeDragEnd = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setGalaxyNodePositions(prev => ({
      ...prev,
      [nodeId]: position,
    }))
  }, [])

  const handleNodeSelect = useCallback((id: string) => {
    setSelectedNodeId(id)
    setSelectedEdgeId(undefined)
  }, [])

  const handleEdgeSelect = useCallback((id: string) => {
    setSelectedEdgeId(id)
    setSelectedNodeId(undefined)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(undefined)
    setSelectedEdgeId(undefined)
  }, [])

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedNode = GRAPH_NODES.find(n => n.id === selectedNodeId)
  const inspectorNode: GraphNodeMetadata | undefined = selectedNode
    ? {
        id: selectedNode.id,
        title: selectedNode.title || selectedNode.label,
        kind: selectedNode.kind,
        domain: selectedNode.domain,
        description: selectedNode.description,
      }
    : undefined

  const relationships: RelationshipLink[] = selectedNodeId
    ? GRAPH_EDGES
        .filter(e => e.sourceId === selectedNodeId || e.targetId === selectedNodeId)
        .map(e => {
          const isOutgoing = e.sourceId === selectedNodeId
          const otherId = isOutgoing ? e.targetId : e.sourceId
          const other = GRAPH_NODES.find(n => n.id === otherId)!
          return {
            id: e.id,
            target: otherId,
            targetTitle: other.title || other.label,
            targetDomain: other.domain,
            predicate: e.label || 'related',
            direction: isOutgoing ? 'out' : 'in',
          }
        })
    : []

  const selectedEdge = selectedEdgeId ? GRAPH_EDGES.find(e => e.id === selectedEdgeId) : undefined
  const edgeSourceNode = selectedEdge ? GRAPH_NODES.find(n => n.id === selectedEdge.sourceId) : undefined
  const edgeTargetNode = selectedEdge ? GRAPH_NODES.find(n => n.id === selectedEdge.targetId) : undefined
  const edgeInspectorData: GraphEdgeMetadata | undefined = selectedEdge && edgeSourceNode && edgeTargetNode
    ? {
        id: selectedEdge.id,
        predicate: selectedEdge.label ?? 'related',
        sourceId: edgeSourceNode.id,
        sourceTitle: edgeSourceNode.title || edgeSourceNode.label,
        sourceDomain: edgeSourceNode.domain,
        targetId: edgeTargetNode.id,
        targetTitle: edgeTargetNode.title || edgeTargetNode.label,
        targetDomain: edgeTargetNode.domain,
        weight: selectedEdge.weight,
      }
    : undefined

  const renderGraphNode = useCallback((
    node: GraphNodeData,
    selected: boolean,
    _hierarchy?: GraphNodeHierarchyMeta,
    props?: { nodeId: string; tooltipId?: string; onSelect?: (id: string) => void; onPopoverOpen?: (triggeringElement: HTMLElement) => void }
  ) => (
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
  ), [])

  const renderFitViewNode = useCallback((node: GraphNodeData, selected: boolean) => {
    if (node.id === 'fv_controls') return <FitViewControls />
    return <GraphNode id={node.id} label={node.label} selected={selected} onSelect={handleNodeSelect} />
  }, [handleNodeSelect])

  // Proves galaxy layout works for substantial-size cards, not just compact GraphNode chips —
  // TopologyNode is ~180px+ wide and grows with each metric row, versus GraphNode's ~30px tall
  // default. Also demonstrates reading GraphNodeHierarchyMeta in a fully custom renderNode: the
  // collapse/expand affordance here is hand-built, not GraphNode's built-in one.
  const renderGalaxyCardNode = useCallback((node: GraphNodeData, selected: boolean, hierarchy?: GraphNodeHierarchyMeta) => {
    const percent = pseudoMetricPercent(node.id)
    return (
      <div style={{ position: 'relative' }}>
        <TopologyNode
          title={node.label}
          nodeRole={node.kind === 'I' ? 'individual' : 'class'}
          status={GALAXY_CARD_STATUS[node.domainColor ?? ''] ?? 'idle'}
          metrics={[{ label: 'Weight', value: `${percent}%`, percent, sparklineData: [], color: 'amber' }]}
          selected={selected}
          onSelect={() => handleNodeSelect(node.id)}
        />
        {hierarchy?.hasChildren && hierarchy.onToggleCollapse && (
          // No data-testid: GraphCanvas renders this content twice (once off-screen for
          // measurement, once in the real SVG) — see GraphNode's collapse toggle for the same
          // reasoning. Locate via .galaxy-card-collapse-toggle scoped under the node's own
          // unique [data-testid="graph-node-{id}"].
          <button
            type="button"
            className="galaxy-card-collapse-toggle"
            onClick={(e) => { e.stopPropagation(); hierarchy.onToggleCollapse!() }}
            aria-label={hierarchy.collapsed ? 'Expand' : 'Collapse'}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 20,
              height: 20,
              borderRadius: 4,
              border: '1px solid var(--canvas-border, #d8dde5)',
              background: 'var(--canvas-bg-2, #f4f5f7)',
              cursor: 'pointer',
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            {hierarchy.collapsed ? `+${hierarchy.hiddenDescendantCount}` : '−'}
          </button>
        )}
      </div>
    )
  }, [handleNodeSelect])

  const renderCustomEdge = useCallback((
    edge: typeof GRAPH_EDGES[0],
    geometry: EdgeGeometry
  ) => {
    const labelSize = edge.label ? { width: (edge.label.length * 5.5) + 12, height: 20 } : null

    const strokeWidth = edge.weight !== undefined ? weightToStrokeWidth(edge.weight) : 1.25
    const lineStyle: React.CSSProperties = { strokeWidth }
    if (edge.opacity !== undefined) lineStyle.opacity = edge.opacity
    if (edge.strokeDash !== undefined) lineStyle.strokeDasharray = strokeDashToDasharray(edge.strokeDash)

    return (
      <>
        <path d={geometry.path} fill="none" className="graph-edge__line" style={lineStyle} />
        {/* Small decorative circle at the midpoint */}
        <circle
          cx={geometry.mid.x}
          cy={geometry.mid.y}
          r="3"
          fill="var(--graph-edge, rgb(var(--canvas-border-strong)))"
          opacity={geometry.hovered ? "1" : "0.6"}
          style={{ pointerEvents: 'none' }}
          data-testid={`edge-mid-marker-${edge.id}`}
          data-mid-x={Math.round(geometry.mid.x * 100) / 100}
          data-mid-y={Math.round(geometry.mid.y * 100) / 100}
          data-angle={Math.round(geometry.angle * 10000) / 10000}
        />
        {/* Angle indicator: small rotated triangle marker */}
        <g
          transform={`translate(${geometry.mid.x}, ${geometry.mid.y}) rotate(${geometry.angle * 180 / Math.PI})`}
          style={{ pointerEvents: 'none' }}
          data-testid={`edge-angle-marker-${edge.id}`}
        >
          <polygon
            points="0,-4 3,4 -3,4"
            fill="var(--accent-primary, #fbbf24)"
            opacity={geometry.hovered ? "0.8" : "0.4"}
          />
        </g>
        {/* Render label if present, using collision-cleared labelPos */}
        {edge.label && labelSize && (
          <g
            className="graph-edge__label graph-edge__label--clickable"
            transform={`translate(${geometry.labelPos.x - labelSize.width / 2}, ${geometry.labelPos.y - labelSize.height / 2})`}
          >
            <rect
              width={labelSize.width}
              height={labelSize.height}
              rx="3"
              className="graph-edge__label-bg"
            />
            <text
              x={labelSize.width / 2}
              y={labelSize.height / 2 + 3}
              className="graph-edge__label-text"
            >
              {edge.label}
            </text>
          </g>
        )}
      </>
    )
  }, [])

  const graphCanvas = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {(hoveredNodeId || hoveredEdgeId) && (
        <div
          // Overlaid, not inserted above the canvas: inserting it resized the canvas on every
          // hover, GraphCanvas re-anchored the view, the node slid out from under the pointer and
          // the banner vanished again — a hover/no-hover loop on large galaxy bodies.
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            pointerEvents: 'none',
            padding: '8px 12px',
            background: 'var(--canvas-bg-2, #f4f5f7)',
            borderBottom: '1px solid var(--canvas-border, #d8dde5)',
            fontSize: '12px',
            color: 'var(--canvas-fg, #1a1d24)',
          }}
          data-testid="graph-hover-indicator"
        >
          {hoveredNodeId ? `Hovering node: ${hoveredNodeId}` : `Hovering edge: ${hoveredEdgeId}`}
        </div>
      )}
      {lastPopoverAction && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--canvas-bg-2, #f4f5f7)',
            borderBottom: '1px solid var(--canvas-border, #d8dde5)',
            fontSize: '12px',
            color: 'var(--canvas-fg, #1a1d24)',
          }}
          data-testid="graph-popover-action-indicator"
        >
          Popover action: {lastPopoverAction}
        </div>
      )}
      <GraphCanvas
        key="graph-canvas"
        nodes={GRAPH_NODES}
        edges={GRAPH_EDGES}
        selectedNodeId={selectedNodeId}
        onNodeSelect={handleNodeSelect}
        onNodeHover={setHoveredNodeId}
        selectedEdgeId={selectedEdgeId}
        onEdgeSelect={handleEdgeSelect}
        onEdgeHover={setHoveredEdgeId}
        onBackgroundClick={handleBackgroundClick}
        draggable={draggable}
        renderNode={renderGraphNode}
        renderEdge={renderCustomEdge}
        nodeTooltip={(node) => (
          <div style={{ maxWidth: '200px' }}>
            <div style={{ fontWeight: 600 }}>{(node as NodeData).title || node.label}</div>
            {(node as NodeData).description && (
              <div style={{ marginTop: '4px', fontSize: '12px', opacity: 0.8 }}>
                {(node as NodeData).description}
              </div>
            )}
          </div>
        )}
        edgeTooltip={(edge) => (
          <div style={{ maxWidth: '180px' }}>
            <div style={{ fontWeight: 600 }}>{edge.label || 'Relationship'}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
              {edge.sourceId} → {edge.targetId}
            </div>
            {edge.weight !== undefined && (
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                Weight: {edge.weight}
              </div>
            )}
          </div>
        )}
        nodePopover={(node) => (
          <div style={{ maxWidth: '240px', padding: '12px' }} data-testid={`node-popover-${node.id}`}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>{(node as NodeData).title || node.label}</div>
            {(node as NodeData).description && (
              <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '12px' }}>
                {(node as NodeData).description}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                data-testid={`node-popover-action-${node.id}`}
                onClick={() => setLastPopoverAction(`node-${node.id}-clicked`)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'var(--accent-primary, #fbbf24)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                View Details
              </button>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  setLastPopoverAction(`node-${node.id}-link-clicked`)
                }}
                data-testid={`node-popover-link-${node.id}`}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  color: 'var(--accent-primary-deep, #b45309)',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                More Info
              </a>
            </div>
          </div>
        )}
        edgePopover={(edge) => (
          <div style={{ maxWidth: '240px', padding: '12px' }} data-testid={`edge-popover-${edge.id}`}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>{edge.label || 'Relationship'}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '8px' }}>
              {edge.sourceId} → {edge.targetId}
            </div>
            {edge.weight !== undefined && (
              <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '12px' }}>
                Weight: {edge.weight}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                data-testid={`edge-popover-action-${edge.id}`}
                onClick={() => setLastPopoverAction(`edge-${edge.id}-clicked`)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'var(--accent-primary, #fbbf24)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Explore
              </button>
            </div>
          </div>
        )}
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  )

  const busCanvas = (
    <GraphCanvas
      key="bus-canvas"
      data-testid="bus-canvas"
      nodes={BUS_NODES}
      edges={BUS_EDGES}
      fitView
      fitPadding={40}
      selectedNodeId={selectedNodeId}
      onNodeSelect={handleNodeSelect}
      onBackgroundClick={handleBackgroundClick}
      renderNode={renderFitViewNode}
      style={{ height: '100%' }}
    />
  )

  const galaxyCanvas = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {(hoveredNodeId || hoveredEdgeId) && (
        <div
          // Overlaid, not inserted above the canvas: inserting it resized the canvas on every
          // hover, GraphCanvas re-anchored the view, the node slid out from under the pointer and
          // the banner vanished again — a hover/no-hover loop on large galaxy bodies.
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            pointerEvents: 'none',
            padding: '8px 12px',
            background: 'var(--canvas-bg-2, #f4f5f7)',
            borderBottom: '1px solid var(--canvas-border, #d8dde5)',
            fontSize: '12px',
            color: 'var(--canvas-fg, #1a1d24)',
          }}
          data-testid="graph-hover-indicator"
        >
          {hoveredNodeId ? `Hovering node: ${hoveredNodeId}` : `Hovering edge: ${hoveredEdgeId}`}
        </div>
      )}
      <GraphCanvas
        // Keyed on galaxyCardSize (not just a static "galaxy-canvas") deliberately: GraphCanvas
        // only ever auto-fits pan/zoom once, on mount — by design, so it never fights a user's own
        // pan/zoom on a later prop change (nodeMargin, showAllRelations, etc. all leave the
        // viewport alone too). Compact and Cards renderNode content differ hugely in rendered size,
        // so without a remount here, toggling this button would recompute layout POSITIONS for the
        // new (much bigger) Cards-mode cards while leaving pan/zoom fit for the old, much smaller
        // Compact-mode ones — the content overflows the container well past the visible area,
        // dragging some nodes' controls out from under the canvas entirely and under this page's
        // own button row above it. Remounting re-runs the one-time auto-fit against the new sizes,
        // same as a real consumer swapping renderNode would need to trigger a fresh fit itself.
        key={`galaxy-canvas-${galaxyCardSize}`}
        data-testid="galaxy-canvas"
        nodes={galaxyNodes}
        edges={GALAXY_DEMO_EDGES}
        layout="galaxy"
        isStructuralEdge={isGalaxyDemoEdgeStructural}
        showAllRelations={showAllRelations}
        collapsedNodeIds={collapsedNodeIds}
        onToggleCollapse={handleToggleCollapse}
        draggable
        onNodeDragEnd={handleGalaxyNodeDragEnd}
        fitView
        fitPadding={40}
        selectedNodeId={selectedNodeId}
        onNodeSelect={handleNodeSelect}
        onNodeHover={setHoveredNodeId}
        selectedEdgeId={selectedEdgeId}
        onEdgeSelect={handleEdgeSelect}
        onEdgeHover={setHoveredEdgeId}
        onBackgroundClick={handleBackgroundClick}
        // Omitted entirely in 'compact' mode: GraphCanvas's own default GraphNode already wires
        // up domainColor/kind styling and the collapse toggle from hierarchy meta.
        renderNode={galaxyCardSize === 'cards' ? renderGalaxyCardNode : undefined}
        style={{ height: '100%' }}
      />
    </div>
  )

  const clusteredCanvas = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {(hoveredNodeId || hoveredEdgeId) && (
        <div
          // Overlaid, not inserted above the canvas: inserting it resized the canvas on every
          // hover, GraphCanvas re-anchored the view, the node slid out from under the pointer and
          // the banner vanished again — a hover/no-hover loop on large galaxy bodies.
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            pointerEvents: 'none',
            padding: '8px 12px',
            background: 'var(--canvas-bg-2, #f4f5f7)',
            borderBottom: '1px solid var(--canvas-border, #d8dde5)',
            fontSize: '12px',
            color: 'var(--canvas-fg, #1a1d24)',
          }}
          data-testid="graph-hover-indicator"
        >
          {hoveredNodeId ? `Hovering node: ${hoveredNodeId}` : `Hovering edge: ${hoveredEdgeId}`}
        </div>
      )}
      <GraphCanvas
        key="clustered-canvas"
        data-testid="clustered-canvas"
        layout="force-clustered"
        nodes={CLUSTERED_NODES}
        edges={CLUSTERED_EDGES}
        fitView
        fitPadding={40}
        selectedNodeId={selectedNodeId}
        onNodeSelect={handleNodeSelect}
        onNodeHover={setHoveredNodeId}
        selectedEdgeId={selectedEdgeId}
        onEdgeSelect={handleEdgeSelect}
        onEdgeHover={setHoveredEdgeId}
        onBackgroundClick={handleBackgroundClick}
        renderNode={renderFitViewNode}
        style={{ height: '100%' }}
      />
    </div>
  )

  const clickTooltipCanvas = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {(hoveredNodeId || hoveredEdgeId) && (
        <div
          // Overlaid, not inserted above the canvas: inserting it resized the canvas on every
          // hover, GraphCanvas re-anchored the view, the node slid out from under the pointer and
          // the banner vanished again — a hover/no-hover loop on large galaxy bodies.
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            pointerEvents: 'none',
            padding: '8px 12px',
            background: 'var(--canvas-bg-2, #f4f5f7)',
            borderBottom: '1px solid var(--canvas-border, #d8dde5)',
            fontSize: '12px',
            color: 'var(--canvas-fg, #1a1d24)',
          }}
          data-testid="graph-hover-indicator"
        >
          {hoveredNodeId ? `Hovering node: ${hoveredNodeId}` : `Hovering edge: ${hoveredEdgeId}`}
        </div>
      )}
      {lastPopoverAction && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--canvas-bg-2, #f4f5f7)',
            borderBottom: '1px solid var(--canvas-border, #d8dde5)',
            fontSize: '12px',
            color: 'var(--canvas-fg, #1a1d24)',
          }}
          data-testid="graph-popover-action-indicator"
        >
          Popover action: {lastPopoverAction}
        </div>
      )}
      <GraphCanvas
        key="click-tooltip-canvas"
        data-testid="click-tooltip-canvas"
        nodes={GRAPH_NODES}
        edges={GRAPH_EDGES}
        selectedNodeId={selectedNodeId}
        onNodeSelect={handleNodeSelect}
        onNodeHover={setHoveredNodeId}
        selectedEdgeId={selectedEdgeId}
        onEdgeSelect={handleEdgeSelect}
        onEdgeHover={setHoveredEdgeId}
        onBackgroundClick={handleBackgroundClick}
        draggable={draggable}
        renderNode={renderGraphNode}
        renderEdge={renderCustomEdge}
        nodeTooltip={(node) => (
          <div style={{ maxWidth: '200px' }}>
            <div style={{ fontWeight: 600 }}>{(node as NodeData).title || node.label}</div>
            {(node as NodeData).description && (
              <div style={{ marginTop: '4px', fontSize: '12px', opacity: 0.8 }}>
                {(node as NodeData).description}
              </div>
            )}
          </div>
        )}
        edgeTooltip={(edge) => (
          <div style={{ maxWidth: '180px' }}>
            <div style={{ fontWeight: 600 }}>{edge.label || 'Relationship'}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
              {edge.sourceId} → {edge.targetId}
            </div>
            {edge.weight !== undefined && (
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                Weight: {edge.weight}
              </div>
            )}
          </div>
        )}
        nodeTooltipTrigger="click"
        edgeTooltipTrigger="click"
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  )

  const fitViewCanvas = (
    <div style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
      <div
        data-testid="fitview-panel"
        style={{ width: '470px', height: '320px', border: '1px solid var(--shell-border, #1e2a44)' }}
      >
        <GraphCanvas
          data-testid="fitview-canvas"
          nodes={FIT_VIEW_NODES}
          edges={FIT_VIEW_EDGES}
          fitView
          fitPadding={20}
          selectedNodeId={selectedNodeId}
          onNodeSelect={handleNodeSelect}
          onBackgroundClick={handleBackgroundClick}
          renderNode={renderFitViewNode}
          // This demo already embeds its own Fit/Zoom/Pan buttons as a graph node
          // (FitViewControls, via useGraphCanvas()) specifically to demonstrate that API — the
          // built-in toolbar would be redundant on top of it, and in this small a panel, overlaps it.
          showToolbar={false}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )

  const topologyCanvas = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px',
        padding: '20px',
        overflow: 'auto',
        height: '100%',
      }}
    >
      {TOPOLOGY_NODES.map((node, idx) => (
        <TopologyNode
          key={idx}
          title={node.title}
          nodeRole={node.role}
          status={node.status}
          metrics={node.metrics}
          onSelect={() => setSelectedNodeId(node.title)}
        />
      ))}
    </div>
  )

  return (
    <div data-testid="graph-showcase" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ marginBottom: '12px' }}>Graph Canvas Components</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            data-testid="graph-view-button"
            onClick={() => setCanvasMode('graph')}
            style={{
              padding: '8px 16px',
              background: canvasMode === 'graph' ? 'var(--accent-primary, #f59e0b)' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: canvasMode === 'graph' ? 600 : 400,
            }}
          >
            Graph View
          </button>
          <button
            type="button"
            data-testid="topology-view-button"
            onClick={() => setCanvasMode('topology')}
            style={{
              padding: '8px 16px',
              background: canvasMode === 'topology' ? 'var(--accent-primary, #f59e0b)' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: canvasMode === 'topology' ? 600 : 400,
            }}
          >
            Topology View
          </button>
          <button
            type="button"
            data-testid="fitview-view-button"
            onClick={() => setCanvasMode('fitview')}
            style={{
              padding: '8px 16px',
              background: canvasMode === 'fitview' ? 'var(--accent-primary, #f59e0b)' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: canvasMode === 'fitview' ? 600 : 400,
            }}
          >
            Fit View Demo
          </button>
          <button
            type="button"
            data-testid="bus-view-button"
            onClick={() => setCanvasMode('bus')}
            style={{
              padding: '8px 16px',
              background: canvasMode === 'bus' ? 'var(--accent-primary, #f59e0b)' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: canvasMode === 'bus' ? 600 : 400,
            }}
          >
            Bus View
          </button>
          <button
            type="button"
            data-testid="galaxy-view-button"
            onClick={() => setCanvasMode('galaxy')}
            style={{
              padding: '8px 16px',
              background: canvasMode === 'galaxy' ? 'var(--accent-primary, #f59e0b)' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: canvasMode === 'galaxy' ? 600 : 400,
            }}
          >
            Galaxy View
          </button>
          <button
            type="button"
            data-testid="clustered-view-button"
            onClick={() => setCanvasMode('clustered')}
            style={{
              padding: '8px 16px',
              background: canvasMode === 'clustered' ? 'var(--accent-primary, #f59e0b)' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: canvasMode === 'clustered' ? 600 : 400,
            }}
          >
            Clustered View
          </button>
          <button
            type="button"
            data-testid="click-tooltip-view-button"
            onClick={() => setCanvasMode('click-tooltip')}
            style={{
              padding: '8px 16px',
              background: canvasMode === 'click-tooltip' ? 'var(--accent-primary, #f59e0b)' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: canvasMode === 'click-tooltip' ? 600 : 400,
            }}
          >
            Click Tooltip Mode
          </button>
          {canvasMode === 'graph' && (
            <button
              type="button"
              data-testid="graph-draggable-toggle"
              onClick={() => setDraggable(v => !v)}
              style={{
                padding: '8px 16px',
                background: draggable ? 'var(--accent-primary, #f59e0b)' : '#ccc',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: draggable ? 600 : 400,
              }}
            >
              Draggable: {draggable ? 'On' : 'Off'}
            </button>
          )}
          {canvasMode === 'galaxy' && (
            <button
              type="button"
              data-testid="galaxy-show-all-relations-button"
              onClick={() => setShowAllRelations(v => !v)}
              style={{
                padding: '8px 16px',
                background: showAllRelations ? 'var(--accent-primary, #f59e0b)' : '#ccc',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: showAllRelations ? 600 : 400,
              }}
            >
              Show all relations
            </button>
          )}
          {canvasMode === 'galaxy' && (
            <button
              type="button"
              data-testid="galaxy-card-size-button"
              onClick={() => setGalaxyCardSize(v => (v === 'compact' ? 'cards' : 'compact'))}
              style={{
                padding: '8px 16px',
                background: galaxyCardSize === 'cards' ? 'var(--accent-primary, #f59e0b)' : '#ccc',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: galaxyCardSize === 'cards' ? 600 : 400,
              }}
            >
              {galaxyCardSize === 'cards' ? 'Cards' : 'Compact'}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }} data-testid="graph-content-area">
        {canvasMode === 'graph'
          ? graphCanvas
          : canvasMode === 'topology'
            ? topologyCanvas
            : canvasMode === 'bus'
              ? busCanvas
              : canvasMode === 'galaxy'
                ? galaxyCanvas
                : canvasMode === 'clustered'
                  ? clusteredCanvas
                  : canvasMode === 'click-tooltip'
                    ? clickTooltipCanvas
                    : fitViewCanvas}

        <DetailDrawer
          data-testid="graph-detail-drawer"
          open={!!(selectedNodeId || selectedEdgeId)}
          width={drawerWidth}
          onWidthChange={setDrawerWidth}
        >
          {edgeInspectorData ? (
            <div data-testid="graph-edge-inspector-stack" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {edgeSourceNode && (
                <GraphInspector
                  data-testid="graph-inspector-panel-source"
                  node={{ id: edgeSourceNode.id, title: edgeSourceNode.title || edgeSourceNode.label, kind: edgeSourceNode.kind, domain: edgeSourceNode.domain }}
                  onNodeSelect={handleNodeSelect}
                />
              )}
              <GraphEdgeInspector data-testid="graph-edge-inspector-panel" edge={edgeInspectorData} onNodeSelect={handleNodeSelect} />
              {edgeTargetNode && (
                <GraphInspector
                  data-testid="graph-inspector-panel-target"
                  node={{ id: edgeTargetNode.id, title: edgeTargetNode.title || edgeTargetNode.label, kind: edgeTargetNode.kind, domain: edgeTargetNode.domain }}
                  onNodeSelect={handleNodeSelect}
                />
              )}
            </div>
          ) : inspectorNode ? (
            // No empty-state render here — the drawer being closed (open=false above) already
            // is the empty state; rendering GraphInspector's own "nothing selected" text inside
            // a drawer that exists specifically because something's selected would be redundant.
            <GraphInspector
              data-testid="graph-inspector-panel"
              node={inspectorNode}
              relationships={relationships}
              onNodeSelect={handleNodeSelect}
            />
          ) : null}
        </DetailDrawer>
      </div>
    </div>
  )
}
