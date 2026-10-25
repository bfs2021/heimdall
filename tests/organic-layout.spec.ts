import { test, expect } from '@playwright/test'

// layout="organic" smoke: DOM assertions only (no screenshot baselines) so the spec is
// platform-independent. The engine's own post-conditions are unit-tested in
// src/utils/__tests__/organicLayout.test.ts and gated by heimdall-layout-loop's Stage 1 checks;
// this verifies the GraphCanvas wiring renders every node, overlap-free, with no console errors.
test.describe('integration: Organic Layout', () => {
  test('renders every node without overlapping bounding boxes', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    page.on('pageerror', err => errors.push(String(err)))
    await page.goto('http://localhost:5173/?example=organic-layout')
    await page.waitForLoadState('networkidle')

    const caption = page.getByTestId('organic-layout-caption')
    await expect(caption).toContainText('layout="organic"')
    const expected = Number((await caption.textContent())?.match(/(\d+) nodes/)?.[1])
    expect(expected).toBeGreaterThan(0)

    const nodes = page.locator('[data-testid="organic-canvas"] [data-testid^="graph-node-"]')
    await expect(nodes).toHaveCount(expected)

    const boxes = []
    for (let i = 0; i < expected; i++) {
      const box = await nodes.nth(i).boundingBox()
      expect(box).not.toBeNull()
      boxes.push(box!)
    }
    let overlaps = 0
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (ox > 0.5 && oy > 0.5) overlaps++
    }
    expect(overlaps).toBe(0)
    expect(errors).toEqual([])
  })

  test('is deterministic across reloads', async ({ page }) => {
    const read = async () => {
      await page.goto('http://localhost:5173/?example=organic-layout')
      await page.waitForLoadState('networkidle')
      const nodes = page.locator('[data-testid="organic-canvas"] [data-testid^="graph-node-"]')
      const count = await nodes.count()
      const out: Array<{ x: number; y: number }> = []
      for (let i = 0; i < count; i++) { const b = (await nodes.nth(i).boundingBox())!; out.push({ x: b.x, y: b.y }) }
      return out
    }
    const a = await read()
    const b = await read()
    expect(b).toEqual(a)
  })
})
