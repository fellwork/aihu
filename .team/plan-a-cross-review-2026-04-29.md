# Cross-review: `docs/superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md` vs shipped state

**Date:** 2026-04-29
**Reviewer:** post-Phase-3 review pass
**Subject:** `docs/superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md` (1741 lines, dated 2026-04-24)
**Method:** read the plan in full, walk every claim against the shipped repo state (`packages/`, `.size-limit.json`, `.prototools`, `.moon/`, `.github/workflows/`, `bench/`, `.team/`).

The plan was authored before any source code shipped. Phase 1 task boxes are all checked (`[x]`); Phase 2 task boxes (6–11) are still unchecked even though `@scribe/signals` shipped. Phases 3/4/5 were rewritten as navigational stubs pointing to `.team/` specs — those sections are accurate but minimal. Below is what's drifted, what's accurate, and what to do about it.

---

## Headline status

| Phase | Plan state | Shipped state | Verdict |
|---|---|---|---|
| 1 — Scaffolding | All boxes checked | Shipped (with Moon 2.x migration) | **Accurate with one path drift** |
| 2 — `@scribe/signals` | Tasks 6–11 specified inline, all `[ ]` | Shipped, 59 tests, exports include `batch` + `untrack` not mentioned in plan | **Stale on multiple axes** |
| 2.5 — Bench-spike + perf | One paragraph at end | Shipped: `bench/signals/`, structural rewrite, wide-fanout recovery v2, deep-perf-wins | **Plan acknowledges existence only** |
| 3 — `@scribe/arbor` | Pointer to `.team/phase-3/spec-arbor.md` | Shipped, 51 tests, 1.16 kB / 2.05 kB budget | **Accurate (deliberately minimal)** |
| 4 — `@scribe/runtime` | Pointer to `.team/phase-4/spec-runtime.md` | Not built | **Accurate, not yet built** |
| 5 — `@scribe/agent` | Pointer to `.team/phase-5/spec-agent.md` | Not built | **Accurate, not yet built** |
| 6 — Integration | "Not yet specced" | Partial: 1 cross-package test exists (`mount-arbor-with-signals.test.ts`) | **Mostly accurate, undercounted** |

---

## Phase 1 drift

Plan vs shipped, line-by-line:

- **`.prototools`** — plan §117–120 pins `node = "20.18.0"`. Shipped: `node = "22.12.0"`. Bumped between spec authoring and Phase 3 spawn (Phase 3 spec §3.4 noted this, Builder confirmed in Task 12). The plan never got the update.
- **`.moon/tasks.yml`** — plan §390/§434 specifies a single file at `.moon/tasks.yml`. Shipped: `.moon/tasks/` is a **directory**, not a file. This is the Moon 1→2 directory-layout migration documented in Phase 2's `builder-blockers.md` §1. Plan path is stale.
- **CI trigger** — plan §475–478 specifies `on: push: branches: [main]` and `pull_request: branches: [main]`. Shipped: `branches: [main, 'plan-a-phase-*', 'plan-*', 'phase-*/**', 'bench/**', 'spec/**']` for push (the Phase 3 retro fix per Learning #5 amendment). PR triggers still `[main]`. Plan reflects the broken pre-fix state.
- **Root `package.json` snippet at §122–162** — lists eslint/prettier devDeps. Three tasks later (§252–333) the plan replaces eslint+prettier with Biome and updates root scripts. The snippet at the top is internally stale relative to the same plan's Task 3. Shipped matches the after-state (Biome).

---

## Phase 2 drift — this is where the plan is most wrong

The plan section is detailed (Tasks 6–11 with full code listings) and was clearly written before the spec session. Several pieces are flatly contradicted by what shipped:

1. **§542 — "No batching API in Phase 2."** Reversed by the Phase 2 spec, Architect Decision 1 ("arbor needs batching on day one"). Shipped: `packages/signals/src/batch.ts`, `batch()` exported from `index.ts`, `batch.test.ts` with 6 tests, `MAX_BATCH_ITERATIONS` constant exported. Plan headline reversed.
2. **§540 — "computed is lazy: it does not run until read, and re-runs only when a dep changed since the last read."** Shipped computed has the "eager recompute when subs > 0" structural fact discovered at the keyboard during Phase 2 (Phase 2 retro Learning #9, build-manifest Task 12). The plan's lazy-only model is incomplete; the actual behavior is lazy-when-unsubscribed, eager-when-subscribed.
3. **§539 — equality is `Object.is`.** Phase 2 shipped with `equals` as a configurable comparator (not just `equals: false`) per spec Deviation 8 + the `ComputedOptions.equals` follow-up commit (the contradiction that Learning #2 was named after). Plan doesn't mention `ComputedOptions` or `equals` at all.
4. **Public surface in plan vs shipped exports.** Plan implies the Task 11 final surface is `signal, effect, computed, $state, SignalError, SignalCircularError`. Shipped `signals/index.ts` adds: `batch`, `untrack`, `MAX_BATCH_ITERATIONS`, `ComputedOptions`. `untrack` was Task 12.5 (Phase 3 prep, authorized in the Phase 3 launch brief, never folded back into the plan). `batch` was Decision 1.
5. **Size budget for `@scribe/signals`** — plan §400 says `"limit": "1024 B"`. Shipped `.size-limit.json` says `"limit": "1600 B"`. Phase 2.5 bumped it 1024 → 1500 → 1600 across the perf work. Plan is stale.
6. **Hidden tasks** — `.team/` references Task **11.5** (un-comment CI gates per Learning #5) and Task **12.5** (untrack). Neither exists in the plan's task numbering. The plan goes 11 → 12 with no half-steps.
7. **Source files not in plan** — `packages/signals/src/batch.ts` and `untrack.ts`. Both shipped, both have tests, neither in §17's File Structure tree.

---

## Phase 2.5 — plan barely acknowledges it

The plan's §1737 paragraph is one sentence: "One-Builder spike, ~1 day wall-clock. Two tracks." Reality: Phase 2.5 is the largest body of work after Phase 1, with three layered specs (cellx-fix, structural rewrite, wide-fanout-recovery v1 → v2, deep-perf-wins), two investigation reports, three sets of builder-blockers, the bench harness in `bench/signals/`, and a published verification report. The plan undersells this by an order of magnitude.

This isn't necessarily wrong — Phase 2.5 was inserted between phases and was always going to be `.team/`-resident — but the plan reader has no signal that the perf work was substantial, that the size budget moved, or that computed semantics were rewritten.

---

## File Structure (§17) drift

Comparing plan §35–96 to shipped:

| Plan path | Shipped reality |
|---|---|
| `packages/signals/src/{signal,effect,computed,state,errors,index}.ts` | Same plus `batch.ts`, `untrack.ts` |
| `packages/signals/tests/{signal,effect,computed,state,properties}.test.ts` | Same plus `batch.test.ts`, `untrack.test.ts` |
| `packages/arbor/src/{leaf,branch,mount,attrs,structural,errors,types,index}.ts` | Same plus `materialize.ts`, `node.ts` |
| `packages/arbor/tests/{leaf,branch,mount,attrs,structural,bench}.test.ts` | All present |
| `packages/runtime/...` | **Does not exist** (Phase 4 not built) |
| `packages/agent/...` | **Does not exist** (Phase 5 not built) |
| `tests/integration/mount-arbor-with-signals.test.ts` | Present |
| `tests/integration/define-element-integration.test.ts` | **Does not exist** (Phase 4 work) |
| Not in plan | `bench/signals/` (Phase 2.5) |

---

## What's still accurate and load-bearing

It's worth being clear about what survives — the plan isn't worthless:

- **The 4-package structure** (`signals` → `arbor` → `runtime` → `agent`) is intact and matches every downstream spec.
- **The ~4 KB combined budget** is intact; current draws are 716 B + 1.16 kB = ~1.9 kB, leaving generous headroom for the un-built two packages.
- **The tech stack list** (Bun, Moon, Rolldown, Biome, vitest, fast-check, jsdom, size-limit, GitHub Actions) is fully accurate.
- **Out-of-scope** (Rust crates, Vite plugin, SFC compiler, `.scribe` files, Playwright e2e) still holds.
- **Phase 3/4/5/6 navigational sections** correctly defer to `.team/` specs and were clearly written *after* the spec session.
- **Phase 2 design clarifications** §537 (`signal<T>` returns `[get, set]` Solid-shaped), §538 (`effect` synchronous, returns `dispose()`), §541 (cycle detection via `running` flag) all match shipped behavior.

---

## Recommendation

The plan has three different audiences pulling it in different directions: (a) the original authoring agent who treated Phases 2–6 as inline-implementable, (b) the Phase 3 spec session which correctly demoted §1650+ to navigational pointers, and (c) future readers who need to know the shipped state. The friction shows.

Three options, ranked by cost:

### Option 1 — Status banner only (10 minutes)

Add a banner at the top of the plan:

> **Status as of 2026-04-29.** Phases 1 and 2 shipped; the inline Phase 2 task content (Tasks 6–11) is **stale** — see `.team/phase-2/spec-signals.md` and the retro for what actually shipped. Notable reversals: batching API ships in Phase 2 (Decision 1), `untrack` added as Task 12.5, signals size budget raised to 1600 B gz, computed is eager-when-subscribed not purely lazy. Phase 2.5 (perf work) is not detailed in this plan — see `.team/phase-2-5/`. For Phases 3–6, this plan is navigational only; the `.team/phase-N/` specs are authoritative.

This addresses the three duplicate Deviation 1 entries in phase-3/4/5 specs and prevents future readers from acting on stale Phase 2 content. Plan stays as a useful artifact.

### Option 2 — Phase 2 inline correction (45 minutes)

Same banner plus: check the Phase 2 task boxes, add Task 11.5 and 12.5 stubs, update §534–542 design clarifications to match shipped reality, fix the size budget number, update the §17 File Structure to list the as-built `.ts` files, and update Phase 1 to fix `.prototools` Node version + `.moon/tasks/` directory + CI trigger glob. After this, the plan would actually describe what shipped.

### Option 3 — Mark plan historical, archive (5 minutes)

Move the file to `docs/superpowers/plans/_archive/` and replace it with a one-page index pointing exclusively to `.team/`. Cleanest, but loses a lot of detailed Phase 1 / Phase 2 implementation history that future agents may want to grep.

**Recommendation: Option 1.** It costs almost nothing, addresses the three duplicate Deviation 1 flags, and matches the Phase 3 retro's plan-staleness pattern (banner > rewrite > delete). Option 2 is a nice-to-have if you want the plan to stay genuinely useful; Option 3 is overkill given the plan still has the only narrative-format Phase 1 walkthrough in the repo.

---

## Method notes

Files inspected:
- `docs/superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md` (full, 1741 lines)
- `package.json`, `.prototools`, `.size-limit.json`, `vitest.config.ts`, `tsconfig.base.json`, `tsconfig.json`, `biome.json`
- `.moon/` directory layout
- `.github/workflows/plan-a.yml`
- `packages/signals/src/`, `packages/signals/tests/`, `packages/signals/package.json`, `packages/signals/dist/`
- `packages/arbor/src/`, `packages/arbor/tests/`, `packages/arbor/package.json`, `packages/arbor/dist/`
- `tests/integration/`
- `bench/signals/` (presence only)
- `.team/` (already loaded from prior review)

Test counts cited:
- signals: 59 unit tests across 7 files (signal 7, effect 11, computed 19, state 4, properties 9, batch 6, untrack 3)
- arbor: 51 unit tests across 6 files (leaf 9, branch 9, mount 21, attrs 9, structural 2, bench 1)
- integration: 1 test
- Total: 111 tests
