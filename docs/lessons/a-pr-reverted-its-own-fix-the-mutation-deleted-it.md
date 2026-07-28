# A PR REVERTED ITS OWN FIX — the must-fail MUTATION deleted it, and a commit message is not a diff

**Topic:** verdicts, must-fail mutation tests, commit hygiene, verdict-at-an-instant
**Session:** named 2026-07-28. The head measurement is builder's + the orchestrator's + the architect's,
all independent; the historian could not fetch the branch sha and reports that arm as could-not-check.
**Category:** measurement-integrity, durability
**Severity:** high — #689 was READY (draft=false) and **landable by anyone reading a true verdict**,
and landing it would have re-broken `main` from the identical cause the PR existed to fix.

## What happened

#689 existed to ship an 89-line fix to `scripts/check-moon-graph.ts` (teach the extractor to skip
string literals) **and** revert the no-op `- signals` edge. Its head `e85c839d` did the second and
**silently un-did the first:**

```
git show --stat e85c839d:                 packages/plugin-agent-readiness/moon.yml   1 -    (intended revert)
                                          scripts/check-moon-graph.ts               90 +--- (THE ENTIRE FIX, reverted)
grep -c stripNonCode:   42297934 (fix) -> 2      e85c839d (HEAD) -> 0      main -> 0
cumulative PR diff -> ONE deleted line in moon.yml.  The 89-line fix is not in it.
```

The commit subject read *"revert(build): drop the plugin-agent-readiness → signals edge"* — naming
**1 of the 2 files it changed.** Nobody reading that subject would look for a 90-line deletion beneath it.

## The mechanism — the cruellest of the day

builder's must-fail protocol was correct: **mutate** `stripNonCode` to identity, observe the gate go
`EXIT=1`, then **restore**. But the revert commit captured the working tree **in the mutated state** —
so **the test written to prove the fix is load-bearing is what removed the fix.** And the verdict was
*accurate at the head builder measured* (`18d6d6e8`); the head then moved. The gap in one line:
**they measured the tree and then committed again.**

## Three sub-lessons, each with teeth

1. **A must-fail MUTATION leaves the tree broken until you restore it — never commit with a mutation
   in flight.** After a "break it, watch it fail, put it back" test, the *put it back* must be
   verified before the next `git add`. The safe order is: restore → `git show --stat`/`grep` for the
   fix's signature in the working tree → *then* commit. A mutation test that proves a fix is
   load-bearing can, uncleaned, **delete the fix it was proving.**
2. **A commit message is not a diff.** A subject naming one file over a two-file change is invisible to
   anyone reading subjects. Trust `git show --stat <head>` and a signature grep, never the message.
   (And read a PR's real content with `git log base..head` / `git show --stat`, not `gh pr diff`, per
   `checked-thing-is-not-the-changed-thing.md`.)
3. **A verdict is a VERDICT-AT-AN-INSTANT; stamp the head sha and a void clause.** builder's #685
   verdict carried "void if head differs" and it would have caught this in one command. A verdict
   without its head is a `mergeable=CLEAN` without its read-time (`stale-ledger-…` void rule): true
   when written, silently false after the next push. **Re-measure after your last commit, and stamp
   the sha you measured.**

## The rung

- **prose:** restore-and-verify before committing; stamp the head in every verdict; a reviewer greps
  the head for the fix's signature before landing.
- **structural:** the **one-command landing gate** — a PR that claims to ship a fix must prove the
  fix's signature is present at its *current* head, mechanically, before merge:
  `git show <head>:scripts/check-moon-graph.ts | grep -c stripNonCode` **must be 2, not 0.** This is
  the same shape as the `ci-receipt` same-run rule: bind the claim to the sha, and let one command
  falsify a stale one. Not a competence patch — builder's must-fail discipline is exactly right; the
  missing piece is that the *verdict* must carry the *head it was true at.*

## Related

- `ci-ok-green-only-with-same-run-check.md` — a green bound to a run; here a verdict bound to a head; the VOID clause is the same tool
- `stale-ledger-wal-and-disproven-receipts.md` — the void rule: a measurement without the coordinate it was taken at is stale-by-construction
- `checked-thing-is-not-the-changed-thing.md` — read what the branch DID with `git log base..head`, not a raw diff or a subject line
