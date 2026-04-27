# Build manifest — Phase 2 (`@scribe/signals`)

Append-only log of files created/modified per task, with verification results.

---

## Task 6 — scaffold corrections

**Commit:** `9094043`
**Files:**
- `tsconfig.base.json` — modified — added `"allowImportingTsExtensions": true` (R-T2 fix per spec §3.2)
- `packages/signals/moon.yml` — modified — `type: library` → `layer: library` (R-T1 fix per spec §3.1)
- `packages/signals/src/errors.ts` — modified — removed `chain` field; constructor takes optional `message` defaulting to `'circular dependency detected'`; added rationale comment per spec §1.6 (Decision 2)
- `.size-limit.json` — modified — trimmed to only `@scribe/signals` row (per spec §3.3 — others added back in Tasks 12/20/23/25)
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

**Commit:** (pending)
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
