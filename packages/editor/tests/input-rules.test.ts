// Input rules (spec §5): applied as SEPARATE transactions so one undo
// restores the literal typed text (acceptance A2), features prune rules,
// blockStart rules convert only paragraphs.

import { describe, expect, it } from 'vitest'
import { EditorCore } from '../src/core.ts'
import { containerText } from '../src/doc.ts'
import { resolveFeatures } from '../src/features.ts'
import { matchInputRules } from '../src/input-rules.ts'
import type { BlockNode } from '../src/types.ts'
import { doc, para, run, tid } from './helpers.ts'

/** Type text char-by-char through the core, running rules like the view does. */
function typeString(core: EditorCore, blockId: string, text: string): void {
  let offset = containerText(core.doc().children.find((b) => b.id === blockId) as never).length
  for (const ch of text) {
    core.dispatch('user.typing', [
      { t: 'insertText', at: { block: blockId, offset }, text: ch, mark: null },
    ])
    offset += ch.length
    const m = matchInputRules(core.doc(), blockId, offset, ch, resolveFeatures())
    if (m) {
      core.dispatch('inputrule', m.steps)
      offset = m.caretAfter.offset
    }
  }
}

describe('blockStart rules', () => {
  it('`# ` converts to heading level 1; `### ` to level 3', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '# ')
    let b = core.doc().children[0] as BlockNode
    expect(b.type).toBe('heading')
    expect((b as unknown as { attrs: { level: number } }).attrs.level).toBe(1)

    const p2 = tid()
    const core2 = new EditorCore(doc(para(p2)))
    typeString(core2, p2, '### ')
    b = core2.doc().children[0] as BlockNode
    expect((b as unknown as { attrs: { level: number } }).attrs.level).toBe(3)
  })

  it('`- ` wraps into a bullet list; `1. ` into an ordered list', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '- ')
    const b = core.doc().children[0] as BlockNode
    expect(b.type).toBe('list')
    expect((b as unknown as { attrs: { ordered: boolean } }).attrs.ordered).toBe(false)
    // the typed-into container keeps its id as the listItem (Point stability)
    expect((b as unknown as { children: [{ id: string }] }).children[0].id).toBe(p)

    const p2 = tid()
    const core2 = new EditorCore(doc(para(p2)))
    typeString(core2, p2, '1. ')
    expect(
      (core2.doc().children[0] as unknown as { attrs: { ordered: boolean } }).attrs.ordered,
    ).toBe(true)
  })

  it('`> ` converts to blockquote', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '> ')
    expect((core.doc().children[0] as BlockNode).type).toBe('blockquote')
  })

  it('`---` + Enter becomes hr + surviving paragraph', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '---')
    const m = matchInputRules(core.doc(), p, 3, '\n', resolveFeatures())
    expect(m).not.toBeNull()
    core.dispatch('inputrule', (m as NonNullable<typeof m>).steps)
    const types = core.doc().children.map((b) => b.type)
    expect(types).toEqual(['hr', 'paragraph'])
  })

  it('blockStart rules do not fire inside headings or list items', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '# ') // now a heading
    typeString(core, p, '- ')
    expect((core.doc().children[0] as BlockNode).type).toBe('heading') // unchanged
  })
})

describe('inline rules (A2)', () => {
  it('`**bold**` marks the content and deletes the delimiters', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '**bold**')
    const b = core.doc().children[0] as unknown as {
      content: { text: string; mark: { type: string } | null }[]
    }
    expect(b.content).toHaveLength(1)
    expect(b.content[0]?.text).toBe('bold')
    expect(b.content[0]?.mark?.type).toBe('strong')
  })

  it('one undo restores the literal `**bold**` text (A2)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '**bold**')
    core.undo()
    expect(containerText(core.doc().children[0] as never)).toBe('**bold**')
  })

  it('`*em*`, `_em_`, and `` `code` `` fire their marks', () => {
    for (const [typed, mark, content] of [
      ['x *em*', 'em', 'em'],
      ['x _em_', 'em', 'em'],
      ['x `co`', 'code', 'co'],
    ] as const) {
      const p = tid()
      const core = new EditorCore(doc(para(p)))
      typeString(core, p, typed)
      const b = core.doc().children[0] as unknown as {
        content: { text: string; mark: { type: string } | null }[]
      }
      const marked = b.content.find((r) => r.mark !== null)
      expect(marked?.mark?.type).toBe(mark)
      expect(marked?.text).toBe(content)
    }
  })

  it('`[label](href)` becomes a safeHref-validated link', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '[docs](https://aihu.dev/docs)')
    const b = core.doc().children[0] as unknown as {
      content: { text: string; mark: { type: string; attrs?: { href: string } } | null }[]
    }
    const link = b.content.find((r) => r.mark?.type === 'link')
    expect(link?.text).toBe('docs')
    expect(link?.mark?.attrs?.href).toBe('https://aihu.dev/docs')
  })

  it('a `javascript:` link rule does NOT fire — literal text stays (T2)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '[x](javascript:alert1)')
    expect(containerText(core.doc().children[0] as never)).toBe('[x](javascript:alert1)')
  })

  it('`**` inside a word does not trigger em prematurely', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    typeString(core, p, '**not closed*')
    // em must not have fired for `*not closed*` because the * before it is
    // part of a ** opener
    expect(containerText(core.doc().children[0] as never)).toBe('**not closed*')
  })
})

describe('feature pruning (spec §9.1)', () => {
  it('inputRules: false kills the engine', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('# '))))
    const m = matchInputRules(core.doc(), p, 2, ' ', resolveFeatures({ inputRules: false }))
    expect(m).toBeNull()
  })

  it('inputRules.disable prunes single rules', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('# '))))
    const m = matchInputRules(
      core.doc(),
      p,
      2,
      ' ',
      resolveFeatures({ inputRules: { disable: ['heading'] } }),
    )
    expect(m).toBeNull()
  })

  it('headings: false prunes the heading rule; lists: false the list rules', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('- '))))
    expect(matchInputRules(core.doc(), p, 2, ' ', resolveFeatures({ lists: false }))).toBeNull()
    const p2 = tid()
    const core2 = new EditorCore(doc(para(p2, run('## '))))
    expect(
      matchInputRules(core2.doc(), p2, 3, ' ', resolveFeatures({ headings: false })),
    ).toBeNull()
  })
})
