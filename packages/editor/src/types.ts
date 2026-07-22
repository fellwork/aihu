/**
 * @aihu/editor — document model types (architecture.md §1, MVP subset §10).
 *
 * OFFSET UNITS (amended per Phase-0, A3): every `offset` in this package is a
 * **UTF-16 code unit** offset — the unit `nodeValue.length`, DOM `Selection`
 * offsets, and JS `.slice`/`.length` agree on. NOT code points, NOT grapheme
 * clusters: an astral-plane character (😀) occupies TWO units. Every module
 * that walks text (position map, diff, serializers, input rules) indexes in
 * UTF-16 units.
 *
 * MVP node kinds (spec §10): paragraph, heading 1–3, flat bullet/ordered
 * lists, blockquote (inline-only), hr. codeBlock and table are v2 — the v1
 * schema is closed to what the editor can author.
 */

export interface DocNode {
  schema: 'aihu-editor/doc'
  version: 1
  children: BlockNode[]
}

export type Mark =
  | { type: 'strong' }
  | { type: 'em' }
  | { type: 'code' }
  | { type: 'link'; attrs: { href: string } }

/** A flat run of text carrying at most ONE mark (invariant I4 — dialect guard). */
export interface TextNode {
  text: string
  mark: Mark | null
}

export interface ListItemNode {
  id: string
  type: 'listItem'
  content: TextNode[]
}

export type BlockNode =
  | { id: string; type: 'paragraph'; content: TextNode[] }
  | { id: string; type: 'heading'; attrs: { level: 1 | 2 | 3 }; content: TextNode[] }
  | { id: string; type: 'list'; attrs: { ordered: boolean }; children: ListItemNode[] }
  | { id: string; type: 'blockquote'; content: TextNode[] }
  | { id: string; type: 'hr' }

/** Any node that carries inline content and can be addressed by a Point. */
export type InlineContainer = Extract<BlockNode | ListItemNode, { content: TextNode[] }>

/**
 * A position: (inline-container id, UTF-16 code-unit offset into the
 * flattened inline text — mark-transparent). Amended per Phase-0 (A3).
 */
export interface Point {
  block: string
  offset: number
}

export type SelectionState =
  | { type: 'caret'; at: Point }
  | { type: 'range'; anchor: Point; head: Point } // anchor = where drag started
  | { type: 'node'; block: string } // hr, whole-node selection

/**
 * Steps — the serializable, invertible mutation primitives (spec §2).
 *
 * Implementation superset (documented deviation): `insertRuns` and `setRuns`
 * exist because the spec's step set is not closed under inversion —
 * `deleteRange`/`setMark` over mixed-mark text cannot be inverted into a
 * single one-mark `insertText`/`setMark`. Both are serializable, invertible,
 * and validated like every other step. `splitBlock.tail` and
 * `insertBlock.in` carry the extra context exact inversion needs.
 */
export type Step =
  | { t: 'insertText'; at: Point; text: string; mark: Mark | null }
  | { t: 'insertRuns'; at: Point; runs: TextNode[] }
  | { t: 'deleteRange'; from: Point; to: Point } // same container
  | { t: 'setMark'; from: Point; to: Point; mark: Mark | null }
  | { t: 'setRuns'; id: string; runs: TextNode[] } // whole-container run replace (inverse carrier)
  | {
      t: 'splitBlock'
      at: Point
      newId: string
      /** Tail container kind. Default: same type for paragraph/listItem; paragraph for heading/blockquote. */
      tail?: { type: 'paragraph' | 'heading' | 'blockquote' | 'listItem'; attrs?: HeadingAttrs }
    }
  | { t: 'mergeBlock'; first: string; second: string }
  | {
      t: 'insertBlock'
      after: string | null // null = start (of doc, or of `in` list)
      node: BlockNode | ListItemNode
      /** Parent list id when inserting a listItem at list start (`after: null`). */
      in?: string
    }
  | { t: 'removeBlock'; id: string }
  | {
      t: 'setBlockType'
      id: string
      type: 'paragraph' | 'heading' | 'blockquote' | 'list'
      attrs?: HeadingAttrs | ListAttrs
      /** New wrapper-list id for the `→ list` conversion (the container keeps its id as the listItem). */
      newId?: string
    }
  | { t: 'setAttrs'; id: string; attrs: HeadingAttrs | ListAttrs }

export interface HeadingAttrs {
  level: 1 | 2 | 3
}
export interface ListAttrs {
  ordered: boolean
}

/**
 * Transaction origins (spec §2, amended per Phase-0: `dom.readback` is the
 * MutationObserver recovery path's distinct origin — G3 attribution).
 */
export type Origin =
  | 'user.typing'
  | 'user.command'
  | 'user.paste'
  | 'inputrule'
  | 'history'
  | 'dom.readback'
  | 'load'
  | `agent:${string}`

export interface Transaction {
  id: string
  time: number
  origin: Origin
  steps: Step[]
  selectionAfter?: SelectionState
}

export type ApplyResult = { ok: true; tr: Transaction } | { ok: false; code: string; step?: Step }

export type Dispose = () => void
