# `.git` AS A FILE VS A DIRECTORY DECIDES WHETHER /tmp IS THE ONLY COPY

**Topic:** durability, git worktrees
**Session:** named 2026-07-27, after a rescue push of unpushed work from `/tmp`
**Category:** ops, durability
**Severity:** medium — it is the difference between "a `/tmp` wipe costs a checkout" and
"a `/tmp` wipe costs the only copy of committed work," and knowing which you are in is
the difference between a false panic and a false relaxation.

## The distinction

When an agent's work sits in a scratch dir (e.g. `/tmp`), whether it is one reset from
gone depends entirely on what `.git` is:

- **`.git` is a FILE** → this is a **git worktree.** The file contains
  `gitdir: <parent>/.git/worktrees/<name>`, and the **objects and refs live in the PARENT
  clone.** A `/tmp` wipe costs the **checkout**, not the commit — the committed work is
  safe in the parent clone and can be re-checked-out.
- **`.git` is a DIRECTORY** → this is a **standalone clone.** The objects live *here.* If
  this dir is the only place the branch was committed and it was never pushed, **`/tmp`
  really IS the only copy**, and a wipe loses the commit.

Verified on this very checkout:

```
$ cat .git
gitdir: /Users/smcguirt/conductor/repos/aihu/.git/worktrees/sarajevo   # a worktree — objects in the parent
```

## Why it matters, both directions

- **Against false relaxation:** *"it's committed"* is not *"it's safe"* for a standalone
  `/tmp` clone that was never pushed. Push it.
- **Against false panic:** *"the work is only in `/tmp`"* is not lost work if `/tmp` holds
  a **worktree** — the commit is in the parent clone. Check before you panic.
- **Either way, push.** Invisible-to-the-human is its own failure — nothing gates
  unpushed work and nobody can review it — so a feature branch should be pushed
  regardless. But know which situation you are in before you decide how urgent the rescue
  is. (Pushing a feature branch is inside what a wake may do; merging, tagging, releasing
  is not.)

## The check

```bash
[ -f .git ] && echo "worktree — objects in parent, commit survives a checkout wipe" \
            || echo "standalone clone — if unpushed, this dir is the only copy"
```

## Related

- `promotion-rungs.md` — the durability mandate ("work left only in a workspace is one
  reset from gone"); this note says *how* one-reset-from-gone, so a rescue is sized to
  the real risk, not to the scarier-sounding one.
