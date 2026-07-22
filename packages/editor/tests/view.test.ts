// EditorView in jsdom — rendering, beforeinput routing (fail-closed),
// MO tripwire recovery, paste pipeline, readonly, exec/can. Real-browser
// behaviors (IME, selection survival, caret) live in e2e/editor.spec.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorCore } from '../src/core.ts'
import { containerText } from '../src/doc.ts'
import { writeDomSelection } from '../src/position-map.ts'
import type { EditorViewOptions } from '../src/view.ts'
import { EditorView } from '../src/view.ts'
import { doc, para, run, tid } from './helpers.ts'

let root: HTMLElement
let view: EditorView | null = null

beforeEach(() => {
  root = document.createElement('div')
  document.body.appendChild(root)
})

afterEach(() => {
  view?.destroy()
  view = null
  root.remove()
})

function mount(d = doc(para(tid(), run('hello'))), options: EditorViewOptions = {}) {
  const core = new EditorCore(d)
  view = new EditorView(root, core, options)
  return { core, view }
}

function fireBeforeInput(inputType: string, data?: string): boolean {
  const ev = new InputEvent('beforeinput', {
    inputType,
    data: data ?? null,
    cancelable: true,
    bubbles: true,
  })
  root.dispatchEvent(ev)
  return ev.defaultPrevented
}

function caret(block: string, offset: number): void {
  writeDomSelection(root, { type: 'caret', at: { block, offset } })
}

function range(block: string, from: number, to: number): void {
  writeDomSelection(root, {
    type: 'range',
    anchor: { block, offset: from },
    head: { block, offset: to },
  })
}

describe('rendering', () => {
  it('renders every block type with data-block-id and no HTML strings', () => {
    const p = tid()
    const h = tid()
    const q = tid()
    const l = tid()
    const i1 = tid()
    const r = tid()
    mount(
      doc(
        para(
          p,
          run('a'),
          run('b', { type: 'strong' }),
          run('c', { type: 'link', attrs: { href: '/x' } }),
        ),
        { id: h, type: 'heading', attrs: { level: 2 }, content: [{ text: 'h', mark: null }] },
        { id: q, type: 'blockquote', content: [{ text: 'q', mark: null }] },
        {
          id: l,
          type: 'list',
          attrs: { ordered: true },
          children: [{ id: i1, type: 'listItem', content: [{ text: 'i', mark: null }] }],
        },
        { id: r, type: 'hr' },
      ),
    )
    expect(root.querySelector(`p[data-block-id="${p}"] strong`)?.textContent).toBe('b')
    expect(root.querySelector(`p[data-block-id="${p}"] a`)?.getAttribute('href')).toBe('/x')
    expect(root.querySelector(`h2[data-block-id="${h}"]`)?.textContent).toBe('h')
    expect(root.querySelector(`blockquote[data-block-id="${q}"]`)?.textContent).toBe('q')
    expect(root.querySelector(`ol li[data-block-id="${i1}"]`)?.textContent).toBe('i')
    expect(root.querySelector(`hr[data-block-id="${r}"]`)).not.toBeNull()
    expect(root.getAttribute('role')).toBe('textbox')
    expect(root.getAttribute('aria-multiline')).toBe('true')
  })

  it('empty containers render a <br> caret anchor', () => {
    const p = tid()
    mount(doc(para(p)))
    expect(root.querySelector(`[data-block-id="${p}"] br`)).not.toBeNull()
  })
})

describe('beforeinput routing', () => {
  it('insertText commits a typing transaction at the DOM caret (A4)', () => {
    const p = tid()
    const { core } = mount(doc(para(p, run('helo'))))
    caret(p, 3)
    expect(fireBeforeInput('insertText', 'l')).toBe(true) // preventDefault
    expect(containerText(core.doc().children[0] as never)).toBe('hello')
  })

  it('insertParagraph splits at the caret', () => {
    const p = tid()
    const { core } = mount(doc(para(p, run('aabb'))))
    caret(p, 2)
    fireBeforeInput('insertParagraph')
    const texts = core.doc().children.map((b) => containerText(b as never))
    expect(texts).toEqual(['aa', 'bb'])
  })

  it('deleteContentBackward at block start merges blocks', () => {
    const p1 = tid()
    const p2 = tid()
    const { core } = mount(doc(para(p1, run('aa')), para(p2, run('bb'))))
    caret(p2, 0)
    fireBeforeInput('deleteContentBackward')
    expect(core.doc().children).toHaveLength(1)
    expect(containerText(core.doc().children[0] as never)).toBe('aabb')
  })

  it('deleteContentBackward never splits a surrogate pair (A3)', () => {
    const p = tid()
    const { core } = mount(doc(para(p, run('a😀'))))
    caret(p, 3)
    fireBeforeInput('deleteContentBackward')
    expect(containerText(core.doc().children[0] as never)).toBe('a')
  })

  it('unknown inputTypes are prevented and change nothing (fail closed)', () => {
    const p = tid()
    const { core } = mount(doc(para(p, run('x'))))
    caret(p, 1)
    expect(fireBeforeInput('insertHorizontalRule')).toBe(true)
    expect(containerText(core.doc().children[0] as never)).toBe('x')
  })

  it('typing `# ` at block start converts to a heading via input rule; typing continues (A1 shape)', () => {
    const p = tid()
    const { core } = mount(doc(para(p)))
    caret(p, 0)
    fireBeforeInput('insertText', '#')
    caret(p, 1)
    fireBeforeInput('insertText', ' ')
    expect((core.doc().children[0] as unknown as { type: string }).type).toBe('heading')
  })

  it('readonly: all editing beforeinput is prevented and ignored', () => {
    const p = tid()
    const { core } = mount(doc(para(p, run('x'))), { readonly: true })
    expect(root.contentEditable).toBe('false')
    caret(p, 1)
    fireBeforeInput('insertText', 'y')
    expect(containerText(core.doc().children[0] as never)).toBe('x')
  })
})

describe('MutationObserver tripwire (dom.readback)', () => {
  it('an uncontrolled characterData mutation converges with origin dom.readback', async () => {
    const p = tid()
    const { core } = mount(doc(para(p, run('mispeled'))))
    const origins: string[] = []
    core.onTransaction((tr) => origins.push(tr.origin))
    const textNode = root.querySelector(`[data-block-id="${p}"]`)?.firstChild as Text
    textNode.nodeValue = 'misspelled' // spellcheck-style rewrite
    await Promise.resolve() // MO callbacks deliver on a microtask
    await Promise.resolve()
    expect(containerText(core.doc().children[0] as never)).toBe('misspelled')
    expect(origins).toEqual(['dom.readback'])
  })

  it('a mutation spanning a mark element preserves the mark (A2/d3 flip)', async () => {
    const p = tid()
    const { core } = mount(doc(para(p, run('t'), run('eh', { type: 'strong' }))))
    const strong = root.querySelector(`[data-block-id="${p}"] strong`) as HTMLElement
    ;(strong.firstChild as Text).nodeValue = 'he'
    await Promise.resolve()
    await Promise.resolve()
    const runs = (
      core.doc().children[0] as unknown as {
        content: { text: string; mark: { type: string } | null }[]
      }
    ).content
    expect(runs).toEqual([
      { text: 't', mark: null },
      { text: 'he', mark: { type: 'strong' } },
    ])
  })

  it("the view's own renders never trigger read-back", async () => {
    const p = tid()
    const { core, view: v } = mount(doc(para(p, run('a'))))
    const origins: string[] = []
    core.onTransaction((tr) => origins.push(tr.origin))
    caret(p, 1)
    ;(v as EditorView).exec({ type: 'toggleMark', mark: 'strong' }) // no range: no-op
    fireBeforeInput('insertText', 'b')
    await Promise.resolve()
    await Promise.resolve()
    expect(origins).toEqual(['user.typing']) // no dom.readback entries
  })
})

describe('composition (A1 — jsdom smoke; real IME in e2e)', () => {
  it('drains the observer on compositionend and attributes the commit to typing', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    try {
      const p = tid()
      const { core } = mount(doc(para(p, run('ab'))))
      const origins: string[] = []
      core.onTransaction((tr) => origins.push(tr.origin))
      caret(p, 2)
      root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      // browser-owned preedit mutations
      const textNode = root.querySelector(`[data-block-id="${p}"]`)?.firstChild as Text
      textNode.nodeValue = 'ab日本語'
      root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本語' }))
      await Promise.resolve()
      await Promise.resolve()
      expect(containerText(core.doc().children[0] as never)).toBe('ab日本語')
      expect(origins).toEqual(['user.typing']) // exactly one, typing-attributed
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('paste pipeline', () => {
  function firePaste(payload: { html?: string; text?: string }): void {
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(ev, 'clipboardData', {
      value: {
        getData: (type: string) =>
          type === 'text/html' ? (payload.html ?? '') : (payload.text ?? ''),
      },
    })
    root.dispatchEvent(ev)
  }

  it('sanitized HTML paste inserts blocks as ONE undoable user.paste transaction (A5)', () => {
    const p = tid()
    const { core } = mount(doc(para(p, run('xy'))))
    caret(p, 1)
    firePaste({
      html: '<script>alert(1)</script><p onclick=x>hi <a href="javascript:alert(1)">l</a></p>',
    })
    expect(containerText(core.doc().children[0] as never)).toBe('xhi ly')
    expect(document.querySelectorAll('script').length).toBe(0)
    core.undo()
    expect(containerText(core.doc().children[0] as never)).toBe('xy')
  })

  it('multi-block paste splits the current block and inserts between', () => {
    const p = tid()
    const { core } = mount(doc(para(p, run('ab'))))
    caret(p, 1)
    firePaste({ html: '<h1>T</h1><p>body</p>' })
    const shapes = core.doc().children.map((b) => b.type)
    expect(shapes).toEqual(['paragraph', 'heading', 'paragraph', 'paragraph'])
  })

  it('plain-text paste falls back to paragraphs (empty source paragraph is tidied away)', () => {
    const p = tid()
    const { core } = mount(doc(para(p)))
    caret(p, 0)
    firePaste({ text: 'one\n\ntwo' })
    expect(core.doc().children.map((b) => containerText(b as never))).toEqual(['one', 'two'])
  })
})

describe('exec / can (element API)', () => {
  it('toggles marks over a DOM range selection', () => {
    const p = tid()
    const { core, view: v } = mount(doc(para(p, run('hello'))))
    range(p, 0, 5)
    expect((v as EditorView).can({ type: 'toggleMark', mark: 'strong' })).toBe(true)
    expect((v as EditorView).exec({ type: 'toggleMark', mark: 'strong' })).toBe(true)
    const b = core.doc().children[0] as unknown as { content: { mark: { type: string } | null }[] }
    expect(b.content[0]?.mark?.type).toBe('strong')
  })

  it('undo/redo route through exec', () => {
    const p = tid()
    const { core, view: v } = mount(doc(para(p, run('x'))))
    caret(p, 1)
    fireBeforeInput('insertText', 'y')
    expect((v as EditorView).exec({ type: 'undo' })).toBe(true)
    expect(containerText(core.doc().children[0] as never)).toBe('x')
    expect((v as EditorView).exec({ type: 'redo' })).toBe(true)
    expect(containerText(core.doc().children[0] as never)).toBe('xy')
  })

  it('activeState reflects the DOM selection', () => {
    const p = tid()
    const { view: v } = mount(doc(para(p, run('hi', { type: 'em' }))))
    range(p, 0, 2)
    expect((v as EditorView).activeState().marks.has('em')).toBe(true)
  })
})
