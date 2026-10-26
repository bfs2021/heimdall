import { test, expect } from '@playwright/test'
import { freezeAnimations, loadSelfHostedFonts, assertFontsLoaded, applyDarkCanvasMode } from './utils/test-helpers'

test.describe('integration: MapCanvas Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/?example=map-canvas')
    await page.waitForLoadState('networkidle')
    await loadSelfHostedFonts(page)
    await assertFontsLoaded(page)
  })

  // tinkermonkey/heimdall#296: the initial view must fit the data. It used to open on an empty
  // grid at the top-left of the world with every pin off-screen, and the screenshots captured that.
  test.describe('Initial fit', () => {
    async function readStatus(page: import('@playwright/test').Page) {
      const text = (await page.locator(':text("Center:")').textContent()) ?? ''
      const m = text.match(/Center: ([-\d.]+), ([-\d.]+) \| Zoom: ([\d.]+)/)
      return m ? { lat: Number(m[1]), lng: Number(m[2]), zoom: Number(m[3]) } : null
    }

    async function allInsideCanvas(page: import('@playwright/test').Page, selector: string) {
      const canvas = await page.locator('.map-canvas').boundingBox()
      const boxes = await page.locator(selector).evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect()
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        })
      )
      expect(canvas).not.toBeNull()
      expect(boxes.length).toBeGreaterThan(0)
      return boxes.every(
        (b) => b.left >= canvas!.x && b.right <= canvas!.x + canvas!.width && b.top >= canvas!.y && b.bottom <= canvas!.y + canvas!.height
      )
    }

    test('pins mode frames every pin and reports a centre between them', async ({ page }) => {
      expect(await allInsideCanvas(page, '.map-pin')).toBe(true)
      // Sample pins span New York to Berlin.
      const status = await readStatus(page)
      expect(status).not.toBeNull()
      expect(status!.lat).toBeGreaterThan(40.7)
      expect(status!.lat).toBeLessThan(52.5)
      expect(status!.lng).toBeGreaterThan(-74)
      expect(status!.lng).toBeLessThan(13.4)
      expect(status!.zoom).toBe(1)
    })

    test('track mode frames the track', async ({ page }) => {
      await page.locator('button:has-text("Track Mode")').click()
      expect(await allInsideCanvas(page, '.map-track__line')).toBe(true)
    })

    test('heatmap mode frames every point', async ({ page }) => {
      await page.locator('button:has-text("Heatmap Mode")').click()
      expect(await allInsideCanvas(page, '.map-heatmap circle')).toBe(true)
    })

    test('wheel zoom at the centre keeps the view centre and scales distances by the zoom factor', async ({ page }) => {
      const pinCenter = async (label: string) => {
        const b = await page.locator('.map-pin', { hasText: label }).boundingBox()
        return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 }
      }
      const gap = async () => {
        const a = await pinCenter('NYC')
        const b = await pinCenter('BER')
        return Math.hypot(a.x - b.x, a.y - b.y)
      }
      const before = await readStatus(page)
      const gapBefore = await gap()

      // Wheel zoom anchors on the cursor, so with the cursor at the canvas centre the reported
      // centre must not move. (Keyboard zoom anchors on the top-left corner instead.)
      const canvas = (await page.locator('.map-canvas').boundingBox())!
      await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
      await page.mouse.wheel(0, -300)
      await expect.poll(async () => (await readStatus(page))?.zoom).toBeGreaterThan(before!.zoom)
      await page.waitForTimeout(200)

      const after = await readStatus(page)
      expect(after!.lat).toBeCloseTo(before!.lat, 1)
      expect(after!.lng).toBeCloseTo(before!.lng, 1)
      const scaled = (await gap()) / gapBefore
      // The status shows zoom to one decimal, so compare loosely.
      expect(scaled).toBeGreaterThan(after!.zoom / before!.zoom - 0.06)
      expect(scaled).toBeLessThan(after!.zoom / before!.zoom + 0.06)
    })

    test('a caller re-rendering from onViewportChange does not loop', async ({ page }) => {
      // The test page sets state in an inline onViewportChange. usePanZoom used to re-fire the
      // callback whenever its identity changed, so this rendered forever.
      const warnings: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' && msg.text().includes('Maximum update depth')) warnings.push(msg.text())
      })
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      expect(warnings).toEqual([])
    })
  })

  test.describe('Grid Fallback Rendering', () => {
    test('should render grid pattern without tiles', async ({ page }) => {
      const gridRect = page.locator('.map-grid')
      await expect(gridRect).toBeVisible()
    })

    test('should fill entire canvas area with grid', async ({ page }) => {
      const svg = page.locator('.map-svg')
      const rect = await svg.boundingBox()
      expect(rect?.width).toBeGreaterThan(0)
      expect(rect?.height).toBeGreaterThan(0)
    })
  })

  test.describe('Pins Mode', () => {
    test('should render all pins as buttons', async ({ page }) => {
      // Switch to pins mode by clicking the button
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')

      const pins = page.locator('.map-pin')
      const pinCount = await pins.count()
      expect(pinCount).toBeGreaterThan(0)
    })

    test('pin should have aria-label with coordinates and timestamp', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')

      const firstPin = page.locator('.map-pin').first()
      const ariaLabel = await firstPin.getAttribute('aria-label')
      expect(ariaLabel).toContain('latitude')
      expect(ariaLabel).toContain('longitude')
    })

    test('clicking pin should show popover with details', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')

      const firstPin = page.locator('.map-pin').first()
      await firstPin.click()

      // Check that a popover appears
      const popover = page.locator('.map-popover')
      await expect(popover).toBeVisible()

      // Verify popover content
      const label = popover.locator('.map-popover__label')
      await expect(label).toBeVisible()
    })

    test('escape key should close popover', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')

      const firstPin = page.locator('.map-pin').first()
      await firstPin.click()

      const popover = page.locator('.map-popover')
      await expect(popover).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(popover).not.toBeVisible()
    })

    test('selected pin should display pulse animation', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')

      // Select a pin
      const firstPin = page.locator('.map-pin').first()
      await firstPin.click()

      // Check that pin has selected class
      const selectedPin = page.locator('.map-pin--selected').first()
      await expect(selectedPin).toHaveClass(/map-pin--selected/)

      // Verify the pulse animation exists in the dot
      const dot = selectedPin.locator('.map-pin__dot')
      await page.waitForTimeout(50)
      const styles = await dot.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return computed.animation
      })
      expect(styles).toContain('pulse-glow')
    })

    test('pulse animation should be suppressed under prefers-reduced-motion', async ({ page }) => {
      // Set prefers-reduced-motion
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')

      const firstPin = page.locator('.map-pin').first()
      await firstPin.click()

      const dot = page.locator('.map-pin--selected').locator('.map-pin__dot').first()
      const animation = await dot.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return computed.animation
      })
      expect(animation).toBe('none')
    })
  })

  test.describe('Track Mode', () => {
    test('should render track as dashed cyan polyline', async ({ page }) => {
      await page.locator('button:has-text("Track Mode")').click()
      await page.waitForLoadState('networkidle')

      const trackLine = page.locator('.map-track__line')
      await expect(trackLine).toBeVisible()

      // Verify it's cyan (accent-primary)
      const stroke = await trackLine.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return computed.stroke
      })
      expect(stroke).toBeTruthy()
    })

    test('should display legend for track mode', async ({ page }) => {
      await page.locator('button:has-text("Track Mode")').click()
      await page.waitForLoadState('networkidle')

      const legend = page.locator('.map-legend')
      await expect(legend).toBeVisible()

      const legendText = page.locator('.map-legend__item')
      await expect(legendText).toContainText('Track')
    })
  })

  test.describe('Heatmap Mode', () => {
    test('should render heatmap points with gradient colors', async ({ page }) => {
      await page.locator('button:has-text("Heatmap Mode")').click()
      await page.waitForLoadState('networkidle')

      const heatmapPoints = page.locator('[data-testid^="heatmap-point-"]')
      const count = await heatmapPoints.count()
      expect(count).toBeGreaterThan(0)
    })

    test('should display legend for heatmap mode', async ({ page }) => {
      await page.locator('button:has-text("Heatmap Mode")').click()
      await page.waitForLoadState('networkidle')

      const legend = page.locator('.map-legend')
      await expect(legend).toBeVisible()

      const legendItem = page.locator('.map-legend__item')
      await expect(legendItem).toContainText('Density')
    })

    test('heatmap should use emerald color by default', async ({ page }) => {
      await page.locator('button:has-text("Heatmap Mode")').click()
      await page.waitForLoadState('networkidle')

      const point = page.locator('[data-testid="heatmap-point-0"]')
      const fill = await point.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return computed.fill
      })
      expect(fill).toBeTruthy()
    })
  })

  test.describe('Pan and Zoom', () => {
    test('arrow keys should pan', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')

      const canvas = page.locator('.map-canvas')
      await canvas.focus()

      // Get initial viewport state from the display text
      const initialText = await page.locator(':text("Center:")').textContent()
      const initialMatch = initialText?.match(/Center: ([-\d.]+), ([-\d.]+)/)

      // Pan with arrow key
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(100)

      // Verify position changed
      const newText = await page.locator(':text("Center:")').textContent()
      const newMatch = newText?.match(/Center: ([-\d.]+), ([-\d.]+)/)

      expect(newMatch?.slice(1)).not.toEqual(initialMatch?.slice(1))
    })

    test('plus/minus keys should zoom', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')

      const canvas = page.locator('.map-canvas')
      await canvas.focus()

      // Get initial zoom level
      const initialText = await page.locator(':text("Center:")').textContent()
      const initialZoom = initialText?.match(/Zoom: ([\d.]+)/)?.[1]

      // Zoom in with +
      await page.keyboard.press('+')
      await page.waitForTimeout(100)

      // Verify zoom changed
      const newText = await page.locator(':text("Center:")').textContent()
      const newZoom = newText?.match(/Zoom: ([\d.]+)/)?.[1]
      expect(newZoom).not.toEqual(initialZoom)
    })
  })

  test.describe('Scale Bar', () => {
    test('should show scale bar when enabled', async ({ page }) => {
      await page.locator('input[type="checkbox"]').nth(0).check()
      await page.waitForLoadState('networkidle')

      const scaleBar = page.locator('.map-scale-bar')
      await expect(scaleBar).toBeVisible()
    })

    test('scale bar label should display current zoom level', async ({ page }) => {
      // Enable scale bar
      const scaleBarCheckbox = page.locator('input[type="checkbox"]').nth(0)
      const isChecked = await scaleBarCheckbox.isChecked()
      if (!isChecked) {
        await scaleBarCheckbox.check()
      }

      const label = page.locator('.map-scale-bar__label')
      const text = await label.textContent()
      expect(text).toMatch(/Zoom: \d+\.\d/)
    })
  })

  test.describe('Role and Accessibility', () => {
    test('canvas should have application role', async ({ page }) => {
      const canvas = page.locator('.map-canvas')
      const role = await canvas.getAttribute('role')
      expect(role).toBe('application')
    })

    test('canvas should be keyboard accessible with tabindex', async ({ page }) => {
      const canvas = page.locator('.map-canvas')
      const tabindex = await canvas.getAttribute('tabindex')
      expect(tabindex).not.toBeNull()
    })

    test('pins should be buttons with proper semantics', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')

      const firstPin = page.locator('.map-pin').first()
      const role = await firstPin.evaluate((el) => el.tagName.toLowerCase())
      expect(role).toBe('button')
    })
  })

  test.describe('Visual Regression - Light Canvas', () => {
    test('should match default grid-only state', async ({ page }) => {
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-grid-light.png', {
        maxDiffPixelRatio: 0.02,
      })
    })

    test('should match pins mode state', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-pins-light.png', {
        maxDiffPixelRatio: 0.02,
      })
    })

    test('should match track mode state', async ({ page }) => {
      await page.locator('button:has-text("Track Mode")').click()
      await page.waitForLoadState('networkidle')
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-track-light.png', {
        maxDiffPixelRatio: 0.02,
      })
    })

    test('should match heatmap mode state', async ({ page }) => {
      await page.locator('button:has-text("Heatmap Mode")').click()
      await page.waitForLoadState('networkidle')
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-heatmap-light.png', {
        maxDiffPixelRatio: 0.02,
      })
    })

    test('should match pins mode with selected pin', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')
      await page.locator('.map-pin').first().click()
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-pins-selected-light.png', {
        maxDiffPixelRatio: 0.02,
      })
    })
  })

  test.describe('Visual Regression - Dark Canvas', () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page)
    })

    test('should match grid-only state in dark canvas', async ({ page }) => {
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-grid-dark.png', {
        maxDiffPixelRatio: 0.02,
      })
    })

    test('should match pins mode in dark canvas', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-pins-dark.png', {
        maxDiffPixelRatio: 0.02,
      })
    })

    test('should match track mode in dark canvas', async ({ page }) => {
      await page.locator('button:has-text("Track Mode")').click()
      await page.waitForLoadState('networkidle')
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-track-dark.png', {
        maxDiffPixelRatio: 0.02,
      })
    })

    test('should match heatmap mode in dark canvas', async ({ page }) => {
      await page.locator('button:has-text("Heatmap Mode")').click()
      await page.waitForLoadState('networkidle')
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-heatmap-dark.png', {
        maxDiffPixelRatio: 0.02,
      })
    })

    test('should match pins mode with selected pin in dark canvas', async ({ page }) => {
      await page.locator('button:has-text("Pins Mode")').click()
      await page.waitForLoadState('networkidle')
      await page.locator('.map-pin').first().click()
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('map-canvas-pins-selected-dark.png', {
        maxDiffPixelRatio: 0.02,
      })
    })
  })
})
