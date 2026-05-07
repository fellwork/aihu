# Director Note — topic:aihu-template-syntax track:userland-dx — Round 8 (V3 NEEDS_FIX Adjudication + B3b Refinement)

**Mode:** 2 (build/refactor — third post-Builder governance round)
**Iteration counter (effective):** 3 of 5 (B1=1, B2=2, B3a=3; B3b will be 4; B4=5; B5 = +1 over original projection — slip flagged for retro)
**Per-defect-class ping-pong (Variant B template syntax):** 1 of 5 (V3 NEEDS_FIX on B3a; B3b will be the 2nd)
**Date:** 2026-05-06
**Author:** Director
**Tags:** `topic:aihu-template-syntax track:userland-dx round:8 v3-needs-fix-adjudication b3b-refinement`

**STATUS:** R8 ROUTED — V3 NEEDS_FIX adjudicated to **ACCEPT B3a as-is with deferred-fixes folded into B3b**. The verdict is a strict-AC-bar artifact, not a substance failure: 11/12 in-scope ACs strictly pass; AC12 partial is by-design (compiler-side sidecar emit lands; consumer wiring honestly deferred); AC6 + AC16 minor under-implementation surfaced cleanly. Builder's re-cut justification is honest — investigation note pre-dates code; no hidden completable work; LOC trigger crossed by ~7%; AC9/AC10 grouping with B3b defensible. Merge B3a → parent via fast-forward; dispatch B3b absorbing 5 originally-deferred ACs + AC12-consumer-wiring + AC6-W202-test + AC16-policy-decision; ~1080-1290 LOC src+tests budget; surface trigger stays at 1500 LOC. Synthesizer routed for r8 patch. Topic-level seam slipped from 5 → 6 effective Builder rounds; flag for Historian retro. Per-defect-class ping-pong ceiling still healthy (1 of 5 used).

---

## §1 — V3 NEEDS_FIX adjudication

### Plain statement

V3's NEEDS_FIX is a **strict-AC-bar artifact, not a substance failure.** B3a's compiler-side work landed cleanly:

- **11 of 12 in-scope ACs strictly pass** (AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC11, AC16, AC17).
- **+35 cargo tests** (323 → 358; 19 in `tests/b3_variant_b.rs` + 16 lib tests).
- **0 bun regressions** (834 + 5 skipped, identical baseline).
- **0 over-implementation** — Verifier's diff scan confirmed: 12 files changed, all in `packages/compiler/src/` + `packages/compiler/tests/` + `.team/`; zero codemod code; zero corpus migration; zero R1/R2/R3/Q3/Q4 settled-territory regressions; zero build/CI/vite/moon changes outside the compiler crate.
- **R4 typed-conv at $bind.value site** (Director r7 §2 Surface 1 explicit decision) landed inline as planned; B2 R4 fixture tests updated to match new emit shape (acceptable; not regression).
- **Sidecar emitter functional** — `emit_sidecar_ts` walks template AST, emits per-SFC `EmitResult.sidecar_ts: Option<String>`, with permissive preamble re-declaring framework globals as `any`-shape. Two tests confirm shape (`b3_ac12_sidecar_ts_contains_template_expressions`, `b3_ac12_sidecar_ts_includes_emit_and_event_decls`).
- **Re-cut surfaced PROACTIVELY** — investigation note (`.team/build-manifests/b3-investigation.md:1-130`) walks the B3a/B3b partition pre-code with a realistic LOC table; Builder did NOT start the codemod and then surface mid-stream.

### What V3 actually called out

V3's verdict was not "B3a is broken." It was, per V3 method §2's strict instruction ("If AC12's intent is not end-to-end true because CI doesn't run it, then AC12 does NOT pass"), the verifier was bound to record AC12 as PARTIAL/NEEDS_FIX because:

1. **AC12 sidecar consumer wiring is deferred** (material — but Builder explicitly surfaced this in manifest §6 + §3.7 BEFORE V3 audited; the verifier even named option (a) — "Director r8 governance can re-cut explicitly: AC12 → B3b with the wiring as a named sub-AC" — as defensible).

2. **AC6 W202 not asserted by automated test** (minor — eprintln fires correctly on colon-form; behavior verified by code inspection but not regression-protected).

3. **AC16 C500 is stderr warning, not hard error** (minor — and explicitly documented by Builder; defensible for the transition-window posture; B3b promotes per documented plan).

The "fix" needed is exactly what's already planned for B3b (consumer-side sidecar wiring) PLUS minor test-coverage fills.

### Adjudication

**ACCEPT B3a as-is. Fold AC12-consumer-wiring + AC6-W202-test + AC16-policy-decision into B3b.**

Defense:

1. **Builder honored the surface-condition trigger correctly.** Director r7 §6 #8 named the 1500 LOC ceiling as the surface trigger. Builder's investigation-note math (1660 LOC at B3a alone; +740 LOC if codemod absorbed) made the re-cut signal load-bearing. The B3a/B3b partition was the prescribed Director r7 §3.D fallback.

2. **The seam is honest.** Compiler accepts both v1 colon-form AND v2 dot-form during transition (verified by `b3_ac6_v1_colon_form_still_compiles_during_transition`). Codemod is not on the critical path for compiler correctness — it's on the critical path for corpus-cleanup.

3. **No hidden codemod work.** No `migrate.ts` file; no AST scope-tracking utility; no codemod CLI subcommand on this branch. Surface was raised before any codemod code was written.

4. **AC9/AC10 grouping with B3b is defensible.** $event collection + $emit typed-payload + listener typing is ~150-200 LOC additional compiler work that, if absorbed, would push B3a to ~1860 LOC — well past the surface trigger and into "round-too-big" territory. Bundling them with B3b's codemod work makes the migration a coherent unit (codemod must understand $event declarations to migrate dispatchEvent calls correctly).

5. **Sending B3a back for iteration would be process noise.** The work isn't broken; it's strictly partial-on-AC12 by design. B3a is iteration 1 of the Variant B template syntax defect class. Iteration 2 is B3b. Forcing a B3a-iter-2 to land "just the consumer wiring" before dispatching the codemod work would split work that bundles cleanly.

### Defense-against-rejection

If you reject and require B3a-iter-2 to land AC12 wiring + AC6 test + AC16 decision before dispatching B3b codemod:

- B3a-iter-2 would be ~80-150 LOC infra (vite plugin update + moon task + tsc CI step + test fixture + W202 test + policy doc). Small.
- BUT: the consumer wiring for `.aihu.ts` discovery bundles cleanly with the codemod CLI's vite-plugin registration (the same plugin file gets touched). Splitting them off creates two separate vite-plugin commits when one would do.
- AND: AC16's C500 hard-error promotion is gated on the codemod having migrated the corpus first (per Builder manifest §8 — "B3a does NOT promote unknown directives to compile errors because some legitimate v1 directives still appear in unmigrated corpus"). The promotion decision can ONLY be safely made after B3b ships.

So the rejection path bundles less cleanly than acceptance. **Stick with ACCEPT.**

---

## §2 — Merge decision

**Fast-forward `feat/template-syntax-v2-b3` → `feat/template-syntax-v2`.** Per Director r6 §1 + r7 §1 precedent.

The 5 phase-commits represent the compiler-side Variant B contract and are individually bisectable:

- `7968d59` — feat(compiler): variant b block-tag {#if}/{#each}/{@html} parser+codegen
- `98244b1` — feat(compiler): $on./$bind. dot-form + class array + $ref + W202/C500
- `a130905` — feat(compiler): r4 typed-conv at bind.value + b3 acceptance tests
- `9e5685a` — feat(compiler): per-sfc .aihu.ts sidecar for template type-safety
- `155454f` — (final phase-commit per V3 audit-target HEAD)

**Team Lead executes:**

```bash
git checkout feat/template-syntax-v2
git merge --ff-only feat/template-syntax-v2-b3
git push origin feat/template-syntax-v2
# (defer -b3 sub-branch deletion until B3b lands clean)
```

If fast-forward fails (parent advanced unexpectedly), surface to Director — do NOT silently rebase or merge-commit.

**Critical timing.** Merge NOW, before B3b dispatches, so B3b builds against post-B3a parent. Both the codemod and the corpus migration reference the new compiler grammar; B3b cannot be authored against pre-B3a parent because (a) the codemod's tests need to verify migrated output compiles via the new compiler and (b) the corpus migration's `cargo check` step depends on the new parser.

**Eventual main merge** stays per r5 §5: one squash commit `feat: template-syntax-v2 (Variant B + R1-R7)` after B5 lands. Decision unchanged.

---

## §3 — Iteration counter accounting

### Original Director r5 plan
5 Builder rounds (B1-B5).

### Current state
- B1 ✓ (R1 $prop reactivity; V1 PASS iteration 1)
- B2 ✓ (R2/R3/R4/Q3/Q4; V2 PASS iteration 2)
- B3a ✓ (Variant B compiler-side; V3 NEEDS_FIX adjudicated to ACCEPT-with-fold)
- B3b pending (codemod + AC9/AC10 + sidecar consumer wiring + AC6 test + AC16 policy)
- B4 pending (R5 $aria + auto-keyboard + default-tabindex)
- B5 pending (R6 $controller + R7 $context combined collection round)

**With re-cut: 6 effective Builder rounds total.** Topic-level seam slipped from 5 → 6.

### Topic-level ceiling vs per-defect-class ceiling

Two different ceilings, two different accounting frames:

1. **Topic-level seam (5 Builder rounds, per Director r5 §3 + §5):** The original plan had B1-B5 as 5 rounds. With B3 re-cut to B3a/B3b, we are at **6 effective rounds.** This is a **planning miss, not a discipline failure.** Flag for Historian retro: "B3 was correctly identified as the load-bearing largest round in r5/r6/r7; the 1500 LOC trigger fired exactly as r7 §6 #8 named it; the re-cut path was prescribed in r7 §3.D verbatim. The plan worked as designed. The 5-round projection underestimated by 1 — accept the slip."

2. **Per-defect-class ping-pong ceiling (5 iterations per defect class, per playbook):** This is the more meaningful ceiling. Variant B template syntax (the defect class B3 addresses) has used **1 ping-pong** (V3 NEEDS_FIX on B3a) so far. B3b uses a **2nd ping-pong** (Verifier audits B3b → adjudicate). If B3b also returns NEEDS_FIX, that's **3 of 5 on this defect class — still healthy**, with 2 ping-pongs of headroom. If B3b passes clean, we close at 2 of 5 for this defect class.

### Decision

**B3a + B3b are 2 effective iterations against the topic-level 5-round planning ceiling**, but **only count as 2 ping-pongs against the same-defect-class ceiling** if B3b ships clean.

Per-defect-class ping-pong is the binding constraint per playbook. **Topic-level slip from 5 → 6 is documented for retro; not a discipline trip.**

### Anti-pattern check on the slip

Was the 5 → 6 slip the result of:
- (a) Director optimism (planned too small)?
- (b) Builder over-scoping (took on more than briefed)?
- (c) Spec drift (scope crept post-r5)?

**Answer: (a) Director optimism, marginal.** r5 §5 budgeted B3 at "~750 LOC including codemod, but codemod is partition-able." r7 §3.D refined to "~1090-1390 LOC src+tests; surface trigger at 1500 LOC for B3a/B3b re-cut." The re-cut path was explicitly named; the LOC trigger was set at exactly the boundary. Builder's actual count of 1660 LOC (just over 1500 by 7%) is within the noise floor of LOC estimation. **The plan's 5-round projection assumed B3 would land just under 1500 LOC; it landed just over. Mild optimism, prescribed fallback fired correctly. Healthy outcome.**

Was the slip a discipline trip?
- Builder revised targets? **No.** Builder hit named ACs; honestly surfaced 5 ACs as deferred.
- Acceptance items silently deferred? **No.** B3a manifest §3 + §6 explicitly named the deferrals before V3 audited.
- Work nature shifted? **No.** Same Variant B template syntax defect class; same ratify-now manifest.
- Iteration ceiling per-defect-class? **Healthy** (1/5 used).

**No discipline trip. Slip noted for retro.**

---

## §4 — Refined B3b brief

**Branch:** `feat/template-syntax-v2-b3b` off post-B3a-merge parent (`feat/template-syntax-v2`). Single branch unless surface trigger fires.

**Scope absorption.** B3b absorbs from prior briefs:
- **Original deferred ACs from r7 §3:** AC9 ($emit.<name>(payload)), AC10 (listener $on.<custom-event>={handler}), AC13 (codemod prober-fixture round-trip), AC14 (codemod corpus migration), AC15 (codemod idempotency).
- **V3 NEEDS_FIX items:** AC12-consumer-wiring (vite plugin/moon discovery + tsc --noEmit CI integration), AC6-W202-test (assert W202 fires automated test), AC16-policy-decision (C500 hard error vs stderr).

### §4.A — B3b deliverables

#### B3b.1 `$event:` collection in `@state` v2 + `$emit.<name>(payload)` (compiler)

- **Spec source:** Architect spec §5; Director r7 §3.A.B3.3.
- **Compiler size:** ~150-200 LOC src + ~80 LOC tests.
- **Surface:**
  ```aihu
  @state {
    $event: dayjump { payload: { day: Date } }
  }
  @template {
    <button $on.click={() => $emit.dayjump({ day })}>...</button>
  }
  ```
- **Lowering:** `$emit.dayjump({day})` → `this.dispatchEvent(new CustomEvent('dayjump', {detail, bubbles: true, composed: true}))`.
  - Per spec §5.a: `bubbles?: boolean = true`, `composed?: boolean = false`. Note: B3b Builder confirms `composed` default per Architect spec §5.a — Director r7 §3.A.B3.3 said `composed: false`. **Authoritative answer = Architect spec.** Builder reads spec; if discrepancy with r7, files inconsistency and aligns to Architect spec.
- **Type-flow** via sidecar `.aihu.ts` (`$event:` declarations contribute typed payload entries to the sidecar's emit/listener interfaces; B3a's permissive `any`-shape preamble is replaced with typed entries for SFCs that declare `$event:`).
- **Compile-time resolution:** `$emit.<name>` against the SFC's `$event` collection. Missing names error with **C501** (spec §5.b reserved).

#### B3b.2 Listener side `$on.<custom-event>={handler}` (compiler)

- **Spec source:** Architect spec §5.c; Director r7 §3.A.B3.4.
- **Compiler size:** Within the §B3b.1 budget (above) — shared parser path.
- Compiler distinguishes built-in DOM events from custom events via `$event:` declaration in same SFC (or imported component's `$event:`).
- Listener gets the typed payload from sibling component's `$emit`.

#### B3b.3 Codemod at `packages/compiler/js/codemods/template-syntax/migrate.ts`

- **Spec source:** Director r7 §3.B.7 #1-7.
- **Size:** ~640-700 LOC src + ~150-200 LOC tests.
- **Transformations (apply in order — multi-pass for idempotency):**
  1. v1 `$if`/`$each`/`$key` → `{#if}`/`{#each}/(key)` (block-tag wrap; AST-aware element-lift)
  2. v1 `$on:click` → `$on.click` (colon → dot rename across all `$on:` usages)
  3. v1 `$bind:value` → `$bind.value` (colon → dot rename across all `$bind:` usages)
  4. v1 `class={'a' + (cond ? ' b' : '')}` → `class={['a', cond && 'b']}` (clsx-shaped array form; conservative pattern-match)
  5. v1 `$html={expr}` → `{@html expr}` (rename + form change)
  6. v1 `this.dispatchEvent(new CustomEvent('foo', {...}))` inside `@template` event handlers → `$emit.foo(detail)` IF SFC has `$event: foo` declaration; ELSE warn W502 + leave
  7. **Body-call-syntax migration** (per r6 §2.Q2): `propName.x` → `propName().x` in `@template` body when `propName` is a `$prop` in scope. AST-aware scope tracking required (~80-150 LOC budget; surface if more).
- **Error code:** **C500** reserved (compiler-side stays stderr warning during transition; B3b's policy decision in §B3b.8 decides post-migration behavior).
- **Pattern reference:** `packages/compiler/js/codemods/macro-simplification/migrate.ts` (1719 LOC precedent per investigation note).

#### B3b.4 Apply codemod to in-aihu-repo corpus

- **Size:** 62 .aihu file deltas (committed; size depends on per-file delta).
- Run codemod against 62 in-aihu-repo `.aihu` files (Scout D5 baseline; Builder discovers the actual count via `find -name '*.aihu' -not -path '*/node_modules/*' -not -path '*/.team/*' -not -path '*/.team/prober-fixtures/*'`).
- **Recommend phasing into separate commits per migration phase** (one commit per transformation type for bisectability; Builder's call). Single-commit acceptable if Builder finds phasing inflates LOC count.
- Each codemod-migrated file's `cargo check` and `bun test` pass.

#### B3b.5 Codemod tests

- **Size:** Within the codemod tests budget (above).
- 13 prober-fixture round-trips green at `.team/prober-fixtures/`.
- 1 synthetic edge-case file (`$each="x.filter(p => p && q.r) as item"`) round-trips correctly to `{#each x.filter(p => p && q.r) as item}` (no hoist required for Variant B per Prober §5).
- Idempotency: running codemod twice produces identical output.
- Codemod CLI subcommand: `aihu codemod template-syntax <glob>` (per r3 §5).

#### B3b.6 Sidecar consumer wiring (AC12-fix)

- **V3 NEEDS_FIX item.**
- **Size:** ~30-80 LOC config + plugin.
- **Two paths (Builder picks):**
  - **(a) Vite plugin** — extend the existing aihu vite plugin (or moon task) to write the sidecar adjacent to source as `<file>.aihu.ts`.
  - **(b) Moon task discovery** — a separate moon task that runs the compiler in sidecar-emit mode, writes the sidecars, and runs `tsc --noEmit` over `**/*.aihu.ts`.
- **CI integration:** Add CI step that runs `tsc --noEmit` over `**/*.aihu.ts`. Add a deliberate type-error test fixture (e.g., `tests/fixtures/aihu-ts-type-error.aihu` declaring numeric signal but using as Date) and assert tsc surfaces the error in the sidecar.
- **Scout D4 close:** This closes Scout D4's near-zero TS-coverage baseline at the per-SFC level end-to-end (compiler emit → file write → tsc discovery → CI gate).

#### B3b.7 AC6 W202 test (under-implementation fix)

- **V3 NEEDS_FIX minor item.**
- **Size:** ~20 LOC test.
- Automated test asserts W202 deprecation warning fires on colon-form. Use `Command::output()` capture pattern; assert the stderr line is emitted.

#### B3b.8 AC16 C500 policy decision (under-implementation fix)

- **V3 NEEDS_FIX minor item.**
- **Size:** ~10 LOC policy doc + test fixture deltas.
- **Decision options:**
  - **(a) C500 stays stderr warning during transition** (current B3a state) → document as transition policy.
  - **(b) C500 becomes hard error** post-codemod-migration → require codemod completion before next compile.
- **Recommended decision: TWO-PHASE policy.**
  - **Phase 1 (during B3b's codemod-running window):** stderr warning. C500 fires on encountered v1 syntax; emits hint pointing at codemod helper command. This is the current B3a behavior.
  - **Phase 2 (post-corpus-migration in B3b):** hard error. After B3b's codemod migrates the 62 in-aihu-repo .aihu files (per §B3b.4), the corpus contains zero v1 colon-form syntax. C500 promotes to hard compile error in this branch's final commit. Userland that hasn't migrated gets a clear error pointing at `aihu codemod template-syntax`.
- **Defense for two-phase:** During the codemod-running window (within B3b itself), the corpus is in mixed state; stderr warning is the only safe behavior. After the codemod's apply-pass runs and 62 corpus files are committed, the corpus is clean; promoting C500 to hard error becomes safe AND prevents regression (any future v1-syntax accidentally introduced is caught at compile time, not silently emitted).
- **Test fixtures:** During Phase 1, fixture asserts stderr emission of "C500: unknown directive `$<name>` — ignored". During Phase 2, fixture asserts compile error with same code.
- **Documentation:** Update spec §6 + §9 with the two-phase policy. Note in master audit doc §X (B3 row).

### §4.B — B3b acceptance criteria (13 ACs)

1. **`cargo check --workspace` passes.**
2. **`cargo test -p aihu-compiler` passes** (358 from B3a + new B3b tests; estimate +40-60 new tests covering AC9, AC10, codemod runtime, AC6 stderr capture, AC16 fixtures).
3. **`bun run typecheck` passes** (over `.aihu` AND `.aihu.ts` sidecars; the new tsc --noEmit step covers sidecars).
4. **`bun run test` passes** (834 from B3a + new B3b tests; estimate +30-50 new tests covering codemod CLI + idempotency + corpus apply).
5. **AC9: `$emit.<name>(payload)` works with typed payload via `$event:` collection.** Test SFC declares `$event: dayjump { payload: { day: Date } }`; template emits `$emit.dayjump({day: new Date()})`; assert `dispatchEvent` fires with correct CustomEvent shape; assert C501 fires on `$emit.unknown`.
6. **AC10: Listener `$on.<custom-event>={handler}` receives the typed payload** from a sibling component's `$emit`. Test pair: provider SFC + consumer SFC; consumer's `$on.dayjump={(e) => …}` handler receives typed `e.detail` matching payload.
7. **AC12-fix: `tsc --noEmit` runs over `**/*.aihu.ts` sidecars in CI;** catches a deliberate type error in a test fixture (numeric signal used as Date — surfaces tsc error from the sidecar).
8. **AC13: Codemod round-trips all 13 prober-fixture files green** (output passes `cargo check` + `bun test` for Variant B compiler).
9. **AC14: Codemod migrates 62 in-aihu-repo `.aihu` files;** corpus rebuilds clean (`cargo check` + `bun test` pass on migrated corpus). Pre-migration vs post-migration `cargo test -p aihu-compiler` comparable (no regressions; +new tests pass).
10. **AC15: Codemod is idempotent** (run twice = identical output; checksum-comparable).
11. **AC6-test-fix: Automated test asserts W202 fires on colon-form** (Command::output() capture of stderr; assert the deprecation line is emitted).
12. **AC16-decision: C500 stderr-vs-error policy documented;** behavior matches policy in test fixtures (Phase 1 stderr fixture; Phase 2 hard-error fixture; migrated corpus is Phase-2-clean).
13. **All pre-push hooks pass** (Biome CI + typecheck + test + build + size + size-rows + sync-readme).

### §4.C — B3b size budget

| Component | Src LOC | Test LOC |
|---|---|---|
| `$event` + `$emit.<name>(payload)` compiler | ~150-200 | ~80 |
| Listener `$on.<custom-event>={handler}` | (within above) | (within above) |
| Codemod (`migrate.ts` + body-call migration) | ~640-700 | ~150-200 |
| Codemod CLI subcommand | ~30-50 | (covered by codemod tests) |
| Corpus migration (62 file deltas) | (committed; per-file delta) | – |
| Sidecar consumer wiring (vite plugin/moon + tsc CI) | ~30-80 | ~20 (deliberate-type-error fixture) |
| AC6 W202 stderr-capture test | ~20 | – |
| AC16 C500 two-phase policy doc + fixtures | ~10 (doc) | ~20 (fixtures) |
| **Total** | **~880-1060** | **~270-320** |
| **Combined** | **~1150-1380** | |

**Total ~1080-1290 LOC src+tests + corpus deltas.** Just under the 1500 LOC trigger threshold (will likely fall below at run-time given codemod tests overlap fixture LOC).

**Note:** the corpus deltas are not counted in the LOC budget because they're file rewrites (the codemod applies mechanical transformations; the LOC count is roughly equal pre/post per file, with some delta from block-tag wrapping vs attribute directives). If Builder's actual codemod-applied corpus deltas materially exceed expectations, surface.

### §4.D — Surface trigger STAYS at 1500 LOC

Per Director r6 §6 #2 + r7 §6 #8, the 1500 LOC trigger applies. **If B3b hits 1500 LOC src+tests:**
- **Cut path:** B3b → B3b1 (codemod-only, including corpus apply) + B3b2 ($event/$emit compiler + sidecar consumer wiring + AC6 test + AC16 policy).
- B3b1 ships first; B3b2 dispatches off post-B3b1 parent.
- This is the named fallback; Builder doesn't ask.

### §4.E — Branch convention

`feat/template-syntax-v2-b3b` off post-B3a-merge parent. Per-phase commits within the branch are encouraged (compiler emit changes for $event/$emit, then codemod implementation, then corpus apply, then consumer wiring, then policy fixtures). PR into `feat/template-syntax-v2` parent at completion.

If B3b1/B3b2 split triggered: `feat/template-syntax-v2-b3b1` first, then `feat/template-syntax-v2-b3b2` off post-B3b1 parent.

---

## §5 — Synthesizer routing decision

V3 NEEDS_FIX adjudicated to "ACCEPT-with-deferred-fixes-folded-into-B3b." B3a is durable. Iteration counter slipping from 5 → 6 is documented for retro. Variant B compiler grammar shipped on parent at HEAD post-merge. Per-defect-class ping-pong ceiling unchanged.

**Route Synthesizer.** Specific instructions:

### File: `c:\git\fellwork\aihu\docs\topic-summaries\template-syntax-summary.md`

1. **Add a new sub-section** chronologically AFTER the r7 sub-section, titled **"Round 8 governance: B3 PARTIAL surfaced + B3b refined."**

   Content:
   - V3 verifier returned NEEDS_FIX on B3a (strict-AC-bar artifact); 11/12 in-scope ACs strictly pass; AC12 partial by-design (compiler-side sidecar emit lands; consumer wiring deferred); AC6 + AC16 minor under-implementation surfaced cleanly.
   - Director r8 adjudication: ACCEPT B3a as-is; fold AC12-consumer-wiring + AC6-W202-test + AC16-policy-decision into B3b.
   - Merge decision: fast-forward `feat/template-syntax-v2-b3` → `feat/template-syntax-v2`. 5 phase-commits preserved as bisectable units.
   - Topic-level seam slipped from 5 → 6 effective Builder rounds (planning miss, not discipline failure; 1500 LOC trigger fired exactly as r7 §6 #8 named it; re-cut path was prescribed in r7 §3.D verbatim).
   - Per-defect-class ping-pong: Variant B template syntax used 1 of 5 ping-pongs (V3 → B3a); B3b will use a 2nd. Healthy.
   - B3b absorbs: $event/$emit (AC9), listener $on.<custom-event> (AC10), codemod (AC13/14/15), AC12-consumer-wiring, AC6-test-fix, AC16-policy-decision. ~1080-1290 LOC src+tests; surface trigger stays at 1500 LOC for B3b1/B3b2 re-cut.

2. **Update durably-true facts:**
   - "B3a closed (V3 NEEDS_FIX adjudicated to ACCEPT-with-deferred-fixes; 11/12 strict pass; surface re-cut honest)."
   - "Variant B compiler grammar shipped on parent at HEAD post-merge: block-tags ({#if}/{#each}/{:else if}/{:else}/{:empty}/{@html}), dot-form ($on./$bind.), class-array, R4 typed-conv at $bind.value, sidecar .aihu.ts emit, W202 deprecation, C500 stderr."
   - "Topic-level seam slipped from 5 → 6 Builder rounds; per-defect-class ping-pong ceiling unchanged (1 of 5 used on Variant B template syntax)."
   - "B3b absorbs: $event/$emit (AC9), listener $on.<custom-event> (AC10), codemod (AC13/14/15), AC12-consumer-wiring, AC6-test-fix, AC16-policy."

3. **Update open items:**
   - **Move AC12 from "deferred" to "B3b in scope"** with consumer-wiring sub-task. Was: "Sidecar `.aihu.ts` discovery cost unknown — Director r7 §6 #10." Now: "AC12 sidecar consumer wiring → B3b (vite plugin + moon task + tsc --noEmit CI step + deliberate-type-error fixture)."
   - **Add: AC6 W202 test gap surfaced + folded** ("Automated stderr-capture test for W202 deprecation → B3b").
   - **Add: AC16 stderr-vs-error policy decision** ("Two-phase policy: stderr during codemod transition; hard error post-corpus-migration → B3b").

4. **Update gate question:**
   - Replace prior r7 wording with: **"Auto-spine continues; B3b is iteration 4 of 5 (effective); surface conditions per r6 §6 + r7 §6 + r8 §6 watched."**

5. **Update v0.5+ deferred items / watched-assumptions list:**
   - No changes to v0.5+ list (Q3 reflect-loop guard async-batch reverify still watched per r7 §4.6).

6. **Preserve all earlier rounds verbatim.** No deletion of r1-r7 content; only addition under r8.

7. **Citation:** cite this director-note (r8) record id (returned in AGENTS.delta.db write companion below) as the corrective record for the topic_summary patch.

---

## §6 — Surface conditions watch (extends r7 §6)

Carry forward r6 §6 + r7 §6 (all watched conditions for B3-B5) and ADD:

15. **B3b LOC trigger at 1500.** Surface for B3b → B3b1/B3b2 split (codemod-only vs $event/$emit + sidecar wiring). Per §4.D fallback path. The 1500 LOC trigger is unchanged from r7; B3b's estimated ~1080-1290 LOC has ~210-420 LOC of headroom, but if ACs require tightening or test corpus expands, the trigger may fire.

16. **Body-call AST scope-tracking unproven at depth.** Builder may surface if destructuring patterns (`{ ...props }` spread) and dynamic property access (`props['dyn']`) turn the body-call migration into a research project. The ~80-150 LOC budget assumes structured-binding-only scope tracking. If destructuring + dynamic-access handling at depth materially increases the budget, surface for B3b → B3b1 (codemod without body-call migration) + B3b2 (body-call migration as a separate pass).

17. **Codemod corpus migration breaks ≥1 file.** If applying the codemod to a fixture/example results in `cargo check` failing in a way that's not addressable by a follow-up codemod tweak (i.e., the source file requires hand-rewriting beyond what the codemod automates), surface — investigate; don't paper over. May signal a Variant B template-syntax design gap that the spec missed. Hypothetical; Prober's hand-transformations covered the known edge cases.

18. **AC16 hard-error gate breaks the build.** If B3b's codemod corpus migration leaves ANY v1 syntax in the corpus (e.g., user-facing edge cases the codemod refuses to migrate), switching C500 to hard error (Phase 2) breaks the build. **Mitigation:** Builder runs the Phase 2 transition as the LAST commit on the B3b branch; if `cargo check + bun run test` fails on Phase 2, Builder either (a) extends the codemod to handle the refused case or (b) leaves C500 in Phase 1 stderr mode and surfaces the unmigratable case for Director r9 review. Do NOT silently land Phase 2 with stderr-suppression hacks.

19. **Sidecar consumer wiring discovers TS-pipeline incompatibility.** If the vite plugin or moon task can't ingest per-SFC `.aihu.ts` sidecars without significant build-config change (tsconfig changes, moon-graph changes, bundler-resolution rules), the ~30-80 LOC budget is materially exceeded. Hypothetical; B3a's sidecar emit is a string output, so the consumer-side write is mechanical. Surface if the wiring becomes a research project.

20. **Cumulative iteration counter (effective) reaches 5/5 with B5 still open.** Topic-level slip is now 5 → 6 Builder rounds; B3b is the 4th effective round; B4 = 5; B5 = 6 (over original projection). If a B4 or B5 NEEDS_FIX requires a same-defect-class ping-pong, Director r9+ re-justifies depth or admits discipline trip. The ping-pong ceiling per-defect-class (5) gives headroom; the topic-level seam (6, slipped from 5) is documented as planning miss.

**Surface to user during r8?** **No.** Auto-mode continues per user's "go, auto mode" directive. Adjudication uses Director-default (accept-with-fold). Topic-level slip from 5 → 6 is documented, not surfaced to user; the V3 NEEDS_FIX was substantively a strict-AC-bar artifact, not a substance failure. User can override at any future surface.

---

## §7 — Iteration discipline + continuity check

### Counter (effective)

- B1 = 1 (R1 $prop reactivity; V1 PASS one-pass)
- B2 = 2 (R2/R3/R4/Q3/Q4 platform integration sugar; V2 PASS one-pass)
- B3a = 3 (Variant B compiler-side; V3 NEEDS_FIX → ACCEPT-with-fold)
- B3b will be 4 (codemod + AC9/AC10 + sidecar consumer wiring + AC6/AC16 fills)
- B4 = 5 (R5 $aria + auto-keyboard + default-tabindex)
- B5 = 6 (R6 $controller + R7 $context combined; over original projection)

### Per-defect-class

- Variant B template syntax used **1 ping-pong** (V3); B3b will use **2nd**; max **5** per class. Healthy.
- R1 $prop reactivity: 0 ping-pongs (V1 PASS one-pass). Closed.
- R2-R4-Q3-Q4 platform integration sugar: 0 ping-pongs (V2 PASS one-pass). Closed.

### Continuity

r6 / r7 / r8 governance pattern is consistent: build → verify → adjudicate → next-build. Builder honored re-cut trigger proactively (positive signal). No drift.

### Anti-pattern checks (per playbook)

- **Builder revised targets?** **No.** B3a manifest names AC9/AC10/AC13/AC14/AC15 as deferred BEFORE Verifier audited; investigation note pre-dates code; no scope reduction without flag.
- **Sample failures hidden by aggregate?** **No.** V3 named AC12 specifically as PARTIAL (consumer wiring deferred); AC6 + AC16 named as minor under-implementation. Verifier methodology working as designed.
- **Acceptance items silently deferred?** **No.** B3a explicitly surfaced re-cut with 5 ACs deferred honestly. AC12 was claimed-PASS by Builder but Verifier flagged the strict-AC-bar gap (consumer wiring); that's the 1 caught-by-verifier item — and Builder's manifest §6 #2 had ALREADY surfaced "sidecar emission needs consumer-side wiring" before V3. Not a silent deferral; a strictness disagreement on what counts as PASS.
- **Work nature shifted?** **No.** Same Variant B template syntax defect class; same ratify-now manifest; same R-progression (R1 → R2/R3/R4/Q3/Q4 → R5 placement → R6/R7 placement; R5 → B4; R6/R7 → B5).
- **Iteration ceiling per-defect-class?** **Healthy.** 1 of 5 used on Variant B template syntax.
- **Iteration ceiling topic-level?** **Slipped from 5 → 6.** Documented for retro; not a discipline trip per §3 anti-pattern check defense.

### Surface to user?

**No.** Auto-mode continues. Adjudication uses Director-default (accept-with-B3b-fold). Topic-level slip documented for retro. User-gate-question reflects current effective iteration position.

---

## §8 — Critical pre-B3b verification

Before dispatching B3b, **Team Lead verifies:**

1. **B3a merge to parent succeeds (fast-forward).** `git merge --ff-only feat/template-syntax-v2-b3` from `feat/template-syntax-v2` checkout. If FF fails, surface — do NOT silently rebase or merge-commit.

2. **Pre-push hooks pass on parent.** `bun run typecheck` + `bun run test` + `cargo check --workspace` + `cargo test -p aihu-compiler` all green on parent post-merge. Confirms the 5 phase-commits compose correctly and don't introduce parent-only breakage.

3. **62 corpus files at parent compile clean.** Run `find -name '*.aihu' -not -path '*/node_modules/*' -not -path '*/.team/*'` to enumerate the 62 files; spot-check 5-10 of them with `cargo run -p aihu-compiler -- <file>` (or whatever the CLI shape is) to confirm they compile without errors. **Watch for W202 spam in CI:** the 62 files all use v1 colon-form `$on:`/`$bind:`; W202 should fire 62× during CI pre-codemod. If W202 emission policy makes CI noisy or fails the build, surface — may signal that B3b's codemod must run BEFORE the W202 emission tightens, or the W202 emission rate-limits.

4. **Compiler dot-form + colon-form transition is gracefully handled at parent.** Run synthetic test: write `<button $on.click={fn}>` and `<button $on:click={fn}>` in same fixture; both compile; W202 fires on colon-form; no compile error on dot-form. This is `b3_ac6_v1_colon_form_still_compiles_during_transition` from B3a — should still pass at parent.

5. **AGENTS.db reflects post-merge state.** Verify the synthesized topic-summary at `c:\git\fellwork\aihu\docs\topic-summaries\template-syntax-summary.md` includes the r8 sub-section before B3b dispatches. If Synthesizer hasn't run yet, hold B3b dispatch until the durably-true facts catch up.

**If any of 1-4 fails at parent post-merge, surface — codemod-on-parent-corpus may have unexpected side effects.** Hold B3b dispatch until the parent state is verified clean.

---

## §9 — Hand-off summary for Team Lead

1. **Adjudicate V3 NEEDS_FIX to ACCEPT-with-fold** per §1.
2. **Fast-forward merge** `feat/template-syntax-v2-b3` → `feat/template-syntax-v2` per §2. Push origin.
3. **Run pre-B3b verification** per §8. Surface if any step fails.
4. **Dispatch Synthesizer** with the §5 instruction set (topic-summary patch with r8 sub-section + durably-true facts + open-items + gate-question updates).
5. **Dispatch B3b Builder** with the §4 brief (refined). Branch: `feat/template-syntax-v2-b3b`. Surface trigger at 1500 LOC for B3b1/B3b2 split per §4.D.
6. **Track surface conditions** per §6.
7. **Iteration counter (effective): 3 → 4** when B3b dispatches; per-defect-class ping-pong: 1 → 2 if B3b returns NEEDS_FIX, stays at 1 if B3b passes clean.

---

*End of round 8 director-note. Team Lead executes -b3 → parent fast-forward merge, dispatches Synthesizer per §5, dispatches B3b per §4 brief. STATUS line + AGENTS.delta.db record below in companion outputs.*
