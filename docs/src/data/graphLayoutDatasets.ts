import type { GraphNodeData, GraphEdgeData } from '@tinkermonkey/heimdall-ui'
import { GALAXY_BUDGET_NODES, GALAXY_BUDGET_EDGES } from '@/test-pages/galaxyBudgetData'
import { KARATE_NODES, KARATE_EDGES, FLARE_NODES, FLARE_EDGES } from './openDatasets'

// Demo data for the Graph Layouts page. Every dataset here is either written for this repo or
// openly redistributable (see openDatasets.ts for the two external ones and their provenance).
// Each layout engine is designed for a different shape of graph, so each one has a recommended
// dataset (LAYOUT_INFO below) chosen from the layout-evaluation harness's picks.

export interface DemoNode extends GraphNodeData {
  title?: string
  domain?: string
  /** ux-navigation / orthogonal: page (true) or view (false). */
  isPage?: boolean
}

/** structural = parent/child hierarchy (source is the parent); route = a ux navigation route. */
export type EdgeRole = 'structural' | 'relational' | 'route'

export interface DemoEdge extends GraphEdgeData {
  role: EdgeRole
  /** Shown in the inspector. `label` is set only where it should be drawn on the canvas. */
  predicate: string
}

export type LayoutKey = 'galaxy' | 'organic' | 'orthogonal' | 'radial-tree' | 'force-clustered' | 'force' | 'ux-navigation'

export type DatasetKey = 'ontology' | 'services' | 'budget' | 'mesh' | 'modules' | 'flare' | 'karate' | 'pages'

export interface Dataset {
  label: string
  /** One sentence on the graph's shape. */
  description: string
  /** Attribution for external data. */
  source?: string
  nodes: DemoNode[]
  edges: DemoEdge[]
}

const edge = (id: string, sourceId: string, targetId: string, role: EdgeRole, predicate: string, showLabel = false): DemoEdge =>
  ({ id, sourceId, targetId, role, predicate, label: showLabel ? predicate : undefined })

// ─── Ontology: deep and narrow, two roots ──────────────────────────────────

const ONTOLOGY_NODES: DemoNode[] = [
  { id: 'organism', label: 'Organism', kind: 'C', domainColor: 'life', domain: 'life' },
  { id: 'eukaryote', label: 'Eukaryote', kind: 'C', domainColor: 'life', domain: 'life' },
  { id: 'cell', label: 'Cell', kind: 'C', domainColor: 'life', domain: 'life' },
  { id: 'nucleus', label: 'Nucleus', kind: 'C', domainColor: 'life', domain: 'life' },
  { id: 'mitochondrion', label: 'Mitochondrion', kind: 'C', domainColor: 'life', domain: 'life' },
  { id: 'chromosome', label: 'Chromosome', kind: 'C', domainColor: 'life', domain: 'life' },
  { id: 'brca1', label: 'BRCA1', kind: 'I', domainColor: 'life', domain: 'life' },
  { id: 'tp53', label: 'TP53', kind: 'I', domainColor: 'life', domain: 'life' },
  // Reachable only through a relational edge (encodes), so it is a root of its own.
  { id: 'protein', label: 'Protein', kind: 'C', domainColor: 'life', domain: 'life' },
  { id: 'atmosphere', label: 'Atmosphere', kind: 'C', domainColor: 'climate', domain: 'climate' },
  { id: 'greenhouse_gas', label: 'Greenhouse Gas', kind: 'C', domainColor: 'climate', domain: 'climate' },
  { id: 'co2', label: 'CO2', kind: 'I', domainColor: 'climate', domain: 'climate' },
  { id: 'ocean', label: 'Ocean', kind: 'C', domainColor: 'climate', domain: 'climate' },
  { id: 'ocean_acidification', label: 'Ocean Acidification', kind: 'I', domainColor: 'climate', domain: 'climate' },
  // No edges at all.
  { id: 'unreviewed_claim', label: 'Unreviewed Claim', kind: 'C', domainColor: 'climate', domain: 'climate' },
]

const ONTOLOGY_EDGES: DemoEdge[] = [
  edge('o_organism_eukaryote', 'organism', 'eukaryote', 'structural', 'contains', true),
  edge('o_eukaryote_cell', 'eukaryote', 'cell', 'structural', 'contains', true),
  edge('o_cell_nucleus', 'cell', 'nucleus', 'structural', 'contains', true),
  edge('o_cell_mito', 'cell', 'mitochondrion', 'structural', 'contains', true),
  edge('o_nucleus_chromosome', 'nucleus', 'chromosome', 'structural', 'contains', true),
  edge('o_chromosome_brca1', 'chromosome', 'brca1', 'structural', 'instanceOf', true),
  edge('o_chromosome_tp53', 'chromosome', 'tp53', 'structural', 'instanceOf', true),
  edge('o_atmosphere_ghg', 'atmosphere', 'greenhouse_gas', 'structural', 'contains', true),
  edge('o_atmosphere_ocean', 'atmosphere', 'ocean', 'structural', 'contains', true),
  edge('o_ghg_co2', 'greenhouse_gas', 'co2', 'structural', 'instanceOf', true),
  edge('o_ocean_acidification', 'ocean', 'ocean_acidification', 'structural', 'instanceOf', true),
  edge('o_brca1_protein', 'brca1', 'protein', 'relational', 'encodes', true),
  edge('o_co2_ocean_acid', 'co2', 'ocean_acidification', 'relational', 'causes', true),
]

// ─── Service topology: wide and shallow, one root ──────────────────────────

const SERVICES_NODES: DemoNode[] = [
  { id: 'platform', label: 'Platform', kind: 'C', domain: 'platform' },
  { id: 'frontend', label: 'Frontend', kind: 'C', domainColor: 'life', domain: 'frontend' },
  { id: 'web_app', label: 'Web App', kind: 'C', domainColor: 'life', domain: 'frontend' },
  { id: 'mobile_app', label: 'Mobile App', kind: 'C', domainColor: 'life', domain: 'frontend' },
  { id: 'admin_console', label: 'Admin Console', kind: 'C', domainColor: 'life', domain: 'frontend' },
  { id: 'backend', label: 'Backend', kind: 'C', domainColor: 'software', domain: 'backend' },
  { id: 'api_gateway', label: 'API Gateway', kind: 'C', domainColor: 'software', domain: 'backend' },
  { id: 'auth_service', label: 'Auth Service', kind: 'C', domainColor: 'software', domain: 'backend' },
  { id: 'billing_service', label: 'Billing Service', kind: 'C', domainColor: 'software', domain: 'backend' },
  { id: 'notification_service', label: 'Notification Service', kind: 'C', domainColor: 'software', domain: 'backend' },
  { id: 'data', label: 'Data', kind: 'C', domainColor: 'climate', domain: 'data' },
  { id: 'primary_db', label: 'Primary DB', kind: 'C', domainColor: 'climate', domain: 'data' },
  { id: 'cache', label: 'Cache', kind: 'C', domainColor: 'climate', domain: 'data' },
  { id: 'analytics_warehouse', label: 'Analytics Warehouse', kind: 'C', domainColor: 'climate', domain: 'data' },
  { id: 'infra', label: 'Infra', kind: 'C', domain: 'infra' },
  { id: 'load_balancer', label: 'Load Balancer', kind: 'C', domain: 'infra' },
  { id: 'message_queue', label: 'Message Queue', kind: 'C', domain: 'infra' },
  // No edges at all.
  { id: 'legacy_reporting_tool', label: 'Legacy Reporting Tool', kind: 'C', domain: 'infra' },
]

const SERVICES_EDGES: DemoEdge[] = [
  edge('s_platform_frontend', 'platform', 'frontend', 'structural', 'contains', true),
  edge('s_platform_backend', 'platform', 'backend', 'structural', 'contains', true),
  edge('s_platform_data', 'platform', 'data', 'structural', 'contains', true),
  edge('s_platform_infra', 'platform', 'infra', 'structural', 'contains', true),
  edge('s_frontend_web', 'frontend', 'web_app', 'structural', 'contains', true),
  edge('s_frontend_mobile', 'frontend', 'mobile_app', 'structural', 'contains', true),
  edge('s_frontend_admin', 'frontend', 'admin_console', 'structural', 'contains', true),
  edge('s_backend_api', 'backend', 'api_gateway', 'structural', 'contains', true),
  edge('s_backend_auth', 'backend', 'auth_service', 'structural', 'contains', true),
  edge('s_backend_billing', 'backend', 'billing_service', 'structural', 'contains', true),
  edge('s_backend_notification', 'backend', 'notification_service', 'structural', 'contains', true),
  edge('s_data_primary', 'data', 'primary_db', 'structural', 'contains', true),
  edge('s_data_cache', 'data', 'cache', 'structural', 'contains', true),
  edge('s_data_analytics', 'data', 'analytics_warehouse', 'structural', 'contains', true),
  edge('s_infra_lb', 'infra', 'load_balancer', 'structural', 'contains', true),
  edge('s_infra_mq', 'infra', 'message_queue', 'structural', 'contains', true),
  edge('s_web_api', 'web_app', 'api_gateway', 'relational', 'callsInto', true),
  edge('s_mobile_api', 'mobile_app', 'api_gateway', 'relational', 'callsInto', true),
  edge('s_admin_api', 'admin_console', 'api_gateway', 'relational', 'callsInto', true),
  edge('s_api_auth', 'api_gateway', 'auth_service', 'relational', 'dependsOn', true),
  edge('s_billing_db', 'billing_service', 'primary_db', 'relational', 'dependsOn', true),
  edge('s_notification_mq', 'notification_service', 'message_queue', 'relational', 'dependsOn', true),
  edge('s_analytics_db', 'analytics_warehouse', 'primary_db', 'relational', 'readsFrom', true),
]

// ─── Federal budget: weighted hierarchy (galaxy) ───────────────────────────
// The galaxy lab's dataset: US federal outlays by function, $ billions. `weight` drives body
// area under layout="galaxy"; colour follows depth.

const DEPTH_COLOR = [undefined, 'software', 'life', 'climate']

const BUDGET_NODES: DemoNode[] = GALAXY_BUDGET_NODES.map(n => ({
  id: n.id,
  label: n.label,
  weight: n.size,
  domainColor: DEPTH_COLOR[n.depth],
  domain: `$${n.size.toLocaleString('en-US', { maximumFractionDigits: 1 })}B`,
}))

const BUDGET_EDGES: DemoEdge[] = GALAXY_BUDGET_EDGES.map(e => ({ ...e, curvature: undefined, role: 'structural', predicate: 'funds' }))

// ─── Service mesh: general graph (organic) ─────────────────────────────────
// Two dense communities joined by a bridge, a pendant chain and two isolates: the shapes organic
// is specified against. Same graph as the organic layout test page.

const MESH_SERVICES = ['svc_api', 'svc_auth', 'svc_users', 'svc_billing', 'svc_search', 'svc_notify']
const MESH_STORES = ['db_primary', 'db_replica', 'cache_redis', 'queue_jobs', 'store_blobs']
const MESH_EDGE_CHAIN = ['edge_cdn', 'edge_waf', 'edge_lb']

const MESH_NODES: DemoNode[] = [
  ...MESH_SERVICES.map(id => ({ id, label: id, kind: 'S', domainColor: 'software', domain: 'service' })),
  ...MESH_STORES.map(id => ({ id, label: id, kind: 'D', domainColor: 'climate', domain: 'storage' })),
  ...MESH_EDGE_CHAIN.map(id => ({ id, label: id, kind: 'E', domainColor: 'life', domain: 'edge' })),
  { id: 'orphan_metrics', label: 'orphan_metrics', kind: 'M', domain: 'unlinked' },
  { id: 'orphan_docs', label: 'orphan_docs', kind: 'M', domain: 'unlinked' },
]

const MESH_EDGES: DemoEdge[] = (() => {
  const edges: DemoEdge[] = []
  const link = (a: string, b: string, predicate: string) => edges.push(edge(`m${edges.length}`, a, b, 'relational', predicate))
  for (let i = 0; i < MESH_SERVICES.length; i++)
    for (let j = i + 1; j < MESH_SERVICES.length; j++)
      if ((i + j) % 3 !== 1) link(MESH_SERVICES[i], MESH_SERVICES[j], 'calls')
  for (let i = 0; i < MESH_STORES.length; i++)
    for (let j = i + 1; j < MESH_STORES.length; j++)
      if ((i * j) % 3 !== 1) link(MESH_STORES[i], MESH_STORES[j], 'replicatesTo')
  link('svc_users', 'db_primary', 'readsFrom')
  link('svc_search', 'cache_redis', 'readsFrom')
  link('edge_cdn', 'edge_waf', 'forwardsTo')
  link('edge_waf', 'edge_lb', 'forwardsTo')
  link('edge_lb', 'svc_api', 'forwardsTo')
  return edges
})()

// ─── App modules: mostly-tree graph with cycles (orthogonal) ───────────────
// Same graph as the orthogonal layout test page: containment tree, relational edges including a
// bidirectional pair, and two navigation routes that are routed last.

const MODULE_IDS = [
  'app', 'router', 'store', 'api_client', 'auth',
  'page_home', 'page_settings', 'page_profile', 'page_billing',
  'view_table', 'view_chart', 'view_form', 'view_modal', 'view_toast',
  'cache', 'telemetry',
]

const MODULE_NODES: DemoNode[] = MODULE_IDS.map(id => {
  const isView = id.startsWith('view_')
  const isPage = id.startsWith('page_')
  return {
    id,
    label: id,
    kind: isPage ? 'P' : isView ? 'V' : 'S',
    domainColor: isPage ? 'life' : isView ? 'climate' : 'software',
    domain: isPage ? 'page' : isView ? 'view' : 'service',
    isPage: !isView,
  }
})

const MODULE_EDGES: DemoEdge[] = (() => {
  const edges: DemoEdge[] = []
  const add = (a: string, b: string, role: EdgeRole, predicate: string, showLabel = false) =>
    edges.push(edge(`mod${edges.length}`, a, b, role, predicate, showLabel))
  for (const t of ['router', 'store', 'auth', 'view_toast', 'telemetry']) add('app', t, 'structural', 'contains')
  for (const t of ['page_home', 'page_settings', 'page_profile', 'page_billing']) add('router', t, 'structural', 'contains')
  add('page_home', 'view_table', 'structural', 'contains')
  add('page_home', 'view_chart', 'structural', 'contains')
  add('page_settings', 'view_form', 'structural', 'contains')
  add('page_billing', 'view_modal', 'structural', 'contains')
  add('page_profile', 'view_form', 'relational', 'embeds')
  add('store', 'api_client', 'relational', 'uses')
  add('api_client', 'cache', 'relational', 'uses')
  add('cache', 'api_client', 'relational', 'invalidates', true)
  add('auth', 'api_client', 'relational', 'uses')
  add('view_table', 'store', 'relational', 'reads', true)
  add('telemetry', 'api_client', 'relational', 'uses')
  add('page_home', 'page_settings', 'route', 'go to settings', true)
  add('page_billing', 'page_home', 'route', 'back home', true)
  return edges
})()

// ─── App pages: page trees with view fans (ux-navigation) ──────────────────
// Same graph as the ux-navigation test page: two page trees, views fanned off their pages, a view
// shared by two pages, and navigation routes between pages and views.

const PAGE_NODES: DemoNode[] = [
  { id: 'dashboard', label: 'Dashboard', kind: 'P', isPage: true, domainColor: 'life', domain: 'insights' },
  { id: 'analytics', label: 'Analytics', kind: 'P', isPage: true, domainColor: 'life', domain: 'insights' },
  { id: 'reports', label: 'Reports', kind: 'P', isPage: true, domainColor: 'life', domain: 'insights' },
  { id: 'metrics', label: 'Metrics', kind: 'V', domainColor: 'life', domain: 'insights' },
  { id: 'charts', label: 'Charts', kind: 'V', domainColor: 'life', domain: 'insights' },
  { id: 'export', label: 'Export', kind: 'V', domainColor: 'life', domain: 'insights' },
  { id: 'trends', label: 'Trends', kind: 'V', domainColor: 'life', domain: 'insights' },
  { id: 'comparison', label: 'Comparison', kind: 'V', domainColor: 'life', domain: 'insights' },
  { id: 'pdf', label: 'PDF', kind: 'V', domainColor: 'life', domain: 'insights' },
  { id: 'csv', label: 'CSV', kind: 'V', domainColor: 'life', domain: 'insights' },
  { id: 'settings', label: 'Settings', kind: 'P', isPage: true, domainColor: 'climate', domain: 'settings' },
  { id: 'profile', label: 'Profile', kind: 'P', isPage: true, domainColor: 'climate', domain: 'settings' },
  { id: 'security', label: 'Security', kind: 'P', isPage: true, domainColor: 'climate', domain: 'settings' },
  { id: 'account', label: 'Account', kind: 'V', domainColor: 'climate', domain: 'settings' },
  { id: 'preferences', label: 'Preferences', kind: 'V', domainColor: 'climate', domain: 'settings' },
  { id: 'two_factor', label: '2FA', kind: 'V', domainColor: 'climate', domain: 'settings' },
  { id: 'sessions', label: 'Sessions', kind: 'V', domainColor: 'climate', domain: 'settings' },
  { id: 'help', label: 'Help & Support', kind: 'V', domainColor: 'software', domain: 'shared' },
]

const PAGE_EDGES: DemoEdge[] = (() => {
  const edges: DemoEdge[] = []
  const add = (a: string, b: string, role: EdgeRole, predicate: string) => edges.push(edge(`p${edges.length}`, a, b, role, predicate))
  const contains = (parent: string, children: string[]) => children.forEach(c => add(parent, c, 'structural', 'contains'))
  contains('dashboard', ['analytics', 'reports', 'metrics', 'charts', 'export', 'help'])
  contains('analytics', ['trends', 'comparison'])
  contains('reports', ['pdf', 'csv'])
  contains('settings', ['profile', 'security', 'account', 'preferences', 'help'])
  contains('profile', ['two_factor', 'sessions'])
  const route = (a: string, b: string) => add(a, b, 'route', 'navigatesTo')
  route('dashboard', 'settings')
  route('metrics', 'settings')
  route('charts', 'profile')
  route('analytics', 'security')
  route('trends', 'settings')
  route('reports', 'profile')
  route('settings', 'dashboard')
  route('account', 'analytics')
  return edges
})()

// ─── Registry ──────────────────────────────────────────────────────────────

export const DATASETS: Record<DatasetKey, Dataset> = {
  ontology: {
    label: 'Ontology',
    description: 'Deep and narrow: a 6-level biology chain and a shallower climate tree as two separate roots, plus relational edges and an orphan.',
    nodes: ONTOLOGY_NODES,
    edges: ONTOLOGY_EDGES,
  },
  services: {
    label: 'Service topology',
    description: 'Wide and shallow: a 3-level platform tree with 3-4 children per branch, cross-cutting dependencies and an orphan.',
    nodes: SERVICES_NODES,
    edges: SERVICES_EDGES,
  },
  budget: {
    label: 'Federal budget',
    description: 'Weighted hierarchy: 57 US federal budget functions and sub-functions, 4 levels deep, weights spanning almost four orders of magnitude.',
    nodes: BUDGET_NODES,
    edges: BUDGET_EDGES,
  },
  mesh: {
    label: 'Service mesh',
    description: 'General graph: two dense communities joined by one bridge, a pendant edge chain and two isolates. No hierarchy.',
    nodes: MESH_NODES,
    edges: MESH_EDGES,
  },
  modules: {
    label: 'App modules',
    description: 'Mostly a tree: app containment with view fans, relational edges including a bidirectional pair, and two navigation routes.',
    nodes: MODULE_NODES,
    edges: MODULE_EDGES,
  },
  flare: {
    label: 'Flare operators',
    description: 'Strict tree: 25 packages and classes of flare.vis.operator (its layout sub-package left out), three levels deep with uneven branching.',
    source: 'Flare visualization toolkit class hierarchy, via D3 example data (ISC).',
    nodes: FLARE_NODES,
    edges: FLARE_EDGES,
  },
  karate: {
    label: 'Karate club',
    description: 'Social network: 34 club members and 78 observed friendships. Colour shows the faction each member joined after the club split.',
    source: 'Zachary (1977), Journal of Anthropological Research 33:452-473; edge list via NetworkX (BSD).',
    nodes: KARATE_NODES,
    edges: KARATE_EDGES,
  },
  pages: {
    label: 'App pages',
    description: 'Screen graph: two page trees with views fanned off each page, a view shared by two pages, and navigation routes.',
    nodes: PAGE_NODES,
    edges: PAGE_EDGES,
  },
}

export function hasHierarchy(dataset: Dataset): boolean {
  return dataset.edges.some(e => e.role === 'structural')
}

export interface LayoutInfo {
  label: string
  /** What the engine is for, one sentence. */
  summary: string
  /** Limits a reader should know before picking it. */
  caveat: string
  recommended: DatasetKey
}

export const LAYOUT_INFO: Record<LayoutKey, LayoutInfo> = {
  galaxy: {
    label: 'Galaxy',
    summary: 'Weighted hierarchy as orbits: body area grows with weight, children orbit their parent heaviest first, nothing overlaps.',
    caveat: 'Needs structural edges; relational edges can cross bodies. Without a weight, size comes from subtree leaf counts.',
    recommended: 'budget',
  },
  organic: {
    label: 'Organic',
    summary: 'General graphs: stress majorization with guaranteed zero overlap and a minimum gap. Deterministic. Successor to force.',
    caveat: 'Proof of concept: no clustering option yet, isolates are circle-packed. Strict trees read better as radial-tree or orthogonal.',
    recommended: 'mesh',
  },
  orthogonal: {
    label: 'Orthogonal',
    summary: 'Cell-grid placement with axis-parallel edge routes that never cross a node or share a segment. Successor to ux-navigation.',
    caveat: 'Proof of concept: best on sparse, mostly-tree graphs of 15-60 nodes. No edge bundling or incremental mode yet.',
    recommended: 'modules',
  },
  'radial-tree': {
    label: 'Radial tree',
    summary: 'One structural tree per trunk, root at the centre and each depth on its own ring.',
    caveat: 'Labels stay readable up to about 35 nodes per trunk. Forests get one set of rings per trunk.',
    recommended: 'flare',
  },
  'force-clustered': {
    label: 'Clustered',
    summary: 'Louvain communities laid out as separate bubbles, each rotated to face the clusters it links to.',
    caveat: 'Only as good as the community structure in the data. Flat or single-blob graphs give arbitrary bubbles, and bubbles spread wide on graphs with many cross-community edges.',
    recommended: 'mesh',
  },
  force: {
    label: 'Force',
    summary: 'Spring simulation for arbitrary graphs.',
    caveat: 'Kept for compatibility. Organic gives lower stress and no overlaps on the same data.',
    recommended: 'karate',
  },
  'ux-navigation': {
    label: 'UX navigation',
    summary: 'Page trees top to bottom with view fans to the side; navigation routes appear on hover.',
    caveat: 'Needs isPageNode and page-sourced structural edges; without them every node lands in one flat row.',
    recommended: 'pages',
  },
}

export const LAYOUT_ORDER: LayoutKey[] = ['galaxy', 'organic', 'orthogonal', 'radial-tree', 'force-clustered', 'force', 'ux-navigation']
