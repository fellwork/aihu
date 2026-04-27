# Build manifest — Phase 2 (`@scribe/signals`)

Append-only log of files created/modified per task, with verification results.

---

## Task 6 — scaffold corrections

**Commit:** (pending)
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
