# Director Research — Q6 Router Middleware

**Date:** 2026-05-02
**Author:** Topic Director (Q6)
**User delegation:** "Research best option, recommend, I'll go with your recommendation."
**Decision authority:** Director (recommendation) → User (ratification, single click).

---

## Recommendation

**Option 1 — Router-level isomorphic middleware in `@aihu/router`**, exposed as a thin, transport-agnostic `defineRouterMiddleware((ctx, next) => ...)` surface that runs on **navigation** (client) and **route-match** (server), and is **distinct from but composable with** `@aihu/server`'s `defineMiddleware` (which keeps owning the HTTP request/response envelope).

The router middleware is the "navigation pipeline" (URL changes, params, matched route, abort/redirect, prefetch); the server middleware is the "HTTP pipeline" (Request → Response, headers, cookies, body). Both must exist; they intersect cleanly at SSR.

---

## Rationale

### Use cases

Server-only middleware (Option 2) cannot express the patterns Nuxt and TanStack Router users now treat as table-stakes:

- **Auth-gated client navigation** — `if (!session) return redirect('/login')` on `pushState`, *before* the new route's chunk fetches. Server middleware can't fire here because no HTTP request occurs on a client transition.
- **Page-leave confirmation / unsaved-form guard** — `if (form.dirty && !confirm(...)) return cancel()`. Pure client concern; the server has nothing to guard.
- **Prefetch + loading-state coordination** — gate `<Link prefetch>` decisions, drive a top-of-page progress bar, suspend until `loader()` resolves. Needs the navigation lifecycle, not the request lifecycle.
- **Breadcrumb / telemetry / scroll-restoration** — fire-and-forget hooks on every successful match. Wanting these to live in the same shape as auth (so `composeMiddleware` works on both) is the ergonomics win.
- **Isomorphic auth check** — same `requireSession` middleware runs server-side on first paint *and* client-side on subsequent navigations. Without Option 1, the consumer writes the check twice (once in `@aihu/server` middleware, once as a manual `beforeNavigate` they wire themselves).

Option 2 forces every consumer to re-invent the navigation-pipeline contract. That's the textbook "framework leaves a Nuxt-shaped hole" outcome the v1-reconciliation roadmap is explicitly trying to avoid.

### Complexity cost

The router middleware runtime is small. The full chain is the same `composed = (ctx, next) => dispatch(0)` shape `@aihu/server/middleware.ts` already uses (24 LoC), parameterised over `RouteMatchContext` instead of `Request`. Estimate: **+150–220 B gz in `@aihu/router`** (current 1.45 kB / 1536 B → headroom 50 B; need to raise the limit by ~256 B in v1.1 and budget against the Compressor pass that recovered 176 B on arbor — the same approach works here). This is cheaper than the equivalent userland glue would be, because every consumer would otherwise ship their own ~150 B compose.

Composition with `@aihu/server`'s Amendment 03 §6.5.3 stages is **layered, not interleaved**. Router middleware runs **inside** the server pipeline — specifically, after the server's `before-handler` plugin contributions and before `defineRoute`'s handler executes — which is exactly the position the route-match itself occupies today (`packages/server/src/router.ts:107-109` already calls `composeMiddleware(allMws)(req, finalHandler)`). The router middleware chain becomes the body of `finalHandler`, so plugin-contributed `before-handler` middleware sees the request *before* router middleware (correct: think CORS, body parsers); `after-handler` sees it after the response is produced; `on-error` wraps the whole stack. No new stage is needed — router middleware is a **second axis** orthogonal to the §6.5.3 stages, not a fourth stage.

### v3 dep-free thesis implications

Neither option requires npm runtime deps. Option 1 stays inside the `@aihu/*` envelope: the new `defineRouterMiddleware` is a hand-rolled compose function (no `koa-compose`, no `connect`, no `find-my-way`) and the navigation entry point dispatches on a `RouteMatchContext` that the router already constructs. **Option 2 is the higher-risk dep path** — without an in-framework navigation middleware, consumers reach for `@tanstack/router-core`, `react-router`, or the increasingly common "just use Hono on the client" pattern, all of which import npm runtime deps. Per Learning #49, the dep-free thesis is preserved more reliably by *shipping* the surface than by leaving a hole the ecosystem fills with deps.

### Layering invariants

Per spec §11, `@aihu/router` and `@aihu/server` are **across the hard boundary** — router is browser-side; server is SSR-side. Router currently imports `renderToString` from `@aihu/server` (`packages/router/src/router.ts:1`), which already tightens the v1 layering story (router-as-navigator vs router-as-route-matcher are conflated in the v1 codebase). The middleware shape **must not** force `@aihu/router` to import any more of `@aihu/server`.

**Resolution:** the `Middleware` type and `composeMiddleware` function move to `@aihu/router/middleware.ts` as the **canonical router-middleware shape** (parameterised on `RouteMatchContext`, not `Request`). `@aihu/server`'s existing `Middleware` (parameterised on `Request`) **stays where it is** — they are sibling types serving different stages. The shared `Next = () => Promise<R>` shape can live in a tiny shared types module if duplication is offensive, but duplication of a 1-line type is preferable to a new shared package. This keeps `@aihu/router` from importing `@aihu/server`'s middleware module and preserves the "browser packages don't import SSR packages" rule. The SSR-side router (currently in `@aihu/server/router.ts`) is the integration point: it adapts the router-middleware chain into the server pipeline at `composeMiddleware(allMws)(req, finalHandler)`.

### Magna integration angle

Option 1 composes notably better with Learning #17's magna-canonical thesis. The v2 `@aihu/magna` package will provide a fetcher that participates in the navigation lifecycle: prefetch on `<Link hover>` → suspend on `pushState` → resolve before `route-match` completes → hand the deserialised resource to the route's `loader()`. **That entire dance is router middleware**, not server middleware (it spans server-side first paint *and* client-side navigation, and the data resolution is part of the navigation, not part of the HTTP envelope). With Option 2, magna's prefetch coordination has to live as bespoke router-internal hooks — a private API that can't be extended by user middleware. With Option 1, magna ships as a `defineRouterMiddleware` plus a small build-time codegen for query identities. Topology-blind (Learning #41 territory), because the middleware shape doesn't commit users to one resource graph.

---

## Composition spec (Option 1)

### Stage diagram

```
                ┌─────────────────────────────────────────────────────┐
                │  @aihu/server pipeline (HTTP envelope)            │
                │                                                     │
  Request  ──►  │  before-handler   ──►   route-match  ──►  ROUTER ──┐│  ──►  Response
                │  (plugin contrib;        (@aihu/      MIDDLEWARE ││
                │   Amendment 03           server/         CHAIN     ││
                │   §6.5.3)                router.ts)               ││
                │                                                  ▼ ││
                │  after-handler    ◄──────────────────  defineRoute ││
                │  (plugin contrib)                       handler   ▲││
                │                                                   │││
                │  on-error  ◄─── thrown anywhere above ◄───────────┘││
                └─────────────────────────────────────────────────────┘
                                             ▲
                                             │  on the client, the
                                             │  same ROUTER MIDDLEWARE
                                             │  CHAIN runs alone on
                                             │  pushState navigation
                                             │  (no HTTP envelope)
```

- **`before-handler` (server)** runs before any route is matched. CORS, body parsing, global auth-token decode. Owned by `@aihu/server` plugin contributions per Amendment 03 §6.5.3.
- **Router middleware chain (router)** runs once a match exists, with `RouteMatchContext` (params, url, route definition, abort signal, redirect helper). On the client this is the *only* pipeline that runs.
- **Route handler / loader** is the leaf.
- **`after-handler` (server)** sees the produced response. Logging, response-header injection.
- **`on-error` (server)** wraps the whole stack. Router middleware throwing → bubbles to server `on-error`.

### Dependency propagation (per Plugin Contract §10)

Plugin-contributed router middleware declares deps the same way server middleware does: a string array, validated at plugin load. **Within the router chain**, ordering is array-order at registration time (consistent with `composeMiddleware`'s existing semantics in `@aihu/server`). **Across the router/server boundary**, the relationship is fixed by stage, not by dep: `before-handler` always runs before router middleware; router middleware always runs before route handler. Plugins cannot inject themselves *between* server stages and router stages — that would re-open the layering invariant. If they need cross-stage coordination, they contribute middleware to *both* surfaces and rely on a shared context object (which is the existing pattern).

---

## API sketch

```ts
// @aihu/router/middleware.ts
import type { RouteDefinition } from './router.ts'

export interface RouteMatchContext {
  readonly url: URL
  readonly params: Record<string, string>
  readonly route: RouteDefinition
  readonly signal: AbortSignal           // navigation cancellation
  readonly env: 'server' | 'client'
}

export type RouterNext = () => Promise<RouterResult>
export type RouterResult =
  | { kind: 'continue' }
  | { kind: 'redirect'; to: string; replace?: boolean }
  | { kind: 'cancel'; reason?: string }

export type RouterMiddleware =
  (ctx: RouteMatchContext, next: RouterNext) => RouterResult | Promise<RouterResult>

export function defineRouterMiddleware(m: RouterMiddleware): RouterMiddleware { return m }
export function composeRouterMiddleware(ms: ReadonlyArray<RouterMiddleware>): RouterMiddleware
```

Eighteen lines of public surface. `RouterResult` is the topology-blind escape hatch — a middleware can `redirect` or `cancel` without throwing (cheaper than exception-based control flow on the navigation hot path).

---

## Adoption path

- **v1.0-final.7** (carry-over batch): ship `defineRouterMiddleware` + `composeRouterMiddleware` in `@aihu/router` behind a +256 B size-limit raise; require the arbor 15 B regression (Q1) closed first to keep size-limit policy consistent. Acceptance: one client-side `redirect` test, one server-side composition test, parity with `@aihu/server` middleware test patterns.
- **v1.1**: file-based router middleware convention — `pages/admin/_middleware.ts` exports a `RouterMiddleware`; the router Vite plugin auto-wires it to all routes under that segment. Mirrors Nuxt's `middleware/` directory but at the route tree, not the global level.
- **v2 (`@aihu/magna`)**: magna prefetch coordination ships as a `defineRouterMiddleware`. Plugin contract §10 dependency declaration is exercised here for the first time.
- **v3 dep-free cutover**: no new work — router middleware is `@aihu/*`-only by construction.

---

## What this rules out

- **A "global guards" Express-style API on `@aihu/router`** (`router.use((req, res, next) => ...)`). Router middleware uses `RouteMatchContext`, not `Request`; the Express shape is reserved for `@aihu/server`.
- **`@vitejs/plugin-react`-style file-system magic at runtime.** Router middleware is *registered* (via `defineRouterMiddleware` or via the v1.1 file convention compiled at build time), not auto-discovered at runtime. Dep-free thesis preserved.
- **Cross-package `Middleware` type unification.** `@aihu/server`'s `Middleware` and `@aihu/router`'s `RouterMiddleware` stay distinct. Anyone tempted to write a "universal middleware" abstraction is rejected at review — that's the path to importing `@aihu/server` from `@aihu/router` and breaking spec §11.
- **Middleware as a vehicle for resource-graph topology.** Topology-blind: `RouteMatchContext` exposes params/url/route, never a typed graph node. Magna's resource graph is composed *inside* a middleware via `@aihu/magna`'s own API; it does not mutate the middleware shape.
- **A fourth Amendment 03 §6.5.3 stage for the router.** Router middleware is orthogonal to the server stages, not a sibling. Plugin Contract stays exactly as ratified.

---

## STATUS

Recommendation locked: **Option 1**. Architect R2.1 should treat this as the input to v1.0-final.7 and update the roadmap-draft Q6 entry from "user picks" to "Director-recommended Option 1; user single-click ratification."
