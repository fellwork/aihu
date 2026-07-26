# DERIVE-FROM-DISK CANNOT DETECT REMOVAL

**Topic:** cross-cutting (CI gates, coverage manifests, registries, size rows)
**Session:** named 2026-07-26 (builder, FEL-426 / #619)
**Category:** ci-lint, coverage-integrity
**Severity:** high — the gate stays green, and *nothing anywhere* records that
coverage went down
**Status:** named; the canonical fix already exists in this repo (below)

## The shape

> A gate discovers its universe by reading the filesystem — `readdirSync`, a
> glob, "every directory under `examples/`". Adding an item is free: the gate
> picks it up. **Removing an item is invisible: the row simply vanishes, and the
> lane goes green.**

There is no diff to review. No assertion fails. The gate's output is *smaller*
and *entirely consistent with itself*, because the thing that would have
complained was derived from the thing that was deleted.

Found by deleting an example and watching the row disappear with the lane green.
Nobody had it; it is a distinct shape rather than an instance of
`absent-value-rendered-as-real.md`, because nothing is *rendered* at all — the
row's absence is structurally identical to it never having existed.

**Adding is checkable. Removing is not. A gate that only ratchets one way is
half a gate.**

## The test — does *your* gate have it?

Ask one question: **where does the list of things-to-check come from?**

| the universe comes from | removal is | why |
|---|---|---|
| the filesystem (`readdirSync`, glob) | **invisible** | delete the dir, the row is never generated, output shrinks silently |
| a **committed manifest** | **a visible line deletion** | removing coverage requires editing a tracked file, which shows up in review |

The fix is not "add a floor" in the abstract. It is: **make the committed side
authoritative for the universe, and check both directions.**

## The canonical fix is already in this repo — copy it

`scripts/check-use-registry-parity.ts` solves this completely, and its own
docstring says how. `packages/use/families.json` is the committed source of
truth, and the check runs **both ways**:

> *"'Bidirectional' means: a composable dir missing ANY of its required manifest
> entries is an error, AND **a manifest entry with no backing `src/` directory (a
> ghost row — e.g. a leftover after a rename, or a copy/paste typo) is ALSO an
> error**. Every name is checked against every source it is expected to appear
> in."*

Two things worth stealing from it:

1. **It names the failure mode it is preventing** — a *ghost row* — so the next
   reader knows what the second direction is for.
2. **It documents a deliberate exception, with the reason**, instead of silently
   omitting the check:

   > *"The converse — 'every declared family has ≥1 member' — is **DELIBERATELY
   > NOT enforced**: this namespace's four families are pre-declared,
   > founder-ratified architecture ahead of their first composable landing, and a
   > hard 'must have a member' gate would block landing that declaration at all."*

   An exception with a stated reason is debt you can audit. An exception with no
   comment is indistinguishable from an oversight — see the exempt-list pattern
   in `absent-value-rendered-as-real.md`.

`scripts/check-cookbook-index.ts` is a second working example: it diffs against
the committed `packages/mcp/src/cookbook-index.json`, so a removal has to be
written down.

## What actually has the hole — measured, not assumed

The generalisation offered when this was named was *"every derive-from-disk gate
in this repo has that hole."* **That is too strong, and the narrower truth is
more useful** — several gates already solve it, which is where the fix above came
from. Surveyed 2026-07-26 by how each builds its list:

| gate | universe from | removal detected? |
|---|---|---|
| `check-use-registry-parity.ts` | `packages/use/families.json` (committed) | **yes** — explicit ghost-row check |
| `check-cookbook-index.ts` | committed `cookbook-index.json` | **yes** — diffed |
| `check-required-stories.ts` | `packages/ui/registry.json` + built index | **yes** — registry is committed |
| `check-size-rows.ts` | `.size-limit.json` rows (committed) | **yes** — row policy is two-way |
| `check-coverage-manifest.ts` | `readdirSync(examplesDir)` | **NO** — this is the one that was found |

So: **check the gate you are about to trust, rather than assuming either that it
is fine or that it is broken.** The one-line test is at the top.

## Status of the found instance

`check-coverage-manifest.ts` enumerates `examples/` from disk
(`readdirSync(examplesDir, { withFileTypes: true })`) and reads each example's
`coverage.manifest.json`. Delete an example and its declared coverage rows leave
with it, silently.

The fix — a committed `examples/governed-roster.json` acting as the floor, so
that removing an example requires a visible line deletion — is **in draft #619
and NOT yet on `main`** (verified: the file does not exist at `origin/main`).
Adding an example still needs no roster edit; *removing* one does. That
asymmetry is the whole design and it is the right one.

## Related

- `absent-value-rendered-as-real.md` — the sibling where something *is* rendered;
  here nothing is rendered at all, which is why it needed its own name
- `checked-thing-is-not-the-changed-thing.md` — gates that measure the wrong
  subject, incl. the green-by-construction family (FEL-428)
- FEL-426 / #619 — where this was found
