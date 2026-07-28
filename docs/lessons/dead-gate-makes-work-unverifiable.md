# A DEAD GATE DOES NOT JUST STOP CATCHING BUGS — IT MAKES OTHER PEOPLE'S WORK UNVERIFIABLE

**Topic:** CI gates, toolchain (moon/proto), measurement-integrity
**Session:** named 2026-07-27, triaging a red `matrix` on #656
**Category:** ci-lint, measurement-integrity
**Severity:** high — a gate red-by-construction for days silently converted a
verifiable question into a permanent could-not-check on a *different* contract, whose
owner paid the cost unaware.

## The trigger

The scaffold DX `matrix` lane is **not flaky — it is DEAD.** Every cell dies at
**package-manager install**, before a single line of aihu code runs. Read from the log,
not the summary — and independently re-fetched here rather than taken on report:

```
$ gh run view 30318406544 --log-failed | grep -i fallback_loop
matrix  npm error Error: proto::commands::run::fallback_loop
        /opt/hostedtoolcache/node/22.23.1/x64/bin/node is a proto shim, which would
        trigger a recursive execution loop
        SUMMARY: 2/15 cells passed, 13 failed, 1 package manager(s) skipped
```

A collision between moon's proto shim and the GitHub-hosted node. Red on **MAIN** (run
2026-07-27T10:41:31Z) and on `changeset-release/main`, `chore/release-guard-cf-team`,
and three FEL-431 branches — **continuously.** And it sits **OUTSIDE `ci-ok`**
(`.github/workflows/plan-a.yml:378` — `needs: [check, examples, governed-examples,
lesson-refs, palette]`; `matrix` is not in it), so nothing ever forced anyone to look.

## Three framings

1. **Absent-value family (ninth entry).** A cell that cannot install has tested
   **nothing**, so its red is not a signal — it is the **absence** of one, rendered as a
   failure. And 87% red-by-construction (13/15) trains everyone to ignore the lane,
   which is how the remaining 13% of real signal dies too. Same erosion as bench-red in
   `checked-thing-is-not-the-changed-thing.md`.
2. **Checked-thing-is-not-the-changed-thing, at the toolchain layer.** The lane measures
   the moon/proto PATH environment, not the scaffold. **Same root** as builder-b's
   `C-FEL-MOON-ROLLDOWN` fix (moon/proto PATH assumptions not holding in the real
   environment) — two instances, one root, found four wakes apart by different people.
   One row, not two.
3. **The one with real cost — the novel lesson.** #663 (C-FEL-431, cf-team `.moon`
   workspace) shipped with an *honest* could-not-check: *"typecheck exit 0 on the
   pristine scaffold needs the real create-aihu pipeline."* **The matrix lane IS that
   pipeline.**

> **A DEAD GATE DOES NOT JUST STOP CATCHING BUGS — IT MAKES OTHER PEOPLE'S WORK
> UNVERIFIABLE.** It silently converts a *verifiable* question into a *permanent
> could-not-check* on someone else's contract, and they pay the cost without ever being
> told why. The builder who wrote #663's honest could-not-check was owed a pipeline that
> had been dead the whole time — and nobody could have told them, because nothing was
> watching the lane it lived in.

## The standing rule this produced

> **NAME A RED LANE IN YOUR VERDICT — do not omit it.** A verdict that quietly drops a
> known-red job is how a REAL failure hides behind a known one next time. Say which job,
> say why it is not yours, and move on.

It is the mirror of the flapping-gate caveat (`absent-value-rendered-as-real.md`, "the
eighth"): there, you must not report someone else's race as *your* red; here, you must
not silently omit a red that is not yours. Both reduce to: **a verdict accounts for
every non-green job by name.**

## The fix and the anti-recurrence row

Filed **C-FEL-MATRIX-PROTO → builder-b**, ranked third behind C-FEL-411 and
C-SWARM-WAL-STALE (do not start before 411). **Rung: structural** — resolve the
moon/proto/node PATH collision so cells install. The must-fail that stops recurrence:

> **After the fix, a DELIBERATELY BROKEN scaffold must make the lane go RED.** A lane
> that cannot fail for a real reason is not a gate — it is green/red-by-construction,
> the defect this directory keeps finding, and the only proof it is a gate again is that
> it can be made to fail on purpose.

## Related

- `absent-value-rendered-as-real.md` — ninth entry; red-by-construction erosion, and "the eighth" (flapping gate)
- `checked-thing-is-not-the-changed-thing.md` — toolchain root, shared with `C-FEL-MOON-ROLLDOWN`
- `promotion-rungs.md` — a gate that cannot fail on purpose is not a gate
