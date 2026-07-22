// Serializers — web-v1 dialect emission (spec §8.1) with the landed #46
// escape semantics (§8.2 RESOLVED), and the fromMarkdown port of web's
// parser semantics (clamps, folding, list/quote/hr rules).

import { describe, expect, it } from 'vitest'
import { fromMarkdown, parseInlineToRuns, toJSON, toMarkdown } from '../src/markdown.ts'
import type { BlockNode } from '../src/types.ts'
import { doc, heading, hr, item, list, para, quote, run, tid } from './helpers.ts'

describe('toMarkdown emission', () => {
  it('emits the A1 shape: heading then paragraph', () => {
    const d = doc(heading(tid(), 1, run('Hello')), para(tid(), run('world')))
    expect(toMarkdown(d)).toBe('# Hello\n\nworld')
  })

  it('emits marks in dialect form', () => {
    const d = doc(
      para(
        tid(),
        run('a '),
        run('b', { type: 'strong' }),
        run(' c '),
        run('d', { type: 'em' }),
        run(' '),
        run('e', { type: 'code' }),
        run(' '),
        run('f', { type: 'link', attrs: { href: 'https://x.dev/' } }),
      ),
    )
    expect(toMarkdown(d)).toBe('a **b** c *d* `e` [f](https://x.dev/)')
  })

  it('renumbers ordered lists and prefixes bullets', () => {
    const d = doc(
      list(tid(), true, item(tid(), run('one')), item(tid(), run('two'))),
      list(tid(), false, item(tid(), run('x'))),
    )
    expect(toMarkdown(d)).toBe('1. one\n2. two\n\n- x')
  })

  it('emits blockquote and hr', () => {
    const d = doc(quote(tid(), run('wisdom')), hr(tid()))
    expect(toMarkdown(d)).toBe('> wisdom\n\n---')
  })
})

describe('escape semantics (§8.2 RESOLVED — T7)', () => {
  it('escapes inline markup characters in text runs', () => {
    const d = doc(para(tid(), run('literal *a* _b_ `c` [d] |e|')))
    const md = toMarkdown(d)
    expect(md).toBe('literal \\*a\\* \\_b\\_ \\`c\\` \\[d\\] \\|e\\|')
    // and the parse round-trips to the literal text
    const back = fromMarkdown(md)
    expect((back.children[0] as unknown as { content: [{ text: string }] }).content[0].text).toBe(
      'literal *a* _b_ `c` [d] |e|',
    )
  })

  it('escapes structural line starts in paragraphs', () => {
    expect(toMarkdown(doc(para(tid(), run('# not a heading'))))).toBe('\\# not a heading')
    expect(toMarkdown(doc(para(tid(), run('- not a bullet'))))).toBe('\\- not a bullet')
    expect(toMarkdown(doc(para(tid(), run('> not a quote'))))).toBe('\\> not a quote')
    expect(toMarkdown(doc(para(tid(), run('1. not a list'))))).toBe('1\\. not a list')
    expect(toMarkdown(doc(para(tid(), run('---'))))).toBe('\\---')
  })

  it('structural escapes round-trip as literal paragraphs', () => {
    for (const text of ['# not a heading', '- not a bullet', '> nope', '1. literal', '---']) {
      const back = fromMarkdown(toMarkdown(doc(para(tid(), run(text)))))
      expect(back.children).toHaveLength(1)
      expect((back.children[0] as BlockNode).type).toBe('paragraph')
      expect((back.children[0] as unknown as { content: [{ text: string }] }).content[0].text).toBe(
        text,
      )
    }
  })

  it('code spans are verbatim inside — backtick content uses a longer delimiter, never a backslash', () => {
    const d = doc(para(tid(), run('a`b', { type: 'code' })))
    const md = toMarkdown(d)
    expect(md).toBe('``a`b``')
    expect(md).not.toContain('\\`')
    const back = fromMarkdown(md)
    const runs = (
      back.children[0] as unknown as { content: { text: string; mark: { type: string } }[] }
    ).content
    expect(runs[0]?.text).toBe('a`b')
    expect(runs[0]?.mark?.type).toBe('code')
  })

  it('code span starting/ending with a backtick is space-padded', () => {
    const d = doc(para(tid(), run('`tick', { type: 'code' })))
    const md = toMarkdown(d)
    expect(md).toBe('`` `tick ``')
    const back = fromMarkdown(md)
    const runs = (back.children[0] as unknown as { content: { text: string }[] }).content
    expect(runs[0]?.text).toBe('`tick')
  })

  it('escapes markup INSIDE strong/em/link labels', () => {
    const d = doc(para(tid(), run('a*b', { type: 'strong' })))
    const md = toMarkdown(d)
    expect(md).toBe('**a\\*b**')
    const back = fromMarkdown(md)
    const runs = (
      back.children[0] as unknown as { content: { text: string; mark: { type: string } }[] }
    ).content
    expect(runs[0]?.text).toBe('a*b')
    expect(runs[0]?.mark?.type).toBe('strong')
  })
})

describe('fromMarkdown (web parser semantics)', () => {
  it('clamps deep headings to 3 (web parity)', () => {
    const d = fromMarkdown('##### deep')
    expect((d.children[0] as unknown as { attrs: { level: number } }).attrs.level).toBe(3)
  })

  it('folds consecutive quote lines into one blockquote', () => {
    const d = fromMarkdown('> a\n> b')
    expect(d.children).toHaveLength(1)
    expect((d.children[0] as BlockNode).type).toBe('blockquote')
    expect((d.children[0] as unknown as { content: [{ text: string }] }).content[0].text).toBe(
      'a b',
    )
  })

  it('folds paragraph soft-wraps with single spaces', () => {
    const d = fromMarkdown('line one\nline two')
    expect(d.children).toHaveLength(1)
    expect((d.children[0] as unknown as { content: [{ text: string }] }).content[0].text).toBe(
      'line one line two',
    )
  })

  it('parses `1)` ordered markers and `*` bullets', () => {
    const d = fromMarkdown('1) a\n2) b\n\n* c')
    expect((d.children[0] as unknown as { attrs: { ordered: boolean } }).attrs.ordered).toBe(true)
    expect((d.children[1] as unknown as { attrs: { ordered: boolean } }).attrs.ordered).toBe(false)
  })

  it('drops unsafe link hrefs but keeps labels (T2)', () => {
    // web parity: the href regex stops at the FIRST `)`, so the outer `)`
    // survives as literal text — exactly what web's parseInline produces.
    const runs = parseInlineToRuns('[x](javascript:alert(1))')
    expect(runs).toHaveLength(1)
    expect(runs[0]?.mark).toBeNull()
    expect(runs[0]?.text).toBe('x)')
    const safe = parseInlineToRuns('[x](javascript:alert%281%29)')
    expect(safe[0]?.mark).toBeNull()
    expect(safe[0]?.text).toBe('x')
  })

  it('uses the href as label when the label is empty (web parity)', () => {
    const runs = parseInlineToRuns('[](https://x.dev/)')
    expect(runs[0]?.text).toBe('https://x.dev/')
    expect(runs[0]?.mark).toEqual({ type: 'link', attrs: { href: 'https://x.dev/' } })
  })

  it('code spans win over emphasis (web ordering)', () => {
    const runs = parseInlineToRuns('`a*b*c`')
    expect(runs).toHaveLength(1)
    expect(runs[0]?.mark?.type).toBe('code')
    expect(runs[0]?.text).toBe('a*b*c')
  })

  it('degrades fences and tables to paragraphs (documented v1 floor)', () => {
    const d = fromMarkdown('```js\ncode line\n```\n\n| a | b |\n| --- | --- |\n| c | d |')
    for (const b of d.children) expect((b as BlockNode).type).toBe('paragraph')
    expect(d.children.length).toBe(3) // 1 code line + header row + data row
  })

  it('empty input yields the empty doc (I1)', () => {
    const d = fromMarkdown('')
    expect(d.children).toHaveLength(1)
    expect((d.children[0] as BlockNode).type).toBe('paragraph')
  })
})

describe('toJSON canonical form', () => {
  it('emits stable key order and no undefineds', () => {
    const d = doc(heading(tid(), 2, run('t')), para(tid(), run('x', { type: 'strong' })))
    const json = toJSON(d)
    expect(Object.keys(json)).toEqual(['schema', 'version', 'children'])
    expect(Object.keys(json.children[0] as object)).toEqual(['id', 'type', 'attrs', 'content'])
    expect(JSON.stringify(json)).not.toContain('undefined')
  })
})
