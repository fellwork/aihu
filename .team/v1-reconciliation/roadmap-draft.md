# aihu v1+ Framework Roadmap (DRAFT)

**Date:** 2026-05-02
**Author:** Architect (Round 2)
**Status:** DRAFT — pending Director adjudication (Round 3)
**Constraints:** Selective lean (Vite is dev/build-only); v3 dep-free thesis (Learning #49); 3.46 kB browser-bundle ceiling
**Companion:** `assets-package-design-stub.md`

---

## TL;DR

v1 is effectively shipped on `main = 7fa0957`: 11 packages, 454/454 tests, Nuxt/Next-equivalent SSR + hydration + islands + scoped styles + slots + router + server-native + agent surface. Three small carry-overs (arbor 15 B regression, compiler C-6 TS template type-check, agent-service Plan 5.3, build-path canonicalisation per Learning #47, server/agent-readiness size-budget policy) plus the v1 cutover gate (CI re-enable + branch protection + release pipeline) collect into **v1.0-final**. **v1.5** adds the asset pipeline (`@aihu/image`/`@aihu/fonts`/`@aihu/css-pipeline`; companion stub). **v2** brings framework-reach parity (layouts, middleware, plugin/module system, auto-imports, i18n, SSG, devtools, `@aihu/magna`, error boundaries, deploy adapters). **v3** is the dep-free cutover audit. Q4 HMR audit: **aihu-native at runtime, Vite is dev-only WS transport (PASS — no `@vitejs/client` shipped to production).**

---

## v1 — Current state (already shipped on `main = 7fa0957`)

Per Scout Section A. All 8 v1 PRs merged + arbor externalisation fix.

| Package | Size | Limit | Headroom | Cite |
|---|---|---|---|---|
| `@aihu/context` | 249 B | 300 B | +51 B | v1, `2222a39` era |
| `@aihu/signals` | 1.81 kB | 1970 B | +120 B | v0 (frozen) |
| `@aihu/arbor` | 2.16 kB | 2200 B | **−15 B OVER** | v1; see Q1 below |
| `@aihu/runtime` | 1.14 kB | 1170 B | +7 B | v1 |
| `@aihu/agent` | 117 B | 200 B | +83 B | v0 (frozen) |
| `@aihu/data` | 711 B | 750 B | +39 B | v1 |
| `@aihu/router` | 1.45 kB | 1536 B | +50 B | v1, PR #21 |
| `@aihu/agent-service` | 580 B | 600 B | +20 B | v1, PR #23 |
| `@aihu/server` | (no row) | n/a | n/a | v1, PR #27 — see Q2 |
| `@aihu/agent-readiness` | (no row) | n/a | n/a | v0+v1 — see Q2 |
| `@aihu/compiler` | (Rust) | n/a | n/a | Phase 1 shipped, C-3/C-4 active |

**v1 freeze line (frozen for v1; do not re-open without explicit user authority):**
- v0 size budgets: signals 1970 B / arbor 2200 B / runtime 1024 B / agent 200 B / data 750 B / context 300 B (per Director Decision 7).
- `@aihu/data` `Resource<T>` / `ResourceHandle<T>` / `ResourceOptions<T>` shape (`packages/data/src/types.ts`) — frozen for v1 wire compatibility; v2 `@aihu/magna` layers ON TOP without changing v1 surface (see Q7).
- `@aihu/signals` public surface (frozen since v0 close).
- Architecture invariants: §11 layering (browser packages MUST NOT import `@aihu/server` or `@aihu/agent-readiness`); Tier-3 hooks (Learning #16); `untrack` re-entrancy contract (Learning #46).

**Runtime dep envelope at v1:** `@aihu/*` only across all packages. Zero non-`@aihu/*` runtime deps confirmed by Scout §2.1. `@aihu/server` carries `optionalDependencies` to four `@aihu/server-{platform}` native addons (still under the `@aihu/*` namespace). PASS for Learning #49 thesis at runtime.

---

## v1.0-final — Cutover gate (Q13)

Names the gate; does not schedule. All items below are required for v1 cutover; sequencing is a separate session.

### v1.0-final.1 — `@aihu/arbor` 15 B regression cleanup (Q1)
- **Scope:** Re-run Compressor pass to recover ≥15 B + ≥30 B safety margin OR raise limit to 2240 B with Learning #42 split rationale (feature-bytes vs accepted-debt).
- **Package:** `@aihu/arbor`
- **Runtime deps:** `@aihu/signals` (no change)
- **Acceptance:** `bun run size` green; arbor row carries either ≥30 B headroom or a Learning #42 split annotation in `.size-limit.json`
- **Director adjudicates:** which option (recover vs raise). Default recommendation: **recover** (preserves 2.2 kB ceiling per state-plan-a.md item 7.1).

### v1.0-final.2 — Compiler C-6 (TS template type-check) (Q11)
- **Scope:** Compiler emits typed bindings for template expressions; `tsc --noEmit` catches `{{ ctx.foo.bar }}` typos before runtime.
- **Package:** `@aihu/compiler` (Rust; emits TS)
- **Runtime deps:** none (build-time only)
- **Acceptance:** Snapshot tests in `packages/compiler/tests/codegen.rs` cover typed bindings; example `.aihu` SFC with bad ref fails `bun run typecheck`.
- **Cite:** `dx-phase2-session-001.md` TODOs.

### v1.0-final.3 — Build-path canonical (Q12 / Learning #47)
- **Scope:** Name `bun run size` (package-script with mangle) as the canonical size-gate path. Update `bench/signals/HARNESS.md`, `.size-limit.json` README/comment, and `state-plan-a.md` "Durable references" to cite the canonical path. The moon-orchestrator path may still exist for benches but is non-canonical for size.
- **Package:** repo-level (no package code change)
- **Runtime deps:** none
- **Acceptance:** Single canonical command documented in README and HARNESS.md; CI uses it.

### v1.0-final.4 — Size-budget row policy (Q2)
- **Scope:** Document explicitly that server-side packages (`@aihu/server`, `@aihu/agent-readiness`) carry no `.size-limit.json` row by design — they are budgeted by SSR-bytes-served, not browser-bundle bytes. Add a CI lint/check that flags any package importing browser-eligible code (i.e., importable from `.aihu` SFCs or `defineComponent`) without a size-limit row, to catch future drift.
- **Package:** repo-level (`HARNESS.md` + `.size-limit.json` + new CI check)
- **Runtime deps:** none
- **Acceptance:** HARNESS.md §"Size budgets" section names the policy; CI fails if a browser-eligible package adds a `src/index.ts` export without a row.

### v1.0-final.5 — `@aihu/agent-service` Plan 5.3 wiring (Q15)
- **Scope:** Wire `handleToolCall()` to actually dispatch to registered agents (currently a stub per PR #23 commit body). Carries the MCP request/response contract end-to-end.
- **Package:** `@aihu/agent-service` (+ `@aihu/agent` for registry binding)
- **Runtime deps:** `@aihu/agent` (no change)
- **Acceptance:** Integration test calls `handleToolCall()` with a real MCP request and gets back a tool-shaped response sourced from the agent registry.
- **Size budget:** ≤ 600 B (current limit; ≤ 50 B headroom for the wiring).

### v1.0-final.6 — Cutover plumbing (Q13)
- **Scope:** Re-enable CI on `main`; configure GitHub branch protection for `main` (require checks: `bun run test`, `bun run typecheck`, `bun run size`); document release pipeline (npm publish gate, version-bump policy, changeset format).
- **Package:** repo-level (`.github/workflows/`, `BRANCH_PROTECTION.md` or similar)
- **Runtime deps:** none
- **Acceptance:** `main` shows green CI badge; branch protection enforced; one dry-run publish completes without manual override.
- **Note:** Per Director Decision 7, this section *names* the gate; *scheduling* the cutover is a follow-up session decision.

### v1.0-final.7 — HMR client confirmation (Q4 audit result)
- **Audit result:** **PASS — aihu-native.** Confirmed by source read on `7fa0957`:
  - `@aihu/runtime` exports `_hmrReplace` (~100 B; in `define-component.ts:256`); this is the entire aihu-side HMR mechanism.
  - Compiler emits `if (__DEV__ && import.meta.hot) { import.meta.hot.accept((newModule) => { ... _hmrReplace(...) }) }` blocks (per `packages/compiler/tests/defer-with-hmr.test.ts`).
  - In production builds, `__DEV__` is rolldown-defined to `false` and the entire block is dead-code-eliminated. **No `@vitejs/client` is imported by any `@aihu/*` runtime package.** `import.meta.hot` is the API surface; the *client* that fulfills it (Vite's `@vitejs/client`) is provided by Vite at dev-time only.
  - `grep -r '@vitejs/client'` across the repo: zero hits in source (only one in `scout-report.md` referencing Q4).
- **Roadmap impact:** No v3 cutover work needed for HMR. Document in v3 audit (§v3.2) that the HMR loop is already aihu-native; Vite stays as the dev-only WS transport per Director's "selective lean" framing.

---

## v1.1 — Small carry-overs (post-cutover)

Items that aren't strictly cutover-gating but should land before v1.5 starts.

### v1.1.1 — Error boundary primitive (Q10 — Director adjudicates home)
- **Scope:** Userland error-boundary primitive. Catches errors thrown in `setup()` / template-effect / event handlers and renders a fallback subtree.
- **Package:** `@aihu/runtime` (option A — component-shaped) OR `@aihu/arbor` (option B — primitive-shaped). See "Director adjudication" below.
- **Runtime deps:** `@aihu/arbor`, `@aihu/signals` (existing peer deps)
- **Size budget:** ≤ 80 B (option A in runtime) or ≤ 150 B (option B in arbor with `errorBoundary()` primitive — arbor must absorb the 15 B regression cleanup first per v1.0-final.1)

### v1.1.2 — `@aihu/server` loud-loader policy doc (Q14)
- **Scope:** Document `SCRIBE_NATIVE_SKIP=1` as the **permanent v1+v2 contract** for the loud-loader escape hatch. No config-file flag in v1/v2; `defineAihuConfig` may add a flag in v2 if user requests, but the env-var is canonical.
- **Package:** `@aihu/server` (doc only; no code change)
- **Runtime deps:** none

### v1.1.3 — Agent-readiness `getAllAgentMetadata()` polish
- **Scope:** Match Scout's "agent-readiness `getAllAgentMetadata()` polish" item from director-note Decision 6.
- **Package:** `@aihu/agent-readiness`, `@aihu/agent`
- **Runtime deps:** `@aihu/agent`, `@aihu/server` (no change)

### v1.1.4 — Doc/example completion
- **Scope:** Examples directory for v1 surface (router, server, agent-service, hydration, islands). One end-to-end `.aihu` example per major feature.
- **Package:** repo-level (`examples/`)
- **Runtime deps:** none (consumer code)

---

## v1.5 — Asset pipeline + DX hardening

Companion: **`assets-package-design-stub.md`** (full design deferred per Director Decision 7).

### v1.5.1 — `@aihu/image` (companion stub)
- **Goal:** Build-time Sharp wrapper + `<aihu-image>` SFC component.
- **Runtime deps:** `@aihu/runtime`, `@aihu/arbor`. **Sharp is build-time only** (compiler-orchestrated).
- **Justification for Sharp:** image processing is a build-time pipeline; runtime serves pre-optimised bytes. Sharp never enters the runtime call graph. Per Learning #49, build-time deps are allowed.

### v1.5.2 — `@aihu/fonts` (companion stub)
- **Goal:** Build-time font subsetting + preload directive emission + `@font-face` codegen.
- **Runtime deps:** none (emits CSS only). **fontkit is build-time only.**

### v1.5.3 — `@aihu/css-pipeline` (companion stub)
- **Goal:** PostCSS/Tailwind orchestration via the compiler. Critical CSS extraction at SSR time.
- **Runtime deps:** **none** at runtime. May be compiler-internal (not a separately published package); v1.5 design session decides.
- **PostCSS is build-time only.**

### v1.5.4 — DX hardening (non-assets)
- **Scope:** Devtools v1 (read-only telemetry inspector consuming Tier-3 hooks already paid for in v0 per Learning #16). Plugin-system v0 prototype if Q8 settles toward "abstract `@aihu/plugin`".
- **Package:** new `@aihu/devtools` package
- **Runtime deps:** `@aihu/runtime`, `@aihu/arbor`, `@aihu/signals` (consumes existing telemetry; no new runtime deps)
- **Size budget:** TBD at design session.

---

## v2 — Framework-reach extensions

Each item below requires a Director-or-user adjudication step before scope can land (see "Director adjudication needed" §). This section lists them in scope-only form.

### v2.1 — Layouts (Q3 user-reserved)
- Three options for shape (file-based / component-composition / hybrid) below.
- **Runtime deps target:** `@aihu/router`, `@aihu/runtime`, `@aihu/arbor` (no new deps).

### v2.2 — Router-level middleware (Q6 user-reserved)
- Two options below (router-level vs server-only).
- **Runtime deps target:** `@aihu/router` only.

### v2.3 — Plugin/module system (Q8 user-reserved)
- Two options below (Vite-shaped permanently vs abstract `@aihu/plugin`).
- **Runtime deps target:** none at runtime — plugin registration is build/dev-time.

### v2.4 — Auto-imports (Q9 user-reserved; Architect recommends compiler-driven)
- Two options below (compiler-scan vs Vite-virtual-module).
- **Runtime deps target:** none. **Recommend compiler-driven for v3 dep-free compliance.**

### v2.5 — `@aihu/magna` package (Director Decision 4 ratified)
- **Scope:** Layer over `@aihu/data`. Hand-rolled `gql\`...\`` template literal (string interpolation only — no AST parse). Raw `fetch` + `JSON.parse`. ≤ 300 B gz target.
- **Package:** new `@aihu/magna`
- **Runtime deps:** `@aihu/data`, `@aihu/signals` ONLY. No Apollo, urql, graphql-js, graphql-request.
- **Justification:** magna is the canonical backend (Learning #17); we control both ends, so we don't need full GraphQL spec compliance.
- **Size budget:** ≤ 300 B gz.

### v2.6 — Error boundary v2
- If v1.1.1 lands as a primitive, v2 adds the component sugar (or vice versa). Surface area extension.

### v2.7 — i18n
- **Package:** new `@aihu/i18n`
- **Runtime deps:** `@aihu/signals`, `@aihu/context` ONLY. No `intl-messageformat`, no `i18next`. Hand-rolled ICU subset (plural + select; ≤ 400 B gz target).
- **Build-time:** message extraction via compiler.

### v2.8 — SSG (separate from streaming SSR)
- **Package:** `@aihu/server` (extension; reuses `renderToString` loader path)
- **Runtime deps:** unchanged.
- **Build-time:** new `bun run generate` orchestrator that walks the route tree and writes static HTML.

### v2.9 — Devtools v2
- Extends v1.5.4 with mutation timeline, selectable signal/effect graphs, perf profiling.
- **Runtime deps:** `@aihu/runtime`, `@aihu/arbor`, `@aihu/signals`, `@aihu/devtools` (no change).

### v2.10 — Route handlers (non-page)
- Already partially shipped via `defineApiRoute` in `@aihu/server`. v2 fills gaps (websocket upgrades, streaming responses, `Server-Sent Events`).
- **Runtime deps:** `@aihu/server` (no change).

### v2.11 — Environment-variable contract
- **Scope:** Names `defineAihuConfig` env-var contract: `process.env.SCRIBE_*` namespace; `import.meta.env.SCRIBE_PUBLIC_*` for browser-exposed vars (via compiler replacement at build-time).
- **Package:** `@aihu/server` (config) + compiler (replacement step)
- **Runtime deps:** none (build-time replacement).

### v2.12 — Deploy adapters (Q5 — see audit below)
- **Audit result for Q5:** The current `loader.ts` 3-state pattern (`NATIVE_LOADED` / `EDGE_SKIPPED` / `NATIVE_FAILED_LOUD`) **is** the v1 adapter pattern: auto-detect runtime, fall through to portable TS on edge/Workers. **Recommendation: this is sufficient for v1 and v2; no separate `@aihu/edge`/`@aihu/workers` package is required.** v2 may add a `@aihu/server-deploy` companion package for platform-specific build artifacts (Cloudflare Workers wrangler config, Vercel Edge config, Fly machine spec) — *build artifacts only*, no runtime code. See Director adjudication.

---

## v3 — Dependency-free cutover

The audit pass. Per Learning #49, by v3 every shipped package's `npm ls --production` shows **only `@aihu/*`**.

### v3.1 — Final dep-free audit
- **Scope:** Snapshot every package's `dependencies` + `peerDependencies` + `optionalDependencies`. Aihu is **already substantially compliant at v1** (Scout §2.1 confirms). v3 verifies no drift accumulated through v1.5/v2.
- **Acceptance:** CI gate that runs `npm ls --production` per package and fails on any non-`@aihu/*` entry.

### v3.2 — HMR aihu-native confirmation (Q4 follow-through)
- **Status:** Already PASS per v1.0-final.7 audit. v3 simply re-runs the grep gate as part of CI.
- **CI gate:** `grep -r '@vitejs/client' packages/*/src/` returns zero hits.

### v3.3 — Cross-runtime adapter completeness
- **Scope:** Confirm `@aihu/server` runs across Bun, Deno, Node, Cloudflare Workers, Vercel Edge with the existing 3-state loader. Add parity tests for each runtime (extends current `native-parity.test.ts`).
- **Runtime deps:** unchanged.
- **Acceptance:** Parity matrix in CI.

### v3.4 — Build-tool independence
- **Scope:** Verify the compiler emits code that runs WITHOUT Vite (e.g., consumed via raw `tsc` + a static file server). If Q8 settles toward "abstract `@aihu/plugin`", this is the v3 acceptance gate for that abstraction.
- **Acceptance:** A non-Vite example builds and runs end-to-end (node-only or Bun-only loader).

---

## Per-version dep envelope (Learning #49 hard constraint)

| Package | v1 (current) | v1.5 | v2 | v3 (target) | Sunset notes |
|---|---|---|---|---|---|
| `@aihu/signals` | zero | zero | zero | zero | clean |
| `@aihu/arbor` | `@aihu/signals` | unchanged | unchanged | unchanged | clean |
| `@aihu/runtime` | peer: `@aihu/arbor`, `@aihu/signals` | unchanged | unchanged | unchanged | clean |
| `@aihu/context` | zero | unchanged | unchanged | unchanged | clean |
| `@aihu/agent` | zero | unchanged | unchanged | unchanged | clean |
| `@aihu/data` | `@aihu/signals`, `@aihu/context` | unchanged | unchanged | unchanged | clean |
| `@aihu/router` | `@aihu/server` | unchanged | unchanged | unchanged | hand-rolled matcher already (no `path-to-regexp`) |
| `@aihu/server` | `@aihu/agent` + `optionalDependencies: @aihu/server-{platform}` | unchanged | + env-var contract | unchanged | clean (native addons stay under `@aihu/*`) |
| `@aihu/agent-service` | `@aihu/agent` | unchanged | unchanged | unchanged | clean |
| `@aihu/agent-readiness` | `@aihu/server`, `@aihu/agent` | unchanged | unchanged | unchanged | clean |
| `@aihu/compiler` | peer: `vite ≥5` (optional) | unchanged | unchanged | **peer becomes optional-only or removed** | Q8 outcome decides |
| `@aihu/image` (NEW v1.5) | n/a | `@aihu/runtime`, `@aihu/arbor`; **build-only:** Sharp | unchanged | unchanged | Sharp build-only; no runtime sunset needed |
| `@aihu/fonts` (NEW v1.5) | n/a | none at runtime; **build-only:** fontkit | unchanged | unchanged | fontkit build-only |
| `@aihu/css-pipeline` (NEW v1.5) | n/a | none at runtime; **build-only:** postcss | unchanged | unchanged | postcss build-only |
| `@aihu/devtools` (NEW v1.5) | n/a | `@aihu/runtime`, `@aihu/arbor`, `@aihu/signals` | unchanged | unchanged | clean |
| `@aihu/magna` (NEW v2) | n/a | n/a | `@aihu/data`, `@aihu/signals` | unchanged | clean (hand-rolled gql) |
| `@aihu/i18n` (NEW v2) | n/a | n/a | `@aihu/signals`, `@aihu/context` | unchanged | clean (hand-rolled ICU subset) |
| `@aihu/plugin` (NEW v2 if Q8 = abstract) | n/a | n/a | none at runtime | unchanged | build/dev-time only |

**No package carries any non-`@aihu/*` runtime dep at any version.** All non-`@aihu/*` deps are build-time / dev-time / peer-optional. No sunset dates required because no runtime drift exists today (per Scout §2.1) and the roadmap forbids introducing any.

---

## Layout decisions (Q3 surfaced — user picks)

The router exposes a route tree but no layout slot. Three options:

### Option A — File-based (Nuxt-style)
- Convention: `layouts/default.aihu`, `layouts/admin.aihu`. Pages declare `<page layout="admin">` via SFC frontmatter or `<agent>` block.
- **Pros:** zero-config for the common case; easy to grok; matches Nuxt mental model.
- **Cons:** less explicit; "where does this layout come from?" requires convention knowledge.
- **Implementation:** compiler scans `layouts/`, emits `virtual:aihu-layouts`, router resolves layout-then-page during match.

### Option B — Component-composition (React/Solid-style)
- Layouts are just `defineComponent({ slots: ['default'] })` components; pages import them and wrap manually.
- **Pros:** maximally explicit; no compiler magic; uses existing slot primitive (PR #20).
- **Cons:** boilerplate; nested layouts require manual wiring; no automatic shared-state handoff between siblings.

### Option C — Hybrid (Next App Router-style)
- File-based at the route tree level (`pages/admin/_layout.aihu`); component-composition available within for ad-hoc nesting.
- **Pros:** captures both ergonomics; nested layouts work via colocation.
- **Cons:** two mental models to maintain; compiler complexity higher.

**Architect recommendation:** **Option C (hybrid)** — the file convention covers 80 % of layouts ergonomically, the component escape hatch handles the long tail, and Q3 surface to user can pick. **User picks.**

---

## Director adjudication needed

Per Director Decision 5.1 (user-reserved). Each item below requires explicit user choice before Round 4 (Builder doc-migrate) can land.

### Q3 — Layout shape
See "Layout decisions" §above. Three options (A / B / C). Architect recommends **C (hybrid)**. User picks.

### Q4 — HMR client status
**No adjudication needed.** Audit result: **PASS — aihu-native.** No `@vitejs/client` shipped at runtime. Documented as v1.0-final.7 above. ✓

### Q5 — Server adapter pattern
Audit result: the existing `loader.ts` 3-state pattern **is** the adapter. **Architect recommends:** keep this pattern; do not spin out separate `@aihu/edge` or `@aihu/workers` packages. v2 may add a `@aihu/server-deploy` *build artifact only* companion (wrangler config, edge config, fly machine spec) without runtime code. Two options:
1. **Keep loader.ts as the only adapter** (Architect-recommended).
2. **Spin out `@aihu/edge` / `@aihu/workers` packages** for platform-specific build glue.

User picks.

### Q6 — Router middleware shape
Two options:
1. **Router-level middleware** (in `@aihu/router`): runs on the route-match path; `defineRouterMiddleware((ctx, next) => {...})`; runs both client-side (during navigation) and server-side (during route match).
2. **Server-only middleware** (current state): middleware lives in `@aihu/server` (`defineMiddleware`/`composeMiddleware`); runs only on the server during request handling.

Tradeoffs:
- Option 1 enables client-side navigation guards (auth redirects, loading states) in the same shape as server middleware. Cost: middleware must be isomorphic; runtime size ↑ in `@aihu/router`.
- Option 2 keeps middleware purely server-side. Cost: client-side navigation guards have to be re-invented per app.

User picks. Architect-leaning: **Option 1** for parity with Nuxt server-and-client middleware, but it's load-bearing for the v3 runtime envelope so user must adjudicate.

### Q7 — Data graph topology v1 freeze line
Audit result: `Resource<T>` / `ResourceHandle<T>` / `ResourceOptions<T>` (`packages/data/src/types.ts`) **are frozen for v1**. v2 `@aihu/magna` integration layers on top via the existing `fetcher: (key) => Promise<T>` shape — magna users write `fetcher: (key) => fetch('/graphql', { body: gqlString }).then(r => r.json())`. No v1 surface change required.

**Director adjudication:** ratify the freeze line as documented above OR signal that v2 magna integration may extend `Resource<T>` (e.g., add a `streaming` adapter hook for GraphQL subscriptions). Architect-leaning: ratify freeze; v2 magna lives entirely in its own package.

### Q8 — Plugin/module system shape
Two options:
1. **Vite-shaped permanently** (current state): plugins are Vite plugins; `viteRouterPlugin`, `agentReadiness`, compiler are all Vite-shaped.
2. **Abstract `@aihu/plugin`**: a plugin surface that survives a v3 build-tool swap. Vite plugins become a thin adapter; the same plugin API works under raw rolldown / esbuild / Bun's bundler.

Tradeoffs:
- Option 1: minimum effort; matches current state; lock-in to Vite at build-time.
- Option 2: future-proofs the v3 dep-free thesis at the build-tool layer; ~200-400 B in compiler/build-tooling code; preserves the "selective lean" framing.

**User picks.** Architect-leaning: **Option 2** — aligns with v3 thesis; "Vite is dev/build-only" is easier to honor when there's an abstraction layer.

### Q9 — Auto-imports mechanism
Two options:
1. **Compiler-driven** (Architect-recommended): compiler scans `composables/`, `utils/`, `components/`; emits `import { foo } from '~/composables/foo.ts'` statements at SFC-compile time. **Dep-free; build-tool-independent.**
2. **Vite-virtual-module**: Vite emits a virtual import map (`virtual:aihu-imports`) at dev/build. **Vite-coupled; lighter compiler.**

**User picks.** Architect-leaning: **Option 1 — compiler-driven.** Per Learning #49 (v3 dep-free thesis), the compiler is ours; Vite is build-tool-of-the-day. A compiler-driven implementation survives the v3 build-tool swap (Q8).

### Q10 — Error boundary home
Two options:
1. **`@aihu/runtime` component** (`<ErrorBoundary fallback={...}>...</ErrorBoundary>` SFC pattern): familiar shape; ~80 B in runtime; consumes `@aihu/arbor`'s existing `ErrorHandler` mount-level catch.
2. **`@aihu/arbor` primitive** (`errorBoundary(handler, child)`): primitive-shaped like `branch`/`leaf`/`when`/`each`; ~150 B in arbor; requires arbor's 15 B regression cleanup first (v1.0-final.1).

Tradeoffs:
- Option 1: cheaper bytes; matches the "component" mental model from Nuxt/Next.
- Option 2: lower-level; composes with `slot()`/`when()` in arbitrary patterns; primitive consistency.

**User picks.** Architect-leaning: **Option 1 — runtime component**. Cheaper, matches what Nuxt/Next users expect, and `@aihu/arbor` is at the size ceiling.

---

## Out of scope (Director Decision 7)

Items deferred indefinitely or to follow-up sessions. Do not pull into this roadmap without explicit Director re-authorisation:

1. **Implementation of any v1 framework feature** — moot; all v1 PRs merged.
2. **`@aihu/assets` full design** — companion stub only; full design is a follow-up v1.5 design session.
3. **`@aihu/magna` GraphQL feature subset** (subscriptions, persisted queries, schema federation, etc.) — v2 design session.
4. **Build-path consistency** — partially resolved as v1.0-final.3 (canonical name set); deeper refactor of the moon-orchestrator path is post-v3.
5. **arbor Compressor work beyond the 15 B regression** (v1.0-final.1) — gate is green; no further perf work in this roadmap.
6. **Re-opening any v0 size budget** — signals 1970 B / arbor 2200 B / runtime 1024 B / agent 200 B / data 750 B / context 300 B remain locked. New features → new packages.
7. **GHA re-enablement scheduling** — v1.0-final.6 names the gate; *when* to flip it is a separate cutover-session decision.
8. **v1 test coverage gap audit** — not enumerated here; if Scout finds gaps in a follow-up, v1.1 absorbs them.
9. **Native mobile output / non-web targets** — not in any v1/v2/v3 scope.
10. **vue-tsc-style full template type-check** — v1.0-final.2 (compiler C-6) is the in-scope minimum; richer flows are out.
11. **Investigation of any open MEDIUM items from `state-plan-a.md`** — Track-B / Round N+4 territory.

---

## Iteration tracking

- R1 (Scout): DONE — `scout-report.md`
- R2 (Architect): **DONE** — this doc + `assets-package-design-stub.md`
- R3 (Director re-engage): pending
- R4 (Builder doc migrate): conditional on Decision 1 (RATIFIED: MIGRATE)
- R5 (Historian): pending

**Token spend (Architect, this doc):** ~7 K (well under 50 K budget).
