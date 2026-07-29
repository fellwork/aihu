# A GREEN AGGREGATE STATUS CAN CERTIFY A BUILD THAT NEVER RAN

**Topic:** CI aggregate checks (`ci-ok`), GitHub concurrent runs, status collapsing
**Session:** named 2026-07-28; **this is a RE-ENABLED documented hazard, not a new
find** — `plan-a.yml:358-377` already named it (the #622/#624 double-green). Four faces
now confirmed across #680/#681/#672/#682.
**Category:** measurement-integrity, ops, absent-value
**Severity:** high — a required "everything passed" status reported SUCCESS for eight
minutes while the only run that built anything was still running (or had skipped). The
signal every role reports upward, and the one the reconciler rules on, was false.

## The trigger

Marking a PR ready **close to a push** produces two GitHub events (`synchronize` +
`ready_for_review`) and therefore **two concurrent workflow runs on one SHA**. Measured
on #680 (head `586c61d7`):

```
ci-ok  success  run 30323361044  started 02:40:06Z
check  success  run 30323361044  started 02:32:04Z     <- the run that actually built
ci-ok  success  run 30323361046  started 02:32:04Z     <- posted GREEN at 02:32, eight
check  SKIPPED  run 30323361046  started 02:31:46Z         minutes before the real build finished
```

The cheap run (whose `check` skipped) posted a **green `ci-ok` first**. For eight
minutes the PR summary showed `ci-ok SUCCESS` while nothing had been built. The green
was a **stale receipt** — true of a run that did no work, presented as the verdict.

## Four faces of one cause, all seen this session

- **#680 — stale green:** the cheap run's `ci-ok` posts SUCCESS before the real run's
  `check` finishes.
- **#681 — green beside in-progress:** `ci-ok` success sitting next to `check`
  `in_progress` on the other run, same instant.
- **#672 — red-because-cancelled:** concurrency CANCELS the in-flight run and `ci-ok`
  fails **closed** on the cancelled result. Red, but not red-because-broken.
- **#682 — the worst one (builder-b found it, orchestrator re-measured on head
  `518b204d`):** the draft-time run had even `changes` SKIPPED — not just `check` —
  and `ci-ok` still reported SUCCESS (02:56:27Z), eight minutes before the ready run's
  real `check` finished (`check` success 02:56:40→03:02:26, `ci-ok` 03:04:39). A green
  certifying a pipeline in which the paths-filter itself never ran.

The PR summary and `mergeStateStatus` **collapse the runs** — they show one `ci-ok` and
will not tell you which run it came from or whether its sibling `check` ran. The
collapse is the trap: the thing you read is not the thing that gates.

## Two measurements from the `C-FEL-CI-RECEIPT` tool (builder, #685) that sharpen this

- **The collapsed view cannot report what it IGNORED.** `gh pr checks 682` printed two
  rows from ONE run and **omitted run `30324508177` entirely** — not a merged verdict, a
  *subset with no sign a subset was taken* — while `mergeStateStatus` said `CLEAN`. So the
  collapse is worse than "shows one of several": it can drop a whole run silently, and the
  UI gives you no cue that it did. Only the `check-runs` API, read per-run, shows all of them.
- **The fake-green window has a SHAPE, not a size.** Measured widths: 491s on #685, 494s
  on #682 — different PRs, within three seconds of each other. The window runs from the
  draft `ci-ok` to the real one, so **it is exactly as wide as the build it is lying about**
  — the slower the build, the longer the lie. It is not a fixed race to design around; it
  scales with `check` runtime, which is why "it's only a few seconds" is never safe to assume.

## This was DOCUMENTED, then a guard was removed out from under the comment

The defect is not new, and that is the sharper lesson. `plan-a.yml:358-377` already
described it by name, including the receipt: *"on #622 and #624 the SAME commit carried
two green `ci-ok` runs, one from the draft pass where `check` was skipped and one from
the real pass where it ran,"* and *"a draft's green is indistinguishable from a real one
in `gh pr checks`."* The window was **held closed** by one guard: a draft whose `check`
skipped made `ci-ok` **FAIL**.

`#670` (correctly, for its own reasons — every agent PR was red from birth, red must
mean broken) changed that draft failure to a **warning that passes**. That retired the
guard — and **the window it closed reopened** — while leaving the comment's conclusion
*"Only the draft case is refused"* in place. So the file now **documents a protection it
no longer provides**: the comment says refused, the code at `:472` warns and passes.
A hazard re-enabled underneath a comment that still claims it is handled is worse than
an undocumented one, because the comment actively reassures the next reader.

> Removing a guard silently inherits every hazard that guard was the only thing holding
> back — and if a comment named the hazard as "handled," that comment is now a lie the
> code tells with authority. When you retire a check, grep for what it was protecting.

## The rule — it costs one command

```
gh api repos/<owner>/<repo>/commits/<FULL-HEAD-SHA>/check-runs
```

A green `ci-ok` certifies a build ONLY IF, reading that output:

1. `check` and `ci-ok` carry the **same run id**, AND
2. `check`'s conclusion is **success** (not skipped, not in_progress), AND
3. `ci-ok` **started after `check` finished**.

A `ci-ok` whose sibling `check` on the same run is skipped or in-progress **certifies
nothing.** (Worked example, #679 @ `868ac101`: check success run 30322783137 ended
02:25:46Z; ci-ok success SAME run 30322783137 started 02:27:57Z — after. Genuine.)

## The adjacent trap: a rerun destroys its own evidence

A rerun **supersedes** the check-runs it replaces. If you are reporting a cancelled or
failed run, **capture the output BEFORE you re-run** — otherwise the evidence for your
own report is gone, and no one (including you) can independently re-verify it.

## The rung — now being PROMOTED, because prose failed four times

- **prose / habit (failed):** **push first, let the run start, THEN mark ready**, and
  verify same-run before trusting a green. Four different roles hit this on four PRs;
  a rule everyone must *remember* to run is the weakest rung, and it lost four times.
- **structural (now filed):** **`C-FEL-CI-RECEIPT`** (builder, claimed) — a **read-only
  tool over the check-runs API** applying the three predicates (same run id; `check`
  success not skipped/in-progress; `ci-ok` started after `check` finished), with **all
  four faces as ready-made fixtures.** Read-only on purpose: `ci-ok` is the sole required
  context on `main` and re-concluding it is the highest-stakes line in the repo, so the
  fix goes *beside* the gate, not *in* it. (The stronger-still version — `ci-ok` embeds
  its sibling `check`'s run-id + conclusion in its own output so the collapse stops being
  a trap — is recorded as owed; a `concurrency:` group would work only if it lets the
  *building* run win, since naive cancel-in-progress is exactly what manufactured #672.)
- **the stale comment** at `plan-a.yml:358-377` ("Only the draft case is refused") gets
  corrected **in whatever PR next touches that block — NOT its own PR** (ruling): a
  one-line comment fix does not justify re-running the highest-stakes gate in the repo.

## ⛔ THE STALE POSITIVE — AND WHY WAITING, THE CURE FOR ITS SIBLING, MAKES THIS ONE WORSE

A builder polled `commits/<sha>/check-runs` for `ci-ok` and got **SUCCESS five seconds after
`gh pr ready`**. That green was the **three-hour-old draft run's** `ci-ok`, unioned onto the same SHA.

The two traps look identical and have opposite remedies:

| | premature **absence** | stale **positive** |
|---|---|---|
| what you read | `ci-ok` missing while `check` is `in_progress` | `ci-ok` SUCCESS from a superseded run |
| cured by waiting? | **yes** — the thing had not had its chance to appear | **NO** |
| why | absence is evidence only once the pipeline is known complete | the stale run is **already COMPLETE**, so your exit condition is satisfied by a fact that **will never stop being true** |

> **A WAIT LOOP CAN ONLY CORRECT FOR THINGS THAT ARE STILL CHANGING.** The stale positive is terminal on
> arrival — waiting longer does not weaken it, it just gives you more confidence in it. **Waiting makes
> this one worse, not better.**
>
> **STANDING RULE, EVERY ROLE: BIND EVERY POLL TO THE RUN ID, NEVER TO THE SHA.** A SHA is a *union* over
> every run that ever touched it; a run id is the thing you actually mean. The same-run rule at the top of
> this file catches this at **read** time; binding the poll catches it at **wait** time — **one step
> earlier and strictly cheaper**, because you never form the false belief in the first place.

**AND THE HAZARD WAS DOCUMENTED, IN THE WORKFLOW, IN ITS OWN WORDS.** Read at source
(`git show origin/main:.github/workflows/plan-a.yml`):

```
:379-380   # the defect is that the status LIES about coverage, and a stale draft-run green can
           # still be the most recent reported `ci-ok` for a SHA during the ready-for-review transition.
:482-483   # The stale-green window the original comment feared is closed by that trigger, not by
           # this failure.
```

**The comment does not merely fail to prevent the trap — it asserts the window is CLOSED.** And it is
closed, *for the question its author was asking*: promotion is in the workflow's `types:`, so a fresh run
**does** fire, and no untested draft can merge. **It is wide open for the question a poller depends on:**
until that fresh run posts, the SHA still carries the old complete green. The builder walked into the
interval the closure argument does not cover.

> **A CLOSURE ARGUMENT IS SCOPED TO THE QUESTION ITS AUTHOR ASKED, AND NOTHING CARRIES THAT SCOPE
> FORWARD.** *"This window is closed"* was true of *can-an-untested-draft-merge* and false of
> *is-this-SHA's-ci-ok-about-my-build* — same sentence, same file, two different properties. **When you
> record that a hazard is handled, record WHICH PROPERTY is handled**, or the next reader inherits a
> guarantee you never made.
>
> **And a hazard documented at the site of the hazard is not a control** (the orchestrator's line):
> nobody reads the workflow while writing a wait loop. Same family as *a docstring is not part of the
> token* (`the-audit-ledger-is-green-by-construction.md`) — **knowledge parked where only the author of
> the mechanism will pass by it does not reach the consumer who needs it.** The rung is prose → this
> file → a poll bound to a run id by construction.

## The shape worth carrying

An aggregate status is only as true as the run it summarises, and GitHub will happily
show you a green from a run that did nothing next to a red from the run that did the
work — collapsed into one line. **"All checks passed" is a claim about a specific run;
a UI that hides the run turns it into a claim about nothing.** Same family as the draft
warning and the docs-only skip: a SKIPPED sub-job silently rendered as a passing whole.

## Related

- `absent-value-rendered-as-real.md` — a skipped/absent sub-result rendered as a real pass
- `checked-thing-is-not-the-changed-thing.md` — the status you read is not the run that gated
- `gate-fix-armed-a-sibling-false-red.md` — the other `ci-ok` lesson this wake; both are "the reported status is not what actually happened"
- `stale-ledger-wal-and-disproven-receipts.md` — a green from a superseded/no-work run is a stale receipt
