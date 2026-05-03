# scribe

A JavaScript/TypeScript meta-framework for building Web Components with runtime-first reactivity. Authored as `.scribe` single-file components, compiled to vanilla custom elements, mounted with sub-2 kB reactive primitives.

> **Status:** v1 shipped — all 17 plans complete (2026-05-03). Core packages stable (signals · arbor · runtime · agent · server · agent-readiness · context · data · agent-service · agent-a2a · agent-acp · router · cli · compiler · plugin). 607 TS tests + 222 Rust tests passing.

[![CI](https://github.com/fellwork/scribe/actions/workflows/plan-a.yml/badge.svg)](https://github.com/fellwork/scribe/actions/workflows/plan-a.yml)
[![tests](https://img.shields.io/badge/tests-607%20TS%20%7C%20222%20Rust%20passing-brightgreen)](#)
[![packages](https://img.shields.io/badge/packages-15-blue)](#packages)
[![llms.txt](https://img.shields.io/badge/llms.txt-supported-blueviolet)](#compliance)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue?logo=anthropic)](#compliance)
[![Agent Ready](https://img.shields.io/badge/agent--ready-yes-brightgreen)](#compliance)

> **CI note:** Auto-triggers (push / PR) are now enabled on main following v1 cutover. Local gates (typecheck · test · build · size · bench) continue to run on every Builder dispatch and are validated by the Verifier.

---

## What it is

Scribe sits at the intersection of three things:

1. **A reactive core** ([`@scribe/signals`](./packages/signals)) — push-based signals, computeds, effects, batched writes. Beats alien-signals on cellx, batched-writes, dynamic-deps, and creation-1to1000. Ships in ≤ 1.7 kB gzipped.
2. **A DOM layer** ([`@scribe/arbor`](./packages/arbor)) — `branch`/`leaf`/`mount` primitives that materialize a tree synchronously into an `Element` or `ShadowRoot` and tear it down LIFO. The compiler emits direct calls into these primitives — no JSX runtime tax, no virtual DOM. **122× faster than vanilla DOM** on targeted reactive updates (`nodeValue` vs `textContent`).
3. **A Rust compiler** — a Rust toolchain that reads `.scribe` SFC files (template + setup script) and emits a `class extends HTMLElement` calling `mount(buildTree(), this.shadowRoot)`. The `defineComponent` helper produces the same shape for hand-authored components. Shipped at v1.

The output is **vanilla custom elements**: no framework lock-in at the consumer boundary, no global context, no hydration step.

## Why "meta-framework"?

It's a framework you author *with*, not a framework you embed *into*. The pieces are layered so each layer is usable on its own:

- `@scribe/signals` works as a standalone reactive primitives library.
- `@scribe/arbor` works as a standalone DOM-mounting layer — pair it with any reactive system that exposes a `[get, set]` shape.
- The compiler + runtime layers stack on top, but don't lock the lower layers into a particular consumer.

Compare to: Solid (single-package), Lit (templating + base class only), Vue (proxy-based, ships its own scheduler). Scribe is *meta* in the sense of separable layers stacked into a meta-framework, not in the Next.js / Nuxt sense.

## v1 Feature Status

All 17 v1 plans shipped on 2026-05-03:

| Phase | Plan | Package | Status |
|-------|------|---------|--------|
| 1 | 1.1 Reconciler (when/each) | @scribe/arbor | ✓ |
| 1 | 1.2 Component props | @scribe/runtime | ✓ |
| 1 | 1.3 Scoped styles | Compiler C-5 | ✓ |
| 1 | 1.4 Slots | @scribe/arbor | ✓ |
| 2 | 2.1 Context API | @scribe/context | ✓ |
| 2 | 2.2 Data protocol | @scribe/data | ✓ |
| 3 | 3.1 Streaming SSR | @scribe/server | ✓ |
| 3 | 3.2 Full hydration | @scribe/arbor + server | ✓ |
| 3 | 3.3 Islands | @scribe/runtime + Vite | ✓ |
| 4 | 4.1 HMR | @scribe/runtime + Vite | ✓ |
| 4 | 4.2 Error boundaries | @scribe/arbor + runtime | ✓ |
| 4 | 4.3 TS template types (v1) | Compiler | ✓ |
| 5 | 5.1 AgentManifest + `<agent>` | @scribe/agent + Compiler | ✓ |
| 5 | 5.2 AgentService | @scribe/agent-service | ✓ |
| 5 | 5.3 A2A/ACP adapters | @scribe/agent-a2a, @scribe/agent-acp | ✓ |
| 6 | 6.1 File-based routing | @scribe/router | ✓ |
| 6 | 6.2 Signals optimization | @scribe/signals | ✓ |

---

## Project posture

This is a **research codebase**. The phases are sequenced so each layer's design decisions are pinned by a binding spec before code lands; performance regressions block merge; bench receipts are mandatory on every runtime PR. See `.team/phase-3/spec-arbor.md` §0.5 for the full posture statement.

All 17 v1 plans shipped 2026-05-03. Packages are at `1.0.0` as of the v1 cutover (Plan 7.1).

> **Dep-free thesis (v1 contract).** Scribe is dep-free at runtime — every package's `dependencies` list is empty (Learning #49). This is a v1 contract.

---

## Performance

All results from `bench/`. Measured with [mitata](https://github.com/nicolo-ribaudo/mitata) + Bun 1.3.8. p50 latencies shown. Full tables in `bench/signals/RESULTS.md` and `bench/arbor/RESULTS.md`.

### `@scribe/signals` vs. SOTA reactive libraries

*Bun 1.3.8 · mitata 1.0.34 · 2026-04-30*

| Workload | scribe | alien-signals | Δ |
|---|---:|---:|---:|
| `cellx` (5-deep diamond) | **506 ns** | 675 ns | **1.33× faster** |
| `batched-writes-100` | **2.60 µs** | 3.54 µs | **1.36× faster** |
| `dynamic-deps` (rotating fan-in) | **742 ns** | 1.21 µs | **1.63× faster** |
| `creation-1to1000` | **69.3 µs** | 91.1 µs | **1.31× faster** |
| `deep-propagation-100` ⚠️ | 4.00 µs | **2.42 µs** | 1.65× slower |

> **⚠️ Honest loss:** scribe is tuned for shallow-diamond propagation. On 100-deep linear chains, alien-signals is 1.65× faster. This is a documented design-point gap (`.team/learnings.md` #26), targeted for v0+1 signals work.

### `@scribe/arbor` vs. SOTA DOM-binding libraries

*Bun 1.3.8 · JSDOM 25.0.1 · mitata 1.0.34 · 2026-04-30*

| Workload | scribe | best competitor | Δ |
|---|---:|---:|---:|
| `update-1-of-10k-leaves` | **25 ns** | vanilla 3.1 µs | **122× faster** |
| `mount-10k-leaves` | **36.6 ms** | preact 66.4 ms | **1.8× faster** |
| `mount-deep-100x10` | **3.2 ms** | preact 8.9 ms | **2.8× faster** |
| `mount-wide-1000` | **8.2 ms** | preact 10.2 ms | **1.2× faster** |
| `krausest-1k-cycle` | 20.9 ms | preact 19.7 ms | ~near-tie |

> The `update-1-of-10k-leaves` 122× win comes from arbor's `leaf()` binding to `textNode.nodeValue` (direct property set) vs. vanilla's `element.textContent` (child-list walk). This is not a measurement artifact — it reflects the bind-target choice in `materialize.ts`.

> solid-js and @vue/runtime-dom ERROR in all JSDOM workloads (client-only API / `SVGElement` not defined). Browser-native comparison deferred to Round N+2 Playwright runner.

### Bundle size (gz)

**Browser layer** (ships to client — per-package gates enforced by `bun run size`):

| Package | Size | Limit | Headroom |
|---|---:|---:|---:|
| `@scribe/signals` | 1.81 kB | 1970 B | +120 B |
| `@scribe/arbor` | 2.09 kB | 2200 B | +56 B |
| `@scribe/runtime` | 1.14 kB | 1170 B | +3 B |
| `@scribe/context` | 249 B | 300 B | +51 B |
| `@scribe/agent` | 142 B | 200 B | +58 B |
| *(combined, reported diagnostic)* | *~5.43 kB* | *—* | *—* |

> **Per-package rows are the contract; combined is reported, not budgeted.** The pre-v1 "≤ 3.46 kB combined" target was retired at v1 cutover (Plan 7.1) — packages grew to support hydration, islands, error boundaries, and reconciliation. Each row in `.size-limit.json` is the binding gate. See [`.size-limit.README.md`](./.size-limit.README.md).

**Server / agent / build-time layer** (edge runtime or build-only — sized independently):

| Package | Size | Limit | Notes |
|---|---:|---:|---|
| `@scribe/data` | 778 B | 800 B | data protocol — loaders, server calls |
| `@scribe/router` | 818 B | 1536 B | fetch-API router, middleware, route plugins (canonical v1) |
| `@scribe/agent-service` | 580 B | 600 B | agent execution surface |
| `@scribe/agent-acp` | 649 B | 600 B | ACP adapter (currently 49 B over — tracked) |
| `@scribe/agent-a2a` | 805 B | 700 B | A2A adapter (currently 105 B over — tracked) |
| `@scribe/server` | — | — | SSR + edge router (re-exports from `@scribe/router`); v0.7.x alias kept for back-compat |
| `@scribe/agent-readiness` | — | — | `llms.txt`, MCP Server Card, robots, content negotiation, Vite plugin |
| `@scribe/cli` | — | build-only | `npx scribe app`, `npx scribe migrate` |
| `@scribe/compiler` | — | build-only | Rust SFC compiler (`@blockname { }` syntax, macros, route discovery) |
| `@scribe/plugin` | — | build-only | plugin contract types (consumed by `defineScribeConfig.plugins`) |

---

## Layout

See [`packages/`](./packages) for all 15 packages on disk. By tier:

- **Browser runtime (sized, ships to client):** `@scribe/signals`, `@scribe/arbor`, `@scribe/runtime`, `@scribe/context`, `@scribe/agent`.
- **Server / edge / data (sized):** `@scribe/router`, `@scribe/data`, `@scribe/agent-service`, `@scribe/agent-acp`, `@scribe/agent-a2a`. Plus `@scribe/server` (SSR + back-compat router alias) and `@scribe/agent-readiness` (`llms.txt`, MCP Server Card, robots, Vite plugin).
- **Build-time only (not shipped):** `@scribe/compiler` (Rust SFC compiler), `@scribe/cli` (`npx scribe app`, `npx scribe migrate`), `@scribe/plugin` (plugin-contract types).

Other top-level paths: [`bench/signals`](./bench/signals) and [`bench/arbor`](./bench/arbor) (mitata harnesses), `tests/` (cross-package integration), `docs/site/` (12-page guide), `docs/superpowers/` (specs + plans), `.team/` (specs, phase plans, retros, learnings).

## Toolchain

- **Runtime:** [Bun](https://bun.sh) ≥ 1.3.0, Node ≥ 20.18.0. Both required (`engines` enforced).
- **Bundler:** [Rolldown](https://rolldown.rs) — Rust-based, OXC ecosystem.
- **Test:** [Vitest](https://vitest.dev) + jsdom + [fast-check](https://github.com/dubzzz/fast-check) (property tests).
- **Lint/format:** [Biome](https://biomejs.dev).
- **Task runner:** [Moon](https://moonrepo.dev) — `moon run :build`, `moon run :typecheck`.
- **Size budget:** [size-limit](https://github.com/ai/size-limit) gates per-package gzipped bundles.
- **Tool versions:** pinned via [proto](https://moonrepo.dev/proto) (`.prototools`).

## Quickstart

**New project (canonical v1 path)** — scaffold with the CLI:

```bash
npx scribe app my-app   # scaffolds a Hello-World project
cd my-app
bun install
bun run dev
```

The scaffold ships the v1 SFC authoring shape (`@blockname { }` blocks: `@state`, `@template`, `@route`, `@agent`, `@style`) and wires the Vite plugin, agent-readiness routes, and router defaults. See [`docs/site/getting-started.md`](./docs/site/getting-started.md).

To migrate an existing scribe project, run `npx scribe migrate`.

**This repo (workspace dev loop)** — clone and exercise the gates:

```bash
bun install
bun run build      # build all 15 packages
bun run test       # 607 TS tests + 222 Rust tests (unit + integration + compliance)
bun run size       # per-package gzipped bundle gates
bun run check      # biome lint + format
bash scripts/check-boundary.sh   # AC-7: hard boundary (no client imports in server layer)
bash scripts/check-edge-safe.sh  # AC-6: no Node-only globals in dist bundles
bun run test:quality              # Lighthouse gate (≥ 90 on perf/a11y/best-practices/seo)
```

Run the bench suites:

```bash
cd bench/signals && bun src/runner.ts   # signals vs SOTA
cd bench/arbor   && bun src/runner.ts   # arbor vs SOTA (JSDOM)
```

Use the packages directly (all packages are at `1.0.0`):

```ts
import { signal, computed, effect } from '@scribe/signals'
import { branch, leaf, mount } from '@scribe/arbor'
import { defineComponent } from '@scribe/runtime'
import { registerAgentMetadata } from '@scribe/agent'

const [count, setCount] = signal(0)
const tree = branch('div', null, [leaf([count, setCount])])
const scope = mount(tree, document.body)
setCount(1) // DOM updates synchronously via nodeValue
scope.dispose()
```

Edge / server (fetch-API, works on Cloudflare Workers, Deno, Bun) — request-router shape from `@scribe/server`. Two distinct routing APIs ship in scribe: `@scribe/server.createRequestRouter` builds a fetch-API request handler from an explicit route manifest (shown below), while `@scribe/router.createRouter` powers file-based routing via the v1 Vite plugin (`viteRouterPlugin`); see [`docs/site/routing-layouts.md`](./docs/site/routing-layouts.md).

```ts
import { createRequestRouter, defineRoute, json } from '@scribe/server'
import { createAgentReadinessRoutes } from '@scribe/agent-readiness'

const ar = createAgentReadinessRoutes({
  name: 'My App',
  endpoint: 'https://myapp.workers.dev/mcp',
  summary: 'A scribe-powered app.',
})

const router = createRequestRouter({
  routes: [
    defineRoute('/llms.txt', ar.llmsTxt),
    defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
    defineRoute('/robots.txt', ar.robotsTxt),
    defineRoute('/api/hello', () => json({ hello: 'world' })),
  ],
})

// Cloudflare Worker
export default { fetch: router }
// Deno / Bun
// Deno.serve(router)  |  Bun.serve({ fetch: router })
```

## Compliance

The agent-protocol badges are backed by real test gates in `bun run test`.

| Gate | Tests | Status |
|---|---|---|
| `llms.txt` format (llmstxt.org spec) | 9 tests in `packages/agent-readiness/tests/compliance/llms-txt-spec.test.ts` | ✓ passing |
| MCP Server Card schema (SEP-1649) | 14 tests in `packages/agent-readiness/tests/compliance/mcp-server-card-schema.test.ts` | ✓ passing |
| `robots.txt` RFC 9309 | 7 tests in `packages/agent-readiness/tests/compliance/robots-rfc9309.test.ts` | ✓ passing |
| isitagentready.com endpoint checklist | 7 tests in `packages/agent-readiness/tests/compliance/isitagentready.test.ts` | ✓ passing |
| SSR output structural checks | 12 tests in `packages/server/tests/compliance/ssr-output.test.ts` | ✓ passing |
| Lighthouse quality gate (≥ 90 all categories) | `bun run test:quality` via `scripts/lighthouse.ts` | ✓ passing |

Run all compliance checks: `bun run test && bun run test:quality`

---

## Where to read next

- **v1 specs (authoritative):** the four ratified spec quartet docs — [`docs/superpowers/specs/2026-05-02-spec-block-structure.md`](./docs/superpowers/specs/2026-05-02-spec-block-structure.md), [`docs/superpowers/specs/2026-05-02-spec-template-attribute-syntax.md`](./docs/superpowers/specs/2026-05-02-spec-template-attribute-syntax.md), [`docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md`](./docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md), [`docs/superpowers/specs/2026-05-02-spec-plugin-contract.md`](./docs/superpowers/specs/2026-05-02-spec-plugin-contract.md).
- **v1 framework plan:** [`docs/superpowers/plans/2026-05-02-scribe-v1-framework.md`](./docs/superpowers/plans/2026-05-02-scribe-v1-framework.md).
- **Documentation site:** [`docs/site/`](./docs/site) — 12-page guide: introduction, installation, getting-started, authoring-components, authoring-agents, reactivity, ssr-hydration, routing-layouts, data-fetching, deployment, api-reference, authoring-plugins.
- **CLI:** [`@scribe/cli`](./packages/cli) — `npx scribe app`, `npx scribe migrate`.
- **Pre-v1 phase specs (historical, still binding):** [`.team/phase-2/spec-signals.md`](./.team/phase-2/spec-signals.md), [`.team/phase-3/spec-arbor.md`](./.team/phase-3/spec-arbor.md), [`.team/phase-4/spec-runtime.md`](./.team/phase-4/spec-runtime.md), [`.team/phase-5/spec-agent.md`](./.team/phase-5/spec-agent.md), [`.team/agent-readiness/spec-agent-readiness.md`](./.team/agent-readiness/spec-agent-readiness.md).
- **Phase retros:** `.team/phase-*/retro.md`, `.team/round-n1/retro.md`, [`.team/agent-readiness/retro-phase1-3.md`](./.team/agent-readiness/retro-phase1-3.md).
- **Learnings:** [`.team/learnings.md`](./.team/learnings.md) — 39 entries, all durable.
- **Bench harness:** `bench/signals/HARNESS.md`, `bench/arbor/HARNESS.md`.

## License

MIT
