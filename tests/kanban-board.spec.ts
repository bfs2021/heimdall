import { test, expect } from "@playwright/test";
import {
  freezeAnimations,
  loadSelfHostedFonts,
  assertFontsLoaded,
  applyDarkCanvasMode,
} from "./utils/test-helpers";

test.describe("integration: KanbanBoard Component", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173/?example=kanban-board");
    await page.waitForLoadState("networkidle");
    await loadSelfHostedFonts(page);
    await assertFontsLoaded(page);
  });

  // tinkermonkey/heimdall#298: onMoveCard's index must be the card's final position for pointer
  // drags too. Within its own column, a downward drop used to report one slot too high, so the
  // test page's remove-then-insert handler landed the card one slot low.
  test.describe("Pointer reordering within a column", () => {
    const BACKLOG = '[data-column-id="backlog"] .kanban-column__body .kanban-card';
    const TITLES = ["Add user authentication", "Fix button alignment issue", "Implement dark mode"];

    async function backlogOrder(page: import("@playwright/test").Page) {
      const texts = await page.locator(BACKLOG).allInnerTexts();
      return texts.map((t) => TITLES.find((title) => t.includes(title)) ?? "other").slice(0, 3);
    }

    // Drag card `from` and release just above the vertical midpoint of card `to` (or below the
    // last one), with intermediate moves so pointermove fires.
    async function dragWithinBacklog(page: import("@playwright/test").Page, from: number, to: number, below = false) {
      const cards = page.locator(BACKLOG);
      const src = await cards.nth(from).boundingBox();
      const dst = await cards.nth(to).boundingBox();
      if (!src || !dst) throw new Error("card not laid out");
      const x = src.x + src.width / 2;
      const y = below ? dst.y + dst.height * 0.9 : dst.y + dst.height * 0.2;
      await page.mouse.move(x, src.y + src.height / 2);
      await page.mouse.down();
      await page.mouse.move(x, (src.y + y) / 2, { steps: 4 });
      await page.mouse.move(x, y, { steps: 4 });
      await page.mouse.up();
    }

    test("dragging down drops the card in the slot under the pointer", async ({ page }) => {
      expect(await backlogOrder(page)).toEqual(TITLES);
      // First card dropped between the second and third.
      await dragWithinBacklog(page, 0, 2);
      await expect.poll(() => backlogOrder(page)).toEqual([TITLES[1], TITLES[0], TITLES[2]]);
    });

    test("dragging up drops the card in the slot under the pointer", async ({ page }) => {
      // Third card dropped above the first.
      await dragWithinBacklog(page, 2, 0);
      await expect.poll(() => backlogOrder(page)).toEqual([TITLES[2], TITLES[0], TITLES[1]]);
    });
  });

  test.describe("Rendering and Layout", () => {
    test("should render all columns with headers, titles, and count chips", async ({
      page,
    }) => {
      const columns = page.locator(".kanban-column");
      const columnCount = await columns.count();
      expect(columnCount).toBe(5);

      // Check first column header
      const firstColumnTitle = columns.first().locator(".kanban-column__title");
      await expect(firstColumnTitle).toHaveText("Backlog");

      // Check count chip
      const countChip = columns.first().locator(".chip");
      await expect(countChip).toBeVisible();
    });

    test("should display status-color dots in column headers", async ({
      page,
    }) => {
      const statusDots = page.locator(".kanban-column__status-dot");
      const dotsCount = await statusDots.count();
      expect(dotsCount).toBeGreaterThan(0); // At least some columns have status dots
    });

    test("should show WIP limit warning when cards exceed limit", async ({
      page,
    }) => {
      // The Backlog column has 6 cards and limit of 5
      const backlogColumn = page.locator(".kanban-column").first();
      const wipWarning = backlogColumn.locator(".kanban-column__wip-warning");
      await expect(wipWarning).toBeVisible();
    });

    test("should render cards with context, title, and metadata", async ({
      page,
    }) => {
      const firstCard = page.locator(".kanban-card").first();

      // Check context
      const context = firstCard.locator(".kanban-card__context");
      await expect(context).toHaveText("FEATURE");

      // Check title
      const title = firstCard.locator(".kanban-card__title");
      await expect(title).toBeVisible();

      // Check version pill
      const versionPill = firstCard.locator(".version-pill");
      await expect(versionPill).toBeVisible();
    });

    test("should display blocked banner on blocked cards", async ({ page }) => {
      const blockedCard = page
        .locator(".kanban-card")
        .filter({ has: page.locator(".kanban-card__blocked") });
      const blockedBanner = blockedCard.locator(".kanban-card__blocked");
      await expect(blockedBanner).toBeVisible();
      await expect(blockedBanner).toContainText("Waiting on design approval");
    });

    test("should display done styling (strikethrough + dim) on completed cards", async ({
      page,
    }) => {
      // Navigate to Done column
      const doneColumn = page.locator(".kanban-column").last();
      const doneCard = doneColumn.locator(".kanban-card--done").first();

      await expect(doneCard).toHaveClass(/kanban-card--done/);
      const title = doneCard.locator(".kanban-card__title");
      // Check for strikethrough via text-decoration style
      const styles = await title.evaluate(
        (el) => window.getComputedStyle(el).textDecoration,
      );
      expect(styles).toContain("line-through");
    });

    test("should show empty column placeholder", async ({ page }) => {
      // Verify the test page has an empty column with the placeholder visible
      const emptyPlaceholder = page.locator(".kanban-column__empty");
      const placeholderCount = await emptyPlaceholder.count();
      expect(placeholderCount).toBeGreaterThanOrEqual(1);
      await expect(emptyPlaceholder.first()).toHaveText("Drop cards here");
    });

    test("should render independent scrollable columns", async ({ page }) => {
      const bodyContainers = page.locator(".kanban-column__body");
      const count = await bodyContainers.count();
      expect(count).toBe(5);

      // Each body should have overflow-y: auto
      const firstBody = bodyContainers.first();
      const styles = await firstBody.evaluate(
        (el) => window.getComputedStyle(el).overflowY,
      );
      expect(styles).toBe("auto");
    });
  });

  test.describe("Card Selection", () => {
    test("should clear selection when clicking clear button", async ({
      page,
    }) => {
      const firstCard = page.locator(".kanban-card").first();
      await firstCard.click();

      await expect(firstCard).toHaveClass(/kanban-card--selected/);

      const clearButton = page.locator('button:has-text("Clear Selection")');
      await clearButton.click();

      await expect(firstCard).not.toHaveClass(/kanban-card--selected/);
    });

    test("should focus card with Tab key and Space", async ({ page }) => {
      const firstCard = page.locator(".kanban-card").first();

      // Focus the card
      await firstCard.focus();
      await expect(firstCard).toBeFocused();

      // Press Space to grab (initiates keyboard drag mode)
      await page.keyboard.press("Space");

      // Verify the card enters drag state by checking for visual indicator
      // The card should have the dragged state (insertion line visible)
      const insertionLine = page.locator(".kanban-column__insertion-line");
      await expect(insertionLine).toBeVisible();

      // Press Escape to cancel the grab
      await page.keyboard.press("Escape");

      // After cancel, the card should still be focused and visible
      await expect(firstCard).toBeFocused();
      await expect(firstCard).toBeVisible();
    });
  });

  test.describe("Visual Regression - Light Canvas", () => {
    test("should match default state snapshot", async ({ page }) => {
      await freezeAnimations(page);
      await expect(page).toHaveScreenshot("kanban-board-default-light.png", {
        maxDiffPixelRatio: 0.01,
      });
    });

    test("should match state with selected card", async ({ page }) => {
      const firstCard = page.locator(".kanban-card").first();
      await firstCard.click();

      await freezeAnimations(page);
      await expect(page).toHaveScreenshot("kanban-board-selected-light.png", {
        maxDiffPixelRatio: 0.01,
      });
    });

    test("should match blocked card state", async ({ page }) => {
      const blockedCard = page
        .locator(".kanban-card")
        .filter({ has: page.locator(".kanban-card__blocked") });
      await freezeAnimations(page);
      await expect(blockedCard.first()).toHaveScreenshot(
        "kanban-board-blocked-light.png",
        {
          maxDiffPixelRatio: 0.01,
        },
      );
    });

    test("should match done cards state", async ({ page }) => {
      const doneColumn = page.locator(".kanban-column").last();
      await freezeAnimations(page);
      await expect(doneColumn).toHaveScreenshot("kanban-board-done-light.png", {
        maxDiffPixelRatio: 0.01,
      });
    });

    test("should match WIP limit warning state", async ({ page }) => {
      const backlogColumn = page.locator(".kanban-column").first();
      const wipWarning = backlogColumn.locator(".kanban-column__wip-warning");
      await freezeAnimations(page);
      await expect(wipWarning).toHaveScreenshot(
        "kanban-board-wip-warning-light.png",
        {
          maxDiffPixelRatio: 0.01,
        },
      );
    });

    test("should match empty column state", async ({ page }) => {
      const emptyPlaceholder = page.locator(".kanban-column__empty").first();
      await freezeAnimations(page);
      await expect(emptyPlaceholder).toHaveScreenshot(
        "kanban-board-empty-column-light.png",
        {
          maxDiffPixelRatio: 0.01,
        },
      );
    });
  });

  test.describe("Visual Regression - Dark Canvas", () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page);
    });

    test("should match default state in dark canvas", async ({ page }) => {
      await freezeAnimations(page);
      await expect(page).toHaveScreenshot("kanban-board-default-dark.png", {
        maxDiffPixelRatio: 0.01,
      });
    });

    test("should match selected card in dark canvas", async ({ page }) => {
      const firstCard = page.locator(".kanban-card").first();
      await firstCard.click();

      await freezeAnimations(page);
      await expect(page).toHaveScreenshot("kanban-board-selected-dark.png", {
        maxDiffPixelRatio: 0.01,
      });
    });

    test("should match blocked card in dark canvas", async ({ page }) => {
      const blockedCard = page
        .locator(".kanban-card")
        .filter({ has: page.locator(".kanban-card__blocked") });
      await freezeAnimations(page);
      await expect(blockedCard.first()).toHaveScreenshot(
        "kanban-board-blocked-dark.png",
        {
          maxDiffPixelRatio: 0.01,
        },
      );
    });

    test("should match done cards in dark canvas", async ({ page }) => {
      const doneColumn = page.locator(".kanban-column").last();
      await freezeAnimations(page);
      await expect(doneColumn).toHaveScreenshot("kanban-board-done-dark.png", {
        maxDiffPixelRatio: 0.01,
      });
    });

    test("should match empty column state in dark canvas", async ({ page }) => {
      const emptyPlaceholder = page.locator(".kanban-column__empty").first();
      await freezeAnimations(page);
      await expect(emptyPlaceholder).toHaveScreenshot(
        "kanban-board-empty-column-dark.png",
        {
          maxDiffPixelRatio: 0.01,
        },
      );
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper ARIA attributes on cards", async ({ page }) => {
      const firstCard = page.locator(".kanban-card").first();
      await expect(firstCard).toHaveAttribute("role", "button");
      await expect(firstCard).toHaveAttribute("tabindex", "0");
    });

    test("should have live region for announcements", async ({ page }) => {
      const liveRegion = page.locator(".kanban-board__live-region");
      await expect(liveRegion).toHaveAttribute("role", "status");
      await expect(liveRegion).toHaveAttribute("aria-live", "polite");
    });

    test("should announce card moves", async ({ page }) => {
      const firstCard = page.locator(".kanban-card").first();
      const liveRegion = page.locator(".kanban-board__live-region");

      // Focus the card
      await firstCard.focus();

      // Press Space to grab
      await page.keyboard.press("Space");

      // Press ArrowDown to move down within the column
      await page.keyboard.press("ArrowDown");

      // Wait for the announcement to appear in the live region
      await page.waitForTimeout(100);
      const announcementText = await liveRegion.textContent();
      expect(announcementText).toBeTruthy();
      expect(announcementText).toContain("moved to");
    });
  });

  test.describe("Keyboard Navigation", () => {
    test("should support Tab navigation between cards", async ({ page }) => {
      const firstCard = page.locator(".kanban-card").first();
      const secondCard = page.locator(".kanban-card").nth(1);

      // Focus first card
      await firstCard.focus();
      await expect(firstCard).toBeFocused();

      // Tab to second card
      await page.keyboard.press("Tab");
      await expect(secondCard).toBeFocused();
    });

    test("should support Escape to cancel drag", async ({ page }) => {
      const firstCard = page.locator(".kanban-card").first();

      // Focus and select the card
      await firstCard.focus();
      await firstCard.click();

      // Press Escape
      await page.keyboard.press("Escape");

      // Card should still be there (just the selection/drag state is cleared)
      await expect(firstCard).toBeVisible();
    });
  });
});
