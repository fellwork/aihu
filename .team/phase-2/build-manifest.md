# Build manifest — Phase 2 (`@aihu/signals`)

Append-only log of files created/modified per task, with verification results.

---

## Task 6 — scaffold corrections

**Commit:** `9094043`
**Files:**
- `tsconfig.base.json` — modified — added `"allowImportingTsExtensions": true` (R-T2 fix per spec §3.2)
- `packages/signals/moon.yml` — modified — `type: library` → `layer: library` (R-T1 fix per spec §3.1)
- `packages/signals/src/errors.ts` — modified — removed `chain` field; constructor takes optional `message` defaulting to `'circular dependency detected'`; added rationale comment per spec §1.6 (Decision 2)
- `.size-limit.json` — modified — trimmed to only `@aihu/signals` row (per spec §3.3 — others added back in Tasks 12/20/23/25)
- `.moon/tasks.yml` → `.moon/tasks/tasks.yml` — moved + edited — Moon 2.x inheritance requires the directory layout; also prefixed `tsc` and `rolldown` commands with `bunx` so PowerShell can resolve them on Windows. See `builder-blockers.md` §1 for rationale (Phase 1 scaffold was Moon-v1-shaped). This was outside spec §3 but is a clear scaffold-tooling unblocker.

**Verification:**
- `moon run signals:typecheck` — PASS (2.2s)
- `moon run signals:build` — PASS, `dist/index.js` 108 B gz
- `bun run size` — PASS, 108 B / 1024 B budget
- `bun run test` — PASS (no tests yet, exit 0)

---

## Task 7 — `signal()`

**Commit:** `c04941e`
**Files:**
- `packages/signals/src/signal.ts` — created — `signal<T>` cell, `Subscriber` interface with `flags` bitfield (RUNNING/DISPOSED/QUEUED/STALE), `setCurrentObserver`/`peekCurrentObserver` (`/** @internal */`), default equality `Object.is`, `equals: false` opt-out
- `packages/signals/tests/signal.test.ts` — created — 5 unit tests (read, set, updater, Object.is short-circuit, equals:false no-throw)
- `packages/signals/src/index.ts` — modified — re-exports `signal` and types `Read`/`Signal`/`SignalOptions`/`Write`
- `packages/signals/tsconfig.json` — modified — `rootDir: "src"` → `rootDir: "."` so `tests/` doesn't trigger TS6059 under `include`

**Verification:**
- Tests: 5 passing (1 file)
- `moon run signals:typecheck` — PASS
- `moon run signals:build` — PASS, `dist/index.js` 251 B gz
- `bun run size` — PASS, 251 B / 1024 B budget
- `bunx biome ci .` — PASS

---

## Task 8 — `effect()`

**Commit:** `9a18460`
**Files:**
- `packages/signals/src/effect.ts` — created — `effect(fn): Dispose` per spec §1.2; sync re-run on dep notify; idempotent dispose via `flags |= DISPOSED`
- `packages/signals/tests/effect.test.ts` — created — 6 unit tests (init run, re-run, eq short-circuit, equals:false re-run, dispose+idempotent, fan-out)
- `packages/signals/src/index.ts` — modified — re-exports `effect`, types `Dispose`/`EffectFn`

**Verification:**
- Tests: 11 passing (2 files)
- `moon run signals:typecheck` — PASS
- `moon run signals:build` — PASS, `dist/index.js` 336 B gz
- `bun run size` — PASS, 336 B / 1024 B budget
- `bunx biome ci .` — PASS

---

## Task 9 — `computed()`

**Commit:** `539ab3b`
**Files:**
- `packages/signals/src/computed.ts` — created — `computed<T>(fn, options?)` returns `Read<T>` per spec §1.3; lazy STALE flag (initialized true so first read evaluates), forward observation via `peekCurrentObserver`, cascade via `subs` Set; `ComputedOptions<T>.equals` accepted on type, reserved for future cascade-suppression
- `packages/signals/tests/computed.test.ts` — created — 4 unit tests (derived value, cached re-derive, downstream effect, chained-lazy)
- `packages/signals/src/index.ts` — modified — re-exports `computed`, type `ComputedOptions`

**Verification:**
- Tests: 15 passing (3 files)
- `moon run signals:typecheck` — PASS
- `moon run signals:build` — PASS, `dist/index.js` 419 B gz
- `bun run size` — PASS, 419 B / 1024 B budget
- `bunx biome ci .` — PASS

---

## Task 10 — `$state()`

**Commit:** `93ff722`
**Files:**
- `packages/signals/src/state.ts` — created — `$state<T>(initial)` returns `{ value: T }` accessor over a single underlying `signal()` cell per spec §1.4. Same tracking, equality, notify path as the underlying signal.
- `packages/signals/tests/state.test.ts` — created — 4 unit tests (read .value, write .value, track in effect, Object.is short-circuit)
- `packages/signals/src/index.ts` — modified — re-exports `$state`, type `State`

**Verification:**
- Tests: 19 passing (4 files)
- `moon run signals:typecheck` — PASS
- `moon run signals:build` — PASS, `dist/index.js` 451 B gz
- `bun run size` — PASS, 451 B / 1024 B budget
- `bunx biome ci .` — PASS

---

## Task 11 — cycle detection + property tests

**Commit:** `e047293`
**Files:**
- `packages/signals/src/effect.ts` — modified — `notify()` throws `SignalCircularError` if `flags & RUNNING`
- `packages/signals/src/computed.ts` — modified — `notify()` and `read()` both throw `SignalCircularError` on RUNNING re-entry
- `packages/signals/tests/effect.test.ts` — modified — +1 cycle test (direct self-write inside effect)
- `packages/signals/tests/computed.test.ts` — modified — +1 cycle test (computed body writes to its dep)
- `packages/signals/tests/properties.test.ts` — created — 3 fast-check properties (`numRuns: 50` global) + 1 sanity check: last-write-wins, effect runs = 1 + distinct consecutive writes, computed = f(signal)

**Verification:**
- Tests: 25 passing (5 files; 21 unit + 3 property + 1 sanity)
- `moon run signals:typecheck` — PASS
- `moon run signals:build` — PASS, `dist/index.js` 466 B gz
- `bun run size` — PASS, 466 B / 1024 B budget
- `bunx biome ci .` — PASS

---

## Task 11.4 — `batch()`

**Commit:** `2bb8ae3`
**Files:**
- `packages/signals/src/signal.ts` — modified — added `batchDepth`, `batchQueue`, `MAX_BATCH_ITERATIONS`, and `getBatchDepth`/`enterBatch`/`exitBatch`/`drainBatch` (`/** @internal */`); switched `signal.write()` to enqueue via `enqueueIfNeeded` when `batchDepth > 0`; drain throws `SignalCircularError` (default message) on 100-iteration overflow per Team Lead adjudication B-A
- `packages/signals/src/batch.ts` — created — public `batch(fn): void` per spec §1.5; outermost batch drains the queue on `fn` return (or throw), handles nesting via depth count
- `packages/signals/src/index.ts` — modified — re-exports `batch`
- `packages/signals/tests/batch.test.ts` — created — 6 unit tests (single batched write, N writes same signal, N writes N signals dedup, nested batch, effect-writes-during-flush extend the batch, pathological cycle → SignalCircularError)
- `packages/signals/tests/properties.test.ts` — modified — +1 batch property (writes inside batch produce 1 init + 1 flush effect run, accounting for first-write Object.is short-circuit when all writes equal 0)

**Verification:**
- Tests: 32 passing (6 files; 27 unit + 4 property + 1 sanity)
- `moon run signals:typecheck` — PASS
- `moon run signals:build` — PASS, `dist/index.js` 629 B gz
- `bun run size` — PASS, 629 B / 1024 B budget (395 B headroom)
- `bunx biome ci .` — PASS

---

## Task 11.5 — re-enable CI

**Commit:** `63d02d1`
**Files:**
- `.github/workflows/plan-a.yml` — modified — uncommented lines for `bun run typecheck`, `bun run build`, `bun run size`; removed the now-stale 3-line comment block that explained why those lines were disabled

**Verification (local pre-flight before CI):**
- `bun run typecheck` — PASS (Moon delegates to `signals:typecheck`)
- `bun run test --coverage` — PASS, 32 tests, coverage: 100% stmts / 95% branch / 100% funcs / 100% lines
- `bun run build` — PASS
- `bun run size` — PASS, 629 B / 1024 B
- `bunx biome ci .` — PASS

---

## Task 12 — Follow-up 1: wire ComputedOptions.equals through to cascade suppression

Adjudicated from Verifier-code Finding 3 + DX Verifier Friction #5. Spec §1.3 prose says `equals` gates downstream cascade on equal recomputes; Deviation 8 said "for API symmetry" — Team Lead resolved in favor of §1.3 prose.

**Commit:** `8d535a8`
**Files:**
- `packages/signals/src/computed.ts` — modified — wired `options.equals` through to runtime: notify() with no subs stays lazy (sets STALE only); notify() with subs eagerly recomputes, compares new vs cached value via the configured comparator, suppresses cascade when equal, propagates when different. equals resolver mirrors signal()'s pattern: `undefined` → `Object.is`, `false` → never short-circuit, function → custom comparator. Dropped the leading underscore on `_options` (now used). Implementation chose Option X (re-think when STALE cascades) over Option Y (version counters) per brief recommendation — no `Subscriber` schema change required.
- `packages/signals/tests/computed.test.ts` — modified — +4 tests (5 → 9): cascade suppressed on equal recompute (default Object.is), cascade fires on unequal recompute, `equals: false` always cascades, custom comparator gates cascade.
- `.team/phase-2/spec-signals.md` — modified — Deviation 8 rationale updated: "for API symmetry" → "wired through to runtime cascade-suppression — see §1.3 for behavior".

**Verification:**
- Tests: 36 passing (6 files; 31 unit + 4 property + 1 sanity)
- `moon run :typecheck` — PASS
- `moon run :build` — PASS, `dist/index.js` 698 B gz (was 629 B; +69 B)
- `bun run size` — PASS, 698 B / 1024 B budget (326 B headroom)
- `bunx biome ci .` — PASS
- Coverage: computed.ts branch 87.5% (was 78.57%); 3 defensive lines remain uncovered (DISPOSED bail, already-STALE re-notify return, RUNNING re-entry on direct read — same set as before, all pre-existing per Verifier Finding 1)

---

## Task 13 — Follow-up 2: README

Adjudicated from DX Verifier §5 (recommended starter).

**Commit:** `cada859`
**Files:**
- `packages/signals/README.md` — created — 79 lines, 6 sections per dx-report.md §5: hook, hello counter, computed, batch, $state for Vue users, cross-library cheat sheet, v0 limitations. Dropped the bullet about `ComputedOptions.equals` being reserved (no longer accurate after Task 12).

**Verification:**
- `bunx biome ci .` — PASS (still 22 files; biome ignores .md)
- Eyeballed the rendered Markdown: code blocks closed, import paths match the public API in `src/index.ts`, cross-library row for `computed` reads "(lazy, call-shape)".
- No `package.json` change needed: npm/bun ship README + LICENSE + package.json by default regardless of `files: ["dist"]`.

---

## Final summary — Phase 2 complete (with follow-ups)

**Commits added on top of plan-a-phase-2 (since rebase from main):** 11

| # | Commit | Subject |
|---|---|---|
| 1 | `9094043` | chore(signals): Task 6 scaffold corrections |
| 2 | `c04941e` | feat(signals): signal() primitive |
| 3 | `9a18460` | feat(signals): effect() |
| 4 | `539ab3b` | feat(signals): computed() |
| 5 | `93ff722` | feat(signals): $state() |
| 6 | `e047293` | feat(signals): cycle detection + property tests |
| 7 | `2bb8ae3` | feat(signals): batch() |
| 8 | `63d02d1` | ci(plan-a): re-enable typecheck/build/size |
| 9 | `257c2b3` | docs(phase-2): finalize build-manifest with summary, coverage, deviations |
| 10 | `8d535a8` | feat(signals): wire ComputedOptions.equals through to cascade suppression |
| 11 | `cada859` | docs(signals): add README with hello-world examples and cross-library cheat sheet |

**Tests:** 36 passing across 6 files (31 unit + 4 fast-check property + 1 sanity)
**Coverage:** 100% statements / 95.71% branch / 100% functions / 100% lines (computed.ts branch 87.5%)
**Build:** `dist/index.js` raw size grew with the equals wiring; **698 B gzipped** vs. **1024 B budget** (326 B headroom, 31.8%)
**Public API surface:** 14 value/type exports + `ComputedOptions` per spec Deviation 8 = 15 total
**Deviations from spec:** zero substantive deviations. One out-of-scope tooling fix (Moon 2.x `.moon/tasks.yml` migration to `.moon/tasks/tasks.yml` directory + `bunx`-prefixed commands) was applied as part of Task 6 corrections; rationale documented in `builder-blockers.md` §1. Spec internal inconsistency around `ComputedOptions.equals` resolved in Task 12 (Follow-up 1) by wiring through to runtime per spec §1.3 prose.

**CI status:** The `.github/workflows/plan-a.yml` workflow only triggers on `push: [main]` and `pull_request: [main]` — pushes to `plan-a-phase-2` do not trigger CI. CI will run when a PR from `plan-a-phase-2` → `main` is opened (Verifier / Team Lead's responsibility per the role contract). All four CI gates (`bun run typecheck`, `bun run test --coverage`, `bun run build`, `bun run size`) plus `bunx biome ci .` PASS locally on the worktree.

**For Verifier / DX-Verifier first look:**

1. Verify `.moon/tasks.yml` → `.moon/tasks/tasks.yml` move was acceptable (out of original frozen scope but documented in `builder-blockers.md`). If undesired, the migration can be reverted and replaced with a different shape (e.g. dropping the Moon delegation in root `package.json` typecheck/build scripts).
2. Computed.ts branch coverage 78.57% (3 lines uncovered): lines 26 (DISPOSED bail in notify), 30 (already-STALE re-notify return), 40 (RUNNING re-entry on read). The first two are defensive guards for paths the v0 tests don't reach (no public dispose for computed); the third is exercised by the cycle test indirectly. Verifier may want a coverage-only test for completeness.
3. The IDE / VS Code TS server may flash TS5097 on `.ts` extension imports — that's a stale tsserver picking up the wrong tsconfig. `moon run signals:typecheck` and `bun run typecheck` both PASS, confirming the `allowImportingTsExtensions` in `tsconfig.base.json` is honored at the build-truth layer.
4. The `core.autocrlf=true` setup on the original Phase 1 scaffold caused CRLF artifacts in working-tree files on Windows checkouts. I ran `bunx biome check --write .` once during Task 6 to normalize line endings. CI on Ubuntu runners is unaffected. Long-term, a `.gitattributes` with `* text=auto eol=lf` would prevent the issue.
