# Track A — State File

**Created:** 2026-04-30
**Branch:** `feat/v1-reconciler` (to be created from `main` after Architect pass)
**Track director note:** `.team/v1/director-notes/track-a-round-001.md`

---

## Current Phase

**Phase:** Pre-flight (Architect pass required before Scout → Builder can proceed)

No building has started. The v1 spec documents that anchor this track do not
yet exist. See the director note section 6 for the exact unblocking checklist.

---

## Plans in Scope

| Plan | Title | Status |
|------|-------|--------|
| 4.2 | Error boundaries (`onError` hook in arbor + runtime) | Spec gap — Architect needed |
| 1.1 | Reconciler (`when()` and `each()` in `structural.ts`) | Spec gap — Architect needed |
| 1.2 | Component props (typed `observedAttributes` in `@scribe/runtime`) | Spec gap — Architect needed |

**Execution order (per director note §1):** 4.2 → 1.1 → 1.2

---

## Status Table

| Role | Plan | Status | Notes |
|------|------|--------|-------|
| Architect | All (v1 spec docs) | NEEDED | `spec-v1-architecture.md` and `plan-v1-roadmap.md` do not exist |
| Architect | 4.2 onError | NEEDED | Signature, placement, recovery model unspecified |
| Architect | 1.1 Reconciler | NEEDED | Sub-scope lifecycle, DOM anchor, push-pop stack, keyed-diff unspecified |
| Architect | 1.2 Props | NEEDED | Props surface shape, reactivity model, SetupContext compat unspecified |
| Scout | All | PENDING | Can proceed immediately; see director note §4 for full brief |
| Builder | 4.2 | PENDING | Blocked on Architect + Scout |
| Builder | 1.1 | PENDING | Blocked on Architect + Scout + 4.2 Builder |
| Builder | 1.2 | PENDING | Blocked on Architect + Scout + 1.1 Builder |
| Verifier | All | PENDING | Blocked on respective Builders |

---

## Key Artifacts

*(Empty — none produced yet)*

When artifacts are produced, list them here:

| Artifact | Kind | Status |
|----------|------|--------|
| `spec-v1-architecture.md` | Spec | Not yet authored |
| `plan-v1-roadmap.md` | Plan | Not yet authored |
| Scout report | Investigation | Not yet authored |
| 4.2 build manifest | Builder output | Not yet authored |
| 1.1 build manifest | Builder output | Not yet authored |
| 1.2 build manifest | Builder output | Not yet authored |
| Verification report | Verifier output | Not yet authored |

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
