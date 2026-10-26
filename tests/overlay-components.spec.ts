import { test, expect, type Page } from '@playwright/test'
import { freezeAnimations, loadSelfHostedFonts, assertFontsLoaded, applyDarkCanvasMode } from './utils/test-helpers'

// The test page's toast auto-dismisses after Toast's default 4s, which a slow CI runner can
// outlast before the screenshot is taken. Pause the page clock first so its timer never fires.
async function openToastWithClockPaused(page: Page) {
  await page.clock.install()
  await page.clock.pauseAt(Date.now() + 1000)
  await page.locator('button:has-text("Show Toast")').first().click()
}

test.describe('integration: Overlay Components', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to overlay components test page
    await page.goto('http://localhost:5173/?example=overlays')
    await page.waitForLoadState('networkidle')

    // Load self-hosted fonts
    await loadSelfHostedFonts(page)
    await assertFontsLoaded(page)
  })

  test.describe('Modal Component', () => {
    test('should render when isOpen is true', async ({ page }) => {
      // Find and click the trigger button for modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      // Modal should be visible
      const modal = page.locator('[role="dialog"]').first()
      await expect(modal).toBeVisible()

      // Modal should have backdrop
      const backdrop = page.locator('.modal-backdrop').first()
      await expect(backdrop).toBeVisible()

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('modal-open.png', {
        maxDiffPixelRatio: 0.01,
      })
    })

    test('should close when Escape key is pressed', async ({ page }) => {
      // Open modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      const modal = page.locator('[role="dialog"]').first()
      await expect(modal).toBeVisible()

      // Press Escape
      await page.keyboard.press('Escape')

      // Modal should be hidden
      await expect(modal).not.toBeVisible()
    })

    test('should close when backdrop is clicked', async ({ page }) => {
      // Open modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      const modal = page.locator('[role="dialog"]').first()
      await expect(modal).toBeVisible()

      // Click backdrop
      const backdrop = page.locator('.modal-backdrop').first()
      await backdrop.click({ position: { x: 10, y: 10 } })

      // Modal should be hidden
      await expect(modal).not.toBeVisible()
    })

    test('should lock body overflow when open', async ({ page }) => {
      const overflow = await page.evaluate(() => {
        return document.body.style.overflow
      })

      expect(overflow).not.toBe('hidden')

      // Open modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      const overflowWhenOpen = await page.evaluate(() => {
        return document.body.style.overflow
      })

      expect(overflowWhenOpen).toBe('hidden')
    })

    test('should restore body overflow when closed', async ({ page }) => {
      // Open modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      // Close modal via Escape
      await page.keyboard.press('Escape')

      const overflow = await page.evaluate(() => {
        return document.body.style.overflow
      })

      // Overflow should be restored to its original value (empty string when not previously set)
      expect(overflow).toBe('')
    })

    test('should close when close button is clicked', async ({ page }) => {
      // Open modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      // Click close button
      const closeButton = page.locator('.modal__close').first()
      await closeButton.click()

      // Modal should be hidden
      const modal = page.locator('[role="dialog"]').first()
      await expect(modal).not.toBeVisible()
    })

    test('should display title and subtitle when provided', async ({ page }) => {
      // Open modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      // Check title
      const title = page.locator('.modal__title')
      await expect(title).toBeVisible()
      expect(await title.textContent()).toBeTruthy()

      // Check subtitle
      const subtitle = page.locator('.modal__subtitle')
      if (await subtitle.count() > 0) {
        await expect(subtitle).toBeVisible()
      }
    })

    test('should trap focus: Tab from last focusable element wraps to first', async ({ page }) => {
      // Open modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      const modal = page.locator('[role="dialog"]').first()
      await expect(modal).toBeVisible()

      // Find all focusable elements within the modal
      const focusableElements = modal.locator('button, input, [tabindex]:not([tabindex="-1"])')
      const count = await focusableElements.count()

      if (count > 1) {
        // Tab to the last focusable element
        for (let i = 1; i < count; i++) {
          await page.keyboard.press('Tab')
        }

        // Get the last element
        const lastElement = focusableElements.nth(count - 1)
        await expect(lastElement).toBeFocused()

        // Tab again should wrap to first element
        await page.keyboard.press('Tab')

        const firstElement = focusableElements.first()
        await expect(firstElement).toBeFocused()
      }
    })

    test('should trap focus: Shift+Tab from first focusable element wraps to last', async ({ page }) => {
      // Open modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      const modal = page.locator('[role="dialog"]').first()
      await expect(modal).toBeVisible()

      // Find all focusable elements within the modal
      const focusableElements = modal.locator('button, input, [tabindex]:not([tabindex="-1"])')
      const count = await focusableElements.count()

      if (count > 1) {
        // First element should be focused after modal opens
        const firstElement = focusableElements.first()
        await expect(firstElement).toBeFocused()

        // Shift+Tab should wrap to last element
        await page.keyboard.press('Shift+Tab')

        const lastElement = focusableElements.nth(count - 1)
        await expect(lastElement).toBeFocused()
      }
    })

    test('should restore focus to triggering element when closed', async ({ page }) => {
      // Get the modal trigger button
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()

      // Focus on the trigger button
      await modalTrigger.focus()
      await expect(modalTrigger).toBeFocused()

      // Open modal
      await modalTrigger.click()

      const modal = page.locator('[role="dialog"]').first()
      await expect(modal).toBeVisible()

      // Close modal via Escape
      await page.keyboard.press('Escape')

      // Focus should return to the trigger button
      await expect(modalTrigger).toBeFocused()
    })
  })

  test.describe('Nested Overlay Behavior', () => {
    test('should maintain body overflow: hidden with nested overlays', async ({ page }) => {
      // Get initial overflow
      const initialOverflow = await page.evaluate(() => {
        return document.body.style.overflow
      })
      expect(initialOverflow).not.toBe('hidden')

      // Open first modal
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()

      const firstModal = page.locator('[role="dialog"]').first()
      await expect(firstModal).toBeVisible()

      const overflowFirstOpen = await page.evaluate(() => {
        return document.body.style.overflow
      })
      expect(overflowFirstOpen).toBe('hidden')

      // Open second modal (nested)
      const secondModalTrigger = firstModal.locator('button:has-text("Open Modal")')
      if (await secondModalTrigger.count() > 0) {
        await secondModalTrigger.click()

        const secondModal = page.locator('[role="dialog"]').nth(1)
        await expect(secondModal).toBeVisible()

        const overflowBothOpen = await page.evaluate(() => {
          return document.body.style.overflow
        })
        expect(overflowBothOpen).toBe('hidden')

        // Close second modal
        await page.keyboard.press('Escape')

        const overflowAfterSecondClose = await page.evaluate(() => {
          return document.body.style.overflow
        })
        // Should still be hidden because first modal is still open
        expect(overflowAfterSecondClose).toBe('hidden')
      }

      // Close first modal
      await page.keyboard.press('Escape')

      const overflowAfterAllClose = await page.evaluate(() => {
        return document.body.style.overflow
      })
      // Should be restored to original
      expect(overflowAfterAllClose).toBe('')
    })
  })

  test.describe('ConfirmDialog Component', () => {
    test('should render confirm dialog with title and message', async ({ page }) => {
      // Find and click the trigger button for confirm dialog
      const confirmTrigger = page.locator('button:has-text("Open Confirm")').first()
      await confirmTrigger.click()

      // Dialog should be visible
      const dialog = page.locator('[role="dialog"]').first()
      await expect(dialog).toBeVisible()

      // Check for title
      const title = page.locator('.modal__title')
      await expect(title).toBeVisible()

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('confirm-dialog-open.png', {
        maxDiffPixelRatio: 0.01,
      })
    })

    test('should call onConfirm and close when confirm button is clicked', async ({ page }) => {
      // Open confirm dialog
      const confirmTrigger = page.locator('button:has-text("Open Confirm")').first()
      await confirmTrigger.click()

      const dialog = page.locator('[role="dialog"]').first()
      await expect(dialog).toBeVisible()

      // Click confirm button (danger variant button)
      const confirmButton = page.locator('button:has-text("Delete")').first()
      await expect(confirmButton).toBeVisible()
      await confirmButton.click()

      // Dialog should close after confirmation
      await expect(dialog).not.toBeVisible()
    })

    test('should close without confirming when cancel button is clicked', async ({ page }) => {
      // Open confirm dialog
      const confirmTrigger = page.locator('button:has-text("Open Confirm")').first()
      await confirmTrigger.click()

      const dialog = page.locator('[role="dialog"]').first()
      await expect(dialog).toBeVisible()

      // Click cancel button
      const cancelButton = page.locator('button:has-text("Cancel")').first()
      await cancelButton.click()

      // Dialog should close
      await expect(dialog).not.toBeVisible()
    })

    test('should support danger variant styling', async ({ page }) => {
      // Open confirm dialog
      const confirmTrigger = page.locator('button:has-text("Open Confirm")').first()
      await confirmTrigger.click()

      // Check for danger button styling
      const dangerButton = page.locator('button[class*="danger"]').first()
      if (await dangerButton.count() > 0) {
        const bgColor = await dangerButton.evaluate((el) => {
          return window.getComputedStyle(el).backgroundColor
        })
        expect(bgColor).toBeTruthy()
      }
    })
  })

  test.describe('Toast Component', () => {
    test('should render when isOpen is true', async ({ page }) => {
      await openToastWithClockPaused(page)

      // Toast should be visible
      const toast = page.locator('[role="status"]').first()
      await expect(toast).toBeVisible()

      await freezeAnimations(page)
      // The toast renders below the Tooltip and Popover sections, past the bottom of a
      // 720px viewport, so a viewport-only screenshot never contains it.
      await expect(page).toHaveScreenshot('toast-open.png', {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      })
    })

    test('should auto-dismiss after duration', async ({ page }) => {
      // Click toast trigger
      const toastTrigger = page.locator('button:has-text("Show Toast")').first()
      await toastTrigger.click()

      const toast = page.locator('[role="status"]').first()
      await expect(toast).toBeVisible()

      // Wait for auto-dismiss (default 4000ms)
      await page.waitForTimeout(4500)

      // Toast should be hidden
      await expect(toast).not.toBeVisible()
    })

    test('should close immediately when close button is clicked', async ({ page }) => {
      // Click toast trigger
      const toastTrigger = page.locator('button:has-text("Show Toast")').first()
      await toastTrigger.click()

      const toast = page.locator('[role="status"]').first()
      await expect(toast).toBeVisible()

      // Click close button
      const closeButton = page.locator('.toast__close').first()
      await closeButton.click()

      // Toast should be hidden
      await expect(toast).not.toBeVisible()
    })

    test('should display title and subtitle', async ({ page }) => {
      // Click toast trigger
      const toastTrigger = page.locator('button:has-text("Show Toast")').first()
      await toastTrigger.click()

      // Check title
      const title = page.locator('.toast__title').first()
      await expect(title).toBeVisible()
      expect(await title.textContent()).toBeTruthy()
    })

    test('should support different variants with appropriate icons', async ({ page }) => {
      // Test different toast variants
      const variants = ['success', 'error', 'warning', 'info']

      for (const variant of variants) {
        const trigger = page.locator(`button:has-text("Show ${variant.charAt(0).toUpperCase() + variant.slice(1)} Toast")`).first()
        if (await trigger.count() > 0) {
          await trigger.click()

          const toast = page.locator(`[role="status"].toast--${variant}`).first()
          if (await toast.count() > 0) {
            await expect(toast).toBeVisible()

            // Check for icon
            const icon = toast.locator('svg').first()
            if (await icon.count() > 0) {
              await expect(icon).toBeVisible()
            }

            await page.keyboard.press('Escape')
          }
        }
      }
    })
  })

  test.describe('Tooltip Component', () => {
    test('should show on hover after the configured delay and hide on pointer leave', async ({ page }) => {
      const trigger = page.locator('button:has-text("Top")').first()
      await trigger.hover()

      const tooltip = page.locator('[role="tooltip"]').first()
      await expect(tooltip).toBeVisible()
      await expect(tooltip).toHaveText('Appears above the trigger')

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('tooltip-top-open.png', {
        maxDiffPixelRatio: 0.01,
      })

      // Move the pointer elsewhere on the page to leave the trigger + tooltip
      await page.mouse.move(10, 10)
      await expect(tooltip).not.toBeVisible()
    })

    test('should support bottom, left, and right placements', async ({ page }) => {
      const placements: Array<{ label: string; text: string }> = [
        { label: 'Bottom', text: 'Appears below the trigger' },
        { label: 'Left', text: 'Appears left of the trigger' },
        { label: 'Right', text: 'Appears right of the trigger' },
      ]

      for (const { label, text } of placements) {
        const trigger = page.locator(`button:has-text("${label}")`).first()
        await trigger.hover()

        const tooltip = page.locator('[role="tooltip"]').first()
        await expect(tooltip).toBeVisible()
        await expect(tooltip).toHaveText(text)

        await page.mouse.move(10, 10)
        await expect(tooltip).not.toBeVisible()
      }
    })

    test('should not show when disabled', async ({ page }) => {
      const trigger = page.locator('button:has-text("Disabled")').first()
      await trigger.hover()

      // Give it more than the default delay to confirm it never appears
      await page.waitForTimeout(400)

      const tooltip = page.locator('[role="tooltip"]')
      await expect(tooltip).toHaveCount(0)

      await page.mouse.move(10, 10)
    })

    test('should stay visible when the pointer moves from the trigger onto the tooltip content', async ({ page }) => {
      const trigger = page.locator('button:has-text("Top")').first()
      await trigger.hover()

      const tooltip = page.locator('[role="tooltip"]').first()
      await expect(tooltip).toBeVisible()

      // Move the pointer from the trigger directly onto the tooltip content —
      // it must remain visible since the pointer never left the trigger+tooltip region.
      await tooltip.hover()
      await expect(tooltip).toBeVisible()

      // Only leaving both the trigger and the tooltip should hide it.
      await page.mouse.move(10, 10)
      await expect(tooltip).not.toBeVisible()
    })

    test('should associate the trigger with the tooltip via aria-describedby', async ({ page }) => {
      const trigger = page.locator('button:has-text("No delay")').first()
      await trigger.hover()

      const tooltip = page.locator('[role="tooltip"]').first()
      await expect(tooltip).toBeVisible()

      const describedBy = await trigger.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      await expect(tooltip).toHaveAttribute('id', describedBy as string)

      await page.mouse.move(10, 10)
    })
  })

  test.describe('Tooltip dark canvas', () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page)
    })

    test('tooltip dark snapshot', async ({ page }) => {
      const trigger = page.locator('button:has-text("Top")').first()
      await trigger.hover()

      const tooltip = page.locator('[role="tooltip"]').first()
      await expect(tooltip).toBeVisible()

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('tooltip-top-open-dark.png', {
        maxDiffPixelRatio: 0.01,
      })

      await page.mouse.move(10, 10)
    })
  })

  test.describe('Modal dark canvas', () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page)
    })

    test('modal dark snapshot', async ({ page }) => {
      const modalTrigger = page.locator('button:has-text("Open Modal")').first()
      await modalTrigger.click()
      const modal = page.locator('[role="dialog"]').first()
      await expect(modal).toBeVisible()
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('modal-open-dark.png', {
        maxDiffPixelRatio: 0.01,
      })
    })
  })

  test.describe('ConfirmDialog dark canvas', () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page)
    })

    test('confirm dialog dark snapshot', async ({ page }) => {
      const confirmTrigger = page.locator('button:has-text("Open Confirm")').first()
      await confirmTrigger.click()
      const dialog = page.locator('[role="dialog"]').first()
      await expect(dialog).toBeVisible()
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('confirm-dialog-open-dark.png', {
        maxDiffPixelRatio: 0.01,
      })
    })
  })

  test.describe('Toast dark canvas', () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page)
    })

    test('toast dark snapshot', async ({ page }) => {
      await openToastWithClockPaused(page)
      const toast = page.locator('[role="status"]').first()
      await expect(toast).toBeVisible()
      await freezeAnimations(page)
      // The toast renders below the Tooltip and Popover sections, past the bottom of a
      // 720px viewport, so a viewport-only screenshot never contains it.
      await expect(page).toHaveScreenshot('toast-open-dark.png', {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      })
    })
  })

  test.describe('Popover Component', () => {
    test('should open on trigger click', async ({ page }) => {
      // Find the first popover trigger
      const trigger = page.locator('[aria-haspopup="dialog"]').first()
      await trigger.click()

      // Popover should be visible with role="dialog"
      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('popover-top-open.png', {
        maxDiffPixelRatio: 0.01,
      })
    })

    test('should close on Escape key', async ({ page }) => {
      // Open popover
      const trigger = page.locator('[aria-haspopup="dialog"]').first()
      await trigger.click()

      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      // Press Escape
      await page.keyboard.press('Escape')

      // Popover should be hidden
      await expect(popover).not.toBeVisible()
    })

    test('should close on outside click', async ({ page }) => {
      // Open popover
      const trigger = page.locator('[aria-haspopup="dialog"]').nth(1)
      await trigger.click()

      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      // Click outside the popover and trigger
      await page.click('body', { position: { x: 50, y: 50 } })

      // Popover should be hidden
      await expect(popover).not.toBeVisible()
    })

    test('should open via keyboard activation (Enter)', async ({ page }) => {
      // Focus the trigger
      const trigger = page.locator('[aria-haspopup="dialog"]').nth(2)
      await trigger.focus()

      // Press Enter
      await page.keyboard.press('Enter')

      // Popover should be visible
      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('popover-left-open.png', {
        maxDiffPixelRatio: 0.01,
      })
    })

    test('should open via keyboard activation (Space)', async ({ page }) => {
      // Focus the trigger
      const trigger = page.locator('[aria-haspopup="dialog"]').nth(3)
      await trigger.focus()

      // Press Space
      await page.keyboard.press(' ')

      // Popover should be visible
      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('popover-right-open.png', {
        maxDiffPixelRatio: 0.01,
      })
    })

    test('should return focus to trigger on close', async ({ page }) => {
      // Get trigger element
      const trigger = page.locator('[aria-haspopup="dialog"]').first()

      // Click to open
      await trigger.click()

      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      // Close via Escape
      await page.keyboard.press('Escape')

      // Trigger should have focus
      await expect(trigger).toBeFocused()
    })

    test('should support interactive content without closing', async ({ page }) => {
      // Open popover with interactive content ("With Link" - 5th popover)
      const trigger = page.locator('[aria-haspopup="dialog"]').nth(4)
      await trigger.click()

      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      // Click a button inside the popover - should NOT close it
      const button = popover.locator('button').first()
      await button.click()

      // Popover should still be visible
      await expect(popover).toBeVisible()

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('popover-interactive.png', {
        maxDiffPixelRatio: 0.01,
      })
    })

    test('trigger should have correct ARIA attributes', async ({ page }) => {
      const trigger = page.locator('[aria-haspopup="dialog"]').first()

      // Check aria-haspopup
      await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')

      // Check aria-expanded is false when closed
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      // Open popover
      await trigger.click()

      // Check aria-expanded is true when open
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')

      // Check aria-controls points to panel id
      const ariaControls = await trigger.getAttribute('aria-controls')
      expect(ariaControls).toBeTruthy()

      const popover = page.locator(`[id="${ariaControls}"]`)
      await expect(popover).toBeVisible()
    })

    test('panel should have correct role', async ({ page }) => {
      // Open popover
      const trigger = page.locator('[aria-haspopup="dialog"]').nth(1)
      await trigger.click()

      // Check panel role
      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toHaveAttribute('role', 'dialog')
    })

    test('panel should not be inside aria-hidden ancestor while open', async ({ page }) => {
      // Open popover
      const trigger = page.locator('[aria-haspopup="dialog"]').first()
      await trigger.click()

      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      // Check that popover is not inside aria-hidden=true
      const ariaHidden = await popover.evaluate((el) => {
        let current: HTMLElement | null = el.parentElement
        while (current) {
          if (current.getAttribute('aria-hidden') === 'true') {
            return true
          }
          current = current.parentElement
        }
        return false
      })

      expect(ariaHidden).toBe(false)
    })

    test('should support bottom placement', async ({ page }) => {
      const trigger = page.locator('[aria-haspopup="dialog"]').nth(1)
      await trigger.click()

      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('popover-bottom-open.png', {
        maxDiffPixelRatio: 0.01,
      })
    })

    test('controlled mode: should open and close via external state', async ({ page }) => {
      // Find the controlled popover trigger (labeled "Controlled")
      const trigger = page.locator('button:has-text("Controlled")').first()

      // Initially should be closed
      let popover = page.locator('[role="dialog"][aria-modal="false"]')
      await expect(popover).toHaveCount(0)

      // Click trigger to open
      await trigger.click()

      // Popover should now be visible
      popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      // Click the close button inside the popover
      const closeButton = popover.locator('button:has-text("Close")').first()
      await closeButton.click()

      // Popover should be closed
      await expect(popover).not.toBeVisible()
    })

    test('controlled mode: should respond to external state changes', async ({ page }) => {
      // Find the controlled popover trigger
      const trigger = page.locator('button:has-text("Controlled")').first()

      // Open the popover
      await trigger.click()

      let popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      // Close via the internal close button
      const closeButton = popover.locator('button:has-text("Close")').first()
      await closeButton.click()

      // Popover should close
      await expect(popover).not.toBeVisible()

      // Open again
      await trigger.click()
      popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      // Close via Escape
      await page.keyboard.press('Escape')

      // Should be closed
      await expect(popover).not.toBeVisible()
    })
  })

  test.describe('Popover dark canvas', () => {
    test.beforeEach(async ({ page }) => {
      await applyDarkCanvasMode(page)
    })

    test('popover dark snapshot', async ({ page }) => {
      const trigger = page.locator('[aria-haspopup="dialog"]').first()
      await trigger.click()

      const popover = page.locator('[role="dialog"][aria-modal="false"]').first()
      await expect(popover).toBeVisible()

      await freezeAnimations(page)
      await expect(page).toHaveScreenshot('popover-open-dark.png', {
        maxDiffPixelRatio: 0.01,
      })
    })
  })
})
