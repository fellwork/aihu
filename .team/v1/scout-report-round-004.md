# Scout Report — Round 004
**Date:** 2026-05-01
**Role:** Scout (read-only) + Team Lead live supplement
**Branch:** `main` HEAD `6a8f54b`

---

## 1. Test suite (live)

- **`bun run test`:** ALL PASS
- **Total:** 313 tests in 41 test files, 0 failures, 0 skipped
- **Duration:** 3.55s

Notable test files:
| File | Tests |
|------|-------|
| `packages/arbor/tests/mount.test.ts` | 26 |
| `packages/context/tests/context.test.ts` | 13 |
| `packages/data/tests/store.test.ts` | 12 |
| `packages/data/tests/resource.test.ts` | 12 |
| `packages/signals/tests/effect.test.ts` | 11 |
| `packages/arbor/tests/structural.test.ts` | 8 (reconciler) |
| `packages/runtime/tests/define-component.test.ts` | 4 |

---

## 2. Build / size (live)

**`bun run build`:** SUCCEEDED (11 tasks, 1 cached, 4.4s)
- One benign unresolved-import warning in `data:build` — `@aihu/context` is an external peer dep, not bundled; warning is expected.

**`size-limit` CLI:** FAILS — `@aihu/data`'s peer deps (`@aihu/signals`, `@aihu/context`) can't be resolved by size-limit's internal esbuild pass. This is a pre-existing config issue, not a regression. Manual gz measurement:

| Package | Size (gz) | Limit | Status | Headroom |
|---------|----------:|------:|--------|----------|
| `@aihu/context` | 282 B | 300 B | ✅ PASS | 18 B |
| `@aihu/signals` | 1732 B | 1850 B | ✅ PASS | 118 B |
| `@aihu/arbor` | 2151 B | 2200 B | ✅ PASS | **49 B ⚠️ TIGHT** |
| `@aihu/runtime` | 504 B | 1024 B | ✅ PASS | 520 B |
| `@aihu/agent` | 156 B | 200 B | ✅ PASS | 44 B |
| `@aihu/data` | 677 B | 750 B | ✅ PASS | 73 B |

**Arbor headroom is critically tight at 49 B.** Plan 1.2 targets `@aihu/runtime` (520 B headroom) — not arbor — so this does not block 1.2. But any future arbor change must account for 49 B ceiling.

---

## 3. Plan presence on `main`

| Plan | Package | Present? |
|------|---------|----------|
| 4.2 Error boundaries | `@aihu/arbor` | ✅ YES — `onError`, `_mountDisposersStack`, try/catch in `_mountEffect` |
| 1.1 Reconciler | `@aihu/arbor` | ✅ YES — `when()`, `each()`, `_reconcileWhen`, `_reconcileEach` with real implementations |
| 2.1 Context | `@aihu/context` | ✅ YES — package exists, 13 tests passing |
| 2.2 Data | `@aihu/data` | ✅ YES — package exists, 24 tests passing |
| 3.1 Streaming SSR | `@aihu/server` | ✅ YES — `renderToStream` exists |
| 6.2-P0+P1 Deep-chain | `@aihu/signals` | ✅ YES — `HAS_EFFECT_SUB`, `PENDING` flag, `checkDirty` present |
| **1.2 Component props** | `@aihu/runtime` | ❌ NOT YET — no `_setSignal`, no `attrs`, `SetupContext = { host, element }` only |
| 1.3 Scoped styles | compiler | ❌ NOT STARTED |
| 1.4 Slots | `@aihu/arbor` | ❌ NOT STARTED |

---

## 4. Compiler state

- Phases C-0 through C-4 squash-merged to `main` as `fb02cd3`
- `packages/compiler/js/index.ts` exports `transform()` and `scribeCompilerPlugin()` ✅
- Rust tests: 32 passing, 1 ignored (per last state file; live `cargo test` not run)
- Cleanup tasks from session 6 still open (BTreeMap, Vite investigation, topic summary)

---

## 5. Do-not-break verification (live run confirms)

All of the following passed in the live `bun run test`:
- `packages/arbor/tests/structural.test.ts` — 8 tests ✅
- `packages/arbor/tests/mount.test.ts` — 26 tests ✅
- `packages/runtime/tests/define-component.test.ts` — 4 tests ✅
- `tests/integration/define-element-integration.test.ts` — 2 tests ✅
- `tests/integration/mount-arbor-with-signals.test.ts` — 1 test ✅

---

## 6. Open items

### Unblocked / ready for Builder
1. **Plan 1.2 — Component props** (`@aihu/runtime`) — UNBLOCKED, GO. Architect spec at `.team/v1/spec-track-a-architect-round-001.md` §3. Runtime has 520 B headroom. Minimum 6 new tests in `define-component.test.ts`.
2. **Plan 1.3 — Scoped styles** (compiler Phase C-5) — parallel-safe with 1.2; not yet scoped.
3. **Track B integration test** — optional integration test for `@aihu/data` + `@aihu/context` SSR dehydration.
4. **`size-limit` config fix** — `@aihu/data` peer deps cause CLI failure; needs externals config or skip-file-pattern. Not blocking but creates noise.

### Blocked / non-code work required
1. **Track C 6.2-P1 bench verification** — CONDITIONAL PASS. Needs Linux/macOS bench run. Windows bench is unreliable for this signal optimization (see Track C state). Cannot be completed in this session.

---

## Do-not-break list (confirmed green 2026-05-01)

| Package / File | Gate |
|---|---|
| `packages/signals/src/` | `bun run test`, `bun run size` ≤ 1850 B gz |
| `packages/arbor/src/` | All arbor tests, `bun run size` ≤ 2200 B gz (**49 B headroom**) |
| `packages/runtime/src/` | All runtime tests, `bun run size` ≤ 1024 B gz |
| `packages/context/src/` | All context tests |
| `packages/data/src/` | All data tests |
| `packages/server/src/ssr.ts` | All server tests |
| `tests/integration/` | All integration tests |
