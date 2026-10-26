import { test, expect, type Page } from '@playwright/test'
import { loadSelfHostedFonts, assertFontsLoaded, applyDarkCanvasMode, freezeAnimations } from './utils/test-helpers'

// Day view shows "today" from the system clock, so freeze it inside the fixture's
// month (June 2026, see CalendarTestPage.tsx) for a baseline that doesn't drift
// with the date. Select the view by its exact name: a "Day" substring match also
// hits the "Today" button, which navigates to the real current month instead.
async function openDayViewWithFrozenClock(page: Page) {
  await page.clock.install({ time: new Date(2026, 5, 15) })
  await page.reload()
  await page.waitForLoadState('networkidle')
  await loadSelfHostedFonts(page)
  await assertFontsLoaded(page)
  await freezeAnimations(page)
  await page.getByRole('radio', { name: 'Day', exact: true }).click()
  await page.waitForTimeout(100)
}

test.describe('integration: Calendar Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/?example=calendar-test')
    await page.waitForLoadState('networkidle')

    await loadSelfHostedFonts(page)
    await assertFontsLoaded(page)
    await freezeAnimations(page)
  })

  test('month view light canvas snapshot', async ({ page }) => {
    // Ensure we're on month view
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    await expect(page).toHaveScreenshot('calendar-month-light-canvas.png', { fullPage: true })
  })

  test('month view dark canvas snapshot', async ({ page }) => {
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    await applyDarkCanvasMode(page)
    await expect(page).toHaveScreenshot('calendar-month-dark-canvas.png', { fullPage: true })
  })

  test('week view light canvas snapshot', async ({ page }) => {
    const weekButton = page.locator('button:has-text("Week")').first()
    await weekButton.click()
    await page.waitForTimeout(100)

    await expect(page).toHaveScreenshot('calendar-week-light-canvas.png', { fullPage: true })
  })

  test('week view dark canvas snapshot', async ({ page }) => {
    const weekButton = page.locator('button:has-text("Week")').first()
    await weekButton.click()
    await page.waitForTimeout(100)

    await applyDarkCanvasMode(page)
    await expect(page).toHaveScreenshot('calendar-week-dark-canvas.png', { fullPage: true })
  })

  test('day view light canvas snapshot', async ({ page }) => {
    await openDayViewWithFrozenClock(page)

    await expect(page).toHaveScreenshot('calendar-day-light-canvas.png', { fullPage: true })
  })

  test('day view dark canvas snapshot', async ({ page }) => {
    await openDayViewWithFrozenClock(page)

    await applyDarkCanvasMode(page)
    await expect(page).toHaveScreenshot('calendar-day-dark-canvas.png', { fullPage: true })
  })

  test('agenda view light canvas snapshot', async ({ page }) => {
    const agendaButton = page.locator('button:has-text("Agenda")').first()
    await agendaButton.click()
    await page.waitForTimeout(100)

    await expect(page).toHaveScreenshot('calendar-agenda-light-canvas.png', { fullPage: true })
  })

  test('agenda view dark canvas snapshot', async ({ page }) => {
    const agendaButton = page.locator('button:has-text("Agenda")').first()
    await agendaButton.click()
    await page.waitForTimeout(100)

    await applyDarkCanvasMode(page)
    await expect(page).toHaveScreenshot('calendar-agenda-dark-canvas.png', { fullPage: true })
  })

  test('keyboard navigation in month view', async ({ page }) => {
    // Ensure we're on month view
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    // Focus the month grid
    const monthGrid = page.locator('[role="grid"]').first()
    await monthGrid.focus()

    // Test arrow keys
    const initialFocused = page.locator('[role="gridcell"]').first()
    await initialFocused.focus()

    // Arrow right should move focus
    await page.keyboard.press('ArrowRight')
    const cellsAfterArrowRight = page.locator('.calendar-month__cell--focused')
    await expect(cellsAfterArrowRight.first()).toBeVisible()
  })

  test('event selection in month view', async ({ page }) => {
    // Ensure we're on month view
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    // Find and click an event bar
    const eventBar = page.locator('.calendar-month__event-bar').first()
    await expect(eventBar).toBeVisible()
    await eventBar.click()

    // Verify event is selected by checking the status in the page
    const selectedEvent = page.locator('p:has-text("Selected Event")')
    const text = await selectedEvent.textContent()
    expect(text).toContain('event-')
  })

  test('date selection changes focused date', async ({ page }) => {
    // Ensure we're on month view
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    // Get initial title
    const initialTitle = page.locator('.calendar__title')
    const initialText = await initialTitle.textContent()

    // Navigate to next month
    const nextButton = page.locator('.calendar__controls button').last()
    await nextButton.click()
    await page.waitForTimeout(100)

    // Verify title changed
    const newTitle = await initialTitle.textContent()
    expect(newTitle).not.toBe(initialText)
  })

  test('mini calendar selection', async ({ page }) => {
    // Ensure we're on month view
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    // Click a date in the mini calendar
    const miniCalendarDates = page.locator('.mini-calendar__date:not(.mini-calendar__date--out-of-month)')
    const dateToClick = miniCalendarDates.nth(5)
    const dateText = await dateToClick.textContent()

    await dateToClick.click()
    await page.waitForTimeout(100)

    // Verify the selected date shows in the selected date display
    const selectedDateDisplay = page.locator('p:has-text("Selected Date")')
    const selectedDateText = await selectedDateDisplay.textContent()
    expect(selectedDateText).toContain(dateText)
  })

  test('keyboard navigation pgup/pgdn in month view', async ({ page }) => {
    // Ensure we're on month view
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    // Focus the month grid
    const monthGrid = page.locator('[role="grid"]').first()
    await monthGrid.focus()

    // Get initial title
    const monthTitle = page.locator('.calendar__title')
    const initialText = await monthTitle.textContent()

    // Press PageDown to go to next month
    await page.keyboard.press('PageDown')
    await page.waitForTimeout(100)

    // Verify title changed
    const newText = await monthTitle.textContent()
    expect(newText).not.toBe(initialText)
  })

  test('today navigation button', async ({ page }) => {
    // Ensure we're on month view
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    // Navigate to next month
    const nextButton = page.locator('.calendar__controls button').last()
    await nextButton.click()
    await page.waitForTimeout(100)

    // Click Today button (middle button in controls)
    const controls = page.locator('.calendar__controls button')
    const todayButton = controls.nth(1)
    await todayButton.click()
    await page.waitForTimeout(100)

    // Verify we're back to current month
    const todayChip = page.locator('.chip--amber')
    await expect(todayChip.first()).toBeVisible()
  })

  test('accessibility attributes in month view', async ({ page }) => {
    // The test fixture pins its focused/displayed month to June 2026
    // (CalendarTestPage.tsx) regardless of the real date, but the component's
    // aria-current="date" marker is computed from the real system clock. Freeze
    // the clock to a date inside that fixture month so "today" reliably falls
    // within the displayed grid instead of depending on when this test happens
    // to run.
    await page.clock.install({ time: new Date(2026, 5, 15) })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await loadSelfHostedFonts(page)
    await assertFontsLoaded(page)
    await freezeAnimations(page)

    // Ensure we're on month view
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    // Verify grid role exists
    const grid = page.locator('[role="grid"]')
    await expect(grid.first()).toBeVisible()

    // Verify row role exists
    const rows = page.locator('[role="row"]')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)

    // Verify gridcell role exists
    const cells = page.locator('[role="gridcell"]')
    const cellCount = await cells.count()
    expect(cellCount).toBeGreaterThan(0)

    // Verify today has aria-current='date'
    const todayCell = page.locator('[aria-current="date"]')
    await expect(todayCell.first()).toBeVisible()
  })

  test('navigation buttons have accessible labels', async ({ page }) => {
    // Ensure we're on month view
    const monthButton = page.locator('button:has-text("Month")').first()
    await monthButton.click()
    await page.waitForTimeout(100)

    // Verify Previous button has aria-label
    const previousButton = page.locator('.calendar__controls button').first()
    await expect(previousButton).toHaveAttribute('aria-label', 'Previous')

    // Verify Next button has aria-label
    const nextButton = page.locator('.calendar__controls button').last()
    await expect(nextButton).toHaveAttribute('aria-label', 'Next')

    // Verify Today button has text content (no aria-label needed)
    const todayButton = page.locator('.calendar__controls button').nth(1)
    await expect(todayButton).toContainText('Today')
  })
})
