/**
 * Read-back reconciliation — the universal "browser did something we didn't
 * mediate" recovery path (spec §4.3, amended per Phase-0 A2):
 *
 * STRUCTURE-AWARE first: rebuild the container's runs by walking its DOM.
 * The DOM is our own rendered shape (text nodes wrapped in known mark
 * elements), so element→mark mapping is trivial and marks survive a
 * spellcheck rewrite (spike d3 flipped from pinned-loss to acceptance).
 * Foreign elements contribute their text content (they are evicted on the
 * re-render that follows). The flat char diff is kept for the composition
 * path where a minimal insertText benefits typing coalescing.
 */

import { containerText, findContainer, marksEqual, normalizeRuns } from './doc.ts'
import { safeHref } from './safe-href.ts'
import type { DocNode, Mark, Step, TextNode } from './types.ts'

const MARK_TAGS: Record<string, Mark['type']> = {
  STRONG: 'strong',
  B: 'strong',
  EM: 'em',
  I: 'em',
  CODE: 'code',
}

function walkRuns(node: Node, mark: Mark | null, out: TextNode[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.nodeValue ?? '').replace(/[\n\r]/g, '')
    if (text) out.push({ text, mark })
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as Element
  if (el.tagName === 'BR') return
  let next = mark
  const markType = MARK_TAGS[el.tagName]
  if (markType) next = { type: markType } as Mark
  else if (el.tagName === 'A') {
    const href = safeHref(el.getAttribute('href') ?? '')
    next = href && !/[\s)]/.test(href) ? { type: 'link', attrs: { href } } : mark
  }
  // any other element (spellcheck spans, extension widgets): keep the
  // surrounding mark and fold in the text content
  for (const child of Array.from(el.childNodes)) walkRuns(child, next, out)
}

/** Container element → normalized runs (structure-aware read, A2). */
export function runsFromDom(containerEl: Element): TextNode[] {
  const out: TextNode[] = []
  for (const child of Array.from(containerEl.childNodes)) walkRuns(child, null, out)
  return normalizeRuns(out)
}

function runsEqual(a: TextNode[], b: TextNode[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as TextNode
    const y = b[i] as TextNode
    if (x.text !== y.text || !marksEqual(x.mark, y.mark)) return false
  }
  return true
}

/**
 * Structure-aware reconciliation step for one container: null when the DOM
 * already equals the model.
 */
export function reconcileSteps(doc: DocNode, blockId: string, containerEl: Element): Step[] {
  const loc = findContainer(doc, blockId)
  if (!loc) return []
  const domRuns = runsFromDom(containerEl)
  const modelRuns = normalizeRuns(loc.node.content)
  if (runsEqual(domRuns, modelRuns)) return []
  return [{ t: 'setRuns', id: blockId, runs: domRuns }]
}

/**
 * Flat single-container char diff (common prefix/suffix) → minimal steps.
 * Used by the composition commit path where a plain insertText coalesces
 * into the typing history entry; marks are preserved by diffing at the run
 * level only when the change is inside a single run — otherwise callers use
 * `reconcileSteps` (structure-aware) instead.
 */
export function diffToSteps(doc: DocNode, blockId: string, domText: string): Step[] {
  const loc = findContainer(doc, blockId)
  if (!loc) return []
  const modelText = containerText(loc.node)
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
  if (delTo > prefix) {
    steps.push({
      t: 'deleteRange',
      from: { block: blockId, offset: prefix },
      to: { block: blockId, offset: delTo },
    })
  }
  if (inserted.length > 0) {
    const { mark } = markForInsert(loc.node.content, prefix)
    steps.push({ t: 'insertText', at: { block: blockId, offset: prefix }, text: inserted, mark })
  }
  return steps
}

function markForInsert(runs: TextNode[], offset: number): { mark: Mark | null } {
  let acc = 0
  for (const run of runs) {
    const end = acc + run.text.length
    if (offset > acc && offset <= end) return { mark: run.mark }
    acc = end
  }
  return { mark: null }
}
