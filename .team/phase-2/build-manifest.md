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

**Commit:** (pending)
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
