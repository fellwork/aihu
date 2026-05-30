---
topic: aihu-m2-a2
track: aihu-m2-a2
kind: build_manifest
layer: delta
round: 6
slug: aihu/delta/m2/a2/round-6/build-manifest-round-6
---

# Build Manifest — Round 6 (EX-10 cf-adapter)

## STATUS: DONE

---

## Acceptance Criteria Results

### A1 — Directory structure complete

PASS. All required files present:

```
examples/cf-adapter/
  index.html
  package.json
  vite.config.ts
  vitest.config.ts
  aihu.config.ts
  wrangler.toml
  src/cf-adapter-demo.aihu
  tests/smoke.test.ts
```

### A2 — Source substrings in cf-adapter-demo.aihu

PASS.
- Contains `@agent` ✓ (1 match)
- Contains `$expose` ✓ (2 matches — workerName, deployMode)
- Contains `workerName` ✓ (3 matches — signal, expose, template)
- Contains `@media (max-width: 480px)` ✓ (1 match)

### A3 — Source substrings in aihu.config.ts

PASS.
- Contains `cloudflare(` ✓
- Contains `cf-adapter-demo` ✓

### A4 — wrangler.toml contains `name = "cf-adapter-demo"`

PASS. ✓

### A5 — CSS clean (no hardcoded hex values)

PASS.
`grep "#[0-9a-fA-F]\{3,6\}" examples/cf-adapter/src/cf-adapter-demo.aihu` → 0 matches. ✓

### A6 — `cd examples/cf-adapter && bun run test` → 8 passed (8)

PASS.
```
✓ tests/smoke.test.ts (8 tests) 2ms
Test Files  1 passed (1)
     Tests  8 passed (8)
```

### A7 — Do-not-break: all 9 prior examples pass

PASS.
- live-counter: 2 passed (2) ✓
- temperature-converter: 3 passed (3) ✓
- timer: 3 passed (3) ✓
- todo-mvc: 7 passed (7) ✓
- color-theme: 4 passed (4) ✓
- weather-card: 15 passed (15) ✓
- blog-loader: 8 passed (8) ✓
- realtime-scores: 8 passed (8) ✓
- agent-hub: 15 passed (15) ✓

### A8 — OVER-1 (round-scoped)

PASS. `git log bd1c450..HEAD --name-only` shows only:
- `examples/cf-adapter/**` (7 new files)
- `examples/README.md`
- `.context/m2/a2/round-6/**`
- hook-managed: `bun.lock`, `README.md`

No unexpected files.

### A9 — No root package.json changes, no .size-limit.json changes

PASS. Neither file was modified. ✓

---

## Build Attempt

`cd examples/cf-adapter && bun run build` → EXPECTED FAIL (no dist).

The Rust SFC compiler does not yet support action-declaration syntax in `@agent` blocks
(`getConfig: { description: "..." }`). This affects all examples using this pattern
(confirmed: realtime-scores also fails with the same error). The smoke test is the
acceptance gate per the brief — not the build.

Bytes placeholder: `_no dist_`

---

## Investigation Summary

All 6 pre-write gate checks passed without blockers:
1. `cloudflare()` exported from `packages/adapter-cloudflare/src/index.ts` ✓
2. `defineConfig` in `packages/app/src/config.ts` DOES accept `adapter:` key (no ts-ignore needed) ✓
3. Token map confirmed from `examples/_shared/tokens.css` — zero hardcoded hex in SFC ✓
4. Alias pattern copied from `examples/agent-hub/vite.config.ts` ✓
5. `__resetRegistryForTesting` path: `../../../packages/agent/src/registry.ts` ✓
6. Scope clean at base SHA bd1c450 ✓

Note: `$describe` directive removed from `@agent` block after build confirmed it is not
a valid keyword in the Rust compiler's `@agent` block parser (valid keywords per error:
`input`, `state`, `action`). All 8 smoke tests pass without it.

---

## Commit

SHA: 607c387eec1f31896ed4e0c72b3637abca021591

Branch: feat/m2-a2-examples/ex-07-agent-hub

Slug: aihu/delta/m2/a2/round-6/build-manifest-round-6
