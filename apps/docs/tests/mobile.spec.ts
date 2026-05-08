// apps/docs/tests/mobile.spec.ts
import { expect, test } from '@playwright/test'

test('docs content fills viewport width at 375px (single-column layout)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('docs-shell')?.shadowRoot != null, {
    timeout: 10_000,
  })
  await page.waitForFunction(
    () => {
      const shell = document.querySelector('docs-shell')
      const content = shell?.shadowRoot?.querySelector('.docs-content')
      return content != null && content.getBoundingClientRect().width > 0
    },
    { timeout: 10_000 },
  )

  const contentWidth = await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const content = shell?.shadowRoot?.querySelector('.docs-content')
    if (!content) return null
    return content.getBoundingClientRect().width
  })

  expect(contentWidth).not.toBeNull()
  // In single-column layout, .docs-content fills ≥85% of the 375px viewport
  expect(contentWidth!).toBeGreaterThan(375 * 0.85)
})
