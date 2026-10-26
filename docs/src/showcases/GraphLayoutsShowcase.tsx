import { useCallback, useMemo, useState } from 'react'
import {
  GraphCanvas,
  GraphInspector,
  GraphEdgeInspector,
  TopologyNode,
  SegmentedControl,
  Select,
  Button,
  TabBar,
  DetailDrawer,
  type GraphCanvasProps,
  type GraphNodeData,
  type GraphEdgeData,
  type GraphNodeHierarchyMeta,
  type GraphNodeMetadata,
  type GraphEdgeMetadata,
  type RelationshipLink,
  type TopologyNodeStatus,
} from '@tinkermonkey/heimdall-ui'
import { PageHeader, ShowcaseSection, DemoCard } from '../components/ShowcaseSection'
import {
  DATASETS,
  LAYOUT_INFO,
  LAYOUT_ORDER,
  hasHierarchy,
  type Dataset,
  type DatasetKey,
  type DemoEdge,
  type DemoNode,
  type LayoutKey,
} from '../data/graphLayoutDatasets'

const fg2 = 'rgb(var(--canvas-fg-2, 75 85 99))'
const fg3 = 'rgb(var(--canvas-fg-3, 107 114 128))'
const border = 'rgb(var(--canvas-border, 229 231 235))'
const mono = 'var(--font-mono, "JetBrains Mono", monospace)'

// ─── Shared wiring ─────────────────────────────────────────────────────────
// The props each engine needs to read a dataset correctly. Kept in one place so the gallery and
// the interactive comparison wire the same dataset the same way.

const isStructural = (edge: GraphEdgeData) => (edge as DemoEdge).role === 'structural'
const isRoute = (edge: GraphEdgeData) => (edge as DemoEdge).role === 'route'
const isPage = (node: GraphNodeData) => !!(node as DemoNode).isPage

function datasetProps(layout: LayoutKey, dataset: Dataset): Partial<GraphCanvasProps> {
  const usesPages = layout === 'ux-navigation' || layout === 'orthogonal'
  const hierarchical = hasHierarchy(dataset)
  return {
    // Only datasets with a hierarchy get a structural classifier: with one set, every other edge
    // is hidden until hovered, which would blank out a flat graph such as the karate club.
    isStructuralEdge: hierarchical ? isStructural : undefined,
    // Without a classifier every edge counts as structural, so a flat graph would grow collapse
    // chevrons that hide arbitrary neighbours. Collapse is only offered on real hierarchies.
    ...(hierarchical ? {} : { onToggleCollapse: undefined, collapsedNodeIds: undefined }),
    isPageNode: usesPages && dataset.nodes.some(n => n.isPage) ? isPage : undefined,
    isNavigationRoute: usesPages && dataset.edges.some(e => e.role === 'route') ? isRoute : undefined,
  }
}

/** Options that show each engine at its best in the gallery. */
const GALLERY_OPTIONS: Record<LayoutKey, Partial<GraphCanvasProps>> = {
  galaxy: { structuralEdgeCurvature: 0 },
  organic: {},
  // Routing every edge is the point of orthogonal, so relational edges stay visible.
  orthogonal: { showAllRelations: true },
  'radial-tree': { showHierarchyRings: true, showClusterBoundaries: false },
  'force-clustered': {},
  force: {},
  'ux-navigation': {},
}

// ─── Gallery ───────────────────────────────────────────────────────────────

function GalleryCard({ layout }: { layout: LayoutKey }) {
  const info = LAYOUT_INFO[layout]
  const dataset = DATASETS[info.recommended]
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set())
  const toggleCollapse = useCallback((id: string) => setCollapsedNodeIds(prev => toggled(prev, id)), [])
  const options = GALLERY_OPTIONS[layout]

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{info.label}</span>
          <code style={{ fontFamily: mono, fontSize: 11, color: fg3 }}>layout="{layout}"</code>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: fg2, lineHeight: 1.5 }}>{info.summary}</p>
      </div>
      <div style={{ height: 540, position: 'relative' }}>
        <GraphCanvas
          data-testid={`gallery-${layout}`}
          nodes={dataset.nodes}
          edges={dataset.edges}
          layout={layout}
          collapsedNodeIds={collapsedNodeIds}
          onToggleCollapse={toggleCollapse}
          {...datasetProps(layout, dataset)}
          {...options}
          selectedNodeId={selectedNodeId}
          onNodeSelect={setSelectedNodeId}
          onBackgroundClick={() => setSelectedNodeId(undefined)}
          fitView
          fitPadding={28}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${border}`, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, lineHeight: 1.5 }}>
        <span style={{ color: fg2 }}>
          <span style={{ fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, color: fg3 }}>Data </span>
          {dataset.label}: {dataset.nodes.length} nodes, {dataset.edges.length} edges.{dataset.source ? ` ${dataset.source}` : ''}
        </span>
        <span style={{ color: fg3 }}>
          <span style={{ fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10 }}>Limits </span>
          {info.caveat}
        </span>
      </div>
    </div>
  )
}

// ─── Interactive comparison ────────────────────────────────────────────────

const CARD_STATUS: Record<string, TopologyNodeStatus> = { life: 'ok', climate: 'warning', software: 'idle' }

function pseudoMetricPercent(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 100
  return Math.abs(hash)
}

function toggled(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

type MarginPreset = 'tight' | 'default' | 'wide'

/** 'Wide' per engine: force pads by node width already, so its wide is much larger. */
const WIDE_MARGIN: Partial<Record<LayoutKey, number>> = { force: 280, 'force-clustered': 280, organic: 72, galaxy: 48 }

const MARGIN_LAYOUTS = new Set<LayoutKey>(['force', 'force-clustered', 'organic', 'galaxy'])
const BOUNDARY_LAYOUTS = new Set<LayoutKey>(['galaxy', 'force-clustered', 'radial-tree'])

export function GraphLayoutsShowcase() {
  const [galleryLayout, setGalleryLayout] = useState<LayoutKey>('galaxy')
  const [datasetKey, setDatasetKey] = useState<DatasetKey>('budget')
  const [layout, setLayout] = useState<LayoutKey>('galaxy')
  const [edgeStyle, setEdgeStyle] = useState<'curved' | 'straight'>('curved')
  const [nodeStyle, setNodeStyle] = useState<'default' | 'cards'>('default')
  const [showAllRelations, setShowAllRelations] = useState(false)
  // undefined = the engine's own default (off for galaxy, on for force-clustered and radial-tree).
  const [boundaries, setBoundaries] = useState<boolean | undefined>()
  const [showRings, setShowRings] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>()
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set())
  const [draggable, setDraggable] = useState(true)
  const [drawerWidth, setDrawerWidth] = useState(360)
  const [marginPreset, setMarginPreset] = useState<MarginPreset>('default')

  const dataset = DATASETS[datasetKey]
  const info = LAYOUT_INFO[layout]
  const nodeMargin = marginPreset === 'tight' ? 0 : marginPreset === 'wide' ? WIDE_MARGIN[layout] : undefined
  const effectiveBoundaries = boundaries ?? layout !== 'galaxy'

  const selectDataset = useCallback((key: DatasetKey) => {
    setDatasetKey(key)
    setSelectedNodeId(undefined)
    setSelectedEdgeId(undefined)
    setCollapsedNodeIds(new Set())
  }, [])

  const selectLayout = useCallback((key: LayoutKey) => {
    setLayout(key)
    setBoundaries(undefined)
    setMarginPreset('default')
  }, [])

  // Node and edge selection are mutually exclusive in this demo's inspector, same as tabs.
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

  const handleToggleCollapse = useCallback((id: string) => setCollapsedNodeIds(prev => toggled(prev, id)), [])

  // Straight: relational edges get curvature 0 per edge; structural edges use
  // structuralEdgeCurvature, the prop meant for exactly this.
  const edges = useMemo(
    () => (edgeStyle === 'straight' ? dataset.edges.map(e => (e.role === 'structural' ? e : { ...e, curvature: 0 })) : dataset.edges),
    [dataset.edges, edgeStyle]
  )

  const renderCardNode = useCallback((node: GraphNodeData, selected: boolean, hierarchy?: GraphNodeHierarchyMeta) => {
    const percent = pseudoMetricPercent(node.id)
    return (
      <div style={{ position: 'relative' }}>
        <TopologyNode
          title={node.label}
          nodeRole={node.kind === 'I' ? 'individual' : 'class'}
          status={CARD_STATUS[node.domainColor ?? ''] ?? 'idle'}
          metrics={[{ label: 'Weight', value: `${percent}%`, percent, sparklineData: [], color: 'amber' }]}
          selected={selected}
          onSelect={() => handleNodeSelect(node.id)}
        />
        {hierarchy?.hasChildren && hierarchy.onToggleCollapse && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); hierarchy.onToggleCollapse!() }}
            aria-label={hierarchy.collapsed ? 'Expand' : 'Collapse'}
            style={{
              position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 4,
              border: `1px solid ${border}`,
              background: 'rgb(var(--canvas-bg-2, 243 244 246))',
              cursor: 'pointer', fontSize: 11, lineHeight: 1,
            }}
          >
            {hierarchy.collapsed ? `+${hierarchy.hiddenDescendantCount}` : '−'}
          </button>
        )}
      </div>
    )
  }, [handleNodeSelect])

  const toNodeMetadata = useCallback((n: DemoNode): GraphNodeMetadata => (
    { id: n.id, title: n.title ?? n.label, kind: n.kind, domain: n.domain }
  ), [])

  // Every relationship touching `nodeId`, in the shape GraphInspector expects.
  const relationshipsFor = useCallback((nodeId: string): RelationshipLink[] =>
    dataset.edges
      .filter(e => e.sourceId === nodeId || e.targetId === nodeId)
      .map(e => {
        const isOutgoing = e.sourceId === nodeId
        const otherId = isOutgoing ? e.targetId : e.sourceId
        const other = dataset.nodes.find(n => n.id === otherId)
        return {
          id: e.id,
          target: otherId,
          targetTitle: other?.title ?? other?.label ?? otherId,
          targetDomain: other?.domain,
          predicate: e.predicate,
          direction: isOutgoing ? 'out' as const : 'in' as const,
        }
      }), [dataset])

  const selectedNode = dataset.nodes.find(n => n.id === selectedNodeId)
  const inspectorNode = selectedNode ? toNodeMetadata(selectedNode) : undefined
  const relationships = selectedNodeId ? relationshipsFor(selectedNodeId) : []

  const selectedEdge = selectedEdgeId ? dataset.edges.find(e => e.id === selectedEdgeId) : undefined
  const edgeSourceNode = selectedEdge ? dataset.nodes.find(n => n.id === selectedEdge.sourceId) : undefined
  const edgeTargetNode = selectedEdge ? dataset.nodes.find(n => n.id === selectedEdge.targetId) : undefined
  const edgeInspectorData: GraphEdgeMetadata | undefined = selectedEdge && edgeSourceNode && edgeTargetNode
    ? {
        id: selectedEdge.id,
        predicate: selectedEdge.predicate,
        sourceId: edgeSourceNode.id,
        sourceTitle: edgeSourceNode.title ?? edgeSourceNode.label,
        sourceDomain: edgeSourceNode.domain,
        targetId: edgeTargetNode.id,
        targetTitle: edgeTargetNode.title ?? edgeTargetNode.label,
        targetDomain: edgeTargetNode.domain,
        variant: selectedEdge.variant,
        weight: selectedEdge.weight,
      }
    : undefined

  // Only meaningful when there are relational edges for isStructuralEdge to hide. Orthogonal always
  // draws them (routing every edge is its point); ux-navigation reveals routes on hover instead.
  const showRelationsControl = hasHierarchy(dataset)
    && layout !== 'ux-navigation' && layout !== 'orthogonal'
    && dataset.edges.some(e => e.role === 'relational')

  return (
    <div>
      <PageHeader
        name="Graph Layouts"
        description="GraphCanvas has seven automatic layout engines, each built for a different shape of graph: galaxy for weighted hierarchies, organic for general graphs, orthogonal for mostly-tree diagrams with routed edges, radial-tree for a single deep tree, force-clustered for graphs with community structure, force for arbitrary graphs, and ux-navigation for page/view screen maps. Every engine sizes its layout from real rendered node size, so swapping node rendering needs no retuning."
      />
      <ShowcaseSection
        label="Layout gallery"
        description="Each engine on the data it is designed for, with the options that suit it. The canvas pans, zooms and selects; drag nodes to reposition them."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
            <TabBar
              tabs={LAYOUT_ORDER.map(key => ({ id: key, label: LAYOUT_INFO[key].label }))}
              activeTabId={galleryLayout}
              onSelectTab={(id) => setGalleryLayout(id as LayoutKey)}
            />
          </div>
          {/* Keyed so each tab mounts fresh and fits its own data. */}
          <GalleryCard key={galleryLayout} layout={galleryLayout} />
        </div>
      </ShowcaseSection>
      <ShowcaseSection
        label="Interactive comparison"
        description="Run any engine on any dataset. Nodes with a chevron have structural children; click it to collapse the subtree. Relational edges are hidden until a node touching them is hovered, unless Relations is set to All; orthogonal always draws them. Default node rendering draws galaxy nodes as round bodies sized by weight; Cards swaps in a custom renderNode. Selecting a node or edge opens a detail panel; drag its left edge to resize."
      >
        <DemoCard>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, rowGap: 10 }}>
              <Control label="Dataset">
                <div style={{ width: 200 }}>
                  <Select value={datasetKey} onChange={(v) => selectDataset(v as DatasetKey)} ariaLabel="Dataset">
                    {(Object.keys(DATASETS) as DatasetKey[]).map(key => (
                      <Select.Item key={key} value={key}>{DATASETS[key].label}</Select.Item>
                    ))}
                  </Select>
                </div>
              </Control>
              <Control label="Layout">
                <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
                  <SegmentedControl
                    value={layout}
                    onChange={(v) => selectLayout(v as LayoutKey)}
                    options={LAYOUT_ORDER.map(key => ({ value: key, label: LAYOUT_INFO[key].label }))}
                  />
                </div>
              </Control>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, rowGap: 10 }}>
              <Control label="Nodes">
                <SegmentedControl
                  value={nodeStyle}
                  onChange={(v) => setNodeStyle(v as 'default' | 'cards')}
                  options={[{ value: 'default', label: 'Default' }, { value: 'cards', label: 'Cards' }]}
                />
              </Control>
              {layout !== 'orthogonal' && (
                <Control label="Edges">
                  <SegmentedControl
                    value={edgeStyle}
                    onChange={(v) => setEdgeStyle(v as 'curved' | 'straight')}
                    options={[{ value: 'curved', label: 'Curved' }, { value: 'straight', label: 'Straight' }]}
                  />
                </Control>
              )}
              {showRelationsControl && (
                <Control label="Relations">
                  <SegmentedControl
                    value={showAllRelations ? 'all' : 'structural'}
                    onChange={(v) => setShowAllRelations(v === 'all')}
                    options={[{ value: 'structural', label: 'Structural' }, { value: 'all', label: 'All' }]}
                  />
                </Control>
              )}
              <Control label="Drag">
                <SegmentedControl
                  value={draggable ? 'on' : 'off'}
                  onChange={(v) => setDraggable(v === 'on')}
                  options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
                />
              </Control>
              {MARGIN_LAYOUTS.has(layout) && (
                <Control label="Node margin">
                  <SegmentedControl
                    value={marginPreset}
                    onChange={(v) => setMarginPreset(v as MarginPreset)}
                    options={[
                      { value: 'tight', label: 'Tight' },
                      { value: 'default', label: 'Default' },
                      { value: 'wide', label: 'Wide' },
                    ]}
                  />
                </Control>
              )}
              {BOUNDARY_LAYOUTS.has(layout) && (
                <Control label="Boundaries">
                  <SegmentedControl
                    value={effectiveBoundaries ? 'on' : 'off'}
                    onChange={(v) => setBoundaries(v === 'on')}
                    options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
                  />
                </Control>
              )}
              {layout === 'radial-tree' && (
                <Control label="Rings">
                  <SegmentedControl
                    value={showRings ? 'on' : 'off'}
                    onChange={(v) => setShowRings(v === 'on')}
                    options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
                  />
                </Control>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, lineHeight: 1.5 }}>
              <span style={{ color: fg2 }}>{dataset.description}{dataset.source ? ` Source: ${dataset.source}` : ''}</span>
              <span style={{ color: fg3 }}>
                {info.label}: {info.caveat}
                {datasetKey !== info.recommended && (
                  <>
                    {' '}Designed for data like {DATASETS[info.recommended].label}.{' '}
                    <Button variant="link" size="sm" onClick={() => selectDataset(info.recommended)}>
                      Load {DATASETS[info.recommended].label}
                    </Button>
                  </>
                )}
              </span>
            </div>
            <div style={{ height: 560, position: 'relative' }}>
              <GraphCanvas
                // GraphCanvas fits the viewport once per mount, so anything that changes the
                // overall footprint (dataset, engine, node rendering, margin) remounts it to re-fit.
                key={`${datasetKey}-${layout}-${nodeStyle}-${marginPreset}`}
                nodes={dataset.nodes}
                edges={edges}
                layout={layout}
                collapsedNodeIds={collapsedNodeIds}
                onToggleCollapse={handleToggleCollapse}
                {...datasetProps(layout, dataset)}
                nodeMargin={nodeMargin}
                showClusterBoundaries={effectiveBoundaries}
                showHierarchyRings={layout === 'radial-tree' && showRings}
                structuralEdgeCurvature={edgeStyle === 'straight' ? 0 : undefined}
                showAllRelations={(showRelationsControl && showAllRelations) || layout === 'orthogonal'}
                draggable={draggable}
                fitView
                fitPadding={40}
                selectedNodeId={selectedNodeId}
                onNodeSelect={handleNodeSelect}
                selectedEdgeId={selectedEdgeId}
                onEdgeSelect={handleEdgeSelect}
                onBackgroundClick={handleBackgroundClick}
                renderNode={nodeStyle === 'cards' ? renderCardNode : undefined}
                style={{ width: '100%', height: '100%' }}
              />

              {/* Floats over the canvas; opens when something is selected. */}
              <DetailDrawer open={!!(inspectorNode || edgeInspectorData)} width={drawerWidth} onWidthChange={setDrawerWidth}>
                {edgeInspectorData
                  ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {edgeSourceNode && <GraphInspector node={toNodeMetadata(edgeSourceNode)} relationships={relationshipsFor(edgeSourceNode.id)} onNodeSelect={handleNodeSelect} />}
                      <GraphEdgeInspector edge={edgeInspectorData} onNodeSelect={handleNodeSelect} />
                      {edgeTargetNode && <GraphInspector node={toNodeMetadata(edgeTargetNode)} relationships={relationshipsFor(edgeTargetNode.id)} onNodeSelect={handleNodeSelect} />}
                    </div>
                  )
                  : inspectorNode && <GraphInspector node={inspectorNode} relationships={relationships} onNodeSelect={handleNodeSelect} />
                }
              </DetailDrawer>
            </div>
          </div>
        </DemoCard>
      </ShowcaseSection>
    </div>
  )
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, maxWidth: '100%' }}>
      <span style={{ fontFamily: mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: fg3 }}>
        {label}
      </span>
      {children}
    </div>
  )
}
