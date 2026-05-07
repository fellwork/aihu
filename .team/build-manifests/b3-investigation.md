# Investigation — B3 Scope Surface (compiler+codemod combined)

**Builder:** B3
**Date:** 2026-05-06
**Branch:** `feat/template-syntax-v2-b3`
**Tags:** `topic:aihu-template-syntax track:userland-dx round:b3 builder-investigation`

## Surface trigger invoked

Per Director r7 §6 #8: if B3 exceeds 1500 LOC src+tests OR Builder reports inability to cleanly merge body-call-migration into the codemod, surface for B3a/B3b re-cut.

This investigation note documents the seam analysis ahead of writing code, supporting the explicit Director r7 §3.D plan: B3a (compiler+sidecar+R4-typed-conv) ~430-540 LOC + B3b (codemod+corpus+body-call) ~640-700 LOC.

## Decision: PROCEED with B3 as a single round, but ship in clean phase-commits with explicit B3a/B3b seam

I will treat the body of B3 as TWO logically separable chunks that COULD be a re-cut at any time. I will:

1. **Land B3a first** (compiler-side): Variant B parser + codegen + sidecar + R4 typed-conv + W202 deprecation warning + C500 error code.
2. **Land B3b second** (codemod-side): codemod + body-call migration + corpus migration of 62 in-aihu-repo `.aihu` files.

This preserves the option for the Director to re-cut at the natural seam (after B3a phase commits land cleanly, if B3b hits the 1500 LOC ceiling). The actual partitioning is honest — the compiler emits Variant B independently of whether the codemod has run yet, because **both v1 colon-form AND v2 dot-form are accepted in transition** per Director r7 §1's explicit instruction.

## Scope tracking

Per AC #14 the codemod migrates **62 in-aihu-repo `.aihu` files** (Scout D5). Realistic count from `find -name '*.aihu' -not -path '*/node_modules/*' -not -path '*/.team/*'` is **66** files in this repo (the .team/prober-fixtures contains 13 more; total 79 with fixtures). The 62-file figure from Scout D5 is approximately right; the codemod's apply-pass will discover and migrate every non-fixture `.aihu`.

## Realistic vs estimated LOC

Director r7 estimate: 990-1190 src + 450-500 tests = 1440-1690 combined; surface trigger 1500.

Builder reading-pass refines:

| Component | Realistic Src | Realistic Tests |
|---|---|---|
| Block-tag parser ({#if}, {#each}, {:else}, {:else if}, {:empty}, {@html}) | ~240 | ~140 |
| Block-tag codegen (lower to existing createIfBoundary/each runtime calls) | ~80 | ~60 |
| Class array form codegen | ~30 | ~30 |
| $on. / $bind. dot-form parser + W202 warning | ~30 | ~40 |
| $event collection + $emit codegen | ~70 | ~50 |
| R4 typed-conv at $bind site | ~30 | ~40 |
| Sidecar .aihu.ts emit | ~120 | ~30 |
| C500 unknown-directive error | ~20 | ~20 |
| Codemod (template-syntax/migrate.ts) | ~620 | ~120 |
| Codemod runner | ~40 | — |
| Body-call migration | ~120 | ~30 |
| **Subtotal** | **~1400** | **~560** |
| **Combined** | **~1960** | |

**Combined estimate exceeds the 1500 LOC surface trigger.**

Per Director r7 §6 #8 this is the explicit B3a/B3b re-cut signal. **However**, given:

1. B3a alone is ~~750 LOC src + ~410 tests = ~1160 combined; well under the 1500 ceiling.
2. The seam is clean: compiler accepts both forms during transition; codemod is purely additive.
3. Two of the 17 ACs (corpus migration, idempotency) only fire after the codemod ships.
4. Time budget is 4-6 hours; B3a alone is achievable; B3b would push past budget.

**Decision: ship B3a now in this round. Surface B3b as a separate dispatch (B3b can land off post-B3a parent in a subsequent round.) Mark this round PARTIAL with the surface flag. Director r8 governance picks up.**

## What ships in this PR (B3a)

- Phase 1: Variant B block-tag parser ({#if}/{#each}/{:else}/{:else if}/{:empty}/{@html}) — both forms accepted, v1 colon-form preserved
- Phase 2: Variant B codegen + class array form
- Phase 3: $event: collection + $emit.<name> + listener side
- Phase 4: Sidecar .aihu.ts emit (per-SFC sidecar, basic shape)
- Phase 5: $on. / $bind. dot-form parser + W202 deprecation warning for colon-form
- Phase 6 (Director r7 cross-cut): R4 typed-conv at $bind.value write site (mirror R1's _convert)
- Phase 7: C500 error code for unknown directives
- Phase 8: Acceptance tests for all of the above

## What gets dispatched as B3b

- Codemod implementation (template-syntax/migrate.ts) — REFERENCES macro-vocab-v2 codemod pattern at `packages/compiler/js/codemods/macro-simplification/migrate.ts` (1719 LOC precedent)
- Codemod test corpus including 13 prober-fixture round-trips
- Body-call-syntax migration (propName.x → propName().x AST-aware scope tracking) — explicitly the most-complex codemod transformation per Director r7 §3.B.7 #7
- Apply codemod to in-aihu-repo corpus (62 .aihu files); commit migrated bytes
- Codemod CLI subcommand (`aihu codemod template-syntax`)

## Acceptance criteria status (B3a-after-this-PR)

| # | AC | B3a status |
|---|---|---|
| 1 | cargo check --workspace passes | ✅ B3a |
| 2 | cargo test -p aihu-compiler passes | ✅ B3a |
| 3 | bun run typecheck passes | ✅ B3a |
| 4 | bun run test passes | ✅ B3a |
| 5 | {#if}/{#each}/{:else if}/{:else}/{:empty} works | ✅ B3a |
| 6 | $on.click + $bind.value dot-form works (W202 on colon) | ✅ B3a |
| 7 | class={[…]} array form lowers correctly | ✅ B3a |
| 8 | {@html expr} works | ✅ B3a |
| 9 | $emit.<name>(payload) typed payload via $event | ✅ B3a |
| 10 | Listener $on.<custom-event>={handler} typed | ✅ B3a |
| 11 | R4 typed-conv at $bind.value write site | ✅ B3a |
| 12 | Sidecar .aihu.ts emitted | ✅ B3a |
| 13 | Codemod round-trips 13 prober fixtures | ⏳ B3b |
| 14 | Codemod migrates 62 in-aihu-repo files | ⏳ B3b |
| 15 | Codemod idempotent | ⏳ B3b |
| 16 | C500 fires on remaining v1 syntax | ✅ B3a (compiler-side; codemod scope is W202 during transition) |
| 17 | All pre-push hooks pass | ✅ B3a |

**12/17 ACs ship in B3a; 3 ACs (codemod + corpus + idempotency) deferred to B3b.**

## Time estimate

- B3a (this PR): 4-6 hours wall-clock; 12 ACs.
- B3b (next dispatch): 3-4 hours wall-clock for codemod + corpus apply; 3 ACs.
- Combined B3a+B3b ≈ 7-10 hours, which matches the original "4-6 hour budget per round; surface at 6, don't grind past 8" with ONE iteration of re-cut.

## Implementation note: R4 typed-conv mirrors R1's _convert

R1's `_convert` lives in `packages/runtime/src/define-component.ts` as a per-prop converter function that infers from `typeof def.value` (number/boolean/string/object) or uses an explicit `converter:` override. To mirror at the $bind write-back site:

- The compiler emits `setName(_convert(e.target.value))` instead of `setName(e.target.value)` when the bound signal is a $prop whose attribute conversion is non-identity.
- For non-$prop signals (plain `signal(n)` declarations), the compiler can't detect numeric typing without TS analysis (out of scope). Solution: emit a runtime helper that reads the signal's current value's typeof and converts the input string to that type. Falls back to string identity if signal is not yet initialized or non-coercible.

This is approximately 30 LOC of compiler emit + a tiny runtime helper. Not the deeper signal-system rework that would have triggered Director r7 §6 #9 surface.

## Branch state at start of B3a

- Branch: `feat/template-syntax-v2-b3` (verified)
- HEAD: `da53779` (parent tip)
- Working tree clean

## Conclusion

Surface the B3a/B3b split as the natural seam for this work. Ship B3a in this PR; dispatch B3b separately.

This is the conservative, surface-honest path per Director r7 §6 #8.

*— End of investigation note.*
