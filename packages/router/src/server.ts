// Server-only router surface. This file MUST stay out of the browser
// `./` entry's static + dynamic graph because `@aihu/server`'s
// `renderToString` reaches a lazy `await import('./native.js')`, and the
// built `native.js` statically imports `node:module`. Browser bundlers
// (Vite/Rollup/Rolldown) chase the dynamic import and choke.
// See .context/fw-agent/bug2.5-node-module-leak/investigation.md.

import type {
  ChildModuleLike,
  DataProvider,
  GovernedEmission,
  GovernedRegistry,
  GovernedRequestAuth,
  GovernedRouteDataDecl,
  PlatformContext,
} from '@aihu/server'
import {
  attachSsrString,
  deriveReadPolicy,
  GOVERNED_RETRY_AFTER_SECONDS,
  governedHttpStatus,
  injectIntoOutlet,
  isGovernedFetch,
  materializeGeneratedLoader,
  normalizeGovernedData,
  passesRouteRead,
  renderToString,
  resolveRequestPrincipal,
  validateGovernedBoot,
} from '@aihu/server'
import type { RouteDefinition, RouteModule, Router } from './router.ts'
import { createRouter } from './router.ts'

// Re-exported so a consumer wiring an adapter never has to reach past
// `@aihu/router/server` for the type of the value it threads.
export type { PlatformContext } from '@aihu/server'

/**
 * A server-capable router: a regular {@link Router} plus a
 * `handle(req, platform?)` method that renders the matched route to an HTML
 * `Response`. Equivalent to the old `createRouter().handle` shape, but
 * isolated behind the `@aihu/router/server` subpath so SPA bundles never reach
 * `@aihu/server`'s native loader.
 */
export type ServerRouter = Router & {
  /**
   * Serve one request.
   *
   * `platform` is the host runtime's per-request ambient state — on Cloudflare
   * Workers, `fetch`'s `env` (KV, D1, R2, Durable Object stubs, secrets) and
   * `ctx` (`waitUntil`); on another host, whatever that host's adapter chooses
   * to pass. The framework NEVER reads inside it; it forwards it, unread and
   * untyped, to route loaders, the governed provider, the live entitlement
   * resolver and the session resolver.
   *
   * OMITTING IT IS BYTE-IDENTICAL to the pre-bindings behaviour: every
   * consumer of `platform` receives `undefined` and every one of them treats
   * that as "the host offered none", which is the state they were all in
   * before this parameter existed.
   */
  handle(req: Request, platform?: PlatformContext): Promise<Response>
}

/**
 * The subset of a layout module the live SSR path reads — the same three
 * exports `@aihu/app`'s prerender reads off a layout, for the same reasons.
 *
 * A RESOLVED module, not a loader, for the same reason
 * {@link ServerRouterOptions.children} is: composition happens inside a
 * synchronous render and cannot await a dynamic import mid-flight, so every
 * module must already be in hand when a render begins.
 *
 * CORRECTED: this used to add "the awaiting belongs at module init, once, not
 * on the request path". That was the original wiring and it is no longer true.
 * A module-scope `await` makes `@aihu/app`'s generated Worker entry an ESM
 * ASYNC module, and the bundler's chunk cycle then deadlocks it on load — a
 * green build whose Worker hangs on every request. The awaiting now happens
 * once on the FIRST REQUEST, memoised, strictly before `handle()` is invoked.
 * The contract this type states is unchanged; only where it is satisfied moved.
 */
export interface LayoutModuleLike {
  /** The renderable — `() => arbor-tree` or `{ toHtml() }`. */
  readonly default?: unknown
  /** LDF §10 step 3 — the compiler-assigned `data-a` scope id, for first-paint CSS. */
  readonly __aihu_light_scope__?: string
  /** The layout's registered custom-element tag, so SSR wraps what the client builds. */
  readonly __aihu_tag__?: string
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
   * in hand before a render begins.
   *
   * CORRECTED: this used to end "Awaiting belongs at module init, once." It no
   * longer does, and could not: module-scope `await` makes `@aihu/app`'s
   * generated Worker entry an ESM async module, which deadlocks inside the
   * bundler's chunk cycle. `@aihu/app` now resolves the whole registry graph
   * once on the first request and memoises it, strictly before `handle()` runs
   * — which satisfies this resolved-map contract exactly as module-scope
   * resolution did.
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
  /**
   * Resolved layout modules, keyed by the NAME a route's `@route { layout }`
   * declares (not by tag, not by file path) — that is the key the compiled
   * `RouteDefinition.layout` carries.
   *
   * ## The divergence this closes
   *
   * `@aihu/app`'s SSG prerender composes layouts; this file did not, at all
   * (`grep -c layout` over it returned 0 before this option existed). So an
   * app that looked right prerendered lost its ENTIRE shell — nav, footer,
   * grid — the moment the same route was served from a Worker, and nothing
   * warned. That is a silent, visible-in-production difference between two
   * render paths that are supposed to produce the same document.
   *
   * The composition RULE itself is not reimplemented here: the outlet splice
   * is `@aihu/server`'s `injectIntoOutlet`, which the prerender calls too.
   * What this file reproduces is the surrounding SEQUENCE (resolve → render
   * shell → probe for a marker → inject, warning and falling back to the bare
   * page at each step), because the two paths resolve layout MODULES
   * differently and always will: the prerender scans the layouts directory off
   * disk with a live Vite SSR loader, while a Worker has no filesystem and
   * gets its modules from `virtual:aihu-layouts` inside the bundle.
   *
   * Omitting it leaves `handle` byte-identical to before — a route with a
   * `layout` renders bare, exactly as it did.
   */
  readonly layouts?: ReadonlyMap<string, LayoutModuleLike>
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
 * Per-layout one-shot warning latch. Layout composition failures are
 * PER-LAYOUT facts, not per-request ones — a missing layout module is missing
 * for every request that route serves — so warning once per name is the whole
 * signal, and warning per request would bury a Worker's logs under one
 * repeated line.
 */
const layoutWarned = new Set<string>()

/**
 * Resolve a module's `default` to something `renderToString` accepts, or
 * `null`.
 *
 * The same two shapes `@aihu/app`'s prerender accepts (`resolveComponent`) and
 * the same reason for accepting both: a compiled `.aihu` module's default is a
 * render function, while hand-authored and `{ toHtml() }` modules are objects.
 * Anything else — notably a compiled module that registers a custom element as
 * an import side effect and exports no default — is `null`, which callers turn
 * into a warning rather than a crash.
 */
function resolveRenderable(value: unknown): (() => unknown) | { toHtml(): string } | null {
  if (typeof value === 'function') return value as () => unknown
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toHtml?: unknown }).toHtml === 'function'
  ) {
    return value as { toHtml(): string }
  }
  return null
}

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
    platform: PlatformContext | undefined,
  ): Promise<GovernedEmission<unknown> | 'conflict'> {
    const override = providerOverride(mod, route.pattern)
    if (override === 'conflict') return 'conflict'
    // Step 1 — THE principal, settled once per request (shipped resolver).
    // `platform` reaches the session resolver here: a cookie-session lookup is
    // a store read, and on a Worker the store is a binding.
    const principal = await resolveRequestPrincipal(req, options?.auth, platform)
    const loader = materializeGeneratedLoader(registry, decl, route.extract?.read, override)
    // Steps 2–5 — static meet → live entitlement → provider → emit. `platform`
    // rides the load context to BOTH the entitlement resolver (step 3) and the
    // provider (step 4): an app whose paywall is a D1 row and whose content is
    // an R2 object needs it at both stages, and giving it to one only would be
    // discovered in production.
    return loader({
      params,
      url,
      principal,
      entitlements: registry.createMemo(),
      ...(platform !== undefined ? { platform } : {}),
    })
  }

  /**
   * Compose the route's layout around already-rendered page content.
   *
   * Mirrors `@aihu/app`'s `runPrerender` step for step — same fallback ladder,
   * same warning triggers — and calls the SAME `injectIntoOutlet` for the
   * splice itself so the composition rule has one definition. The differences
   * are the two this path cannot avoid: modules come from a pre-resolved map
   * rather than a filesystem scan, and there is NO shell cache. The prerender
   * caches per (layout, concrete path) because it renders a closed set of
   * paths in one process; a Worker serves an open set and a cache keyed on
   * anything less than the whole request would eventually serve one visitor's
   * chrome to another.
   *
   * Returns `content` unchanged whenever the layout cannot be composed. A page
   * without its shell is a degraded page; a shell without its page is a blank
   * one, so every failure falls back in that direction.
   */
  async function withLayout(route: RouteDefinition, content: string): Promise<string> {
    const layouts = options?.layouts
    const name = route.layout
    // No layouts map ⇒ this whole path is inert and `handle` is byte-identical
    // to its pre-layout behaviour.
    //
    // TRUTHINESS, not `!== undefined`, and this is load-bearing rather than
    // sloppy. `compileRouteMeta` emits `layout: ""` for every page that
    // declares none — verified in a built `_worker.js` — so an
    // `undefined`-only check treats EVERY layout-less route as declaring a
    // layout named `""`, fails to find it, and logs a warning about a layout
    // nobody wrote. Found by the e2e gate, which is the only test here that
    // runs a real `vite build` and therefore the only one that sees what the
    // compiler actually emits.
    //
    // Empty-string-means-none is also the CLIENT's existing convention
    // (`client.ts`: `layoutName ? layouts[layoutName] : undefined`), so
    // matching it is what keeps the two renderers agreeing about which routes
    // have chrome.
    if (layouts === undefined || !name) return content

    const warnOnce = (msg: string): void => {
      if (layoutWarned.has(name)) return
      layoutWarned.add(name)
      console.warn(msg)
    }

    const mod = layouts.get(name)
    if (mod === undefined) {
      warnOnce(
        `[@aihu/router] ssr: layout '${name}' (route '${route.pattern}') is not in the ` +
          'resolved layouts map — serving the page without its layout. The map is built from ' +
          "`virtual:aihu-layouts`; a layout the router's scan did not find is the usual cause.",
      )
      return content
    }

    const component = resolveRenderable(mod.default)
    if (component === null) {
      warnOnce(
        `[@aihu/router] ssr: layout '${name}' has no SSR-renderable default export — route ` +
          `'${route.pattern}' serves the page without its layout (the client still wraps it ` +
          'on hydrate). Export a default renderable to server-render the layout.',
      )
      return content
    }

    let shell: string
    try {
      shell = await renderToString(component, {
        // Same requirement as the page render below: this shell is part of the
        // document a live SPA hydrates into, so it needs adoption markers or
        // the client rebuilds the chrome beside it.
        hydratable: true,
        // A layout is where a site's nav and footer live, so it is where most
        // component references are. Without this the shell renders with every
        // one of them empty — the exact failure the child registry exists to
        // remove, reintroduced one level up.
        ...(options?.children !== undefined ? { children: options.children } : {}),
        ...(mod.__aihu_light_scope__ !== undefined
          ? { lightScopeId: mod.__aihu_light_scope__ }
          : {}),
        ...(mod.__aihu_tag__ !== undefined ? { wrapTag: mod.__aihu_tag__ } : {}),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnOnce(
        `[@aihu/router] ssr: layout '${name}' failed to render for route '${route.pattern}': ` +
          `${msg} — serving the page without its layout.`,
      )
      return content
    }

    const composed = injectIntoOutlet(shell, content)
    if (composed === null) {
      warnOnce(
        `[@aihu/router] ssr: layout '${name}' renders no <outlet> (data-aihu-outlet) marker — ` +
          `route '${route.pattern}' serves the page without its layout.`,
      )
      return content
    }
    return composed
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
  async function handleDataRequest(
    req: Request,
    url: URL,
    platform: PlatformContext | undefined,
  ): Promise<Response> {
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
    // The E3 transport gets the SAME platform the SSR transport does — the
    // spec's "one contract, byte-equal decisions" only holds if both stages
    // can reach the same data sources on both transports.
    const emission = await runGoverned(
      req,
      url,
      result.route,
      result.params,
      decl,
      registry,
      mod,
      platform,
    )
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

  async function handle(req: Request, platform?: PlatformContext): Promise<Response> {
    const url = new URL(req.url)

    // The E3 endpoint exists ONLY when a governed registry is configured —
    // without one, these paths fall through to normal matching exactly as
    // before (G7j byte-identical).
    if (governed && url.pathname.startsWith(`${DATA_ENDPOINT_PREFIX}/`)) {
      return handleDataRequest(req, url, platform)
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
      const emission = await runGoverned(req, url, route, params, decl, governed, mod, platform)
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
      // The layout wraps the CONTENT, and the loader embed rides OUTSIDE it.
      // `__aihu_loader__` is read by id off the document, so its nesting is
      // irrelevant to the client — but splicing it inside the outlet would put
      // a governed payload inside whatever region the layout's CSS scopes,
      // and the prerender does not put it there either.
      const composed = await withLayout(route, html)
      // Granted → the Entitled<T> payload; withheld → ONLY the Withheld<T>
      // shape. The granted payload never exists in a withheld response.
      const body = `${composed}<script type="application/json" id="__aihu_loader__">${JSON.stringify(emission.data)}</script>`

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
    // The loader's second argument, built once per request and passed on every
    // call — including when the caller supplied no platform. Making it
    // conditional would mean `ctx.url` works on a Worker and throws on a bare
    // `handle(req)`, i.e. a loader's contract would depend on its host. See
    // `LoaderContext`.
    const loaderCtx = { request: req, url, ...(platform !== undefined ? { platform } : {}) }
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
        const principal = await resolveRequestPrincipal(req, options?.auth, platform)
        loaderData = passesRouteRead(principal, route.extract?.read)
          ? await mod.loader(params, loaderCtx)
          : undefined
      } else {
        loaderData = await mod.loader(params, loaderCtx)
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

    // Same composition as the governed arm above. BOTH arms or neither: a
    // layout that appears on ungoverned routes and vanishes on governed ones
    // would make a site's chrome depend on whether a page declares `data:`.
    const composed = await withLayout(route, html)

    const body =
      loaderData !== undefined
        ? `${composed}<script type="application/json" id="__aihu_loader__">${JSON.stringify(loaderData)}</script>`
        : composed

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
