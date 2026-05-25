import { renderMarkdown } from '@aihu-plugin/kindly-note'
import json from '@kindly-note/lang-json'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetMarkdownState } from '../src/render-markdown.ts'

beforeEach(() => {
  // Each test starts from a clean lazy-load slate so the render function is
  // re-resolved and state doesn't leak across tests.
  __resetMarkdownState()
})

// A representative CommonMark sample exercising headings, bold/italic, links,
// lists, inline code, and a fenced code block — the acceptance surface.
const SAMPLE = [
  '# Title',
  '',
  'A paragraph with **bold** and _italic_ and a [link](https://example.com).',
  '',
  '- one',
  '- two',
  '',
  'Inline `code` here.',
].join('\n')

describe('renderMarkdown() — safe semantic HTML against published @kindly-note/render-markdown@0.1.0', () => {
  it('renders a CommonMark sample into correct semantic HTML', async () => {
    const html = await renderMarkdown(SAMPLE)

    // Headings.
    expect(html).toContain('<h1>Title</h1>')
    // Bold / italic.
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    // Links (safe href preserved).
    expect(html).toContain('<a href="https://example.com">link</a>')
    // Lists.
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
    // Inline code.
    expect(html).toContain('<code>code</code>')
  })

  it('renders a fenced code block as <pre><code>', async () => {
    const html = await renderMarkdown('```\nplain fence\n```')
    expect(html).toContain('<pre><code>plain fence</code></pre>')
  })

  it('highlights a fenced code block when its language pack is provided', async () => {
    const html = await renderMarkdown('```json\n{"a": 1}\n```', { languages: [json] })
    // kn-prefixed scoped spans from the kindly-note JSON tokenizer.
    expect(html).toContain('<span class="kn-attr">&quot;a&quot;</span>')
    expect(html).toContain('<span class="kn-number">1</span>')
    expect(html).toContain('<span class="kn-punctuation">{</span>')
  })

  it('honors a custom classPrefix for highlighted code-fence spans', async () => {
    const html = await renderMarkdown('```json\n{"a": 1}\n```', {
      languages: [json],
      classPrefix: 'x-',
    })
    expect(html).toContain('<span class="x-attr">&quot;a&quot;</span>')
    expect(html).not.toContain('kn-attr')
  })

  it('forwards no opts identically to passing an empty opts object', async () => {
    expect(await renderMarkdown(SAMPLE)).toBe(await renderMarkdown(SAMPLE, {}))
  })
})

describe('renderMarkdown() — security defaults (XSS neutralized by the emitter)', () => {
  it('neutralizes a raw <script> tag (escaped, not executable)', async () => {
    const html = await renderMarkdown('Hello\n\n<script>alert(1)</script>')
    // The raw HTML is escaped to text — no live <script> element is emitted.
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('strips a javascript: link href', async () => {
    const html = await renderMarkdown('[click](javascript:alert(1))')
    // The dangerous scheme is removed; the link text survives without an href.
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<a>click</a>')
  })

  it('neutralizes an unsafe data: image source', async () => {
    const html = await renderMarkdown('![x](data:text/html,<script>alert(1)</script>)')
    // No unsafe data: URL and no live <script> survive the emitter's defaults.
    expect(html).not.toContain('data:text/html')
    expect(html).not.toContain('<script>')
  })
})
