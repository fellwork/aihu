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

test('tall preset (todo) preview is not clipped — iframe fills its pane within a clamped, scrollable layout', async ({
  page,
}) => {
  // Give the embed a generous viewport so the .playground clamp resolves to
  // its 720px max and the assertion isn't height-starved on a tiny window.
  await page.setViewportSize({ width: 1280, height: 1400 })
  await gotoPlayground(page)

  // Select the tall preset.
  await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const embed = shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null
    const tab = embed?.shadowRoot?.querySelector(
      '.preset-tab[data-preset-id="todo"]',
    ) as HTMLButtonElement | null
    tab?.click()
  })
  await expect.poll(() => activePresetId(page)).toBe('todo')

  // Probe geometry + computed CSS by piercing two shadow layers to the
  // iframe inside <playground-embed>. We assert on box geometry and CSS
  // (NOT rendered preview pixels) so the test is robust to WASM absence:
  // dist/wasm is fetched at prebuild and may be missing in some runs.
  const probe = await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const embed = shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null
    const sr = embed?.shadowRoot
    if (!sr) return null
    const iframe = sr.querySelector('iframe') as HTMLIFrameElement | null
    const previewPane = sr.querySelector('.preview-pane') as HTMLElement | null
    const pane = sr.querySelector('.pane') as HTMLElement | null
    const playground = sr.querySelector('.playground') as HTMLElement | null
    if (!iframe || !previewPane || !pane || !playground || !embed) return null
    const ifr = iframe.getBoundingClientRect()
    const pr = previewPane.getBoundingClientRect()
    return {
      iframeHeight: iframe.clientHeight,
      iframeTop: ifr.top,
      iframeBottom: ifr.bottom,
      paneTop: pr.top,
      paneBottom: pr.bottom,
      paneMinHeight: getComputedStyle(pane).minHeight,
      playgroundHeight: getComputedStyle(playground).height,
      hostOverflow: getComputedStyle(embed).overflow,
    }
  })

  expect(probe).not.toBeNull()
  const p = probe!

  // (a) The iframe is laid out and fills its pane (the fix): it has a real
  // height and does not overflow past the preview pane's box (allow a 1px
  // sub-pixel slack).
  expect(p.iframeHeight).toBeGreaterThan(0)
  expect(p.iframeBottom).toBeLessThanOrEqual(p.paneBottom + 1)
  expect(p.iframeTop).toBeGreaterThanOrEqual(p.paneTop - 1)

  // (b) The CSS contract that makes scroll/auto-grow work:
  //   - .pane has min-height:0 so flex children can shrink below content,
  //   - .playground has a definite (non-auto) clamped height,
  //   - :host retains overflow:hidden (rounded-corner clip — acceptance #3).
  expect(p.paneMinHeight).toBe('0px')
  expect(p.playgroundHeight).not.toBe('auto')
  expect(Number.parseFloat(p.playgroundHeight)).toBeGreaterThan(0)
  expect(p.hostOverflow).toContain('hidden')
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

// Regression guard: presets must stay in sync with the shipped compiler
// grammar. They have drifted before (C306 `$value`, `$each` string form,
// single-identifier interpolation), erroring half the tabs and — because the
// preview only repaints on a successful compile — leaving the preview stuck on
// the last good render ("can't control the preview"). WASM-gated: skipped when
// the build has no ./wasm bundle (the playground shows a fallback message).
async function errorText(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const embed = shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null
    const err = embed?.shadowRoot?.querySelector('.error') as HTMLElement | null
    return err && !err.hidden ? (err.textContent ?? '') : ''
  })
}

test('every preset compiles without a compile error', async ({ page }) => {
  await gotoPlayground(page)
  await page.waitForTimeout(900) // WASM boot + first compile
  const boot = await errorText(page)
  test.skip(boot.includes('WASM bundle unavailable'), 'no ./wasm bundle in this build')

  for (const id of PRESET_IDS) {
    await page.evaluate((pid) => {
      const shell = document.querySelector('docs-shell')
      const embed = shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null
      ;(
        embed?.shadowRoot?.querySelector(
          `.preset-tab[data-preset-id="${pid}"]`,
        ) as HTMLButtonElement | null
      )?.click()
    }, id)
    await expect.poll(() => activePresetId(page)).toBe(id)
    await page.waitForTimeout(400) // debounce + compile
    expect(await errorText(page), `preset "${id}" must compile cleanly`).toBe('')
  }
})

test('code editor stays within its column — no overflow into the preview pane', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await gotoPlayground(page)
  const probe = await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const sr = (shell?.shadowRoot?.querySelector('playground-embed') as HTMLElement | null)
      ?.shadowRoot
    const ce = sr?.querySelector('code-editor') as HTMLElement | null
    const pv = sr?.querySelector('.preview-pane') as HTMLElement | null
    if (!ce || !pv) return null
    return {
      editorRight: ce.getBoundingClientRect().right,
      previewLeft: pv.getBoundingClientRect().left,
    }
  })
  expect(probe).not.toBeNull()
  // The editor's right edge must not cross into the preview column (1px slack).
  expect(probe!.editorRight).toBeLessThanOrEqual(probe!.previewLeft + 1)
})
