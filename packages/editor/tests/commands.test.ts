// Commands (spec §9.1) — the closed union the toolbar and GX share; pure
// model logic against a caller-resolved selection (A4).

import { describe, expect, it } from 'vitest'
import { activeState, canExecute, executeCommand } from '../src/commands.ts'
import { EditorCore } from '../src/core.ts'
import { containerText } from '../src/doc.ts'
import type { SelectionState } from '../src/types.ts'
import { doc, heading, item, list, para, run, tid } from './helpers.ts'

const rangeSel = (block: string, from: number, to: number): SelectionState => ({
  type: 'range',
  anchor: { block, offset: from },
  head: { block, offset: to },
})

describe('toggleMark', () => {
  it('marks an unmarked range, unmarks a fully marked one', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('hello world'))))
    expect(executeCommand(core, rangeSel(p, 0, 5), { type: 'toggleMark', mark: 'strong' })).toBe(
      true,
    )
    let b = core.doc().children[0] as unknown as {
      content: { text: string; mark: { type: string } | null }[]
    }
    expect(b.content[0]?.mark?.type).toBe('strong')
    expect(executeCommand(core, rangeSel(p, 0, 5), { type: 'toggleMark', mark: 'strong' })).toBe(
      true,
    )
    b = core.doc().children[0] as never
    expect(b.content[0]?.mark).toBeNull()
  })

  it('caret selections cannot toggle marks (no stored marks in MVP)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('x'))))
    expect(
      canExecute(
        core,
        { type: 'caret', at: { block: p, offset: 1 } },
        { type: 'toggleMark', mark: 'em' },
      ),
    ).toBe(false)
  })

  it('cross-block ranges are rejected (v2)', () => {
    const p1 = tid()
    const p2 = tid()
    const core = new EditorCore(doc(para(p1, run('a')), para(p2, run('b'))))
    const sel: SelectionState = {
      type: 'range',
      anchor: { block: p1, offset: 0 },
      head: { block: p2, offset: 1 },
    }
    expect(canExecute(core, sel, { type: 'toggleMark', mark: 'strong' })).toBe(false)
  })
})

describe('setLink', () => {
  it('applies a safe link and clears with href null', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('site'))))
    expect(
      executeCommand(core, rangeSel(p, 0, 4), { type: 'setLink', href: 'https://x.dev/a' }),
    ).toBe(true)
    let b = core.doc().children[0] as unknown as { content: { mark: { type: string } | null }[] }
    expect(b.content[0]?.mark?.type).toBe('link')
    expect(executeCommand(core, rangeSel(p, 0, 4), { type: 'setLink', href: null })).toBe(true)
    b = core.doc().children[0] as never
    expect(b.content[0]?.mark).toBeNull()
  })

  it('rejects unsafe hrefs (T2) and encodes spaces', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('bad'))))
    expect(executeCommand(core, rangeSel(p, 0, 3), { type: 'setLink', href: 'javascript:x' })).toBe(
      false,
    )
    expect(
      executeCommand(core, rangeSel(p, 0, 3), { type: 'setLink', href: 'https://x.dev/a b' }),
    ).toBe(true)
    const b = core.doc().children[0] as unknown as {
      content: { mark: { attrs: { href: string } } }[]
    }
    expect(b.content[0]?.mark.attrs.href).toBe('https://x.dev/a%20b')
  })
})

describe('setBlockType / toggleList', () => {
  it('paragraph → heading and back (same level toggles off)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('t'))))
    const sel = rangeSel(p, 0, 0)
    executeCommand(core, sel, { type: 'setBlockType', block: 'heading', level: 2 })
    expect((core.doc().children[0] as unknown as { type: string }).type).toBe('heading')
    executeCommand(core, sel, { type: 'setBlockType', block: 'heading', level: 2 })
    expect((core.doc().children[0] as unknown as { type: string }).type).toBe('paragraph')
  })

  it('paragraph → list wrap; toggling orderedness retargets the list; unwrap restores', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('x'))))
    const sel = rangeSel(p, 0, 0)
    executeCommand(core, sel, { type: 'toggleList', ordered: false })
    expect((core.doc().children[0] as unknown as { type: string }).type).toBe('list')
    executeCommand(core, sel, { type: 'toggleList', ordered: true })
    expect(
      (core.doc().children[0] as unknown as { attrs: { ordered: boolean } }).attrs.ordered,
    ).toBe(true)
    executeCommand(core, sel, { type: 'toggleList', ordered: true })
    expect((core.doc().children[0] as unknown as { type: string }).type).toBe('paragraph')
    expect(containerText(core.doc().children[0] as never)).toBe('x')
  })

  it('heading commands are rejected on list items and when features disable them', () => {
    const l = tid()
    const i1 = tid()
    const core = new EditorCore(doc(list(l, false, item(i1, run('a')))))
    expect(
      canExecute(core, rangeSel(i1, 0, 0), { type: 'setBlockType', block: 'heading', level: 1 }),
    ).toBe(false)
    const p = tid()
    const core2 = new EditorCore(doc(para(p, run('x'))))
    expect(
      canExecute(
        core2,
        rangeSel(p, 0, 0),
        { type: 'setBlockType', block: 'heading', level: 1 },
        { headings: false },
      ),
    ).toBe(false)
  })
})

describe('activeState (toolbar feed, spec §9.2)', () => {
  it('reports marks, block type, and undo state', () => {
    const h = tid()
    const core = new EditorCore(doc(heading(h, 2, run('ti'), run('tle', { type: 'strong' }))))
    const st = activeState(core, rangeSel(h, 2, 5))
    expect(st.marks.has('strong')).toBe(true)
    expect(st.blockType).toBe('heading')
    expect(st.headingLevel).toBe(2)
    expect(st.canUndo).toBe(false)
  })

  it('caret inside a marked run reports that mark (typing inheritance)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('ab', { type: 'em' }), run('cd'))))
    const st = activeState(core, { type: 'caret', at: { block: p, offset: 1 } })
    expect(st.marks.has('em')).toBe(true)
  })
})
