// Position map (spec §4.1) — DOM ⇄ model in one module; property-tested
// round-trip over rendered docs, UTF-16 unit discipline (A3).

import { describe, expect, it } from 'vitest'
import { EditorCore } from '../src/core.ts'
import { toDom, toModel } from '../src/position-map.ts'
import { EditorView } from '../src/view.ts'
import { doc, heading, item, list, para, run, tid } from './helpers.ts'

function mount(d = doc(para(tid(), run('hello')))): {
  root: HTMLElement
  view: EditorView
  core: EditorCore
} {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const core = new EditorCore(d)
  const view = new EditorView(root, core)
  return { root, view, core }
}

describe('toDom ⇄ toModel round-trip', () => {
  it('round-trips every offset of a multi-run block', () => {
    const p = tid()
    const { root, view } = mount(
      doc(para(p, run('ab'), run('cd', { type: 'strong' }), run('ef', { type: 'em' }))),
    )
    for (let offset = 0; offset <= 6; offset++) {
      const dom = toDom(root, { block: p, offset })
      expect(dom).not.toBeNull()
      const back = toModel(
        root,
        (dom as unknown as { node: Node }).node,
        (dom as unknown as { offset: number }).offset,
      )
      expect(back).toEqual({ block: p, offset })
    }
    view.destroy()
    root.remove()
  })

  it('round-trips inside list items and headings', () => {
    const h = tid()
    const l = tid()
    const i1 = tid()
    const i2 = tid()
    const { root, view } = mount(
      doc(heading(h, 2, run('head')), list(l, true, item(i1, run('one')), item(i2, run('two')))),
    )
    for (const [block, len] of [
      [h, 4],
      [i1, 3],
      [i2, 3],
    ] as const) {
      for (let offset = 0; offset <= len; offset++) {
        const dom = toDom(root, { block, offset })
        const back = toModel(
          root,
          (dom as unknown as { node: Node }).node,
          (dom as unknown as { offset: number }).offset,
        )
        expect(back).toEqual({ block, offset })
      }
    }
    view.destroy()
    root.remove()
  })

  it('UTF-16 units (A3): astral text offsets count surrogate pairs as two', () => {
    const p = tid()
    const { root, view } = mount(doc(para(p, run('a😀b'))))
    const dom = toDom(root, { block: p, offset: 3 }) // after the emoji
    expect(dom).not.toBeNull()
    const back = toModel(
      root,
      (dom as unknown as { node: Node }).node,
      (dom as unknown as { offset: number }).offset,
    )
    expect(back).toEqual({ block: p, offset: 3 })
    view.destroy()
    root.remove()
  })

  it('empty block maps to the block element itself', () => {
    const p = tid()
    const { root, view } = mount(doc(para(p)))
    const dom = toDom(root, { block: p, offset: 0 })
    expect((dom as unknown as { node: Node }).node).toBe(
      root.querySelector(`[data-block-id="${p}"]`),
    )
    view.destroy()
    root.remove()
  })

  it('offsets beyond the text clamp to the end', () => {
    const p = tid()
    const { root, view } = mount(doc(para(p, run('ab'))))
    const dom = toDom(root, { block: p, offset: 99 })
    const back = toModel(
      root,
      (dom as unknown as { node: Node }).node,
      (dom as unknown as { offset: number }).offset,
    )
    expect(back).toEqual({ block: p, offset: 2 })
    view.destroy()
    root.remove()
  })
})
