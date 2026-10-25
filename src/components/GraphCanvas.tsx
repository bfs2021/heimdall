import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useId,
} from "react";
import {
  computeEdgePath,
  computeFitViewport,
  edgeLabelSize,
  findClearLabelPosition,
  DEFAULT_QUADRATIC_CURVATURE,
  type BoundingBox,
  type EdgeAnchor,
} from "../utils/graph";
import { routeNavigationEdge, routeNavigationEdges, DEFAULT_TRACE_SPACING } from "../utils/channelRouter";
import {
  forceLayout,
  clusteredForceLayout,
} from "../utils/graphLayout";
import {
  galaxyLayout,
  galaxyEffectiveWeights,
  galaxyBodyRadii,
  galaxySystemCircles,
  GALAXY_UNWEIGHTED_MIN_RADIUS,
  type GalaxyLayoutNode,
} from "../utils/galaxyLayout";
import { uxNavLayout } from "../utils/uxNavLayout";
import { radialTreeLayout, type RingGeometry } from "../utils/radialTreeLayout";
import {
  buildStructuralForest,
  structuralDescendants,
  galaxyGroupMap,
} from "../utils/graphHierarchy";
import { visibleNavigationEdgeIds } from "../utils/uxNavEdgeVisibility";
import { usePanZoom } from "../hooks/usePanZoom";
import { useGalaxySimulation } from "../hooks/useGalaxySimulation";
import { GraphCanvasContext, useGraphCanvas } from "./GraphCanvasContext";
import GraphNode from "./GraphNode";
import { GraphEdgeShape } from "./GraphEdgeShape";
import { GraphToolbar, type GraphToolbarPosition } from "./GraphToolbar";
import { GraphCollapseControl } from "./GraphCollapseControl";
import { Tooltip } from "./Tooltip";
import { Popover } from "./Popover";
import "./GraphCanvas.css";
import "./GraphEdge.css";

export type { GraphCanvasContextValue } from "./GraphCanvasContext";
export { useGraphCanvas } from "./GraphCanvasContext";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Tooltip show delay in milliseconds. Matches the Tooltip component's default. */
const TOOLTIP_SHOW_DELAY_MS = 200;

/** Sanitize an ID for use as an HTML id attribute. Replaces invalid characters with underscores. */
const sanitizeId = (id: string): string =>
  id.replace(/[^\w:.-]/g, "_");

/** Generate deterministic tooltip ID for a node. */
const nodeTooltipId = (nodeId: string): string => `tooltip-node-${sanitizeId(nodeId)}`;

/** Generate deterministic tooltip ID for an edge. */
const edgeTooltipId = (edgeId: string): string => `tooltip-edge-${sanitizeId(edgeId)}`;

// ─── Public data types ────────────────────────────────────────────────────────

export interface GraphNodeData {
  id: string;
  label: string;
  kind?: string;
  domainColor?: string;
  /** Explicit position. When omitted with layout="force", the engine places the node. */
  x?: number;
  y?: number;
  /**
   * layout="galaxy" only (ignored by every other layout): the node's size weight, e.g. a budget
   * figure or headcount. Galaxy draws each node as a round body whose AREA is proportional to its
   * weight, and orbits each parent's children heaviest-first. A node without a weight weighs the
   * sum of its structural children; when no node has one, every node weighs its subtree leaf
   * count. Not related to `GraphEdge.weight`, which is an edge's stroke width.
   */
  weight?: number;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  variant?: "default" | "hot" | "irrelevant";
  /** 0-100. Maps to a 1-8px stroke width via a square-root curve. Unset renders the current variant default. */
  weight?: number;
  /** 0-1. Applied to the line and arrow marker independently of the label background. Default 1. */
  opacity?: number;
  /** A single number (equal dash/gap) or a [dash, gap] tuple. Overrides variant-based dashing. */
  strokeDash?: number | [number, number];
  /** Pins the source endpoint to a side of the node instead of facing the target's center. Default 'auto'. */
  sourceAnchor?: EdgeAnchor;
  /** Pins the target endpoint to a side of the node instead of facing the source's center. Default 'auto'. */
  targetAnchor?: EdgeAnchor;
  /** Overrides the default curve strength (0.22, used for both auto/auto and anchored endpoints). */
  curvature?: number;
}

/** Props that a custom node component receives from renderNode. */
export interface BaseGraphNodeComponentProps {
  id: string;
  label: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** Called when the node is clicked with a nodePopover configured. */
  onPopoverOpen?: (triggeringElement: HTMLElement) => void;
}

/**
 * Hierarchy info passed as renderNode's third argument, derived from structural edges (see
 * GraphCanvas's isStructuralEdge). Lets a custom node renderer show a collapse/expand affordance
 * without recomputing the hierarchy itself. Only meaningful when the caller also passes
 * onToggleCollapse — without it there's nothing to toggle, so onToggleCollapse is undefined.
 */
export interface GraphNodeHierarchyMeta {
  /** Whether this node has at least one structural child. */
  hasChildren: boolean;
  /** Whether this node is currently in collapsedNodeIds. */
  collapsed: boolean;
  /** Total structural descendants currently hidden because this node is collapsed. 0 when expanded. */
  hiddenDescendantCount: number;
  /** Toggles this node's collapsed state. Undefined if the caller didn't pass onToggleCollapse. */
  onToggleCollapse?: () => void;
}

// ─── Internal edge component ──────────────────────────────────────────────────

const DEFAULT_NODE_W = 138;
const DEFAULT_NODE_H = 30;
// Wide by default — a caller with a graph that spans thousands of px should be able to zoom out
// far enough to see it all in frame. Narrower limits are still useful (e.g. a small fixed-size
// diagram where zooming out past the content is pointless), so both are also exposed as props.
const DEFAULT_MIN_ZOOM = 0.05;
const DEFAULT_MAX_ZOOM = 8;
// Screen-space pixels of pointer movement before a node pointerdown is treated as a drag rather
// than a click — below this, it's just an imprecise click and should still fire onSelect.
const DRAG_THRESHOLD = 3;

export type EdgeGeometry = {
  path: string;
  mid: { x: number; y: number };
  labelPos: { x: number; y: number };
  angle: number;
  selected: boolean;
  hovered: boolean;
};

// Safe wrapper to catch errors from consumer-provided callbacks during render phase
function safeRenderEdgeCallback(
  renderEdge: (edge: GraphEdge, geometry: EdgeGeometry) => React.ReactNode,
  edge: GraphEdge,
  geometry: EdgeGeometry,
): React.ReactNode {
  try {
    return renderEdge(edge, geometry);
  } catch (error) {
    console.error("Error in renderEdge callback:", error);
    return null;
  }
}

function safeRenderNodeCallback(
  renderNode: (
    node: GraphNodeData,
    selected: boolean,
    hierarchy?: GraphNodeHierarchyMeta,
    props?: {
      nodeId: string;
      tooltipId?: string;
      onSelect?: (id: string) => void;
      onPopoverOpen?: (triggeringElement: HTMLElement) => void;
    },
  ) => React.ReactNode,
  node: GraphNodeData,
  selected: boolean,
  hierarchy?: GraphNodeHierarchyMeta,
  props?: {
    nodeId: string;
    tooltipId?: string;
    onSelect?: (id: string) => void;
    onPopoverOpen?: (triggeringElement: HTMLElement) => void;
  },
): React.ReactNode {
  try {
    return renderNode(node, selected, hierarchy, props);
  } catch (error) {
    console.error("Error in renderNode callback:", error);
    return null;
  }
}

// layout="galaxy" boundary discs: one per group head (galaxyGroupHeads: a root with several
// children hands each child its own disc). galaxyGroupMap also files such a delegating root under
// its first child's group (needed by the old group separation); for drawing that is wrong — the
// disc stretches from the child out to the root and covers half the galaxy — so the delegating
// root belongs to no disc.
function galaxyDiscGroups(
  roots: readonly string[],
  childrenOf: ReadonlyMap<string, string[]>,
): Map<string, string> {
  const { groupHeads, leafToGroup } = galaxyGroupMap(roots, childrenOf);
  const heads = new Set(groupHeads);
  for (const root of roots) if (!heads.has(root)) leafToGroup.delete(root);
  return leafToGroup;
}

function safeIsStructuralEdge(
  isStructuralEdge: ((edge: GraphEdge) => boolean) | undefined,
  edge: GraphEdge,
  layout?: string,
): boolean {
  if (!isStructuralEdge) return layout !== "ux-navigation";
  try {
    return isStructuralEdge(edge);
  } catch (error) {
    console.error("Error in isStructuralEdge callback:", error);
    return layout !== "ux-navigation";
  }
}

function safeIsPageNode(
  isPageNode: ((node: GraphNodeData) => boolean) | undefined,
  node: GraphNodeData,
): boolean {
  if (!isPageNode) return true;
  try {
    return isPageNode(node);
  } catch (error) {
    console.error("Error in isPageNode callback:", error);
    return true;
  }
}

function safeIsNavigationRoute(
  isNavigationRoute: ((edge: GraphEdge) => boolean) | undefined,
  edge: GraphEdge,
): boolean {
  if (!isNavigationRoute) return false;
  try {
    return isNavigationRoute(edge);
  } catch (error) {
    console.error("Error in isNavigationRoute callback:", error);
    return false;
  }
}

type InternalEdgeProps = GraphEdge & {
  selected?: boolean;
  hovered?: boolean;
  onSelect?: (id: string) => void;
  onHoverStart?: (id: string) => void;
  onHoverEnd?: (id: string) => void;
  renderEdge?: (edge: GraphEdge, geometry: EdgeGeometry) => React.ReactNode;
  onPopoverOpen?: (id: string, triggeringElement: SVGElement) => void;
  hasPopover?: boolean;
  popoverOpen?: boolean;
  popoverPanelId?: string;
  tooltipId?: string;
  isNavigationRoute?: boolean;
  preRoutedEdge?: any; // RoutedEdge type from channelRouter
};

// Margin (px, in graph space) kept clear around an edge label when steering it away from nodes.
const EDGE_LABEL_MARGIN = 6;

function GraphEdgeInternal({
  id,
  sourceId,
  targetId,
  label,
  variant = "default",
  weight,
  opacity,
  strokeDash,
  sourceAnchor,
  targetAnchor,
  curvature,
  selected,
  hovered,
  onSelect,
  onHoverStart,
  onHoverEnd,
  renderEdge,
  onPopoverOpen,
  hasPopover,
  popoverOpen,
  popoverPanelId,
  tooltipId,
  isNavigationRoute = false,
  preRoutedEdge,
}: InternalEdgeProps) {
  const { getNodeRect, nodeRects } = useGraphCanvas();

  const result = useMemo(() => {
    // If this is a pre-routed navigation edge from batch routing, use that directly
    if (preRoutedEdge) {
      const labelPos = label
        ? findClearLabelPosition(
            preRoutedEdge.points,
            edgeLabelSize(label),
            nodeRects,
            EDGE_LABEL_MARGIN,
            preRoutedEdge.isPolyline,
          )
        : preRoutedEdge.mid;
      return { ...preRoutedEdge, labelPos };
    }

    const src = getNodeRect(sourceId);
    const tgt = getNodeRect(targetId);
    if (!src || !tgt) return null;

    const obstacleRects = nodeRects.filter(
      (r) => !(r.x === src.x && r.y === src.y && r.width === src.width && r.height === src.height) &&
             !(r.x === tgt.x && r.y === tgt.y && r.width === tgt.width && r.height === tgt.height)
    );

    const path = isNavigationRoute
      ? routeNavigationEdge(src, tgt, obstacleRects)
      : computeEdgePath(src, tgt, {
          sourceAnchor,
          targetAnchor,
          curvature,
        });

    const labelPos = label
      ? findClearLabelPosition(
          path.points,
          edgeLabelSize(label),
          nodeRects,
          EDGE_LABEL_MARGIN,
          (path as any).isPolyline,
        )
      : path.mid;
    return { ...path, labelPos };
  }, [
    preRoutedEdge,
    label,
    nodeRects,
    getNodeRect,
    sourceId,
    targetId,
    sourceAnchor,
    targetAnchor,
    curvature,
    isNavigationRoute,
  ]);

  if (!result) return null;

  const classNames = [
    "graph-edge",
    variant !== "default" && `graph-edge--${variant}`,
    isNavigationRoute && "graph-edge--navigation",
    selected && "selected",
  ]
    .filter(Boolean)
    .join(" ");
  const interactive = !!onSelect || !!hasPopover || !!tooltipId;

  const edgeData: GraphEdge = {
    id,
    sourceId,
    targetId,
    label,
    variant,
    weight,
    opacity,
    strokeDash,
    sourceAnchor,
    targetAnchor,
    curvature,
  };

  const handleClick = interactive
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasPopover && onPopoverOpen) {
          onPopoverOpen(id, e.currentTarget as SVGElement);
        }
        if (onSelect) {
          onSelect(id);
        }
      }
    : undefined;

  return (
    <g
      className={classNames}
      role={interactive ? "button" : "presentation"}
      aria-hidden={interactive ? undefined : true}
      aria-pressed={interactive ? !!selected : undefined}
      aria-haspopup={hasPopover ? "dialog" : undefined}
      {...(hasPopover && { 'aria-expanded': !!popoverOpen })}
      {...(hasPopover && popoverPanelId && { 'aria-controls': popoverPanelId })}
      {...(interactive && tooltipId && { 'aria-describedby': tooltipId })}
      // SVG <text> inside GraphEdgeShape isn't reliably surfaced as this element's accessible name
      // by assistive tech, and a label-less edge has nothing at all — without this a screen reader
      // announces a bare "button".
      aria-label={
        interactive
          ? label
            ? `${label}: ${sourceId} to ${targetId}`
            : `${sourceId} to ${targetId}`
          : undefined
      }
      tabIndex={interactive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (hasPopover && onPopoverOpen) {
                  onPopoverOpen(id, e.currentTarget as SVGElement);
                }
                if (onSelect) {
                  onSelect(id);
                }
              }
            }
          : undefined
      }
      onPointerEnter={onHoverStart ? () => onHoverStart(id) : undefined}
      onPointerLeave={onHoverEnd ? () => onHoverEnd(id) : undefined}
      data-testid={`graph-edge-${id}`}
    >
      {renderEdge ? (
        <>
          {safeRenderEdgeCallback(renderEdge, edgeData, {
            path: result.d,
            mid: result.mid,
            labelPos: result.labelPos,
            angle: result.angle,
            selected: !!selected,
            hovered: !!hovered,
          })}
          {/* Always render hit target for interactivity, even with custom renderEdge */}
          <path
            className="graph-edge__hit"
            d={result.d}
            onClick={handleClick}
          />
        </>
      ) : (
        <GraphEdgeShape
          id={id}
          d={result.d}
          mid={result.labelPos}
          label={label}
          variant={variant}
          weight={weight}
          opacity={opacity}
          strokeDash={strokeDash}
          onSelect={onSelect}
        />
      )}
    </g>
  );
}

// ─── GraphCanvas ──────────────────────────────────────────────────────────────

export interface GraphCanvasProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onSelect"
> {
  nodes: GraphNodeData[];
  edges?: GraphEdge[];
  selectedNodeId?: string;
  onNodeSelect?: (nodeId: string) => void;
  /** Called with a node's id on pointer-enter and undefined on pointer-leave (or when hover
   *  moves off without landing on another node). Mirrors the hoveredNodeId state GraphCanvas
   *  already tracks internally for relational-edge visibility (see isStructuralEdge) — this
   *  just exposes it. A custom renderNode's own hover handling (if any) keeps working
   *  unchanged, since this fires from the node's own <g> wrapper, one level above renderNode's
   *  content. */
  onNodeHover?: (nodeId: string | undefined) => void;
  /**
   * Renders content in a positioned overlay near a hovered node — shown while the node is
   * hovered (see onNodeHover/hoveredNodeId) and hidden on hover-end. Independent of renderNode:
   * works with the default GraphNode and with a custom renderNode that has no hover handling of
   * its own. Positioned via the same world-to-screen conversion the graph's own pan/zoom
   * transform uses, so it tracks the node correctly as the canvas is panned or zoomed; panning it
   * outside the canvas hides it the same way any other canvas content does (the container's own
   * overflow: hidden). Internally rendered with the Tooltip component in 'hover' trigger mode or
   * Popover component in 'click' trigger mode (see nodeTooltipTrigger). In controlled (`open`)
   * mode. Only one of nodeTooltip/edgeTooltip renders at a time, tied to current hover or active
   * click state — node takes priority in the (practically unreachable, hover is a single pointer)
   * case both hoveredNodeId and hoveredEdgeId are set at once.
   */
  nodeTooltip?: (node: GraphNodeData) => React.ReactNode;
  /**
   * Specifies whether nodeTooltip should be triggered by hover or click. Default: 'hover'.
   * - 'hover': tooltip triggered on hover. For interactive nodes (with onNodeSelect or nodePopover),
   *   aria-describedby links the trigger to tooltip content.
   * - 'click': interactive popover behavior (role="dialog", supports buttons/links/content interaction)
   * When 'click', the tooltip content is rendered using Popover (same as nodePopover) for full
   * accessibility and interactivity, providing a migration path from Tooltip to Popover without
   * needing to rename the prop. Choose 'click' to support interactive content like buttons or links
   * in your tooltip.
   */
  nodeTooltipTrigger?: 'hover' | 'click';
  /** Same as nodeTooltip, for a hovered or clicked edge instead — positioned at the edge path's midpoint. */
  edgeTooltip?: (edge: GraphEdge) => React.ReactNode;
  /**
   * Specifies whether edgeTooltip should be triggered by hover or click. Default: 'hover'.
   * See nodeTooltipTrigger for behavior details.
   */
  edgeTooltipTrigger?: 'hover' | 'click';
  /**
   * Pan (preserving the current zoom level — never re-fits/re-zooms) to keep
   * `selectedNodeId` centered whenever it changes to a resolvable node. Off by
   * default: `selectedNodeId` otherwise only drives highlighting (and, with
   * `isStructuralEdge` set, which non-structural edges reveal) — it has no
   * effect on the viewport at all. Turn this on when selection can originate
   * from OUTSIDE the canvas (a sidebar, a nav tree, a search result) and so
   * may pick something currently off-screen; a plain click on a node already
   * on screen doesn't need it, though the pan still fires and is harmless
   * there too (usually a no-op nudge, since a clicked node was already
   * visible). Skipped before the initial mount center/fit below has run (that
   * effect owns the very first frame) and while pan/zoom is locked, same as
   * every other automatic viewport change GraphCanvas makes.
   */
  centerOnSelect?: boolean;
  /**
   * Render the HTML content for each node. GraphCanvas wraps it in a foreignObject
   * and positions it via an SVG <g> transform. If omitted, the default GraphNode is used.
   * The third argument carries structural-hierarchy info (see GraphNodeHierarchyMeta) — read it
   * to render your own collapse/expand affordance; ignore it if you don't need one.
   * Additional props passed: nodeId (string), tooltipId (optional), onSelect (optional), onPopoverOpen (optional).
   *
   * Tip: memoize with useCallback to avoid unnecessary re-measurements.
   */
  renderNode?: (
    node: GraphNodeData,
    selected: boolean,
    hierarchy?: GraphNodeHierarchyMeta,
    props?: {
      nodeId: string;
      tooltipId?: string;
      onSelect?: (id: string) => void;
      onPopoverOpen?: (triggeringElement: HTMLElement) => void;
    },
  ) => React.ReactNode;
  /**
   * Render custom SVG content for each edge. If omitted, the default GraphEdgeShape is used.
   * Receives the edge data and a geometry object containing the computed path (SVG d string),
   * curve midpoint, collision-cleared label position, tangent angle, and selection/hover state.
   * The geometry info lets you draw decorators, arrow customizations, or other SVG overlays on top
   * of or instead of the default line rendering. The owning <g> element handles hover/select
   * styling and event handlers independently of your content.
   *
   * Tip: memoize with useCallback to avoid unnecessary re-computations.
   */
  renderEdge?: (edge: GraphEdge, geometry: EdgeGeometry) => React.ReactNode;
  /**
   * Renders interactive content in a positioned popover anchored to a clicked/focused node — shown
   * when the node is clicked or when focused and Enter/Space is pressed, and closed on Escape,
   * canvas background click, or click outside the graph container.
   * Independent of renderNode and nodeTooltip: works with the default GraphNode, a custom
   * renderNode, and/or a nodeTooltip on the same node. Unlike nodeTooltip (which uses
   * role="tooltip" and is pointer-events: none), popover content is inside a dialog
   * (role="dialog") that accepts pointer interaction on the panel itself — e.g. a link
   * or button inside the popover can be clicked.
   * Positioned via the same world-to-screen conversion the graph's own pan/zoom transform uses,
   * so it tracks the node correctly as the canvas is panned or zoomed. Only one of
   * nodePopover/edgePopover renders at a time; opening a new one closes any previously open
   * popover.
   */
  nodePopover?: (node: GraphNodeData) => React.ReactNode;
  /**
   * Same as nodePopover, for a clicked/focused edge instead — positioned at the edge path's
   * midpoint.
   */
  edgePopover?: (edge: GraphEdge) => React.ReactNode;
  /** 'manual' relies on explicit x/y per node. 'force' runs a spring layout for nodes without
   *  explicit coordinates. 'galaxy' arranges nodes as a radial hierarchy of orbits, built from
   *  structural edges (see isStructuralEdge). 'force-clustered' additionally groups nodes into
   *  nested bubbles by graph structure (see clusteredForceLayout in utils/graphLayout) before
   *  running the same spring simulation within each bubble — larger canvas, less-even
   *  distribution, by design. Nodes with x and y are pinned under any of these layouts.
   *  'galaxy', 'force-clustered', and 'radial-tree' all draw boundary circles per top-level group
   *  (see showClusterBoundaries) — one per root subtree for 'galaxy' and 'radial-tree', one per
   *  top-level Louvain cluster for 'force-clustered'. 'ux-navigation' arranges page nodes as
   *  independent top-to-bottom trees with view nodes positioned as horizontal fans attached to
   *  their parent pages (see isPageNode). 'radial-tree' arranges each structural tree as a
   *  centered radial hierarchy with descendants on depth rings, and multiple trunks packed without
   *  overlap. */
  layout?: "manual" | "force" | "galaxy" | "force-clustered" | "ux-navigation" | "radial-tree";
  /**
   * layout="force" | "galaxy". Extra breathing room kept clear around each node's own footprint,
   * on top of what's needed to just avoid overlap — this is what leaves room for an edge to be
   * visible between two connected nodes instead of their boxes settling nearly flush, which with
   * substantial cards (renderNode content) could otherwise read as if edges were missing
   * entirely. Defaults differ by engine: "force" defaults to each node's own rendered width
   * (scales sensibly for both compact chips and larger cards with no configuration — see
   * ForceLayoutOptions.nodeMargin). "galaxy" leaves it unset by default and uses its own gap
   * (0.6 × the median body radius, at least 12 px); a number given here REPLACES that gap, so
   * 0 means systems and bodies touch — see GalaxyLayoutOptions.nodeMargin. Pass a fixed number
   * for either engine to use the same margin for every node.
   */
  nodeMargin?: number;
  /**
   * layout="galaxy" | "force-clustered" | "radial-tree" only, no effect otherwise. Shows a `.graph-cluster-boundary`
   * circle around each top-level group the engine produced — galaxy's independent root subtrees,
   * force-clustered's top-level Louvain clusters, or radial-tree's trunk root points — same visual
   * language either way, so a caller can switch between the engines without the "what groups with
   * what" affordance disappearing. Default true, except layout="galaxy", where it defaults to false
   * (grouping reads from orbits and colour, as in the original galaxy charts; galaxy's discs, when
   * shown, are the smallest circle enclosing each planet's system).
   */
  showClusterBoundaries?: boolean;
  /**
   * layout="radial-tree" only, no effect otherwise. Shows concentric rings marking each occupied
   * hierarchy depth level per trunk, centered on that trunk's layout origin. Purely visual — does
   * not affect node placement, edge routing, or interaction. Default false.
   */
  showHierarchyRings?: boolean;
  /**
   * Classifies an edge as structural (defines the parent/child hierarchy, source = parent) vs.
   * relational (rendered but layout-irrelevant). Meaningful with layout="galaxy" and "radial-tree" —
   * both use structural edges to compute the hierarchy; galaxy builds it for orbit placement and
   * radial-tree builds it for hierarchy depth and trunk construction via buildStructuralForest.
   * When omitted, every edge is treated as structural — the same as before this prop existed.
   *
   * Also controls edge visibility: with this prop set, a non-structural edge (line, marker, and
   * label alike) doesn't render at all unless it touches the hovered or selected node, or
   * showAllRelations is set — it's not just dimmed, so it also isn't clickable while hidden. This
   * works under any layout, not just "galaxy".
   */
  isStructuralEdge?: (edge: GraphEdge) => boolean;
  /**
   * Curvature applied to structural edges (page-to-page hierarchy and page-to-view composition).
   * 0 produces straight lines; 0.22 (default) produces the standard curve. Values > 0 increase
   * curve intensity. Only applied to structural edges that don't have their own curvature override.
   * Default 0.22.
   */
  structuralEdgeCurvature?: number;
  /**
   * Classifies a node as a page (returns true) or view (returns false) for ux-navigation layout.
   * Only meaningful with layout="ux-navigation". Page nodes are positioned in the top-to-bottom
   * tree hierarchy; view nodes are positioned as horizontal fans attached to their parent pages.
   * When omitted with ux-navigation layout, all nodes are treated as pages.
   */
  isPageNode?: (node: GraphNodeData) => boolean;
  /**
   * Classifies an edge as a navigation route for ux-navigation layout.
   * Only meaningful with layout="ux-navigation". Navigation route edges are hidden by default
   * and only become visible when hovering a page or view node, with the visible set depending
   * on whether the hovered node is a collapsed page, expanded page, or view.
   * When omitted, no edges are treated as navigation routes.
   */
  isNavigationRoute?: (edge: GraphEdge) => boolean;
  /** When isStructuralEdge is set, renders every non-structural edge instead of hiding it (see
   *  isStructuralEdge). Default false. No effect without isStructuralEdge. */
  showAllRelations?: boolean;
  /**
   * IDs of nodes whose structural descendants (per isStructuralEdge; every edge counts as
   * structural if it's omitted) should be hidden — progressive disclosure for dense hierarchies.
   * The collapsed node itself still renders; only its subtree (nodes and any edge touching one)
   * disappears. Controlled: GraphCanvas doesn't track this itself, so pair it with
   * onToggleCollapse or nothing will change when a node's toggle is clicked.
   */
  collapsedNodeIds?: ReadonlySet<string>;
  /** Called with a node's ID when its collapse/expand affordance is activated (default GraphNode's
   *  toggle, or read from renderNode's GraphNodeHierarchyMeta for a custom one). Toggling is the
   *  caller's responsibility — update collapsedNodeIds in response. */
  onToggleCollapse?: (nodeId: string) => void;
  /** Zoom out/in on first layout so the full node bounding box fits within the container. Default false. */
  fitView?: boolean;
  /** Padding in px around the fitted bounding box when fitView is enabled. Default 40. */
  fitPadding?: number;
  /** Lower zoom bound. Default 0.05 — deliberately permissive so a large graph can always be
   *  zoomed out far enough to fit in frame. Narrow it for a small fixed-size diagram instead. */
  minZoom?: number;
  /** Upper zoom bound. Default 8. */
  maxZoom?: number;
  /** IDs of selected edges — draws each in the accent color. Pair with onEdgeSelect. */
  selectedEdgeId?: string;
  /** Called with an edge's ID when its line or label is clicked. Wires up hit targets on both;
   *  without it, edges render but aren't interactive. */
  onEdgeSelect?: (edgeId: string) => void;
  /** Called with an edge's id on pointer-enter of its hit area (the same invisible hit-stroke
   *  the CSS-only hover styling already uses — see .graph-edge__hit) and undefined on
   *  pointer-leave. Purely an additional callback: doesn't change the existing CSS-driven edge
   *  hover styling (stroke thickening, label border shift), which keeps working off :hover
   *  regardless of whether this prop is set. */
  onEdgeHover?: (edgeId: string | undefined) => void;
  /** Called when the canvas background — not a node, not an edge — is clicked: the typical
   *  "click empty space to deselect" gesture. Pair with clearing selectedNodeId/selectedEdgeId
   *  (and closing a detail panel driven by them) yourself; GraphCanvas doesn't do either on its
   *  own since both are controlled props. A genuine pan drag never fires this — only a press and
   *  release within a few px of each other counts as a click. */
  onBackgroundClick?: () => void;
  /** Lets a node be repositioned by dragging it. Default true. The dropped position persists
   *  locally (overriding explicit x/y or the computed layout position) until the node list
   *  changes; it isn't written back to the nodes prop. Pair with onNodeDragEnd to persist it
   *  yourself. Set false to disable — e.g. a read-only view, or a layout='force'/'galaxy' canvas
   *  where manual repositioning would just be undone the next time the layout recomputes. */
  draggable?: boolean;
  /** Called once a drag ends, with the node's new position — only fires for an actual drag (past
   *  a small movement threshold), not a plain click. No effect without draggable. */
  onNodeDragEnd?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Shows the built-in zoom in/out/fit and pan-and-zoom-lock toolbar. Default true. Set false
   *  to omit it entirely — e.g. to build a custom control set with the separately-exported
   *  GraphToolbar (or your own), or a read-only view with no viewport controls at all. */
  showToolbar?: boolean;
  /** Where the built-in toolbar sits — any of the 4 corners or 4 edge-centers. Default
   *  'bottom-right'. No effect when showToolbar is false. */
  toolbarPosition?: GraphToolbarPosition;
  /**
   * Ancestor element to request/exit the Fullscreen API on instead of GraphCanvas's own root —
   * pass this when GraphCanvas is composed alongside sibling overlay content (a control strip
   * above it, a `DetailDrawer` beside it, ...) that should stay visible while fullscreen too.
   * The native Fullscreen API only renders the fullscreened element's own DOM subtree, and
   * GraphCanvas doesn't accept `children` — it fully owns its internal tree — so any sibling
   * content is otherwise invisible for as long as GraphCanvas's own root is what's fullscreened.
   * Must contain GraphCanvas's rendered root somewhere in its subtree — NOT because the browser
   * requires that (it doesn't; any connected, policy-permitted element is a valid fullscreen
   * target regardless of what it contains) but because otherwise the graph itself silently
   * disappears the moment fullscreen is entered, with no error and nothing to debug against:
   * containment is this prop's own invariant to hold, not a platform-enforced one. GraphCanvas
   * itself still measures and lays out against its own container's size regardless of which
   * ancestor is actually fullscreened, so nothing else about its behavior changes. `isFullscreen`
   * (from `useGraphCanvas()`/the built-in toolbar's icon) tracks `document.fullscreenElement`
   * against this ref when provided, GraphCanvas's own root otherwise — unchanged default behavior
   * when omitted.
   */
  fullscreenContainerRef?: React.RefObject<HTMLElement | null>;
}

type NodeDims = Map<string, { width: number; height: number }>;
type NodePositions = Map<string, { x: number; y: number }>;

export const GraphCanvas = React.forwardRef<HTMLDivElement, GraphCanvasProps>(
  (
    {
      nodes = [],
      edges = [],
      selectedNodeId,
      onNodeSelect,
      onNodeHover,
      nodeTooltip,
      nodeTooltipTrigger = 'hover',
      edgeTooltip,
      edgeTooltipTrigger = 'hover',
      nodePopover,
      edgePopover,
      centerOnSelect = false,
      renderNode,
      renderEdge,
      layout = "manual",
      nodeMargin,
      showClusterBoundaries: showClusterBoundariesProp,
      showHierarchyRings = false,
      isStructuralEdge,
      structuralEdgeCurvature = DEFAULT_QUADRATIC_CURVATURE,
      isPageNode,
      isNavigationRoute,
      showAllRelations = false,
      collapsedNodeIds,
      onToggleCollapse,
      fitView = false,
      fitPadding = 40,
      minZoom = DEFAULT_MIN_ZOOM,
      maxZoom = DEFAULT_MAX_ZOOM,
      selectedEdgeId,
      onEdgeSelect,
      onEdgeHover,
      onBackgroundClick,
      draggable = true,
      onNodeDragEnd,
      showToolbar = true,
      toolbarPosition = "bottom-right",
      fullscreenContainerRef,
      className = "",
      ...props
    },
    ref,
  ) => {
    // Galaxy draws no boundary discs unless asked: grouping reads from orbits and per-galaxy colour,
    // as in the original galaxy charts, and discs around lopsided systems covered half the view.
    // Every other layout keeps the existing default (on).
    const showClusterBoundaries = showClusterBoundariesProp ?? layout !== "galaxy";
    const [dims, setDims] = useState<NodeDims>(new Map());
    const [computedPositions, setComputedPositions] = useState<NodePositions>(
      new Map(),
    );
    const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>();
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | undefined>();
    const [delayedHoveredNodeId, setDelayedHoveredNodeId] =
      useState<string | undefined>();
    const [delayedHoveredEdgeId, setDelayedHoveredEdgeId] =
      useState<string | undefined>();
    const [activePopoverNodeId, setActivePopoverNodeId] =
      useState<string | undefined>();
    const [activePopoverEdgeId, setActivePopoverEdgeId] =
      useState<string | undefined>();
    const popoverErrorRef = useRef<boolean>(false);
    const tooltipDelayRef = useRef<{
      nodeTimer?: ReturnType<typeof setTimeout>;
      edgeTimer?: ReturnType<typeof setTimeout>;
    }>({});
    const popoverTriggeringElementRef = useRef<
      HTMLElement | SVGElement | null
    >(null);

    // Lifts hover state out to the caller-supplied callbacks, decoupled from the pointer
    // handlers that set the state itself (see the node <g> and GraphEdgeInternal's onHoverStart/
    // onHoverEnd below) — mirrors usePanZoom's onViewportChange effect.
    useEffect(() => {
      try {
        onNodeHover?.(hoveredNodeId);
      } catch (error) {
        console.error("Error in onNodeHover callback:", error);
      }
    }, [hoveredNodeId, onNodeHover]);
    useEffect(() => {
      try {
        onEdgeHover?.(hoveredEdgeId);
      } catch (error) {
        console.error("Error in onEdgeHover callback:", error);
      }
    }, [hoveredEdgeId, onEdgeHover]);

    // Clears stale hoveredEdgeId if the hovered edge was removed from the edges array.
    // Without this, a hovered edge that gets removed never fires the onEdgeHover(undefined) callback,
    // leaving the caller's state permanently showing the removed item as hovered.
    useEffect(() => {
      if (!hoveredEdgeId) return;
      const edgeStillExists = (edges ?? []).some((e) => e.id === hoveredEdgeId);
      if (!edgeStillExists) {
        setHoveredEdgeId(undefined);
        if (tooltipDelayRef.current.edgeTimer)
          clearTimeout(tooltipDelayRef.current.edgeTimer);
        setDelayedHoveredEdgeId(undefined);
      }
    }, [hoveredEdgeId, edges]);

    // Cleanup tooltip delays on unmount.
    useEffect(() => {
      return () => {
        if (tooltipDelayRef.current.nodeTimer)
          clearTimeout(tooltipDelayRef.current.nodeTimer);
        if (tooltipDelayRef.current.edgeTimer)
          clearTimeout(tooltipDelayRef.current.edgeTimer);
      };
    }, []);
    // Manual drag overrides, keyed by node id — takes precedence over explicit x/y or the
    // computed layout position (see getNodePosition). Local/uncontrolled: not written back to
    // the nodes prop, so a caller that wants to persist a dropped position needs onNodeDragEnd.
    const [dragPositions, setDragPositions] = useState<NodePositions>(
      new Map(),
    );
    const dragStateRef = useRef<{
      id: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
      dragging: boolean;
      // The <g> pointer capture was (or would be) taken on — kept so a drag can be finalized
      // from outside its own pointer handlers (see the draggable-toggled-off effect below),
      // not just from the pointerup/pointercancel that started it.
      target: SVGGElement;
    } | null>(null);

    // Shared by a real pointerup/pointercancel, by the draggable-toggled-off effect, and by the
    // node-id-set-changed effect below — any of the three needs the same finalization for a drag
    // that was actually in progress: fire onNodeDragEnd once with wherever it ended up, then clear
    // drag state so nothing's left stranded. suppressUpcomingClick is only true for a genuine
    // pointerup: that's the only case the browser follows with a synthetic click (pointercancel —
    // e.g. a touch/gesture takeover — never gets one), so registering the one-time suppressor for
    // pointercancel would just leak an event listener that never fires, silently swallowing that
    // node's next real click forever.
    const finalizeDrag = useCallback(
      (suppressUpcomingClick: boolean) => {
        const state = dragStateRef.current;
        if (!state) return;
        try {
          if (state.dragging) {
            if (suppressUpcomingClick) {
              const target = state.target;
              const suppressClick = (ev: MouseEvent) => {
                ev.stopPropagation();
                ev.preventDefault();
              };
              target.addEventListener("click", suppressClick, {
                capture: true,
                once: true,
              });
            }
            const finalPos = dragPositions.get(state.id) ?? {
              x: state.startX,
              y: state.startY,
            };
            onNodeDragEnd?.(state.id, finalPos);
          }
        } finally {
          dragStateRef.current = null;
        }
      },
      [dragPositions, onNodeDragEnd],
    );
    // Read by the node-id-set-changed effect below via a ref, not as a direct dependency —
    // finalizeDrag's own identity changes on every dragPositions update (i.e. continuously while a
    // drag is in progress), and that effect must react only to nodeIdsKey actually changing, not to
    // finalizeDrag churning; putting finalizeDrag directly in that effect's deps made it re-run —
    // and finalize/clear the in-progress drag — on every single pointermove during a normal drag.
    const finalizeDragRef = useRef(finalizeDrag);
    useEffect(() => {
      finalizeDragRef.current = finalizeDrag;
    }, [finalizeDrag]);

    // draggable's own JSDoc promises a drag override persists "until the node list changes" —
    // without this, a stale override for a since-removed (or filtered-out-and-back) node id would
    // silently keep applying forever, since dragPositions is otherwise never cleared on its own.
    const nodeIdsKey = useMemo(
      () =>
        nodes
          .map((n) => n.id)
          .sort()
          .join(" "),
      [nodes],
    );
    const didMountDragClearRef = useRef(false);
    useEffect(() => {
      if (!didMountDragClearRef.current) {
        didMountDragClearRef.current = true;
        return;
      }
      // A node the user is actively dragging can be torn down by the SAME prop change that
      // triggered this effect (e.g. an unrelated polling refresh that happens to touch `nodes`) —
      // finalize through the same path a real pointerup/pointercancel would, instead of just
      // dropping dragStateRef, so onNodeDragEnd still fires and pointer capture still gets
      // released. Previously this just reset dragStateRef directly: onNodeDragEnd never fired for
      // an in-progress drag, and the node's pointer capture stayed held on an element about to
      // lose its drag state, leaving later pointermove/up events for that pointer silently ignored.
      const state = dragStateRef.current;
      if (state?.dragging) {
        try {
          state.target.releasePointerCapture(state.pointerId);
        } catch (err) {
          if (!(err instanceof DOMException))
            console.warn("GraphCanvas: releasePointerCapture failed", err);
        }
      }
      finalizeDragRef.current(false);
      setDragPositions(new Map());
    }, [nodeIdsKey]);

    // Freezes wheel-zoom, drag-to-pan, and keyboard zoom/pan (see usePanZoom's locked option) —
    // toggled by GraphToolbar's lock button. Internal/uncontrolled, like hoveredNodeId/dragPositions.
    const [locked, setLocked] = useState(false);
    // Mirrors document.fullscreenElement === (fullscreenContainerRef?.current ?? containerRef.current)
    // — kept in sync by the fullscreenchange listener below rather than just set inside
    // toggleFullscreen, so Esc and any other exit path (not just GraphToolbar's own button) update
    // it too.
    const [isFullscreen, setIsFullscreen] = useState(false);
    // Set by the fullscreenchange listener the instant fullscreen is entered, consumed by the
    // containerSize-driven effect further down once the container's real post-transition
    // dimensions actually land (see that effect's own comment for why it can't just fit
    // immediately here — the browser hasn't resized the element yet at this point). Cleared on a
    // bounded timeout (see the listener below) rather than staying armed indefinitely: fullscreen
    // entry doesn't always change the target's measured size (e.g. it was already viewport-sized),
    // and without a bound this flag would sit waiting for the NEXT containerSize change no matter
    // when that happens — potentially firing a surprise zoomToFit against a much later, entirely
    // unrelated resize, against whatever pan/zoom the user had set in the meantime.
    const pendingFullscreenFitRef = useRef(false);
    const pendingFullscreenFitTimeoutRef = useRef<ReturnType<
      typeof setTimeout
    > | null>(null);
    // Only meaningful for layout="galaxy" (see liveActive below) — toggled by GraphToolbar's
    // live-simulation button. Internal/uncontrolled, like locked/isFullscreen.
    const [liveSimulation, setLiveSimulation] = useState(false);
    const liveActive = liveSimulation && layout === "galaxy";
    // Read-only guard for the engine-layout effect below (not a dependency of it — see there for
    // why) so the static one-shot galaxy computation knows to skip while the live hook owns
    // computedPositions instead, without toggling liveSimulation itself re-triggering that effect.
    const liveActiveRef = useRef(liveActive);
    useEffect(() => {
      liveActiveRef.current = liveActive;
    }, [liveActive]);

    // Structural hierarchy over the FULL node/edge list — independent of what's currently
    // hidden, so a collapsed node's affordance (hasChildren, hiddenDescendantCount) stays
    // correct even while its subtree isn't rendered.
    const forest = useMemo(() => {
      const hierarchyEdges = edges.map((e) => ({
        source: e.sourceId,
        target: e.targetId,
        structural: safeIsStructuralEdge(isStructuralEdge, e, layout),
      }));
      return buildStructuralForest(
        nodes.map((n) => n.id),
        hierarchyEdges,
      );
    }, [nodes, edges, isStructuralEdge, layout]);

    // layout="galaxy": each node's effective weight, over the FULL forest (so collapsing a subtree
    // never changes its parent's weight or makes bodies resize), and — when galaxy draws its own
    // default bodies (no renderNode) — each node's round-body radius, area ∝ weight.
    const galaxyWeights = useMemo(() => {
      if (layout !== "galaxy") return null;
      const weightById = new Map(nodes.map((n) => [n.id, n.weight]));
      return galaxyEffectiveWeights(
        nodes.map((n) => n.id),
        forest.childrenOf,
        (id) => weightById.get(id),
      );
    }, [layout, nodes, forest]);
    // Sizes from leaf counts (no node has a weight) get a higher floor, so leaves are big enough
    // to carry a label; real weights keep the full range, where small really means small.
    const galaxyHasGivenWeights = useMemo(
      () => nodes.some((n) => n.weight !== undefined && Number.isFinite(n.weight) && n.weight >= 0),
      [nodes],
    );
    const galaxyRadii = useMemo(
      () =>
        galaxyWeights && !renderNode
          ? galaxyBodyRadii(galaxyWeights, galaxyHasGivenWeights ? {} : { minRadius: GALAXY_UNWEIGHTED_MIN_RADIUS })
          : null,
      [galaxyWeights, renderNode, galaxyHasGivenWeights],
    );
    // The galaxy-only fields every galaxy layout-node builder adds (see GalaxyLayoutNode).
    const galaxyNodeExtras = useCallback(
      (id: string): Pick<GalaxyLayoutNode, "weight" | "radius"> => ({
        weight: galaxyWeights?.get(id),
        radius: galaxyRadii?.get(id),
      }),
      [galaxyWeights, galaxyRadii],
    );
    // Boundary-circle radius for galaxy: the true body radius when galaxy draws round bodies,
    // otherwise the measured box's half-diagonal.
    const galaxyBoundaryRadiusOf = useCallback(
      (id: string): number => {
        const r = galaxyRadii?.get(id);
        if (r !== undefined) return r;
        const d = dims.get(id);
        return d ? Math.hypot(d.width, d.height) / 2 : 20;
      },
      [galaxyRadii, dims],
    );

    // Every structural descendant of a collapsed node is hidden — not just its direct children.
    const hiddenIds = useMemo(() => {
      if (!collapsedNodeIds || collapsedNodeIds.size === 0)
        return new Set<string>();
      const hidden = new Set<string>();
      for (const id of collapsedNodeIds) {
        for (const descendant of structuralDescendants(id, forest.childrenOf))
          hidden.add(descendant);
      }
      return hidden;
    }, [collapsedNodeIds, forest]);

    // Navigation route visibility for ux-navigation layout: compute which navigation-route
    // edges should be visible based on the currently hovered node, its expansion state, and
    // whether it's a page or view.
    const visibleNavigationRouteIds = useMemo(() => {
      if (layout !== "ux-navigation" || !isNavigationRoute) return new Set<string>();
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const pageNodePredicate = (nodeId: string) => {
        const node = nodeMap.get(nodeId);
        return node ? safeIsPageNode(isPageNode, node) : false;
      };
      return visibleNavigationEdgeIds(
        edges,
        hoveredNodeId,
        pageNodePredicate,
        (edge) => safeIsNavigationRoute(isNavigationRoute, edge),
        forest,
        collapsedNodeIds,
      );
    }, [layout, isNavigationRoute, edges, hoveredNodeId, forest, collapsedNodeIds, isPageNode, nodes]);

    // The node list actually measured, laid out, and rendered. Edges touching a hidden node
    // simply don't resolve a rect (see getNodeRect below) and render nothing — no separate
    // edge filtering needed.
    const visibleNodes = useMemo(
      () => {
        // Filter out nodes with duplicate IDs, keeping only the first occurrence
        const seenIds = new Set<string>();
        const result: GraphNodeData[] = [];
        for (const node of nodes) {
          if (!seenIds.has(node.id)) {
            seenIds.add(node.id);
            if (!hiddenIds.has(node.id)) {
              result.push(node);
            }
          }
        }
        return result;
      },
      [nodes, hiddenIds],
    );

    // Clears stale hoveredNodeId if the hovered node was collapsed away and is no longer visible.
    // Without this, a hovered node that gets hidden never fires the onNodeHover(undefined) callback,
    // leaving the caller's state permanently showing the removed item as hovered.
    useEffect(() => {
      if (!hoveredNodeId) return;
      const nodeStillVisible = visibleNodes.some((n) => n.id === hoveredNodeId);
      if (!nodeStillVisible) {
        setHoveredNodeId(undefined);
        if (tooltipDelayRef.current.nodeTimer)
          clearTimeout(tooltipDelayRef.current.nodeTimer);
        setDelayedHoveredNodeId(undefined);
      }
    }, [hoveredNodeId, visibleNodes]);

    // Only populated when layout='force-clustered' — top-level cluster
    // bounding circles, for the optional bubble-boundary render layer.
    const [clusterBoundaries, setClusterBoundaries] = useState<
      Map<string, { x: number; y: number; r: number }>
    >(new Map());

    // Only populated when layout='radial-tree' — per-trunk hierarchy rings,
    // one per occupied depth level, for the optional ring-visualization layer.
    const [ringGeometry, setRingGeometry] = useState<RingGeometry[]>([]);

    const containerRef = useRef<HTMLDivElement>(null);
    const measureRefs = useRef<Record<string, HTMLDivElement | null>>({});
    // Tracks whether we've applied the initial canvas-center offset
    const didCenterRef = useRef(false);
    // State mirror of didCenterRef, set in the same effect right alongside it — exists only so
    // the centerOnSelect effect below can gate on a value that doesn't update until the NEXT
    // render (see that effect's own comment for why a live ref read is the wrong signal there).
    const [mountCenterDone, setMountCenterDone] = useState(false);
    const [containerSize, setContainerSize] = useState<{
      width: number;
      height: number;
    } | null>(null);
    // Previous containerSize, so the resize re-anchor effect below can tell a genuine size change
    // (e.g. entering/exiting fullscreen) apart from a same-size re-render.
    const prevContainerSizeRef = useRef<{
      width: number;
      height: number;
    } | null>(null);

    // Only galaxy reads this (see galaxyLayout's own aspectRatio option) — force/force-clustered
    // ignore it, so this is a stable `undefined` for those layouts and a resize never retriggers
    // their engine-layout recompute. Rounded to the nearest 0.05 (~5%) so sub-pixel ResizeObserver
    // noise (a scrollbar toggling, a font-metrics reflow) never crosses a bucket boundary and
    // triggers a redraw, while an actual ~5%+ resize/reflow reliably does.
    const galaxyAspectRatio = useMemo(() => {
      if (layout !== "galaxy" || !containerSize || containerSize.height === 0)
        return undefined;
      return Math.round((containerSize.width / containerSize.height) * 20) / 20;
    }, [layout, containerSize]);

    // Read via a ref (not a dependency) inside the engine-layout effect below, same idiom
    // liveActiveRef above already uses — the effect should pick up whatever the aspect ratio
    // currently is whenever it runs for any other reason, but a resize alone shouldn't retrigger
    // the whole settle-cycle computation (that's the dedicated resize-triggered relayout effect's
    // job, further down).
    const galaxyAspectRatioRef = useRef(galaxyAspectRatio);
    useEffect(() => {
      galaxyAspectRatioRef.current = galaxyAspectRatio;
    });

    const { transform, viewport, bind, panTo, zoomTo } = usePanZoom({
      minZoom,
      maxZoom,
      containerRef,
      locked,
    });

    // Start of a potential background click — recorded whenever the gesture begins on genuine
    // background (not a node, not an edge, not something opting out via data-no-drag, e.g. the
    // toolbar), regardless of whether pan/zoom is locked: clicking to deselect is unrelated to
    // the viewport lock, so it shouldn't be gated by it the way the pan drag itself is.
    const backgroundClickStartRef = useRef<{ x: number; y: number } | null>(
      null,
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (
          e.target instanceof Element &&
          e.target.closest(".graph-node, .graph-edge, [data-no-drag]")
        ) {
          backgroundClickStartRef.current = null;
          return;
        }
        backgroundClickStartRef.current = { x: e.clientX, y: e.clientY };
        bind.onPointerDown(e);
      },
      [bind],
    );

    // A genuine pan drag never fires onBackgroundClick — only a press and release within
    // DRAG_THRESHOLD px of each other does, the same "was this actually a drag" bar node
    // dragging uses. Independent of usePanZoom's own drag machinery (which document-level
    // pointermove/up listeners only run while a pan is in progress, and not at all while
    // locked) so this keeps working even when pan/zoom is locked.
    const handleCanvasPointerUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const start = backgroundClickStartRef.current;
        backgroundClickStartRef.current = null;
        if (!start) return;
        const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        if (distance < DRAG_THRESHOLD) {
          setActivePopoverNodeId(undefined);
          setActivePopoverEdgeId(undefined);
          onBackgroundClick?.();
        }
      },
      [onBackgroundClick],
    );

    const rawId = useId();
    const gridPatternId = `grid${rawId.replace(/:/g, "")}`;

    // Measure each node's natural HTML dimensions from the hidden off-screen div. Re-runs
    // whenever the node list changes, or renderNode itself changes (e.g. a caller swaps in a
    // bigger custom card) — a *memoized* renderNode (see the prop's JSDoc) keeps a stable
    // identity across re-renders that don't change its output, so this doesn't cause the
    // thrashing an unmemoized inline function would.
    useLayoutEffect(() => {
      const next: NodeDims = new Map();
      for (const node of visibleNodes) {
        const el = measureRefs.current[node.id];
        next.set(node.id, {
          width: el?.offsetWidth || DEFAULT_NODE_W,
          height: el?.offsetHeight || DEFAULT_NODE_H,
        });
      }
      setDims(next);
    }, [visibleNodes, renderNode, galaxyRadii]);

    // Run the engine layout when dims are ready (only for layout='force' | 'galaxy' | 'force-clustered' | 'ux-navigation' | 'radial-tree')
    useEffect(() => {
      if (
        (layout !== "force" &&
          layout !== "galaxy" &&
          layout !== "force-clustered" &&
          layout !== "ux-navigation" &&
          layout !== "radial-tree") ||
        dims.size === 0
      )
        return;
      // While live-simulation mode owns computedPositions, this effect intentionally no-ops for
      // galaxy — recomputing a fresh static layout here would immediately overwrite whatever the
      // live hook just produced. liveActiveRef, not liveActive itself, so toggling the mode
      // doesn't retrigger this effect (see liveActiveRef's own comment above) — only genuine
      // layout-input changes should, and those are already this effect's real dependencies.
      if (layout === "galaxy" && liveActiveRef.current) return;

      const layoutNodes = visibleNodes.map((n, i) => ({
        id: n.id,
        // Nodes without explicit coords start on a circle so 'force'/'force-clustered' converge
        // cleanly. 'galaxy' ignores this seed — its home position is computed from the hierarchy.
        x: n.x ?? Math.cos((2 * Math.PI * i) / visibleNodes.length) * 120,
        y: n.y ?? Math.sin((2 * Math.PI * i) / visibleNodes.length) * 120,
        width: dims.get(n.id)?.width ?? DEFAULT_NODE_W,
        height: dims.get(n.id)?.height ?? DEFAULT_NODE_H,
        pinned: n.x !== undefined && n.y !== undefined,
      }));
      if (layout === "force") {
        const layoutEdges = (edges ?? []).map((e) => ({
          source: e.sourceId,
          target: e.targetId,
        }));
        setComputedPositions(
          forceLayout(layoutNodes, layoutEdges, { nodeMargin }),
        );
        setClusterBoundaries(new Map());
        setRingGeometry([]);
      } else if (layout === "force-clustered") {
        const layoutEdges = (edges ?? []).map((e) => ({
          source: e.sourceId,
          target: e.targetId,
        }));
        const { positions, clusterBoundaries: boundaries } =
          clusteredForceLayout(layoutNodes, layoutEdges, { nodeMargin });
        setComputedPositions(positions);
        setClusterBoundaries(boundaries);
        setRingGeometry([]);
      } else if (layout === "ux-navigation") {
        const layoutEdges = (edges ?? []).map((e) => ({
          source: e.sourceId,
          target: e.targetId,
          structural: safeIsStructuralEdge(isStructuralEdge, e, layout),
        }));
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const positions = uxNavLayout(
          layoutNodes,
          layoutEdges,
          dims,
          (node) => {
            const fullNode = nodeMap.get(node.id);
            return fullNode ? safeIsPageNode(isPageNode, fullNode) : true;
          },
        );
        setComputedPositions(positions);
        setClusterBoundaries(new Map());
        setRingGeometry([]);
      } else if (layout === "radial-tree") {
        const layoutEdges = (edges ?? []).map((e) => ({
          source: e.sourceId,
          target: e.targetId,
          structural: safeIsStructuralEdge(isStructuralEdge, e, layout),
        }));
        const { positions, trunkBoundaries, ringGeometry: rings } = radialTreeLayout(
          layoutNodes,
          layoutEdges,
          dims,
          forest,
        );
        setComputedPositions(positions);
        setClusterBoundaries(trunkBoundaries);
        setRingGeometry(rings);
      } else {
        const layoutEdges = (edges ?? []).map((e) => ({
          source: e.sourceId,
          target: e.targetId,
          structural: safeIsStructuralEdge(isStructuralEdge, e, layout),
        }));
        const positions = galaxyLayout(
          layoutNodes.map((n) => ({ ...n, ...galaxyNodeExtras(n.id) })),
          layoutEdges,
          {
            nodeMargin,
            aspectRatio: galaxyAspectRatioRef.current,
          },
        );
        setComputedPositions(positions);
        // galaxyLayout has no "cluster" concept of its own to return boundaries from (unlike
        // clusteredForceLayout), so build one here from `forest`. One boundary per root would be
        // correct but not very useful on a single-root tree (e.g. one org chart under one CEO) —
        // it'd just be one circle around everything. Instead, a root with children delegates its
        // group-headship down to each of ITS OWN children (a multi-root forest's roots still get
        // one boundary each, same as before, since a childless root has nothing to delegate to);
        // each group head's full recursive subtree is then one boundary, same as a Louvain
        // cluster's members are for force-clustered.
        const leafToGroup = galaxyDiscGroups(forest.roots, forest.childrenOf);
        const radiusOf = galaxyBoundaryRadiusOf;
        setClusterBoundaries(
          galaxySystemCircles(positions, leafToGroup, radiusOf),
        );
        setRingGeometry([]);
      }
    }, [
      visibleNodes,
      edges,
      dims,
      layout,
      nodeMargin,
      isStructuralEdge,
      isPageNode,
      forest,
      nodes,
      collapsedNodeIds,
      galaxyNodeExtras,
      galaxyBoundaryRadiusOf,
    ]);

    // A node's dragPositions override doubles as its pin here, same priority getNodePosition
    // already gives dragPositions over any prop-level x/y, so a dropped node stays exactly where
    // it was dropped and its descendants keep orbiting live from that position. Shared by live
    // simulation (below) and the resize-triggered relayout effect (further down) — deliberately
    // NOT used by the static engine-layout effect above, whose own dependency array intentionally
    // excludes dragPositions so a plain (non-live) drag moves only the dragged node instead of
    // retriggering a full relayout of everything else on every pointermove.
    const buildGalaxyLayoutNodes = useCallback(
      (): GalaxyLayoutNode[] =>
        visibleNodes.map((n) => {
          const drag = dragPositions.get(n.id);
          const x = drag?.x ?? n.x;
          const y = drag?.y ?? n.y;
          return {
            id: n.id,
            width: dims.get(n.id)?.width ?? DEFAULT_NODE_W,
            height: dims.get(n.id)?.height ?? DEFAULT_NODE_H,
            x,
            y,
            pinned: x !== undefined && y !== undefined,
            ...galaxyNodeExtras(n.id),
          };
        }),
      [visibleNodes, dims, dragPositions, galaxyNodeExtras],
    );

    // Live-simulation mode's own continuous layout (see useGalaxySimulation). Builds
    // unconditionally (empty when not live-active) so the hook's own call below has stable inputs
    // across renders regardless of whether live mode is currently on.
    const liveLayoutNodes = useMemo<GalaxyLayoutNode[]>(() => {
      if (!liveActive) return [];
      return buildGalaxyLayoutNodes();
    }, [liveActive, buildGalaxyLayoutNodes]);

    const liveLayoutEdges = useMemo(() => {
      if (!liveActive) return [];
      return (edges ?? []).map((e) => ({
        source: e.sourceId,
        target: e.targetId,
        structural: safeIsStructuralEdge(isStructuralEdge, e, layout),
      }));
    }, [liveActive, edges, isStructuralEdge, layout]);

    // Topology-only half of the boundary-circle grouping (see the static engine-layout effect's
    // own galaxy branch above, which this mirrors) — depends on `forest`, not on positions, so it
    // stays cheap to recompute every live-simulation tick below rather than needing its own
    // separate effect/state.
    const galaxyLeafToGroup = useMemo(() => {
      if (!liveActive) return null;
      return galaxyDiscGroups(forest.roots, forest.childrenOf);
    }, [liveActive, forest]);

    // While live simulation owns computedPositions, it must also own clusterBoundaries — the
    // static effect above no-ops for galaxy whenever live is active (see liveActiveRef), so
    // nothing else keeps the rendered boundary circles in sync with nodes moving in real time.
    // Skipped entirely when boundaries aren't shown at all, since recomputing them is otherwise
    // pure waste on every single animation frame.
    const handleLiveTick = useCallback(
      (positions: Map<string, { x: number; y: number }>) => {
        setComputedPositions(positions);
        if (!showClusterBoundaries || !galaxyLeafToGroup) return;
        const radiusOf = galaxyBoundaryRadiusOf;
        setClusterBoundaries(
          galaxySystemCircles(positions, galaxyLeafToGroup, radiusOf),
        );
      },
      [showClusterBoundaries, galaxyLeafToGroup, galaxyBoundaryRadiusOf],
    );

    const { wake: wakeGalaxySimulation } = useGalaxySimulation({
      active: liveActive,
      nodes: liveLayoutNodes,
      edges: liveLayoutEdges,
      // galaxySimulationStep caches its own construction per structure and aspect ratio, so the
      // per-frame cost is just the ease toward home (the old pre-resolved aspect scale is gone).
      options: {
        nodeMargin,
        aspectRatio: galaxyAspectRatio,
      },
      onTick: handleLiveTick,
      initialPositions: computedPositions,
    });

    // Track the rendered container size so the auto-center effect can react to it.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const ro = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) setContainerSize({ width, height });
      });
      ro.observe(container);
      return () => ro.disconnect();
    }, []);

    // Keeps isFullscreen in sync with the platform's own fullscreen state regardless of how it
    // changed — Esc, browser chrome's own exit control, or another element entirely taking over
    // fullscreen would otherwise leave GraphToolbar's button showing the wrong icon.
    useEffect(() => {
      const syncFullscreen = () => {
        const target = fullscreenContainerRef?.current ?? containerRef.current;
        const nowFullscreen = document.fullscreenElement === target;
        setIsFullscreen(nowFullscreen);
        if (pendingFullscreenFitTimeoutRef.current !== null) {
          clearTimeout(pendingFullscreenFitTimeoutRef.current);
          pendingFullscreenFitTimeoutRef.current = null;
        }
        if (nowFullscreen) {
          // Only on entry — on exit, the resize re-anchor effect below already keeps whatever was
          // centered on screen in view, which reads better than snapping to a from-scratch fit.
          pendingFullscreenFitRef.current = true;
          // Bounds how long the pending fit stays armed waiting for containerSize to report the
          // transition's own resize (see pendingFullscreenFitRef's own comment for why an
          // unbounded wait is a bug). 500ms comfortably covers a real fullscreen-transition
          // reflow — typically one or two frames, with margin for a slower device or an animated
          // OS-level fullscreen transition — while still being short enough that anything arriving
          // after it is clearly a later, unrelated resize rather than this transition's own. If no
          // resize lands in time, there's nothing to fit differently than what's already on screen.
          pendingFullscreenFitTimeoutRef.current = setTimeout(() => {
            pendingFullscreenFitRef.current = false;
            pendingFullscreenFitTimeoutRef.current = null;
          }, 500);
        } else {
          // Nothing still armed from a fullscreen session that's now over should survive to fire
          // against some later, unrelated resize either.
          pendingFullscreenFitRef.current = false;
        }
      };
      document.addEventListener("fullscreenchange", syncFullscreen);
      return () => {
        document.removeEventListener("fullscreenchange", syncFullscreen);
        if (pendingFullscreenFitTimeoutRef.current !== null)
          clearTimeout(pendingFullscreenFitTimeoutRef.current);
      };
    }, [fullscreenContainerRef]);

    const toggleFullscreen = useCallback(() => {
      const target = fullscreenContainerRef?.current ?? containerRef.current;
      // Both calls return a Promise that rejects if the platform refuses (no permissions-policy
      // grant, target detached/mid-unmount, an ancestor is inside a restrictive iframe, ...) —
      // reachable in practice specifically because fullscreenContainerRef makes the target
      // consumer-supplied rather than always GraphCanvas's own attached root. Swallowed rather
      // than surfaced as a component-level error state: the toolbar button doing nothing IS the
      // correct visible behavior when the platform says no, same as it already silently does
      // nothing when requestFullscreen/exitFullscreen aren't defined at all (the `?.` above). The
      // warn is so a consumer who passed a bad ref has something to go on instead of a bare
      // unhandled-rejection console entry with no attribution to this prop.
      if (document.fullscreenElement === target) {
        document.exitFullscreen?.()?.catch((err: unknown) => {
          console.warn("GraphCanvas: exitFullscreen() was rejected", err);
        });
      } else {
        target?.requestFullscreen?.()?.catch((err: unknown) => {
          console.warn(
            "GraphCanvas: requestFullscreen() was rejected for the fullscreenContainerRef (or default root) target",
            err,
          );
        });
      }
    }, [fullscreenContainerRef]);

    const getNodePosition = useCallback(
      (node: GraphNodeData): { x: number; y: number } => {
        const dragged = dragPositions.get(node.id);
        if (dragged) return dragged;
        if (node.x !== undefined && node.y !== undefined)
          return { x: node.x, y: node.y };
        return computedPositions.get(node.id) ?? { x: 0, y: 0 };
      },
      [dragPositions, computedPositions],
    );

    // Computes the current node bounding box in graph space (world coordinates).
    // Shared by the initial fit/center effect and the imperative zoomToFit().
    const computeBoundingBox = useCallback((): BoundingBox | null => {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const node of visibleNodes) {
        // Includes any drag override (see getNodePosition) so zoomToFit() after manually
        // repositioning a node reframes to where it actually is, not where the layout put it.
        const pos = getNodePosition(node);
        const d = dims.get(node.id) ?? {
          width: DEFAULT_NODE_W,
          height: DEFAULT_NODE_H,
        };
        minX = Math.min(minX, pos.x - d.width / 2);
        maxX = Math.max(maxX, pos.x + d.width / 2);
        minY = Math.min(minY, pos.y - d.height / 2);
        maxY = Math.max(maxY, pos.y + d.height / 2);
      }
      if (!Number.isFinite(minX)) return null;
      return { minX, maxX, minY, maxY };
    }, [visibleNodes, dims, getNodePosition]);

    // Auto-center (or fit) the node bounding box once positions and dims are ready.
    // Runs once — re-centering on later prop changes would fight user pan/zoom.
    useEffect(() => {
      if (didCenterRef.current) return;
      if (!containerSize || dims.size === 0 || visibleNodes.length === 0)
        return;
      // 'manual' has no engine layout to wait on. 'force'/'galaxy'/'force-clustered'/'ux-navigation'/'radial-tree'
      // all compute positions asynchronously (see the engine-layout effect above) — without waiting
      // for them here too, this could run with computedPositions still empty, every node falling
      // back to {x:0,y:0}, and fit/center on that degenerate single-point box instead of the real layout.
      if (
        (layout === "force" ||
          layout === "galaxy" ||
          layout === "force-clustered" ||
          layout === "ux-navigation" ||
          layout === "radial-tree") &&
        computedPositions.size === 0
      )
        return;

      const bbox = computeBoundingBox();
      if (!bbox) return;

      didCenterRef.current = true;
      setMountCenterDone(true);

      if (fitView) {
        const fit = computeFitViewport(
          bbox,
          containerSize.width,
          containerSize.height,
          fitPadding,
          minZoom,
          maxZoom,
        );
        zoomTo(fit.zoom);
        panTo(fit.panX, fit.panY);
      } else {
        const centroidX = (bbox.minX + bbox.maxX) / 2;
        const centroidY = (bbox.minY + bbox.maxY) / 2;
        panTo(
          containerSize.width / 2 - centroidX * viewport.zoom,
          containerSize.height / 2 - centroidY * viewport.zoom,
        );
      }
    }, [
      containerSize,
      dims,
      computedPositions,
      visibleNodes,
      layout,
      viewport.zoom,
      panTo,
      zoomTo,
      fitView,
      fitPadding,
      computeBoundingBox,
    ]);

    // Tracks the selectedNodeId centerOnSelect last reacted to, so it only pans on a
    // genuine CHANGE — never repeatedly on every render, which would fight a user's own
    // pan away from the selected node. Written only once a pan actually happens (or the
    // selection is explicitly cleared) — NOT the instant selectedNodeId changes — so an id
    // that isn't in visibleNodes yet (e.g. a nav-tree selection inside a currently-collapsed
    // subtree the consumer is about to expand) keeps retrying on later renders instead of
    // being silently marked "handled" with no pan ever having happened.
    const prevCenterSelectedIdRef = useRef<string | undefined>(undefined);

    // centerOnSelect (opt-in, see its own prop doc) — pans to keep selectedNodeId
    // centered whenever it changes, once the initial mount center/fit above has run.
    //
    // Gated on `mountCenterDone` STATE, not `didCenterRef` directly, despite the mount effect
    // above setting the ref synchronously the instant it runs: this effect can fire in that
    // exact same commit (both effects share containerSize as a dependency, so the render that
    // first satisfies the mount effect's guards also re-runs this one), and a live ref read
    // sees the sibling effect's synchronous write immediately — but `viewport.zoom` in THIS
    // effect's own closure is still the PRE-fit value, since zoomTo()/panTo() only schedule a
    // state update for next render. Reading a ref would let this effect pan using that stale
    // zoom, and it would never get another chance to correct it (the id guard right below
    // marks the selection "handled" on this same, wrong, run). Gating on state instead means
    // this effect's own closure still sees `mountCenterDone === false` on that first shared
    // commit (state updates from a sibling effect in the same flush aren't visible until the
    // NEXT render) — so it correctly bails out and waits for the following render, where both
    // `mountCenterDone` and `viewport.zoom` are the fit-adjusted values.
    useEffect(() => {
      if (!centerOnSelect) return;
      if (!mountCenterDone) return;
      if (locked) return;
      if (selectedNodeId === prevCenterSelectedIdRef.current) return;
      if (!selectedNodeId) {
        prevCenterSelectedIdRef.current = undefined;
        return;
      }
      if (!containerSize) return;
      const node = visibleNodes.find((n) => n.id === selectedNodeId);
      if (!node) return;
      prevCenterSelectedIdRef.current = selectedNodeId;
      const pos = getNodePosition(node);
      panTo(
        containerSize.width / 2 - pos.x * viewport.zoom,
        containerSize.height / 2 - pos.y * viewport.zoom,
      );
    }, [
      centerOnSelect,
      mountCenterDone,
      selectedNodeId,
      locked,
      containerSize,
      visibleNodes,
      getNodePosition,
      viewport.zoom,
      panTo,
    ]);

    // Re-anchors pan whenever the container's own rendered size changes after that initial
    // auto-center/fit — entering/exiting the Fullscreen API is the main trigger (the container
    // jumps from its normal in-page size to the full screen, or back), but a window resize or a
    // host layout change (a collapsing sidebar, say) hits this too. Without this, pan is a raw
    // top-left-anchored offset that goes stale the instant the container's size changes: the same
    // pan/zoom values suddenly describe a completely different visible region once the container
    // itself is a different size, snapping whatever was centered on screen off to one side (or
    // out of view entirely) instead of keeping it in view.
    useEffect(() => {
      const prev = prevContainerSizeRef.current;
      prevContainerSizeRef.current = containerSize;
      if (!didCenterRef.current || !prev || !containerSize) return;
      if (
        prev.width === containerSize.width &&
        prev.height === containerSize.height
      )
        return;
      const centerWorldX = (prev.width / 2 - viewport.x) / viewport.zoom;
      const centerWorldY = (prev.height / 2 - viewport.y) / viewport.zoom;
      panTo(
        containerSize.width / 2 - centerWorldX * viewport.zoom,
        containerSize.height / 2 - centerWorldY * viewport.zoom,
      );
    }, [containerSize, viewport.x, viewport.y, viewport.zoom, panTo]);

    // Redraws the galaxy layout when the container's aspect ratio actually changes (see
    // galaxyAspectRatio's own docs for the rounding/threshold) and pan/zoom isn't locked — the
    // "redraw to fit the new boundaries" half of aspect-ratio awareness; the static engine-layout
    // effect above only ever *reads* the current ratio when it happens to run for some other
    // reason, it never reruns just because the ratio changed. Declared after the resize re-anchor
    // effect above on purpose: both can fire in the same commit (a resize that both changes size
    // and crosses an aspect-ratio bucket), and this effect's fresh relayout-driven pan/zoom must
    // win over that one's "just preserve the old center" pan — React runs same-commit effects in
    // declaration order, last state write wins, and both firing is harmless either way (React
    // batches the state updates, so there's no visible intermediate frame).
    const prevGalaxyAspectRatioRef = useRef<number | undefined>(undefined);
    useEffect(() => {
      if (layout !== "galaxy" || galaxyAspectRatio === undefined) return;
      if (prevGalaxyAspectRatioRef.current === galaxyAspectRatio) return;
      if (locked) return;
      if (dims.size === 0) return;
      // Written only once every guard above has passed — i.e. once this run is actually about to
      // act on the new ratio, not preemptively at the top. Writing it early would mark a resize
      // that lands while locked (or before dims are measured) as "already handled" even though no
      // relayout happened; unlocking later re-runs this effect (locked is a dependency below), but
      // prevGalaxyAspectRatioRef.current already equals the current galaxyAspectRatio by then, so
      // the guard above would skip the relayout it was supposed to catch up on — permanently
      // leaving the galaxy shaped for whatever container it had before the resize.
      prevGalaxyAspectRatioRef.current = galaxyAspectRatio;

      // Live mode already reads aspectRatio from its own options every tick and eases toward the
      // new shape smoothly via the existing homeStrength mechanism — waking it (in case the loop
      // had gone idle) is enough; a competing one-shot relayout+hard-reframe here would either
      // freeze that transition mid-flight or fight it every subsequent frame.
      if (liveActiveRef.current) {
        wakeGalaxySimulation();
        return;
      }

      const layoutNodes = buildGalaxyLayoutNodes();
      const layoutEdges = (edges ?? []).map((e) => ({
        source: e.sourceId,
        target: e.targetId,
        structural: safeIsStructuralEdge(isStructuralEdge, e),
      }));
      const positions = galaxyLayout(layoutNodes, layoutEdges, {
        nodeMargin,
        aspectRatio: galaxyAspectRatio,
      });
      setComputedPositions(positions);

      // Boundary circles must track the reshaped positions too — same computation the static
      // engine-layout effect's own galaxy branch already does.
      const leafToGroup = galaxyDiscGroups(forest.roots, forest.childrenOf);
      const radiusOf = galaxyBoundaryRadiusOf;
      setClusterBoundaries(
        galaxySystemCircles(positions, leafToGroup, radiusOf),
      );

      // Re-frame using the just-computed `positions` directly, not stale `computedPositions` state
      // (the setComputedPositions call above won't be reflected until next render) — mirrors the
      // mount-time auto-center effect's own fitView/else branching exactly.
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const n of visibleNodes) {
        const p = dragPositions.get(n.id) ??
          positions.get(n.id) ?? { x: 0, y: 0 };
        const d = dims.get(n.id) ?? {
          width: DEFAULT_NODE_W,
          height: DEFAULT_NODE_H,
        };
        minX = Math.min(minX, p.x - d.width / 2);
        maxX = Math.max(maxX, p.x + d.width / 2);
        minY = Math.min(minY, p.y - d.height / 2);
        maxY = Math.max(maxY, p.y + d.height / 2);
      }
      if (Number.isFinite(minX) && containerSize) {
        const bbox = { minX, maxX, minY, maxY };
        if (fitView) {
          const fit = computeFitViewport(
            bbox,
            containerSize.width,
            containerSize.height,
            fitPadding,
            minZoom,
            maxZoom,
          );
          zoomTo(fit.zoom);
          panTo(fit.panX, fit.panY);
        } else {
          const cx = (bbox.minX + bbox.maxX) / 2;
          const cy = (bbox.minY + bbox.maxY) / 2;
          panTo(
            containerSize.width / 2 - cx * viewport.zoom,
            containerSize.height / 2 - cy * viewport.zoom,
          );
        }
      }
    }, [galaxyAspectRatio, layout, locked]);

    // Imperative viewport controls, exposed via useGraphCanvas().
    const zoomToFit = useCallback(
      (padding?: number) => {
        const bbox = computeBoundingBox();
        if (!bbox || !containerSize) return;
        const fit = computeFitViewport(
          bbox,
          containerSize.width,
          containerSize.height,
          padding ?? fitPadding,
          minZoom,
          maxZoom,
        );
        zoomTo(fit.zoom);
        panTo(fit.panX, fit.panY);
      },
      [
        computeBoundingBox,
        containerSize,
        fitPadding,
        minZoom,
        maxZoom,
        zoomTo,
        panTo,
      ],
    );

    // Fulfills pendingFullscreenFitRef once the container's real, post-transition size has
    // actually landed — containerSize only updates via the ResizeObserver effect above once the
    // browser finishes resizing the fullscreened element, so this is the first point a fit against
    // accurate dimensions is possible. Skipped while locked, matching every other automatic
    // pan/zoom effect in this file (the aspect-ratio redraw effect above included) — locked means
    // the user opted out of automatic viewport changes, entering fullscreen doesn't override that.
    useEffect(() => {
      if (!pendingFullscreenFitRef.current || !containerSize) return;
      pendingFullscreenFitRef.current = false;
      if (locked) return;
      zoomToFit();
    }, [containerSize, zoomToFit, locked]);

    // See GraphCanvasContextValue.zoomBy's own docs — anchors at the container's visual center
    // instead of setZoom's raw "wherever world (0,0) projects to" behavior.
    const zoomBy = useCallback(
      (factor: number) => {
        if (!containerSize) {
          zoomTo(viewport.zoom * factor);
          return;
        }
        zoomTo(
          viewport.zoom * factor,
          containerSize.width / 2,
          containerSize.height / 2,
        );
      },
      [containerSize, viewport.zoom, zoomTo],
    );

    const handleEdgeHoverEnd = useCallback((id: string) => {
      setHoveredEdgeId((current) => (current === id ? undefined : current));
    }, []);

    const handleEdgeHoverStart = useCallback((id: string) => {
      setHoveredEdgeId(id);
      if (edgeTooltip) {
        if (tooltipDelayRef.current.edgeTimer)
          clearTimeout(tooltipDelayRef.current.edgeTimer);
        tooltipDelayRef.current.edgeTimer = setTimeout(() => {
          setDelayedHoveredEdgeId(id);
        }, TOOLTIP_SHOW_DELAY_MS);
      }
    }, [edgeTooltip]);

    const handleEdgeHoverEndWithDelay = useCallback((id: string) => {
      handleEdgeHoverEnd(id);
      if (tooltipDelayRef.current.edgeTimer)
        clearTimeout(tooltipDelayRef.current.edgeTimer);
      setDelayedHoveredEdgeId(undefined);
    }, [handleEdgeHoverEnd]);

    const handleNodeHoverStart = useCallback((id: string) => {
      setHoveredNodeId(id);
      if (nodeTooltip) {
        if (tooltipDelayRef.current.nodeTimer)
          clearTimeout(tooltipDelayRef.current.nodeTimer);
        tooltipDelayRef.current.nodeTimer = setTimeout(() => {
          setDelayedHoveredNodeId(id);
        }, TOOLTIP_SHOW_DELAY_MS);
      }
    }, [nodeTooltip]);

    const handleNodeHoverEndWithDelay = useCallback((id: string) => {
      setHoveredNodeId((current) =>
        current === id ? undefined : current,
      );
      if (tooltipDelayRef.current.nodeTimer)
        clearTimeout(tooltipDelayRef.current.nodeTimer);
      setDelayedHoveredNodeId(undefined);
    }, []);

    const getNodeRect = useCallback(
      (id: string) => {
        // Only visible nodes resolve — an edge touching a hidden (collapsed-away) node just
        // won't find one here and renders nothing (see GraphEdgeInternal's null guard).
        const node = visibleNodes.find((n) => n.id === id);
        if (!node) {
          // Distinguish a legitimately hidden node (expected, silent) from an id that isn't in
          // `nodes` at all — a real caller bug (a typo, or an edge left dangling after its node
          // was removed) that would otherwise render as "edge just doesn't appear" with no signal,
          // indistinguishable from the collapsed case. GraphEdge (the standalone component) already
          // warns on exactly this; this keeps GraphCanvas's own internal edge renderer consistent
          // with it instead of staying silent. Only scans the full node list on the already-rare
          // not-found path, not on every lookup.
          if (!nodes.some((n) => n.id === id))
            console.warn(`GraphCanvas: node "${id}" not found`);
          return null;
        }
        const pos = getNodePosition(node);
        const d = dims.get(id) ?? {
          width: DEFAULT_NODE_W,
          height: DEFAULT_NODE_H,
        };
        const radius = galaxyRadii?.get(id);
        return { x: pos.x, y: pos.y, width: d.width, height: d.height, ...(radius !== undefined ? { radius } : {}) };
      },
      [nodes, visibleNodes, dims, getNodePosition, galaxyRadii],
    );

    // Node dragging. Pointer capture is deliberately NOT taken on pointerdown — capturing
    // retargets every subsequent event for that pointer to the capturing element, including the
    // click the browser synthesizes right after pointerup, which would then never reach (and so
    // never bubble past) the node content's own onClick a few levels down, breaking plain
    // click-to-select for every node. Capture is instead taken only once a move has actually
    // crossed DRAG_THRESHOLD — a plain click never captures at all, so it's unaffected — which
    // also keeps later move/up events targeted at this <g> even once the cursor leaves it.
    const handleNodePointerDown = useCallback(
      (e: React.PointerEvent<SVGGElement>, node: GraphNodeData) => {
        if (!draggable) return;
        // Stop this from also being treated as the start of a canvas pan — same guard GraphCanvas's
        // own pointerdown handler already applies for HTML .graph-node content, needed again here
        // because dragging starts from the SVG <g> wrapping it, which that closest() check doesn't
        // otherwise see (the event both starts and is handled here, so it never bubbles that far).
        e.stopPropagation();
        const pos = getNodePosition(node);
        dragStateRef.current = {
          id: node.id,
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startX: pos.x,
          startY: pos.y,
          dragging: false,
          target: e.currentTarget,
        };
      },
      [draggable, getNodePosition],
    );

    const handleNodePointerMove = useCallback(
      (e: React.PointerEvent<SVGGElement>) => {
        const state = dragStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;
        // DRAG_THRESHOLD is screen-space px (same bar handleCanvasPointerUp's background-click
        // check uses) — compare the raw client delta, not the world-space one, or the effective
        // screen threshold silently scales with zoom (a single px of tremor reads as a drag at a
        // heavily zoomed-out fitView; tens of px of dead travel before a node budges at max zoom).
        const screenDx = e.clientX - state.startClientX;
        const screenDy = e.clientY - state.startClientY;
        if (!state.dragging && Math.hypot(screenDx, screenDy) < DRAG_THRESHOLD)
          return;
        const dx = screenDx / viewport.zoom;
        const dy = screenDy / viewport.zoom;
        if (!state.dragging) e.currentTarget.setPointerCapture(e.pointerId);
        state.dragging = true;
        const next = { x: state.startX + dx, y: state.startY + dy };
        setDragPositions((prev) => {
          const updated = new Map(prev);
          updated.set(state.id, next);
          return updated;
        });
        // No-op while live-simulation mode is off. While it's on, this is what lets a "sun" being
        // dragged elastically carry its descendants along in real time rather than only jumping
        // them once the drag ends — see useGalaxySimulation's own wake() docs.
        wakeGalaxySimulation();
      },
      [viewport.zoom, wakeGalaxySimulation],
    );

    const handleNodePointerUp = useCallback(
      (e: React.PointerEvent<SVGGElement>) => {
        const state = dragStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;
        finalizeDrag(e.type === "pointerup");
      },
      [finalizeDrag],
    );

    // draggable can flip to false mid-gesture (this library's own docs demo exposes exactly this
    // toggle) — onPointerMove/Up/Cancel below are only bound while draggable is true, so React
    // unbinds them immediately and the trailing pointerup/cancel that would otherwise finalize the
    // drag never reaches this component. Without this, that leaves pointer capture unreleased and
    // dragStateRef permanently set — the node reads as stuck mid-drag and onNodeDragEnd never
    // fires despite a real drag having happened. Finalizes exactly like a normal pointerup would,
    // just triggered by the prop change instead of the pointer event.
    useEffect(() => {
      if (draggable) return;
      const state = dragStateRef.current;
      if (!state) return;
      if (state.dragging) {
        try {
          state.target.releasePointerCapture(state.pointerId);
        } catch (err) {
          // The expected case — pointer capture was already released (e.g. by a real pointerup
          // racing this same-tick draggable-toggle-off) — throws a DOMException and is safe to
          // ignore. Anything else (a detached element, a browser-specific quirk) is unexpected
          // enough to be worth a signal rather than disappearing silently.
          if (!(err instanceof DOMException))
            console.warn("GraphCanvas: releasePointerCapture failed", err);
        }
      }
      finalizeDrag(false);
    }, [draggable, finalizeDrag]);

    // Every visible node's rect, for edges to steer their label clear of (see
    // findClearLabelPosition). Recomputes on the same cadence as getNodeRect itself — layout and
    // measurement changes, not pan/zoom/hover — so this doesn't add extra churn beyond that.
    const nodeRects = useMemo(
      () =>
        visibleNodes
          .map((n) => getNodeRect(n.id))
          .filter((r): r is NonNullable<typeof r> => r !== null),
      [visibleNodes, getNodeRect],
    );

    // Batch-route all navigation edges together with overlapping-segment nudging
    const navigationEdgeRoutes = useMemo(() => {
      if (layout !== "ux-navigation" || !isNavigationRoute) return new Map<string, any>();

      // Filter edges to get only navigation routes
      const navEdges = edges.filter((edge) => {
        try {
          return isNavigationRoute(edge);
        } catch {
          return false;
        }
      });

      if (navEdges.length === 0) return new Map<string, any>();

      // Collect edge data with their rects, tracking all endpoint rects
      const endpointRects = new Set<typeof nodeRects[0]>();
      const edgesWithRects = navEdges
        .map((edge) => {
          const src = getNodeRect(edge.sourceId);
          const tgt = getNodeRect(edge.targetId);
          if (!src || !tgt) return null;
          endpointRects.add(src);
          endpointRects.add(tgt);
          return { id: edge.id, source: src, target: tgt };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);

      if (edgesWithRects.length === 0) return new Map<string, any>();

      // Exclude endpoint nodes from obstacles (to match single-edge routing behavior)
      const obstacleRects = nodeRects.filter((rect) => !endpointRects.has(rect));

      // Navigation edges route over structural edges, not around them
      // Call batch router with all navigation edges and filtered obstacles
      return routeNavigationEdges(edgesWithRects, obstacleRects, DEFAULT_TRACE_SPACING);
    }, [layout, isNavigationRoute, edges, getNodeRect, nodeRects, isStructuralEdge, structuralEdgeCurvature]);

    const hierarchyMetaFor = useCallback(
      (id: string): GraphNodeHierarchyMeta => {
        const hasChildren = (forest.childrenOf.get(id)?.length ?? 0) > 0;
        const collapsed = collapsedNodeIds?.has(id) ?? false;
        const hiddenDescendantCount = collapsed
          ? structuralDescendants(id, forest.childrenOf).size
          : 0;
        return {
          hasChildren,
          collapsed,
          hiddenDescendantCount,
          onToggleCollapse: onToggleCollapse
            ? () => onToggleCollapse(id)
            : undefined,
        };
      },
      [forest, collapsedNodeIds, onToggleCollapse],
    );

    const handleNodePopoverOpen = useCallback(
      (node: GraphNodeData, triggeringElement: HTMLElement | SVGElement) => {
        popoverTriggeringElementRef.current = triggeringElement;
        try {
          // Pre-check content before setting state — skip if callback returns null/undefined
          const content = nodePopover
            ? nodePopover(node)
            : (nodeTooltipTrigger === 'click' && nodeTooltip ? nodeTooltip(node) : null);
          if (content !== null && content !== undefined) {
            setActivePopoverNodeId(node.id);
            setActivePopoverEdgeId(undefined);
          }
        } catch (error) {
          console.error("Error in nodePopover/nodeTooltip callback:", error);
          popoverErrorRef.current = true;
          setActivePopoverNodeId(node.id);
          setActivePopoverEdgeId(undefined);
        }
      },
      [nodePopover, nodeTooltip, nodeTooltipTrigger],
    );

    const handleEdgePopoverOpen = useCallback(
      (edge: GraphEdge, triggeringElement: SVGElement) => {
        popoverTriggeringElementRef.current = triggeringElement;
        try {
          // Pre-check content before setting state — skip if callback returns null/undefined
          const content = edgePopover
            ? edgePopover(edge)
            : (edgeTooltipTrigger === 'click' && edgeTooltip ? edgeTooltip(edge) : null);
          if (content !== null && content !== undefined) {
            setActivePopoverEdgeId(edge.id);
            setActivePopoverNodeId(undefined);
          }
        } catch (error) {
          console.error("Error in edgePopover/edgeTooltip callback:", error);
          popoverErrorRef.current = true;
          setActivePopoverEdgeId(edge.id);
          setActivePopoverNodeId(undefined);
        }
      },
      [edgePopover, edgeTooltip, edgeTooltipTrigger],
    );

    const resolveNodeContent = useCallback(
      (node: GraphNodeData, selected: boolean, tooltipId?: string): React.ReactNode => {
        const hierarchy = hierarchyMetaFor(node.id);
        const isPopoverOpen = activePopoverNodeId === node.id;
        // Node has a popover/click-triggered tooltip if nodePopover exists OR nodeTooltipTrigger is 'click'
        const hasNodePopoverOrClickTooltip = nodePopover || (nodeTooltipTrigger === 'click' && nodeTooltip);
        const nodeProps = {
          nodeId: node.id,
          tooltipId,
          onSelect: onNodeSelect,
          onPopoverOpen: hasNodePopoverOrClickTooltip ? (triggeringElement: HTMLElement) => handleNodePopoverOpen(node, triggeringElement) : undefined,
        };
        if (renderNode)
          return safeRenderNodeCallback(renderNode, node, selected, hierarchy, nodeProps);
        return (
          <GraphNode
            bodyRadius={galaxyRadii?.get(node.id)}
            id={node.id}
            label={node.label}
            kind={node.kind}
            domainColor={node.domainColor}
            selected={selected}
            onSelect={onNodeSelect}
            onPopoverOpen={hasNodePopoverOrClickTooltip ? (triggeringElement: HTMLElement) => handleNodePopoverOpen(node, triggeringElement) : undefined}
            hasChildren={hierarchy.hasChildren}
            collapsed={hierarchy.collapsed}
            hiddenDescendantCount={hierarchy.hiddenDescendantCount}
            onToggleCollapse={hierarchy.onToggleCollapse}
            popoverOpen={isPopoverOpen}
            popoverPanelId={isPopoverOpen ? `popover-node-${node.id}` : undefined}
            tooltipId={tooltipId}
          />
        );
      },
      [renderNode, onNodeSelect, hierarchyMetaFor, nodePopover, nodeTooltip, nodeTooltipTrigger, handleNodePopoverOpen, activePopoverNodeId, galaxyRadii],
    );

    // World-space anchor (node's top-center, or an edge path's midpoint) for the nodeTooltip/
    // edgeTooltip overlay below, resolved from current hover state. Screen position is derived
    // from this at render time via the live viewport (see the overlay JSX), so it tracks pan/zoom
    // exactly like the hovered node/edge itself does — no separate "reposition on pan" handling
    // needed. Uses delayed hover states to apply the same 200ms anti-flicker delay as the
    // standalone Tooltip component. Suppressed when a popover is open for the same node/edge.
    // Only used for 'hover' trigger mode; 'click' trigger mode uses popoverTarget instead.
    const tooltipTarget = useMemo(() => {
      if (nodeTooltip && nodeTooltipTrigger === 'hover' && delayedHoveredNodeId && delayedHoveredNodeId !== activePopoverNodeId) {
        const node = visibleNodes.find((n) => n.id === delayedHoveredNodeId);
        if (node) {
          const pos = getNodePosition(node);
          const d = dims.get(node.id) ?? {
            width: DEFAULT_NODE_W,
            height: DEFAULT_NODE_H,
          };
          try {
            const content = nodeTooltip(node);
            return { type: "node" as const, nodeId: delayedHoveredNodeId, tooltipId: nodeTooltipId(delayedHoveredNodeId), content, worldX: pos.x, worldY: pos.y - d.height / 2 };
          } catch (error) {
            console.error("Error in nodeTooltip callback:", error);
            return null;
          }
        }
      }
      if (edgeTooltip && edgeTooltipTrigger === 'hover' && delayedHoveredEdgeId && delayedHoveredEdgeId !== activePopoverEdgeId) {
        const edge = edges.find((e) => e.id === delayedHoveredEdgeId);
        const src = edge && getNodeRect(edge.sourceId);
        const tgt = edge && getNodeRect(edge.targetId);
        if (edge && src && tgt) {
          const edgeCurvature = edge.curvature ?? (safeIsStructuralEdge(isStructuralEdge, edge) ? structuralEdgeCurvature : undefined);
          const path = computeEdgePath(src, tgt, {
            sourceAnchor: edge.sourceAnchor,
            targetAnchor: edge.targetAnchor,
            curvature: edgeCurvature,
          });
          try {
            const content = edgeTooltip(edge);
            return { type: "edge" as const, edgeId: delayedHoveredEdgeId, tooltipId: edgeTooltipId(delayedHoveredEdgeId), content, worldX: path.mid.x, worldY: path.mid.y };
          } catch (error) {
            console.error("Error in edgeTooltip callback:", error);
            return null;
          }
        }
      }
      return null;
    }, [
      nodeTooltip,
      nodeTooltipTrigger,
      edgeTooltip,
      edgeTooltipTrigger,
      delayedHoveredNodeId,
      delayedHoveredEdgeId,
      activePopoverNodeId,
      activePopoverEdgeId,
      visibleNodes,
      dims,
      getNodePosition,
      edges,
      getNodeRect,
      isStructuralEdge,
      structuralEdgeCurvature,
    ]);

    // World-space anchor for popover rendering — resolved from active popover state
    // (unlike tooltipTarget which uses delayed hover). Screen position is derived from this at
    // render time via the live viewport, so it tracks pan/zoom exactly like the node/edge itself.
    // Also renders click-triggered tooltips (nodeTooltipTrigger='click' or edgeTooltipTrigger='click')
    // using the popover rendering path.
    const popoverTarget = useMemo(() => {
      popoverErrorRef.current = false;
      if (activePopoverNodeId) {
        const node = visibleNodes.find((n) => n.id === activePopoverNodeId);
        if (node) {
          const pos = getNodePosition(node);
          const d = dims.get(node.id) ?? {
            width: DEFAULT_NODE_W,
            height: DEFAULT_NODE_H,
          };
          try {
            // Prefer nodePopover, fall back to click-triggered nodeTooltip
            const content = nodePopover
              ? nodePopover(node)
              : (nodeTooltipTrigger === 'click' && nodeTooltip ? nodeTooltip(node) : null);

            if (content !== null && content !== undefined) {
              return {
                type: "node" as const,
                nodeId: activePopoverNodeId,
                content,
                worldX: pos.x,
                worldY: pos.y - d.height / 2,
              };
            }
            // Content is legitimately null/undefined — don't set error
            return null;
          } catch (error) {
            console.error("Error in nodePopover/nodeTooltip callback:", error);
            popoverErrorRef.current = true;
            return null;
          }
        }
      }
      if (activePopoverEdgeId) {
        const edge = edges.find((e) => e.id === activePopoverEdgeId);
        const src = edge && getNodeRect(edge.sourceId);
        const tgt = edge && getNodeRect(edge.targetId);
        if (edge && src && tgt) {
          const edgeCurvature = edge.curvature ?? (safeIsStructuralEdge(isStructuralEdge, edge) ? structuralEdgeCurvature : undefined);
          const path = computeEdgePath(src, tgt, {
            sourceAnchor: edge.sourceAnchor,
            targetAnchor: edge.targetAnchor,
            curvature: edgeCurvature,
          });
          try {
            // Prefer edgePopover, fall back to click-triggered edgeTooltip
            const content = edgePopover
              ? edgePopover(edge)
              : (edgeTooltipTrigger === 'click' && edgeTooltip ? edgeTooltip(edge) : null);

            if (content !== null && content !== undefined) {
              return {
                type: "edge" as const,
                edgeId: activePopoverEdgeId,
                content,
                worldX: path.mid.x,
                worldY: path.mid.y,
              };
            }
            // Content is legitimately null/undefined — don't set error
            return null;
          } catch (error) {
            console.error("Error in edgePopover/edgeTooltip callback:", error);
            popoverErrorRef.current = true;
            return null;
          }
        }
      }
      return null;
    }, [
      nodePopover,
      nodeTooltip,
      nodeTooltipTrigger,
      edgePopover,
      edgeTooltip,
      edgeTooltipTrigger,
      activePopoverNodeId,
      activePopoverEdgeId,
      visibleNodes,
      dims,
      getNodePosition,
      edges,
      getNodeRect,
      isStructuralEdge,
      structuralEdgeCurvature,
    ]);

    // Prevents dead state when popoverTarget callback throws — resets so the node is clickable again.
    // Only clear if there was an error, not if content is legitimately null/undefined.
    useEffect(() => {
      if (popoverErrorRef.current && (activePopoverNodeId || activePopoverEdgeId)) {
        setActivePopoverNodeId(undefined);
        setActivePopoverEdgeId(undefined);
        popoverErrorRef.current = false;
      }
    }, [popoverTarget, activePopoverNodeId, activePopoverEdgeId]);

    // Move focus to popover panel's first focusable child when popover opens (WCAG 2.1.1).
    useEffect(() => {
      if (!popoverTarget) return;

      const panelId = popoverTarget.type === "node" ? `popover-node-${popoverTarget.nodeId}` : `popover-edge-${popoverTarget.edgeId}`;
      const panelElement = document.getElementById(panelId);
      if (!panelElement) return;

      const focusableSelector = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const focusableElements = panelElement.querySelectorAll(focusableSelector);
      if (focusableElements.length > 0) {
        (focusableElements[0] as HTMLElement).focus();
      }
    }, [popoverTarget]);

    // Document-level mousedown listener to dismiss popover when clicking outside the GraphCanvas container.
    // This preserves smooth in-canvas transitions while fixing the original issue of popovers not closing
    // when clicking on page chrome (sidebar, toolbar, etc).
    useEffect(() => {
      if (!popoverTarget) return;
      const handleMouseDown = (e: MouseEvent) => {
        const container = containerRef.current;
        if (container && !container.contains(e.target as Node)) {
          setActivePopoverNodeId(undefined);
          setActivePopoverEdgeId(undefined);
        }
      };
      document.addEventListener('mousedown', handleMouseDown);
      return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [popoverTarget]);

    const contextValue = useMemo(
      () => ({
        getNodeRect,
        nodeRects,
        zoom: viewport.zoom,
        pan: { x: viewport.x, y: viewport.y },
        selectedNodeId,
        zoomToFit,
        setZoom: zoomTo,
        zoomBy,
        setPan: panTo,
        locked,
        setLocked,
        isFullscreen,
        toggleFullscreen,
        layout,
        liveSimulation,
        setLiveSimulation,
        hoveredNodeId,
        hoveredEdgeId,
      }),
      [
        getNodeRect,
        nodeRects,
        viewport,
        selectedNodeId,
        zoomToFit,
        zoomTo,
        zoomBy,
        panTo,
        locked,
        isFullscreen,
        toggleFullscreen,
        layout,
        liveSimulation,
        hoveredNodeId,
        hoveredEdgeId,
      ],
    );

    const handleRef = (el: HTMLDivElement | null) => {
      if (typeof ref === "function") ref(el);
      else if (ref)
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current =
        el;
    };

    // Grid dots track pan/zoom via the SVG pattern transform
    const tileSize = 18 * viewport.zoom;
    const patternX = ((viewport.x % tileSize) + tileSize) % tileSize;
    const patternY = ((viewport.y % tileSize) + tileSize) % tileSize;

    return (
      <div
        ref={handleRef}
        aria-label="Graph canvas"
        className={["graph-canvas", className].filter(Boolean).join(" ")}
        onPointerDown={handlePointerDown}
        onPointerUp={handleCanvasPointerUp}
        onKeyDown={bind.onKeyDown}
        tabIndex={bind.tabIndex}
        role={bind.role}
        {...props}
      >
        {/* Hidden off-screen div — renders node HTML at natural size for measurement. Deliberately
            OUTSIDE the context provider below: useGraphCanvas() being unavailable here is how a
            custom renderNode (e.g. one embedding viewport controls) can tell this measurement
            pass apart from the real one and opt out of rendering anything for it. */}
        <div className="graph-measure" aria-hidden="true">
          {visibleNodes.map((node) => (
            <div
              key={node.id}
              ref={(el) => {
                measureRefs.current[node.id] = el;
              }}
              style={{ display: "inline-block" }}
            >
              {resolveNodeContent(node, false)}
            </div>
          ))}
        </div>

        <GraphCanvasContext.Provider value={contextValue}>
          <svg
            className="graph-svg"
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0, overflow: "visible" }}
          >
            <defs>
              <pattern
                id={gridPatternId}
                x={patternX}
                y={patternY}
                width={tileSize}
                height={tileSize}
                patternUnits="userSpaceOnUse"
              >
                <circle
                  cx="0"
                  cy="0"
                  r={Math.min(1, 0.5 * viewport.zoom)}
                  className="graph-grid-dot"
                />
              </pattern>
            </defs>

            {/* Grid fills the full SVG surface */}
            <rect
              width="100%"
              height="100%"
              fill={`url(#${gridPatternId})`}
              className="graph-grid"
            />

            {/* Single viewport transform — edges and nodes share this coordinate space */}
            <g
              className="graph-viewport"
              data-testid="graph-viewport"
              transform={transform}
            >
              {showClusterBoundaries && clusterBoundaries.size > 0 && (
                <g className="graph-clusters" aria-hidden="true">
                  {[...clusterBoundaries.entries()].map(([id, c]) => (
                    <circle
                      key={id}
                      className="graph-cluster-boundary"
                      cx={c.x}
                      cy={c.y}
                      r={c.r}
                    />
                  ))}
                </g>
              )}

              {showHierarchyRings && ringGeometry.length > 0 && (
                <g className="graph-hierarchy-rings" aria-hidden="true">
                  {ringGeometry.map((ring, idx) => (
                    <circle
                      key={`${ring.trunkId}-depth-${ring.depth}-${idx}`}
                      className="graph-hierarchy-ring"
                      cx={ring.cx}
                      cy={ring.cy}
                      r={ring.r}
                    />
                  ))}
                </g>
              )}

              <g className="graph-edges">
                {edges?.map((edge) => {
                  // Only isStructuralEdge callers opt into hiding — without it every edge
                  // is treated as structural, so this never changes existing behavior.
                  const structural = safeIsStructuralEdge(isStructuralEdge, edge, layout);
                  // Navigation routes only meaningful with ux-navigation layout
                  const navigationRoute = layout === "ux-navigation"
                    ? safeIsNavigationRoute(isNavigationRoute, edge)
                    : false;
                  const touchesFocus =
                    edge.sourceId === hoveredNodeId ||
                    edge.targetId === hoveredNodeId ||
                    edge.id === hoveredEdgeId ||
                    edge.sourceId === selectedNodeId ||
                    edge.targetId === selectedNodeId ||
                    edge.id === selectedEdgeId;
                  // Check if this is a visible navigation route (ux-navigation layout only)
                  const isVisibleNavigationRoute = visibleNavigationRouteIds.has(edge.id);
                  const hidden =
                    !structural && !showAllRelations && !touchesFocus && !isVisibleNavigationRoute;
                  // Not rendered at all rather than dimmed to a low opacity — line, marker, and
                  // label alike disappear, and it isn't clickable while hidden either.
                  if (hidden) return null;
                  const isPopoverOpen = activePopoverEdgeId === edge.id;
                  const tooltipId = tooltipTarget?.type === 'edge' && tooltipTarget.edgeId === edge.id ? tooltipTarget.tooltipId : undefined;
                  const edgeCurvature = edge.curvature ?? (structural ? structuralEdgeCurvature : undefined);
                  // Galaxy: a structural edge is an orbit link — the geometry already says
                  // "contains" — so its label only shows when the edge or an end is in focus.
                  // Labels on every orbit link buried the bodies (the original charts draw none).
                  const edgeLabel =
                    layout === "galaxy" && structural && !touchesFocus ? undefined : edge.label;
                  return (
                    <GraphEdgeInternal
                      key={edge.id}
                      id={edge.id}
                      sourceId={edge.sourceId}
                      targetId={edge.targetId}
                      label={edgeLabel}
                      variant={edge.variant}
                      weight={edge.weight}
                      opacity={edge.opacity}
                      strokeDash={edge.strokeDash}
                      sourceAnchor={edge.sourceAnchor}
                      targetAnchor={edge.targetAnchor}
                      curvature={edgeCurvature}
                      selected={edge.id === selectedEdgeId}
                      hovered={edge.id === hoveredEdgeId}
                      onSelect={onEdgeSelect}
                      onHoverStart={handleEdgeHoverStart}
                      onHoverEnd={handleEdgeHoverEndWithDelay}
                      renderEdge={renderEdge}
                      hasPopover={!!edgePopover || (edgeTooltipTrigger === 'click' && !!edgeTooltip)}
                      onPopoverOpen={(_edgeId: string, e: SVGElement) => handleEdgePopoverOpen(edge, e)}
                      popoverOpen={isPopoverOpen}
                      popoverPanelId={isPopoverOpen ? `popover-edge-${edge.id}` : undefined}
                      tooltipId={tooltipId}
                      isNavigationRoute={navigationRoute}
                      preRoutedEdge={navigationEdgeRoutes.get(edge.id)}
                    />
                  );
                })}
              </g>

              <g className="graph-nodes">
                {visibleNodes.map((node) => {
                  const pos = getNodePosition(node);
                  const d = dims.get(node.id) ?? {
                    width: DEFAULT_NODE_W,
                    height: DEFAULT_NODE_H,
                  };
                  const selected = node.id === selectedNodeId;
                  const tooltipId = tooltipTarget?.type === 'node' && tooltipTarget.nodeId === node.id ? tooltipTarget.tooltipId : undefined;
                  const hierarchy = hierarchyMetaFor(node.id);
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x} ${pos.y})`}
                      data-node-id={node.id}
                      data-testid={`graph-node-${node.id}`}
                      data-domain={node.domainColor}
                      className={[
                        "graph-canvas-node",
                        draggable && "draggable",
                        selected && "selected",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      tabIndex={renderNode && hierarchy.hasChildren && hierarchy.onToggleCollapse ? 0 : -1}
                      role={renderNode && hierarchy.hasChildren && hierarchy.onToggleCollapse ? "group" : undefined}
                      aria-expanded={renderNode && hierarchy.hasChildren && hierarchy.onToggleCollapse ? !hierarchy.collapsed : undefined}
                      aria-label={renderNode && hierarchy.hasChildren && hierarchy.onToggleCollapse ? node.label : undefined}
                      onPointerEnter={() => handleNodeHoverStart(node.id)}
                      onPointerLeave={() => handleNodeHoverEndWithDelay(node.id)}
                      onFocus={renderNode ? () => {
                        if (hierarchy.hasChildren && hierarchy.onToggleCollapse) {
                          handleNodeHoverStart(node.id);
                        }
                      } : undefined}
                      onBlur={renderNode ? (e) => {
                        if (hierarchy.hasChildren && hierarchy.onToggleCollapse) {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            handleNodeHoverEndWithDelay(node.id);
                          }
                        }
                      } : undefined}
                      onKeyDown={renderNode ? (e) => {
                        if (e.key === 'Enter' && e.shiftKey && hierarchy.hasChildren && hierarchy.onToggleCollapse) {
                          e.preventDefault();
                          e.stopPropagation();
                          try {
                            hierarchy.onToggleCollapse();
                          } catch (err) {
                            console.error('onToggleCollapse failed:', err);
                          }
                        }
                      } : undefined}
                      onPointerDown={
                        draggable
                          ? (e) => handleNodePointerDown(e, node)
                          : undefined
                      }
                      onPointerMove={
                        draggable ? handleNodePointerMove : undefined
                      }
                      onPointerUp={draggable ? handleNodePointerUp : undefined}
                      onPointerCancel={
                        draggable ? handleNodePointerUp : undefined
                      }
                    >
                      <foreignObject
                        x={-d.width / 2}
                        y={-d.height / 2}
                        width={d.width}
                        height={d.height}
                        overflow="visible"
                      >
                        {resolveNodeContent(node, selected, tooltipId)}
                      </foreignObject>
                    </g>
                  );
                })}
              </g>

              {hoveredNodeId && (
                <g className="graph-collapse-controls">
                  {(() => {
                    const nodeRect = getNodeRect(hoveredNodeId);
                    if (!nodeRect) return null;
                    const hierarchy = hierarchyMetaFor(hoveredNodeId);
                    if (!hierarchy.hasChildren || !hierarchy.onToggleCollapse) return null;
                    return (
                      <GraphCollapseControl
                        key={hoveredNodeId}
                        nodeId={hoveredNodeId}
                        label={visibleNodes.find(n => n.id === hoveredNodeId)?.label || hoveredNodeId}
                        collapsed={hierarchy.collapsed}
                        hiddenDescendantCount={hierarchy.hiddenDescendantCount}
                        onToggleCollapse={hierarchy.onToggleCollapse}
                        x={nodeRect.x}
                        y={nodeRect.y}
                        nodeWidth={nodeRect.width}
                      />
                    );
                  })()}
                </g>
              )}
            </g>
          </svg>

          {showToolbar && <GraphToolbar position={toolbarPosition} />}

          {tooltipTarget && (
            <div className="graph-tooltip-layer">
              <div
                className="graph-tooltip-anchor"
                style={{
                  left: tooltipTarget.worldX * viewport.zoom + viewport.x,
                  top: tooltipTarget.worldY * viewport.zoom + viewport.y,
                }}
              >
                <Tooltip open content={tooltipTarget.content} placement="top" id={tooltipTarget.tooltipId}>
                  <span />
                </Tooltip>
              </div>
            </div>
          )}

          {popoverTarget && (
            <div className="graph-popover-layer">
              <div
                className="graph-popover-anchor"
                style={{
                  left: popoverTarget.worldX * viewport.zoom + viewport.x,
                  top: popoverTarget.worldY * viewport.zoom + viewport.y,
                }}
              >
                <Popover
                  key={popoverTarget.type === "node" ? popoverTarget.nodeId : popoverTarget.edgeId}
                  open={true}
                  onOpenChange={(open) => {
                    if (!open) {
                      // Restore focus to the element that triggered the popover
                      const triggeringElement = popoverTriggeringElementRef.current;
                      if (triggeringElement && document.body.contains(triggeringElement)) {
                        triggeringElement.focus();
                      }
                      setActivePopoverNodeId(undefined);
                      setActivePopoverEdgeId(undefined);
                      popoverTriggeringElementRef.current = null;
                    }
                  }}
                  placement="top"
                  disableOutsideClick={true}
                  panelId={popoverTarget.type === "node" ? `popover-node-${popoverTarget.nodeId}` : `popover-edge-${popoverTarget.edgeId}`}
                >
                  <Popover.Trigger>
                    <div style={{ width: 0, height: 0 }} />
                  </Popover.Trigger>
                  <Popover.Panel aria-label={`Details for ${popoverTarget.nodeId || popoverTarget.edgeId}`}>
                    {popoverTarget.content}
                  </Popover.Panel>
                </Popover>
              </div>
            </div>
          )}

        </GraphCanvasContext.Provider>
      </div>
    );
  },
);

GraphCanvas.displayName = "GraphCanvas";

export default GraphCanvas;
