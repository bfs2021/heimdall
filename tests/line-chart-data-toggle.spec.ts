import { test, expect } from '@playwright/test'

// tinkermonkey/heimdall#297: LineChart called a hook after its empty-data early return, so data
// going from empty to non-empty (or back) changed its hook count between renders and React threw.
test.describe('integration: LineChart data toggle', () => {
  test('keeps rendering as series data switches between empty and non-empty', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('http://localhost:5173/?example=line-chart-data-toggle')
    const toggle = page.getByTestId('toggle-data')
    const host = page.getByTestId('chart-host')

    // Starts empty: the chart renders nothing.
    await expect(host.locator('svg')).toHaveCount(0)

    for (let i = 0; i < 3; i++) {
      await toggle.click() // empty -> data
      await expect(host.locator('svg')).toHaveCount(1)
      await toggle.click() // data -> empty
      await expect(host.locator('svg')).toHaveCount(0)
    }

    await expect(page.getByTestId('chart-error')).toHaveCount(0)
    expect(errors).toEqual([])
  })
})
