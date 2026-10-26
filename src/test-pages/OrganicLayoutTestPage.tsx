import { useState } from 'react'
import { GraphCanvas, type GraphNodeData, type GraphEdge } from '../components/GraphCanvas'

// Two dense communities joined by one bridge, a pendant chain, and two isolates — the shapes
// organic is specified against (heimdall-layout-loop/design-material/organic/vision-statement.md).
// No node carries x/y, so every render is a cold, MDS-seeded solve.
const GROUP_A = ['svc_api', 'svc_auth', 'svc_users', 'svc_billing', 'svc_search', 'svc_notify']
const GROUP_B = ['db_primary', 'db_replica', 'cache_redis', 'queue_jobs', 'store_blobs']
const CHAIN = ['edge_cdn', 'edge_waf', 'edge_lb']

const NODES: GraphNodeData[] = [
  ...GROUP_A.map((id, i) => ({ id, label: id, kind: 'S', domainColor: i % 2 ? 'violet' : 'emerald' })),
  ...GROUP_B.map(id => ({ id, label: id, kind: 'D', domainColor: 'cyan' })),
  ...CHAIN.map(id => ({ id, label: id, kind: 'E', domainColor: 'amber' })),
  { id: 'orphan_metrics', label: 'orphan_metrics', kind: 'M' },
  { id: 'orphan_docs', label: 'orphan_docs', kind: 'M' },
]

const EDGES: GraphEdge[] = []
let n = 0
const link = (a: string, b: string) => EDGES.push({ id: `e${n++}`, sourceId: a, targetId: b })
for (let i = 0; i < GROUP_A.length; i++) for (let j = i + 1; j < GROUP_A.length; j++) if ((i + j) % 3 !== 1) link(GROUP_A[i], GROUP_A[j])
for (let i = 0; i < GROUP_B.length; i++) for (let j = i + 1; j < GROUP_B.length; j++) if ((i * j) % 3 !== 1) link(GROUP_B[i], GROUP_B[j])
link('svc_users', 'db_primary')
link('svc_search', 'cache_redis')
link('edge_cdn', 'edge_waf')
link('edge_waf', 'edge_lb')
link('edge_lb', 'svc_api')

export default function OrganicLayoutTestPage() {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        data-testid="organic-layout-caption"
        style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid var(--canvas-border, #d8dde5)' }}
      >
        layout=&quot;organic&quot; · {NODES.length} nodes · {EDGES.length} edges · stress majorization + GTree overlap removal
      </div>
      <GraphCanvas
        data-testid="organic-canvas"
        layout="organic"
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
