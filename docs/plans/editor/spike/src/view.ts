// Phase-0 spike: miniature EditorView per architecture.md §3.2/§4.
// beforeinput interception, composition = browser-owned + compositionend diff,
// MutationObserver read-back as the universal recovery path.

import {
  blockLength,
  blockText,
  type Doc,
  diffToSteps,
  type EditorCore,
  freshId,
  type Point,
  type Sel,
  type Step,
} from './model.ts'
import { blockElOf, readDomSelection, writeDomSelection } from './position-map.ts'

export interface ViewLogEntry {
  kind: string
  detail?: string
  time: number
}

export class EditorView {
  root: HTMLElement
  core: EditorCore
  composing = false
  composingBlock: string | null = null
  log: ViewLogEntry[] = []
  private mo: MutationObserver
  private rendering = false
  private destroyed = false
  private onBeforeInputBound = (ev: Event) => this.onBeforeInput(ev as InputEvent)
  private onCompositionStartBound = () => this.onCompositionStart()
  private onCompositionEndBound = () => this.onCompositionEnd()
  private onSelectionChangeBound = () => this.onSelectionChange()

  constructor(root: HTMLElement, core: EditorCore) {
    this.root = root
    this.core = core
    root.contentEditable = 'true'
    root.setAttribute('role', 'textbox')
    root.setAttribute('aria-multiline', 'true')

    root.addEventListener('beforeinput', this.onBeforeInputBound)
    root.addEventListener('compositionstart', this.onCompositionStartBound)
    root.addEventListener('compositionend', this.onCompositionEndBound)
    document.addEventListener('selectionchange', this.onSelectionChangeBound)

    this.mo = new MutationObserver((records) => this.onMutations(records))
    this.mo.observe(root, { subtree: true, childList: true, characterData: true })

    this.renderAll()
  }

  /** Detach every hook so a replacement view doesn't fight this one. */
  destroy() {
    this.destroyed = true
    this.mo.disconnect()
    this.root.removeEventListener('beforeinput', this.onBeforeInputBound)
    this.root.removeEventListener('compositionstart', this.onCompositionStartBound)
    this.root.removeEventListener('compositionend', this.onCompositionEndBound)
    document.removeEventListener('selectionchange', this.onSelectionChangeBound)
  }

  private note(kind: string, detail?: string) {
    this.log.push({ kind, detail, time: Date.now() })
  }

  // ---------- rendering ----------

  /** Run DOM writes with the observer's queue swallowed afterwards, so our own
   *  renders never trigger read-back. takeRecords() is the standard trick. */
  private suppressed(fn: () => void) {
    this.rendering = true
    try {
      fn()
    } finally {
      this.mo.takeRecords()
      this.rendering = false
    }
  }

  private buildBlockEl(blockId: string): HTMLElement {
    const b = this.core.block(blockId)
    const p = document.createElement('p')
    p.setAttribute('data-block-id', blockId)
    if (!b || b.runs.length === 0) {
      p.appendChild(document.createElement('br')) // caret anchor for empty block
      return p
    }
    for (const run of b.runs) {
      if (run.mark === 'strong') {
        const strong = document.createElement('strong')
        strong.appendChild(document.createTextNode(run.text))
        p.appendChild(strong)
      } else {
        p.appendChild(document.createTextNode(run.text))
      }
    }
    return p
  }

  renderAll() {
    this.suppressed(() => {
      this.root.replaceChildren(...this.core.doc.blocks.map((b) => this.buildBlockEl(b.id)))
    })
  }

  renderBlock(blockId: string) {
    const existing = this.root.querySelector(`[data-block-id="${blockId}"]`)
    this.suppressed(() => {
      const fresh = this.buildBlockEl(blockId)
      if (existing) existing.replaceWith(fresh)
      else this.renderAllStructure()
    })
  }

  /** Reconcile block-element list keyed by id (insert/remove), rebuilding
   *  changed blocks; used after splits/merges. */
  private renderAllStructure() {
    this.root.replaceChildren(...this.core.doc.blocks.map((b) => this.buildBlockEl(b.id)))
  }

  private touchedIds(steps: Step[]): Set<string> {
    const ids = new Set<string>()
    let structural = false
    for (const s of steps) {
      if (s.t === 'insertText') ids.add(s.at.block)
      else if (s.t === 'deleteRange' || s.t === 'setMark') ids.add(s.from.block)
      else structural = true
    }
    if (structural) ids.add('*')
    return ids
  }

  /** Apply a transaction and re-render only touched blocks; then restore the
   *  DOM selection from `selAfter` (survives re-render — spike scenario). */
  dispatch(origin: string, steps: Step[], selAfter?: Sel): boolean {
    const res = this.core.apply(origin, steps)
    if (!res.ok) {
      this.note('reject', `${origin}:${res.code}`)
      return false
    }
    const ids = this.touchedIds(steps)
    if (ids.has('*')) this.suppressed(() => this.renderAllStructure())
    else for (const id of ids) this.renderBlock(id)
    if (selAfter && !this.composing) {
      this.core.selection = selAfter
      writeDomSelection(this.root, selAfter.anchor, selAfter.head)
    }
    return true
  }

  // ---------- beforeinput ----------

  private modelSel(): Sel | null {
    return readDomSelection(this.root)
  }

  /** Order a (anchor,head) pair within one block. */
  private ordered(sel: Sel): { block: string; from: number; to: number } | null {
    if (sel.anchor.block !== sel.head.block) return null // cross-block: out of spike scope
    return {
      block: sel.anchor.block,
      from: Math.min(sel.anchor.offset, sel.head.offset),
      to: Math.max(sel.anchor.offset, sel.head.offset),
    }
  }

  private onBeforeInput(ev: InputEvent) {
    this.note('beforeinput', `${ev.inputType}${ev.isComposing ? ':composing' : ''}`)
    // §4.2 — during composition the browser owns the DOM. Never prevent
    // insertCompositionText; suspend all other interception too.
    if (this.composing || ev.isComposing || ev.inputType === 'insertCompositionText') return

    const sel = this.modelSel()
    if (!sel) {
      ev.preventDefault()
      return
    }
    const r = this.ordered(sel)

    switch (ev.inputType) {
      case 'insertText': {
        ev.preventDefault()
        if (!r) return
        const steps: Step[] = []
        if (r.to > r.from)
          steps.push({
            t: 'deleteRange',
            from: { block: r.block, offset: r.from },
            to: { block: r.block, offset: r.to },
          })
        const text = ev.data ?? ''
        steps.push({
          t: 'insertText',
          at: { block: r.block, offset: r.from },
          text,
          mark: this.core.markAt(r.block, r.from),
        })
        const after: Point = { block: r.block, offset: r.from + text.length }
        this.dispatch('user.typing', steps, { anchor: after, head: after })
        return
      }
      case 'insertParagraph': {
        ev.preventDefault()
        if (!r) return
        const steps: Step[] = []
        if (r.to > r.from)
          steps.push({
            t: 'deleteRange',
            from: { block: r.block, offset: r.from },
            to: { block: r.block, offset: r.to },
          })
        const newId = freshId()
        steps.push({ t: 'splitBlock', at: { block: r.block, offset: r.from }, newId })
        const after: Point = { block: newId, offset: 0 }
        this.dispatch('user.typing', steps, { anchor: after, head: after })
        return
      }
      case 'deleteContentBackward': {
        ev.preventDefault()
        if (!r) return
        if (r.to > r.from) {
          const after: Point = { block: r.block, offset: r.from }
          this.dispatch(
            'user.typing',
            [
              {
                t: 'deleteRange',
                from: { block: r.block, offset: r.from },
                to: { block: r.block, offset: r.to },
              },
            ],
            { anchor: after, head: after },
          )
          return
        }
        if (r.from > 0) {
          const after: Point = { block: r.block, offset: r.from - 1 }
          this.dispatch(
            'user.typing',
            [
              {
                t: 'deleteRange',
                from: { block: r.block, offset: r.from - 1 },
                to: { block: r.block, offset: r.from },
              },
            ],
            { anchor: after, head: after },
          )
          return
        }
        // Block start: merge with previous block.
        const idx = this.core.blockIndex(r.block)
        if (idx > 0) {
          const prev = this.core.doc.blocks[idx - 1]
          const joinOffset = blockLength(prev)
          const after: Point = { block: prev.id, offset: joinOffset }
          this.dispatch('user.typing', [{ t: 'mergeBlock', first: prev.id, second: r.block }], {
            anchor: after,
            head: after,
          })
        }
        return
      }
      case 'formatBold': {
        ev.preventDefault()
        if (!r) return
        this.toggleBold(r.block, r.from, r.to)
        return
      }
      default:
        // §3.2 fail closed: unknown inputType → preventDefault + no-op.
        ev.preventDefault()
        this.note('failclosed', ev.inputType)
        return
    }
  }

  toggleBold(block: string, from: number, to: number) {
    if (to <= from) return
    const b = this.core.block(block)
    if (!b) return
    // If every char in range is strong → clear; else set.
    let allStrong = true
    let acc = 0
    for (const run of b.runs) {
      const start = acc
      const end = acc + run.text.length
      if (end > from && start < to && run.mark !== 'strong') allStrong = false
      acc = end
    }
    const mark = allStrong ? null : 'strong'
    this.dispatch(
      'user.command',
      [{ t: 'setMark', from: { block, offset: from }, to: { block, offset: to }, mark }],
      { anchor: { block, offset: from }, head: { block, offset: to } },
    )
  }

  // ---------- composition ----------

  private onCompositionStart() {
    this.composing = true
    const sel = this.modelSel()
    this.composingBlock = sel?.anchor.block ?? null
    this.note('compositionstart', this.composingBlock ?? 'unknown')
  }

  private onCompositionEnd() {
    this.note('compositionend')
    this.composing = false
    const blockId = this.composingBlock
    this.composingBlock = null
    // SPIKE FINDING (§4.3 amendment): the commit's mutation records are queued
    // BEFORE compositionend fires but delivered on a microtask AFTER it — with
    // `composing` already false, the tripwire would steal the commit as
    // 'dom.readback'. Drain synchronously here so the composition path owns it.
    this.mo.takeRecords()
    // §4.3 Safari mitigation: schedule read-back on rAF, drain the observer
    // queue again so late post-compositionend mutations fold into the same
    // read-back.
    requestAnimationFrame(() => {
      if (this.destroyed) return
      this.mo.takeRecords() // drain: read-back below supersedes record-by-record handling
      if (blockId) this.readBack(blockId, 'user.typing')
      else this.fullReadBack('user.typing')
    })
  }

  // ---------- read-back reconciliation (the universal recovery path) ----------

  /** One block: DOM text → diff vs model → one transaction → re-render block. */
  readBack(blockId: string, origin: string) {
    const blockEl = this.root.querySelector(`[data-block-id="${blockId}"]`)
    if (!blockEl) {
      this.fullReadBack(origin)
      return
    }
    const domText = blockEl.textContent ?? ''
    const steps = diffToSteps(this.core, blockId, domText)
    // Capture caret from the (ahead-of-model) DOM before we re-render.
    const domSel = readDomSelection(this.root)
    if (steps.length > 0) {
      const ok = this.core.apply(origin, steps)
      if (!ok.ok) this.note('readback-reject', ok.code)
      this.note('readback', `${blockId}:${steps.length} steps`)
    }
    this.renderBlock(blockId)
    if (domSel) {
      this.core.selection = domSel
      writeDomSelection(this.root, domSel.anchor, domSel.head)
    }
  }

  /** Structure changed under us (block elements added/removed by the browser):
   *  rebuild the whole doc from the DOM. Coarse by design — this is the
   *  last-resort floor, and the spike measures how often we land here. */
  fullReadBack(origin: string) {
    this.note('full-readback')
    const domSel = readDomSelection(this.root)
    const domBlocks = Array.from(this.root.querySelectorAll('[data-block-id]'))
    const known = new Set(this.core.doc.blocks.map((b) => b.id))
    const steps: Step[] = []
    for (const el of domBlocks) {
      const id = el.getAttribute('data-block-id')
      if (!id || !known.has(id)) continue
      const ds = diffToSteps(this.core, id, el.textContent ?? '')
      steps.push(...ds)
    }
    if (steps.length > 0) this.core.apply(origin, steps)
    this.renderAll()
    if (domSel) {
      this.core.selection = domSel
      writeDomSelection(this.root, domSel.anchor, domSel.head)
    }
  }

  // ---------- MutationObserver tripwire ----------

  private onMutations(records: MutationRecord[]) {
    if (this.rendering) return
    if (this.composing) return // browser owns the DOM; compositionend drains
    const blockIds = new Set<string>()
    let structural = false
    for (const rec of records) {
      const el = blockElOf(this.root, rec.target)
      if (el) {
        const id = el.getAttribute('data-block-id')
        if (id) blockIds.add(id)
        else structural = true
      } else if (rec.target === this.root) structural = true
      else structural = true
    }
    this.note(
      'mutation',
      `${records.length} records, blocks=${[...blockIds].join(',')}${structural ? ' +structural' : ''}`,
    )
    if (structural) this.fullReadBack('dom.readback')
    else for (const id of blockIds) this.readBack(id, 'dom.readback')
  }

  // ---------- selection sync ----------

  private onSelectionChange() {
    if (this.composing) return // §4.3: no selection writes during composition
    const sel = readDomSelection(this.root)
    if (!sel) return
    const cur = this.core.selection
    if (
      cur &&
      cur.anchor.block === sel.anchor.block &&
      cur.anchor.offset === sel.anchor.offset &&
      cur.head.block === sel.head.block &&
      cur.head.offset === sel.head.offset
    )
      return
    this.core.selection = sel
  }
}

export type { Doc }
export { blockText }
