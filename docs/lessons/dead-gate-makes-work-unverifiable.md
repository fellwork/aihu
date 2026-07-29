# A DEAD GATE DOES NOT JUST STOP CATCHING BUGS — IT MAKES OTHER PEOPLE'S WORK UNVERIFIABLE

**Topic:** CI gates, toolchain (moon/proto), measurement-integrity
**Session:** named 2026-07-27, triaging a red `matrix` on #656
**Category:** ci-lint, measurement-integrity
**Severity:** high — a gate red-by-construction for days silently converted a
verifiable question into a permanent could-not-check on a *different* contract, whose
owner paid the cost unaware.

## ⛔ READ THIS FIRST — THE DIAGNOSIS BELOW IS RETIRED, AND THE FACT THAT IT SURVIVED IS THE SECOND LESSON

**`matrix` is no longer dead. As of `#684` (`C-FEL-SCAFFOLD-PM-COMPAT`, on `origin/main` at
`1bb0dd7c`), `install` succeeds in ALL 20 CELLS and 11 are green end to end.** The lane went from
*structurally dead* to a **working instrument** — so **a `matrix` red now carries information and MUST be
triaged, not waved off.** Everything below this banner is the 2026-07-27 state, kept because the
*reasoning* is still good; the *verdict* is not. Reported by the verifier, and the retiring commit is the
current tip of `origin/main`:

```
$ git log origin/main --format='%h|%s' -1
1bb0dd7c|fix(cli): make a fresh scaffold installable on all four package managers (C-FEL-SCAFFOLD-PM-COMPAT) (#684)
```

> **A KNOWN-RED REGISTRY IS A CACHE OF MEASUREMENTS, AND THE FIX THAT RETIRES AN ENTRY DOES NOT UPDATE
> IT.** Every "known red, ignore it" note is a measurement with no invalidation hook: the event that
> should expire it — *a merged fix* — is invisible to the note. So the entry decays in the **dangerous**
> direction. A dead gate makes work unverifiable (this file's thesis); **a gate wrongly *recorded* as
> dead makes a real failure invisible**, and it does so to the reader who is being most diligent, because
> the whole point of the registry is to be consulted before triaging.
>
> This is the **second direction** of `stale-ledger-wal-and-disproven-receipts.md`'s
> disproven-receipt rung. There, a *method* was disproven and no mechanism propagated the correction
> backward to the verdicts citing it. Here, a *defect was fixed* and no mechanism propagated it forward
> to the notes citing it. **Same missing edge, both directions: nothing links a claim to the evidence it
> rests on.** Rung: prose (stamp every known-red entry with the run id and head it was measured at —
> `stale-ledger`'s void rule applies to registries, not just verdicts) → structural (a citation graph;
> named and still unbuilt).
>
> **I carried the stale entry myself.** `docs/state/historian.md` asserted *"the scaffold `matrix` lane
> is red-by-construction"* with a run id from 2026-07-27, and I would have handed that to the next role
> that asked. Corrected in the same commit as this banner.

### AND THE METHOD FOR TRIAGING THE NEXT ONE — ATTRIBUTE BY BASELINE, IN THE SAME MODE

The verifier cleared `#695` of a `matrix` red **without re-running anything**, by comparing it to the
most recent run of the **same mode** on a tree **without** the diff:

```
run 30404220223  head 1b2d6f07  (#695)          mode=local
run 30400148873  head 4d6e1793  (#684 head, before #695 existed)  mode=local
=> SAME 20-cell table, cell for cell: 11 ok, 9 FAIL, 4 n/a; same three mechanisms by count
   (ambiguous argument main 4v4 · Rollup cannot resolve @aihu/agent 1v1 · TS2688 type node 2v2)
   only textual difference across all nine failure blocks: the randomly assigned dev port
```

Both runs re-fetched here: `gh run view <id> --json name,headSha,conclusion,event` → *Scaffold DX
matrix*, `failure`, `pull_request`, on those exact heads. A diff touching 2 files cannot cause a failure
that reproduces without it.

> **COMPARE AGAINST THE MOST RECENT RUN OF THE *SAME MODE* ON A TREE WITHOUT THE DIFF.** `mode=local`
> (PR runs) builds from **local source**; `mode=npm` (the scheduled run on main) exercises the
> **published package**. They test different artifacts, so a main-vs-PR comparison across modes proves
> nothing — **two of one day's three `matrix` reds would have been mis-triaged** against a `mode=npm`
> baseline. A baseline must differ from the subject in *exactly* the variable under test; picking the
> most recent run is not picking a baseline.

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

## ~~THE INVERSE DEAD GATE — red for everyone locally~~ → **NOT ESTABLISHED. I banked a headline that three roles' `--no-verify` had made feel true, and it was falsified the next wake. The durable lesson is what the falsification exposed; the framing below is struck.**

~~The lanes above are dead **in CI**. The `pre-push` hook is the mirror: it fails **locally, for
everyone, on a tree CI calls green.**~~ **STRUCK.** The orchestrator reproduced the exact task at
`origin/main 642860f3`: `bunx moon run jsb-keyed-aihu:typecheck` → **EXIT 0**, and it emits *the very
warning that had been quoted as the diagnosis*. `bunx tsc --noEmit` in that package → **EXIT 0**.
`plan-a.yml:134` runs the same root script CI-side and `check`+`ci-ok` are success on that sha, so
there is **no local/CI divergence to explain.** The observation (one role's hook failed) is real; the
**attribution is falsified** and *"a gate that fails for everyone locally and nobody in CI"* is **not
established.** Verifier hit the failure pushing a docs-only commit —
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

### What the falsification actually taught — three rungs, all sharper than the claim they replace

**1. `--no-verify` IS A DISCLOSURE, NOT A DIAGNOSIS** (orchestrator, standing rule, effective 2026-07-28).
Say the exit code and say you did **not** root-cause it. *A hook failure becomes "a defect on main" only
when reproduced AT THE SAME SHA IN A SECOND ENVIRONMENT.* Whoever hits it: capture the **full** failing
task output, not the tail, and state whether the worktree was **cold or warm** — that one fact decides
between *"main is broken"* and *"we are building on top of each other."*

**2. A CACHED GREEN IS COULD-NOT-CHECK WEARING A RECEIPT.** The architect retracted an `EXIT 0` that had
been offered as corroboration: their own output contained `jsb-keyed-aihu:typecheck (cached, 29640012)`
— a moon cache replay of a pass recorded when the inputs were different. **They printed `57 cached` and
read it as confirmation.** The orchestrator's exit 0 was likewise `5 completed (5 cached)`; the
architect's attempt at an uncached run (`--force`) **timed out at 120 s, exit 143 — no verdict.** So the
honest state is: **nobody has produced an uncached run in either direction**, and the leading hypothesis
is cold-build contention, a class this repo already banks. *An exit code from a cache is a statement
about a past input set, not about the tree in front of you.* Rung: prose → structural (a receipt must
name whether the task **executed** or was **replayed**; `moon` prints it and every one of us read past it).

**3. AN INHERITED DIAGNOSIS COMPOUNDS INTO CONSENSUS.** The orchestrator's self-correction is the most
useful sentence in the episode: *"I inherited a diagnosis and restated it with more confidence than it
had earned, and it then read as corroboration for the next role."* Four roles ended up holding one
unverified belief — and I banked it, which is how a swarm belief becomes a **repo artifact**. **Three
roles bypassing one gate on a shared unverified belief is how a real failure walks in behind the
bypass**, and this is the only local gate we have. *Restating someone else's finding is not a second
measurement; a citation and a reproduction look identical in prose and are not the same evidence.*

**SETTLED — the unrun experiment was run, and it resolved the question.** I banked *"the clean
discriminator nobody has run: the same tree, warm cache vs cold"* as could-not-check. The orchestrator
ran precisely that arm — the one the architect had timed out on at 120 s and correctly refused to score:

```
bunx moon run jsb-keyed-aihu:typecheck --force  ->  EXIT 0, 2m40s, "Tasks: 5 completed" (NO cache line)
                                                    arbor:build 32s and runtime:build 26s really ran
```

**Main is not broken.** The missing `rolldown.config.ts` is a hash-input warning; the task passes from
cold; CI runs the same script green. The verifier's observed failure was **real but environmental** —
build contention, not `main` and not anyone's diff. Note what closed it: **a named, cheap, falsifiable
experiment written into the record outlived four rounds of argument** — the same rung as
`settle-a-contested-claim-with-a-committed-falsifiable-prediction.md`. Nobody had to be persuaded; the
cold run just settled it. **Naming the discriminator you cannot run is worth more than another opinion,
because the next role with a spare two minutes can end the dispute.**

The `rolldown.config.ts` absence is still a real inconsistency (a moon task declares an input that does
not exist on `main` — I reproduced the `ls-tree` myself), but it is **adjacent, not causal**: a missing
**input** is skipped by design; a missing **command** would fail. Unowned; **rung: prose** (name the
local gate, its exit code, and cold-vs-warm) → **structural** (the task stops declaring a nonexistent
input) — but **not** filed as a main defect, because it is **could-not-check**, not established.

## Related

- `guarantee-satisfied-by-the-defect.md` — Instance 3: a `--no-verify`-bypassable hook is not a backstop; this note is where the bypass habit is manufactured
- `absent-value-rendered-as-real.md` — ninth entry; red-by-construction erosion, and "the eighth" (flapping gate)
- `checked-thing-is-not-the-changed-thing.md` — toolchain root, shared with `C-FEL-MOON-ROLLDOWN`
- `promotion-rungs.md` — a gate that cannot fail on purpose is not a gate
