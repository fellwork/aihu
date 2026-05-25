// @vitest-environment node
//
// Import-safety contract: `@aihu-plugin/kindly-note` declares all its
// `@kindly-note/*` packages as OPTIONAL peers (peerDependenciesMeta), and the
// built dist imports them LAZILY via dynamic `import()` inside highlight() /
// ensureLanguage() (highlighting half) and renderMarkdown() (rendering half).
// So merely importing the package — and even defining the `<aihu-code>` /
// `<aihu-markdown>` elements — must NOT require `@kindly-note/*` to be
// installed; they're only needed when highlight()/renderMarkdown() actually
// run. When the highlight peers are absent at call time, highlight() degrades
// to escaped plain text; renderMarkdown() rejects (its peer is required only at
// call time), which `<aihu-markdown>` handles by painting escaped text.
//
// We simulate "peer not installed" by mocking each `@kindly-note/*` module so
// that any attempt to load it rejects (the same failure mode a real missing
// optional peer produces inside `await import('@kindly-note/core')`).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MISSING = (name: string) => () => {
  throw new Error(`Cannot find package '${name}' (simulated missing optional peer)`)
}

beforeEach(() => {
  vi.resetModules()
  vi.doMock('@kindly-note/core', MISSING('@kindly-note/core'))
  vi.doMock('@kindly-note/emitters-html', MISSING('@kindly-note/emitters-html'))
  vi.doMock('@kindly-note/loader-dynamic-import', MISSING('@kindly-note/loader-dynamic-import'))
  vi.doMock('@kindly-note/render-markdown', MISSING('@kindly-note/render-markdown'))
})

afterEach(() => {
  vi.doUnmock('@kindly-note/core')
  vi.doUnmock('@kindly-note/emitters-html')
  vi.doUnmock('@kindly-note/loader-dynamic-import')
  vi.doUnmock('@kindly-note/render-markdown')
  vi.resetModules()
})

describe('import-safety without the @kindly-note/* optional peers', () => {
  it('imports the package and reads its API without touching the peers', async () => {
    // The import itself must not throw even though every @kindly-note/* module
    // is unresolvable — none is imported at module top level.
    const mod = await import('@aihu-plugin/kindly-note')
    expect(typeof mod.highlight).toBe('function')
    expect(typeof mod.defineCodeElement).toBe('function')
    expect(typeof mod.getAihuCodeElement).toBe('function')
    expect(mod.AIHU_CODE_TAG).toBe('aihu-code')
    // Markdown half — same import-safety contract.
    expect(typeof mod.renderMarkdown).toBe('function')
    expect(typeof mod.defineMarkdownElement).toBe('function')
    expect(typeof mod.getAihuMarkdownElement).toBe('function')
    expect(mod.AIHU_MARKDOWN_TAG).toBe('aihu-markdown')
    // The plugin factory is pure registration plumbing — no peer needed.
    expect(() => mod.kindlyNote()).not.toThrow()
  })

  it('builds the <aihu-code> / <aihu-markdown> classes without touching the peers', async () => {
    // Subclassing HTMLElement needs a DOM, not the peers. Provide a minimal stub
    // so getAihu*Element() can run in this node-environment test, and assert
    // both construct without importing any @kindly-note/* module.
    const original = (globalThis as { HTMLElement?: unknown }).HTMLElement
    ;(globalThis as { HTMLElement?: unknown }).HTMLElement = class {} as unknown
    try {
      const { getAihuCodeElement, getAihuMarkdownElement } = await import(
        '@aihu-plugin/kindly-note'
      )
      expect(getAihuCodeElement().tagName).toBe('aihu-code')
      expect(getAihuMarkdownElement().tagName).toBe('aihu-markdown')
    } finally {
      ;(globalThis as { HTMLElement?: unknown }).HTMLElement = original
    }
  })

  it('highlight() degrades to escaped plain text (no throw) when peers are absent', async () => {
    const { highlight } = await import('@aihu-plugin/kindly-note')
    // The dynamic import('@kindly-note/...') rejects → ensureLanguage swallows it
    // and highlight() returns the escaped source instead of throwing.
    const out = await highlight('a < b && c > d', 'typescript')
    expect(out.fallback).toBe(true)
    expect(out.language).toBeUndefined()
    expect(out.html).toBe('a &lt; b &amp;&amp; c &gt; d')
    expect(out.html).not.toContain('<span')
  })

  it('renderMarkdown() rejects (not at import time) when its peer is absent', async () => {
    const { renderMarkdown } = await import('@aihu-plugin/kindly-note')
    // Importing was fine above (the API was read without the peer); only calling
    // renderMarkdown() reaches the lazy import('@kindly-note/render-markdown'),
    // which rejects when the peer is missing — proving the peer is needed at
    // call time, not import time. (We assert rejection rather than a specific
    // message, since the rejection surfaces through vitest's module-mock layer.)
    await expect(renderMarkdown('# hi')).rejects.toThrow()
  })
})
