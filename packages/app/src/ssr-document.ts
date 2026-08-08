/**
 * Document assembly for `output: 'ssr'` — the request-time half of what the SSG
 * prerender does at build time.
 *
 * ## The gap this closes
 *
 * `createServerRouter().handle()` returns a BARE FRAGMENT: the rendered route
 * markup and nothing else. No doctype, no `<html>`, no `<head>`, and — the part
 * that matters — no client `<script type="module">`. So an `output: 'ssr'` route
 * painted server-rendered markup and then stopped: no hydration, no
 * interactivity, no head. `renderToString`'s own document wrapper is gated on
 * `SsrOptions.head`, which neither `handle()` arm passes, and even passing it
 * would not help — `buildHead` has no facility for `<script src>` at all
 * (`ScriptTag` is `{ type, content }`).
 *
 * The SSG path never had this problem because it never computes a document: it
 * reads the FINISHED client `dist/index.html` off disk — which already carries
 * Vite's hashed `<script type="module">`, its modulepreloads and its stylesheet
 * links — and splices the rendered markup into the outlet. This module is that
 * same move, with the template handed in as a string instead of read from a
 * filesystem a Worker does not have.
 *
 * ## Why this module is separate, pure, and its own published entry
 *
 * It is bundled INTO the Worker (`@aihu/app`'s generated
 * `virtual:aihu-server-entry` imports it), so it must hold the same properties
 * `dist/client.js` does: no `node:` builtin, no module-level DOM access, no
 * filesystem. `check:runtime-purity` scans it on the `browser-edge` tier for
 * exactly that reason. `prerender.ts` — which is Node-only and full of
 * `node:fs` — imports {@link injectIntoOutletId} from here rather than keeping
 * its own copy, so the SSG and SSR splices are one rule and cannot drift.
 */

import type { HeadConfig, RouteHead } from '@aihu/server/head-lowering'
import { routeHeadToSsrHead } from '@aihu/server/head-lowering'
import { applyHeadToHtml } from './head-apply.ts'

/**
 * The outlet element id every aihu surface agrees on when nothing overrides it.
 *
 * `outlet` IS the standard: `@aihu/app/client` defaults to it, the CLI template
 * emits `<div id="outlet"></div>`, `apps/docs` uses it, and the SSG prerender
 * splices it. Defined once, here, so the three consumers (client mount, SSG
 * splice, SSR splice) cannot each carry their own literal.
 */
export const DEFAULT_OUTLET_ID = 'outlet'

/**
 * Inject rendered route content into the outlet element of an HTML template.
 *
 * Returns `null` — NOT the template — when the template has no element with
 * that id. A caller that silently accepted the unchanged template would ship a
 * complete-looking document with an EMPTY outlet, which is indistinguishable at
 * the page from a render that produced nothing. Both call sites turn `null`
 * into a named diagnostic instead.
 *
 * Moved here verbatim from `prerender.ts`'s private `injectContent` so the SSG
 * path and the live SSR path splice identically.
 */
export function injectIntoOutletId(html: string, content: string, outletId: string): string | null {
  const escaped = outletId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match an empty outlet `<div id="outlet"></div>` (the SPA scaffold shape).
  const emptyRe = new RegExp(
    `(<[a-zA-Z]+\\b[^>]*\\bid="${escaped}"[^>]*>)(\\s*)(</[a-zA-Z]+>)`,
    'i',
  )
  if (emptyRe.test(html)) {
    // The FUNCTION form, deliberately. Rendered content goes in as the
    // REPLACEMENT, and a replacement STRING expands `$&`, `` $` ``, `$'` and
    // `$n` as backreferences — so any page whose prose contains one of those
    // sequences re-splices the layout shell into itself. `/api/store` does it
    // today (its text contains `` $` ``). The function form performs no
    // expansion at all.
    return html.replace(emptyRe, (_m, p1: string, _p2: string, p3: string) => p1 + content + p3)
  }
  // Fallback: open-tag only — insert content right after it.
  const openRe = new RegExp(`(<[a-zA-Z]+\\b[^>]*\\bid="${escaped}"[^>]*>)`, 'i')
  if (openRe.test(html)) {
    return html.replace(openRe, (_m, p1: string) => p1 + content)
  }
  return null
}

/**
 * The subset of a matched route this module reads. Structural rather than
 * `import`ed from `@aihu/router` so the Worker bundle takes on no runtime
 * dependency for what is a type-only need.
 */
export interface SsrDocumentRoute {
  /** The route pattern — the memo key for the head-applied template. */
  readonly pattern: string
  /** The compiled `@route { head }` block, if the route declares one. */
  readonly head?: RouteHead
}

export interface SsrDocumentConfig {
  /**
   * The built client `index.html`, verbatim. Carries Vite's hashed
   * `<script type="module">`, its modulepreloads, its stylesheet links and the
   * `app.head` the `aihu-head` plugin already applied at build time.
   *
   * An empty string means the build could not read one; {@link createSsrDocument}
   * then passes every response through untouched, which is the pre-existing
   * fragment behaviour rather than a broken document.
   */
  readonly template: string
  /** Resolved outlet id — `app.outletId` from the aihu config, or the default. */
  readonly outletId: string
  /** `site.url`, for resolving relative canonical/OG/Twitter URLs. */
  readonly siteUrl?: string
  /** `app.head`, folded UNDER each route's own head (same as SSG and client nav). */
  readonly globalHead?: HeadConfig
}

/**
 * Wrap one `handle()` response into a full document.
 *
 * `route` is the match that produced the response, used only for its per-route
 * head; omitting it applies the template's head unchanged.
 */
export type SsrDocumentWrapper = (response: Response, route?: SsrDocumentRoute) => Promise<Response>

/**
 * `Content-Type` is the whole gate, and it is deliberately not a status check.
 *
 * Every response `handle()` produces that is NOT a rendered page already names
 * itself: the 404 and the 500s are `text/plain`, the E3 governed-data endpoint
 * is `application/json`, and an adapter's ASSETS fallthrough never reaches this
 * function at all (it happens outside `handler`, after a 404 comes back).
 * Meanwhile a governed WITHHELD render is `text/html` at 402/403 — a real page
 * that needs its script tag exactly as much as a 200 does. Keying on status
 * would wrap the wrong set in both directions.
 */
function isHtml(response: Response): boolean {
  const ct = response.headers.get('content-type')
  return ct?.toLowerCase().trimStart().startsWith('text/html') ?? false
}

/**
 * Build the request-time document wrapper.
 *
 * ## Why the head is memoised per route pattern
 *
 * `routeHeadToSsrHead` takes the route's compiled head plus `siteUrl` and
 * `globalHead` — none of which depend on the request, the params, or the
 * rendered content. So the head-applied template is a pure function of the
 * ROUTE, and computing it once per pattern turns a per-request regex pass over
 * the template into a per-isolate one. The map is bounded by the route count,
 * which is fixed at build time.
 *
 * A route that declares no head, in an app with no `app.head`, lowers to `{}`
 * and `applyHeadToHtml` returns the template unchanged — so the common case
 * costs one map lookup.
 */
export function createSsrDocument(config: SsrDocumentConfig): SsrDocumentWrapper {
  const { template, outletId, siteUrl, globalHead } = config
  const headed = new Map<string, string>()
  // One-shot latch. A missing outlet is a property of the TEMPLATE, so it is
  // true for every request this isolate serves; logging it per request would
  // bury a Worker's logs under one repeated line.
  let warnedNoOutlet = false

  function templateFor(route: SsrDocumentRoute | undefined): string {
    if (route === undefined) return template
    const cached = headed.get(route.pattern)
    if (cached !== undefined) return cached
    const lowered = routeHeadToSsrHead(route.head, {
      ...(siteUrl !== undefined ? { siteUrl } : {}),
      ...(globalHead !== undefined ? { globalHead } : {}),
    })
    const html = applyHeadToHtml(template, lowered)
    headed.set(route.pattern, html)
    return html
  }

  return async (response, route) => {
    if (template === '' || !isHtml(response)) return response

    const content = await response.text()
    const document = templateFor(route)
    const spliced = injectIntoOutletId(document, content, outletId)
    if (spliced === null) {
      if (!warnedNoOutlet) {
        warnedNoOutlet = true
        console.error(
          `[@aihu/app] ssr: the client index.html has no element with id="${outletId}", so the ` +
            'server-rendered markup cannot be placed in the document. Add ' +
            `<div id="${outletId}"></div> to index.html, or set app.outletId in the aihu ` +
            'config to the id it already uses. The page is being served with an EMPTY outlet.',
        )
      }
      return new Response(document, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    // Status, statusText and headers are carried over verbatim: the governed
    // path's `Cache-Control: private`, `Vary` and `X-Robots-Tag` are decisions
    // about the RESPONSE, and wrapping its body must not restate or drop them.
    return new Response(spliced, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}
