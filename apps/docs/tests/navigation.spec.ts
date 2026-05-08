// apps/docs/tests/navigation.spec.ts
import { test, expect } from '@playwright/test'

test('clicking Installation nav link updates hash and renders content', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() =>
    document.querySelector('docs-shell')?.shadowRoot != null
  , { timeout: 10_000 })

  // Click the Installation link inside the shadow DOM
  await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const link = shell?.shadowRoot?.querySelector('a[href="#installation"]') as HTMLElement | null
    link?.click()
  })

  // Hash should update
  await expect(page).toHaveURL(/#installation/)

  // Article content should be non-trivially populated
  const articleText = await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    return shell?.shadowRoot?.querySelector('article')?.textContent?.trim() ?? ''
  })
  expect(articleText.length).toBeGreaterThan(50)
})
