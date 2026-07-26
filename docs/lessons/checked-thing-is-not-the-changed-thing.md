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
| 5 | `packages/css-engine/src/packs.ts` — the shipped tokens | **A hardcoded `TOKENS` dict at `.tastemaker/check_contrast.py:32`** | The script contains **no file-reading call of any kind**; `grep -n "packs\|open(\|read_text\|Path(" .tastemaker/check_contrast.py` returns a single *comment* on line 41. **8 of 30 values have already drifted.** `[light] accent/border` — tool says `3.62`, ships `3.12`, ui-safe floor is `3.00`. **Still open** |
| 6 | Production's agent-metadata registry | **A registry the test populated itself** | The test calls `registerAgentMetadata()` in the test process, then the handler **in the same process** — proving the generator renders a *populated* registry, *"which is precisely the precondition production does not satisfy. It passes in production for the wrong reason."* |
| 7 | Both sides of a size comparison | **Two artifacts both written by the step that broke them** | `sync-readme --check` exited 0 while all 108 cache rows read `"bytes": -1` and 48 README cells read `_no dist_`. *"`--check` compares two things that were both written by the thing that broke them."* / *"It is a tautology wearing a check's clothes."* Fixed in #591 (`24c08c33`) |
| 8 | A local M5 | **A checked-in baseline measured on CI ubuntu** | The 26x and 8.8x figures were *"arithmetically correct and neither was a measurement"* — same fabricated denominator, numerators from **different machines** (751 ns CI ubuntu vs 241 ns local M5). The disagreement **is** the hardware gap: 3.11x. **Standing ruling: cross-machine ratios against a checked-in baseline are meaningless.** |
| 9 | A compiler transform | **The compiler's page default** | `fable`'s new test **passed both before and after** the change. It proved nothing about the regression — and `fable` said so explicitly rather than counting it as a gate |
| 10 | `main` | **Another agent's branch, in a shared checkout** | A peer grepped `/Users/smcguirt/conductor/repos/aihu`, found three hits including a live call site, and *"was about to tell you that you were mistaken."* The checkout was on `feat/scaffold-aihu-config`. On `main` there is **exactly one hit**, the definition at `index.ts:292`. *"Recording it because the lesson clearly does not stay learned by being stated once."* |
| 11 | A PR's merge commit | **Any commit whose body mentions that PR number** | `git log origin/main --grep="(#591)" -1` returns `3a7af464` — the merge commit for **#592**, whose body cites #591. `--grep` is a regex over the whole message and `-1` takes the *newest* match; `-F` does not help. Found by the historian on 2026-07-26 **while verifying this very session** |
| 12 | `.github/workflows/scaffold-matrix.yml` **at `origin/main`** | **The same file in a worktree one commit behind** | The historian, *while writing this document*, ran `grep -n mode .github/workflows/scaffold-matrix.yml` to confirm #613's fix and read `--mode "${{ inputs.mode \|\| 'npm' }}"` — the **pre-fix** line — because the worktree sat at `d0c9200c`, one commit before #613's `8aa12dc1`. Was seconds from recording "#613 did not actually fix PR mode" as a finding. `git show origin/main:<path>` shows the fix is real: `--mode "${{ inputs.mode \|\| (github.event_name == 'pull_request' && 'local' \|\| 'npm') }}"`. **Instance #12 was produced by the person documenting instances #1–#11, inside the document.** |

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
