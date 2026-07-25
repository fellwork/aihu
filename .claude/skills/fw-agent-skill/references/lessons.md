# Lessons — Observed Failure Patterns

These are 21 specific failure patterns observed in actual sessions while developing this orchestration methodology. They are not theoretical. Future sessions treat them as known anti-patterns.

Each lesson includes its mitigation, tied to a universal principle in `SKILL.md` or a role behavior in `roles.md`. Several lessons are also partly addressed by the GBrain middleware — see the failure-mode coverage map in `references/middleware.md` for which ones and how.

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

### 12. Worktree dispatch follows the SESSION's repo, not the target repo

**What happened:** The session's working directory was one repo (`fellwork/data`) while all the work targeted a sibling repo (`fellwork/aihu`) in a separate worktree. Two Builders dispatched with `isolation: "worktree"` were handed auto-created worktrees **of the session repo** — the wrong repository, with no `packages/` dir and no target branch. Both reported BLOCKED. Earlier Builders had silently masked the defect by manually creating their own target-repo worktrees, so the Team Lead never diagnosed it and instead hardened the *wrong* thing (adding sterner "stay in your worktree" language to briefs that were pointing at the wrong repo entirely).

**Mitigation — orchestration preflight, before ANY worktree dispatch:**
- Confirm `git -C <session-cwd> remote get-url origin` equals the target repo's origin. If they differ, **`isolation: "worktree"` is unsafe** — it will build a worktree of the session repo.
- When they differ: the Team Lead **pre-creates** the target-repo worktree (`git -C <target-repo> worktree add <path> -b <branch> <base>`) and hands the Builder the **literal path** plus `git rev-parse --show-toplevel` as its first check. Do not pass `isolation: "worktree"` in this case.
- Never diagnose a repo-topology failure as an isolation-discipline failure. If an agent lands in a repo with no expected files, the dispatch was wrong, not the agent.

**Recognition signal:** an agent reports "no `packages/` directory" / "branch doesn't exist" / "commit not found." That is a wrong-repo dispatch, not a lost agent — check topology before re-briefing.

---

### 13. The Team Lead's own verification must itself be verified

**What happened:** Twice, a mutation test (revert the fix, confirm the check goes red) was scored with `bun run check:X 2>&1 | grep "0 finding"`. The grep matched the substring `0 finding` inside the failure line `expected 0 finding(s), got 1` — a **false PASS**. The Team Lead nearly reported a sound check as broken, and separately nearly reported a broken mutation as a valid negative control, because the *verification command itself* was wrong (the mutation didn't apply; the script printed `mutated: False`, which was ignored).

**Mitigation:**
- A grep that can match a substring of the *failure* message is not a pass test. Assert on exit code, or on a full anchored line (`^check:X — 0 finding`), never a bare substring.
- Any mutation/negative-control step must first confirm the mutation *applied* (assert the needle existed; print the changed line) before interpreting the downstream result. A no-op mutation that leaves the check green proves nothing.
- The self-test-refuses-to-run pattern is the gold standard: a check that emits `SELF-TEST FAILED … was not computed` when it cannot discriminate is safer than one that returns a number, because it cannot be misread by a sloppy grep.

**Recognition signal:** if you are about to conclude "the fix is broken / the check is broken" from a one-line grep, stop and read the full output. Three of this session's near-misses were the Team Lead's verifier, not the work.

---

### 14. An enabler shipping is not the blocker closing

**What happened:** PR #549 shipped `LifecycleHost` — `getLifecycleHost()`, `_attachLifecycleHost()`, `onCommit` — genuinely wired into the runtime at `define-component.ts:135-144` and live on both the normal and hydration paths. The Team Lead reported the `@aihu/use` lifecycle blockers closed. They were not. **The diff touched zero lines in `packages/use`** (the changeset says so itself: "scoped to `@aihu/signals` + `@aihu/runtime` only"), and `tryOnMounted` remained byte-identical to its stub, `if (isClient) fn()`. The primitive that the replacement `tryOnCommit` is specified to sit on shipped; the consumer side was zero percent done. A later verification pass graded the three blockers PARTIAL / PARTIAL / STILL OPEN, every row reading "Consumer adoption ❌."

**Mitigation:** Universal principle #2 (deliverable = data on the branch) extended to blockers: **acceptance for "issue X is closed" is a diff in the consuming package, not the availability of a mechanism.** Before reporting a blocker closed, run the falsifier: `git show <sha> --stat | grep <consumer-package>`. Empty output means the blocker is open.

**Why this is sneaky:** the enabler PR is real, correct, well-tested work, and its changeset honestly describes its own scope. Nobody lied. The Team Lead supplied the false inference by treating "unblocked" as "done."

---

### 15. Verify which artifact your test actually exercised

**What happened:** Two separate investigations lost hours to the same class of error, and both wrote "this cost me an hour, worth recording" into their reports. (a) `packages/compiler/js/envelope.ts:73-86` prefers a **published napi addon** over any locally built binary unless `AIHU_COMPILE_BIN` or `AIHU_COMPILER_NATIVE=0` is set — so a Rust fix compiled, tested, and merged had no effect in CI, because CI was silently running a frozen addon published the day before. (b) `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, and a **stale dev server from two hours earlier was still bound to :8788 serving a different tree** — producing a cheerful "18 passed / 1 failed" that looked like the bug did not reproduce. The real number was 13 failed / 6 passed.

**Mitigation:**
- Before trusting any local result, **identify the artifact**: `curl -s localhost:<port>/<bundle> | shasum -a256` against `shasum -a256 <dist>/<bundle>`; for binaries, pin the path explicitly and invoke it directly rather than through a resolver envelope.
- Any resolver with a fallback chain (published package → local build → checked-in binary) is a place where "the fix works" and "the fix ran" diverge. Print the resolved backend before interpreting results.
- A fix that lands without its plumbing is not landed. If the fix needs `AIHU_COMPILE_BIN` wired into a workflow to take effect, that wiring belongs **in the same PR** — otherwise CI stays red and the next investigator re-derives everything.

**Recognition signal:** the result is *better* than you expected. A bug that "does not reproduce" on the first try is usually a wrong-artifact result, not good news.

---

### 16. A green required check can be near-vacuous

**What happened:** `ci-ok` is the **only** required status context for branch protection. Its entire body is a shell test on `needs.check.result`, passing when `check` succeeded **or was skipped**. It does not observe `Smoke tests`, `bench`, `bench-arbor`, `examples`, `governed-examples`, or either deploy workflow. Report after report recorded the same shape: "`ci-ok` — the required gate — is green" while 13 Playwright tests, both bench gates, and a deploy job were red. Separately, the one docs test that passed during a total-outage regression was the one asserting only `shadowRoot != null`; every test asserting real content failed.

**Mitigation:** Once per session, **read the required check's definition, not its color.** Ask: which jobs does it actually depend on, and does it pass when they are skipped? Then treat the unobserved jobs as ungated — they are. When a Builder reports "CI green," the follow-up question is "green on which contexts, and which contexts are required?"

**General form:** a gate that can pass while everything it nominally protects is red is not a gate; it is a status badge. The same applies to assertions — `expect(x).not.toBeNull()` is the test-level version of `ci-ok`.

---

### 17. Masked defect chains — a changing error message is progress, not failure

**What happened:** The docs playground had **seven** independent defects, discovered strictly one at a time, because the preset test loops and stops at the first failure. Each fix revealed the next: missing runtime exports → a regex type-stripper that could not handle ` as any` → four recipes carrying TypeScript → a package missing from tsconfig `paths` so rolldown externalized it → the stripper eating a closing brace → `formAssociated` assigned after registration → `$aria`/`$form` writing through `this` inside an arrow (undefined under ESM). Two of those were framework bugs in collections that had been **emit-tested and never executed**. The work was filed as one defect and shipped as seven.

**Mitigation:**
- When a fix produces a *different* error, record it as **round N+1 of the same chain**, not as a failure or a regression. Brief the next round with "the error message changed to X" as the finding.
- **Budget for chains.** The filed count is a lower bound on serial-masking defects. Do not size the round from the ticket.
- Any suite that stops at the first failure is a chain generator. Prefer "run all, report all"; where you cannot, expect the count to grow.
- "Emit-tested but never executed" is a standing hazard class — an assertion that the right string was generated proves nothing about whether it runs.

---

### 18. A permanently-red guard trains people to bypass it

**What happened:** Three guards in this repo were unusable-by-design, and the team routed around all three. (a) `check:pre-push` (`check:lint && typecheck`) fails on **pristine `main`** — `@volar/typescript` is declared by `packages/tsc` but not installed, so TS2307 — which makes `git push --no-verify` the normal path and silently disarms lint and typecheck for everyone. (b) `.husky/pre-commit` ran `sync-readme` in **write** mode and then force-staged `README.md`, `scripts/__bundle-sizes.json` and every regenerated package README — so a Builder who reverted machine-specific size drift found the hook re-adding it, and described the fight without ever naming the hook as the cause. (c) `cargo fmt --check` exits 1 on pristine main with 633 pre-existing hunks and no `rustfmt.toml`, so it can never be adopted incrementally. Meanwhile a prior lesson on disk records a Builder mis-attributing a real environmental failure and pushing `--no-verify` anyway.

**Mitigation:**
- **Measure every guard against pristine `main` before believing it, and before asking an agent to satisfy it.** `git stash && bun run <guard>; echo $?` is the whole test.
- A guard that is red on main is not a guard — it is a training exercise in `--no-verify`. Either fix it or delete it; leaving it red is the worst of the three options.
- When you revert an artifact and it comes back, **name the mechanism** before reverting again. "Unexplained drift" is a diagnosis-shaped hole; a write-mode hook is the usual occupant.
- Hooks that regenerate machine-dependent output (bundle sizes measured on the local CPU) must run in `--check` mode locally and write only in CI.

---

### 19. A brief's premises are claims, not facts

**What happened:** Briefs propagated wrong premises at full confidence, and agents spent real time before falsifying them. One brief asserted a `cargo fmt` CI gate that **does not exist anywhere in `.github/workflows/`**. One investigation report named the wrong workflow entirely (two workflows shared the job name `Build & deploy`) and had to open with "Correction to the brief." An investigator's count of 15 affected config files was really 14. A PR's stated rationale — "the docs consume the published compiler binary" — was false for the current lockfile, and was *made* false by a change in the same PR. A PR body claimed `Closes FEL-397, fellwork/aihu#537` while GitHub recorded no closing reference and #537 stayed open. A source comment pointed at a "follow-up filed" that was never filed.

**Mitigation:**
- Every brief carries a **falsifiable-premises line**: the two or three factual claims the work rests on, each with the one-command check that confirms it. The receiving agent runs those first and reports corrections *before* starting.
- Named CI gates, file counts, and "X already handles this" are the highest-yield things to check — they are cheap to verify and expensive to assume.
- **An agent that opens with "correction to the brief" is doing its job.** Reward it; do not treat the correction as scope creep.

---

### 20. The storage substrate the playbook names may not be the one you are on

**What happened:** This skill contained **98 references to `mcp__gbrain__*` tools.** No such tool existed. `.mcp.json` declares a project-scope server named `gbrain` whose wrapper exits immediately unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are exported — they are not, so it never started. A *different*, working server was registered at user scope under a *different* name, `gbrain-local`, exposing `mcp__gbrain-local__*`. Every storage and recall instruction in the playbook therefore named a nonexistent tool. **An entire multi-PR session ran on the file substrate by accident rather than by choice, and nothing visibly failed** — because the skill said "substrate is optional," which made the accident indistinguishable from a decision. Resume-protocol step 1 was hollow for the same reason: it said to read `state-<track>.md` at repo root, while `.gitignore:98` matches `state-*.md`, so no such file could ever be committed and none existed.

**Mitigation:**
- **Step 0 substrate preflight, before any dispatch:** `ToolSearch query: "gbrain search put_page get_page"`. Whatever prefix comes back is the namespace; nothing coming back means the file substrate. Write the **resolved** names into every brief.
- Playbooks state **capabilities** (`SEARCH`, `GET_PAGE`, `PUT_PAGE`); sessions resolve them to tools. Never hardcode a namespace into a checked-in document — and when you find one that is wrong, **do not repair it by renaming it to today's live server.** That re-hardcodes a per-machine accident and guarantees the same failure on the next machine.
- **Prefer the substrate that is verifiable.** A committed file beats a page you cannot confirm was written: `git log` is proof, and a silent MCP no-op is not.
- Config that fails open and silent is worse than config that fails loudly. When you document an env requirement, document what its absence looks like — here, *nothing at all*.

**Recognition signal:** "substrate is optional" (or any "X is optional") in a playbook is where defects hide. Optional means nobody checks, and nobody checking means nobody notices when the non-optional half is broken too.

---

### 21. Orchestrator-side discipline decays while it is being enforced on agents

**What happened:** Every subagent brief in this session carried an explicit instruction to leave the user's checkout on `main` and clean. The **Team Lead** then committed the reports directly in the user's checkout and left it parked on a feature branch — violating, in its own hands, the rule it had written into every dispatch. The same asymmetry shows up elsewhere in the session: the Team Lead required runnable acceptance criteria from Builders while briefing them on unverified premises (lesson #19), and required STATUS verification from others while reporting a blocker closed without checking the consuming package (lesson #14).

**Mitigation:**
- **Every constraint you put in a brief applies to you.** Before dispatching a rule, ask whether your own next action would violate it.
- Put the orchestrator's own hygiene in the pre-flight checklist, not just the agents': working tree on the expected branch, clean, no stray worktrees. `git -C <user-checkout> status --short && git -C <user-checkout> branch --show-current` at session start **and** session end.
- The Team Lead is the least-supervised participant in the system. Lesson #11 says it owns orchestration; this lesson says that ownership includes being audited, and the only available auditor is itself.

**Recognition signal:** you are writing "make sure you leave X clean" into a brief. That is the moment to check whether *you* left X clean.

---

## Meta-pattern across all 21 lessons

A common shape:

1. An agent (Builder, Verifier, or Team Lead) implicitly redefines what "done" means
2. The redefinition isn't surfaced or challenged
3. Subsequent rounds operate against the new definition, not the original
4. Drift accumulates until someone (often the user) notices the divergence

The Topic Director's job is to be the explicit challenger of redefinition. The synthesis spine's job is to make redefinition visible. The universal principles are the mechanical safeguards.

When all three are working together, the team converges. When any one breaks down, drift creeps in.
