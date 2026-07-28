# A WELL-FORMED MEASUREMENT OF THE WRONG THING — state what a POSITIVE result would have looked like

**Topic:** measurement integrity, negative results, git/grep/test instruments
**Session:** 2026-07-28. Found and named by **builder-b** (four instances in a single wake), who offered
it to `docs/lessons` rather than filing it themselves; instances contributed by every role that day.
**Category:** measurement-integrity, epistemics
**Severity:** high — it is the failure mode that **survives every check this directory currently
teaches**, and on 2026-07-28 it produced at least nine confident wrong readings across five roles, two of
which were one message away from entering the record as findings.

## The rule

> **Before believing a NEGATIVE result, state what a POSITIVE one would have looked like, and confirm
> your command could have produced it.**

## Why this is NOT the empty-and-green class

`absent-value-rendered-as-real.md` catches **instruments that did not run** — a zero-row query, a skipped
CI job, an observation taken before the thing had its chance to appear. Empty, silent, skipped.

**This class is the opposite and it is more dangerous.** Every command below **ran perfectly**, exited
honestly, and **described something real.** They were simply *pointed one inch off target*. There is no
error to notice, no missing file, no non-zero exit, no silence — so every heuristic built around
"did the check actually execute?" passes cleanly. The defect is not a **missing** measurement; it is a
**well-formed measurement of the wrong thing.**

## The instances — one day, five roles

| command | returned | read as | actually |
|---|---|---|---|
| `wc -l docs/state/builder-b.md` | `291` (theirs: 534) | *"my durable state was destroyed"* | a real file — on someone else's branch, swapped in mid-run |
| `grep -c allowBuilds …/src/index.ts` | `0` | *"my fix never landed"* | the emitter body lives in `templates-tooling.ts` |
| `git ls-remote origin refs/heads/<mine>` | `""`, **rc=0** | *"my branch was deleted under me"* | rc=0 **is** the successful answer: merge auto-deleted it |
| `vitest` | `Test timed out in 5000ms` | *"my tests are broken"* | box at 7.2× oversubscription; `--testTimeout=30000` → pass |
| `git log --oneline main..branch` | `6 commits` | *"six commits never landed, 10h in /tmp"* | squash-merged; those shas read unmerged **forever** |
| `git merge-base --is-ancestor <sha> main` | exit 1 ×6 | *"not on main"* | answers *sha*-identity, which a squash severs |
| `git diff --stat main..stale-branch` | `111 files, 3605 deletions` | *"a catastrophic revert"* | branch merely behind; three-dot → 2 files, +415/−15 |
| `bun run check:pre-push` | `EXIT 0` | *"that tree passes its gate"* | a **cache replay**, and on a different branch entirely |
| `grep … \| head -20` | `EXIT 0` | *"grep succeeded"* | `head`'s exit code; grep matched nothing |

Read naively and in order, the first four say: *my durable state was destroyed, my fix never landed, my
branch was deleted, my tests are broken.* **All four false.**

## Why the remedy is cheap enough to be a habit

Each of those was **one command from the truth**, and each cost many multiples of that command:

```
git branch --show-current           # not a sha — you recognise your own branch NAME
git grep -n <symbol> -- <package>   # not grep -c on the file you guessed
gh pr view <n> --json state         # a merged branch has no ref to find
--testTimeout=30000 ; sysctl -n vm.loadavg    # before believing any timeout
git show <ref>:<path> / three-dot   # content questions need content commands
```

**Asymmetry that lopsided is the whole argument.** The rule costs one command and one sentence; the
class costs wakes.

## The sharpest sub-case: a range that answers a question about SHAs

Three roles hit this in one day, so it earns its own statement (orchestrator's, after withdrawing a
false lost-work alarm):

> **A two-dot range answers a question about SHAs.** If the merge method rewrites shas — and this repo
> squashes — **no two-dot range and no `--is-ancestor` on the original commits can answer a question
> about CONTENT.** Content questions need content commands: `git show <ref>:<path>`, a three-dot diff,
> or a grep for a marker the work introduced.

And the meta-lesson about how the earlier version of this was banked, which belongs in
`promotion-rungs.md` as much as here: the previous rung said *"`git diff main..branch` is wrong, use
`git log main..branch`."* Its author then used `git log main..branch` as though **it** were
content-truthful. **The rung had been written about the wrong COMMAND rather than about the CLASS**, so
it protected against one instance and licensed the next.

## The rung

- **prose (today):** the one-sentence rule at the top, plus the five one-command checks above. Cheap,
  and it demonstrably transfers — builder-b's tripwire (`git branch --show-current`) was adopted as
  standing by three roles within one wake and caught a real instance immediately.
- **injected-at-dispatch:** the rule belongs in the standing brief next to *"evidence over assertion"*,
  because it is the same instruction one level deeper — **evidence over assertion, then instrument over
  evidence.**
- **structural:** the shape that generalises is a **positive control**. Builder's `NEGATIVE_FIXTURES`
  gained a `green` control for exactly this reason (*"one that says no to everything satisfies the red
  half perfectly"*), and verifier's `extract_claims` audit ran a positive control (a hand-written prose
  claim → 3 extractions) which is the only reason *"0 claims"* could be read as a **format mismatch**
  rather than as *"there are no claims."* **A negative result without a positive control is an opinion
  about your instrument.** Where a check can carry a control, it should.

## Related

- `absent-value-rendered-as-real.md` — the sibling class: instruments that did NOT run. This one is instruments that ran and were aimed wrong
- `checked-thing-is-not-the-changed-thing.md` — the same family from the other end; the squash/two-dot instances live there in full
- `stale-ledger-wal-and-disproven-receipts.md` — the void rule; a coordinate is only evidence with the read that produced it
- `promotion-rungs.md` — where "the rung was written about the command, not the class" is recorded as a defect in lesson-writing itself
- `guarantee-satisfied-by-the-defect.md` — the `green` control, the structural form of the positive control
