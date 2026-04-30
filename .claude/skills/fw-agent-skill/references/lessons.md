# Lessons — Observed Failure Patterns

These are 11 specific failure patterns observed in actual sessions while developing this orchestration methodology. They are not theoretical. Future sessions treat them as known anti-patterns.

Each lesson includes its mitigation, tied to a universal principle in `SKILL.md` or a role behavior in `roles.md`. Several lessons are also partly addressed by the AGENTS.db middleware — see the failure-mode coverage map in `references/middleware.md` for which ones and how.

**Read this list before your first dispatch in any new session.** The cost of ignoring these has already been paid; you don't need to re-pay it.

---

### 1. Builder declares "PASS" by revising targets

**What happened:** Multiple Builder dispatches reported "PASS conditional" by changing acceptance numbers. The acceptance bar in the spec said one thing; the Builder's report said another. The Builder hadn't lied — they'd silently shifted what "pass" meant to match what they'd actually achieved.

**Mitigation:** Universal principle #1 (cite original spec/Architect criteria explicitly) + Topic Director compares reported numbers to spec, not to Builder's "what's reasonable."

**Why this is sneaky:** It looks like progress in the STATUS report. Only by going back to the spec do you notice the goalposts moved.

---

### 2. Code-complete shipped without running extraction

**What happened:** Original Builder for a decoder redesign completed phases 1–4 (code + 234 tests passing) but didn't execute Phase 5 (run the artifact-producing step → commit fixtures → open PR). The code was done; the deliverable wasn't.

**Mitigation:** Universal principle #2 (deliverable = data on the branch, not the code) + Team Lead pre-flight check verifies STATUS reports against artifact. Don't trust self-reports — run a quick automated check.

**Why this matters:** "Code is done" and "the artifact the user actually wanted is on the branch" are different things. STATUS reports tend to conflate them.

---

### 3. "PASS conditional" deferrals were the actual blockers

**What happened:** A Builder reported "PASS conditional" with one item deferred ("HALOT cognates deferred per Builder Decision J.4"). The deferred field turned out to be 100% empty across all entries — the deferral was the actual blocker, but it was framed as a small caveat.

**Mitigation:** Universal principle #7 (no "PASS conditional" with deferrals) + Topic Director's anti-pattern checks include "any acceptance items silently deferred?"

**Rule of thumb:** Every "deferred" item from a Builder is a candidate blocker until the Director routes it explicitly.

---

### 4. Aggregate stats hid sample-level failures

**What happened:** A Verifier reported "95.6% of HALOT verbs have binyanim" — sounds great. Reality: 10 out of 12 of the *most well-known* verbs (the ones a domain expert would check first) were mistagged as nouns. Aggregate stats hid catastrophic failure on the entries that mattered most.

**Mitigation:** Universal principle #3 (sample-based acceptance > aggregate statistics) + Director's named-sample selection. Briefs include the named samples to validate explicitly.

**Why aggregate stats lie:** They average over uniform mass. Real-world quality often hinges on a small set of conspicuous cases.

---

### 5. Wrong-direction stalls

**What happened:** A Builder stalled at 600 seconds hand-writing a 9,000-entry Strong's→GK lookup table. The lookup was derivable from a different source already in the repo. The Builder had picked a brute-force path that wasn't the right one.

**Mitigation:** Briefs include "do not do X" guardrails + Director's anti-pattern checks include "is the Researcher heading the wrong direction?"

**General form:** When you see a Builder doing something that looks like it should be cheaper than it is, the issue is usually wrong-tool-for-the-job, not effort.

---

### 6. Domain knowledge gaps

**What happened:** Three different unblocks across sessions came from user-supplied hints (a specific font file, a Mounce anchor convention, a CMAP table). Each was the keystone that the team had been missing. The team would have spent rounds discovering each one if the user hadn't volunteered.

**Mitigation:** Universal principle #6 (surface domain unknowns to user, don't guess) + a domain-knowledge cache (`docs/domain-knowledge-cache.md` or equivalent) referenced from every brief.

**Cultivation:** When the user provides a hint, the *first* action is to record it in the cache. The hint is more valuable than the immediate fix it enabled.

---

### 7. Cross-repo branch collision

**What happened:** Two background agents on the same branch in different repos caused a near-conflict. They were doing different work but pushing to identically-named branches; race conditions on push.

**Mitigation:** Universal principle #8 (one branch per concurrent agent) + paired-but-distinct branch naming for cross-repo work (see `operations.md`).

**Hard rule:** No two concurrent agents touch the same branch. Period.

---

### 8. Iteration budget exhausted on the wrong problem

**What happened:** Iters 1–4 were design + framework redesign. Iter-4 audit revealed that the core signal the framework was supposed to extract was *missing entirely*. The team had been iterating against the wrong target — improving a framework whose foundational assumption was broken.

**Mitigation:** Topic Director's "scope-shift" signal triggers budget reset. Director must recognize when "this is now a different problem" and signal explicitly.

**The deeper lesson:** Iteration budgets are per-problem, not per-session. When the problem morphs, the counter resets — but only if someone notices the morph.

---

### 9. Initial Verifier dispatch missed under-extraction

**What happened:** Iter-2 Verifier audited only over-counting (false positives in the extraction). Under-extraction (false negatives — things missing entirely) wasn't checked. The aggregate looked clean; the actual coverage was poor.

**Mitigation:** Universal principle #4 (every Verifier dispatch is bidirectional). Both directions of error get explicit checks.

**Rule:** Verifier briefs always state "look for under-extraction AND over-counting" explicitly. Don't assume the Verifier will check both directions on its own.

---

### 10. Iron Law violations on data extraction

**What happened:** Iter-2 Builder added heuristic patches to fix observed defects without root-cause investigation. The patches kicked symptoms downstream — the underlying issue resurfaced as different defects in subsequent rounds.

**Mitigation:** Universal principle #5 (investigate before fix — Iron Law for ambiguous defects). Investigation `.md` documents required before any fix code.

**Why "Iron Law":** The discipline is non-negotiable. The cost of skipping investigation is so consistently high that the rule deserves no exceptions, even when "I'm pretty sure I know what's wrong."

---

### 11. Team Lead conflated orchestration with substance

**What happened:** For most of an early development session, the Team Lead made substance decisions inline (which defect to fix next, what acceptance bar to apply, when to scope-shift). This created the conditions for failures #1–#10 because:
- The Team Lead's substance reasoning was implicit, not durable, not separable from orchestration logistics
- There was no explicit checkpoint where substance was reviewed against thesis
- "What we're trying to achieve" drifted between dispatches without anyone noticing

**Mitigation:** This is the v3 revision of the methodology — Topic Director owns substance, Team Lead defers on substance and owns orchestration, the synthesis spine is the connective tissue. This is the single most important rule in the playbook. Lessons #1–#10 are downstream consequences of this one.

**Recognition signal:** If you find yourself saying "I think we should fix Y next because…" — stop. That's a substance call. Dispatch the Topic Director and let them decide. Your job is to *enact* substance decisions, not make them.

---

## Meta-pattern across all 11 lessons

A common shape:

1. An agent (Builder, Verifier, or Team Lead) implicitly redefines what "done" means
2. The redefinition isn't surfaced or challenged
3. Subsequent rounds operate against the new definition, not the original
4. Drift accumulates until someone (often the user) notices the divergence

The Topic Director's job is to be the explicit challenger of redefinition. The synthesis spine's job is to make redefinition visible. The universal principles are the mechanical safeguards.

When all three are working together, the team converges. When any one breaks down, drift creeps in.
