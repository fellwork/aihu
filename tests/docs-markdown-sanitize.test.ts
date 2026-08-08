// @vitest-environment node
/**
 * CodeQL alerts 65/66 — `js/incomplete-multi-character-sanitization` on
 * `apps/docs/src/lib/markdown.ts`: "This string may still contain <script".
 *
 * Both sites were `.replace(/<[^>]*>/g, '')`, which only removes *terminated*
 * tags. Reconstruction-by-nesting isn't the hole here (a removal can't
 * manufacture a new `<`, and `[^>]*` can't cross a `>`, so every surviving `<`
 * lives in the tail after the last `>`) — the hole is the UNTERMINATED tag:
 *
 *   '<div><script src=//evil/x.js'  ->  '<script src=//evil/x.js'
 *
 * i.e. a "tag stripper" handing back the opening of a script tag. The docs
 * markdown source is repo-committed (`src/data/guide-*.ts`), and the anchor-id
 * path narrows to `[\w\s-]` afterwards, so nothing was exploitable in situ —
 * but an incomplete sanitizer is a landmine for the next caller. `stripTags`
 * makes `>` optional so a bare `<` matches on its own and none can survive.
 */
import { describe, expect, it } from 'vitest'
import { renderMarkdown, slugify, stripTags } from '../apps/docs/src/lib/markdown.ts'

/** The pattern this replaced, kept so the regression stays legible. */
const oldStrip = (s: string): string => s.replace(/<[^>]*>/g, '')

describe('stripTags — the bypasses the old pattern let through', () => {
  it.each([
    ['<div><script src=//evil.example/x.js', '<script src=//evil.example/x.js'],
    ['hello <b>world</b> <script', 'hello world <script'],
    ['<script', '<script'],
    ['<p>ok</p><img src=x onerror=alert(1)', 'ok<img src=x onerror=alert(1)'],
  ])('old pattern leaks on %s', (input, leaked) => {
    expect(oldStrip(input)).toBe(leaked)
    expect(oldStrip(input)).toContain('<')
    expect(stripTags(input)).not.toContain('<')
  })
})

describe('stripTags — no `<` survives, ever', () => {
  it.each([
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<a href=">"><script>alert(1)</script>',
    '<<script>script>',
    '<><><<<',
    '<!-- <script> -->',
    '<script>alert(1)</script>',
  ])('strips %s completely', (input) => {
    expect(stripTags(input)).not.toContain('<')
  })

  it('leaves no `<` for any string over the adversarial alphabet (exhaustive to length 5)', () => {
    const alphabet = ['<', '>', 's', 'c', 'r', 'i', 'p', 't', '"', ' ', '/']
    const leaks: string[] = []
    let checked = 0
    const walk = (s: string, depth: number): void => {
      if (depth === 0) {
        checked++
        if (stripTags(s).includes('<')) leaks.push(s)
        return
      }
      for (const ch of alphabet) walk(s + ch, depth - 1)
    }
    for (let len = 0; len <= 5; len++) walk('', len)
    expect(checked).toBe(177_156)
    expect(leaks).toEqual([])
  })
})

describe('stripTags — plain text is untouched', () => {
  it.each([
    ['<b>Deep</b> reactivity', 'Deep reactivity'],
    ['A > B', 'A > B'],
    ['no markup at all', 'no markup at all'],
    ['', ''],
  ])('%s', (input, expected) => {
    expect(stripTags(input)).toBe(expected)
  })
})

describe('slugify — anchor ids are unchanged by the fix', () => {
  it.each([
    ['Getting Started', 'getting-started'],
    ['<code>@state</code> blocks', 'state-blocks'],
    ['SSR & hydration', 'ssr-hydration'],
    ['A > B', 'a-b'],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('can never emit a markup delimiter', () => {
    for (const probe of ['<script', '<div><script src=x', '"><script>alert(1)']) {
      expect(slugify(probe)).not.toMatch(/[<>"']/)
    }
  })
})

describe('renderMarkdown — heading ids stay well-formed', () => {
  it('slugs a heading and links it', () => {
    const html = renderMarkdown('## Getting Started\n')
    expect(html).toContain('id="getting-started"')
    expect(html).toContain('href="#getting-started"')
  })

  it('an unterminated tag in a heading cannot leak into the id', () => {
    const html = renderMarkdown('## Hi <script src=x\n')
    const id = /<h2 id="([^"]*)"/.exec(html)?.[1]
    expect(id).toBeDefined()
    expect(id).not.toContain('<')
    expect(id).not.toContain('"')
  })
})
