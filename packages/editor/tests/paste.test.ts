// Paste sanitization (spec §6.1, acceptance A5) — inert DOMParser allowlist
// walk in jsdom. Security by construction: scripts never execute, attributes
// never survive, hrefs pass safeHref at build time.

import { describe, expect, it } from 'vitest'
import { plainTextToBlocks, sanitizeHtmlToBlocks } from '../src/paste-sanitize.ts'
import type { BlockNode, TextNode } from '../src/types.ts'

function textOf(b: BlockNode): string {
  if (b.type === 'hr') return ''
  if (b.type === 'list')
    return b.children.map((i) => i.content.map((r) => r.text).join('')).join('|')
  return b.content.map((r) => r.text).join('')
}

describe('A5 — the acceptance payload', () => {
  it('drops the script, the handler attr, and the javascript: href; keeps the text', () => {
    const blocks = sanitizeHtmlToBlocks(
      '<script>alert(1)</script><p onclick=x>hi <a href="javascript:alert(1)">l</a></p>',
    )
    expect(blocks).toHaveLength(1)
    const p = blocks[0] as Extract<BlockNode, { type: 'paragraph' }>
    expect(p.type).toBe('paragraph')
    // content is exactly the text 'hi ' + 'l' — adjacent unmarked runs
    // normalize (I3) into one run; no link mark, no script anywhere
    expect(textOf(p)).toBe('hi l')
    for (const run of p.content) expect(run.mark).toBeNull()
  })

  it('no script element is ever attached to the live document', () => {
    const before = document.querySelectorAll('script').length
    sanitizeHtmlToBlocks('<script src="https://evil.example/x.js"></script><p>x</p>')
    expect(document.querySelectorAll('script').length).toBe(before)
  })
})

describe('allowlist walk', () => {
  it('maps headings, lists, quotes, hr, and marks', () => {
    const blocks = sanitizeHtmlToBlocks(
      '<h2>Title</h2><ul><li>a</li><li><b>b</b></li></ul><ol><li>n</li></ol><blockquote>q</blockquote><hr><p><em>e</em> <code>c</code></p>',
    )
    const types = blocks.map((b) => b.type)
    expect(types).toEqual(['heading', 'list', 'list', 'blockquote', 'hr', 'paragraph'])
    expect((blocks[0] as unknown as { attrs: { level: number } }).attrs.level).toBe(2)
    expect((blocks[1] as unknown as { attrs: { ordered: boolean } }).attrs.ordered).toBe(false)
    expect((blocks[2] as unknown as { attrs: { ordered: boolean } }).attrs.ordered).toBe(true)
    const marked = (blocks[1] as Extract<BlockNode, { type: 'list' }>).children[1]?.content[0]
    expect(marked?.mark?.type).toBe('strong')
  })

  it('clamps h4–h6 to level 3 (I5)', () => {
    const blocks = sanitizeHtmlToBlocks('<h5>deep</h5>')
    expect((blocks[0] as unknown as { attrs: { level: number } }).attrs.level).toBe(3)
  })

  it('keeps safe hrefs, drops every other attribute', () => {
    const blocks = sanitizeHtmlToBlocks(
      '<p><a href="https://x.dev/a" onclick="x" style="color:red" target="_blank">ok</a></p>',
    )
    const run = (blocks[0] as Extract<BlockNode, { type: 'paragraph' }>).content[0] as TextNode
    expect(run.mark).toEqual({ type: 'link', attrs: { href: 'https://x.dev/a' } })
  })

  it('unknown elements contribute only their text content', () => {
    const blocks = sanitizeHtmlToBlocks(
      '<p><font color="red">legacy</font> <custom-el>widget</custom-el></p>',
    )
    expect(textOf(blocks[0] as BlockNode)).toBe('legacy widget')
  })

  it('style/template/iframe contribute NOTHING, not even text (T5)', () => {
    const blocks = sanitizeHtmlToBlocks(
      '<style>.x{}</style><template><p>ghost</p></template><p>real</p>',
    )
    expect(blocks).toHaveLength(1)
    expect(textOf(blocks[0] as BlockNode)).toBe('real')
  })

  it('one mark per run (I4): nested b>em keeps the innermost', () => {
    const blocks = sanitizeHtmlToBlocks('<p><b>bold <em>both</em></b></p>')
    const runs = (blocks[0] as Extract<BlockNode, { type: 'paragraph' }>).content
    expect(runs[0]?.mark?.type).toBe('strong')
    expect(runs[1]?.mark?.type).toBe('em')
  })

  it('tables degrade to one paragraph per row (v2 floor)', () => {
    const blocks = sanitizeHtmlToBlocks(
      '<table><tr><th>a</th><th>b</th></tr><tr><td>c</td><td>d</td></tr></table>',
    )
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph'])
    expect(textOf(blocks[0] as BlockNode)).toBe('a b')
  })

  it('pre degrades to code-marked paragraphs per line (v2 floor)', () => {
    const blocks = sanitizeHtmlToBlocks('<pre>line one\nline two</pre>')
    expect(blocks).toHaveLength(2)
    expect((blocks[0] as Extract<BlockNode, { type: 'paragraph' }>).content[0]?.mark?.type).toBe(
      'code',
    )
  })

  it('nested divs flatten to paragraphs', () => {
    const blocks = sanitizeHtmlToBlocks('<div><div><p>a</p><p>b</p></div></div>')
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph'])
  })

  it('features degrade content: lists off ⇒ list content falls to text paragraphs', () => {
    const blocks = sanitizeHtmlToBlocks('<ul><li>a</li></ul>', { lists: false })
    expect(blocks.some((b) => b.type === 'list')).toBe(false)
  })
})

describe('plain-text paste', () => {
  it('splits lines into paragraphs and skips blanks', () => {
    const blocks = plainTextToBlocks('one\n\ntwo\r\nthree\n')
    expect(blocks.map((b) => textOf(b))).toEqual(['one', 'two', 'three'])
  })
})
