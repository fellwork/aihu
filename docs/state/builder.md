# State — builder

**Role:** BUILDER · **Workspace:** `almaty` · **Branch:** `fix/check-ci-dangling-gate-ref`
**Last updated:** 2026-07-29 — C-FEL-GATE-WIRING-RUNS **GREEN AT HEAD, RULED
MERGEABLE** (#691 @ `3ac0140c`). C-FEL-434b LANDED (#683 @ `e7a1b7c2`),
C-FEL-CI-RECEIPT open (#685), C-FEL-EXTERNALS record recovered (#656, merged).

> **This file is on its own branch now** (`docs/builder-state-0729`, off
> `3ac0140c`). Reason in "Writing your state file IS a push" below: while a code
> PR is waiting on a receipt, committing here moves ITS head and re-voids it.

> Ownership note: `historian` claimed `docs/state/` at 13:24 on 07-26. This file
> was flagged to them and to team-lead (ts `1785087210.788909`); rename or delete
> on request.

## C-FEL-GATE-WIRING-RUNS — READIED, awaiting verdict (PR #691)

> **It sat as a DRAFT after the verifier PASS, so its only receipt was the
> FEL-437 draft rendering** — `check` SKIPPED, `ci-ok` green off a build that
> never ran. A verifier PASS does not produce a CI receipt; readying does.
> Readied 2026-07-29 (`gh pr ready 691`, exit 0) at head `a52ac18a`, which is
> **0 behind `origin/main`** and differs from the verified `464a3e31` only by
> `docs/state/builder.md`. Real run `30414971204`. Do not re-derive whether the
> draft green meant anything: it did not.

### The receipt — BOTH heads carry one; orchestrator ruled it MERGES

```
head        run          check                        ci-ok                   ordering
a52ac18a    30414971204  success 01:45:38->01:51:19   success 01:53:34->:36   +2m15s
3ac0140c    30415444646  success 01:56:06->02:01:51   success 02:04:06->:09   +2m15s
```

Both satisfy all three legs of the shared-run-id rule. `examples`,
`governed-examples`, `gate-wiring` success in both. `mergeStateStatus` is
**UNSTABLE, not BLOCKED** — that is the non-required `bench` red, which is the
mergeable state and not a blocker.

**The interactive orchestrator lands it. Not builder.** Two orchestrators on one
merge queue is the twin hazard. Do not land your own PR here.

**The FEL-428 meta-gate I shipped in #680 ran in NO WORKFLOW.**
`grep -rn gate-wiring .github/` → nothing. Its only route was `check:ci`, and
`plan-a.yml` already said in its own words: *"`check:ci` is invoked by no
workflow in this repo."* The gate that exists to forbid green-by-construction
gates was one, and it scored **itself** reachable because its rule counted
check:ci-chain membership — a fact about `package.json`, not about CI.

### The id churned twice; do not re-derive which one is real

I guessed `C-FEL-GATE-WIRING-RUNS` → `claim` exit 2. The row was minted as
`C-FEL-GATE-WIRING-REACHABLE`; I retitled to that. The orchestrator then MOVED
the row back to `C-FEL-GATE-WIRING-RUNS` (REACHABLE = declined) so the PR title
would not have to change again. **Final answer: `C-FEL-GATE-WIRING-RUNS`.**
The reason it mattered: under squash the PR title becomes main's permanent
commit message and the only durable link to the ledger row.

### REACHABILITY and GATING are two properties. Only the first existed.

Reachability: *does some workflow invoke this gate.* Gating: *does its failure
fail the PR.* `ci-ok` is the sole required status, and its own comment says
"being in `needs` is NOT being gated on; only appearing in the loop below is."

`check-gate-wiring.ts` now asserts the second: every `ci-ok` `needs:` entry must
appear in the RESULT LOOP **bound to its own job's `.result`**, unless it is
exempt under BOTH keys — see "The exemption is TWO-KEY" below.

### THE RECEIPT THAT MATTERS — the palette defect, reproduced in REAL CI

Two pushes, identical except for **one line** in ci-ok's result loop. Same
broken gate, same `needs:` entry:

```
run 30401891270  loop entry PRESENT   gate-wiring failure   ci-ok FAILURE
run 30401968909  loop entry REMOVED   gate-wiring failure   ci-ok SUCCESS   <-- the defect
run 30401814745  baseline, unbroken   gate-wiring success   ci-ok success
```

Nobody in this repo had ever proven that direction; it was argued from two past
incidents (palette, #649). It is now measured. And in run 2 the gate NAMED its
own ungating in the CI log — while ci-ok, being ungated, reported green.

**`gate-wiring` ran on a DRAFT PR in all three runs.** That is the whole
own-job justification and it is now evidence, not argument.

### Own-job vs step changed position THREE times. Live tree = OWN-JOB.

Sequence, so nobody re-derives it: I built own-job → architect + orchestrator
countermanded to a step → I complied → **both withdrew** on reading the diff (I
had done all 3 clauses) → I restored own-job and proved it → orchestrator then
ruled "the step stands, keep what is in your tree", written while my pushed head
was still the step version.

**The deciding fact arrived after that ruling and it was theirs, not mine:** the
step's whole stated advantage was "zero edits to ci-ok — the single
highest-blast-radius line in the repo." The fail-closed inversion below, ruled in
by all three roles, edits that exact loop **either way**. So the step no longer
buys what it was chosen for, while own-job demonstrably runs on drafts (four CI
runs) and its three-clause risk is now closed in code. Flagged to the
orchestrator rather than decided by me; reverting is one command if they hold.

### Own-job was countermanded, then the countermand was withdrawn — on measurement

Architect and orchestrator both ruled "step in `check`", because own-job needs
three coordinated edits and this repo shipped 1+2-without-3 twice. I complied and
reverted. Both then withdrew after reading the diff: I had done 3/3. **Do not
re-litigate it, and do not "simplify" it back to a step** — a step in `check`
carries `draft == false` and is invisible on every draft PR.

**My own-job comment carried a FALSE premise and it was caught by the
orchestrator, not by me:** I wrote that the `code` filter does not guarantee
package.json / `.github/workflows`. Measured false — `code` is `**` minus
.team, docs, .claude, state-*.md, READMEs, CHANGELOGs, .changeset, so both ARE
code. Fixed in the file. A false premise in a workflow comment is the exact
failure this contract is about.

### Sabotage receipts, unpiped `$?`, all on head e73a6429

```
GATING (three directions, none previously provable here)
  in needs:, missing from the loop            -> 1
  in the loop, bound to another job's result  -> 1
  runs a gate, absent from needs:             -> 1
REACHABILITY / FIXTURE
  reintroduce the check:grammar-v typo        -> 1  DANGLING
  delete the gate-wiring job's run step       -> 1  it names ITSELF
  green control red                           -> 1
  wire grammar-v2 without decrementing        -> 1
  MOON_GRAPH_ROOT should-flag / not-flag / unset -> 1 / 0 / 0
GREEN
  check-gate-wiring.ts / check:lint / typecheck  -> 0 / 0 / 0
```

### ci-ok FAILED OPEN, and it was on main, not on my branch

The result loop read `if result = failure OR cancelled then fail=1`. **An
allowlist of BAD values over an open-ended domain is fail-open by construction.**
Misspell a var in the loop or in the `env:` block and the pair expands to
`<job>:` with an EMPTY result — neither "failure" nor "cancelled" — so it matched
nothing and PASSED. Drop the whole `env:` block and `ci-ok`, the sole required
status, went green having read **nothing**, with zero error lines.

Two lines, and the second is **not** redundant: the inversion fixes bad VALUES
and is blind to a vacuous LIST. Empty the `for pair in ...` contents and `fail=0`
with zero iterations — same green, same silence. `fail=0` is an ABSENCE REPORT,
indistinguishable from "no job examined" until the input is proven non-empty.

```
CHECK=      current-main    proposed
success     0 err=0         0 err=0
skipped     0 err=0         0 err=0
failure     1 err=1         1 err=1
cancelled   1 err=1         1 err=1
neutral     0 err=0         1 err=1   <- accepted tradeoff, not in the domain
EMPTY       0 err=0         1 err=1   <- the defect
UNSET       0 err=0         1 err=1   <- the defect
env: block dropped   0 err=0  ->  1 err=7
pair list emptied    0 err=0  ->  1 err=1   <- only the count guard closes this
```

`-ne`, not `-lt`: adding an 8th job without updating the count goes RED until
someone reconciles needs: / loop / count.

**The literal is DERIVED, not hand-maintained** — `check-gate-wiring.ts` parses
ci-ok's `[ "$checked" -ne N ]` and asserts N equals the loop's pair count. That
was the orchestrator's objection to the guard ("if it comes back it should be
DERIVED, not a magic number") and it is the right objection: architect's own
diagnosis is that **a guard whose reference value sits in the file it guards is a
CONSISTENCY check, not a CORRECTNESS one** — it catches only the person who
edited one side. The two referents now live in different files.

**Do not delete the guard as redundant with the parse.** The parse makes
`check:gate-wiring` red, i.e. it makes the *gate-wiring job* red — but in the
exact scenario it detects (a job dropped from the result loop) ci-ok no longer
reads that job, so **ci-ok itself stays green**. Production receipt: run
`30401968909`, gate-wiring failure + ci-ok SUCCESS. The parse DETECTS; only the
runtime guard REJECTS. Neither subsumes the other.

**A harness lesson I paid for in this same measurement.** My first truth table
varied `GATE_WIRING_RESULT` and reported main as `fail=0` on *every* value,
including `failure` — which reads as "main never catches anything." False.
`gate-wiring` is not in main's loop at all (it is my addition), so varying it
could not move main. The harness ran perfectly and answered about a variable the
subject never reads. **Vary something present in BOTH sides, or you are
measuring your own diff against nothing.**

### The full sabotage matrix — including the three nobody had a detector for

```
A  untouched                                         -> 0   no false red
D  drop pair from loop, count left at 7              -> 1
F  drop pair AND decrement count (2 self-consistent) -> 1
F+ F AND drop from needs: (3 self-consistent)        -> 1   reported as "defeats
                                                            all three" — measured
                                                            against a head that
                                                            predates the parse
G  count guard deleted entirely                      -> 1
H  count literal drifts, loop unchanged              -> 1
I  loop entry mis-bound to another job's result      -> 1
J  reintroduce the check:grammar-v typo              -> 1
K  delete the gate-wiring run step                   -> 1   names ITSELF
```

### The exemption is TWO-KEY. Do not "simplify" it to a pure derivation.

`changes` sits in ci-ok's `needs:` without a result-loop entry, legitimately —
ci-ok consumes `needs.changes.outputs.code`. Exempting it takes **both**:

```
KEY 1  the job is DECLARED in NEEDS_NOT_GATED      (a human act)
KEY 2  ci-ok really reads needs.<job>.outputs.*    (a machine-verified property)
```

**I deleted key 1 last wake and had to put it back.** My reasoning was that any
allowlist is the fail-open shape this contract fixed in ci-ok's own loop. Wrong,
and measurably so:

```
pure derivation   add a job to needs: + one unused `FOO: ${{ needs.x.outputs.y }}`  -> 0  SILENTLY EXEMPT
two-key           same mutation                                                     -> 1
```

Pure derivation lets an exemption **appear** the moment someone adds an outputs
reference — one key, no declaration. And the hazard I thought I was closing does
not exist against the two-key form: appending a name cannot silence a real gate,
because key 2 still fails. A new legitimate outputs-provider that nobody declared
is FLAGGED — friction that fails **closed**, the right direction for an exemption.

Three roles had independently measured the two-key form as stronger than the
pure derivation *before* I deleted it. I read a critique of architect's proposed
**spec** as a critique of my **shipped code** and "fixed" something that was
already correct. Check whose artifact a critique is aimed at before acting on it.

Both keys now carry their own negative fixture, which neither form had before:

```
KEY 1  outputs consumed but job never declared   -> 1   the pure-form hole
KEY 2  declared but ci-ok never reads outputs    -> 1
OR     a job BOTH gated AND outputs-consumed     -> 0   no false red
M1     in needs:, neither gated nor declared     -> 1
```

**OR, not XOR.** A job may legitimately be both gated *and* export a value ci-ok
reads. The exemption branch is only reached when the job is absent from the loop,
so that arrangement never consults the list. XOR would flag it, and a false red
is pressure to widen the exemption — the hatch re-opening under another name.

### Verifier PASS at `faee81b9`; the corrected void clause re-run at my head

Their first integrity check named only `checked" -ne 7` in plan-a.yml — a strict
SUBSET of what the verdict rested on, while the artifact that was actually
rewritten twice was `check-gate-wiring.ts` (+81/-30 across those heads). They
caught it themselves and widened it. **A one-line integrity check is a collapsed
view of a verdict**, and it converts "re-run this" into "this is still fine".

Corrected clause, run by me at head `464a3e31` (docs-only since `faee81b9`):

```
plan-a.yml          grep -c 'checked" -ne 7'   -> 1   (must be 1)
check-gate-wiring   grep -c NEEDS_NOT_GATED    -> 5   (must be >=2)
check-gate-wiring   grep -c outputsRead        -> 6   (must be >=2)
positive control    wc -l of the extracted file -> 867
check:gate-wiring                              -> EXIT 0
```

### #689 is GUARDED by my fixture, not weakened

With `stripNonCode` sabotaged to identity: the real tree reproduces the original
false edges (`plugin-agent-readiness → signals`, `cli → context`), deleting the
real `- server` edge is still caught, **and** my `should-not-flag` tree goes red —
its alpha carries a comment *and* a backtick template literal quoting an import of
`@fixture/gamma`, which it does not depend on. A fixture exercising only the
false-positive direction is green-by-blindness.

### check:grammar-v2 — baselined, APPROVED, and now its own contract

Wiring it reds CI on **five FALSE positives**, all comments or strings that
DESCRIBE a retired form. Third instance of the #681/#689 class. It is **not** a
`stripNonCode` reuse — that blanks template literals and preserves ordinary
strings, and a grammar gate needs the opposite on both counts; a retired form in
an `.aihu`/`.md` file IS a use. Queued as **C-FEL-GRAMMAR-V2-LITERALS**, not
mine. Baselining was ratified by both architect and orchestrator against the
file's own advice, because it converts silence into debt that prints every run.

## C-FEL-434b — MERGED (PR #683, e7a1b7c2)

agent-readiness now CONSUMES the compiler's agent-meta sidecars, so a
**client-target** build lists its `@agent` components in `llms.txt`. Before this,
`## Components` came only from the live `@aihu/agent` registry, which is empty on
a client build because `registerAgentMetadata` is elided from client JS.

**Two things future instances will otherwise re-derive the hard way:**

1. **`$scope` on the `@agent` block derives `extract.read = { scope }`** — a hard
   tier, so `deriveReadPolicy(...).agentDiscovery` is **false** and the component
   is (correctly) filtered OUT of `llms.txt`. I lost a wake believing the row-1
   fixture was unsatisfiable because of this. The authoring shape that gives a
   publicly-discoverable component with a gated action is an EXPLICIT
   `$extract: { read: 'agents', call: { scope: 'x' } }` — explicit read wins over
   the derivation (`extract.rs` `resolve_explicit_read_wins_over_scope_derivation`),
   and the compiler emits W480 acknowledging the deliberate re-opening.
2. **The manifest→metadata mapping is an ALLOWLIST, on purpose.** The sidecar is
   a build artifact and really does carry `scope` / `rateLimit` / `streamOutput`;
   `llms.txt` is served anonymously. Copy only `tag`/`describes`/`state`/
   `actions`/`extract`. Do **not** convert it to a deny-list — a policy field
   added to the manifest later would then leak by default. `extract` MUST be
   carried forward: it is the input to the fail-closed advertise filter, and
   dropping it silently publishes everything.

Addressing scheme chosen: **per-tag filenames** (`<tag>.agent-manifest.json`),
matching the sibling `<tag>.ts` / `.route.json` / `.aihu.ts` sidecars. The old
fixed name meant the second agent component in a directory clobbered the first.
Rust change → FEL-414 two-family bump done (`0.1.41→0.1.42`, `0.1.6→0.1.7`);
`BASE_REF=main bun scripts/check-compiler-binary-bump.ts` → ok (exit 0).

> **#683 (C-FEL-434b) HAS LANDED** (`e7a1b7c2`); its section lives on `main`.
> Still open and also touching this file: **#685** (C-FEL-CI-RECEIPT) and this
> one, in disjoint sections. Whoever lands later takes **both**; do not pick one.
> Every edit here is additive, so it is a three-way merge and not a conflict.

## C-FEL-EXTERNALS — recovered record (PR #656, MERGED 2026-07-28T01:45:55Z)

> **This section was nearly lost.** It existed only in a `git stash` entry — on a
> stack shared by 132 worktrees, where any agent can pop or drop it — and on no
> branch at all, while its PR had already merged. Recovered from
> `recover/builder-state-fel-externals` @ `776b263f`. **A contract is not done
> until its state record is on a branch** (architect S2): a merged PR whose "what
> the next instance must not redo" is reachable only by a command nobody thinks
> to run is still lost, just more slowly.

Three configs converted from hand-listed `node:` arrays to a single `/^node:/`
pattern: `packages/{cli,app,adapter-vercel}/rolldown.config.ts`. Full `bun run
build` node: `UNRESOLVED_IMPORT` count **4 → 0**; the one remaining warning
(`virtual:aihu-components`, app client entry) is a legitimate vite virtual
module, reported not suppressed. MUST-FAIL run in both directions: a new
`node:crypto` probe produced no warning (drift survives), a genuinely bogus
`definitely-not-a-package` import still warned (the class is not silenced).
Probe reverted.

### The repo-wide audit the contract implies but the surface excluded

`must_pass` says *every* package that imports a `node:` builtin externalizes by
pattern; the granted surface named only six packages. Measured across all 12
rolldown configs (script: compare each config's quoted `node:` literals against
the builtins actually imported by its bundle inputs):

```
PATTERN (/^node:/)  adapter-vercel, app, cli   <- this contract
                    language-server, tsc       <- already were
hand-listed         adapter-cloudflare, compiler, css-engine, magna,
                    mcp, router, server
ACTIVE DRIFT        none — every hand-listed config is currently COMPLETE
```

So the remaining seven are **latent, not broken**. Do not describe them as
drifting; that was the scarier version and it did not survive the measurement.

:point_right: **`packages/server` must NOT be converted.** Its MAIN entry
externalizes *no* `node:` builtin on purpose — the design property is that the
main graph contains none, so a leak fails loudly (`check:runtime-purity`,
`@aihu/app@0.1.8` regression, investigation `4a796a8f`). A blanket `/^node:/`
there would silently externalize the exact leak the file exists to catch. Same
argument the prior instance used to leave `packages/primitives` alone. A
follow-up contract that says "convert the rest" is wrong as stated.

### #656's red `ci-ok` was the FEL-437 draft rendering, not a defect

**#656 MERGED 2026-07-28T01:45:55Z.** The paragraph below is kept as the
reasoning that was correct at the time — a draft's red is not a result.

Run `30298978032`: `check`/`examples`/`governed-examples` **skipped**, `ci-ok`
**failure** with `::error::Draft PR: 'check' was skipped, so nothing was built
or tested… mark the PR ready for review (FEL-437)`. Nothing has been built by
CI on this branch yet. Marking ready is what produces a real result.

## RULED 2026-07-28 — when to push, and how to read an absence

Two rules that cost a full wake to derive and must not be re-derived. They are
here rather than in a contract section because they bind every future wake.

### Push cadence: the boundary is DRAFT vs READY

The tension is real — durability says push the moment you have something;
receipts say a push during a run churns CI. Orchestrator's ruling:

- **While DRAFT:** push as often as you like. `check` is SKIPPED on a draft, so a
  push costs seconds of CI and there is no receipt to disturb.
  Commit-early-commit-often applies in full, and this is most of the work.
- **Once READY:** hold still. Runs are ~6 min and the receipt is live. Batch the
  remaining commits, push once, and let the run reach a verdict before pushing
  again.

Same boundary as ready-then-push: **readying is the moment cheap becomes
expensive and no-receipt becomes receipt.** Before it, free; after it, every push
costs a run. Corollary worth knowing: ready-then-push produces ONE run;
push-then-ready produces two, and the earlier one's green is a lie for the length
of a full build.

A push does **not** kill an in-flight run — measured, a `check` ran straight
through a later push to SUCCESS. Hold after READY for the CI-cost reason, not
because pushing destroys anything.

### Writing your state file IS a push — and only ONE of the two safe windows is real

Orchestrator's rule, 2026-07-29: *"'Holding still' that excludes
`docs/state/<role>.md` is not holding still — the CI trigger does not read your
diff before it decides to run. Write state BEFORE you ready, or AFTER the
receipt is banked and you are done with the PR."*

**The second window does not work, and I proved it by taking it.** I waited —
my poll's exit condition *was* `ci-ok` completed — banked the receipt at
`a52ac18a`, and only then pushed the state commit. It cost a full re-run anyway:
branch protection wants `ci-ok` **at head**, and a docs-only commit moves head
exactly as a code commit does. So:

```
before you ready          safe
after the receipt lands   COSTS A RUN unless you are finished with the PR forever
inside the wait window    costs a run AND breaks your own stated expiry clause
```

For a PR that still has to land, **only "before you ready" avoids the cost.**

**Structural fix, applied here rather than argued:** this file now lives on its
own branch. Six consecutive head moves on #691 were all `docs/state/builder.md`,
and each one fired the verifier's void clause on a PR they had already passed.
The instruction that makes me durable was the instrument that made their verdict
expire. Keep state commits off the code contract's branch and the conflict
disappears — the file is append-only by section, so it is a three-way merge, not
a conflict, no matter how many branches carry it.

Offered to the verifier, not imposed: their void clause could be
**code-restricted** rather than head-restricted — void if
`git diff --name-only <verified-sha> <head> -- scripts/ .github/ packages/ package.json`
is non-empty, instead of if `headRefOid` differs. That is the check they already
ran by hand twice; it would have fired 0 times instead of 6 and still caught
every real code change. Their clause, their call.

### An absence is not evidence until the thing had its chance to appear

**A positive measurement is stable; a negative one is not.** "X passed on sha S"
stays true forever and only its *relevance* expires, when S stops being head.
"X is absent on S" can flip **with the passage of time alone** — nothing
changing, no head moving. So they need different expiry conditions:

| measurement | expires when |
|---|---|
| positive ("X passed on S") | S stops being head |
| negative ("X is absent on S") | the pipeline is known complete — **until then it is not evidence at all** |

I built three separate findings on a premature absence in one wake — a new
taxonomy entry, an escalation about an "orphaned" run, and a self-imposed push
freeze — and all three were falsified by simply waiting. Each was measured
accurately and reported honestly; each was taken inside the routine ~2 min gap
between a build job finishing and its aggregate reporting.

**Why this one is uniquely dangerous: an absence is the one observation that
looks identical whether it is true or premature.** A wrong positive contradicts
something and gets caught. A premature negative contradicts nothing and reads as
a discovery.

So: **publish every measurement with its expiry condition.** "PR #N @ `sha` is
landable — VOID if `gh pr view N --json headRefOid` differs" is detectably wrong
to any reader in one command. "PR #N is landable" is silently wrong the moment
the head moves. Same move this repo keeps landing on: make the failure
detectable rather than promise to be careful.

### Polling check-runs BY SHA after readying reads the DRAFT run — I hit it here

`gh api .../commits/<sha>/check-runs` returns **every run that ever touched that
sha, unioned**, with no marker of which run is current. A draft PR already
produced a `ci-ok` at that sha (green off a SKIPPED `check` — the FEL-437 draft
rendering). So the obvious wait loop

```
until ci-ok is completed; do sleep; done      # WRONG
```

**returned on the first iteration, 5 seconds after `gh pr ready`**, quoting the
three-hour-old draft `ci-ok=success`, while the real run's `check` had not even
started. Right answer at the top of the output, wrong run underneath it.

This is the *positive* twin of the premature-absence trap above, and it is worse
in one specific way: the stale positive is **already complete**, so no amount of
waiting fixes it. Waiting is the remedy for a premature negative; here waiting
changes nothing, because the loop's exit condition was satisfied by a fact that
will never stop being true.

**Bind every poll to the run id, not the sha.** Capture the id first
(`select(.details_url|contains("/runs/<id>/"))`), then poll within it. Same
disease as the shared-run-id rule at the bottom of this file — `check` and
`ci-ok` must come from ONE run — except that rule catches it at read time and
this one catches it at wait time. The tell that a readied run is the live one:
`changes` flips `skipped` → `success`.

### `bench` is noise-dominated — MEASURED now, not asserted. Cells FLIP on identical code.

`plan-a.yml:710-712` claims the lane is red-by-construction from "timing noise
unrelated to the diff under review." That was an argument in a comment. The
accidental re-run of #691 measured it, by the cheapest possible experiment —
**the same code twice**, nine minutes apart, trees differing by
`docs/state/builder.md` alone:

```
cell                  30414971204 (a52ac18a)   30415444646 (3ac0140c)
cellx                 OK    5.3 %              OK    9.0 %
wide-fanout-100       FAIL 14.5 %              FAIL 19.1 %
batched-writes-100    OK    6.9 %              FAIL 11.4 %   <- FLIPPED
deep-propagation-100  FAIL 29.6 %              OK    7.5 %   <- FLIPPED
creation-1to1000      FAIL 21.0 %              FAIL 12.4 %
```

Same `prev=2026-05-25`, every `prev` value byte-identical (807 / 5363 / 5074 /
3250 / 69020), so it is one frozen baseline. `deep-propagation-100` swings 22
points on code that did not change.

**Method caveat this puts on architect R3 / the verifier's attribution rule.**
"Compare against the most recent run of the SAME MODE on a tree WITHOUT the
diff" is sound for a **deterministic** lane. On a noise-dominated one a single
baseline is not enough: attributing by one baseline here would have charged
`batched-writes-100` to a docs-only commit — a clean, well-formed, entirely
false attribution. The question is not "same mode?" but **"is this lane's
cell-level verdict REPRODUCIBLE?"**, and the test is one re-run of the same
tree. If cells flip, per-cell attribution is unavailable at *any* number of
baselines and only the aggregate ("this lane is noise") is citable.

Do **not** file a contract for the flip: the lane is already advisory. `bench`
carries `continue-on-error: true` (`plan-a.yml:719`, reasoned at :708-718), so
`gh api .../runs/<id>` reports **conclusion=success while the bench JOB is
failure**. That is deliberate, not a green-by-aggregation hole — check :719
before reporting it as one.

## FEL-426 — DONE (founder-ruled: "not use an unsafe component… check by CI")

Both halves landed together. Half A alone re-breaks the moment someone edits the
file, which is why the ruling bound them.

> **The first shipped approach was REJECTED and superseded.** I sanitised and
> re-fed `html={}`. The orchestrator's HOLD arrived after I pushed. Rebuilt to
> the ruling: parse to structured data, render escaped, drop `html={}` entirely.
> Lesson for me: I announced an approach, got no reply in two minutes, and
> treated silence as assent — on a transport I had *personally just proven*
> delivers dispatches invisibly. Standing rule now: say "blocking on a ruling"
> and stop.

### Half A — the XSS

`html={}` is unsafe *by design* and stays a legitimate primitive; the defect was
what it pointed at. Since **#572**, `ssr_string_emit.rs:669` interpolates its
value **unescaped into served bytes** (`String((expr) ?? '')`) — before #572 it
was SSR-transparent, so the blast radius was client DOM only. Correct for
docs-next's authored markdown; stored XSS for `examples/hacker-news`, which
points it at the HN Firebase API at three sites.

The tell is inside one element: `comment().by` → `__aihu_stext(...)` (escaped),
`comment().text` → `String(...)` (raw), three lines apart.

**Fix (final):** `src/lib/parse-hn-markup.ts` parses at the loader ingress into
structured blocks/spans; `src/components/hn-rich-text.aihu` renders them through
ordinary escaped bindings. **All three `html={}` bindings are gone.** `safeHref`
is *reused* from `@aihu/editor/safe-href`, not reimplemented.

The safety property no longer depends on the parser being correct — output is
plain strings through `__aihu_stext`, so a parser bug is a *display* bug and
cannot be injection. A sanitiser structurally cannot promise that. Doctrine came
from `packages/editor/src/paste-sanitize.ts`: *"never re-serializes to HTML."*

**Compiler untouched.** It did exactly what `html={}` means.

### Half C — the coverage floor was satisfied BY the vulnerability

`MUST_BE_LIVE` guaranteed `html` was live-exercised. The only thing making that
true was the XSS hole. **The guarantee and the defect were one line of code**, and
the guarantee is why nobody looked. Distinct from FEL-428 (a gate measuring
nothing): this gate measured exactly what it claimed — presence of a usage,
never safety of one.

Ruled by Shane and the orchestrator independently, same answer: keep the floor,
move the exerciser. `examples/ssg-site/src/pages/about.aihu` now renders an
authored in-repo constant through `html={}`, backed by a **prerender needle** so
the row is proven in built bytes. Rows unchanged at 54 — relocated, not reduced.

### Half B — the CI gate (the brief's prescribed fix was wrong)

The brief said both loops enumerate by hand-typed literal and to derive from
disk. Half true, and applying it literally would have turned CI red:

1. `scripts/build-governed-examples.ts:64` **already** derives from disk
   (`readdirSync` + `coverage.manifest.json`). hacker-news is *in* that set,
   declares `ci: "compile+smoke"`, and declares it exercises `html`. It had no
   smoke suite, so the runner printed `compile-only (no smoke suite…)` and ran
   nothing. **It is the only governed example declaring `html`, and the only
   `compile+smoke` one with no suite.**
2. The `ran === 0` anti-vacuous guard is real and fires — but it is *global*, so
   eight passing neighbours mask one item's no-op.
3. Globbing `examples/*` into the `examples` job's `vite build` loop would fail:
   hacker-news's manifest says it is *not vite-buildable* (server/SSR wiring).
   The fix for that would be a skip-list — the literal list again.

**So Half B was not "derive the list" but "make a declared tier that silently
degrades to nothing be RED".** `plan-a.yml` needed **zero changes**:
`packages/compiler/**` is already in the `governed` paths filter, so #572 *did*
trigger this lane. It ran, reassured, and passed.

Also fixed: derive-from-disk **cannot detect deletion** (verified — removing the
example made its row vanish and the lane still passed). `examples/governed-roster.json`
is the committed floor. Adding an example still needs nothing there; removing one
requires an explicit, reviewable line deletion.

## Receipts — every direction proven, real exit codes

`PIPESTATUS` is a bash-ism; this shell is zsh, so piped `EXIT=` readings were
silently empty. These are unpiped `$?`.

```
MUST-FAIL-FIRST  payload live in served bytes, pre-fix        -> exit 1
  <div class="text" …>Interesting point. <img src=x onerror="…"></div>

Half A / B (examples/hacker-news, scripts/)
  delete example (roster tripwire)                            -> 1
  compile+smoke tier with no smoke suite                      -> 1
  break the SFC (smoke suite fails)                           -> 1
  reintroduce html={} in hn-rich-text     -> 2 red (A8 gate + served bytes)
  remove decode-before-validate                               -> 1 red
  remove loader trust boundary                                -> 1 red

Half C (examples/ssg-site)
  remove the html={} binding -> coverage-manifest             -> 1
  remove the html={} binding -> governed lane prerender needle-> 1

GREEN
  hacker-news smoke suite                                     -> 0, 28/28
  governed lane hacker-news                                   -> 0
  governed lane ssg-site (prerender 4 needles asserted)       -> 0
  check:coverage-manifest (9 examples, 54 rows, floor 48)     -> 0
  biome                                                       -> 0
```

Compiler was built **from this tree** (`cargo build --release --bin aihu-compile`),
not the published napi addon.

### Three assertion traps hit while writing this — all found by sabotage, not by reading green
- `not.toContain('onerror=')` **fails on correct output** — the literal text
  survives inside inert `&lt;img … onerror=&quot;`. Assert the property
  (`/<[a-zA-Z][^>]*\son[a-z]+\s*=/`), not the substring, or the next reader
  weakens the parser to satisfy a wrong test.
- Unit tests AND the served-bytes test both stayed green with the loader call
  deleted. Present is not wired. `loader trust boundary` tests close it.
- **"Encoded scheme cannot smuggle" passed BEFORE and AFTER the fix.** `safeHref`
  is an allowlist, so `&#106;avascript:` is rejected for matching nothing —
  decoded or not. I had written *denylist* reasoning into the comment. Relabelled
  honestly; replaced with `&#47;item?id=1 -> /item?id=1`, which is red without
  the decode. A required test case that proved nothing.

## No changeset — deliberate, with receipt

No published package changed (only `examples/` + `scripts/`), and
`@aihu/example-hacker-news` is explicitly in `.changeset/config.json`'s `ignore`
list. Stating it rather than silently skipping.

## What the next instance must not redo

- Do **not** "fix" `plan-a.yml`'s hand-typed lists as part of FEL-426. It is a
  real coverage gap (5 of 25 examples built, 7 tested) but a **separate** issue,
  and the naive fix reddens CI. Flagged, not claimed.
- Do **not** re-derive the alias map in `examples/hacker-news/vitest.config.ts`.
  It imports root's 34 aliases on purpose; hand-copying the subset needed today
  is how it rots.
- The vitest config is deliberately **not** an extension of the example's
  `vite.config.ts` — inheriting it drags in `@aihu/router`'s built plugin, so a
  missing `dist/` would make the security gate a build-ordering casualty.
- Local `bun run test` at repo root has ~20 pre-existing failures from a missing
  `aihu-css-core` binary (`cargo build --release -p aihu-css-core`). Four
  governed examples also fail locally on unbuilt `dist/`. **Not mine** — verified
  by running them on a clean tree.
- Do **not** chase the 5 red files in a full-parallel `bunx vitest run`
  (`arbor/tests/bench.test.ts`, `compiler/tests/state-model-sidecar-tsc.test.ts`).
  They are timing/contention casualties — each spawns `tsc` or asserts a
  wall-clock budget — and **all pass when the files are run in isolation**. Run
  `cargo build --release` (ALL bins, not `--bin aihu-compile`) first, or
  `css-engine/tests/resolve-binary.test.ts` reds on a missing
  `target/release/aihu-css-compile` too.
- Do **not** re-litigate the FEL-434b addressing scheme or re-read
  `extract-read-policy.ts` to answer "why is my scoped component filtered out" —
  both answers are recorded above.
- Do **not** re-derive whether `check:grammar-v2`'s five hits are real. They are
  **not** — all five are comments/strings, listed with line numbers in
  `scripts/gate-wiring-baseline.json`. And do **not** "fix" it by importing
  `stripNonCode` from `check-moon-graph.ts`: its two rules are backwards for a
  grammar gate, reasons recorded in that same file.
- Do **not** trust a piped `git push`'s exit code, or a background-task
  notification that reports one. `git ls-remote` is the only proof.
- Do **not** poll `commits/<sha>/check-runs` for a conclusion. It unions every
  run that ever touched the sha, so a draft run's completed `ci-ok` satisfies
  your wait loop instantly and forever. **Bind the poll to the run id.**
- Do **not** commit `docs/state/builder.md` onto a code contract's branch while
  that PR is waiting on a receipt. It moves the head and voids the receipt —
  banking the receipt first does **not** save you. Use a state-only branch.
- Do **not** attribute a `bench` cell to your diff, ever, and do not re-derive
  whether the lane is noisy. It is, measured — two cells flip verdict across
  identical code (table above). Only the aggregate is citable.
- **`git show "$SHA:path"` in zsh SILENTLY EATS CHARACTERS.** `$H:s...` parses
  `:s` as a history-substitution modifier, so `$H:scripts/check-gate-wiring.ts`
  became `<sha>k-gate-wiring.ts` → `fatal: ambiguous argument`, exit 128, and a
  `grep -c` over the empty result printed **0**. Read naively that says the
  symbol is gone. Use `"${H}:path"` — braces stop the modifier. Three roles hit
  this in one day. Always pair the read with a positive control (`wc -l` the
  extracted file); a non-zero `git show` exit is could-not-check, never absent.
- **Never `git reset --soft origin/main` to squash your own commits.** If your
  branch is BEHIND, that stages the INVERSE of everything merged since — for me,
  40 files of other people's work staged for deletion, looking exactly like my
  own change set. The command succeeds and the output is well-formed. Reset
  against the **literal fork-point sha**; `origin/main` is a moving coordinate.
- Do **not** re-litigate own-job vs step for `gate-wiring` from first
  principles — the position changed three times and every change was the
  orchestrator's or architect's, never mine. The live tree is **own-job**, and
  the deciding fact is recorded below. Do not add a fourth id for this work.
- Do **not** "simplify" ci-ok's loop back to `if failure or cancelled`. That is
  the fail-open form, measured. And do not delete the `checked -ne 7` guard as
  redundant — the inversion does not cover a truncated pair list.

## Queue behind this

1. **C-FEL-GRAMMAR-V2-LITERALS** — the five false positives, filed by the
   orchestrator as its own contract, NOT mine. Needs per-file-type judgement
   (`.aihu`/`.md` hit = a real use; `.ts` comment or string = not), NOT a
   `stripNonCode` reuse. Wiring it into `plan-a.yml` is one line once the scanner
   is right, and doing so **forces** deleting `check:grammar-v2` from
   `scripts/gate-wiring-baseline.json` in the same PR — the gate goes red
   otherwise (proven, receipt in #691).
2. **C-FEL-CIOK-GATING-INVARIANT** — queued by the orchestrator, **but check
   whether it still has content before dispatching anyone.** Its spec was "parse
   ci-ok, assert every `needs:` job is read in the result loop, with the
   exemption derived rather than listed, and each pair's env var BOUND." All
   three clauses shipped in #691 and are proven by the matrix above. What may
   remain is the third referent: a *coherent* un-gating (drop from loop +
   decrement count + drop from `needs:`) is invisible to the guard, the parse and
   the reachability half, because the job is still defined and still runs. The
   only referent that survives it lives outside every file in the repo — the CI
   run's own job conclusions, where a coherently un-gated job is RED while ci-ok
   is GREEN. Scope it to the 22 gates this script already DERIVES; a hand-typed
   list of advisory jobs (bench/chromatic are red-tolerant) rebuilds the hatch.
3. **C-FEL-GATE-FIXTURE-RAMP** — shrink `notYetProven` in batches. Now cheaper
   than it was: `NEGATIVE_FIXTURES` takes an optional `green` control, and
   `MOON_GRAPH_ROOT` is the worked example of giving a gate a fixture-scan mode
   without changing what it asserts.
4. **C-FEL-CIOK-CANCELLED-MSG** — fold into the next PR that touches
   `plan-a.yml`'s `ci-ok` block; do not open a PR just for it. #691 touches that
   block but is already carrying a disclosure of its own; do not stack it there.

Older queue (`.tastemaker/check_contrast.py`, FEL-423) predates 07-28; confirm
with the orchestrator before picking either up. `#609` and FEL-391 went to
**builder-b**.

## The gate rule that governs every "is it green" claim

Banked by historian as a lesson on **#669** (`3f709e05`) — not yet merged, so it
is deliberately named here rather than path-cited (`check-lesson-refs.sh` gates
that, correctly). A green aggregate `ci-ok` can certify a build that never ran.
One command: `gh api repos/fellwork/aihu/commits/<full-sha>/check-runs` —
`check` and `ci-ok` must share a run id, `check` must be `success`, and `ci-ok`
must have STARTED AFTER `check` FINISHED. Push, then mark ready. A rerun
destroys its own check-runs, so capture the output before re-running.
