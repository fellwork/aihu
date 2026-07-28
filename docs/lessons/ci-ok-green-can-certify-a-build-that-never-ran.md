# A green `ci-ok` can certify a build that never ran

`ci-ok` is the sole required context on `main`. It is an aggregate: it reads its
sibling jobs and concludes. That makes it exactly one bit wide — and one bit
cannot say *which run produced it*. Four times in one session a PR reported a
green that proved nothing, and each time the only thing standing between that
green and a merge was an agent remembering a prose rule.

The rule is now a tool: `bun scripts/ci-receipt.ts <pr|sha>`.

## The three predicates

A green is a receipt only when **one workflow run** satisfies all three:

1. `check` and `ci-ok` carry the **same run id**
2. that run's `check` concluded `success` — and **`skipped` is not `success`**
3. `ci-ok` started **strictly after** `check` finished

Predicate 3 is not pedantry. Run-id equality alone passes face 2 by accident: a
`ci-ok` that started before its own `check` finished cannot have observed the
result it is reporting.

## The four faces, all measured on real shas

| # | Face | Where | What you saw |
|---|------|-------|--------------|
| 1 | **stale-green** | #680 @ `586c61d7` | Two runs on one sha. The run whose `check` SKIPPED posted green at 02:32:06 — eight minutes before the real run finished at 02:37:53. |
| 2 | **green-beside-in_progress** | #681 | `ci-ok success` sitting next to `check in_progress`. |
| 3 | **red-because-cancelled** | #672 | Concurrency cancelled `check`; `ci-ok` failed closed. Correct behaviour, wrong triage — people re-ran it as if it were flaky. |
| 4 | **draft-gated green** | #682 @ `518b204d` | Run `30324508177` had `changes` SKIPPED and `check` SKIPPED and still posted `ci-ok completed/SUCCESS`, on the same sha as the real run `30324519103`. |

Four different-looking incidents, one shape: **an aggregate that treats
"did not fail" as "passed."** A skipped job did not fail. A job that has not
started has not failed either.

## Why `gh pr checks` cannot answer this

`gh pr checks`, the PR summary, and `mergeStateStatus` all **collapse** every run
on a sha into one row per context name. On #682 today:

```
$ gh pr checks 682
check   pass  5m46s  .../runs/30324519103/job/90167002172
ci-ok   pass  2s     .../runs/30324519103/job/90168147562
```

Two rows. Run `30324508177` — the one that posted a green `ci-ok` behind a
SKIPPED `check` — **is not in that output at all**. The collapsed view cannot
report "I ignored the draft-gated run", because it cannot see it. And
`mergeStateStatus` is `CLEAN`: one word, no run attribution.

`statusCheckRollup` does carry all four entries, but it has no run-id field —
only a `detailsUrl` — so a consumer reading `.conclusion` still answers
"is there a `ci-ok` with conclusion success?", which is **true** at the moment
the draft-gated green posted. That is the naive predicate, and it is wrong:

```
NAIVE SAYS:      PASS (a ci-ok concluded success)
CI-RECEIPT SAYS: NOT_TRUSTWORTHY | trusted run: None
```

If a checker agrees with `gh pr checks` on every input, it is not a
discriminator. Only the per-run check-runs data can answer the question.

## Refuse rather than pass vacuously

Zero check-runs, or a `ci-ok` that never reported, exits **non-zero**. Nothing
ran is not the same as nothing failed — the same floor idiom that #680 needed.

## Replaying history

Re-pushing a branch replaces its check-runs, and a re-run supersedes and
destroys its own. #672's cancelled run had already vanished by the time this was
written, and all four shas read TRUSTWORTHY today because their real runs
eventually finished. So:

- `--at <iso>` reconstructs what the tool would have said at a past instant,
  which is how faces 1 and 4 stay demonstrable on the real shas.
- `--selftest` pins all four faces as offline fixtures, which is how they stay
  demonstrable after the evidence rots off the API entirely.

Capture check-run output **before** re-running anything. The evidence is
mutable and the re-run is what destroys it.

## The habit this does not replace

Push, *then* mark ready. A `ci-ok` from before your last push is a receipt for
somebody else's commit.

## The rung above this

This tool is a **detector**, which is a rung below a fix. The structural
versions, both out of scope for the detector's contract:

- a concurrency group that lets the **building** run win rather than the latest
  — naive cancellation is precisely what face 3 is; or
- `ci-ok` embedding its sibling `check`'s run id and conclusion in its own
  output, so the collapse stops being lossy and the trap stops existing.

Either is a change to `.github/workflows/plan-a.yml`, which carries the sole
required context on `main`. That is its own contract, deliberately not this one.
