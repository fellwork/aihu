// apps/docs/tests/navigation.spec.ts
import { expect, test } from '@playwright/test'

test('clicking Installation nav link updates hash and renders content', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('docs-shell')?.shadowRoot != null, {
    timeout: 10_000,
  })

  // Click the Installation link inside the shadow DOM
  await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const link = shell?.shadowRoot?.querySelector('a[href="#installation"]') as HTMLElement | null
    if (!link) throw new Error('Installation nav link not found in docs-shell shadow root')
    link.click()
  })

  // Hash should update
  await expect(page).toHaveURL(/#installation/)

  // Wait for the hashchange handler to fire and reactive re-render to complete
  await page.waitForFunction(
    () => {
      const shell = document.querySelector('docs-shell')
      const article = shell?.shadowRoot?.querySelector('article')
      return article != null && (article.textContent?.trim().length ?? 0) > 50
    },
    { timeout: 5_000 },
  )

  // Article content should be non-trivially populated
  const articleText = await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    return shell?.shadowRoot?.querySelector('article')?.textContent?.trim() ?? ''
  })
  expect(articleText.length).toBeGreaterThan(50)
})
