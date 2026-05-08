// apps/docs/tests/homepage.spec.ts
import { expect, test } from '@playwright/test'

test('page title contains aihu', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/aihu/)
})

test('docs-shell custom element upgrades', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('docs-shell')?.shadowRoot != null, {
    timeout: 10_000,
  })
})
