# @aihu/runtime size reduction — measured plan

**Date:** 2026-07-25 · **Measured on:** `9d8a49db`, rebased onto `edc15f2a` (#546
included) · **Author:** size-paydown pass (follow-up to the PR #546 bump-to-4800
decision)

## Why

The `@aihu/runtime` row in `.size-limit.json` is `4750 B` gzip. Measured on main today:
**4735 B — 15 B headroom.** PR #546 adds 26 B and goes 11 B over; a bump to 4800 B was
approved as acknowledged trim debt. This document is the paydown plan: a per-module byte
ranking measured *exactly as the gate measures*, a ranked candidate table where **every
byte figure is a real before/after `bun run size` measurement** (not an estimate), a
recommended sequence, and one implemented, proven candidate.

**Headline: the row is back under the original 4750 B contract, bump retired.**
Candidate 1 (implemented in this PR) is worth −30 B; rebased onto #546 (+26 B) the
row measures **4731 B**, so this PR also **restores the `.size-limit.json` limit
from the approved 4800 B back to 4750 B** (+19 B headroom) — the trim debt is paid
immediately rather than carried. The remaining candidates measured below can take
the row to **~3604 B** if the founder chooses to sequence them.

## How the gate measures (so the numbers match)

`scripts/size.ts` bundles `packages/runtime/dist/index.js` with rolldown
(`platform: 'browser'`, `format: 'esm'`, `minify: true`), externalizing the row's
`ignore` list (`@aihu/signals/lifecycle`) plus the package's declared
`peerDependencies` (`@aihu/arbor`, `@aihu/signals`, `@aihu/context`), then gzips.
Two consequences that shaped this analysis:

1. **The gate measures the whole entry, not tree-shaken usage.** Every export of
   `src/index.ts` is charged, including helpers documented as "lazy-attach: only
   imported when used" (`stream.ts` header). Real consumer builds tree-shake unused
   exports; the gate deliberately charges worst-case. Splitting genuinely lazy-attach
   helpers into subpath entries (the existing `@aihu/runtime/ssr` precedent) aligns
   the gate with the pay-for-use design intent — it is *not* mere row-shuffling,
   because a new subpath row is only paid by apps that use the feature.
2. **The gate can only externalize what `dist` still imports.** Runtime's *own* build
   (`packages/runtime/rolldown.config.ts`) externalized arbor/signals but **not**
   `@aihu/context` — so context code was inlined into `dist/index.js` where the gate's
   external list could no longer remove it. See Candidate 1: this was a correctness
   bug, not just bytes.

## Per-module byte ranking

Method: re-bundle `dist/index.js` exactly as the gate does, with `sourcemap: true`,
then chain the bundle's map through `dist/index.js.map` back to `src/*.ts` and
attribute every minified byte-run to its source module. (The sourcemap-bearing bundle
gzips to 4762 B vs the gate's 4735 B — the ~27 B delta is the appended
`sourceMappingURL` comment; proportions are unaffected.) Measured on `9d8a49db`:

| Module | Minified bytes | ~gzip share | % of bundle |
|---|---:|---:|---:|
| `src/define-component.ts` | 6625 | ~2530 B | 53.1% |
| `src/a11y.ts` | 2203 | ~841 B | 17.7% |
| `src/stream.ts` | 1497 | ~572 B | 12.0% |
| `src/define-element.ts` | 912 | ~348 B | 7.3% |
| `src/commit.ts` | 401 | ~153 B | 3.2% |
| `src/resource.ts` | 346 | ~132 B | 2.8% |
| `src/agent-dispatch.ts` | 195 | ~74 B | 1.6% |
| `src/hydrate-on-visible.ts` | 112 | ~43 B | 0.9% |
| `@aihu/context` src (wrongly inlined) | 110 | ~42 B | 0.9% |
| `src/types.ts` | 71 | ~27 B | 0.6% |
| **Total attributed** | **12472** (of 12744) | **4735 B gz (gate)** | |

## Ranked candidates — every delta is a real measured build

All deltas measured by making the change, rebuilding `packages/runtime`, and running
the actual gate (`bun run size`). Baseline after Candidate 1 = **4705 B**.

| # | Candidate | Measured row after | Δ saved | Risk | What breaks / guarding tests |
|---|---|---:|---:|---|---|
| **1** | **Externalize `@aihu/context` in runtime's own rolldown build** (it is a declared peer the gate already lists as external, but dist inlined it) — **IMPLEMENTED** | **4735 → 4705 B** | **30 B** | **None** (and fixes a real bug, below) | Nothing. `packages/runtime/tests/*` (181 pass), `packages/context` tests, full build/typecheck/size/dep-check green. |
| 2 | Move `createFocusTrap` (+ its `_deepQuerySelector`/`_deepActiveElement` helpers) to a subpath entry (e.g. `@aihu/runtime/focus-trap`); compiler emits the subpath import only when `<focusTrap>` is used (`emit.rs:1516` already gates on usage; `@aihu/runtime/ssr` at `emit.rs:937-941` is the emit precedent) | 4705 → **4248 B** | **457 B** | Medium (mechanical code move, but touches compiler emit + conformance goldens + insta snapshots; new `.size-limit.json` row ~600 B required per contract) | `packages/runtime/tests/a11y.test.ts` (15 tests), `packages/compiler/tests/a11y.rs`, `bench/compiler-conformance` goldens, examples using `<focusTrap>`. |
| 3 | Move `createStream` to a subpath entry (`@aihu/runtime/stream`). `stream.ts`'s own header declares it lazy-attach ("only imported when a `$stream` collection is declared. The compiler's `needs_create_stream` flag gates the import") — the entry placement just doesn't honor that; `emit.rs:1508` changes to emit the subpath | 4705 → **4287 B** | **418 B** | Medium (same shape as #2: compiler emit + goldens + new row ~750 B) | Runtime stream tests, compiler `$stream` tests + goldens. |
| 4 | Move `createResource` to a subpath (`@aihu/runtime/resource`), same pattern (`emit.rs:1512`) | 4705 → **4588 B** | **117 B** | Medium-low (same shape, smaller payoff) | Runtime resource tests, compiler `$resource` tests + goldens. |
| 5 | Collapse the function-form `defineComponent` class into a delegation to the options form (`defineComponent({ setup })`) — the two classes duplicate connected/disconnected/adopted/attributeChanged + `_build` scaffolding | 4705 → **4596 B** | **109 B** | Medium (behavior audit: options-form adds empty `observedAttributes`, prop-accessor loop (no-op with no props), `_isInternalAttrChange` field; `SetupContext` gains inert `attrs: {}`/`props: {}` keys) | The entire `packages/runtime/tests` suite exercises both forms; any drift shows immediately. **Lesson from measurement:** gzip already dedupes the near-identical text — ~140 source lines compress to only 109 B, so this is worth less than it looks. |

Not ranked as wins:

- **FEL-397 option (b) — delegate runtime's trap to `@aihu/primitives`' `createFocusTrap`.**
  NOT mechanical: the two implementations have different shapes (runtime:
  `(active, returnFocus, initialFocus, childFn) => Branch`, a compiler-emit template
  helper; primitives: a DOM-container `FocusTrap` controller with
  activate/deactivate). Delegating requires a Branch-adapter in primitives (or a new
  export) and *changes behavior* — primitives' composed-tree walk fixes the
  light-DOM-only enumeration at `a11y.ts:167/174` and the missing forward-Tab
  containment guard at `:208` as side effects, which is desirable but is a behavior
  change, not a trim. Destination headroom exists (`@aihu/primitives/dialog`:
  2.61 kB / 4 KB, **+1422 B**; adapter est. +300–400 B), and layering permits it
  (`scripts/dep-check.ts` enforces `@aihu/*`-only dep patterns, not direction — though
  `a11y.ts:93-101` documents the current no-primitives-dep choice deliberately).
  **Recommendation: do Candidate 2 first** (pure move, zero behavior change); the
  subpath module then becomes the one place to swap in the primitives-backed
  implementation later, closing FEL-397 without ever touching the main runtime row.
  Migration note: any hand-written imports of `createFocusTrap` from `@aihu/runtime`
  would need the subpath (compiler-emitted code migrates automatically with the
  compiler release).
- **Light-DOM default (#540 / FEL-304) making shadow machinery dead — quantified: negligible.**
  Runtime's shadow-specific code is only the trap's two deep-walk helpers (already
  inside Candidate 2's 457 B) and `this.shadowRoot ?? this` fallbacks (single-digit
  bytes each). The light-DOM flip makes `_projectLightDomSlot` (~200 min B in
  `define-component.ts`) *more* load-bearing, not dead — components with
  `shadowMode: none` are exactly the ones that need hand-rolled slot projection.
  Not a paydown vector.
- **`@aihu/arbor` cannot absorb anything** (3.04 kB / 3200 B, +87 B measured this pass
  — the briefed +25 B was from before this build).
- **Dev-only error strings:** runtime already uses terse codes (`'no mount'`,
  `'no owner'`, `'no signal'`); no `__DEV__` convention exists in runtime (only
  signals/arbor), and the `console.error` attribution strings are deliberate Bug-6
  behavior. Nothing material here.

## Candidate 1 detail — why it was first (implemented in this PR)

`packages/runtime/rolldown.config.ts` externalized `@aihu/arbor`, `@aihu/signals`,
`@aihu/signals/lifecycle` — but not `@aihu/context`, a declared peerDependency. So
`_enterContext`/`_exitContext` (plus the module-level state slots they close over)
were **inlined as a private copy** into `dist/index.js`.

That is not just 30 B of double-shipping — it is a **split-brain correctness bug in
published builds**: `@aihu/context` is module-state-based (`_activeProvides` /
`_ownProvides` / `_onOwnProvides` at `packages/context/src/index.ts`). Runtime's
inlined `_enterContext` wrote the *copy's* slots, while userland `provide()`/`inject()`
(imported from the real `@aihu/context`) read the *original's* — so hierarchical
client DI silently no-ops for dist consumers (`provide()` falls through to the SSR
map path and drops the value). Workspace tests alias `src`, which is why CI never
saw it — exactly the "green CI, non-working dist" failure mode this repo has been
burned by before.

Fix: one line in the config (+ explanatory comment). `dist/index.js` now emits
`import{_enterContext,_exitContext}from"@aihu/context"` like its sibling peers.

**Proof (gate output):**

| | Before (`9d8a49db`) | After |
|---|---|---|
| `@aihu/runtime` | 4.62 kB / 4750 B (+15 B headroom) | **4.59 kB / 4750 B (+45 B headroom)** |

Acceptance (all exit codes 0): `bun run build` 0 · `bun run typecheck` 0 ·
`bunx vitest run packages/runtime packages/context` 0 (18 files, 181 passed,
2 pre-existing skips) · `bun run size` 0 (all rows green) · `bun run check:deps` 0.

## Recommended sequence and recovery math

1. **C1 (this PR)** — −30 B. Measured post-rebase on top of #546 (+26 B):
   **4731 B**. **The approved 4800 B bump is retired in this PR** — the limit is
   restored to the original 4750 B (+19 B headroom).
2. **C3 stream subpath** — 4705 → 4287 B. Do before C2 only because it has no
   FEL-397 entanglement; otherwise interchangeable with C2.
3. **C2 focus-trap subpath** — → 3830 B (also unlocks closing FEL-397 later).
4. **C5 function-form collapse** — → ~3721 B (needs the behavior audit; smallest
   payoff per risk, keep last among the code changes).
5. **C4 resource subpath** — → ~3604 B.

| Target | vs retired 4800 B bump | vs original 4750 B (restored in this PR) |
|---|---:|---:|
| After C1 + #546 (**4731 B measured post-rebase**) | +69 B | **+19 B headroom** |
| Full plan (~3604 B) | +1196 B | +1146 B |

**Is returning to 4750 B achievable? Yes — done in this PR** (limit restored to
4750 B; the gate passes at 4731 B).
The honest number for the full plan is **~3604 B**, at the cost of two compiler-emit
changes (goldens + snapshots) and one runtime refactor; if all of it lands the
contract could credibly be *re-tightened* to ~3900–4000 B rather than merely held.
