// apps/docs/tests/navigation.spec.ts
//
// WS5 client-nav repoint guard. The 214 KB window.__DOCS__ inline-HTML blob is
// GONE — on a client-side page switch docs-shell now FETCHES the target page's
// prerendered dist/<id>/index.html and renders its #prerendered-content body.
// These tests are the user-visible acceptance: clicking a nav link must render
// the TARGET page's real content in the shadow <article> — pages must NOT go
// blank without __DOCS__.
import { expect, type Page, test } from '@playwright/test'

/** Click a shadow-DOM nav link by its hash href. */
async function clickNav(page: Page, href: string): Promise<void> {
  await page.evaluate((h) => {
    const shell = document.querySelector('docs-shell')
    const link = shell?.shadowRoot?.querySelector(`a[href="${h}"]`) as HTMLElement | null
    if (!link) throw new Error(`nav link ${h} not found in docs-shell shadow root`)
    link.click()
  }, href)
}

function articleText(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      document
        .querySelector('docs-shell')
        ?.shadowRoot?.querySelector('article')
        ?.textContent?.trim() ?? '',
  )
}

test('clicking Installation nav link updates hash and renders the Installation body', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('docs-shell')?.shadowRoot != null, {
    timeout: 10_000,
  })

  await clickNav(page, '#installation')
  await expect(page).toHaveURL(/#installation/)

  // The fetched-then-rendered article must carry the INSTALLATION page's real
  // body text (proves the __DOCS__-free fetch path works — not a blank page).
  await page.waitForFunction(
    () => {
      const article = document.querySelector('docs-shell')?.shadowRoot?.querySelector('article')
      return (article?.textContent ?? '').toLowerCase().includes('install')
    },
    { timeout: 10_000 },
  )
  const text = await articleText(page)
  expect(text.length).toBeGreaterThan(50)
  expect(text.toLowerCase()).toContain('install')
})

test('navigating to a NESTED guide renders its body, not a blank page', async ({ page }) => {
  // Start on the home page (introduction prerender), then SPA-nav to a nested
  // slug whose prerendered file lives two dirs deep (/guides/reactivity/).
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('docs-shell')?.shadowRoot != null, {
    timeout: 10_000,
  })

  await clickNav(page, '#guides/reactivity')
  await expect(page).toHaveURL(/#guides\/reactivity/)

  // The Reactivity body fetched from /guides/reactivity/index.html must render.
  await page.waitForFunction(
    () => {
      const article = document.querySelector('docs-shell')?.shadowRoot?.querySelector('article')
      return (article?.textContent ?? '').includes('reactive foundation')
    },
    { timeout: 10_000 },
  )
  const text = await articleText(page)
  expect(text).toContain('reactive foundation')
})
