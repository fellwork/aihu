/**
 * DOM Selection ⇄ (blockId, UTF-16 offset) — both directions in ONE module
 * (spec §4.1). Offsets are UTF-16 code units (amended per Phase-0, A3): DOM
 * `nodeValue.length` and Selection offsets already are, so accumulation here
 * is definitionally unit-correct.
 *
 * Lifted from the Phase-0 spike (sanctioned prior art) and productionized.
 */

import type { Point, SelectionState } from './types.ts'

function textNodesOf(blockEl: Element): Text[] {
  const walker = blockEl.ownerDocument.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT)
  const out: Text[] = []
  let n = walker.nextNode()
  while (n) {
    out.push(n as Text)
    n = walker.nextNode()
  }
  return out
}

/** Nearest ancestor (or self) carrying data-block-id, bounded by root. */
export function blockElOf(root: Element, node: Node): Element | null {
  let cur: Node | null = node
  while (cur && cur !== root) {
    if (cur instanceof Element && cur.hasAttribute('data-block-id')) return cur
    cur = cur.parentNode
  }
  return null
}

/** DOM (node, offset) → model Point. Null when outside a block. */
export function toModel(root: Element, node: Node, offset: number): Point | null {
  const blockEl = blockElOf(root, node)
  if (!blockEl) {
    // Selection on the root itself (offset = child index): snap to that
    // block's start — happens after block-level DOM churn in some engines.
    if (node === root && root.children[offset]) {
      const el = root.children[offset] as Element
      const target = el.hasAttribute('data-block-id') ? el : el.querySelector('[data-block-id]')
      const id = target?.getAttribute('data-block-id')
      if (id) return { block: id, offset: 0 }
    }
    return null
  }
  const id = blockEl.getAttribute('data-block-id')
  if (!id) return null
  const texts = textNodesOf(blockEl)
  let acc = 0
  if (node.nodeType === Node.TEXT_NODE) {
    for (const t of texts) {
      if (t === node) return { block: id, offset: acc + offset }
      acc += t.nodeValue?.length ?? 0
    }
    return { block: id, offset: acc } // mid-mutation: clamp to end
  }
  // Element position: sum text preceding the child boundary at `offset`.
  const el = node as Element
  const boundary = el.childNodes[offset] ?? null
  for (const t of texts) {
    if (boundary && boundary.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) break
    if (t === boundary) break
    acc += t.nodeValue?.length ?? 0
  }
  return { block: id, offset: acc }
}

/** Model Point → DOM (node, offset). Block element itself for empty blocks. */
export function toDom(root: Element, point: Point): { node: Node; offset: number } | null {
  const blockEl = root.querySelector(`[data-block-id="${point.block}"]`)
  if (!blockEl) return null
  const texts = textNodesOf(blockEl)
  if (texts.length === 0) return { node: blockEl, offset: 0 }
  let acc = 0
  for (const t of texts) {
    const len = t.nodeValue?.length ?? 0
    if (point.offset <= acc + len) return { node: t, offset: point.offset - acc }
    acc += len
  }
  const last = texts[texts.length - 1] as Text
  return { node: last, offset: last.nodeValue?.length ?? 0 }
}

export function readDomSelection(root: Element): SelectionState | null {
  const sel = root.ownerDocument.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return null
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null
  const anchor = toModel(root, sel.anchorNode, sel.anchorOffset)
  const head = toModel(root, sel.focusNode, sel.focusOffset)
  if (!anchor || !head) return null
  if (anchor.block === head.block && anchor.offset === head.offset)
    return { type: 'caret', at: anchor }
  return { type: 'range', anchor, head }
}

export function writeDomSelection(root: Element, state: SelectionState): boolean {
  if (state.type === 'node') {
    const el = root.querySelector(`[data-block-id="${state.block}"]`)
    if (!el?.parentNode) return false
    const sel = root.ownerDocument.getSelection()
    if (!sel) return false
    const idx = Array.prototype.indexOf.call(el.parentNode.childNodes, el)
    sel.setBaseAndExtent(el.parentNode, idx, el.parentNode, idx + 1)
    return true
  }
  const anchor = state.type === 'caret' ? state.at : state.anchor
  const head = state.type === 'caret' ? state.at : state.head
  const a = toDom(root, anchor)
  const h = toDom(root, head)
  if (!a || !h) return false
  const sel = root.ownerDocument.getSelection()
  if (!sel) return false
  sel.setBaseAndExtent(a.node, a.offset, h.node, h.offset)
  return true
}
