// Undo/redo — typing coalescing (~1 s window, spec §2; acceptance A3) and
// the shared human/agent stack (G2 symmetric undo).

import { describe, expect, it, vi } from 'vitest'
import { EditorCore } from '../src/core.ts'
import { containerText } from '../src/doc.ts'
import { doc, para, run, tid } from './helpers.ts'

function typeChar(core: EditorCore, block: string, offset: number, ch: string): void {
  const res = core.dispatch('user.typing', [
    { t: 'insertText', at: { block, offset }, text: ch, mark: null },
  ])
  expect(res.ok).toBe(true)
}

function text(core: EditorCore): string {
  return containerText(core.doc().children[0] as never)
}

describe('typing coalescing (A3)', () => {
  it('12 typed chars, one undo ⇒ empty paragraph', () => {
    vi.useFakeTimers()
    try {
      const p = tid()
      const core = new EditorCore(doc(para(p)))
      const word = 'hello world!'
      for (let i = 0; i < word.length; i++) {
        typeChar(core, p, i, word[i] as string)
        vi.advanceTimersByTime(50)
      }
      expect(text(core)).toBe(word)
      expect(core.undo()).toBe(true)
      expect(text(core)).toBe('')
      expect(core.canUndo()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a > 1 s pause mid-word ⇒ two undo steps', () => {
    vi.useFakeTimers()
    try {
      const p = tid()
      const core = new EditorCore(doc(para(p)))
      typeChar(core, p, 0, 'a')
      typeChar(core, p, 1, 'b')
      vi.advanceTimersByTime(1500)
      typeChar(core, p, 2, 'c')
      typeChar(core, p, 3, 'd')
      expect(text(core)).toBe('abcd')
      core.undo()
      expect(text(core)).toBe('ab')
      core.undo()
      expect(text(core)).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('backspace runs coalesce too', () => {
    vi.useFakeTimers()
    try {
      const p = tid()
      const core = new EditorCore(doc(para(p, run('abcd'))))
      for (let i = 4; i > 0; i--) {
        core.dispatch('user.typing', [
          { t: 'deleteRange', from: { block: p, offset: i - 1 }, to: { block: p, offset: i } },
        ])
        vi.advanceTimersByTime(50)
      }
      expect(text(core)).toBe('')
      core.undo()
      expect(text(core)).toBe('abcd')
    } finally {
      vi.useRealTimers()
    }
  })

  it('non-typing origins never coalesce (paste is its own entry)', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    core.dispatch('user.typing', [
      { t: 'insertText', at: { block: p, offset: 0 }, text: 'a', mark: null },
    ])
    core.dispatch('user.paste', [
      { t: 'insertText', at: { block: p, offset: 1 }, text: 'PASTED', mark: null },
    ])
    core.undo()
    expect(text(core)).toBe('a')
    core.undo()
    expect(text(core)).toBe('')
  })

  it('redo replays an undone entry; a fresh edit clears the redo stack', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p)))
    core.dispatch('user.command', [
      { t: 'insertText', at: { block: p, offset: 0 }, text: 'x', mark: null },
    ])
    core.undo()
    expect(core.canRedo()).toBe(true)
    core.redo()
    expect(text(core)).toBe('x')
    core.dispatch('user.command', [
      { t: 'insertText', at: { block: p, offset: 1 }, text: 'y', mark: null },
    ])
    expect(core.canRedo()).toBe(false)
  })
})

describe('shared human/agent history (G2)', () => {
  it('human undo reverts an agent transaction and vice versa', () => {
    const p = tid()
    const core = new EditorCore(doc(para(p, run('human'))))
    core.dispatch('agent:insertBlock', [
      { t: 'insertText', at: { block: p, offset: 5 }, text: ' +agent', mark: null },
    ])
    expect(text(core)).toBe('human +agent')
    expect(core.undo()).toBe(true) // human Ctrl-Z undoes the agent edit
    expect(text(core)).toBe('human')
    expect(core.redo()).toBe(true)
    expect(text(core)).toBe('human +agent')
  })
})
