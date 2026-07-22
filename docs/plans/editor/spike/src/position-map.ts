// Phase-0 spike: DOM Selection ↔ (blockId, charOffset) per architecture.md §4.1.
// Both directions in one module, as the spec requires.

import type { Point } from './model.ts'

function textNodesOf(blockEl: Element): Text[] {
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT)
  const out: Text[] = []
  let n = walker.nextNode()
  while (n) {
    out.push(n as Text)
    n = walker.nextNode()
  }
  return out
}

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
    // Selection on the root itself (offset = child block index): snap to that
    // block's start. Happens after block-level DOM churn in some engines.
    if (node === root && root.children[offset]) {
      const el = root.children[offset]
      const id = el.getAttribute('data-block-id')
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
    return { block: id, offset: acc } // text node not found (mid-mutation): clamp to end
  }
  // Element position: sum text preceding the child at `offset`.
  const el = node as Element
  const boundary = el.childNodes[offset] ?? null
  for (const t of texts) {
    if (boundary && boundary.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) break
    if (t === boundary) break
    acc += t.nodeValue?.length ?? 0
  }
  return { block: id, offset: acc }
}

/** Model Point → DOM (node, offset). Falls back to the block element for empty blocks. */
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
  const last = texts[texts.length - 1]
  return { node: last, offset: last.nodeValue?.length ?? 0 }
}

export function readDomSelection(root: Element): { anchor: Point; head: Point } | null {
  const sel = document.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  if (!sel.anchorNode || !sel.focusNode) return null
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null
  const anchor = toModel(root, sel.anchorNode, sel.anchorOffset)
  const head = toModel(root, sel.focusNode, sel.focusOffset)
  if (!anchor || !head) return null
  return { anchor, head }
}

export function writeDomSelection(root: Element, anchor: Point, head: Point): boolean {
  const a = toDom(root, anchor)
  const h = toDom(root, head)
  if (!a || !h) return false
  const sel = document.getSelection()
  if (!sel) return false
  sel.setBaseAndExtent(a.node, a.offset, h.node, h.offset)
  return true
}
