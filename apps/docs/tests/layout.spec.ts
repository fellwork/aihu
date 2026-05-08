// apps/docs/tests/layout.spec.ts
import { expect, test } from '@playwright/test'

test('article is horizontally centered within docs-content at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('docs-shell')?.shadowRoot != null, {
    timeout: 10_000,
  })
  // Wait until article is rendered and visible (non-zero width guards against
  // a display:none ancestor returning zero rects before reactive class binds)
  await page.waitForFunction(
    () => {
      const shell = document.querySelector('docs-shell')
      const article = shell?.shadowRoot?.querySelector('article')
      return article != null && article.getBoundingClientRect().width > 0
    },
    { timeout: 10_000 },
  )

  const margins = await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const article = shell?.shadowRoot?.querySelector('article')
    const content = shell?.shadowRoot?.querySelector('.docs-content')
    if (!article || !content) return null
    const articleR = article.getBoundingClientRect()
    const contentR = content.getBoundingClientRect()
    return {
      leftMargin: articleR.left - contentR.left,
      rightMargin: contentR.right - articleR.right,
    }
  })

  expect(margins).not.toBeNull()
  // Left and right margins within .docs-content must match within 4px
  expect(Math.abs(margins!.leftMargin - margins!.rightMargin)).toBeLessThan(4)
})
