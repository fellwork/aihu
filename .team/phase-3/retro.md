# Phase 3 retro — `@aihu/arbor` orchestration

**Date:** 2026-04-28
**Author:** Team Lead (post-ship)
**Branch:** `phase-3/arbor-implementation` → PR #7
**Pattern:** nomos v3.0 Pattern B (M-scope, 3 teammates: Team Lead + Builder + Verifier; spec replaces upstream Scout + Architect work)
**Wall-clock:** ~3.5 hrs end-to-end (5 Builder spawns + 1 Verifier + 1 follow-up + push + PR)

---

## What shipped

- `@aihu/arbor` v0 — 9 modules, 16 public exports, 51 unit tests
- `untrack()` added to `@aihu/signals` (Phase 3 prep, Task 12.5)
- 1 cross-package integration test (`tests/integration/mount-arbor-with-signals.test.ts`)
- CI trigger fix: `phase-*/**` added to `.github/workflows/plan-a.yml` per spec §3.3 + Learning #5
- Moon task dep fix: `bench-signals:typecheck` depends on `signals:build` (pre-existing main bug, surfaced by the trigger fix above)
- 17 commits on `phase-3/arbor-implementation` (9 feature + 1 follow-up + 1 CI fix + 1 verification report + 5 manifest backfills)

**Sizes (final):**
| Package | Bytes gz | Budget | Headroom |
|---|---|---|---|
| `@aihu/signals` | 716 B | 1024 B | 30% |
| `@aihu/arbor` | 1.16 kB | 2.05 kB | 43% |

**Verifier verdict:** PASS WITH NOTES. 0 HIGH, 0 MEDIUM, 3 LOW (1 closed in-branch).

---

## What worked

### 1. Pattern B with batched Builder spawns matched the watchdog reality

The handoff prompt prescribed 5 sequential Builder spawns of 1–3 tasks each, calibrated to the prior session's 600s no-progress watchdog. **This held.** No Builder stalled; longest spawn (batch 4: mount + dispose) was ~1072s of agent runtime, distributed across many sub-actions. Atomic per-task commits meant any single batch failure would have lost minutes, not hours.

**Carry forward:** for any nomos M/L session in aihu, batch Builder spawns at 1–3 tasks. Single mega-spawns are watchdog bait.

### 2. The spec was load-bearing — adjudicating §7 Open Questions ahead of Builder spawn paid off

Spec §7 had 5 Open Questions. The handoff predicted "most are deferrable to Builder/Verifier discovery." The Team Lead read confirmed all 5 had spec-resident recommendations already; locking those before Builder spawn meant zero mid-batch escalations on those topics. Builder did surface 4 *new* deviations during execution, but none were in §7's scope.

**Carry forward:** when a spec author lists Open Questions with recommendations, the Team Lead's pre-spawn job is to ratify (or reject) the recommendations into binding directions. Don't let those leak into Builder context as "your call."

### 3. Builder Option A ("test what's testable now, defer mount-coupled to dependency-landing batch") cleaned up perfectly

Tasks 13/14/15 each had spec tests that required `mount()` (Task 16). Option A — write the directly-testable subset now, fold mount-coupled tests into mount.test.ts when mount exists — landed without coverage gaps. The Verifier mapped every spec test to its actual location (60-row deviation table in §4.4) and confirmed 100% coverage.

**Carry forward:** when a spec lists tests requiring not-yet-built dependencies, name this pattern explicitly in the spec or Team Lead brief: "Builder Option A — defer dependency-coupled tests to dependency-landing batch; document the relocation in build manifest." Cheaper than stub-and-replace.

### 4. Per-instance amend ban + SHA-backfill discipline preserved a clean history

Each Builder instance was forbidden from amending prior commits. When a manifest entry needed the SHA of a just-created commit, the Builder created a follow-up `docs(phase-3): backfill ... SHA in build manifest` commit. 5 such backfill commits in the final history. **Total cost:** 5 extra commits. **Total benefit:** every `HEAD~N` checkout has a manifest that matches the actual code at that revision; rollback is well-defined; per-task atomicity preserved.

**Carry forward:** memorialize the SHA-backfill pattern in the nomos plan or aihu learnings — when subagents can't amend, this is the right answer.

### 5. The Verifier's spec compliance matrix did its job (Learning #7 confirmed again)

71-row matrix. Caught one PARTIAL row (spec §4 Task 15 #5 — reactive signal on property key under mountEffect). Tests proved the implementation matched itself; the matrix proved the implementation matched the spec. Without it, F2 would have shipped uncaught.

**Carry forward:** Learning #7 is now a 2x-confirmed pattern (Phase 2 + Phase 3). Don't skimp on the matrix in any Verifier spawn brief.

### 6. Concurrent-branch hygiene held (zero file overlap with cellx perf branch)

Per the handoff design, this branch and `perf/signals-cellx-fix` touch entirely disjoint files:
- This branch: new `untrack.ts` + 1-line export in `signals/index.ts` + all of `packages/arbor/`
- Cellx branch: `signal.ts`, `computed.ts`, `effect.ts`

When both PRs land, git auto-merges cleanly. **Verified at push-time: zero conflicts.**

**Carry forward:** the parallel-instance design pattern for non-overlapping packages is reproducible. Use it again when work splits along package or file-level seams.

---

## What didn't work — surface for next time

### 1. CI trigger gap was a Learning #5 violation that caught a Phase 2.5 main-branch bug live

**Symptom:** PR #7's first push CI failed on `bench-signals:typecheck`. Failure was real and reproducible locally (`rm -rf packages/signals/dist && bunx tsc --noEmit -p bench/signals/tsconfig.json` → TS2307).

**Root cause:** `bench-signals` imports `@aihu/signals` via workspace, which resolves through `package.json` exports to `./dist/index.d.ts`. Typecheck doesn't depend on build. On a clean checkout (CI Ubuntu) the dist doesn't exist, resolution fails.

**Pre-existing on main:** the Phase 2.5 bench-spike PR #6 merge commit (`bee3dbc`) shows CI status `failure`. PR #6 was merged red. The bug was undetected because the workflow only triggered on `main` push/PR — and PR #6 was merged through a path that bypassed CI re-run.

**Why we caught it:** spec §3.3 + Learning #5 mandated adding `phase-*/**` to the workflow trigger. First push of arbor work fired CI, surfaced the bug.

**Why this is also a process problem:** the Verifier ran all gates LOCALLY and reported PASS. The Verifier did NOT verify that CI runs the same gates with the same outcome. Local typecheck passes because dist artifacts are cached in `node_modules`/`packages/*/dist` from prior dev runs.

**Carry forward:**
- **Learning #5 is wider than "uncomment commented gates."** It also covers "trigger gates that aren't reaching the right branches" AND "gates whose local environment differs from CI in load-bearing ways." Update Learning #5 accordingly.
- **Verifier brief should include a `bun run clean && bun run typecheck` step (or equivalent dist-purge before each gate).** "Local PASS that depends on stale dist artifacts" is the entire shape of this bug class.
- **Merging a red CI PR is a discipline failure.** PR #6 should not have been mergeable. Either the merge was force-pushed past a failing check, or the protection wasn't configured. Check branch-protection rules on `main` after Phase 3 lands.

### 2. Telemetry tree-shake spec was too optimistic

Spec §2.8 promised "production cost is **zero bytes**." Reality: ~100–150 B because `Date.now()` is impure and `_observeMount` is `export let` (mutable binding visible to external consumers via `_setMountObserver`). Builder filed a non-blocking observation; Verifier accepted as v0 deviation; investigation now in flight (`telemetry-treeshake-investigation.md` pending).

**Spec author error pattern:** assuming bundler tree-shake will eliminate all calls to a no-op default function, without verifying with a real Rolldown build. The "Builder confirms via `bun run size` after Task 16 that the production bundle does NOT include the telemetry calls" gate was correctly placed in the spec (§2.8) — it just got escalated to "documented as v1 fix" instead of "land the `__DEV__` switch now" because of the 43% headroom.

**Carry forward:**
- **Spec writers must run a real bundle for any tree-shake claim.** "I expect Rolldown to eliminate this" is a hypothesis, not a contract.
- **The headroom-to-budget ratio shapes adjudication thresholds.** With 43% headroom, ~120 B of bloat is acceptable; with 5% headroom, the same bloat would be a HIGH finding.

### 3. Pre-existing project staleness around `.prototools` Node version

Spec §3.4 noted `.prototools` pinned `node = "20.18.0"` while Rolldown wants 20.19+, and authorized bumping in Task 12 or deferring to Phase 4. The Builder's Task 12 inspection found `.prototools` already at `node = "22.12.0"` — bumped between spec authoring and Phase 3 spawn. The spec was outdated.

**Carry forward:** Learning #6 (plan staleness) extends to spec staleness too. The Team Lead's pre-spawn read should include a "spec vs current state" diff for any version pins, dependency lists, or env claims. Builder's first action should re-confirm; Architects should run a freshness check before publishing.

### 4. Two-step decision points cost wall-clock

The Team Lead paused for user input twice during execution:
- Before batch 1 (3-question check-in: branch strategy, autonomy level, CI trigger timing)
- At Verifier completion (codex review yes/no, then push approval)

Each pause adds latency tied to user response time. Cumulative: ~30 min on top of agent runtime.

**Carry forward:** for sessions explicitly scoped as "full autonomy" (user said "use the orchestration agent for management"), eliminate the pre-batch-1 pause and the post-Verifier pause when there's nothing material to decide. The user's autonomy commitment IS the decision; don't re-ask. Reserve pauses for actual ambiguity (e.g., HIGH Verifier findings, codex disagreement).

---

## Numbers

| Metric | Value |
|---|---|
| Wall-clock end-to-end | ~3.5 hrs |
| Agent runtime (sum of spawn durations) | ~58 min |
| Team Lead orchestration time | ~75 min reading + writing |
| User decision time | ~30 min cumulative |
| Total commits on branch | 17 (was 13 + 1 follow-up + 1 verification report + 1 CI fix + ... wait, let me recount: 9 feature + 5 manifest backfill + 1 follow-up test + 1 verification report + 1 CI fix = 17) |
| Tests landed | 51 arbor + 3 untrack + 1 integration = 55 new tests |
| Lines added | ~2300 across 31 files |
| Builder spawns | 5 main + 1 follow-up = 6 |
| Verifier spawns | 1 |
| Investigation agents | 1 (background, in flight at retro time) |
| Verifier findings | 0 HIGH, 0 MEDIUM, 3 LOW (1 closed in-branch) |
| Spec compliance matrix rows | 71 |
| Spec deviations | 4 (telemetry tree-shake, bench threshold, integration test signal form, mount-coupled test folding — all ACCEPT) |

---

## Carry-forward items for `.team/learnings.md`

Recommend adding these as new entries (Historian's call on numbering):

- **Learning #19 — Pattern B + batched Builder spawns is the M-scope default for aihu.** Single mega-spawns risk the 600s watchdog. Batch at 1–3 tasks per spawn; per-task atomic commits.

- **Learning #20 — SHA-backfill commits are the right answer when subagents can't amend.** Per-instance amend ban preserves history integrity at the cost of N extra commits.

- **Learning #21 — Builder Option A ("defer dependency-coupled tests to dependency-landing batch") preserves coverage with cleaner sequencing.** Document the relocation in build manifest.

- **Learning #22 — Spec §x.y tree-shake claims must be verified with a real bundle before publishing.** "I expect Rolldown to eliminate this" is a hypothesis, not a contract.

- **Learning #5 amendment — local gate PASS that depends on stale dist artifacts is the same bug class as commented-out gates.** Verifier brief must include a clean-state run for any gate that touches build outputs.

- **Learning #6 amendment — spec staleness mirrors plan staleness.** Pre-spawn read should diff spec assumptions against current repo state.

---

## What I'd do differently

1. **Run a clean-state typecheck as the very first action** in any Verifier brief. Would have caught the bench-signals issue before pushing PR #7's first commit.
2. **Skip the post-Verifier "should we run codex" pause** when codex isn't installed — let the Team Lead just decide and ship. (We didn't have codex anyway.)
3. **Run the telemetry tree-shake investigation BEFORE accepting the deviation,** not after. Verifier accepted ~120 B as v0 acceptable, but the investigation may show the fix is 5 minutes of work and saves the bytes now. We've now committed to a v1 cleanup that may have been unnecessary.
4. **Capture the bench-signals fix as a separate PR (Option B from the discussion).** Mixing a pre-existing main-branch fix into a feature PR creates scope ambiguity for reviewers. Future Team Leads should default to separate PRs for surface-discovered fixes — or at minimum a separate commit with extremely clear message text (which we did).

---

## Open items

- [ ] Telemetry tree-shake investigation completes (`telemetry-treeshake-investigation.md` pending)
- [ ] If the investigation shows a cheap fix, ship it as v0+1 BEFORE landing arbor (or after, as a follow-up)
- [ ] Add learnings to `.team/learnings.md` (Historian's call when this conversation ends)
- [ ] Branch protection audit on `main` — PR #6 should not have been mergeable with red CI
