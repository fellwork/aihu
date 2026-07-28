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

Distinct from `gate-fix-armed-a-sibling-false-red.md`, where two *separately correct* PRs composed into
a false red. Here it is **one checker masking itself**, and the tell is an early `process.exit` above
later checks. **When you fix the first failure of a multi-part gate, run it again before believing you
are done — the second half has never once been observed.**

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
