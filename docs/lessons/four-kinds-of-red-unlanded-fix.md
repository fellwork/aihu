# FOUR KINDS OF RED — AND THE FOURTH IS A STALLED MERGE QUEUE CHARGING RENT

**Topic:** CI triage, red taxonomy, merge-queue throughput
**Session:** named 2026-07-28, from the orchestrator reading a failing job instead of the summary
**Category:** ops, measurement-integrity, noise-over-signal
**Severity:** medium per incident, compounding — a solved, merged-ready fix left unlanded keeps
manufacturing fresh red that every reader re-triages from scratch, which is the exact
noise-over-signal defect `#670` was written to kill, arriving from the merge queue instead of the gate.

## The taxonomy — a red is not a red is not a red

| kind | what it means | what it demands |
|---|---|---|
| **red-because-broken** | the diff is bad | investigate |
| **red-because-dead** | the lane could not produce a result (frozen `bench` baseline, dead `matrix` shim) | fix the lane |
| **red-because-cancelled** | the run never reached a verdict (concurrency) | re-run — and **capture the output first**, a rerun supersedes it |
| **red-because-an-unlanded-fix** *(named this session)* | known, fixed, reviewed, green, **unmerged** | **LAND IT** |

The first three were already in this project's working vocabulary (`checked-thing-is-not-the-changed-thing.md`
for dead, `ci-ok-green-only-with-same-run-check.md` for cancelled). The fourth is new, and the
orchestrator named it as **their** error class, not any builder's: it is produced by a stalled queue,
not by a diff.

## The incident (receipt)

`#685` went red on head `4112f541` (run `30366941091`, `check` FAILURE, `ci-ok` FAILURE same run).
Read from the failing job, not the summary:

```
editor:typecheck | tests/component-compile.test.ts(16,31): error TS2307:
    Cannot find module '@aihu/compiler' or its corresponding type declarations.
```

That is `C-FEL-411` verbatim — the editor→compiler moon build-ordering race. **The commit touched
ONE state file; a build-ordering race is a property of the GRAPH, not of that diff** — the tell that
this red cannot have been caused by what changed. And `#671` is the fix: `gh pr diff 671 --name-only`
lists `packages/editor/moon.yml` and `packages/compiler/moon.yml` (verified — it re-orders the whole
moon graph), it is green (run `30321535839`, `ci-ok` after `check`), `MERGEABLE`, and had sat unlanded
for **twelve-plus hours.** (By the time the historian looked, `#685`'s head had already moved to a new
sha with a re-run pending — the captured red above was the orchestrator's, and it is already
superseded, which is itself the capture-before-rerun lesson.)

## Why the fourth kind is the dangerous one

The other three are honest signals pointing at a real place to act. The fourth is **noise wearing the
costume of signal**: the board fills with red that means "someone did not merge a green fix," genuine
failures hide among it, and every reader learns to ignore red — the precise reflex `#670` was written
to end, now re-manufactured from the merge queue. A stalled queue does not merely delay the queued
work; **it lets a solved problem keep charging rent** in re-triage cost against everyone downstream of
the unlanded edge.

> "Red must mean broken" has a merge-queue dual: an unlanded fix makes red mean *"nobody merged,"*
> which trains the same ignore-red habit from the other end of the pipeline.

## The diagnostic rung — how to tell the fourth apart

- **Read the failing JOB, not the summary.** The error names the module / graph edge that failed
  (`@aihu/compiler`); then check whether an OPEN, green, mergeable PR already fixes that exact edge.
  Same read-the-log discipline as the same-run rule (`ci-ok-green-only-with-same-run-check.md`).
- **A red on a diff that cannot have caused it** — a single state-file commit producing a
  graph-ordering typecheck failure — is the tell that the cause is the lane or the queue, not the diff.

## The rung

- **prose (today):** triage every red into one of the four before reporting it; never report a bare
  "red" — name which kind, with the run and its timestamp.
- **structural:** land green, verified, mergeable work promptly — the fourth kind is a **queue-health
  metric**, "how long has a green mergeable fix sat," and it should be visible and bounded. The
  deeper fix for *this* instance is CI ordering that does not depend on merge order (the moon graph
  should build editor after compiler regardless of what is merged), so a known race cannot keep
  reddening PRs until its fix lands.

## Related

- `checked-thing-is-not-the-changed-thing.md` — red-because-dead (frozen `bench` baseline); a red the diff cannot have caused
- `ci-ok-green-only-with-same-run-check.md` — red-because-cancelled, and capture-before-rerun
- `the-audit-ledger-is-green-by-construction.md` — the same stalled-queue "charging rent" cost, in the ledger
- `promotion-rungs.md` — the noise-over-signal family; this is `#670`'s defect arriving from the merge queue
