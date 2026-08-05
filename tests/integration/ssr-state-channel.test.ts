/**
 * Wave-3 state channel — SSR state serialization round-trip.
 *
 * The full loop under test: a hydratable server render emits ONE
 * `<script type="application/json" id="__aihu_state__">` envelope
 * (`{ v: 1, stores, signals? }`); the client parses it, adopts stores via
 * `hydrateStores()` BEFORE component setup, and arbor's `hydrate()` pre-seeds
 * component-local signals from the `signals` record during the walk. The
 * load-bearing assertions are ADOPTION assertions:
 *
 *   - derivation/data-fetch functions are NOT re-invoked on the client
 *     (the fetch-if-empty guard sees the adopted value, not the default),
 *   - a component-local signal reads the SERVER value after hydrate,
 *   - `host.innerHTML` is byte-identical across hydrate (state confirmed,
 *     never rewritten),
 *   - persist-plugin localStorage BEATS the SSR snapshot (the store's
 *     documented precedence: local edits are the fresher truth),
 *   - a page with NO state script hydrates exactly as before (regression).
 *
 * Every fixture is REAL `renderToString(…, { hydratable: true })` output —
 * never a hand-written blob (same posture as ssr-hydrate-path-parity).
 *
 * jsdom note: `resolveRegistry()` sees `window` on both "sides" here, so both
 * phases use the module-singleton registry; `_resetStoreRegistry()` between
 * them is the "new page load". That is exactly the store package's own
 * round-trip convention (packages/store/tests/serialize-hydrate.test.ts).
 */

import type { AttrMap } from '@aihu/arbor'
import { branch, leaf } from '@aihu/arbor'
import { hydrate } from '@aihu/arbor/hydrate'
import { _setStoreSerializer, renderToString } from '@aihu/server'
import { computed, type Signal, signal } from '@aihu/signals'
import {
  _resetStoreRegistry,
  createPersistPlugin,
  defineStore,
  hydrateStores,
  registerStorePlugin,
  type StorageLike,
  serializeStores,
} from '@aihu/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** The "data fetch" — the thing hydration must NOT re-run. */
const deriveSpy = vi.fn(() => 41)

/** Unique store ids per test run (defineStore ids are registry-global). */
let storeCounter = 0
function defineCounter() {
  return defineStore(`counter-${++storeCounter}`, () => {
    const [count, setCount] = signal(0)
    const double = computed(() => count() * 2)
    function load(): void {
      setCount(deriveSpy())
    }
    return { count, setCount, double, load }
  })
}

/**
 * The test app: a store-backed derived text, a component-local signal text,
 * and a reactive class attr. `label`/`theme` are passed in so the server can
 * hold non-default values the client factory does not know (the realistic
 * analog: values derived from request data during server setup).
 */
function makeApp(
  useCounter: ReturnType<typeof defineCounter>,
  label: Signal<string>,
  theme: Signal<string>,
) {
  return () => {
    const store = useCounter()
    // Fetch-if-empty: the exact pattern SSR adoption must short-circuit.
    if ((store.count as () => number)() === 0) {
      ;(store.load as () => void)()
    }
    return branch('div', { class: theme } as unknown as AttrMap, [
      leaf(label),
      branch('p', undefined, [
        leaf([
          () => `n=${(store.count as () => number)()},d=${(store.double as () => number)()}`,
        ] as unknown as Parameters<typeof leaf>[0]),
      ]),
    ])
  }
}

const SCRIPT_RE = /<script type="application\/json" id="__aihu_state__">([\s\S]*?)<\/script>/

interface Envelope {
  v: number
  stores: Record<string, Record<string, unknown>>
  signals?: Record<string, unknown>
}

function extractEnvelope(html: string): Envelope {
  const m = html.match(SCRIPT_RE)
  expect(m).not.toBeNull()
  return JSON.parse((m as RegExpMatchArray)[1] as string) as Envelope
}

beforeEach(() => {
  _resetStoreRegistry()
  _setStoreSerializer(serializeStores)
  deriveSpy.mockClear()
})

afterEach(() => {
  _setStoreSerializer(undefined)
  _resetStoreRegistry()
})

// ── The round trip ───────────────────────────────────────────────────────────

describe('SSR state channel — server emission', () => {
  it('hydratable render emits one envelope with stores AND signals', async () => {
    const useCounter = defineCounter()
    const app = makeApp(useCounter, signal('server-title'), signal('theme-server'))
    const html = await renderToString(app, { hydratable: true })

    expect(deriveSpy).toHaveBeenCalledTimes(1) // the server DID derive

    const env = extractEnvelope(html)
    expect(env.v).toBe(1)
    // stores: the counter store's state (load() ran server-side → 41).
    const storeId = `counter-${storeCounter}`
    expect(env.stores[storeId]).toEqual({ count: 41 })
    // signals: writable bindings only, at hydrate-compatible path keys.
    // The derived store text (thunk array, no writer) must NOT appear.
    expect(env.signals).toEqual({
      '0.attr:class': 'theme-server',
      '0.0.text': 'server-title',
    })
  })

  it('non-hydratable render emits NO state script (destination property)', async () => {
    const useCounter = defineCounter()
    const app = makeApp(useCounter, signal('x'), signal('y'))
    const html = await renderToString(app)
    expect(html).not.toContain('__aihu_state__')
  })

  it('state-free hydratable render emits NO script (byte-identical HTML)', async () => {
    const app = () => branch('div', undefined, [leaf('static only')])
    const html = await renderToString(app, { hydratable: true })
    expect(html).not.toContain('__aihu_state__')
  })

  it('JSON embedding is XSS-safe: </script and <!-- cannot appear literally', async () => {
    const evil = signal('</script><script>alert(1)</script><!--')
    const app = () => branch('div', undefined, [leaf(evil)])
    const html = await renderToString(app, { hydratable: true })
    const m = html.match(SCRIPT_RE)
    expect(m).not.toBeNull()
    const body = (m as RegExpMatchArray)[1] as string
    expect(body).not.toContain('</')
    expect(body).not.toContain('<!--')
    expect(body).toContain('\\u003c')
    // …and the escaping is lossless.
    const env = JSON.parse(body) as Envelope
    expect(env.signals?.['0.0.text']).toBe('</script><script>alert(1)</script><!--')
  })
})

describe('SSR state channel — client adoption (the round trip)', () => {
  it('hydrate ADOPTS server state: no re-derivation, signals seeded, DOM untouched', async () => {
    // ── Server ──
    const useCounter = defineCounter()
    const serverApp = makeApp(useCounter, signal('server-title'), signal('theme-server'))
    const html = await renderToString(serverApp, { hydratable: true })
    expect(deriveSpy).toHaveBeenCalledTimes(1)

    // ── "New page load" ──
    _resetStoreRegistry()
    deriveSpy.mockClear()

    const host = document.createElement('div')
    host.innerHTML = html
    const beforeHtml = host.innerHTML

    // ── Client bootstrap: parse envelope, adopt stores BEFORE any setup ──
    const env = extractEnvelope(html)
    hydrateStores(env.stores)

    // ── Client hydrate: same tree shape, DEFAULT local values ──
    const clientLabel = signal('default')
    const clientTheme = signal('theme-default')
    const clientApp = makeApp(useCounter, clientLabel, clientTheme)
    const scope = hydrate(clientApp, host, env.signals ?? {})

    // NO re-derivation: the fetch-if-empty guard saw the adopted 41, not 0.
    expect(deriveSpy).not.toHaveBeenCalled()

    // Store adoption is observable through the instance…
    const store = useCounter()
    expect((store.count as () => number)()).toBe(41)
    expect((store.double as () => number)()).toBe(82) // getters re-derive from adopted state

    // …component-local signals adopted the server values…
    expect(clientLabel[0]()).toBe('server-title')
    expect(clientTheme[0]()).toBe('theme-server')

    // …and the DOM was CONFIRMED, not rewritten (adoption, byte-identical).
    expect(host.innerHTML).toBe(beforeHtml)
    expect(host.textContent).toContain('server-title')
    expect(host.textContent).toContain('n=41,d=82')

    // Reactivity still lives after seeding: a client write flows to the DOM.
    ;(store.setCount as (v: number) => void)(50)
    expect(host.textContent).toContain('n=50,d=100')

    scope.dispose()
  })

  it('a page with NO state script hydrates exactly as today (regression)', async () => {
    const label = signal('plain')
    const app = () => branch('div', undefined, [leaf(label), leaf(' static')])
    _setStoreSerializer(undefined) // nothing registered — pre-wave-3 world
    // Strip the signals script: this fixture simulates HTML from a server
    // that predates the state channel (or terminal HTML re-hydrated later).
    const html = (await renderToString(app, { hydratable: true })).replace(SCRIPT_RE, '')
    expect(html).not.toContain('__aihu_state__')

    const host = document.createElement('div')
    host.innerHTML = html
    const beforeHtml = host.innerHTML
    const scope = hydrate(app, host, {}) // empty snapshot, as before
    expect(host.innerHTML).toBe(beforeHtml)
    expect(label[0]()).toBe('plain') // nothing seeded
    label[1]('updated')
    expect(host.textContent).toContain('updated') // wiring intact
    scope.dispose()
  })
})

describe('SSR state channel — persist precedence', () => {
  function makeStorage(seed: Record<string, string>): StorageLike & {
    data: Map<string, string>
  } {
    const data = new Map(Object.entries(seed))
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    }
  }

  it('localStorage beats the SSR snapshot when both exist (documented rule)', () => {
    const storage = makeStorage({ 'aihu:prefs-a': JSON.stringify({ theme: 'local-edited' }) })
    const unregister = registerStorePlugin(createPersistPlugin({ storage }))
    try {
      const usePrefs = defineStore(
        'prefs-a',
        { state: () => ({ theme: 'default' }) },
        { persist: true },
      )
      // SSR snapshot arrives first (bootstrap order)…
      hydrateStores({ 'prefs-a': { theme: 'server-theme' } })
      // …then instantiation: pending SSR adoption runs BEFORE plugins, the
      // persist plugin patches from storage AFTER — storage wins.
      const prefs = usePrefs()
      expect((prefs.theme as () => string)()).toBe('local-edited')
    } finally {
      unregister()
    }
  })

  it('SSR snapshot applies when storage has no entry', () => {
    const storage = makeStorage({})
    const unregister = registerStorePlugin(createPersistPlugin({ storage }))
    try {
      const usePrefs = defineStore(
        'prefs-b',
        { state: () => ({ theme: 'default' }) },
        { persist: true },
      )
      hydrateStores({ 'prefs-b': { theme: 'server-theme' } })
      const prefs = usePrefs()
      expect((prefs.theme as () => string)()).toBe('server-theme')
    } finally {
      unregister()
    }
  })
})
