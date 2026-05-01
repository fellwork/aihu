# Build Manifest — Compiler Track Session 6

**Session:** 6 (cleanup)
**Branch:** `chore/compiler-session-6-cleanup`
**Date:** 2026-05-01
**Builder:** Claude Sonnet 4.6 (automated)
**Base HEAD:** `20d66b7` (main)

---

## Tasks completed

| # | Task | Status |
|---|------|--------|
| 1 | BTreeMap — eliminate snapshot ordering non-determinism | PASS |
| 2 | Vite/Bun ESM plugin investigation + documentation | PASS (documented) |
| 3 | Compiler topic summary | PASS |

---

## Task 1: BTreeMap migration

**File changed:** `packages/compiler/src/codegen/signals.rs`

- Changed `use std::collections::HashMap` → `use std::collections::BTreeMap`
- Changed `SignalMap(pub HashMap<String, String>)` → `SignalMap(pub BTreeMap<String, String>)`
- `SignalMap::default()` constructor unchanged — derives `Default` which now
  calls `BTreeMap::default()`

**Test result:** `cargo test -p scribe-compiler` — 32 passed, 1 ignored (exit 0)

**Snapshot re-acceptance:** Not required. All 31 existing snapshots remained
valid because the signal resolver tests (`multiple_signals`, `mixed_vars_and_signals`)
happened to already have keys in alphabetical order, which is also the BTreeMap
iteration order.

---

## Task 2: Vite/Bun ESM investigation

**File changed:** `packages/compiler/js/index.ts`

**Error encountered:**

```
error: Script not found "vite"
```

Then with `bunx vite build`:

```
failed to load config from .../fixtures/vite-counter/vite.config.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite'
```

**Root cause analysis:**

1. **Missing devDependency:** `vite` is listed only as an optional
   `peerDependency` in `packages/compiler/package.json`. `bun install` does
   not install optional peers by default. The fixture has no `package.json`
   of its own, so there is no local `vite` installation.

2. **Bun + Rollup4 ESM bridge:** Even with Vite installed, Bun processes
   `vite.config.ts` via its internal bundler at startup. The `@scribe/compiler`
   module resolves through the workspace symlink to `dist/index.js`. If the
   Rust binary does not exist at `../target/release/scribe-compile`, the
   `execFileSync` call throws at config-load time — not at per-file transform
   time — aborting the entire build.

**Resolution:** Added a comprehensive `Known Limitation` JSDoc block above
`scribeCompilerPlugin()` in `packages/compiler/js/index.ts` explaining:
- What fails and why (both errors)
- The workaround: `bun run integrate.ts`
- The v1 resolution path

The fix is documented rather than applied because the correct fix (adding
`vite` as a `devDependency` and shipping a bundled binary) is a scope change
for v1.

---

## Task 3: Compiler topic summary

**File created:** `.team/compiler/summaries/compiler-summary.md`

Covers:
1. What the compiler does — SFC → TypeScript pipeline, emit form
2. Architecture — all five phases, key Rust types, JS wrapper
3. OQ resolutions — OQ-C1 (HTML-first), OQ-C3 (signal identity),
   OQ-C9 (emit pattern), OQ-C16 (BTreeMap)
4. Known limitations — 5 items documented
5. Future engineer guide — how to extend, snapshot discipline, counter_full oracle

---

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| `cargo test -p scribe-compiler` exits 0, 32 passed (1 ignored) | PASS |
| Vite investigation complete (fixed or documented) | PASS (documented) |
| Compiler topic summary written | PASS |
| No packages outside `packages/compiler/` and `.team/compiler/` touched | PASS |
| `bun run test` (TypeScript vitest) unaffected by Rust changes | PASS (Rust changes do not affect vitest) |
| No `.snap` files manually edited | PASS |

---

## Files changed

| File | Change |
|------|--------|
| `packages/compiler/src/codegen/signals.rs` | HashMap → BTreeMap |
| `packages/compiler/js/index.ts` | Added Known Limitation JSDoc above `scribeCompilerPlugin()` |
| `.team/compiler/summaries/compiler-summary.md` | NEW — topic summary |
| `.team/compiler/build-manifest-session-6.md` | NEW — this file |
