# Retro — Session 004 (Round 004)
**Date:** 2026-05-01
**Track:** A
**Plans completed:** Plan 1.2 (Component props)
**Final HEAD:** `acf501b` (PR #13 merged)
**Test count:** 320/320 passing (41 test files)
**Size:** `@aihu/runtime` 630 B gz / 1024 B cap

---

## What was built

### Plan 1.2 — Component Props (`@aihu/runtime`)

`defineComponent` extended with an options-form overload accepting `{ attrs, setup }`. Per-attribute `Signal<string>` instances created at `connectedCallback` time via the `_setSignal` injection pattern (mirroring the existing `_setMount` pattern). Attribute changes wired through `attributeChangedCallback` → signal setter. `static observedAttributes` set on the returned class body so the browser reports exactly the declared attrs. `AttrContext<A>` intersection type exposes `ctx.attrs.<name>` as typed `Signal<string>` in the user's setup function. `ATTR_SIGNALS_SYM` symbol slot stores per-instance signal maps without leaking to the public API.

**Builder:** local agent  
**Commits:** `4fbd66b` (implementation), `b5a3181` (inline fix T7), `acf501b` (PR #13 merge to main)  
**Verifier:** PARTIAL on first pass (BLOCK-1); PASS after Team Lead inline fix  
**Tests added:** 7 (T1–T6 by Builder; T7 by Team Lead inline fix)  
**Total:** 313 pre-existing + 7 new = 320 passing

---

## What went well

**Clean isolated scope.** Plan 1.2 touched exactly four files (`types.ts`, `define-component.ts`, `index.ts`, `define-component.test.ts`) in exactly one package (`@aihu/runtime`). Zero arbor changes, zero signals changes, zero cross-package value imports introduced. The Do-Not-Break invariant held on first build.

**Injection pattern reuse.** The `_setSignal` / `ATTR_SIGNALS_SYM` design mirrors the existing `_setMount` pattern precisely. This made the Builder's implementation path well-defined and the Verifier's audit straightforward — every O-finding was PASS because the pattern had a precedent.

**Size headroom maintained.** `@aihu/runtime` went from 504 B to 630 B gz — 126 B delta against a 520 B available envelope. The Architect's 195 B estimate was conservative; actual delta is 34% under estimate. Runtime retains 394 B of headroom against the 1024 B cap.

**Verifier found the real bug.** BLOCK-1 (the unconditional `_signal === null` guard) was a genuine correctness defect — options-form components without `attrs` would throw at connect time even though no signal factory is needed. The Verifier's under-implementation audit (U-2) caught it before merge. The fix was one line and one test.

**Retro format consistent.** Session sequence (Scout → Director → Builder → Verifier → Team Lead inline fix → merge) followed the Round 002 and 003 pattern without deviation. Handoff artifacts (build manifest, verification report) landed in `.team/v1/` with consistent naming.

---

## What went wrong / blockers hit

### BLOCK-1 — `_signal === null` guard unconditional on options-form

**What happened.** The Builder implemented the `RuntimeError` guard as `if (_signal === null)` in `connectedCallback`, triggering for *all* options-form components regardless of whether `attrs` was empty or omitted. A valid call `defineComponent({ setup })` (no attrs declared) would throw `RuntimeError('SCR-R0003')` at connect time if `_setSignal` had never been called — even though no signal factory is needed for that component.

**Root cause.** The director note's spec (§ Refined brief, constraint #2) said "the guard is only triggered when the options-form is used and an attr changes" — but the Builder placed the guard in `connectedCallback` (before signal creation) rather than deferring it to `attributeChangedCallback`. The guard was semantically correct for the "attr change" path but incorrectly broad for the "connect without attrs" path.

**Fix.** Team Lead changed the guard to `if (_signal === null && attrs.length > 0)` and added test T7: `defineComponent({ setup })` without `attrs` connects without `_setSignal` and without throwing.

**How to prevent.** The spec brief covered the constraint correctly (constraint #2: "function-form must not require `_setSignal`") but did not extend it explicitly to the options-form-without-attrs case. A spec note of the form "options-form with `attrs: []` or `attrs` omitted is semantically equivalent to function-form — no signal factory required" would have closed the gap.

### NB-1 — No test for options-form without attrs

The test suite T1–T6 covered function-form and options-form-with-attrs but had no test for options-form-without-attrs. The gap is what allowed BLOCK-1 to land undetected. T7 fills it, but it was an after-the-fact addition rather than a TDD-first test.

**Lesson.** When a spec documents an equivalence boundary ("options-form without attrs == function-form semantics"), a test explicitly exercising that boundary should appear in the minimum test list.

---

## Learnings for future sessions

**L-1 (injection guards): Guard conditions should match the actual dependency.**  
An injection guard (`_factory === null → throw`) should fire only when the injected facility is actually consumed by the code path being entered. In Plan 1.2, `_signal` is consumed only when `attrs.length > 0` — so the guard is `_signal === null && attrs.length > 0`. The general pattern: `if (injected === null && <condition where injected is actually needed>)`.

**L-2 (test coverage for equivalence boundaries).**  
When a spec documents an equivalence boundary — "A with condition X is semantically equivalent to B" — add a test that exercises A-with-X-false directly. Don't rely on the B tests to cover it. In Plan 1.2: options-form without attrs should have had its own test from the start.

---

## Iteration budget

| Plan | Verifier passes required | Inline fixes required |
|------|-------------------------|-----------------------|
| 4.2  | 1 (PASS with 2 non-blocking findings) | 0 |
| 1.1  | 1 (PARTIAL → PASS after Team Lead fixes) | 2 (export leak + cap raise) |
| 1.2  | 1 (PARTIAL → PASS after Team Lead fix) | 1 (BLOCK-1 guard + T7) |

All three Track A plans have required at most one Verifier pass plus zero or one inline Team Lead fix. The pattern is stable. Inline fixes stay small (1–2 lines, 1–2 tests).

---

## Next session scope

### Track A — Plan 1.3 (Scoped Styles) or Plan 1.4 (Slots)

Plan 1.3 (Scoped Styles) is compiler-adjacent work; the compiler track has open cleanup items (BTreeMap, Vite investigation, session 6 topic summary). Plan 1.4 (Slots) is now unblocked post-1.2 but touches `@aihu/arbor` where **only 49 B of headroom remains** against the 2200 B cap. A cap-raise decision or slot-budget analysis must precede Builder dispatch for 1.4.

Round 005 Director should open with an explicit scope-and-budget review before dispatching either Plan 1.3 or 1.4.

### Carry items (unchanged from Round 003)

- Track C 6.2-P1 CONDITIONAL PASS — needs Linux/macOS bench validation.
- `size-limit` CLI failure on `@aihu/data` — pre-existing, not blocking.
- Background task: `disposeRef` first-run race (Session 002) — LOW priority.
- Background task: shape-locking / `ChildScope.key` (Session 003) — LOW priority.
