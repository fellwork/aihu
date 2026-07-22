// EditorCore — the single apply() door (spec §2): atomic rejection,
// normalization, invariants, signals, load/migrate.

import { describe, expect, it } from 'vitest'
import { EditorCore } from '../src/core.ts'
import { containerText, emptyDoc, migrate, validateDoc } from '../src/doc.ts'
import { doc, para, run, tid } from './helpers.ts'

describe('EditorCore.apply', () => {
  it('applies insertText and updates the doc signal', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    const res = core.dispatch('user.typing', [
      { t: 'insertText', at: { block: p, offset: 0 }, text: 'hello', mark: null },
    ])
    expect(res.ok).toBe(true)
    expect(containerText(core.doc().children[0] as never)).toBe('hello')
  })

  it('never partially applies: a bad second step rejects the whole tr', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('abc'))))
    const res = core.dispatch('user.command', [
      { t: 'insertText', at: { block: p, offset: 0 }, text: 'x', mark: null },
      { t: 'deleteRange', from: { block: 'nope', offset: 0 }, to: { block: 'nope', offset: 1 } },
    ])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('unknown_block')
    expect(containerText(core.doc().children[0] as never)).toBe('abc') // untouched
  })

  it('rejects a transaction that would empty the doc (I1)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('abc'))))
    const res = core.dispatch('user.command', [{ t: 'removeBlock', id: p }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('I1_empty_doc')
  })

  it('rejects link marks with unsafe hrefs at write time (I4/T2)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('click'))))
    const res = core.dispatch('user.command', [
      {
        t: 'setMark',
        from: { block: p, offset: 0 },
        to: { block: p, offset: 5 },
        mark: { type: 'link', attrs: { href: 'javascript:alert(1)' } },
      },
    ])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('bad_href')
  })

  it('normalizes adjacent equal-mark runs (I3)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('ab'))))
    core.dispatch('user.typing', [
      { t: 'insertText', at: { block: p, offset: 2 }, text: 'cd', mark: null },
    ])
    const block = core.doc().children[0] as unknown as { content: unknown[] }
    expect(block.content).toHaveLength(1) // merged, not two runs
  })

  it('fires onTransaction with the tr and new doc; dispose works', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    const seen: string[] = []
    const dispose = core.onTransaction((tr) => seen.push(tr.origin))
    core.dispatch('user.typing', [
      { t: 'insertText', at: { block: p, offset: 0 }, text: 'a', mark: null },
    ])
    dispose()
    core.dispatch('user.typing', [
      { t: 'insertText', at: { block: p, offset: 1 }, text: 'b', mark: null },
    ])
    expect(seen).toEqual(['user.typing'])
  })

  it('clamps heading levels at write (I5)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('t'))))
    const res = core.dispatch('user.command', [
      { t: 'setBlockType', id: p, type: 'heading', attrs: { level: 6 as never } },
    ])
    expect(res.ok).toBe(true)
    const b = core.doc().children[0] as unknown as { attrs: { level: number } }
    expect(b.attrs.level).toBe(3)
  })
})

describe('validateDoc / migrate (I7)', () => {
  it('accepts the empty doc shape', () => {
    expect(validateDoc(emptyDoc())).toBeNull()
  })

  it('rejects duplicate ids (I2)', () => {
    const d = doc(para('dup', run('a')), para('dup', run('b')))
    expect(validateDoc(d)).toBe('I2_dup_id')
  })

  it('rejects newlines in run text (no hard breaks in the dialect)', () => {
    const d = doc(para(tid(), run('a\nb')))
    expect(validateDoc(d)).toBe('I4_bad_mark')
  })

  it('migrate rejects unknown major versions', () => {
    expect(() => migrate({ schema: 'aihu-editor/doc', version: 2, children: [] })).toThrow(
      /unknown major version/,
    )
  })

  it('migrate rejects unknown schemas', () => {
    expect(() => migrate({ schema: 'someone-else/doc', version: 1, children: [] })).toThrow(
      /unknown schema/,
    )
  })
})
