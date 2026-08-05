// apps/docs/tests/navigation.spec.ts
import { expect, test } from '@playwright/test'

test('a guide page resolves at its canonical extensionless URL', async ({ page }) => {
  const res = await page.goto('/guides/getting-started')
  expect(res?.status()).toBe(200)
  await expect(page).toHaveTitle(/Getting Started/)
})

test('a generated API datasheet page renders', async ({ page }) => {
  const res = await page.goto('/api/signals')
  expect(res?.status()).toBe(200)
  await expect(page).toHaveTitle(/@aihu\/signals/)
})

test('client-side navigation from home to a guide does not hard-reload', async ({ page }) => {
  await page.goto('/')
  // A marker on `window` only survives if the document is never torn down —
  // a hard reload (full navigation) creates a fresh window and loses it, so
  // this actually distinguishes SPA routing from a disguised full reload
  // (asserting on URL/title alone would pass either way).
  await page.evaluate(() => {
    ;(window as unknown as { __navMarker__: boolean }).__navMarker__ = true
  })
  await page.locator('a[href="/guides/getting-started"]').first().click()
  await expect(page).toHaveURL(/\/guides\/getting-started$/)
  await expect(page).toHaveTitle(/Getting Started/)
  expect(
    await page.evaluate(() => (window as unknown as { __navMarker__?: boolean }).__navMarker__),
  ).toBe(true)
})
