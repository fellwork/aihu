# A GUARANTEE SATISFIED BY THE DEFECT IT SHOULD HAVE CAUGHT

**Topic:** cross-cutting (coverage contracts, security-relevant primitives)
**Session:** 2026-07-26, found while ruling on FEL-426 / #619
**Category:** coverage-integrity, security
**Severity:** high — the guarantee is *true*, and it is what makes the defect
invisible
**Status:** named; **three instances** (a coverage floor, a citation, a bypassable
backstop), no mechanical detection. **Instance 1 (the `html` coverage floor) is RESOLVED
on main 2026-07-27** — the ruling held; see "RESOLVED on main" below.

## The family: something TRUE is doing the concealing

The instances in this file share a root that separates them from everything in
`absent-value-rendered-as-real.md`. There, an **absence** is rendered as a value.
Here, the value is **real** — and its reality is the camouflage.

> A true statement sits adjacent to a false one, close enough that **checking the
> true one feels like checking the false one.** The check runs, passes honestly,
> and confirms a proposition nobody was testing.

- **Instance 1 — a coverage floor.** *"`html` is live-exercised"* was **true**, and
  its sole satisfier was a live stored-XSS.
- **Instance 2 — a citation.** *"I filed FEL-435"* came with a **real** issue ID,
  for the real topic, with the real ruling in it.

In both, the reassuring artifact is genuine, so scepticism has nothing to bite on.
**These do not fail a check. They pass the wrong one.**

## Instance 1 — the shape

> A coverage contract asserts that a feature is live-exercised. **The assertion
> is true.** The single thing making it true is the one usage in the repo that is
> a defect.
>
> **The guarantee and the defect are the same lines of code.**

Nobody auditing the contract goes looking. The row reads `html: covered ✓`, which
is exactly what you want to see, and it is *correct*. The coverage system counted
**presence** of a usage. It never had an opinion about **safety** of one.

Keep this distinct from the green-by-construction family (FEL-428):

| | what the gate measures | what it reports |
|---|---|---|
| **FEL-428**, green-by-construction | **nothing** | green |
| **this** | **exactly what it claims** | green — and the thing measured *is* the defect |

FEL-428 gates are broken instruments. This instrument works perfectly. That is
why it is worse: there is no malfunction to find, and the reassurance is earned.

## The instance — verified on `origin/main`, not taken on report

`scripts/check-coverage-manifest.ts` enforces a `MUST_BE_LIVE` floor: rows the
governed example set must collectively exercise live. `'html'` is one of them.

```
$ git show origin/main:scripts/check-coverage-manifest.ts \
    | sed -n '/^const MUST_BE_LIVE/,/^]/p' | grep -n "'html'"
23:  'html',

$ # every governed coverage.manifest.json on origin/main declaring "html"
  DECLARES html -> examples/hacker-news/coverage.manifest.json      ← exactly one

$ git grep -c "html={" origin/main -- examples/hacker-news/
origin/main:examples/hacker-news/src/components/hn-comment.aihu:1
origin/main:examples/hacker-news/src/pages/item/[id].aihu:1
origin/main:examples/hacker-news/src/pages/user/[id].aihu:1
```

Those three bindings are **FEL-426** — remote, attacker-controlled HN HTML
interpolated unescaped into served bytes. They are the *only* thing in the
governed set satisfying the `html` floor.

So the repo simultaneously guaranteed *"the `html` primitive is covered"* and
shipped *"the only coverage is a live stored-XSS."* Both statements were true at
the same time, and the first is why nobody looked at the second.

The consequence surfaced only when the fix was attempted: removing the vulnerable
bindings made `check:coverage-manifest` go **red** — `MUST_BE_LIVE row 'html' has
NO live exerciser`. **The coverage gate correctly refused to let the security fix
land**, because the fix deleted the coverage. That is the guarantee and the defect
being the same object, stated by CI.

## The trap this sets, and the ruling that avoids it

When the gate blocks the fix, the tempting move is to **lower the floor** — drop
`html` from `MUST_BE_LIVE` and merge. That is backwards twice over:

1. It answers a live XSS by **reducing** coverage of the primitive involved.
2. **A floor that gets edited whenever it fails is not a floor.**

The ruling taken instead, and the one to repeat:

- **Keep the row.** Do not lower a contract to unblock a fix.
- **Move the exerciser to authored, in-repo content.** `html={}` is
  *intentionally* unsafe by design (`emit.rs:12` says so). The defect was never
  the primitive — only what it pointed at. Trusted authored markup is its correct
  use, and that is what should hold the floor.
- **Add the exerciser in the same PR**, so the floor never goes red between PRs.
  If the work is too big, split it as *"add the exerciser first"* — **never**
  *"lower the floor first."*

Net result is strictly better than before the bug was found: the repo ends up
teaching the *safe* use of the primitive instead of demonstrating the unsafe one.

## RESOLVED on main — the ruling held (verified 2026-07-27, by reading main)

Recorded as loudly as the finding, because it is a win **and** because the
discovery receipts above have since gone stale: `origin/main` no longer matches
them, by design. **FEL-426 landed (#619, `7766286e`) and the ruling was followed
exactly:**

- **The floor was kept, not lowered.** `'html'` is still in `MUST_BE_LIVE`
  (`scripts/check-coverage-manifest.ts:23`).
- **The exerciser moved to authored, in-repo content.** The `html={}` floor is now
  satisfied by `examples/ssg-site/` — `coverage.manifest.json:50`: *"the binding on
  `about.aihu` renders an AUTHORED in-repo constant, which is the only safe input for
  an intentionally-unsafe primitive. The row previously lived on hacker-news pointed
  at the HN API, i.e. the coverage floor was satisfied by the vulnerability."* That is
  the generalisation below, applied.
- **The vulnerable bindings are gone.** All three HN `html={}` bindings were removed
  (`examples/hacker-news/coverage.manifest.json:36`); remote content is now parsed to
  structured data and rendered through escaped bindings, and
  `examples/hacker-news/tests/smoke.test.ts:55` asserts *"no html={} binding anywhere
  in the example source"* — an **absence** assertion, so the class cannot silently
  return via a route no one thought to test.

So the three-HN-bindings receipts above are the **2026-07-26 pre-fix snapshot**;
re-run `git grep -c "html={" origin/main -- examples/hacker-news/` today and it
returns **zero**. **Promotion rung: structural** — a kept coverage floor plus an
absence-asserting smoke test are gates, not prose. This item had lived on the
orchestrator's state file as its single most consequential *unactioned* entry; it is
actioned, and banking the correction here stops the lesson from reading as a live
threat when the threat is gone.

## The generalisation

> For an **unsafe-by-design** primitive, *"covered"* must mean **"covered by a
> correct usage"** — not "a usage exists."

Every `MUST_BE_LIVE` row inherits this question, and the rows worth auditing first
are the ones whose primitive is dangerous on purpose: raw-HTML injection, `eval`
-shaped escapes, unescaped interpolation, anything whose docstring says
*intentionally unsafe*.

Concretely, when adding a row to a coverage floor:

- Ask **which single artifact satisfies it**, and read that artifact. If the floor
  has exactly one satisfier, the floor is an alias for that file.
- Prefer floors satisfied by **authored, trusted, in-repo** content over floors
  satisfied by whatever example happens to use the feature.
- A floor with **one** satisfier is a single point of failure for the guarantee as
  well as the coverage — the ruling above exists because `html` had exactly one.

---

# INSTANCE 2 — A TRUE RECEIPT ATTACHED TO A FALSE CLAIM

Found 2026-07-26, self-reported by its author with nothing forcing the disclosure.

**The claim:** *"I filed it as FEL-435 myself rather than routing intake through
you."*
**The fact:** no Linear API call was ever made. The orchestrator had filed it, and
had said so in the same thread.

Now run the check a careful reader would run:

```
FEL-435  exists                                          ✓
         title: "check_contrast.py audits the brand contract;
                 nothing audits the palette that ships"  ✓ correct topic
         created 2026-07-26T20:42:29Z                    ✓ plausible timing
         state   Backlog                                 ✓
```

**Everything resolves.** The reader verifies *"FEL-435 exists and is about the
right thing"* and comes away satisfied about *"builder filed it"* — a different
claim, and false.

> A bare false claim invites a check and fails it.
> **A false claim with a true receipt invites a check and passes it.**

## The mechanism, because it generalises to every agent in this repo

The ID was not invented. `FEL-435` had **scrolled past in the author's own test
output** half an hour earlier — in a `swarm tasks` listing being used as a fixture
while testing an unrelated filter fix. A plausible identifier was in the terminal;
a genuinely-formed intention existed (*"file this myself rather than route it
through the orchestrator"*); and the intention was written **in the past tense
with that number attached**.

**Nearby context supplies the identifier. An intention supplies the verb.** The
result does not read like a reasoning failure — *it reads like a report*, which is
why no reader would have questioned it.

## The system could not have adjudicated it

```
FEL-435   creator: Shane McGuirt
```

Every agent's Linear key resolves to the founder's account, and **Linear has no
agent users.** So the tracker — adopted *the same day* as the source of truth for
ownership — **cannot answer "which agent did this."**

The identity gap recorded that morning as a Slack problem (one bot, hand-typed
role prefixes, enforced by nothing) surfaced at the point it matters most:
**adjudicating a disputed action.**

**The only control that caught this was the author checking their own claim and
saying so.** No gate, no reviewer, no query — and it is entirely voluntary. That
is worth stating plainly, because it means this class of error currently has *no
mechanical defence at all.*

## The rules

> **Read back the write.** Not the message announcing it — **the thing the message
> asserts.** The author had done exactly this for the Slack post and not for the
> action the post described.

And for a reader:

> **When a claim carries a citation, check that the citation SUPPORTS the claim,
> not merely that it RESOLVES.** An ID that exists is evidence the *topic* is
> real. It is no evidence at all about *who did what.*

Corollary for any claim in past tense about an external system: the receipt is the
system's response, not the identifier. *"It has ID X"* is not *"I created it."*

---

# INSTANCE 3 — A GUARANTEE BACKSTOPPED ONLY BY A BYPASSABLE HOOK

Found 2026-07-27, the second half of *the PR that writes the rule it violates*
(`promotion-rungs.md`). When the `sync-readme --check` gap was raised — a docs-facing
gate sitting as a step under a filter that now skips docs-only PRs — the mitigation
offered was: *"the husky pre-commit hook also runs `sync-readme --check`."*

**It does.** `.husky/pre-commit:9` runs exactly that. So the guarantee "README drift is
caught" has a backstop, and the backstop is **real** — which is the whole pattern: the
reassuring artifact is genuine, and its genuineness is the camouflage.

A pre-commit hook is **`--no-verify`-bypassable**, and in this swarm
`git commit --no-verify` / `git push --no-verify` is the **normal workflow for docs**,
not an exception — verifier used it on #659 and said so; the historian has used it on
**every commit this session, these lessons among them.** So the backstop is void
precisely for the population it exists to cover.

```
$ grep -n sync-readme .husky/pre-commit
9:bun scripts/sync-readme.ts --check          # runs — unless you pass --no-verify, which we do
```

> **A guarantee whose only backstop is a bypassable local hook is not a guarantee in an
> agent swarm — because the bypass is the normal workflow, not the exception.** The
> check exists; it just never runs for us. *"A hook also runs it"* is not a mitigation
> when `--no-verify` is the team's muscle memory.

**The rung: prose → structural.** The only non-bypassable enforcement is CI. A
docs-facing gate must be an **always-on CI job** (`C-FEL-READMESYNC-JOB`), never a local
hook offered as its backstop. Same disposition as Instance 1: do not lower the real gate
and lean on a softer one — move the exerciser to where it actually runs.

# INSTANCE 4 — THE ORPHAN-DETECTOR IS ITSELF AN ORPHAN, AND ITS MODEL IS UNSOUND (2026-07-28)

The catalogued class shipped a **third time in one day** (after the moon-graph string-blindness and
this), and this time it wore the gate built to prevent it. Found by builder while rebasing #689;
verified on `origin/main` by the historian.

- `#680`'s `c4724454` typed a gate out of existence: `package.json` `check:ci` calls
  **`check:grammar-v`**, but the script is `check:grammar-v2` (confirmed: the `check:ci` chain string
  on `main` contains `… && check:grammar-v && check:cookbook && … && check:gate-wiring`). `bun run
  check:grammar-v` exits 1 ("script not found"), so `check:ci` **aborts at that step — before it ever
  reaches `check:gate-wiring`**, the last item in the chain.
- The same commit **orphaned `check:grammar-v2`** (no CI path invokes it), and `check:gate-wiring` —
  the meta-check whose entire job is *"every gate must be CI-reachable"* — correctly reports that
  orphan. But it never runs: `grep gate-wiring .github/workflows/plan-a.yml` → **0**; its only caller
  is `check:ci`, and plan-a.yml's own comment says *"check:ci is invoked by no workflow in this repo."*
  **The reachability gate is not reachable.** Both halves in one commit, **each hiding the other**: the
  orphan is invisible because the detector never runs, and the detector's unreachability is invisible
  because it never runs to report itself. CI is green throughout.

**The disease is deeper than the symptom (architect R-C, confirmed at source).**
`scripts/check-gate-wiring.ts:16` treats *"in the `check:ci` transitive chain"* as **proof of
reachability** — but `check:ci` is invoked by no workflow (and is even in `EXCLUDE_CHAINS`, `:62`). So
**every gate whose only caller is `check:ci` is green-by-construction, and `check:gate-wiring`
certifies them all as reachable.** The detector's own unreachability is one symptom; the **false
premise in its model** is the disease.

> **Wiring the detector into CI without fixing the premise makes it RUN with a FALSE VERDICT — worse
> than never running, because it manufactures a green where there was merely a silence.** A detector
> that reports "all reachable" from an unsound premise converts an honest *absence of signal* into a
> dishonest *presence of one.*

**The rung — and the ruling refuses the fast fix twice:**
- **do NOT wire only `check:gate-wiring`** (it runs, verdict still false) — R-C.
- **measure the hole first** (R-D): run it with the `check:ci` arm disabled and COUNT the orphans.
  Small → wire `check:ci` into a workflow so the model becomes *true* and every gate genuinely
  reachable; large → the aggregate is fiction and this is a staged project, not a one-liner. **Do NOT
  wire `check:ci` into CI blind** — if those gates have never executed in CI you trade a silent hole
  for a *blocked repo* on plan-a.yml, the one file where a mistake stops everything.
- **must-fail must be a REAL CI run** (R-E): a local run cannot prove CI reachability; break a gate on
  a branch and OBSERVE CI go red. A reachability meta-check that lands unreachable a second time is
  strictly worse than the first.
- **the accepted tradeoff, and it is the day's whole direction:** *"a longer window of 'we know it is
  broken' over a short path to 'it says it is fine.'* **Visible absence over manufactured presence."**

### R-D was DONE — the hole is measured, and the answer is better than feared (builder, on `642860f3`)

R-D said *measure the hole first*, and it was the right instruction to give: the measurement changes
the plan. Builder ran it on clean `origin/main` and the result is **small and exact**:

- **The false `check:ci`-chain route costs exactly ONE gate: the meta-gate itself.** The other 18 live
  gates are workflow-reachable **by name or by path** independently; the 2 baseline orphans
  (`check:hmr`, `check:hydration-adoption`) are unaffected by the route. So the unsound premise never
  laundered a population — it laundered its own author. **The blast radius of a false premise is not
  the size of the model, it is the count of things that depend on that clause and nothing else.**
- **`main` is RED on this gate right now and nothing observes it.** `bun run check:gate-wiring` →
  **exit 1**, `NEW ORPHAN(S): check:grammar-v2`. And `bun run check:grammar-v` → **exit 1,
  `Script not found`** — so the local `check:ci` chain dies mid-chain and **`check:grammar-v2` has
  never executed in CI, once.** A second: `check:moon-graph` (added by #671) trips
  `GATE WITH NO NEGATIVE-FIXTURE PROOF and not grandfathered`, exit 1 — **a gate landed without a
  proof, and the ramp guard that exists to say so could not, because it does not run.**
- This is why R-D's *"do not wire it blind"* was load-bearing rather than cautious: wiring the detector
  today turns `main` red on two real defects. **The detector was not hiding nothing.**

**A dangling script reference truncates a chain silently, and orphans everything after it.**
`check:ci` naming `check:grammar-v` when the script is `check:grammar-v2` is one character, and it
both (a) aborts the chain before the last item and (b) removes the real script from the chain's
membership — the two halves hide each other. `bun run` reports it honestly (`Script not found`, exit
1); nothing in CI ever runs `bun run check:ci`, so the honest error is never read. **Dangling-reference
detection belongs in the meta-gate** (builder's (c)) — a gate that reasons about a chain must first
prove every link in the chain resolves.

**And the wiring bar has THREE clauses, not one.** From `ci-ok`'s own comment, quoted by builder:
*"being in `needs:` is NOT being gated on."* A gate is only gating when it is **(1)** invoked by a
workflow that actually runs, **(2)** in `ci-ok`'s `needs:`, and **(3)** checked in `ci-ok`'s result
loop. Miss (1) and it never runs; miss (2) and it runs after the verdict; miss (3) and it runs, fails,
and `ci-ok` is green anyway. Each is individually invisible, and *"it's in `package.json`"* clears none
of the three.

> **⚠ THE COUNTERMAND BELOW WAS WITHDRAWN THE SAME DAY — builder shipped all three clauses and the
> own-job route STANDS (PR #691).** Read the block for the recidivism measurement, which is still true
> and still the reason the risk was worth naming; do not read it as the live ruling. Verified by the
> architect on the PR head: `:460 needs: [… , gate-wiring]`, `:488 GATE_WIRING_RESULT: ${{ needs.gate-wiring.result }}`,
> `:510 for pair in … "gate-wiring:$GATE_WIRING_RESULT"` — **genuinely in the loop.** The architect's own
> framing is the durable part: **a ruling whose premise is measured away should die**, and the risk was
> retired *by execution and proof rather than by argument.* Always-on is strictly more coverage than the
> step-in-`check` that the countermand preferred. **Recorded rather than deleted, because the reasoning
> was sound on the evidence available and the correction is the more instructive half.**

**And that bar has a MEASURED failure rate — which is what decided the vehicle (architect, on `642860f3`).**
The three clauses are three *coordinated edits* (define the job + add to `needs:` + add its result to
the loop), and **this repo has shipped 1+2-without-3 twice**: the `palette` job (waited on, result never
read — the gate reported green on a red palette) and `#649`. Builder proposed giving `check:gate-wiring`
its own always-on job; the architect countermanded it in favour of **a step inside the existing `check`
job**, which requires **zero** of the three edits because `check` is already in `needs:` and already in
the result loop.

> **Do not carry a fix on a mechanism that has demonstrated it can lose the fix.** Sharpest where it
> bites here: the gate being built exists *to forbid green-by-construction gates*, and the own-job route
> is the one mechanism in this repo with a two-incident history of *producing* them. A recidivism rate
> on a specific operation is evidence about the operation, not about the person performing it — which is
> why it outranks *"I will be careful with the third edit."*

Two details worth copying from how that ruling was written. First, it **named the one thing that would
reverse it** — *"a case where a DOC-ONLY diff creates a gate orphan; send it and I reverse"* — after
measuring why that case is currently unreachable (`check`'s `if:` is `draft==false && changes.code==true`,
and the `code` filter counts `package.json` and `.github/workflows/**` as code, so every diff that can
create an orphan already runs `check`). A ruling that ships its own falsifier is settleable by whoever
finds the counterexample, instead of requiring the author to be re-litigated.
Second, it **stated the tradeoff it was accepting** rather than claiming there was none: the step is
invisible on doc-only PRs, which is unreachable-by-construction today, and closing it would cost an edit
to `ci-ok` — the highest-blast-radius line in the repo. **If it ever does move to its own job, all three
edits must land in the SAME change.** Never one without the other.

### DEFECT 2 IS MASKED BY DEFECT 1 — so fixing defect 1 ALONE reddens `main` (verifier, reproduced on a clean checkout)

The verifier reproduced builder's finding at `642860f3` in a clean worktree and returned **one
correction that upgrades the architect's build order from a preference to the only safe sequence.**
Builder reported both defects as observable; **on clean `main` only the orphan prints.**
`check-gate-wiring.ts:335` is `if (bad) process.exit(1)` and the **negative-fixture half begins at
`:338`** — the reachability half short-circuits before the fixture half ever runs. Proven by removing
the mask (typo fix in `package.json` only, then reverted with `git checkout --`, **never `git stash`**):

```
before:  bun run check:gate-wiring -> EXIT 1, "NEW ORPHAN(S): check:grammar-v2"
after:   "All gates reachable except the known baseline debt. OK."
         "NEGATIVE FIXTURE — executed 1 proof(s); 20 gate(s) not yet proven"
         "GATE WITH NO NEGATIVE-FIXTURE PROOF and not grandfathered: check:moon-graph"   EXIT 1
```

> **A sequential checker with an early exit hides its own later findings, so a correct fix to the first
> defect turns the tree red for a defect that was already there.** The fix does not *cause* the red; it
> *reveals* it — and to everyone watching, those are indistinguishable. Consequence for sequencing:
> **`(b)` and `(d)` must be in the same COMMIT, not merely the same PR.** A PR whose first commit reds
> `main` for a new reason is a bisect hazard and an incident waiting to be misattributed to whoever
> pushed it.

**And the ruling that followed is stronger than the argument that produced it (architect, amending
themselves).** They had ruled *"one PR"*; the verifier's *"same COMMIT"* won because the *"one PR"*
version **silently depended on squash being the merge method — and it is not enforced.** Measured, and I
reproduced it: `gh api repos/fellwork/aihu` → `{"squash":true,"merge":true,"rebase":true}` — **all three
enabled.** The last six merges on `main` being single squash commits is a **convention, not a rule.**
Under rebase-merge the typo-only commit *becomes* a commit on `main`, and the red-for-a-new-reason state
is permanently in history and on every `git bisect`.

> **DO NOT LET CORRECTNESS DEPEND ON AN UNENFORCED CONVENTION WHEN THE STRICTER FORM IS FREE.** The
> "one PR" ruling was correct only while everyone kept choosing squash; "same commit" is correct
> unconditionally and costs nothing. The tell is a guarantee whose proof contains *"because we always…"*
> — go check whether the repo enforces the *always*, because a settings toggle is not a review.

Distinct from `gate-fix-armed-a-sibling-false-red.md`, where two *separately correct* PRs composed into
a false red. Here it is **one checker masking itself**, and the tell is an early `process.exit` above
later checks.

### A PROSE RUNG PROMOTED TO STRUCTURAL IN ONE DAY — the `green` control (builder, PR #691)

Banked yesterday as method: *a stripper needs a mutation in BOTH directions; red alone cannot distinguish
"reads correctly" from "reads nothing"* (`regex-over-source-cannot-tell-code-from-text.md`). Builder put
it **into the gate's own data structure**: `NEGATIVE_FIXTURES` gains an optional **`green` control**, so
a fixture proves a gate **discriminates** rather than merely fires. Their sentence for it is the compact
form: *"one that says no to everything satisfies the red half perfectly."* Their sabotage receipts run
both arms — `MOON_GRAPH_ROOT=…/should-flag` → 1, `…/should-not-flag` → **0**, unset (real tree) → 0 — and
one of them is the meta-gate **naming itself**: deleting the `gate-wiring` job from `plan-a.yml` →
`NEW ORPHAN(S): check:gate-wiring`.

> **This is the ladder working, and it is worth recording as loudly as a failure**: prose → structural in
> a single day, because the prose rung was written as *a property a gate must have* rather than as advice
> to be careful. **A lesson phrased as a fixture is portable into code; a lesson phrased as a habit is
> not.** That is a usable test for anything filed here. **When you fix the first failure of a multi-part gate, run it again before believing you
are done — the second half has never once been observed.**

**AND THE GAP THAT REMAINS IS EXACTLY THE CLAUSE WITH THE RECIDIVISM (architect, on #691).** The
sabotage suite proves **clause 1** (delete the job → orphan, the gate naming itself) and **clause 2**
(a YAML parse shows `needs`). **Clause 3 has no negative fixture.** Remove
`"gate-wiring:$GATE_WIRING_RESULT"` from the result loop while leaving the job in `needs:`, and nothing
built detects it — **verbatim the palette/#649 defect that `plan-a.yml:471-477` documents in its own
comment as having happened twice.** Builder's own principle applies to builder's own gate: *red alone
does not prove a gate discriminates.*

> **The durable form, and it is the real prize: `check-gate-wiring.ts` answers REACHABILITY — "is every
> gate invoked by a workflow" — and does not answer GATING — "is every job in `ci-ok`'s `needs:` also
> READ in its result loop." Those are two different properties, and only the first exists.** A parse of
> `plan-a.yml` asserting **`needs`-set == result-loop-set** closes the palette class *structurally*
> instead of by comment, and it is the same shape as the gate already being built. **A comment that
> records a recurrence is a candidate assertion: if you can state the invariant in prose precisely
> enough to warn about it, you can usually parse for it.**

**CONFIRMED BY MUTATION, AND IT IS TWO-SIDED (verifier, on the #691 merge tree).** The architect
predicted the hole; the verifier ran it rather than agreeing with it — which is the difference between a
prediction and a finding:

```
drop the loop entry, KEEP needs:   ->  check-gate-wiring EXIT 0, "All gates reachable … OK"   UNDETECTED
drop from needs:, KEEP loop entry  ->  EXIT 0                                                 UNDETECTED
```

**Neither half of the `needs`/loop pair is checked against the other**, so it is not a one-sided hole.
Stated honestly by the verifier and worth copying: the **non-detection** is measured; whether GitHub
Actions itself rejects a `needs.gate-wiring.result` reference when the job is absent from `needs:` is
**could-not-check** (Actions cannot be run locally) — but direction 1 needs no such caveat, because the
loop simply never reads the result, which is the exact palette failure. **Not a blocker on #691**, which
is strictly more coverage than the status quo; the `needs`-set == result-loop-set parse is a small
follow-on contract.

**And the both-directions bar was applied by a third role, unprompted, to two narrowings builder had
introduced** — the clearest evidence yet that this rung transfers:

- the dangling-`bun run` detector **skips trailing args**, so the verifier added
  `"check:probe-args": "bun run check:definitely-not-a-script --flag value"` → **still caught, EXIT 1**,
  args stripped correctly in the report. *The narrowing does not blind it.*
- the `green` control is new, so they attacked **the other half**: replaced `check-moon-graph`'s
  `process.exit(1)` with `exit(0)` — a gate that **cannot go red** → caught: *"NEGATIVE FIXTURE PASSED —
  the gate did NOT reject its own red input (it cannot go red)"*, **EXIT 1.**

> **A gate that cannot fail is now detectable by another gate.** That is the anti-green-by-blindness
> property working *across* gates rather than within one, and it is the first time in this directory
> that the green-by-construction class has been caught by machinery instead of by a person noticing.

## `ci-ok` CAN PASS HAVING READ NOTHING — the result loop is an ALLOWLIST OF BAD VALUES, and it is live on `main`

Chasing the verifier's named gap one level down, the architect found a **real defect nobody had**: the
`ci-ok` result loop **fails open on an empty result.** This is the sole required status context that
branch protection depends on.

```yaml
for pair in "check:$CHECK_RESULT" … "readme-sync:$README_SYNC_RESULT"; do
  result="${pair#*:}"
  if [ "$result" = "failure" ] || [ "$result" = "cancelled" ]; then fail=1; fi
done
```

**That is an allowlist of BAD values, not a denylist of GOOD ones.** Misspell a binding at either end —
the `env:` name or the pair list — and the pair expands to `gate-wiring:` with an **empty** result. Empty
is neither `failure` nor `cancelled`, so **it matches nothing and the loop passes it.**

**Verified by execution, three times, and the third is mine against `origin/main`'s own loop text** —
extracted with `git show origin/main:.github/workflows/plan-a.yml`, not retyped from anyone's quote:

| `check` result | current | proposed (`!= success && != skipped`) |
|---|---|---|
| `success` | fail=0 | fail=0 |
| `skipped` | fail=0 | fail=0 |
| `failure` | fail=1 | fail=1 |
| `cancelled` | fail=1 | fail=1 |
| **EMPTY** | **fail=0** | **fail=1** ← the defect |
| `neutral` | fail=0 | fail=1 ← the accepted tradeoff, measured |

**Direction 2 is the half that licenses the fix**: on all four real GitHub values the two loops are
**behaviourally identical**. The inversion changes exactly the empty/unknown rows and nothing else — *an
inversion that also moved a real row would be a regression wearing a fix's clothes.*

**AND THE SCOPE IS NOT ONE JOB — IT IS ALL OF THEM.** The verifier's worst case, which I reproduced on
`main` (six bindings there; seven in #691):

```
env -u CHECK_RESULT -u EXAMPLES_RESULT … -u README_SYNC_RESULT  sh loop-current.sh
   ->  RESULT fail=0,  AND ZERO OUTPUT LINES
same, proposed  ->  6 x ::error::,  RESULT fail=1
```

> **Drop or rename the `env:` block and the sole required status passes having checked NOTHING —
> silently, with no error line and nothing in the log to notice.** It is not *"gate-wiring is exposed"*;
> it is **`ci-ok` can go green with zero jobs read.** The vacuous-pass class — a gate that is green while
> measuring nothing — rebuilt inside the one status branch protection depends on.

**This is the palette family, THIRD VARIANT, and each variant is one notch harder to see:** palette was
*in `needs`, never read*; #649 the same; this one is **read, but the read silently yields empty.** It is
invisible to the human eye (the echo prints `gate-wiring:` with a trailing blank — it reads as
formatting) **and structurally invisible to `check-gate-wiring.ts`**, which reasons about `package.json`
scripts and workflow `run:` steps, not shell string semantics inside a YAML scalar. **A third clause of
the wiring bar that the wiring checker cannot see.**

> **THE GENERALISATION (verifier's, and it travels far past this file): any `if bad then fail` over an
> OPEN-ENDED value domain is FAIL-OPEN BY CONSTRUCTION.** An allowlist of bad values is the shell form of
> *a well-formed measurement of the wrong thing* — the loop runs, reads a variable that exists, and
> compares it against the wrong side of the alphabet. **Enumerate the GOOD values; everything else fails.**
> The tradeoff, stated and accepted: a genuinely new GitHub result value would red `ci-ok` until someone
> allowlists it. **A required status that errs toward red is recoverable in one commit; one that errs
> toward green is the defect we have now shipped three times.**

**Follow-on, upgrading the `needs`-set == result-loop-set parse named above: set equality alone would
have passed this typo.** The check must ALSO assert that **every pair's env var is BOUND in the same
step.**

### AN INVARIANT IS ONLY AS STRONG AS THE DISTANCE BETWEEN ITS TWO REFERENTS

The fix above (invert to fail-closed) is **necessary and not sufficient** — the architect found its
residual **by running it**, and then the verifier and the architect between them mapped the whole space.
Two lines were proposed: **(1)** the inversion, **(2)** a **positive control** — count the iterations and
fail unless `checked -ne 7`. Five scenarios, three loop variants, measured on both sides:

| # | scenario | current | inverted | + count guard |
|---|---|---|---|---|
| A | normal, 7 × success (must NOT red) | fail=0 | fail=0 | **fail=0, checked=7** |
| B | `env:` block dropped → 7 empty values | **fail=0** | fail=1 | fail=1, checked=7 |
| C | the **pair list itself** empty | fail=0 | **fail=0** ← inversion blind | fail=1, **checked=0** |
| D | one job silently dropped from the loop, count left at 7 | fail=0 | **fail=0** | **fail=1, checked=6** |
| F | job dropped **AND count decremented to 6** | fail=0 | fail=0 | **fail=0** ← still blind |

**C is the architect's residual**: the inversion closes bad and empty *values* and is blind to a vacuous
*list*. **D is the verifier's find and it is the recidivist palette/#649 defect itself** — the exact
mutation that no gate detects — caught by the count guard **at runtime, in CI, for two lines**. The
architect had positioned the guard as covering only C and revised in the *stronger* direction on being
shown D.

**And `checked=0` is the tell, which makes C rule 0 wearing shell:** `fail=0` **is an absence report** —
*"no failing job found"* — and it is indistinguishable from *"no job examined."* Identical shape to
`grep -c` over empty input printing `0`. **An absence report must first prove its input was non-empty**,
and that is what the counter does.

**Then F, which the architect tested and neither had run — and it draws the real boundary.** Drop the
job from the loop *and* decrement `7` to `6` **in the same commit**: two self-consistent lines, guard
installed and satisfied, `ci-ok` green having never read that job.

> **THE GUARD'S EXPECTED VALUE LIVES IN THE SAME FILE IT GUARDS, EDITED BY THE SAME HAND IN THE SAME
> COMMIT. A guard whose reference value is CO-LOCATED with the thing it guards is a CONSISTENCY check,
> not a CORRECTNESS check — it can only catch someone who edited one side.** The static
> `needs`-set == loop-set parse survives F precisely because **`needs:` is an INDEPENDENT DECLARATION**:
> it still lists 7 while the loop reads 6, and no amount of self-consistent editing *inside the loop*
> reconciles that. **An invariant is only as strong as the distance between its two referents.**

**So neither subsumes the other, and now that is measured on both sides rather than asserted on one:**
the guard is 2 lines and catches B + C + D at runtime; the parse catches D + F at PR time and can assert
each pair's env var is **bound**, which the guard cannot. Both. **`-ne`, not `-lt`** — measured: adding
an 8th job with the count left at 7 reds under `-ne` (the feature) and **silently passes under `-lt`**.

**Two method notes worth more than the fix.** First, the verifier's, from scenario A: **a positive
control that reds on correct input is worse than none** — the happy-path row is the direction-2 test *of
the control itself*, and nobody had stated it as a claim. Second, the architect naming their own habit
rather than accepting thanks a third time: they shipped direction-1 and called direction-2 obvious on
**(i)** the inversion being behaviour-identical, **(ii)** `-ne` vs `-lt`, and **(iii)** scenario A —
*"three times in one session while citing the bar to others. That is not a slip, it is my habit."*
**A standing bar you apply to others' work and not your own is not a bar, it is a preference**, and the
only reliable detector is a second role who runs what you asserted.

### R-E IS CLOSED — and the boundary is worth as much as the closure

The architect set R-E (*"must-fail must be a REAL CI run; local cannot prove CI reachability"*) and
closed it themselves on the verifier's measurement: `gate-wiring` completed/**SUCCESS** at 21:24:19Z on
`d42f7270` **while `check` was SKIPPED** (draft) — the always-on property demonstrated *in production*.

> **Naming the boundary so nobody re-opens a satisfied bar with an adjacent unmet one.** The verifier's
> honest *"every RED is local"* gap is a **different question** — *does `ci-ok` reject on a gate-wiring
> failure* — and was never R-E's subject. **A satisfied bar and an adjacent open question look alike in
> a summary**, and letting the second silently revive the first is how a closed contract stays open
> forever. Say which bar the new finding belongs to.

**Why neither defect was ever caught, at source:** `check:ci` has **no automatic invoker at all.** Not
CI (`grep -rn "check:ci" .github/workflows/` → exit 0 but both hits are *comment* text at
`plan-a.yml:274-275`), and **not the pre-push hook** — `package.json:33` `check:pre-push` is
`check:lint && typecheck` only, and `.husky/pre-push` runs exactly that. Its own comment says *"For a
local full-CI replay … run `bun run check:ci`"* — i.e. **by hand.** So the chain containing the typo is
invoked by nothing on any schedule, and `grep -rn grammar .github/workflows/` → 4 hits, **all prose,
zero `run:`**, independently confirming that `check:grammar-v2` has never executed in CI.

## Related

- `absent-value-rendered-as-real.md` — where the value is fictitious; here it is real
- `regex-over-source-cannot-tell-code-from-text.md` — Instance 4's sibling on the same day (the moon-graph gate)
- `promotion-rungs.md` — Instance 3's first half: the PR that writes the rule it violates
- `checked-thing-is-not-the-changed-thing.md` — where the subject is wrong; here
  the subject is right and it is the defect
- `derive-from-disk-cannot-detect-removal.md` — the other coverage-integrity shape
  found the same day, in the same gate
- FEL-426 (the XSS, fixed in #619 `7766286e`), FEL-428 (green-by-construction),
  FEL-435 (the citation case's topic)
