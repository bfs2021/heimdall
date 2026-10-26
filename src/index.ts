// Heimdall Design System
// Public API barrel export

import './tokens/tokens.css'

export { ICONS, Icon, type IconName, type IconProps } from './components/Icon'
export { Avatar, type AvatarProps, type AvatarSize, type AvatarShape } from './components/Avatar'
export { Button, type ButtonProps, type Variant as ButtonVariant, type Size as ButtonSize } from './components/Button'
export { Chip, type ChipProps, type ChipVariant, type ChipForm } from './components/Chip'
export { Badge, StatusBadge, type BadgeProps, type BadgeColor, type StatusBadgeProps } from './components/Badge'
export { TextInput, type TextInputProps } from './components/TextInput'
export { TextArea, type TextAreaProps } from './components/TextArea'
export { NumberInput, type NumberInputProps } from './components/NumberInput'
export {
  Select,
  type SelectProps,
  type SelectItemProps,
  type SelectCheckboxItemProps,
  type SelectSectionTitleProps,
} from './components/Select'
export { TriState, type TriStateProps } from './components/TriState'
export { Field, type FieldProps } from './components/Field'
export { StatTile, type StatTileProps } from './components/StatTile'
export { StatGrid, type StatGridProps } from './components/StatGrid'
export { VersionPill, type VersionPillProps, type VersionPillTone } from './components/VersionPill'
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedControlOption,
} from './components/SegmentedControl'
export { Table, type Column, type TableProps } from './components/Table'
export { NavItem, type NavItemProps } from './components/NavItem'
export { Sidebar, type SidebarProps, type SidebarItem, type SidebarSection } from './components/Sidebar'
export { Topbar, type TopbarProps, type BreadcrumbItem } from './components/Topbar'
export { TabBar, type TabBarProps, type Tab } from './components/TabBar'
export { AppTitle, type AppTitleProps } from './components/AppTitle'
export { Titlebar, type TitlebarProps } from './components/Titlebar'
export {
  Statusbar,
  type StatusbarProps,
  type StatusbarTone,
  type StatusbarPulseItem,
  type StatusbarIconItem,
  type StatusbarDividerItem,
  type StatusbarItem,
} from './components/Statusbar'
export { ShellLayout, type ShellLayoutProps } from './components/ShellLayout'
export { Modal, type ModalProps, type ModalSize } from './components/Modal'
export { ConfirmDialog, type ConfirmDialogProps, type ConfirmDialogVariant } from './components/ConfirmDialog'
export { WorkspaceSwitcherDialog, type WorkspaceSwitcherDialogProps, type Workspace } from './components/WorkspaceSwitcherDialog'
export {
  FilterDropdown,
  type FilterDropdownProps,
  type FilterDropdownTriggerProps,
  type FilterDropdownPanelProps,
  type FilterDropdownSectionProps,
  type FilterDropdownCheckboxProps,
  type FilterDropdownRadioProps,
} from './components/FilterDropdown'
export { Toast, type ToastProps, type ToastVariant } from './components/Toast'
export { Tooltip, type TooltipProps, type TooltipPlacement } from './components/Tooltip'
export {
  Popover,
  type PopoverProps,
  type PopoverTriggerProps,
  type PopoverPanelProps,
  type PopoverPlacement,
} from './components/Popover'
export { CommandPalette, type Command, type CommandPaletteProps } from './components/CommandPalette'
export { Panel, type PanelProps } from './components/Panel'
export { Drawer, type DrawerProps } from './components/Drawer'
export { SplitPane, type SplitPaneProps } from './components/SplitPane'
export {
  InspectorPanel,
  type InspectorPanelProps,
  type InspectorPanelSectionProps,
  type InspectorPanelPropertySectionProps,
  type PropertyRow,
} from './components/InspectorPanel'
export { KVGrid, type KVGridProps, type KVGridRow } from './components/KVGrid'
export { ChartWrapper, type ChartWrapperProps } from './components/ChartWrapper'
export { Sparkline, type SparklineColor, type SparklineProps } from './components/Sparkline'
export { LineChart, type LineChartProps, type ThresholdLine, type EventMarker } from './components/LineChart'
export { BarChart, type BarChartSeries, type BarChartProps } from './components/BarChart'
export { BarV, type BarVProps } from './components/BarV'
export { BarH, type BarHProps, type BarHItem } from './components/BarH'
export { StackedBar, type StackedBarProps, type StackedBarStack } from './components/StackedBar'
export { Donut, type DonutProps, type DonutSlice } from './components/Donut'
export { Heatmap, type HeatmapProps } from './components/Heatmap'
export {
  StatusTimeline,
  type StatusTimelineProps,
  type StatusTrack,
  type StatusSegment,
  type SegmentKind,
} from './components/StatusTimeline'
export type { StatusColor } from './components/statusColors'
export type { DropdownPlacement } from './components/dropdownPlacement'
export { ProgressBar, type ProgressBarColor, type ProgressBarProps } from './components/ProgressBar'
export { MetricRow, type MetricRowProps } from './components/MetricRow'
export { PageHeader, type PageHeaderProps } from './components/PageHeader'
export { FilterBar, type FilterBarProps, type FilterChip } from './components/FilterBar'
export {
  ActivityTimeline,
  type ActivityTimelineProps,
  type ActivityEvent,
  type ActivityEventType,
} from './components/ActivityTimeline'
export {
  VersionTimeline,
  type VersionTimelineProps,
  type VersionEntry,
  type DiffStats,
  type StateTransition,
} from './components/VersionTimeline'
export { HashSetDiff, type HashSetDiffProps } from './components/HashSetDiff'
export { SideBySideDiff, type SideBySideDiffProps, type DiffLine, type DiffLineType } from './components/SideBySideDiff'
export { DiffViewer, type DiffViewerProps, type DiffViewerHashSetProps, type DiffViewerSideBySideProps, type DiffViewerMode } from './components/DiffViewer'
export { AlertStrip, type AlertStripProps, type Alert, type AlertSeverity } from './components/AlertStrip'
export { QuickAccessGrid, type QuickAccessGridProps, type QuickAccessGridItem } from './components/QuickAccessGrid'
export { QuickAccessTile, type QuickAccessTileProps } from './components/QuickAccessTile'
export { ConfigTile, type ConfigTileProps, type ConfigTileSummaryItem } from './components/ConfigTile'
export { ChatMessage, ToolBlock, ThinkingBlock, type ChatMessageProps, type ToolBlockProps, type ToolBlockData, type ThinkingBlockProps, type ThinkingBlockData } from './components/ChatMessage'
export { ChatDivider, type ChatDividerProps } from './components/ChatDivider'
export { ChatSuggestions, type ChatSuggestionsProps } from './components/ChatSuggestions'
export { ChatComposer, type ChatComposerProps, type ContextItem, type Attachment } from './components/ChatComposer'
export { ChatContainer, type ChatContainerProps, type BotTab } from './components/ChatContainer'
export { ChatMarkdownContent, type ChatMarkdownContentProps } from './components/ChatMarkdownContent'
export { EntityPicker, type EntityPickerProps, type EntityPickerResult } from './components/EntityPicker'
export { KeyValueEditor, type KeyValueEditorProps, type KeyValueRow } from './components/KeyValueEditor'
export { OrderedList, type OrderedListProps, type OrderedItem } from './components/OrderedList'
export { RelationshipBuilder, type RelationshipBuilderProps, type RelationshipBuilderValue } from './components/RelationshipBuilder'
export { RowMenu, type RowMenuProps, type RowMenuAction } from './components/RowMenu'
export { PipelineCard, type PipelineCardProps, type Pipeline, type FlowNode } from './components/PipelineCard'
export { FormCallout, type FormCalloutProps, type FormCalloutVariant } from './components/FormCallout'
export {
  GraphCanvas,
  useGraphCanvas,
  type GraphNodeData,
  type GraphEdge as GraphEdgeData,
  type GraphCanvasProps,
  type BaseGraphNodeComponentProps,
  type GraphNodeHierarchyMeta,
  type EdgeGeometry,
} from './components/GraphCanvas'
export { type GraphCanvasContextValue, type GraphNodeRect } from './components/GraphCanvasContext'
export { GraphNode, type GraphNodeProps } from './components/GraphNode'
export { GraphEdge, type GraphEdgeProps } from './components/GraphEdge'
export { GraphEdgeShape, type GraphEdgeShapeProps } from './components/GraphEdgeShape'
export { GraphToolbar, type GraphToolbarProps, type GraphToolbarPosition } from './components/GraphToolbar'
export { GraphCollapseControl, type GraphCollapseControlProps } from './components/GraphCollapseControl'
export { DetailDrawer, type DetailDrawerProps } from './components/DetailDrawer'
export {
  forceLayout,
  clusteredForceLayout,
  boundingCirclesByGroup,
  type LayoutNode,
  type LayoutEdge,
  type ForceLayoutOptions,
  type ClusteredLayoutOptions,
  type ClusteredLayoutResult,
} from './utils/graphLayout'
export { galaxyLayout, type GalaxyLayoutNode, type GalaxyLayoutEdge, type GalaxyLayoutOptions } from './utils/galaxyLayout'
export { organicLayout, type OrganicLayoutOptions, type OrganicLayoutResult, type OrganicLayoutStats } from './utils/organicLayout'
export { orthogonalLayout, type OrthogonalLayoutOptions, type OrthogonalLayoutResult, type OrthogonalLayoutStats } from './utils/orthogonalLayout'
export { uxNavLayout, type UxNavLayoutOptions } from './utils/uxNavLayout'
export { radialTreeLayout, type RadialTreeLayoutOptions, type RadialTreeLayoutResult, type RingGeometry } from './utils/radialTreeLayout'
export { visibleNavigationEdgeIds } from './utils/uxNavEdgeVisibility'
export { buildStructuralForest, structuralDescendants, type HierarchyEdge, type StructuralForest } from './utils/graphHierarchy'
export { louvainCluster, type ClusterEdge, type ClusterTreeNode, type LouvainOptions } from './utils/graphClustering'
export { packClusters, type PackedCircle, type PackOptions } from './utils/graphPacking'
export {
  GraphInspector,
  type GraphNodeMetadata,
  type RelationshipLink,
  type GraphInspectorProps,
} from './components/GraphInspector'
export {
  GraphEdgeInspector,
  type GraphEdgeMetadata,
  type GraphEdgeInspectorProps,
} from './components/GraphEdgeInspector'
export { TopologyNode, type TopologyNodeStatus, type TopologyNodeMetric, type TopologyNodeProps } from './components/TopologyNode'
export {
  bezierPath,
  rectEdgePoint,
  rectEdgeDirection,
  edgeLabelSize,
  findClearLabelPosition,
  type Point,
  type BezierPathResult,
  type EdgeAnchor,
} from './utils/graph'
export { HierarchyRow, type HierarchyRowProps, type HierarchyKind, type HierarchyDomain } from './components/HierarchyRow'
export { HierarchyTree, type HierarchyTreeProps } from './components/HierarchyTree'
export { LineageRail, type LineageRailProps, type LineageNode } from './components/LineageRail'
export { usePanZoom, type UsePanZoomOptions, type UsePanZoomReturn } from './hooks/usePanZoom'
export { useMediaQuery } from './hooks/useMediaQuery'
export { AssetCard, type AssetCardProps, type AssetThumb } from './components/AssetCard'
export { AssetGrid, type AssetGridProps } from './components/AssetGrid'
export {
  Calendar,
  type CalendarView,
  type CalendarEvent,
  type CalendarProps,
} from './components/Calendar'
export {
  KanbanBoard,
  type KanbanBoardProps,
  type KanbanCard,
  type KanbanColumn,
} from './components/KanbanBoard'
export { LogStream, type LogStreamProps, type LogEntry } from './components/LogStream'
export {
  MapCanvas,
  type MapCanvasProps,
  type LatLng,
  type MapPin,
  type MapTrackPoint,
  type HeatmapDataPoint,
} from './components/MapCanvas'
export { MiniCalendar, type MiniCalendarProps } from './components/MiniCalendar'
export { ResultCard, type ResultCardProps, type ResultCardProvenance } from './components/ResultCard'

// Observability — OTel trace viewer + adapters
export { TraceViewer, type TraceViewerProps } from './components/TraceViewer'
export {
  buildTraceModel,
  selfTime,
  visibleRows,
  createTimeScale,
  niceTicks,
  fmtMs as fmtTraceMs,
  resolveServiceColor,
  resolveServiceLabel,
  paletteColor,
  DEFAULT_SERVICE_PALETTE,
  type Trace,
  type TraceSpan,
  type TraceMeta,
  type ServiceInfo,
  type SpanStatus,
  type SpanKind,
  type SpanEvent,
  type TraceModel,
  type TraceModelNode,
  type TimeScale,
} from './components/traceViewerModel'
export {
  fromOTLP,
  type OtlpTracesData,
  type OtlpResourceSpans,
  type OtlpSpan,
  type OtlpEvent,
  type OtlpKeyValue,
  type OtlpAnyValue,
  type FromOtlpOptions,
} from './utils/otlpTrace'
export {
  fromXRay,
  type XRaySegment,
  type XRaySubsegment,
  type XRayException,
  type XRayCause,
  type FromXRayOptions,
} from './utils/xrayTrace'
