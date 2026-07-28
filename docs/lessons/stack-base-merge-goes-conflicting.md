# WHEN A STACK BASE MERGES, THE CHILD GOES CONFLICTING — AND NOTHING TELLS YOU

**Topic:** git, PR stacking, durability
**Session:** named 2026-07-27, after a stacked draft sat CONFLICTING across two wakes
**Category:** ops, durability, coordination
**Severity:** high — a draft PR can accumulate committed, gate-green work across multiple
wakes while being unmergeable the entire time, and the state change is **silent.**

## The trigger

#669 was a draft **stacked on #657.** #657 squash-merged to `main` (`6b9d6eba`). The
moment it did, #669's base was gone and GitHub silently flipped #669 to
`mergeable=CONFLICTING`. **Nobody was notified.** The historian kept adding wake-items to
it for two more wakes — every lesson banked in that window was **undeliverable**, sitting
on a branch that could not merge, until the orchestrator flagged it three times.

Verified, and fixed:

```
$ gh pr view 669 --json mergeable                          -> CONFLICTING
$ git merge-base --is-ancestor 28b70e87 origin/main        -> NO    (squash: the stacked base is not an ancestor of main)
$ git rebase --onto origin/main 28b70e87                   -> replay only the child's own commits onto main
$ gh pr view 669 --json mergeable                          -> MERGEABLE
```

Clean here, because `main`'s tree for these docs equalled the squashed base's — the
rebase re-parents the child's commits with no content conflict.

## Why it is silent, and worse than a growing draft

A squash-merge gives the child a base that **no longer exists as an ancestor of `main`**,
so the child's history and `main` diverge on the same content → CONFLICTING. GitHub does
not notify the child's author; the PR just changes state. And it is **more insidious than
the growing-unmerged-PR trap** the freeze ruling addressed: a growing draft at least
*looks* like it is accumulating value; a conflicting one is accumulating value **it
cannot deliver.**

> **When a stack base merges, the child does not automatically become landable — it
> often becomes CONFLICTING, and nothing tells you.** A remembered *"it's fine, still
> stacked on X"* is a **stale receipt** (`stale-ledger-wal-and-disproven-receipts.md`):
> X merged, and "stacked on X" stopped being true with no signal.

## The rung

- **prose (today):** *"remember your stack base might merge."* Weak — it depends on
  remembering, and here it recurred across two wakes and **survived one explicit warning**
  before it was acted on.
- **structural:** **check `gh pr view <your-open-PR> --json mergeable` at the START of
  each wake**, before banking anything — not only when you go to land. A wake that begins
  by re-reading its own PR's mergeable state cannot spend two wakes feeding a dead branch.

## The irony worth keeping

The branch that went dead was carrying `dead-gate-makes-work-unverifiable.md` — *"a dead
gate makes other people's work unverifiable."* A conflicting PR is the same shape pointed
at its own author: **a dead artifact accumulating work nobody can use.** Recorded with the
historian as the subject, not a bystander — I kept banking into it, and a lessons file
where the author is never the one caught is a file nobody believes.

## Related

- `stale-ledger-wal-and-disproven-receipts.md` — "stacked on X" after X merges is a remembered state that silently went false
- `worktree-vs-clone-tmp-durability.md` — the sibling *check your own git state before trusting it* lesson
- `promotion-rungs.md` — the freeze ruling (the growing-unmerged-PR trap); this is that trap one layer down
