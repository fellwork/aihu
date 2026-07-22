// Round-trip acceptance (A4): the golden fixture corpus (vendored in-package;
// cross-repo CI against web's markdown.ts is a fellwork/web follow-up) plus
// 1 000 fuzzed dialect-guarded docs via fast-check.
//
// Contract (spec §8.1): toMarkdown(fromMarkdown(m)) byte-identical for m in
// normal form; fromMarkdown(toMarkdown(d)) ≡ d (mod ids) for dialect-guarded
// docs in normal form (trimmed single-line text, no empty containers).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { normalizeRuns, validateDoc } from '../src/doc.ts'
import { docEqualsIgnoringIds, fromMarkdown, toMarkdown } from '../src/markdown.ts'
import type { BlockNode, DocNode, ListItemNode, Mark, TextNode } from '../src/types.ts'

interface GoldenCase {
  name: string
  markdown: string
  doc: DocNode
}

const golden = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'golden.json'), 'utf8'),
) as GoldenCase[]

describe('golden corpus (doc, markdown) pairs', () => {
  for (const g of golden) {
    it(`${g.name}: doc → markdown is exact`, () => {
      expect(validateDoc(g.doc)).toBeNull()
      expect(toMarkdown(g.doc)).toBe(g.markdown)
    })
    it(`${g.name}: markdown → doc ≡ fixture (mod ids)`, () => {
      const parsed = fromMarkdown(g.markdown)
      expect(docEqualsIgnoringIds(parsed, g.doc)).toBe(true)
    })
    it(`${g.name}: markdown re-serializes byte-identical (normal form)`, () => {
      expect(toMarkdown(fromMarkdown(g.markdown))).toBe(g.markdown)
    })
  }
})

// ---------------------------------------------------------------------------
// fuzzed docs — normal-form generators
// ---------------------------------------------------------------------------

let fuzzId = 0
const fid = () => `f_${fuzzId++}`

/** Words: printable ASCII incl. markup chars (escaping must carry them) + CJK + astral. */
const word = fc.oneof(
  { weight: 6, arbitrary: fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      '*star*',
      '_und_',
      '`tick`',
      '[br]',
      '|pipe|',
      '\\slash',
      '# hash',
      '- dash',
      '1. num',
      '---',
      '>quote',
    ),
  },
  { weight: 1, arbitrary: fc.constantFrom('日本語', '😀🌍', 'a😀b') },
)

const textArb: fc.Arbitrary<string> = fc
  .array(word, { minLength: 1, maxLength: 4 })
  .map((ws) => ws.join(' ').trim())
  .filter((s) => s.length > 0)

const markArb: fc.Arbitrary<Mark | null> = fc.oneof(
  { weight: 5, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constant<Mark>({ type: 'strong' }) },
  { weight: 1, arbitrary: fc.constant<Mark>({ type: 'em' }) },
  { weight: 1, arbitrary: fc.constant<Mark>({ type: 'code' }) },
  {
    weight: 1,
    arbitrary: fc.constantFrom<Mark>(
      { type: 'link', attrs: { href: 'https://example.com/x' } },
      { type: 'link', attrs: { href: '/local/path' } },
      { type: 'link', attrs: { href: 'mailto:a@b.dev' } },
    ),
  },
)

/**
 * Normal-form runs: non-empty trimmed text, no adjacent equal marks, and no
 * cross-run mark ambiguity — plain runs adjacent to marked runs must not end/
 * start with characters that would glue (handled by the space join).
 */
const runsArb: fc.Arbitrary<TextNode[]> = fc
  .array(fc.tuple(textArb, markArb), { minLength: 1, maxLength: 4 })
  .map((pairs) => {
    const runs: TextNode[] = []
    for (const [text, mark] of pairs) {
      const prev = runs[runs.length - 1]
      // join with a space so marked runs never touch their neighbors
      if (prev) prev.text += ' '
      runs.push({ text, mark })
    }
    // I3 normal form: adjacent equal-mark runs merged (the parser emits
    // normalized runs, so the model side must be normalized to compare)
    return normalizeRuns(runs)
  })

const paragraphArb: fc.Arbitrary<BlockNode> = runsArb.map((content) => ({
  id: fid(),
  type: 'paragraph',
  content,
}))

const headingArb: fc.Arbitrary<BlockNode> = fc
  .tuple(fc.constantFrom(1, 2, 3) as fc.Arbitrary<1 | 2 | 3>, runsArb)
  .map(([level, content]) => ({ id: fid(), type: 'heading', attrs: { level }, content }))

const quoteArb: fc.Arbitrary<BlockNode> = runsArb.map((content) => ({
  id: fid(),
  type: 'blockquote',
  content,
}))

const listArb: fc.Arbitrary<BlockNode> = fc
  .tuple(fc.boolean(), fc.array(runsArb, { minLength: 1, maxLength: 3 }))
  .map(([ordered, items]) => ({
    id: fid(),
    type: 'list',
    attrs: { ordered },
    children: items.map((content): ListItemNode => ({ id: fid(), type: 'listItem', content })),
  }))

const hrArb: fc.Arbitrary<BlockNode> = fc.constant(null).map(() => ({ id: fid(), type: 'hr' }))

const docArb: fc.Arbitrary<DocNode> = fc
  .array(fc.oneof(paragraphArb, headingArb, quoteArb, listArb, hrArb), {
    minLength: 1,
    maxLength: 6,
  })
  .map((children) => ({ schema: 'aihu-editor/doc', version: 1, children }))

describe('fuzzed round-trip (A4)', () => {
  it('fromMarkdown(toMarkdown(d)) ≡ d (mod ids) over 1000 dialect-guarded docs', () => {
    fc.assert(
      fc.property(docArb, (d) => {
        if (validateDoc(d) !== null) return true // generator bug guard, never expected
        const md = toMarkdown(d)
        const back = fromMarkdown(md)
        if (!docEqualsIgnoringIds(back, d)) {
          throw new Error(
            `round-trip mismatch\nmd: ${JSON.stringify(md)}\nin:  ${JSON.stringify(d)}\nout: ${JSON.stringify(back)}`,
          )
        }
        return true
      }),
      { numRuns: 1000 },
    )
  })

  it('toMarkdown(fromMarkdown(m)) is byte-identical for emitted markdown (normal form)', () => {
    fc.assert(
      fc.property(docArb, (d) => {
        if (validateDoc(d) !== null) return true
        const md = toMarkdown(d)
        return toMarkdown(fromMarkdown(md)) === md
      }),
      { numRuns: 500 },
    )
  })
})
