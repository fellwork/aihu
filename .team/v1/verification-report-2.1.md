# Verification Report — Plan 2.1 @scribe/context
**Date:** 2026-04-30
**Branch:** feat/v1-context-data
**Verifier:** Claude Sonnet 4.6
**Spec sources:** `.team/v1/spec-2.1-context.md` §8, §9; `.team/v1/director-notes/track-b-round-002.md`; `.team/v1/build-manifest-2.1.md`

---

## Criterion results

| Criterion | Status | Notes |
|---|---|---|
| **AC-1a** `package.json` exists with correct fields | PARTIAL | name, type:module, sideEffects:false, `"."` export, zero deps — all PASS. Missing `"./ssr"` subpath export (spec §9 requires it). |
| **AC-1b** `tsconfig.json` extends base | PASS | Correctly extends `../../tsconfig.base.json`. |
| **AC-1c** `rolldown.config.ts` has `dts()` + `minify:true` | PARTIAL | `dts()` present, `minify:true` present. Only single entry point (`src/index.ts`) — spec §9 requires two entries (`index` + `ssr`). |
| **AC-1d** `moon.yml` has `language: typescript` | PASS | `language: typescript`, `layer: library` present. |
| **AC-2a** `index.ts` exports all six required names | PASS | Exports `createContext`, `provide`, `inject`, `setSsrContextMap`, `clearSsrContextMap`, `runWithContext`. All present. |
| **AC-2b** No DOM references in context source | PASS | No `window`, `document`, or `Element` references anywhere in `packages/context/src/`. |
| **AC-2c** No imports from `@scribe/arbor`, `@scribe/signals`, `@scribe/server` | PASS | Zero external imports; implementation is self-contained. |
| **AC-2d** `ContextToken<T>` has `_id: symbol` and `_default: T \| undefined` | PASS | Correctly defined inline in `src/index.ts` (not in a separate `types.ts` as spec prescribes, but fields are correct). |
| **AC-3a** `provide` + `inject` round-trip | PASS | Implementation and test 2 confirm correct. |
| **AC-3b** `inject` with no active map returns default | PASS | Implemented and covered by tests 3 and 4. |
| **AC-3c** `inject` with no active map and no default returns `undefined` (no throw) | PASS | Implemented and covered by test 4. |
| **AC-3d** `runWithContext` clears map in `finally` | PASS | Lines 77–84 in `src/index.ts` implement try/finally with `clearSsrContextMap()`. |
| **AC-4** `runWithContext` restores null even when `fn` throws | PASS | `finally { clearSsrContextMap() }` is unconditional. Test 5 mechanically verifies this. |
| **AC-5a** `define-component.ts` exports `_setContext` | PASS | `_setContext(set, clear)` exported at line 76–82. |
| **AC-5b** `@scribe/runtime` does NOT import `@scribe/context` at module level | PASS | No import statement referencing `@scribe/context` in `define-component.ts`. Comments mention it but no value import exists. |
| **AC-5c** `connectedCallback` activates map before `setup()` and clears in `finally` | PASS | `_setSsrContextMap?.(new Map())` runs before setup; `finally { _clearSsrContextMap?.() }` clears it. |
| **AC-6a** `.size-limit.json` has `@scribe/context` entry with `"limit": "300 B"` and `"gzip": true` | PASS | Entry present as specified. |
| **AC-6b** `vitest.config.ts` has `@scribe/context` alias | PASS | Alias at line 17 correctly points to `packages/context/src/index.ts`. |
| **AC-7a** Test count ≥ 269 | PARTIAL | 270 tests pass (exceeds 269). However see "Test run" section for spec T1/T5 coverage concerns. |
| **AC-7b** Build + size ≤ 300 B gz | PASS | `@scribe/context` = 165 B gz (135 B under limit). Build succeeds for context. |
| **AC-7c** `context.test.ts` exists with ≥ 10 test cases | PASS | 11 test cases present. |

### Summary: 16 PASS, 3 PARTIAL, 0 FAIL

---

## Test run

```
Test Files  37 passed (37)
      Tests  270 passed (270)
   Duration  ~4.5s
```

**270 total = 259 pre-existing + 11 new context tests. Threshold of 269 is met.**

### Spec §8 T1–T10 coverage mapping

| Spec test | Covered | Notes |
|---|---|---|
| T1 — Token identity (`t1 !== t2`, `t1._id !== t2._id`) | PARTIAL | Tests 1–2 check `_default` and `_id` type but no test asserts `t1._id !== t2._id` explicitly. |
| T2 — provide + inject round-trip | PASS | Test "provide + inject round-trip within runWithContext". |
| T3 — inject no provider no default → undefined | PASS | Test "inject with no active map and no default". |
| T4 — inject returns createContext default | PASS | Test "inject with no active map returns default value". |
| T5 — shadow: second provide same token overwrites first | MISS | No test calls `provide(token, 1); provide(token, 2)` within one map and asserts `inject` = 2. Test 6 tests nested `runWithContext` maps, not double-provide in same map. |
| T6 — two tokens same T no interference | PASS | Test "provide multiple tokens, each inject returns the correct value". |
| T7 — runWithContext: cleared after fn returns | PASS | Tests 7, 5, and 6 cover this. |
| T8 — runWithContext: cleared even on throw | PASS | Test "runWithContext clears map in finally when fn throws". |
| T9 — SSR via setSsrContextMap (node env) | PARTIAL | Covered by test 9 but uses `clearSsrContextMap()` instead of `setSsrContextMap(null)`. No `/* @vitest-environment node */` docblock on any test. |
| T10 — SSR cleared after setSsrContextMap(null) | PARTIAL | Covered semantically via `clearSsrContextMap()`, but spec required `setSsrContextMap(null)` form and node env annotation. |

**Missing: T1 token identity assertion, T5 shadow behavior test. T9/T10 lack `@vitest-environment node` annotation.**

---

## Size gate

```
@scribe/context
  Size limit: 300 B
  Size:       165 B  (with all dependencies, minified and gzipped)
  Status:     PASS — 135 B under limit
```

Build note: the root `bun run build` fails due to `compiler:build` (no rolldown.config in `packages/compiler/` — pre-existing defect unrelated to Plan 2.1). The `packages/context` build succeeds cleanly when run directly.

---

## Bidirectional audit

### Under-implementation

**1. `provide()` no-ops when no map is active (lines 38–41 of `src/index.ts`):**

```typescript
export function provide<T>(token: ContextToken<T>, value: T): void {
  if (_activeContextMap === null) return   // silent no-op
  _activeContextMap.set(token._id, value)
}
```

This is intentional and consistent with the Director note §3 Gap 2: "Can also be called as a standalone call for SSR". The silent no-op is documented in the JSDoc ("If no map is currently active, this is a no-op."). The spec §3 confirms: "Calling provide() outside these windows is a no-op (the value is discarded because no map is active)." **Intentional and correct.**

**2. `inject()` reads from `_activeContextMap` (the single module-level slot):**

```typescript
export function inject<T>(token: ContextToken<T>): T | undefined {
  if (_activeContextMap === null) return token._default
  if (_activeContextMap.has(token._id)) {
    return _activeContextMap.get(token._id) as T
  }
  return token._default
}
```

The implementation uses a single `_activeContextMap` for both browser and SSR paths, whereas the spec's internal design calls for two separate slots (`_activeMap` + `_ssrMap` in `state.ts`). The implementation collapses them into one slot. This works correctly for single-threaded Node.js but loses the semantic clarity of separate SSR/browser paths. **No stale-state risk in practice** (Node is single-threaded; the slot is cleared by `finally`). However, the collapse means that a browser component's `connectedCallback` calling `_setSsrContextMap(new Map())` before `setup()` is conceptually using the "SSR map" path to implement the browser context — which is architecturally odd but functionally correct.

**3. `setSsrContextMap` is in the main barrel, not a `./ssr` subpath:**

The spec (§9) requires `setSsrContextMap` to live in `src/ssr.ts` and be exported ONLY as `@scribe/context/ssr`, NOT from the main barrel. The implementation exports it from `src/index.ts` directly (the main barrel). This means `@scribe/server` could import it at module level (violating the hard boundary). The `clearSsrContextMap` function is also exported from the main barrel (not mentioned in spec at all as a public export — the spec uses `setSsrContextMap(null)` for clearing). **This is a spec deviation that weakens the hard-boundary architecture.**

### Over-implementation

**1. `clearSsrContextMap()` added (not in spec):**

The spec uses `setSsrContextMap(null)` to clear. The implementation introduces a separate `clearSsrContextMap()` function and exports it from the main barrel. This is not a stability concern but does expand the public API surface beyond spec authorization. Tests use `clearSsrContextMap()` instead of `setSsrContextMap(null)`, meaning the spec's T9/T10 pattern is not tested.

**2. `define-component.ts` uses `_setSsrContextMap(new Map())` for browser context activation:**

The runtime uses the SSR path (`_setSsrContextMap`) to activate a fresh context map for each component's `setup()` call. This is a conceptual over-coupling — the spec envisioned a separate browser activation path. While functionally equivalent for v1 (single-threaded), it means "browser context activation" and "SSR map loading" share the same slot. **Not a blocking concern for v1 but worth noting.**

**3. Arbor files modified (`packages/arbor/src/attrs.ts`, `materialize.ts`, `mount.ts`, `types.ts`):**

These changes come from the Plan 4.2 commit (`e4ea72c`) which predates the Plan 2.1 commit on this branch. The spec §9 do-not-break list explicitly states "packages/arbor/ — any file (zero arbor changes needed)". However, these arbor changes are for Plan 4.2 (error boundaries), not Plan 2.1. The branch `feat/v1-context-data` appears to bundle both Plan 4.2 and Plan 2.1 work. From a Plan 2.1 isolation perspective, the arbor changes are out-of-scope for Plan 2.1 but authorized under Plan 4.2 (which has its own verification report at `.team/v1/verification-report-4.2.md`).

**4. `packages/server/src/ssr.ts` — `SsrOptions.contextMap` and `contextSetup` fields NOT added:**

The spec §6 and §9 explicitly required `SsrOptions` to gain `contextMap?: ReadonlyMap<unknown, unknown>` and `contextSetup?: () => void`. These were not implemented. The diff confirms `packages/server/src/ssr.ts` was not modified. This is an under-implementation of the SSR integration spec, though it does not affect client-side context functionality.

---

## File scope summary

Files changed on `feat/v1-context-data` vs main ancestor (`4eeba8d`):

| File | Authorized by | Notes |
|---|---|---|
| `packages/context/` (all new files) | Plan 2.1 | Correct |
| `packages/runtime/src/define-component.ts` | Plan 2.1 | Correct |
| `vitest.config.ts` | Plan 2.1 | Correct |
| `.size-limit.json` | Plan 2.1 | Correct (agent limit also raised to 200 B per Director note) |
| `.team/v1/build-manifest-2.1.md` | Plan 2.1 | Correct |
| `packages/arbor/src/attrs.ts` | Plan 4.2 | Separate plan; has own verification report |
| `packages/arbor/src/index.ts` | Plan 4.2 | Separate plan |
| `packages/arbor/src/materialize.ts` | Plan 4.2 | Separate plan |
| `packages/arbor/src/mount.ts` | Plan 4.2 | Separate plan |
| `packages/arbor/src/types.ts` | Plan 4.2 | Separate plan |
| `packages/arbor/tests/mount.test.ts` | Plan 4.2 | Separate plan |
| `.team/v1/build-manifest-4.2.md` | Plan 4.2 | Separate plan |

No unauthorized file modifications within Plan 2.1 scope.

---

## Overall verdict

**STATUS: PARTIAL**

### Fix list

**F-1 (SPEC DEVIATION — architecture):** `setSsrContextMap` is exported from the main barrel (`src/index.ts`) instead of a separate `src/ssr.ts` subpath. The `./ssr` subpath export is missing from `package.json`. The spec §9 requires `"./ssr"` subpath so that `@scribe/server` integration can import from `@scribe/context/ssr` without pulling in the main barrel. Fix: split `setSsrContextMap` into `src/ssr.ts`, add `"./ssr"` export to `package.json`, add `ssr: 'src/ssr.ts'` to `rolldown.config.ts` inputs. The `clearSsrContextMap` name may remain in the barrel or be merged into `setSsrContextMap(null)` — the API needs reconciliation with the spec's null-param pattern.

**F-2 (SPEC DEVIATION — SSR integration):** `packages/server/src/ssr.ts` was not modified. The spec §6 required `SsrOptions.contextMap` and `contextSetup` fields. Without these, the server-side integration described in the spec (and in the Director note §5.3) is incomplete. Application code cannot pass a context map to `renderToString` via `SsrOptions`. Fix: add the two optional fields to `SsrOptions` in `packages/server/src/ssr.ts` per spec §6.

**F-3 (TEST GAP — T5 shadow behavior):** No test covers `provide(token, 1); provide(token, 2)` within the same active map and asserts `inject(token) === 2`. The spec T5 specifically tests this shadow behavior. Fix: add one test case.

**F-4 (TEST GAP — T1 token identity):** No test asserts that two `createContext()` calls produce tokens with distinct `_id` symbols (`expect(t1._id).not.toBe(t2._id)`). Fix: add explicit assertion.

**F-5 (TEST ENVIRONMENT — T9/T10):** Tests 9 and 10 lack `/* @vitest-environment node */` docblock as required by spec §8. The spec explicitly states "at least tests 9 and 10 should use `@vitest-environment node` docblock to assert DOM-free operation." Currently all tests run under jsdom (global). Fix: add the docblock to the two SSR-path tests.

**Non-blocking notes:**
- The `clearSsrContextMap()` / `setSsrContextMap(null)` naming split is a minor API divergence from spec. Not blocking on its own, but F-1 resolution should reconcile it.
- Single `_activeContextMap` slot (no separate browser/SSR slots) is a valid simplification that works correctly for v1.
- The root `bun run build` fails due to `compiler:build` (pre-existing defect, not introduced by this branch).
