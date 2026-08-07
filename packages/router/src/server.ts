// Server-only router surface. This file MUST stay out of the browser
// `./` entry's static + dynamic graph because `@aihu/server`'s
// `renderToString` reaches a lazy `await import('./native.js')`, and the
// built `native.js` statically imports `node:module`. Browser bundlers
// (Vite/Rollup/Rolldown) chase the dynamic import and choke.
// See .context/fw-agent/bug2.5-node-module-leak/investigation.md.

import type {
  DataProvider,
  GovernedEmission,
  GovernedRegistry,
  GovernedRequestAuth,
  GovernedRouteDataDecl,
} from '@aihu/server'
import {
  attachSsrString,
  deriveReadPolicy,
  GOVERNED_RETRY_AFTER_SECONDS,
  governedHttpStatus,
  isGovernedFetch,
  materializeGeneratedLoader,
  normalizeGovernedData,
  passesRouteRead,
  renderToString,
  resolveRequestPrincipal,
  validateGovernedBoot,
} from '@aihu/server'
import type { ChildModuleLike } from '@aihu/server'
import type { RouteDefinition, RouteModule, Router } from './router.ts'
import { createRouter } from './router.ts'

/**
 * A server-capable router: a regular {@link Router} plus a `handle(req)`
 * method that renders the matched route to an HTML `Response`. Equivalent
 * to the old `createRouter().handle` shape, but isolated behind the
 * `@aihu/router/server` subpath so SPA bundles never reach
 * `@aihu/server`'s native loader.
 */
export type ServerRouter = Router & {
  handle(req: Request): Promise<Response>
}

/**
 * GX Phase 4 (#466, 70-governed-data-access): options for the server router.
 * BOTH members optional; an app passing neither is byte-identical to the
 * pre-Phase-4 `createServerRouter(routes)` (guarded by G7j).
 */
export interface ServerRouterOptions {
  /**
   * The governed registry (`createGovernedRegistry()` from `@aihu/server`).
   * Passing it activates the governed pipeline for every route with a
   * compiled `data:` declaration, boot-validates the registry against the
   * route census (spec §2.3 — a typo is a boot refusal, not a 500 at first
   * request), and enables the E3 governed-data endpoint. Pass the SAME
   * instance to `AgentServiceOptions.entitlements` so both axes share one
   * live meaning per scope (§4.6).
   */
  readonly governed?: GovernedRegistry
  /**
   * Credential material for principal resolution on the SSR path: the
   * verifying auth plugin (Bearer JWTs), the anonymous-UA classifier, and a
   * host-verified session resolver (cookie path). Same injection posture as
   * `AgentServiceOptions.resolveAuth` / `PrincipalGateDeps`.
   */
  readonly auth?: GovernedRequestAuth
  /**
   * §2a — the pre-resolved child-component registry, forwarded to
   * `renderToString` as `SsrOptions.children` on BOTH render paths.
   *
   * Typed as `buildChildRegistry`'s own return type so the intended
   * construction is the obvious one:
   *
   * ```ts
   * const children = buildChildRegistry(discovered)
   * export default createServerRouter(routes, { children })
   * ```
   *
   * A RESOLVED map, not a loader — `__aihu_schild` runs inside the compiled
   * string fast path, which is synchronous, so every module must already be
   * in hand before a render begins. Awaiting belongs at module init, once.
   *
   * Omitting it is byte-identical to not passing it, matching this
   * interface's existing contract: a component reference then renders as an
   * empty element exactly as it does today.
   *
   * SCOPE, deliberately stated because the plan text overstated it: this
   * closes the forwarding hole in THIS file. It does not, by itself, give any
   * shipped adapter non-empty children. `@aihu/adapter-cloudflare` and
   * `-vercel` emit their entry as a raw string at `closeBundle`, wire
   * `createRequestRouter` rather than this function, and give every route a
   * `notFound` placeholder — they render nothing at all today. A consumer
   * still needs a way to BUILD this map on the server, which is §2b (a
   * server-target virtual module plus a Vite-worker-environment example).
   * See §2 of `docs/plans/2026-08-06-ssr-child-followups.md`.
   */
  readonly children?: ReadonlyMap<string, ChildModuleLike>
}

/**
 * E3 governed-data endpoint prefix (spec §3.3). PLACEHOLDER URL SHAPE:
 * ratification deferred (Q5) to the E2/E3 client-contract build — the
 * decisions and payloads served here are final; only the URL may move.
 * Active ONLY when a governed registry is configured.
 */
const DATA_ENDPOINT_PREFIX = '/__aihu/data'

/** Per-route one-shot W48x warning latch (plain loader on a hard-read route). */
const w48xWarned = new Set<string>()

/**
 * Construct a router with the server-side `handle(req)` request handler
 * wired in. Use this from Node/Bun/Workers SSR adapters; browser code
 * should keep using `createRouter` from `@aihu/router`.
 */
export function createServerRouter(
  routes: RouteDefinition[],
  options?: ServerRouterOptions,
): ServerRouter {
  const router = createRouter(routes)
  const governed = options?.governed

  // GX P4 boot validation (spec §2.3): fail-closed at init, not at first
  // request. No registry and no `data:` declarations ⇒ no-op (G7j).
  validateGovernedBoot(governed, routes)

  /** Resolve the route-local provider override (the §4.7 escape hatch). */
  function providerOverride(
    mod: RouteModule,
    pattern: string,
  ): DataProvider<unknown> | undefined | 'conflict' {
    if (!mod.loader) return undefined
    if (isGovernedFetch(mod.loader)) return mod.loader
    // C486 runtime backstop: `data:` + a plain sibling loader is a declared
    // contradiction — the build refuses it (router Vite integration); if a
    // stale/hand-built artifact reaches here anyway, fail closed. Runtime
    // precedence the author didn't write is the forbidden resolution (R2).
    console.error(
      `[aihu governed] C486: route '${pattern}' declares data: AND a plain loader — ` +
        'one data source per route; refusing to serve (fail-closed)',
    )
    return 'conflict'
  }

  /** Run the generated-loader pipeline for one governed route match. */
  async function runGoverned(
    req: Request,
    url: URL,
    route: RouteDefinition,
    params: Record<string, string>,
    decl: GovernedRouteDataDecl,
    registry: GovernedRegistry,
    mod: RouteModule,
  ): Promise<GovernedEmission<unknown> | 'conflict'> {
    const override = providerOverride(mod, route.pattern)
    if (override === 'conflict') return 'conflict'
    // Step 1 — THE principal, settled once per request (shipped resolver).
    const principal = await resolveRequestPrincipal(req, options?.auth)
    const loader = materializeGeneratedLoader(registry, decl, route.extract?.read, override)
    // Steps 2–5 — static meet → live entitlement → provider → emit.
    return loader({ params, url, principal, entitlements: registry.createMemo() })
  }

  /**
   * Response headers for ANY governed response (spec §3.2 step 5 / 40-spec
   * §5): per-principal content must never be shared-cache-served or
   * credential-blind-cached.
   */
  function governedHeaders(base: Record<string, string>, status: number): Record<string, string> {
    const headers: Record<string, string> = {
      ...base,
      'Cache-Control': 'private',
      Vary: 'Authorization, Cookie',
    }
    if (status === 503) headers['Retry-After'] = String(GOVERNED_RETRY_AFTER_SECONDS)
    return headers
  }

  /**
   * The E3 governed-data endpoint (spec §3.3): the SAME generated loader over
   * an HTTP JSON transport — one contract, byte-equal decisions with SSR.
   * Serves ONLY governed routes; anything else is 404 (this endpoint never
   * becomes a second, ungated data path).
   */
  async function handleDataRequest(req: Request, url: URL): Promise<Response> {
    const registry = governed as GovernedRegistry // caller gates on presence
    const CT = { 'Content-Type': 'application/json' }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'method not allowed' }), {
        status: 405,
        headers: CT,
      })
    }
    const inner = url.pathname.slice(DATA_ENDPOINT_PREFIX.length) || '/'
    const result = router.match(inner)
    const decl = result ? normalizeGovernedData(result.route.data) : null
    if (!result || decl === null || decl === 'malformed') {
      // Ungoverned/unknown paths are indistinguishable here — existence is
      // never confirmed to the refused (the Amendment 4 posture).
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: CT })
    }
    const mod = await result.route.module()
    const emission = await runGoverned(req, url, result.route, result.params, decl, registry, mod)
    if (emission === 'conflict') {
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500,
        headers: CT,
      })
    }
    if (emission.kind === 'error') {
      // Post-grant provider failure: an error, never a locked state — and no
      // governed bytes ride the response (§4.3).
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500,
        headers: governedHeaders(CT, 500),
      })
    }
    const status = governedHttpStatus(emission)
    return new Response(JSON.stringify(emission.data), {
      status,
      headers: governedHeaders(CT, status),
    })
  }

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // The E3 endpoint exists ONLY when a governed registry is configured —
    // without one, these paths fall through to normal matching exactly as
    // before (G7j byte-identical).
    if (governed && url.pathname.startsWith(`${DATA_ENDPOINT_PREFIX}/`)) {
      return handleDataRequest(req, url)
    }

    const result = router.match(url.pathname)
    if (!result) return new Response('Not Found', { status: 404 })

    const { route, params } = result
    const mod = await route.module()

    // ── GX Phase 4 (#466): the governed path. A route with a `data:`
    // declaration never reaches the ungated `mod.loader` embed below — the
    // generated loader IS its only data path (invariant I2, spec §3.2).
    const decl = governed ? normalizeGovernedData(route.data) : null
    if (governed && decl !== null) {
      if (decl === 'malformed') {
        // Boot validation refuses this; a hand-mutated census reaching here
        // fails closed — never rounded to ungoverned.
        return new Response('Internal Server Error', { status: 500 })
      }
      const emission = await runGoverned(req, url, route, params, decl, governed, mod)
      if (emission === 'conflict' || emission.kind === 'error') {
        // §4.3: provider failure post-grant (or a C486 backstop) is an error
        // state — never a locked state, and NEVER any governed bytes.
        return new Response('Internal Server Error', {
          status: 500,
          headers: governedHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }, 500),
        })
      }

      // P3 item 2 (the integration seam): the settled emission IS the render
      // input. A compiled governed artifact's `__ssr` (mod.default) accepts
      // `{ route: { params, data } }`, so the entitled render receives
      // `route.data = Entitled<T>` and the withheld render `Withheld<T>` —
      // server HTML carries exactly what the gate emitted, nothing else.
      // Without this binding `renderToString` invokes the factory with no
      // args and the template renders (or throws) against
      // `route.data === undefined` while the payload rides only the JSON
      // embed below. `{ toHtml() }` modules pass through unchanged.
      const raw = mod.default as ((props?: unknown) => unknown) | { toHtml(): string }
      // Wave-3: the props-binding wrapper hides the compiled `__ssrString`
      // fast path attached to `raw`; `attachSsrString` re-attaches a
      // props-bound renderer from the MODULE export so the governed render
      // keeps the compiled string path (byte-identical to the walker).
      const routeProps = { route: { params, data: emission.data } }
      const component =
        typeof raw === 'function'
          ? attachSsrString(
              () => raw(routeProps),
              (mod as { __ssrString?: unknown }).__ssrString,
              routeProps,
            )
          : raw
      // `governed: true` — the P5/I2s guard: governed trees are not streamed;
      // a pending dataSource inside this render is refused fail-closed.
      const lightScope = (mod as { __aihu_light_scope__?: string }).__aihu_light_scope__
      const html = await renderToString(component, {
        hydratable: true,
        governed: true,
        // LDF §10 step 3: stamp the component's `data-a` scope id on the
        // rendered root so its `@scope([data-a="…"])` CSS applies at first
        // paint (before the client bundle re-stamps the host). Exported by
        // the compiler's server-target transform for light-DOM components.
        ...(lightScope !== undefined ? { lightScopeId: lightScope } : {}),
        // §2a: without this a component reference renders as an empty element
        // on every request-time SSR path, silently — the exact failure the
        // child work exists to remove, left behind at the live-SSR edge.
        ...(options?.children !== undefined ? { children: options.children } : {}),
      })
      // Granted → the Entitled<T> payload; withheld → ONLY the Withheld<T>
      // shape. The granted payload never exists in a withheld response.
      const body = `${html}<script type="application/json" id="__aihu_loader__">${JSON.stringify(emission.data)}</script>`

      const status = governedHttpStatus(emission)
      const base: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' }
      if (deriveReadPolicy(route.extract?.read).noindex) base['X-Robots-Tag'] = 'noindex'
      return new Response(body, { status, headers: governedHeaders(base, status) })
    }

    // ── The shipped, pre-Phase-4 path — byte-identical for ungoverned routes.
    //
    // ONE addition, active only when a governed registry is configured: the
    // T4 route-level fallback (spec §4.7, W48x). A plain `defineLoader` on a
    // hard-`read` route declines the generated contract but cannot escape the
    // gate — its output is withheld route-level from principals failing the
    // route's `read`.
    let loaderData: unknown
    if (typeof mod.loader === 'function') {
      if (governed && deriveReadPolicy(route.extract?.read).tier === 'hard') {
        if (!w48xWarned.has(route.pattern)) {
          w48xWarned.add(route.pattern)
          console.warn(
            `[aihu governed] W487: route '${route.pattern}' has a hard-tier read: with a ` +
              'plain loader — declare data: (generated loader) or use defineGovernedFetch; ' +
              'falling back to route-level withholding (T4)',
          )
        }
        const principal = await resolveRequestPrincipal(req, options?.auth)
        loaderData = passesRouteRead(principal, route.extract?.read)
          ? await mod.loader(params)
          : undefined
      } else {
        loaderData = await mod.loader(params)
      }
    } else if (mod.loader !== undefined) {
      // A defineGovernedFetch export on a route WITHOUT a data: declaration:
      // the escape hatch exists only inside the generated gate (spec §4.7).
      // Fail closed — the fetch is never invoked ungated, no data is emitted.
      console.error(
        `[aihu governed] route '${route.pattern}' exports defineGovernedFetch but declares ` +
          'no data: — the escape hatch replaces only the provider stage of a governed ' +
          'route; refusing to invoke it ungated (no loader data emitted)',
      )
    }

    const component = mod.default as (() => unknown) | { toHtml(): string }
    // `hydratable: true` is REQUIRED here, not an optimization. Every
    // `data-aihu-path` marker in `ssr.ts` is gated on `opts?.hydratable ?? false`,
    // so calling this with no options ships markerless HTML — and this handler's
    // output is not terminal, it is the document a live SPA hydrates into. Without
    // markers the client walker finds nothing to adopt and rebuilds the tree beside
    // the server's DOM, silently duplicating the page's content.
    //
    // `hydratable` is a property of the DESTINATION, not of the renderer, which is
    // why it is explicit at every call site rather than defaulted from "this is SSR".
    const ungovLightScope = (mod as { __aihu_light_scope__?: string }).__aihu_light_scope__
    const html = await renderToString(component, {
      hydratable: true,
      // Same `data-a` first-paint stamp as the governed path above.
      ...(ungovLightScope !== undefined ? { lightScopeId: ungovLightScope } : {}),
      // Same §2a forwarding as the governed path above. Both paths or neither:
      // one arm carrying children and the other not would make child rendering
      // depend on whether a route happens to be governed.
      ...(options?.children !== undefined ? { children: options.children } : {}),
    })

    const body =
      loaderData !== undefined
        ? `${html}<script type="application/json" id="__aihu_loader__">${JSON.stringify(loaderData)}</script>`
        : html

    // GX Phase 3 (#437-GX): the compliance-tier noindex signal, derived from
    // the route's compiled `extract.read` (spec §8). `read: 'none'` and every
    // hard value (`'verified'`/`'human'`/`{ scope }`) — plus a malformed
    // value, fail-closed — carry `X-Robots-Tag: noindex`. This is ADVISORY:
    // honored by compliant crawlers, nothing more. Hard-tier withholding of
    // the CONTENT itself is the governed path above (Phase 4); this fallback
    // still serves the full render, exactly as before.
    const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' }
    if (deriveReadPolicy(route.extract?.read).noindex) headers['X-Robots-Tag'] = 'noindex'

    return new Response(body, { status: 200, headers })
  }

  return { ...router, handle }
}
