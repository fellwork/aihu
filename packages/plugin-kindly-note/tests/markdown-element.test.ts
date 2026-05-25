import { signal } from '@aihu/signals'
import {
  type AihuMarkdownElement,
  defineMarkdownElement,
  getAihuMarkdownElement,
} from '@aihu-plugin/kindly-note'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetMarkdownState } from '../src/render-markdown.ts'

beforeEach(() => {
  __resetMarkdownState()
})

/**
 * Wait for the element's async renderMarkdown() to land. The render path has an
 * async hop: the lazy `import()` of `@kindly-note/render-markdown` (the peer is
 * dynamically imported so the package is import-safe without it) plus the
 * render call. A fixed turn count is brittle against that, so poll a predicate
 * until it holds (or a generous bound elapses).
 */
async function settle(predicate?: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    if (predicate?.() ?? false) return
  }
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

/** The rendered markup lives in the element's open shadow root. */
function shadowHtml(el: Element): string {
  return (el as HTMLElement).shadowRoot?.innerHTML ?? ''
}

describe('<aihu-markdown> custom element', () => {
  it('defineMarkdownElement() registers the tag idempotently', () => {
    expect(defineMarkdownElement()).toBe('aihu-markdown')
    expect(defineMarkdownElement()).toBe('aihu-markdown') // second call is a no-op
    expect(customElements.get('aihu-markdown')).toBe(getAihuMarkdownElement())
  })

  it('renders semantic HTML from declarative light-DOM text into the shadow root', async () => {
    defineMarkdownElement()
    const el = document.createElement('aihu-markdown')
    el.textContent = '# Hello\n\n**bold** and a [link](https://example.com).'
    document.body.appendChild(el)

    await settle(() => shadowHtml(el).includes('<h1>'))

    const html = shadowHtml(el)
    expect(html).toContain('<h1>Hello</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<a href="https://example.com">link</a>')

    el.remove()
  })

  it('re-renders reactively when a signal-backed source changes', async () => {
    defineMarkdownElement()
    const [getSrc, setSrc] = signal('# First')
    const el = document.createElement('aihu-markdown') as AihuMarkdownElement
    el.source = getSrc // pass the signal reader → element subscribes
    document.body.appendChild(el)

    await settle(() => shadowHtml(el).includes('<h1>First</h1>'))
    expect(shadowHtml(el)).toContain('<h1>First</h1>')

    // Mutate the signal — the element's effect re-runs and re-renders.
    setSrc('## Second')
    await settle(() => shadowHtml(el).includes('<h2>Second</h2>'))
    expect(shadowHtml(el)).toContain('<h2>Second</h2>')
    expect(shadowHtml(el)).not.toContain('<h1>First</h1>')

    el.remove()
  })

  it('accepts `markdown` as an alias of `source`', async () => {
    defineMarkdownElement()
    const el = document.createElement('aihu-markdown') as AihuMarkdownElement
    el.markdown = '_em_'
    document.body.appendChild(el)

    await settle(() => shadowHtml(el).includes('<em>'))
    expect(shadowHtml(el)).toContain('<em>em</em>')
    // The getter mirrors the same backing field.
    expect(el.source).toBe('_em_')

    el.remove()
  })

  it('neutralizes a <script>/javascript: payload in the rendered shadow output', async () => {
    defineMarkdownElement()
    const el = document.createElement('aihu-markdown') as AihuMarkdownElement
    el.source = '<script>alert(1)</script>\n\n[x](javascript:alert(2))'
    document.body.appendChild(el)

    await settle(() => shadowHtml(el).includes('alert'))
    const html = shadowHtml(el)
    // No live <script> element and no javascript: scheme survive.
    expect(el.shadowRoot?.querySelector('script')).toBeNull()
    expect(html).not.toContain('javascript:')
    expect(html).toContain('&lt;script&gt;')

    el.remove()
  })
})
