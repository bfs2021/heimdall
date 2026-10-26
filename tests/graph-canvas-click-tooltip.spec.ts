import { test, expect } from "@playwright/test";
import {
  freezeAnimations,
  loadSelfHostedFonts,
  assertFontsLoaded,
  applyDarkCanvasMode,
  removeDarkCanvasMode,
} from "./utils/test-helpers";

test.describe("integration: GraphCanvas Click-Triggered Tooltips", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173/?example=graph");
    await page.waitForLoadState("networkidle");

    // Load self-hosted fonts
    await loadSelfHostedFonts(page);

    // Verify fonts are loaded
    await assertFontsLoaded(page);

    // Freeze animations for consistent snapshots
    await freezeAnimations(page);

    // Navigate to click-tooltip mode
    await page.locator('[data-testid="click-tooltip-view-button"]').click();
    await page.waitForTimeout(100);
  });

  test.afterEach(async ({ page }) => {
    // Ensure we exit dark canvas mode after each test
    await removeDarkCanvasMode(page);
  });

  test.describe("Node Click-Triggered Tooltip", () => {
    test("nodeTooltipTrigger='click' renders tooltip as popover when node is clicked", async ({
      page,
    }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await expect(cellNode).toBeVisible();

      // Initially, no popover should be visible
      const popover = page.locator('[role="dialog"]');
      await expect(popover).toHaveCount(0);

      // Click the node to open the popover
      await cellNode.click();

      // Popover should now be visible with tooltip content
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("Cell");
      await expect(popover).toContainText("Basic unit of life");
    });

    test("nodeTooltipTrigger='click' does not show tooltip on hover", async ({
      page,
    }) => {
      const nucleusNode = page.locator(
        '[data-testid="graph-node-cls_nucleus"]',
      );

      // Hover over the node (shouldn't show tooltip in click mode)
      await nucleusNode.dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      // No tooltip or popover should be visible
      const tooltip = page.locator('[role="tooltip"]');
      const popover = page.locator('[role="dialog"]');
      await expect(tooltip).toHaveCount(0);
      await expect(popover).toHaveCount(0);

      // Move away
      await nucleusNode.dispatchEvent("pointerout");
    });

    test("nodeTooltipTrigger='click' popover closes when Escape key is pressed", async ({
      page,
    }) => {
      // Plain-text tooltip content has nothing focusable, so focus stays on the node and
      // Escape has to be handled by the canvas rather than the popover panel.
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();
      await expect(cellNode.locator(".graph-node")).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);
    });

    test("nodeTooltipTrigger='click' popover closes when clicking canvas background", async ({
      page,
    }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();

      // Click on empty canvas background
      const canvas = page.locator(".graph-canvas");
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Canvas not visible");

      await canvas.click({ position: { x: box.width / 2, y: 40 } });

      // Popover should hide
      await expect(popover).not.toBeVisible();
    });

    test("nodeTooltipTrigger='click' popover position tracks pan/zoom", async ({
      page,
    }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();
      const before = await popover.boundingBox();
      expect(before).not.toBeNull();

      // Zoom the canvas
      await page.locator(".graph-canvas").evaluate((el) => {
        el.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            ctrlKey: true,
            deltaY: -100,
          }),
        );
      });

      // Wheel zoom is applied on the next animation frame, so poll for the move.
      await expect(popover).toBeVisible();
      await expect
        .poll(async () => {
          const after = await popover.boundingBox();
          return after && before
            ? Math.abs(after.x - before.x) + Math.abs(after.y - before.y)
            : 0;
        })
        .toBeGreaterThan(1);
    });
  });

  test.describe("Edge Click-Triggered Tooltip", () => {
    test("edgeTooltipTrigger='click' renders tooltip as popover when edge is clicked", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await expect(edge).toBeVisible();

      // Initially, no popover should be visible
      const popover = page.locator('[role="dialog"]');
      await expect(popover).toHaveCount(0);

      // Click the edge to open the popover
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      // Popover should now be visible with tooltip content
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("contains");
      await expect(popover).toContainText("cls_cell");
      await expect(popover).toContainText("cls_nucleus");
    });

    test("edgeTooltipTrigger='click' does not show tooltip on hover", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');

      // Hover over the edge (shouldn't show tooltip in click mode)
      await edge.dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      // No tooltip or popover should be visible
      const tooltip = page.locator('[role="tooltip"]');
      const popover = page.locator('[role="dialog"]');
      await expect(tooltip).toHaveCount(0);
      await expect(popover).toHaveCount(0);

      // Move away
      await edge.dispatchEvent("pointerout");
    });

    test("edgeTooltipTrigger='click' popover closes when Escape key is pressed", async ({
      page,
    }) => {
      // Keyboard flow: open from the focused edge with Enter, close with Escape. The content has
      // nothing focusable, so focus stays on the edge throughout.
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.focus();
      await page.keyboard.press("Enter");

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();
      await expect(edge).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);
      await expect(edge).toBeFocused();
    });

    test("edgeTooltipTrigger='click' popover displays weight when present", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_weight_low"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("Weight: 10");
    });

    test("edgeTooltipTrigger='click' popover position tracks pan/zoom", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();
      const before = await popover.boundingBox();
      expect(before).not.toBeNull();

      // Zoom the canvas significantly
      await page.locator(".graph-canvas").evaluate((el) => {
        el.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            ctrlKey: true,
            deltaY: -500,
          }),
        );
      });

      // Wheel zoom is applied on the next animation frame, so poll for the move.
      await expect(popover).toBeVisible();
      await expect
        .poll(async () => {
          const after = await popover.boundingBox();
          return after && before
            ? Math.abs(after.x - before.x) + Math.abs(after.y - before.y)
            : 0;
        })
        .toBeGreaterThan(1);
    });

    test("edgeTooltipTrigger='click' popover closes when clicking canvas background", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();

      // Click on empty canvas background
      const canvas = page.locator(".graph-canvas");
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Canvas not visible");

      await canvas.click({ position: { x: box.width / 2, y: 40 } });

      // Popover should hide
      await expect(popover).not.toBeVisible();
    });
  });

  test.describe("Node and Edge Click Interaction", () => {
    test("clicking a node closes edge popover and opens node popover", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      const node = page.locator('[data-testid="graph-node-cls_cell"]');

      // Click edge to open popover
      await edge.locator(".graph-edge__hit").dispatchEvent("click");
      let popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("contains");

      // Click node
      await node.click();

      // Edge popover should hide, node popover should show
      popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("Cell");
      await expect(popover).not.toContainText("contains");
    });

    test("clicking an edge closes node popover and opens edge popover", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      const node = page.locator('[data-testid="graph-node-cls_cell"]');

      // Click node to open popover
      await node.click();
      let popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("Cell");

      // Click edge
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      // Node popover should hide, edge popover should show
      popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("contains");
      await expect(popover).not.toContainText("Cell");
    });
  });

  test.describe("Accessibility - Click Tooltips", () => {
    test("nodeTooltipTrigger='click' popover has accessible aria-label", async ({
      page,
    }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popoverPanel = page.locator('[role="dialog"]');
      await expect(popoverPanel).toBeVisible();

      // Verify aria-label contains the node ID
      const ariaLabel = await popoverPanel.getAttribute("aria-label");
      expect(ariaLabel).toContain("cls_cell");
      expect(ariaLabel).toContain("Details for");
    });

    test("edgeTooltipTrigger='click' popover has accessible aria-label", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popoverPanel = page.locator('[role="dialog"]');
      await expect(popoverPanel).toBeVisible();

      // Verify aria-label contains the edge ID
      const ariaLabel = await popoverPanel.getAttribute("aria-label");
      expect(ariaLabel).toContain("edge_1");
      expect(ariaLabel).toContain("Details for");
    });
  });

  test.describe("Fallback Logic Verification", () => {
    test("nodeTooltipTrigger='click' without nodePopover uses nodeTooltip content", async ({
      page,
    }) => {
      // Verify that the click-tooltip mode does NOT have nodePopover
      // The popover should render the tooltip content via the fallback
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();

      // Should contain tooltip content (title and description)
      await expect(popover).toContainText("Cell");
      await expect(popover).toContainText("Basic unit of life");

      // Should NOT contain popover-specific elements (like action buttons from nodePopover)
      // The GraphShowcase click-tooltip mode uses simple tooltip content
      const buttons = popover.locator("button");
      await expect(buttons).toHaveCount(0);
    });

    test("edgeTooltipTrigger='click' without edgePopover uses edgeTooltip content", async ({
      page,
    }) => {
      // Verify that the click-tooltip mode does NOT have edgePopover
      // The popover should render the tooltip content via the fallback
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();

      // Should contain tooltip content (label and source/target)
      await expect(popover).toContainText("contains");
      await expect(popover).toContainText("cls_cell");
      await expect(popover).toContainText("cls_nucleus");

      // Should NOT contain popover-specific elements (like action buttons from edgePopover)
      const buttons = popover.locator("button");
      await expect(buttons).toHaveCount(0);
    });
  });

  test.describe("Visual Regression - Light Canvas", () => {
    test("nodeTooltipTrigger='click' popover visual snapshot", async ({
      page,
    }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();

      // Move mouse far away to clear any hover state
      await page.mouse.move(2000, 2000);
      await page.waitForTimeout(100);

      const canvas = page.locator('[data-testid="click-tooltip-canvas"]');
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-click-tooltip-node-light.png",
      );
    });

    test("edgeTooltipTrigger='click' popover visual snapshot", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();

      // Move mouse far away to clear any hover state
      await page.mouse.move(2000, 2000);
      await page.waitForTimeout(100);

      const canvas = page.locator('[data-testid="click-tooltip-canvas"]');
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-click-tooltip-edge-light.png",
      );
    });
  });

  test.describe("Visual Regression - Dark Canvas", () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page);
    });

    test("nodeTooltipTrigger='click' popover visual snapshot in dark mode", async ({
      page,
    }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();

      // Move mouse far away to clear any hover state
      await page.mouse.move(2000, 2000);
      await page.waitForTimeout(100);

      const canvas = page.locator('[data-testid="click-tooltip-canvas"]');
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-click-tooltip-node-dark.png",
      );
    });

    test("edgeTooltipTrigger='click' popover visual snapshot in dark mode", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[role="dialog"]');
      await expect(popover).toBeVisible();

      // Move mouse far away to clear any hover state
      await page.mouse.move(2000, 2000);
      await page.waitForTimeout(100);

      const canvas = page.locator('[data-testid="click-tooltip-canvas"]');
      await expect(canvas).toHaveScreenshot(
        "graph-canvas-click-tooltip-edge-dark.png",
      );
    });
  });
});
