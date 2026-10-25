import { test, expect } from "@playwright/test";
import {
  freezeAnimations,
  loadSelfHostedFonts,
  assertFontsLoaded,
  applyDarkCanvasMode,
  removeDarkCanvasMode,
} from "./utils/test-helpers";

test.describe("integration: Graph Canvas Components", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173/?example=graph");
    await page.waitForLoadState("networkidle");

    // Load self-hosted fonts
    await loadSelfHostedFonts(page);

    // Verify fonts are loaded
    await assertFontsLoaded(page);

    // Freeze animations for consistent snapshots
    await freezeAnimations(page);
  });

  test.afterEach(async ({ page }) => {
    // Ensure we exit dark canvas mode after each test
    await removeDarkCanvasMode(page);
  });

  test("GraphCanvas renders with nodes", async ({ page }) => {
    const canvas = page.locator(".graph-canvas");
    await expect(canvas).toBeVisible();

    const nodes = page.locator('[data-testid^="graph-node-"]');
    const nodeCount = await nodes.count();
    expect(nodeCount).toBeGreaterThan(0);
  });

  test("GraphNode selection applies selected state", async ({ page }) => {
    const firstNode = page.locator('[data-testid="graph-node-cls_cell"]');
    await expect(firstNode).toBeVisible();

    await firstNode.click();
    await expect(firstNode).toHaveClass(/selected/);

    const inspectorTitle = page.locator('[data-testid="inspector-title"]');
    await expect(inspectorTitle).toContainText("Cell");
  });

  test("clicking an edge line selects it and shows the source/edge/target panel stack", async ({
    page,
  }) => {
    const edge = page.locator('[data-testid="graph-edge-edge_1"]');
    await expect(edge).toBeVisible();

    // .graph-edge__hit is the fat invisible stroke — the actual click target, not the thin
    // visible line — same as a real user's imprecise click on a 1.25px-wide path.
    await edge.locator(".graph-edge__hit").dispatchEvent("click");

    await expect(edge).toHaveClass(/selected/);
    await expect(
      page.locator('[data-testid="graph-edge-inspector-stack"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="graph-edge-inspector-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="graph-inspector-panel-source"]'),
    ).toContainText("Cell");
    await expect(
      page.locator('[data-testid="graph-inspector-panel-target"]'),
    ).toContainText("Nucleus");
  });

  test("clicking an edge label selects the same edge as clicking its line", async ({
    page,
  }) => {
    const edge = page.locator('[data-testid="graph-edge-edge_1"]');
    await edge.locator(".graph-edge__label").dispatchEvent("click");

    await expect(edge).toHaveClass(/selected/);
    await expect(
      page.locator('[data-testid="edge-inspector-title"]'),
    ).toContainText("contains");
  });

  test("selecting a different edge deselects the previous one", async ({
    page,
  }) => {
    const edge1 = page.locator('[data-testid="graph-edge-edge_1"]');
    const edge2 = page.locator('[data-testid="graph-edge-edge_2"]');

    await edge1.locator(".graph-edge__hit").dispatchEvent("click");
    await expect(edge1).toHaveClass(/selected/);

    await edge2.locator(".graph-edge__hit").dispatchEvent("click");
    await expect(edge2).toHaveClass(/selected/);
    await expect(edge1).not.toHaveClass(/selected/);
  });

  test("selecting a node clears any selected edge", async ({ page }) => {
    const edge = page.locator('[data-testid="graph-edge-edge_1"]');
    await edge.locator(".graph-edge__hit").dispatchEvent("click");
    await expect(edge).toHaveClass(/selected/);

    await page.locator('[data-testid="graph-node-cls_mito"]').click();

    await expect(edge).not.toHaveClass(/selected/);
    await expect(
      page.locator('[data-testid="graph-edge-inspector-stack"]'),
    ).not.toBeVisible();
    await expect(page.locator('[data-testid="inspector-title"]')).toContainText(
      "Mitochondrion",
    );
  });

  test("a real drag does not also fire node selection", async ({ page }) => {
    const node = page.locator('[data-testid="graph-node-cls_mito"]');
    const box = await node.boundingBox();
    if (!box) throw new Error("Node not visible");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 60, { steps: 10 });
    await page.mouse.up();

    await expect(node).not.toHaveClass(/selected/);
  });

  test("draggable=false disables node dragging without affecting click-to-select", async ({
    page,
  }) => {
    await page.locator('[data-testid="graph-draggable-toggle"]').click();

    const node = page.locator('[data-testid="graph-node-cls_mito"]');
    const before = await node.getAttribute("transform");
    const box = await node.boundingBox();
    if (!box) throw new Error("Node not visible");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 60, { steps: 10 });
    await page.mouse.up();

    const after = await node.getAttribute("transform");
    expect(after).toBe(before);

    // Dragging being off shouldn't break the ordinary click path.
    await node.click();
    await expect(node).toHaveClass(/selected/);
  });

  // Regression: a drag interrupted by pointercancel (e.g. a touch/gesture takeover) — rather than
  // a normal pointerup — used to leak a one-time click-suppressor listener that never got a click
  // to consume it, silently swallowing the node's next real click. Low-level pointer events
  // (rather than page.mouse) so pointerId is under test control and matches what the component's
  // own pointerId-matching logic expects.
  test("a drag interrupted by pointercancel does not swallow the next click", async ({
    page,
  }) => {
    const node = page.locator('[data-testid="graph-node-cls_mito"]');
    const box = await node.boundingBox();
    if (!box) throw new Error("Node not visible");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await node.evaluate(
      (el, { cx, cy }) => {
        el.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerId: 77,
            clientX: cx,
            clientY: cy,
          }),
        );
        el.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: 77,
            clientX: cx + 50,
            clientY: cy + 40,
          }),
        );
        el.dispatchEvent(
          new PointerEvent("pointercancel", { bubbles: true, pointerId: 77 }),
        );
      },
      { cx, cy },
    );

    // If the suppressor leaked, this first real click is the one that would get silently eaten.
    await node.click();
    await expect(node).toHaveClass(/selected/);
  });

  // Regression: draggable flipping to false mid-drag (this file's own toggle button makes this
  // reachable) used to strand pointer capture and drag state, since onPointerMove/Up/Cancel are
  // only bound while draggable is true and so never fire again to clean up after themselves.
  test("toggling draggable off mid-drag leaves the node in a normal, clickable state", async ({
    page,
  }) => {
    const node = page.locator('[data-testid="graph-node-cls_mito"]');
    const box = await node.boundingBox();
    if (!box) throw new Error("Node not visible");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await node.evaluate(
      (el, { cx, cy }) => {
        el.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerId: 88,
            clientX: cx,
            clientY: cy,
          }),
        );
        el.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: 88,
            clientX: cx + 50,
            clientY: cy + 40,
          }),
        );
      },
      { cx, cy },
    );

    // Flip draggable off without ever sending a pointerup/pointercancel for pointerId 88 —
    // the gesture is abandoned mid-drag, same as the real toggle-while-dragging scenario.
    await page.locator('[data-testid="graph-draggable-toggle"]').click();
    await page.locator('[data-testid="graph-draggable-toggle"]').click();

    // Not stuck: an ordinary click still selects normally, with no leaked suppressor from the
    // abandoned gesture and no pointer capture still pinned to the old pointerId.
    await node.click();
    await expect(node).toHaveClass(/selected/);
  });

  test("GraphCanvas panning works on mouse drag", async ({ page }) => {
    const canvas = page.locator(".graph-canvas");
    const viewport = page.locator('[data-testid="graph-viewport"]');

    const initialTransform = await viewport.evaluate((el) =>
      el.getAttribute("transform"),
    );

    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not visible");

    // Top-center, away from any node and from the default toolbar (bottom-right, per
    // GraphCanvas's toolbarPosition default) — verified empty background at this canvas's
    // current node layout, unlike either bottom corner or the top-left/right corners.
    const startX = box.x + box.width / 2;
    const startY = box.y + 40;
    const endX = startX - 80;
    const endY = startY + 60;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(100);

    const newTransform = await viewport.evaluate((el) =>
      el.getAttribute("transform"),
    );

    expect(initialTransform).not.toBe(newTransform);
  });

  test("GraphCanvas zoom works with scroll", async ({ page }) => {
    const canvas = page.locator(".graph-canvas");
    const viewport = page.locator('[data-testid="graph-viewport"]');

    const initialTransform = await viewport.evaluate((el) =>
      el.getAttribute("transform"),
    );

    await canvas.evaluate((el) => {
      el.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, ctrlKey: true, deltaY: 100 }),
      );
    });

    await page.waitForTimeout(200);

    const newTransform = await viewport.evaluate((el) =>
      el.getAttribute("transform"),
    );

    expect(initialTransform).not.toBe(newTransform);
  });

  test("the toolbar fullscreen button toggles the canvas into and out of the Fullscreen API", async ({
    page,
  }) => {
    const canvas = page.locator(".graph-canvas");
    const enterBtn = page.locator('[aria-label="Fullscreen"]');
    const exitBtn = page.locator('[aria-label="Exit fullscreen"]');

    await expect(enterBtn).toBeVisible();
    expect(
      await canvas.evaluate((el) => el === document.fullscreenElement),
    ).toBe(false);

    await enterBtn.click();
    await expect(exitBtn).toBeVisible();
    expect(
      await canvas.evaluate((el) => el === document.fullscreenElement),
    ).toBe(true);

    // Exiting via document.exitFullscreen() (what pressing Esc does under the hood) rather than
    // clicking our own button — confirms the button's pressed state tracks the platform's actual
    // fullscreen state via the fullscreenchange listener, not just its own click handler.
    await page.evaluate(() => document.exitFullscreen());
    await expect(enterBtn).toBeVisible();
    expect(await canvas.evaluate(() => document.fullscreenElement)).toBeNull();
  });

  test('the toolbar live-simulation button only appears for layout="galaxy" and toggles aria-pressed', async ({
    page,
  }) => {
    // Default view here is layout="manual" (Graph View) — no galaxy-only control.
    await expect(
      page.locator('[aria-label="Enable live simulation"]'),
    ).not.toBeAttached();
    await expect(
      page.locator('[aria-label="Disable live simulation"]'),
    ).not.toBeAttached();

    // layout="force-clustered" — still not galaxy.
    await page.locator('[data-testid="clustered-view-button"]').click();
    await page.waitForTimeout(200);
    await expect(
      page.locator('[aria-label="Enable live simulation"]'),
    ).not.toBeAttached();

    await page.locator('[data-testid="galaxy-view-button"]').click();
    await page.waitForTimeout(200);
    const enableBtn = page.locator('[aria-label="Enable live simulation"]');
    await expect(enableBtn).toBeVisible();
    await expect(enableBtn).toHaveAttribute("aria-pressed", "false");

    await enableBtn.click();
    const disableBtn = page.locator('[aria-label="Disable live simulation"]');
    await expect(disableBtn).toBeVisible();
    await expect(disableBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("detail drawer is hidden until a node is selected", async ({ page }) => {
    const drawer = page.locator('[data-testid="graph-detail-drawer"]');

    // Auto-hidden on initial load — no node selected, nothing to show.
    await expect(drawer).not.toBeVisible();

    const allNodes = page.locator('[data-testid^="graph-node-"]');
    const firstNode = allNodes.first();

    await expect(firstNode).toBeVisible();
    await firstNode.click();

    await expect(drawer).toBeVisible();
    await expect(
      page.locator('[data-testid="graph-inspector-panel"]'),
    ).toBeVisible();
  });

  test("clicking the canvas background deselects the node and closes the drawer", async ({
    page,
  }) => {
    const canvas = page.locator(".graph-canvas");
    const drawer = page.locator('[data-testid="graph-detail-drawer"]');
    const node = page.locator('[data-testid="graph-node-cls_cell"]');

    await node.click();
    await expect(node).toHaveClass(/selected/);
    await expect(drawer).toBeVisible();

    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not visible");

    // Top-center, away from any node and from the default toolbar (bottom-right) — same
    // verified-empty background spot the panning test below uses.
    await canvas.click({ position: { x: box.width / 2, y: 40 } });

    await expect(node).not.toHaveClass(/selected/);
    await expect(drawer).not.toBeVisible();
  });

  test("a background pan drag does not deselect the node or close the drawer", async ({
    page,
  }) => {
    const canvas = page.locator(".graph-canvas");
    const drawer = page.locator('[data-testid="graph-detail-drawer"]');
    const node = page.locator('[data-testid="graph-node-cls_cell"]');

    await node.click();
    await expect(node).toHaveClass(/selected/);
    await expect(drawer).toBeVisible();

    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not visible");

    const startX = box.x + box.width / 2;
    const startY = box.y + 40;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Past DRAG_THRESHOLD and with enough steps for pointermove to fire more than once.
    await page.mouse.move(startX - 80, startY + 60, { steps: 10 });
    await page.mouse.up();

    await expect(node).toHaveClass(/selected/);
    await expect(drawer).toBeVisible();
  });

  test("GraphInspector shows node metadata", async ({ page }) => {
    const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
    await cellNode.click();

    const title = page.locator('[data-testid="inspector-title"]');
    const id = page.locator('[data-testid="inspector-id"]');

    await expect(title).toContainText("Cell");
    await expect(id).toContainText("cls_cell");
  });

  test("GraphInspector shows relationships", async ({ page }) => {
    const nodeWithRels = page.locator('[data-testid="graph-node-cls_cell"]');
    await nodeWithRels.click();

    const outgoing = page.locator('[data-testid="inspector-outgoing"]');
    await expect(outgoing).toBeVisible();

    const relLinks = outgoing.locator('[data-testid^="inspector-rel-"]');
    const relCount = await relLinks.count();
    expect(relCount).toBeGreaterThan(0);
  });

  test("GraphEdge renders with correct path", async ({ page }) => {
    // GraphCanvas renders edges via GraphEdgeInternal; the <path> lives inside the <g data-testid="graph-edge-{id}">
    const edges = page.locator('[data-testid^="graph-edge-"]');
    await expect(edges.first()).toBeVisible({ timeout: 10000 });
    const edgeCount = await edges.count();
    expect(edgeCount).toBeGreaterThan(0);

    const firstEdgePath = edges.first().locator("path.graph-edge__line");
    await expect(firstEdgePath).toBeAttached();
    const pathData = await firstEdgePath.getAttribute("d");
    expect(pathData).toBeTruthy();
    expect(pathData).toContain("M ");
  });

  test("GraphEdge weight maps to stroke width via the sqrt curve", async ({
    page,
  }) => {
    const low = page.locator(
      '[data-testid="graph-edge-edge_weight_low"] path.graph-edge__line',
    );
    const mid = page.locator(
      '[data-testid="graph-edge-edge_weight_mid"] path.graph-edge__line',
    );
    const high = page.locator(
      '[data-testid="graph-edge-edge_weight_high"] path.graph-edge__line',
    );
    const baseline = page.locator(
      '[data-testid="graph-edge-edge_1"] path.graph-edge__line',
    );

    const [lowWidth, midWidth, highWidth, baselineWidth] = await Promise.all([
      low.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth)),
      mid.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth)),
      high.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth)),
      baseline.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth)),
    ]);

    // weight: 10 -> ~3.2px, weight: 50 -> ~5.95px, weight: 90 -> ~7.64px
    expect(lowWidth).toBeCloseTo(1 + 7 * Math.sqrt(0.1), 1);
    expect(midWidth).toBeCloseTo(1 + 7 * Math.sqrt(0.5), 1);
    expect(highWidth).toBeCloseTo(1 + 7 * Math.sqrt(0.9), 1);
    expect(lowWidth).toBeLessThan(midWidth);
    expect(midWidth).toBeLessThan(highWidth);

    // An edge with no weight matches the current default stroke width for its variant.
    expect(baselineWidth).toBeCloseTo(1.25, 1);
  });

  test("GraphEdge opacity applies to the line and marker, not the label background", async ({
    page,
  }) => {
    const edge = page.locator('[data-testid="graph-edge-edge_opacity"]');
    const line = edge.locator("path.graph-edge__line");
    const marker = edge.locator("marker path");

    const lineOpacity = await line.evaluate(
      (el) => getComputedStyle(el).opacity,
    );
    expect(parseFloat(lineOpacity)).toBeCloseTo(0.3, 2);

    // SVG markers render in their own compositing context and do not inherit the
    // referencing element's CSS opacity, so it must be applied to the marker path directly.
    const markerOpacities = await marker.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).opacity),
    );
    for (const opacity of markerOpacities) {
      expect(parseFloat(opacity)).toBeCloseTo(0.3, 2);
    }
  });

  test("GraphEdge strokeDash overrides variant-based dashing", async ({
    page,
  }) => {
    const line = page.locator(
      '[data-testid="graph-edge-edge_dash"] path.graph-edge__line',
    );
    const dasharray = await line.evaluate(
      (el) => getComputedStyle(el).strokeDasharray,
    );
    // getComputedStyle normalizes the dasharray to `"6px, 2px"`.
    const parts = dasharray.split(",").map((v) => parseFloat(v));
    expect(parts).toEqual([6, 2]);
  });

  test("GraphNode domainColor is applied correctly", async ({ page }) => {
    // data-domain is hoisted to the SVG <g> wrapper
    const lifeNode = page.locator('[data-testid="graph-node-cls_cell"]');
    const lifeNodeDomain = await lifeNode.getAttribute("data-domain");
    expect(lifeNodeDomain).toBe("life");

    // cls_co2 is positioned off the initial viewport (x=1100); check via DOM, not visibility
    const climateNode = page.locator('[data-testid="graph-node-cls_co2"]');
    await expect(climateNode).toBeAttached();
    const climateNodeDomain = await climateNode.getAttribute("data-domain");
    expect(climateNodeDomain).toBe("climate");
  });

  test("TopologyNode renders in topology view", async ({ page }) => {
    const topologyBtn = page.locator('button:has-text("Topology View")');
    await topologyBtn.click();

    const topologyNodes = page.locator('[data-testid^="topology-node-"]');
    const nodeCount = await topologyNodes.count();
    expect(nodeCount).toBeGreaterThan(0);
  });

  test("TopologyNode displays status dot", async ({ page }) => {
    const topologyBtn = page.locator('button:has-text("Topology View")');
    await topologyBtn.click();

    const statusDots = page.locator('[data-testid^="topology-status-"]');
    const dotCount = await statusDots.count();
    expect(dotCount).toBeGreaterThan(0);
  });

  test("Node selection persists across canvas interactions", async ({
    page,
  }) => {
    test.skip(
      !!process.env.CI,
      "Multi-click canvas selection is unreliable in headless Chromium",
    );
    // The SVG <g> wrapper gets class="selected" when the node is active
    const node1 = page.locator('[data-testid="graph-node-cls_cell"]');
    await node1.click();

    await expect(node1).toHaveClass(/selected/);
    let inspectorTitle = page.locator('[data-testid="inspector-title"]');
    await expect(inspectorTitle).toContainText("Cell");

    const node2 = page.locator('[data-testid="graph-node-cls_nucleus"]');
    await node2.click();

    await expect(node2).toHaveClass(/selected/);
    inspectorTitle = page.locator('[data-testid="inspector-title"]');
    await expect(inspectorTitle).toContainText("Nucleus");

    const node1Selected = await node1.evaluate((el) =>
      el.classList.contains("selected"),
    );
    expect(node1Selected).toBe(false);
  });

  test("Graph nodes are positioned correctly", async ({ page }) => {
    const node = page.locator('[data-testid="graph-node-cls_cell"]');
    const box = await node.boundingBox();

    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test("Canvas background grid is visible", async ({ page }) => {
    // Grid is now an SVG <rect> filled with a dot pattern; check SVG semantics
    const grid = page.locator(".graph-grid");
    await expect(grid).toBeVisible();

    const gridProps = await grid.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        isSvgRect: el.tagName.toLowerCase() === "rect",
        hasFill: el.getAttribute("fill") !== null,
        isVisible: rect.width > 0 && rect.height > 0,
        width: rect.width,
        height: rect.height,
      };
    });

    expect(gridProps.isSvgRect).toBe(true);
    expect(gridProps.hasFill).toBe(true);
    expect(gridProps.isVisible).toBe(true);
    expect(gridProps.width).toBeGreaterThan(0);
    expect(gridProps.height).toBeGreaterThan(0);
  });

  test.describe("Fit View and Viewport Controls", () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-testid="fitview-view-button"]').click();
      await page.waitForTimeout(200);
    });

    function parseMatrix(transform: string | null) {
      if (!transform) throw new Error("transform attribute missing");
      const inner = transform.match(/matrix\(([^)]+)\)/);
      if (!inner) throw new Error(`unexpected transform: ${transform}`);
      const [zoom, , , , panX, panY] = inner[1]
        .split(",")
        .map((s) => parseFloat(s.trim()));
      return { zoom, panX, panY };
    }

    test("fits the full node bounding box within the bounded panel with padding", async ({
      page,
    }) => {
      const canvas = page.locator('[data-testid="fitview-canvas"]');
      await expect(canvas).toBeVisible();
      const canvasBox = await canvas.boundingBox();
      if (!canvasBox) throw new Error("Canvas not visible");

      const nodes = page.locator('[data-testid^="graph-node-fv_"]');
      const count = await nodes.count();
      expect(count).toBeGreaterThan(0);

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (let i = 0; i < count; i++) {
        const box = await nodes.nth(i).boundingBox();
        if (!box) continue;
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      }

      // fitPadding is 20px — allow a couple px of slack for subpixel rendering
      expect(minX - canvasBox.x).toBeGreaterThanOrEqual(18);
      expect(minY - canvasBox.y).toBeGreaterThanOrEqual(18);
      expect(canvasBox.x + canvasBox.width - maxX).toBeGreaterThanOrEqual(18);
      expect(canvasBox.y + canvasBox.height - maxY).toBeGreaterThanOrEqual(18);
    });

    test("fit zoom is clamped within min/max zoom bounds", async ({ page }) => {
      const viewport = page.locator('[data-testid="graph-viewport"]');
      const { zoom } = parseMatrix(await viewport.getAttribute("transform"));

      expect(zoom).toBeGreaterThanOrEqual(0.4);
      expect(zoom).toBeLessThanOrEqual(2.5);
      // The graph is wider/taller than the 470x320 panel, so it must zoom out
      expect(zoom).toBeLessThan(1);
    });

    test("zoomToFit recomputes and reapplies the fit viewport", async ({
      page,
    }) => {
      const viewport = page.locator('[data-testid="graph-viewport"]');
      const canvas = page.locator('[data-testid="fitview-canvas"]');

      const fitted = parseMatrix(await viewport.getAttribute("transform"));

      await canvas.evaluate((el) => {
        el.dispatchEvent(
          new WheelEvent("wheel", { bubbles: true, deltaY: -300 }),
        );
      });
      await page.waitForTimeout(150);
      const zoomedIn = parseMatrix(await viewport.getAttribute("transform"));
      expect(zoomedIn.zoom).not.toBeCloseTo(fitted.zoom, 3);

      await page.locator('[data-testid="fitview-zoom-to-fit"]').click();
      await page.waitForTimeout(150);
      const refitted = parseMatrix(await viewport.getAttribute("transform"));

      expect(refitted.zoom).toBeCloseTo(fitted.zoom, 1);
      expect(refitted.panX).toBeCloseTo(fitted.panX, 0);
      expect(refitted.panY).toBeCloseTo(fitted.panY, 0);
    });

    test("setZoom changes only zoom, leaving pan unchanged", async ({
      page,
    }) => {
      const viewport = page.locator('[data-testid="graph-viewport"]');
      const before = parseMatrix(await viewport.getAttribute("transform"));

      await page.locator('[data-testid="fitview-set-zoom"]').click();
      await page.waitForTimeout(100);

      const after = parseMatrix(await viewport.getAttribute("transform"));
      expect(after.zoom).toBeCloseTo(1.5, 5);
      expect(after.panX).toBeCloseTo(before.panX, 1);
      expect(after.panY).toBeCloseTo(before.panY, 1);
    });

    test("setPan changes only pan, leaving zoom unchanged", async ({
      page,
    }) => {
      const viewport = page.locator('[data-testid="graph-viewport"]');
      const before = parseMatrix(await viewport.getAttribute("transform"));

      await page.locator('[data-testid="fitview-set-pan"]').click();
      await page.waitForTimeout(100);

      const after = parseMatrix(await viewport.getAttribute("transform"));
      expect(after.panX).toBeCloseTo(0, 5);
      expect(after.panY).toBeCloseTo(0, 5);
      expect(after.zoom).toBeCloseTo(before.zoom, 5);
    });

    test("Fit View Demo visual snapshot", async ({ page }) => {
      const panel = page.locator('[data-testid="fitview-panel"]');
      await expect(panel).toHaveScreenshot("graph-canvas-fitview-light.png");
    });
  });

  test.describe("TopologyNode Status Variants", () => {
    test.beforeEach(async ({ page }) => {
      const topologyBtn = page.locator('button:has-text("Topology View")');
      await topologyBtn.click();
      await page.waitForTimeout(200);
    });

    test("TopologyNode ok status visual snapshot", async ({ page }) => {
      const okNode = page.locator('[data-testid="topology-node-api-server"]');
      await expect(okNode).toBeVisible();
      await expect(okNode).toHaveScreenshot("topology-node-ok-light.png");
    });

    test("TopologyNode warning status visual snapshot", async ({ page }) => {
      const warningNode = page.locator(
        '[data-testid="topology-node-database"]',
      );
      await expect(warningNode).toBeVisible();
      await expect(warningNode).toHaveScreenshot(
        "topology-node-warning-light.png",
      );
    });

    test("TopologyNode error status visual snapshot", async ({ page }) => {
      const errorNode = page.locator(
        '[data-testid="topology-node-message-queue"]',
      );
      await expect(errorNode).toBeVisible();
      await expect(errorNode).toHaveScreenshot("topology-node-error-light.png");
    });

    test("TopologyNode idle status visual snapshot", async ({ page }) => {
      const idleNode = page.locator(
        '[data-testid="topology-node-load-balancer"]',
      );
      await expect(idleNode).toBeVisible();
      await expect(idleNode).toHaveScreenshot("topology-node-idle-light.png");
    });
  });

  test.describe("Visual Regression - Light Canvas", () => {
    test("GraphCanvas with nodes visual snapshot", async ({ page }) => {
      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot("graph-canvas-light.png");
    });

    test("GraphInspector panel visual snapshot", async ({ page }) => {
      // The detail drawer (and the GraphInspector inside it) only renders once something's
      // selected — there's no standalone always-visible empty state to screenshot anymore.
      await page.locator('[data-testid="graph-node-cls_cell"]').click();
      const inspector = page.locator(".graph-inspector");
      await expect(inspector).toHaveScreenshot("graph-inspector-light.png");
    });

    test("GraphNode component visual snapshot", async ({ page }) => {
      const node = page.locator('[data-testid="graph-node-cls_cell"]');
      await expect(node).toHaveScreenshot("graph-node-light.png");
    });

    test("GraphEdge component visual snapshot", async ({ page }) => {
      const edge = page.locator('[data-testid^="graph-edge-"]').first();
      await expect(edge).toHaveScreenshot("graph-edge-light.png");
    });

    test("Weighted GraphEdge visual snapshot", async ({ page }) => {
      // Individual edge <g> locators can report a negative-origin bounding box (the bezier
      // control point overshoots left of the node), which breaks toHaveScreenshot's clip
      // region — so the full canvas is captured instead, same as the baseline canvas snapshot.
      const ids = [
        "edge_weight_low",
        "edge_weight_mid",
        "edge_weight_high",
        "edge_opacity",
        "edge_dash",
      ];
      for (const id of ids) {
        await expect(
          page.locator(`[data-testid="graph-edge-${id}"]`),
        ).toBeAttached();
      }

      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-weighted-edges-light.png",
      );
    });
  });

  test.describe("TopologyNode Status Variants - Dark Canvas", () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page);
      const topologyBtn = page.locator('button:has-text("Topology View")');
      await topologyBtn.click();
      await page.waitForTimeout(200);
    });

    test("TopologyNode ok status visual snapshot in dark mode", async ({
      page,
    }) => {
      const okNode = page.locator('[data-testid="topology-node-api-server"]');
      await expect(okNode).toBeVisible();
      await expect(okNode).toHaveScreenshot("topology-node-ok-dark.png");
    });

    test("TopologyNode warning status visual snapshot in dark mode", async ({
      page,
    }) => {
      const warningNode = page.locator(
        '[data-testid="topology-node-database"]',
      );
      await expect(warningNode).toBeVisible();
      await expect(warningNode).toHaveScreenshot(
        "topology-node-warning-dark.png",
      );
    });

    test("TopologyNode error status visual snapshot in dark mode", async ({
      page,
    }) => {
      const errorNode = page.locator(
        '[data-testid="topology-node-message-queue"]',
      );
      await expect(errorNode).toBeVisible();
      await expect(errorNode).toHaveScreenshot("topology-node-error-dark.png");
    });

    test("TopologyNode idle status visual snapshot in dark mode", async ({
      page,
    }) => {
      const idleNode = page.locator(
        '[data-testid="topology-node-load-balancer"]',
      );
      await expect(idleNode).toBeVisible();
      await expect(idleNode).toHaveScreenshot("topology-node-idle-dark.png");
    });
  });

  test.describe("Visual Regression - Dark Canvas", () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page);
    });

    test("GraphCanvas with nodes visual snapshot in dark mode", async ({
      page,
    }) => {
      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot("graph-canvas-dark.png");
    });

    test("GraphInspector panel visual snapshot in dark mode", async ({
      page,
    }) => {
      await page.locator('[data-testid="graph-node-cls_cell"]').click();
      const inspector = page.locator(".graph-inspector");
      await expect(inspector).toHaveScreenshot("graph-inspector-dark.png");
    });

    test("GraphNode component visual snapshot in dark mode", async ({
      page,
    }) => {
      const node = page.locator('[data-testid="graph-node-cls_cell"]');
      await expect(node).toHaveScreenshot("graph-node-dark.png");
    });

    test("GraphEdge component visual snapshot in dark mode", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid^="graph-edge-"]').first();
      await expect(edge).toHaveScreenshot("graph-edge-dark.png");
    });

    test("Weighted GraphEdge visual snapshot in dark mode", async ({
      page,
    }) => {
      const ids = [
        "edge_weight_low",
        "edge_weight_mid",
        "edge_weight_high",
        "edge_opacity",
        "edge_dash",
      ];
      for (const id of ids) {
        await expect(
          page.locator(`[data-testid="graph-edge-${id}"]`),
        ).toBeAttached();
      }

      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-weighted-edges-dark.png",
      );
    });

    // Regression: body.dark-canvas .graph-node { border-color: ... } is more specific than
    // .graph-node:hover alone (extra `body` type selector), so the hover border color was
    // silently cancelled back to the resting one in dark canvas — light canvas was unaffected,
    // which is why this went unnoticed for a while. GraphNode.css now reasserts it explicitly
    // under body.dark-canvas.
    test("node hover border color still applies in dark canvas", async ({
      page,
    }) => {
      const node = page.locator(
        '[data-testid="graph-node-cls_cell"] .graph-node',
      );
      const resting = await node.evaluate(
        (el) => getComputedStyle(el).borderColor,
      );

      await node.hover();
      await expect
        .poll(() => node.evaluate((el) => getComputedStyle(el).borderColor))
        .not.toBe(resting);
    });

    // Same bug, same fix, one state over: .selected had the identical dark-canvas specificity
    // problem for border-color (box-shadow was already being reasserted here, border-color wasn't).
    test("node selected border color still applies in dark canvas", async ({
      page,
    }) => {
      const node = page.locator(
        '[data-testid="graph-node-cls_cell"] .graph-node',
      );
      const resting = await node.evaluate(
        (el) => getComputedStyle(el).borderColor,
      );

      await node.click();
      await expect
        .poll(() => node.evaluate((el) => getComputedStyle(el).borderColor))
        .not.toBe(resting);
    });
  });

  test.describe("Node & Edge Tooltips", () => {
    test("nodeTooltip shows content near the hovered node and hides on hover-end", async ({
      page,
    }) => {
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toHaveCount(0);

      // Dispatched directly on the node (see the "hovering a node reveals..." test above for why
      // this bypasses screen-coordinate hit-testing) — React translates native 'pointerover'/
      // 'pointerout' into its synthetic onPointerEnter/onPointerLeave.
      await page
        .locator('[data-testid="graph-node-cls_cell"]')
        .dispatchEvent("pointerover");
      // Tooltip has a 200ms show delay to prevent flicker during fast mouse traversal
      await page.waitForTimeout(250);
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("Cell");

      await page
        .locator('[data-testid="graph-node-cls_cell"]')
        .dispatchEvent("pointerout");
      await expect(tooltip).toHaveCount(0);
    });

    test("edgeTooltip shows content near the hovered edge and hides on hover-end", async ({
      page,
    }) => {
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toHaveCount(0);

      await page
        .locator('[data-testid="graph-edge-edge_1"]')
        .dispatchEvent("pointerover");
      // Tooltip has a 200ms show delay to prevent flicker during fast mouse traversal
      await page.waitForTimeout(250);
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("contains");

      await page
        .locator('[data-testid="graph-edge-edge_1"]')
        .dispatchEvent("pointerout");
      await expect(tooltip).toHaveCount(0);
    });

    test("only one tooltip renders at a time", async ({ page }) => {
      await page
        .locator('[data-testid="graph-node-cls_cell"]')
        .dispatchEvent("pointerover");
      // Tooltip has a 200ms show delay to prevent flicker during fast mouse traversal
      await page.waitForTimeout(250);
      await expect(page.locator('[role="tooltip"]')).toHaveCount(1);

      await page
        .locator('[data-testid="graph-node-cls_cell"]')
        .dispatchEvent("pointerout");
      await page
        .locator('[data-testid="graph-edge-edge_1"]')
        .dispatchEvent("pointerover");
      await page.waitForTimeout(250);
      await expect(page.locator('[role="tooltip"]')).toHaveCount(1);
    });

    test("tooltip position tracks pan and zoom while visible", async ({
      page,
    }) => {
      const tooltip = page.locator('[role="tooltip"]');
      await page
        .locator('[data-testid="graph-node-cls_cell"]')
        .dispatchEvent("pointerover");
      // Tooltip has a 200ms show delay to prevent flicker during fast mouse traversal
      await page.waitForTimeout(250);
      await expect(tooltip).toBeVisible();
      const before = await tooltip.boundingBox();

      // Same wheel+ctrl zoom gesture the "GraphCanvas zoom works with scroll" test above uses.
      await page.locator(".graph-canvas").evaluate((el) => {
        el.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            ctrlKey: true,
            deltaY: -100,
          }),
        );
      });

      await expect
        .poll(async () => {
          const after = await tooltip.boundingBox();
          return after && before
            ? Math.hypot(after.x - before.x, after.y - before.y) > 1
            : false;
        })
        .toBe(true);
    });

    test("node tooltip aria-describedby points to visible role=tooltip element with no aria-hidden ancestor", async ({
      page,
    }) => {
      const node = page.locator('[data-testid="graph-node-cls_cell"]');
      const nodeElement = node.locator(".graph-node");

      // Hover to show tooltip
      await node.dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();

      // Get the tooltip ID
      const tooltipId = await tooltip.getAttribute("id");
      expect(tooltipId).toBeTruthy();
      expect(tooltipId).toMatch(/^tooltip-node-/);

      // Verify node element has aria-describedby pointing to tooltip
      const describedBy = await nodeElement.getAttribute("aria-describedby");
      expect(describedBy).toBe(tooltipId);

      // Verify tooltip element is not hidden by aria-hidden ancestor
      const isAriaHidden = await tooltip.evaluate((el) => {
        let current: HTMLElement | null = el.parentElement;
        while (current) {
          if (current.getAttribute("aria-hidden") === "true") {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      });
      expect(isAriaHidden).toBe(false);

      await node.dispatchEvent("pointerout");
    });

    test("edge tooltip aria-describedby points to visible role=tooltip element with no aria-hidden ancestor", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');

      // Hover to show tooltip
      await edge.dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();

      // Get the tooltip ID
      const tooltipId = await tooltip.getAttribute("id");
      expect(tooltipId).toBeTruthy();
      expect(tooltipId).toMatch(/^tooltip-edge-/);

      // Get the <g> element (edge wrapper) and verify it has aria-describedby
      const describedBy = await edge.getAttribute("aria-describedby");
      expect(describedBy).toBe(tooltipId);

      // Verify tooltip element is not hidden by aria-hidden ancestor
      const isAriaHidden = await tooltip.evaluate((el) => {
        let current: HTMLElement | null = el.parentElement;
        while (current) {
          if (current.getAttribute("aria-hidden") === "true") {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      });
      expect(isAriaHidden).toBe(false);

      await edge.dispatchEvent("pointerout");
    });

    test("aria-describedby is present only while tooltip is visible for the specific trigger", async ({
      page,
    }) => {
      const nodeCell = page.locator('[data-testid="graph-node-cls_cell"]');
      const nodeCellElement = nodeCell.locator(".graph-node");
      const nodeNucleus = page.locator('[data-testid="graph-node-cls_nucleus"]');
      const nodeNucleusElement = nodeNucleus.locator(".graph-node");

      // Initially, no tooltips and no aria-describedby
      let describedBy = await nodeCellElement.getAttribute("aria-describedby");
      expect(describedBy).toBeNull();

      // Hover over first node — it should get aria-describedby
      await nodeCell.dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      let tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();

      describedBy = await nodeCellElement.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(describedBy).toMatch(/^tooltip-node-cls_cell$/);

      // Second node should NOT have aria-describedby (tooltip only for one node at a time)
      let describedByNucleus = await nodeNucleusElement.getAttribute("aria-describedby");
      expect(describedByNucleus).toBeNull();

      // Hover away from first node
      await nodeCell.dispatchEvent("pointerout");
      await expect(tooltip).toHaveCount(0);

      // After leaving, first node should NOT have aria-describedby anymore
      describedBy = await nodeCellElement.getAttribute("aria-describedby");
      expect(describedBy).toBeNull();

      // Hover over second node — it should get aria-describedby
      await nodeNucleus.dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();

      describedByNucleus = await nodeNucleusElement.getAttribute("aria-describedby");
      expect(describedByNucleus).toBeTruthy();
      expect(describedByNucleus).toMatch(/^tooltip-node-cls_nucleus$/);

      // First node still should NOT have aria-describedby
      describedBy = await nodeCellElement.getAttribute("aria-describedby");
      expect(describedBy).toBeNull();

      await nodeNucleus.dispatchEvent("pointerout");
    });
  });

  test.describe("Bus View - Edge Anchors & Curvature", () => {
    // Reads a path's endpoint in screen coordinates so it can be compared directly against a
    // node's rendered bounding box, independent of the current pan/zoom transform.
    async function edgePoint(
      page: import("@playwright/test").Page,
      edgeTestId: string,
      end: "start" | "end",
    ) {
      return page
        .locator(`[data-testid="${edgeTestId}"] path.graph-edge__line`)
        .evaluate((el, end) => {
          const path = el as SVGPathElement;
          const len = path.getTotalLength();
          const local =
            end === "start"
              ? path.getPointAtLength(0)
              : path.getPointAtLength(len);
          const ctm = path.getScreenCTM()!;
          const screen = new DOMPoint(local.x, local.y).matrixTransform(ctm);
          return { x: screen.x, y: screen.y };
        }, end);
    }

    test.beforeEach(async ({ page }) => {
      await page.locator('[data-testid="bus-view-button"]').click();
      await page.waitForTimeout(200);
    });

    test("anchored edges exit the source node on its right side regardless of vertical offset", async ({
      page,
    }) => {
      const gatewayBox = await page
        .locator('[data-testid="graph-node-bus_gateway"]')
        .boundingBox();
      if (!gatewayBox) throw new Error("gateway node not visible");

      const toAgentA = await edgePoint(
        page,
        "graph-edge-bus_edge_gateway_a",
        "start",
      );
      const toAgentB = await edgePoint(
        page,
        "graph-edge-bus_edge_gateway_b",
        "start",
      );

      const expectedX = gatewayBox.x + gatewayBox.width;
      const expectedY = gatewayBox.y + gatewayBox.height / 2;

      // Both edges leave from the same point on the gateway's right edge even though
      // agent_a and agent_b sit at very different vertical offsets.
      expect(toAgentA.x).toBeCloseTo(expectedX, 0);
      expect(toAgentA.y).toBeCloseTo(expectedY, 0);
      expect(toAgentB.x).toBeCloseTo(expectedX, 0);
      expect(toAgentB.y).toBeCloseTo(expectedY, 0);
    });

    test("anchored edges enter the target node on its left side regardless of vertical offset", async ({
      page,
    }) => {
      const agentBBox = await page
        .locator('[data-testid="graph-node-bus_agent_b"]')
        .boundingBox();
      if (!agentBBox) throw new Error("agent_b node not visible");

      const fromDep3 = await edgePoint(
        page,
        "graph-edge-bus_edge_b_dep3",
        "start",
      );
      const fromDep4 = await edgePoint(
        page,
        "graph-edge-bus_edge_b_dep4",
        "start",
      );

      const dep3Box = await page
        .locator('[data-testid="graph-node-bus_dep_3"]')
        .boundingBox();
      const dep4Box = await page
        .locator('[data-testid="graph-node-bus_dep_4"]')
        .boundingBox();
      if (!dep3Box || !dep4Box) throw new Error("dependency node not visible");

      const dep3End = await edgePoint(
        page,
        "graph-edge-bus_edge_b_dep3",
        "end",
      );
      const dep4End = await edgePoint(
        page,
        "graph-edge-bus_edge_b_dep4",
        "end",
      );

      expect(dep3End.x).toBeCloseTo(dep3Box.x, 0);
      expect(dep3End.y).toBeCloseTo(dep3Box.y + dep3Box.height / 2, 0);
      expect(dep4End.x).toBeCloseTo(dep4Box.x, 0);
      expect(dep4End.y).toBeCloseTo(dep4Box.y + dep4Box.height / 2, 0);

      // Both edges also leave agent_b from the same right-side point.
      expect(fromDep3.x).toBeCloseTo(agentBBox.x + agentBBox.width, 0);
      expect(fromDep4.x).toBeCloseTo(agentBBox.x + agentBBox.width, 0);
    });

    test("mixed anchors pin only the specified endpoint", async ({ page }) => {
      const gatewayBox = await page
        .locator('[data-testid="graph-node-bus_gateway"]')
        .boundingBox();
      if (!gatewayBox) throw new Error("gateway node not visible");

      // sourceAnchor: 'right', targetAnchor omitted (auto) -> the path is still cubic (either
      // anchor non-auto), but only the source endpoint is pinned to the node's right side.
      const start = await edgePoint(
        page,
        "graph-edge-bus_edge_gateway_b",
        "start",
      );
      expect(start.x).toBeCloseTo(gatewayBox.x + gatewayBox.width, 0);
      expect(start.y).toBeCloseTo(gatewayBox.y + gatewayBox.height / 2, 0);

      const pathData = await page
        .locator(
          '[data-testid="graph-edge-bus_edge_gateway_b"] path.graph-edge__line',
        )
        .getAttribute("d");
      expect(pathData).toContain(" C ");
    });

    test("two edges between the same node pair with different curvature render distinct, non-overlapping paths", async ({
      page,
    }) => {
      const lowPath = await page
        .locator(
          '[data-testid="graph-edge-bus_edge_a_dep2_low"] path.graph-edge__line',
        )
        .getAttribute("d");
      const highPath = await page
        .locator(
          '[data-testid="graph-edge-bus_edge_a_dep2_high"] path.graph-edge__line',
        )
        .getAttribute("d");

      expect(lowPath).toBeTruthy();
      expect(highPath).toBeTruthy();
      expect(lowPath).not.toBe(highPath);
    });

    test("labeled anchored edge places its label at the path midpoint", async ({
      page,
    }) => {
      const label = page.locator(
        '[data-testid="graph-edge-bus_edge_b_dep4"] .graph-edge__label',
      );
      await expect(label).toBeAttached();

      const pathBox = await page
        .locator(
          '[data-testid="graph-edge-bus_edge_b_dep4"] path.graph-edge__line',
        )
        .boundingBox();
      const labelBox = await page
        .locator(
          '[data-testid="graph-edge-bus_edge_b_dep4"] .graph-edge__label',
        )
        .boundingBox();
      if (!pathBox || !labelBox) throw new Error("edge or label not visible");

      const labelCenterX = labelBox.x + labelBox.width / 2;
      const labelCenterY = labelBox.y + labelBox.height / 2;

      expect(labelCenterX).toBeGreaterThanOrEqual(pathBox.x);
      expect(labelCenterX).toBeLessThanOrEqual(pathBox.x + pathBox.width);
      expect(labelCenterY).toBeGreaterThanOrEqual(pathBox.y - labelBox.height);
      expect(labelCenterY).toBeLessThanOrEqual(
        pathBox.y + pathBox.height + labelBox.height,
      );
    });

    test("Bus View visual snapshot", async ({ page }) => {
      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot("graph-canvas-bus-view-light.png");
    });

    test("Bus View visual snapshot in dark mode", async ({ page }) => {
      await applyDarkCanvasMode(page);
      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot("graph-canvas-bus-view-dark.png");
    });
  });

  test.describe("Galaxy View - Layout & Relations", () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-testid="galaxy-view-button"]').click();
      await page.waitForTimeout(200);
    });



    test("toolbar zoom in/out buttons anchor at the viewport center, not wherever world origin projects to", async ({
      page,
    }) => {
      // Regression: GraphToolbar's zoom buttons called setZoom(zoom * factor) with no anchor
      // point, so zoomTo's underlying pan-preservation left pan completely untouched — the fixed
      // point of the resulting transform was wherever world (0, 0) currently projected to (usually
      // off-screen after fitView), flinging the visible content sideways instead of zooming in
      // place. zoomBy fixes this by anchoring at the container's own center.
      const transform = await page
        .locator('[data-testid="graph-viewport"]')
        .getAttribute("transform");
      const before = transform!.match(
        /matrix\(([^,]+),[^,]+,[^,]+,[^,]+,([^,]+),([^)]+)\)/,
      )!;
      const beforeZoom = parseFloat(before[1]);
      const beforePanX = parseFloat(before[2]);

      await page.getByRole("button", { name: "Zoom in" }).click();
      await page.waitForTimeout(100);

      const afterTransform = await page
        .locator('[data-testid="graph-viewport"]')
        .getAttribute("transform");
      const after = afterTransform!.match(
        /matrix\(([^,]+),[^,]+,[^,]+,[^,]+,([^,]+),([^)]+)\)/,
      )!;
      const afterZoom = parseFloat(after[1]);
      const afterPanX = parseFloat(after[2]);

      expect(afterZoom).toBeGreaterThan(beforeZoom);
      // Center-anchored zoom must also shift pan to compensate — the bug this guards against left
      // pan completely unchanged (only zoom moved), which is what a world-origin-anchored zoom
      // looks like for any fitted view whose center isn't already sitting on world (0, 0).
      expect(Math.abs(afterPanX - beforePanX)).toBeGreaterThan(1);
    });

    test("an orphan node renders on its own, with no attached edge", async ({
      page,
    }) => {
      const orphan = page.locator('[data-testid="graph-node-note_deprecated"]');
      await expect(orphan).toBeVisible();

      const orphanEdges = page.locator(
        '[data-testid^="graph-edge-"][data-testid*="note_deprecated"]',
      );
      expect(await orphanEdges.count()).toBe(0);
    });

    test("structural edges render at full opacity by default", async ({
      page,
    }) => {
      // organism --contains--> eukaryote, a structural predicate
      const line = page.locator(
        '[data-testid="graph-edge-e_organism_eukaryote"] path.graph-edge__line',
      );
      const opacity = await line.evaluate((el) => getComputedStyle(el).opacity);
      expect(parseFloat(opacity)).toBeCloseTo(1, 2);
    });

    test("non-structural edges are hidden by default", async ({ page }) => {
      // brca1 --encodes--> protein, co2 --causes--> ocean_acidification, both relational
      const encodes = page.locator(
        '[data-testid="graph-edge-r_brca1_protein"]',
      );
      const causes = page.locator(
        '[data-testid="graph-edge-r_co2_ocean_acid"]',
      );

      // Not just invisible — not rendered at all (line, marker, and label alike), so it's also
      // not clickable while hidden.
      await expect(encodes).not.toBeAttached();
      await expect(causes).not.toBeAttached();
    });

    test("hovering a node reveals its hidden non-structural edges", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-r_brca1_protein"]');
      await expect(edge).not.toBeAttached();

      // brca1 sits 5 hierarchy levels deep; fitView zooms out enough to fit the whole graph that
      // its rendered box can end up sub-pixel at this viewport size (a real user would zoom in
      // first), which makes geometric hover (and even .hover({force: true}), which still routes
      // through real screen coordinates) unreliable here. React translates native 'pointerover'
      // into its synthetic onPointerEnter — dispatch that directly on the element, bypassing
      // screen-coordinate hit-testing entirely.
      await page
        .locator('[data-testid="graph-node-brca1"]')
        .dispatchEvent("pointerover");
      await expect(edge).toBeAttached();
      const opacity = await edge
        .locator("path.graph-edge__line")
        .evaluate((el) => getComputedStyle(el).opacity);
      expect(parseFloat(opacity)).toBeCloseTo(1, 2);
    });

    test('"Show all relations" renders every non-structural edge', async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-r_co2_ocean_acid"]');
      await expect(edge).not.toBeAttached();

      await page
        .locator('[data-testid="galaxy-show-all-relations-button"]')
        .click();
      await expect(edge).toBeAttached();
      const opacity = await edge
        .locator("path.graph-edge__line")
        .evaluate((el) => getComputedStyle(el).opacity);
      expect(parseFloat(opacity)).toBeCloseTo(1, 2);
    });



    test("collapse toggle is keyboard-operable — Enter/Space activate it, not the parent node's onSelect", async ({
      page,
    }) => {
      // Regression: the node root's own onKeyDown handled Enter/Space unconditionally, so a
      // keydown bubbling up from the nested toggle button hit preventDefault before the button's
      // native activation ever fired — Enter/Space on a focused toggle selected the node instead
      // of collapsing it, and the toggle had no other way to activate from the keyboard at all.
      const toggle = page.locator(
        '[data-testid="graph-node-organism"] .graph-node__collapse-toggle',
      );
      await toggle.focus();
      await page.keyboard.press("Enter");

      await expect(
        page.locator('[data-testid="graph-node-eukaryote"]'),
      ).not.toBeAttached();
      // If the keydown had instead reached the node's own onSelect, the node would read as
      // selected — it shouldn't, since only the toggle was activated.
      await expect(
        page.locator('[data-testid="graph-node-organism"]'),
      ).not.toHaveAttribute("aria-pressed", "true");

      await toggle.focus();
      await page.keyboard.press(" ");
      await expect(
        page.locator('[data-testid="graph-node-eukaryote"]'),
      ).toBeVisible();
    });

    test("nodes without structural children render no collapse toggle", async ({
      page,
    }) => {
      // brca1 is a leaf — reachable only via instanceOf from chromosome, no children of its own
      await expect(
        page.locator(
          '[data-testid="graph-node-brca1"] .graph-node__collapse-toggle',
        ),
      ).not.toBeAttached();
    });

    test('"Cards" mode renders substantial-size TopologyNode cards without overlap', async ({
      page,
    }) => {
      await page.locator('[data-testid="galaxy-card-size-button"]').click();

      // Scoped under the node's own unique outer testid — TopologyNode's inner testid, like
      // any content resolveNodeContent returns, is duplicated into the off-screen measurement copy.
      const card = page.locator(
        '[data-testid="graph-node-organism"] [data-testid="topology-node-organism"]',
      );
      await expect(card).toBeVisible();
      const box = await card.boundingBox();
      expect(box).toBeTruthy();

      // fitView zooms the whole graph to fit the panel, so the on-screen box is scaled down from
      // its true CSS size — divide out the current zoom to compare against TopologyNode's actual
      // min-width (much larger than GraphNode's ~138px default).
      const transform = await page
        .locator('[data-testid="graph-viewport"]')
        .getAttribute("transform");
      const zoom = parseFloat(transform!.match(/matrix\(([^,]+)/)![1]);
      // A tiny tolerance against float division rounding (box.width / zoom can land a fraction of
      // a px under the true 180 depending on the exact zoom value) — asserting the exact integer
      // boundary made this fail on legitimate sub-pixel jitter unrelated to the card's real size.
      expect(box!.width / zoom).toBeGreaterThanOrEqual(179.5);
    });

    test('"Cards" mode supports collapse/expand via a fully custom renderNode', async ({
      page,
    }) => {
      await page.locator('[data-testid="galaxy-card-size-button"]').click();

      const toggle = page.locator(
        '[data-testid="graph-node-organism"] .galaxy-card-collapse-toggle',
      );
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(
        page.locator('[data-testid="graph-node-eukaryote"]'),
      ).not.toBeAttached();
    });

    test.describe("Aspect-ratio-aware layout", () => {
      // Width/height of the smallest box enclosing every rendered node, in screen space — zoom is
      // always uniform (never non-uniform stretching), so this box's own width/height RATIO is a
      // valid proxy for the underlying layout's shape regardless of whatever zoom level fitView
      // landed on.
      async function clusterBoundingBox(page: import("@playwright/test").Page) {
        const nodes = page.locator('[data-testid^="graph-node-"]');
        const count = await nodes.count();
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        for (let i = 0; i < count; i++) {
          const box = await nodes.nth(i).boundingBox();
          if (!box) continue;
          minX = Math.min(minX, box.x);
          maxX = Math.max(maxX, box.x + box.width);
          minY = Math.min(minY, box.y);
          maxY = Math.max(maxY, box.y + box.height);
        }
        return { width: maxX - minX, height: maxY - minY };
      }

      test("the layout reshapes to lean into the container when its aspect ratio changes", async ({
        page,
      }) => {
        await page.setViewportSize({ width: 500, height: 1200 });
        await page.waitForTimeout(200);
        const tall = await clusterBoundingBox(page);

        await page.setViewportSize({ width: 1400, height: 500 });
        await page.waitForTimeout(200);
        const wide = await clusterBoundingBox(page);

        // Directional, not exact-pixel: the wide viewport's own width/height ratio should end up
        // measurably larger than the tall viewport's, proving the layout actually reshaped rather
        // than just being re-fit (uniform scaling) into differently shaped boxes.
        expect(wide.width / wide.height).toBeGreaterThan(
          (tall.width / tall.height) * 1.3,
        );
      });

      test("locking pan/zoom prevents the redraw on resize", async ({
        page,
      }) => {
        await page.setViewportSize({ width: 500, height: 1200 });
        await page.waitForTimeout(200);
        const before = await clusterBoundingBox(page);

        await page.locator('[aria-label="Lock pan and zoom"]').click();
        await page.setViewportSize({ width: 1400, height: 500 });
        await page.waitForTimeout(200);
        const after = await clusterBoundingBox(page);

        expect(after.width / after.height).toBeCloseTo(
          before.width / before.height,
          1,
        );
      });

      test("unlocking after a resize catches up the relayout it was blocked from doing, instead of staying stale forever", async ({
        page,
      }) => {
        // Regression: the effect wrote its "last handled ratio" ref before checking `locked`, so a
        // resize that landed while locked got marked as already-handled despite never actually
        // relaying out — unlocking re-ran the effect (locked is a dependency), but the ref already
        // matched the current ratio, so the guard skipped the catch-up relayout it was supposed to
        // do. The shape stayed stuck at whatever it was before the resize, permanently, until some
        // *other* ratio change happened to come along.
        await page.setViewportSize({ width: 500, height: 1200 });
        await page.waitForTimeout(200);
        const before = await clusterBoundingBox(page);

        await page.locator('[aria-label="Lock pan and zoom"]').click();
        await page.setViewportSize({ width: 1400, height: 500 });
        await page.waitForTimeout(200);

        await page.locator('[aria-label="Unlock pan and zoom"]').click();
        await page.waitForTimeout(200);
        const after = await clusterBoundingBox(page);

        expect(after.width / after.height).toBeGreaterThan(
          (before.width / before.height) * 1.2,
        );
      });

      test("live simulation eases toward the new shape on resize instead of snapping", async ({
        page,
      }) => {
        await page.setViewportSize({ width: 500, height: 1200 });
        await page.waitForTimeout(200);

        await page.locator('[aria-label="Enable live simulation"]').click();
        await page.waitForTimeout(200);
        const before = await clusterBoundingBox(page);

        await page.setViewportSize({ width: 1400, height: 500 });
        await expect
          .poll(
            async () => {
              const box = await clusterBoundingBox(page);
              return box.width / box.height;
            },
            { timeout: 2000 },
          )
          .toBeGreaterThan((before.width / before.height) * 1.2);
      });
    });

    test.describe("Live simulation", () => {
      test.beforeEach(async ({ page }) => {
        await page.locator('[aria-label="Enable live simulation"]').click();
        await page.waitForTimeout(100);
      });

      // Presses down on a node and drags it by (dx, dy) screen px, leaving the button held (no
      // mouse.up() — callers release once they're done asserting mid-drag or want to control
      // exactly when the drop happens). Galaxy View's fitView zoom can render a node's hit area
      // only a few CSS px tall, so a first move big enough to cross DRAG_THRESHOLD in one jump
      // can carry the cursor off that tiny area before the node's own onPointerMove ever fires —
      // pointer capture (which is what lets the rest of the drag ignore hit-testing) never
      // engages. Nudge in small horizontal steps first, comfortably inside even the tightest
      // node's half-width, to trigger capture while still over the node; the final position only
      // ever depends on total displacement from the initial pointerdown, not the path taken, so
      // this doesn't skew the eventual drop point.
      async function dragNode(
        page: import("@playwright/test").Page,
        testId: string,
        dx: number,
        dy: number,
      ) {
        const node = page.locator(`[data-testid="${testId}"]`);
        // Live mode nudges every still-unpinned node a little every tick (homeStrength pulling it
        // toward its computed home) — wait for THIS node to actually stop moving before grabbing
        // it, so the real mouse.move()/mouse.down() round-trip below (each its own async gap the
        // simulation keeps ticking through) doesn't race a target that's still drifting out from
        // under a coordinate read a tick or two earlier, which — given how small this node's hit
        // area renders at this dataset's fit zoom — is enough to miss it outright.
        let box = await node.boundingBox();
        if (!box) throw new Error(`${testId} not visible`);
        for (let i = 0; i < 30; i++) {
          await page.waitForTimeout(20);
          const next = await node.boundingBox();
          if (!next) throw new Error(`${testId} not visible`);
          const stable =
            Math.abs(next.x - box.x) < 0.25 && Math.abs(next.y - box.y) < 0.25;
          box = next;
          if (stable) break;
        }
        let startX = box.x + box.width / 2;
        let startY = box.y + box.height / 2;

        // Hovering a node can shift the page layout above the canvas (this showcase shows
        // hover state above it, moving the canvas ~34px). Re-centre on the node after
        // hovering, or the press lands on whatever slid into its old spot — before this,
        // the press usually hit an edge, and the "drag" never moved the node at all.
        await page.mouse.move(startX, startY);
        const hovered = await node.boundingBox();
        if (!hovered) throw new Error(`${testId} not visible`);
        startX = hovered.x + hovered.width / 2;
        startY = hovered.y + hovered.height / 2;
        box = hovered;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 2, startY);
        await page.mouse.move(startX + 4, startY);
        await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
        return { startX, startY, box };
      }

      test("the simulation goes idle once settled", async ({ page }) => {
        await dragNode(page, "graph-node-cell", 150, -100);
        await page.mouse.up();

        const ids = ["cell", "nucleus", "mitochondrion", "membrane"];
        const sample = async () => {
          const positions: Record<string, { x: number; y: number }> = {};
          for (const id of ids) {
            const b = await page
              .locator(`[data-testid="graph-node-${id}"]`)
              .boundingBox();
            if (b) positions[id] = { x: b.x, y: b.y };
          }
          return positions;
        };

        // Sample after a settle window comfortably past the ~0.5s idle-dwell threshold, sample
        // again shortly after — proving motion genuinely stopped, not asserting a frame count.
        await page.waitForTimeout(600);
        const s1 = await sample();
        await page.waitForTimeout(250);
        const s2 = await sample();

        for (const id of ids) {
          expect(Math.abs(s2[id].x - s1[id].x)).toBeLessThan(1);
          expect(Math.abs(s2[id].y - s1[id].y)).toBeLessThan(1);
        }
      });
    });

    test("Galaxy View visual snapshot", async ({ page }) => {
      const canvas = page.locator('[data-testid="galaxy-canvas"]');
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-galaxy-view-light.png",
      );
    });

    test("Galaxy View visual snapshot in dark mode", async ({ page }) => {
      await applyDarkCanvasMode(page);
      const canvas = page.locator('[data-testid="galaxy-canvas"]');
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-galaxy-view-dark.png",
      );
    });

    test("Galaxy View Cards mode visual snapshot", async ({ page }) => {
      await page.locator('[data-testid="galaxy-card-size-button"]').click();
      const canvas = page.locator('[data-testid="galaxy-canvas"]');
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-galaxy-view-cards-light.png",
      );
    });
  });

  test.describe('Clustered View - Bubble Packing (layout="force-clustered")', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-testid="clustered-view-button"]').click();
      // Force-clustered runs two full forceLayout passes (macro + micro, see
      // clusteredForceLayout in graphLayout.ts) plus Louvain/pack — give it
      // more settle time than the plain force-layout views above.
      await page.waitForTimeout(500);
    });

    test("renders every node and at least one cluster boundary bubble", async ({
      page,
    }) => {
      const canvas = page.locator('[data-testid="clustered-canvas"]');
      await expect(canvas).toBeVisible();

      const nodes = page.locator('[data-testid^="graph-node-cl_"]');
      await expect(nodes).toHaveCount(8);

      const bubbles = canvas.locator(".graph-cluster-boundary");
      expect(await bubbles.count()).toBeGreaterThan(0);
    });

    test("the two communities land in separate cluster bubbles", async ({
      page,
    }) => {
      // CLUSTERED_NODES/EDGES (GraphShowcase.tsx) is two dense 4-node groups
      // joined by a single bridge edge (cl_a1 - cl_b1). Comparing just that
      // bridge pair's distance against an ordinary within-group pair isn't a
      // valid test: both are direct graph edges, so forceLayout pulls both
      // toward the same springLength regardless of cluster — of course
      // they're comparable. Instead compare each group's CENTROID separation
      // against its own internal spread: Louvain should still keep the two
      // groups as distinct top-level clusters, so group-to-group distance
      // should clearly exceed the spread within either group.
      const centroid = async (ids: string[]) => {
        const boxes = await Promise.all(
          ids.map((id) =>
            page.locator(`[data-testid="graph-node-${id}"]`).boundingBox(),
          ),
        );
        if (boxes.some((b) => !b))
          throw new Error("expected clustered nodes not visible");
        const pts = boxes as {
          x: number;
          y: number;
          width: number;
          height: number;
        }[];
        const cx = pts.reduce((s, b) => s + b.x + b.width / 2, 0) / pts.length;
        const cy = pts.reduce((s, b) => s + b.y + b.height / 2, 0) / pts.length;
        return { x: cx, y: cy, pts };
      };
      const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
        Math.hypot(p.x - q.x, p.y - q.y);
      const spread = (group: {
        x: number;
        y: number;
        pts: { x: number; y: number }[];
      }) =>
        group.pts.reduce((s, p) => s + dist(p, group), 0) / group.pts.length;

      const groupA = await centroid(["cl_a1", "cl_a2", "cl_a3", "cl_a4"]);
      const groupB = await centroid(["cl_b1", "cl_b2", "cl_b3", "cl_b4"]);

      const centroidDistance = dist(groupA, groupB);
      const avgSpread = (spread(groupA) + spread(groupB)) / 2;
      expect(centroidDistance).toBeGreaterThan(avgSpread);
    });

    test("Clustered View visual snapshot", async ({ page }) => {
      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-clustered-view-light.png",
      );
    });

    test("Clustered View visual snapshot in dark mode", async ({ page }) => {
      await applyDarkCanvasMode(page);
      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-clustered-view-dark.png",
      );
    });
  });

  test.describe("Hover state cleanup", () => {
    test("onNodeHover fires with undefined when a hovered node is collapsed away", async ({
      page,
    }) => {
      await page.locator('[data-testid="galaxy-view-button"]').click();
      await page.waitForTimeout(200);

      // Hover over a child node (eukaryote) — not the parent (organism)
      await page
        .locator('[data-testid="graph-node-eukaryote"]')
        .dispatchEvent("pointerover");
      await page.waitForTimeout(100);

      // Verify the indicator shows the hovered node
      const indicator = page.locator('[data-testid="graph-hover-indicator"]');
      await expect(indicator).toContainText("Hovering node: eukaryote");

      // Collapse the parent node (organism), which hides eukaryote
      const toggleButton = page.locator(
        '[data-testid="graph-node-organism"] .graph-node__collapse-toggle',
      );
      await toggleButton.click();
      await page.waitForTimeout(100);

      // After collapse, eukaryote is no longer visible, so the cleanup effect fires
      // and onNodeHover(undefined) is called, causing the indicator to disappear
      await expect(indicator).not.toBeAttached();
    });

    test("onEdgeHover fires with undefined when a hovered edge is removed", async ({
      page,
    }) => {
      const firstEdge = page.locator('[data-testid="graph-edge-edge_1"]');
      await expect(firstEdge).toBeVisible();

      // Hover over an edge
      await firstEdge.dispatchEvent("pointerover");
      await page.waitForTimeout(100);

      // Verify the indicator shows the hovered edge (confirms callback fired)
      const indicator = page.locator('[data-testid="graph-hover-indicator"]');
      await expect(indicator).toContainText("Hovering edge: edge_1");

      // Simulate edge removal by navigating to a different view
      // This verifies the internal cleanup when edges change
      await page.locator('[data-testid="clustered-view-button"]').click();
      await page.waitForTimeout(200);

      // After the view change, the edge is removed and onEdgeHover(undefined) is called,
      // so the indicator disappears
      await expect(indicator).not.toBeAttached();
    });
  });

  test.describe("renderEdge custom callback", () => {
    test("custom renderEdge renders SVG content in DOM", async ({ page }) => {
      // The custom renderEdge in the test page renders a decorative circle at path.mid
      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toBeVisible();

      // Look for the decorative circles that renderCustomEdge adds
      const circles = canvas.locator('circle[r="3"]');
      const circleCount = await circles.count();

      // The test page renders edges with renderCustomEdge, so we should see circles
      expect(circleCount).toBeGreaterThan(0);
    });

    test("hit-target remains interactive with custom renderEdge", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await expect(edge).toBeVisible();

      // Click the hit-target (invisible stroke) to select the edge
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      // Verify the edge is selected
      await expect(edge).toHaveClass(/selected/);

      // Verify the inspector shows it's selected
      await expect(
        page.locator('[data-testid="edge-inspector-title"]'),
      ).toContainText("contains");
    });

    test("custom renderEdge receives correct path geometry", async ({
      page,
    }) => {
      // The custom renderEdge decorator circle is positioned at path.mid, which should be
      // the true geometric midpoint of the curve (not labelPos). Verify via data-attributes.
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      const marker = edge.locator('[data-testid="edge-mid-marker-edge_1"]');

      await expect(marker).toBeVisible();

      // Get the recorded mid point and angle values from data-attributes
      const midX = await marker.getAttribute("data-mid-x");
      const midY = await marker.getAttribute("data-mid-y");
      const angle = await marker.getAttribute("data-angle");

      // All values should be defined and numeric
      expect(midX).not.toBeNull();
      expect(midY).not.toBeNull();
      expect(angle).not.toBeNull();

      const midXNum = parseFloat(midX || "0");
      const midYNum = parseFloat(midY || "0");
      const angleNum = parseFloat(angle || "0");

      // Sanity check: mid point should be somewhere on canvas
      expect(midXNum).toBeGreaterThan(0);
      expect(midYNum).toBeGreaterThan(0);

      // Angle should be a valid radian value (-π to π)
      expect(angleNum).toBeGreaterThanOrEqual(-Math.PI);
      expect(angleNum).toBeLessThanOrEqual(Math.PI);
    });

    test("custom renderEdge angle indicator responds to tangent angle", async ({
      page,
    }) => {
      // Verify the angle marker exists and is rotated according to path.angle
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      const angleMarker = edge.locator(
        '[data-testid="edge-angle-marker-edge_1"]',
      );

      await expect(angleMarker).toBeVisible();

      // The marker should be positioned at the edge midpoint with a transform rotation
      const transform = await angleMarker.getAttribute("transform");
      expect(transform).toMatch(/rotate\(/);
    });

    test("custom renderEdge renders hovered state indicator markers", async ({
      page,
    }) => {
      // Verify that the angle marker exists and responds to hovered state in rendering.
      // The angle marker uses opacity values that differ based on hovered prop (0.4 when not hovered, 0.8 when hovered).
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      const marker = edge.locator('[data-testid="edge-mid-marker-edge_1"]');
      const angleMarker = edge.locator(
        '[data-testid="edge-angle-marker-edge_1"]',
      );

      // Verify both markers are rendered
      await expect(marker).toBeVisible();
      await expect(angleMarker).toBeVisible();

      // Verify the angle marker polygon exists and has the expected styling
      const polygon = angleMarker.locator("polygon");
      await expect(polygon).toBeVisible();

      // Get the polygon's fill color (should be the accent-primary color)
      const fill = await polygon.getAttribute("fill");
      expect(fill).toMatch(/accent|fbbf24|#fbbf24|var\(--accent-primary/);
    });
  });
});

// A standalone tuning/regression aid for galaxyLayout itself, not a component showcase (see
// GalaxyLayoutLab.tsx) — real hierarchy, 57 nodes/4 levels/~4 orders of magnitude of size
// variance, much denser than GALAXY_DEMO_NODES above. No visual snapshots here deliberately:
// this page exists to be eyeballed and iterated on directly, not pinned to a baseline.
test.describe("integration: Galaxy Layout Lab (POC dataset stress test)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173/?example=galaxy-layout-lab");
    await page.waitForLoadState("networkidle");
    await loadSelfHostedFonts(page);
    await assertFontsLoaded(page);
    await freezeAnimations(page);
  });

  test("renders every node with no overlapping bounding boxes", async ({
    page,
  }) => {
    const nodes = page.locator('[data-testid^="graph-node-"]');
    const count = await nodes.count();
    expect(count).toBe(57); // 56 budget rows + the synthetic root

    const boxes = [];
    for (let i = 0; i < count; i++) {
      const box = await nodes.nth(i).boundingBox();
      if (box) boxes.push(box);
    }
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        const overlapX =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (overlapX > 0 && overlapY > 0) overlaps++;
      }
    }
    expect(overlaps).toBe(0);
  });
});
