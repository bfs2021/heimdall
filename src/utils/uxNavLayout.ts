import { hierarchy, tree } from 'd3-hierarchy'
import { buildStructuralForest, type HierarchyEdge } from './graphHierarchy'
import type { LayoutNode } from './graphLayout'

export interface UxNavLayoutOptions {
  rowSpacing?: number       // vertical gap between tree depth levels (default: ~80)
  columnSpacing?: number    // horizontal gap between sibling subtrees (default: ~60)
  viewFanGap?: number       // gap between page node and first view (default: ~40)
  viewSpacing?: number      // gap between adjacent views in a fan (default: ~20)
  trunkSpacing?: number     // gap between independent page trees (default: ~120)
  maxRowWidth?: number      // a row of independent trees narrower than this never wraps (default: 1024)
}

/** Rows of independent trees are wrapped so the drawing approaches this width:height. */
const ROW_TARGET_ASPECT = 1.6

/**
 * Tree layout engine for ux-navigation layout mode. Positions page nodes as independent
 * top-down trees and view nodes as horizontal fans attached to their parent pages.
 *
 * Algorithm:
 * Pass 1 — Page forest partitioning: Use buildStructuralForest to build hierarchy, filter to
 *          page nodes only (via isPageNode predicate)
 * Pass 2 — Page tree layout: For each independent page tree, use d3.tree() with nodeSize()
 *          configured for uniform spacing. Custom separation() accounts for view fan width.
 * Pass 2b-2d — Blocks: each tree is measured box edge to box edge (fans included), views with no
 *          page parent form one compact block, and the blocks are arranged in rows, trunkSpacing
 *          apart, wrapping so the drawing approaches 16:10 once it is wider than maxRowWidth.
 * Pass 3 — View fan placement: For each page, position its child views horizontally to the right
 *
 * Multi-parent views: Views with multiple parents appear as separate node instances under each parent.
 * Each instance uses a synthetic ID "viewId:parentId" to distinguish instances of the same view.
 * Page nodes always use their ID directly (they don't support multiple parents).
 */
export function uxNavLayout(
  nodes: readonly LayoutNode[],
  edges: readonly HierarchyEdge[],
  dims: ReadonlyMap<string, { width: number; height: number }>,
  isPageNode: (node: LayoutNode) => boolean,
  options: UxNavLayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const {
    rowSpacing = 80,
    columnSpacing = 60,
    viewFanGap = 40,
    viewSpacing = 20,
    trunkSpacing = 120,
    maxRowWidth = 1024,
  } = options

  const result = new Map<string, { x: number; y: number }>()

  if (nodes.length === 0) return result

  // Pass 1: Build structural forest and filter to page nodes only
  const forest = buildStructuralForest(
    nodes.map(n => n.id),
    edges,
  )

  // Identify which nodes are pages vs views
  const nodeIds = new Set(nodes.map(n => n.id))
  const pageIds = new Set(nodes.filter(n => isPageNode(n)).map(n => n.id))
  const viewIds = new Set(nodes.filter(n => !isPageNode(n)).map(n => n.id))

  // Filter the forest to page nodes only
  const pageRoots = forest.roots.filter(id => pageIds.has(id))
  const pageChildrenOf = new Map<string, string[]>()
  for (const [parentId, children] of forest.childrenOf) {
    if (!pageIds.has(parentId)) continue
    const pageChildren = children.filter(id => pageIds.has(id))
    if (pageChildren.length > 0) {
      pageChildrenOf.set(parentId, pageChildren)
    }
  }

  // Helper to get node dimensions
  const getNodeDim = (id: string): { width: number; height: number } => ({
    width: dims.get(id)?.width ?? 138,
    height: dims.get(id)?.height ?? 30,
  })

  // Build multimap of all structural parent-child relationships for use in spacing calculations
  const allParentChildren = new Map<string, string[]>()
  for (const edge of edges) {
    if (!edge.structural) continue
    if (edge.source === edge.target) continue
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue

    const children = allParentChildren.get(edge.source) ?? []
    if (!children.includes(edge.target)) {
      children.push(edge.target)
    }
    allParentChildren.set(edge.source, children)
  }

  // Helper to calculate view fan width for a page
  // Accounts for all structural children including shared views under all parents
  const getViewFanWidth = (pageId: string): number => {
    let width = 0
    const children = allParentChildren.get(pageId) ?? []
    const viewChildren = children.filter(id => viewIds.has(id))
    if (viewChildren.length === 0) return 0

    width += viewFanGap
    for (let i = 0; i < viewChildren.length; i++) {
      if (i > 0) width += viewSpacing
      width += getNodeDim(viewChildren[i]).width
    }
    return width
  }

  // Pass 2: Layout each root page tree using d3.tree()
  const pagePositions = new Map<string, { x: number; y: number }>()
  const treeBounds: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = []

  for (const rootId of pageRoots) {
    // Build d3 hierarchy for page nodes (caller provides only visible nodes)
    const buildHierarchy = (id: string): any => {
      const children = pageChildrenOf.get(id) ?? []
      return {
        id,
        children: children.map(buildHierarchy),
      }
    }

    const treeData = buildHierarchy(rootId)
    const root = hierarchy(treeData)

    // Calculate spacing accounting for view fan width
    // d3.tree() with nodeSize([width, height]) sets the spacing between nodes
    // Use explicit separation function to account for view fans
    const nodeHeight = 100 + rowSpacing
    const nodeWidth = 200 + columnSpacing

    // Left-to-right order of the pages in this tree (pre-order over the child lists d3 will
    // lay out in the same order), so separation() can tell which of its two arguments is the
    // left node: d3-hierarchy passes (current, previousSibling) in its first walk and
    // (leftContour, rightContour) in apportion — the opposite orders.
    const preorder = new Map<string, number>()
    root.eachBefore((node: any) => preorder.set(node.data.id, preorder.size))

    const treeLayout = tree<any>()
      .nodeSize([nodeWidth, nodeHeight])
      .separation((a, b) => {
        const [left, right] = preorder.get(a.data.id)! < preorder.get(b.data.id)! ? [a, b] : [b, a]
        // The distance between the two centres has to clear exactly the left node's right half
        // plus its view fan (fans only ever extend to the right) and the right node's left
        // half, plus columnSpacing. Earlier this summed BOTH nodes' full widths and both fans
        // (+ half a cell), roughly doubling every sibling gap: on heimdall's own showcase data
        // the siblings `dashboard` (no fan) and `users` sat 762 px apart edge to edge, and the
        // 12-node graph was 3,630 px wide (harness fit-to-view: 10.6 px nodes, below the 12 px
        // legibility bar).
        const leftExtent = getNodeDim(left.data.id).width / 2 + getViewFanWidth(left.data.id)
        const rightExtent = getNodeDim(right.data.id).width / 2
        return (leftExtent + rightExtent + columnSpacing) / nodeWidth
      })

    treeLayout(root)

    // Extract positions from d3 hierarchy
    // d3.tree() provides x (horizontal spread within depth) and y (depth level)
    // For top-down layout: rendered_x = d3_x (horizontal spread), rendered_y = d3_y (depth)
    const treePositions = new Map<string, { x: number; y: number }>()
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

    root.each((node: any) => {
      const id = node.data.id
      // No swap: use d3 coordinates directly for top-down tree
      const x = node.x
      const y = node.y
      treePositions.set(id, { x, y })

      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    })

    treeBounds.push({ minX, maxX, minY, maxY })

    // Store positions temporarily for this tree
    for (const [id, pos] of treePositions) {
      pagePositions.set(id, pos)
    }
  }

  // Pass 2b: measure each independent tree as a block — box edge to box edge, view fans
  // included — and prepare to translate it; where each block lands is decided in Pass 2d.
  // (Trees used to be measured from the leftmost page's CENTRE, so every tree started half a
  // page width further left than accounted for and the real gap was trunkSpacing - width/2:
  // 51 px instead of 120 with the default 138 px node.)
  interface LayoutBlock {
    width: number
    height: number
    place: (left: number, top: number) => void
  }
  const blocks: LayoutBlock[] = []

  for (let i = 0; i < pageRoots.length; i++) {
    const rootId = pageRoots[i]
    const bounds = treeBounds[i]

    if (!bounds) continue

    // Collect all nodes in this tree (before translation) to compute extent in d3 space
    const treeNodeIds = new Set<string>()
    const collectTreeNodes = (id: string) => {
      treeNodeIds.add(id)
      for (const childId of pageChildrenOf.get(id) ?? []) {
        collectTreeNodes(childId)
      }
    }
    collectTreeNodes(rootId)

    let minTreeExtent = bounds.minX
    let maxTreeExtent = bounds.maxX
    let minTop = bounds.minY
    let maxBottom = bounds.maxY
    for (const pageId of treeNodeIds) {
      const pos = pagePositions.get(pageId)
      if (pos) {
        const pageDim = getNodeDim(pageId)
        const fanWidth = getViewFanWidth(pageId)
        minTreeExtent = Math.min(minTreeExtent, pos.x - pageDim.width / 2)
        maxTreeExtent = Math.max(maxTreeExtent, pos.x + pageDim.width / 2 + fanWidth)
        minTop = Math.min(minTop, pos.y - pageDim.height / 2)
        maxBottom = Math.max(maxBottom, pos.y + pageDim.height / 2)
      }
    }

    blocks.push({
      width: maxTreeExtent - minTreeExtent,
      height: maxBottom - minTop,
      place: (left, top) => {
        const treeTranslateX = left - minTreeExtent
        const treeTranslateY = top - minTop
        const updateTreePositions = (id: string) => {
          if (pagePositions.has(id)) {
            const pos = pagePositions.get(id)!
            pagePositions.set(id, { x: pos.x + treeTranslateX, y: pos.y + treeTranslateY })
          }
          for (const childId of pageChildrenOf.get(id) ?? []) {
            updateTreePositions(childId)
          }
        }
        updateTreePositions(rootId)
      },
    })
  }

  // Pass 2c: Orphan views — views with no structural PAGE parent at all
  // (real, not hypothetical: e.g. a library component referenced only via a
  // non-structural edge, or — also real — a view with a structural edge to
  // another view, which Pass 3 below never positions since it only fans a
  // page's own children: uxNavLayout's page/view model is 2-tier, a view
  // cannot itself have positioned children). Anything Pass 3 won't reach
  // was previously never added to the returned position map at all, and the
  // caller (GraphCanvas) falls back to {x:0,y:0} for any node missing from
  // it, silently stacking every orphan view (and whatever real page/view
  // happens to occupy the origin) on top of each other.
  //
  // Must filter to pageIds.has(parentId) exactly like Pass 3 does below —
  // an earlier version of this filtered nothing, so a view-sourced
  // structural edge (a real shape: "subview A uses librarysubview B") made
  // this think B was placed when Pass 3 actually skips that entry entirely,
  // silently reintroducing the exact {0,0}-stacking bug for exactly the
  // nodes this pass exists to catch.
  const placedViewIds = new Set<string>()
  for (const [parentId, children] of allParentChildren) {
    if (!pageIds.has(parentId)) continue
    for (const id of children) {
      if (viewIds.has(id)) placedViewIds.add(id)
    }
  }
  const orphanViewIds = Array.from(viewIds).filter(id => !placedViewIds.has(id))
  if (orphanViewIds.length > 0) {
    // Orphans form one compact block after the trees, filled column by column and wrapped to
    // the tallest tree's height (at least one row; a graph with no page tree gets a roughly
    // square block). They used to be appended one per trunk-spaced slot in a single row,
    // which on real data (documentation_robotics_viewer's ux layer: 23 orphan views of 27)
    // made a 5,800 px strip that dominated the bounding box — the vision statement's
    // "aspect-ratio risk from Pass 2c's orphan row", measured at 4.9 px nodes after
    // fit-to-view. The block uses viewSpacing between boxes, like a fan, so it still reads as
    // a parking area for views rather than as a row of independent trees.
    const tallestTree = blocks.reduce((h, b) => Math.max(h, b.height), 0)
    const orphanHeight = Math.max(...orphanViewIds.map(id => getNodeDim(id).height))
    const rowsThatFit = Math.floor((tallestTree + viewSpacing) / (orphanHeight + viewSpacing))
    const rows = Math.max(1, Math.min(orphanViewIds.length, blocks.length > 0 ? rowsThatFit : Math.ceil(Math.sqrt(orphanViewIds.length))))
    const columns: string[][] = []
    for (let i = 0; i < orphanViewIds.length; i += rows) columns.push(orphanViewIds.slice(i, i + rows))
    const columnWidths = columns.map(column => Math.max(...column.map(id => getNodeDim(id).width)))
    blocks.push({
      width: columnWidths.reduce((a, b) => a + b, 0) + (columns.length - 1) * viewSpacing,
      height: rows * orphanHeight + (rows - 1) * viewSpacing,
      place: (left, top) => {
        let columnX = left
        columns.forEach((column, c) => {
          column.forEach((viewId, row) => {
            result.set(viewId, { x: columnX + columnWidths[c] / 2, y: top + orphanHeight / 2 + row * (orphanHeight + viewSpacing) })
          })
          columnX += columnWidths[c] + viewSpacing
        })
      },
    })
  }

  // Pass 2d: arrange the blocks (independent trees, then the orphan block) in rows, left to
  // right and top-aligned within a row, trunkSpacing apart in both directions. A row is as
  // wide as the widest block, or wide enough that the whole drawing approaches a 16:10 shape
  // (sqrt of the blocks' total area x 1.6), whichever is more — but never narrower than
  // maxRowWidth, so a forest that fits a typical canvas at 1:1 stays on one row. Before, every
  // block went on one row: a 39-node sitemap with two trees was 4,540 x 390 px (8.5 px node
  // height after fit-to-view in 1280x800), and the vision statement's checklist item 6
  // ("the overall aspect ratio stays reasonable even with many independent trees or orphan
  // views") was an open risk.
  const totalArea = blocks.reduce((a, b) => a + b.width * b.height, 0)
  const widestBlock = blocks.reduce((w, b) => Math.max(w, b.width), 0)
  const rowWidth = Math.max(widestBlock, maxRowWidth, Math.sqrt(totalArea * ROW_TARGET_ASPECT))
  let rowLeft = 0
  let rowTop = 0
  let rowHeight = 0
  for (const block of blocks) {
    if (rowLeft > 0 && rowLeft + block.width > rowWidth) {
      rowLeft = 0
      rowTop += rowHeight + trunkSpacing
      rowHeight = 0
    }
    block.place(rowLeft, rowTop)
    rowLeft += block.width + trunkSpacing
    rowHeight = Math.max(rowHeight, block.height)
  }

  // Identify views with multiple parents
  // Views with multiple parents will use synthetic IDs "viewId:parentId" to appear under each parent
  const viewParentCount = new Map<string, Set<string>>()
  for (const [parent, children] of allParentChildren) {
    for (const child of children) {
      if (viewIds.has(child)) {
        const parents = viewParentCount.get(child) ?? new Set()
        parents.add(parent)
        viewParentCount.set(child, parents)
      }
    }
  }

  const multiParentViews = new Set(
    Array.from(viewParentCount.entries())
      .filter(([_, parents]) => parents.size > 1)
      .map(([viewId]) => viewId)
  )

  // Pass 3: View fan placement
  // Position view nodes horizontally to the right of their parent pages.
  // Multi-parent views use synthetic IDs "viewId:parentId" so they appear under each parent,
  // and also store a fallback position under the original ID (using the first parent's position
  // for backward compatibility with consumer code).
  // Single-parent views use their original ID.
  const multiParentFirstPositions = new Map<string, { x: number; y: number }>()

  for (const [pageId, allChildren] of allParentChildren) {
    if (!pageIds.has(pageId)) continue

    const pagePos = pagePositions.get(pageId)
    if (!pagePos) continue

    const pageDim = getNodeDim(pageId)

    // Filter to view children only
    const viewChildren = allChildren.filter(id => viewIds.has(id))
    if (viewChildren.length === 0) continue

    // Position each view child in this parent's fan
    for (let i = 0; i < viewChildren.length; i++) {
      const viewId = viewChildren[i]
      const viewWidth = getNodeDim(viewId).width

      // Left edge of this view's slot in the fan (starting from right edge of parent)
      let leftEdge = pagePos.x + pageDim.width / 2 + viewFanGap

      // Add widths of previous views in this parent's fan
      for (let j = 0; j < i; j++) {
        const prevViewId = viewChildren[j]
        const prevViewWidth = getNodeDim(prevViewId).width
        leftEdge += prevViewWidth + viewSpacing
      }

      // `position` is the view's CENTER (matches how every other position in this
      // file, and the caller's dims-based collision math, treat node positions) —
      // leftEdge alone was previously used directly as the center, which shifted
      // every view left by half its own width. Harmless for narrow demo nodes
      // (viewWidth/2 < viewFanGap kept it looking fine), but with a view wider than
      // 2*viewFanGap (routine for real text labels) the first view in a fan
      // overlapped its own parent page by exactly viewWidth/2 - viewFanGap —
      // confirmed against real data: 21.5px/23.5px/28px overlaps, one per
      // overlapping pair, matching that formula exactly for each view's real width.
      const position = { x: leftEdge + viewWidth / 2, y: pagePos.y }

      // Use synthetic ID for multi-parent views so they appear under each parent
      if (multiParentViews.has(viewId)) {
        const resultKey = `${viewId}:${pageId}`
        result.set(resultKey, position)
        // Store first parent's position under original ID for fallback
        if (!multiParentFirstPositions.has(viewId)) {
          multiParentFirstPositions.set(viewId, position)
        }
      } else {
        // Single-parent views use original ID
        result.set(viewId, position)
      }
    }
  }

  // Add fallback positions for multi-parent views using original IDs
  for (const [viewId, position] of multiParentFirstPositions) {
    result.set(viewId, position)
  }

  // Add all page positions to result
  for (const [id, pos] of pagePositions) {
    result.set(id, pos)
  }

  return result
}
