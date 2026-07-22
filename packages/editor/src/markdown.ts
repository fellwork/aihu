/**
 * Serialization — doc ⇄ markdown in the `web-v1` dialect (spec §8).
 *
 * The normative grammar is fellwork/web's `journal/markdown.ts` **plus the
 * landed escape semantics of fellwork/web#46** (spec §8.2 RESOLVED block):
 *
 *   - Escapable set is all ASCII punctuation (GFM); `\` before
 *     letters/digits/space/EOL and a trailing lone `\` stay literal.
 *   - Block-level escapes are honored (`\#`, `\-`, `\>`, `\---`, `1\.`).
 *   - Code spans are VERBATIM inside — the serializer never emits `\`` within
 *     backtick spans; a run containing backticks uses a longer delimiter run
 *     (padded with spaces when the content starts/ends with a backtick).
 *   - No hard line breaks in the dialect.
 *
 * Normal form (round-trip contract §8.1): container text is single-line and
 * trimmed (the model never stores newlines; the parser trims and folds), and
 * empty containers other than the lone empty doc do not survive a round-trip.
 */

import { containerText, emptyDoc, normalizeRuns } from './doc.ts'
import { freshId } from './id.ts'
import { safeHref } from './safe-href.ts'
import type { BlockNode, DocNode, ListItemNode, Mark, TextNode } from './types.ts'

// ---------------------------------------------------------------------------
// toMarkdown
// ---------------------------------------------------------------------------

/** Inline-level escapes: everything web's inline grammar could re-parse. */
function escapeText(s: string): string {
  return s.replace(/[\\`*_[\]|]/g, (ch) => `\\${ch}`)
}

/** Paragraph lines additionally must not re-parse as block structure (T7). */
function escapeLineStart(line: string): string {
  if (/^#{1,6}\s/.test(line)) return `\\${line}`
  if (/^[-*+]\s/.test(line)) return `\\${line}`
  if (/^>/.test(line)) return `\\${line}`
  if (/^(-{3,})$/.test(line)) return `\\${line}`
  const num = /^(\d+)([.)])(\s.*)?$/.exec(line)
  if (num && num[3] !== undefined) return `${num[1]}\\${num[2]}${num[3] ?? ''}`
  return line
}

/** Emit a code span with a delimiter longer than any backtick run inside. */
function codeSpan(text: string): string {
  let longest = 0
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length)
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

function inlineToMarkdown(runs: TextNode[]): string {
  let out = ''
  for (const run of normalizeRuns(runs)) {
    const mark = run.mark
    if (!mark) out += escapeText(run.text)
    else if (mark.type === 'code') out += codeSpan(run.text)
    else if (mark.type === 'strong') out += `**${escapeText(run.text)}**`
    else if (mark.type === 'em') out += `*${escapeText(run.text)}*`
    else out += `[${escapeText(run.text)}](${mark.attrs.href})`
  }
  return out
}

export function toMarkdown(doc: DocNode): string {
  const out: string[] = []
  for (const b of doc.children) {
    switch (b.type) {
      case 'paragraph': {
        const line = inlineToMarkdown(b.content)
        if (line) out.push(escapeLineStart(line))
        break
      }
      case 'heading':
        out.push(`${'#'.repeat(b.attrs.level)} ${inlineToMarkdown(b.content)}`)
        break
      case 'blockquote':
        out.push(`> ${inlineToMarkdown(b.content)}`)
        break
      case 'list': {
        const lines = b.children.map((item, i) =>
          b.attrs.ordered
            ? `${i + 1}. ${inlineToMarkdown(item.content)}`
            : `- ${inlineToMarkdown(item.content)}`,
        )
        out.push(lines.join('\n'))
        break
      }
      case 'hr':
        out.push('---')
        break
    }
  }
  return out.join('\n\n')
}

// ---------------------------------------------------------------------------
// fromMarkdown — a port of web's parser semantics producing DocNode directly
// (line-based, same clamps), with the #46 escape semantics.
// ---------------------------------------------------------------------------

const ASCII_PUNCT = /[!-/:-@[-`{-~]/

/** GFM escape removal for non-code inline text. */
function unescapeText(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length && ASCII_PUNCT.test(s[i + 1] as string)) {
      out += s[i + 1]
      i++
    } else out += s[i]
  }
  return out
}

/** Index of the next UNESCAPED occurrence of `needle` at or after `from`. */
function findUnescaped(s: string, needle: string, from: number): number {
  for (let i = from; i + needle.length <= s.length; i++) {
    if (s[i] === '\\' && ASCII_PUNCT.test(s[i + 1] ?? '')) {
      i++ // skip the escaped char
      continue
    }
    if (s.startsWith(needle, i)) {
      // a backtick delimiter must not sit inside a longer backtick run
      if (needle[0] === '`' && (s[i + needle.length] === '`' || s[i - 1] === '`')) continue
      return i
    }
  }
  return -1
}

export function parseInlineToRuns(src: string): TextNode[] {
  const runs: TextNode[] = []
  const push = (text: string, mark: Mark | null) => {
    if (text) runs.push({ text, mark })
  }
  let i = 0
  let plain = ''
  const flush = () => {
    push(unescapeText(plain), null)
    plain = ''
  }
  while (i < src.length) {
    const ch = src[i] as string
    if (ch === '\\' && i + 1 < src.length && ASCII_PUNCT.test(src[i + 1] as string)) {
      plain += src.slice(i, i + 2)
      i += 2
      continue
    }
    if (ch === '`') {
      let n = 1
      while (src[i + n] === '`') n++
      const open = '`'.repeat(n)
      const close = findUnescaped(src, open, i + n)
      if (close >= 0) {
        flush()
        let body = src.slice(i + n, close)
        // GFM: strip one space of padding when both sides are padded
        if (body.length > 1 && body.startsWith(' ') && body.endsWith(' ')) body = body.slice(1, -1)
        push(body, { type: 'code' }) // verbatim — no unescaping inside
        i = close + n
        continue
      }
    }
    if (src.startsWith('**', i) || src.startsWith('__', i)) {
      const d = src.slice(i, i + 2)
      const close = findUnescaped(src, d, i + 2)
      if (close > i + 2) {
        flush()
        push(unescapeText(src.slice(i + 2, close)), { type: 'strong' })
        i = close + 2
        continue
      }
    }
    if (ch === '*' || ch === '_') {
      const close = findUnescaped(src, ch, i + 1)
      if (close > i + 1) {
        flush()
        push(unescapeText(src.slice(i + 1, close)), { type: 'em' })
        i = close + 1
        continue
      }
    }
    if (ch === '[') {
      const labelEnd = findUnescaped(src, ']', i + 1)
      if (labelEnd >= 0 && src[labelEnd + 1] === '(') {
        const hrefEnd = src.indexOf(')', labelEnd + 2)
        const rawHref = hrefEnd >= 0 ? src.slice(labelEnd + 2, hrefEnd) : ''
        if (hrefEnd >= 0 && rawHref !== '' && !/\s/.test(rawHref)) {
          flush()
          const label = unescapeText(src.slice(i + 1, labelEnd)) || rawHref
          const href = safeHref(rawHref)
          // bad href: drop the link, keep the label (same as web)
          if (href) push(label, { type: 'link', attrs: { href } })
          else push(label, null)
          i = hrefEnd + 1
          continue
        }
      }
    }
    plain += ch
    i++
  }
  flush()
  return normalizeRuns(runs)
}

const isTableLine = (line: string) => line.includes('|')

function alignRow(line: string): boolean {
  if (!line.includes('-')) return false
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  const cells = s.split('|').map((c) => c.trim())
  if (cells.length === 0) return false
  return cells.every((c) => /^:?-{1,}:?$/.test(c))
}

/** Block starters that terminate a paragraph (mirrors web's break set). */
function breaksParagraph(t: string, next: string): boolean {
  return (
    !t ||
    t.startsWith('```') ||
    t.startsWith('>') ||
    /^#{1,6}\s/.test(t) ||
    /^[-*]\s/.test(t) ||
    /^\d+[.)]\s/.test(t) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(t) ||
    (isTableLine(t) && alignRow(next))
  )
}

/**
 * Markdown → DocNode. MVP model degradations (documented, v2 lifts them):
 * fenced code blocks and pipe tables are outside the v1 editing model — a
 * fence imports as one paragraph per source line (verbatim text), a table as
 * one paragraph per row line. Everything else follows web's parser: heading
 * clamp 4–6→3, `>` folding, `-`/`*` and `1.`/`1)` lists, `---` rules,
 * paragraph soft-wrap folding with single spaces.
 */
export function fromMarkdown(src: string): DocNode {
  const lines = (src || '').replace(/\r\n?/g, '\n').split('\n')
  const children: BlockNode[] = []
  let i = 0
  const at = (n: number): string => lines[n] ?? ''

  while (i < lines.length) {
    const trimmed = at(i).trim()
    if (!trimmed) {
      i++
      continue
    }

    // Fenced code — v1 degradation: verbatim paragraphs, one per line.
    if (trimmed.startsWith('```')) {
      i++
      while (i < lines.length && !at(i).trim().startsWith('```')) {
        const text = at(i)
        children.push({
          id: freshId(),
          type: 'paragraph',
          content: text ? [{ text, mark: null }] : [],
        })
        i++
      }
      i++
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      children.push({ id: freshId(), type: 'hr' })
      i++
      continue
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (h) {
      children.push({
        id: freshId(),
        type: 'heading',
        attrs: { level: Math.min((h[1] ?? '#').length, 3) as 1 | 2 | 3 },
        content: parseInlineToRuns((h[2] ?? '').trim()),
      })
      i++
      continue
    }

    // Table — v1 degradation: one verbatim paragraph per row line.
    if (isTableLine(trimmed) && alignRow(at(i + 1))) {
      while (i < lines.length && isTableLine(at(i)) && at(i).trim()) {
        const text = at(i).trim()
        if (!alignRow(text)) {
          children.push({ id: freshId(), type: 'paragraph', content: [{ text, mark: null }] })
        }
        i++
      }
      continue
    }

    if (trimmed.startsWith('>')) {
      const body: string[] = []
      while (i < lines.length && at(i).trim().startsWith('>')) {
        body.push(at(i).trim().replace(/^>\s?/, ''))
        i++
      }
      children.push({
        id: freshId(),
        type: 'blockquote',
        content: parseInlineToRuns(body.join(' ')),
      })
      continue
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (bullet || numbered) {
      const ordered = !!numbered
      const items: ListItemNode[] = []
      while (i < lines.length) {
        const t = at(i).trim()
        const m = ordered ? /^\d+[.)]\s+(.*)$/.exec(t) : /^[-*]\s+(.*)$/.exec(t)
        if (!m) break
        items.push({ id: freshId(), type: 'listItem', content: parseInlineToRuns(m[1] ?? '') })
        i++
      }
      children.push({ id: freshId(), type: 'list', attrs: { ordered }, children: items })
      continue
    }

    const para: string[] = []
    while (i < lines.length) {
      const t = at(i).trim()
      if (breaksParagraph(t, at(i + 1))) break
      para.push(t)
      i++
    }
    if (para.length > 0) {
      children.push({
        id: freshId(),
        type: 'paragraph',
        content: parseInlineToRuns(para.join(' ')),
      })
    }
  }

  if (children.length === 0) return emptyDoc()
  return { schema: 'aihu-editor/doc', version: 1, children }
}

// ---------------------------------------------------------------------------
// canonical JSON
// ---------------------------------------------------------------------------

/**
 * Canonical JSON (spec §8.1): the DocNode itself with stable key order and
 * no undefineds — what persistence and agents see.
 */
export function toJSON(doc: DocNode): DocNode {
  const block = (b: BlockNode): BlockNode => {
    switch (b.type) {
      case 'paragraph':
      case 'blockquote':
        return { id: b.id, type: b.type, content: b.content.map(run) }
      case 'heading':
        return {
          id: b.id,
          type: b.type,
          attrs: { level: b.attrs.level },
          content: b.content.map(run),
        }
      case 'list':
        return {
          id: b.id,
          type: b.type,
          attrs: { ordered: b.attrs.ordered },
          children: b.children.map((item) => ({
            id: item.id,
            type: 'listItem' as const,
            content: item.content.map(run),
          })),
        }
      case 'hr':
        return { id: b.id, type: b.type }
    }
  }
  const run = (r: TextNode): TextNode => ({
    text: r.text,
    mark: r.mark
      ? r.mark.type === 'link'
        ? { type: 'link', attrs: { href: r.mark.attrs.href } }
        : { type: r.mark.type }
      : null,
  })
  return { schema: 'aihu-editor/doc', version: 1, children: doc.children.map(block) }
}

/** Structural doc equality modulo ids (round-trip acceptance A4). */
export function docEqualsIgnoringIds(a: DocNode, b: DocNode): boolean {
  const strip = (d: DocNode): unknown =>
    JSON.parse(JSON.stringify(toJSON(d), (key, value) => (key === 'id' ? undefined : value)))
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
}

/** True when `text` can be used inside `containerText` without newlines. */
export function textContainsNewline(doc: DocNode): boolean {
  for (const b of doc.children) {
    if (b.type === 'list') {
      for (const item of b.children) if (containerText(item).includes('\n')) return true
    } else if (b.type !== 'hr' && containerText(b).includes('\n')) return true
  }
  return false
}
