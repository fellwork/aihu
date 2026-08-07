/**
 * Layout ↔ page composition: splice rendered page content into a layout
 * shell's `data-aihu-outlet` marker.
 *
 * ## Why this lives in `@aihu/server` and not next to either caller
 *
 * TWO server render paths compose layouts, and they live in different
 * packages: the SSG prerender (`@aihu/app`'s `prerender.ts`, build time) and
 * the live SSR router (`@aihu/router/server`'s `handle`, request time). A page
 * that looks right prerendered and loses its shell when served from a Worker
 * is a silent production divergence, and the way that divergence gets
 * introduced is two implementations of one rule drifting apart. `@aihu/server`
 * is the package both already depend on, so the rule has exactly one
 * definition.
 *
 * The marker itself is emitted by `@aihu/compiler`'s layout mode — a layout's
 * `<outlet>` lowers to a passive element carrying `data-aihu-outlet`, which
 * `@aihu/app`'s client renderer fills on hydration. This is the server-side
 * mirror of that fill.
 */

/** Matches the outlet attribute with or without a value. */
const ATTR = 'data-aihu-outlet(?:="[^"]*")?'

/** `<div data-aihu-outlet></div>` — the empty passive-marker shape. */
const EMPTY_RE = new RegExp(`(<[a-zA-Z]+\\b[^>]*\\b${ATTR}[^>]*>)(\\s*)(</[a-zA-Z]+>)`, 'i')

/** Open tag only — content goes immediately after it. */
const OPEN_RE = new RegExp(`(<[a-zA-Z]+\\b[^>]*\\b${ATTR}[^>]*>)`, 'i')

/**
 * Inject rendered page content into a layout shell's `data-aihu-outlet`
 * marker.
 *
 * Returns the composed HTML, or `null` when the layout renders no such marker
 * — so a caller can fall back to serving the page without the layout rather
 * than serving a shell with the page missing from it. Callers also use
 * `injectIntoOutlet(shell, '') === null` as the "does this layout have an
 * outlet at all?" probe, before paying to compose.
 *
 * REPLACEMENT IS A FUNCTION, deliberately, and this is load-bearing rather
 * than stylistic. `String.prototype.replace` expands `$&`, `` $` ``, `$'` and
 * `$n` inside a replacement STRING, so any page whose prose contains one of
 * those sequences would re-splice the layout shell into itself. A shipped
 * docs page (`/api/store`, whose text contains `` $` ``) does exactly that.
 * The function form performs no expansion at all.
 */
export function injectIntoOutlet(layoutHtml: string, content: string): string | null {
  if (EMPTY_RE.test(layoutHtml)) {
    return layoutHtml.replace(
      EMPTY_RE,
      (_m, p1: string, _p2: string, p3: string) => p1 + content + p3,
    )
  }
  if (OPEN_RE.test(layoutHtml)) {
    return layoutHtml.replace(OPEN_RE, (_m, p1: string) => p1 + content)
  }
  return null
}
