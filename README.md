# scribe

A JavaScript/TypeScript meta-framework for building Web Components with runtime-first reactivity. Authored as `.scribe` single-file components, compiled to vanilla custom elements, mounted with sub-2 kB reactive primitives.

> **Status:** pre-v0, actively developed in phased increments. Phase 2 (signals) and Phase 3 (arbor) shipped; Phase 4 (runtime / `defineComponent`) and the Rust SFC compiler are not yet started. The runtime surface for v0 is frozen — usable as a standalone reactive library today.

## What it is

Scribe sits at the intersection of three things:

1. **A reactive core** ([`@scribe/signals`](./packages/signals)) — push-based signals, computeds, effects, batched writes. Targets parity with [alien-signals](https://github.com/stackblitz/alien-signals) on the cellx + wide-fanout benches and ships in ≤ 1.6 kB gzipped.
2. **A DOM layer** ([`@scribe/arbor`](./packages/arbor)) — `branch`/`leaf`/`mount` primitives that materialize a tree synchronously into an `Element` or `ShadowRoot` and tear it down LIFO. The compiler emits direct calls into these primitives, so there is no JSX runtime tax and no virtual DOM.
3. **A planned compiler** — a Rust toolchain that reads `.scribe` SFC files (template + setup script) and emits a `class extends HTMLElement` calling `mount(buildTree(), this.shadowRoot)`. Hand-authored components use a forthcoming `defineComponent` helper that produces the same shape.

The output is **vanilla custom elements**: no framework lock-in at the consumer boundary, no global context, no hydration step.

## Why "meta-framework"?

It's a framework you author *with*, not a framework you embed *into*. The pieces are layered so each layer is usable on its own:

- `@scribe/signals` works as a standalone reactive primitives library — drop it into any project that wants Solid-style fine-grained reactivity.
- `@scribe/arbor` works as a standalone DOM-mounting layer — pair its primitives with any reactive system that exposes a `[get, set]` shape.
- The compiler + runtime layers stack on top, but don't lock the lower layers into a particular consumer.

Compare to: Solid (single-package), Lit (templating + base class only), Vue (proxy-based, ships its own scheduler). Scribe is meta in the sense of *separable layers stacked into a meta-framework*, not in the Next.js / Nuxt sense (those are meta-frameworks built on existing frameworks).

## Project posture

This is a **research codebase**. The phases are sequenced so each layer's design decisions are pinned by a binding spec before code lands; performance regressions block merge; bench receipts are mandatory on every runtime PR. See `.team/phase-3/spec-arbor.md` §0.5 for the full posture statement.

Key non-goals (today):
- **No SSR / hydration** — `MountScope.serialize()` throws `ArborNotImplementedError`. Sub-project #6 (Phase 5+).
- **No agent live-binding** — `MountScope.agent` returns a frozen branded stub. Sub-project #7 (Phase 5+).
- **No `when` / `each` reconciler** — both throw `ArborNotImplementedError`. v1 reconciler.

## Layout

| Path | What |
|---|---|
| [`packages/signals`](./packages/signals) | `@scribe/signals` — `signal`, `computed`, `effect`, `batch`, `untrack`, `$state`. Phase 2. |
| [`packages/arbor`](./packages/arbor) | `@scribe/arbor` — `branch`, `leaf`, `mount`, `MountScope`. Phase 3. |
| `bench/` | Cellx 4×4 + wide-fanout signals benches vs alien-signals. |
| `tests/` | Cross-package integration. |
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
bun run --cwd packages/signals build
bun run --cwd packages/arbor build
bun run test          # 110 tests across signals + arbor
bun run size          # gzipped bundle gates
bun run check         # biome lint + format
```

Use the published packages today (workspace-internal; not on a registry yet):

```ts
import { signal, computed, effect } from '@scribe/signals'
import { branch, leaf, mount } from '@scribe/arbor'

const [count, setCount] = signal(0)
const tree = branch('div', null, [leaf([count, setCount])])
const scope = mount(tree, document.body)
setCount(1) // DOM updates synchronously
scope.dispose()
```

## Where to read next

- **Specs (binding):** [`.team/phase-2/spec-signals.md`](./.team/phase-2/spec-signals.md), [`.team/phase-3/spec-arbor.md`](./.team/phase-3/spec-arbor.md).
- **Phase retros:** `.team/phase-2/retro.md`, `.team/phase-3/retro.md`.
- **Project posture & decisions:** `.team/phase-3-launch.md`, `.team/learnings.md`.
- **Bench harness:** `bench/`.

## License

Not yet specified. Treat as proprietary until a `LICENSE` file lands.
