/**
 * Doc queries, normalization (I3), invariant validation (I1–I7) and the
 * versioned loader (`migrate`). Pure functions over the model — no DOM.
 */

import { freshId } from './id.ts'
import { safeHref } from './safe-href.ts'
import type { BlockNode, DocNode, InlineContainer, ListItemNode, Mark, TextNode } from './types.ts'

export function emptyDoc(): DocNode {
  return {
    schema: 'aihu-editor/doc',
    version: 1,
    children: [{ id: freshId(), type: 'paragraph', content: [] }],
  }
}

export function isInlineContainer(node: BlockNode | ListItemNode): node is InlineContainer {
  return node.type !== 'hr' && node.type !== 'list'
}

export interface Located {
  node: InlineContainer
  /** Top-level index in doc.children (for listItems: the parent list's index). */
  topIndex: number
  /** Parent list, when the container is a listItem. */
  parentList: Extract<BlockNode, { type: 'list' }> | null
  /** Index within parentList.children (listItems) — else -1. */
  itemIndex: number
}

/** Find any node (block, listItem) by id. */
export function findContainer(doc: DocNode, id: string): Located | null {
  for (let i = 0; i < doc.children.length; i++) {
    const b = doc.children[i] as BlockNode
    if (b.id === id) {
      if (!isInlineContainer(b)) return null
      return { node: b, topIndex: i, parentList: null, itemIndex: -1 }
    }
    if (b.type === 'list') {
      for (let j = 0; j < b.children.length; j++) {
        const item = b.children[j] as ListItemNode
        if (item.id === id) return { node: item, topIndex: i, parentList: b, itemIndex: j }
      }
    }
  }
  return null
}

export function findTopBlock(doc: DocNode, id: string): { node: BlockNode; index: number } | null {
  const index = doc.children.findIndex((b) => b.id === id)
  if (index < 0) return null
  return { node: doc.children[index] as BlockNode, index }
}

/** Document-ordered list of inline containers (listItems expanded in place). */
export function inlineContainers(doc: DocNode): InlineContainer[] {
  const out: InlineContainer[] = []
  for (const b of doc.children) {
    if (b.type === 'list') out.push(...b.children)
    else if (isInlineContainer(b)) out.push(b)
  }
  return out
}

export function containerText(node: InlineContainer): string {
  let s = ''
  for (const run of node.content) s += run.text
  return s
}

/** UTF-16 code-unit length of a container's flattened text (A3). */
export function containerLength(node: InlineContainer): number {
  let n = 0
  for (const run of node.content) n += run.text.length
  return n
}

export function marksEqual(a: Mark | null, b: Mark | null): boolean {
  if (a === null || b === null) return a === b
  if (a.type !== b.type) return false
  if (a.type === 'link' && b.type === 'link') return a.attrs.href === b.attrs.href
  return true
}

/** Normalize runs (I3): merge adjacent equal-mark runs, drop empty runs. */
export function normalizeRuns(runs: TextNode[]): TextNode[] {
  const out: TextNode[] = []
  for (const run of runs) {
    if (run.text === '') continue
    const last = out[out.length - 1]
    if (last && marksEqual(last.mark, run.mark)) last.text += run.text
    else out.push({ text: run.text, mark: run.mark })
  }
  return out
}

/** Runs → parallel per-code-unit mark array + text (the edit algebra, UTF-16 indexed). */
export function flatten(node: InlineContainer): { text: string; marks: (Mark | null)[] } {
  let text = ''
  const marks: (Mark | null)[] = []
  for (const run of node.content) {
    text += run.text
    for (let i = 0; i < run.text.length; i++) marks.push(run.mark)
  }
  return { text, marks }
}

/** Rebuild normalized runs from parallel text/marks arrays. */
export function rebuild(text: string, marks: (Mark | null)[]): TextNode[] {
  const runs: TextNode[] = []
  for (let i = 0; i < text.length; i++) {
    const last = runs[runs.length - 1]
    if (last && marksEqual(last.mark, marks[i] ?? null)) last.text += text[i]
    else runs.push({ text: text[i] as string, mark: marks[i] ?? null })
  }
  return runs
}

/** Mark of the code unit left of `offset` — what typed text inherits. */
export function markAt(node: InlineContainer, offset: number): Mark | null {
  const { marks } = flatten(node)
  if (marks.length === 0) return null
  if (offset <= 0) return marks[0] ?? null
  return marks[Math.min(offset, marks.length) - 1] ?? null
}

/**
 * Validate a mark at model-write time (I4): link hrefs must pass safeHref,
 * and must be carriable by the wire format — web's `[label](href)` grammar
 * cannot express whitespace or `)` in an href (callers percent-encode first).
 */
export function validMark(mark: Mark | null): boolean {
  if (mark && mark.type === 'link') {
    const href = mark.attrs.href
    if (/[\s)]/.test(href)) return false
    return safeHref(href) !== null
  }
  return true
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'list', 'blockquote', 'hr'])

/**
 * Invariant check (spec §1.3) — run after every transaction; violation
 * rejects the whole transaction. Returns an error code or null.
 */
export function validateDoc(doc: DocNode): string | null {
  if (doc.schema !== 'aihu-editor/doc' || doc.version !== 1) return 'I7_schema'
  if (!Array.isArray(doc.children) || doc.children.length < 1) return 'I1_empty_doc'
  const ids = new Set<string>()
  const seen = (id: string): boolean => {
    if (ids.has(id)) return true
    ids.add(id)
    return false
  }
  for (const b of doc.children) {
    if (!BLOCK_TYPES.has(b.type)) return 'I7_unknown_block'
    if (typeof b.id !== 'string' || b.id === '' || seen(b.id)) return 'I2_dup_id'
    if (b.type === 'heading' && (b.attrs.level < 1 || b.attrs.level > 3)) return 'I5_heading_level'
    if (b.type === 'list') {
      if (b.children.length < 1) return 'empty_list'
      for (const item of b.children) {
        if (item.type !== 'listItem') return 'I7_unknown_block'
        if (typeof item.id !== 'string' || item.id === '' || seen(item.id)) return 'I2_dup_id'
        if (!validRuns(item.content)) return 'I4_bad_mark'
      }
    } else if (isInlineContainer(b)) {
      if (!validRuns(b.content)) return 'I4_bad_mark'
    }
  }
  return null
}

function validRuns(runs: TextNode[]): boolean {
  for (const run of runs) {
    if (typeof run.text !== 'string') return false
    // The dialect has no hard breaks (§8.2 RESOLVED): container text is
    // single-line; newlines arrive as splitBlock, never as text.
    if (run.text.includes('\n') || run.text.includes('\r')) return false
    if (!validMark(run.mark)) return false
  }
  return true
}

/** Normalize every container's runs in place (I3 pass, part of apply). */
export function normalizeDoc(doc: DocNode): void {
  for (const b of doc.children) {
    if (b.type === 'list') for (const item of b.children) item.content = normalizeRuns(item.content)
    else if (isInlineContainer(b)) b.content = normalizeRuns(b.content)
  }
}

/**
 * Versioned loader (I7): v1 loaders reject unknown major versions,
 * forward-migrate known ones. Today v1 is the only version — migrate is
 * shape-check + pass-through.
 */
export function migrate(doc: unknown): DocNode {
  if (typeof doc !== 'object' || doc === null) throw new Error('editor: not a document')
  const d = doc as DocNode
  if (d.schema !== 'aihu-editor/doc') throw new Error(`editor: unknown schema ${String(d.schema)}`)
  if (d.version !== 1) throw new Error(`editor: unknown major version ${String(d.version)}`)
  const err = validateDoc(d)
  if (err) throw new Error(`editor: invalid document (${err})`)
  return d
}
