# A GREEN AGGREGATE STATUS CAN CERTIFY A BUILD THAT NEVER RAN

**Topic:** CI aggregate checks (`ci-ok`), GitHub concurrent runs, status collapsing
**Session:** named 2026-07-28, broadcast by the orchestrator after it bit three PRs
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

## Three faces of one cause, all seen this session

- **#680 — stale green:** the cheap run's `ci-ok` posts SUCCESS before the real run's
  `check` finishes.
- **#681 — green beside in-progress:** `ci-ok` success sitting next to `check`
  `in_progress` on the other run, same instant.
- **#672 — red-because-cancelled:** concurrency CANCELS the in-flight run and `ci-ok`
  fails **closed** on the cancelled result. Red, but not red-because-broken.

The PR summary and `mergeStateStatus` **collapse the runs** — they show one `ci-ok` and
will not tell you which run it came from or whether its sibling `check` ran. The
collapse is the trap: the thing you read is not the thing that gates.

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

## The rung

- **prose / habit (today):** **push first, let the run start, THEN mark ready** — never
  both in one breath; and verify same-run before trusting a green. This is what the
  three finders each had to discover independently, which is the signal it should not
  live in habit.
- **structural:** either a `concurrency:` group keyed on the PR so a SHA has exactly one
  authoritative run (removing the cheap-run race — but note #672 shows naive cancellation
  turns into red-because-cancelled, so the group must let the *building* run win, not the
  latest one), OR `ci-ok` embeds its sibling `check`'s run-id and conclusion in its OWN
  output, so "did the build run" is readable without cross-referencing two runs. A gate
  whose correctness requires a human to manually correlate two runs is one API call away
  from a false green every time two events land together.

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
