// apps/docs-next/tests/shell.spec.ts
//
// Regression guards for two user-reported breakages, both traced to ONE cause:
// the site layout's `@state` called `afterNavigate(...)`, a compiler intrinsic
// that the layout build path failed to lower, so the literal call survived into
// the chunk and threw `ReferenceError: afterNavigate is not defined` during
// setup. That killed the entire <aihu-layout-site> element — so the landing
// page rendered its content with NO header and NO footer, and the layout's
// scroll-reset never ran either.
//
// A silent layout crash is a nasty failure mode: the page still renders (the
// prerendered page content is in #outlet), so nothing looks obviously broken to
// a smoke test that only checks for a 200 and a title. These assert the shell
// itself, and — critically — that the page raises no uncaught error at all.
import { expect, test } from '@playwright/test'

test('landing page renders the full shell with no uncaught errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/', { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('.dn-header') != null, {
    timeout: 10_000,
  })
  await expect(page.locator('.dn-header')).toBeAttached()
  await expect(page.locator('.dn-footer')).toBeAttached()
  // The layout crash surfaced ONLY as an uncaught error — assert on it directly
  // so a future intrinsic that fails to lower can't pass silently again.
  expect(errors, 'no uncaught errors during shell setup').toEqual([])
})

test('navigating resets scroll to the top', async ({ page }) => {
  await page.goto('/guides/getting-started', { waitUntil: 'load' })
  // Wait for the article to be TALL enough to scroll before scrolling. The
  // guide body renders from markdown at hydration, so scrolling too early is a
  // silent no-op and the test would then fail on its own setup rather than on
  // the behavior it means to guard.
  await page.waitForFunction(
    () => document.documentElement.scrollHeight > window.innerHeight + 800,
    { timeout: 10_000 },
  )
  await page.evaluate(() => window.scrollTo(0, 800))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(
      (x) => x.getAttribute('href') === '/guides/installation',
    ) as HTMLAnchorElement | undefined
    a?.click()
  })
  await expect(page).toHaveURL(/\/guides\/installation$/)
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBe(0)
})
