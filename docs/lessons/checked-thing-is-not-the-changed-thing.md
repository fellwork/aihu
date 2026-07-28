# THE THING BEING CHECKED IS NOT THE THING THAT CHANGED

**Topic:** cross-cutting (bench, CI gates, compiler toolchain, design tokens, git)
**Session:** named 2026-07-26 12:42 EDT, after the third instance in one day
**Category:** ci-lint, measurement-integrity, toolchain
**Severity:** critical — a gate with this defect is **worse than no gate**, because
it converts "unverified" into "verified" without touching the code
**Status:** named, registered, partially fixed

## The shape

> A check runs. It passes or fails honestly. But the artifact it inspected is not
> the artifact you modified — it is a published copy, a cached copy, a source tree,
> a hand-maintained duplicate, or a different machine's output.
>
> **A red result says nothing about your branch. A green one says nothing either.**

This is the sibling of `absent-value-rendered-as-real.md`. That one is about a
value appearing from nothing; this one is about a **real, honest measurement of the
wrong object**. It is harder to catch, because everything in the pipeline is
working correctly.

The naming moment, verbatim:

> *"That is the same family as everything else today: the bench harness measuring
> `src` instead of `dist`, my scaffold e2e installing published packages, and now a
> gate verifying npm rather than the branch. Third instance, three different
> subsystems, same shape — **the thing being checked is not the thing that
> changed.**"*

And the reply that adopted it:

> *"The npm-mode finding is the sharpest thing in your message and I had not seen
> it. On PRs it runs `--mode npm`, scaffolding with `bunx @aihu/cli@latest` — so it
> never executed a line of your diff. I will add that to the registry as its own
> named failure mode, because three subsystems in one day is a pattern, not a
> coincidence."*

## Instances

| # | You changed | It checked | Receipt |
|---|---|---|---|
| 1 | `packages/arbor/dist` — the shipped artifact | **`packages/arbor/src`** | `packages/arbor/tsconfig.json:8` — `"paths": { "@aihu/signals": ["../signals/src/index.ts"] }` rehijacks arbor-dist's own signals import back to `src`, producing **two module instances**. *"The harness cannot measure `dist` at all."* Re-confirmed 2026-07-26. The team reproduced the resulting dead-binding fabrication **twice** (16 ns, INERT) and only a liveness probe caught it. Resolved in #607 (`6e0fbc8e`) |
| 2 | The CLI in your PR | **`bunx @aihu/cli@latest` from npm** | The scaffold e2e installed published packages. *"It never executed a line of my diff."* |
| 3 | `packages/cli` in PR #609 | **npm's published CLI** | `scaffold-matrix.yml` ran `--mode npm` on PRs. It also had **zero green runs, ever** — including on the branch that introduced it: `3 failure test/scaffold-dx-matrix ← its own branch`, `3 action_required changeset-release/main ← never ran`, `2 failure feat/config-in-vite-config`. **It went in red and stayed red.** Fixed in #613 (`8aa12dc1`) — PR runs now use `--mode local` |
| 4 | Rust source in `packages/compiler` | **The published napi addon** | `aihu` compiles via the published addon unless `AIHU_COMPILE_BIN` is set — **a Rust fix is invisible to its own CI.** Described in-session as *"the known `AIHU_COMPILE_BIN` trap in a new costume."* Cost hours twice in one session |
| 5 | Nothing — **and that is the finding** | `.tastemaker/check_contrast.py` audits `.tastemaker/style-lock.md`, **faithfully**, while `packages/css-engine/src/packs.ts` is what ships | **My first diagnosis of this was wrong and is corrected here.** I recorded it as *"the hardcoded mirror has drifted"*. It has not: measured against its **own declared source**, the mirror is **27/30 faithful** — all 7 core brand rows match `style-lock.md:19-25` exactly, and the `pack-*` rows carry a comment saying they deliberately model where `packs.ts` differs. **The tool does exactly what its docstring says.** The real defect is bigger: **the brand contract and the shipped pack disagree on 8 values, both artifacts are internally consistent, and NO gate compares them.** The tool audits the contract; *nothing audits the thing that ships.* Only 3 values are a genuine transcription bug (`info-fg`/`success-fg`/`warning-fg` dark). The headline number survives unchanged — `[light] accent/border` really is `3.12` shipped against a `3.00` floor while the tool prints `3.62`, **five times the real headroom** — but *the number was right and the diagnosis was not.* **Still open** |
| 6 | Production's agent-metadata registry | **A registry the test populated itself** | The test calls `registerAgentMetadata()` in the test process, then the handler **in the same process** — proving the generator renders a *populated* registry, *"which is precisely the precondition production does not satisfy. It passes in production for the wrong reason."* |
| 7 | Both sides of a size comparison | **Two artifacts both written by the step that broke them** | `sync-readme --check` exited 0 while all 108 cache rows read `"bytes": -1` and 48 README cells read `_no dist_`. *"`--check` compares two things that were both written by the thing that broke them."* / *"It is a tautology wearing a check's clothes."* Fixed in #591 (`24c08c33`) |
| 8 | A local M5 | **A checked-in baseline measured on CI ubuntu** | The 26x and 8.8x figures were *"arithmetically correct and neither was a measurement"* — same fabricated denominator, numerators from **different machines** (751 ns CI ubuntu vs 241 ns local M5). The disagreement **is** the hardware gap: 3.11x. **Standing ruling: cross-machine ratios against a checked-in baseline are meaningless.** |
| 9 | A compiler transform | **The compiler's page default** | `fable`'s new test **passed both before and after** the change. It proved nothing about the regression — and `fable` said so explicitly rather than counting it as a gate |
| 10 | `main` | **Another agent's branch, in a shared checkout** | A peer grepped `/Users/smcguirt/conductor/repos/aihu`, found three hits including a live call site, and *"was about to tell you that you were mistaken."* The checkout was on `feat/scaffold-aihu-config`. On `main` there is **exactly one hit**, the definition at `index.ts:292`. *"Recording it because the lesson clearly does not stay learned by being stated once."* |
| 11 | A PR's merge commit | **Any commit whose body mentions that PR number** | `git log origin/main --grep="(#591)" -1` returns `3a7af464` — the merge commit for **#592**, whose body cites #591. `--grep` is a regex over the whole message and `-1` takes the *newest* match; `-F` does not help. Found by the historian on 2026-07-26 **while verifying this very session** |
| 12 | `.github/workflows/scaffold-matrix.yml` **at `origin/main`** | **The same file in a worktree one commit behind** | The historian, *while writing this document*, ran `grep -n mode .github/workflows/scaffold-matrix.yml` to confirm #613's fix and read `--mode "${{ inputs.mode \|\| 'npm' }}"` — the **pre-fix** line — because the worktree sat at `d0c9200c`, one commit before #613's `8aa12dc1`. Was seconds from recording "#613 did not actually fix PR mode" as a finding. `git show origin/main:<path>` shows the fix is real: `--mode "${{ inputs.mode \|\| (github.event_name == 'pull_request' && 'local' \|\| 'npm') }}"`. **Instance #12 was produced by the person documenting instances #1–#11, inside the document.** |
| 13 | The platform set that **ships** | The platform set the guard **names** (`#560` → FEL-414) | `scripts/check-compiler-binary-bump.ts:54` — `changedFiles.some(isPlatformManifest)`. Matrix: `rust + BOTH bumped → PASS`; **`rust + npm/ ONLY → PASS`** (napi addon left stale); `rust + npm-native/ ONLY → PASS`; `rust + no bump → FAIL`. Its author: *"I widened what **counts** as a bump when the requirement is **bump the set that ships**."* Two slogans came out of it, both worth keeping: ***"bump the set the guard names is not the same as bump the set that ships"*** and ***"'changed' is not 'advanced'"*** (the requirement is *strictly greater than the published version*). A second, independent hole: `packages/compiler/src-native/**` was **ungated entirely** — it does not match the `packages/compiler/src/` prefix, so addon-only changes hit no guard at all. Fixed in #584 (`2a8ec837`) |
| 14 | The published `dist` bundle | **`src`, via a workspace alias** — so CI structurally could not see the bug | #565 (`51451a47`): runtime's dist had **inlined a private copy of `@aihu/context`'s module state**, so `provide()` wrote to one set of slots while userland `inject()` read another. **Hierarchical DI silently no-oped for every dist consumer.** *"workspace tests alias src, so CI could never see it."* The 30 B size saving was incidental. **No regression test for the dist path was ever proposed — still open** |
| 15 | An example carrying three new unescaped-HTML bindings | **An examples set that does not include it** | `hacker-news` appears in neither the build nor test list in `.github/workflows/plan-a.yml`. Re-confirmed 2026-07-26. See the 🔴 entry in `docs/state/orchestrator.md` — still live |
| 16 | A competent vanilla implementation | **A strawman adapter that reassigns `element.textContent`** | *"against a competent vanilla that caches the text node the ratio is ~1×."* The published ratio measured the strawman, not the framework |
| 17 | The claim in the **generated** table | The claim in the **hand-written** prose (and vice versa) | *"deleting all four prose mentions accomplishes nothing durable: **the next commit regenerates the table and the false claim returns as a number instead of a sentence.**"* — *the claim has a generated copy and a hand-written copy, and fixing one is invisible in the other.* The prose under it read *"This is not a measurement artifact."* It was one |
| 18 | The code | **A machine with ~8.5 of 10 cores stolen** | 13 orphaned `bun server.ts` processes from a Telegram MCP plugin, combined **857% CPU**, load average **27.6**, oldest **7 days 22 hours**, ignoring SIGTERM. *"every benchmark run on this machine over the last several days was measured on a box with ~8.5 cores of stolen CPU."* ***An unbounded environment is an unmeasured variable*** — neither the harness nor CI records load, so a run at load 27 and a run at load 0.5 are indistinguishable in the output |
| 19 | The tree the test was **committed** to | The tree the test was **run** on | *"My 1994 was real — it measured a **pre-fix** worktree (`28b1cfaa`). I then created the branch from a newer `main` and committed the test **without re-running it there**. Two different trees, one conclusion carried between them."* Caught by a peer re-running it: the real post-fix number is **4** |
| 20 | What the CI filter **does** | What its comment **says it does** — and what *both* agents' reading of the YAML said | `plan-a.yml`'s `changes.code` is documented to exclude `docs/**` and `**/*.md`; two comments (`:302-304`, `:229-237`) describe a doc-only skip. **It never happens.** `dorny/paths-filter` defaults to `predicate-quantifier: some` and the leading `'**'` matches every file, so every negation below is dead. **See the box below — this one took three instruments to settle.** Live fuse: #615's gate protects `skills/**/*.md`, so whoever *fixes* the filter disarms that gate without touching it. Filed **FEL-433** |
| 21 | Whether a diff is **substantive** | `git diff -w`, which ignores whitespace *within* lines but **not added line breaks** | The orchestrator nearly told builder-b it was wrong about an inert diff: `-w` still showed 6 insertions / 2 deletions, which reads as real change. It was biome splitting a multi-arg call across lines. *"Your read was right; my check was the misleading one"* |
| 22 | The tool under test | **The `bun` shim failing to download itself** through a blocked proxy | The verifier's first network-fault run showed `exit=1` and nearly recorded PASS. The stderr said `ghcr.io/moonrepo/bun_tool`, not `swarm:` — **the script never ran.** Caught mid-task, on a task about exactly this |
| 23 | The **class** of payload | The one payload you found | Builder's `not.toContain('onerror=')` **fails on correct output** — the literal text survives inside an inert `&lt;img … onerror=&amp;quot;`. And an "encoded scheme cannot smuggle" test passed **before and after** the fix, because `safeHref` is an allowlist and `&#106;avascript:` matches nothing either way. **Assert the property, not the substring**, and watch each case fail |
| 24 | The **working tree** | Reported as the **committed** state — twice, on the same file, in the same hour | The historian corrected two false comments in `plan-a.yml`, then ran `git commit --amend -F -` **without `git add`** — so the amend rewrote the *message* and left the file unstaged. Every later commit was `git add -A docs`, scoped to `docs/`, so it was never picked up. Then the *verification* failed the same way: `grep -rn "is skipped on doc-only" .github docs scripts` read the **worktree**, showed only the refuted framing, and was reported as "no residual false claim survives." **The remote — the artifact a reviewer would read — still carried the false claim for ~50 minutes, underneath a long commit message explaining why it was false.** Caught only because an unrelated pre-push hook made `plan-a.yml` show as dirty when it should have been clean. Correct check: `git show HEAD:<path>` and `git show origin/<branch>:<path>`, never `grep` over the worktree |

| 28 | The PR's own 5-file diff | **25 files, including two other agents' merged work** | Builder-b listing #622's blast radius: a **two-dot** diff against a **stale local `origin/main`** returned `examples/hacker-news/**` and `docs/state/builder.md` — other people's landed changes, read as theirs. `git fetch` + **three-dot** `...` gives the real answer: **5 files.** They would have reported a 25-file blast radius across two surfaces they do not own. *"The thing I compared against was not the thing I thought it was."* Two independent causes in one command: a stale ref **and** the wrong dot count |
| 29 | This PR's `matrix` result | **A remembered result from a different PR** | Builder-b nearly reported *"matrix is environmental"* by carrying forward the #609 analysis — while their diff **deletes `packages/cli/src/templates/`**, making *"scaffold still works"* the one claim they were least entitled to assume. Re-ran the grid instead: **all four CLI templates scaffold `ok` on every package manager**, and the only product-red cell is `cf-team × bun typecheck` = FEL-431, which is *supposed* to be red. **A conclusion is scoped to the premises it was drawn under; changing the diff changes the premises** |
| 30 | Whether the `git checkout` **succeeded** | **Whether the script kept running** | 2026-07-27 (retro incident 1): an ad-hoc `checkout; rebase; push --force` chain ran `git checkout <branch>`, which **failed with exit 128** because the branch was checked out in **another worktree** (git refuses that) — and the chain **continued anyway**, rebasing and force-pushing an **unrelated** branch over a builder's PR. Repaired from the `almaty` worktree; **no work lost**. The exit code carried the whole truth and nothing read it. The correct pattern was one file over the whole time: `~/.agent-swarm/transport/wire-workspace.sh:21` (`set -uo pipefail`) with `\|\| die` on every step. See "The recurrence" below |
| 31 | The branch the agent **last saw** in its checkout | **The branch the shared worktree was on THIS wake** | 2026-07-27 (retro incident 8): the historian force-pushed a lessons commit onto an **already-merged** branch because the shared worktree had changed identity between turns and sat on a different branch than the previous turn left it. Disclosed unprompted and verified harmless — `#639` had merged at `e71f80c0` first, and the orphaned tip `e89e3c83` is **not** an ancestor of `origin/main`. The mitigation — `git branch --show-current` before every commit — is **prose that depends on remembering** (the weakest rung); the durable fix is the **supervisor pinning each role's checkout per wake** (orchestrator-owned). Third shared-checkout instance, with #10 and #28 — the social-convention mitigation failed again, this time with a force-push |

## Instance 20 in full: two agents, one file, opposite conclusions, and the tie-break

Worth writing out, because it is the cleanest demonstration in this repo of why
reading a config is not measuring a system — and neither agent was careless.

**Both read `plan-a.yml`. Both were confident. They concluded opposite things:**

| | read | concluded |
|---|---|---|
| verifier (#615) | the same `code` filter | *"the sample gate runs **only because** this filter is broken"* |
| historian (#620) | the same `code` filter | *"`check` is skipped on doc-only PRs, so a docs gate there would never run"* |

Two instruments, both static readings of the same YAML, **and they disagreed**.
Neither reading settles it. The tie-break was a third instrument of a different
*kind* — **real CI history**:

```
#617   docs/TOPOLOGY.md                  ->  check: success
#607   docs/... arbor perf truth         ->  check: success
#598   docs/plans/... agent-readiness    ->  check: success
```

Three PRs, each exactly one `docs/`-`.md` file. `check` **ran on all three**. On
#617 the jobs that *did* skip were `bench`, `bench-arbor`, `bench-lsp`,
`chromatic`, `governed-examples`, `storybook` — because those filters are
**positive-only patterns, which work**. Only `code` is broken, and only because
it mixes `**` with negations under `some()`.

Corroborated by executing the matcher directly — picomatch 4.0.5 under dorny's
`{dot:true}`, patterns verbatim: `code` is `true` for `README.md`.

**The verifier's conclusion was right and the historian's was wrong**, and the
historian had already written the wrong one into a PR body, a commit message and
two workflow comments — inside a PR about this pattern. Corrected before merge.

Three things generalise:

1. **The two findings are ONE issue**, reached from opposite directions. One
   agent saw a gate that only works *because* of the bug; the other saw a gate
   that would only break *if* the bug were fixed. Same root cause, and neither
   agent could see the whole shape alone.
2. **Static reading is not an instrument.** *"Neither of us should have trusted
   the file."* Where a config's behaviour is load-bearing, run it or read what it
   actually did — CI history is free and it is evidence.
3. **The correct artifact survived the wrong reason.** The standalone
   `lesson-refs` job is right *because the hazard is latent* — the skip is
   intended, documented, and merely not functioning — not because the skip
   happens. Good decision, bad rationale; the rationale is the part that would
   have misled the next reader.

## The inverse failure: a gate that is RED by construction

FEL-428 names gates that are **green by construction**. `bench` / `bench-arbor`
are the mirror image and are just as unreadable:

- The gate compares against `git show origin/main:bench/signals/RESULTS.md`
  (`plan-a.yml:379`) — a **checked-in** baseline last regenerated **2026-05-25**.
- `bench` is path-filtered, so it is skipped on virtually every `main` commit,
  so **the baseline never advances**. Any PR that does trip the filter is charged
  with two months of everyone else's drift.
- `bench-arbor`'s own job name is *"Regression gate (timing — RED is the designed
  state until R1)"*, and its output labels `attr-thrash-100x100` at **43074.3%**
  as `NVRG never-gate (CI-environmental noise)`. The harness already knows.

An app/cli-only PR touching no `signals`, `arbor` or `runtime` source gets told
`cellx` and `creation-1to1000` regressed.

**Same end state as green-by-construction — nobody can read the gate — and the
failure mode is worse: a permanently-red gate trains everyone to wave red past,
which is exactly what lets a real regression through.**

### Red-by-construction answers "does it block me?" — not "do the numbers mean something?" (2026-07-27)

The refinement that keeps the section honest, because the *correct* triage of the first
question quietly closes the second. On #667, `bench` actually **RAN** — it is normally
skipped, but the `bench:` filter includes `.github/workflows/plan-a.yml`, so a workflow
diff **trips the filter, not the numbers.** It does not block (bench is outside `ci-ok`,
#667 is a workflow-only diff). But it reported **cellx 807→910 ns (+12.7%)** and
**wide-fanout-100 5363→6351 ns (+18.4%)** against the frozen 2026-05-25 baseline
(`plan-a.yml:549` diffs against `git show origin/main:bench/signals/RESULTS.md`; gate at
`:570`). That is either two months of real `@aihu/signals` drift or the high-variance
flakiness C-FEL-409 targets, and **one sample cannot tell.** Recorded as
**could-not-check** — not dismissed.

> **"Red-by-construction" answers whether a lane BLOCKS your PR. It does not answer
> whether the numbers MEAN something.** Do not let a correct triage of the first question
> quietly close the second. A lane that is usually noise can still surface a real signal
> the one time it runs, and *"it's red by construction"* is the sentence that buries it.
> **Nobody re-baselines to make it green** — the STOP under "regenerating a baseline
> destroys the evidence" stands.

| 25 | A mapping between two tokens | **Only its LIGHT mode** — the one condition where they happen to coincide | `--graphite` (`style-lock.md:23`) is `#363c47` light / `#aab0bd` dark. `--color-neutral` (`:70`) is `#363c47` light / `#636a72` dark. **Identical in light, divergent in dark.** A drift census paired them and reported the dark values as the largest drift in the repo; in fact `color-neutral` matches its lock row *exactly* in both modes and `#aab0bd` appears nowhere in `css-engine`. **Any spot-check done in light alone confirms a pairing that is false half the time.** Flagged by the historian as an open question on a row they did not own, before the fix was written; confirmed independently by the orchestrator. Census 11 → **10** |

| 26 | The filtered query | **An unfiltered one** — because zsh does not word-split an unquoted variable | Builder, mid-FEL-430, measured *"my change broke filtering"*: pristine returned empty, theirs returned everything. It was **the test**. `for combo in "--project web --state Canceled"` passes the whole string as **one argv element** in zsh, so no filter parsed and the tool correctly returned everything — compared against a pristine run typed with separate words. **Two different invocations, one conclusion carried between them.** Caught only because "I broke the filter" did not fit code they could see was correct. Third member of the zsh-is-not-bash cluster, with `${PIPESTATUS[0]}` and `$pipestatus` |
| 27 | `packages/cli`'s full test surface | **The default vitest suite, which EXCLUDES the legacy-snapshot gate** | Builder-b ran it explicitly with `--config vitest.gates.config.ts` because the root config excludes it — and their change touched scaffold output, which is exactly what that gate covers. **A green `bun run test packages/cli` would not have run it.** Found by asking which config the gate lives in rather than trusting the suite name |

## The condition you sampled is part of the check

Instance 25 is not "the wrong artifact" — the census read the *right* files. It is
subtler:

> **A mapping checked under one condition is not a checked mapping.** And the
> single condition where two things coincide is precisely the one that makes a
> wrong pairing look verified.

`--graphite` and `--color-neutral` are **defined separately, on purpose**
(`style-lock.md:23` and `:70`, with `:86` recording the E2 naming resolution).
They share a light value and nothing else. Sample light, and the pairing looks
sound. Sample dark, and it is a colour mismatch so large it reads as the worst
drift in the codebase — which is how it got reported.

The tell that resolves it is structural, not numeric: `color-neutral` ships a
`-foreground` partner (`#faf8f4`, near-white), so it is a **background**;
`--graphite` is a brand **ink**. *A realization is not an identity.*

**This also gives the unmapped-bucket rule its missing half.** Instance 42 says a
census is only trustworthy once "didn't classify" is zero. That is necessary and
**not sufficient** — a row can be *mapped to the wrong thing*, which the bucket
count cannot see. Both failures came out of the same act of making the map
**total**: completing it moved three rows *into* the census, and checking the
pairings moved a fourth *out*.

Practical form: **for every mapped pair, verify it under every condition the pair
varies across** — both modes, both platforms, both build targets. If a pair agrees
in one condition and not another, that is the signal to check whether they are the
same thing at all.

## `git diff main branch` shows main's ADDITIONS as the branch's DELETIONS (2026-07-28)

A branch that is merely **behind** `main` is **indistinguishable from a destructive rebase** in a raw
`git diff main branch`. The orchestrator was ~one command from broadcasting *"#685's rebase CLOBBERED
#680's landed work"* — `git diff origin/main <branch>` showed **460 deletions**, `check-gate-wiring.ts`
and three baselines "gone." It was an artifact: `main` had **gained** those files *after* the branch
point, so a branch-vs-`main` diff renders main's additions as the branch's removals. The branch deleted
nothing.

> `git diff A B` answers *"what is different between these two trees,"* not *"what did B do."* When B is
> behind A, everything A added since the fork reads as something B removed. **To see what a branch
> actually changed, ask that question:** `git log main..branch` (or `git diff $(git merge-base main
> branch) branch`). The two-dot / merge-base form excludes what only `main` did.

Same family as the whole file: the *diff you ran* is not the *change the branch made*. "Twice in two
wakes, one command from a loud confident wrong reversal — both caught by **checking the premise instead
of the conclusion**" (orchestrator). The remedy is a habit: when a diff shows a scary deletion, confirm
the branch is not merely behind before believing it destroyed anything.

## The special case: regenerating a baseline destroys the evidence

A stale baseline is wrong. Refreshing it is worse, because the refresh is
indistinguishable from a verification:

> *"The four rows with valid baselines carry **+27.7% / +29.5% / +40.8% / +52.6%**
> of *unattributed* May→July drift. Regenerating blesses that drift as the new
> normal and **erases the only evidence it existed** … **A stale invalid number and
> a fresh invalid number are equally unpublishable; the second just looks
> trustworthy.**"*

The required procedure before any regeneration (FEL-409): one runner, back-to-back
jobs, old tree vs current `main`. **Flat → the drift was hardware. Not flat →
bisect before regenerating.** This is why the STOP in
`docs/state/orchestrator.md` stands.

## Why it keeps winning

1. **Every part of the pipeline is working.** The test is correct, the harness is
   correct, the assertion is correct. Only the *subject* is wrong, and nothing in
   the stack has an opinion about the subject.
2. **Resolution is invisible.** `tsconfig` paths, npm dist-tags, `bunx @latest`,
   napi addon lookup, and `git`'s regex defaults all silently substitute one
   artifact for another. None of them announce it.
3. **The failure mode is symmetric.** A red result and a green result are *equally*
   uninformative. Teams debug the red one and trust the green one, which is exactly
   backwards.
4. **A shared checkout has no identity.** With 100+ worktrees on this repo
   (`git worktree list`), the primary checkout is on whatever branch someone left
   it on.

## The recurrence (named 2026-07-27): a failed command read as success because its exit code was not checked

This is the sub-family the retro was told to name, and the naming carries a
promotion-rung finding (`promotion-rungs.md`). **Incident 1 above (row #30) and an
earlier incident the same morning are the SAME failure:** a command failed, its
nonzero exit was never inspected, and the surrounding logic proceeded as if it had
succeeded. It is the shell-level form of the whole directory — *"not evaluated"
rendered as *"passed""* (`absent-value-rendered-as-real.md`), where the "not
evaluated" is a command that ran, failed, and was waved through.

**The same shape, already in this file and in the tooling:**

- Row **#30** — `git checkout` exits 128 (branch held elsewhere), the chain
  force-pushes the wrong branch.
- Row **#22** — a `bun` shim failing to download itself (`exit=1`) nearly recorded
  **PASS**; the script never ran.
- Row **#24** — `git commit --amend` without `git add` left the file unstaged; the
  remote carried the false claim for ~50 minutes.
- Row **#26** — the zsh word-split cluster: a command that silently did something
  other than intended.
- `~/.swarm/supervisor.py:82-96` — the **documented sibling**: every `bus(…)` call
  passed `check=False`, so bus failures *"failed SILENTLY: no wake failure has ever
  reached the bus, and the ERRORS panel was structurally empty while agents sat
  stalled."* Now guarded — `bus()` defaults to `check=True` and **raises** on a bad
  exit (`supervisor.py:95`).

**Why the earlier fix did not prevent the later one — state it plainly:** every
prior remedy landed on **prose or a per-script idiom**, never a **structural gate
that all shell orchestration inherits**. `wire-workspace.sh` got `set -uo pipefail`
and `\|\| die` on every line — a *local* fix to *one* script. The lessons file got
rows #22/#24/#26 — *prose*. `supervisor.py` got `check=True` — a *local* fix to *one*
module. None of these reaches an **ad-hoc `checkout; rebase; push --force` chain
typed at a shell**, because that chain went through none of the guarded paths. Prose
does not execute; a per-file idiom protects only that file. So the failure recurred
in the one place no one had hardened, which is exactly where the *next* one will be.

> **An exit code is a value, and an unchecked exit code is an absent value rendered
> as success.** The only rung that holds is structural: `set -euo pipefail` (or an
> explicit exit-code check, or a wrapper that refuses to continue past a failed
> `git` op) as the **default for every orchestration script**, not a habit applied
> where someone remembered. Until the guard is universal, "we have a lesson about
> this" is itself an instance of the lesson: a fix that lives as prose.

**Promotion rung: prose / per-script idiom → needs a universal structural default.**
The stopgap that would have caught incident 1: no `git` mutation (`rebase`,
`push --force`) runs in a script that did not begin with `set -euo pipefail`, or that
does not gate each destructive step on the prior command's exit status.

## Fix / recipe

1. **Make the gate name its subject, in its own output.** Print the resolved path,
   version, commit, and machine it actually measured. A harness that prints
   `measuring @aihu/cli@1.0.1 from npm` cannot be mistaken for one measuring your
   diff.
2. **Default CI gates to `--mode local`.** Published-artifact mode is for scheduled
   runs and post-release verification, never for PR feedback.
3. **Mutation-test the gate in both directions.** Break the thing on purpose. If
   the gate stays green, it is not checking what you think.
4. **Never hand-maintain a copy of an artifact you validate.** Parse the artifact.
   Instance #5 is a duplicate that drifted on 8 of 30 rows while printing comfort.
5. **A comparison needs an independent reference.** If both sides can be written by
   the same step, the check is a tautology.
6. **Never compare timings across machines.** Ratios need a same-run denominator.
7. **Verify the branch before trusting a shared checkout:**
   `git -C /Users/smcguirt/conductor/repos/aihu branch --show-current`.
   Announce before you move it, and expect others not to.
8. **Match `git log` on the subject line, not the body**, when mapping PR → commit:
   ```bash
   git log origin/main --format='%h|%s' -400 \
     | awk -F'|' '{ if (match($2, /\(#[0-9]+\)$/))
         print substr($2, RSTART+2, RLENGTH-3)"\t"$1"\t"$2 }'
   ```

## How it bit us

`scaffold-matrix.yml` shipped as a required-looking CI gate, was **red on every
branch it ever ran on including its own**, and on pull requests tested npm rather
than the pull request. It was merged red. The engineer whose PR it reddened went
looking for a bug in his own diff and found the gate instead:

> *"I went looking because it was red on #609 and I assumed I had broken it. I had
> not — it went in red and stayed red."*

The cost is not the red build. It is that for the entire window the gate existed,
every green run of it was read as evidence, and every one of them was measuring npm.

## Detection (carry-forward debt)

- **Every gate should print its resolved subject.** Not built.
- **`check_contrast.py` must parse `packs.ts`.** Open, unassigned.
- **A skip must be neutral, not green** — see #10 in
  `absent-value-rendered-as-real.md`. Open, unassigned.
- **Per-agent checkout ownership** is enforced by nothing but a social convention
  (*"I will post before I move it"*). **Recurred THREE times on 2026-07-27** — instance
  #31 (historian force-pushed onto an already-merged branch), plus two more the same
  day verified by the orchestrator as byte-identical to `origin/main` post-#658:
  `aihu/zurich` `CLAUDE.md` staged mid-build under builder-b, and `aihu/jerusalem`
  switching branches under verifier (see the recurrence tally in
  `docs/lessons/promotion-rungs.md`). The `git branch --show-current`-before-every-commit
  rule is prose that depends on remembering, and it stayed prose across all three;
  **the durable fix is structural — the supervisor pins each role's checkout/branch per
  wake — and it is UNBUILT, owned by the orchestrator.**

## Related

- `absent-value-rendered-as-real.md` — the sibling pattern; instances overlap
- `docs/state/verifier.md` — instances #5 and the #613 verdict, with receipts
- `docs/state/orchestrator.md` — the cross-machine-ratio and counted-metrics rulings
- `docs/state/historian.md` — instance #11 and the correct PR→commit method
