import { useState, useEffect } from 'react'
import { ShellLayout, Icon, type IconName } from '@tinkermonkey/heimdall-ui'

import { ColorsShowcase, TypographyShowcase, SpacingShowcase, RadiusShowcase } from './showcases/FoundationShowcase'
import { IconShowcase, ButtonShowcase, ChipShowcase, BadgeShowcase, VersionPillShowcase, SegmentedControlShowcase } from './showcases/PrimitivesShowcase'
import { AvatarShowcase } from './showcases/AvatarShowcase'
import { TextInputShowcase, TextAreaShowcase, NumberInputShowcase, SelectShowcase, TriStateShowcase, FieldShowcase } from './showcases/InputsShowcase'
import { StatTileShowcase, StatGridShowcase, TableShowcase, KVGridShowcase } from './showcases/DataDisplayShowcase'
import { NavItemShowcase, SidebarShowcase, TopbarShowcase, TabBarShowcase } from './showcases/NavigationShowcase'
import { TitlebarShowcase, AppTitleShowcase, StatusbarShowcase, ShellLayoutShowcase } from './showcases/ShellShowcase'
import { ModalShowcase, ConfirmDialogShowcase, ToastShowcase, CommandPaletteShowcase } from './showcases/OverlaysShowcase'
import { PanelShowcase, DrawerShowcase, SplitPaneShowcase } from './showcases/LayoutShowcase'
import { ChartsOverviewShowcase, SparklineShowcase, LineChartShowcase, BarVShowcase, BarHShowcase, StackedBarShowcase, DonutShowcase, HeatmapShowcase, StatusTimelineShowcase, BarChartShowcase, ProgressBarShowcase, MetricRowShowcase, ChartWrapperShowcase } from './showcases/ChartsShowcase'
import { PageHeaderShowcase, FilterBarShowcase, ActivityTimelineShowcase, AlertStripShowcase, QuickAccessGridShowcase } from './showcases/PagePatternsShowcase'
import { ChatMessageShowcase, ToolBlockShowcase, ThinkingBlockShowcase, ChatDividerShowcase, ChatSuggestionsShowcase, ChatComposerShowcase, ChatContainerShowcase } from './showcases/ChatShowcase'
import { EntityPickerShowcase, KeyValueEditorShowcase, OrderedListShowcase, RelationshipBuilderShowcase, RowMenuShowcase, PipelineCardShowcase, FormCalloutShowcase } from './showcases/FormsComplexShowcase'
import { GraphNodeShowcase, GraphCanvasShowcase, GraphInspectorShowcase, GraphEdgeInspectorShowcase, TopologyNodeShowcase, GraphEdgeShowcase } from './showcases/GraphShowcase'
import { GraphLayoutsShowcase } from './showcases/GraphLayoutsShowcase'
import { FilterDropdownShowcase } from './showcases/FilterDropdownShowcase'
import { InspectorPanelShowcase } from './showcases/InspectorPanelShowcase'
import { QuickAccessTileShowcase } from './showcases/QuickAccessTileShowcase'
import { ConfigTileShowcase } from './showcases/ConfigTileShowcase'
import { WorkspaceSwitcherDialogShowcase } from './showcases/WorkspaceSwitcherDialogShowcase'
import { KanbanBoardShowcase } from './showcases/KanbanBoardShowcase'
import PrimitivesTestPage from '@/test-pages/PrimitivesTestPage'
import AvatarTestPage from '@/test-pages/AvatarTestPage'
import DataDisplayTestPage from '@/test-pages/DataDisplayTestPage'
import HierarchyComponentTestPage from '@/test-pages/HierarchyComponentTestPage'
import OverlayComponentsTestPage from '@/test-pages/OverlayComponentsTestPage'
import AdvancedOverlayComponentsTestPage from '@/test-pages/AdvancedOverlayComponentsTestPage'
import FoundationTestPage from '@/test-pages/FoundationTestPage'
import ShellFrameworkTestPage from '@/test-pages/ShellFrameworkTestPage'
import NavigationComponentTestPage from '@/test-pages/NavigationComponentTestPage'
import ChartsTestPage from '@/test-pages/ChartsTestPage'
import InspectorPanelTestPage from '@/test-pages/InspectorPanelTestPage'
import PagePatternsShowcase from '@/test-pages/PagePatternsShowcase'
import ChatShowcase from '@/test-pages/ChatShowcase'
import FormsShowcase from '@/test-pages/FormsShowcase'
import GraphShowcase from '@/test-pages/GraphShowcase'
import VersionTimelineTestPage from '@/test-pages/VersionTimelineTestPage'
import DiffViewerTestPage from '@/test-pages/DiffViewerTestPage'
import CardsAndListsTestPage from '@/test-pages/CardsAndListsTestPage'
import CalendarTestPage from '@/test-pages/CalendarTestPage'
import KanbanBoardTestPage from '@/test-pages/KanbanBoardTestPage'
import MapCanvasTestPage from '@/test-pages/MapCanvasTestPage'
import RadialTreeTestPage from '@/test-pages/RadialTreeTestPage'
import { CalendarShowcase } from './showcases/CalendarShowcase'
import { MapCanvasShowcase } from './showcases/MapCanvasShowcase'
import { LineageRailShowcase } from './showcases/LineageRailShowcase'
import { VersionTimelineShowcase } from './showcases/VersionTimelineShowcase'
import { DiffViewerShowcase } from './showcases/DiffViewerShowcase'
import { ResultCardShowcase } from './showcases/ResultCardShowcase'
import { AssetCardShowcase } from './showcases/AssetCardShowcase'
import { LogStreamShowcase } from './showcases/LogStreamShowcase'
import { TraceViewerShowcase } from './showcases/TraceViewerShowcase'
import { version } from '../../package.json'

type NavSection = {
  title: string
  items: { id: string; label: string; icon: IconName }[]
}

const SHOWCASE_MAP: Record<string, React.ComponentType> = {
  // Foundation
  colors: ColorsShowcase,
  typography: TypographyShowcase,
  spacing: SpacingShowcase,
  radius: RadiusShowcase,
  foundation: FoundationTestPage,
  // Primitives
  icon: IconShowcase,
  avatar: AvatarShowcase,
  'avatar-test': AvatarTestPage,
  button: ButtonShowcase,
  chip: ChipShowcase,
  badge: BadgeShowcase,
  'version-pill': VersionPillShowcase,
  'segmented-control': SegmentedControlShowcase,
  primitives: PrimitivesTestPage,
  // Inputs
  'text-input': TextInputShowcase,
  'text-area': TextAreaShowcase,
  'number-input': NumberInputShowcase,
  select: SelectShowcase,
  'tri-state': TriStateShowcase,
  field: FieldShowcase,
  'filter-dropdown': FilterDropdownShowcase,
  // Data Display
  'stat-tile': StatTileShowcase,
  'stat-grid': StatGridShowcase,
  table: TableShowcase,
  'kv-grid': KVGridShowcase,
  'inspector-panel': InspectorPanelShowcase,
  'inspector-panel-test': InspectorPanelTestPage,
  'hierarchy-tree': HierarchyComponentTestPage,
  'data-display': DataDisplayTestPage,
  'cards-and-lists': CardsAndListsTestPage,
  'result-card': ResultCardShowcase,
  'asset-card': AssetCardShowcase,
  'log-stream': LogStreamShowcase,
  calendar: CalendarShowcase,
  'calendar-test': CalendarTestPage,
  'map-canvas': MapCanvasShowcase,
  'map-canvas-test': MapCanvasTestPage,
  'lineage-rail': LineageRailShowcase,
  'kanban-board': KanbanBoardShowcase,
  'kanban-board-test': KanbanBoardTestPage,
  // Navigation
  'nav-item': NavItemShowcase,
  sidebar: SidebarShowcase,
  topbar: TopbarShowcase,
  'tab-bar': TabBarShowcase,
  navigation: NavigationComponentTestPage,
  // Shell
  titlebar: TitlebarShowcase,
  'app-title': AppTitleShowcase,
  statusbar: StatusbarShowcase,
  'shell-layout': ShellLayoutShowcase,
  shell: ShellFrameworkTestPage,
  // Overlays
  modal: ModalShowcase,
  'confirm-dialog': ConfirmDialogShowcase,
  toast: ToastShowcase,
  'command-palette': CommandPaletteShowcase,
  'workspace-switcher-dialog': WorkspaceSwitcherDialogShowcase,
  overlays: OverlayComponentsTestPage,
  'advanced-overlays': AdvancedOverlayComponentsTestPage,
  // Layout
  panel: PanelShowcase,
  drawer: DrawerShowcase,
  'split-pane': SplitPaneShowcase,
  // Charts
  'charts-overview': ChartsOverviewShowcase,
  sparkline: SparklineShowcase,
  'line-chart': LineChartShowcase,
  'bar-v': BarVShowcase,
  'bar-h': BarHShowcase,
  'stacked-bar': StackedBarShowcase,
  donut: DonutShowcase,
  heatmap: HeatmapShowcase,
  'status-timeline': StatusTimelineShowcase,
  'bar-chart': BarChartShowcase,
  'progress-bar': ProgressBarShowcase,
  'metric-row': MetricRowShowcase,
  'chart-wrapper': ChartWrapperShowcase,
  charts: ChartsTestPage,
  // Page Patterns
  'page-header': PageHeaderShowcase,
  'filter-bar': FilterBarShowcase,
  'activity-timeline': ActivityTimelineShowcase,
  'version-timeline': VersionTimelineShowcase,
  'version-timeline-test': VersionTimelineTestPage,
  'diff-viewer': DiffViewerShowcase,
  'diff-viewer-test': DiffViewerTestPage,
  'alert-strip': AlertStripShowcase,
  'quick-access-grid': QuickAccessGridShowcase,
  'quick-access-tile': QuickAccessTileShowcase,
  'config-tile': ConfigTileShowcase,
  'pipeline-card': PipelineCardShowcase,
  'page-patterns': PagePatternsShowcase,
  // Chat
  'chat-message': ChatMessageShowcase,
  'tool-block': ToolBlockShowcase,
  'thinking-block': ThinkingBlockShowcase,
  'chat-divider': ChatDividerShowcase,
  'chat-suggestions': ChatSuggestionsShowcase,
  'chat-composer': ChatComposerShowcase,
  'chat-container': ChatContainerShowcase,
  'chat': ChatShowcase,
  // Complex Inputs
  'entity-picker': EntityPickerShowcase,
  'key-value-editor': KeyValueEditorShowcase,
  'ordered-list': OrderedListShowcase,
  'relationship-builder': RelationshipBuilderShowcase,
  'row-menu': RowMenuShowcase,
  'form-callout': FormCalloutShowcase,
  forms: FormsShowcase,
  // Graph
  'graph-layouts': GraphLayoutsShowcase,
  'graph-edge': GraphEdgeShowcase,
  'graph-node': GraphNodeShowcase,
  'graph-canvas': GraphCanvasShowcase,
  'graph-inspector': GraphInspectorShowcase,
  'graph-edge-inspector': GraphEdgeInspectorShowcase,
  'topology-node': TopologyNodeShowcase,
  'radial-tree-test': RadialTreeTestPage,
  graph: GraphShowcase,
  // Observability
  'trace-viewer': TraceViewerShowcase,
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Foundation',
    items: [
      { id: 'colors', label: 'Colors', icon: 'palette' },
      { id: 'typography', label: 'Typography', icon: 'edit' },
      { id: 'spacing', label: 'Spacing', icon: 'layout' },
      { id: 'radius', label: 'Radius', icon: 'component' },
    ],
  },
  {
    title: 'Primitives',
    items: [
      { id: 'icon', label: 'Icon', icon: 'star' },
      { id: 'avatar', label: 'Avatar', icon: 'user' },
      { id: 'button', label: 'Button', icon: 'component' },
      { id: 'chip', label: 'Chip', icon: 'filter' },
      { id: 'badge', label: 'Badge', icon: 'alert' },
      { id: 'version-pill', label: 'VersionPill', icon: 'palette' },
      { id: 'segmented-control', label: 'SegmentedControl', icon: 'check' },
    ],
  },
  {
    title: 'Inputs',
    items: [
      { id: 'text-input', label: 'TextInput', icon: 'edit' },
      { id: 'text-area', label: 'TextArea', icon: 'edit' },
      { id: 'number-input', label: 'NumberInput', icon: 'data' },
      { id: 'select', label: 'Select', icon: 'chevronDown' },
      { id: 'tri-state', label: 'TriState', icon: 'check' },
      { id: 'field', label: 'Field', icon: 'layout' },
      { id: 'filter-dropdown', label: 'FilterDropdown', icon: 'filter' },
    ],
  },
  {
    title: 'Data Display',
    items: [
      { id: 'stat-tile', label: 'StatTile', icon: 'dashboard' },
      { id: 'stat-grid', label: 'StatGrid', icon: 'table' },
      { id: 'table', label: 'Table', icon: 'table' },
      { id: 'kv-grid', label: 'KVGrid', icon: 'data' },
      { id: 'inspector-panel', label: 'InspectorPanel', icon: 'info' },
      { id: 'hierarchy-tree', label: 'HierarchyTree', icon: 'schema' },
      { id: 'cards-and-lists', label: 'Cards & Lists', icon: 'layout' },
      { id: 'result-card', label: 'ResultCard', icon: 'layout' },
      { id: 'asset-card', label: 'AssetCard', icon: 'image' },
      { id: 'log-stream', label: 'LogStream', icon: 'code' },
      { id: 'calendar', label: 'Calendar', icon: 'calendar' },
      { id: 'map-canvas', label: 'MapCanvas', icon: 'map' },
      { id: 'lineage-rail', label: 'LineageRail', icon: 'arrowRight' },
      { id: 'kanban-board', label: 'KanbanBoard', icon: 'layout' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { id: 'nav-item', label: 'NavItem', icon: 'menu' },
      { id: 'sidebar', label: 'Sidebar', icon: 'layout' },
      { id: 'topbar', label: 'Topbar', icon: 'arrowUp' },
      { id: 'tab-bar', label: 'TabBar', icon: 'schema' },
    ],
  },
  {
    title: 'Shell',
    items: [
      { id: 'titlebar', label: 'Titlebar', icon: 'arrowUp' },
      { id: 'app-title', label: 'AppTitle', icon: 'menu' },
      { id: 'statusbar', label: 'Statusbar', icon: 'info' },
      { id: 'shell-layout', label: 'ShellLayout', icon: 'layout' },
    ],
  },
  {
    title: 'Overlays',
    items: [
      { id: 'modal', label: 'Modal', icon: 'copy' },
      { id: 'confirm-dialog', label: 'ConfirmDialog', icon: 'alert' },
      { id: 'toast', label: 'Toast', icon: 'bell' },
      { id: 'command-palette', label: 'CommandPalette', icon: 'search' },
      { id: 'workspace-switcher-dialog', label: 'WorkspaceSwitcherDialog', icon: 'layout' },
    ],
  },
  {
    title: 'Layout',
    items: [
      { id: 'panel', label: 'Panel', icon: 'layout' },
      { id: 'drawer', label: 'Drawer', icon: 'chevronLeft' },
      { id: 'split-pane', label: 'SplitPane', icon: 'layout' },
    ],
  },
  {
    title: 'Charts',
    items: [
      { id: 'charts-overview', label: 'Overview', icon: 'dashboard' },
      { id: 'sparkline', label: 'Sparkline', icon: 'trending-up' },
      { id: 'line-chart', label: 'LineChart', icon: 'trending-up' },
      { id: 'bar-v', label: 'BarV', icon: 'bar-chart' },
      { id: 'bar-h', label: 'BarH', icon: 'data' },
      { id: 'stacked-bar', label: 'StackedBar', icon: 'bar-chart' },
      { id: 'donut', label: 'Donut', icon: 'component' },
      { id: 'heatmap', label: 'Heatmap', icon: 'table' },
      { id: 'status-timeline', label: 'StatusTimeline', icon: 'clock' },
      { id: 'chart-wrapper', label: 'ChartWrapper', icon: 'component' },
    ],
  },
  {
    title: 'Page Patterns',
    items: [
      { id: 'page-header', label: 'PageHeader', icon: 'layout' },
      { id: 'filter-bar', label: 'FilterBar', icon: 'filter' },
      { id: 'activity-timeline', label: 'ActivityTimeline', icon: 'clock' },
      { id: 'version-timeline', label: 'VersionTimeline', icon: 'clock' },
      { id: 'diff-viewer', label: 'DiffViewer', icon: 'file' },
      { id: 'alert-strip', label: 'AlertStrip', icon: 'alert' },
      { id: 'quick-access-grid', label: 'QuickAccessGrid', icon: 'table' },
      { id: 'quick-access-tile', label: 'QuickAccessTile', icon: 'component' },
      { id: 'config-tile', label: 'ConfigTile', icon: 'settings' },
      { id: 'pipeline-card', label: 'PipelineCard', icon: 'pipeline' },
    ],
  },
  {
    title: 'Chat',
    items: [
      { id: 'chat-message', label: 'ChatMessage', icon: 'bot' },
      { id: 'tool-block', label: 'ToolBlock', icon: 'data' },
      { id: 'thinking-block', label: 'ThinkingBlock', icon: 'zap' },
      { id: 'chat-divider', label: 'ChatDivider', icon: 'slash' },
      { id: 'chat-suggestions', label: 'ChatSuggestions', icon: 'star' },
      { id: 'chat-composer', label: 'ChatComposer', icon: 'edit' },
      { id: 'chat-container', label: 'ChatContainer', icon: 'layout' },
    ],
  },
  {
    title: 'Complex Inputs',
    items: [
      { id: 'entity-picker', label: 'EntityPicker', icon: 'search' },
      { id: 'key-value-editor', label: 'KeyValueEditor', icon: 'edit' },
      { id: 'ordered-list', label: 'OrderedList', icon: 'arrowDown' },
      { id: 'relationship-builder', label: 'RelationshipBuilder', icon: 'schema' },
      { id: 'row-menu', label: 'RowMenu', icon: 'menu' },
      { id: 'form-callout', label: 'FormCallout', icon: 'info' },
    ],
  },
  {
    title: 'Graph',
    items: [
      { id: 'graph-layouts', label: 'Layouts', icon: 'graph' },
      { id: 'graph-edge', label: 'GraphEdge', icon: 'arrowRight' },
      { id: 'graph-node', label: 'GraphNode', icon: 'component' },
      { id: 'graph-canvas', label: 'GraphCanvas', icon: 'schema' },
      { id: 'graph-inspector', label: 'GraphInspector', icon: 'info' },
      { id: 'graph-edge-inspector', label: 'GraphEdgeInspector', icon: 'info' },
      { id: 'topology-node', label: 'TopologyNode', icon: 'data' },
    ],
  },
  {
    title: 'Observability',
    items: [
      { id: 'trace-viewer', label: 'TraceViewer', icon: 'gitBranch' },
    ],
  },
]

const DEFAULT_SHOWCASE = 'colors'

function getLabel(id: string): string {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find(i => i.id === id)
    if (item) return item.label
  }
  return id
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentId, setCurrentId] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('example') || DEFAULT_SHOWCASE
  })
  const [darkCanvas, setDarkCanvas] = useState(() => localStorage.getItem('heimdall-dark-canvas') === '1')

  useEffect(() => {
    const handlePopstate = () => {
      const params = new URLSearchParams(window.location.search)
      const example = params.get('example') || DEFAULT_SHOWCASE
      setCurrentId(example)
    }

    window.addEventListener('popstate', handlePopstate)
    return () => window.removeEventListener('popstate', handlePopstate)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('dark-canvas', darkCanvas)
    localStorage.setItem('heimdall-dark-canvas', darkCanvas ? '1' : '0')
  }, [darkCanvas])

  const Showcase = SHOWCASE_MAP[currentId] ?? SHOWCASE_MAP[DEFAULT_SHOWCASE]
  const sectionLabel = NAV_SECTIONS.find(s => s.items.some(i => i.id === currentId))?.title ?? ''

  return (
    <ShellLayout
      appTitle={{ title: 'Heimdall', version: `v${version}` }}
      topbar={{
        breadcrumbs: [
          { label: sectionLabel },
          { label: getLabel(currentId) },
        ],
        children: (
          <button
            type="button"
            onClick={() => setDarkCanvas(v => !v)}
            title={darkCanvas ? 'Switch to light canvas' : 'Switch to dark canvas'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6, border: '1px solid',
              background: 'transparent', cursor: 'pointer',
              borderColor: darkCanvas ? 'rgba(245,158,11,0.35)' : 'rgb(var(--shell-border))',
              color: darkCanvas ? 'rgb(var(--accent-primary))' : 'rgb(var(--shell-fg-3))',
              transition: 'color 120ms, border-color 120ms, background 120ms',
            }}
          >
            <Icon name={darkCanvas ? 'sun' : 'moon'} size={14} />
          </button>
        ),
      }}
      sidebar={{
        collapsed: sidebarCollapsed,
        onCollapse: setSidebarCollapsed,
        onSelectItem: setCurrentId,
        sections: NAV_SECTIONS,
        activeItemId: currentId,
      }}
      statusbar={{
        left: <span>heimdall-ui</span>,
        center: <span style={{ fontSize: '11px', color: 'rgb(var(--shell-fg-3))' }}>v{version}</span>,
        right: <span>{NAV_SECTIONS.reduce((n, s) => n + s.items.length, 0)} components</span>,
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Showcase />
      </div>
    </ShellLayout>
  )
}

export default App
