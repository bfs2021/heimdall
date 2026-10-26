import { test, expect } from "@playwright/test";
import {
  freezeAnimations,
  loadSelfHostedFonts,
  assertFontsLoaded,
  applyDarkCanvasMode,
  removeDarkCanvasMode,
} from "./utils/test-helpers";

test.describe("integration: GraphCanvas Popover Components", () => {
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

  test.describe("Node Popover", () => {
    test("nodePopover renders when a node is clicked", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await expect(cellNode).toBeVisible();

      // Click the node to open the popover
      await cellNode.click();

      // Popover should now be visible
      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("Cell");
    });

    test("nodePopover contains interactive button", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      const button = popover.locator('[data-testid="node-popover-action-cls_cell"]');
      await expect(button).toBeVisible();
      await expect(button).toHaveText("View Details");
    });

    test("nodePopover contains interactive link", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      const link = popover.locator('[data-testid="node-popover-link-cls_cell"]');
      await expect(link).toBeVisible();
      await expect(link).toHaveText("More Info");
    });

    test("nodePopover displays node title and description", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("Cell");
      await expect(popover).toContainText("Basic unit of life");
    });

    test("nodePopover closes when clicking the canvas background", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      // Click on empty canvas background
      const canvas = page.locator(".graph-canvas");
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Canvas not visible");

      await canvas.click({ position: { x: box.width / 2, y: 40 } });

      // Popover should hide
      await expect(popover).not.toBeVisible();
    });

    test("nodePopover tracks pan and zoom while open", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
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

  test.describe("Edge Popover", () => {
    test("edgePopover renders when an edge is clicked", async ({ page }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await expect(edge).toBeVisible();

      // Click the edge to open the popover
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      // Popover should now be visible
      const popover = page.locator('[data-testid="edge-popover-edge_1"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("contains");
    });

    test("edgePopover closes when clicking another edge", async ({ page }) => {
      const edge1 = page.locator('[data-testid="graph-edge-edge_1"]');
      const edge2 = page.locator('[data-testid="graph-edge-edge_2"]');

      // Open popover for first edge
      await edge1.locator(".graph-edge__hit").dispatchEvent("click");
      const edge1Popover = page.locator('[data-testid="edge-popover-edge_1"]');
      await expect(edge1Popover).toBeVisible();

      // Click another edge
      await edge2.locator(".graph-edge__hit").dispatchEvent("click");

      // First popover should hide, second should show
      await expect(edge1Popover).not.toBeVisible();
      const edge2Popover = page.locator('[data-testid="edge-popover-edge_2"]');
      await expect(edge2Popover).toBeVisible();
      await expect(edge2Popover).toContainText("contains");
    });

    test("edgePopover contains interactive button", async ({ page }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[data-testid="edge-popover-edge_1"]');
      await expect(popover).toBeVisible();

      const button = popover.locator('[data-testid="edge-popover-action-edge_1"]');
      await expect(button).toBeVisible();
      await expect(button).toHaveText("Explore");
    });

    test("edgePopover displays edge label and metadata", async ({ page }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[data-testid="edge-popover-edge_1"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("contains");
      await expect(popover).toContainText("cls_cell");
      await expect(popover).toContainText("cls_nucleus");
    });

    test("edgePopover closes when clicking a node", async ({ page }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const edgePopover = page.locator('[data-testid="edge-popover-edge_1"]');
      await expect(edgePopover).toBeVisible();

      // Click a node
      const node = page.locator('[data-testid="graph-node-cls_cell"]');
      await node.click();

      // Edge popover should hide, node popover should show
      await expect(edgePopover).not.toBeVisible();
      const nodePopover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(nodePopover).toBeVisible();
    });

    test("edgePopover displays weight when present", async ({ page }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_weight_low"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[data-testid="edge-popover-edge_weight_low"]');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("Weight: 10");
    });
  });

  test.describe("Popover Keyboard & Outside-Click Dismissal", () => {
    test("nodePopover closes when Escape key is pressed", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      // Press Escape key
      await page.keyboard.press('Escape');

      // Popover should hide
      await expect(popover).not.toBeVisible();
    });

    test("nodePopover has focus in its panel as soon as it is visible", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      // Read focus once, without polling: an Escape pressed at this moment goes wherever
      // focus is right now, so it must already be inside the panel.
      const focusInPanel = await page.evaluate(
        () => !!document.getElementById("popover-node-cls_cell")?.contains(document.activeElement),
      );
      expect(focusInPanel).toBe(true);
      await expect(popover.locator('[data-testid="node-popover-action-cls_cell"]')).toBeFocused();
    });

    test("edgePopover closes when Escape key is pressed", async ({ page }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[data-testid="edge-popover-edge_1"]');
      await expect(popover).toBeVisible();

      // Press Escape key
      await page.keyboard.press('Escape');

      // Popover should hide
      await expect(popover).not.toBeVisible();
    });

    test("nodePopover closes when clicking on canvas background", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      // Click on empty canvas background to close popover
      const canvas = page.locator(".graph-canvas");
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Canvas not visible");

      await canvas.click({ position: { x: box.width / 2, y: 40 } });

      // Popover should hide
      await expect(popover).not.toBeVisible();
    });

    test("nodePopover closes when clicking outside the entire GraphCanvas", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      // Click somewhere outside the canvas (e.g., on the page body)
      await page.click('body', { position: { x: 10, y: 10 } });

      // Popover should hide
      await expect(popover).not.toBeVisible();
    });
  });

  test.describe("Accessibility", () => {
    test("nodePopover has accessible aria-label on panel", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popoverPanel = page.locator('[role="dialog"]');
      await expect(popoverPanel).toBeVisible();

      // Verify aria-label contains the node ID
      const ariaLabel = await popoverPanel.getAttribute("aria-label");
      expect(ariaLabel).toContain("cls_cell");
      expect(ariaLabel).toContain("Details for");
    });

    test("edgePopover has accessible aria-label on panel", async ({ page }) => {
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

  test.describe("Tooltip vs Popover Coexistence", () => {
    test("hovering (tooltip) does not interfere with popover open state", async ({
      page,
    }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      // Hover over a different node to show its tooltip
      const nucleusNode = page.locator('[data-testid="graph-node-cls_nucleus"]');
      await nucleusNode.dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      // The popover for the clicked node should still be visible
      await expect(popover).toBeVisible();

      // The tooltip should also be visible
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("Nucleus");
    });

    test("popover remains stable during hover on same node", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      // Hover over the same node
      await cellNode.dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      // Popover should still be visible and stable
      await expect(popover).toBeVisible();
    });
  });

  test.describe("Visual Regression - Light Canvas", () => {
    test("nodePopover open state visual snapshot", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      // Wait for popover to be visible
      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot("graph-canvas-node-popover-light.png");
    });

    test("edgePopover open state visual snapshot", async ({ page }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      // Wait for popover to be visible
      const popover = page.locator('[data-testid="edge-popover-edge_1"]');
      await expect(popover).toBeVisible();

      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot("graph-canvas-edge-popover-light.png");
    });

    test("popover with interactive content", async ({ page }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      // Verify interactive elements are visible
      await expect(popover.locator('[data-testid="node-popover-action-cls_cell"]')).toBeVisible();
      await expect(popover.locator('[data-testid="node-popover-link-cls_cell"]')).toBeVisible();
    });
  });

  test.describe("Visual Regression - Dark Canvas", () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page);
    });

    test("nodePopover open state visual snapshot in dark mode", async ({
      page,
    }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot("graph-canvas-node-popover-dark.png");
    });

    test("edgePopover open state visual snapshot in dark mode", async ({
      page,
    }) => {
      const edge = page.locator('[data-testid="graph-edge-edge_1"]');
      await edge.locator(".graph-edge__hit").dispatchEvent("click");

      const popover = page.locator('[data-testid="edge-popover-edge_1"]');
      await expect(popover).toBeVisible();

      const canvas = page.locator(".graph-canvas");
      await expect(canvas).toHaveScreenshot("graph-canvas-edge-popover-dark.png");
    });

    test("popover with interactive content in dark mode", async ({
      page,
    }) => {
      const cellNode = page.locator('[data-testid="graph-node-cls_cell"]');
      await cellNode.click();

      const popover = page.locator('[data-testid="node-popover-cls_cell"]');
      await expect(popover).toBeVisible();

      await expect(popover.locator('[data-testid="node-popover-action-cls_cell"]')).toBeVisible();
      await expect(popover.locator('[data-testid="node-popover-link-cls_cell"]')).toBeVisible();
    });
  });

  test.describe("Backward Compatibility - Tooltips", () => {
    test("nodeTooltip still works and is not affected by popover", async ({
      page,
    }) => {
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toHaveCount(0);

      // Hover over a node to show tooltip
      await page.locator('[data-testid="graph-node-cls_cell"]').dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      // Tooltip should appear
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("Cell");

      // Hide tooltip
      await page.locator('[data-testid="graph-node-cls_cell"]').dispatchEvent("pointerout");
      await expect(tooltip).toHaveCount(0);
    });

    test("edgeTooltip still works and is not affected by popover", async ({
      page,
    }) => {
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toHaveCount(0);

      // Hover over an edge to show tooltip
      await page.locator('[data-testid="graph-edge-edge_1"]').dispatchEvent("pointerover");
      await page.waitForTimeout(250);

      // Tooltip should appear
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("contains");

      // Hide tooltip
      await page.locator('[data-testid="graph-edge-edge_1"]').dispatchEvent("pointerout");
      await expect(tooltip).toHaveCount(0);
    });

    test("only one tooltip renders at a time (unchanged behavior)", async ({
      page,
    }) => {
      await page.locator('[data-testid="graph-node-cls_cell"]').dispatchEvent("pointerover");
      await page.waitForTimeout(250);
      await expect(page.locator('[role="tooltip"]')).toHaveCount(1);

      await page.locator('[data-testid="graph-node-cls_cell"]').dispatchEvent("pointerout");
      await page.locator('[data-testid="graph-edge-edge_1"]').dispatchEvent("pointerover");
      await page.waitForTimeout(250);
      await expect(page.locator('[role="tooltip"]')).toHaveCount(1);
    });

    test("tooltip position tracking still works (unchanged behavior)", async ({
      page,
    }) => {
      const tooltip = page.locator('[role="tooltip"]');
      await page.locator('[data-testid="graph-node-cls_cell"]').dispatchEvent("pointerover");
      await page.waitForTimeout(250);
      await expect(tooltip).toBeVisible();
      const before = await tooltip.boundingBox();

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
  });
});
