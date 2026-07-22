/**
 * Paste pipeline (spec §6.1) — the ONLY place in the package that touches
 * HTML, and it never re-serializes to HTML:
 *
 *   1. `DOMParser.parseFromString(html, 'text/html')` — an INERT document:
 *      scripts don't run, resources don't load, nothing attaches to the live
 *      DOM.
 *   2. Allowlist walk building doc nodes directly. Elements outside the
 *      allowlist contribute only their text content; every attribute is
 *      dropped except `a[href]`, which must pass `safeHref` (T1/T2/T5).
 *   3. The resulting fragment is inserted via ordinary steps with
 *      `origin: 'user.paste'` — validated by the same invariants, undoable
 *      as one unit, visible to observers like any other edit.
 *
 * CI grep gate (A8): zero HTML-sink APIs anywhere in the package — this
 * module only READS an inert parse and never writes HTML back.
 */

import { normalizeRuns } from './doc.ts'
import type { FeaturesConfig } from './features.ts'
import { resolveFeatures } from './features.ts'
import { freshId } from './id.ts'
import { safeHref } from './safe-href.ts'
import type { BlockNode, ListItemNode, Mark, TextNode } from './types.ts'

/** Strip newlines/tabs (dialect: single-line containers), collapse spaces. */
function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ')
}

interface InlineCtx {
  mark: Mark | null
  runs: TextNode[]
}

const MARK_TAGS: Record<string, Mark['type']> = {
  B: 'strong',
  STRONG: 'strong',
  I: 'em',
  EM: 'em',
  CODE: 'code',
}

function walkInline(node: Node, ctx: InlineCtx, features: FeaturesConfig): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = cleanText(node.nodeValue ?? '')
    if (text) ctx.runs.push({ text, mark: ctx.mark })
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as Element
  const tag = el.tagName
  if (tag === 'BR') {
    ctx.runs.push({ text: ' ', mark: null }) // dialect has no hard breaks
    return
  }
  let mark = ctx.mark
  const markType = MARK_TAGS[tag]
  if (markType) {
    // one mark per run (I4): innermost wins by replacement
    mark = { type: markType } as Mark
  } else if (tag === 'A' && features.link !== false) {
    const rawHref = el.getAttribute('href') ?? ''
    const href = safeHref(rawHref)
    if (href && !/[\s)]/.test(href)) mark = { type: 'link', attrs: { href } }
    // bad href: keep the label as plain text (mark stays as-is)
  }
  const inner: InlineCtx = { mark, runs: ctx.runs }
  for (const child of Array.from(el.childNodes)) walkInline(child, inner, features)
}

function inlineOf(el: Element, features: FeaturesConfig): TextNode[] {
  const ctx: InlineCtx = { mark: null, runs: [] }
  for (const child of Array.from(el.childNodes)) walkInline(child, ctx, features)
  return normalizeRuns(trimRuns(ctx.runs))
}

function trimRuns(runs: TextNode[]): TextNode[] {
  const out = runs.map((r) => ({ ...r }))
  if (out.length > 0) {
    const first = out[0] as TextNode
    first.text = first.text.replace(/^\s+/, '')
    const last = out[out.length - 1] as TextNode
    last.text = last.text.replace(/\s+$/, '')
  }
  return out
}

const HEADING = /^H([1-6])$/

function pushParagraphish(blocks: BlockNode[], runs: TextNode[]): void {
  if (runs.length === 0) return
  blocks.push({ id: freshId(), type: 'paragraph', content: runs })
}

function walkBlock(node: Node, blocks: BlockNode[], features: FeaturesConfig): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = cleanText(node.nodeValue ?? '').trim()
    if (text) pushParagraphish(blocks, [{ text, mark: null }])
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as Element
  const tag = el.tagName
  const h = HEADING.exec(tag)
  if (h && features.headings !== false) {
    const runs = inlineOf(el, features)
    if (runs.length > 0) {
      blocks.push({
        id: freshId(),
        type: 'heading',
        attrs: { level: Math.min(Number(h[1]), 3) as 1 | 2 | 3 },
        content: runs,
      })
    }
    return
  }
  if ((tag === 'UL' || tag === 'OL') && features.lists !== false) {
    const items: ListItemNode[] = []
    for (const li of Array.from(el.children)) {
      if (li.tagName !== 'LI') continue
      const runs = inlineOf(li, features)
      items.push({ id: freshId(), type: 'listItem', content: runs })
    }
    if (items.length > 0) {
      blocks.push({
        id: freshId(),
        type: 'list',
        attrs: { ordered: tag === 'OL' },
        children: items,
      })
    }
    return
  }
  if (tag === 'BLOCKQUOTE' && features.blockquote !== false) {
    const runs = inlineOf(el, features)
    if (runs.length > 0) blocks.push({ id: freshId(), type: 'blockquote', content: runs })
    return
  }
  if (tag === 'HR') {
    blocks.push({ id: freshId(), type: 'hr' })
    return
  }
  if (tag === 'PRE') {
    // codeBlock is v2: each source line degrades to a code-marked paragraph.
    const lines = (el.textContent ?? '').split('\n')
    for (const line of lines) {
      if (line.trim()) {
        blocks.push({
          id: freshId(),
          type: 'paragraph',
          content: [{ text: line, mark: { type: 'code' } }],
        })
      }
    }
    return
  }
  if (
    tag === 'P' ||
    tag === 'DIV' ||
    tag === 'SECTION' ||
    tag === 'ARTICLE' ||
    tag === 'MAIN' ||
    tag === 'BODY'
  ) {
    // Paragraph boundary when the element directly contains inline content;
    // otherwise recurse into its block children.
    const hasBlockChild = Array.from(el.children).some((c) =>
      [
        'P',
        'DIV',
        'UL',
        'OL',
        'BLOCKQUOTE',
        'PRE',
        'HR',
        'TABLE',
        'SECTION',
        'ARTICLE',
        'MAIN',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
      ].includes(c.tagName),
    )
    if (hasBlockChild) {
      for (const child of Array.from(el.childNodes)) walkBlock(child, blocks, features)
    } else {
      pushParagraphish(blocks, inlineOf(el, features))
    }
    return
  }
  if (tag === 'TABLE') {
    // table is v2: one paragraph per row, cells joined with spaces.
    for (const row of Array.from(el.querySelectorAll('tr'))) {
      const cellRuns: TextNode[] = []
      for (const cell of Array.from(row.children)) {
        if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue
        if (cellRuns.length > 0) cellRuns.push({ text: ' ', mark: null })
        cellRuns.push(...inlineOf(cell, features))
      }
      pushParagraphish(blocks, normalizeRuns(cellRuns))
    }
    return
  }
  if (
    tag === 'SCRIPT' ||
    tag === 'STYLE' ||
    tag === 'TEMPLATE' ||
    tag === 'IFRAME' ||
    tag === 'OBJECT'
  ) {
    return // never even the text content of active-content elements
  }
  // Everything else (span, font, o:p, …): treat as inline content in place.
  const runs = inlineOf(el, features)
  if (runs.length > 0) pushParagraphish(blocks, runs)
}

/**
 * HTML string → BlockNode[] via the inert-DOMParser allowlist walk.
 * The returned nodes are ready for `insertBlock` steps.
 */
export function sanitizeHtmlToBlocks(html: string, features?: FeaturesConfig): BlockNode[] {
  const f = resolveFeatures(features)
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const blocks: BlockNode[] = []
  walkBlock(parsed.body, blocks, f)
  return blocks
}

/** Plain-text paste: blank lines split paragraphs; single newlines too (no hard breaks). */
export function plainTextToBlocks(text: string): BlockNode[] {
  const blocks: BlockNode[] = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const t = line.trim()
    if (t) blocks.push({ id: freshId(), type: 'paragraph', content: [{ text: t, mark: null }] })
  }
  return blocks
}
