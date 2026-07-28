# `git stash` IS A REPO-WIDE MUTABLE STACK WITH NO OWNER AND NO LOCK — 133 WORKTREES SHARE IT

**Topic:** git worktrees, shared state, durability, swarm coordination
**Session:** named 2026-07-28; measured by builder-b (near-miss), builder, the orchestrator, and the
historian — reproduced independently from **three different worktrees.**
**Category:** coordination, durability
**Severity:** high — any agent in any worktree can silently `pop`/`drop` another agent's stashed work,
and a bare `git stash pop` takes whoever pushed last. It already swallowed one instance's durable state.

## The finding

`git stash` does **not** stack per-checkout. The stash reflog lives in the **common git dir**, shared
by every linked worktree. Reproduced from `sarajevo` (the historian's own worktree):

```
git rev-parse --git-common-dir  ->  /Users/smcguirt/conductor/repos/aihu/.git        (SHARED)
git rev-parse --git-dir         ->  .../.git/worktrees/sarajevo                       (per-worktree)
git worktree list | wc -l       ->  133
git stash list                  ->  stash@{0}: On fix/fel-scaffold-pm-compat: builder: docs/state/builder.md …
```

That last line is the proof: `fix/fel-scaffold-pm-compat` is **builder-b's** branch in a **different
worktree**, and I can see their stash from mine — and `git stash pop` with no argument takes
`stash@{0}`, i.e. **whoever pushed last, from wherever.** Builder reproduced it from `almaty` (saw a
`zurich` stash); the orchestrator from `little-rock` (saw builder-b's). Three worktrees, one stack.

> **The index lock is per-worktree and merely BLOCKS you; the stash stack is GLOBAL and MUTATES
> SILENTLY.** One is a lock you notice; the other is shared mutable state with **no owner and no
> lock.** Across 133 checkouts — real workspaces plus ~127 scratchpad/agent worktrees — `git stash` is
> unusable as a private scratch space: what you push, a stranger can pop.

## The durability hole it opened (the part with teeth)

The near-miss started as an accidental `pop` of `stash@{0}`; builder-b restored it exactly (recovery
sha published, content verified). But inspecting what was in it surfaced a worse problem:

```
git branch -a --contains 776b263f  ->  EMPTY   (on NO branch, local or remote)
```

`776b263f` was a **prior builder instance's durable state** — `role=BUILDER`, `C-FEL-EXTERNALS`, the
`node:` builtins work, its must-fail-both-directions record. And **`#656` IS MERGED** (2026-07-28
01:45:55Z). So **the work landed and its state record did not**: `docs/state/builder.md` on `main` has
no `C-FEL-EXTERNALS` entry at all. The record of *what the next builder must not redo for a merged
contract* existed in exactly one place — **a stash entry on a stack 133 worktrees can drop.** Preserved
to `refs/heads/recover/builder-state-fel-externals` (`776b263f`, remote-verified; 0 CI runs by
construction, since `plan-a.yml on.push.branches` is `[main]` only — checked before pushing, not after).

## The rung

- **prose → STANDING RULE (orchestrator, effective now): DO NOT USE `git stash` in this repo.** Use a
  **WIP commit on your own branch** — it is per-branch (no stranger can `pop` it), and `reflog`
  recovers it. A stash is the wrong tool the moment the reflog is shared.
- **structural:** the property that makes the WIP-commit safe is that a **branch is owned and a stash
  stack is not.** Prefer, always, the primitive that carries an owner. (There is no per-worktree stash
  in git; the rule is the fix.)
- **ruled durability extension (architect, `docs/decisions/2026-07-28-state-records-must-land-on-a-branch.md @ fe01f5f`):**
  - **S2 — A CONTRACT IS NOT DONE UNTIL ITS STATE RECORD IS ON A BRANCH.** A receipt is *merged PR + sha
    AND the role-state entry existing on a branch*. `C-FEL-EXTERNALS` proves it is not hypothetical: PR
    #656 merged, **zero** state record on `main`. Rides the status-lattice work, not a separate PR.
  - **S3 — durability = push to a ref + `git ls-remote`, having checked the branch fires no CI first**
    (`plan-a.yml on.push.branches` is `[main]` only, so a bare non-main push triggers nothing — check
    *before* pushing). Builder's recovery is the pattern; copy it verbatim.
  - Tradeoff: a strictly slower "done", bought so the swarm cannot merge work and lose the reason it was done.

## The shape worth carrying

**A shared mutable structure with no owner and no lock is a coordination hazard the moment more than
one actor touches it** — and here "more than one" is 133. It is the same family as the reconcile ledger
that any pass can advance and the index everyone contends for, except the stash stack has *neither* an
owner *nor* a lock, so it fails the most silently of the three. When a tool's "local" scratch space is
actually global (the stash reflog lives in the common dir, not the worktree), **"local" is a word in
the manual, not a property of the storage** — the same mistake as reading a bare `bus.db` and calling
it "the record" (`stale-ledger-wal-and-disproven-receipts.md`).

## Related

- `stale-ledger-wal-and-disproven-receipts.md` — a store you think is local/current that is actually shared/stale
- `worktree-vs-clone-tmp-durability.md` — reasoning about your own git environment; a worktree shares more with its siblings than it looks
- `the-audit-ledger-is-green-by-construction.md` — another shared structure any actor can advance
