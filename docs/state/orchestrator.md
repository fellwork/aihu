# State — orchestrator

**Project slug:** `aihu`
**Role:** orchestrator (merge train, release train, dispatch, merge-order rulings)
**Renamed from:** `docs/state/merge-train.md` on 2026-07-26. Scope names go stale —
`merge-train` spent 2026-07-25/26 orchestrating a swarm, not running a merge train,
and `docs-next` spent it doing config architecture. **Role names survive a pivot.**
**Last verified:** 2026-07-27 (orchestrator wake, against `origin/main` @ `edba0c5a`)
**Mode:** 2/3 mixed — build + defect fix, multi-agent

> **Why this file lives at `docs/state/` and not `state-orchestrator.md`:**
> `.gitignore:98` matches `state-*.md`, so a repo-root state file is untracked,
> invisible to every other clone, and lost on a fresh worktree. The
> `fw-agent-skill` resume protocol previously pointed at that path, which made
> resume step 1 a silent no-op — see lesson #20 in
> `.claude/skills/fw-agent-skill/references/lessons.md`.

## Substrate — CHANGED TWICE on 2026-07-27. Read this before trusting anything below.

**The bus is the record.** Coordination runs over `swarm-bus` (the Rust core in
`packages/swarm`, installed at `~/.swarm/bin/swarm-bus`) against one SQLite file
at `~/.swarm/bus.db`. Payloads are typed and validated at the boundary; a
malformed message is REJECTED with exit 2, so **read the exit code.** The
predecessor `bus.py` and the pre-cutover `skills/swarm/swarm.ts` Linear/Notion
path are both SUPERSEDED — a contract naming `skills/swarm/swarm.ts` as its
surface is describing a dead tool (this is how C-FEL-436 came to be dispatched
for work #645 had already done in `packages/swarm/src/main.rs`).

**Slack is banned for agents** (founder ruling 2026-07-27, landed as `#658`).
It is read by neither the reconciler, the console, nor the Linear/GitHub sync:
work reported there is invisible to every gate. It happened anyway this session —
verifier posted the FEL-461 finding to Slack and it existed in the ledger only
because builder-b relayed it onto the bus.

**Durable role state lives at `docs/state/<role>.md`**, committed, named by ROLE.
`docs/state/<your-own-role>.md` is **always in surface, on every contract** —
ruled 2026-07-27 after the historian correctly flagged it as a scope delta. A
surface that forbids the file every role is required to update is a defect in
the surface.

GBrain remains reachable at user scope as `gbrain-local` for semantic recall. It
is **not** the coordination or state layer. It went unused for ~20 hours on
2026-07-25 and the one page it holds was stale within 30 minutes of being
written. Do not treat it as truth.

## 🔴🔴🔴 THE UNSOUND REACHABILITY ARM IS AN ORCHESTRATOR AMENDMENT — mine

Architect's R-C is correct and **supersedes my own ruling** ("wire `check:gate-wiring`
in as a step"), which would make the detector **run while its verdict stays false.**
`scripts/check-gate-wiring.ts:15-16`, read at source:

> *"REACHABILITY = EITHER ROUTE (**ORCHESTRATOR AMENDMENT, POST-#673**): a gate is
> reachable if it is in the `check:ci` transitive chain OR an actual `run:` step in
> any `.github/workflows/*.yml` invokes it."*

**The file names the amendment as an orchestrator's — my lineage.** The half I added
(the workflow-step arm) is the **sound** one, added for a real reason recorded right
there: `lesson-refs`/`readme-sync` run as their own jobs and a `check:ci`-ONLY test
would false-flag them. **But by writing EITHER ROUTE I blessed the pre-existing
`check:ci` arm, and that arm is false — `check:ci` is invoked by no workflow.** *I
did not audit the arm I was extending.* A detector reporting "all reachable" from
that premise **manufactures a green where there was merely silence.**

### R-D measured — SMALL, and smaller than the remedy architect proposed for it

```
gates in the check:ci closure                          11
reachable via a REAL workflow run: step (arm B, sound)  9
ARM-A-ONLY (green-by-construction)                      2
   check:gate-wiring   (the detector itself)
   check:grammar-v2    (no workflow invokes it)
plus check:grammar-v — the typo, no script at all
```

**Two gates.** That argues **against** wiring `check:ci` into a workflow: nine of
eleven already run as real steps, so wiring the aggregate **double-runs nine gates on
every PR** and keeps a model where *membership in an aggregate* counts as
reachability — true only while somebody keeps the aggregate wired, **which no gate
enforces.**

**RULED (`C-FEL-GATE-WIRING-REACHABLE`, builder — scope now includes the MODEL):**
1. **DELETE ARM A.** Reachability means one thing: an actual workflow `run:` step.
2. Wire the two real gates as steps in the existing `check` job.
3. Typo fix **before** wiring, same PR, or main goes red.
4. **Must-fail on a REAL CI run** — break a gate on a branch, observe CI go red.

### 🔴 I made the detector's own error THREE times in ten minutes

- pass 1 flagged all 11 — broken shell word-split
- pass 2 flagged `check:moon-graph`, provably `- run: bun run check:moon-graph` at
  `plan-a.yml:85` — **I grepped my worktree, not `origin/main`**
- pass 3 flagged `check:lesson-refs` — CI invokes it at `plan-a.yml:287` as
  **`bash scripts/check-lesson-refs.sh`, the underlying script, not the npm alias**

**Pass 3 is a DESIGN REQUIREMENT, not an anecdote: the reachability test must match
the SCRIPT PATH as well as the npm alias**, or it re-manufactures false positives and
pressures someone to "fix" a correctly-wired gate. **None shipped — each contradicted
a fact I already held.** *Three wrong measurements of the thing I was ruling on, in
one wake.*

## 🔴🔴 FOUR ROLES PUBLISHED A #689 CLAIM AT A HEAD THAT WAS ALREADY STALE

`origin/main = 45df25ba` (fetched 12:38:41) — **moved a third time today.** #689 head
is **`046807ef`**, not `e85c839d`; `grep -c stripNonCode` → **2**, so my published
landing gate passes. Own run still in_progress ⇒ could-not-check.

**builder's verdict, my stop, architect's confirmation, verifier's correction — every
one honest, every one obsolete on arrival.** *Verifier was the only one who stamped
the head and attached a void clause.* The stop was right when issued and builder
fixed it in the same minute.

**builder's git trap, adopted as standard:** `git checkout <tree-ish> -- <path>`
**stages** as well as updating the working tree, so a must-fail control arm became a
committed revert; restoring the working tree with `cp` left the index holding main's
copy. *"I was verifying the working tree while CI verifies the COMMIT."* **Verify the
committed artifact —** their `git worktree add /tmp/verify689 HEAD` re-run is now the
standard for any gate claim.

## The earlier #689 measurement round (superseded above, kept for the mechanism)

**RETRACTED: my "DO NOT LAND #689".** I published it with a one-command gate and
then **re-ran my own gate instead of re-asserting the warning:**

```
head NOW = 046807ef (the head I warned about, e85c839d, is superseded)
git show 046807ef:scripts/check-moon-graph.ts | grep -c stripNonCode → 2   ← my gate said "must be 2"
  42297934 fix(ci): check-moon-graph reads code, not text about code
  e85c839d revert(build): drop the … signals edge
  046807ef fix(ci): restore stripNonCode — e85c839d reverted it by accident
cumulative: moon.yml −1 AND check-moon-graph.ts +90 · merge-base = 3891300a = current main
689 moon.yml dependsOn [agent, agent-service, server] — NO signals; main still carries it
MERGEABLE; BLOCKED only on run 30378829577 in flight ⇒ could-not-check, not red
```

**The amended bar is met, and builder self-caught it** — the commit is literally
titled *"restore stripNonCode — e85c839d reverted it by accident."*

**Verifier's PARTIAL is stale in exactly the way mine was, for the same honest
reason** (they measured `18d6d6e8`). **Their merge SIMULATION is the load-bearing
instrument nobody else used** — overlaying #689's script onto *current main's* tree
and getting EXIT 0 proves landing it greens **main**, not its own stale base.
**Adopted as standard for any PR whose base has drifted.**

**THE LESSON IS MINE:** I caught builder's stale receipt this morning and published
a stale warning myself this afternoon. **A head sha is not an identifier for a PR,
it is a timestamp. Every claim about a PR carries the head it was measured at —
including a warning, including a refusal.**

## 🔴🔴 THE ORPHAN-DETECTOR IS ITSELF AN ORPHAN — builder's find, all three facts confirmed

```
package.json on main: check:grammar-v ×1 (the CALL in check:ci) · check:grammar-v2 ×1 (the SCRIPT)
grep -rn 'check:gate-wiring|check-gate-wiring' .github/workflows/ → NOTHING
plan-a.yml:264 — "check:ci is invoked by no workflow in this repo. THIS job is the wiring."
plan-a.yml:275 — "check:skill-samples sat unwired for a while on exactly that
                  misunderstanding; #615 fixed it."
```

**The repo already suffered this exact failure once, wrote the warning into the
file, and then shipped it again in the gate built to detect it.** #680 landed a
reachability meta-check that is **unreachable** AND created **the exact orphan it
detects**, in one commit, each half hiding the other. **Prose in a comment failed to
prevent the thing the comment is about — the fourth time today prose lost to a rung.**

### RULED — I OVERRULED builder's split: the typo and the wiring are ONE contract

`C-FEL-GATE-WIRING-REACHABLE` → builder.

- **#689 stays single-purpose.** It just spent an hour proving a second concern in
  that branch clobbers the first; the typo blocks nothing in CI (`check:ci` is
  local-pre-push only).
- **Splitting typo from wiring repeats the day's central mistake** — #681 was filed
  as a bug not a class and we shipped its sibling hours later. *A typo fix landing
  while the detector still cannot run leaves the NEXT typo equally invisible.*
- **Wire it as a STEP in the existing `check` job, not a new job** (`plan-a.yml`
  already runs `:78 check:deps`, `:85 check:moon-graph`, `:109 check:skill-samples`).
  **A step needs no `ci-ok` `needs` change and no branch-protection change** — it
  gates without touching the sole required context. **Builder's refusal to edit
  plan-a.yml was right about the risky version.**
- **MUST-FAIL requires a REAL CI run** (their own point): with the gate wired,
  re-introduce the typo, prove CI goes **red**, then remove it. *A reachability check
  proven only locally is the defect under investigation.*
- **ORDER: fix the typo BEFORE wiring, same PR** — `check:gate-wiring` is EXIT=1
  right now on the `grammar-v2` orphan, so wiring first turns main red.

**Adopted from architect: AN INVARIANT NEEDS NO CLOCK.** *"No member of the
population exceeds the TTL"* is checkable by anyone at any instant, so it **removes
the structural cause of the reach-early bias** instead of asking anyone to resist
it. Reach for the invariant first; bank the prediction because it makes the question
settleable by a stranger.

## The #689 warning as originally published (superseded above, kept for the mechanism)

**#689 is READY, so it is landable by anyone reading builder's (honest, and true-at-
the-time) verdict.** Caught with `git log` / `git show --stat`, **not** `gh pr diff`
— my own near-miss lesson paying for itself one wake later.

```
builder reported head 18d6d6e8. ACTUAL head: e85c839d
git log origin/main..e85c839d:
  42297934  fix(ci): check-moon-graph reads code, not text about code   +89/-1
  e85c839d  revert(build): drop the plugin-agent-readiness → signals edge (d10674ad)
git show --stat e85c839d  → TWO files, not one:
  packages/plugin-agent-readiness/moon.yml    1 -     ← the intended revert
  scripts/check-moon-graph.ts                90 +---  ← THE ENTIRE FIX, REVERTED
grep -c stripNonCode:  42297934 → 2 · HEAD → 0 · main → 0
```

**If it merges: the (a) edge is removed AND the extractor is still blind ⇒ main goes
red a second time from the identical cause.**

**The likely mechanism is the cruellest one today: THE MUST-FAIL MUTATION DELETED THE
FIX.** Builder's protocol was revert-`stripNonCode`-to-identity → observe `EXIT=1` →
restore; the revert commit's content is consistent with the tree being captured
**mutated**. *The test written to prove the fix is load-bearing is what removed it.*
**A COMMIT MESSAGE IS NOT A DIFF** — that subject line names 1 of 2 files, and nobody
would look for a 90-line deletion under it.

**Not a competence failure — the gap is: they measured the tree and then committed
again.** The remedy is the void clause they already used on #685, applied to their
own head sha. **One command gates the merge:**
`git show <head>:scripts/check-moon-graph.ts | grep -c stripNonCode` **must be 2.**

### 🔴 MY defect: I dispatched a contract row that does not exist

```
builder: swarm-bus claim --id C-FEL-MOONGRAPH-LITERALS --role builder → exit 2, "no contract"
me:      swarm-bus offer … → "--issue is required. A contract without a bidirectional
                              acceptance bar is a wish, not a contract."
```

**I dispatched in a NOTE and named a claim command for a row I never created**, so
their verdict is attached to a contract the ledger has never heard of. *A dispatch
that creates no row is a wish, not a contract* — **the tool said exactly that when I
tried to fix it, and I had skipped the step it guards.** They flagged it rather than
proceeding silently (right) and built anyway because main was red (also right).
**I did NOT invent an `--issue` to satisfy the validator** — that is the false-link
trap I ruled on for `C-SWARM-P0`. **Left in DECIDE** for the interactive session to
file the tracking issue and create the row. Builder's work is real and must not be
redone.

## ✅ MAIN IS GREEN — first trustworthy receipt on main today

`origin/main = 3891300a` (fetched 12:27:49) · run `30377446642`: **check SUCCESS and
ci-ok SUCCESS, same run.** The red is over — **which removes the urgency argument
that justified building without a row, and means #689 can take the time to be right.**

## ✅ THE TTL PREDICTION SETTLED — twice, and the second one makes it conclusive

**Architect pre-registered a second check precisely because one expiry-timed death
could be coincidence** (a daemon also exits on `completed`/`lost`). It was not.

```
12:29:52 — Jul 27 20:28:23 GONE (due 12:28:23) · Jul 27 20:28:28 GONE (due 12:28:28)
           new oldest Jul 27 21:56:59, due 13:56:59, correctly still alive
```

**Three expiry-timed deaths matching prediction to within seconds.** The mechanism is
the TTL, not chance. `ce160` still 1016 — correct, its window opens 16:50:59; **do
not read that as the reaper failing, it is a different cohort.**

**The sequence worth copying:** architect named their own bias out loud (four times
reaching early for the confirming measurement), then **pre-registered a confirmation
they had not yet earned.**

## ✅ THE FIRST TTL EXPIRY — the reaper fired within 10s of the predicted instant

Four agents' watchers died with their sessions before resolving this. **I ran it and
held the window open rather than reaching early** (architect misjudged this clock
twice in their own favour and said so).

```
predicted expiry: Jul 27 20:23:10 + 16h = 12:23:10 EDT
12:23:02  oldest = Jul 27 20:23:10  anchored=1141   ← still there, 8s before due
12:23:20  oldest = Jul 27 20:28:23  anchored=1141   ← GONE (direct read)
12:23:33  watcher: *** MOVED — REAPER FIRED ***     ← independent confirmation
```

**Branch taken: the bound HOLDS.** R3 (do not mass-kill) and R4 (not urgent) now
stand on **observed behaviour**, not source alone. **The count still rising
(1139→1141) is expected, not a contradiction** — arrivals continue while departures
have only begun; the bolus drains 16:50:59 today → 01:33:54 tomorrow.

**Why this was settleable by a stranger in one command:** architect pre-committed
**both branches** at `041dcf9`, so the answer did not depend on them being awake.
*A background task is not a record.*

### The premature-absence loop, closed

Builder reported three phantom failures from observations inside a gap; I ruled the
shape (*an absence is only evidence once you can show the thing had its chance to
appear*); architect then asserted a mechanism **works** from data that could not yet
show it working, **in the same document telling everyone to read the source**, and
conceded it. **Four roles walked through that door today.** The rung that worked was
never "be more careful" — it was **publish the prediction with its expiry and both
branches**, the same move as the ci-receipt VOID clause.

## 🔴 `C-FEL-SCAFFOLD-PM-COMPAT` (#684) — verdict accepted, one correction, one unblock

- **#677 MERGED 15:56:59Z ⇒ builder-b's stated blocker is GONE.** Their "the matrix
  cannot measure npm/pnpm until #677 lands" was true when written, false now. **The
  matrix is measurable; local pnpm is one PM on one machine.** Corollary restated:
  only the **yarn** column can confirm the peer fix.
- **pnpm 11 renamed `onlyBuiltDependencies` (list) → `allowBuilds` (map).** The
  legacy key is read by nothing and **warned about by nothing** — a 3-arm control
  shows it is indistinguishable from having no file. Guard asserts the **key**.
- **CORRECTION:** their *"the `agent` template never emitted `pnpm-workspace.yaml`;
  minimal/docs and full did"* is **false about main** — **zero** emission sites
  anywhere in `packages/cli/src` on main; their own diff adds it to `index.ts`,
  `templates-full.ts`, helper in `templates-tooling.ts`. **The asymmetry lived
  inside their branch mid-work.** Not a fault; but as written it sends a reader
  hunting a main defect that is not there. **Say which tree a defect lived in.**
- **Verified and accepted:** `bin.ts` on main mentions `--pm` only in a comment at
  `:164`, no parsing (defect (b) confirmed); `vitest.config.ts:27-33` really does
  exclude `legacy-snapshot.test.ts` with `vitest.gates.config.ts` as the gate path,
  and **the file's own comment at `:33` records that this gate "no-opped for weeks"**
   — so green `bun run test packages/cli` beside a red gate is the split working as
  designed.
- **Filed `C-FEL-TEST-BUDGET-FLOOR`** — `agent-readiness-floor.test.ts` at 3438ms of
  a 5000ms budget, fails under parallel load, reproduced on clean HEAD. Not
  builder-b's; do not widen into it.
- **Their head stamp was already void** (`6705832b` → `431caa6e`) with no void
  clause attached. Expiry conditions belong on head shas too.

## 🔴🔴🔴 MAIN MOVED TWICE INSIDE ONE WAKE — a board can go stale between two commands

```
fetch #1: origin/main = 5d485ba9   check FAILURE · ci-ok FAILURE   ← the red I broadcast
fetch #2 (minutes later): origin/main = 3891300a
landed between: c4724454 (#680 gate-wiring), 3891300a (#685 ci-receipt)
main @ 3891300a: check run 30377446642 IN_PROGRESS since 16:16:42Z — NO VERDICT
```

**Main is not green and not red — it is COULD-NOT-CHECK.** My prior lesson
(*"re-fetch before you quote a board"*) **was too weak. The real rule: quote a sha
with the fetch that produced it, or do not quote it.** Historian's lessons file
carries *"origin/main still 2c3dd7fe"* — **my stale number, propagated from my
broadcast into a durable repo artifact.** That is how one bad measurement becomes
permanent.

### The red was resolved by (a) — the option I ruled against

**#685 landed carrying `d10674ad "fix(build): plugin-agent-readiness depends on
signals"`.** The direct edge is on main. Landing is the interactive session's call
and I do not second-guess unblocking a red main fast.

**(b) IS NOT MOOT.** `check-moon-graph.ts` is still string-literal-blind; the next
`.aihu` fixture in any package re-breaks main identically. **(a) greened one
package's symptom; the class is untouched.**

### RULING AMENDED — (b) must also REVERT the (a) edge

verifier ran the test builder did not: **strip only the two fixture import lines →
`check:moon-graph` exit 0.** The fixture text is the sole cause. And their graph
trace, **which I confirmed at source:**

```
plugin-agent-readiness  dependsOn: [agent, agent-service, server, signals]
packages/server         dependsOn: [agent, agent-service, arbor, context, plugin, signals, store]
```

**`plugin-agent-readiness → server → signals` ALREADY ordered signals before the
typecheck.** The transitive need `moon.yml:5-16` documents was already satisfied
before `d10674ad`. **This upgrades my rejection of (a): I called it misleading; it
is worse — a NO-OP THAT ALSO LIES.** Added to the contract: the PR reverts the
`- 'signals'` line, and the must-fail is that `check:moon-graph` passes **without**
it once literals are skipped. Fixture at `:61`/`:82` stays byte-identical.

### 🔴 I was one command from a SECOND false alarm — `git diff main branch` lies about deletions

`git diff origin/main <685>` showed **460 deletions** — `check-gate-wiring.ts` and
three baselines gone. I was composing *"#685's rebase CLOBBERED #680's landed
work"* when I checked the premise. **Artifact: main gained those files AFTER the
branch point, so a branch-vs-main diff renders them as deletions.** *A branch that
is merely behind is indistinguishable from a destructive rebase in a raw
`git diff main branch`.* **Use `git log main..branch` to see what the branch
actually did.** Twice in two wakes now, one command from a loud confident reversal;
both caught by checking the premise instead of the conclusion.

**verifier's regex correction is the operationally important one:** builder's
`[backtick-or-double]` misquote **produces a FALSE REFUTATION** — the single-quoted
fixture does not match it, and verifier hit exactly that on their first pass. The
real class is `['"]`. A misquote that sends a reproducer away believing the
diagnosis was wrong.

## 🔴🔴🔴 MAIN WAS RED @ 5d485ba9 — and my STALE BOARD is why it sat unnamed

```
origin/main = 5d485ba96101df5705eedacd65db8f5a1b55ae7f
run 30375932836  check completed/FAILURE 15:58:07→15:59:02 · ci-ok FAILURE 15:59:05
check:moon-graph — FAIL: plugin-agent-readiness must add dependsOn: signals
```

**I published *"Board unchanged: origin/main 2c3dd7fe"* WITHOUT RE-FETCHING before
sending it.** Nine PRs had landed: #654 #671 #672 #677 #679 #681 #682 #683 #686.
**The shelf-life failure I have banked twice and lectured two roles about — and
this time it was load-bearing, not cosmetic: a red main sat unnamed because my
board said the queue had not moved.** builder caught it. **Treat any board row of
mine older than the message it appears in as void.**

### The defect: a regex over raw source cannot tell code from text about code

| | |
|---|---|
| `scripts/check-moon-graph.ts:176` | `IMPORT_RE = /(?:from\|import\|require)\s*\(?\s*['"]([^'"]+)['"]/g`, `matchAll` over raw content |
| `tests/agent-manifest-sidecar.test.ts:61,82` | `import { signal } from '@aihu/signals'` **inside a backtick `.aihu` fixture** |

**The match fires on the fixture's INNER SINGLE QUOTES; the outer backticks are
invisible to the regex** — which is exactly why it cannot tell it is inside a
literal. (builder's bus rendering showed a backtick in the character class; the real
one is `['"]` only. Patch against the real regex.)

**#671 (the gate) and #683 (the fixtures) were each green in isolation and their
UNION was never built.** builder called themselves "half the cause"; **rejected —
two green PRs whose combination is untested is a MERGE-ORDER blind spot, and merge
order is mine.** Sibling of **#681 "dep-check import-extractor is comment-blind"
(`df34eeb2`), landed the same day**: we fixed one instance and shipped another
within hours **because the fix was filed as a bug, not as a class.**

### RULED `C-FEL-MOONGRAPH-LITERALS` → builder: (b), scope widened, (c) REFUSED

- **(a) rejected** — `moon.yml:5-16` records that `@aihu/signals` arrives
  *transitively* via `@aihu/server`'s tsconfig paths and that the chosen fix was a
  **paths override, deliberately not a `dependsOn`.** *A gate satisfiable by writing
  down something false is worse than the gate being red.*
- **(c) refused, and NOT as the weaker option: THE FIXTURE IS THE REGRESSION TEST.**
  Rewriting it deletes the exact input that proves (b) works. It is not
  belt-and-braces; it removes (b)'s evidence. **Acceptance bar: main goes green with
  `:61`/`:82` UNCHANGED, byte for byte.** Must-fail: revert the literal-skipping and
  it goes red again on that untouched fixture.
- **Scope widened past what was asked: do COMMENTS too**, copying #681 rather than
  re-deriving. Half of a known-two-half defect reads as coverage.
- **Path not to take:** do *not* exclude test files — they are typechecked, so their
  real imports are real edges. That trades a false positive for false negatives on
  the very FEL-411 race.
- **WHO: builder.** Their surface instinct was right and escalating was correct;
  **I am dispatching, so it is not unilateral widening.** Handing it to #671's owner
  buys a re-derivation while main stays red.

### Accepted from architect — including a lever I wrongly said did not exist

**`SWARM_SYNC_INTERVAL` DOES gate the outward `sync --push`.** I verified only that
nothing gates `reconcile()` and **generalised past my evidence.** Their ruling *not*
to pull it is right for a reason I had not weighed: **the same 1800s branch carries
`health_check()`+mint, the wedged-session self-heal that recovered two roles this
morning.** ***NAME THE BRAKE, DO NOT PULL IT*** — adopted verbatim. Also adopted:
exposure measured at **zero** linked contracts at `submitted`, so do-not-pause holds
for a measured reason; **(b) must land before any linked dispatch** (C-SWARM-QUEUE-
ROUTING waits).

**Precision on the record, no heat:** they said I mis-stated their ruling as
"SessionEnd reaping is the right durable fix." **I quoted their own earlier message
verbatim; they later reversed it in R2 — correctly.** The record should read *they
changed their mind*, not *I misread them*. **R2 now stands: do NOT dispatch
SessionEnd reaping** — it cannot fire for a session that never ends.

### Timing rule from the ref conflict — neither architect nor I was right

builder was handed opposite instructions by two roles, **took the safe arm and said
so on the bus instead of picking silently.** *A recovery ref is redundant once its
content is ON MAIN, not once it is on a branch* — folding into a **draft** is not
landing. Architect's "fold then delete" was right in spirit, wrong on the clock;
my "delete nothing" was right by accident.

## 🔴🔴🔴 SIX AGENTS GREPPING ONE STRING MEASURE EACH OTHER — and it nearly cost me a false reversal

**Last wake I warned everyone that `pgrep -laf claude | grep ce160f8f` matches your
own shell command lines, and prescribed `[l]ive-daemon.js`. THAT PRESCRIPTION IS
INSUFFICIENT AND I PROVED IT ON MYSELF.** The bracket trick hides *your* grep from
*your* grep. It does **not** hide the **other five roles'** argv — architect and
historian were measuring daemons in the same minute, and their command lines
contain both literals.

```
ps -eo lstart,command | grep '[l]ive-daemon.js' | grep ce160f8f   → newest "12:05:05"   ← WRONG
ps -eo command | grep -c '^node /Users/smcguirt/.promptbook/hooks/live-daemon.js ce160f8f' → 1016
ps -eo command | grep -c '^node /Users/smcguirt/.promptbook/hooks/live-daemon.js'          → 1125
newest REAL ce160 daemon → 09:33:54, NOT 12:05. ce160f8f IS FROZEN.
```

**I was ~90 seconds from publishing *"ce160f8f IS STILL SPAWNING — the frozen-bolus
model both of you built on is FALSIFIED."*** A loud, confident, wrong reversal of
two correct rulings. **ALWAYS ANCHOR: `^node /Users/…`.** Every unanchored daemon
count published today — mine, architect's, historian's — is inflated by whoever
else was measuring.

**The transferable shape: the observer population contaminates the observed
population, and it does so hardest exactly when we are doing the right thing —
independently verifying each other.** A swarm told to double-check each other's
measurements is a swarm whose measurements interfere.

### My ~35-hour clock is dead twice over, and both deaths are mine

1. **WRONG MODEL.** I extrapolated an arrival rate to a 4000 ceiling **with no
   departure process.** A population with a TTL has a **steady state, not a ceiling
   date** (arrival × 16h, comfortably under 4000). *The rate was never the error —
   better sampling would never have caught this.*
2. **CONTAMINATED DATA**, per above.

**Architect's "there is no clock" — ACCEPTED.** Second wake running that I have had
to withdraw this; that is a habit, not an incident.

### Architect's ruling ACCEPTED IN FULL — verified at source

| claim | source | verdict |
|---|---|---|
| `MAX_LIFETIME_MS = 16h` | `live-daemon.js:54` | confirmed |
| cap is **first** stmt in `tick()`, on in-memory `startedAt`, ahead of any throwing I/O | `:91` | **structurally robust** |
| *"Spawned ONCE per session"* | `:13` | documented, unenforced |
| `spawn(node,[daemonScript,sessionId,…])` with **no liveness guard** | `session-start.js` | **that gap IS the defect** |

**R2 is the best line in their message:** *a SessionEnd reaper cannot fire for a
session that never ends* — which is precisely the leaking population. **Fixing the
common case while missing the only case that leaks is worse than no fix, because it
retires the alarm.** R1/R3/R4/R5 accepted.

### Two corrections back — one is this morning's shape again

- **"The TTL is REAL" is confirmed; "AND IT IS WORKING" is UNOBSERVED.** *"Not one
  daemon has ever exceeded the TTL"* is true and is **not evidence it fires**: the
  oldest started Jul 27 20:23:10, now 12:05 ⇒ **15h42m. Nothing has reached 16h
  yet.** An absence measured before the mechanism could act — **the
  premature-absence door, third role to walk through it today.** Published as a
  prediction with an expiry instead of an opinion: **first TTL expiry due ~12:23
  today; if the anchored count has not begun dropping by ~13:30, the TTL is not
  firing and all of this reverses.**
- **The drain window is inverted.** The bolus spans `00:50:59 → 09:33:54` today, so
  +16h gives **16:50:59 today → 01:33:54 tomorrow.** Architect computed the *first*
  expiry and labelled it the *completion*. Conclusion unaffected; the date is.

**Historian** banked the right method lesson (*a trend needs a time series + a
liveness check*) **and violated it in the same message** — "FLAT at 1116" off a 68s
window is a trend claim from a window too short to resolve one, on contaminated
counts. Direction right, because the dominant term (1016) really is static. **They
and I made opposite errors from the same bad instrument.**

**Watch the ARRIVAL RATE, anchored, not the population. Re-escalate only above
~2/min sustained** (architect's threshold, adopted).

## 🔴🔴 STANDING RULE: DO NOT USE `git stash` IN THIS REPO — the stack spans 132 checkouts

builder measured it; **I reproduced it from little-rock rather than taking it:**

```
git rev-parse --git-common-dir  → /Users/smcguirt/conductor/repos/aihu/.git
git worktree list | wc -l       → 132
git stash list                  → stash@{0}: On fix/fel-scaffold-pm-compat: …
```

**That last line is the proof.** I am in `little-rock`;
`fix/fel-scaffold-pm-compat` is **builder-b's branch in a different worktree** —
and `git stash pop` with no argument takes `stash@{0}`, whoever pushed it last,
from wherever. **The index lock is per-worktree and merely blocks you; the stash
stack is global and mutates silently.** Use a **WIP commit on your own branch**:
per-branch, unpoppable by a stranger, recoverable by reflog.

### What was inside it — a merged contract whose state record never landed

`776b263f` was a prior builder instance's state for **C-FEL-EXTERNALS / #656,
merged 2026-07-28T01:45:55Z** — and `docs/state/builder.md` on main has no entry
for it. **The work landed; the record of what the next instance must not redo did
not.** builder preserved it to `recover/builder-state-fel-externals` (remote-
verified; zero CI, since `plan-a.yml on.push.branches: [main]` — they checked that
*before* pushing, not after).

**RULED: fold it into #688 — "whoever next owns builder state should fold it in"
is an unowned assignment, which is the defect they just found one level up.** The
stash was content nobody owned on a mutable stack; a recovery ref is content nobody
owns on a ref nobody watches. Better, but **the next builder reads
`docs/state/builder.md`, not `git ls-remote`.** Their two objections both fail:
`+61/-0` is additive so landability is unchanged, and the file is **role-scoped,
not contract-scoped** (standing ruling — `docs/state/<own-role>.md` is in surface on
every contract).

### 🔴 The measurement whose meaning inverted — builder caught it *before* reporting

`git branch -r --contains 3e00b4d3 → 0` is **still true and now means the
opposite.** #688 is not a literal cherry-pick (the diff wouldn't apply — main's
state file is 164 lines against that branch's 270), so the content is durable under
a **new sha**. **A reader re-running my own verification command to check their
work lands on a false negative.** Third instance of the shape today, **first caught
before publication rather than after.**

## 🔴 The daemon leak — architect's "no clock" is FALSIFIED; my withdrawn alarm stays withdrawn

```
11:52:28 daemon=1110 ce160=1018     11:58:52 daemon=1117 ce160=1018
11:53:59 daemon=1112 ce160=1017     11:59:39 daemon=1120 ce160=1019
+10 / 431s ≈ 83/hour · headroom 4000-1120 = 2880 ⇒ ~35 HOURS
```

Architect's *"a BOUNDED CORPSE, NOT A RUNNING LEAK — there is no clock"* is wrong;
historian's *"growing, with a deadline"* is right. **My own "ceiling hours away"
stays withdrawn** — wrong by an order of magnitude. *Withdrawn is not reversed:
historian did not restore my alarm, they found the middle I reached independently.*

**The correction that inverts the obvious fix:** *"93% is one dead session"* is
**true as composition, misleading as cause.** `ce160` is **91% of the population and
10% of the growth** (+1 of +10). **Killing its ~1019 processes buys ~12 hours and
does not stop the leak** — a reader acting on the 93% will believe they fixed it.

### The escalation is the THIRD FILE, and it is ONE escalation, not three

| file | what | status |
|---|---|---|
| `~/.swarm/supervisor.py` | wake loop, no backoff | mine, owed |
| `~/.swarm/recon.py` | the claim checker | architect, ruled `(b)` |
| `~/.promptbook/hooks/live-daemon.js` | the unreaped daemon | outside our reach |

**None is in a repo; none has CI, review, or a durable record; all three are live
SPOFs the swarm runs on and cannot touch safely.** *Three escalations about three
files is three times the noise and one third the force.* **A ~35-hour clock is a
note with a deadline, not a DECIDE** — I am not re-filing the alarm I withdrew four
hours ago on the same evidence.

## 🔴🔴 MY INTERIM GUARD FORBIDS AN ACTION NO AGENT PERFORMS — a timer does

Read at source this wake, `supervisor.py:871-885`:

```
tick(); reconcile(); auto_dispatch()   →  EVERY TICK   (SWARM_TICK = 5s)
health_check() + the wedged mint       →  every SWARM_SYNC_INTERVAL = 1800s
bus sync --push --confirm              →  every 1800s, AUTOMATIC
```

**I told every role: *"do not run `sync --push` against any `verified` row whose
`recon` is not a real same-repo receipt."* Nobody has to run it. The supervisor
runs it on a thirty-minute timer.** My guard was addressed to agents; **the actor
is a loop.** *A guard whose subject cannot perform the action it forbids is not a
guard* — it reads as coverage and provides none. Same family as the half-covered
emitter guard and *guarantee-satisfied-by-the-defect*, arriving through the door of
**who the guard is addressed to.**

So architect's *"nothing outward has fired"* holds **only** because the two corrupt
rows carry no `linear`/`github_issue` link — **luck, with a timer standing over it
every 1800s.** That is the strongest argument in their own escalation and they did
not have it.

### THE REPAIR CADENCE IS 360× SLOWER THAN THE FAILURE CADENCE

`reconcile()` runs every **5s**; the wedged-session mint (`:143-152`,
`WEDGED_FAILS=3` at `:84`) can only fire at the **1800s** boundary. A failed wake
redelivers immediately with **no backoff**. **Falsifying case sitting in my own
inbox:** builder-b failed at `15:07:53`, `15:08:39`, `15:09:13` carrying the
**identical** sid `03ad5f3a` each time — three failures, `WEDGED_FAILS=3`, sid
unchanged, because the mint had no boundary to fire on. Historian's *"one cadence
later"* is too generous; corrected on the bus before the phrasing hardens.

### RULED: architect's `(b)` is MINE, and they escalated the wrong half

Moving `recon.py` into `packages/swarm` is in-repo, reviewable, revertible, touches
nothing outward ⇒ **dispatched, not held in DECIDE.** It **obeys** the
do-not-edit-it-hot ruling rather than needing it reversed. Their `(c)`
("safe stopgap, costs only automatic promotion") is **not** cheaper — measured, no
env var gates `reconcile()`, so (c) needs the *same* hot edit as (a). **An
escalation that bundles a dispatchable option with an undispatchable one stalls the
dispatchable one.**

**My owed-and-unbuilt backoff and architect's `recon.py` DECIDE are ONE question,
not two:** both are live SPOFs in `~/.swarm` with no repo, no CI, no review. The
backoff rides the same migration.

### I WITHDRAW MY ORPHAN-DAEMON `blocked` — architect was right, I was inflated

```
11:52:28 daemon=1110 ce160=1018     11:53:30 daemon=1111 ce160=1017
11:52:57 daemon=1111 ce160=1017     11:53:59 daemon=1112 ce160=1017
ps -o pid,ppid,stat → ALL PPID 1, STAT SNs, ELAPSED 02:27–08:03 · maxprocperuid=4000
```

*"Growing monotonically, ceiling hours away"* was **wrong**: ~+2 per 91s ⇒ **~36
hours** of headroom. **One correction back:** it is not *flat-to-decaying* either —
`ce160` is flat, the `daemon` total creeps, so the growth is **new sessions, not the
corpse.** We each measured a cohort and generalised to the population, in opposite
directions. **Same shape, both of us.**

**Trap for whoever re-checks this:** `pgrep -laf claude | grep ce160f8f` matches
**your own shell command lines** containing the string. It returned "4 live claude
processes" and I nearly published it as a contradiction of architect. **Filter on
`[l]ive-daemon.js`.**

## 🔴 A TRADE PRESENTED AS REAL DISSOLVED WHEN ITS THIRD OPTION WAS PRICED RIGHT

Builder offered three ways to handle `3e00b4d3` (their state commit, held back off
`#685` so as not to churn a live receipt) and framed it, correctly and honestly, as
a trade whose two costs land on **different people**: the CI cost is mine, the
lost-state cost is the next builder instance's. They recommended (b) — hold, land
#685, let the commit ride the next PR. They named (c) — cherry-pick to its own
docs-only PR — but **priced it as if it inherited (a)'s ~7 minutes.**

**RULED (c), and the trade was never real.** On a **draft**, `check` is SKIPPED, so
(c) costs seconds and disturbs no receipt. **My own draft-vs-ready ruling, applied
to the commit that records it.** (c) buys full durability *now* at ~zero CI and
costs the queue nothing.

**The generalisable move: when an option is dominated, check whether it was priced
at the wrong tier before accepting the trade.** Builder's (b) reasoning was sound
about **conflict** risk (`gh pr diff 683 --name-only` really does list
`docs/state/builder.md` — I checked, their premise was true). It was answering the
wrong question: the question was **durability**, and
`git branch -r --contains 3e00b4d3` is **EMPTY** — local `fix/fel-ci-receipt` only,
one reset from gone.

**Constraint attached, measured not assumed: DO NOT READY IT UNTIL #679 LANDS.**
`plan-a.yml:477` on main makes a NON-draft whose `check` skipped a hard failure,
and #667 armed the docs-only skip — so **a docs-only PR marked ready today goes red
on `ci-ok` by construction.** #679 @ `868ac101` is that exact fix (adds `changes`
to `ci-ok`'s `needs`, exempts `CODE_RESULT=false`), green (check 02:19:46→02:25:46,
ci-ok 02:27:57), **and unlanded.** `pull_request` takes the workflow from the HEAD
branch, so branching off current main carries the pre-#679 file. **This is a second
tax the stalled queue is charging** — same shape as `red-because-an-unlanded-fix`,
but pre-emptive: an unlanded fix now constrains how new work may be opened.

### #685 `C-FEL-CI-RECEIPT` — TRUSTWORTHY, receipt re-measured, LANDABLE

```
gh pr view 685 --json headRefOid → 1a0273b7…   (builder's VOID condition did NOT fire)
check   run 30369107135  success  14:35:38Z → 14:40:29Z   (success, NOT skipped)
ci-ok   run 30369107135  success  14:42:36Z → 14:42:39Z   (same run, strictly after)
draft=false · CLEAN · MERGEABLE
```

**The negative-expiry clause paid for itself on first use.** Builder's prior
could-not-check carried *"ALSO VOID once run 30369107135 reaches a verdict"* — and
the condition, not a guess, told them when to re-look. **That is the whole
difference between a report that ages into a lie and one that ages into a
re-measurement.** Advice to the interactive orchestrator; **I do not merge from a
wake.**

### Banked FROM builder: **a retry dressed as a fallback**

They flagged `supervisor.py`'s `--resume` → `--session-id` loop from outside their
contract. **Confirmed at source this wake (`:434-442`): both arms pass the same
`sid`.** I already had this — see the wake-crash storm section below — but I had
banked only the *consequence* (*"the captured tail is always the SECOND error"*,
which is why five roles spent a day reporting `Session ID already in use`, a string
that is not the fault). **Their name for it is the better half:** *both arms share
the one input that is wedged, so the second arm cannot succeed for any reason the
first failed.* Mine explains why the evidence misleads; **theirs explains why the
code is wrong**, and it is what a reader of that function actually needs. It is the
`docs/lessons` *guarantee-satisfied-by-the-defect* shape — **defence-in-depth in
the source, none in fact.** Line numbers in my older section have MOVED; that file
is edited hot and lives in no repo. Do-not-edit-it-hot **stands**.

## 🔴🔴 THE LEDGER CAN SAY `verified` WITHOUT EVIDENCE — eighteenth wake, 2026-07-28

**Read your own contract row before you trust it.** Measured from a WAL-safe
snapshot (`VACUUM INTO`, never `cp`):

```sql
SELECT id,status,github_pr,substr(recon,1,110) FROM contract WHERE status='verified'
```

**13 rows. 11 carry a real receipt** (`merged: PR #641 @ 2e231e4c`). **TWO do
not** — `C-FEL-SCAFFOLD-PM-COMPAT` and `C-SWARM-P0`, both `github_pr = NULL`,
both with a `recon` that is **a raw transcript fragment from a different
worktree** (`cd .../aihu/zurich`, `578 tool calls in trace; 1 claims; 0
flagged`). PM-COMPAT was promoted to `verified` **in the same hour its owner was
reporting two could-not-checks and deliberately holding #684 in draft.**

**`verified` is not a neutral label.** In `packages/swarm/src/main.rs` on main:

- `:1064-1082` — `verified`/`no-claims` are *"the two statuses with EXTERNAL
  side effects"*; `verified` *"additionally mirrors outward as Done"*
- `:2289-2315` — on sync it moves the Linear issue to **Done** and **closes the
  GitHub issue**
- `:1201-1241` — a downstream contract's `needs` count as **satisfied** when the
  upstream reads `verified`, so a false one also **unblocks work that should be
  waiting**

Nothing outward fired for these two **only because they carry no
`linear`/`github_issue` link. Luck, not a guard.**

**The contrast is the finding.** The Rust `verify-merged` path is disciplined —
dry-run by default, refuses to read a failed query as "not merged", reports
could-not-check, excludes `verified` from reselection for idempotency. The
transcript-scanning path in `~/.swarm/supervisor.py` has none of it: **"0
flagged" in a trace scan became a terminal status.** This is
green-by-construction — the exact defect the session spent itself hunting in CI —
**one level up, in the ledger that audits CI.**

**Escalated as `blocked`, deliberately, and the reasoning is NOT "I am unsure".**
The fix lives in `supervisor.py`: not in any repo, no PR/review/CI, live SPOF
waking six roles. My standing do-not-edit-it-hot ruling **stands**. What changed
is the *cost of waiting* — it is no longer only wake reliability, it is a ledger
that can **close a customer-visible issue** on a trace scan of the wrong
worktree. Outward-facing and hard to reverse ⇒ DECIDE. I offered the founder a
narrower alternative I can dispatch today: **move the promotion decision INTO the
Rust binary** (in-repo, tested, already correct-postured) and leave
`supervisor.py` able only to *propose*.

**I did NOT hand-edit the status.** Only the supervisor may set it, and fixing a
correctness defect by hand-patching the ledger it corrupted is how the next
person learns the ledger is editable.

## 🔴 RULED: push freely while DRAFT, hold still once READY

Builder raised a real conflict in the standing role instructions and correctly
declined to rule on their own prompt: **durability says push the moment you have
something; receipts say a push during a run churns CI.** Both correct in
isolation; nothing reconciled them.

**The boundary is DRAFT vs READY — the boundary the machinery already draws:**

- **While draft:** push as often as you like. `check` is SKIPPED on a draft, so a
  push costs seconds and no receipt exists to disturb. Commit-early-commit-often
  applies here in full, **and this is most of the work.**
- **Once ready:** hold still. Runs are ~6 minutes and the receipt is live. Batch,
  push once, let the run reach a verdict.

**This is not a new rule — it is the same boundary as ready-then-push**, which
builder derived themselves. *Readying is the moment cheap becomes expensive and
no-receipt becomes receipt.*

### …and the premise that prompted it was false — third instance of one failure mode

Builder reported destroying three receipts on #685. Measured:

```
50c0dbd6  check run=30367626817 SUCCESS 14:17:44→14:23:48   ci-ok SUCCESS 14:25:48
753a6a43  check run=30368119800 SUCCESS 14:24:00→14:30:06   ci-ok SUCCESS 14:32:19
8253a988  check run=30368459784 SUCCESS 14:27:55→14:33:45   ci-ok pending
```

**All three runs completed; nothing was killed.** Two already carry fully
trustworthy receipts. `753a6a43` — flagged as *"orphaned, may never reach a
terminal state"* — finished cleanly.

**Three reports in two wakes, one failure mode:** *"ci-ok never posted"* → a fifth
shape; *"753a6a43 orphaned"* → a new failure mode; *"I destroyed three receipts"*
→ a self-imposed push freeze. **All three rested on an observation taken inside the
~2-minute gap between `check` finishing and `ci-ok` posting.** Not carelessness —
they measured accurately and reported without inflation. **An absence is the one
observation that looks identical whether it is true or premature**, which is why
it needs a timing precondition before it is evidence at all.

**Their instinct to stop was right and their reason was wrong.** Hold on #685
stands — not because anything was destroyed, but because ~18 minutes of CI to land
commentary on a finished PR is waste.

## 🔴🔴 A NEGATIVE MEASUREMENT EXPIRES ON ITS OWN — the "fifth shape" was FALSIFIED

Builder reported a fifth fake-green shape: *"check SUCCEEDED and ci-ok NEVER
POSTED"* on `50c0dbd6`, destroyed by their own push 12s later. **I verified it and
it is not true.**

```
check   run=30367626817  completed/success  14:17:44Z -> 14:23:48Z
ci-ok   run=30367626817  completed/success  14:25:48Z -> 14:25:52Z
```

Same run id; `ci-ok` started **after** `check` finished. **A fully trustworthy
receipt.** And the mechanism claim fails too: `ci-ok` completed at 14:25:52,
**nearly two minutes AFTER the 14:24:00 push** that supposedly superseded it — a
push did *not* kill the in-flight run's remaining jobs.

**What happened: they looked into the ~2-minute gap between `check` finishing and
`ci-ok` posting.** The gap is the norm, confirmed on two later shas mid-flight.

### The yield — my own expiry rule needed a second clause

| kind | stability | correct expiry |
|---|---|---|
| **positive** — "check succeeded on sha S" | **stable**; stays true forever, only its *relevance* lapses | *void if the head moves* |
| **negative** — "ci-ok is absent on sha S" | **NOT stable**; flips with the **passage of time alone**, nothing changing | ***void until the pipeline is known complete*** |

**They stamped the sha (right) and attached the wrong expiry — because the thing
that expired was THE ABSENCE, not the sha.** An absence is only evidence once you
can show the thing had its chance to appear.

This is `absent-value-rendered-as-real` through a door nobody had guarded: not a
zero-row SQL result, not a skipped cell, but **an observation taken too early.**
Three doors now.

**Their tool is not wrong** — *"REFUSED: no ci-ok check-run"* is a correct
**verdict at that moment**, and refusing to promote a green `check` into a receipt
is the floor working. **The tool never claimed permanence; the report did.**
*Verdict-at-an-instant vs property-of-a-sha* is the whole distance here.

**Partly disagreed with their "luck rather than foresight":** the branch covers
this because the floor is written in terms of **what must be PRESENT** (a `ci-ok`
row must exist) rather than as a list of known-bad absences. **A floor at that
granularity covers cases its author never enumerated.** Credit for the floor's
*form*, not for anticipating the case.

**Taxonomy stays at four fake-green faces + four kinds of red. Nothing added.**
Reporting it was still right — a real anomaly on the evidence they had, reported
without inflation. **Disproving it produced a better rule than confirming it
would have.**

## 🔴 PUBLISH EVERY MEASUREMENT WITH ITS EXPIRY CONDITION — the queue format changed

Builder and I crossed **three times on one PR**. Their diagnosis is better than an
apology and it is now the rule:

> *"A head sha is a moving target and a board is a snapshot… the pattern is not
> that I measured badly, it is that I reported a measurement WITHOUT ITS EXPIRY."*

**A row saying "#685 is landable" is SILENTLY wrong once the head moves. A row
saying "#685 @ `50c0dbd6` — void if `gh pr view 685 --json headRefOid` differs" is
DETECTABLY wrong, by one command, to any reader.** Same move as everything else
this session: *make the failure detectable rather than promise to be careful.*

**From now the landing queue stamps every row with the head it was measured at,
and carries the VOID rule at the top.** I have shipped at least two shelf-life
failures myself this session — a queue row and a ledger count.

### The board, stamped — measured this wake, `origin/main` = `2c3dd7fe` (unmoved since #674)

| ord | PR | head@ | why |
|---|---|---|---|
| 1 | 679 | `868ac101` | unblocks the docs-only class; only red is `bench` (outside ci-ok) |
| 2 | 671 | `0f75eff7` | **stops the FEL-411 race** — it just cost #685 a run. After #679 (both touch `plan-a.yml`) |
| 3 | 677 | `3ae3e537` | two contracts unmeasurable until it lands |
| 4 | 680 | `586c61d7` | GATE-ROUTING-CHECK needs its enumeration |
| — | 654 `517f0a8c`, 672 `c6b766ac`, 681 `a18fe0b1`, 682 `518b204d`, 683 `0c91917e` | | any order |

**#685 @ `50c0dbd6` — NOT queued, and the REASON CHANGED.** My last board said
"blocked on FEL-411 red"; that red belongs to `4112f541`, a superseded sha. On the
head that exists: `check` run `30367626817` in_progress since 14:17:44Z, `ci-ok`
**absent** ⇒ could-not-check. **Its selftest-wiring debt is cleared** —
`check:ci-receipt` in the `check:ci` chain, named `check:*` *by convention* so
#680's meta-check sees it as a gate rather than an exception, and
**mutation-checked at the CHAIN level** (predicate 3 off → `EXIT=1`; restored →
`EXIT=0`) because *the wiring is the thing that could be decorative*.

### 🔴 The ledger defect is LIVE, not historical — it grew while we discussed it

I published 26 `no-claims` / 50 claims-carrying verdicts. Historian measured
27 / 52. Re-measured: **27 rows, 27 of 27 extracting zero claims, 52 verdicts
carrying claims.** Both of us were right when we measured. **One more contract
reached a terminal status on a claim-check that has never fired, during the wake
in which we established that it has never fired.**

## 🔴🔴 A FOURTH KIND OF RED — `red-because-an-unlanded-fix`. This one is MINE.

#685 went red on head `4112f541` (run `30366941091`, `check` FAILURE
14:09:26→14:11:08, `ci-ok` FAILURE same run). **I read the failing job, not the
summary:**

```
editor:typecheck | tests/component-compile.test.ts(16,31): error TS2307:
    Cannot find module '@aihu/compiler' or its corresponding type declarations.
```

**That is `C-FEL-411` verbatim** — the editor→compiler moon-ordering race. The
commit touched **one state file**; a build-ordering race is a property of the
graph, not of that diff. And **#671 is the fix** — `gh pr diff 671 --name-only`
lists `packages/editor/moon.yml` and `packages/compiler/moon.yml`, exactly the
edge that failed. Green, MERGEABLE, **unlanded for twelve hours.**

| category | meaning | response |
|---|---|---|
| red-because-broken | the diff is bad | investigate |
| red-because-dead | the lane could not produce a result | fix the lane |
| red-because-cancelled | never reached a verdict | re-run |
| **red-because-an-unlanded-fix** | **known, fixed, reviewed, green, unmerged** | **LAND IT** |

**A stalled queue does not just delay work — it lets a solved problem keep
charging rent, and manufactures red that every reader re-triages from scratch.**
Same noise-over-signal defect #670 was written to fix, arriving from the merge
queue instead of the gate. **#671 promoted to second in the landing order on this
evidence.**

### 🔴 I published a wrong queue row — #685 is NOT landable

I listed it last wake. Its head then moved to `4112f541` and it is BLOCKED. It
re-enters after a re-run or after #671 lands, **and it still owes wiring its
`--selftest` into `check:ci`.** Builder flagged the head-move themselves — they
had quoted a receipt for `2ce6b408`, pushed, and reported that **their own verdict
had become a stale receipt (face 1 of the detector they had just shipped)** rather
than quietly re-measuring. Their follow-up reading (*"could-not-check, no ci-ok
yet"*) has itself since aged into wrong: `ci-ok` reported, as FAILURE.

**Banked from them — the mechanism under the push-then-ready habit:**
*"ready-then-push gives you one run; push-then-ready gives you two and the earlier
one lies."* **Readying is itself a workflow event**, so the ordering question is
only ever *which sequence creates a second run.* I had been carrying the habit
without the mechanism.

## 🔴 A SECOND ORCHESTRATOR INSTANCE IS ACTIVE — confirmed, not suspected

builder-b acknowledged a stand-down on `C-FEL-CE-TAGS`, **a contract from no wake
of mine.** The bus shows why:

```
14:02:36  orchestrator -> builder-b  [dispatch]  C-FEL-CE-TAGS
14:03:15  orchestrator -> builder-b  [note]      STAND DOWN — running it through direct subagents
```

The **interactive** orchestrator, working with the founder. Legitimate — not a
spoof, not a lost contract. **Consequences:** a message signed `orchestrator` may
come from either instance, so a role seeing a dispatch that contradicts a ruling
should say so on the bus rather than pick one. And this is **exactly why I do not
merge from a wake** — the queue I publish is *advice to them*, never an action I
take. Do not re-dispatch `C-FEL-CE-TAGS`.

## Rulings — twenty-second wake (2026-07-28)

### `C-SWARM-RECON-AUTHORITY` — architect CONTINUES; R3 corrected and RE-SEQUENCED

Architect asked whether to hand #686 to a Rust builder. **Ruled: continue.**
Their load-bearing discovery — `supervisor.py` writes `verified` through
`swarm-bus setstatus --reconciled`, so **the Rust binary is already in the write
path** and the propose-only boundary needs no new IPC — I verified at source
(`main.rs:1064-1085`; `--reconciled` is a flag-**presence** check whose own
comment says it *"prevents mistakes and habit, not malice"*). That insight is the
shape of the fix; a handoff costs a re-derivation **on the one contract whose
subject is a mechanism certifying work nobody checked**. Seam closed instead by
dispatching **verifier** to drive the three must-fail rows independently once
#686 is green.

#### 🔴 Their R3 is wrong — and my bar is what they mis-mapped

They wrote *"no-claims stays writable (internal-only, no outward mirror)"*.

- **"Internal-only" understates it:** `no-claims` satisfies a downstream `need`
  exactly as `verified` does (`cmd_ready`, `:1199-1245`), and `main.rs:1082` says
  it is *"equally not a status any agent may assert about its own work."*
- **My must-fail row 3 targeted the `no-claims` branch specifically.** They read
  it as *"do not break no-claims"*; it was *"make `no-claims` honest."*

**But their ACTION is right and their reasoning is not** — and the re-sequencing
is mine to make. A guard refusing `no-claims` wherever the verdict carries claims
would, with **50** such verdicts, push those contracts to `unverified`, which does
**not** satisfy needs — **a DAG stall, the exact trade I refused when I reversed
their demotion-first sequencing.**

| step | what | where |
|---|---|---|
| 1 — now, #686 | R1 + R2 only: tighten `verified`, repo-qualify links | architect |
| 2 | the extractor actually consuming the **structured `claims` column** | recon.py + supervisor.py boundary |
| 3 | the `no-claims` guard — **with or after** step 2, never before | — |

**Row 3 is re-sequenced, not dropped and not met.** Recorded so nobody later
reads #686 as having satisfied it.

**R2's safe default is the part to keep:** an unknown repo is **REFUSED** for
auto-verify rather than defaulted to `fellwork/aihu` — **defaulting IS the
collision.** Checked that the backfill does not smuggle it back: an explicit
backfill of known-correct rows is not an implicit fallback for unknown ones.

### `C-FEL-CI-RECEIPT` (#685) ACCEPTED — and two findings bigger than the tool

I ran the selftest myself: `bun scripts/ci-receipt.ts --selftest` → **9/9**, and
re-measured the face-4 catch on `2ce6b408` from the check-runs API. **Honest
limit: I did not run it against live shas** (that call did not go through), so my
confirmation is selftest-plus-API, not an end-to-end live drive.

- **THE COLLAPSED VIEW CANNOT REPORT WHAT IT IGNORED.** `gh pr checks 682` printed
  two rows from run `30324519103` and **omitted run `30324508177` entirely** —
  not a merged verdict, a **subset with no sign a subset was taken**, while
  `mergeStateStatus` said CLEAN. I had been calling this "collapsing"; that is too
  kind.
- **THE FAKE-GREEN WINDOW HAS A SHAPE, NOT A SIZE.** 491s on #685 vs 494s on #682,
  different PRs, **within three seconds**. It runs from the draft `ci-ok` to the
  real one, so **it is as wide as the build it is lying about** — the slower the
  build, the longer the lie.

**Selftest placement ruled:** keep it **in the script** — *a sha is not a
fixture*; #672's cancelled run is already gone and a test file would tempt the
next person to point cases at live shas, which rot silently toward passing. **And
wire it** into `check:ci` via package.json (one row of surface granted): a
selftest nothing runs is a test that cannot fail, and once #680 lands its
gate-wiring meta-check flags an unreachable `check:*` as an orphan anyway.

### `C-FEL-434b` (#683) — verifier's independent PASS accepted

Drove it on **their own inputs and their own scope string** (`billing:write`), so
"scope absent from llms.txt" cannot be a fixture artifact, and asserted the
sidecar **contains** the scope first so the absence half is not vacuous. Then
**mutated the fix** — reverted `main.rs:568` to the fixed filename, watched two
components collapse to one manifest and ROW2 to `tags=[]`, restored, 13/13.
*"The tests pass"* vs *"the fix is load-bearing"*. They also named their own
first-run red as **theirs** (a stale `target/release` binary from their #668
build) rather than letting it hide behind the diff — the `AIHU_COMPILE_BIN` trap,
reproduced by accident and reported as the BEFORE direction. **Citing no CI tick
was correct**: CI runs the published napi addon and would not have seen the fix.

### Historian's "NOT selection" framing — SUPERSEDED (crossed, not careless)

Their *reasoning* is right (a selection-only fix leaves C-SWARM-P0 broken); the
conclusion is too strong. **It is generation AND selection AND the claims column
never being read** — the last being the one that means the control has never
fired. Told them to re-correct before the telling hardens.

### 🔴🔴🔴 THE TRACE RECONCILE HAS NEVER ONCE CHECKED A CLAIM — 26 of 26

Historian read their own row (I had asked all roles to), found a **weak** signal
and reported it anyway. It was the systemic defect; my two loud rows were the
anomalies.

```sql
SELECT count(*) FROM contract WHERE status='no-claims' AND recon NOT LIKE '%0 claims%';  -- 0
SELECT count(*) FROM msg WHERE kind='verdict' AND claims IS NOT NULL AND claims != '';   -- 50
```

**All 26 `no-claims` rows carry the identical recon** — *"N tool calls in trace;
0 claims; 0 flagged. (no completed-action claims extracted from the message)"* —
across traces from 24 to 558 tool calls. **Zero exceptions.** Meanwhile 50
verdicts carry a populated structured `claims` column.

**Mechanism, read in both files:**

- `supervisor.py:686` — `SELECT body FROM msg …` — **selects `body` only; the
  `claims` column is never read.**
- `recon.py:95-104` — `CLAIM_PATTERNS` are six English first-person prose
  regexes: `\bI\s+(?:filed|opened|created)\s+([A-Z]{2,}-\d+)`, `\bI\s+pushed\b`,
  `` \bI\s+ran\s+`…` ``, `\bI\s+wrote\b`, …

**The bus MANDATES `--claims 'pushed:PR#N,ran:cargo test'` — a machine format the
reconciler never reads, and could not parse if it did** (`pushed:PR#679@868ac101`
never matches a regex requiring the literal words *"I pushed"*).

**So the control CLAUDE.md describes as the thing agents may not do for
themselves has never fired.** Total output of the trace path: **26 vacuous passes
+ 2 false positives.** And `no-claims` is terminal and satisfies a downstream
`need` exactly as `verified` does — **26 rows unblocked downstream work on a check
that structurally could not run.**

**Same fault line as the claim-verb enum** (#662 rejected 5 of 6 real verbs,
replaced by #664, my standing note that *the spec is what is wrong*) — but **do
not confuse them**: that ruling stands and is not being re-litigated. This is one
layer down: **the consumer never reads the field at all.**

**Bound into `C-SWARM-RECON-AUTHORITY` as must-fail row 3** — sent as a message,
**not a re-offer**, because architect has CLAIMED it and re-offering resets a
claimed bar (the `C-FEL-READMESYNC-JOB` precedent). `no-claims` must be
unreachable when the latest verdict's `claims` column is non-empty, **and still
reachable when it is genuinely empty** — so the fix cannot be "never emit
`no-claims`".

**Healing scope amended: 26 unchecked + 2 false, and DO NOT MASS-REVERT.** Most
of the 26 correspond to genuinely completed work with merged PRs. They are not
*wrong*, they are *unchecked*. **`no-claims` currently means "we did not check",
not "there was nothing to check."**

### 🔴🔴 I WAS WRONG ABOUT `supervisor.py` TWICE — because I never opened it

**Read the file before characterising it to the founder.** I sent two escalation
messages describing `supervisor.py`'s reconcile as a guarantee-free heuristic. I
finally read it this wake:

- **It already has could-not-check posture.** `:690` no transcript or verdict →
  `unverified`, *"not calling it done"*. `:716` a claim with no backing tool call
  → `DISPUTED`. `:731` `recon.py` non-zero → `unverified`. `:707` deliberately
  splits exit-0-vacuous (`no-claims`) from exit-0-grounded (`verified`), with a
  comment that collapsing them would be *"the panel overselling"*.
- **The real defect is TRANSCRIPT SELECTION BY ROLE** (`:681-687`):
  ```python
  subs  = SELECT id,owner FROM contract WHERE status='submitted'
  entry = reg.get(owner)      # the ROLE registry
  tr    = _transcript(entry)  # the ROLE's CURRENT session
  ```
  The trace is chosen by **who owns** the contract, never by **which contract**.
  Correct exactly while that role is still sitting on it; wrong the moment they
  move on. **This explains both corrupt rows:** builder-b had moved on (picked up
  an `aihu/zurich` compiler session); architect had not (picked up their own
  agent-swarm work).
- `:695` `detail = (r.stdout or r.stderr)...[:300]` — the `recon` field is a raw
  300-char truncation of `recon.py`'s stdout. **The "corrupt recon" is `recon.py`
  being chatty, not a corruption event.**

**This also corrects architect's correction of me.** They reported the reconciler
read the *right* trace and concluded *"selection was never the load-bearing
step."* True as an observation — the mechanism shows it was **luck**. **Selection
IS load-bearing.** Neither of us had it until the file was read.

**The shape of my error is the shape of the defect I was reporting:** I certified
a characterisation I had not observed, on an escalation about a mechanism
certifying things it had not observed.

### 🔴 CORRECTION to that escalation — and a cross-repo trap my own escalation baits

Architect supplied the true provenance for `C-SWARM-P0` and **one clause of what
I sent the founder was wrong.** I said the recon was *"a transcript fragment from
a DIFFERENT worktree"*, implying the reconciler scanned an **unrelated** trace.
For C-SWARM-P0 it did not: the trace was **architect's own work** in
`agent-swarm/sydney` (commit `592e6e8`, `phase0/recon.py`, 229 lines). **The
reconciler read the RIGHT trace and still produced garbage recon + a premature
terminal status.**

**That is worse, not smaller.** If the failure were trace *selection*, picking the
right trace would fix it. It is not — selection was never the load-bearing step.
The surviving claim is unchanged and is the one that matters: **two contracts
reached a terminal status with no merged-PR evidence and a `recon` that is not a
recon.**

#### DO NOT "FIX" THE MISSING LINK ON `C-SWARM-P0` — measured, not hypothetical

Reading *"no PR link"*, the helpful move is to attach one. Architect published the
correct provenance as *"agent-swarm #1"*. Write that as a bare integer and:

```
gh pr view 1 --repo srmcguirt/agent-swarm  → #1 state=OPEN   mergedAt=null
gh pr view 1 --repo fellwork/aihu          → #1 state=MERGED mergedAt=2026-04-26T22:18:56Z
                                             "Plan A Phase 1: workspace scaffolding"
```

`gh_pr_view` (`packages/swarm/src/main.rs:1683-1694`) hardcodes
`--repo GITHUB_REPO`. So `--github-pr 1` would make `verify-merged` read a
three-month-old merged scaffolding PR, find it genuinely merged, and promote
C-SWARM-P0 to `verified` with a recon **in exactly the format the 11 legitimate
rows use** — a false receipt indistinguishable from a real one by inspection.
**The empty `github_pr` is the only thing preventing it, and it prevents it by
accident.**

**The underlying defect:** `contract.github_pr` is a bare integer with no repo,
while this swarm demonstrably runs contracts in more than one repository. **A
cross-repo contract cannot be linked correctly today — only wrongly or not at
all.** Architect chose not-at-all, which was right, and declined to mutate their
own row. Added as a second requirement on the reconcile fix.

### RULED: Option B — `C-SWARM-RECON-AUTHORITY` dispatched to architect

**The escalation narrows; it does not resolve.** Architect sent a well-reasoned
*"ARCHITECT RULING: Option B"* on an escalation sitting in DECIDE. Architect does
not rule an escalation — **but I made that easy** by escalating a question that
was half mine already. B was always my call; I said so in the escalation itself.
**Only A — pausing the swarm — needs the founder.** Clean statement: *their
analysis decided it, my authority dispatched it.* The remaining founder question
is the `supervisor.py` hot edit **alone**, and since that is step two, **nothing
is idle waiting for it.**

#### 🔴 Their fail-closed sequencing is WRONG — and I measured it rather than arguing

They recommended the demotion land *"first-or-with"* the Rust path: if nothing
auto-promotes, contracts hold at submitted/building — *"fail-closed, strictly
better."* Measured:

| fact | source |
|---|---|
| a need is satisfied ONLY by `verified` or `no-claims` | `main.rs:1199-1245` |
| `st = "no-claims" if vacuous else "verified"` — the **only** writer of `no-claims` | `supervisor.py:707` |
| 26 `no-claims` + 13 `verified` = 39 terminal rows | `bus.db` |
| `verify-merged` writes only `verified`, only from a merged fellwork/aihu PR | `main.rs` |
| **9 contracts currently declare `needs`** | `bus.db` |

**Demote first and every contract whose work legitimately produces no merged PR —
spec-only, docs-only, every vacuous pass — can never satisfy a downstream need.
That is not fail-closed, it is a DAG stall.** Their instinct about the
*direction* of the error was right; the blast radius was invisible without the
`no-claims` count. **RULED: the Rust path lands FIRST, the demotion follows.**
Their capability-removal-is-the-safest-edit argument stands — it applies to step
two.

**Amendment to their heal bar:** if the true evidence is no longer recoverable
(and for a role-scoped transcript that has since rolled, it may not be), the
honest landing place is **could-not-check/unverified, not a reconstructed true
status.** A heal that invents a status to look complete is the same defect one
level up.

**INTERIM GUARD, adopted from architect and binding on everyone:** do **not** run
`sync --push` against any `verified` row whose `recon` is not a real same-repo
receipt. Trip wire: if any `verified` contract *gains* an external link before
the fix lands, treat it as urgent.

## 🔴 A FOURTH FACE OF THE FAKE GREEN — and the workflow already documented it

builder-b found it on #682; I re-measured on head `518b204d`:

```
run 30324508177 (draft-time)  changes SKIPPED  check SKIPPED  ci-ok completed/SUCCESS 02:56:27Z
run 30324519103 (ready)       check success 02:56:40→03:02:26  ci-ok success  03:04:39Z
```

**Eight minutes of a green `ci-ok` certifying a pipeline in which even `changes`
had skipped.** The four faces now:

| face | PR | signature |
|---|---|---|
| stale-green | #680 | cheap run posts green before the real run finishes |
| green-beside-in_progress | #681 | `ci-ok success` next to `check in_progress` |
| red-because-cancelled | #672 | concurrency cancels `check`; ci-ok fails closed (**correct**) |
| **draft-gated green** | #682 | a draft-time run posts green with the whole pipeline skipped |

**THE CORRECTION, and it makes this worse rather than novel:** `plan-a.yml`
**:358-377 already documents this by name** — *"on #622 and #624 the SAME commit
carried two green `ci-ok` runs"*, *"a draft's green is indistinguishable from a
real one in `gh pr checks`"*. That header still says **"Only the draft case is
refused"**, which was true before #670 and is **false now** (`:472` warns and
passes). **The workflow's policy comment contradicts its own code, and the hazard
the comment exists to describe has been re-enabled underneath it.**

**#670 is NOT reversed** — its reasoning is this session's own (red must mean
broken). What #682 falsifies is only #670's claim that *"the stale-green window
is closed by that trigger"*: **the window is eight minutes wide, and during it the
PR is non-draft and reads green.**

**RULING: do not touch `ci-ok`.** Sole required context on main; re-concluding it
is the highest-stakes line in the repo, and a `skipped` required job is counted
as **passing** by branch protection — so the obvious `if: !draft` "fix" opens the
hole it looks like it closes. Fix it where it is safe: **`C-FEL-CI-RECEIPT`**
(builder, claimed) — a **read-only** tool over the check-runs API applying the
three predicates, with all four faces as ready-made fixtures. **Prose everyone
must remember has now failed four times; promote the rung.** The stale header
comment gets corrected in whatever PR next touches that block — *not its own PR*.

## The ruling builder-b was blocked on: NEITHER wait NOR stack — measure on a scratch branch

**Q:** *"#684 needs #677 landed. Wait, or stack #684 on #677?"*

**Verified before ruling, not taken from the report:**

```
git diff --name-only a3cc4fc5 a5d713c9 -- packages/cli packages/templates   → EMPTY
comm -12 <(files in #684) <(files in #677)                                  → EMPTY
```

So the measured tree still equals #684's head, **and the two PRs touch zero files
in common** — a combined tree cannot confound attribution.

**Ruled:** push a throwaway `measure/pm-compat-on-677`, `workflow_dispatch` the
matrix at it (both prior runs were already `workflow_dispatch` against a non-PR
branch, so this costs one push), report it as a **PRE-MERGE MEASUREMENT** naming
both parent shas, delete the branch after.

### 🔴 The distinction — they had the right instinct on the wrong noun

They wrote *"I did not stack to get a green — that would have bought a number,
not a fact."* Correct, and the reason is precise:

- **Stacking to inherit a VERDICT is illegitimate** — `ci-ok` would certify a
  tree that is not the merge candidate.
- **Combining to obtain a MEASUREMENT that is otherwise unobtainable is
  legitimate**, provided the combined tree is disclosed and the surface is proven
  identical. A matrix run is an **instrument reading, not a gate verdict.**

**Refusing to take a reading you can take is not rigour, it is less information.**
The acceptance bar is unchanged: PM-COMPAT stays PARTIALLY VERIFIED and #684
stays draft until a matrix run measures npm/pnpm/cf-team from a tree based on
**landed** main.

### The measured fact that inverts how the matrix grid reads

**A green `bun` cell is nearly evidence-free; a green `yarn` cell is worth more
than three green ones elsewhere.** npm7+/pnpm/bun all auto-install peers and bun
blocks the same lifecycle scripts pnpm blocks but *silently* — so **the 4 yarn
failures were the only honest signal in a 20-cell grid** and three package
managers were papering over a real defect. Corollary handed to builder-b: when
the scratch run returns, **a green npm/pnpm column does NOT confirm the peer
fix** — those columns can only confirm the workspace-range and
`onlyBuiltDependencies` fixes.

**My `@aihu/store` correction was right but incomplete, twice over** — it is a
**transitive peer closure** (`@aihu/app`, `@aihu/runtime`, `@aihu/arbor` all
declare zero dependencies and express every edge as a peer), so fixing one list
just relocates the error. And their first closure guard **covered one of two
emitters and passed green while two templates shipped the identical defect** —
*a guard covering half the emitters is worse than none, because it reads as
coverage.*

### Filed from their split-out, scope ruling UPHELD

`C-FEL-SCAFFOLD-CFTEAM-TYPECHECK` (moon diffs against `main` in a fresh
`git init` → exit 128) and `C-FEL-SCAFFOLD-DEV-PORT` (harness `--port` lands on
`concurrently`, never reaches vite; fails on bun too, so not PM-compat). Both
carry an **anti-vacuity must-fail** — a typecheck that exits 0 by not
type-checking, or a dev cell that passes by not starting the app, is a FAIL.

## Accepted this wake — receipts re-measured, not taken

- **#677 `C-FEL-MATRIX-PROTO` — LANDABLE.** `check`+`ci-ok` both run
  `30322552876`, ci-ok `02:49:23Z` after check ended `02:47:02Z`. Only red is
  `matrix` on a **different run id** (`30322552896`), outside `ci-ok`, and it **is
  the acceptance measurement** (6/20). **On the critical path for two contracts.**
- **#682 `C-SWARM-DEPLOY-GAP` — ACCEPTED.** Verified `export` really is at
  `main.rs:2776` on main (so the must-fail probe is a real gap), and the diff is
  exactly the declared surface. **Copy the restraint:** it stays silent outside a
  checkout, on a non-ancestor build sha, and for commits outside
  `packages/swarm`. Confirmed from outside — `swarm-bus --version` here reports
  `518b204d` and correctly says *nothing* about staleness, since that sha is not
  an ancestor of this HEAD.
- **#683 `C-FEL-434b` — ACCEPTED.** Receipt re-measured on `0c91917e` (run
  `30334106229`, ci-ok `06:22:06Z` after check ended `06:19:56Z`). Per-tag
  filenames are right **because the build enforces them by construction — the
  filename IS the tag**, so must_fail row 2 cannot regress silently. Allowlist
  over deny-list on policy containment: **a policy field added later cannot leak,
  because it was never opted in.** Their row-1 correction was against their own
  earlier read — `$scope` *derives* a hard tier, so the old fixture was wrong,
  not the row.
- **#681 `C-FEL-DEPCHECK-COMMENTS` — receipt confirmed** on `a18fe0b1` (run
  `30324202213`, ci-ok `02:57:20Z` after check ended `02:55:22Z`).

**The same-run rule went three-for-three today** — builder applied it to #681 and
#683 *before* claiming, builder-b applied it to #682 and **found a face I had not
named.** That is the rule working: agents catching it before I do.

## 🔴 NINE PRs ARE LANDABLE AND NOTHING IS LANDING — the queue, with receipts

`origin/main` is `2c3dd7fe`, **unchanged since #674**, re-fetched at the top of
this wake (I have reported a stalled queue that had already moved; do not repeat
a number, re-measure it). Every row measured with
`gh api repos/fellwork/aihu/commits/<FULL-SHA>/check-runs` — **not** `gh pr
checks`, which collapses concurrent runs and would have reported three of these
wrongly.

| PR | head | check+ci-ok run | ci-ok after check ends | remaining red |
|----|------|-----------------|------------------------|---------------|
| 654 | `517f0a8c` | 30323441407 | 02:41:32Z after 02:39:28Z | none |
| 671 | `0f75eff7` | 30321535839 | 02:01:45Z after 01:59:26Z | bench, matrix — outside ci-ok |
| 672 | `c6b766ac` | 30324550909 | 03:05:43Z after 03:03:25Z | none |
| 677 | `3ae3e537` | 30322552876 | 02:49:23Z after 02:47:02Z | matrix — **is** its own measurement |
| 679 | `868ac101` | 30322783137 | 02:27:57Z after 02:25:46Z | bench — red by construction |
| 680 | `586c61d7` | 30323361044 | 02:40:06Z after 02:37:53Z | none |
| 681 | `a18fe0b1` | 30324202213 | 02:57:20Z after 02:55:22Z | none |
| 682 | `518b204d` | 30324519103 | 03:04:39Z after 03:02:26Z | none |
| 683 | `0c91917e` | 30334106229 | 06:22:06Z after 06:19:56Z | none |

**Not one is red-because-broken.** Every remaining red is a lane outside `ci-ok`.

**Order — the first three are dependency, not preference:**

1. **#679** — unblocks the whole docs-only class (#669, #676, #675, #678, #665),
   all of which must **rebase** after it lands (`pull_request` runs take the
   workflow from the HEAD branch).
2. **#677** — two contracts cannot be measured at all until it lands.
3. **#680** — `C-FEL-GATE-ROUTING-CHECK` must reuse its gate enumeration.
4. then #654, #671, #672, #681, #682, #683, any order.

**One collision, measured:** only #671 and #679 touch `plan-a.yml`. The other
seven do not touch it at all. The #666-before-#671 prerequisite is **satisfied**.

### #671 is the #670 transition hazard made live

Its sha carries **two** `ci-ok` results:

```
run 30319401438  (01:08Z, BEFORE #670 merged 01:12Z)  check SKIPPED  ci-ok FAILURE
run 30321535839  (01:53Z, after)                      check success  ci-ok SUCCESS
```

Both on `0f75eff7`; a reader can pick either. The red is the **retired**
pre-#670 draft behaviour. This is why the rule is *name the run and its
timestamp*.

## Where main actually is

```
origin/main  2c3dd7fe   (fetched 2026-07-28, eighteenth wake — UNCHANGED since #674)
origin/main  b667bdcd   (fetched 2026-07-28, fifteenth wake)
```

### The land-set LANDED — the queue that "stalled at 01:12Z" is moving again

Six PRs merged 01:45–01:46Z while I was reporting the queue stuck. **Verified
with `gh pr view <n> --json state,mergedAt`, not from a report:**

| PR | merged | what it closes |
|----|--------|----------------|
| #656 | 01:45:55Z | externalize `node:` builtins by pattern (FEL-EXTERNALS) |
| #659 | 01:46:01Z | **verifier Round 3 durable state** |
| #666 | 01:46:19Z | moon tasks launch via `bunx` (FEL-MOON-ROLLDOWN) |
| #667 | 01:46:25Z | paths-filter `code` gate actually discriminates (FEL-433) |
| #668 | 01:46:30Z | agent manifest sidecar on client builds (FEL-434) |
| #673 | 01:46:38Z | sync-readme own job + lazy rolldown |

**Still open** (states read 2026-07-28, and they move — re-read before acting):
#654, #665 (mine, draft), #669, #671, #672, #674, #675, #676, #677, #678.

- **READY (not draft):** #669, #676, #671 `@0f75eff7`, #674 `@dfbcc456`, #677
  `@d2e32218`. **DRAFT:** #678 `@0a50c06c` (builder-b state), #665, #672, #675.
- **#677** — `MERGEABLE/UNSTABLE`; the failing check is `matrix`, which is **not
  required**. Do NOT land it: its own acceptance run failed (see the
  MATRIX-PROTO ruling above).
- **#671 / #674** — behind main by 12 and 8 commits, but `strict: false`, so
  behind-ness does not block.
- **#666 merged at `70775ea9`** — the #671 landing-order constraint I ruled is
  **SATISFIED**, not pending.

- **#676** (new) — historian's split-out of the triage-queue correction. ONE
  file, `docs/lessons/triage-queue-mixed-products.md`, off current main,
  `MERGEABLE/CLEAN`. This is the fast path for the **live falsehood on main**:
  that lessons file still says "ROUTING STILL PENDING / founder business fact",
  which I withdrew after one GraphQL query showed Linear team FEL already
  separates `aihu|data|web`. **A lessons file that is wrong about the lesson is
  worse than none.**
- **#669** — rebased onto `b667bdcd` @ `a1b155dc`, now `MERGEABLE/CLEAN`
  (historian reported BLOCKED; it reads CLEAN — better than claimed). Carries
  byte-identical triage content to #676 (both from `c299fc02`), so **whichever
  lands second is a no-op, not a conflict.**

- **#671** — `mergeable=MERGEABLE`, `state=BLOCKED`. **BLOCKED is the draft
  guard, not the diff:** draft ⇒ `check=SKIPPED` ⇒ `ci-ok` cannot go green ⇒
  branch protection reports BLOCKED. Its prerequisite cleared — I had ruled
  #666 must land first, and #666 merged. It needs marking ready, not fixing.
- **#674, #675, #665** — `mergeable=MERGEABLE`, `state=CLEAN`.

**The standing "do not treat `check` as evidence" caveat STAYS** — it retires
when #671 lands, and #671 has not landed.

### 🔴 The lesson under this: I reported a stalled queue that had already moved

For several wakes I carried "the merge queue stalled at 01:12Z" as current
fact. It was true when written and false by the time I repeated it. **I had
`gh` available the whole time and did not spend one call re-checking before
re-asserting.** Same class as the stale `bus.db` md5 and the retired
draft-guard rule: a measurement quoted past its shelf life, asserted with the
confidence of the moment it was taken. **Re-measure board state at the top of
every wake. `origin/main` moved twice in one session.**

### 🔴 A DRAFT NO LONGER FAILS `ci-ok` — #670, merged 01:12Z

**My standing triage rule is SUPERSEDED.** For six wakes I told every agent that
*"a draft showing `check=SKIPPED` + `ci-ok=FAILURE` is the FEL-437 guard doing
its job, not a defect."* On main, a draft now emits a **`::warning::`** —
visible, explicitly "NOT evidence of a pass", not a failure.

**New rule: on a run produced AFTER 01:12Z, a red `ci-ok` on a draft means
something REAL.** Triage it.

**Transition hazard:** runs predating #670 still show the old FAILURE, so a
draft red is ambiguous for a while — retired-behaviour-on-a-stale-run, or a real
failure. **Name which run you read, with its timestamp.** A conclusion drawn
from a run whose behaviour has since changed is a stale receipt — the same class
as the `bus.db` md5.

#670's reasoning is this session's own: *"the board fills with red that means
unfinished, genuine failures hide among them, and everyone learns to ignore red.
Red must mean this is broken."* Same noise-over-signal defect as the dead matrix
lane and the flapping check.

**MERGED since the ninth wake:** #655 (slot fallback), **#657 (the retro — the
session's lessons are on main, not in a draft)**, #660, #670.

### Open PRs — verified 2026-07-27 via `gh pr list --state open`

| PR | state | note |
|---|---|---|
| **664** | READY, MERGEABLE | *(merged during this wake — became `edba0c5a`)* |
| **663** | DRAFT | FEL-431 cf-team `.moon` workspace. Honest could-not-check split: `moon` now resolves+runs, but typecheck-exit-0 needs the real `create-aihu` pipeline. Leave draft. |
| **661** | DRAFT | FEL-461 swarm SKILL.md `$S` → shell function. Evidence exists; needs a ready transition. |
| **660** | READY | `docs/state/builder-b.md`. |
| **659** | DRAFT | `docs/state/verifier.md` Round 3. |
| **657** | DRAFT | retro — 8 incidents with promotion rungs. |
| **656** | DRAFT | FEL-EXTERNALS `/^node:/` in cli/app/adapter-vercel. **Ruled: mark ready** — a draft builds nothing, so its own acceptance is unobtainable. |
| **655** | READY, MERGEABLE, **ci-ok green** | FEL-GH478 `<$slot>` fallback. Verified PASS both directions by verifier from a clean source-built compiler. Ready to land. |
| **654** | DRAFT | GH-503 `__aihu_each` non-iterables. Premise correction inside: the TS18046 the contract demanded does not exist on main (fixed by #505). |
| **666** | DRAFT | FEL-MOON-ROLLDOWN — `bunx` prefix on every bare `.bin` command across 6 `moon.yml`. **Accepted**; mark ready. Cold-cache proof + `dist` sha256 byte-identical to `bun run build`. |
| **668** | DRAFT | **FEL-434 compiler half** (closes FEL-423). Three files; the whole change is deleting `if elide_agent { String::new() }` at `emit.rs:398`. Accepted; mark ready. |
| **667** | DRAFT | **FEL-433, the paired filter fix — highest-stakes diff on the board**, it changes what CI runs on every PR. `code` split to its own step with `predicate-quantifier: every`; blanket `!**/*.md` → targeted doc-md exclusions so `skills/aihu/**.md` stays code. Mark ready; verifier dispatched. |

**A draft showing `check=SKIPPED` + `ci-ok=FAILURE` is the FEL-437 guard doing
its job, not a defect** — a draft built and tested nothing. Do not re-triage it;
rule "mark ready" and move on. As of the sixth wake **#656, #657, #667 and #668
are all READY** with runs in flight; `check` is *running* (not skipped) on
#667's ready run, which is the live confirmation that its own filter fix is not
inverted — corroboration, not proof; the matcher is the verdict.

Merged this session: **#639** (FEL-439 docs), **#640** (FEL-440 registration as
codegen input), **#641** (FEL-441 ref/onMount order), **#653**, **#658**
(CLAUDE.md), **#664**.

## 🔴 THE WAKE-CRASH STORM — the error every role reports is a MASK

Every role (builder, builder-b, verifier, architect, historian, **and me**)
reported `Error: Session ID <uuid> is already in use`, at delivery attempts
climbing past 35. **That string is not the fault.** It is the *fallback's*
error, and the real failure is never in the payload.

**Mechanism** — `~/.swarm/supervisor.py`, `wake()`, the flag loop at ~`:320-330`:

```python
for flag in ("--resume", "--session-id"):
    rc, tail, ... = _run_streaming(["claude", flag, sid, "-p", prompt, ...])
    if rc == 0 or idle_k or hard_k: break
    if flag == "--resume": log(f"{role}: --resume failed, creating session")
```

`--resume` is tried first. When it fails, the fallback runs `--session-id` with
**the same id** — but `--session-id` *creates* a session at a given id, so
against an id that already exists on disk it *always* fails with "already in
use". **The captured tail is therefore always the second error, never the
first.** Roles have been dutifully reporting a symptom of the retry path.

**Evidence** (`~/.swarm/supervisor.log`, real lines):

- Every `WAKE FAILED` is immediately preceded by a resume-failure. `:2004`
  `builder-b: --resume failed, creating session` → `:2005` `builder-b: WAKE
  FAILED exit=1 after 28s`. Same pairing at `:2006/:2010` orchestrator,
  `:2007/:2009` builder, `:2012/:2015` historian, `:2014/:2016` verifier,
  `:2017/:2018` architect.
- The **earliest** instance still carried the reason: `:4` `[21:35:44] builder:
  --resume failed (No conversation found with session ID: ff05b6ba-…), creating
  session`. Later lines dropped the parenthetical — which is exactly why the
  storm *looks* uniform when the underlying causes may not be.

**It was never a dead swarm.** Measured, not assumed:

- `grep -c "woke, worked"` = **409** clean wakes vs `grep -c "resume failed"` =
  **222**. Bursty, not a flatline.
- `:2061` `architect: woke, worked 138s` and `:2067` `verifier: woke, worked
  170s` both **succeeded** at 21:46–21:47, right after a burst.
- `ps` showed pid 36888 (builder) and 37077 (historian) alive, both children of
  the **one** supervisor pid 49751. **Exactly one supervisor — not the twin
  hazard.** I checked that before blaming it.

**Why it sustains itself:** a failed wake is deliberately NOT acked so the
message redelivers (`:339`) — correct design, *but there is no backoff on that
path*. A transient resume failure redelivers immediately, five roles retry at
once, the concurrency spike produces more resume failures. 2000+ supervisor.log
lines in ~8 minutes. **The retry counter measures the loop, not the difficulty
of the work** — three messages hit attempt 35 while already being done.

**My own failure here is the expensive part.** I answered *many* wakes of this
storm with "No response requested." I treated a five-role outage as noise
because it arrived *looking* like noise — repetitive, identical, self-similar.
It took one `ps` and one `grep` to find the cause. **Volume is not noise. A
message repeated 35 times is 35 pieces of evidence that something is not
being handled, and the something was me.**

**Owed, unbuilt (mine):** (a) exponential backoff on the not-acked redelivery
path; (b) surface the *first* attempt's error instead of the fallback's — the
`(No conversation found…)` format at `:4` already exists and should be what
reaches the bus; (c) the fallback should not reuse the same sid.

**RULING — do NOT dispatch this fix from a wake. Deliberate, not an oversight.**
Three reasons, and the next instance should not quietly reverse them:

1. `~/.swarm/supervisor.py` is **not in this repo** and not in any repo. A
   builder editing it produces no PR, no review, no CI, and no durable record —
   every guarantee this swarm runs on is absent for that one file. It is the
   least-reviewed file in the system and the one every role depends on.
2. It is the **live single point of failure**. Editing it while it is actively
   waking six roles is the hard-to-reverse category: a bad edit does not fail
   one contract, it stops all coordination and takes out the channel you would
   use to report that it broke.
3. **The storm is already subsiding on its own** (`:2061`, `:2067` — architect
   and verifier both woke clean; builder and historian are running now). The
   urgency that would justify accepting 1 and 2 is not there.

**The fix is right and should be built — under review, against a stopped or
spare supervisor, not hot.** Sequencing it is a founder call, because it means
pausing the swarm: that is priority resting on a business fact (how long
coordination can be down) that I do not have. Left in DECIDE deliberately —
**not** because the technical question is unresolved. It is resolved; only the
window is not mine to pick.

## 🔴 THE CONTRACT ROW IS THE DURABLE DISPATCH — a spec that is only a message is one window from gone

Builder reported `C-FEL-428` as **"ready to build, but the dispatch is LOST"** —
not in the bus window, not in their inbox, aged out during the resume storm.

**It was never lost. The contract ROW had the full surface and both bars the
whole time.** Only the *message* aged out. I recovered it verbatim:

```bash
sqlite3 'file:~/.swarm/bus.db?mode=ro' "VACUUM INTO '/tmp/snap.db'"   # WAL-safe
sqlite3 -line /tmp/snap.db "SELECT * FROM contract WHERE id='C-FEL-428'"
```

**Stop treating the dispatch message as the artifact.** The row is the record;
the message is a notification about the row. Every spec I have written into a
message body and not into `--surface/--must-pass/--must-fail` is one delivery
window from unrecoverable.

**Tooling gap:** `swarm-bus` has no `show --id <contract>` — the usage line is
`send|pull|offer|claim|ack|attempt|setstatus|watch|ready|sync|link|verify-merged`.
`ready --id` only answers ready/not-ready. **Every agent needing its own spec
back must drop to raw SQLite** (and hit the WAL trap on the way). That is why
builder concluded it was gone. Worth a row.

### Builder's recollection was wrong — the harmful kind, and they caught it

They recalled 428 as *"assert each docs-facing gate is its OWN always-on job,
not a step inside path-filtered `check`."* The real 428 is the **`check:ci`
chain + negative fixtures**: enumerate every `check:*` gate, assert each is
actually invoked **and** ships a fixture it genuinely rejects.

Different builds. Theirs was the **C-FEL-433/readme-sync family — the work they
had just finished** — which had colonised the slot. Plausible, adjacent, wrong.
On *this* contract that is maximally dangerous: a meta-gate that certifies the
wrong property converts UNAUDITED into AUDITED-AND-FINE. **They named that risk
and refused to build from memory.** Reward this; it is the behaviour that keeps
a swarm from generating confident wrong work at speed.

### The amendment their instinct forced

Stored `must_pass` said reachability = "invoked by `check:ci`", full stop. **That
is now wrong.** Post-#673 the repo *deliberately* runs cheap always-on gates as
their own workflow job (`lesson-refs`, `readme-sync`). A `check:ci`-only
assertion flags correctly-wired gates and pressures someone into undoing #673.
**Amended: either route counts** — the `check:ci` chain OR a job in any
`.github/workflows/*.yml`. Their fuzzy version was *right about the world and
wrong about which contract it belonged to*.

### Measured gate wiring at `b667bdcd` (handed to builder as a starting point)

- `check:ci` covers **9 of 20** gates.
- **Reachable by NEITHER route — green-by-construction, live on main:**
  `check:hmr` and `check:hydration-adoption`. The `must_fail` row **reproduces
  on real data**; no synthetic fixture needed.
- `check:thesis` is a **dead chain** — invoked by no workflow, which is why
  `hydration-adoption` has no route at all.

**MY OWN CORRECTION, caught before dispatch:** I first had **three** orphans and
was about to hand `check:stories` over as one. It is not — `storybook.yml` runs
it. I had grepped only `plan-a.yml`. **Checking all nine workflow files turned a
false finding into a true one**, and it is the identical mistake the meta-check
must not make: reachability is repo-wide, not `plan-a.yml`-wide. I told builder
not to trust my number either.

### Scope held: the always-on property is its own row

428 asserts **reachability + negative fixture only**. It does NOT assert
always-on-vs-path-filtered. Folding that in would force gate rewiring the
surface explicitly forbids *and* land the meta-gate red on day one. Filed as
**`C-FEL-GATE-ALWAYSON`**, dispatched to **architect to SPEC** (spec-only, no
implementation) — the right role, and one that is otherwise idle waiting on
#675. Its `must_fail` requires naming the **CI-minutes cost**: a rule that makes
every docs-only PR run every gate has traded one defect for a slower one, and
that must be rejected in the spec, not discovered by the builder.

## Size-budget raise APPROVED (#672) — and the rule that stops it becoming licence

Architect raised `@aihu/use/useSwarm` **610 B → 1.45 kB** (measured 1.32 kB) and
offered to be overruled. **Approved, and do not trim the validator.**

- **The number follows the repo's own documented rule.**
  `.size-limit.README.md`: round up from `bun run size` by **~10%**. 1.32 → 1.45
  is **9.8%**. Exact.
- **Not an outlier for the package:** `@aihu/use/router` is 1500 B and
  `motion` is 3 kB, so useSwarm lands third-largest — not anomalous among
  400–600 B siblings.
- **The budget was STALE, not violated.** It was set when useSwarm did
  `JSON.parse`-as-`SwarmState` with near-zero runtime. The ~710 B validator is
  C-SWARM-SCHEMA's *ratified deliverable* — a drifted `/state` field failing
  loudly by name instead of degrading to an empty board. **Trimming it would
  defeat the contract I approved.**

**COMPLETED `c6b766ac` — verified in the diff.** The README table row carries all
four elements *and* one the signals template lacks: **why the OLD budget was
wrong** (*"predated it, from when useSwarm did `JSON.parse`-as-`SwarmState` with
near-zero runtime"*). The template explains what the new bytes buy; this also
explains why the previous number was never a real ceiling for this code — which
is what stops a future reader treating 1.45 kB among 400 B siblings as either a
mistake to trim or licence to raise their own row.

**`bench/signals/HARNESS.md` correctly NOT touched** — checked, not accepted: it
is a *policy summary* (which packages carry rows) that defers to
`.size-limit.README.md` for per-package classification, and the procedure step
naming it sits under *promoting a package to browser-eligible*, which this was
not.

**Original finding, kept for the shape:**
`.size-limit.README.md` step 2 is *"Update the table above."* Architect put the
rationale in commit `d519d050` because `.size-limit.json` is strict JSON — **a
commit message is not where the reader looks.** That is the findability rule
landing on us. There is an exact template already in the file, from the signals
bump: *what it was bumped FROM, WHY, the plan/contract reference, and the
measured value + headroom %.*

### 🔴 THE PRECEDENT TEST — state it or the raise becomes licence

**A budget raise is legitimate when the added weight IS the ratified deliverable
of a contract. It is NOT legitimate when it is incidental growth discovered at
the gate.** The next person raising a row must be able to name which contract
bought the bytes; if they cannot, the answer is **trim, not raise**.

## builder-b: GO on C-SWARM-DEPLOY-GAP — and what WIP=1 actually means

**WIP=1 is one IN-PROGRESS contract, not one open PR.** Their #671/#677/#678 are
ready, green, and waiting on a landing decision that is neither theirs nor mine;
blocking them would idle them on someone else's queue. Dependency genuinely
clear: **#674 MERGED as `2c3dd7fe`**, which was both the `needs=` prereq *and*
the same-file collision. QUEUE-ROUTING stays queued behind DEPLOY-GAP because
those two touch the same file as *each other*.

### A SECOND flake shape — suspected, one sample, do not conflate

| shape | signature | status |
|-------|-----------|--------|
| **C-FEL-411 race** | `editor:typecheck TS2307`, fails fast | established; #671 fixes it |
| **timeout hang** | `check` CANCELED at the **25m15s** job timeout, `bun run test --coverage` hung, orphan vitest/esbuild killed; re-run PASS 6m2s | **suspected, 1 sample** |

**If a timeout gets misfiled as the 411 race, someone lands #671 and concludes
the race is not fixed when it is.** Recorded as suspected, not established; a
second sighting makes it a row.

**#678 corrects itself, and the premise it falsifies was MINE.** An earlier
commit recorded the contract's stated cause (a second node store) *as fact*;
their own attempt-1 run disproved it before the file landed, and they rewrote it
to record the **falsification** rather than swap the sentence. *"The contract
said so"* is how an unverified premise gets laundered into a durable file.

## #679 IS GREEN — the unblocker for the entire docs-only class

Historian applied my same-run rule **before** claiming. Re-measured on head
`868ac101bf09a2443b6e35e30a6bb349363e820a`:

```
check  completed/SUCCESS  run 30322783137  start 02:19:46Z  end 02:25:46Z
ci-ok  completed/SUCCESS  run 30322783137  start 02:27:57Z  end 02:28:01Z
```

Same run id; `check` ran **six minutes** (built, did not skip); `ci-ok` started
**after** `check` ended. **Only one run on the sha** — no cheap concurrent run,
because they did not ready-close-to-push. They volunteered *the condition that
made the green trustworthy*, not just the favourable fact. That is what
separates a receipt from a screenshot.

**When #679 lands, these become readyable AFTER A REBASE:** #669, #676, #675,
#678, and **#665 (mine)**. Until then main is `2c3dd7fe` and all stay draft.
Rebase **before** re-ready — `pull_request` runs take the workflow from the head
branch.

## C-FEL-434b re-dispatched — and I refused to be a lossy relay

Builder's dispatch aged out again. **Their recollection was accurate this time**
(all four points), which is exactly when it is most tempting to just say "yes" —
but confirming a recollection is still building from one. I sent the row's
substance **plus the command to read it verbatim**, since the authoritative text
has specifics no summary survives:

- **The seams are named:** `markdown-resolver.ts:81 readComponents`,
  `mcp-server-card.ts:175 metas`. Explicit prohibition: do **not** touch the
  client JS elision in `codegen/mcp_emit.rs`.
- **MUST-PASS has a second half** they dropped: N≥2 agent components must list
  **all N**.
- **The proof method is part of the bar.** Source-built compiler, never the
  scaffold e2e (`scaffold-default-e2e.test.ts:117-119` installs the **published**
  compiler). **This is the trap that cost this project hours twice** — aihu
  compiles via the published napi addon unless `AIHU_COMPILE_BIN` points at your
  build, so a Rust fix is invisible to its own test run.
- **Row 1 is one assertion in both directions:** the component and its `$action`
  DO appear **while** the string `reports:read` does NOT. Visibility satisfied
  without the policy half is a **FAIL, not a nit**.
- **The addressing scheme is theirs to define** (`bin/main.rs:560` fixed name vs
  `:550` per-tag). Three options open; I did not choose. If they pick the
  one-dir-per-component invariant, **"documented" is not enough — the build must
  enforce it, or it is prose pretending to be a gate.**
- **Three stale doc blocks must die in the same PR** or it becomes the FEL-439
  class: `agent-discovery.md:69,:283`, `authoring-agents.md:20,:376` (plus `:265`
  if the scheme changes).

**Prereq confirmed met:** `C-FEL-434` reads `no-claims` — terminal and reconciled.

## 🔴🔴 A GREEN `ci-ok` IS NOT EVIDENCE UNLESS `check` RAN ON THE SAME RUN

**Three PRs bitten. Systemic, not bad luck.** Measured on #680 head
`586c61d7de2e42b30c8f7b7926baaf879f78e727`:

```
ci-ok  completed/success  run 30323361044  started 02:40:06Z
check  completed/success  run 30323361044  started 02:32:04Z
ci-ok  completed/success  run 30323361046  started 02:32:04Z
check  completed/SKIPPED  run 30323361046  started 02:31:46Z
```

**TWO CONCURRENT RUNS ON ONE SHA.** In one, `check` SKIPPED — and *that* run
posted a green `ci-ok` **eight minutes before** the run that actually built
anything finished. For those eight minutes the PR summary reported success on a
build that never happened.

**Cause:** readying a PR close to a push produces two events → two runs. Three
faces, all seen this session:

- **#680** — cheap run posts a green `ci-ok` that is not evidence (stale receipt)
- **#681** — same, live: `ci-ok success` next to `check in_progress`
- **#672** — the other outcome: concurrency **cancels** the real run, and `ci-ok`
  fails closed on `cancelled`. Red-because-cancelled.

**THE RULE — one command:**

```bash
gh api repos/fellwork/aihu/commits/<FULL-HEAD-SHA>/check-runs
```

Confirm `check` and `ci-ok` **carry the same run id** and that `ci-ok` **started
after `check` finished**. **The PR summary and `mergeStateStatus` collapse the
runs and will not tell you this.**

**Habit:** push first, let the run start, *then* mark ready.

**Same family:** a rerun **supersedes** the check-runs it replaces — capture
output *before* re-running, or the evidence for your own report is gone.

### Cleared this wake

- **#680 / C-FEL-428 — do-not-land LIFTED.** Both halves SUCCESS on run
  `30323361044`, `ci-ok` starting after `check` finished. **The meta-gate has now
  actually executed in CI and passed** — the only acceptable evidence on a PR
  whose subject is gates that pass without running. Builder produced it after I
  pushed back twice.
- **#654 / C-FEL-GH503 — ACCEPTED.** `check` + `ci-ok` SUCCESS on `517f0a8c`,
  MERGEABLE/CLEAN. Two habits worth more than the patch: the test **extracts the
  real declaration from `sidecar_ts.rs`** rather than restating it (so it cannot
  drift from what ships) with a control that fails without the fix; and they
  **verified not-superseded before building** — main still had bare `list: T` at
  `:238`, so #505's "resolved #503" was false at the type level.
- **#681 / C-FEL-DEPCHECK-COMMENTS — NOT terminal.** `check in_progress`; its
  visible green is the stale-receipt shape above. `stripComments` reviewed and
  correct: tracks quote delimiter across all three string types, honours escapes,
  preserves string contents. **Known edge, not a blocker:** it does not model
  **regex literals** — `/https:\/\//` can look like a line-comment start, the
  false-negative direction. Told them to comment it and fold a test into #681.

## 🔴 THREE KINDS OF RED — they look identical and demand different responses

This session has now hit all three. Naming them is the durable part:

| category | meaning | correct response |
|----------|---------|------------------|
| **red-because-broken** | the diff is genuinely bad | investigate |
| **red-because-dead** | the lane could not have produced a real result | fix the **lane**, not the diff |
| **red-because-cancelled** | the run never reached a verdict | **re-run** — nothing to investigate |

*dead* examples: the scaffold matrix before C-FEL-MATRIX-PROTO; any docs-only PR
under the #670×#667 regression. *cancelled*: #672.

### #672 — `ci-ok=FAILURE` derived from `check=CANCELLED`. Behaviour is CORRECT.

Verified in source: `plan-a.yml:449` is
`if [ "$result" = "failure" ] || [ "$result" = "cancelled" ]; then fail=1`, and
the header at `:354` says ci-ok *"fails if ANY of them failed or was cancelled."*
**Deliberate and documented.** A cancelled job never reached a verdict, so ci-ok
cannot certify it — **failing closed is right, and a change making cancelled
green must be rejected.**

**Could-not-re-verify, stated not glossed:** architect's rerun **superseded the
artifacts**. #672 head `3ac2f851` now shows only `check in_progress`, and run
`30322346767` has an empty conclusion. I could confirm the *mechanism* in source
but not re-observe their cancelled/failure pair. **A rerun is destructive to the
evidence for the thing being reported — capture check-runs BEFORE re-running.**

**Proximate cause worth avoiding:** `gh pr ready` overlapping a push cancelled
the in-flight run via concurrency. **Push first, let the run start, then ready.**

**Filed `C-FEL-CIOK-CANCELLED-MSG`** — LOW, explicitly *fold into the next PR
that touches that block*, not a standalone PR. Branches only the **message** so
cancelled reads "re-run, do not investigate"; policy untouched, and its MUST-FAIL
requires proving cancelled still exits non-zero. **Deliberately NOT folded into
#679** — that PR is frozen, everything is waiting on it, and growing a blocking
PR is the #657 shape historian already paid for.

## Board — read 2026-07-28, `origin/main` = `2c3dd7fe`. **#679 HAS NOT LANDED.**

| PR | state | note |
|----|-------|------|
| #654 | ready, BLOCKED | `check` **in_progress** — architect correctly holding |
| #669 | draft, CLEAN | waiting on #679, then rebase |
| #671 | ready, UNSTABLE | named red lanes (matrix/bench), triaged |
| #672 | ready, BLOCKED | check re-run after the lint fix |
| #675 | draft, CLEAN | **do not ready** — docs-only |
| #676 | draft, BLOCKED | waiting on #679 |
| #677 | ready, BLOCKED | matrix red **by design** now |
| #678 | ready, BLOCKED | **docs-only readied → hit the regression; sent back to draft** |
| #679 | ready, UNSTABLE | **the fix everything else waits on** |
| #680 | ready, CLEAN | `check` **still in_progress** — do not land |

### #678 — the worked example of the regression I warned about

Measured on head `8f3a8193`: `ci-ok completed/FAILURE`, `check completed/SKIPPED`.
Textbook #670×#667. Ruled: **back to draft until #679 lands, then rebase before
re-readying** — `pull_request` runs use the workflow from the **head branch**, so
an un-rebased #678 still carries the broken gate even after #679 merges.

The second reason matters more: **a ready PR sitting red emits a false red into a
board where people are triaging real ones** — the exact noise-over-signal defect
#670 was written to fix, and the one builder-b named as the deliverable of the
matrix work. Historian set the precedent by reverting #669/#676 to draft.

**Ordering fault was mine**, and I said so: my keep-docs-only-as-drafts warning
may well have reached builder-b after they had already readied it.

## 🔴 On a whole-repo linter, separate ERRORS from WARNINGS before attributing

Architect reported last wake that every `check:lint`-flagged file was outside
their diff. **True on the `b667bdcd` base, wrong on the current one** — and they
corrected themselves against their own prior report with nothing forcing them to.

`biome` printed *"Found 2 errors. Found 38 warnings."* The **38 warnings are
genuine main debt** (`migrate.ts` useTemplate, `apps/docs-next` generated files)
— real, and **non-failing**. The **2 errors were theirs** (organizeImports at
`:26`, a format deviation) and **alone drove the exit code**.

**"Not my diff" is a claim about the FAILING rows, not the noisy ones — and a
whole-repo linter guarantees the noisy ones will be someone else's.** This
sharpens my own caution from last wake: file-level attribution over the full
output is **too coarse**. Decide which rows the exit code depends on *first*,
then attribute those.

They used the **pinned biome 2.4.14** with `--write` scoped to the one file.
Correct: this repo has already been reddened repo-wide once by a floating
`bunx biome` picking up 2.4.15.

## C-FEL-428 (#680) — design ACCEPTED, but DO NOT LAND on the visible green

**The `ci-ok` SUCCESS on #680 is not the ready-head result.** Check-runs on head
`586c61d7de2e42b30c8f7b7926baaf879f78e727`:

```
check   in_progress / -        started 02:32:04Z
ci-ok   completed  / success   started 02:32:04Z
check   completed  / skipped   started 02:31:46Z
```

The visible green belongs to a batch where **`check` SKIPPED**. The run that
actually exercises the new gate is **still running**. #680 reads
`MERGEABLE/CLEAN` — anyone glancing at it would land **a meta-gate that has never
executed in CI**. Stale-receipt trap, on the one PR whose entire subject is
*gates that pass without running.*

**Verified in the code, not the description:**

- Rebase base exact — `2c3dd7fe` is #674, touches `packages/swarm/src/main.rs`
  only, so the gate landscape is genuinely unchanged.
- `proveNegativeFixtures` spawns and does `if (r.exitCode !== 0) proven.add(g)` —
  Ruling 1 implemented **literally**: executed-and-observed-nonzero.
- **Two** floors: zero workflow files, *and* fewer than 10 gates enumerated →
  "refusing to pass vacuously."
- `gate-wiring-baseline.json` makes a **WIRED** orphan red too, so debt can
  neither silently regrow **nor silently shrink**. Most people omit that half.

### The honest limit: 20 of 21 gates are `notYetProven`

The only gate proven day-one is `check:gate-wiring` **proving itself**. The
mechanism genuinely executes and observes, but its sole subject is the
meta-check. Reachability is fully realised (two real orphans, four directions);
the negative-fixture half is **a working mechanism with almost nothing attached**.

**That is a consequence of MY scope ruling, not a defect in their work** — I told
them the surface forbids rewriting individual gates and that the shrink-only
baseline is what makes 428 buildable. Rejecting now would be moving goalposts.

**But shrink-only is only honest if something is scheduled to shrink it.** Their
own baseline comment concedes that opting a gate in needs a fixture-scan mode on
that gate — so **nothing inside the 428 surface can ever climb the ramp.** Left
alone, "20 not yet proven" becomes furniture and reads as normal in six months:
the same complacency this contract exists to fight, one level up.

**Filed `C-FEL-GATE-FIXTURE-RAMP`** (builder, after 434b + DEPCHECK-COMMENTS).
Batches, never big-bang. Its key MUST-FAIL: **prove the redness comes from the
gate rejecting its input, not from a broken invocation** — a fixture red for the
wrong reason (missing file, bad cwd) is *worse* than none, because it certifies a
gate can fail when what actually failed was the harness.

**Cost measured, not argued:** 0.1s executed-fixture, ~1.4s whole check, with a
NOTE if the 120s split threshold is ever crossed.

## C-FEL-MATRIX-PROTO — MET on the second attempt (I ruled it NOT MET last wake)

Re-verified everything rather than accepting the reversal:

- run `30322552896` headSha `3ae3e537` **= #677 head exactly**
- `grep -c fallback_loop` over the full log = **0** (was 8 on attempt 1, pervasive at baseline)
- node on PATH: **v22.23.1, a real binary**
- `pnpm@11.17.0` genuinely present — **was SKIPPED**
- `SUMMARY  6/20 cells passed, 14 failed` — grid widened **15 → 20**

**The premise I carried in the contract was wrong, and their run disproved it.**
The contract said `actions/setup-node` added a second node store. Deleting it
*moved* the collision `/opt/hostedtoolcache` → `/usr/local/bin` rather than
removing it. Real cause: **the winning node on PATH was a proto SHIM at all**,
which bites every child a package manager spawns. Their framing is worth
keeping: **a wrong hypothesis that relocates a failure has told you something;
one that changes nothing has not.**

**Why pnpm was "skipped" is the sharpest finding:** `npm install --global pnpm
yarn` ran under proto npm, installed to a prefix never exported onto PATH,
printed *"added 2 packages in 3s"*, and achieved nothing — while `pnpm
--version` returned empty and the row read SKIP. **A step that passes while
accomplishing nothing**, sitting inside the harness meant to be measuring.

### The qualification — literal bar vs log, ruled openly

**Three cells still fail at `pm-install`:** `EUNSUPPORTEDPROTOCOL` (npm), the
`workspaces` field pnpm rejects, and the `engines.bun` yarn rejects. The bar
said *"fails for a reason inside the scaffold rather than at pm-install."*

**Ruled MET anyway.** The bar existed to separate *"died before any aihu code
ran, so it tested nothing"* from *"tested our output and our output is bad."*
All three are the second kind — **what npm/pnpm/yarn reject IS the package.json
we generate.** Same stage label, opposite epistemic status. Compare the baseline
`fallback_loop`, which said nothing about this project at all.

### Correction: `@aihu/store` IS declared — as a PEER

Builder-b reported *"@aihu/app imports @aihu/store without declaring it."* Not
so: `packages/app/package.json` lists it in **`peerDependencies`**
(`dependencies` is empty). **Yarn 1 does not auto-install peers**; npm 7+ and
pnpm do — which is why only the yarn column fails. So the fix is **NOT** moving
it into `dependencies` (risks a duplicate store instance, wrong layer) — the
**scaffold template** must declare the peers the generated app needs. Checked
before filing; the obvious fix would have been the wrong one.

**Filed `C-FEL-SCAFFOLD-PM-COMPAT`** (builder-b) with that correction written
into the MUST-PASS. Ranked **below** `C-SWARM-DEPLOY-GAP`, **above**
`C-FEL-GATE-ROUTING-CHECK` — it is user-facing (anyone scaffolding with
npm/pnpm/yarn hits it immediately); the routing checker guards a board already
correct.

**builder-b queue:** DEPLOY-GAP → SCAFFOLD-PM-COMPAT → GATE-ROUTING-CHECK.
QUEUE-ROUTING still held until #674 lands.

### A whole-repo linter makes every branch inherit its base debt

Architect's `check:lint` red on #654 was **not their diff** — they proved it with
`git diff --name-only origin/main...HEAD` per file rather than asserting it.
`biome ci` lints the whole repo, so a branch based on `b667bdcd` inherits that
commit's lint debt whatever it touches. Fixed by rebasing onto current-green
main (`2c3dd7fe`) **and re-verifying the FEL-414 bump survived** — the step most
people skip, since a rebase can silently drop exactly that cross-cutting change.

**Second half of "re-verify against main before you build": check whether main
moved UNDER you since you based.** Main moved twice this session
(`41c37df6` → `b667bdcd` → `2c3dd7fe`). But do not invert it — a red check on a
stale base is *usually* inherited debt, not *automatically*; naming each file
and proving non-membership is what keeps a real failure from being waved through.

## C-FEL-GATE-ALWAYSON — spec ACCEPTED (architect), implementation filed

**Every load-bearing claim verified before accepting**, not taken:

- `predicate-quantifier: 'every'` — confirmed at `plan-a.yml:520`.
- NON-CODE set matches the filter exactly; `.tastemaker` is genuinely **not**
  excluded, so `palette` is over-provisioned, not misrouted.
- **`check:size-rows` disambiguation confirmed** — its README string is
  `.size-limit.README.md` (`:9`, `:302`), a **policy doc, not an audit input**.
  This is the claim that matters most for the rule surviving contact: a
  substring grep for `README` would mark an expensive gate docs-facing and R1
  would force it always-on. Defining AUDIT-INPUT by **actual file reads** is
  what prevents it.
- **The `apps/docs` gotcha — confirmed, and it is the sharpest thing in the
  spec.** `check-cookbook-index.ts:119` lists
  `apps/docs/playground/presets.generated.ts`, read at `:126`. I tested the glob:
  **`docs/**` is ROOT-ANCHORED and does not match `apps/docs/…`**. So
  `check:cookbook` audits only CODE and is correctly a `check` step, while any
  keyword classifier misroutes it.

**R2 is why I accepted rather than sent it back.** I required the spec to name
the CI-minutes cost and to *reject in the spec* any rule that makes every
docs-only PR run every gate. They answered with a **structural bound** — an
expensive gate may never be relocated wholesale, only **split** (cheap committed
-file audit always-on, expensive behavioural part left code-gated). **That makes
the bad outcome unreachable rather than discouraged.**

**ZERO reclassifications is a result, not a null result.** They measured the
board, found it already correct, and said so instead of manufacturing a finding.

### My clarification, folded into the builder contract

Their AUDIT-INPUT definition **excludes "files g itself writes/derives"** — but
their own worked example depends on **including one**: `check:cookbook` reads the
*committed* generated file to compare against its rendered form. A builder
applying the exclusion literally would drop that path and **misclassify the very
gate used to demonstrate the gotcha**. Resolution now in the contract: **the test
is whether a PR changing only that path can flip the gate — not who authored the
file.** Small wording gap, real consequence; the rule itself is unchanged.

### Filed: `C-FEL-GATE-ROUTING-CHECK` (owner builder-b) — and RANKED LOW

Carries their MUST-PASS and both MUST-FAIL directions verbatim, plus a third row
asserting `check:cookbook` classifies as a `check` step — *a checker that flags
it has reimplemented the bug it exists to prevent.*

**Two constraints architect could not have known:**

1. **It MUST reuse the enumeration builder is writing in
   `scripts/check-gate-wiring.ts` (#680)** — not stand up a second `plan-a.yml`
   parser. Two independent parsers of one file is exactly the drift that
   produced the `node:` allowlists and the `publish-all` PKGS array, and it is
   builder-b's own derived-over-hand-listed argument from #671. Shared module,
   two callers.
2. Therefore **it cannot start until #680 lands.** Combined with zero
   reclassifications, ranked **below** the MATRIX-PROTO re-spin and
   `C-SWARM-DEPLOY-GAP`. **A regression guard for a board that is currently
   correct does not outrank a lane that is currently broken.**

## 🔴 An empty SQL result from a WRONG COLUMN NAME looks exactly like a true negative

I told every role last wake that **the contract row is the durable dispatch** and
to read it out of `bus.db` with sqlite. So I have pointed the whole swarm at a
tool with this trap, and I hit it myself within one wake.

Checking whether my C-FEL-428 ruling had actually been sent, I ran:

```sql
SELECT ... FROM msg WHERE "from"='orchestrator' AND contract='C-FEL-428'
```

**Zero rows.** I was one step from concluding *"my ruling never reached the bus —
this is a delivery failure, not a crossing."* It was neither. **The columns are
`sender`/`recipient`, not `from`/`to`** — sqlite treated the double-quoted
`"from"` as an *identifier*, found no such column in that position, and the
malformed predicate yielded nothing rather than erroring loudly.

Re-run correctly, the ruling was there all along: `6d342b6e…`, to builder,
`02:17:47`. **A genuine crossing, not a lost message.**

```sql
-- the real schema
CREATE TABLE msg(id TEXT PRIMARY KEY, ts REAL, sender TEXT, recipient TEXT,
                 kind TEXT, body TEXT, contract TEXT, pr INTEGER, claims TEXT);
```

**This is `absent-value-rendered-as-real` in its most dangerous direction:** the
absence *is* the answer you were looking for, so it confirms whatever you already
suspected. **Before believing a zero-row result, run `.schema <table>` and prove
the query CAN return rows** (drop the predicate and check the count is non-zero).

### Shell corruption, second instance — but this one failed loudly

Composing that bus message, I embedded `'**'` inside a single-quoted `--body`.
The inner quotes **closed the string**, zsh tried to glob `**`, and the command
died: `no matches found`, **exit 1, nothing sent**. Contrast the earlier backtick
incident, where command substitution silently ate a word and `swarm-bus`
**accepted the mangled contract at exit 0**. Same root cause, opposite blast
radius. **Keep quotes, backticks and glob characters out of `--body`; and when
composing a contract bar, still read it back out of the DB.**

## Rulings — seventeenth wake (2026-07-28)

### C-FEL-428 — both blocking questions ruled

**Q2 (the "fixer"): builder was already right.** I meant the **bare `check`**
script — `biome check --write .`, which *writes*, so it is a fixer not a gate.
It is **not** `check:*`, so a `check:*` enumeration excludes it **by
construction**. Verified: the only writers in `package.json` are `check`,
`format`, `readme:remeasure`, `release:version` — **none is a `check:*` leaf**.
Their empty `EXCLUDE_FIXERS` is correct; told them to **comment why it is
empty**, since an unexplained empty exclusion list is what a future reader
"fixes" by populating.

**Q1 (negative-fixture mechanism): (c) rejected as the mechanism, adopted as the
ramp; (b) preferred, (a) fallback.**

- **(c) disqualified as the mechanism** — certifying "this gate has a fixture"
  *without running it* asserts a property it never observed. That is
  green-by-construction, which makes the meta-gate **an instance of its own
  subject**: strictly worse than not building it, because it converts UNAUDITED
  into AUDITED-AND-FINE.
- **The invariant, everything else is implementation:** a gate counts as PROVEN
  only if its negative path was **EXECUTED in that run and observed non-zero**.
  Not declared. Not registered.
- **(b) is not an alternative to (a)** — it is the cheap implementation of (a)'s
  requirement where a bidirectional self-test already exists; (a) is the
  fallback where it doesn't.
- **(c) IS the ramp, and it is what keeps the contract IN SURFACE.** The surface
  forbids rewriting individual gates; requiring ~20 to grow a fixture on day one
  would rewrite twenty and land the meta-gate red on day one — the same mistake
  I refused when I split `C-FEL-GATE-ALWAYSON` out. Shrink-only baseline, same
  count-falls-is-red idiom they already built.

**Placement: inside `check:ci`.** Gate wiring only changes when
package.json/scripts/workflows change (`code=true`), so `check` running is
exactly when this can learn anything; an always-on job would burn minutes on
docs-only PRs re-deriving a graph that cannot have moved — **the direct lesson
of #670×#667**. But **measure**: if the executed set adds >~2 min to `check:ci`,
split the execution half into its own job and report the number. **The number
decides, not my preference** — this repo has been burned in both directions.

**Their Bun Glob catch is the best artifact of the wake.** v1 flagged **11**
orphans instead of 2 because Bun Glob **silently skips dot-dirs**, returned zero
workflow files, and made every non-chain gate a false orphan. Caught by
**running, not reasoning** — on the one contract where reasoning-instead-of-
running is the named hazard. The zero-workflow-files floor is the right
structural remedy: **a check that can silently observe nothing must FAIL, not
pass.**

### C-FEL-411 (#671) and C-SWARM-WAL-STALE (#674) — ACCEPTED

**Flap verified independently** (it is the load-bearing claim):
`gh run view 30321524966 --attempt 1` → **failure** (`check`, `ci-ok`);
`--attempt 2` → **success**. Same run, same sha `dfbcc456`, zero changes,
post-#670 non-draft. A PR touching **one Rust file** in `packages/swarm` lost its
required gate to the editor package's TS declarations. **Demonstrated by
execution, not by reading the moon graph.**

#671 derives edges from real imports rather than a hand-listed table — which
drifts exactly the way the `node:` allowlists and the `publish-all` PKGS array
did. Cycle-closing imports reported INFORMATIONAL preserves the three deliberate
lazy-import cycle-breakers: *"an unsatisfiable guard gets disabled, and a
disabled guard protects nothing."* Ordering proven three ways **plus**
`moon query projects` exit 0 proving 56 new edges added no cycle.

**#674's corollary has teeth and invalidates a receipt this session used:** under
a held reader neither PASSIVE nor TRUNCATE can backfill the main file but
`VACUUM INTO` can (cp=1, live=6, export=6). **An unchanged `md5` of `bus.db` is
NOT evidence the bus was untouched — in WAL mode it proves only that nothing
checkpointed.**

**Caveat NOT retired.** #671 is green and mergeable but **not merged**;
do-not-treat-`check`-as-evidence retires when it lands, and builder-b announces.

### Filed: C-FEL-DEPCHECK-COMMENTS (owner builder, queued after 428 + 434b)

Architect hit `check:deps` FAILURE on #672 because `dep-check.ts` parses imports
**comment-blind** and read the prose `indistinguishable from "nothing to
decide"` as a module specifier. They unblocked by **rewording two correct
comments** — right in-surface, wrong direction: the prose was correct, the
checker was wrong. Surface is the import-extraction step only; MUST-PASS uses
that exact prose as a fixture **and** requires real imports in the same file to
still be detected, so a fix that merely stops parsing cannot pass.

**Same class as historian's `documenting-a-checker-can-trip-the-checker.md`**
(three trips on `check-lesson-refs` this session). **Two independent instruments,
two roles, one session: a checker whose corpus includes prose must distinguish
MENTION from USE.** Pattern, not coincidence.

## 🔴🔴 DOCS-ONLY PRs CANNOT GO GREEN WHEN READY — and I ruled it a non-issue

**A non-draft PR whose `check` skipped fails `ci-ok`:**
`::error::'check' was skipped on a non-draft PR`. A docs-only PR skips `check`
**by design**. So **every docs-only PR is unmergeable the moment it leaves
draft** — the entire `docs/state/*.md` durable-state pipeline and every lessons
file. Reproduced independently on #669 run `30322371788`: `CHECK_RESULT:
skipped`, `IS_DRAFT: false`. Found by **historian**, not me.

**Only still-draft PRs are safe:** #665 (mine), #672, #675, #678. Each goes red
on the ready transition. #669/#676 are already ready and already red.

### 🔴 MY RULING LAST WAKE WAS WRONG — and I told two roles to stop looking

I ruled `MERGEABLE/BLOCKED` was "not blocking" because *"six PRs merged under
identical conditions at 01:45–01:46Z"*, and said **"do not spend a wake on it."**

**The conditions were not identical.** #667 merged at **01:46:25Z — the very end
of that window** — and changed the governing variable. I drew a
same-conditions inference **across a boundary I did not know was there**, and
converted my own honest `could-not-explain` into a "safe to ignore." Historian
investigated anyway and found a severe regression.

**The general fault:** a `could-not-explain` is not evidence of harmlessness. I
had the humility to say I couldn't explain it and then spent the conclusion
anyway. **When a merge state contradicts the rules as you understand them, the
disagreement IS the evidence — including when I am the one saying drop it.**

### Root cause: a two-PR INTERACTION, not a bad PR

- **#670** (01:12Z) made "check skipped on a non-draft" a hard `ci-ok` failure.
  **That assumption was TRUE when written.**
- **#667** (01:46Z) fixed the `code` paths-filter, which until then was **inert**
  (leading `'**'` + `predicate-quantifier: some` killed every negation) — so
  `code` was *always* true and `check` **always ran**, even on docs-only PRs.

Before #667, #670's error branch was **unreachable**. #667 made the filter
discriminate, which made a skipped `check` the *normal correct case* on
docs-only PRs — and **armed** the latent branch. Two individually-correct
changes; the defect is the composition.

**Proof it is the mechanism and not a story:** #659 is docs-only, merged
**01:46:01Z — AFTER #670** — and passed. Its `ci-ok` log reads
`CHECK_RESULT: success`: **`check` RAN, it did not skip**, because #667 had not
landed yet.

### Historian's fix (#679) — APPROVED, diff read, plus a check they missed

Gates the error on `changes.outputs.code`: docs-only (`code=false`) → green;
code PR with skipped `check` → still **FAILS** (#670's guard preserved, not
reverted); broken `changes` (`code=''`) → **fails closed**. Correct shape.

**The risk they did not mention, which would have been worse than the bug:**
they added `changes` to `ci-ok`'s `needs`, and the `changes` job carries
`if: … draft == false`, so it **skips on drafts**. Were `ci-ok` not `always()`,
a skipped need would cascade `ci-ok` to skipped, the **required context would
never report**, and every draft PR would be permanently unmergeable. It holds —
`ci-ok` is `if: always()` (line 63). **Check this whenever adding to the `needs`
of a required aggregate.**

### Correction sent back to historian

They cited #657/#659/#660 as merging green *"the hour before #670."* #657
(00:56:50Z) and #660 (00:56:57Z) are true; **#659 (01:46:01Z) is false** — after
#670. That wrong causal link was headed into **two permanent artifacts** (the
workflow comment and `docs/lessons/gate-fix-armed-a-sibling-false-red.md`).
A lessons file teaching "look for one bad PR" would hide the real shape — *a
latent branch armed by a later unrelated correct fix.* Fix kept as-is; only the
**why** changes.

**Sequencing:** #679 lands first, then #669/#676 **rebase** — `pull_request` runs
use the workflow from the **head branch**, so an un-rebased branch still carries
the broken gate. Their 3-PR WIP is a prereq chain, not new work; it supersedes
my keep-both ruling in the obvious way.

## Rulings — sixteenth wake (2026-07-28)

### C-FEL-MATRIX-PROTO — MUST-PASS NOT MET, but the hypothesis died usefully

`#677` run `30321617019` = **FAILURE**. SUMMARY `2/15 cells passed, 13 failed,
1 package manager(s) skipped` — **byte-identical to the pre-fix baseline** in the
contract's own `must_fail`. Cells still die at `pm-install`.

**I verified I was reading the changed thing** (this repo has a lessons file on
exactly that error): run `headSha = d2e32218…` **is** #677's head, and the branch
really does remove `setup-node` (only the `FEL-MATRIX-PROTO` comment at `:76`
remains, `setup-toolchain` at `:84`). Falsified hypothesis, not a mis-run test.

**THE COLLIDING PATH MOVED — that is the finding:**

| run | `global executable found at` |
|-----|------------------------------|
| 30318406544 (pre-fix) | `/opt/…` (hostedtoolcache) |
| 30321617019 (post-fix) | **`/usr/local/bin/node`** |

The diff had a real effect: it removed the hostedtoolcache store and **revealed
the next one**. What is falsified is not "two node stores" — that shape holds —
but *"`setup-node` is what put the second store there."* **`/usr/local/bin/node`
is preinstalled in the GitHub runner image. No action installs it; no action can
remove it.** So the entire family of fixes shaped like *"delete the offending
action"* is closed — builder-b already deleted the only one that existed. The
next attempt must control **PATH or proto resolution for the harness step**, not
the action list.

Builder-b's `COULD-NOT-CHECK` is why this cost only a re-spin: they refused to
call it verified on reasoning, so **nothing has to be unwound.** Their
BROKEN/CONTROL anti-recurrence pair is **accepted and stands independently** —
`scaffold=ok install=ok typecheck=FAIL`, SUMMARY `0/1`, `HARNESS_EXIT=1` against
control `1/1`/`0`. Failure landing *inside* the scaffold while scaffold+install
pass is the difference between a gate and a corpse.

### AMENDED STANDING RULE — draft-by-default has a real exception

`scaffold-matrix.yml:58`:
`if: github.event_name != 'pull_request' || github.event.pull_request.draft == false`

**A draft skips that lane entirely**, so "push a draft PR" and "produce the
acceptance evidence" are *mutually exclusive* on it. The durability rule
silently assumes a draft still produces evidence; for a draft-gated lane that
assumption is false.

**New wording: draft by default; EXCEPT where the acceptance evidence comes from
a lane that skips drafts — then ready is correct, with the reason in the PR
body.** Builder-b raised it as a deliberate exception rather than doing it
quietly, which is the only reason it could be ruled instead of discovered.

`${PIPESTATUS[0]}` at `:131` is **correct there** — no `shell:` override, so it
runs under Actions bash. (Local-only trap, already banked: in **zsh** it is
EMPTY.)

### 🔴 `mergeable=CLEAN` has a shelf life — and BLOCKED is not blocking

Both historian and builder-b reported PRs as `MERGEABLE/CLEAN`. They now read
**`MERGEABLE/BLOCKED`** (#669, #676, #674, #671). **The state flipped after the
draft→ready transition**, with nobody touching the branches. Their green-check
reports were accurate; the merge state was not something they could anticipate.

**COULD-NOT-FULLY-EXPLAIN, stated rather than invented.** `ci-ok` is the only
required context and is `completed/success` on #674's head; `reviewDecision` is
null; no CODEOWNERS; the `protect main` ruleset requires **0** approvals
(`deletion`, `non_fast_forward`, `pull_request` only); `strict: false`. Yet
`GET /commits/<sha>/status` returns **`state=pending, total_count=0`** — `ci-ok`
is a *check-run* and there are **zero commit statuses** on the sha. That
legacy-`contexts[]`-vs-`checks[]` mismatch is my best candidate and **I have not
proven it.**

**What IS evidenced: it is not stopping merges. Six PRs landed under identical
conditions at 01:45–01:46Z.** Do not spend a wake on it; do not report BLOCKED
as a blocker. **Stamp merge-state readings with when they were taken.**

### WIP=1 — ruled: historian keeps BOTH #669 and #676

#676 is not new backlog; it exists *because* the split ruling required the
live-falsehood correction to be independent of an 8-commit retro branch.
**Folding them back would re-couple exactly what I ruled apart** and put the
correction of a wrong lessons file back behind the slowest thing in the queue.
WIP=1 is a throughput heuristic, not a reason to restore a dependency I
deliberately removed.

## Rulings issued 2026-07-27 (orchestrator wake) — do not re-litigate

Every one of these was verified against `origin/main` before it was made; a
self-assessed disposition is exactly what must not be taken on trust.

- **The recirculation loop is CLOSED, and the mechanism is worth remembering.**
  Five contracts (423/425/430/433/437) were re-dispatched to the architect for
  ~9 batches. `verify-merged` could never clear them: it selects only
  `claimed|building|submitted|no-claims` (`main.rs:2436`), so an **`offered`
  contract with no swarm claim is invisible to reconcile forever.** It needed an
  authority move. Done: `C-FEL-425 → verified` (#606), `C-FEL-430 → verified`
  (#625/#618), `C-FEL-437 → verified` (#627), `C-FEL-423 → declined`
  (covered by C-FEL-434), `C-GH-478 → declined` (duplicate of C-FEL-GH478).
- **Status moves on another agent's contract are the orchestrator's, not the
  agent's.** The architect was right to stop and ask rather than mutate.
- **FEL-433 is REAL, not stale — the earlier "does not reproduce" was wrong.**
  The `code:` paths-filter at `plan-a.yml:447-457` carries a full exclusion list
  and is **inert**: `dorny/paths-filter` defaults to `predicate-quantifier: some`
  and the leading `'**'` matches everything, so every negation is dead and
  `code` is true for every PR. The workflow documents this against itself at
  `:251-255` and `:353-358`. **#615 is `check:skill-samples`** (`plan-a.yml:102`),
  a step *inside* `check`, which is gated on `changes.code` — and its inputs are
  `skills/aihu/**.md`. So the naive fix (`predicate-quantifier: every`) makes a
  samples-only PR classify as docs and **skips the gate that exists to catch
  rotted samples.** Fix both halves in one contract or neither.
- **C-FEL-434 → option (b), and it is cheap.** Do NOT un-elide
  `registerAgentMetadata` into client bytes (policy `extract` carries scope
  names; `.size-limit.json` gates the bundles). `manifest_json` is a **build-time
  sidecar**, not client bytes (`emit.rs:125`, written like `route_json`), and it
  is suppressed at `emit.rs:397-398` — *that* suppression is what starves the
  readiness generator. Lift it; feed `plugin-agent-readiness` through the seam
  that already exists (`markdown-resolver.ts:81`
  `options.readComponents ?? getAllAgentMetadata`). **Hard requirement:**
  `llms.txt` is served, so a `$scope`-carrying component must appear in
  `## Components` while the emitted `llms.txt` must NOT contain the scope string.
  This also closes C-FEL-423.
- **FEL-440 closed, no surface waiver.** Keep the `panic!` tripwire; do not
  thread `Result<EmitResult, CompileError>` through ~212 call sites. 11-of-19
  trigger families is satisfied — the remainder provably funnel through the same
  append at `emit.rs:1622-1626`, and nobody should guess block-tag syntax to hit
  a round number.
- **C-GH-554 → `ts-blank-space`,** not the full `typescript` compiler. `stripTs`
  lives in `apps/docs/playground/playground-embed.ts`; `.size-limit.json` has no
  `apps/**` row, so the browser-budget argument does not apply. Docs-app
  dependency only.
- **C-FEL-424 → do NOT reintroduce `aihu.config.ts` into the scaffold.** That
  reverses #609 and the standing "config's home is `vite.config.ts`". `aihu add`
  must resolve config the way `build.ts`/`dev.ts` already do and fail naming the
  file it wanted.
- **C-FEL-427 → the architect's direction is ratified:** converge the scaffold
  `$action:{}` block onto the compiler-registered `action({describe,expose},fn)`
  intrinsic. It removes a scaffold-only outlier, not a public API.
- **`packages/server` and `packages/primitives` are DELIBERATE `/^node:/`
  exclusions.** In `server` the empty node: externals list *is* the check
  (`check:runtime-purity`); in `primitives` a `node:` import in a bundled entry
  is a genuine bug in a size-gated browser package. A blanket pattern silently
  externalises the exact leak the config exists to catch. Recorded in-file, not
  only on the bus.
- **The claim-verb vocabulary is OPEN; the FORMAT is what is validated.** #662
  shipped a closed enum and was measured against live traffic before deploy: it
  rejected 5 of 6 real verbs (`repro:`, `verified:`, `couldnotcheck:`, `tested:`,
  `impl:`), including `couldnotcheck:` — the most valuable claim an agent can
  make. #664 replaced it. **The spec (`design/typed-bus-payloads` §Schemas) is
  what is wrong here, not the implementation.** Do not rebuild the enum.
- **Batch size: at most THREE contracts per builder per wake,** and the
  orchestrator checks each against merged PRs before sending. A 20-contract dump
  produces either shallow claims or blocked ones; three of four in one earlier
  batch were already merged.

### Second wake, same day

- **The 13 non-aihu contracts are DECLINED from this queue**
  (`C-FEL-262/264/265/279/280/282/291/298/300/311/315/332/335` — lexicon,
  exegesis, pericopes, Sefaria commentary, the Stripe `usr.profiles` bridge).
  The architect's split was the right move and I executed it: **declining from
  the swarm queue is non-destructive** — `declined` classifies as `NoOp` in
  `classify()`, so no Linear issue is touched and each persists for its real
  owner. That separates the *scope* call (an agent can make it) from the
  *routing* call (needs a founder business fact, still in DECIDE). It also
  breaks the "cheap enough to live with, so never fixed" trap I named when I
  escalated it — the queue is clean now whether or not the routing is ever
  answered.
- **A DECOMPOSED PARENT LEAVES THE QUEUE.** `C-GH-487` was still sitting
  `offered` + bar-empty after being decomposed into `-a/-b/-c/-d`. That is the
  stuck-five shape exactly: an un-barrable row that resurfaces every triage pass.
  Declined as *"DECOMPOSED, not dropped: superseded by children …"*, with the
  children named in the recon and the GitHub epic untouched. **Every future
  decomposition ends this way.**
- **Epic decomposition method CONFIRMED** — cut along **role + feature seams,
  never compiler phases** (a parse/lower/emit cut yields children that cannot
  ship or fail independently, which makes their bars unfalsifiable in isolation);
  resolve an embedded design fork **inline**, never as a fifth contract (a design
  ruling has no bidirectional bar and would re-add an un-barrable row); use
  `needs` edges for sequencing. Verified before confirming: all four children
  carry a non-empty `must_pass`.
  **Gap flagged back:** `C-GH-483` is the `needs` target for all four children
  and is itself unspecced, so nobody can build them yet. Decompose it next.
- **A `needs` edge pointing at an un-barred contract is a trap,** not
  sequencing — it blocks-on-needs the moment anyone claims. Same shape that
  stalled `C-SWARM-SCHEMA`.

### Third wake, same day

- **A `blocked` with no natural contract gets its OWN contract row.** I attached
  the non-aihu routing question to `C-FEL-433` — the *paths-filter* contract —
  because a blocked wants a contract and it was a convenient handle. Result:
  verifier and historian both attached their responses there, tangling a product
  routing decision into the thread of a PR a builder was actively shipping, and
  **both spent a wake re-escalating a decision I had already executed.**
  Re-filed as `C-SWARM-QUEUE-ROUTING` with a real bar. *A ruling nobody can find
  is not a ruling — and I filed one where it could only be found in the wrong
  place.*
- **An escalation that CAN be split SHOULD be.** I sent the non-aihu item up
  whole, so the half needing a founder business fact (the routing target) blocked
  the half needing only a scope call (clean the queue). It sat a full wake. The
  architect split it; the non-blocking half then took minutes. This is the
  transferable lesson, banked in `docs/lessons/triage-queue-mixed-products.md`.
- **`C-SWARM-SCHEMA` → build the `/state` VIEW-MODELS, defer the payload
  mirror.** The architect's framing finding *is* the ruling: the payload schemas
  (`Verdict`/`Blocked`/`Claim`) and the `/state` view-models are **two schema
  sets**, and the contract conflated them. `/state` is the only one that crosses
  into TypeScript — `useSwarm` receives it and never receives a payload
  (`decide[]` is `{from,contract,ago,question}`, *not* the `Blocked` payload).
  The payload side is already enforced in Rust at the boundary; mirroring it in
  Zod would type a caller that does not exist. **Hazard named in the ruling:**
  typing `/state` creates a cross-language contract with `~/.swarm/dashboard.py`
  (outside any repo, so ungatable) that nothing enforces — so a parse failure
  must be **loud and visible**, never a silent empty panel. An empty DECIDE
  bucket meaning "schema drifted" is indistinguishable from "nothing to decide".
- **Do not "fix" `reviews[].pr`** — it is the string `"PR #641"`, not a number.
  That is `dashboard.py`'s surface; typing it honestly as a string is correct.
- **#657 is FROZEN at `28b70e87`** (the line moved once — it was `d3cf271e` when
  I called the freeze, and the historian had banked three more verified lessons
  before the ruling landed; moving the line once beats ripping them back out).
  It had grown across every wake, which means *the entire session's durable
  memory existed only in an unmerged draft.* A PR that keeps growing never gets
  reviewed. Further banking goes on a fresh branch.

### Fourth wake — 🔴 THE LEDGER FILE IS PERMANENTLY STALE

**`md5 ~/.swarm/bus.db` is NOT evidence the bus is unchanged, and a `cp` of that
file alone reads a ledger from hours ago.** `packages/swarm/src/main.rs:503` sets
`journal_mode = WAL` and **nothing in the binary ever checkpoints** (`grep
wal_checkpoint` → nothing). Measured side by side:

```
cp ~/.swarm/bus.db alone   → offered 132 | verified 10 | claimed 4 | NO declined column at all
cp bus.db + -wal + -shm    → offered 125 | verified 12 | claimed  3 | declined 16
bus.db 901,120 B @ 20:15      bus.db-wal 4,169,472 B @ 20:42
```

The main-file read is not slightly behind — **it predates two full wakes of
committed status moves.** Found by verifier as a self-disclosed near-miss: their
first read used `cp` of the main file alone and reported the exact opposite of
the truth (13 still offered, 0 declined); trusting it would have falsely
overruled a completed cleanup. The tell was that the main file's md5 was
unchanged across a wake full of writes.

**To read the live bus read-only you must copy the `-wal` and `-shm` sidecars
too**, or query the live file with `sqlite3` (which is WAL-aware — every count
in this file was read that way and is correct).

**A disproven method leaves disproven receipts in circulation.** The unchanged-
md5 proof is cited as a headline receipt in the `C-FEL-REVIEW-0727` verdict.
Asked verifier to qualify it (their conclusion there is independently supported
by "claims write `agents.json`", so it is a qualify, not a retract). *When a
method is disproven, the verdicts that used it do not automatically update —
someone has to go back, and this repo has no mechanism for that.*

Filed as `C-SWARM-WAL-STALE` → builder-b, carrying an **anti-row: a fix must not
disable WAL.** It is on because multiple agent processes read while one writes;
"fixing" this by serialising writers would trade a stale copy for
`database is locked`.

### Fourteenth wake — 🔴 the live bus runs code older than three merged PRs

**Merging a `packages/swarm` PR changes nothing about the binary agents run.**
Measured while triaging #674:

```
installed ~/.swarm/bin/swarm-bus mtime : 2026-07-27 15:10:12
packages/swarm on main AFTER that      : 34f30d8a 15:10 (#651 verify-merged)
                                         8a692439 17:53 (#662)
                                         edba0c5a 20:13 (#664)
```

Consequences worth sitting with:

- **#662 shipped a closed verb enum that #664's own body says would have JAMMED
  THE SWARM — and it never did, purely because nobody deployed it. The
  protection was ACCIDENTAL, not designed.**
- Every verdict this session that verified `swarm-bus` behaviour from a *source
  build* was describing code that **is not running**.
- #674's own fix is equally invisible until someone deploys it.

**Third variant this session of one family** — work committed, pushed, and
*merged*, still unreachable by the thing that needs it: after the architect's
state file in the wrong repo and a stale lesson live on main. **The durability
rule says "push it." It does not say "and make sure the consumer gets it."**

Filed `C-SWARM-DEPLOY-GAP` → builder-b: an embedded build sha the binary can
report, ONE documented rebuild+install command, and a **loud staleness signal**
when the binary predates the repo it is invoked in. *Silence when stale is a
fail.*

**#674 accepted.** Both bar options delivered, anti-row honoured (WAL stays on;
24 concurrent writers, 0 errors). Checkpoint-on-write is deliberately
best-effort — it ignores `SQLITE_BUSY` so a checkpoint failure never turns a
*committed write* into a CLI error. And the real discovery, measured not argued:
**under a held reader neither checkpoint mode flushes to main, but `VACUUM INTO`
does** — so `export` is not a convenience alternative, it is **the only correct
snapshot under concurrency**; checkpointing is the optimisation.
*Could-not-check:* whether a dashboard process is live and holding readers — my
`ps` probe matched my own agent process, because "dashboard.py" appears in my
own prompt text.

**A corruption of my own, disclosed:** the first version of
`C-SWARM-DEPLOY-GAP`'s `must_fail` contained backticks inside an unquoted shell
string. The shell performed command substitution and ate the word, leaving
*"lacks a #651-era capability (e.g.  behaviour)"* — and `swarm-bus` accepted it
at **exit 0**, because the mangling happened in the shell *before the tool ever
saw it*. **A typed payload boundary validates what it RECEIVES, not what you
MEANT.** Re-offered and verified by reading the stored value back out of the DB.

### Thirteenth wake — a wrong lesson is LIVE ON MAIN, and its fix is stuck behind a conflicting branch

🔴 **`docs/lessons/triage-queue-mixed-products.md` is on `origin/main` and every
load-bearing sentence in it is false.** It landed with #657:

```
:62  "is a **founder business fact** neither..."
:65  "Status: SCOPE-DECLINED, ROUTING STILL PENDING. Escalated to the human…"
:77  "…is a founder business fact and stays in DECIDE."
:88  "this one is stuck on prose pending a human routing call"
```

The routing question was a **lookup**, is **answered**, nothing is pending on the
founder, and `C-SWARM-QUEUE-ROUTING` is retargeted with a full spec. **A lessons
file about wrongly escalating is live, containing the wrong escalation** — and
the correction is trapped in **#669, CONFLICTING for three wakes through two
explicit warnings.**

**RULING — split the correction out.** Fresh branch off `origin/main` carrying
ONLY that fix; deal with #669 separately. **When a branch cannot land, the
corrections on it must not inherit its paralysis.** A correction to something
already public is urgent in a way new material is not: new lessons can wait for
a rebase; a live falsehood cannot.

**And the recurrence is the finding.** #669 survived *two* warnings. That is not
a reminder problem — the prose rung was exercised twice and failed twice. *A rung
that fails under test is evidence for the next rung up, not for repeating the
same rung louder.* I stopped warning and changed the shape of the ask instead.

🔴 **`docs/state/architect.md` was created IN THE WRONG REPO.**

```
git ls-remote origin refs/heads/srmcguirt/sydney          → EMPTY  (origin = fellwork/aihu)
git ls-remote …/srmcguirt/agent-swarm refs/heads/…sydney  → 8eaf7ed
git ls-tree origin/main docs/state/  → builder-b, builder, historian, orchestrator, verifier
                                        …and NO architect.md
```

The next architect instance, woken in an aihu worktree and told to read
`docs/state/architect.md` first, finds **nothing**. **This is lesson #20
recurring in a new form** — the same silent right-content/wrong-location failure
that made resume step 1 a no-op, except harder to notice, because every check run
*inside agent-swarm* says the file is fine.

**Partly my fault:** I scoped the agent-swarm override to "this contract only"
to avoid overreaching, which left their default in place — then asked three
times for the file without ever naming the path.
**Ruling, unscoped: durable role state lives in the repo the role is woken in.**
And verify with `git ls-tree origin/main docs/state/`, not `ls-remote` on your
branch — the test is *"does it appear where the next instance will look"*, not
*"did my push succeed."*

The content itself is right, and recovered from the session trace and live bus
rather than from memory — the instrument-over-hand-reasoning rule applied to
one's own history, so what is written is what was actually decided.

### Twelfth wake — 🔴 the queue stopped moving at 01:12Z

**Nothing has merged since #670.** `main` is still `41c37df6` with **13 PRs
open**, several verified, green, and hours old:

```
READY + MERGEABLE : #673 #666 #663 #661 #659 #656
READY (unknown)   : #668 #667
DRAFT             : #672 #671 #665 #654
DRAFT CONFLICTING : #669
```

Landing is the interactive session and I do not merge from a wake. But **a queue
of green verified work is not a neutral state**: every hour it sits, rebase cost
rises, more children go CONFLICTING, and the twin-instance and stale-branch
hazards get more chances to fire. Recorded as a condition of the board.

**The one ordering constraint that must survive: #666 BEFORE #671.**

- **#673 ACCEPTED — and it took the ruling further than the ruling.** I required
  that a missing `rolldown` fail loudly rather than degrade to a silent no-op.
  The builder loaded it lazily inside `measureSizes()` but deliberately
  **outside the per-entry try/catch**, and wrote down *why*: that inner catch is
  for one entry failing to bundle, so a missing bundler caught there would be
  swallowed into `bytes: -1` for **every** entry. The error names the cause, the
  remedy, and the no-bundler alternative. *A comment that stops the next person
  from "tidying" the import inward is doing real work.* `readme-sync` is its own
  always-on job, in the ci-ok needs list **and** the failure loop.
- 🔴 **#669 STILL CONFLICTING after an explicit warning** — two wakes now, base
  merged, every lesson banked into it since is undeliverable. **The recurrence
  is the lesson:** it survived a warning, which is the argument for checking
  `mergeable` at the START of a wake rather than trusting a remembered state.
- **Ledger hygiene:** two different lessons have been called the absent-value
  "ninth". An index with duplicate keys is the small wrongness that makes people
  stop trusting the whole file.

### Eleventh wake — a stack base merged and its child went CONFLICTING silently

- 🔴 **#669 is CONFLICTING.** It was stacked on #657; #657 merged; the child did
  **not** become landable — it became conflicting, and **nothing notified
  anyone.** The historian had been adding wake-items to it for four wakes.
  *When a stack base merges, the child often becomes CONFLICTING and no signal
  fires.* Rung: **check `mergeable` on your own open PR at the START of a wake**,
  not when you go to land it. More insidious than the growing-unmerged-PR trap,
  because a growing draft at least looks like it is accumulating value; a
  conflicting one accumulates value it cannot deliver.
- **`C-SWARM-QUEUE-ROUTING` retargeted to builder-b**, architect's claim
  released by the re-offer. **Their three-outcome sharpening is ratified
  verbatim, and it corrected me:** I wrote "a distinct EXCLUDE *reason*", which
  keeps 24 actionable items inside a bucket whose whole meaning is *stop looking
  at these*.

  ```
  KEEP           project==aihu          → becomes an offered contract
  EXCLUDE        project in {data,web}  → owned elsewhere; TERMINAL
  NEEDS-PROJECT  no project set         → UNCLASSIFIED; its OWN list
  ```

  **EXCLUDE is terminal; NEEDS-PROJECT is actionable.** A reason-field does not
  carry that to a human scanning output; a third outcome does. The difference is
  between a taxonomy and a **worklist**, and only one gets acted on.
- **SEQUENCING RULING:** builder-b takes `C-SWARM-WAL-STALE` **first**, then
  routing. Both are `packages/swarm/src/main.rs` — WAL-STALE at `open_db`
  ~496-503, routing at `263` / `1496-1632` / `1785`. Regions do not overlap, but
  **two in-flight branches on one file is the collision hazard that has bitten
  this swarm five times.** One after the other.
- **House style, named because the architect reached it three times
  independently:** `/state` `error()` keeps the last good frame rather than
  blanking; `sync --pull` says KEEP/EXCLUDE rather than trusting a filter; an
  unclassified item is visibly unclassified rather than silently mixed into
  terminal noise. One sentence covers all three — **make the machine SAY what it
  did, especially when what it did was "nothing."** Every silent-wrong failure
  this session (the inert paths filter, the dead matrix lane, the stale ledger
  read, the suppressed manifest) is the machine doing nothing and saying nothing.
- **Tool gap, second face:** I can hand a contract over by re-offering (it
  releases the claim), but I **cannot amend a claimed contract's bar** without
  releasing the claim. Same gap, two symptoms.

### Tenth wake — I escalated a lookup, and it cost two wakes

**`C-SWARM-QUEUE-ROUTING` was never a founder decision.** I sent it to DECIDE as
*"a business fact I do not have."* It was a **lookup**, answerable with one
GraphQL query:

```
Linear team FEL projects:  aihu [started] | data [started] | web [started]
FEL-433 → aihu   FEL-434 → aihu   FEL-411 → aihu     (contracts we are building)
FEL-300 → data   FEL-332 → data   FEL-335 → data
FEL-311 → web    FEL-262 → web                       (5 of the 13 I declined)
```

**The attribute is `project`; the value is `aihu`.** The workspace was already
organised the way the question asked about.

**MY ERROR:** *"escalate what depends on business facts you do not have"* has a
precondition I skipped — **first establish that the fact is not available to
you.** Escalating a lookup is not caution, it is a stall. Same shape as the glob
trap: a conclusion reached by reasoning about my own position rather than
running the query. **Second time this session my own unverified premise cost
someone a wake** (C-FEL-READMESYNC-JOB was the first).

🔴 **AND THE RESIDUAL IS THE REAL FINDING:**

```
144 open FEL issues:  aihu 90 | NO PROJECT 24 | data 17 | web 13
```

The 24 with **no project** include **FEL-459/449/443/442/424/423/421/420/419 —
every one an aihu contract in our own queue right now.** A naive
include-iff-`project==aihu` filter would have **silently dropped nine active
contracts** — the front-door absent-value failure the bar forbids, and it would
have shipped to anyone who took "the attribute is `project=aihu`" as the whole
answer. The architect's **loud-exclusion** design is load-bearing, not a nicety.

Ruling: filter on `project`, never the title; `sync --pull` emits KEEP/EXCLUDE +
reason for every open FEL issue; **"no project set" is a DISTINCT reason from
"project=data/web"** — one is definitely-not-ours, the other is unclassified and
a ten-second human fix. Must-fail: the dry-run's no-project bucket must contain
those nine ids. Retargeted to a Rust builder; semantics fixed, value known.

### Also tenth wake

- 🟢 **`C-FEL-411` is FIXED — PR #671.** The guard **derives** required edges
  from actual imports (static/type/dynamic/require, any subpath) rather than
  hand-listing; cycle-safe (would-be-cycle imports reported informational, so
  the three deliberate lazy-import cycle-breakers survive); bounded soundly
  (skips no-real-tsc projects, does not descend into nested scaffold projects).
  Found **56 missing edges across 19 packages**, naming
  `packages/editor/moon.yml must add dependsOn: - compiler`. Ordering proven
  three ways, including `moon query projects` exit 0 to show the 56 edges added
  no cycle — the check most people skip.
- **LANDING ORDER: #666 MUST LAND BEFORE #671**, not merely "both must land."
  #666 alone = monotonic improvement. **#671 alone would take an
  intermittently-red lane and make it deterministically red** (every
  newly-ordered cold `compiler:build` hits `rolldown: command not found`), which
  is how a correct guard gets reverted by someone who did not read the caveat.
  The dependency must be stated **in #671's PR body**, not only on the bus.
- **Retire the flapping-gate caveat once #671 lands.** Six wakes of rulings
  carry *"do not treat `check` as evidence until C-FEL-411 lands"*; that tax
  should end the moment it is untrue.
- **`C-SWARM-SCHEMA` closed out — PR #672**, body intact (which is why I did not
  open it for them). The architect independently applied the *same* loud-failure
  principle in two contracts: `state()` keeps the last good frame rather than
  blanking, and `sync --pull` says KEEP/EXCLUDE rather than trusting a filter.
  **Prevent the silent-wrong outcome by making the machine SAY what it did** —
  ratified as house style.
- **The architect has NO durable state and it shows.** `docs/state/architect.md`
  does not exist; they have re-derived the same evidence repeatedly and had two
  messages cross rulings they would have found in their own file. Told them to
  create it — the widened-surface ruling already permits it, so no permission is
  needed.

### Ninth wake — `.git` as a FILE vs a DIRECTORY decides whether /tmp is fatal

**The architect's `C-SWARM-SCHEMA` work was committed but unpushed, in
`/tmp/aihu-swarm-zod`** — the state the durability rule exists to prevent. It was
**less dangerous than it sounds**, and telling the two apart is worth knowing:

```
/tmp/aihu-swarm-zod/.git is a FILE →
  gitdir: /Users/smcguirt/conductor/repos/aihu/.git/worktrees/aihu-swarm-zod
main clone holds the ref:  refs/heads/feat/swarm-state-zod = 7b8dc599
and the object:            git cat-file -t 7b8dc599 → commit
```

**`.git` as a FILE = a worktree; objects and refs live in the PARENT clone,** so
a `/tmp` wipe costs the checkout, not the commit. **`.git` as a DIRECTORY = a
standalone clone, and then `/tmp` really is the only copy.**

**I pushed it** (`feat/swarm-state-zod` → `7b8dc599`, verified via `ls-remote`)
at the author's explicit request, on a clean tree. Pushing a feature branch is
not merging, tagging, or releasing — it is inside what a wake may do, and the
alternative was real work living on one machine, invisible to the human and to
every gate. **I did NOT open the PR:** the architect has a body written, and
opening one with my words would discard theirs and risk misstating the
`dashboard.py`-is-ungated caveat, which is its most important sentence.

- **Ratified:** hand-rolled validator over `zod` — `zod` is absent from the
  monorepo and `@aihu/use` is deliberately dependency-minimal. "Same substance,
  zero new dep, cheap to flip" is the right trade, and *cheap to flip* is what
  makes it safe to accept.
- The schema must-fail row they added unprompted is the one that matters: a
  renamed field on a CLOSED array names the error **and `state()` keeps the last
  good frame — never blanks to empty.** A schema failure that empties the DECIDE
  bucket is indistinguishable from "nothing to decide."

### Also ninth wake

- **#668 PASSES** (verifier, from their own source-built compiler, both
  directions). Three things beyond the ask: they **grepped the client bytes**
  for `reports:read`/`rateLimit`/`registerAgentMetadata` and found zero — my
  ruling *asserted* the sidecar is not client bytes; they proved it, and a hit
  there would have made option (b) wrong. They **measured** the manifest
  collision (two components → one `agent-manifest.json` listing only the second),
  converting `C-FEL-434b` row 2 from argument to reproduction. And they **named
  what is still owed**: the policy-not-public guarantee is unverified as of #668
  and lives on 434b.
- **#656/#667/#668 all `ci-ok=PASS`.** #667's own `check` **ran and passed** on
  its own `plan-a.yml` diff — the fix is not inverted, confirmed by execution as
  well as by the matcher.
- 🟡 **#667 `bench=FAIL` is not the diff — but it is not proven noise either.**
  The `bench:` filter includes `.github/workflows/plan-a.yml`, so a workflow diff
  **trips the filter, not the numbers**; `bench` is outside `ci-ok`; the STOP on
  re-baselining stands. **But** `bench` is normally SKIPPED, so this is one of
  the few times it has actually run, and it reports **cellx 807→910 ns (12.7%)**
  and **wide-fanout-100 5363→6351 ns (18.4%)** against the frozen 2026-05-25
  baseline. That is either two months of real drift in `@aihu/signals` or the
  high-variance flakiness `C-FEL-409` targets. **One sample cannot tell.**
  Recorded as could-not-check, not dismissed: *"red-by-construction" answers
  whether it blocks the PR; it does not answer whether the numbers mean
  something.*
- **Third crossed message this session.** Naming the message id in every ruling
  is now standing on both sides — cite the id when re-raising.

### Eighth wake — a contract of mine was unbuildable, and only the builder's pre-build check caught it

**`C-FEL-READMESYNC-JOB` could not be built as written, and the defect was in my
contract.** I specced two constraints: *(1)* a cheap always-on job, no
`bun install` — *"sync-readme --check needs only bun and the repo"*; *(2)* do
not touch `scripts/sync-readme.ts`. They cannot both hold:

```
scripts/sync-readme.ts:29   import { rolldown } from 'rolldown'   ← STATIC, top-level
:274                        the ONLY rolldown() call — in the MEASURE path
empirical: move node_modules/rolldown aside → `--check` exits 1
           "Cannot find package 'rolldown'"
```

`--check` only **reads** the committed `scripts/__bundle-sizes.json`, yet it
loads a bundler it never calls. Verified against source before ruling.

**RULED (b): make the import lazy.** The coupling is *accidental, not designed* —
a static import at the top of a file that grew two modes. Option (a) would have
preserved my mistaken sentence by making the job ~100× more expensive,
reintroducing the exact install cost #667's filter exists to avoid, and leaving
the coupling to bite the next person. **Surface amended** to
`plan-a.yml + scripts/sync-readme.ts (rolldown decoupling only)`.

**Added must-fail row, because a dynamic import invites a specific trap:** with
`node_modules/rolldown` absent, `--check` must now SUCCEED *and* the measure
path must **fail loudly**. A dynamic import wrapped in try/catch turns a
measurement into a silent no-op — the absent-value family, and a worse outcome
than the coupling being removed.

**THE LESSON, and it is about me:** *a contract premise is as falsifiable as a
code claim, and nothing in this system checks it.* Every bar demands the
**builder** prove their work; nothing demands anyone prove the **contract**
before work starts. I asserted "needs only bun and the repo" from reading *which
script it was*, not from running it — the identical hand-reasoning failure as
the glob trap, one layer up, committed by the person who wrote the rule against
it. **Second instance this session:** C-FEL-434's framing implied a naive
un-elide, and the builder blocked rather than building it, which is the only
reason a deliberate security posture was not reversed. Two for two.
**A contract is an unverified claim wearing the costume of a specification.**
The builder's pre-build premise check is currently discretionary discipline; it
should be the first must-fail row of every contract.

**TOOL GAP:** `swarm-bus` cannot **amend a claimed contract's bar** — re-offering
resets status to `offered` and releases the claim. So the amendment lives on the
bus while the contract row still carries the stale, unbuildable surface; anyone
reading the ledger sees the wrong bar. Sits next to *"no index of which verdicts
cited which method"* — **two places where the ledger cannot express a
correction.** Not filed: no design I believe in yet.

**#667 and #668 are BOTH GREEN.** #667 `check=SUCCESS`, `ci-ok=SUCCESS` — its
own `check` job **ran and passed**, so the filter-inversion test is settled by
execution as well as by the matcher. #668 went green at `99be3b03` after a
concurrent instance pushed the compiler-binary bump; the builder correctly read
*which* job had failed (`check:compiler-binary-bump`) and did not duplicate it.
That is a **fifth** concurrent-instance-on-a-shared-branch event — benign and
green this time, and it belongs in the tally as such, since a record of only the
harmful ones understates how often this happens.

### Seventh wake — 🔴 the Scaffold DX `matrix` lane is DEAD, not flaky

**13 of 15 cells never run a line of aihu code.** Triaged from a red `matrix` on
#656 (run `30318406544`):

```
FAILED  pm-install: command npm install exited with status 1
FAILED  pm-install: command yarn install exited with status 1
  Error: proto::commands::run::fallback_loop
  × Unable to run node, as the global executable found at
    /opt/hostedtoolcache/node/22.23.1/x64/bin/node is a proto shim, which
    would trigger a recursive execution loop.  … caused by HOME or PROTO_HOME changing.
SUMMARY  2/15 cells passed, 13 failed, 1 package manager(s) skipped
```

Every cell dies at **package-manager install**, before any aihu code runs, on a
collision between moon's `proto` shim and the GitHub-hosted node. **Red on
`main`** (run 2026-07-27T10:41:31Z) and on `changeset-release/main`,
`chore/release-guard-cf-team`, and three FEL-431 branches — continuously. It
sits **outside `ci-ok`**, so nothing forced anyone to look.

- **It is never any PR's diff.** #656 changes `external` arrays in three
  `rolldown.config.ts` files; nothing in a bundler externals list can affect
  whether `npm install` resolves node. Rule "merges" and move on.
- **Same root as `C-FEL-MOON-ROLLDOWN`** — moon/proto PATH assumptions not
  holding in the real environment. Two instances, one root, found four wakes
  apart by different people.
- **A dead gate does not just stop catching bugs — it makes other people's work
  unverifiable, and they pay without knowing why.** #663 (C-FEL-431) shipped
  with an honest could-not-check: *"typecheck exit 0 on the pristine scaffold
  needs the real `create-aihu` pipeline."* **The matrix lane is that pipeline.**
  A dead gate silently converted a verifiable question into a permanent
  could-not-check on someone else's contract.
- Filed as `C-FEL-MATRIX-PROTO` → builder-b, ranked **third** behind
  `C-FEL-411` and `C-SWARM-WAL-STALE`. Its must-fail carries the anti-recurrence
  row: after the fix, a **deliberately broken scaffold must make the lane go
  red** — a lane that cannot fail for a real reason is not a gate.

### Also seventh wake

- **#657 is GREEN and landable** — `ci-ok=SUCCESS`, `check=SUCCESS`,
  `examples=SUCCESS` on the ready run (the SKIPPED/FAILURE pair is the draft
  run). Verified independently, not taken on report. The C-FEL-411 race did not
  bite it.
- **The C-FEL-REVIEW-0727 md5 receipt is struck, and the replacement is
  stronger.** Verifier went back unprompted on an already-accepted verdict.
  *"All swarm-bus tests ran on `SWARM_DB=<temp>`; the live `bus.db` was never
  opened by a test"* is **isolation by construction**; the md5 line was
  **detection after the fact**. Prevention beats detection — the original had
  simply led with the weaker of two receipts it already held.
  **An accepted verdict is not a closed one.** And the walk-back happened only
  because one person remembered writing the line: this repo has **no index of
  which verdicts cited which method**, so the mechanism does not scale. Named,
  not solved — deliberately not filed, because "index your receipts" has no
  falsifiable bar I believe in yet.
- **A red lane must be NAMED in a verdict, not omitted.** A verdict that quietly
  drops a known-red job is how a *real* failure hides behind a known one next
  time.

### Sixth wake — the PR that writes the rule it violates

- **#667 PASSES and is cleared to land.** Verifier verified it with a real
  picomatch 4.0.5 matcher under dorny's options, patterns **parsed from the PR
  head** rather than retyped — and, the step that matters, **proved the matcher
  faithful first** by reproducing the known pre-fix inert bug before running the
  new patterns. An instrument not shown to reproduce a known-wrong answer is
  just a second opinion. Nothing in that verdict rests on anyone reading a glob
  correctly, which is the point: three readers got this filter wrong by
  reasoning about it (architect twice, me once).
- 🔴 **`sync-readme --check` is a docs-facing gate sitting inside `check` — and
  #667's own comment forbids exactly that.** The PR added: *"a docs-facing gate
  must NOT be a step here, or it would silently skip on the doc-only PRs it most
  needs to run on; it goes in its own always-on job instead."* One screen above,
  at `plan-a.yml:123`, sits `bun scripts/sync-readme.ts --check`, which consumes
  root + `packages/**/README.md` and fails on drift. Post-#667 a README-only PR
  yields `code=false`, `check` skips, and drift is uncaught in CI.
  **Not a bug in #667** — the filter is correct and replaces one that had never
  discriminated; #667 merely makes a pre-existing misplacement start to bite.
  Filed as `C-FEL-READMESYNC-JOB` (needs `C-FEL-433`).
  **The lesson:** *a rule stated in prose does not audit its own file.* The
  author wrote the correct rule and did not sweep the file for existing
  violations — prose has no way to ask "what else here is already like this?"
  Rung: prose rule → a check that enumerates docs-facing gates and asserts each
  is its own job.
- **"The pre-commit hook catches it" is NOT a valid mitigation in this swarm.**
  The husky hook is `--no-verify`-bypassable and agents here push `--no-verify`
  routinely for docs (verifier on #659 and said so; historian too). A guarantee
  whose only backstop is a bypassable local hook is void precisely for the
  population it would need to cover.
- **Rejected the carve-back** (README back to `code=true`): it would make every
  prose-only README PR pay `bun install` + build + Rust + typecheck — the exact
  cost the filter exists to avoid. The cheap always-on job (the `lesson-refs`
  pattern: checkout + one run step) buys the coverage back at seconds. And it
  must go in the **ci-ok failure loop**, not just `needs[]` — #649 proved
  `needs[]` alone is sequencing, not enforcement.
- **#657's freeze point is `28b70e87`, confirmed** — the historian flagged that
  it sat one commit past the `d3cf271e` I named. That commit *is* the three
  additions I had asked for; freezing literally would discard the work the
  freeze was called to protect. Flagging a named SHA that has moved under you,
  rather than guessing which way I meant it, is the correct handling.
- **`C-FEL-428` deferral accepted.** *"A wrong meta-gate is worse than none"* is
  the correct reasoning: a gate certifying other gates is the one place a
  plausible-but-broken version is actively harmful, because it converts
  "unaudited" into "audited and fine." Left `offered`, not claimed — a claim is
  a lock, and the builder has now twice declined to hold one they were not
  building. Not reassigned: builder-b holds `C-FEL-411` (a flapping *required*
  gate) plus `C-SWARM-WAL-STALE`, both of which outrank it.

### Fifth wake — C-FEL-434 split and shipped, and a sidecar that overwrites itself

- **The C-FEL-434 ruling landed at the size it should.** PR #668 is three files,
  and the entire compiler change is deleting one branch of one conditional —
  the `if elide_agent { String::new() }` at `emit.rs:398`. `bin/main.rs:559`
  already wrote the sidecar whenever non-empty, so nothing had to be added. The
  fix for "client builds advertise no components" was **un-suppressing a file**,
  not shipping policy to browsers. Client JS elision, T1-b, and the size rows
  are all untouched.
- **Renaming a test that encoded the bug beats deleting it.**
  `build_target_client_suppresses_manifest` was renamed with the reasoning
  inline. A deleted test leaves no trace that the old behaviour was deliberate
  and wrong. (Same shape as `slot_default_codegen` on #655.)
- 🔴 **`agent-manifest.json` OVERWRITES ITSELF, and the follow-on is the half
  that reads it.**
  ```
  bin/main.rs:559   format!("{}/agent-manifest.json", dir)   ← FIXED name
  bin/main.rs:550   format!("{}/{}.ts", dir, tag_name)       ← per-tag, right beside it
  ```
  Multiple tags can share one `dir` — that is *why* `out_file` is per-tag. So N
  agent components compiled into one output directory leave **one** manifest.
  The docs contradict themselves about it: `agent-discovery.md:265` says "one
  per output directory"; `authoring-agents.md:374` says it is emitted "for every
  SFC that has exposed state or actions."
  **Pre-existing (server builds always had it), not #668's doing — but #668
  widens it to client builds and `C-FEL-434b` is the code that will read these.**
  A naive reader lists one component where five exist, which is the *same defect
  class FEL-434 exists to close, one level down and quieter*: "## Components
  lists 1 of 5" reads as a populated section, not an empty one. `must_fail` row
  2 on `C-FEL-434b` requires two components in one dir to both appear; the
  addressing scheme is the builder's to choose.
- **`C-FEL-434b` = GitHub #430**, "give `agent-manifest.json` a consumer". Four
  doc blocks currently assert the gap and go stale the moment it lands:
  `agent-discovery.md:69`, `:283`, `authoring-agents.md:20`, `:376`. Updating
  them is in the contract — otherwise it ships the FEL-439 defect class by hand.
- **A guarantee can go missing between two green PRs.** The policy-not-public
  row (a `$scope` component listed in `## Components` while `llms.txt` does not
  contain the scope string) *cannot be tested on #668* — there is no `llms.txt`
  in it. Verifier was told to verify #668 **and say in the verdict that the
  guarantee is unverified as of this PR and lives on the follow-on.** Half a fix
  verified without naming what the other half still owes is how the whole thing
  quietly never gets checked.
- **Could-not-check, stated rather than implied:** I did not trace whether the
  compiler's output `dir` is ever copied wholesale into *served* output. The
  manifest joins the same tier as `.route.json`, an established build
  intermediate, so the precedent is good — but precedent is not evidence. If
  that tier turns out to be served, the policy guard stops being about `llms.txt`
  rendering and becomes about the file itself.

### Also fourth wake

- **`C-GH-483` declined** (decomposed into `-a`…`-f`). Both epic families now
  verified clean: **every `needs` edge in the 483 and 487 families points at a
  barred, claimable contract**, and no child hangs off a declined row. The
  decomposition template is proven on two epics.
- **Bar the full arc up front; do not wait for the base to land.** Ruled on the
  ts-gen second wave. *A barred-but-blocked contract is cheap* — it sits behind
  a `needs` edge and nobody claims it. *An unbarred one is expensive* — it
  recirculates through triage every pass, which is the loop that cost the
  architect nine batches. And the person holding the arc in context now is the
  cheapest person to bar it.
- **Messages cross, twice now** (`f5755c4c`, `09e8cec5`) — the architect
  re-raised as still-open something already ruled, costing a wake each time.
  Not their fault; the transport cannot prevent it. Remedy adopted: **name the
  message id in the ruling** so a crossed reply is greppable, and check
  `watch --role <you>` before re-raising.

### Published vs repo — verified 2026-07-26 via `npm view <pkg> version`

```
@aihu/cli               1.0.1     (#602 would publish 1.1.0)
@aihu/signals           0.5.0
@aihu/arbor             4.0.0
@aihu/compiler          1.1.1
create-aihu             0.1.6
@aihu/templates-cf-team 3.0.1
@aihu/editor            0.1.2
@aihu/magna             0.2.5
```

Everything merged after the last publish is **on main and unpublished**. Cutting
that release is an open decision for the founder.

## Corrections to the previous state of this file

Recorded loudly, per the historian rule that a memory keeping only wins is worse
than none.

- **The landing order in the previous version of this file is resolved, and one
  quarter of it never landed.** It said `#546 → #550 → #556 → #539`.
  Verified: `#546` = `edc15f2a`, `#550` = `9d8a49db`, `#539` = `26268c42` — all
  merged. **`#556` is CLOSED, not merged** (`gh pr view 556 --json state` →
  `CLOSED`). INV-A's objection to its `paths`-filter half stood. Do not go looking
  for it on main.
- **The gbrain orchestrator-state page lists `#611` and `#613` as open. Both are
  merged** — `6bcef501` and `8aa12dc1` respectively. `#614` (conductor.json →
  `.conductor/settings.toml`, `d0c9200c`) is on main and absent from that page
  entirely. The page was written at 17:01Z and was wrong by 17:23Z.
- **All 24 PRs the gbrain page claims merged, are merged.** Verified by mapping
  each subject-line `(#N)` suffix to its commit on `origin/main`; see
  `docs/state/historian.md` for the method and why the naive
  `git log --grep="(#N)"` version of that check was itself wrong.

## Standing rulings (do not re-litigate)

### NEW — the findability rule: `git show origin/main:<path>`, never `ls-remote` on your own branch

Promoted to a standing rule for **every** role, from a self-catch by verifier
against their own work (unprompted, in the expensive direction).

**`git ls-remote <your-branch>` proves the push SUCCEEDED. It never proves the
artifact is FINDABLE where the reader is told to look.** Push-verified and
reader-verified are different claims, and the first silently impersonates the
second. Verifier had been running `ls-remote` on their branch every wake for 13
wakes; `docs/state/verifier.md` on `origin/main` was still the 2026-07-26
Round-1/2 file, and every Round-3 lesson was trapped in an unlanded branch. A
next verifier instance told to "read your durable state FIRST" would have been
blind to the entire session while every push receipt looked green.

**The check is `git show origin/main:<path>` or `git ls-tree origin/main <dir>`.**

Disposition of the two instances of this class:

- **verifier — CLOSED.** #659 merged 01:46:01Z. I ran *their* test rather than
  trusting the merge: `git show origin/main:docs/state/verifier.md` now returns
  `Last updated: 2026-07-27 (Round 3 …)` with the isolation rule, the C-FEL-434
  bar, and the WAL addendum all present on main.
- **architect — STILL OPEN.** `git ls-tree origin/main docs/state/` returns
  builder-b, builder, historian, orchestrator, transcripts, verifier — **no
  `architect.md`**. #675 is the fix, draft, `MERGEABLE`/`CLEAN`, unlanded. It is
  now the **only** unlanded durable-state gap in the swarm.

**The cause of the architect gap was mine**, and it is worth keeping as a
pattern: I scoped the `C-SWARM-SCHEMA` override too narrowly (leaving their
default in `agent-swarm`), then asked three separate times for `architect.md`
**without ever naming the path**. Three asks, zero paths — so the file landed in
the wrong repo, correct content, silent. **When you ask for a file, name its
full path.** Architect absorbed a failure I created and did not push back on it.

Note what architect did *right* under pressure to claim success: with six PRs
merging around them, they reported "the file is NOT on origin/main yet — it is
on the PR branch," and named the test they could not yet run true. **That is the
difference between a report and a claim**, and it is the behaviour to reward.

### Coordination protocol — adopted 2026-07-26, after paying for it three times

- **A claim is not a claim until it is in Linear.** *"I am filing X unless you
  object"* posted to a channel that scrolls and truncates is **not ownership — it
  is a hope.** Claim/file first, then work. Adopted after the orchestrator wrote
  that instruction for three agents and then broke it on intake within the hour:
  FEL-431 and FEL-432 were the same cf-team defect, filed an hour apart by two
  agents who had each verified it independently. **FEL-432 cancelled; FEL-431
  stands, raised to P1.**
- **No more "shout in the next few minutes" windows, in either direction.**
  **Silence means nothing on this transport.** If you need a ruling, say
  *"blocking on a ruling"* and stop — it is a hard gate, not a courtesy window.
  If someone must wait, say *"hold"* and they hold until answered.
  Three instances in one afternoon: builder shipped #619 on a two-minute silence
  window; the orchestrator answered that window eleven minutes later; verifier
  filed on a "few minutes" window and the orchestrator filed the duplicate.
- **Rulings go on the PR or in Linear. Slack gets a pointer only.** Adopted after
  three rulings evaporated in-channel in one afternoon: builder shipped #619
  against a ruling that had not reached it; builder-b asked twice for an answer
  already given; the historian reported three *decided* items as still open. The
  channel truncates at ~2 kB and had been *proven* to truncate two hours before it
  was still being used for load-bearing decisions.
- **Check Linear before reporting anything as unowned or undecided.** The channel
  is a notification, not a source of truth.
- **Merge authority for docs-only PRs is the historian's — under a stricter test
  than "`ci-ok` green".** `ci-ok` passes when its needs *succeeded **or were
  skipped***, and a draft skips them all, so the required status is satisfiable by
  a PR that compiled nothing (instance 48). Before merging or arming auto-merge:
  assert `check-runs.total_count > 0` **and** that `check` itself concluded
  `success` — not merely that `ci-ok` is green. Scope stays narrow:
  `docs/lessons/**`, `docs/state/**`, `docs/retros/**` only; anything touching
  `scripts/`, `.github/` or `package.json` goes to the orchestrator.
- **Ownership is by SURFACE, not by file.** `packages/cli/**` + config +
  `docs/plans/**` vs `examples/**` + `scripts/build-governed-examples.ts` +
  `governed-roster.json` + `.tastemaker/**` + `plan-a.yml`. Splitting a shared
  file between two owners does not work; splitting the surface does.


- **Bench baselines: the STOP on regenerating stands** until the harness measures
  shipped artifacts rather than source in dev mode. Regenerating now canonises
  numbers describing an artifact nobody ships.
- **Publishable metrics are counted metrics only** — DOM move counts, writes/op,
  size rows. Not timings. Rationale, worth keeping verbatim: *a dead binding sends
  a count to zero, which screams; it sends a timing down, which flatters.*
- **Cross-machine ratios against a checked-in baseline are meaningless.** The
  26x/8.8x discrepancy resolved to a 3.11x hardware gap (751 ns CI ubuntu vs
  241 ns local M5) over a fabricated denominator. `#607` is the truth file.
- **The real arbor number is ~1.10x the true vanilla floor** (~185 ns through
  shipped `dist` vs a 168 ns cached-text-node floor). The committed `vanilla`
  adapter, whose own README calls it "the theoretical minimum", is **9.2x off that
  floor** — every inflated ratio removed on 2026-07-25 was measuring that gap.
- **`ci-ok`: the required check-run must NOT gain a `name:` field.** Adding one —
  even cosmetically — renames the check-run, the required context `ci-ok` never
  reports, and branch protection **silently detaches**: PRs stay mergeable with
  nothing enforced and no error anywhere.
- **`agent` template folds INTO `full`, it is not deleted.** `full` becomes the
  kitchen sink. `#601`'s `server.ts`/`mcp.ts`/`readiness.ts` generators are what
  `full` needs.
- **`--no-agent-tooling`, not `--no-ai`.** Removes developer-env files only, never
  the runtime agent surface.
- **daisyUI Option 4 design pass gates all other UI/CSS work.** It had never been
  written; it now exists at `docs/plans/2026-07-26-option-4-daisyui-design.md`.
  Slice 1 landed as `#604`.
- **`#608` style-lock amendment ratified** — single-accent protects *identity*;
  state hues are exempt inside closed oklch bands under a chroma cap. The
  2026-07-23 indigo falls in no band.
- **Config's home is `vite.config.ts`** (founder redirect). The LSP/VSCode/CLI read
  it there. `svelte.config.js` existed only because the language server could not
  parse the Vite config; SvelteKit 3 makes `vite.config.js` the required location.
- **Use `fable` for hard code and review** (founder standing instruction).
- **A cell that cannot run is SKIPPED, not failed.** And scaffold-matrix PR runs
  use `--mode local`; npm mode is for the scheduled run and post-release only.

## Blocked on the founder

1. ~~**Route the non-aihu backlog.**~~ **RESOLVED tenth wake — it was a lookup,
   not a decision.** The attribute is Linear `project`, the value is `aihu`, and
   it already existed. See the tenth-wake section, including the 24 no-project
   issues that make loud exclusion mandatory. **Nothing owed by the founder.**
   Original framing kept below as the record of what was wrongly escalated.

   **Route the non-aihu backlog.** At least **13** offered contracts
   (`C-FEL-262/264/265/279/280/282/291/298/300/311/315/332/335` — lexicon,
   pericopes, exegesis verdicts, Sefaria commentary, the Stripe `usr.profiles`
   entitlement bridge) are fellwork's exegesis/Bible product, not aihu. Options
   put to the founder 2026-07-27: scope `sync --pull` by Linear team/label, move
   the issues, or work them here. Cannot be decided by an agent — it depends on
   how the founder wants the Linear workspace organised. **Failure mode if
   unanswered: nothing breaks, the queue just stays ~10% noise forever and every
   triage pass re-discovers it** — which is precisely why it will never get fixed
   without a ruling.
2. **Cut the release.** Everything is on main and unpublished; this session alone
   added #639/#640/#641/#653/#658/#664 with #655 ready to land. Outward-facing
   and irreversible, so no wake may cut it. Open since 2026-07-26.
   **Split as of the third wake:** the *scope* half is decided and executed;
   only the routing target remains, now on its own contract
   `C-SWARM-QUEUE-ROUTING` (bar filed, blocked pending the answer). Its bar
   **forbids keyword matching on titles** as the scoping key — it must be an
   explicit tracker attribute — and carries an anti-row: a genuine aihu issue
   that superficially resembles the excluded set must be KEPT. Misclassifying at
   intake would silently drop real aihu work, which is worse than the noise.
3. **`@state` model: is a bare `let x = 0` auto-reactive, or is
   `let x = state(0)` required?** The public authoring surface — what a person
   types in a `.aihu` file — so it is not an agent's to settle. **Non-blocking:**
   the architect ruled EXPLICIT as the working decision (Svelte 5 runes require
   `$state()`, Solid requires `createSignal()`, both having rejected implicit
   auto-reactivity as the invisible-reactivity footgun the epic itself names; it
   also matches the FEL-391 ruling). A flip is cheap — children `C-GH-487-a/-b`
   change their `let` treatment and the seams and must-fails do not move — which
   is precisely why decomposition proceeds without an answer.

**Note the shape of item 1 after the second wake:** the *scope* half is settled
and executed; only the *routing target* still needs the founder. An escalation
that cannot be split blocks everything behind it; one that can should be.

**Both former items on this list are RESOLVED and must not be re-escalated:**
FEL-391 (E1) was ruled by the architect — *ratify "replace, don't mutate"; no
deep Proxy layer; field-level reactivity via a record-of-signals*. FEL-423's
remainder was ruled by this wake as C-FEL-434 option (b) (see Rulings above);
it never needed to be a product question, because `manifest_json` is a build-time
sidecar and not client bytes.

## 🔴 `ci-ok` FLAPS — a red X on your PR may not be your diff

**Until `C-FEL-411` lands, a required-check result is not by itself evidence.**
Read *which job* failed and ask whether your diff could possibly have caused it.

`PR #661` is a **one-file markdown diff** whose required `check` went red:

```
run 30317184761 / job `check` / step `bun run typecheck`
  editor:typecheck | tests/component-compile.test.ts(16,31): error TS2307:
    Cannot find module '@aihu/compiler' or its corresponding type declarations.
  × Task editor:typecheck failed to run  ╰─▶ Process bunx failed: exit code 2
  → ci-ok FAILURE (CHECK_RESULT: failure, IS_DRAFT: false)
```

Cause, read from the file rather than inferred: `packages/editor/moon.yml`
declares `dependsOn: [signals]` **and nothing else**, while
`packages/editor/tests/component-compile.test.ts:16` imports `@aihu/compiler`.
The graph is missing the edge, so `editor:typecheck` can be scheduled before
`compiler:build` and the declarations do not exist yet.

`main` is **green** on every recent run (`edba0c5a`, `8a692439`, `622fa289`,
`2350f49c`) — so this is a **race, not a breakage**, and that is what makes it
serious: *a red X might be your diff or might be the race, and a green tick
might be correctness or might be luck.* Both are absent values rendered as real.
Dispatched to builder-b as `C-FEL-411`, paired with `C-FEL-MOON-ROLLDOWN` (same
`moon.yml` surface, same root class: **the task graph does not describe the real
dependencies**), with two added acceptance rows — the guard must name
`packages/editor` on today's graph, and it must **derive** required edges from
what packages actually import rather than hand-list them (a hand-list drifts the
way the `node:` allowlists and the `publish-all` PKGS array did).

## Queue shape — measured 2026-07-27, not estimated

```
offered                     127 → 118 → 125   (13 non-aihu + C-GH-487 out;
                                               then epic children + new contracts in)
  ...of which carry a bar    19 → 23           (all authored by the architect)
claimed                       4 → 3            (builder released 424/427 per ruling)
no-claims                    14 → 16
verified                      9 → 12           (three status moves, wake 1)
declined                      0 → 16
```

`offered` going **up** after a clearance is the healthy direction: the removals
were un-barrable noise, the additions are barred, claimable work.

The architect's own composition finding stands and is the reason "127 offered"
overstates the work: after the reproducible-bug seam was drained (~21 barred),
the remainder is **~28 epics/families** needing decomposition, the 13 non-aihu
items above, a set of exists-with-feature-gap composables whose one-line notes do
not pin a falsifiable behaviour, and design items that are architect rulings
rather than builder bars. **Do not read the raw `offered` count as a backlog.**

Pulled Linear titles live in the `note` column, not `issue` (`issue` gets the
bare identifier). `sync --pull` is working correctly — I nearly filed a bogus
tooling contract by querying the wrong column first.

## Linear ledger — queried live 2026-07-26, NOT copied from the channel

The in-channel record said **"FEL-407 reopened, link 2 outstanding."** It is
**Done**. Do not act on the channel's issue states; they are point-in-time and
several had already moved. Re-query rather than trusting any of the below:

```bash
KEY=$(security find-generic-password -s LINEAR_API_KEY -w)
curl -s -X POST https://api.linear.app/graphql -H "Authorization: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ issue(id: \"FEL-409\") { identifier state { name } title } }"}'
```

| issue | state (2026-07-26) | title |
|---|---|---|
| FEL-407 | **Done** | [bench] The 122x nodeValue claim is false and ships in the README |
| FEL-408 | **Done** | [bench] js-framework-benchmark harness measures 0.00 ms and reports success |
| FEL-409 | **In Progress** | [bench] Gate policy: p50 spread is 534–1176%; only one workload is fit |
| FEL-417 | Backlog | [ci] js-framework-benchmark has no browser on GitHub runners (`/snap/bin/...`) |
| FEL-419 | **In Progress** | [ci] `bun run test --coverage` hangs silently — 19 min of zero output |
| FEL-420 | Backlog | [release] `@aihu/plugin` is 0.1.1 on npm but 0.1.0 in the repo |
| FEL-421 | Backlog | [bench] Verify or retire the signals competitor table |
| FEL-423 | **RESCOPED** | `full` already does served routes entirely; now = verify `full`+`agent`, build the floor assertion, document why minimal/docs cannot host served routes. Moved to builder-b |
| FEL-434 | **NEW** | The root cause under FEL-423 — `emit.rs:206` `elide_agent` strips agent metadata from client builds. Compiler-owner ruling, filed so it cannot quietly become permanent |
| FEL-431 | **P1** | cf-team scaffold cannot dev/build/typecheck — ships no `.moon` workspace. (FEL-432 was a duplicate of this and is **cancelled**) |
| FEL-391 | Backlog | [use] OPEN blocker E1 — deep/structural reactivity ruling |

**Linear has no user for any agent.** Every issue is assigned to the founder as a
single-owner view, with the actual working agent recorded in a comment. At one point
all 13 open issues were unassigned and three of them were already done.

## Unresolved, with the detail the tracker does not carry

- **FEL-419 — the 0%-CPU hang.** Two independent instances in unrelated subsystems
  (`test --coverage`, docs-next prerender), same signature: 0% CPU, whole process
  tree asleep, no output, stuck partway. Not slow — *stopped*. One CI sample:
  19 minutes of total silence, job cancelled at timeout. Declared a pattern rather
  than a coincidence. `#589` merged on the separate grounds that it is not a
  candidate cause.
- **FEL-409 — the bench harness still measures the wrong thing.** *"The harness
  still measures **source, in dev mode, under jsdom** — `NODE_ENV` unset, `__DEV__`
  live."* **No plan to make it measure `dist` in production mode was ever
  proposed.** `bench-arbor` red is expected; see the STOP ruling above.
- **FEL-420 — `@aihu/plugin` 0.1.1 on npm, 0.1.0 in repo.** A published package
  corresponding to *no state in the repository* cannot be rebuilt, audited, or
  bisected. Everything else that session was a wrong number; this is an artifact
  with no provenance at all.
- **FEL-421 — the signals competitor table** in `bench/signals/RESULTS.md`. Three
  questions unanswered: hardware, dist-vs-source, steelman-vs-strawman adapters. Do
  **not** cite it anywhere new until provenance is established. *"No known defect"
  is not verification.*
- **FEL-417 — a public comparative ratio may only come from js-framework-benchmark**,
  not from our own harness. Blocked on GitHub runners having no browser. No owner.
- **#565 shipped without a regression test, and CI structurally cannot catch the
  bug.** It externalised `@aihu/context`, fixing a **silent DI no-op for `dist`
  consumers** — but *"workspace tests alias `src`, so CI could never see it."* That
  root cause is unaddressed. This is a live instance of
  `docs/lessons/checked-thing-is-not-the-changed-thing.md`.
- ✅ **RESOLVED 2026-07-27 — `examples/hacker-news` unescaped remote HTML.** This
  was the single most consequential unactioned item on this file and it is
  **fixed on main**; the alarm below is kept only as the record of what was
  wrong. **FEL-426 removed all three `html={}` bindings.** Remote HN content is
  now parsed to structured data (`src/lib/parse-hn-markup.ts`) and rendered
  through escaped bindings, `src/components/hn-rich-text.aihu:5` states there is
  deliberately no `html={}`, and `examples/hacker-news/tests/smoke.test.ts:55`
  asserts *"no `html={}` binding anywhere in the example source"* — the fix is
  gated, not merely applied. The rejected alternative is recorded in
  `parse-hn-markup.ts:12`: keep feeding untrusted HTML to `html={}` behind a
  sanitiser. **Verified by reading `origin/main`, not by remembering.** Do not
  re-raise it.

  <details><summary>The original alarm, kept for the record</summary>

  🔴 **`examples/hacker-news` prerenders remote HTML unescaped, and no CI job
  builds it. RAISED 2026-07-25 11:50 EDT, NEVER ACTIONED, CONFIRMED STILL LIVE
  2026-07-26 by the historian.**

  `#572` made `html={expr}` interpolate **unescaped into the served static HTML**
  — the correct semantic for `html=` (it is raw-HTML injection by definition), but
  it moves the blast radius from "client DOM" to "bytes we serve." Three bindings
  in `hacker-news` carry **remote, HN-authored HTML**, which is now baked into
  prerendered output. That changes what CSP applies to, what crawlers ingest, and
  what anything downstream trusting prerendered HTML receives.

  Still present at `origin/main`:
  ```
  examples/hacker-news/src/components/hn-comment.aihu:20   html={comment().text}
  examples/hacker-news/src/pages/item/[id].aihu:53         html={route().data.story.text}
  examples/hacker-news/src/pages/user/[id].aihu:35         html={route().data.user.about}
  ```
  And `hacker-news` is in **neither** set in `.github/workflows/plan-a.yml`:
  ```
  build: live-counter temperature-converter timer todo-mvc color-theme
  test:  …the same five… agent-hub storefront
  ```
  `check:emit-parses` compiles every `examples/**/*.aihu`, so it *parses* — but
  nothing ever builds or prerenders it, so the SSR injection path is unexercised.

  It was raised as *"a security surface change — worth a deliberate decision, not
  an accident"*, with the ask that it *"be a stated decision in the PR rather than
  a side effect, and the docs for `html=` should say plainly that it is now an
  SSR-time injection too."* No such decision or doc change was ever made. **Not
  filed in Linear.** This is the single most consequential unactioned item from the
  session.

  </details>
- **#546's derived-list side effect is real and was never filed as a PR.**
- **Two proposals were made and never accepted or rejected:**
  1. A **load/idle assertion in the bench harness** that *"refuses to record a
     baseline above some threshold"* — contamination at load 35–49 is exactly how
     the current numbers became unexplainable.
  2. A **staleness detector for the size cache.** The #591 cache-authoritative fix
     *"moves the failure from 'wrong numbers appear' to 'correct numbers stop
     appearing', and **that second one is quieter**."* Nobody answered.
- **`www.aihu.dev` was last seen `pending`** — the same state that preceded a 522
  earlier that day. Never confirmed `active`.

## The wake loop that redelivers its own history — nineteenth wake, 2026-07-28

An inbox of 25 identical `Session ID ... is already in use` errors from
`builder-b` and `architect`, at delivery attempt 59. **Nothing in it was live.**

**The two roles were already fixed before I read the first message.**

```
errors cite   builder-b=03ad5f3a   architect=e5465ced
agents.json   builder-b=0cedb792   architect=0a3f4e43
```

The supervisor's wedged-session remedy (`supervisor.py:140-152`, `WEDGED_FAILS=3`)
had already minted both. **The remedy works.** What I was reading was pre-mint
traffic redelivering, because a failed wake is never acked — by design, so
nothing is lost. The correct output was a ruling that the messages are history,
not a re-triage of a resolved outage.

**The redelivery was mine.** `~/.swarm/supervisor.log`:

```
[11:32:00] orchestrator: --resume failed, creating session
[11:32:04] orchestrator: WAKE FAILED exit=1 after 37s — NOT acked, will redeliver
[11:32:12] orchestrator: 76 pending — delivering the oldest 25 this wake
```

`bbad934a` was in use **by my own still-running predecessor wake** (`ps`: pid
81858, `claude --resume bbad934a`, started 11:32). Wakes fire every ~25s; a wake
takes 20-42s. Each new one collides with the one before it, exits 1, never acks,
and the pending count climbs. Self-sustaining — and **self-limiting**: one clean
completion acks the batch. Completing the wake *is* the fix.

Sharpening the existing entry below: `supervisor.py:432-442` tries
`--resume <sid>` and then falls back to `--session-id <sid>` — **the same sid**.
That is not a fallback, it is the same wedged identifier with a different flag,
so both arms fail together and the error is structurally guaranteed. Only the
mint, one health cadence later, actually breaks it.

**Second finding, unrelated and NOT self-limiting** — filed as `blocked`
(`ffba4878`): **1,095 leaked `live-daemon.js` node processes, 75% of every
process I own** (1,462 of a `kern.maxprocperuid` of 4,000). **1,016 of them —
93% — belong to one session `ce160f8f` that is not in `agents.json` at all**: an
orphan with no owning role, accumulating since 04:39. Each SessionStart spawns a
~37 MB daemon; nothing reaps it when the wake dies; wakes fire every ~25s. It
grows monotonically, and what breaks at the ceiling is `fork()` for *every* role.
Left in DECIDE deliberately: 1,016 kills is machine-wide and the real fix is hook
reaping outside this repo. **No contract is blocked on it today.**

## WHAT THE NEXT INSTANCE MUST NOT REDO

- **Do not re-triage a `Session ID ... is already in use` inbox without first
  diffing the cited sid against `~/.swarm/agents.json`.** If they differ, the
  supervisor already minted a replacement and you are reading history. On
  2026-07-28 all 25 messages were pre-mint traffic for two roles that were
  dispatchable the whole time.
- **Do not read your own wake's repetition as a peer's failure.** The 76-pending
  redelivery loop was the orchestrator colliding with its own still-running
  predecessor. Orchestrator wake failures are deliberately NOT posted to the bus
  (self-addressed reports would feed the loop), so the only visible symptom is
  *someone else's* stale errors arriving again. Check `supervisor.log` for your
  own `WAKE FAILED` lines before attributing anything.
- **Do not treat `Session ID <uuid> is already in use` as the cause of a wake
  crash.** It is the `--session-id` fallback's error, structurally guaranteed
  whenever `--resume` fails first. Read `~/.swarm/supervisor.log` for the paired
  `--resume failed` line and triage *that*. Full mechanism + evidence above.
- **Do not answer a repetitive wake with "No response requested."** I did that
  for many wakes of the crash storm and missed a five-role outage that took one
  `ps` and one `grep` to diagnose. **Volume is not noise.** A message at delivery
  attempt 35 is 35 pieces of evidence that something is not being handled.
- **Do not re-ack #673, #659, or the architect note.** All three answered on the
  bus this wake (msg ids `0dc12250`, `a6d93bed`, `255f1c11`), plus the outage
  triage to all (`0d547aa4`). All sent at exit 0. #673 and #659 are **merged**;
  only architect's #675 is still live.
- **Do not re-assert "the merge queue is stalled at 01:12Z."** It moved: six PRs
  landed 01:45–01:46Z and `origin/main` is `b667bdcd`. **Re-measure board state
  at the top of every wake** — `gh pr list` costs one call and I re-asserted a
  stale reading for several wakes without spending it.
- **Do not "fix" #671's `BLOCKED` state.** Draft ⇒ `check` skipped ⇒ `ci-ok`
  cannot green ⇒ branch protection says BLOCKED. Guard, not diff. Its
  prerequisite (#666) has merged; it needs marking ready, which is the
  interactive session's call, not a wake's.
- **Do not trim the useSwarm validator to fit the old 610 B budget.** Approved at
  1.45 kB; the bytes are C-SWARM-SCHEMA's ratified deliverable. The raise is
  incomplete only until `.size-limit.README.md`'s table is updated.
- **Do not approve a budget raise without naming the contract that bought the
  bytes.** Ratified deliverable → raise. Incidental growth found at the gate →
  trim.
- **Do not misfile a `check` TIMEOUT as the C-FEL-411 race.** Different shapes:
  411 is `editor:typecheck TS2307` failing fast; the other is a 25m15s job
  timeout with `bun run test --coverage` hung. One sample only — suspected.
- **Do not block builder-b on WIP=1 for ready-and-green PRs.** WIP=1 is one
  in-progress *contract*, not one open PR. DEPLOY-GAP is GO.
- **Do not re-verify #679.** Measured green: one run `30322783137`, `check` ran
  6 min, `ci-ok` started after it ended. The only open question is landing.
- **Do not confirm a builder's recollection of a contract without re-sending the
  row.** Builder's C-FEL-434b recall was *accurate* and still missing the seams,
  the N≥2 half, the source-built-compiler proof method, and row 1's both-
  directions framing. Accurate-but-lossy is the dangerous case.
- **Do not let C-FEL-434b be proved by the scaffold e2e.** It installs the
  PUBLISHED compiler (`scaffold-default-e2e.test.ts:117-119`). Set
  `AIHU_COMPILE_BIN` — this trap has cost hours twice.
- **Do not accept a green `ci-ok` without checking its sibling `check` is
  SUCCESS on the SAME run id.** Two runs per sha is normal here; the one where
  `check` skips finishes first and posts a green that certifies nothing. Bit
  #680, #681 and (as a cancel) #672.
- **Do not re-block #680.** Cleared: `check` + `ci-ok` both SUCCESS on run
  `30323361044`. Do-not-land is LIFTED; the meta-gate has executed in CI.
- **Do not re-verify #654.** Terminal green on `517f0a8c`, accepted.
- **Do not file a contract for the `stripComments` regex-literal edge.** Known,
  nearly untriggerable, told builder to comment it and fold a test into #681.
- **Do not make `cancelled` green in ci-ok.** It fails closed on purpose
  (`plan-a.yml:449`, documented `:354`). A cancelled job reached no verdict, so
  ci-ok cannot certify it. Only the *message* is worth improving
  (`C-FEL-CIOK-CANCELLED-MSG`, LOW, fold into a passing PR).
- **Do not re-run a workflow before capturing its check-runs.** The rerun
  supersedes the artifacts and erases the evidence for whatever you are
  reporting. Cost me the ability to re-verify #672's cancelled pair.
- **Do not attribute a whole-repo lint red by file alone.** Split ERRORS from
  WARNINGS first — only the errors drive the exit code, and on this repo the
  warnings are main's debt by construction. Cost architect one wrong "not my
  diff."
- **Do not ready ANY docs-only PR while #679 is unlanded.** #678 is the worked
  example: `ci-ok FAILURE` / `check SKIPPED` on head `8f3a8193`. Back to draft,
  rebase after #679, then ready — the head branch supplies the workflow.
- **Do not land #680 on the `ci-ok` green currently showing.** It belongs to a
  batch where `check` SKIPPED; the run exercising the gate was still
  `in_progress`. Read the check-runs on the head sha, not the PR summary.
- **Do not treat a truncated sha as a full one.** I padded `586c61d7` into a
  fabricated 40-char sha; the API 422'd loudly rather than matching something
  wrong. Get the full oid from `gh pr view --json headRefOid`.
- **Do not "fix" the 20 `notYetProven` gates inside C-FEL-428.** Out of surface
  by my own ruling. `C-FEL-GATE-FIXTURE-RAMP` is the row; batches, never
  big-bang.
- **Do not re-open C-FEL-MATRIX-PROTO.** MET, verified above (run `30322552896`,
  `fallback_loop` = 0, `6/20`). The three residual `pm-install` failures are
  scaffold defects, not toolchain — that call is made and reasoned.
- **Do not move `@aihu/store` into `@aihu/app`'s `dependencies`.** It is already
  a **peer**; yarn 1 just doesn't auto-install peers. The fix belongs in the
  scaffold template (`C-FEL-SCAFFOLD-PM-COMPAT`). The obvious fix risks a
  duplicate store instance.
- **Do not "tidy" the scaffold-matrix toolchain ordering.** `setup-toolchain`
  FIRST (moon for the cf-team cell), `setup-node` LAST (real binary ahead of
  proto shims). Counter-intuitive on purpose; both run ids are in the comment.
- **Do not re-litigate the gate-routing spec.** ACCEPTED; claims verified above.
  Implementation is `C-FEL-GATE-ROUTING-CHECK` (builder-b), **ranked below** the
  MATRIX-PROTO re-spin and DEPLOY-GAP, and blocked on #680 landing anyway.
- **Do not classify a gate as docs-facing by keyword.** `check:size-rows`
  references `.size-limit.README.md` (a policy doc) and `check:cookbook` reads
  `apps/docs/…`, which **`docs/**` does not match — that glob is root-anchored.**
  Classify by the gate's actual file reads or you will misroute both.
- **Do not read a zero-row sqlite result as a true negative.** The `msg` columns
  are `sender`/`recipient`, NOT `from`/`to`; a wrong quoted identifier returns
  empty instead of erroring. Run `.schema` first and prove the query can return
  rows. I nearly reported a delivery failure that was a message crossing.
- **Do not re-answer C-FEL-428 a third time.** Builder's re-ask (msg `f9fc4f2b`)
  CROSSED my ruling `6d342b6e` (02:17:47); a short pointer was re-sent as
  `9a893963`. The contract reads `claimed` by builder. Nothing further owed.
- **Do not re-rule the two C-FEL-428 questions.** Answered above: empty
  `EXCLUDE_FIXERS` is CORRECT (the fixer is the bare `check`, not a `check:*`);
  negative fixtures must be **executed and observed non-zero**, with a
  shrink-only baseline as the ramp, inside `check:ci`, **cost to be measured**.
- **Do not populate `EXCLUDE_FIXERS` in the gate-wiring meta-check.** It is
  empty because no `check:*` leaf writes. Verified against `package.json`.
- **Do not re-verify the #674 same-sha flap.** `gh run view 30321524966
  --attempt 1` = failure, `--attempt 2` = success, sha `dfbcc456`, zero changes.
- **Do not retire the do-not-treat-`check`-as-evidence caveat until #671
  MERGES.** Green and mergeable is not merged; builder-b announces on landing.
- **Do not "fix" the dep-check prose bug inside another PR's surface.** Filed as
  `C-FEL-DEPCHECK-COMMENTS`, queued behind 428 + 434b. Architect's comment
  reword on #672 is an accepted in-surface workaround, not the fix.
- **Do not mark a docs-only PR ready until #679 lands** — it goes `ci-ok` RED,
  and it is not your diff. After #679 lands, **REBASE before marking ready**:
  `pull_request` runs use the workflow from the **head branch**, so an
  un-rebased branch still carries the broken gate.
- **Do not re-derive the #670×#667 interaction.** Confirmed with receipts above
  (#669 run `30322371788`; #659's `CHECK_RESULT: success` at 01:38Z). Neither PR
  is wrong on its own — do not "fix" #670 or revert #667.
- **Do not add to the `needs` of a required aggregate without checking
  `if: always()`.** A skipped need cascades the aggregate to skipped, the
  required context never reports, and every PR blocks. `ci-ok` survives this
  only because it is `always()`.
- **Do not re-try "delete the offending setup action" on the scaffold matrix.**
  It is done and it was not enough. `/usr/local/bin/node` is preinstalled in the
  runner image; no action installs it. Evidence: the shim path moved from
  `/opt/…` to `/usr/local/bin/node` between runs 30318406544 and 30321617019.
- ~~**Do not report `MERGEABLE/BLOCKED` as a blocker.** `ci-ok` green,
  `reviewDecision` null, 0 required approvals, and six PRs merged under
  identical conditions at 01:45–01:46Z.~~ **STRUCK 2026-07-28 — THIS WAS WRONG
  AND IT COST A WAKE.** The conditions were not identical (#667 landed at
  01:46:25Z, inside that window). BLOCKED on a docs-only ready PR is the **real
  #670×#667 regression** above. Struck, not deleted, so it stays visible that I
  ruled this harmless and was wrong. **A `could-not-explain` is not evidence of
  harmlessness — do not spend a conclusion you did not earn.**
- **Do not "fix" builder-b's ready-not-draft PRs.** Ruled correct and generalized
  into the standing rule: a lane gated on `draft == false` makes draft and
  evidence mutually exclusive.
- **Do not ask historian to fold #676 back into #669.** Ruled: keep both. #676
  exists because of the split ruling; folding re-couples it.
- **Do not conclude a dispatch is "lost" because it is not in the bus window.**
  Read the contract row first — `VACUUM INTO` a snapshot, then `SELECT * FROM
  contract WHERE id='<C-…>'`. `C-FEL-428` was reported lost and was fully intact.
  `swarm-bus` has no `show` subcommand, which is *why* that conclusion gets
  reached; the row is still the record.
- **Do not re-derive the C-FEL-428 bars.** Recovered, amended (reachability =
  `check:ci` **OR** any workflow job), and written back to the row 2026-07-28.
  Read them from the row, not from any message. Re-offering reset status to
  `offered`, so builder must re-claim — that is expected, not a defect.
- **Do not fold the always-on-vs-path-filtered property into 428.** Ruled and
  split out as `C-FEL-GATE-ALWAYSON`, dispatched to architect to spec.
- **Do not grep only `plan-a.yml` when asking "is this gate wired?"** There are
  **nine** workflow files. `check:stories` looks orphaned in `plan-a.yml` and is
  run by `storybook.yml`. This nearly produced a false finding in a dispatch.
- **Do not re-verify the 24-PR merge list.** Every PR in the gbrain
  orchestrator-state table is confirmed on `origin/main` with its commit SHA. The
  receipts are in `docs/state/historian.md`.
- **Do not go looking for `#556`.** Closed, deliberately, not merged.
- **Do not rebase anything onto `feat/scaffold-aihu-config`.** Abandoned; `#609`
  was rebuilt fresh from `main` with four cherry-picked app-side commits.
- **Do not "fix" a red `bench-arbor`** by regenerating baselines. Red is expected
  and the STOP stands.
- **Do not re-derive the 26x / 8.8x / 122x / 28.63 ns benchmark numbers.** All
  are resolved and removed; `#607` is the truth file and `#582` removed the 122x
  claim from eight prose sites.
- **Do not re-argue the `#605` vs `#606` merge order.** It was reversed twice and
  then made moot by the founder redirect. The third answer was the right one and
  it is already shipped.
- **Do not re-propose "stop emitting documents you cannot populate" (FEL-423
  Option 3).** It was ruled correct, then falsified: the templates really do
  declare three tools with `describe:` strings, so deleting the documents swaps one
  lie for another. The ruling was changed.
- **Do not trust a shared checkout's branch.** Run `git branch --show-current` in
  `/Users/smcguirt/conductor/repos/aihu` before grepping it — it sits on whatever
  branch another agent left it on, and this has produced a confident wrong
  correction at least twice. `git worktree list` shows 100+ worktrees on this repo.
- **Do not re-escalate FEL-391 or the FEL-423 remainder.** Both are ruled; see
  "Blocked on the founder".
- **Do not re-verify the stuck-five (423/425/430/433/437).** Their dispositions
  are recorded above with the merged PR that resolved each. The architect spent
  ~9 batches re-confirming them; the loop was a selector defect, not work.
- **Do not re-litigate the claim-verb enum.** It was built (#662), measured to
  reject 5 of 6 real verbs, and replaced (#664). The spec is what is wrong.
- **Do not "complete the `/^node:/` sweep"** into `packages/server` or
  `packages/primitives`. Deliberate exclusions; the reasoning is in-file.
- **Do not re-raise the `hacker-news` unescaped-HTML alarm.** FEL-426 fixed it
  and a smoke test gates it.
- **Do not treat an uncommitted `CLAUDE.md` in a sibling worktree as lost work.**
  Twice on 2026-07-27 (zurich, jerusalem) a twin left one staged; both were
  byte-identical to `origin/main` post-#658. Check
  `git diff --stat origin/main -- <file>` before preserving anything.
- **Do not assume a merged `packages/swarm` PR is live.** The installed binary is
  deployed by hand and currently predates #651/#662/#664. Check its mtime against
  `git log origin/main -- packages/swarm` before trusting any bus behaviour.
- **Do not put backticks in an unquoted shell string when writing a contract
  bar.** The shell eats them before `swarm-bus` sees anything; the boundary
  cannot catch it. Read the stored value back to confirm.
- **Do not verify a state/docs file by `ls-remote` on your branch.** The test is
  `git ls-tree origin/main <path>` — does it appear where the next instance will
  LOOK. `architect.md` passed every check inside the wrong repo.
- **Do not tell anyone a draft's red `ci-ok` is "the FEL-437 guard".** Superseded
  by #670 as of 01:12Z — see the top of this file. Check the run timestamp.
- **Do not re-escalate the queue-routing question.** Answered by lookup:
  `project == "aihu"` on Linear team FEL. And **before escalating anything as
  "a business fact I do not have", check whether it is a fact you can look up.**
- **Do not land `#671` before `#666`.** #671 alone makes an intermittently-red
  lane deterministically red; see the tenth-wake landing-order ruling.
- **Do not re-triage `#667`'s red `bench`.** Ruled: the workflow diff trips the
  bench FILTER, not the numbers; `bench` is outside `ci-ok`; the re-baselining
  STOP stands. The 12.7%/18.4% deltas remain an OPEN could-not-check for
  `C-FEL-409` — do not close them as noise, and do not re-baseline to hide them.
- **Do not push or re-push `feat/swarm-state-zod`.** Already on the remote at
  `7b8dc599`; the draft PR is the architect's to open with their prepared body.
- **Do not re-litigate `C-FEL-READMESYNC-JOB`'s surface.** The contract row
  carries a STALE, unbuildable surface (no way to amend a claimed bar); the
  ruling is on the bus — lazy `rolldown` import, surface amended to include
  `scripts/sync-readme.ts` for that decoupling only.
- **Do not re-triage a red `matrix` (Scaffold DX) on any PR.** It is dead at
  `pm-install` on a proto/node shim collision, red on `main` and five other
  branches, and outside `ci-ok`. See the seventh-wake section. Name it in the
  verdict, rule "merges", move on.
- **Do not read the bus by `cp ~/.swarm/bus.db` alone, and do not cite its md5
  as proof of anything.** See the stale-ledger section above — that copy is two
  wakes behind and has no `declined` rows at all.
- **Do not "fix" the WAL staleness by disabling WAL.** Anti-row on
  `C-SWARM-WAL-STALE`; concurrent agent reads depend on it.
- **Do not re-open the `!.claude/**` exclusion in `#667`.** I suspected it was
  the same defect as the blanket `!**/*.md` (since `.claude/skills/swarm/swarm.ts`
  is live executable TypeScript) and was about to rule it a blocker. Then I ran
  the tool: `biome.json` `files.includes` carries `"!.claude"`, and
  `bunx biome check .claude/skills/swarm/swarm.ts` → *"These paths were provided
  but ignored"*. **Nothing in `check` covers `.claude/` at all**, so excluding it
  loses nothing. My candidate blocker was wrong. This filter has now produced
  three wrong readings from three readers, every one from reasoning about globs
  instead of running a matcher — mine was nearly the fourth.
- **Do not re-triage `#661`'s red `check`.** Ruled: not its diff, it merges.
  The cause is the missing `editor → compiler` moon edge (`C-FEL-411`); see the
  flapping-gate section above for the run id and the log line.
- **Do not re-decide the non-aihu 13 or re-add them to the queue.** Declined
  with reasons in each contract's recon; the Linear issues are untouched.
- **Do not accuse an agent of channel misconduct from a second-hand report.**
  Read that agent's own bus traffic first. Twins share `(workspace, role)` and
  the Slack bot stamps `username=<role>` for anyone, so attribution by username
  is impossible. I got this wrong about verifier and corrected it publicly.
- **Do not re-investigate #685's "three destroyed receipts" or `753a6a43`'s
  "orphaned" check.** All three runs completed; two carry trustworthy receipts.
  Third instance of reading a mid-flight pipeline as a terminal absence.
- **Do not add the injectable-gh seam to `C-SWARM-RECON-AUTHORITY`'s bars.** The
  merged→verified success path lands verified by verifier's drive, not by test —
  deliberately, gap named. The seam is its own row AFTER #686. Moving goalposts
  mid-build is what I refused on C-FEL-428.
- **Do not bank a "fifth fake-green shape".** It was falsified: `ci-ok` posted on
  `50c0dbd6` at 14:25:48Z, two minutes after `check` ended and after the push that
  allegedly killed it. The taxonomy stays at four.
- **Do not read an absent `ci-ok` as a finding while `check` is in_progress.**
  There is a ~2-minute gap between `check` finishing and `ci-ok` posting; the
  absence is expected, not diagnostic.
- **Do not publish a queue row without the head sha it was measured at.** A
  stamped row fails detectably; an unstamped one fails silently. Three crossings
  on one PR is the evidence.
- **Do not re-triage #685's FEL-411 red.** It belongs to `4112f541`, superseded.
  Measure the head that exists.
- **Do not re-triage a `TS2307 Cannot find module '@aihu/compiler'` in
  `editor:typecheck`.** It is `C-FEL-411`, #671 fixes it, and #671 is green and
  unlanded. Name it, rule "not the diff", move on.
- **Do not re-dispatch `C-FEL-CE-TAGS`.** It belongs to the interactive
  orchestrator, who stood it down deliberately at 14:03:15Z.
- **Do not ship R5's `no-claims` guard inside #686.** Design yes, enforcement no —
  it freezes nine need-declaring contracts until the extractor lands.
- **Do not read #686 as having met must-fail row 3.** It is **re-sequenced** to
  land with or after the extractor fix — a `no-claims` guard shipped alone stalls
  the DAG.
- **Do not describe `gh pr checks` as "collapsing" the runs.** It silently omits
  whole runs from its output — a subset with no sign a subset was taken.
- **Do not quote the fake-green window as "eight minutes".** It is as wide as the
  build it is lying about (491s / 494s measured); the number tracks build time.
- **Do not read `no-claims` as "there was nothing to check".** It means *"we did
  not check"* — 26 of 26 rows extracted zero claims because the reconciler reads
  `body` prose and never the structured `claims` column. Amended into
  `C-SWARM-RECON-AUTHORITY`; do not re-derive it.
- **Do not amend a CLAIMED contract by re-offering it.** `offer` upserts
  `status='offered'` and wipes the claim. Rule on the bus against the contract id
  instead — the `C-FEL-READMESYNC-JOB` precedent.
- **Do not characterise `~/.swarm/supervisor.py` without opening it.** I told the
  founder twice it was a guarantee-free heuristic. It has could-not-check posture
  at `:690`, `:716`, `:731`. The defect is role-scoped transcript selection at
  `:681-687`, nothing else.
- **Do not demote `supervisor.py` before the Rust promotion path exists.** It is
  the only writer of `no-claims` (26 rows), and `cmd_ready` satisfies a need only
  on `verified`/`no-claims` — demoting first stalls the DAG, it does not fail
  closed.
- **Do not run `sync --push` against a `verified` row whose `recon` is not a real
  same-repo receipt.** Standing interim guard until `C-SWARM-RECON-AUTHORITY`
  lands.
- **Do not attach a `--github-pr` to a cross-repo contract.** `gh_pr_view`
  hardcodes `--repo fellwork/aihu`, so `C-SWARM-P0`'s real PR
  (`srmcguirt/agent-swarm#1`, OPEN) resolves to `fellwork/aihu#1` — **merged
  2026-04-26** — and manufactures a false receipt in the exact format the real
  ones use. Leave it unlinked until `github_pr` carries a repo.
- **Do not repeat "the reconciler scanned an unrelated trace".** Corrected: for
  `C-SWARM-P0` it read the *right* trace and still wrote garbage. Selection was
  never the load-bearing step.
- **Do not read a contract's `status=verified` as "the bar was met".** Two rows
  reached it with no PR and a transcript from the wrong worktree — see the top of
  this file. Check `github_pr` and `recon` before believing it, and **never
  hand-edit the status to correct it.**
- **Do not "fix" the draft fake-green by making `ci-ok` skip on drafts.** A
  skipped required job is counted as **passing** by branch protection, so that
  opens the hole it looks like it closes. And do not rename `ci-ok` for any
  reason (`plan-a.yml:235`). The read-only receipt tool is the sanctioned fix.
- **Do not re-argue #670.** It is right; only its *"the stale-green window is
  closed by that trigger"* claim is falsified, and by eight minutes, not by the
  principle.
- **Do not stack a PR on another PR to obtain a green.** Combining trees to
  obtain a *measurement* is fine when you disclose it and prove the surface is
  byte-identical; inheriting a *verdict* is not. Scratch branch, not a retarget.
- **Do not read a green `bun` or `npm` cell in the scaffold matrix as evidence
  the peer fix worked.** Three package managers auto-install peers; only `yarn`
  discriminates on this template family.
- **Do not reuse a branch whose content already merged.** `docs/claude-md-bus-is-the-record`
  carries commits that are NOT ancestors of main even though its content landed as
  #658 (squash). Branch fresh off `origin/main` every time — this is retro
  incident 8, which recurred twice more the same day.

## Structural fix I owe, and have not built

**The supervisor must pin the checkout per wake.** On 2026-07-27 this defect
produced **three distinct consequence classes**, not three copies of one:

1. **Lost-work risk** — a force-push onto an already-merged branch; `CLAUDE.md`
   left staged mid-build in `aihu/zurich`; a branch switched under verifier in
   `aihu/jerusalem`. (Nothing was actually lost: both files proved
   byte-identical to `origin/main` post-#658. That was luck, not design.)
2. **Identity swap between turns** — a worktree that is on a different branch
   than the role that last used it, which has produced confident wrong
   corrections more than once.
3. **MISATTRIBUTION — the one I caused.** I publicly told the bus that verifier
   posted the FEL-461 finding to Slack. They produced a receipt: their instance
   sent it *over the bus* (msg `d2a3d18f`, 20:34:14). The Slack copy came from a
   verifier **twin** sharing the `(workspace, role)` identity — and because the
   Slack bot stamps `username=<role>` for any sender, **a twin's post is
   indistinguishable from theirs by construction.** I accepted a second-hand
   attribution about a peer's conduct without reading that peer's own traffic
   first, which is the "verify before you rule" standard skipped in the one case
   where it was about someone's reputation. Corrected to all, since that is
   where the accusation went.

4. **Concurrent mutation, caught live** — builder hit a real `index.lock`
   *mid-commit* on `C-FEL-433`, from another instance running git in the same
   shared worktree at that moment. First incident where the hazard was **active
   during** an operation rather than discovered after. They waited for it to
   clear rather than force-removing it (force-removing would have corrupted the
   other instance's commit), then **re-verified they were still on the right
   branch** before committing. Bank the remedy as hard as the incident: the
   re-verify-after-waiting step is the one people skip, and it is what turns a
   survivable collision into a silent wrong-branch commit.

**Four incidents, four distinct consequence classes, one root.** The current
rung is prose ("check your branch") — the weakest possible, and it depends on
remembering. Recorded as retro incident 8 in `docs/lessons/promotion-rungs.md`
(PR #657, frozen at `d3cf271e`). **Owner: orchestrator. Unbuilt.** Consequence
class 3 is the argument that should finally get it built: shared identity on an
unauthenticated channel means misconduct cannot be attributed *at all*.

## Pointers

- Session record + receipts: `docs/state/historian.md`
- Verification queue and its verdicts: `docs/state/verifier.md`
- Named failure patterns: `docs/lessons/absent-value-rendered-as-real.md`,
  `docs/lessons/checked-thing-is-not-the-changed-thing.md`
- Raw Slack transcript (the only copy): `docs/state/transcripts/`
- Previous retro: `docs/plans/merge-train-2026-07-24/RETRO.md`
