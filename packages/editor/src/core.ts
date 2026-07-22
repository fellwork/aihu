/**
 * EditorCore — the DOM-free heart (spec §2, §3.1). One apply() door:
 * validate → mutate a clone → normalize (I3) → invariant check → commit doc
 * signal inside batch() → history → notify. It never partially applies.
 *
 * Undo/redo lives here: entries coalesce for `user.typing` in the same block
 * with contiguous offsets within 1 s; every other origin is its own entry.
 * Agent transactions sit in the SAME stack (G2 — symmetric undo).
 */

import { batch, type Read, signal, type Write } from '@aihu/signals'
import { emptyDoc, normalizeDoc, validateDoc } from './doc.ts'
import { freshId } from './id.ts'
import { applyStep, invertStep } from './steps.ts'
import type {
  ApplyResult,
  Dispose,
  DocNode,
  Origin,
  SelectionState,
  Step,
  Transaction,
} from './types.ts'

interface HistoryEntry {
  steps: Step[]
  /** Inverses in REVERSED order — applying them front-to-back undoes the entry. */
  inverse: Step[]
  selBefore: SelectionState | null
  selAfter: SelectionState | null
  origin: Origin
  time: number
}

/** Typing coalescing window (spec §2): ~1 s. */
const COALESCE_MS = 1000

export class EditorCore {
  readonly doc: Read<DocNode>
  readonly selection: Read<SelectionState | null>
  private setDocSignal: Write<DocNode>
  private setSelectionSignal: Write<SelectionState | null>
  private listeners: Array<(tr: Transaction, doc: DocNode) => void> = []
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  /** History depth floor — plenty for a journal entry, bounded for memory. */
  private maxHistory = 500

  constructor(doc?: DocNode) {
    const initial = doc ?? emptyDoc()
    const err = validateDoc(initial)
    if (err) throw new Error(`editor: invalid initial document (${err})`)
    const [readDoc, writeDoc] = signal<DocNode>(initial)
    const [readSel, writeSel] = signal<SelectionState | null>(null)
    this.doc = readDoc
    this.selection = readSel
    this.setDocSignal = writeDoc
    this.setSelectionSignal = writeSel
  }

  onTransaction(cb: (tr: Transaction, doc: DocNode) => void): Dispose {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb)
    }
  }

  /** Write the selection signal (the view flushes this synchronously — A4). */
  setSelection(sel: SelectionState | null): void {
    // updater form: a plain union value trips Write<T>'s generic inference
    this.setSelectionSignal(() => sel)
  }

  /** Convenience: build + apply a transaction. */
  dispatch(origin: Origin, steps: Step[], selectionAfter?: SelectionState): ApplyResult {
    return this.apply({
      id: freshId(),
      time: Date.now(),
      origin,
      steps,
      ...(selectionAfter ? { selectionAfter } : {}),
    })
  }

  /** The single door — every mutation (keyboard, paste, agent) passes here. */
  apply(tr: Transaction): ApplyResult {
    if (tr.steps.length === 0) return { ok: false, code: 'empty_transaction' }
    const before = this.doc()
    const draft = structuredClone(before)
    const inverse: Step[] = []
    for (const step of tr.steps) {
      // invert against the CURRENT draft state (the doc this step sees)
      let inv: Step | null = null
      try {
        inv = invertStep(step, draft)
      } catch {
        return { ok: false, code: 'unknown_block', step }
      }
      const err = applyStep(draft, step)
      if (err) return { ok: false, code: err, step }
      inverse.unshift(inv)
    }
    normalizeDoc(draft)
    const invariant = validateDoc(draft)
    if (invariant) return { ok: false, code: invariant }

    const selBefore = this.selection()
    batch(() => {
      this.setDocSignal(draft)
      const selAfter = tr.selectionAfter
      if (selAfter) this.setSelectionSignal(() => selAfter)
    })
    if (tr.origin !== 'history') {
      this.pushHistory({
        steps: tr.steps,
        inverse,
        selBefore,
        selAfter: tr.selectionAfter ?? null,
        origin: tr.origin,
        time: tr.time,
      })
    }
    for (const cb of this.listeners) cb(tr, draft)
    return { ok: true, tr }
  }

  invert(step: Step, docBefore: DocNode): Step {
    return invertStep(step, docBefore)
  }

  // -------------------------------------------------------------------------
  // history
  // -------------------------------------------------------------------------

  private pushHistory(entry: HistoryEntry): void {
    this.redoStack = []
    const prev = this.undoStack[this.undoStack.length - 1]
    if (prev && this.coalesces(prev, entry)) {
      prev.steps = [...prev.steps, ...entry.steps]
      prev.inverse = [...entry.inverse, ...prev.inverse]
      prev.selAfter = entry.selAfter
      prev.time = entry.time
      return
    }
    this.undoStack.push(entry)
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift()
  }

  /**
   * Coalescing (spec §2): only `user.typing`, same block, contiguous
   * offsets, Δt < 1 s. Paste, input rules, commands, agents: own entries.
   */
  private coalesces(prev: HistoryEntry, next: HistoryEntry): boolean {
    if (prev.origin !== 'user.typing' || next.origin !== 'user.typing') return false
    if (next.time - prev.time >= COALESCE_MS) return false
    const lastStep = prev.steps[prev.steps.length - 1]
    const nextStep = next.steps[0]
    if (!lastStep || !nextStep) return false
    // contiguity: this insert starts where the previous one ended, same
    // block — or this delete ends where the previous delete started
    // (backspace runs), same block.
    if (lastStep.t === 'insertText' && nextStep.t === 'insertText') {
      return (
        nextStep.at.block === lastStep.at.block &&
        nextStep.at.offset === lastStep.at.offset + lastStep.text.length
      )
    }
    if (lastStep.t === 'deleteRange' && nextStep.t === 'deleteRange') {
      return (
        nextStep.from.block === lastStep.from.block && nextStep.to.offset === lastStep.from.offset
      )
    }
    return false
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undo(): boolean {
    const entry = this.undoStack.pop()
    if (!entry) return false
    const res = this.apply({
      id: freshId(),
      time: Date.now(),
      origin: 'history',
      steps: entry.inverse,
      ...(entry.selBefore ? { selectionAfter: entry.selBefore } : {}),
    })
    if (!res.ok) return false // should not happen; keep the stack honest
    this.redoStack.push(entry)
    return true
  }

  redo(): boolean {
    const entry = this.redoStack.pop()
    if (!entry) return false
    const res = this.apply({
      id: freshId(),
      time: Date.now(),
      origin: 'history',
      steps: entry.steps,
      ...(entry.selAfter ? { selectionAfter: entry.selAfter } : {}),
    })
    if (!res.ok) return false
    this.undoStack.push(entry)
    return true
  }

  /** Replace the whole document (load / agent setDoc). Clears history. */
  load(doc: DocNode, origin: Origin = 'load'): ApplyResult {
    const err = validateDoc(doc)
    if (err) return { ok: false, code: err }
    const tr: Transaction = { id: freshId(), time: Date.now(), origin, steps: [] }
    batch(() => {
      this.setDocSignal(structuredClone(doc))
      this.setSelectionSignal(null)
    })
    this.undoStack = []
    this.redoStack = []
    for (const cb of this.listeners) cb(tr, this.doc())
    return { ok: true, tr }
  }
}
