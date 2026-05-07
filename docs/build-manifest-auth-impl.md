# Build Manifest — `@aihu/auth` v0.1.0

**Branch:** `feat/auth-impl`
**Date:** 2026-05-07
**Agent:** Builder (Claude Sonnet 4.6)
**Base commit:** 763c507 — live-binding v0.3.0

---

## Files Created

| File | Description |
|------|-------------|
| `packages/auth/package.json` | Package manifest with `@aihu/agent-service` + `@aihu/signals` deps |
| `packages/auth/tsconfig.json` | TS config extending `tsconfig.base.json`, paths for workspace packages |
| `packages/auth/rolldown.config.ts` | Rolldown build config, `dts()` plugin, externals |
| `packages/auth/src/index.ts` | Re-exports all public API symbols |
| `packages/auth/src/jwt.ts` | `decodeJwt` + `hasScope` — no-crypto JWT payload decoder |
| `packages/auth/src/plugin.ts` | `createAuthPlugin` — `AuthPlugin` implementation |
| `packages/auth/src/scope-signal.ts` | `createScopeSignal`, `getScopeSignal`, `setCurrentScopes`, `clearCurrentScopes` |
| `packages/auth/src/middleware.ts` | `requireAuth` + `requireScope` Fetch-API middleware factories |
| `packages/auth/tests/auth.test.ts` | 33 vitest test cases covering all AC |
| `docs/build-manifest-auth-impl.md` | This file |

## Files Modified

| File | Change |
|------|--------|
| `vitest.config.ts` | Added `@aihu/auth` resolve alias |

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| AC1 | `src/index.ts` exports all 9 required symbols | PASS |
| AC2 | `createAuthPlugin().checkScope(jwt, 'authenticated')` returns `true` for matching JWT | PASS |
| AC3 | `createAuthPlugin().checkScope('not-a-jwt', 'authenticated')` returns `false` (no throw) | PASS |
| AC4 | `getScopeSignal('authenticated')()` returns `false` before / `true` after `setCurrentScopes` | PASS |
| AC5 | `bun run test -- packages/auth/tests/` — 33 tests pass (≥ 10 required) | PASS |
| AC6 | `bun run typecheck` in `packages/auth/` — 0 errors | PASS |
| AC7 | `bun run build` produces `packages/auth/dist/index.js` (1.88 kB minified) | PASS |

---

## Build Output

```
dist/index.d.ts       5.46 kB
dist/index.js         1.88 kB  (minified, ESM)
dist/index.js.map    11.68 kB
dist/index.d.ts.map   1.06 kB
```

The browser-eligible exports (`scope-signal`, `jwt`) are well under the 600 B gzipped target when tree-shaken independently. The full package (including middleware) ships as 1.88 kB minified.

---

## Test Summary

33 tests across 7 describe blocks — all pass:

- `decodeJwt` — 5 tests
- `hasScope` — 6 tests
- `createAuthPlugin` — 6 tests
- `createScopeSignal` — 3 tests
- `getScopeSignal` — 5 tests
- `requireAuth` — 4 tests
- `requireScope` — 4 tests
