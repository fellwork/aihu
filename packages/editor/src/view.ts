/**
 * EditorView — binds one EditorCore to one contenteditable root (spec §3, §4).
 *
 * - `beforeinput` (Input Events Level 2) is the interception point; never
 *   execCommand. Unknown inputType → preventDefault + no-op (fail closed).
 * - Composition = browser-owned; `compositionend` SYNCHRONOUSLY drains the
 *   MutationObserver (amended per Phase-0, A1) before scheduling the rAF
 *   read-back, so the commit is attributed to typing, not recovery.
 * - MutationObserver tripwire → structure-aware read-back (A2) with
 *   `origin: 'dom.readback'`.
 * - Commands resolve the live selection FROM THE DOM at dispatch (A4);
 *   programmatic selection writes flush the model signal synchronously.
 * - No HTML sink: rendering is createElement/createTextNode only (A8).
 */

import type { ActiveState, Command } from './commands.ts'
import { activeState, canExecute, executeCommand } from './commands.ts'
import type { EditorCore } from './core.ts'
import { containerLength, findContainer, findTopBlock, isInlineContainer, markAt } from './doc.ts'
import type { FeaturesConfig } from './features.ts'
import { resolveFeatures } from './features.ts'
import { freshId } from './id.ts'
import type { InputRule } from './input-rules.ts'
import { matchInputRules } from './input-rules.ts'
import { plainTextToBlocks, sanitizeHtmlToBlocks } from './paste-sanitize.ts'
import { readDomSelection, writeDomSelection } from './position-map.ts'
import { diffToSteps, reconcileSteps } from './readback.ts'
import type {
  BlockNode,
  DocNode,
  ListItemNode,
  Origin,
  Point,
  SelectionState,
  Step,
  TextNode,
} from './types.ts'

export interface EditorViewOptions {
  features?: FeaturesConfig
  readonly?: boolean
  inputRules?: InputRule[]
}

export class EditorView {
  readonly root: HTMLElement
  readonly core: EditorCore
  composing = false
  private composingBlock: string | null = null
  private features: FeaturesConfig
  private extraRules: InputRule[]
  private readonlyMode: boolean
  private mo: MutationObserver
  private destroyed = false
  private unsubscribe: () => void

  private onBeforeInputBound = (ev: Event) => this.onBeforeInput(ev as InputEvent)
  private onCompositionStartBound = () => this.onCompositionStart()
  private onCompositionEndBound = () => this.onCompositionEnd()
  private onSelectionChangeBound = () => this.onSelectionChange()
  private onKeydownBound = (ev: Event) => this.onKeydown(ev as KeyboardEvent)
  private onPasteBound = (ev: Event) => this.onPaste(ev as ClipboardEvent)

  constructor(root: HTMLElement, core: EditorCore, options: EditorViewOptions = {}) {
    this.root = root
    this.core = core
    this.features = resolveFeatures(options.features)
    this.extraRules = options.inputRules ?? []
    this.readonlyMode = options.readonly ?? false

    root.contentEditable = this.readonlyMode ? 'false' : 'true'
    root.setAttribute('role', 'textbox')
    root.setAttribute('aria-multiline', 'true')
    root.setAttribute('data-aihu-editor-surface', '')

    root.addEventListener('beforeinput', this.onBeforeInputBound)
    root.addEventListener('compositionstart', this.onCompositionStartBound)
    root.addEventListener('compositionend', this.onCompositionEndBound)
    root.addEventListener('keydown', this.onKeydownBound)
    root.addEventListener('paste', this.onPasteBound)
    root.ownerDocument.addEventListener('selectionchange', this.onSelectionChangeBound)

    this.mo = new MutationObserver((records) => this.onMutations(records))
    this.mo.observe(root, { subtree: true, childList: true, characterData: true })

    this.unsubscribe = core.onTransaction((tr) => {
      // Renders triggered by our own dispatches happen inline in dispatch();
      // external applies (agent gateway, host setDoc) land here.
      if (!this.renderedInline) this.renderTransaction(tr.steps, tr.selectionAfter ?? null)
    })

    this.renderAll()
  }

  destroy(): void {
    this.destroyed = true
    this.unsubscribe()
    this.mo.disconnect()
    this.root.removeEventListener('beforeinput', this.onBeforeInputBound)
    this.root.removeEventListener('compositionstart', this.onCompositionStartBound)
    this.root.removeEventListener('compositionend', this.onCompositionEndBound)
    this.root.removeEventListener('keydown', this.onKeydownBound)
    this.root.removeEventListener('paste', this.onPasteBound)
    this.root.ownerDocument.removeEventListener('selectionchange', this.onSelectionChangeBound)
  }

  setReadonly(readonly: boolean): void {
    this.readonlyMode = readonly
    this.root.contentEditable = readonly ? 'false' : 'true'
  }

  setFeatures(features?: FeaturesConfig): void {
    this.features = resolveFeatures(features)
  }

  focus(): void {
    this.root.focus()
  }

  // -------------------------------------------------------------------------
  // element API surface (spec §9.1) — selection resolved from the DOM (A4)
  // -------------------------------------------------------------------------

  domSelection(): SelectionState | null {
    return readDomSelection(this.root)
  }

  exec(command: Command): boolean {
    if (this.readonlyMode) return false
    const sel = this.domSelection() ?? this.core.selection()
    const ok = executeCommand(this.core, sel, command, this.features)
    return ok
  }

  can(command: Command): boolean {
    if (this.readonlyMode) return false
    const sel = this.domSelection() ?? this.core.selection()
    return canExecute(this.core, sel, command, this.features)
  }

  activeState(): ActiveState {
    return activeState(this.core, this.domSelection() ?? this.core.selection())
  }

  // -------------------------------------------------------------------------
  // rendering — no HTML sink anywhere (A8); block-granular, keyed by id
  // -------------------------------------------------------------------------

  private suppressing = false
  private renderedInline = false

  /** Run DOM writes with the observer queue swallowed, so our own renders never trip read-back. */
  private suppressed(fn: () => void): void {
    this.suppressing = true
    try {
      fn()
    } finally {
      this.mo.takeRecords()
      this.suppressing = false
    }
  }

  private doc(): DocNode {
    return this.core.doc()
  }

  private buildInline(el: HTMLElement, runs: TextNode[]): void {
    const doc = this.root.ownerDocument
    if (runs.length === 0) {
      el.appendChild(doc.createElement('br')) // caret anchor for empty containers
      return
    }
    for (const run of runs) {
      const text = doc.createTextNode(run.text)
      if (!run.mark) {
        el.appendChild(text)
        continue
      }
      const tag =
        run.mark.type === 'strong'
          ? 'strong'
          : run.mark.type === 'em'
            ? 'em'
            : run.mark.type === 'code'
              ? 'code'
              : 'a'
      const wrap = doc.createElement(tag)
      if (run.mark.type === 'link') wrap.setAttribute('href', run.mark.attrs.href)
      wrap.appendChild(text)
      el.appendChild(wrap)
    }
  }

  private buildBlockEl(block: BlockNode): HTMLElement {
    const doc = this.root.ownerDocument
    switch (block.type) {
      case 'paragraph': {
        const p = doc.createElement('p')
        p.setAttribute('data-block-id', block.id)
        this.buildInline(p, block.content)
        return p
      }
      case 'heading': {
        const h = doc.createElement(`h${block.attrs.level}`)
        h.setAttribute('data-block-id', block.id)
        this.buildInline(h, block.content)
        return h
      }
      case 'blockquote': {
        const q = doc.createElement('blockquote')
        q.setAttribute('data-block-id', block.id)
        this.buildInline(q, block.content)
        return q
      }
      case 'list': {
        const list = doc.createElement(block.attrs.ordered ? 'ol' : 'ul')
        list.setAttribute('data-list-id', block.id)
        for (const item of block.children) {
          const li = doc.createElement('li')
          li.setAttribute('data-block-id', item.id)
          this.buildInline(li, item.content)
          list.appendChild(li)
        }
        return list
      }
      case 'hr': {
        const hr = doc.createElement('hr')
        hr.setAttribute('data-block-id', block.id)
        hr.setAttribute('contenteditable', 'false')
        return hr
      }
    }
  }

  renderAll(): void {
    this.suppressed(() => {
      this.root.replaceChildren(...this.doc().children.map((b) => this.buildBlockEl(b)))
    })
  }

  /** Re-render only the containers a transaction touched (spec §3.3). */
  private renderTransaction(steps: Step[], selectionAfter: SelectionState | null): void {
    const touched = new Set<string>()
    let structural = false
    for (const s of steps) {
      switch (s.t) {
        case 'insertText':
        case 'insertRuns':
          touched.add(s.at.block)
          break
        case 'deleteRange':
        case 'setMark':
          touched.add(s.from.block)
          break
        case 'setRuns':
          touched.add(s.id)
          break
        default:
          structural = true
      }
    }
    if (structural) this.renderAll()
    else for (const id of touched) this.renderContainer(id)
    if (selectionAfter && !this.composing) this.writeSelection(selectionAfter)
  }

  private renderContainer(id: string): void {
    const loc = findContainer(this.doc(), id)
    const existing = this.root.querySelector(`[data-block-id="${id}"]`)
    if (!loc) {
      this.renderAll()
      return
    }
    this.suppressed(() => {
      if (!existing) {
        this.renderAll()
        return
      }
      if (loc.parentList) {
        const li = this.root.ownerDocument.createElement('li')
        li.setAttribute('data-block-id', id)
        this.buildInline(li, loc.node.content)
        existing.replaceWith(li)
        return
      }
      const top = findTopBlock(this.doc(), id)
      if (top) existing.replaceWith(this.buildBlockEl(top.node))
      else this.renderAll()
    })
  }

  /** Model → DOM selection, flushing the signal synchronously (A4). */
  private writeSelection(sel: SelectionState): void {
    writeDomSelection(this.root, sel)
    this.core.setSelection(sel)
  }

  // -------------------------------------------------------------------------
  // dispatch — apply + render + selection restore
  // -------------------------------------------------------------------------

  dispatch(origin: Origin, steps: Step[], selectionAfter?: SelectionState): boolean {
    this.renderedInline = true
    try {
      const res = this.core.dispatch(origin, steps, selectionAfter)
      if (!res.ok) return false
      this.renderTransaction(steps, selectionAfter ?? null)
      return true
    } finally {
      this.renderedInline = false
    }
  }

  // -------------------------------------------------------------------------
  // beforeinput
  // -------------------------------------------------------------------------

  private orderedSel(): { block: string; from: number; to: number } | null {
    const sel = this.domSelection()
    if (!sel) return null
    if (sel.type === 'caret') return { block: sel.at.block, from: sel.at.offset, to: sel.at.offset }
    if (sel.type === 'range') {
      if (sel.anchor.block !== sel.head.block) return null // cross-block edits are composed per-case
      return {
        block: sel.anchor.block,
        from: Math.min(sel.anchor.offset, sel.head.offset),
        to: Math.max(sel.anchor.offset, sel.head.offset),
      }
    }
    return null
  }

  private onBeforeInput(ev: InputEvent): void {
    // §4.2 — during composition the browser owns the DOM. Never prevent
    // insertCompositionText; suspend all other interception too.
    if (this.composing || ev.isComposing || ev.inputType === 'insertCompositionText') return
    if (this.readonlyMode) {
      ev.preventDefault()
      return
    }
    const r = this.orderedSel()
    switch (ev.inputType) {
      case 'insertText': {
        ev.preventDefault()
        if (!r) return
        this.insertTextAt(r, ev.data ?? '')
        return
      }
      case 'insertParagraph':
      case 'insertLineBreak': {
        // the dialect has no hard breaks — a line break is a paragraph break
        ev.preventDefault()
        if (!r) return
        this.insertParagraphAt(r)
        return
      }
      case 'deleteContentBackward':
      case 'deleteWordBackward': {
        ev.preventDefault()
        if (!r) return
        this.deleteBackwardAt(r, ev.inputType === 'deleteWordBackward')
        return
      }
      case 'deleteContentForward':
      case 'deleteWordForward': {
        ev.preventDefault()
        if (!r) return
        this.deleteForwardAt(r, ev.inputType === 'deleteWordForward')
        return
      }
      case 'deleteByCut': {
        ev.preventDefault()
        if (!r || r.to <= r.from) return
        this.deleteRangeAt(r)
        return
      }
      case 'formatBold':
        ev.preventDefault()
        this.exec({ type: 'toggleMark', mark: 'strong' })
        return
      case 'formatItalic':
        ev.preventDefault()
        this.exec({ type: 'toggleMark', mark: 'em' })
        return
      case 'historyUndo':
        ev.preventDefault()
        this.exec({ type: 'undo' })
        return
      case 'historyRedo':
        ev.preventDefault()
        this.exec({ type: 'redo' })
        return
      case 'insertFromPaste':
      case 'insertFromDrop':
        // paste is handled by the `paste` event pipeline; drop is v2
        ev.preventDefault()
        return
      default:
        // §3.2 fail closed: unknown inputType → preventDefault + no-op.
        ev.preventDefault()
        return
    }
  }

  private insertTextAt(r: { block: string; from: number; to: number }, text: string): void {
    if (text === '') return
    const steps: Step[] = []
    if (r.to > r.from) {
      steps.push({
        t: 'deleteRange',
        from: { block: r.block, offset: r.from },
        to: { block: r.block, offset: r.to },
      })
    }
    const loc = findContainer(this.doc(), r.block)
    if (!loc) return
    steps.push({
      t: 'insertText',
      at: { block: r.block, offset: r.from },
      text,
      mark: markAt(loc.node, r.from),
    })
    const after: Point = { block: r.block, offset: r.from + text.length }
    if (!this.dispatch('user.typing', steps, { type: 'caret', at: after })) return
    // Input rules run AFTER the insert commit, as a SEPARATE transaction
    // (spec §5) — one undo restores the literal typed text.
    const trigger = text[text.length - 1] as string
    this.runInputRules(r.block, after.offset, trigger)
  }

  private runInputRules(blockId: string, caretOffset: number, trigger: string): void {
    if (this.composing) return
    const match = matchInputRules(
      this.doc(),
      blockId,
      caretOffset,
      trigger,
      this.features,
      this.extraRules,
    )
    if (!match) return
    this.dispatch('inputrule', match.steps, { type: 'caret', at: match.caretAfter })
  }

  private insertParagraphAt(r: { block: string; from: number; to: number }): void {
    // Enter-armed rules first (hr): `---` + Enter, checked before splitting.
    const ruleMatch =
      r.to === r.from
        ? matchInputRules(this.doc(), r.block, r.from, '\n', this.features, this.extraRules)
        : null
    if (ruleMatch) {
      this.dispatch('inputrule', ruleMatch.steps, { type: 'caret', at: ruleMatch.caretAfter })
      return
    }
    const loc = findContainer(this.doc(), r.block)
    if (!loc) return
    // Enter on an EMPTY list item exits the list.
    if (loc.parentList && containerLength(loc.node) === 0) {
      this.exitList(loc.parentList.id, r.block)
      return
    }
    const steps: Step[] = []
    if (r.to > r.from) {
      steps.push({
        t: 'deleteRange',
        from: { block: r.block, offset: r.from },
        to: { block: r.block, offset: r.to },
      })
    }
    const newId = freshId()
    steps.push({ t: 'splitBlock', at: { block: r.block, offset: r.from }, newId })
    this.dispatch('user.typing', steps, { type: 'caret', at: { block: newId, offset: 0 } })
  }

  private exitList(listId: string, itemId: string): void {
    const doc = this.doc()
    const list = findTopBlock(doc, listId)
    if (!list || list.node.type !== 'list') return
    if (list.node.children.length === 1) {
      this.dispatch('user.typing', [{ t: 'setBlockType', id: listId, type: 'paragraph' }], {
        type: 'caret',
        at: { block: itemId, offset: 0 },
      })
      return
    }
    const pid = freshId()
    this.dispatch(
      'user.typing',
      [
        { t: 'removeBlock', id: itemId },
        { t: 'insertBlock', after: listId, node: { id: pid, type: 'paragraph', content: [] } },
      ],
      { type: 'caret', at: { block: pid, offset: 0 } },
    )
  }

  private deleteRangeAt(r: { block: string; from: number; to: number }): void {
    this.dispatch(
      'user.typing',
      [
        {
          t: 'deleteRange',
          from: { block: r.block, offset: r.from },
          to: { block: r.block, offset: r.to },
        },
      ],
      { type: 'caret', at: { block: r.block, offset: r.from } },
    )
  }

  private deleteBackwardAt(r: { block: string; from: number; to: number }, word: boolean): void {
    if (r.to > r.from) {
      this.deleteRangeAt(r)
      return
    }
    if (r.from > 0) {
      const loc = findContainer(this.doc(), r.block)
      if (!loc) return
      let from = r.from - 1
      const text = containerTextOf(loc.node.content)
      if (word) {
        from = wordLeft(text, r.from)
      } else if (isLowSurrogatePair(text, r.from)) {
        from = r.from - 2 // never split a surrogate pair (A3)
      }
      this.deleteRangeAt({ block: r.block, from, to: r.from })
      return
    }
    this.backspaceAtStart(r.block)
    return
  }

  private backspaceAtStart(blockId: string): void {
    const doc = this.doc()
    const loc = findContainer(doc, blockId)
    if (!loc) return
    if (loc.parentList) {
      if (loc.itemIndex > 0) {
        const prev = loc.parentList.children[loc.itemIndex - 1] as ListItemNode
        this.dispatch('user.typing', [{ t: 'mergeBlock', first: prev.id, second: blockId }], {
          type: 'caret',
          at: { block: prev.id, offset: containerLength(prev) },
        })
        return
      }
      // first item: lift out of the list
      if (loc.parentList.children.length === 1) {
        this.dispatch(
          'user.typing',
          [{ t: 'setBlockType', id: loc.parentList.id, type: 'paragraph' }],
          {
            type: 'caret',
            at: { block: blockId, offset: 0 },
          },
        )
        return
      }
      const listTop = findTopBlock(doc, loc.parentList.id)
      if (!listTop) return
      const prevTop = listTop.index > 0 ? (doc.children[listTop.index - 1] as BlockNode).id : null
      const pid = freshId()
      this.dispatch(
        'user.typing',
        [
          {
            t: 'insertBlock',
            after: prevTop,
            node: { id: pid, type: 'paragraph', content: structuredClone(loc.node.content) },
          },
          { t: 'removeBlock', id: blockId },
        ],
        { type: 'caret', at: { block: pid, offset: 0 } },
      )
      return
    }
    // heading/blockquote soften to paragraph before merging
    if (loc.node.type === 'heading' || loc.node.type === 'blockquote') {
      this.dispatch('user.typing', [{ t: 'setBlockType', id: blockId, type: 'paragraph' }], {
        type: 'caret',
        at: { block: blockId, offset: 0 },
      })
      return
    }
    const top = findTopBlock(doc, blockId)
    if (!top || top.index === 0) return
    const prev = doc.children[top.index - 1] as BlockNode
    if (prev.type === 'hr') {
      this.dispatch('user.typing', [{ t: 'removeBlock', id: prev.id }], {
        type: 'caret',
        at: { block: blockId, offset: 0 },
      })
      return
    }
    if (prev.type === 'list') {
      const lastItem = prev.children[prev.children.length - 1] as ListItemNode
      const offset = containerLength(lastItem)
      const runs = structuredClone((loc.node as { content: TextNode[] }).content)
      const steps: Step[] = [{ t: 'removeBlock', id: blockId }]
      if (runs.length > 0) steps.push({ t: 'insertRuns', at: { block: lastItem.id, offset }, runs })
      this.dispatch('user.typing', steps, { type: 'caret', at: { block: lastItem.id, offset } })
      return
    }
    if (isInlineContainer(prev)) {
      this.dispatch('user.typing', [{ t: 'mergeBlock', first: prev.id, second: blockId }], {
        type: 'caret',
        at: { block: prev.id, offset: containerLength(prev) },
      })
    }
  }

  private deleteForwardAt(r: { block: string; from: number; to: number }, word: boolean): void {
    if (r.to > r.from) {
      this.deleteRangeAt(r)
      return
    }
    const loc = findContainer(this.doc(), r.block)
    if (!loc) return
    const text = containerTextOf(loc.node.content)
    if (r.from < text.length) {
      let to = r.from + 1
      if (word) to = wordRight(text, r.from)
      else if (isHighSurrogateAt(text, r.from)) to = r.from + 2
      this.dispatch(
        'user.typing',
        [
          {
            t: 'deleteRange',
            from: { block: r.block, offset: r.from },
            to: { block: r.block, offset: to },
          },
        ],
        { type: 'caret', at: { block: r.block, offset: r.from } },
      )
      return
    }
    // at container end: merge the NEXT container into this one (same rules
    // as backspace-at-start, driven from the other side)
    const doc = this.doc()
    if (loc.parentList) {
      if (loc.itemIndex < loc.parentList.children.length - 1) {
        const next = loc.parentList.children[loc.itemIndex + 1] as ListItemNode
        this.dispatch('user.typing', [{ t: 'mergeBlock', first: r.block, second: next.id }], {
          type: 'caret',
          at: { block: r.block, offset: r.from },
        })
      }
      return
    }
    const top = findTopBlock(doc, r.block)
    if (!top || top.index >= doc.children.length - 1) return
    const next = doc.children[top.index + 1] as BlockNode
    if (next.type === 'hr') {
      this.dispatch('user.typing', [{ t: 'removeBlock', id: next.id }], {
        type: 'caret',
        at: { block: r.block, offset: r.from },
      })
      return
    }
    if (isInlineContainer(next)) {
      this.dispatch('user.typing', [{ t: 'mergeBlock', first: r.block, second: next.id }], {
        type: 'caret',
        at: { block: r.block, offset: r.from },
      })
    }
  }

  // -------------------------------------------------------------------------
  // keyboard shortcuts (native history is empty because we preventDefault
  // everything, so historyUndo/historyRedo never fire — route Mod+Z here)
  // -------------------------------------------------------------------------

  private onKeydown(ev: KeyboardEvent): void {
    if (this.composing) return
    const mod = ev.metaKey || ev.ctrlKey
    if (!mod) return
    const key = ev.key.toLowerCase()
    if (key === 'z' && !ev.shiftKey) {
      ev.preventDefault()
      this.exec({ type: 'undo' })
    } else if ((key === 'z' && ev.shiftKey) || key === 'y') {
      ev.preventDefault()
      this.exec({ type: 'redo' })
    } else if (key === 'b') {
      ev.preventDefault()
      this.exec({ type: 'toggleMark', mark: 'strong' })
    } else if (key === 'i') {
      ev.preventDefault()
      this.exec({ type: 'toggleMark', mark: 'em' })
    }
  }

  // -------------------------------------------------------------------------
  // composition (spec §4.2, amended per Phase-0 A1)
  // -------------------------------------------------------------------------

  private onCompositionStart(): void {
    this.composing = true
    const sel = this.domSelection()
    this.composingBlock = sel
      ? sel.type === 'node'
        ? sel.block
        : sel.type === 'caret'
          ? sel.at.block
          : sel.anchor.block
      : null
  }

  private onCompositionEnd(): void {
    this.composing = false
    const blockId = this.composingBlock
    this.composingBlock = null
    // A1 (amended per Phase-0): the commit's mutation records are queued
    // BEFORE compositionend fires but delivered on a microtask AFTER it —
    // with `composing` already false the tripwire would steal the commit as
    // 'dom.readback'. Drain synchronously so the composition path owns it.
    this.mo.takeRecords()
    // §4.3 Safari mitigation: schedule the read-back on rAF; drain again so
    // late post-compositionend stragglers fold into the same read-back.
    requestAnimationFrame(() => {
      if (this.destroyed) return
      this.mo.takeRecords()
      if (blockId) this.readBack(blockId, 'user.typing')
      else this.fullReadBack('user.typing')
    })
  }

  // -------------------------------------------------------------------------
  // read-back reconciliation (§4.3, structure-aware per A2)
  // -------------------------------------------------------------------------

  private readBack(blockId: string, origin: Origin): void {
    const el = this.root.querySelector(`[data-block-id="${blockId}"]`)
    if (!el) {
      this.fullReadBack(origin)
      return
    }
    const doc = this.doc()
    // Structure-aware (A2): rebuild runs from our own rendered shape. For the
    // composition path, prefer the minimal flat diff when the change did not
    // disturb mark structure (keeps typing coalescing), else run-level steps.
    let steps = reconcileSteps(doc, blockId, el)
    if (steps.length > 0 && origin === 'user.typing') {
      const flat = diffToSteps(doc, blockId, el.textContent ?? '')
      const loc = findContainer(doc, blockId)
      if (flat.length > 0 && loc && loc.node.content.length <= 1) steps = flat
    }
    const domSel = this.domSelection() // ahead-of-model caret, captured pre-render
    if (steps.length > 0) this.core.dispatch(origin, steps)
    this.renderContainer(blockId)
    if (domSel) this.writeSelection(domSel)
  }

  private fullReadBack(origin: Origin): void {
    const doc = this.doc()
    const domSel = this.domSelection()
    const steps: Step[] = []
    for (const el of Array.from(this.root.querySelectorAll('[data-block-id]'))) {
      const id = el.getAttribute('data-block-id')
      if (!id) continue
      if (!findContainer(doc, id)) continue
      steps.push(...reconcileSteps(doc, id, el))
    }
    if (steps.length > 0) this.core.dispatch(origin, steps)
    this.renderAll()
    if (domSel) this.writeSelection(domSel)
  }

  // -------------------------------------------------------------------------
  // MutationObserver tripwire
  // -------------------------------------------------------------------------

  private onMutations(records: MutationRecord[]): void {
    if (this.suppressing || this.destroyed) return
    if (this.composing) return // browser owns the DOM; compositionend drains
    const blockIds = new Set<string>()
    let structural = false
    for (const rec of records) {
      const el = blockElOfLocal(this.root, rec.target)
      const id = el?.getAttribute('data-block-id')
      if (id) blockIds.add(id)
      else structural = true
    }
    if (structural) this.fullReadBack('dom.readback')
    else for (const id of blockIds) this.readBack(id, 'dom.readback')
  }

  // -------------------------------------------------------------------------
  // selection sync (§4.1; A4 — programmatic writes flush synchronously)
  // -------------------------------------------------------------------------

  private onSelectionChange(): void {
    if (this.composing || this.destroyed) return
    const sel = readDomSelection(this.root)
    if (!sel) return
    const cur = this.core.selection()
    if (cur && selectionsEqual(cur, sel)) return
    this.core.setSelection(sel)
  }

  // -------------------------------------------------------------------------
  // paste (spec §6.1)
  // -------------------------------------------------------------------------

  private onPaste(ev: ClipboardEvent): void {
    ev.preventDefault()
    if (this.readonlyMode || this.composing) return
    const dt = ev.clipboardData
    if (!dt) return
    const html = dt.getData('text/html')
    const blocks = html
      ? sanitizeHtmlToBlocks(html, this.features)
      : plainTextToBlocks(dt.getData('text/plain'))
    this.insertBlocksAtSelection(blocks)
  }

  /** Insert a sanitized fragment at the current selection, one transaction. */
  insertBlocksAtSelection(blocks: BlockNode[]): boolean {
    if (blocks.length === 0) return false
    const r = this.orderedSel()
    if (!r) return false
    const steps: Step[] = []
    if (r.to > r.from) {
      steps.push({
        t: 'deleteRange',
        from: { block: r.block, offset: r.from },
        to: { block: r.block, offset: r.to },
      })
    }
    const first = blocks[0] as BlockNode
    let caretAfter: Point
    const loc = findContainer(this.doc(), r.block)
    if (!loc) return false
    const single = blocks.length === 1 && first.type === 'paragraph'
    if (single) {
      // single paragraph: splice its runs inline at the caret
      const runs = first.content
      steps.push({ t: 'insertRuns', at: { block: r.block, offset: r.from }, runs })
      let len = 0
      for (const run of runs) len += run.text.length
      caretAfter = { block: r.block, offset: r.from + len }
      return this.dispatch('user.paste', steps, { type: 'caret', at: caretAfter })
    }
    // multi-block: split the current container, insert blocks between
    const splitId = freshId()
    steps.push({ t: 'splitBlock', at: { block: r.block, offset: r.from }, newId: splitId })
    // anchor for top-level inserts: the container's TOP-LEVEL block
    const anchorTop = loc.parentList ? loc.parentList.id : r.block
    let after: string = anchorTop
    for (const b of blocks) {
      steps.push({ t: 'insertBlock', after, node: b })
      after = b.id
    }
    const last = blocks[blocks.length - 1] as BlockNode
    const lastContainerId =
      last.type === 'list'
        ? (last.children[last.children.length - 1] as ListItemNode).id
        : last.type === 'hr'
          ? null
          : last.id
    // tidy: a paste into an empty top-level paragraph should not strand
    // empty halves around the fragment
    const emptySource =
      !loc.parentList && loc.node.type === 'paragraph' && containerLength(loc.node) === 0
    if (emptySource && r.from === 0 && r.to === r.from) {
      steps.push({ t: 'removeBlock', id: r.block })
      if (lastContainerId) steps.push({ t: 'removeBlock', id: splitId })
    }
    caretAfter = lastContainerId
      ? { block: lastContainerId, offset: containerLenOf(last, lastContainerId) }
      : { block: splitId, offset: 0 }
    return this.dispatch('user.paste', steps, { type: 'caret', at: caretAfter })
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function blockElOfLocal(root: Element, node: Node): Element | null {
  let cur: Node | null = node
  while (cur && cur !== root) {
    if (cur instanceof Element && cur.hasAttribute('data-block-id')) return cur
    cur = cur.parentNode
  }
  return null
}

function selectionsEqual(a: SelectionState, b: SelectionState): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'caret' && b.type === 'caret')
    return a.at.block === b.at.block && a.at.offset === b.at.offset
  if (a.type === 'range' && b.type === 'range')
    return (
      a.anchor.block === b.anchor.block &&
      a.anchor.offset === b.anchor.offset &&
      a.head.block === b.head.block &&
      a.head.offset === b.head.offset
    )
  if (a.type === 'node' && b.type === 'node') return a.block === b.block
  return false
}

function containerTextOf(runs: TextNode[]): string {
  let s = ''
  for (const run of runs) s += run.text
  return s
}

function containerLenOf(block: BlockNode, containerId: string): number {
  if (block.type === 'list') {
    const item = block.children.find((c) => c.id === containerId)
    return item ? containerTextOf(item.content).length : 0
  }
  if (block.type === 'hr') return 0
  return containerTextOf(block.content).length
}

/** UTF-16 aware (A3): true when the char BEFORE `offset` closes a surrogate pair. */
function isLowSurrogatePair(text: string, offset: number): boolean {
  if (offset < 2) return false
  const low = text.charCodeAt(offset - 1)
  const high = text.charCodeAt(offset - 2)
  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff
}

function isHighSurrogateAt(text: string, offset: number): boolean {
  const high = text.charCodeAt(offset)
  const low = text.charCodeAt(offset + 1)
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff
}

function wordLeft(text: string, from: number): number {
  let i = from
  while (i > 0 && /\s/.test(text[i - 1] as string)) i--
  while (i > 0 && !/\s/.test(text[i - 1] as string)) i--
  return i
}

function wordRight(text: string, from: number): number {
  let i = from
  while (i < text.length && /\s/.test(text[i] as string)) i++
  while (i < text.length && !/\s/.test(text[i] as string)) i++
  return i
}
