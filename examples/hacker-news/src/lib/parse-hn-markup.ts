/**
 * Parse Hacker News' user-authored markup into STRUCTURED DATA.
 *
 * This module reads HTML. It never produces HTML. That distinction is the
 * whole security argument, and it is the doctrine `packages/editor/src/
 * paste-sanitize.ts` already established for this repo:
 *
 *   > the ONLY place in the package that touches HTML, and it never
 *   > re-serializes to HTML
 *
 * WHY NOT SANITISE. The obvious fix for FEL-426 is to scrub the string and
 * keep feeding it to `html={}`. That was rejected, correctly. A sanitiser's
 * output is HTML, so its correctness is load-bearing: one missed pattern is a
 * live tag in the bytes we serve. What comes out of *this* module is a tree of
 * plain strings, rendered through ordinary escaped bindings (`__aihu_stext`).
 *
 * So the safety property does not depend on this parser being right. A bug
 * here produces WRONG DISPLAY — a mangled paragraph, a dropped italic — and
 * cannot produce injection, because no code path anywhere downstream turns
 * these strings back into markup. That is a guarantee an allowlist sanitiser
 * structurally cannot make.
 *
 * Structure is parsed on the RAW fragment, where `<` delimits a tag; entities
 * are decoded only afterwards, inside text runs. So `&lt;script&gt;` becomes
 * the literal five-character text `<script>` and is re-escaped on render — it
 * can never be promoted into an element. Decoding first is the classic mXSS
 * mistake and the ordering here is deliberate.
 *
 * Following the editor precedent, an element outside the allowlist contributes
 * only its text content, and every attribute is dropped except `a[href]`,
 * which must survive `safeHref`.
 */

import { safeHref } from '@aihu/editor/safe-href'

/**
 * `k` is a stable per-render key for `each`. Assigned at parse time from
 * position so it is deterministic and identical across SSR and hydration —
 * a key derived at render time would differ between the two passes.
 */
export type Span = { readonly k: string } & (
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'em'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string }
)

export interface Block {
  readonly k: string
  readonly kind: 'p' | 'pre'
  readonly spans: ReadonlyArray<Span>
}

/** Inline marks HN actually emits. Innermost wins, as in the editor (I4). */
type Mark = 'em' | 'code' | 'link'

const NAMED: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Decode HTML entities inside a TEXT RUN. Applied after structural parsing, so
 * a decoded `<` is text and can never open an element.
 *
 * Applied repeatedly until stable, with a bounded number of passes: HN payloads
 * are single-encoded, but `&amp;lt;` is a real thing and a single pass would
 * leave `&lt;` sitting in what callers treat as plain text. The bound stops a
 * crafted `&amp;amp;amp;…` chain from becoming a CPU sink.
 */
function decodeEntities(input: string): string {
  let out = input
  for (let pass = 0; pass < 4; pass++) {
    const next = out.replace(
      /&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g,
      (m, body: string) => {
        if (body[0] === '#') {
          const cp =
            body[1] === 'x' || body[1] === 'X'
              ? Number.parseInt(body.slice(2), 16)
              : Number.parseInt(body.slice(1), 10)
          if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return m
          try {
            return String.fromCodePoint(cp)
          } catch {
            return m
          }
        }
        return NAMED[body.toLowerCase()] ?? m
      },
    )
    if (next === out) break
    out = next
  }
  return out
}

/** Pull `href` out of a raw attribute string. Nothing else is ever read. */
function readHref(rawAttrs: string): string | null {
  const m = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs)
  if (!m) return null
  const raw = m[2] ?? m[3] ?? m[4] ?? ''
  // Decode before the check — for FIDELITY, not for safety, and the difference
  // matters enough to write down.
  //
  // The tempting rationale is "otherwise `&#106;avascript:` slips past a check
  // looking for a literal `javascript:`". That is denylist reasoning and it is
  // wrong here: `safeHref` is an ALLOWLIST (`http(s):`, `mailto:`, same-origin
  // `/path`), so an encoded scheme fails to match anything and is rejected
  // whether or not it was decoded. Measured, not assumed —
  // `safeHref('&#106;avascript:alert(1)')` is null.
  //
  // What decoding actually buys is the legitimate case: `&#47;item?id=1` is a
  // real same-origin link that would otherwise be silently dropped. Decoding
  // can only ever WIDEN what the allowlist accepts to things the allowlist
  // already permits, which is why it is safe to do first.
  return safeHref(decodeEntities(raw))
}

/**
 * Parse an HN `text`/`about` fragment into blocks of spans.
 *
 * Unparseable or empty input yields an empty array — callers render nothing,
 * which is the safe degradation.
 */
export function parseHnMarkup(input: string | undefined | null): Block[] {
  if (!input) return []

  const blocks: Block[] = []
  let spans: Span[] = []
  let blockKind: 'p' | 'pre' = 'p'
  const marks: Mark[] = []
  let href: string | null = null

  const flushBlock = () => {
    if (spans.length > 0) blocks.push({ k: `b${blocks.length}`, kind: blockKind, spans })
    spans = []
    blockKind = 'p'
  }

  const pushText = (raw: string) => {
    const text = decodeEntities(raw)
    if (!text) return
    const mark = marks[marks.length - 1]
    const k = `${blocks.length}.${spans.length}`
    if (mark === 'link' && href) spans.push({ k, kind: 'link', text, href })
    else if (mark === 'em') spans.push({ k, kind: 'em', text })
    else if (mark === 'code') spans.push({ k, kind: 'code', text })
    else spans.push({ k, kind: 'text', text })
  }

  const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = TAG.exec(input)) !== null) {
    if (m.index > last) pushText(input.slice(last, m.index))
    last = TAG.lastIndex

    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()

    if (tag === 'p') {
      // HN uses <p> as a separator and rarely closes it.
      flushBlock()
    } else if (tag === 'pre') {
      if (closing) flushBlock()
      else {
        flushBlock()
        blockKind = 'pre'
      }
    } else if (tag === 'i' || tag === 'em') {
      if (closing) marks.pop()
      else marks.push('em')
    } else if (tag === 'code') {
      if (closing) marks.pop()
      else marks.push('code')
    } else if (tag === 'a') {
      if (closing) {
        marks.pop()
        href = null
      } else {
        const h = readHref(m[3] ?? '')
        // A rejected href drops the LINK, not the label — the text still
        // renders, exactly as the editor's paste path behaves.
        if (h) {
          href = h
          marks.push('link')
        }
      }
    }
    // Any other tag: dropped entirely. Its text content still flows through
    // pushText on the next iteration, per the editor allowlist precedent.
  }

  if (last < input.length) pushText(input.slice(last))
  flushBlock()

  return blocks
}
