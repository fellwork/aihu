/**
 * Shared head-application core (SEO arc).
 *
 * A single `HeadConfig` → keyed-tag decomposition feeds BOTH appliers so the
 * server-side (build-time) and client-side (runtime) paths can never diverge on
 * how a meta/link/script is keyed, merged, or escaped:
 *
 *   - `applyHeadToHtml`  — B4 (SSG prerender, `prerender.ts`): regex-rewrites a
 *     built `index.html` string. Build-time only, never shipped to the browser.
 *   - `applyHeadToDocument` — B5 (client-nav, `client.ts`): mutates the LIVE
 *     `document.head` on SPA navigation and tracks the per-page tags it owns so
 *     they can be cleaned up on the next navigation.
 *
 * This module is PURE (no `node:` builtin, no module-level DOM access) so it is
 * safe in the browser-edge `dist/client.js` bundle that `check:runtime-purity`
 * guards. The DOM applier receives its `Document` as an argument (defaulting to
 * the ambient `document` only when called) — there is no top-level `document`
 * reference, so importing this module never assumes a DOM.
 */

import type { HeadConfig } from '@aihu/server/head-lowering'

/**
 * Attribute stamped on every tag the head appliers own. Tags carrying it are
 * "managed" per-page head — removed and re-applied on each navigation. Tags
 * WITHOUT it (e.g. the source `index.html`'s baseline `<meta charset>` /
 * `<title>` and any unmanaged scaffold tags) are left untouched, so a route
 * that drops a field falls back to whatever the document already shipped.
 */
export const MANAGED_HEAD_ATTR = 'data-aihu-head'

// ---------------------------------------------------------------------------
// Keying — the single source of truth shared by both appliers.
// ---------------------------------------------------------------------------

/**
 * Stable identity for a meta tag, used to upsert (replace-in-place) rather than
 * accumulate duplicates: name wins, then property, else `null` (always inject).
 */
export function metaKey(
  attrs: Record<string, string | undefined>,
): { attr: 'name' | 'property'; value: string } | null {
  if (typeof attrs.name === 'string') return { attr: 'name', value: attrs.name }
  if (typeof attrs.property === 'string') return { attr: 'property', value: attrs.property }
  return null
}

/** Plain attribute records for each tag class, with `undefined` values dropped. */
function definedAttrs(tag: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tag)) {
    if (v !== undefined) out[k] = String(v)
  }
  return out
}

interface DecomposedHead {
  title: string | undefined
  metas: Array<Record<string, string>>
  links: Array<Record<string, string>>
  scripts: Array<{ type: string; content: string }>
}

/** Decompose a lowered HeadConfig into plain, escape-free tag records. */
export function decomposeHead(head: HeadConfig): DecomposedHead {
  return {
    title: head.title,
    metas: (head.meta ?? []).map((m) => definedAttrs(m)),
    links: (head.links ?? []).map((l) => definedAttrs(l)),
    scripts: (head.scripts ?? []).map((s) => ({ type: s.type, content: s.content })),
  }
}

// ---------------------------------------------------------------------------
// String applier (B4 — SSG prerender). Mirrors the DOM applier's keying.
// ---------------------------------------------------------------------------

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function attrsToHtml(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(' ')
}

/**
 * Apply a lowered HeadConfig onto a built `index.html` template string.
 *
 * - `<title>` is replaced (or injected when absent).
 * - Each meta is replaced in place when a tag with the same name/property
 *   already exists; otherwise injected before `</head>`.
 * - canonical link replaces an existing `rel="canonical"`; other links + all
 *   scripts (JSON-LD) are injected before `</head>`.
 *
 * Build-time only — the regex transform is never shipped to the client.
 */
export function applyHeadToHtml(html: string, head: HeadConfig): string {
  let out = html
  const inject: string[] = []
  const { title, metas, links, scripts } = decomposeHead(head)

  if (title !== undefined) {
    const tag = `<title>${escapeText(title)}</title>`
    if (/<title[^>]*>[\s\S]*?<\/title>/i.test(out)) {
      out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, tag)
    } else {
      inject.push(tag)
    }
  }

  for (const meta of metas) {
    const metaTag = `<meta ${attrsToHtml(meta)}>`
    const key = metaKey(meta)
    if (key) {
      const escaped = key.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`<meta\\s+[^>]*${key.attr}="${escaped}"[^>]*>`, 'i')
      if (re.test(out)) {
        out = out.replace(re, metaTag)
        continue
      }
    }
    inject.push(metaTag)
  }

  for (const link of links) {
    const linkTag = `<link ${attrsToHtml(link)}>`
    if ((link.rel ?? '').toLowerCase() === 'canonical') {
      const re = /<link\s+[^>]*rel="canonical"[^>]*>/i
      if (re.test(out)) {
        out = out.replace(re, linkTag)
        continue
      }
    }
    inject.push(linkTag)
  }

  for (const script of scripts) {
    // Element text — neutralize a literal `</` so injected `</script>` can't
    // break out (matches @aihu/server's buildHead guard).
    const body = script.content.replace(/<\//g, '<\\/')
    inject.push(`<script type="${escapeAttr(script.type)}">${body}</script>`)
  }

  if (inject.length === 0) return out
  const block = inject.join('\n    ')
  if (/<\/head>/i.test(out)) {
    return out.replace(/<\/head>/i, `    ${block}\n  </head>`)
  }
  return `${out}\n${block}`
}

// ---------------------------------------------------------------------------
// DOM applier (B5 — client-side SPA navigation).
// ---------------------------------------------------------------------------

/**
 * Remove every per-page head tag previously applied by `applyHeadToDocument`
 * (those stamped with {@link MANAGED_HEAD_ATTR}). Source/baseline tags and any
 * tag the appliers did not create are left in place.
 *
 * Called at the start of every navigation so a route that omits a field (or
 * navigating back to a route with a different head) never leaves a stale
 * title/canonical/OG/JSON-LD behind.
 */
export function clearManagedHead(doc: Document = document): void {
  const head = doc.head
  if (!head) return
  for (const el of Array.from(head.querySelectorAll(`[${MANAGED_HEAD_ATTR}]`))) {
    el.remove()
  }
}

/**
 * Apply a lowered HeadConfig to the LIVE `document.head` for SPA navigation.
 *
 * Idempotent per navigation: first clears the previously-managed per-page tags
 * ({@link clearManagedHead}), then applies the new config, stamping each tag it
 * creates with {@link MANAGED_HEAD_ATTR}. Because the lowered config already
 * folds in the global `app.head` defaults (via `routeHeadToSsrHead`'s
 * `globalHead`), re-applying the full set every navigation keeps those defaults
 * present while dropping route-only tags from the prior page.
 *
 * - `<title>`: the document title is set via `document.title`. (Title is a
 *   singleton — never stamped/removed; an absent title leaves the prior one,
 *   but the lowered config carries the global default title so it is restored.)
 * - meta: upserted by name/property — an existing managed-or-source tag with
 *   the same key is updated in place; otherwise a fresh managed tag is appended.
 * - link: `rel="canonical"` upserts the existing canonical; other links append.
 * - script: JSON-LD upserted by `type`.
 */
export function applyHeadToDocument(head: HeadConfig, doc: Document = document): void {
  const headEl = doc.head
  if (!headEl) return

  clearManagedHead(doc)

  const { title, metas, links, scripts } = decomposeHead(head)

  if (title !== undefined) {
    doc.title = title
  }

  for (const meta of metas) {
    const key = metaKey(meta)
    let el: HTMLMetaElement | null = null
    if (key) {
      el = headEl.querySelector<HTMLMetaElement>(`meta[${key.attr}="${cssEscape(key.value)}"]`)
    }
    if (!el) {
      el = doc.createElement('meta')
      el.setAttribute(MANAGED_HEAD_ATTR, '')
      headEl.appendChild(el)
    } else {
      // Re-stamp so an upserted source/global tag is cleaned up with the rest.
      el.setAttribute(MANAGED_HEAD_ATTR, '')
    }
    setAttrs(el, meta)
  }

  for (const link of links) {
    const isCanonical = (link.rel ?? '').toLowerCase() === 'canonical'
    let el: HTMLLinkElement | null = null
    if (isCanonical) {
      el = headEl.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    }
    if (!el) {
      el = doc.createElement('link')
      el.setAttribute(MANAGED_HEAD_ATTR, '')
      headEl.appendChild(el)
    } else {
      el.setAttribute(MANAGED_HEAD_ATTR, '')
    }
    setAttrs(el, link)
  }

  for (const script of scripts) {
    let el = headEl.querySelector<HTMLScriptElement>(`script[type="${cssEscape(script.type)}"]`)
    if (!el) {
      el = doc.createElement('script')
      el.type = script.type
      el.setAttribute(MANAGED_HEAD_ATTR, '')
      headEl.appendChild(el)
    } else {
      el.setAttribute(MANAGED_HEAD_ATTR, '')
    }
    // textContent — the DOM never re-parses script text as HTML, so JSON-LD is
    // safe verbatim (no `</script>` escaping needed, unlike the string path).
    el.textContent = script.content
  }
}

/** Set/refresh attributes on an element from a plain record. */
function setAttrs(el: Element, attrs: Record<string, string>): void {
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v)
  }
}

/**
 * Escape a value for use inside a `[attr="…"]` CSS attribute selector. Uses the
 * platform `CSS.escape` when available, with a minimal fallback (quotes +
 * backslashes) for environments without it.
 */
function cssEscape(value: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } }
  if (g.CSS && typeof g.CSS.escape === 'function') return g.CSS.escape(value)
  return value.replace(/["\\]/g, '\\$&')
}
