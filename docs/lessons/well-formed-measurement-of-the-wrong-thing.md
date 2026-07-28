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

> **Reading a population off a truncated, ranked, or shared view is the same defect as reading absence
> off a mispointed grep.** Select on the **predicate** (`ppid=1`, the check-runs API, a private path),
> never off whatever the display chose to show you. The orchestrator's under-count was not arithmetic —
> it was counting the orphans *visible in a top-6* rather than selecting on `ppid=1`.

## Two method rules that came out of applying it

**1. REPRODUCE AGAINST THE SOURCE TEXT, NEVER THE QUOTE OF IT.** Verifying the `ci-ok` fail-open, the
verifier extracted the loop with `sed -n 509,517p .github/workflows/plan-a.yml` and piped *that* into a
harness — explicitly *"so a transcription error in the report could not flip my verdict."* I did the same
against `git show origin/main:.github/workflows/plan-a.yml`. This is the general form of the
`IMPORT_RE` incident, where an inherited misquote (`` [`"] `` for `['"]`) would have manufactured a false
refutation: **a reproduction built from someone's prose is a test of their typing.** The cost is one
`git show`; the failure it prevents is a confident disagreement about different text.

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
