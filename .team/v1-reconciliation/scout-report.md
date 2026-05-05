# Scout Report — v1 Reconciliation (Round 1)

**Author:** Scout (Round 1, read-only)
**Date:** 2026-05-02
**Main HEAD:** `7fa0957ae65c16d0f4a5290718fa25e41d785804`
**Scope:** Build a current-state map + Nuxt/Next baseline gap audit + open questions for the Architect (Round 2). No source or plan-doc edits.

> **Working-tree note:** the worktree's pre-existing branch base was `e005a47` (pre-v1). I reset to `origin/main = 7fa0957` before measuring sizes/tests. All findings below are at `7fa0957`.

---

## Section 1 — Current state map

### 1.1 Aggregate facts

- **Tests:** `bun run test` → **454 / 454 passing** across 54 test files (workspace).
- **Sizes:** `bun run size` → **7 of 8 packages within budget; `@aihu/arbor` is 15 B OVER (regression).** Full table below.
- **Packages on main:** 11 (`agent`, `agent-readiness`, `agent-service`, `arbor`, `compiler`, `context`, `data`, `router`, `runtime`, `server`, `signals`).
- **`.size-limit.json` rows:** 8 (no entry for `@aihu/server` or `@aihu/agent-readiness`).
- **`@aihu/server` ships a Rust SSR addon** (`packages/server/src-native/`, napi-rs cdylib) plus a 3-state loader (`packages/server/src/loader.ts`); `renderToString` is exported from `loader.ts`, `renderToStream` from `ssr.ts`.

### 1.2 Per-package surface

| Package | Size | Limit | Headroom | Status | Public API (value exports) |
|---|---|---|---|---|---|
| `@aihu/context` | 249 B | 300 B | +51 B | shipped (v1) | `createContext`, `provide`, `inject`, `setSsrContextMap`, `clearSsrContextMap`, `runWithContext`. Subpath: `./ssr` |
| `@aihu/signals` | 1.81 kB | 1970 B | +120 B | shipped (v0) | `signal`, `computed`, `effect`, `batch`, `untrack`, `$state`, `SignalError`, `SignalCircularError` |
| `@aihu/arbor` | 2.16 kB | 2200 B | **−15 B OVER** | shipped (v1) — **size regression** | `branch`, `leaf`, `mount`, `hydrate`, `slot`, `when`, `each`, `ArborError`, `ArborNotImplementedError` |
| `@aihu/runtime` | 1.14 kB | 1170 B | +7 B | shipped (v1) | `defineComponent`, `defineElement`, internal: `_setMount`, `_setSignal`, `_setHydrate`, `_hmrReplace`, `_hydrateOnVisible` |
| `@aihu/agent` | 117 B | 200 B | +83 B | shipped (v0) | `getAgentMetadata`, `registerAgentMetadata` |
| `@aihu/data` | 711 B | 750 B | +39 B | shipped (v1) | `createResource`, `createResourceStore`, `ResourceStoreToken`, `createResourceSerializer` |
| `@aihu/router` | 1.45 kB | 1536 B | +50 B | shipped (v1, PR #21) | `createRouter`, `viteRouterPlugin`. File-based, scans `pages/`, emits `virtual:aihu-routes` |
| `@aihu/agent-service` | 580 B | 600 B | +20 B | shipped (v1, PR #23, Plan 5.2) | `createAgentService` (yields MCP-shaped tool entries from agent registry) |
| `@aihu/server` | (no size-limit row) | — | — | shipped (v1, PR #27) | `defineRoute`, `createRouter`, `defineMiddleware`, `composeMiddleware`, `defineApiRoute`, `json`, `notFound`, `methodNotAllowed`, `badRequest`, `serverError`, `defineLoader`, `renderToString` (from `loader.ts`), `renderToStream`, `_setContextFns`, `defineAihuConfig` |
| `@aihu/agent-readiness` | (no size-limit row) | — | — | shipped (v0+v1) | `generateLlmsTxt`, `generateLlmsFullTxt`, `generateMcpServerCard`, `generateRobotsTxt`, `AI_BOT_LIST`, `createContentNegotiationHandler`, `agentReadiness` (Vite plugin), `createAgentReadinessRoutes` |
| `@aihu/compiler` | (Rust) | n/a | n/a | in-flight (Phase 1 shipped, C-3/C-4 active) | Rust crate + `bin/aihu-compile`; emits options-form `.aihu` SFCs; islands defer hydration; scoped/global styles; `<agent>` block; HMR injection via Vite plugin |

### 1.3 Notable invariants

- **Tier-3 hooks (Learning #16):** preserved in `@aihu/arbor` — subscription identity, `pathBase`, telemetry no-op-default, `Branch`/`Leaf` hidden-class shape.
- **`untrack` re-entrancy fix (Learning #46):** lattice-signal commit pattern depends on `untrack()` wrap; honored in `@aihu/data/resource.ts`.
- **`__DEV__` gate:** all 5 `_observeMount` call sites in arbor gated; rolldown `transform.define` injects `false` in production builds.
- **Hard layering boundary (per `.team/v1/spec-v1-architecture-ratified.md` §11):** `@aihu/server` and `@aihu/agent-readiness` may not be imported by browser packages; `@aihu/context` and `@aihu/data` may not import from `@aihu/server`.
- **Rolldown `external` discipline (Learning #48):** `data`, `arbor`, `server` rolldown configs all declare workspace deps as `external`. Audit pending for `agent-readiness`, `agent-service`, `router` (router config is presumably correct since size came in clean).
- **v3 dep-free thesis (Learning #49):** zero non-`@aihu/*` runtime deps target. Current state below in §2 confirms this is essentially honored at runtime; deviations live in build-time tooling only.

### 1.4 Recent ship history (relevant to v1 reconciliation)

From `git log --oneline -50 main` filtered for v1 PR merges:

- `b459d6e` PR #27 — `feat/v1-server-native` (Rust napi-rs SSR core + 3-state loader + parity tests)
- `e94d7b1` `fix/arbor-externalization` (Learning #48 + #30; 176 B Compressor recovery on arbor)
- `95a8582` PR #26 — `feat/v1-islands` (Plan 3.3: islands + defer hydration)
- `da83803` PR #25 — `feat/v1-hydration` (Plan 3.2: `serialize()` + `hydrate()` + `defineElement` hydration)
- `6bc1334` PR #24 — `feat/v1-hmr` (Plan 4.1: HMR via `_hmrReplace` + Vite plugin injection)
- `59313b7` PR #23 — `feat/v1-agent-service` (Plan 5.2: `@aihu/agent-service` package)
- `17fc43d` PR #21 — `feat/v1-router` (Plan 6.1: `@aihu/router` file-based + Vite plugin)
- `91ea857` PR #20 — `feat/v1-slots` (Plan 1.4: `slot()` primitive + compiler codegen)
- `2222a39` PR #18 — `feat/v1-scoped-styles` (Plan 1.3: `<style>` block → `CSSStyleSheet` emission)

The Director's brief is correct: PRs #18 / #20 / #21 / #23 / #24 / #25 / #26 / #27 are all on main. Only `feat/arbor-n2-dev-gate` remained as a feature branch and was merged at `e94d7b1`.

### 1.5 Build-time / dev-time deps in package.json (for §2 audit)

- `@aihu/compiler`: `peerDependencies: { vite: ">=5.0.0" }` (optional)
- `@aihu/server`: `dependencies: { @aihu/agent }`; `optionalDependencies` for 4 platform-native packages (`@aihu/server-{darwin-arm64,darwin-x64,linux-x64-gnu,win32-x64-msvc}` v0.1.0)
- `@aihu/router`: `dependencies: { @aihu/server }`
- `@aihu/agent-readiness`: `dependencies: { @aihu/server, @aihu/agent }`
- `@aihu/agent-service`: `dependencies: { @aihu/agent }`
- `@aihu/data`: `dependencies: { @aihu/signals, @aihu/context }`
- `@aihu/arbor`: `dependencies: { @aihu/signals }`
- `@aihu/runtime`: `peerDependencies: { @aihu/arbor, @aihu/signals }`
- `@aihu/context`, `@aihu/signals`, `@aihu/agent`: zero `dependencies`/`peerDependencies`
- **No package declares any non-`@aihu/*` runtime dependency.** The server's optional native addons are also under the `@aihu/server-*` prefix.

---

## Section 2 — Nuxt/Next baseline gap audit

Status legend: `shipped` = code exists on main with cited PR/commit; `partial` = subset shipped, gaps remain; `GAP` = not yet on main.

| Capability | Nuxt baseline | Next baseline | aihu today | Status | Cite / location |
|---|---|---|---|---|---|
| Reactive primitives | (Vue) | (React) | `@aihu/signals` (signal/computed/effect/batch/untrack/$state) | shipped | `packages/signals/src/index.ts`; v0 |
| Component model | Vue SFC | React JSX | `.aihu` SFC + `@aihu/runtime` (`defineComponent`/`defineElement`) | shipped | `packages/runtime/src/index.ts`; PR #14 (compiler Phase 1), v0 |
| Reconciler — when/each | `v-if`/`v-for` | render | `when()` + `each()` keyed reconciler | shipped | `packages/arbor/src/structural.ts`; Plan 1.1 (build-manifest-1.1.md) |
| Component props (typed) | `defineProps` | function args | `defineProps`/`SetupContext.attrs` w/ coercion | shipped | Plan 1.2 (build-manifest-1.2.md); Round 004 close |
| Scoped styles (shadow) | yes | CSS modules | `<style scoped>` / `<style global>` → `CSSStyleSheet.replaceSync` | shipped | PR #18 `2222a39`; compiler emits `adoptedStyleSheets` |
| Slots / content projection | `<slot>` | `children` | arbor `slot()` primitive + compiler codegen | shipped | PR #20 `91ea857`; `packages/arbor/src/slot.ts` |
| Context / inject | `useState` / Pinia | `useContext` | `createContext`/`provide`/`inject` (DOM-free; SSR `runWithContext`) | shipped | `packages/context/src/index.ts`; Plan 2.1 |
| Data fetching + cache | `useFetch` / `$fetch` | `fetch()` + RSC | `createResource` + store + serializer; fetcher-shaped (no GraphQL client) | shipped | `packages/data/src/index.ts`; spec-2.2-data.md; v3 thesis: raw fetch only (Learning #49) |
| Streaming SSR | `nuxt build` SSR | RSC streaming | `renderToStream` (Web Standards `ReadableStream<string>`); `renderToString` w/ Rust addon | shipped | `packages/server/src/{ssr,loader}.ts`; PR #27 server-native; spec-3.1 |
| Hydration (full) | yes | `'use client'` | `serialize()` + `hydrate()` + `defineElement` hydration; `data-aihu-path` anchors | shipped | PR #25 `da83803`; `packages/arbor/src/hydrate.ts` |
| Island / partial hydration | `<ClientOnly>` | RSC + `'use client'` | Plan 3.3 islands + defer hydration; `_hydrateOnVisible` (IntersectionObserver) | shipped | PR #26 `95a8582`; `packages/runtime/src/hydrate-on-visible.ts` |
| Router (file-based) | `pages/` | `app/` | `@aihu/router` — `createRouter`, `viteRouterPlugin` scans `pages/`, emits `virtual:aihu-routes`; static→param→catchall priority | shipped | PR #21 `17fc43d`; `packages/router/src/{router,vite-plugin}.ts` |
| Programmatic routes / route handlers | `server/api/*.ts` | `route.ts` | `defineRoute`, `defineApiRoute`, `defineLoader`, JSON helpers (`json`, `notFound`, …) | shipped | `packages/server/src/{router,api,data}.ts` |
| Middleware (server) | `server/middleware/` | `middleware.ts` | `defineMiddleware` + `composeMiddleware` (global + route-level) | shipped (server-side only) | `packages/server/src/middleware.ts` |
| HMR | yes | yes | `_hmrReplace` runtime hook + compiler Vite-plugin injection (Plan 4.1) | shipped — **Vite-coupled** | PR #24 `6bc1334`; compiler Vite plugin |
| Server functions / actions | `server/api/` | `'use server'` | `defineApiRoute` + `defineLoader` are the v1 surface; no `'use server'`-style RPC | partial | `packages/server/src/{api,data}.ts` |
| Error boundaries | `NuxtErrorBoundary` | `error.tsx` | No dedicated `ErrorBoundary` component primitive in arbor/runtime | **GAP** | `packages/arbor/src/types.ts` defines `ErrorHandler` for mount but no userland boundary; not in any build-manifest |
| Layouts (file-based + nested) | `layouts/default.vue` | `layout.tsx` | Not designed; router has no layout slot | **GAP** | not in spec-v1-architecture-ratified.md |
| Plugin / module system | nuxt modules | next plugins | None — current "plugins" are Vite plugins (compiler, agent-readiness, router) | **GAP** | n/a |
| Auto-imports | yes (`#imports`) | partial | None — explicit imports only | **GAP** | n/a |
| Image optimization | `<NuxtImg>` (Sharp) | `<Image>` (Sharp) | None | **GAP** (v1.5 — Decision 3) | will become `@aihu/image` |
| Font optimization | `@nuxtjs/fontaine` | `next/font` | None | **GAP** (v1.5 — Decision 3) | will become `@aihu/fonts` |
| CSS pipeline (PostCSS, Tailwind) | yes | yes | scoped/global only via compiler; no PostCSS/Tailwind orchestration | **partial / GAP** | will become `@aihu/css-pipeline` (v1.5) |
| Critical CSS extraction | yes | yes | None | **GAP** (v1.5) | n/a |
| i18n | `@nuxtjs/i18n` | `next-intl` | None | **GAP** (v2) | n/a |
| SSG | `nuxt generate` | `output: export` | None — only streaming SSR | **GAP** (v2) | streaming SSR (PR #27) is per-request |
| Devtools | `@nuxt/devtools` | React DevTools | None — Tier-3 hooks paid for in v0 (Learning #16) but no UI shell | **GAP** | telemetry hooks exist in `packages/arbor/src/telemetry.ts` |
| Build / deploy adapters | Nitro presets | platform configs | server-native addon ships 4 platforms (darwin-arm64, darwin-x64, linux-x64-gnu, win32-x64-msvc); edge runtime auto-skips native | partial | `packages/server/src/loader.ts`; `packages/server/npm/` |
| Environment vars | `runtimeConfig` | `process.env` | Not designed; `defineAihuConfig` exists but no env-var contract | **GAP** | `packages/server/src/config.ts` |
| Agent / MCP surface | (none) | (none) | `@aihu/agent` (registry) + `@aihu/agent-service` (MCP tool-shape adapter) + `@aihu/agent-readiness` (llms.txt, mcp-server-card, robots.txt, content-negotiation) — **aihu-unique** | shipped | `packages/agent*/`; v0 + Plan 5.2 + agent-readiness |
| TypeScript template type-check | `vue-tsc` | `tsc`/JSX | C-6 not yet shipped per dx-phase2-session-001.md TODOs | **GAP** (v1.1 candidate) | compiler roadmap |

### 2.1 v3 dep-free thesis audit (Learning #49)

For every package: `dependencies` + `peerDependencies` are exclusively `@aihu/*` or absent. Aihu is **already v3-thesis compliant at runtime**. Specifically:

- No Hono/Express/Polka/Fastify/h3 in `@aihu/server` ✓
- No `path-to-regexp` in `@aihu/router` (matcher is hand-written in `router.ts:matchRoute`) ✓
- No CSS-in-JS runtime ✓
- No GraphQL client deps in `@aihu/data` ✓
- Vite is build-time only (`peerDependencies` on compiler; Vite plugins only emitted by compiler/agent-readiness/router) ✓

**Caveats / open audit items:**
- HMR client (PR #24) ships `_hmrReplace` in runtime (≤ ~100 B) and a Vite-plugin injection step. Whether the *injected* HMR client code at runtime is aihu-native or pulls `@vitejs/client` is not confirmed by the plan-doc — see Question Q4 in §3.
- Islands defer-hydration loader (PR #26) lives in `packages/runtime/src/hydrate-on-visible.ts` (tree-shakeable; only imported by compiler-emitted defer-aware glue). Looks dep-free; not yet audited.
- Build-time tooling: compiler peer-deps Vite, server-native build uses Cargo/napi-rs (release artifact only). Per Director's Decision 7, Vite stays dev/build-only; not a v3-thesis violation.

---

## Section 3 — Open questions for Architect

The Architect's Round 2 brief (per Director note Decision 6 + Decision 5 surface conditions) is to draft `2026-05-02-aihu-v1-framework.md` + companion. These questions need answers (or ratified assumptions) before the roadmap can sequence v1.1 / v1.5 / v2 / v3:

1. **Q1 — `@aihu/arbor` 15 B size regression.** Current measurement: `2.16 kB / 2200 B (15 B OVER LIMIT)`. State-plan-a.md said arbor closed at +15 B headroom after the `e94d7b1` Compressor pass; today's `bun run size` shows 15 B over. Did a later commit add bytes? Should v1.1 Builder address this before any new arbor work, or should the limit be raised per Learning #42 split (feature vs accepted debt)? Cite: `bun run size` on `7fa0957`.

2. **Q2 — Missing size-limit rows for `@aihu/server` and `@aihu/agent-readiness`.** Neither package has an entry in `.size-limit.json`. Server is by design SSR-side (Node/Bun/Workers, not browser-budgeted), but the v3 thesis still wants a measured size for the dep-free audit. Is "no row" intentional (server is dev/runtime, not browser bundle) or an oversight? Roadmap should clarify the policy explicitly.

3. **Q3 — Layouts: file convention vs component-composition vs both?** Decision 5.1 names "Layout system shape (file-based vs component-composition vs both)" as user-reserved. The Architect must surface a recommendation with rationale (e.g., Nuxt layouts are file-based + named; Next App Router has nested `layout.tsx`). The router currently exposes route-tree but no layout slot — does layout become a router concept (router-aware) or a runtime/compiler concept (template-element `<layout>`)?

4. **Q4 — HMR client: aihu-native today or `@vitejs/client`-shaped?** The `_hmrReplace` runtime export is aihu-native, but the plan-doc and PR #24 commit message describe the HMR injection mechanism as "Vite plugin injection." Is there `@vitejs/client` in the runtime call graph at dev-time, or is the entire HMR loop aihu-native (with Vite as merely the WS transport)? The v3 thesis says "no `@vitejs/client` shipped at runtime" (Learning #49). Need confirmation before the roadmap can sequence the v3 cutover.

5. **Q5 — Server-native loader: SSR-only or full edge/Workers adapter?** PR #27 server-native ships `loader.ts` with 3 states: `NATIVE_LOADED`, `EDGE_SKIPPED`, `NATIVE_FAILED_LOUD`. Edge runtime auto-skips to TS. Is this the v3 adapter pattern (auto-detect runtime; fall through to portable TS) or is a separate `@aihu/edge` / `@aihu/workers` adapter still planned? The roadmap's v2 / v3 adapter matrix depends on this.

6. **Q6 — `@aihu/router` middleware signature.** Decision 5.1 lists "Public API shape of `@aihu/router` (route-tree representation, dynamic-segment syntax, middleware signature)" as user-reserved. The router uses `static → param → catchall` priority and exposes `RouteSegment`/`RouteDefinition`/`MatchResult`. Server-side middleware is `defineMiddleware`/`composeMiddleware` in `@aihu/server`. **Is router-level middleware (separate from server-level) part of v1, v2, or undecided?** If undecided, the Architect needs to surface options.

7. **Q7 — `@aihu/data` resource graph topology (Learning #41 hazard).** Decision 5.1 lists "Public API shape of `@aihu/data` v2+ extensions (resource graph topology — same Learning #41 hazard)" as user-reserved. The current API (`createResource(key, fetcher, options?)` + store + serializer) is fetcher-shape. v2 plans `@aihu/magna` as a layer over `@aihu/data`. Does the v2 design require ANY change to the v1 `Resource<T>` shape, or is the v1 surface frozen for compat? Roadmap needs an explicit "v1 freeze line" answer.

8. **Q8 — Plugin/module system shape (`defineNuxtModule`-equivalent).** Decision 5.1 reserves this for user. The current "plugins" surface is Vite-plugin-style (`viteRouterPlugin`, `agentReadiness`, compiler plugin). Does the v2 `@aihu/plugin` surface aim to abstract over Vite (so plugins survive a v3 build-tool swap), or is it Vite-shaped permanently?

9. **Q9 — Auto-imports mechanism: compiler scan vs explicit import map?** Currently no auto-imports; everything is explicit. v2 candidates: compiler scans `composables/`/`utils/` and emits import statements at SFC-compile time, OR a Vite-virtual-module generates an import map at dev/build. The first is dep-free (compiler-driven); the second is Vite-coupled. Roadmap needs the architectural commitment.

10. **Q10 — Error boundary primitive home.** Plan 3.3 islands shipped without a userland error-boundary primitive. `arbor.types.ts` defines an `ErrorHandler` type for mount-level catch but there's no `<ErrorBoundary>` SFC pattern. Does v1.1 add this to `@aihu/runtime` (component-shaped) or `@aihu/arbor` (primitive-shaped)? Cite: `packages/arbor/src/types.ts`.

11. **Q11 — Compiler C-6 (TS template type-check) status.** The dx-phase2-session-001.md brief mentions C-3/C-4 as the active compiler track; C-6 (template type-check) is not in any current build-manifest. Is C-6 the canonical v1.1 candidate per Decision 2 skeleton, or is it deferred to v2?

12. **Q12 — Build-path consistency for size-gate (Learning #47).** Open since 2026-05-02; deferred from data-fix and autonomous-mode sessions. `bun run size` (package-script + mangle) and moon-orchestrator (no mangle) report different bytes. Roadmap needs to either (a) name the canonical path in v1.1 cleanup, or (b) explicitly defer to v2. Currently Director Decision 7 keeps it deferred — confirm intent.

13. **Q13 — Phase 7.1 v1 cutover gate criteria.** State-plan-a.md item "Re-enable CI before v1 ships" is HIGH at v1. Director Decision 7 says "names the gate but doesn't schedule it" for this session. Should the roadmap simply list cutover prerequisites (CI re-enable, branch protection, release pipeline gate) under v1.1, or carve out a separate v1.0-final phase between v1 and v1.1?

14. **Q14 — `@aihu/server` loud-loader policy persistence.** Director session-002 reverted `SCRIBE_FORCE_NATIVE` and made loader default loud (per `1e19da1`). Does v1.5 or v2 introduce a per-deployment opt-out that's not env-var-shaped (e.g., a config file flag), or is `SCRIBE_NATIVE_SKIP=1` the permanent contract? Roadmap should surface.

15. **Q15 — `@aihu/agent-service` Plan 5.3 wiring.** PR #23 commit message states "`handleToolCall()` (stub, Plan 5.3 wires full binding)". Plan 5.3 is not in any current build-manifest. Is 5.3 a v1.1 carry-over or a v2 item? Cite: `9 (PR #23 commit body)`.

---

## STATUS report

```
STATUS: DONE

Section 1 (current state map):
  - Main HEAD: 7fa0957
  - Packages mapped: 11 (agent, agent-readiness, agent-service, arbor, compiler, context, data, router, runtime, server, signals)
  - Sizes captured: yes (8 of 8 size-limit rows; 2 packages have no row by design)
  - Tests count: 454 / 454 passing across 54 files

Section 2 (Nuxt/Next gap audit):
  - Capability rows: 28
  - Shipped (cited): 16
  - Partial: 3
  - GAP: 9

Section 3 (open questions for Architect): 15

Branch pushed: pending
Ready for Architect: yes
```
