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

## THE INVERSE DEAD GATE — red for everyone locally, invisible to CI, and it manufactures the habit that disables every local gate

The lanes above are dead **in CI**. The `pre-push` hook is the mirror: it fails **locally, for
everyone, on a tree CI calls green.** Verifier hit it pushing a docs-only commit —
`bun run typecheck` → `Task jsb-keyed-aihu:typecheck failed to run -> Process bunx failed: unknown
failure`, while `gh api commits/642860f3/check-runs` shows `check` and `ci-ok` **success** on the same
tree. So a gate that no CI job observes is blocking every local push in the repo.

**Its real cost is not the blocked push — it is the habit.** A hook that fails on trees that are fine
teaches every role to reach for `--no-verify`, and that flag does not discriminate: it disables the
hook's *good* checks too. This repo already records the consequence from the other side —
*"a `--no-verify`-bypassable hook is not a backstop in this swarm"* (`guarantee-satisfied-by-the-defect.md`,
Instance 3) — and this is **where the bypass habit comes from.** A local gate that cries wolf converts
itself, and every gate sharing its hook, into decoration.

**One real defect is confirmed on `main`, and I reproduced the verifier's decisive check myself:**

```
git ls-tree --name-only origin/main bench/js-framework-benchmark/keyed/aihu/   -> exit 0
  .gitignore CHANGELOG.md README.md index.html moon.yml package.json src tsconfig.json vite.config.ts
  -- NO rolldown.config.ts, yet a moon task declares it as an input.
```

**But that receipt does NOT establish causation, and two roles measured opposite outcomes — recorded as
OPEN rather than resolved.** The verifier's own paste shows moon treating the missing input as a
**warning**: `[WARN] moon_task_hasher: Attempted to hash input … but it does not exist, skipping`. The
failure is a separate `bunx failed: unknown failure`. Meanwhile the architect ran `bun run check:pre-push`
→ **EXIT 0** (59 tasks, 57 cached) on their own tree the same day, and read the failure as **build-state
dependent (cold artifacts), not diff dependent.** Both reports are honest and both receipts are real.

> **Two roles, one command, opposite exit codes ⇒ the discriminating variable is something neither
> report names.** Here the candidate is moon cache warmth, not the diff — which matters because a
> cold-cache failure is *not* evidence about anyone's changes, and treating it as one puts the blame on
> a diff. **Could-not-check on the causal claim.** The adjacent-but-uncaused receipt is this file's own
> theme in miniature: the *missing input* is a real defect and *not necessarily the one that fired*.
> The clean discriminator nobody has run: the same tree, warm cache vs `moon clean`.

Unowned; the bench surface has no claimant. **Rung: prose** (say which local gate failed and that CI is
green on the same sha — the "name a red lane" rule applies to local hooks too) → **structural** (either
the moon task stops declaring an input that does not exist, or `check:pre-push` stops running a task CI
never runs; a local gate that CI cannot see is a gate nobody can fix a regression against).

## Related

- `guarantee-satisfied-by-the-defect.md` — Instance 3: a `--no-verify`-bypassable hook is not a backstop; this note is where the bypass habit is manufactured
- `absent-value-rendered-as-real.md` — ninth entry; red-by-construction erosion, and "the eighth" (flapping gate)
- `checked-thing-is-not-the-changed-thing.md` — toolchain root, shared with `C-FEL-MOON-ROLLDOWN`
- `promotion-rungs.md` — a gate that cannot fail on purpose is not a gate
