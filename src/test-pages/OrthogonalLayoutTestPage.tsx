import { useState } from 'react'
import { GraphCanvas, type GraphNodeData, type GraphEdge } from '../components/GraphCanvas'

// A mostly-tree graph with a few cycles and a bidirectional pair: the shape orthogonal is
// specified against (heimdall-layout-loop/design-material/orthogonal/vision-statement.md).
// Nodes carry no x/y; the engine places them on its cell grid and routes every edge.
const IDS = {
  app: 'app', router: 'router', store: 'store', api: 'api_client', auth: 'auth',
  home: 'page_home', settings: 'page_settings', profile: 'page_profile', billing: 'page_billing',
  table: 'view_table', chart: 'view_chart', form: 'view_form', modal: 'view_modal', toast: 'view_toast',
  cache: 'cache', telemetry: 'telemetry',
}
const NODES: GraphNodeData[] = Object.values(IDS).map((id) => ({
  id,
  label: id,
  kind: id.startsWith('page_') ? 'P' : id.startsWith('view_') ? 'V' : 'S',
  domainColor: id.startsWith('page_') ? 'violet' : id.startsWith('view_') ? 'cyan' : 'emerald',
}))
const EDGES: GraphEdge[] = []
let n = 0
const link = (a: string, b: string, label?: string) => EDGES.push({ id: `e${n++}`, sourceId: a, targetId: b, label })
link(IDS.app, IDS.router); link(IDS.app, IDS.store); link(IDS.app, IDS.auth)
link(IDS.router, IDS.home); link(IDS.router, IDS.settings); link(IDS.router, IDS.profile); link(IDS.router, IDS.billing)
link(IDS.home, IDS.table); link(IDS.home, IDS.chart); link(IDS.settings, IDS.form); link(IDS.profile, IDS.form)
link(IDS.billing, IDS.modal); link(IDS.app, IDS.toast)
link(IDS.store, IDS.api); link(IDS.api, IDS.cache); link(IDS.cache, IDS.api, 'invalidates')
link(IDS.auth, IDS.api); link(IDS.table, IDS.store, 'reads'); link(IDS.telemetry, IDS.api); link(IDS.app, IDS.telemetry)

export default function OrthogonalLayoutTestPage() {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        data-testid="orthogonal-layout-caption"
        style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid var(--canvas-border, #d8dde5)' }}
      >
        layout=&quot;orthogonal&quot; · {NODES.length} nodes · {EDGES.length} edges · grid placement + lattice-routed polylines
      </div>
      <GraphCanvas
        data-testid="orthogonal-canvas"
        layout="orthogonal"
        nodes={NODES}
        edges={EDGES}
        fitView
        fitPadding={40}
        selectedNodeId={selectedId}
        onNodeSelect={setSelectedId}
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  )
}
