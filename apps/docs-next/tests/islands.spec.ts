// apps/docs-next/tests/islands.spec.ts
//
// Guards the per-route island loading contract. `src/main.ts` deliberately
// contains NO `import './components/*.aihu'` side-effect lines — the file
// router's `virtual:aihu-components` registry loads each route's islands
// lazily instead. Two things have to hold for that to be correct, and both
// have silently broken before:
//
//   1. Nested islands must still upgrade. `<search-box>` / `<theme-toggle>`
//      live inside site-header's @template, not a layout's, and the compiler
//      emits them as bare tags with NO import — so they only get defined if
//      the registry loads a component's TRANSITIVE children (router `genC`).
//      Before that fix the app had to eagerly import all six islands.
//   2. Islands must not leak onto routes that don't use them. That eager
//      import is exactly what put counter-demo + weather-demo in the entry
//      chunk, making all 75 pages pay for demos two pages use.
import { expect, test } from '@playwright/test'

test('nested islands upgrade, and unused islands never load', async ({ page }) => {
  await page.goto('/guides/getting-started')
  await page.waitForFunction(() => customElements.get('site-header') != null, {
    timeout: 10_000,
  })
  // The registry resolves a parent and its children in one Promise.all, but
  // the defines land across microtasks — give them a beat before asserting.
  await page.waitForFunction(
    () => customElements.get('search-box') != null && customElements.get('theme-toggle') != null,
    { timeout: 10_000 },
  )

  const defined = await page.evaluate(() => ({
    counter: customElements.get('counter-demo') != null,
    weather: customElements.get('weather-demo') != null,
  }))
  // A guide page references neither demo, so neither may be defined.
  expect(defined.counter, 'counter-demo must not load on a guide page').toBe(false)
  expect(defined.weather, 'weather-demo must not load on a guide page').toBe(false)

  // The search trigger is search-box's own rendered output — proves the
  // nested island did more than get `define()`d, it actually rendered.
  await expect(page.locator('.dn-search-trigger').first()).toBeAttached()
})

test('a route that DOES use an island loads it', async ({ page }) => {
  await page.goto('/')
  // The homepage's route.json lists weather-demo.
  await page.waitForFunction(() => customElements.get('weather-demo') != null, {
    timeout: 10_000,
  })
  expect(await page.evaluate(() => customElements.get('weather-demo') != null)).toBe(true)
})
