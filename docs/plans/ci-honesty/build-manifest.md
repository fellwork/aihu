# CI-honesty build manifest — #434 (golden regen) + #445 (CI gate no-op)

Branch `fix/ci-honesty` off `origin/main` (`94ad14f7`). Founder-ratified plan
(2026-07-20, /autoplan) executed in the ratified order: audit → regen → enforce.

## Step 1 — Audit (pre-flip safety)

### Named test-file invocations in CI

Every `.github/workflows/*.yml` was searched for vitest/test invocations. Only
`plan-a.yml` invokes vitest at all; the other six workflows (deploy-docs,
js-framework-benchmark, release, release-pr, storybook, visual) run none.

| Invocation | Selected tests (verified with `vitest list`) | Verdict |
| --- | --- | --- |
| `plan-a.yml:120` `bun run test packages/cli/tests/scaffold-and-compile.test.ts` | 3 tests | genuinely runs |
| `plan-a.yml:121` `bun run test packages/cli/tests/legacy-snapshot.test.ts` | **0 tests** — root exclude defeats the filter, "No test files found", exit 0 | **defeated (the #445 vacuum)** |
| `plan-a.yml:122` `bun run test --coverage` | full suite | genuinely runs |
| `plan-a.yml` examples job `(cd examples/* && bun run test)` | per-example configs, own smoke tests | genuinely runs |

`packages/compiler/tests/b3b-sidecar-tsc.test.ts`: excluded at root AND
invoked nowhere (repo-wide grep: the only reference outside the test itself
was the exclude line in `vitest.config.ts`). Second member of the
excluded-and-invoked-nowhere class, as the eng-review audit predicted.

### Does anything rely on `passWithNoTests: true`?

**No.** The root config was the only `passWithNoTests: true` in the repo:

- `tests/vitest.config.ts` (integration): already `false`.
- `packages/mcp/vitest.config.ts`: already `false`.
- All 16 `examples/*/vitest.config.ts`: none set it (vitest default is false).
- Root-config consumers: `bun run test` (check:ci, plan-a:122 — full suite,
  many tests), plan-a:120 (3 tests), plan-a:121 (0 tests — but that vacuous
  pass is the bug, not a legitimate reliance).
- Per-package `"test": "vitest run"` scripts resolve their own package-local
  configs (or defaults), not the root config.

Safe to flip.

## Step 2 — Golden regeneration (#434)

Run explicitly via a new `vitest.gates.config.ts` (root config minus the
gated excludes; the vitest CLI `--exclude` flag only APPENDS, so it cannot
bypass a config exclude — a dedicated config is the only bypass).

1. Pre-regen run against the old golden: **1 failed** — byte-mismatch in
   `package.json`, reproducing #434 exactly.
2. Deleted `packages/cli/tests/legacy-snapshot.golden/`, re-ran: harness
   bootstrapped a fresh 6-file golden (and failed loudly to say so, as
   designed). Second run: **1 passed**.
3. **Full old-vs-new diff — exactly two hunks, both in `package.json`, no
   other file changed** (also confirmed by `git diff` against the committed
   golden):

```diff
@@ -7,7 +7,7 @@
     "dev": "vite",
     "build": "vite build",
     "preview": "vite preview",
-    "typecheck": "tsc --noEmit"
+    "typecheck": "aihu-tsc"
   },
   "dependencies": {
     "@aihu/app": "latest",
@@ -20,6 +20,7 @@
     "@aihu-plugin/agent-readiness": "latest",
     "@aihu/cli": "latest",
     "@aihu/compiler": "latest",
+    "@aihu/tsc": "latest",
     "typescript": "^5.0.0",
     "vite": "^6.0.0"
   },
```

   This is precisely the ratified expectation (PR #395's intentional
   `aihu-tsc` script + `@aihu/tsc` dep). No unexpected hunk; no stop needed.
4. Annotation: `packages/cli/tests/legacy-snapshot.golden/README.md` records
   why it moved (PR #395 / commit `81279254`, 2026-07-13), regen date
   (2026-07-20), and the emitter commit (`94ad14f7`). The harness skips
   `README.md` only when walking the GOLDEN dir — if the scaffold ever emits
   a top-level README.md, the produced walk includes it and the file-set
   comparison fails loud (no silent un-gating).
5. CI guard: the harness now throws (without writing) when the golden dir is
   missing and `process.env.CI` is set — missing dir in CI is a hard fail,
   never a self-generated vacuous pass. Verified: `CI=1` + golden moved aside
   → test fails with the refusal message, nothing written.

## Step 3 — Enforce (#445)

1. **`passWithNoTests: false`** at root `vitest.config.ts` (audit above
   cleared it). The gates config sets it `false` too (defense-in-depth).
2. **Approach for the named snapshot step: dedicated `--config` (kept the
   root exclude).** plan-a:121 now runs
   `bun run test packages/cli/tests/legacy-snapshot.test.ts --config vitest.gates.config.ts`.
   Chosen over un-excluding because plan-a:122's `--coverage` full run would
   otherwise double-run the test; the dedicated config keeps total CI time
   flat (the test runs exactly once), keeps the named step's failure
   attribution, and keeps fresh-clone `bun run test` behavior unchanged.
3. **Meta-assertion:** `tests/ci-gate-config.test.ts` (4 tests, runs in the
   default suite) pins `passWithNoTests === false` in BOTH configs, pins the
   gates config's exclude to `['**/node_modules/**']`, and — closing the b3b
   class generally — asserts every root-excluded test file has a plan-a step
   invoking it with `--config vitest.gates.config.ts`. Manual behavioral
   proof: `bunx vitest run packages/does-not-exist/nope.test.ts` → **exit 1**
   under the root config and **exit 1** under the gates config.
4. **Per-example configs:** none of the 16 `examples/*/vitest.config.ts`
   set `passWithNoTests` at all (default false) — nothing to hand to #425.

## b3b-sidecar-tsc disposition: RESURRECTED

Read + run explicitly. With its two build prerequisites present it is fully
green — **5/5 pass**:

- needs the built `aihu-compile` Rust binary (staged at
  `packages/compiler/bin/`, as CI already does), and
- needs built `packages/*/dist` type surfaces: its `runTsc` maps
  `'@aihu/*'` → `packages/*/dist/index.d.ts`, so without `bun run build` the
  W4 test fails with TS2307 (`Cannot find module '@aihu/signals'`) — 4/5.

Because plan-a runs the coverage suite BEFORE `bun run build`, un-excluding
it at root would turn CI red (and fresh clones red). It therefore stays
excluded at root (comment rewritten — the stale "until B3b lands" reason is
gone) and runs as a NEW dedicated plan-a step placed AFTER `bun run build`,
via the gates config. The meta-assertion above fails if that step is ever
removed while the exclude remains.

## Measured results

| Check | Result |
| --- | --- |
| legacy-snapshot vs regenerated golden (gates config) | 1 passed (1), exit 0 |
| Golden diff hunks | 2 (the two ratified `package.json` hunks; verbatim above) |
| Bogus filter, root config | exit **1** |
| Bogus filter, gates config | exit **1** |
| CI=1 + missing golden | hard fail, refusal message, nothing written |
| b3b-sidecar-tsc (binary + dist present) | 5 passed (5) |
| `bunx vitest run packages/cli` | 294 passed, 4 skipped, 0 failed (17 files passed, 1 skipped) |
| `tests/ci-gate-config.test.ts` | 4 passed (4) |
| `bun run typecheck` | PASS (50 tasks, 20s) |
| `node_modules/.bin/biome ci` on the 4 touched TS files | exit 0 |
| `plan-a.yml` | python yaml.safe_load OK |

## Files changed

- `vitest.config.ts` — `passWithNoTests: false`; exclude comment rewritten.
- `vitest.gates.config.ts` — NEW; root config minus the gated excludes.
- `.github/workflows/plan-a.yml` — legacy-snapshot step gains
  `--config vitest.gates.config.ts`; new post-build b3b gate step.
- `packages/cli/tests/legacy-snapshot.test.ts` — CI auto-write guard;
  golden-walk README skip.
- `packages/cli/tests/legacy-snapshot.golden/package.json` — regenerated
  (the two ratified hunks).
- `packages/cli/tests/legacy-snapshot.golden/README.md` — NEW; provenance.
- `tests/ci-gate-config.test.ts` — NEW; #445 meta-assertion.

## Surfaced, not changed (out of lane)

- plan-a:120 `scaffold-and-compile.test.ts` is NOT excluded, so it runs in
  the named step AND again in the coverage run — a pre-existing double-run,
  left as-is (changing it is not this PR's lane).
- `packages/tsc/tests/language-plugin.test.ts` still hard-depends on the
  built binary in the default suite (red in fresh clones, green in CI) —
  the D2 policy question from the investigation remains open.
- Example configs are #425's lane (nothing found to fix anyway).
