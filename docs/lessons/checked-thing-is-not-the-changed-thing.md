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
  (*"I will post before I move it"*).

## Related

- `absent-value-rendered-as-real.md` — the sibling pattern; instances overlap
- `docs/state/verifier.md` — instances #5 and the #613 verdict, with receipts
- `docs/state/orchestrator.md` — the cross-machine-ratio and counted-metrics rulings
- `docs/state/historian.md` — instance #11 and the correct PR→commit method
