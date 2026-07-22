// Steps — application semantics + EXACT inversion (spec §2: invert is total)
// + mapPoint. Inversion is proven by property: apply(step) then
// apply(invert) restores the original doc byte-for-byte.

import { describe, expect, it } from 'vitest'
import { validateDoc } from '../src/doc.ts'
import { applyStep, invertStep, mapPoint } from '../src/steps.ts'
import type { DocNode, Step } from '../src/types.ts'
import { doc, heading, hr, item, list, para, quote, run, tid } from './helpers.ts'

function roundTrip(d: DocNode, step: Step): DocNode {
  const before = structuredClone(d)
  const draft = structuredClone(d)
  const inv = invertStep(step, draft)
  expect(applyStep(draft, step)).toBeNull()
  expect(validateDoc(draft)).toBeNull()
  const restored = structuredClone(draft)
  expect(applyStep(restored, inv)).toBeNull()
  expect(restored).toEqual(before)
  return draft
}

describe('step application + exact inversion', () => {
  it('insertText / inverse deleteRange', () => {
    const p = tid()
    const d = doc(para(p, run('helo')))
    const after = roundTrip(d, {
      t: 'insertText',
      at: { block: p, offset: 3 },
      text: 'l',
      mark: null,
    })
    expect((after.children[0] as unknown as { content: [{ text: string }] }).content[0].text).toBe(
      'hello',
    )
  })

  it('deleteRange across mixed marks / inverse insertRuns restores marks', () => {
    const p = tid()
    const d = doc(para(p, run('a'), run('bc', { type: 'strong' }), run('d')))
    roundTrip(d, {
      t: 'deleteRange',
      from: { block: p, offset: 0 },
      to: { block: p, offset: 4 },
    })
  })

  it('setMark over mixed runs / inverse setRuns restores the old structure', () => {
    const p = tid()
    const d = doc(para(p, run('aa'), run('bb', { type: 'em' }), run('cc')))
    const after = roundTrip(d, {
      t: 'setMark',
      from: { block: p, offset: 1 },
      to: { block: p, offset: 5 },
      mark: { type: 'strong' },
    })
    const runs = (after.children[0] as unknown as { content: { mark: unknown }[] }).content
    expect(
      runs.some((r) => (r.mark as unknown as { type?: string } | null)?.type === 'strong'),
    ).toBe(true)
  })

  it('splitBlock heading: tail is a paragraph; inverse merge restores heading', () => {
    const h = tid()
    const nid = tid()
    const d = doc(heading(h, 2, run('titletext')))
    const after = roundTrip(d, { t: 'splitBlock', at: { block: h, offset: 5 }, newId: nid })
    expect(after.children).toHaveLength(2)
    expect((after.children[1] as unknown as { type: string }).type).toBe('paragraph')
  })

  it('mergeBlock paragraph→heading: inverse split restores the paragraph tail', () => {
    const h = tid()
    const p = tid()
    const d = doc(heading(h, 1, run('head')), para(p, run('tail')))
    const after = roundTrip(d, { t: 'mergeBlock', first: h, second: p })
    expect(after.children).toHaveLength(1)
    expect((after.children[0] as unknown as { type: string }).type).toBe('heading')
  })

  it('splitBlock in a listItem creates a sibling item', () => {
    const l = tid()
    const i1 = tid()
    const nid = tid()
    const d = doc(list(l, false, item(i1, run('ab'))))
    const after = roundTrip(d, { t: 'splitBlock', at: { block: i1, offset: 1 }, newId: nid })
    const lst = after.children[0] as unknown as { children: unknown[] }
    expect(lst.children).toHaveLength(2)
  })

  it('mergeBlock rejects cross-structure merges (listItem vs paragraph)', () => {
    const l = tid()
    const i1 = tid()
    const p = tid()
    const d = doc(list(l, false, item(i1, run('a'))), para(p, run('b')))
    expect(applyStep(structuredClone(d), { t: 'mergeBlock', first: i1, second: p })).toBe(
      'bad_merge',
    )
  })

  it('insertBlock/removeBlock round-trip at doc start, middle, and in-list', () => {
    const p1 = tid()
    const p2 = tid()
    const d = doc(para(p1, run('a')), para(p2, run('b')))
    roundTrip(d, { t: 'insertBlock', after: null, node: para(tid(), run('x')) })
    roundTrip(d, { t: 'insertBlock', after: p1, node: hr(tid()) })

    const l = tid()
    const i1 = tid()
    const i2 = tid()
    const dl = doc(list(l, true, item(i1, run('a')), item(i2, run('b'))))
    roundTrip(dl, { t: 'insertBlock', after: i1, node: item(tid(), run('mid')) })
    roundTrip(dl, { t: 'removeBlock', id: i1 }) // first item: inverse uses `in`
    roundTrip(dl, { t: 'removeBlock', id: i2 })
  })

  it('removeBlock refuses the last listItem (convert the list instead)', () => {
    const l = tid()
    const i1 = tid()
    const d = doc(para(tid(), run('x')), list(l, false, item(i1, run('a'))))
    expect(applyStep(structuredClone(d), { t: 'removeBlock', id: i1 })).toBe('last_item')
  })

  it('setBlockType paragraph→heading→blockquote→paragraph round-trips', () => {
    const p = tid()
    const d = doc(para(p, run('x')))
    roundTrip(d, { t: 'setBlockType', id: p, type: 'heading', attrs: { level: 2 } })
    const dh = doc(heading(p, 2, run('x')))
    roundTrip(dh, { t: 'setBlockType', id: p, type: 'blockquote' })
    const dq = doc(quote(p, run('x')))
    roundTrip(dq, { t: 'setBlockType', id: p, type: 'paragraph' })
  })

  it('setBlockType paragraph→list wraps (container id becomes the item id) and inverts', () => {
    const p = tid()
    const lid = tid()
    const d = doc(para(p, run('x')))
    const after = roundTrip(d, {
      t: 'setBlockType',
      id: p,
      type: 'list',
      attrs: { ordered: false },
      newId: lid,
    })
    const lst = after.children[0] as unknown as { id: string; children: [{ id: string }] }
    expect(lst.id).toBe(lid)
    expect(lst.children[0].id).toBe(p) // Point stability across the wrap
  })

  it('setBlockType multi-item list→paragraph is rejected', () => {
    const l = tid()
    const d = doc(list(l, false, item(tid(), run('a')), item(tid(), run('b'))))
    expect(applyStep(structuredClone(d), { t: 'setBlockType', id: l, type: 'paragraph' })).toBe(
      'bad_convert',
    )
  })

  it('setAttrs round-trips heading level and list orderedness', () => {
    const h = tid()
    roundTrip(doc(heading(h, 1, run('t'))), { t: 'setAttrs', id: h, attrs: { level: 3 } })
    const l = tid()
    roundTrip(doc(list(l, false, item(tid(), run('a')))), {
      t: 'setAttrs',
      id: l,
      attrs: { ordered: true },
    })
  })
})

describe('offsets are UTF-16 code units (A3)', () => {
  it('astral-plane text: emoji occupies two units and splits stay pair-safe', () => {
    const p = tid()
    const d = doc(para(p, run('a😀b'))) // offsets: a=0, 😀=1..2, b=3
    const draft = structuredClone(d)
    expect(
      applyStep(draft, { t: 'insertText', at: { block: p, offset: 3 }, text: 'X', mark: null }),
    ).toBeNull()
    expect((draft.children[0] as unknown as { content: [{ text: string }] }).content[0].text).toBe(
      'a😀Xb',
    )
  })

  it('deleteRange with UTF-16 offsets removes the whole emoji', () => {
    const p = tid()
    const d = doc(para(p, run('a😀b')))
    const draft = structuredClone(d)
    expect(
      applyStep(draft, {
        t: 'deleteRange',
        from: { block: p, offset: 1 },
        to: { block: p, offset: 3 },
      }),
    ).toBeNull()
    expect((draft.children[0] as unknown as { content: [{ text: string }] }).content[0].text).toBe(
      'ab',
    )
  })
})

describe('mapPoint', () => {
  const p = 'blk'
  it('maps through inserts, deletes, and splits', () => {
    expect(
      mapPoint(
        { t: 'insertText', at: { block: p, offset: 2 }, text: 'xy', mark: null },
        { block: p, offset: 5 },
      ),
    ).toEqual({ block: p, offset: 7 })
    expect(
      mapPoint(
        { t: 'deleteRange', from: { block: p, offset: 1 }, to: { block: p, offset: 3 } },
        { block: p, offset: 5 },
      ),
    ).toEqual({ block: p, offset: 3 })
    expect(
      mapPoint(
        { t: 'splitBlock', at: { block: p, offset: 3 }, newId: 'n' },
        { block: p, offset: 5 },
      ),
    ).toEqual({ block: 'n', offset: 2 })
  })

  it('leaves unrelated blocks untouched', () => {
    expect(
      mapPoint(
        { t: 'insertText', at: { block: 'other', offset: 0 }, text: 'x', mark: null },
        { block: p, offset: 1 },
      ),
    ).toEqual({ block: p, offset: 1 })
  })
})
