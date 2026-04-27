# Builder blockers — Phase 2

## 1. Moon 2.x global tasks file location + bunx prefix (RESOLVED in Task 6)

**Date:** 2026-04-26
**Severity:** Resolved during Task 6 corrections.

### Symptom

After applying Task 6 corrections per spec §3.1 (per-package `type: library` → `layer: library`), `moon run signals:typecheck` and `moon run signals:build` still failed.

1. `moon run signals:typecheck` → `Unknown task typecheck for project signals`. Cause: Moon 2.x looks for inheritable task configs under **`.moon/tasks/`** (directory), not `.moon/tasks.yml` (single v1-style file). The Phase 1 scaffold left the v1-shaped `.moon/tasks.yml`. `MOON_LOG=debug` confirmed: `Loaded 0 task configs for inheritance`.
2. After moving `.moon/tasks.yml` → `.moon/tasks/tasks.yml`, `moon run signals:build` failed with `rolldown: The term 'rolldown' is not recognized`. Cause: Moon's default shell (PowerShell on Windows) doesn't search `node_modules/.bin` automatically. `tsc` happened to be on the global PATH (npm install -g), but `rolldown` is local-only.

### Resolution applied (Task 6)

These changes live in `.moon/tasks/tasks.yml` (the file I moved). Spec §3.1 only addressed the per-package `moon.yml` field; the deeper Moon v1→v2 migration (file location + bin lookup) was outside spec but a clear scaffold-tooling unblocker, in the same spirit as the documented R-T1 fix. Treated as Task 6 scope.

1. **Moved `.moon/tasks.yml` → `.moon/tasks/tasks.yml`.** Restores Moon 2.x inheritance.
2. **Changed `command:` strings to `bunx`-prefixed:**
   - `tsc --noEmit` → `bunx tsc --noEmit`
   - `rolldown -c` → `bunx rolldown -c`

   `bunx` resolves binaries from `node_modules/.bin`, identical to how `bun run` would in package scripts.

### Verification (post-fix)

- `moon run signals:typecheck` → PASS (~2s)
- `moon run signals:build` → PASS, dist/index.js emitted (108 B gz pre-task-7)
- `bun run size` → PASS, 108 B vs 1024 B budget (Task 6 scaffold only — will grow as primitives land)

### Caveats noted but not blocking

- Rolldown emits `WARN You are using Node.js 20.18.0. Rolldown requires Node.js version 20.19+ or 22.12+`. The build still completes; this is a soft-warn for the bundler. Outside Builder's responsibility — Team Lead may want to bump `.prototools` Node pin in a follow-up.
