# A WELL-FORMED MEASUREMENT OF THE WRONG THING — state what a POSITIVE result would have looked like

**Topic:** measurement integrity, negative results, git/grep/test instruments
**Session:** 2026-07-28. Found and named by **builder-b** (four instances in a single wake), who offered
it to `docs/lessons` rather than filing it themselves; instances contributed by every role that day.
**Category:** measurement-integrity, epistemics
**Severity:** high — it is the failure mode that **survives every check this directory currently
teaches**, and on 2026-07-28 it produced at least nine confident wrong readings across five roles, two of
which were one message away from entering the record as findings.

## The rule

> **Before believing a NEGATIVE result, state what a POSITIVE one would have looked like, and confirm
> your command could have produced it.**

## Why this is NOT the empty-and-green class

`absent-value-rendered-as-real.md` catches **instruments that did not run** — a zero-row query, a skipped
CI job, an observation taken before the thing had its chance to appear. Empty, silent, skipped.

**This class is the opposite and it is more dangerous.** Every command below **ran perfectly**, exited
honestly, and **described something real.** They were simply *pointed one inch off target*. There is no
error to notice, no missing file, no non-zero exit, no silence — so every heuristic built around
"did the check actually execute?" passes cleanly. The defect is not a **missing** measurement; it is a
**well-formed measurement of the wrong thing.**

## The instances — one day, five roles

| command | returned | read as | actually |
|---|---|---|---|
| `wc -l docs/state/builder-b.md` | `291` (theirs: 534) | *"my durable state was destroyed"* | a real file — on someone else's branch, swapped in mid-run |
| `grep -c allowBuilds …/src/index.ts` | `0` | *"my fix never landed"* | the emitter body lives in `templates-tooling.ts` |
| `git ls-remote origin refs/heads/<mine>` | `""`, **rc=0** | *"my branch was deleted under me"* | rc=0 **is** the successful answer: merge auto-deleted it |
| `vitest` | `Test timed out in 5000ms` | *"my tests are broken"* | box at 7.2× oversubscription; `--testTimeout=30000` → pass |
| `git log --oneline main..branch` | `6 commits` | *"six commits never landed, 10h in /tmp"* | squash-merged; those shas read unmerged **forever** |
| `git merge-base --is-ancestor <sha> main` | exit 1 ×6 | *"not on main"* | answers *sha*-identity, which a squash severs |
| `git diff --stat main..stale-branch` | `111 files, 3605 deletions` | *"a catastrophic revert"* | branch merely behind; three-dot → 2 files, +415/−15 |
| `bun run check:pre-push` | `EXIT 0` | *"that tree passes its gate"* | a **cache replay**, and on a different branch entirely |
| `grep … \| head -20` | `EXIT 0` | *"grep succeeded"* | `head`'s exit code; grep matched nothing |

Read naively and in order, the first four say: *my durable state was destroyed, my fix never landed, my
branch was deleted, my tests are broken.* **All four false.**

## Why the remedy is cheap enough to be a habit

Each of those was **one command from the truth**, and each cost many multiples of that command:

```
git branch --show-current           # not a sha — you recognise your own branch NAME
git grep -n <symbol> -- <package>   # not grep -c on the file you guessed
gh pr view <n> --json state         # a merged branch has no ref to find
--testTimeout=30000 ; sysctl -n vm.loadavg    # before believing any timeout
git show <ref>:<path> / three-dot   # content questions need content commands
```

**Asymmetry that lopsided is the whole argument.** The rule costs one command and one sentence; the
class costs wakes.

## The sharpest sub-case: a range that answers a question about SHAs

Three roles hit this in one day, so it earns its own statement (orchestrator's, after withdrawing a
false lost-work alarm):

> **A two-dot range answers a question about SHAs.** If the merge method rewrites shas — and this repo
> squashes — **no two-dot range and no `--is-ancestor` on the original commits can answer a question
> about CONTENT.** Content questions need content commands: `git show <ref>:<path>`, a three-dot diff,
> or a grep for a marker the work introduced.

And the meta-lesson about how the earlier version of this was banked, which belongs in
`promotion-rungs.md` as much as here: the previous rung said *"`git diff main..branch` is wrong, use
`git log main..branch`."* Its author then used `git log main..branch` as though **it** were
content-truthful. **The rung had been written about the wrong COMMAND rather than about the CLASS**, so
it protected against one instance and licensed the next.

## Where it sits relative to the doctrine that already existed (architect)

The architect had **rule 0, rule 0b and rule 0c** filed as three lessons in their state. They are **two
classes**, and they had *"filed the second one three times in three costumes without noticing"* — which
is the class-vs-instance defect recorded in `promotion-rungs.md`, arriving in the very file that records
it. Named, the two collapse cleanly:

| class | what it catches | doctrine |
|---|---|---|
| **DID-NOT-RUN** (silence) | empty / skipped / failed measurement wearing a result's clothes | `absent-value-rendered-as-real.md`, rule 0 |
| **RAN-AND-MISSED** | an instrument that ran perfectly, aimed one inch off | **this file** — had no name until 2026-07-28 |

And the containment is one-directional: **"state what a POSITIVE result would have looked like"
GENERALISES rule 0** — *"`wc -l` the input first"* is just the special case where that question reduces
to *"was there any input at all?"* So the older rule is not superseded; it is the cheapest instance of
the newer one, and it is still the right first move when the answer is a zero or an empty set.

**The tradeoff, stated rather than hidden:** this check is paid **overwhelmingly on negative findings
that are true.** Most of the time you will confirm your instrument was aimed correctly and learn nothing.
It is worth it because the failure it prevents is the one that **enters the record as fact** — four of
the nine instances above were one message from being posted as findings, and no amount of re-reading
your worktree catches that afterwards.

## Two instrument caveats found the same day, both worth carrying

**1. `gh pr view --json statusCheckRollup` IS NOT AN ENUMERATION.** The verifier was one step from
filing *"the always-on job never ran in CI"*: the rollup **does not list `gate-wiring` at all**, while
`gh api repos/.../commits/<sha>/check-runs` lists it as completed/success with a timestamp. **Two `gh`
instruments, same sha, one silently omits a job that ran.** Use the check-runs API for
**presence/absence** questions; the rollup answers *"is anything failing"*, not *"what exists."* This is
the second face of the collapsed-view defect already in `ci-ok-green-only-with-same-run-check.md`, where
`gh pr checks` dropped a whole run.

**2. `ps` `%CPU` is a LIFETIME AVERAGE, not an instantaneous reading** — named by the verifier, and
nobody had said it while three roles built arguments on `ps` output. For *"what is saturating the box
right now"* the lifetime average of a long-lived process understates a recent spike and overstates a
finished one. Cross-check with `top -l 2` and **use the second sample**; the first is itself a lifetime
average. Two instruments agreeing is what turned that finding from an assertion into a result.

## A TENTH INSTANCE, first-person, while committing this very lesson — the shell ate a word and exited 0

Writing the commit for the `ci-ok` fail-open finding, I used a backticked word inside a `-m` string in
zsh. **The backticks were command substitution.** The word was executed as a command, failed, and
substituted **empty**:

```
git commit -m "… my banking that `verified` is not a label …"
  stderr:  (eval):3: command not found: verified
  commit:  created.   push: exit 0.   git ls-remote: sha matches.
  message on disk:  "… was the transferable part.  is not a label, it is a publication …"
                                                  ^^ the word is silently GONE
```

**Every durability check I run passed.** The commit exists, the push landed, the remote ref matches, the
lesson-refs gate is green. The only signal was one stderr line among the output of a compound command —
and the artifact it produced is a **valid, readable commit message with a word deleted from the middle of
a sentence**, which is precisely the shape that survives review.

This is the class arriving from a new direction and worth naming separately: not *"my instrument was
aimed at the wrong thing"* but **"the shell mutated my data in transit and reported success."** The
generalisation:

> **An exit code of 0 certifies that the command ran, never that it ran on the input you wrote.** Any
> unquoted-or-backticked shell metacharacter — `` ` ``, `$`, `!` under history expansion — is a silent
> edit to your data with a successful exit. **When the payload is prose you intend to keep — a commit
> message, a bus body, a PR description — the safe form is a heredoc (`<<'EOF'`, quoted delimiter) or a
> file, not a `-m` string.** And **read back what you wrote**: `git log -1 --format=%B` is the positive
> control for a commit message, and it is the same one-command remedy every other instance in this file
> had available.

Recorded first-person and prominently because I am the role that writes this directory: **I banked
"reproduce against the source text, not the quote" in the same commit whose message the shell rewrote
underneath me.** The lesson does not exempt its author.

## ELEVENTH INSTANCE — I CLOBBERED A PEER'S HARNESS IN `/tmp`, AND `/tmp` IS AS SHARED AS THE WORKTREES

The verifier went to re-run their `ci-ok` truth-table harness at `/tmp/loop-current.sh` and found **a
six-pair loop with no `gate-wiring` and a compressed one-line body** — not what they wrote (`sed -n
509,517p`, **seven** pairs, multi-line). The architect's diagnostic identified the author without
accusing anyone: *"the clobbering file is a six-pair loop with no gate-wiring — that is the loop as it
exists ON MAIN, not on the #691 merge tree, so whoever wrote it extracted from main."*

**That was me.** Verified rather than inferred: `ls -l /tmp/loop-current.sh` → **17:48**, six pairs,
compressed body — my harness from the previous wake, written straight to a guessable shared path while
reproducing the fail-open against `origin/main`.

Nothing was lost: the verifier's earlier truth table was run against **their own** extraction at the time
and stands, and they re-extracted to a private path on noticing. But **anyone re-running that path today
measures my file while believing it is theirs** — a well-formed harness, a plausible result, no error,
no clue.

> **`/tmp` is as shared as `zurich`.** Every hazard already banked for shared worktrees applies to shared
> scratch space, and scratch space is worse in one respect: a worktree has a branch name you can print,
> while a `/tmp` path has **no identity at all** — the only tell is remembering what your own file
> looked like. **Standing rule, the verifier's and now mine: a scratch artifact needs a PRIVATE path**
> (`/tmp/<role>-<thing>-$$`), because the natural name is the one every role will independently choose.

I deleted my two stale files after disclosing them; leaving a misleading artifact at a name others will
guess is the hazard itself. **This is the third tooling instance of the class in one day** — see the
enumeration rule below — and the one committed by the role that maintains this file.

## A RANKED OR COLLAPSED VIEW IS NOT AN ENUMERATION (three instances, one day, all in tooling)

The verifier's generalisation, and it is the sharpest single statement of the class in a tool-shaped
form:

| view | omitted | consequence |
|---|---|---|
| `gh pr view --json statusCheckRollup` | a job that **ran and passed** | one step from filing *"the always-on job never ran in CI"* |
| `top` / a top-N process listing | orphans outside the top 6 | the safe subset read as **~2 cores** instead of the measured **3.6** |
| a shared `/tmp` path | that it is someone else's file | a peer's harness silently replaced by mine |
| **`comments(first:50)`** in an idempotency guard | **the marker comment, once an issue passes 50** | **`if_absent` reports ABSENT and re-posts to a customer's ticket every cycle, forever** |

**The fourth instance is the one that escapes the swarm.** The first three cost a wrong report; this one
is inside `linear_comment_if_absent` (`main.rs:1677`) — the guard that the entire *"convergent by
idempotency, a partial publication self-heals"* argument rests on — and its failure mode is an unattended
public write. **A truncated read inside a correctness guard does not produce a wrong belief; it produces
a wrong action, repeatedly.** And the correct paginated pattern sits ~100 lines away in the same file
(`linear_issue_list`, `pageInfo { hasNextPage endCursor }`, a real cursor loop), which is what makes it a
**defect** rather than an API limitation: *when the right pattern already exists in the file, "the API
only gives you a window" stops being an explanation.*

> **Reading a population off a truncated, ranked, or shared view is the same defect as reading absence
> off a mispointed grep.** Select on the **predicate** (`ppid=1`, the check-runs API, a private path),
> never off whatever the display chose to show you. The orchestrator's under-count was not arithmetic —
> it was counting the orphans *visible in a top-6* rather than selecting on `ppid=1`.

## `mergeable` IS SCORED AGAINST `main`, NEVER AGAINST YOUR SIBLING — two PRs, one file, both CLEAN, mutually destructive

Builder-b had **two open PRs against one file** (`docs/state/builder-b.md`), and **both reported
`mergeStateStatus: CLEAN`.** The status was **true and irrelevant**: GitHub scores each PR against
`main` and **never against the other PR**. Whichever lands first silently makes the second wrong.

The trial merge is what answered the question actually being asked:

```
gh pr view <each>   ->  MERGEABLE / CLEAN     <- true, and about main
git merge --no-commit --no-ff <sibling>  ->  rc=1     <- the real answer
```

**And the collision was in the ITEM NUMBERS** — 16, 17, 18, 19, 20, 22 each pointing at two different
rulings, in the file whose entire function is to be **cited by number.** A textual merge could have
succeeded and still produced a broken record, because the conflict was semantic, not lexical.

> **Every durability check passes here.** Both branches pushed, both PRs open, both `MERGEABLE/CLEAN`,
> `ls-remote` matching on each — **the fifth place a durability check reads green while the record is
> broken.** `mergeable` answers *"does this apply to `main` right now"*; nobody was asking that. **When
> two PRs touch one file, the only instrument that answers is a trial merge of one into the other**, and
> for a numbered document the merge succeeding is not sufficient either.

**The remedy builder-b used is worth copying**: renumber **only the side that had never been on `main`**,
so existing citations do not move. *A record cited by index has an ordering invariant that no merge tool
knows about — the burden of renumbering belongs to whichever branch has no citers yet.*

## A CONFIRMING MEASUREMENT IS WORTH THE SAME AS A CORRECTING ONE — reported as a NORM, not a courtesy

Every instance above is a measurement that **corrected** something. That selection is itself a bias, and
the verifier named it by doing the opposite deliberately. Having found *"#430 is already closed"* — a
one-third overstatement nobody had checked — they went looking for the **same** class of overstatement in
the adjacent number: `linear_ensure_state` returns `Ok(false)` when an issue is already in the target
state, so any already-`Done` row would be a no-op and the filed count of 8 would be inflated.

```
ALREADY Done: 0 of 8.   Six In Progress, two Backlog.   ALL EIGHT ARE GENUINE STATE CHANGES.
```

**They reported the null result as loudly as the hit.**

> **A MEASUREMENT THAT CONFIRMS THE FILED NUMBER IS WORTH THE SAME AS ONE THAT CORRECTS IT, AND ONLY
> SAYING SO WHEN IT CORRECTS IS HOW A REVIEWER BECOMES AN ADVERSARY RATHER THAN AN INSTRUMENT.** The
> architect's addition is the mechanical form of why: **a reviewer who reports only hits has an
> unmeasurable false-negative rate.** If silence means "I found nothing" *and* "I did not look", nobody
> downstream can tell which numbers have been checked — so a confirmed number and an unexamined one are
> indistinguishable in the record, which is exactly the property this whole file is about.

**A precision found in passing, and it is the kind that belongs in a decision rather than in a diff:**
two of the eight (`FEL-433`, `FEL-460`) are in **Backlog**, so they jump **Backlog → Done** with no
intermediate state — not wrong, since the work is merged, but a larger semantic step than the other six
and visible to anyone reading the board afterwards. *That is the kind of thing a human wants told to them
before rather than noticed after.*

## THE COMMENT THAT CITED THE OTHER IMPLEMENTATION AS THE REFERENCE — and nobody opened it

`scaffold-pipeline.ts` names `create.ts` as the good implementation: *"create.ts (the create-aihu wizard)
has always done init + add + commit. This path did not."* **True, and it concealed that `create.ts` did
all three while checking none of them** — three `spawnSync` exit statuses discarded, then an
unconditional `write("  ✓ git init")`. A fix for one implementation cited the other as the reference, and
the citation was accurate about *behaviour* while silent about *correctness*.

> **"The other implementation already does this" is a claim about the other implementation, and it is
> load-bearing exactly when nobody opens it.** Same shape as *nobody had opened the function*, arriving
> through a code comment rather than a bus message — and a comment is worse, because it sits next to the
> code and reads as though it were verified by proximity.

**Two harness rules from the same work, both cheap and both about false greens in your own tooling:**

- **Assert the mutation APPLIED before running it.** A no-op `str.replace` produces a green that means
  nothing — the positive-control principle pointed at the test harness rather than at the gate.
- **Commit before you mutate.** A cleanup of `git checkout -- <path>` **cannot tell your work from the
  mutation**, and it silently reverted an uncommitted correction made in the same file.

And the mutation earned its keep in the way that matters: a test suite that passed **also passed with the
fix removed**, because `git` was quietly deriving `username@hostname` the whole time. Correcting the
inherited claim (*"git commit fails outright when no `user.name` is resolvable"* — measured false; it
auto-derives, and refuses only under `useConfigOnly=true`) moved mutation B from killing **1** test to
killing **2**. **The test only became load-bearing once the premise under it was measured.**

## A CLAIM THAT ARRIVES WITH MEASUREMENTS BORROWS THEIR CREDIBILITY — even when they measure something else

The originator of the daemon severity claim carried their own correction, and their account of **how a
wrong number won an argument for a day** is sharper than the correction:

> *"I supplied a claim that SOUNDED measured because it CAME WITH measurements. The measurements were
> real — loadavg 72, varying failure counts, 5s→30s flips the result. They just did not measure the thing
> the sentence claimed."*

Every number attached to that claim was correct. The load was real, the flakiness was real, the timeout
threshold really did change the outcome. **What was never measured was the join** — that *these daemons*
caused *that load* — and the join is the only part the sentence asserted. **Two roles adopted it before
anyone checked**, one of them calling it better than their own framing, and it entered `docs/lessons` as
a repo artifact.

> **Attached evidence is evaluated as though it were evidence FOR THE CLAIM, when it is only evidence for
> its neighbours.** This is the class one level up from a mispointed instrument: not *"my command answered
> the wrong question"* but *"my correct answers were assembled into a claim none of them tested."* The
> check is the same four seconds it always is — **ask which measurement establishes the verb**, and if
> none does, the claim is a hypothesis wearing a receipt.

It pairs with the two statements already in this directory — *counting a population is not establishing
it is the population that matters*, and *a correct framing is the hardest kind to audit because agreeing
with it feels like checking it.* **The reason an easy number recruits agreement is that it arrives
pre-loaded with credibility it did not earn on the point in dispute.**

## Two small confirmations of instruments already banked

- **The void clause fired a FOURTH time and PASSED** — a verdict stamped to one head, head moved, and the
  integrity check (`git show <new-head>:… | grep -c 'checked" -ne 7'` → 1) showed **the protected
  property survived**. Worth recording because the clause's *other* job is invisible: it does not only
  invalidate stale verdicts, it **tells you when NOT to spend a re-verification.** A stamp that can only
  ever cost you work would not be kept.
- **The pipe-exit trap caught its own author, a third time this session** — `case B | tail -3` reported
  `rc=0` while the fatal was printed; unpiped, `rc=128`. Three instances, three different roles, one of
  them the person who banked it. **In `zsh`, do not pipe the command whose exit code is the evidence.**

## A THIRTEENTH INSTANCE, MINE — THE COMMAND TOLD ME IT HAD FAILED AND I READ ITS OUTPUT ANYWAY

Measuring the daemon population, I asked for an age column and a command line:

```
$ ps -eo etimes,args
ps: etimes: keyword not found          <- stderr
ARGS                                   <- stdout: it ran anyway, with the keywords it DID recognise
```

**`ps` on Darwin rejects the unknown keyword, says so on stderr, and then executes with the remainder.**
So the 872 rows that arrived were real, complete, and correctly formatted — with column 1 silently
promoted from *age in seconds* to `node`, the first word of `args`. My filter for recent arrivals was
`awk '$1<3600'`, and **awk compares a non-numeric string as a STRING**: `"node" < "3600"` is false,
because `n` sorts above `3`. Every row was rejected:

```
--- YOUNGER THAN 3600s: count / distinct sids ---
       0
       0
 0h- 1h: 873      <- and the histogram put all 873 in bin 0, from int("node"/3600) = 0
```

**"Zero daemons spawned in the last hour" is a finding.** It is the headline *"the leak has stopped"* —
and I was one paragraph from writing it into a lesson file, where it would have retired a live alarm and
falsified my own committed prediction in the flattering direction. The real distribution, read with
`etime` and converted: 15 / 2 / 2 across bins 0–2 h. The tell I did catch was in my own output — a
min/max line that printed `claude` and `node` where two integers belonged.

> **A COMMAND THAT PARTIALLY FAILS IS MORE DANGEROUS THAN ONE THAT FAILS**, and this is the first
> instance in this file where the instrument *announced its own failure* and the announcement did not
> reach the conclusion. The diagnostic went to **stderr**; the plausible-looking output went to
> **stdout**; a pipeline reads stdout. Exit code does not save you either — `ps` returns 0. **When a
> tool accepts a list of fields, a rejected field does not abort the request, it silently re-indexes
> every field after it.** Rule: *if a command emits anything on stderr, no conclusion may be drawn from
> its stdout until that line is explained* — and positionally-parsed output must be sanity-checked
> against its own type (`min`/`max` of a numeric column is the free assertion; mine printed a word).
>
> Concretely for this repo: **`ps -eo etimes` does not exist on Darwin.** Use `etime` (`[[dd-]hh:]mm:ss`)
> and convert. Third shell-mutation instance in four wakes — backticks in a commit message, `:s` in a
> path, now a silently-dropped `ps` keyword. The class is not "shells are quirky"; it is that **all three
> degraded into well-formed output instead of an error.**

## A VOID CLAUSE'S INTEGRITY CHECK IS A COLLAPSED VIEW OF A VERDICT

The verifier declined to accept **their own** integrity check, and the reason extends this file's class
into the void-clause instrument itself. Their clause named the runtime guard — *the cheapest thing to
grep* — while the verdict rested on **two** artifacts:

```
git show <head>:plan-a.yml | grep -c 'checked" -ne 7'  ->  1, EXIT 0     <- passed, faithfully run
git diff --stat 6789f8d1..faee81b9  ->  scripts/check-gate-wiring.ts +81/-30   <- REWRITTEN TWICE
```

**The gating parse they had mutation-tested was rewritten twice across four heads, and the integrity
check grepped a different file.** Nobody misused it; it was mis-specified by its author.

> **A VOID CLAUSE'S INTEGRITY CHECK MUST NAME EVERY ARTIFACT THE VERDICT MUTATION-TESTED, NOT THE ONE
> LINE THAT WAS CHEAPEST TO ASSERT.** Otherwise it converts *"re-run this"* into *"this is still fine"*
> **on a strict subset** — and a passing subset reads exactly like a passing whole. **A one-line check is
> a collapsed view of a verdict**, the same defect as a ranked view not being an enumeration, aimed at
> the instrument built to prevent staleness.

**And the shipped form moved again while this was being written**, which is the clause earning its keep:
current head `464a3e31`, and the corrected three-part check passes on it — my own read,
brace-delimited: `NEEDS_NOT_GATED=5`, `outputsRead=6`. *A note quoting a head is stale by the time it is
read; only a check that re-derives survives.*

## CHECK WHOSE ARTIFACT A CRITIQUE IS AIMED AT BEFORE ACTING ON IT

The builder read a reviewer's objection to the **architect's proposed spec** as an objection to **their
own shipped code**, "fixed" something that was already correct, and **removed a lock in the process** —
one that all three reviewers had separately measured as *stronger* than the alternative. They caught it,
measured the regression, and restored it.

> **This is the class pointed at the bus stream rather than at a command.** A critique in prose names a
> predicate, not a file; two artifacts can implement the same predicate differently, and the objection
> may be true of one and false of the other. **Before acting on a critique, resolve which artifact it
> tested** — the reviewer's example, not their conclusion, is what identifies it.

**A corollary with teeth: the same residual has different severity against different forms.** The
architect's *"an exemption can be silenced by declaring an output reference nobody uses"* was priced as
**speculative hardening** against the two-key form — correct — and was a **live one-key hole** against
the pure-derivation form that briefly replaced it. **So a decline or defer reason must name WHICH FORM it
is decided against**, or it silently transfers to a form where it is false.

## A TWELFTH INSTANCE, MINE, THIS WAKE — and my positive control checked the wrong thing

Verifying the above, I ran `git show "$sha:scripts/check-gate-wiring.ts"` in `zsh`. **`$sha:s…` is a
parameter-expansion modifier**, so the path was silently rewritten and every read returned empty:

```
fatal: ambiguous argument 'ea1a1692k-gate-wiring.ts'          <- :scripts/chec consumed as a :s modifier
ea1a1692  OBJECT PRESENT  file_lines=0  NEEDS_NOT_GATED=0     <- a clean, plausible, WRONG table
```

Had I trusted it I would have reported *"the two-key lock is absent at all three heads"* — a fabricated
finding, contradicting a peer, from a command that exited 0. **The real values, read with
`${sha}:path`: 1 / 5 / 5.**

> **I built a positive control and pointed it at the wrong thing.** `git cat-file -e "$sha^{commit}"`
> proved **the commit existed** — and printed `OBJECT PRESENT`, which read as *"the read worked."* It
> proved nothing about the read. **A control must exercise the step that can fail, not a neighbouring
> step that cannot**; the tell I nearly published past was `file_lines=0`, sitting in my own output.
> Second shell-mutation instance in three wakes (backticks in a commit message, now `:s` in a path):
> **in `zsh`, brace-delimit every parameter that is followed by punctuation.**

## Two method rules that came out of applying it

**1. REPRODUCE AGAINST THE SOURCE TEXT, NEVER THE QUOTE OF IT.** Verifying the `ci-ok` fail-open, the
verifier extracted the loop with `sed -n 509,517p .github/workflows/plan-a.yml` and piped *that* into a
harness — explicitly *"so a transcription error in the report could not flip my verdict."* I did the same
against `git show origin/main:.github/workflows/plan-a.yml`. This is the general form of the
`IMPORT_RE` incident, where an inherited misquote (`` [`"] `` for `['"]`) would have manufactured a false
refutation: **a reproduction built from someone's prose is a test of their typing.** The cost is one
`git show`; the failure it prevents is a confident disagreement about different text.

**1b. THE MIRROR RULE: READ THE ARTIFACT BEFORE DOUBTING IT.** Two roles named their own habit in the
same wake, and the pair is the useful thing:

- the architect's — **ship direction 1, call direction 2 obvious**: an inversion asserted
  behaviour-identical without a truth table, `-ne` vs `-lt` reasoned but unmeasured, and a positive
  control never checked against correct input. *"Three times in one session while citing the bar to
  others."*
- the verifier's — **file a could-not-check without first reading the artifact**: the `gh_close_issue`
  guard, and before that *"#430 will be closed"* without running `gh issue view`.

> **One is a missing SECOND direction; the other is a missing FIRST read. Both are the cheap step skipped
> because the expensive step felt done.** That is the common cause worth carrying: the effort already
> spent on the hard part is what licenses skipping the trivial one, so **the more work you have done on a
> question, the more likely you are to skip the four-second check that settles it.**

**2. SAY THE NUMBER OR SAY NOTHING** — the architect, against themselves. Declining to act on the
orphaned processes, they added that only 5 of 22 were unambiguous *and let it stand as though the safe
subset were marginal* — having **never measured what the orphans cost.** The verifier measured it: **3.6
cores, 40 % of the class.** The ownership half of the ruling was right; the *"and it would not be worth
much anyway"* was an **unmeasured aside riding along with a measured ruling**, which is how a soft claim
smuggles itself in behind a hard one and inherits its credibility.

**A small live instance of the rotating-coordinate clause, worth one line:** a cited
`main.rs:2610` had already moved to `:2748` between the citing read and the checking read. The architect
found the function by name rather than by line and got the right answer — *quote a coordinate with the
fetch that produced it, or find the thing by a name that does not move.*

## The rung

- **prose (today):** the one-sentence rule at the top, plus the five one-command checks above. Cheap,
  and it demonstrably transfers — builder-b's tripwire (`git branch --show-current`) was adopted as
  standing by three roles within one wake and caught a real instance immediately.
- **injected-at-dispatch:** the rule belongs in the standing brief next to *"evidence over assertion"*,
  because it is the same instruction one level deeper — **evidence over assertion, then instrument over
  evidence.**
- **THE FIXTURE FORM — because the rule above is phrased as a HABIT, and by this repo's own test that
  makes it the weak rung.** The architect flagged exactly this against this file, citing my own line
  (*a lesson phrased as a fixture is portable into code; one phrased as a habit is not*). So, stated as
  something a checker can hold: **every gate that reports a negative MUST carry an input it is required
  to report POSITIVE on, exercised in the same run.** That is a property, not a discipline — it is what
  builder's `NEGATIVE_FIXTURES.green` control already is, and it is why the verifier could kill a gate
  that had been altered to `exit(0)`: *"NEGATIVE FIXTURE PASSED — the gate did NOT reject its own red
  input (it cannot go red)."* A checker with no positive control cannot distinguish *clean* from
  *blind*, and neither can its reader.
- **structural:** the shape that generalises is a **positive control**. Builder's `NEGATIVE_FIXTURES`
  gained a `green` control for exactly this reason (*"one that says no to everything satisfies the red
  half perfectly"*), and verifier's `extract_claims` audit ran a positive control (a hand-written prose
  claim → 3 extractions) which is the only reason *"0 claims"* could be read as a **format mismatch**
  rather than as *"there are no claims."* **A negative result without a positive control is an opinion
  about your instrument.** Where a check can carry a control, it should.

## Related

- `absent-value-rendered-as-real.md` — the sibling class: instruments that did NOT run. This one is instruments that ran and were aimed wrong
- `checked-thing-is-not-the-changed-thing.md` — the same family from the other end; the squash/two-dot instances live there in full
- `stale-ledger-wal-and-disproven-receipts.md` — the void rule; a coordinate is only evidence with the read that produced it
- `promotion-rungs.md` — where "the rung was written about the command, not the class" is recorded as a defect in lesson-writing itself
- `guarantee-satisfied-by-the-defect.md` — the `green` control, the structural form of the positive control
