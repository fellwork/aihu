# Build Manifest — Plan 2.1: @aihu/context

**Date:** 2026-04-30
**Branch:** feat/v1-context-data
**Builder:** Claude (Sonnet 4.6)
**STATUS:** DONE

---

## Files Created

| File | Notes |
|------|-------|
| `packages/context/package.json` | name `@aihu/context`, version `0.0.0`, type module, exports map (`.` + `./ssr`), sideEffects false, no dependencies |
| `packages/context/tsconfig.json` | extends `../../tsconfig.base.json` |
| `packages/context/rolldown.config.ts` | Two entries: `src/index.ts` + `src/ssr.ts`, each ESM + dts() + minify:true |
| `packages/context/moon.yml` | language typescript, layer library |
| `packages/context/src/index.ts` | Full public API: createContext, provide, inject, setSsrContextMap, clearSsrContextMap, runWithContext |
| `packages/context/src/ssr.ts` | SSR subpath re-export: setSsrContextMap, clearSsrContextMap, runWithContext |
| `packages/context/tests/context.test.ts` | 13 tests covering all spec §8 T1–T10 scenarios |
| `.team/v1/build-manifest-2.1.md` | This file |

## Files Modified

| File | Change |
|------|--------|
| `packages/runtime/src/define-component.ts` | Added `_setSsrContextMap`, `_clearSsrContextMap` module-level vars + `_setContext()` export; wired into `connectedCallback` with try/finally |
| `packages/server/src/ssr.ts` | Added `_setContextFns()` injection export + `SsrOptions.contextSetup` hook; wired context activation/deactivation with try/finally around tree walk |
| `vitest.config.ts` | Added `@aihu/context` + `@aihu/context/ssr` aliases |
| `.size-limit.json` | Added `@aihu/context` entry (limit: 300 B) |

---

## Verification fixes applied (from verification-report-2.1.md)

| Fix | Description |
|-----|-------------|
| F-1 | Added `./ssr` subpath to `package.json` exports; created `src/ssr.ts`; added second rolldown entry; added `@aihu/context/ssr` vitest alias |
| F-2 | Added `_setContextFns()` + `SsrOptions.contextSetup` to `packages/server/src/ssr.ts` with try/finally context lifecycle |
| F-3 | Added test 11: shadow behavior (T5 spec coverage) |
| F-4 | Added test 12: token identity `_id` distinct symbols (T1 spec coverage) |
| F-5 | Added `// @vitest-environment node` at top of `context.test.ts` |

---

## @aihu/context Size

| Metric | Value |
|--------|-------|
| Gzip size | **165 B** |
| Limit | 300 B |
| Headroom | 135 B |

The `./ssr` subpath adds `ssr.js` (re-export only) at ~0 B incremental to the main barrel size.

---

## Test Count

| | Count |
|--|--|
| Before (Plan 4.2 baseline) | 259 |
| New context tests (Plan 2.1) | 11 |
| Fix tests (F-3, F-4) | +2 |
| **After** | **272** |

All 272 tests pass. No pre-existing tests broken.

---

## Architecture notes

- `@aihu/context` has zero external imports (DOM-free, Node-safe)
- `@aihu/server` does NOT import `@aihu/context` at module level (hard boundary preserved)
- `_setContextFns(setSsrContextMap, clearSsrContextMap)` is the injection point for server
- `_setContext(setSsrContextMap, clearSsrContextMap)` is the injection point for runtime
- `SsrOptions.contextSetup` callback receives activate/deactivate from the module-level slots
- Context is cleared unconditionally in finally blocks (no leak between requests/renders)
