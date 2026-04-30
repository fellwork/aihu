# scribe

A JavaScript/TypeScript meta-framework for building Web Components with runtime-first reactivity. Authored as `.scribe` single-file components, compiled to vanilla custom elements, mounted with sub-2 kB reactive primitives.

> **Status:** v0 core packages complete (signals · arbor · runtime · agent). Agent-readiness packages shipped (server · agent-readiness). 206 tests passing. Rust SFC compiler is the remaining v0 → v1 gate. The reactive, DOM, and server/agent-readiness layers are stable and usable as standalone libraries today.

[![CI](https://github.com/fellwork/scribe/actions/workflows/plan-a.yml/badge.svg)](https://github.com/fellwork/scribe/actions/workflows/plan-a.yml)
[![tests](https://img.shields.io/badge/tests-206%20passing-brightgreen)](#)
[![bundle](https://img.shields.io/badge/browser%20bundle-3.46%20kB%20gz-brightgreen)](#bundle-size)

> **CI note:** The workflow runs on `workflow_dispatch` during v0 development. Auto-triggers (push / PR) are re-enabled at v1 cutover. Local gates (typecheck · test · build · size · bench) run on every Builder dispatch and are validated by the Verifier.

---

## What it is

Scribe sits at the intersection of three things:

1. **A reactive core** ([`@scribe/signals`](./packages/signals)) — push-based signals, computeds, effects, batched writes. Beats alien-signals on cellx, batched-writes, dynamic-deps, and creation-1to1000. Ships in ≤ 1.7 kB gzipped.
2. **A DOM layer** ([`@scribe/arbor`](./packages/arbor)) — `branch`/`leaf`/`mount` primitives that materialize a tree synchronously into an `Element` or `ShadowRoot` and tear it down LIFO. The compiler emits direct calls into these primitives — no JSX runtime tax, no virtual DOM. **122× faster than vanilla DOM** on targeted reactive updates (`nodeValue` vs `textContent`).
3. **A planned compiler** — a Rust toolchain that reads `.scribe` SFC files (template + setup script) and emits a `class extends HTMLElement` calling `mount(buildTree(), this.shadowRoot)`. The `defineComponent` helper produces the same shape for hand-authored components.

The output is **vanilla custom elements**: no framework lock-in at the consumer boundary, no global context, no hydration step.

## Why "meta-framework"?

It's a framework you author *with*, not a framework you embed *into*. The pieces are layered so each layer is usable on its own:

- `@scribe/signals` works as a standalone reactive primitives library.
- `@scribe/arbor` works as a standalone DOM-mounting layer — pair it with any reactive system that exposes a `[get, set]` shape.
- The compiler + runtime layers stack on top, but don't lock the lower layers into a particular consumer.

Compare to: Solid (single-package), Lit (templating + base class only), Vue (proxy-based, ships its own scheduler). Scribe is *meta* in the sense of separable layers stacked into a meta-framework, not in the Next.js / Nuxt sense.

## Project posture

This is a **research codebase**. The phases are sequenced so each layer's design decisions are pinned by a binding spec before code lands; performance regressions block merge; bench receipts are mandatory on every runtime PR. See `.team/phase-3/spec-arbor.md` §0.5 for the full posture statement.

Key non-goals (today):
- **No full hydration** — `renderToString` is live in `@scribe/server`. Full serialize → client-deserialize (`MountScope.serialize()`) still throws `ArborNotImplementedError`. Planned for sub-project #6.
- **No agent live-binding** — `MountScope.agent` returns a frozen branded stub. Planned as sub-project #7.
- **No `when` / `each` reconciler** — both throw `ArborNotImplementedError`. v1 reconciler.

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

**Browser layer** (ships to client — hard 4 kB budget):

| Package | Size | Budget | Headroom |
|---|---:|---:|---:|
| `@scribe/signals` | 1.55 kB | 1.7 kB | 150 B |
| `@scribe/arbor` | 1.29 kB | 2.05 kB | 760 B |
| `@scribe/runtime` | 0.48 kB | 1.02 kB | 540 B |
| `@scribe/agent` | 0.14 kB | 100 B | — |
| **Combined** | **3.46 kB** | **4.0 kB** | **~540 B** |

**Server / agent-readiness layer** (edge runtime — no size constraint):

| Package | Size | Notes |
|---|---:|---|
| `@scribe/server` | 1.63 kB | router · middleware · api · ssr · data · config |
| `@scribe/agent-readiness` | 1.78 kB | llms-txt · mcp-server-card · robots · content-negotiation · vite-plugin |

---

## Layout

| Path | What |
|---|---|
| [`packages/signals`](./packages/signals) | `@scribe/signals` — `signal`, `computed`, `effect`, `batch`, `untrack`, `$state`. Phase 2. |
| [`packages/arbor`](./packages/arbor) | `@scribe/arbor` — `branch`, `leaf`, `mount`, `MountScope`. Phase 3. |
| [`packages/runtime`](./packages/runtime) | `@scribe/runtime` — `defineElement`, `defineComponent`, `DefineOptions`, `ShadowMode`. Phase 4. |
| [`packages/agent`](./packages/agent) | `@scribe/agent` — `AgentMetadata` registry, `getAgentMetadata`, `registerAgentMetadata`. Phase 5. |
| [`packages/server`](./packages/server) | `@scribe/server` — fetch-API router, middleware, api helpers, SSR, data loaders, config. Edge-safe. |
| [`packages/agent-readiness`](./packages/agent-readiness) | `@scribe/agent-readiness` — `llms.txt`, MCP Server Card, `robots.txt`, content negotiation, Vite plugin. |
| [`bench/signals`](./bench/signals) | Signals bench harness — 6 workloads × 6 competitors × time + memory. |
| [`bench/arbor`](./bench/arbor) | Arbor bench harness — 6 workloads × 6 competitors × time + memory (JSDOM). |
| `tests/` | Cross-package integration tests. |
| `.team/` | Specs (binding), phase plans, retros, learnings. |

## Toolchain

- **Runtime:** [Bun](https://bun.sh) ≥ 1.3.0, Node ≥ 20.18.0. Both required (`engines` enforced).
- **Bundler:** [Rolldown](https://rolldown.rs) — Rust-based, OXC ecosystem.
- **Test:** [Vitest](https://vitest.dev) + jsdom + [fast-check](https://github.com/dubzzz/fast-check) (property tests).
- **Lint/format:** [Biome](https://biomejs.dev).
- **Task runner:** [Moon](https://moonrepo.dev) — `moon run :build`, `moon run :typecheck`.
- **Size budget:** [size-limit](https://github.com/ai/size-limit) gates per-package gzipped bundles.
- **Tool versions:** pinned via [proto](https://moonrepo.dev/proto) (`.prototools`).

## Quickstart

```bash
bun install
bun run build      # build all 6 packages
bun run test       # 206 tests (unit + integration)
bun run size       # gzipped bundle gates (browser layer)
bun run check      # biome lint + format
bash scripts/check-boundary.sh   # AC-7: hard boundary (no client imports in server layer)
bash scripts/check-edge-safe.sh  # AC-6: no Node-only globals in dist bundles
```

Run the bench suites:

```bash
cd bench/signals && bun src/runner.ts   # signals vs SOTA
cd bench/arbor   && bun src/runner.ts   # arbor vs SOTA (JSDOM)
```

Use the packages today (workspace-internal; not on a registry yet):

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

Edge / server (fetch-API, works on Cloudflare Workers, Deno, Bun):

```ts
import { createRouter, defineRoute, json } from '@scribe/server'
import { createAgentReadinessRoutes } from '@scribe/agent-readiness'

const ar = createAgentReadinessRoutes({
  name: 'My App',
  endpoint: 'https://myapp.workers.dev/mcp',
  summary: 'A scribe-powered app.',
})

const router = createRouter({
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

## Where to read next

- **Specs (binding):** [`.team/phase-2/spec-signals.md`](./.team/phase-2/spec-signals.md), [`.team/phase-3/spec-arbor.md`](./.team/phase-3/spec-arbor.md), [`.team/phase-4/spec-runtime.md`](./.team/phase-4/spec-runtime.md), [`.team/phase-5/spec-agent.md`](./.team/phase-5/spec-agent.md).
- **Agent-readiness spec:** [`.team/agent-readiness/spec-agent-readiness.md`](./.team/agent-readiness/spec-agent-readiness.md) — complete: `@scribe/server` + `@scribe/agent-readiness` (AC-1 through AC-8).
- **Phase retros:** `.team/phase-*/retro.md`, `.team/round-n1/retro.md`, [`.team/agent-readiness/retro-phase1-3.md`](./.team/agent-readiness/retro-phase1-3.md).
- **Learnings:** [`.team/learnings.md`](./.team/learnings.md) — 27 entries, all durable.
- **Bench harness:** `bench/signals/HARNESS.md`, `bench/arbor/HARNESS.md`.

## License

Not yet specified. Treat as proprietary until a `LICENSE` file lands.
