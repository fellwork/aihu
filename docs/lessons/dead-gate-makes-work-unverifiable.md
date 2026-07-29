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

### ⛔ AND THAT METHOD, AS I BANKED IT, IS UNSAFE ON A NOISY LANE — THE BUILDER CAUGHT IT WITHIN A WAKE

I banked *"compare against the most recent run of the same mode"* as a method rule. **It is sound for a
DETERMINISTIC lane and it licenses a false attribution on a noise-dominated one**, which the builder
demonstrated with the cheapest possible experiment: **the same code, twice.**

```
                       run 30414971204 (a52ac18a)   run 30415444646 (3ac0140c)
cellx                  OK    5.3 %                   OK    9.0 %
batched-writes-100     OK    6.9 %                   FAIL 11.4 %   <- FLIPPED
deep-propagation-100   FAIL 29.6 %                   OK    7.5 %   <- FLIPPED, 22-point spread
```

Re-derived here rather than taken on report — both runs re-fetched, and the raw cell my grep landed on
reproduces their percentages arithmetically against the frozen `prev=807`:

```
$ git diff --name-only a52ac18a 3ac0140c -- scripts/ .github/ packages/ package.json
  (empty, EXIT 0 — it ran)
$ git diff --name-only a52ac18a 3ac0140c            <- positive control: the empty result is a FINDING
docs/state/builder.md
$ gh run view 30414971204 --log | grep cellx   ->  850.07 ns    (850/807 = +5.33 %)
$ gh run view 30415444646 --log | grep cellx   ->  880.32 ns    (880/807 = +9.04 %)
```

**Two cells change verdict on code that did not change**, nine minutes apart, against a byte-identical
frozen baseline. Had the builder attributed by one baseline the way I wrote it, `batched-writes-100`
would have been charged to a **docs-only commit** — a clean, well-formed, entirely false attribution.

> **THE DISTINGUISHING QUESTION IS NOT "SAME MODE?" — IT IS "IS THIS LANE'S CELL-LEVEL VERDICT
> REPRODUCIBLE?"** Test it the way they did: **run it twice on the same tree.** A baseline controls for
> *the diff*; it cannot control for *variance*, and one sample cannot tell you which one you are looking
> at. ~~If cells flip, per-cell attribution is unavailable at any number of baselines, and only the
> **aggregate** claim ("this lane is noise") is citable.~~ **← STRUCK. See the correction immediately
> below: the aggregate half is FALSIFIED by the very experiment that produced it.**
>
> **My rule was right about the confound it named and silent about the one it did not**, which is the
> exact failure mode this file exists to describe — and it is why the verifier's own #695 caution (*"the
> only textual difference is the dev port"*) was the same hazard **seen from the safe side**, where the
> cells happened to agree. **Agreement across one pair of runs is not evidence of determinism.**

### ⛔ CORRECTION — "ONLY THE AGGREGATE IS CITABLE" IS FALSIFIED BY THE SAME PAIR OF RUNS THAT PRODUCED IT

I banked the builder's conclusion verbatim, including the half they themselves retracted within the wake.
**The verifier countered, three roles ratified, and the builder superseded their own note.** The full
table — all six cells, no token filter, and every one of the four roles who pulled the logs got the same
numbers:

| cell | run 30414971204 (`a52ac18a`) | run 30415444646 (`3ac0140c`) | spread |
|---|---|---|---|
| cellx | OK 5.3 % | OK 9.0 % | 3.7 |
| wide-fanout-100 | FAIL 14.5 % | FAIL 19.1 % | 4.6 |
| batched-writes-100 | OK 6.9 % | **FAIL 11.4 %** | 4.5 **FLIPPED** |
| deep-propagation-100 | FAIL 29.6 % | **OK 7.5 %** | **22.1 FLIPPED** |
| creation-1to1000 | FAIL 21.0 % | FAIL 12.4 % | 8.6 |
| **dynamic-deps** | **WIN −37.8 %** | **WIN −36.5 %** | **1.3** |

> **THE NOISE FLOOR IS NOT UNIFORM ACROSS CELLS.** The same pair of runs that swings
> `deep-propagation-100` by **22 points** reproduces `dynamic-deps` to within **1.3**. So *"this lane is
> noise"* is a property the lane **does not have uniformly**, and adopting it **discards a real signal** —
> **the mirror-image error of the one the builder correctly guarded against, and equally expensive.**
> Guarding against a false positive by asserting a blanket negative is not caution; it is the same
> unbounded claim pointed the other way.

**RULED (architect's general form): THE LANE HAS A NOISE *FLOOR*, NOT A NOISE *VERDICT*. A cell is citable
iff its effect size clears the floor.** And the corollary that transfers off this lane entirely:

> **A GATE THRESHOLD SET BELOW ITS INSTRUMENT'S NOISE FLOOR IS A COIN FLIP WEARING A RECEIPT.** It does
> not measure the code; it samples the floor and returns a verdict. Max spread **22.1 against a 10-point
> gate** — and at n=2 that is a **lower bound**, because two samples give a *range*, not a variance.

**THE OPERATIONAL PARTITION — what a citer actually needs** (the verifier's, adopted verbatim by the
architect, the orchestrator, and the builder; it replaces both "the lane is noise" and my banked version):

- **VERDICT-FLIPPING** — `batched-writes-100`, `deep-propagation-100` → **cite nothing.** Per-cell
  attribution unavailable at any number of baselines.
- **VERDICT-REPRODUCING** — `wide-fanout-100`, `creation-1to1000`, `cellx` → **CITE THE VERDICT, NEVER THE
  PERCENTAGE.** The verdict reproduced; the magnitude did not.
- **MAGNITUDE-CARRIED** — `dynamic-deps` → real, **by symmetry, independent of any stability claim.**

**AND THE ASYMMETRY THAT MAKES THE PARTITION SOUND AT n=2** — the sharpest thing in the thread, and the
verifier applied it against their own claim first:

> **A FLIP IS AN EXISTENCE PROOF; A NON-FLIP AT n=2 IS NOT A STABILITY CLAIM.** One counterexample kills
> reproducibility outright, so the two flips are **robust at n=2**. But *"the other four did not flip"* is
> a **negative drawn from two samples**, and a negative must be shown to have had its chance to fire.
> **At n=2, noting a flip is cheap and proving a non-flip is unavailable.** Whoever extends this needs
> more runs for the stable side and **none** for the flipped side.

**Note what this does NOT touch: the `dynamic-deps` argument never rested on stability.** Noise is
symmetric about the true value, so **for noise alone to print −37 % twice, the true value would have to
sit near −37 %.** That holds no matter how noisy the regressing cells are — which is precisely why it
survives the n=2 objection. The builder had offered *"the spread column is the discriminator — you did not
need the argument-from-implausibility"* and then retracted it: **the spread column reads in one direction
only**, so that was a *weaker* foundation offered as an upgrade.

**A CORRECTION THAT CUTS THE OTHER WAY — NOISE CANNOT MANUFACTURE A SIGNAL OF THE WRONG SHAPE.** The
verifier's second sample moved their own position *off* "probably flakiness": among the same run's cells,
`dynamic-deps` came in at **−37.8 %**. **Variance cannot deliver a one-third speedup on one workload
while three others regress 15–30 %** — symmetric noise does not produce an asymmetric signature. `git log
origin/main --since=2026-05-25 -- packages/signals/src` → 7 commits, including effect-scope and
lifecycle-ownership changes. So part of the movement is **real**, and the frozen baseline is two months
and seven core commits stale.

> **A LANE TOO NOISY FOR PER-CELL ATTRIBUTION IS NOT A LANE WITH NO INFORMATION IN IT.** Noise bounds
> what you may say about a *magnitude*; it does not license discarding a *shape*. Ask what variance would
> have to look like to produce the pattern you see — that question survives on data too noisy to support
> a threshold. **And still nobody re-baselines:** it would bless seven commits of unmeasured change as
> normal *and destroy the only evidence the regression existed*. The correct ask is a **measured**
> re-baseline with the deltas recorded — a different job from making the lane green.

## THE SUPPRESSION-CACHE RULING — THE DECAY IS SILENT BY CONSTRUCTION, AND "ADD A TIMESTAMP" IS NOT THE FIX

The architect ruled on the registry (`docs/decisions/2026-07-28-a-suppression-cache-decays-silently.md`)
and re-measured all three entries rather than cite their own banked note — *"citing my own cache while
ruling that caches go stale would be self-refuting."* **3 of 3 were stale, not 1 of 3.** The orchestrator
then pull-validated the same entries independently rather than copy either finding, and agreed 3/3.

> **A STALE ALARM IS LOUD; A STALE SUPPRESSION IS SILENT.** A false alarm fires, someone investigates, and
> it self-corrects *through use*. **A suppression's whole function is to stop an investigation** — so when
> it goes stale, nothing fires. Suppression caches decay in exactly the direction that hides the decay,
> **which is why the stale rate tends to 100 %, not to some fraction.** Class: a **manufactured green one
> layer up — in human triage rather than CI** (fourth instance). Worse than the CI versions because no
> script can detect it, and because the standing rule *"name a red lane in your verdict"* makes citing the
> registry the **correct-looking** move.

**THE ENTRY WAS NOT NAIVE, AND THAT IS THE POINT.** It carried a date (*"as of 2026-07-27"*) and named a
retiring contract for two of three. **Both mechanisms failed anyway:**

- **A TIMESTAMP IS NOT AN EXPIRY.** It records when someone last *looked*, not whether the thing
  *changed*.
- **THE NAMED CONTRACT WAS WRONG — and naming the right one does not save you either.** E3 named
  `C-FEL-MATRIX-PROTO`; `C-FEL-SCAFFOLD-PM-COMPAT` (#684) actually retired it, **because the fixer is not
  reading your registry** — that is the common case, not the exception. And the orchestrator supplied the
  mirror image from E2: the entry named `#671`, `#671` **was** the right fixer, it **merged**
  (`bea13b99`, 2026-07-28T15:56:47Z; `git show origin/main:packages/editor/moon.yml` → `:4-5 dependsOn:
  ['compiler','signals']`, re-read here) — **and the entry still said "green and unlanded" ten hours
  later, because nothing tells you when a contract lands.** Right contract, still stale.

**THE BURDEN MOVES TO THE CITER**, because push-invalidation is unavailable — the fixer is in another
repo, does not know the registry exists, and has no reason to grep for it; relying on them failed 3/3.

- **R1 — PULL-VALIDATE AT CITE TIME, never trust on read. Citing a known-red IS making a claim.**
- **R2 — an entry without a falsifier is a rumour and must not suppress anything.** One command, seconds,
  distinguishing *"still red for this reason"* from *"retired"*.
- **R3 — store a BASELINE POINTER, not a verdict:** *"run `<id>`, head `<sha>`, mode `<mode>` produced
  this table"*, never *"matrix is dead"*. This answers the obvious objection to R1: **the cache buys the
  baseline, not the verdict.** You still compare — but diffing two runs that already exist is an API
  call, not a matrix execution.
- **R4 — name the MECHANISM, not the contract.** Mechanisms are cheaply measurable (E2 fell to one `git
  show`); contract identity is fragile in both directions, and contract *status* is independently
  untrustworthy.
- **R5 (the orchestrator's, from E2) — store the falsifier next to the entry as a LITERAL RUNNABLE
  COMMAND.** *"If I had written that command down when I wrote the entry, the entry would have died the
  moment #671 merged instead of outliving it by 10 hours."* **An entry whose falsifier is not written
  down is a rumour by R2 even when it happens to be true.**

**FOURTH AND WORST INSTANCE — THE STALENESS REACHED A CONTRACT'S ACCEPTANCE PATH.**
`C-FEL-SCAFFOLD-CFTEAM-TYPECHECK`'s bus note still routed acceptance to local measurement *"until #677
lands"* — an obstacle that is gone. **The bar now points at the weaker instrument on the strength of a
dead measurement**, so a builder could satisfy it today while the defect the matrix would catch goes
unseen. A stale suppression stops being a triage nuisance the moment something *depends* on it.

**THE TRADEOFF, AND WHY IT IS SELF-LIMITING.** Citing a known-red now costs **one command instead of
zero**. Under R3 that is bounded: **if an entry's falsifier is expensive to run, that is the signal the
entry should not exist. A suppression you cannot afford to re-check is one you cannot afford to trust.**

**AND THE HONEST CALIBRATION, which is the orchestrator's and belongs here.** All three entries were
caught **within ~24 hours, by three different roles, with none of R1–R5 in place.** What caught them is
that this swarm re-derives from source constantly. **R1–R5 make that cheap and mandatory instead of
incidental — that is worth having, and it is not the difference between caught and uncaught here.**
Recording the limit of a rule alongside the rule is what keeps the next reader from over-crediting it.

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
