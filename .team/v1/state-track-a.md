# Track A — State File

**Created:** 2026-04-30
**Branch:** `feat/v1-reconciler` (merged; use `main` as base for Plan 1.2)
**Track director note:** `.team/v1/director-notes/track-a-round-001.md`

---

## Current Phase

**Phase:** Round 4 complete — Plans 4.2, 1.1, and 1.2 DONE; Plan 1.3 or 1.4 is next for Round 005.

Plan 1.2 (Component props) shipped to `main` at `acf501b` (PR #13 merged 2026-05-01).
`@scribe/runtime` is at 630 B gz / 1024 B cap (394 B headroom). Next target is Plan 1.3
(Scoped Styles, compiler-adjacent) or Plan 1.4 (Slots, arbor-touching — 49 B headroom
constraint applies). Round 005 Director must open with a scope-and-budget review.

---

## Plans in Scope

| Plan | Title | Status |
|------|-------|--------|
| 4.2 | Error boundaries (`onError` hook in arbor + runtime) | COMPLETE (main `8223dbb`) |
| 1.1 | Reconciler (`when()` and `each()` in `structural.ts`) | COMPLETE (main `75ba4e1`) |
| 1.2 | Component props (typed `observedAttributes` in `@scribe/runtime`) | COMPLETE (main `acf501b`) |

**Execution order (per director note §1):** 4.2 → 1.1 → 1.2

---

## Status Table

| Role | Plan | Status | Notes |
|------|------|--------|-------|
| Architect | All (v1 spec docs) | COMPLETE | `spec-v1-architecture.md`, `plan-v1-roadmap.md`, `spec-track-a-architect-round-001.md` all exist |
| Architect | 4.2 onError | COMPLETE | Shipped; see `verification-report-4.2.md` |
| Architect | 1.1 Reconciler | COMPLETE | Spec at `spec-track-a-architect-round-001.md` |
| Architect | 1.2 Props | COMPLETE | Covered in `spec-track-a-architect-round-001.md` |
| Scout | All | COMPLETE | `scout-report-track-a.md` exists |
| Builder | 4.2 | COMPLETE (main `8223dbb`) | 2 non-blocking Verifier findings; see notes |
| Builder | 1.1 | COMPLETE (main `75ba4e1`) | Export-leak fix applied by Team Lead; 8 new structural tests |
| Builder | 1.2 | COMPLETE (main `acf501b`) | 7 new tests (T1–T7); BLOCK-1 guard fixed inline by Team Lead |
| Verifier | 4.2 | COMPLETE | Report at `verification-report-4.2.md` |
| Verifier | 1.1 | COMPLETE | Report at `verification-report-1.1.md` — PARTIAL → PASS after inline fixes |
| Verifier | 1.2 | COMPLETE | Report at `verification-report-1.2.md` — PARTIAL → PASS after BLOCK-1 inline fix |

---

## Key Artifacts

| Artifact | Kind | Status |
|----------|------|--------|
| `spec-v1-architecture.md` | Spec | COMPLETE |
| `spec-v1-architecture-ratified.md` | Spec (ratified) | COMPLETE |
| `plan-v1-roadmap.md` | Plan | COMPLETE |
| `scout-report-track-a.md` | Scout report | COMPLETE |
| `spec-track-a-architect-round-001.md` | Architect spec (1.1, 1.2, 4.2) | COMPLETE |
| `build-manifest-4.2.md` | Builder output | COMPLETE |
| `verification-report-4.2.md` | Verifier output | COMPLETE — 2 non-blocking findings |
| `build-manifest-1.1.md` | Builder output | COMPLETE |
| `verification-report-1.1.md` | Verifier output | COMPLETE — PARTIAL → PASS after inline fixes |
| `build-manifest-1.2.md` | Builder output | COMPLETE |
| `verification-report-1.2.md` | Verifier output | COMPLETE — PARTIAL → PASS after BLOCK-1 inline fix; 320/320 tests; 630 B gz |

---

## Do-Not-Break List

The following packages, tests, and constraints must not regress across any
Track A commit. Verifier checks these first before applying the acceptance
criteria matrix.

### Packages that must not regress

| Package | Gate | Why |
|---------|------|-----|
| `@scribe/signals` | `bun run test`, `bun run size` ≤ 1700 B gz | Track A does not touch signals source; any regression is a merge artifact |
| `@scribe/arbor` | All existing tests in `packages/arbor/tests/` pass | Reconciler and error boundary work extends but does not rewrite core |
| `@scribe/runtime` | All existing tests in `packages/runtime/tests/` pass | Props surface is additive; `define-element.test.ts` test #4 (observedAttributes propagation) must not regress |
| `@scribe/agent` | `bun run size` ≤ 100 B gz | Not touched by Track A; size gate must stay green |

### Specific tests that must not regress

| File | Tests | Risk |
|------|-------|------|
| `packages/arbor/tests/structural.test.ts` | Both stub-throw tests (updated to reconciler tests in plan 1.1) | Must be rewritten, not deleted — the reconciler replaces the throws |
| `packages/arbor/tests/mount.test.ts` | Tests #6–#9 (dispose, LIFO, idempotency) | `_activeMountDisposers` push-pop stack change must not break disposal |
| `packages/runtime/tests/define-element.test.ts` | Test #4 (`observedAttributes` propagation) | Props surface must not break `wrapClass` inheritance |
| `packages/runtime/tests/define-component.test.ts` | Test #3 (effects auto-disposed on remove) | `onError` and props wiring must not break dispose-on-disconnect |
| `tests/integration/` | All cross-package integration tests | Any change to `mount()` or `_mountEffect` signature must not break end-to-end paths |

### Invariants

- **Signature lock:** `when(condition: Signal<boolean>, grow: () => Branch | Leaf): Branch`
  and `each<T>(list: Signal<T[]>, key: (item: T) => string | number, grow: (item: T, index: number) => Branch | Leaf): Branch`
  — the public signatures are locked per `structural.ts` module JSDoc. The
  reconciler implementation must accept these exact signatures.
- **Scope-collector contract:** `_activeMountDisposers` is `@internal`. The
  push-pop stack fix must not change the behavior visible to `_mountEffect`
  callers.
- **Zero source-level cross-package value imports in `@scribe/runtime`:** the
  structural rule from phase-4 spec §2.4 holds. Props wiring and error
  boundary wiring in runtime must not import `mount`, `branch`, `leaf`, or
  any other arbor value at module level.
- **Size limits:** per `.size-limit.json` at repo root. The Architect must
  explicitly update these if v1 lifts the caps; the Builder must not simply
  raise the numbers without Architect authorization.

---

## Round Log

| Round | Date | What happened |
|-------|------|---------------|
| 001 | 2026-04-30 | Track A bootstrapped; director note and state file authored; no spec docs yet; Architect pass required before Scout → Builder chain can start |
| 002 | 2026-04-30 | Plan 4.2 (Error Boundaries) COMPLETE — `main` `8223dbb`; `MountOptions.onError`, `_mountDisposersStack` push-pop, try/catch in `_mountEffect`, +4 tests; 2 non-blocking Verifier findings (T1 path format, `disposeRef` race); Plan 6.2-P0 signals opt also landed in same squash; Plan 1.1 unblocked for Builder |
| 003 | 2026-04-30 | Plan 1.1 (when/each Reconciler) COMPLETE — `main` `75ba4e1`; `StructuralNode`, `ChildScope`, keyed diff, `_materializeStructural`; +8 structural tests; 284 arbor / 312 total; arbor cap raised to 2200 B (signals bundling spillover from 6.2-P1); export-leak fixed by Team Lead; tech-debt chip spawned (shape-locking + ChildScope.key); Plan 1.2 unblocked |
| 004 | 2026-05-01 | Plan 1.2 (Component props) COMPLETE — `main` `acf501b` (PR #13); `defineComponent` options-form overload, `attrs` array, per-attr `Signal<string>` via `_setSignal` injection, `attributeChangedCallback` wiring, `ATTR_SIGNALS_SYM` symbol slot, `AttrContext<A>` intersection; +7 tests (T1–T6 Builder, T7 Team Lead inline fix for BLOCK-1 guard); 320 total; runtime 630 B gz; Plans 1.3/1.4 under consideration for Round 005 |

---

## Next actions

1. **Round 005 Director — scope review required before Builder dispatch.** Two candidates:
   - **Plan 1.3 (Scoped Styles)** — compiler-adjacent; requires compiler track cleanup (BTreeMap, Vite investigation, session 6 topic summary) before dispatch.
   - **Plan 1.4 (Slots)** — arbor-touching; arbor has only **49 B headroom** against 2200 B cap. A cap-raise decision or slot-budget analysis is required before Builder dispatch.
   Neither plan should be dispatched without an explicit Round 005 director note.
2. **Background task — Track C 6.2-P1 Linux/macOS bench validation** — CONDITIONAL PASS; needs Linux/macOS run. Cannot close on Windows. Does not gate 1.3 or 1.4.
3. **Background task — `disposeRef` first-run race** — LOW priority; spawned Session 002; does not gate 1.3 or 1.4.
4. **Background task — shape-locking / ChildScope.key** — LOW priority; spawned Session 003; does not gate 1.3 or 1.4.
