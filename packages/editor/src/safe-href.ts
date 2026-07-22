/**
 * safeHref — the one link-safety contract (spec §6.1 step 4, threat T2).
 *
 * Same semantics as fellwork/web's `markdown.ts` `safeHref`: only same-origin
 * paths (`/…`, never protocol-relative `//…`), `http(s)://`, and `mailto:`
 * survive. Everything else — `javascript:`, `data:`, `vbscript:`, bare
 * `//host` — returns null; callers drop the link and keep the label as text
 * (paste) or reject the write (model invariant I4).
 *
 * Enforced at MODEL WRITE TIME, not render time — a bad href cannot exist in
 * the doc. Exported as `@aihu/editor/safe-href` so web can converge on one
 * implementation later.
 */
export function safeHref(href: string): string | null {
  const h = href.trim()
  if (h.startsWith('/') && !h.startsWith('//')) return h
  if (/^https?:\/\//i.test(h)) return h
  if (/^mailto:/i.test(h)) return h
  return null
}
