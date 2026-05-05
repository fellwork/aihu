# Director Note — Round 2
**Date:** 2026-04-30
**Track:** C — SSR + Signals
**Plans:** 3.1 (Streaming SSR), 6.2 (Signals Deep-Chain Optimization)
**Branch:** `feat/v1-ssr-signals`
**Round:** 2 — post-Architect (3.1) and post-Investigator (6.2)

---

## §1 Plan 3.1 — Streaming SSR: Assessment

### Check 1 — `DataSource<T>` interface completeness

The interface defined in `packages/server/src/stream-types.ts` (§2 of the spec) is complete and implementable:

- `status: 'pending' | 'ready' | 'error'` — present and `readonly`
- `value?: T` — present and `readonly`
- `error?: unknown` — present and `readonly`
- `onReady(cb: () => void): () => void` — present with correct signature (callback registered once, returns a dispose/cancel function)

The four fields the Round 1 Director brief required are all present. The interface is defined with no implementation code in the new `stream-types.ts` file. The `StreamOptions` type extends `SsrOptions` with no additional fields in v1; the explicit exclusion of `timeout` is documented with rationale. Interface shape: COMPLETE.

### Check 2 — Option A (`dataSource?` on Branch) — arbor impact

The spec confirms Option A explicitly: `dataSource?: DataSource<unknown>` is treated as an optional field on the existing `branch` node kind, read via duck-type check (`renderToStream` reads `dataSource` off the raw object as `Record<string, unknown>`).

**No changes to `@aihu/arbor` are required.** The spec states this in §3:

> "No changes to arbor's exported types are required for v1 — `renderToStream` reads `dataSource` off the raw object using a runtime duck-type check, consistent with how `renderNode` already reads `tag`, `attrs`, and `children`."

`packages/arbor/src/node.ts` is in the "Files not to touch" list (§6). The change is purely server-side. Arbor's public API surface is unaffected. The Round 1 Director concern about whether a third `kind` would be needed is resolved: it is not.

### Check 3 — `renderToStream` algorithm completeness

The step-by-step algorithm in §4 is complete. Every decision point is specified:

- Stream constructor pattern (push controller) — specified
- Component resolution (function vs `{ toHtml() }`) — both branches specified
- `renderNodeAsync` signature, all four `kind === 'branch'` sub-cases (no dataSource, status `'ready'`, status `'error'`, status `'pending'`) — all specified
- Pending-boundary counter increment/decrement protocol — specified
- State script and document-close ordering relative to boundary resolution — specified (Step 6 gives preamble ordering explicitly)
- Error propagation through `controller.error` — specified for both sync throw and async boundary errors

One subtlety worth flagging to the Builder: the spec's pending-boundary counter tracking (Step 3.d.iv) requires tracking when the synchronous tree walk is complete AND the counter hits zero. The spec describes the shape of this logic but does not give explicit pseudocode for the outer `walkComplete` boolean that guards the final `controller.close()`. The Builder must infer this flag pattern from the description. This is implementable without ambiguity — the pattern is standard for async stream draining — but the Builder should be told to introduce a `let walkDone = false` flag set after the root `renderNodeAsync(root, ...)` awaitable returns, and gate `controller.close()` on `walkDone && pendingCount === 0`. This is a clarifying annotation, not a spec gap.

**Algorithm: sufficiently specified for Builder implementation.**

### Check 4 — `renderToString` drain idiom and API stability

The drain idiom in §5 is fully specified: `getReader()` + `reader.read()` loop + `reader.releaseLock()` in a `finally` block, returning `chunks.join('')`. The rationale for `getReader()` over `for await...of` (runtime portability across Workers/Deno/Bun/Node) is documented.

The public signature of `renderToString` is unchanged:

```typescript
export async function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string>
```

The spec explicitly states: "Every existing `renderToString` test must pass without modification after this refactor." The behavior invariant is clear. No external API change. PASS.

### Check 5 — Node >=18 engines constraint consistency

The spec adds `"engines": { "node": ">=18.0.0" }` to `packages/server/package.json`. Checking against the root `package.json`:

```json
"engines": {
  "bun": ">=1.3.0",
  "node": ">=20.18.0"
}
```

The root monorepo already declares `node: >=20.18.0` — a stricter floor than the spec's `>=18.0.0`. The spec's `>=18.0.0` is consistent with (and weaker than) the project-wide constraint. Adding `>=18.0.0` to the server package does not conflict with anything; it is simply a package-level annotation of the same constraint, stated conservatively.

**Correction for Builder:** The Builder should be aware that the root already enforces `>=20.18.0`. The `packages/server/package.json` `engines` field should be set to `"node": ">=18.0.0"` as specified (this is what the spec mandates, and it is consistent — a package may declare a floor no higher than the monorepo's actual enforced floor). There is no inconsistency. If the team ever relaxes the root to `>=18.x` in a future LTS rotation, the server package would already be correct.

**Status: consistent and acceptable.**

### Check 6 — Tests

Six tests are specified in §7. Each has a name, "what it proves," setup instructions, and expected assertion shape. Assessment per test:

| Test | Name quality | Setup completeness | Assertions specific enough? |
|---|---|---|---|
| 1 — Sync toHtml streams full doc | Clear | Complete | Yes — 4 assertions given |
| 2 — Ready DataSource streams without suspension | Clear | Complete — stub shape given | Yes — 2 assertions; adequately simple |
| 3 — Pending DataSource yields chunks in order | Clear | Complete — full stub with `let resolve!` pattern | Yes — 3 assertions; chunk-order proof included |
| 4 — Factory throws → stream error | Clear | N/A (inline) | Yes — `rejects.toThrow` pattern given |
| 5 — opts.head document structure | Clear | Complete | Yes — positional ordering assertions given |
| 6 — opts.hydratable emits data-aihu-path | Clear | Complete | Yes — two path assertions given |

One note: Test 3 uses `(source as any).status = 'ready'` inside the `resolve` callback. The Builder should be aware this mutates a `readonly` property through a type cast — this is acceptable for test stubs. No spec change needed; it is a standard test pattern.

**Tests: sufficiently specified. Builder can write all six without design decisions.**

### Check 7 — Anti-pattern: acceptance criteria comparison

The roadmap (`plan-v1-roadmap.md` §3.1) specifies these acceptance criteria for Plan 3.1:

1. First byte time: `<head>` chunk arrives before any async data resolves.
2. Lighthouse: streaming variant scores identically on all categories.
3. Edge environments (Cloudflare Workers, Deno, Bun): `ReadableStream` works natively.

Comparing against the spec:

- **Criterion 1 (first byte / `<head>` chunk):** The spec's §4 Step 6 specifies that the document preamble chunk (`<!DOCTYPE html><html...><head>...</head><body>`) is emitted BEFORE the tree walk. This satisfies criterion 1 structurally. The spec does not add a runtime measurement test for this, but the algorithm guarantees it by design.

- **Criterion 2 (Lighthouse parity):** The spec does not include a Lighthouse test. This is appropriate — Lighthouse is an integration/quality gate, not a unit-test deliverable for this spec. The Verifier will need to run the quality gate script (`bun test:quality`) against a deployed instance. This is not lowered by the spec — it remains a merge requirement per the roadmap. **No spec revision needed; the Verifier must check this independently.**

- **Criterion 3 (edge runtime compatibility):** The spec's §8 decision ("use `ReadableStream` directly as a global — no import required") and the `engines` field satisfy this: Workers, Deno, and Bun have always had `ReadableStream` as a global. No `'stream/web'` import is needed. PASS.

**Anti-pattern verdict: the spec does NOT revise or lower any acceptance criteria. All three roadmap criteria are addressed or preserved unchanged.**

---

## §2 Plan 3.1 — Builder Brief

### Files to create

| File | Contents |
|---|---|
| `packages/server/src/stream-types.ts` | `DataSource<T>` and `StreamOptions` interfaces exactly as specified in spec §2. ~25 lines. |
| `packages/server/tests/ssr-stream.test.ts` | Six tests per spec §7 (names, setup stubs, assertions). |

### Files to modify

| File | Changes |
|---|---|
| `packages/server/src/ssr.ts` | (1) Import `StreamOptions` from `./stream-types.ts`. (2) Add internal `renderNodeAsync` async function. (3) Add exported `renderToStream`. (4) Replace `renderToString` body with drain loop per spec §5. No changes to `renderNode`, `buildHead`, `escapeAttr`, or any type declarations. |
| `packages/server/src/index.ts` | Export `DataSource` and `StreamOptions` types from `./stream-types.ts`; export `renderToStream` from `./ssr.ts`. |
| `packages/server/package.json` | Add `"engines": { "node": ">=18.0.0" }` field. |

### Files not to touch

Everything outside `packages/server/`. Specifically: `packages/arbor/`, `packages/signals/`, all other packages.

### Implementation notes for Builder

1. **`walkDone` flag pattern (clarification of spec §4 Step 3.d.iv):** Introduce `let pendingCount = 0` and `let walkDone = false`. After the top-level `await renderNodeAsync(root, '0', hydratable, controller)` completes (i.e., the synchronous tree walk is done), set `walkDone = true`. In the `onReady` callback, after decrementing `pendingCount` and checking `pendingCount === 0`, also check `walkDone` before calling `controller.close()`. This prevents premature close if the synchronous walk has not yet finished.

2. **No `ReadableStream` import:** Use `ReadableStream` as a global. If TypeScript reports a type error, add `/// <reference lib="dom" />` at the top of `ssr.ts`. Do NOT import from `'stream/web'`.

3. **State script position:** Per the existing `renderToString` implementation, the state script (`__aihu_state__`) is emitted AFTER content and BEFORE `</body></html>`. `renderToStream` must maintain this order — emit the state script after all pending boundaries resolve, before `controller.close()`.

4. **`renderToString` regression gate:** All tests in `packages/server/tests/ssr.test.ts` and `packages/server/tests/compliance/ssr-output.test.ts` must pass unchanged. The drain loop in the refactored `renderToString` must produce byte-for-byte identical output for every existing test case.

5. **No `timeout` field:** `StreamOptions` extends `SsrOptions` with no additional fields. Do not add `timeout`. This is an explicit exclusion documented in the spec.

### Verifier acceptance criteria

In addition to the six new streaming tests, the Verifier must confirm:

- All existing `renderToString` tests pass (regression gate)
- `packages/server/package.json` has `"engines": { "node": ">=18.0.0" }`
- `renderToStream` and `DataSource` and `StreamOptions` are exported from `packages/server/src/index.ts`
- `packages/arbor/` has zero modifications (git diff confirms no arbor changes)
- Lighthouse quality gate (`bun test:quality`) passes on the streaming path (integration gate — may be deferred to merge CI if integration test environment is not available in the Builder's local run)

### Size constraint

No explicit size constraint for `@aihu/server`. The spec does not claim a size budget. The additions (~120 lines across two new/modified files) are appropriate for a server package. No size-limit check is required for this plan.

---

## §3 Plan 3.1 — Go/No-Go

**GO.**

The spec is complete, accurate against the existing `ssr.ts` implementation, and covers all seven Director checks. The `DataSource<T>` interface is implementable. Option A keeps arbor unchanged. The algorithm is fully specified. The drain idiom preserves the external API. The `engines` field is consistent with the project's actual minimum. All six tests are ready to write. No acceptance criteria are revised downward.

One clarifying annotation is needed in the Builder brief (the `walkDone` flag pattern) but this is implementation guidance, not a spec deficiency.

**Dispatch Builder 3.1 immediately.**

---

## §4 Plan 6.2 — Deep-Chain Signals: Assessment

### Check 1 — Root cause credibility

The Investigator's primary root cause claim: per-node mark-phase overhead (~8 ops vs alien's ~3–4 ops) plus the `visited[]` push.

This is credible and internally consistent. The Investigator traces through the exact code paths in `signal.ts:185–248` for aihu and `system.mjs:92–142` for alien-signals, counting operations per node explicitly. The structural difference is clear:

- Aihu `markOne` per node: reads DISPOSED, reads lastWave (dedup), reads RUNNING, writes lastWave, R-M-W `MARKED`, pushes to `visited[]`, R-M-W `STALE`, reads `subsHead`, pushes to mark stack. That is 8–9 distinct memory operations.
- Alien `propagate` per node (linear path): reads flags, OR-assigns `|= 32` (Pending), reads `sub.subs`, assigns `link`. That is 3–4 operations. No per-node array push on the linear path (alien uses an inline `{ value, prev }` stack only at fan-out points).

The gap calculation: 100 nodes × ~5 extra operations × ~4 ns/op = ~2 µs. The reported gap is 1.58 µs (4.00 – 2.42). The estimate is slightly generous but directionally correct. The secondary settle-phase overhead (100 `recomputeIfNeeded` calls, 99 short-circuiting) adds a further ~200–300 ns. Combined, the model accounts for the full gap.

**Root cause is credible. The Investigator's structural analysis is sound.**

### Check 2 — Option C viability vs ≥25% target

Option C's estimated improvement: ~400–500 ns (13% of 4.00 µs total), bringing aihu from 4.00 µs to ~3.50 µs. The Round 1 Director brief stated the target as "≤ 3.00 µs p50 (≥ 25% improvement)" — actually phrased as "≥ 333K ops/s" and "≤ 30% gap reduction" in `state-track-c.md`.

**Option C alone does NOT meet the ≥25% target.** 13% improvement to ~3.50 µs is materially below ≤ 3.00 µs.

However, Option C still makes sense as a first step for these reasons:

1. **Independent correctness value.** Option C's change (conditional `visited[]` push) is self-contained and low-risk. Landing it provides a clean measurement point confirming the settle-phase overhead hypothesis.

2. **Prerequisite for Option D.** Option C removes the `visited[]` overhead, validating that the model is correct before implementing the more complex Option D (hybrid linear-chain lazy pull). If Option C does NOT deliver the predicted ~500 ns, something is wrong with the model, and Option D should be paused for re-investigation.

3. **The ≥25% gate applies to the overall 6.2 deliverable, not to Option C in isolation.** The Investigator explicitly recommends "Option C first, then Option D" as a two-phase approach. Option D is estimated at an additional ~700–1000 ns improvement on top of Option C, potentially reaching ~2.8–3.2 µs (≥25% improvement, meeting the ≤ 3.00 µs target).

**Director ruling:** Accept the two-phase approach. Option C is Phase 0 (safe, low-risk, ~13% improvement). Option D is Phase 1 (required to hit the ≤ 3.00 µs gate). The 6.2 plan is not DONE until both phases are implemented and benchmarked. Option C alone does not close 6.2.

### Check 3 — Option C regression risk

The Investigator's per-gate risk analysis is thorough. Summary:

| Gate | Risk | Rationale |
|---|---|---|
| `cellx` (≤ 557 ns) | VERY LOW | L4 has `hasEffectSub = true` and stays in `visited[]`. L1–L3 are removed but were already no-ops. L4's `recomputeIfNeeded` triggers lazy pull from L3 → L2 → L1 via the existing `STALE` read path in `computed.ts:101–105`. |
| `wide-fanout-100` (≤ 5.15 µs) | NONE | All 100 computeds have `hasEffectSub = true`. Zero change to this workload's path. |
| `batched-writes-100` (≤ 2.86 µs) | NONE | Batched path uses `drainBatch`, not the non-batched settle path. |
| `dynamic-deps` (≤ 816 ns) | NONE | The computed has `hasEffectSub = true`. Not affected. |
| `creation-1to1000` (≤ 76.2 µs) | NONE | Graph construction only. |

The correctness argument for `cellx` is the most delicate. The key invariant: nodes not in `visited[]` must still have `STALE` set so that pull-on-read works. The spec correctly notes that STALE is set unconditionally (line 212 is unchanged); only the `visited.push` is conditional. This means when L4's `recomputeIfNeeded` calls `fn()` which calls `L3.read()`, L3 is STALE and triggers a pull to L2, which triggers a pull to L1. The pull chain works correctly. The empirical confirmation is `bun .team/phase-2-5/scratch/cellx-counter.ts` → TOTAL = 17 (the Investigator names this check explicitly in §7).

**Option C poses no credible regression risk to any gate workload.**

### Check 4 — Option B ruling validity for production

The Investigator rules out Option B (version counters) because "the value always changes in the bench." Is this ruling valid for production use cases where values DON'T always change?

For the specific `deep-propagation-100` workload, Option B provides zero benefit: every write changes the source value, so every version check returns "changed," and every downstream computed must recompute. The ruling is valid for this benchmark.

For production use cases where intermediate computeds produce stable outputs (e.g., `computed(() => Math.abs(src()))` where src toggles between 1 and –1), Option B would be valuable — it allows short-circuiting propagation when a computed's output value has not changed. This is the "equality-based memoization" pattern.

**However, this does not change the recommendation for Plan 6.2.** The target of Plan 6.2 is `deep-propagation-100`, where Option B provides no help. Option B is a different optimization (memoization of stable computed values) that addresses a different problem. It can be added as Plan 6.3 or as a follow-on to 6.2 Phase 1. It should not block or modify the current Option C → Option D recommendation.

The Investigator's ruling is correct for the stated target. The production-use case observation is a valid follow-on consideration but does not invalidate the ruling.

**Option B ruled out for Plan 6.2. Valid. No change to recommendation.**

### Check 5 — Architect spec needed for Option C, or direct Builder?

The Investigator's §7 specifies Option C at the implementation level:

- New flag constant: `HAS_EFFECT_SUB = 0x40` (with bit-clash check noted — must confirm no clash with `MARKED = 0x20`, `HAS_COMPUTED_DEPS = 0x80`)
- File 1 (`computed.ts:94`): `node.flags |= HAS_EFFECT_SUB` when effect subscribes
- File 2 (`signal.ts:211`): `if (sub.flags & HAS_EFFECT_SUB) visited.push(sub)` (STALE set unconditionally on line 212)
- Scope: ~10 lines across 2 files
- Bench validation gate: `deep-propagation-100` must improve ≥ 10% (≤ 3.60 µs); no gate regresses > 5%

**This is sufficient for a Builder to implement Option C directly without a separate Architect spec.** The change is ~10 lines in 2 files. The Investigator has already provided: the flag value, the two exact file:line locations, the correctness invariant (STALE unchanged), and the bench validation gate. Writing a separate Architect spec for this would add a round-trip without adding new design decisions.

**Option D does require an Architect spec** before a Builder can implement it. Option D introduces a new `PENDING` flag, a new `checkDirty`-style function, modified `markOne` branching, and a correctness requirement at diamond-merge points. These are non-trivial decisions that require a spec (per the Investigator's §4 recommendation: "The Architect should spec Option D as a second phase"). That Architect spec should be dispatched in Round 3 after Option C bench numbers are confirmed.

**Recommended: Builder implements Option C directly from the investigation report. Architect spec for Option D comes after Option C bench validation.**

---

## §5 Plan 6.2 — Next Step

**Phase 0 (Option C): Direct Builder with investigation report. No Architect spec needed.**

Builder brief for Option C:

- **Files to touch:** `packages/signals/src/computed.ts` and `packages/signals/src/signal.ts` only. No other files.
- **Change 1 — `signal.ts`:** Confirm the flag constant table. Current flags: `DISPOSED`, `RUNNING`, `MARKED`, `STALE`, `EFFECT`, `HAS_COMPUTED_DEPS`. The investigation uses `HAS_EFFECT_SUB = 0x40` (64). The Builder must verify no existing flag uses 0x40 before adding the constant. Update `markOne` at line 211: change unconditional `visited.push(sub)` to `if (sub.flags & HAS_EFFECT_SUB) visited.push(sub)`. Line 212 (`sub.flags |= STALE`) must remain unconditional.
- **Change 2 — `computed.ts`:** At the site where an effect subscriber is registered (line 94: `if ((observer.flags & EFFECT) !== 0) hasEffectSub = true`), also set the flag on the node: add `node.flags |= HAS_EFFECT_SUB` alongside the `hasEffectSub = true` assignment. Confirm the `node` reference is the correct computed node (not `observer`).
- **Bench gate:** Run `bun bench/signals/src/run.ts` (or equivalent) after implementation. Confirm: `deep-propagation-100` p50 ≤ 3.60 µs (≥ 10% improvement from 4.00 µs baseline). Confirm all five no-regression gates hold (≤ their respective floors from `state-track-c.md`).
- **Correctness check:** Run `bun .team/phase-2-5/scratch/cellx-counter.ts` — output must be `TOTAL = 17`.
- **All existing signal tests pass:** `packages/signals/tests/` suite must be fully green.
- **Bundle size:** `bun run size` must pass. Estimated delta: +15 to +30 B gz. Remaining headroom (172 B from 1.53 kB gz current vs 1.70 kB cap) is sufficient.

**Phase 1 (Option D): Architect spec dispatched in Round 3, after Option C bench numbers confirm the settle-phase hypothesis.** The Architect spec for Option D must cover:
- New `PENDING = 0x100` (or confirmed bit value) flag
- Semantics of Pending vs STALE on linear-chain interior nodes
- `checkDirty`-style function specification (signature, algorithm, termination condition)
- Correctness proof for the cellx diamond case (where eager and lazy paths must interoperate)
- Modified `markOne` branching: `head.nextSub === null` → set Pending only (no STALE, no `visited.push`); `head.nextSub !== null` → existing eager path
- Modified effect `notify()`: call `checkDirty` before `runEffect`
- Bench gates: `deep-propagation-100` p50 ≤ 3.00 µs; all five regression gates still hold

---

## §6 Plan 6.2 — Go/No-Go

**GO for Option C (Phase 0), contingent on bench validation.**

Conditions:

1. Builder implements Option C per the brief in §5.
2. Bench run confirms `deep-propagation-100` p50 improves ≥ 10% (≤ 3.60 µs). If it does NOT improve by ≥ 10%, the settle-phase overhead hypothesis is wrong and the Round 3 Director must be notified before Option D is specced.
3. All five regression gates confirmed green.
4. `TOTAL = 17` confirmed from `cellx-counter.ts`.

**Option C GO does NOT close Plan 6.2.** Plan 6.2 is closed only when `deep-propagation-100` p50 ≤ 3.00 µs. Option D (Phase 1) must follow Option C before 6.2 can be marked DONE.

**Option D: HOLD — pending Option C bench results. Architect spec for Option D dispatched in Round 3.**

---

## §7 Execution Order

### Parallelism assessment

Plans 3.1 (Builder) and 6.2 Option C (Builder) touch entirely different packages:

- 3.1: `packages/server/src/` and `packages/server/tests/` and `packages/server/package.json`
- 6.2: `packages/signals/src/` only

There are no shared files, no shared types, no cross-package imports, and no tooling conflicts. Both Builders can run simultaneously on the same branch (`feat/v1-ssr-signals`) with no risk of collision, as long as each commits only to its own package directory.

### Recommended dispatch sequence

**Round 2 — dispatch in parallel:**

1. **Builder 3.1** (Streaming SSR) — implement per spec `spec-3.1-streaming-ssr.md` with clarifications from §2 of this note.
2. **Builder 6.2-Phase0** (Option C signals) — implement per investigation report §7 and Builder brief in §5 of this note.

Both Builders land their commits. Round 2 Verifier runs:
- `packages/server/tests/` full suite
- `packages/signals/tests/` full suite + bench gates
- `bun run size` (both packages)
- git diff confirms no cross-package contamination

**Round 3 — after both Round 2 Builders confirm green:**

3. **Architect 6.2-Phase1** (Option D spec) — dispatched only if Option C bench results confirm ≥ 10% improvement on `deep-propagation-100`. If Option C underperforms, the Investigator must be re-opened before the Architect is dispatched.

### Branch exception condition (from Round 1)

Round 1 noted: "If 6.2 requires changes to public exports in `packages/signals/src/index.ts`, split to `feat/v1-signals-deepchain`." Option C adds only a flag constant and two internal flag operations — no public export changes. No branch split required for Option C. Option D may introduce a `checkDirty` function; if it becomes a public export (unlikely), revisit at that time.

---

## §8 Round 2 Summary

| Plan | Decision | Next agent | Notes |
|---|---|---|---|
| 3.1 Streaming SSR | **GO** | Builder 3.1 | Spec complete; clarify `walkDone` flag pattern in Builder handoff |
| 6.2 Phase 0 (Option C) | **GO** | Builder 6.2-Phase0 | Direct from investigation report; no Architect spec needed |
| 6.2 Phase 1 (Option D) | **HOLD** | Architect 6.2-Phase1 (Round 3) | Contingent on Option C bench confirmation |
| Option B (version counters) | **RULED OUT** | None | Correct ruling; valid production follow-on consideration, not a 6.2 concern |

**Both Round 2 Builders can be dispatched simultaneously. No sequencing constraint.**
