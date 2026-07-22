// Phase-0 spike: miniature EditorCore per architecture.md §1/§2.
// Deliberately tiny: paragraphs + text runs with ONE mark ('strong'), the five
// steps the spike scenarios need, single apply() door, normalization (I3),
// transaction log with origins (G3). No history, no serializers — out of spike scope.

export type Mark = 'strong' | null

export interface TextRun {
  text: string
  mark: Mark
}

export interface Block {
  id: string
  runs: TextRun[]
}

export interface Doc {
  blocks: Block[]
}

export interface Point {
  block: string
  offset: number
}

export interface Sel {
  anchor: Point
  head: Point
}

export type Step =
  | { t: 'insertText'; at: Point; text: string; mark: Mark }
  | { t: 'deleteRange'; from: Point; to: Point } // same block only (spike scope)
  | { t: 'setMark'; from: Point; to: Point; mark: Mark }
  | { t: 'splitBlock'; at: Point; newId: string }
  | { t: 'mergeBlock'; first: string; second: string }

export interface Transaction {
  origin: string
  steps: Step[]
  time: number
}

export interface ApplyResult {
  ok: boolean
  code?: string
}

let idCounter = 0
export function freshId(): string {
  idCounter += 1
  return `b_${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Flatten a block to parallel char/mark arrays — the spike's whole edit algebra. */
function flatten(block: Block): { chars: string[]; marks: Mark[] } {
  const chars: string[] = []
  const marks: Mark[] = []
  for (const run of block.runs) {
    for (const ch of run.text) {
      // NOTE: `for..of` iterates code points, so surrogate pairs stay intact,
      // but offsets elsewhere are UTF-16 units. Spike finding: unify on UTF-16.
      chars.push(ch)
      marks.push(run.mark)
    }
  }
  return { chars, marks }
}

/** Rebuild normalized runs (I3): merge equal-mark neighbors, drop empties. */
function rebuild(chars: string[], marks: Mark[]): TextRun[] {
  const runs: TextRun[] = []
  for (let i = 0; i < chars.length; i++) {
    const last = runs[runs.length - 1]
    if (last && last.mark === marks[i]) last.text += chars[i]
    else runs.push({ text: chars[i], mark: marks[i] })
  }
  return runs
}

export function blockText(block: Block): string {
  return block.runs.map((r) => r.text).join('')
}

export function blockLength(block: Block): number {
  return blockText(block).length
}

export class EditorCore {
  doc: Doc
  selection: Sel | null = null
  transactions: Transaction[] = []
  private listeners: Array<(tr: Transaction, doc: Doc) => void> = []

  constructor(doc?: Doc) {
    this.doc = doc ?? { blocks: [{ id: freshId(), runs: [] }] }
  }

  onTransaction(cb: (tr: Transaction, doc: Doc) => void): void {
    this.listeners.push(cb)
  }

  block(id: string): Block | undefined {
    return this.doc.blocks.find((b) => b.id === id)
  }

  blockIndex(id: string): number {
    return this.doc.blocks.findIndex((b) => b.id === id)
  }

  /** Mark of the char left of `offset` (what typed text inherits). */
  markAt(blockId: string, offset: number): Mark {
    const b = this.block(blockId)
    if (!b) return null
    const { marks } = flatten(b)
    if (offset <= 0 || marks.length === 0) return marks[0] ?? null
    return marks[Math.min(offset, marks.length) - 1] ?? null
  }

  /** The single door. Validates, mutates a draft, normalizes, notifies. */
  apply(origin: string, steps: Step[]): ApplyResult {
    // Work on a structural clone so a mid-transaction rejection never
    // partially applies (§2: "it never partially applies").
    const draft: Doc = structuredClone(this.doc)
    for (const step of steps) {
      const err = applyStep(draft, step)
      if (err) return { ok: false, code: err }
    }
    if (draft.blocks.length === 0) return { ok: false, code: 'I1_empty_doc' }
    this.doc = draft
    const tr: Transaction = { origin, steps, time: Date.now() }
    this.transactions.push(tr)
    for (const cb of this.listeners) cb(tr, this.doc)
    return { ok: true }
  }
}

function applyStep(doc: Doc, step: Step): string | null {
  const find = (id: string) => doc.blocks.find((b) => b.id === id)
  switch (step.t) {
    case 'insertText': {
      const b = find(step.at.block)
      if (!b) return 'unknown_block'
      const { chars, marks } = flatten(b)
      if (step.at.offset < 0 || step.at.offset > chars.length) return 'bad_offset'
      const ins = [...step.text]
      chars.splice(step.at.offset, 0, ...ins)
      marks.splice(step.at.offset, 0, ...ins.map(() => step.mark))
      b.runs = rebuild(chars, marks)
      return null
    }
    case 'deleteRange': {
      if (step.from.block !== step.to.block) return 'cross_block_delete'
      const b = find(step.from.block)
      if (!b) return 'unknown_block'
      const { chars, marks } = flatten(b)
      const from = step.from.offset
      const to = step.to.offset
      if (from < 0 || to > chars.length || from > to) return 'bad_offset'
      chars.splice(from, to - from)
      marks.splice(from, to - from)
      b.runs = rebuild(chars, marks)
      return null
    }
    case 'setMark': {
      if (step.from.block !== step.to.block) return 'cross_block_mark'
      const b = find(step.from.block)
      if (!b) return 'unknown_block'
      const { chars, marks } = flatten(b)
      if (step.from.offset < 0 || step.to.offset > chars.length) return 'bad_offset'
      for (let i = step.from.offset; i < step.to.offset; i++) marks[i] = step.mark
      b.runs = rebuild(chars, marks)
      return null
    }
    case 'splitBlock': {
      const idx = doc.blocks.findIndex((b) => b.id === step.at.block)
      if (idx < 0) return 'unknown_block'
      const b = doc.blocks[idx]
      const { chars, marks } = flatten(b)
      if (step.at.offset < 0 || step.at.offset > chars.length) return 'bad_offset'
      const tailChars = chars.slice(step.at.offset)
      const tailMarks = marks.slice(step.at.offset)
      b.runs = rebuild(chars.slice(0, step.at.offset), marks.slice(0, step.at.offset))
      doc.blocks.splice(idx + 1, 0, { id: step.newId, runs: rebuild(tailChars, tailMarks) })
      return null
    }
    case 'mergeBlock': {
      const i1 = doc.blocks.findIndex((b) => b.id === step.first)
      const i2 = doc.blocks.findIndex((b) => b.id === step.second)
      if (i1 < 0 || i2 < 0 || i2 !== i1 + 1) return 'bad_merge'
      const a = doc.blocks[i1]
      const b = doc.blocks[i2]
      const fa = flatten(a)
      const fb = flatten(b)
      a.runs = rebuild([...fa.chars, ...fb.chars], [...fa.marks, ...fb.marks])
      doc.blocks.splice(i2, 1)
      return null
    }
  }
}

/**
 * Single-block char diff (common prefix/suffix) → steps, per §4.2/§4.3:
 * the universal read-back recovery. Inserted text inherits the mark at the
 * left edge of the change — a spike-documented approximation (see FINDINGS).
 */
export function diffToSteps(core: EditorCore, blockId: string, domText: string): Step[] {
  const b = core.block(blockId)
  if (!b) return []
  const modelText = blockText(b)
  if (modelText === domText) return []
  let prefix = 0
  const maxPrefix = Math.min(modelText.length, domText.length)
  while (prefix < maxPrefix && modelText[prefix] === domText[prefix]) prefix++
  let suffix = 0
  while (
    suffix < Math.min(modelText.length, domText.length) - prefix &&
    modelText[modelText.length - 1 - suffix] === domText[domText.length - 1 - suffix]
  )
    suffix++
  const delTo = modelText.length - suffix
  const inserted = domText.slice(prefix, domText.length - suffix)
  const steps: Step[] = []
  if (delTo > prefix)
    steps.push({
      t: 'deleteRange',
      from: { block: blockId, offset: prefix },
      to: { block: blockId, offset: delTo },
    })
  if (inserted.length > 0)
    steps.push({
      t: 'insertText',
      at: { block: blockId, offset: prefix },
      text: inserted,
      mark: core.markAt(blockId, prefix),
    })
  return steps
}
