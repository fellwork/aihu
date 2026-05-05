# Verifier Report — cli-templates B1.3 (FINAL ROUND)

- **Topic:** cli-templates
- **Round:** B1.3 (final round of v0.2.0 milestone)
- **Branch audited:** `feat/cli-templates-b1.3` @ `98dae60`
- **Mode:** 2 (Verifier audit, bidirectional + sample-based)
- **Date:** 2026-05-05

---

## STATUS: **PASS**

All 6 deliverables (D1–D6) plus all 3 inline edits (A, B, C) shipped per the
brief. Acceptance gate green. Bidirectional audit clean: no under-implementation,
no over-implementation creep, no modifications to the locked B1.1 contract
files. Behavioral end-to-end check passes for all 3 auth providers.

**Recommendation: PROCEED to v0.2.0 close** — Director r-005 + Synthesizer
r-005 + Historian + tag push.

---

## Acceptance results

### Tests

| Suite | Result | Detail |
|---|---|---|
| `packages/cli/tests/cli.test.ts` | PASS | 44 legacy tests preserved |
| `packages/cli/tests/scaffold-and-compile.test.ts` | PASS | 3 file-presence tests pass; 3 compile-phase tests skipped (Windows + AIHU_SCAFFOLD_COMPILE gate, by design — see Findings) |
| `packages/cli/tests/legacy-snapshot.test.ts` | PASS | byte-identical match against 6-file golden tree |
| `bun run typecheck` (workspace) | PASS | 27 tasks completed |
| `moon run templates:typecheck` | PASS | no-op (B1.2.1 F-1 fix preserved) |

### Deliverables

| ID | Description | Status |
|---|---|---|
| D1 | `packages/cli/src/bin.ts` — pipeline dispatch wired | PRESENT — calls all 6 stages: `resolveTemplate` (L261), `mergeOptions` (L266), `enumerateFiles` (L276), `readSubstituteWrite` (L280), `runPostInstall` (L302), `printNextSteps` (L330). Falls through to legacy `scaffoldApp()` (L367) when `--template` doesn't resolve. Honors `--no-git`, `--no-install`, `--pm`, `--options-json`, `--use-defaults`, `--no-interactive`. |
| D2 | `packages/cli/tests/scaffold-and-compile.test.ts` — `it.each` over 3 auth providers | PRESENT — uses `it.each(PROVIDERS)` over `['better-auth', 'kinde', 'supabase']`. File-presence assertions: per-provider auth file inclusion + cross-provider exclusion, per-provider `.env.example.*`, default `.mcp.json`, default `live-counter.aihu`, top-level `package.json`, `apps/web/package.json`, no `.tmpl` leakage. |
| D3 | `packages/cli/tests/legacy-snapshot.test.ts` + golden | PRESENT — golden directory contains 6 files (`index.html`, `package.json`, `rolldown.config.ts`, `src/main.ts`, `src/pages/index.aihu`, `tsconfig.json`). Test does byte-by-byte buffer comparison. First-run bootstrap throws (no silent pass). |
| D4 | `.changeset/cli-templates-v0.2.0.md` | PRESENT — front-matter `'@aihu/cli': minor` + `'@aihu/templates-cf-team': minor` exact per brief; body summarizes v0.2.0 milestone. |
| D5 | `packages/templates/cf-team/template/README.md.tmpl` Setup section + v0.2.1 TODO | PRESENT — Setup section explains `.env.example.<provider>` rename procedure; v0.2.1 follow-up captured as inline HTML comment per brief. |
| D6 | `.github/workflows/plan-a.yml` `check` job extended | PRESENT — `timeout-minutes: 25` set on job. `scaffold-and-compile.test.ts` step gated by `if: runner.os != 'Windows'` (matches in-test skip). `legacy-snapshot.test.ts` runs unconditionally. |
| Inline A | arch-6 §2.3 peer-dep ranges 1.0.0 → 0.2.0 | APPLIED — 5 `@aihu/*` entries (`runtime`, `arbor`, `signals`, `router`, `adapter-cloudflare`) all `^0.2.0`. `cliRange` also `^0.2.0`. External `better-auth: ^1.0.0` correctly retained as third-party. |
| Inline B | arch-6 §2.6 expose example reshaped (adds `@state` + `$describe`) | APPLIED — block now contains `@state { appName }`, `@template`, `@agent { $expose appName as readonly; $describe appName "..." }` per the brief verbatim. |
| Inline C | `packages/templates/cf-team/template.config.ts` adds `'@aihu/server': '^0.2.0'` to `appPeerDeps` | APPLIED — line added under `appPeerDeps` (single-line diff). |

### Acceptance commands (Bash-runnable from brief)

```
bun run test packages/cli/tests/cli.test.ts                          # exit 0 (44 tests)
bun run test packages/cli/tests/scaffold-and-compile.test.ts         # exit 0 (3 pass, 3 skip-by-design)
bun run test packages/cli/tests/legacy-snapshot.test.ts              # exit 0
test -f .changeset/cli-templates-v0.2.0.md                           # PRESENT
grep -q "Setup" packages/templates/cf-team/template/README.md.tmpl   # MATCH
grep -q "scaffold-and-compile" .github/workflows/plan-a.yml          # MATCH
grep -q "legacy-snapshot" .github/workflows/plan-a.yml               # MATCH
grep -c "'\^0\.2\.0'" docs/roadmap/arch-6-cli-templates.md           # 6 (≥5 expected)
grep -q '\$describe appName' docs/roadmap/arch-6-cli-templates.md    # MATCH
grep -q "'@aihu/server'" packages/templates/cf-team/template.config.ts # MATCH
bun run typecheck                                                     # PASS
moon run templates:typecheck                                          # PASS (no-op)
```

---

## Bidirectional audit

### Under-implementation — none

| Check | Result |
|---|---|
| `bin.ts` calls all 6 pipeline stages? | YES — verified by source read |
| `bin.ts` falls through to legacy `scaffoldApp()` when `--template` doesn't resolve? | YES — L362-368 explicitly handles this |
| `scaffold-and-compile.test.ts` uses `it.each` over 3 providers? | YES — `it.each(PROVIDERS)` with `PROVIDERS = ['better-auth', 'kinde', 'supabase']` |
| `legacy-snapshot.golden/` has actual files? | YES — 6 files, non-empty, byte-anchored |
| §2.3 changed all 5 `^1.0.0` → `^0.2.0`? | YES — 5 `@aihu/*` entries + cliRange = 6 total `^0.2.0` matches |
| §2.6 example actually adds `@state` block? | YES — full block with `$describe` line |

### Over-implementation (creep) — none

| Check | Result |
|---|---|
| No new templates other than `cf-team/`? | CONFIRMED — `ls packages/templates/` shows only `cf-team/` and `moon.yml` |
| No `tier: 'template'` in `scripts/sync-readme.ts`? | CONFIRMED — zero occurrences of `'template'` as Tier; no `templates-cf-team` row |
| No `rename` field on `conditionalFiles`? | CONFIRMED — `grep -n rename` empty across pipeline + manifest + template config |
| No conditional-deps render pass in `scaffold-pipeline.ts`? | CONFIRMED — file diff vs `origin/main` is 0 lines |
| `scaffold-pipeline.ts` unmodified? | CONFIRMED — `git diff origin/main` = 0 |
| `template-manifest.ts` unmodified? | CONFIRMED — `git diff origin/main` = 0 |
| `conditional-eval.ts` unmodified? | CONFIRMED — `git diff origin/main` = 0 |
| `prompts.ts` unmodified? | CONFIRMED — `git diff origin/main` = 0 |
| `templates-registry.ts` unmodified? | CONFIRMED — `git diff origin/main` = 0 |

### Housekeeping diffs (not creep, in support of the new fixture)

- `biome.json` — adds `!packages/cli/tests/legacy-snapshot.golden` to ignore list. Required: golden tree contains literal-string templated files that biome would otherwise lint.
- `packages/cli/tsconfig.json` — adds `exclude: ["tests/legacy-snapshot.golden/**"]`. Required for the same reason at the type-checker level.
- `scripts/sync-readme.ts` — adds `legacy-snapshot.golden/` to the `discoverPackages` skip list. Required because the golden tree contains a `package.json` that is NOT a real workspace package.
- 30+ `packages/*/README.md` files — `<commit-sha>` stamp updates from a `sync-readme.ts` pre-commit hook run. Cosmetic only; no content change.

---

## Behavioral end-to-end results

Invoked the wired `bin.ts` directly into a `mktemp` dir for each of the 3 auth
providers. **Provider-switching works correctly across all three.**

```
=== default (auth=better-auth) ===
PASS .mcp.json present (default agentSurface=minimal)
PASS default auth: better-auth
PASS kinde EXCLUDED at default
PASS supabase EXCLUDED at default
PASS env example present (.env.example.better-auth)
PASS wrangler.toml present
PASS moon.yml present
PASS live-counter.aihu (default starter) present

=== auth=kinde ===
PASS kinde.ts present
PASS better-auth.ts excluded
PASS .env.example.kinde present

=== auth=supabase ===
PASS supabase.ts present
PASS better-auth.ts excluded
PASS .env.example.supabase present
```

The §4.2 conditional-file-inclusion mechanism — the v0.2.0 thesis — is
demonstrably working through the wired bin.ts pipeline.

Scaffold runtime emits the expected output line:
```
created  <abs path>/wrangler.toml
skipped  git-init
Done! Your app is at <abs path>/smoke-final
```

---

## Findings to flag for Director r-005

### F-1 — `AIHU_SCAFFOLD_COMPILE` env flag never set in CI

**Severity:** medium · **State-file disposition recommended:** v0.2.1 follow-up
or pre-publish gate.

The 3 compile-phase tests in `scaffold-and-compile.test.ts` (lines 144-170) are
gated on `process.env.AIHU_SCAFFOLD_COMPILE === '1'`. The CI workflow
(`.github/workflows/plan-a.yml`) does NOT set this env var, so the tests are
ALWAYS skipped in CI.

The test file itself documents the rationale: the scaffolded app's emitted
`package.json` references `@aihu/* ^0.2.0` peer deps that are not yet on npm
(since this PR is v0.2.0 itself). Once the workspace-resolution path lands,
CI flips this to `1` and the compile gate becomes live.

This means **the v0.2.0 release ships with the compile-after-scaffold guarantee
in deferred-validation form**. The file-presence assertions are the
deterministic gate today; downstream compile is local-only (`AIHU_SCAFFOLD_COMPILE=1`).

**Director consideration:** before publishing `@aihu/templates-cf-team@0.2.0`
to npm, run a one-shot manual `AIHU_SCAFFOLD_COMPILE=1 bun run test
packages/cli/tests/scaffold-and-compile.test.ts` against the published packages
to verify the chain holds end-to-end. (Or schedule a v0.2.1 PR that wires the
workspace-resolution path so the gate becomes self-running.)

### F-2 — biome.json schema version diagnostic (info-only)

`biome.json` declares `$schema` for `2.4.14` while the installed Biome is
`2.4.13`. Biome emits an info-level diagnostic suggesting `biome migrate`.
Non-blocking, not a regression introduced by this PR (already existed on
`main`), but worth scheduling a `biome migrate` pass with the next routine
DX sweep.

### F-3 — README autogen commit-sha drift on every PR

The 30+ `packages/*/README.md` updates in this PR are pure commit-sha stamp
churn (`Auto-generated against ... on commit <sha>`) emitted by the
`sync-readme.ts` pre-commit hook. This makes every CLI-touching PR's diff
larger than its conceptual scope.

**Disposition:** consider pinning the commit stamp to release tags rather than
`HEAD`, OR removing the stamp entirely. v0.2.x DX-quality task; not blocking
for v0.2.0 close.

### F-4 — D5 README addendum prose is brief-quoted but file is a `.tmpl`

The Setup section in `packages/templates/cf-team/template/README.md.tmpl` is
emitted verbatim into scaffolded apps (no `__APP_NAME__`-style placeholder
in the new prose). Functionally fine; if v0.2.1 adds `pipeline-rename` per
the inline TODO, the addendum prose will need to be deleted simultaneously
to avoid stale instructions. Captured as a v0.2.1 follow-up via the inline
HTML comment.

---

## Verdict

**PROCEED to v0.2.0 close.**

- All 6 deliverables shipped.
- All 3 inline edits applied.
- Acceptance bar from §8 of arch-6 (relevant subset for cf-team) green.
- Backward-compat hard contract (R-CT-06): legacy snapshot byte-identical.
- Bidirectional audit: no under- or over-implementation. Locked B1.1 contract
  files (5 of them) untouched.
- Behavioral end-to-end across all 3 auth providers green.

Findings F-1 through F-4 are non-blocking and are forwarded to Director r-005
for v0.2.1+ planning.

Director r-005 + Synthesizer r-005 + Historian + tag `v0.2.0` is unblocked
on the engineering side. The only remaining gate is publication readiness
(F-1's manual compile-phase verification before `npm publish`).
