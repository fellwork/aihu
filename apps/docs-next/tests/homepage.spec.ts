// apps/docs-next/tests/homepage.spec.ts
import { expect, test } from '@playwright/test'

test('page title contains aihu', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/aihu/)
})

test('homepage renders without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  const res = await page.goto('/', { waitUntil: 'load' })
  expect(res?.status()).toBe(200)
  // 'load' (not 'networkidle') — this is a static SSG page with no polling
  // connections, so 'load' already captures hydration-time console errors
  // without the flake risk of waiting for zero in-flight network activity.
  expect(errors).toEqual([])
})
