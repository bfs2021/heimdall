import { useState, useMemo } from 'react'
import {
  Button,
  Chip,
  Badge,
  StatusBadge,
  StatTile,
  Table,
  ShellLayout,
  TabBar,
} from './index'
import type { Column } from './components/Table'
import PrimitivesTestPage from './test-pages/PrimitivesTestPage'
import DataDisplayTestPage from './test-pages/DataDisplayTestPage'
import HierarchyComponentTestPage from './test-pages/HierarchyComponentTestPage'
import ShellFrameworkTestPage from './test-pages/ShellFrameworkTestPage'
import OverlayComponentsTestPage from './test-pages/OverlayComponentsTestPage'
import AdvancedOverlayComponentsTestPage from './test-pages/AdvancedOverlayComponentsTestPage'
import FoundationTestPage from './test-pages/FoundationTestPage'
import NavigationComponentTestPage from './test-pages/NavigationComponentTestPage'
import ChartsTestPage from './test-pages/ChartsTestPage'
import PagePatternsShowcase from './test-pages/PagePatternsShowcase'
import ChatShowcase from './test-pages/ChatShowcase'
import FormsShowcase from './test-pages/FormsShowcase'
import GraphShowcase from './test-pages/GraphShowcase'
import OrganicLayoutTestPage from './test-pages/OrganicLayoutTestPage'
import OrthogonalLayoutTestPage from './test-pages/OrthogonalLayoutTestPage'
import GalaxyLayoutLab from './test-pages/GalaxyLayoutLab'
import CenterOnSelectTestPage from './test-pages/CenterOnSelectTestPage'
import FullscreenContainerRefTestPage from './test-pages/FullscreenContainerRefTestPage'
import InspectorPanelTestPage from './test-pages/InspectorPanelTestPage'
import FilterDropdownTestPage from './test-pages/FilterDropdownTestPage'
import TabBarTestPage from './test-pages/TabBarTestPage'
import AvatarTestPage from './test-pages/AvatarTestPage'
import CardsAndListsTestPage from './test-pages/CardsAndListsTestPage'
import CalendarTestPage from './test-pages/CalendarTestPage'
import KanbanBoardTestPage from './test-pages/KanbanBoardTestPage'
import MapCanvasTestPage from './test-pages/MapCanvasTestPage'
import LineageRailTestPage from './test-pages/LineageRailTestPage'
import DiffViewerTestPage from './test-pages/DiffViewerTestPage'
import VersionTimelineTestPage from './test-pages/VersionTimelineTestPage'
import TraceViewerTestPage from './test-pages/TraceViewerTestPage'
import UxNavigationTestPage from './test-pages/UxNavigationTestPage'
import RadialTreeTestPage from './test-pages/RadialTreeTestPage'
// Injected by vite.config.mjs from package.json (a JSON import here would pull package.json into
// the declaration build and move every .d.ts under dist/src/).
declare const __HEIMDALL_VERSION__: string

export default function App() {
  const [selectedRows, setSelectedRows] = useState<(string | number)[]>([])
  const [activeTab, setActiveTab] = useState('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const exampleParam = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('example')
  }, [])

  const testParam = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('test')
  }, [])

  const tableData = [
    { id: 'cls_4f3a', name: 'organism', class: 'life', status: 'active', updated: '2m ago' },
    { id: 'cls_8b21', name: 'station', class: 'climate', status: 'syncing', updated: '12m ago' },
    { id: 'cls_e007', name: 'service', class: 'software', status: 'error', updated: '1h ago' },
  ]

  const tableColumns: Column<typeof tableData[number]>[] = [
    {
      key: 'id',
      label: 'ID',
      width: '120px',
      render: (value: string) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{value}</span>,
    },
    { key: 'name', label: 'Name' },
    { key: 'class', label: 'Class' },
    { key: 'status', label: 'Status' },
    { key: 'updated', label: 'Updated', render: (value: string) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{value}</span> },
  ]

  if (exampleParam === 'primitives') {
    return <PrimitivesTestPage />
  }

  if (exampleParam === 'data-display') {
    return <DataDisplayTestPage />
  }

  if (exampleParam === 'hierarchy-tree') {
    return <HierarchyComponentTestPage />
  }

  if (exampleParam === 'shell-framework') {
    return <ShellFrameworkTestPage />
  }

  if (exampleParam === 'overlays') {
    return <OverlayComponentsTestPage />
  }

  if (exampleParam === 'advanced-overlays') {
    return <AdvancedOverlayComponentsTestPage />
  }

  if (exampleParam === 'navigation') {
    return <NavigationComponentTestPage />
  }

  if (exampleParam === 'charts') {
    return <ChartsTestPage />
  }

  if (exampleParam === 'page-patterns') {
    return <PagePatternsShowcase />
  }

  if (exampleParam === 'chat') {
    return <ChatShowcase />
  }

  if (exampleParam === 'forms') {
    return <FormsShowcase />
  }

  if (exampleParam === 'graph') {
    return <GraphShowcase />
  }

  if (exampleParam === 'galaxy-layout-lab') {
    return <GalaxyLayoutLab />
  }

  if (exampleParam === 'organic-layout') {
    return <OrganicLayoutTestPage />
  }

  if (exampleParam === 'orthogonal-layout') {
    return <OrthogonalLayoutTestPage />
  }

  if (exampleParam === 'center-on-select') {
    return <CenterOnSelectTestPage />
  }

  if (exampleParam === 'fullscreen-container-ref') {
    return <FullscreenContainerRefTestPage />
  }

  if (exampleParam === 'inspector-panel') {
    return <InspectorPanelTestPage />
  }

  if (exampleParam === 'filter-dropdown') {
    return <FilterDropdownTestPage />
  }

  if (exampleParam === 'tab-bar') {
    return <TabBarTestPage />
  }

  if (exampleParam === 'avatar-test') {
    return <AvatarTestPage />
  }

  if (exampleParam === 'cards-and-lists') {
    return <CardsAndListsTestPage />
  }

  if (exampleParam === 'calendar-test') {
    return <CalendarTestPage />
  }

  if (exampleParam === 'kanban-board') {
    return <KanbanBoardTestPage />
  }

  if (exampleParam === 'map-canvas') {
    return <MapCanvasTestPage />
  }

  if (exampleParam === 'lineage-rail') {
    return <LineageRailTestPage />
  }

  if (exampleParam === 'diff-viewer') {
    return <DiffViewerTestPage />
  }

  if (exampleParam === 'version-timeline') {
    return <VersionTimelineTestPage />
  }

  if (exampleParam === 'trace-viewer') {
    return <TraceViewerTestPage />
  }

  if (exampleParam === 'ux-navigation') {
    return <UxNavigationTestPage />
  }

  if (exampleParam === 'radial-tree-test') {
    return <RadialTreeTestPage />
  }

  if (testParam === 'foundation') {
    return <FoundationTestPage />
  }

  return (
    <ShellLayout
      appTitle={{ title: 'Heimdall', version: `v${__HEIMDALL_VERSION__}` }}
      topbar={{
        breadcrumbs: [
          { label: 'Dashboard' },
          { label: 'Overview' },
        ],
        searchPlaceholder: 'Search entities...',
      }}
      sidebar={{
        collapsed: sidebarCollapsed,
        onCollapse: setSidebarCollapsed,
        sections: [
          {
            title: 'Workspace',
            items: [
              { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
              { id: 'schema', label: 'Schema', icon: 'schema', count: 128 },
              { id: 'individuals', label: 'Individuals', icon: 'data', count: 12480 },
              { id: 'pipelines', label: 'Pipelines', icon: 'pipeline', count: 17 },
            ],
          },
        ],
        activeItemId: 'schema',
      }}
      statusbar={{
        right: <span>UI · Phase 6 · Shell Framework</span>,
      }}
    >
      <div style={{ maxWidth: '1200px' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '1rem', color: 'rgb(var(--canvas-fg-1))' }}>
          Heimdall Design System
        </h1>
        <p style={{ color: 'rgb(var(--canvas-fg-2))', marginBottom: '2rem' }}>Phase 6: Shell Framework</p>

        {/* StatTile Section */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem', color: 'rgb(var(--canvas-fg-1))' }}>
            StatTile
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '2rem' }}>
            <StatTile label="Classes" value="128" color="cyan" delta={{ value: 4, label: 'this week', direction: 'up' }} />
            <StatTile label="Individuals" value="12,480" color="violet" delta={{ value: 312, label: 'today', direction: 'up' }} />
            <StatTile label="Pipelines" value="17" color="amber" />
            <StatTile label="Uptime" value="99.8%" color="emerald" delta={{ value: 0.1, label: '24h', direction: 'down' }} />
          </div>
        </section>

        {/* TabBar Section */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem', color: 'rgb(var(--canvas-fg-1))' }}>
            TabBar
          </h2>
          <TabBar
            tabs={[
              { id: 'overview', label: 'Overview', count: 3 },
              { id: 'details', label: 'Details', count: 12 },
              { id: 'activity', label: 'Activity' },
            ]}
            activeTabId={activeTab}
            onSelectTab={setActiveTab}
          />
        </section>

        {/* Table Section */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem', color: 'rgb(var(--canvas-fg-1))' }}>
            Table
          </h2>
          <Table
            columns={tableColumns}
            data={tableData}
            rowKey="id"
            selectedRows={selectedRows}
            onSelectRows={setSelectedRows}
          />
        </section>

        {/* Primitives Section */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem', color: 'rgb(var(--canvas-fg-1))' }}>
            Primitive Components
          </h2>
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem', color: 'rgb(var(--canvas-fg-1))' }}>
              Buttons
            </h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Delete</Button>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem', color: 'rgb(var(--canvas-fg-1))' }}>
              Chips
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Chip variant="cyan">cyan</Chip>
              <Chip variant="amber">amber</Chip>
              <Chip variant="violet">violet</Chip>
              <Chip variant="emerald">emerald</Chip>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem', color: 'rgb(var(--canvas-fg-1))' }}>
              Badges
            </h3>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <Badge color="cyan" />
              <Badge color="emerald" />
              <Badge color="amber" />
              <StatusBadge color="cyan" pulse />
            </div>
          </div>
        </section>
      </div>
    </ShellLayout>
  )
}
