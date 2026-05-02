/**
 * Parity gate: rustImpl(tree) === tsImpl(tree) byte-for-byte.
 *
 * Scope: static renderToString only. Excluded by spec §1 non-goals:
 *   - renderToStream (async boundaries — JS only)
 *   - opts.serializer (JS callback can't cross FFI)
 *   - opts.contextSetup (JS callback can't cross FFI)
 *   - { toHtml(): string } providers (JS short-circuit — no parity gain)
 *   - hydratable (deferred per OQ-SN-3 — Rust implements it but no parity AC)
 *
 * Skip behavior (per Director session-002):
 *   - SCRIBE_NATIVE_SKIP=1 (the documented escape hatch, set in vitest.config
 *     so fresh clones pass) → loader is in EDGE_SKIPPED state; skip all tests.
 *   - Otherwise, if the loader resolved to NATIVE_LOADED → run all tests.
 *   - Otherwise (loader is in any other state but SKIP isn't set in a test
 *     env) → skip with a clear diagnostic.
 *
 * The CI parity-gate runner unsets SCRIBE_NATIVE_SKIP and builds the addon;
 * if either step is missing the loader throws via AC-9 at module load time,
 * which is the correct CI failure mode (no env-var gate needed).
 */

import fc from 'fast-check'
import { beforeAll, describe, expect, it } from 'vitest'

import { renderToString as tsImpl } from '../src/ssr.ts'
import {
  _getLoaderStateKind,
  _resetLoaderState,
  renderToString as nativeImpl,
} from '../src/loader.ts'
import type { ComponentDescription } from '../src/ssr.ts'

// ---------------------------------------------------------------------------
// Skip-detection. Resolved once in beforeAll; if native is not loaded we
// short-circuit every test below with `if (!nativeLoaded) return`.
// ---------------------------------------------------------------------------

let nativeLoaded = false

beforeAll(() => {
  // SCRIBE_NATIVE_SKIP=1 is the documented escape hatch (spec §5.3) and is
  // set by vitest.config.ts so fresh clones pass without a built addon.
  // When set, we skip every parity test below — there is no native path
  // expected. CI's parity-gate runner unsets this var and builds the addon.
  if (typeof process !== 'undefined' && process.env.SCRIBE_NATIVE_SKIP === '1') {
    nativeLoaded = false
    // eslint-disable-next-line no-console
    console.warn(
      `[native-parity] skipping all tests — SCRIBE_NATIVE_SKIP=1 is set. ` +
        `This is expected on developer machines without a built native addon. ` +
        `CI unsets this var and builds the addon to run the parity gate.`,
    )
    return
  }

  // Important: the loader caches platform/edge detection. Reset so SKIP env
  // changes are picked up if tests are re-run in watch mode.
  _resetLoaderState()
  const kind = _getLoaderStateKind()
  nativeLoaded = kind === 'native-loaded'
  if (!nativeLoaded) {
    // Surface the reason in stderr so CI logs make the skip cause obvious.
    // (On a supported platform with a missing addon, the loader throws at
    // module load — we never reach this branch in that case. This message
    // covers unsupported-platform and edge-skipped cases.)
    // eslint-disable-next-line no-console
    console.warn(
      `[native-parity] skipping all tests — loader state is "${kind}". ` +
        `Build the platform .node addon and ensure @scribe/server-<platform> ` +
        `is resolvable to enable.`,
    )
  }
})

// ---------------------------------------------------------------------------
// §4.3 Named samples (S1-S8)
// ---------------------------------------------------------------------------

interface NamedSample {
  readonly name: string
  readonly factory: () => unknown
}

const namedSamples: ReadonlyArray<NamedSample> = [
  {
    name: 'S1: empty-tree',
    factory: () => ({ kind: 'leaf', text: '' }),
  },
  {
    name: 'S2: single-leaf',
    factory: () => ({ kind: 'leaf', text: 'Hello World' }),
  },
  {
    name: 'S3: single-branch-no-children',
    factory: () => ({ kind: 'branch', tag: 'div', attrs: {}, children: [] }),
  },
  {
    name: 'S4: branch-with-leaf-child',
    factory: () => ({
      kind: 'branch',
      tag: 'p',
      attrs: {},
      children: [{ kind: 'leaf', text: 'X' }],
    }),
  },
  {
    name: 'S5: deeply-nested-5',
    factory: () => {
      // 5 nested branches, each with one leaf child at the bottom.
      let inner: unknown = { kind: 'leaf', text: 'bottom' }
      for (let i = 0; i < 5; i++) {
        inner = {
          kind: 'branch',
          tag: 'div',
          attrs: {},
          children: [inner],
        }
      }
      return inner
    },
  },
  {
    name: 'S6: all-attr-types',
    factory: () => ({
      kind: 'branch',
      tag: 'a',
      // Insertion order matters — JS Object literal order is preserved by
      // Object.entries. The Rust path uses serde_json with preserve_order.
      attrs: { href: '/path', disabled: true, hidden: false, 'data-x': 'val' },
      children: [],
    }),
  },
  {
    name: 'S7: escape-edge-ampersand-quote',
    // Leaf text is NOT escaped (ssr.ts:120-122). Attr value IS escaped:
    // `fo"o` -> `fo&quot;o`. `&` in attr -> `&amp;`.
    factory: () => ({
      kind: 'branch',
      tag: 'span',
      attrs: { title: 'fo"o', 'data-amp': 'a & b' },
      children: [{ kind: 'leaf', text: 'a < b & c > d' }],
    }),
  },
  {
    name: 'S8: unicode-multibyte',
    factory: () => ({
      kind: 'branch',
      tag: 'p',
      attrs: { lang: 'élève' },
      children: [{ kind: 'leaf', text: '中文' }],
    }),
  },
]

describe('native-parity: named samples (S1-S8)', () => {
  for (const sample of namedSamples) {
    it(`${sample.name} — fragment`, async () => {
      if (!nativeLoaded) return
      const ts = await tsImpl(sample.factory)
      const native = await nativeImpl(sample.factory)
      expect(native).toBe(ts)
    })

    it(`${sample.name} — full document with head`, async () => {
      if (!nativeLoaded) return
      const ts = await tsImpl(sample.factory, {
        head: {
          title: 'parity',
          lang: 'en',
          meta: [{ charset: 'utf-8' }],
          links: [{ rel: 'stylesheet', href: '/x.css' }],
        },
      })
      const native = await nativeImpl(sample.factory, {
        head: {
          title: 'parity',
          lang: 'en',
          meta: [{ charset: 'utf-8' }],
          links: [{ rel: 'stylesheet', href: '/x.css' }],
        },
      })
      expect(native).toBe(ts)
    })
  }
})

// ---------------------------------------------------------------------------
// §4.2 Property test — fast-check on randomly generated trees
// ---------------------------------------------------------------------------

const leafArb = fc.record({
  kind: fc.constant('leaf' as const),
  text: fc.string({ maxLength: 200 }),
})

const attrValueArb = fc.oneof(
  fc.string({ maxLength: 100 }),
  fc.constant(true),
  fc.constant(false),
)

const attrMapArb = fc.dictionary(
  fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/),
  attrValueArb,
  { maxKeys: 8 },
)

// Recursive branch arb. fast-check `letrec` handles the depth limit cleanly.
const { tree: treeArb } = fc.letrec((tie) => ({
  tree: fc.oneof(
    { maxDepth: 5 },
    leafArb,
    fc.record({
      kind: fc.constant('branch' as const),
      tag: fc.constantFrom('div', 'span', 'p', 'a', 'section', 'button', 'ul', 'li'),
      attrs: attrMapArb,
      children: fc.array(tie('tree'), { maxLength: 4 }),
    }),
  ),
}))

describe('native-parity: property test', () => {
  it('rustImpl(tree) === tsImpl(tree) for 200 random trees (fragment)', async () => {
    if (!nativeLoaded) return
    await fc.assert(
      fc.asyncProperty(treeArb, async (tree) => {
        const factory: ComponentDescription = () => tree
        const ts = await tsImpl(factory)
        const native = await nativeImpl(factory)
        return ts === native
      }),
      { numRuns: 200, seed: 0xcafe },
    )
  })

  it('rustImpl(tree) === tsImpl(tree) for 100 random trees (full document)', async () => {
    if (!nativeLoaded) return
    await fc.assert(
      fc.asyncProperty(treeArb, async (tree) => {
        const factory: ComponentDescription = () => tree
        const opts = {
          head: {
            title: 'p',
            lang: 'en',
            meta: [{ name: 'description', content: 'parity' }],
            links: [{ rel: 'icon', href: '/f.ico' }],
          },
        }
        const ts = await tsImpl(factory, opts)
        const native = await nativeImpl(factory, opts)
        return ts === native
      }),
      { numRuns: 100, seed: 0xbeef },
    )
  })
})

// ---------------------------------------------------------------------------
// AC-11: edge-runtime detection. Mocks the EdgeRuntime global before the
// loader resolves and verifies the loader enters EDGE_SKIPPED without
// attempting any require().
// ---------------------------------------------------------------------------

describe('loader: edge-runtime detection (AC-11)', () => {
  it('EdgeRuntime global causes EDGE_SKIPPED state', () => {
    // biome-ignore lint/suspicious/noExplicitAny: globalThis mutation for test
    const g = globalThis as any
    const had = 'EdgeRuntime' in g
    const prev = g.EdgeRuntime
    g.EdgeRuntime = 'experimental'
    try {
      _resetLoaderState()
      expect(_getLoaderStateKind()).toBe('edge-skipped')
    } finally {
      if (had) {
        g.EdgeRuntime = prev
      } else {
        delete g.EdgeRuntime
      }
      _resetLoaderState()
    }
  })

  it('SCRIBE_NATIVE_SKIP=1 causes EDGE_SKIPPED state', () => {
    if (typeof process === 'undefined') return
    const prev = process.env.SCRIBE_NATIVE_SKIP
    process.env.SCRIBE_NATIVE_SKIP = '1'
    try {
      _resetLoaderState()
      expect(_getLoaderStateKind()).toBe('edge-skipped')
    } finally {
      if (prev === undefined) delete process.env.SCRIBE_NATIVE_SKIP
      else process.env.SCRIBE_NATIVE_SKIP = prev
      _resetLoaderState()
    }
  })
})

// ---------------------------------------------------------------------------
// Loader fall-through correctness — these MUST work whether native is loaded
// or not, because the loader checks JS-only features before calling Rust.
// ---------------------------------------------------------------------------

describe('loader: JS fall-throughs always use TS implementation', () => {
  it('{ toHtml() } provider routes to TS', async () => {
    const component = { toHtml: () => '<p>direct</p>' }
    const out = await nativeImpl(component)
    expect(out).toBe('<p>direct</p>')
  })

  it('opts.serializer set routes to TS (state script emitted)', async () => {
    const out = await nativeImpl(() => ({ kind: 'leaf', text: 'X' }), {
      head: {},
      serializer: () => ({ count: 1 }),
    })
    expect(out).toContain('__scribe_state__')
    expect(out).toContain('"count":1')
  })

  it('factory throwing propagates the error', async () => {
    const factory = () => {
      throw new Error('boom')
    }
    await expect(nativeImpl(factory)).rejects.toThrow('boom')
  })
})
