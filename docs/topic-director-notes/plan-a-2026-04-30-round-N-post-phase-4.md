# Director note — plan-a — 2026-04-30 (Round N, post-Phase-4 PASS)

**Director:** Topic Director (post-Phase-4 Verifier PASS, post-signals-headroom Investigation)
**Track:** plan-a (TypeScript runtime family)
**Active branches:** `claude/scribe-phase-3-team-Za4UQ` (team), `phase-4/runtime-implementation` (Phase 4 PASS, unmerged), `investigate/signals-headroom` (investigation done)
**Inputs read:** state-plan-a.md, prior director-note 2026-04-30, Phase 4 verification-report.md, Phase 4 build-manifest.md, signals-headroom-investigation.md, learnings #10/#11/#13/#15/#16/#17, spec-agent.md.

---

## 1. On-thesis assessment

The thesis is **sub-2 kB primitives → DOM → runtime → AI-first agent binding, with named-axis SOTA wins enforced by CI**. Map of candidates against the load-bearing learnings:

| Candidate | Learning #10 (in-house) | Learning #11 (SOTA-or-no-ship) | Learning #13 (150-line cap) | Learning #15 (AI-first in-tree) | Learning #16 (Tier 3 hooks now) | Learning #17 (magna canonical) |
|---|---|---|---|---|---|---|
| A. Land Phase 4 → team branch | n/a (logistics) | neutral | neutral | enables §15 stack | neutral | neutral |
| B. Phase 5 (`@scribe/agent`) | **on-thesis** (registry is in-tree) | neutral (100 B budget — no perf axis) | on-thesis (2-file package) | **load-bearing** — registry is the runtime-side data source for the manifest | **on-thesis** — v0 ships the data shape sub-project #7 needs | aligns (manifest unifies `<agent>` + magna introspection) |
| C. Signals headroom recovery | on-thesis (perf hygiene) | **on-thesis** — preserves the cellx/deep-perf wins | n/a | neutral | neutral | neutral |
| D. Arbor v0+1 cleanup | on-thesis (#10 housekeeping) | neutral | **load-bearing** — mount.ts 195 → ~150 closes the known #13 deviation | neutral | neutral | neutral |
| E. Arbor SOTA bench | on-thesis | **HIGHEST stake** — without this, arbor's 1.16 kB has no axis we've named-and-won | neutral | neutral | partial — bench includes magna track per §17 but standalone is fine | partial (two-track bench from §17) |
| F. learnings.md update (#19–22 + amends) | neutral (Historian) | neutral | neutral | neutral | neutral | neutral |
| G. state-plan-a.md update | neutral (Historian) | neutral | neutral | neutral | neutral | neutral |

**The two thesis-load-bearing items are B (Phase 5) and E (arbor SOTA bench).** D is a #13 hygiene cleanup that stops the deviation from compounding. C is perf-hygiene that protects the public posture. A/F/G are mechanics.

**Key thesis observation:** v0 currently has **zero arbor-vs-SOTA receipts**. Signals has receipts (cellx, deep-perf, "ahead of alien-signals on all benches"). Arbor doesn't. Per Learning #11, that means arbor isn't done by our own rule. Phase 5 doesn't change this; only E does.

---

## 2. Routing for synthesis

This director-note IS the topic summary for Round N — no separate synthesis artifact required. Digest order:

1. **Phase 4 verification report → state-plan-a.md** (close the row, log the 2 LOW findings as v0+1 follow-ups, record 438 B / 1024 B).
2. **Signals investigation → state-plan-a.md** (record the 1.7 kB budget bump rationale + Candidates 1+2+7 as recovery work; close the "investigate signals 49 B headroom" row).
3. **Phase 3 retro carry-forward (Learnings #19–22 + #5/#6 amendments) → already-landed in `.team/learnings.md`** (verified: #19, #20, #21, #22 all present; #5 and #6 have Phase-3-retro amendments). **No Historian work needed for #19–22.** This pre-empts F.
4. **Phase 5 spec → Builder dispatch brief** (spec is final; no synthesis needed beyond brief construction).

The Team Lead inherits this note as the routing input. No formal topic summary is owed.

---

## 3. Priority — ranked

| Rank | Item | Rationale |
|---|---|---|
| **P0** | **A. Land Phase 4 → team branch** (merge `phase-4/runtime-implementation` → `claude/scribe-phase-3-team-Za4UQ`) | Logistics, but precondition for state coherence. Phase 4 is PASS; sitting unmerged on a phase branch creates drift risk against any concurrent work on the team branch. ~5 min ff-merge. |
| **P0** | **C. Signals headroom recovery — bump 1.6 → 1.7 kB + Candidates 1+2+7** | ~30 min, ~40–60 B recovered, AND it unfreezes the "1.55/1.6 kB / 49 B" number that has been a yellow flag in three Director notes. Must land before Phase 5 closes v0 (see §6). Touches `packages/signals/src/signal.ts` (1 line for `__HOST` Symbol), `packages/signals/src/index.ts` (1 line for `MAX_BATCH_ITERATIONS`), `packages/signals/src/effect.ts` (~10 lines for `unlinkAllDeps` inline), `.size-limit.json` (1 line for budget bump). Disjoint from Phase 5 and arbor cleanup. |
| **P0** | **B. Phase 5 Builder dispatch (`@scribe/agent`, Tasks 23–24)** | Spec final. ~80 B / 100 B target. Disjoint from signals and arbor source. Closes the v0 phase ladder. **Dispatch in parallel with C and D** per Learning #19 non-overlapping-package pattern. |
| **P1** | **D. Arbor v0+1 cleanup** (Phase 3 Findings 1+3 + missing test for §4 Task 15 #5) | Closes the 195-line mount.ts known-#13-deviation, the `_activeMountDisposers` accidental public export, and the missing assertion. Disjoint from B and C. Worthy of parallel dispatch in this round. ~1 hour. Telemetry extraction is the pre-requisite for E (cleaner module boundary makes bench harness cleaner). |
| **P1** | **G. state-plan-a.md update** | After A/B/C/D land. Must reflect: Phase 4 done at 438 B/1024 B, Phase 5 done at NB/100 B, signals at 1.5 kB/1.7 kB, arbor cleanup landed, mount.ts now ≤150 lines, Phase 4 LOW findings logged. End-of-round Historian work, not parallel. |
| **P2** | **E. Arbor SOTA bench** | Thesis-critical (Learning #11) but **deferred to next round**. This round is already 4 parallel tracks; adding bench-spike Mode 2 is a fifth track that touches enough state (new `bench/arbor/` directory, comparator pinning, RESULTS.md authoring) to deserve its own session. Rationale in §6. |
| **DEFERRED** | **F. learnings.md update** | **Already done** — verified in this round's read. #19, #20, #21, #22 present; #5/#6 amended. No work owed. |

---

## 4. Scope signal — what to surface to the user before next dispatch

Three items, ordered by load-bearing-ness:

### 4.1 Signals budget bump 1.6 → 1.7 kB (decision needed before C dispatches)

The Investigator recommends bumping. The prior director-note recommended NOT bumping ("close v0 phases on the cellx-induced budget; budget bump is a separate concern"). The conflict needs resolution.

**My call: bump now, this round.** Reasoning:
- The headroom (49 B at HEAD) is below any reasonable error bar. One reasonable PR could blow through it accidentally.
- Candidates 1+2+7 give back ~40–60 B; even after recovery we're at ~1.5 kB / 1.6 kB ≈ 100 B headroom — still tight.
- Bumping to 1.7 kB after recovery gives ~200 B headroom, which is the right shape for a v0 pre-Phase-5 lockdown.
- Learning #22 says "where v0 has slack, prefer land-the-fix-now" — applies to budgets too. Closing v0 on a known-tight budget is debt.
- The growth IS earned (cellx win + deep-perf win). The Investigator made that case empirically. The budget should reflect what we've earned.

**User confirmation requested before C dispatches.** If the user wants to hold the line at 1.6 kB and only land Candidates 1+2+7 (no bump), C still ships — just with a smaller delta.

### 4.2 Phase 4 PR-and-merge to main vs. team branch only (decision needed before A dispatches)

The Phase 4 Verifier explicitly recommends "open PR for Phase 4 now." The prior session's pattern was "develop on team branch for all sessions." User policy is local CI only until v1.

**My call: stay on team branch. Do NOT open a PR to main this round.** Reasoning:
- User policy: PRs are not load-bearing. The team branch IS the develop-on branch (state-plan-a.md line 6–7).
- Opening PRs adds GitHub-state churn (draft → ready → merge → close) for no v0 benefit. Local CI is the gate; it has run green.
- v1 cleanup will batch-merge the team branch to main once CI is re-enabled and branch protection is wired (state-plan-a.md "Re-enable CI before v1 ships" row).
- The Verifier's "recommend ship" is correct as a code-quality signal. Translating it to "open PR" is the wrong shape for v0 mechanics.

**Action:** ff-merge `phase-4/runtime-implementation` → `claude/scribe-phase-3-team-Za4UQ`. Push the team branch to origin (already in user policy). Delete the phase branch locally and on origin (per Phase-3 precedent — phase branches are ephemeral).

### 4.3 Arbor SOTA bench timing (decision needed before next-round planning)

Learning #11 says we beat SOTA on a named axis or we don't ship. Arbor has no SOTA receipts. We are not blocking v0 close on this — but **v0 cannot ship to first external eyes without it.**

**My call: arbor SOTA bench in next round (Round N+1), immediately after this round closes.** Reasoning:
- This round is already 4 disjoint tracks (A, B, C, D). Adding E makes 5, and bench-spike work has a different cadence (comparator pinning is fiddly, RESULTS.md authoring is research-shaped).
- Phase 2.5 bench-spike for signals took its own dedicated session. Arbor deserves the same.
- The arbor cleanup (D) lands telemetry extraction this round, which makes the bench harness cleaner — D is a pre-req for E.
- After Round N+1 ships E, we have v0-complete-with-receipts. That's the natural ship gate.

User should know: Round N+1 is "arbor SOTA bench + apply any signals fixes the bench surfaces." Round N+2 (if needed) is "arbor wide-fanout perf based on bench findings, parallel to whatever else." Then v0-RC.

---

## 5. Refined briefs for the next dispatch

Team Lead handles logistics (branches, worktrees, watchdog calibration). Substance below.

### 5.1 First action: A — Phase 4 merge (Team Lead, no Builder)

ff-merge `phase-4/runtime-implementation` (HEAD `0353263`) into `claude/scribe-phase-3-team-Za4UQ`. Push team branch. Delete phase branch local + origin. **No Builder agent needed**; this is a Team Lead mechanical step. Should complete in 5 minutes before any Builder spawns.

### 5.2 Parallel Builder #1 — C: Signals headroom recovery

**Mission:** apply Investigator Candidates 1, 2, 7 + bump `.size-limit.json` 1.6 → 1.7 kB.

**Phase + tasks:** Pre-Phase-5 hardening (no spec section — derived from `.team/investigations/signals-headroom-investigation.md` §5).

**Scope (precise):**
1. Edit `packages/signals/src/signal.ts:474` — replace `Symbol('scribe.signals.host')` with `Symbol()`. (Investigator Candidate 1, ~12–15 B recovered.)
2. Edit `packages/signals/src/index.ts:8` — remove `MAX_BATCH_ITERATIONS` from the public export list. (Investigator Candidate 2, ~10–15 B recovered.) Confirm no consumer in `packages/{arbor,runtime,agent}/src/**` imports it.
3. Edit `packages/signals/src/effect.ts` — inline `unlinkAllDeps(sub)` into its single dispose-closure call site; delete the standalone function. (Investigator Candidate 7, ~20 B recovered.) Confirm `grep -r "unlinkAllDeps" packages/signals/src/` shows zero residual references after the edit.
4. Edit `.size-limit.json` — bump `@scribe/signals` row from `1.6 kB` to `1.7 kB`. (Per §4.1 above; this is decoupled from the source recovery so the commit log tells the story cleanly.)
5. Run `bun run build && bun run test && bun run size && bunx biome ci .` from clean state (per Learning #5 amendment).
6. Commit on team branch (or sub-branch if Team Lead prefers). Message:
   - Commit 1: `perf(signals): inline unlinkAllDeps + drop __HOST description + remove MAX_BATCH_ITERATIONS export` — body lists per-candidate before/after gz sizes.
   - Commit 2: `chore(signals): bump size-limit budget 1.6 → 1.7 kB to absorb cellx/deep-perf growth` — body cites Investigator §6 rationale.

**Acceptance criteria:**
- `@scribe/signals` size delta is **negative**: target ~40–60 B drop. (Investigator-projected; record actual.)
- All 124 unit tests + 3 integration tests stay green. Especially: `effect.test.ts` dispose-path tests.
- No type changes to public surface (typecheck-clean is mandatory; `MAX_BATCH_ITERATIONS` removal is a v0 type-API break — confirm zero internal consumers first).
- Final size-limit row reads `1.7 kB` and PASSES.

**"Do not do" guardrails:**
- Do NOT touch `markOne`, `linkAdd`, the linked-list graph, or the iterative DFS logic. (Investigator §5 "Not recommended" list.)
- Do NOT drop the effect node pool (Candidate 6) — defer to post-bench when Phase-4 consumer perf can be measured.
- Do NOT change the `AggregateError` aggregation (Candidate 3) — multi-error debuggability matters; defer.
- Do NOT touch arbor or runtime sources (parallel Builder owns those).

**Spec staleness items the Builder must re-confirm (Learning #6):**
- `bun run size` baseline before any edit. Record. If baseline differs >20 B from 1.55 kB, STOP and escalate.
- `grep -r MAX_BATCH_ITERATIONS packages/{arbor,runtime,agent}/src/` returns 0 hits before removing the export. If non-zero, STOP and escalate (consumer needs migration).

**Watchdog calibration:** sub-1-task spawn within Pattern B. Far below the 600s ceiling.

### 5.3 Parallel Builder #2 — B: Phase 5 (`@scribe/agent`, Tasks 23–24)

**Mission:** ship `@scribe/agent` per `.team/phase-5/spec-agent.md` (binding, final).

**Phase + tasks:** Phase 5 Tasks 23 + 24 (the entire phase).

**Scope:** see spec-agent.md §5 file-level change list. Builder follows the spec verbatim. Pattern B (1–3 task batch); both tasks fit one batch since Task 24 is gate-runs only.

**Acceptance criteria:** spec §4 test plan (7 unit tests pass) + spec §3.2 size gate (≤100 B gz) + spec §6 deviations 1–6 honored.

**Spec staleness items (Learning #6):**
- Confirm `packages/agent/` does NOT exist before Builder edits.
- Confirm `vitest.config.ts` `@scribe/agent` alias IS present (state-plan-a.md line 38–42 says yes; re-verify).
- Confirm `tests/vitest.config.ts` integration alias presence (Phase 4 added runtime; agent may or may not be there).
- Confirm `.size-limit.json` agent row does NOT exist before adding it.

**OQ resolution before Builder spawn (Team Lead's call):**
- OQ-1 (HMR re-registration last-wins): spec accepts as correct. **Resolved: keep as-spec'd.**
- OQ-2 (compiler import contract): no compiler exists yet in plan-a; the contract is forward-compat-only. **Resolved: keep as-spec'd; revisit when compiler ships.**

**"Do not do" guardrails:**
- Do NOT import `@scribe/signals`, `@scribe/arbor`, or `@scribe/runtime` (spec §2.2).
- Do NOT add `AgentError` (spec §2.3).
- Do NOT bump the 100 B budget without measurement-first escalation (spec §3.2).
- Do NOT re-export `__resetRegistryForTesting` from `index.ts` (spec §5 final index.ts).

**Watchdog calibration:** 2-task batch, well-bounded. Pattern B safe.

### 5.4 Parallel Builder #3 — D: Arbor v0+1 cleanup

**Mission:** close Phase 3 Findings 1 + 3 + missing test.

**Scope (precise):**
1. **Finding 1 — Extract `telemetry.ts` from `mount.ts`.** Move `_observeMount`, `_setMountObserver`, and the telemetry call sites' wiring into `packages/arbor/src/telemetry.ts`. mount.ts target ≤150 lines per Learning #13. New module: ≤50 lines, single concern (mount-lifecycle telemetry events).
2. **Finding 3 — Drop `export` from `_activeMountDisposers`.** Module-level only; tests that need it import from `mount.ts` directly via path, not from `index.ts`. Confirm `index.ts` export list doesn't include it (likely already absent, but spec said cross-review caught a leak — verify).
3. **Missing test — §4 Task 15 #5.** Identify the missing assertion from Phase 3 spec §4 Task 15 #5 (Team Lead reads spec to confirm exact test). Add to the appropriate test file.
4. Run full clean-state gate sweep.
5. Atomic commits per Learning #19: one commit per concern (telemetry extraction, disposer export tightening, missing test).

**Acceptance criteria:**
- `packages/arbor/src/mount.ts` line count ≤ 150 (excluding blanks + standalone JSDoc per Learning #13).
- `@scribe/arbor` size unchanged or improved (telemetry.ts is internal-only; tree-shake should make this byte-neutral).
- All 51 arbor unit tests stay green; new missing test passes.
- `_activeMountDisposers` not in `packages/arbor/src/index.ts`.

**"Do not do" guardrails:**
- Do NOT change arbor's public API surface.
- Do NOT touch signals or runtime sources (parallel Builders own those).
- Do NOT change telemetry behavior — extraction is mechanical move + re-import.

**Spec staleness items (Learning #6):**
- Read `.team/phase-3/retro.md` Findings 1 + 3 verbatim before editing; the Team Lead's brief paraphrases.
- Re-read Phase 3 spec §4 Task 15 #5 for the exact missing test acceptance.

**Watchdog calibration:** ~1 hour, 3-commit batch, Pattern B safe.

### 5.5 End-of-round Historian — G: state-plan-a.md update

After all three parallel Builders close PASS and A is merged, Team Lead (or a Historian sub-agent) updates state-plan-a.md:
- Phase 4: Done, 438 B / 1024 B, 16 tests, PR n/a (team-branch policy).
- Phase 5: Done, NB / 100 B, 7 tests.
- Signals: 1.5 kB / 1.7 kB (post-recovery, post-bump).
- Arbor: mount.ts ≤150 lines, telemetry.ts new module, Findings 1+3 closed.
- Open items: drop "Investigate signals 49 B headroom" row (closed). Add Phase 4 LOW findings 1+2 to v0+1 backlog.
- Set "Active branch" still to team branch.
- Add new row: "Arbor SOTA bench" → next round.

---

## 6. Surface-to-user triggers during next round

- **Builder C (signals) projects ~40–60 B recovery; if actual is materially less (<20 B) or actual goes positive,** surface immediately. The Investigator's projections are load-bearing for the budget bump rationale; if they're off, the bump arithmetic changes.
- **Builder D (arbor) finds mount.ts won't compress to ≤150 lines without behavior change,** surface. Learning #13 has a 150-line cap with rationale; a forced split that obscures behavior is worse than a documented deviation. User should adjudicate.
- **Builder B (Phase 5) lands above 100 B gz,** surface. Spec §3.2 explicitly says "Builder raises it to the Team Lead with measurement evidence before adjusting the gate — not silently bumping the limit." Honor that.
- **Any Builder discovers Phase 4 unmerge state caused conflicts,** surface and roll back. The merge-then-spawn ordering exists to prevent this; if it happens anyway, something's wrong.
- **End-of-round: arbor SOTA bench dispatch decision for Round N+1.** User confirms the bench plan before next session spawns.

---

## 7. Continuity check

- **Iteration ceiling:** Phase 4 used 0 of 5 Builder↔Verifier rounds (PASS first try). Phase 5 has 5 rounds remaining. Signals recovery and arbor cleanup are not phase-tracked — they consume one round each. Total round budget for this session: ~1 per parallel Builder = 3 (assuming each PASSes first try; if any fails, watchdog room remains).
- **Drift risk:** **Medium-low.** Three parallel Builders on disjoint files (signals/src, agent/src, arbor/src) is the same shape that worked in Phase 3 (cellx + arbor). Risk vector: state-plan-a.md is Read-many during this round and Updated-once at end. If anyone updates it mid-round, they'll race. Mitigation: state file freeze during round; only Historian writes at close.
- **Work nature shift:** This round is the **v0-close-out round** in spirit. After this round + arbor SOTA bench, plan-a v0 is feature-complete with receipts. The character of work shifts from "build new packages" to "validate, harden, and document" for v1-track sessions (resumability, MCP adapter, compiler). Worth the user knowing: the agent-spawn pattern that worked for v0 (Architect → Builder → Verifier per package) will look different in v1 (research-led with prototype spikes, not spec-led with strict gates).
- **No drift on thesis** (Learning #15/#16/#17): every track in this round either ships thesis-critical primitives (Phase 5 = AI-first registry data source) or hardens what we already shipped (signals, arbor cleanup). Nothing in Round N is off-thesis.
- **Watch for:** if signals recovery surfaces unexpected coupling (e.g., `MAX_BATCH_ITERATIONS` actually consumed by a future bench harness we forgot about), the recovery scope shrinks but the budget bump still goes through. Don't let scope-creep on C delay B or D.

---

**STATUS: ROUTED — round shape is `merge Phase 4 → 3 parallel Builders (C signals, B Phase 5, D arbor cleanup) → state-plan-a.md update → next-round dispatch decision for arbor SOTA bench`. Two user decisions before dispatch: (1) confirm 1.6 → 1.7 kB signals budget bump, (2) confirm team-branch-only (no PR to main) for Phase 4 landing.**
