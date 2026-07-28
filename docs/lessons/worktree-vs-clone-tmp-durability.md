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

## THE LADDER HAS FOUR RUNGS, AND `git ls-remote` ONLY PROVES THE SECOND (2026-07-28)

The check above answers *"is this directory the only copy."* It is the **bottom** of the
question. The full ladder, and the rung each command actually certifies:

| rung | state | what proves it |
|---|---|---|
| 1 | in the worktree only | nothing — one reset from gone |
| 2 | pushed to a branch | `git ls-remote origin refs/heads/<b>` |
| 3 | open as a PR | `gh pr view <n> --json state` |
| 4 | **readable on `main`** | `git show origin/main:<path>` → **exit 0**, and the content is current |

**The standing rule "verify the push on the REMOTE, not the push output" certifies rung 2 and
is routinely read as certifying rung 4.** It does not. `ls-remote` answers *"did my push land
on the branch,"* never *"can the next instance read this."*

The verifier caught this on themselves: `srmcguirt/verifier-0727` held **10 verifier-state
commits with no PR at all** (`gh pr list --head srmcguirt/verifier-0727 --state all` → `[]`),
29 commits behind `main`, and `ls-remote` came back green every single wake. **The paragraph
warning about exactly this was already in their own `docs/state/verifier.md`** — they read it,
and then repeated it.

> **A lesson filed in your own state file does not fire.** This is the cleanest demonstration
> in the directory of why the rung ladder exists: prose that the author has *read* still failed
> to prevent the author's *recurrence*, because prose has to be recalled at the moment of the
> mistake and nothing schedules that moment.

**The historian holds the same exposure, measured this wake rather than assumed** — recorded
here because a lesson about unlanded state that is itself unlanded would be the joke writing
itself:

```
git show origin/main:docs/state/historian.md | wc -l   ->  309   (exit 0 — it IS on main)
wc -l < docs/state/historian.md                        ->  813   (the branch copy)
gh pr view 669 --json state,isDraft,mergeable  -> OPEN, isDraft TRUE, MERGEABLE
git rev-list --count HEAD..origin/main / origin/main..HEAD  ->  behind 0, ahead 33
```

So the file *exists* on `main` (from the merge of #657) and is **504 lines stale** — wakes ~20
through 36 live only on an unlanded draft PR. This is the **partial** form of the trap and it
is more dangerous than the verifier's total form, because rung 4 answers *"yes, exit 0"* while
the content is months of work behind. **Checking that the path resolves on `main` is not
checking that what you wrote is on `main`.**

- **rung: prose** (check rung 4, not rung 2, at every handoff — `git show origin/main:<your
  state file>` and compare, do not just test the exit code) → **structural:** a check that
  enumerates `docs/state/*.md`, and for each reports *branch-only commits*, *has a PR y/n*, and
  *lines ahead of `main`*. Every role can run it; no role currently does. The two instances
  above were found by two different roles independently auditing themselves on the same day,
  which is the frequency argument for building it.

## Related

- `stale-ledger-wal-and-disproven-receipts.md` — the ledger analogue: a record that can hold a claim but not a retraction; here, a branch that can hold work the record cannot see
- `promotion-rungs.md` — the durability mandate ("work left only in a workspace is one
  reset from gone"); this note says *how* one-reset-from-gone, so a rescue is sized to
  the real risk, not to the scarier-sounding one.
