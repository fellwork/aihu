# Scribe team learnings — project-portable

> **Scope:** This file loads at the start of every future scribe session, not just Phase 3. Each entry is a rule grounded in a specific Phase 2 moment that motivated it. Updated by Historian after each phase retro.

---

## 1. Re-read the plan before spawning a team

**Why.** At the start of Phase 2 the Team Lead almost recommended adding a stub package, which would have smuggled Phase 2 work into Phase 1's frozen scope. Re-reading the plan caught the explicit "no source code yet" boundary at line 509. Without that re-read, Phase 1 would have shipped Phase 2 work and Phase 2's TDD scaffold would have had nothing to do.

**How to apply.** Before spawning any team for any phase, re-read the plan section the team will execute, end to end. The plan was written when context was richer; trust it until evidence says otherwise. Look specifically for boundary statements ("no X yet", "deferred to Phase Y") that mark scope edges.

---

## 2. Spec authors must run a self-consistency review pass before declaring a spec final

**Why.** `ComputedOptions.equals` in spec §1.3 prose ("`equals` … suppresses needless downstream re-runs") contradicted Deviation 8 in the same document ("for API symmetry"). The Builder followed Deviation 8, the Verifier caught the contradiction at gate-walk time as Finding 3, the Team Lead adjudicated, the Builder pivoted with one extra commit (+69 B gz, four new tests). Recoverable, but the contradiction should not have shipped.

**How to apply.** Architect's last step before publishing a spec: re-read the prose body against the deviations table line-by-line. For any field/feature mentioned in both, confirm the deviation rationale matches the prose semantics. If they disagree, fix one and reconcile.

---

## 3. Briefs to teammates give intent and constraint, not implementation specifics

**Why.** The Team Lead's brief to the Builder for the equals follow-up suggested "Option X: set self STALE on notify; cascade on next read" — an implementation that doesn't work in scribe's forward-subscription model (`computed.notify()` propagates only by calling `sub.notify()` on each forward subscriber; there's no separate stale-then-pull channel). The Builder caught it only by writing the code. Near-miss.

**How to apply.** When briefing a teammate on a design pivot, specify (a) the intent — what the code should *do* — and (b) the constraint — what it must not break. Do not specify the mechanism unless you have just-in-time codebase knowledge equal to the teammate's. Trust the teammate's hands-on judgment to choose Option X vs. Option Y vs. Option Z.

---

## 4. Run reproductions, not assertions, when scouting

**Why.** Scout's `scout-report.md` §1.1 didn't say "Moon 2.x rejects `type:`" — it ran `moon project signals` and pasted the actual error output. §1.0 didn't say "TS5097 will fire" — it ran `tsc --noEmit` against the existing scaffold and got the error. The Architect inherited blockers as reproducible facts, not predictions. Every Architect decision in §3 of the spec traces back to a Scout-line reproduction.

**How to apply.** When Scout investigates the in-repo state, run the failing command and paste the output. "Will fail" assertions cost a Verifier round-trip if wrong; reproductions don't. The Architect should be able to re-run the same command and confirm without re-discovering.

---

## 5. CI gates that are commented out aren't gates

**Why.** Phase 1 scaffolded `typecheck`/`build`/`size` as commented lines in CI ("re-enabled in Phase 2 alongside @scribe/signals"). That hid the Moon 1→2 directory-layout mismatch and the `bunx` PATH gap until Phase 2's Task 11.5 un-commented them — at which point both surfaced as build-time emergencies (`builder-blockers.md` §1). The same workflow today only triggers on `main` push/PR, so phase-branch pushes get no CI signal — Phase 1 hit this once, Phase 2 hit it again, Phase 3 will hit it next.

**How to apply.** Two rules, both enforceable: (a) when scaffolding tooling, prove the gate works *now* on a representative file even if there's nothing real to check yet — a `placeholder.ts` is enough. (b) When configuring CI triggers, include the phase branches, not just `main`. If you need to defer a gate, either don't add it, or add it green-but-meaningful — not green-because-skipped.

---

## 6. Plans drift between authoring and execution; flag stale prescriptions in Scout

**Why.** Plan §542 ("no batching API in Phase 2") and plan §602 (`type: library`) were written 2 days before Phase 2 spawned. By spawn time, both were stale: Architect overrode the batching call with rationale (Decision 1 — arbor needs it on day one), Moon 2.x rejected the `type:` field. Scout's prior-art survey (`scout-report.md` §3) compared five competitor libs the plan didn't reference. Every staleness item required dual edits — code AND plan — to prevent re-introduction.

**How to apply.** Scout's report should include a "plan staleness" section that calls out: (a) any tooling-version assumptions the plan made that no longer hold, (b) any design prescriptions the prior-art survey now contradicts. Architect carries those forward and edits *both* the spec and the plan, never just one.

---

## 7. Verifier's spec compliance matrix is not optional — it catches what the gate-runner doesn't

**Why.** `verification-report.md` Gate 1 (test suite green) wouldn't have caught the `ComputedOptions.equals` runtime/spec contradiction — the tests passed because no test exercised cascade-suppression. The matrix-walk in §3 (45 spec rows, each cited to file:line) is what surfaced Finding 3. Tests prove implementation matches itself; the matrix proves implementation matches spec.

**How to apply.** Every Verifier audit ends with a numbered spec-compliance matrix: each binding line in the spec → file:line in the implementation → PASS/FAIL. For specs with prose semantics (not just type signatures), include behavioral rows that walk the example end-to-end. Scrolling the table is the audit's truth-source.

---

## 8. When spec authorizes out-of-frozen-scope work, document rationale and have Verifier confirm-keep

**Why.** Builder's Moon 2.x migration (`.moon/tasks.yml` → `.moon/tasks/tasks.yml` + `bunx` prefix) was outside spec §3 but documented in `builder-blockers.md` §1 with full rationale. Verifier reproduced the necessity (Gate 9: temporarily reverted the directory move and re-ran `moon run signals:typecheck` → got `Unknown task typecheck`, restored, ran again → success). Confirm-keep with empirical evidence.

**How to apply.** Builders may exceed frozen scope when a tooling/scaffold blocker is in front of them, *if* they (a) write a builder-blocker note with the symptom, root cause, fix, and verification, and (b) trust the Verifier to either confirm-keep or flag for revert. Builders never "silently expand scope" — the blocker note is the contract.

---

## 9. Trust hands-on-keyboard discoveries over advance-of-time predictions

**Why.** The Builder's "eager recompute when subs > 0" pivot during the equals wiring (`build-manifest.md` Task 12) is a structural fact about scribe's forward-subscription model that no prior artifact captured. The spec couldn't have predicted it; only writing the code surfaced it. Verifier traced four scenarios (`verification-report.md` §6: lazy preservation, linear chain, cycle, diamond) and confirmed correctness.

**How to apply.** When a teammate at the keyboard discovers that the briefed approach doesn't fit the codebase, document the discovery in the manifest (or blocker note) with the structural reason, and let the implementation deviate. Don't force the brief through. Verifier will trace correctness; that's their job. Predictions made before keyboard time should always defer to facts discovered at keyboard time.
