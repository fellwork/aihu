// apps/docs/tests/playground.spec.ts
//
// Directive 1 acceptance — verify the six preset snippets ship and the
// URL-share roundtrip works.
import { expect, test } from '@playwright/test'

const PRESET_IDS = ['counter', 'todo', 'agent-block', 'ssr', 'route', 'plugin']

// <playground-embed> is inside <docs-shell>'s shadow root, so each
// helper pierces two layers of shadow DOM to reach it.

async function presetTab(page: import('@playwright/test').Page, id: string) {
  return page.evaluateHandle((presetId) => {
    const shell = document.querySelector('docs-shell')
    const embed = shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null
    if (!embed?.shadowRoot) return null
    return embed.shadowRoot.querySelector(`.preset-tab[data-preset-id="${presetId}"]`)
  }, id)
}

async function activePresetId(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const embed = shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null
    if (!embed?.shadowRoot) return null
    const active = embed.shadowRoot.querySelector('.preset-tab[aria-pressed="true"]')
    return active?.getAttribute('data-preset-id') ?? null
  })
}

async function gotoPlayground(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/${query}#playground`)
  await page.waitForFunction(
    () => {
      const shell = document.querySelector('docs-shell')
      const embed = shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null
      return embed?.shadowRoot != null
    },
    { timeout: 10_000 },
  )
}

test('renders all 6 preset tabs', async ({ page }) => {
  await gotoPlayground(page)
  for (const id of PRESET_IDS) {
    const tab = await presetTab(page, id)
    expect(tab.asElement()).not.toBeNull()
  }
})

test('selecting a preset updates the URL with ?preset=', async ({ page }) => {
  await gotoPlayground(page)
  await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const embed = shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null
    const tab = embed?.shadowRoot?.querySelector(
      '.preset-tab[data-preset-id="todo"]',
    ) as HTMLButtonElement | null
    tab?.click()
  })
  await expect.poll(() => page.url()).toMatch(/\?preset=todo/)
  expect(await activePresetId(page)).toBe('todo')
})

test('default preset (counter) keeps URL clean — no ?preset=counter', async ({ page }) => {
  await gotoPlayground(page)
  expect(page.url()).not.toMatch(/preset=counter/)
  expect(await activePresetId(page)).toBe('counter')
})

test('?preset=agent-block in URL loads that preset on cold visit', async ({ page }) => {
  await gotoPlayground(page, '?preset=agent-block')
  expect(await activePresetId(page)).toBe('agent-block')
})

test('?src=<source> roundtrip: cold-load arbitrary source', async ({ page }) => {
  const customSource = '@state {}\n@template { <h1>hello</h1> }\n@style {}'
  await gotoPlayground(page, `?src=${encodeURIComponent(customSource)}`)
  const loaded = await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const embed = shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null
    const editor = embed?.shadowRoot?.querySelector('code-editor') as
      | (HTMLElement & { value: string })
      | null
    return editor?.value ?? null
  })
  expect(loaded).toBe(customSource)
  // No preset is active for arbitrary sources.
  expect(await activePresetId(page)).toBeNull()
})
