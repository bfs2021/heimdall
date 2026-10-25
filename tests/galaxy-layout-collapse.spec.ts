import { test, expect } from '@playwright/test'
import {
  freezeAnimations,
  loadSelfHostedFonts,
  assertFontsLoaded,
  applyDarkCanvasMode,
  removeDarkCanvasMode,
} from './utils/test-helpers'

test.describe('integration: Galaxy Layout Collapse/Expand', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/?example=graph')
    await page.waitForLoadState('networkidle')

    // Load self-hosted fonts
    await loadSelfHostedFonts(page)

    // Verify fonts are loaded
    await assertFontsLoaded(page)

    // Freeze animations for consistent snapshots
    await freezeAnimations(page)

    // Switch to Galaxy View
    await page.locator('[data-testid="galaxy-view-button"]').click()
    await page.waitForTimeout(200)
  })

  test.afterEach(async ({ page }) => {
    // Ensure we exit dark canvas mode after each test
    await removeDarkCanvasMode(page)
  })

  // Helper: overlapping node pairs. Galaxy's default nodes are round bodies (.graph-node--body),
  // tested as circles — their square bounding boxes can overlap at the corners while the circles
  // don't touch. Cards are tested as boxes. Sub-pixel contact is ignored.
  // Returns { count: total nodes, overlaps: number of overlapping pairs }
  async function nodeOverlaps(page: import('@playwright/test').Page) {
    const nodes = page.locator('[data-testid^="graph-node-"]')
    const count = await nodes.count()
    const shapes: { x: number; y: number; width: number; height: number; round: boolean }[] = []
    for (let i = 0; i < count; i++) {
      const node = nodes.nth(i)
      const box = await node.boundingBox()
      if (box) shapes.push({ ...box, round: (await node.locator('.graph-node--body').count()) > 0 })
    }
    let overlaps = 0
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i],
          b = shapes[j]
        if (a.round && b.round) {
          const d = Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2))
          if ((a.width + b.width) / 2 - d > 0.5) overlaps++
          continue
        }
        const overlapX =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapY =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (overlapX > 0.5 && overlapY > 0.5) overlaps++
      }
    }
    return { count, overlaps }
  }

  test('renders every node with no overlapping bounding boxes', async ({
    page,
  }) => {
    const { count, overlaps } = await nodeOverlaps(page)
    expect(count).toBe(28) // GALAXY_DEMO_NODES length, including the two orphans
    expect(overlaps).toBe(0)
  })

  test('collapsing a node hides its structural descendants and shows a hidden-count badge', async ({
    page,
  }) => {
    // organism -> eukaryote, prokaryote -> ... -> 10 structural descendants total
    const { count: before } = await nodeOverlaps(page)

    // The toggle button is inside the SVG foreignObject within the graph node
    // Use the direct selector from the GraphNode component
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    await expect(toggle).toBeVisible()
    await toggle.click()
    await page.waitForTimeout(300)

    await expect(
      page.locator('[data-testid="graph-node-eukaryote"]'),
    ).not.toBeAttached()
    await expect(
      page.locator('[data-testid="graph-node-chromosome"]'),
    ).not.toBeAttached()
    // organism itself stays visible, collapsed — only its subtree disappears
    await expect(
      page.locator('[data-testid="graph-node-organism"]'),
    ).toBeVisible()

    const { count: after } = await nodeOverlaps(page)
    expect(before - after).toBe(10)

    // Edges into the hidden subtree disappear too (no dangling endpoints)
    await expect(
      page.locator('[data-testid="graph-edge-e_organism_eukaryote"]'),
    ).not.toBeAttached()
  })

  test('expanding a collapsed node restores its structural descendants', async ({
    page,
  }) => {
    const { count: before } = await nodeOverlaps(page)

    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    await toggle.click()
    await page.waitForTimeout(300)
    await expect(
      page.locator('[data-testid="graph-node-eukaryote"]'),
    ).not.toBeAttached()

    await toggle.click()
    await page.waitForTimeout(300)
    await expect(
      page.locator('[data-testid="graph-node-eukaryote"]'),
    ).toBeVisible()

    const { count: after, overlaps } = await nodeOverlaps(page)
    expect(after).toBe(before)
    expect(overlaps).toBe(0)
  })

  test('Cards mode renders without overlaps after collapse', async ({
    page,
  }) => {
    await page.locator('[data-testid="galaxy-card-size-button"]').click()

    // Scoped under the node's own unique outer testid — TopologyNode's inner testid, like
    // any content resolveNodeContent returns, is duplicated into the off-screen measurement copy.
    const card = page.locator(
      '[data-testid="graph-node-organism"] [data-testid="topology-node-organism"]',
    )
    await expect(card).toBeVisible()
    const box = await card.boundingBox()
    expect(box).toBeTruthy()

    // fitView zooms the whole graph to fit the panel, so the on-screen box is scaled down from
    // its true CSS size — divide out the current zoom to compare against TopologyNode's actual
    // min-width (much larger than GraphNode's ~138px default).
    const transform = await page
      .locator('[data-testid="graph-viewport"]')
      .getAttribute('transform')
    const zoom = parseFloat(transform!.match(/matrix\(([^,]+)/)![1])
    // A tiny tolerance against float division rounding (box.width / zoom can land a fraction of
    // a px under the true 180 depending on the exact zoom value) — asserting the exact integer
    // boundary made this fail on legitimate sub-pixel jitter unrelated to the card's real size.
    expect(box!.width / zoom).toBeGreaterThanOrEqual(179.5)

    const { overlaps } = await nodeOverlaps(page)
    expect(overlaps).toBe(0)
  })

  test('collapse toggle is visible and functional for parent nodes', async ({
    page,
  }) => {
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    await expect(toggle).toBeVisible()

    // Verify it's interactive
    await toggle.click()
    await page.waitForTimeout(300)
    await expect(
      page.locator('[data-testid="graph-node-eukaryote"]'),
    ).not.toBeAttached()

    // Expand again
    await toggle.click()
    await page.waitForTimeout(300)
    await expect(
      page.locator('[data-testid="graph-node-eukaryote"]'),
    ).toBeVisible()
  })

  test('nodes without structural children render no collapse toggle', async ({
    page,
  }) => {
    // brca1 is a leaf — reachable only via instanceOf from chromosome, no children of its own
    await expect(
      page.locator('[data-testid="graph-node-brca1"] .graph-node__collapse-toggle'),
    ).not.toBeAttached()
  })

  test('collapse maintains zero-overlap guarantee for galaxy layout', async ({
    page,
  }) => {
    const { overlaps: beforeCollapse } = await nodeOverlaps(page)
    expect(beforeCollapse).toBe(0)

    // Collapse organism
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    await toggle.click()
    await page.waitForTimeout(300)

    const { overlaps: afterCollapse } = await nodeOverlaps(page)
    expect(afterCollapse).toBe(0)
  })

  test('expand after collapse maintains zero-overlap guarantee', async ({
    page,
  }) => {
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')

    // Collapse
    await toggle.click()
    await page.waitForTimeout(300)

    // Expand
    await toggle.click()
    await page.waitForTimeout(300)

    const { overlaps } = await nodeOverlaps(page)
    expect(overlaps).toBe(0)
  })

  test('hidden badge shows correct descendant count', async ({ page }) => {
    const organism = page.locator('[data-testid="graph-node-organism"]')

    // Collapse the node
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    await toggle.click()
    await page.waitForTimeout(300)

    // Hover to show the collapse control with badge
    await organism.hover()
    await page.waitForTimeout(100)

    // Badge should be visible in the GraphCollapseControl when collapsed
    const badge = page.locator('[data-testid="graph-collapse-control-organism"] .graph-collapse-control__badge')
    await expect(badge).toHaveText('10')

    // Expand and badge should disappear
    await toggle.click()
    await page.waitForTimeout(300)

    // Hover again to see the control (should have no badge now)
    await organism.hover()
    await page.waitForTimeout(100)
    await expect(badge).not.toBeAttached()
  })

  test('galaxy layout collapse works in dark mode', async ({ page }) => {
    await applyDarkCanvasMode(page)
    await page.waitForTimeout(200)

    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    await expect(toggle).toBeVisible()
    await toggle.click()
    await page.waitForTimeout(300)

    await expect(
      page.locator('[data-testid="graph-node-eukaryote"]'),
    ).not.toBeAttached()

    const { overlaps } = await nodeOverlaps(page)
    expect(overlaps).toBe(0)
  })

  test('edges connected to collapsed subtree are not rendered', async ({
    page,
  }) => {
    // Before collapse, edge should exist
    await expect(
      page.locator('[data-testid="graph-edge-e_organism_eukaryote"]'),
    ).toBeAttached()

    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    await toggle.click()
    await page.waitForTimeout(300)

    // After collapse, edge should be gone
    await expect(
      page.locator('[data-testid="graph-edge-e_organism_eukaryote"]'),
    ).not.toBeAttached()

    // After expand, edge should be back
    await toggle.click()
    await page.waitForTimeout(300)
    await expect(
      page.locator('[data-testid="graph-edge-e_organism_eukaryote"]'),
    ).toBeAttached()
  })

  test('multiple collapses maintain zero-overlap guarantee', async ({ page }) => {
    const { count: initial } = await nodeOverlaps(page)

    // Collapse organism (10 descendants hidden)
    const toggleOrganism = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    await toggleOrganism.click()
    await page.waitForTimeout(300)

    const { count: afterFirst, overlaps: overlapsAfterFirst } = await nodeOverlaps(page)
    expect(initial - afterFirst).toBe(10)
    expect(overlapsAfterFirst).toBe(0)

    // Collapse another node with children (find a cell or other parent)
    // First, try to find which nodes are parents by looking for toggle buttons
    const allNodes = page.locator('[data-testid^="graph-node-"]')
    const nodeCount = await allNodes.count()

    let collapsedAnother = false
    for (let i = 0; i < nodeCount; i++) {
      const node = allNodes.nth(i)
      const nodeId = await node.getAttribute('data-testid')
      if (nodeId && nodeId !== 'graph-node-organism') {
        const toggleBtn = node.locator('.graph-node__collapse-toggle')
        if (await toggleBtn.isVisible()) {
          await toggleBtn.click()
          await page.waitForTimeout(300)
          collapsedAnother = true
          break
        }
      }
    }

    expect(collapsedAnother).toBe(true)
    const { count: afterSecond, overlaps: overlapsAfterSecond } = await nodeOverlaps(page)
    expect(afterSecond).toBeLessThan(afterFirst)
    expect(overlapsAfterSecond).toBe(0)
  })

  test.skip('galaxy layout collapse visual snapshot', async ({ page }) => {
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    await toggle.click()
    await page.waitForTimeout(300)

    const canvas = page.locator('[data-testid="galaxy-canvas"]')
    await expect(canvas).toHaveScreenshot(
      'galaxy-layout-collapsed-light.png',
    )
  })

  test.skip('galaxy layout expand visual snapshot', async ({ page }) => {
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    // Collapse then expand for a clear visual of restored state
    await toggle.click()
    await page.waitForTimeout(300)
    await toggle.click()
    await page.waitForTimeout(300)

    const canvas = page.locator('[data-testid="galaxy-canvas"]')
    await expect(canvas).toHaveScreenshot(
      'galaxy-layout-expanded-light.png',
    )
  })

  test('inline collapse toggle has correct aria-expanded and aria-label in expanded state', async ({
    page,
  }) => {
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')

    // In expanded state
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse Organism')
  })

  test('inline collapse toggle updates aria-expanded and aria-label when collapsed', async ({
    page,
  }) => {
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')

    // Initially expanded
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse Organism')

    // Collapse
    await toggle.click()
    await page.waitForTimeout(300)

    // After collapse
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAttribute('aria-label', 'Expand Organism')
  })

  test('inline hidden badge displays with correct count when collapsed', async ({
    page,
  }) => {
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    const badge = toggle.locator('.graph-node__hidden-badge')

    // Badge should not be visible in expanded state
    await expect(badge).not.toBeAttached()

    // Collapse
    await toggle.click()
    await page.waitForTimeout(300)

    // Badge should now be visible with correct count (10 descendants hidden)
    await expect(badge).toBeAttached()
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText('10')
  })

  test('inline chevron icon points right when collapsed and down when expanded', async ({
    page,
  }) => {
    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    const svg = toggle.locator('svg.graph-node__toggle-icon')

    // Initially expanded — chevron should point down
    // SVG with down-pointing polyline: points="6 9 12 15 18 9"
    let polyline = svg.locator('polyline')
    await expect(polyline).toHaveAttribute('points', '6 9 12 15 18 9')

    // Collapse
    await toggle.click()
    await page.waitForTimeout(300)

    // After collapse — chevron should point right
    // SVG with right-pointing polyline: points="9 6 15 12 9 18"
    polyline = svg.locator('polyline')
    await expect(polyline).toHaveAttribute('points', '9 6 15 12 9 18')

    // Expand again
    await toggle.click()
    await page.waitForTimeout(300)

    // Back to down-pointing
    polyline = svg.locator('polyline')
    await expect(polyline).toHaveAttribute('points', '6 9 12 15 18 9')
  })

  test('restored features work in dark canvas mode', async ({ page }) => {
    await applyDarkCanvasMode(page)
    await page.waitForTimeout(200)

    const toggle = page.locator('[data-testid="graph-node-organism"] .graph-node__collapse-toggle')
    const badge = toggle.locator('.graph-node__hidden-badge')

    // Verify expanded state
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse Organism')

    // Collapse
    await toggle.click()
    await page.waitForTimeout(300)

    // Verify collapsed state with badge
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAttribute('aria-label', 'Expand Organism')
    await expect(badge).toHaveText('10')

    // Verify chevron points right when collapsed
    const svg = toggle.locator('svg.graph-node__toggle-icon')
    const polyline = svg.locator('polyline')
    await expect(polyline).toHaveAttribute('points', '9 6 15 12 9 18')
  })
})
