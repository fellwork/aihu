import { ensureLanguage, highlight, isLanguageRequested } from '@aihu-plugin/kindly-note'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetHighlighterState } from '../src/highlight.ts'

beforeEach(() => {
  // Each test starts from a clean lazy-load slate so isLanguageRequested()
  // assertions are meaningful and don't leak across tests.
  __resetHighlighterState()
})

describe('highlight() — scoped-span output against published @kindly-note@0.1.0', () => {
  it('highlights JSON into kn- scoped spans', async () => {
    const out = await highlight('{"a": 1, "b": true}', 'json')

    expect(out.fallback).toBe(false)
    expect(out.language).toBe('JSON') // canonical name from the engine
    // Token scopes from the kindly-note JSON tokenizer.
    expect(out.html).toContain('<span class="kn-attr">&quot;a&quot;</span>')
    expect(out.html).toContain('<span class="kn-number">1</span>')
    expect(out.html).toContain('<span class="kn-literal">true</span>')
    expect(out.html).toContain('<span class="kn-punctuation">{</span>')
  })

  it('highlights TypeScript into kn- scoped spans', async () => {
    const out = await highlight('const x: number = 42', 'typescript')

    expect(out.fallback).toBe(false)
    expect(out.language).toBe('TypeScript')
    expect(out.html).toContain('<span class="kn-keyword">const</span>')
    expect(out.html).toContain('<span class="kn-number">42</span>')
  })

  it('resolves a language by alias (ts → TypeScript)', async () => {
    const out = await highlight('let y = 1', 'ts')
    expect(out.fallback).toBe(false)
    expect(out.language).toBe('TypeScript')
    expect(out.html).toContain('<span class="kn-keyword">let</span>')
  })

  it('falls back to escaped source for an unknown language (no throw)', async () => {
    const out = await highlight('a < b && c > d', 'totally-not-a-language')

    expect(out.fallback).toBe(true)
    expect(out.language).toBeUndefined()
    // HTML-escaped so the raw source still renders safely.
    expect(out.html).toBe('a &lt; b &amp;&amp; c &gt; d')
    expect(out.html).not.toContain('<span')
  })
})

describe('lazy language loading', () => {
  it('does not fetch a language until it is used', async () => {
    // Nothing requested before the first call.
    expect(isLanguageRequested('json')).toBe(false)
    expect(isLanguageRequested('typescript')).toBe(false)

    await highlight('{"x": 1}', 'json')

    // json was loaded on demand; typescript was NOT touched.
    expect(isLanguageRequested('json')).toBe(true)
    expect(isLanguageRequested('typescript')).toBe(false)
  })

  it('loads each language exactly once (concurrent calls share one load)', async () => {
    // Fire two concurrent ensureLanguage() calls for the same id; both resolve
    // to the same registered canonical name, proving the load is shared.
    const [a, b] = await Promise.all([ensureLanguage('json'), ensureLanguage('json')])
    expect(a).toBe('JSON')
    expect(b).toBe('JSON')
    expect(isLanguageRequested('json')).toBe(true)
  })

  it('ensureLanguage returns null for an unresolvable id', async () => {
    const result = await ensureLanguage('no-such-lang-xyz')
    expect(result).toBeNull()
  })
})
