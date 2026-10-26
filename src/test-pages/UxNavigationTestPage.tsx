import { useCallback, useMemo, useState } from 'react'
import { GraphCanvas } from '../components/GraphCanvas'
import GraphNode from '../components/GraphNode'
import type { GraphNodeData } from '../components/GraphCanvas'

interface NodeData extends GraphNodeData {
  kind?: string
  title?: string
}

interface EdgeData {
  id: string
  sourceId: string
  targetId: string
  label?: string
  structural?: boolean
  curvature?: number
}

// Two independent page trees with multiple views per page and navigation routes
const UX_NAV_NODES: NodeData[] = [
  // Tree 1 - Pages and views
  { id: 'page1', label: 'Dashboard', kind: 'P', title: 'Dashboard' },
  { id: 'page1_child1', label: 'Analytics', kind: 'P', title: 'Analytics' },
  { id: 'page1_child2', label: 'Reports', kind: 'P', title: 'Reports' },

  { id: 'view1_1', label: 'Metrics', kind: 'V', title: 'Metrics' },
  { id: 'view1_2', label: 'Charts', kind: 'V', title: 'Charts' },
  { id: 'view1_3', label: 'Export', kind: 'V', title: 'Export' },

  { id: 'view2_1', label: 'Trends', kind: 'V', title: 'Trends' },
  { id: 'view2_2', label: 'Comparison', kind: 'V', title: 'Comparison' },

  { id: 'view3_1', label: 'PDF', kind: 'V', title: 'PDF' },
  { id: 'view3_2', label: 'CSV', kind: 'V', title: 'CSV' },

  // Tree 2 - Different pages with views
  { id: 'page2', label: 'Settings', kind: 'P', title: 'Settings' },
  { id: 'page2_child1', label: 'Profile', kind: 'P', title: 'Profile' },
  { id: 'page2_child2', label: 'Security', kind: 'P', title: 'Security' },

  { id: 'view4_1', label: 'Account', kind: 'V', title: 'Account' },
  { id: 'view4_2', label: 'Preferences', kind: 'V', title: 'Preferences' },

  { id: 'view5_1', label: '2FA', kind: 'V', title: 'Two-Factor' },
  { id: 'view5_2', label: 'Sessions', kind: 'V', title: 'Sessions' },

  // Shared view appearing in multiple pages
  { id: 'sharedView', label: 'Help & Support', kind: 'V', title: 'Help & Support' },
]

// Structural edges (tree relationships) and navigation routes
const UX_NAV_EDGES: EdgeData[] = [
  // Tree 1 structural edges
  { id: 'struct1', sourceId: 'page1', targetId: 'page1_child1', structural: true },
  { id: 'struct2', sourceId: 'page1', targetId: 'page1_child2', structural: true },

  // Tree 1 view relationships (fan layout)
  { id: 'view_rel1', sourceId: 'page1', targetId: 'view1_1', structural: true },
  { id: 'view_rel2', sourceId: 'page1', targetId: 'view1_2', structural: true },
  { id: 'view_rel3', sourceId: 'page1', targetId: 'view1_3', structural: true },

  { id: 'view_rel4', sourceId: 'page1_child1', targetId: 'view2_1', structural: true },
  { id: 'view_rel5', sourceId: 'page1_child1', targetId: 'view2_2', structural: true },

  { id: 'view_rel6', sourceId: 'page1_child2', targetId: 'view3_1', structural: true },
  { id: 'view_rel7', sourceId: 'page1_child2', targetId: 'view3_2', structural: true },

  // Navigation routes from pages
  { id: 'nav_page1', sourceId: 'page1', targetId: 'page2', structural: false },
  { id: 'nav_view1', sourceId: 'view1_1', targetId: 'page2', structural: false },
  { id: 'nav_view2', sourceId: 'view1_2', targetId: 'page2_child1', structural: false },

  // Navigation routes from Tree 1 child pages
  { id: 'nav_page1_child1', sourceId: 'page1_child1', targetId: 'page2_child2', structural: false },
  { id: 'nav_view3', sourceId: 'view2_1', targetId: 'page2', structural: false },
  { id: 'nav_page1_child2', sourceId: 'page1_child2', targetId: 'page2_child1', structural: false },

  // Tree 2 structural edges
  { id: 'struct3', sourceId: 'page2', targetId: 'page2_child1', structural: true },
  { id: 'struct4', sourceId: 'page2', targetId: 'page2_child2', structural: true },

  // Tree 2 view relationships
  { id: 'view_rel8', sourceId: 'page2', targetId: 'view4_1', structural: true },
  { id: 'view_rel9', sourceId: 'page2', targetId: 'view4_2', structural: true },

  { id: 'view_rel10', sourceId: 'page2_child1', targetId: 'view5_1', structural: true },
  { id: 'view_rel11', sourceId: 'page2_child1', targetId: 'view5_2', structural: true },

  // Navigation routes from Tree 2
  { id: 'nav_page2', sourceId: 'page2', targetId: 'page1', structural: false },
  { id: 'nav_view4', sourceId: 'view4_1', targetId: 'page1_child1', structural: false },

  // Multi-parent shared view
  { id: 'shared_view_page1', sourceId: 'page1', targetId: 'sharedView', structural: true },
  { id: 'shared_view_page2', sourceId: 'page2', targetId: 'sharedView', structural: true },
]

export default function UxNavigationTestPage() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>()
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set())
  const [edgeCurvature, setEdgeCurvature] = useState<'curved' | 'straight'>('curved')

  const handleNodeSelect = useCallback((id: string) => {
    setSelectedNodeId(id)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(undefined)
  }, [])

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const renderNode = useCallback((node: GraphNodeData, selected: boolean) => (
    <GraphNode
      id={node.id}
      label={node.label}
      kind={(node as NodeData).kind}
      selected={selected}
      onSelect={() => handleNodeSelect(node.id)}
    />
  ), [handleNodeSelect])

  const edgesWithCurvature: EdgeData[] = useMemo(() =>
    UX_NAV_EDGES.map(edge => ({
      ...edge,
      curvature: edgeCurvature === 'curved' ? 0.3 : 0,
    })),
    [edgeCurvature]
  )

  return (
    <div
      data-testid="ux-navigation-test-page"
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '16px' }}
    >
      <div style={{ marginBottom: '12px' }}>
        <h1 style={{ marginBottom: '8px', fontSize: '20px', fontWeight: 600 }}>UX Navigation Layout</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            data-testid="edge-style-curved"
            onClick={() => setEdgeCurvature('curved')}
            style={{
              padding: '6px 12px',
              background: edgeCurvature === 'curved' ? 'var(--accent-primary, #fbbf24)' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: edgeCurvature === 'curved' ? 600 : 400,
            }}
          >
            Curved Edges
          </button>
          <button
            type="button"
            data-testid="edge-style-straight"
            onClick={() => setEdgeCurvature('straight')}
            style={{
              padding: '6px 12px',
              background: edgeCurvature === 'straight' ? 'var(--accent-primary, #fbbf24)' : '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: edgeCurvature === 'straight' ? 600 : 400,
            }}
          >
            Straight Edges
          </button>
          {hoveredNodeId && (
            <div style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--canvas-fg, #1a1d24)' }}>
              Hovering: <strong>{hoveredNodeId}</strong>
            </div>
          )}
        </div>
      </div>

      <GraphCanvas
        key="ux-nav-canvas"
        data-testid="ux-nav-canvas"
        nodes={UX_NAV_NODES}
        edges={edgesWithCurvature as any}
        layout="ux-navigation"
        isPageNode={(node) => (node as NodeData).kind === 'P'}
        // Without this GraphCanvas treats no edge as structural for ux-navigation (its default
        // is layout !== 'ux-navigation'), so every node became its own one-node tree and the
        // page never showed a tree or a fan (the snapshots were of that degenerate render).
        isStructuralEdge={(edge) => !!(edge as EdgeData).structural}
        isNavigationRoute={(edge) => !(edge as EdgeData).structural}
        selectedNodeId={selectedNodeId}
        onNodeSelect={handleNodeSelect}
        onNodeHover={setHoveredNodeId}
        onBackgroundClick={handleBackgroundClick}
        collapsedNodeIds={collapsedNodeIds}
        onToggleCollapse={handleToggleCollapse}
        draggable={false}
        renderNode={renderNode}
        fitView
        fitPadding={40}
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  )
}
