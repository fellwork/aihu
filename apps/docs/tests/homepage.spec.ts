// apps/docs/tests/homepage.spec.ts
import { test, expect } from '@playwright/test'

test('page title contains aihu', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/aihu/)
})

test('docs-shell custom element upgrades', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => {
    const shell = document.querySelector('docs-shell')
    return shell?.shadowRoot != null
  }, { timeout: 10_000 })
  const hasShadowRoot = await page.evaluate(() =>
    document.querySelector('docs-shell')?.shadowRoot != null
  )
  expect(hasShadowRoot).toBe(true)
})
