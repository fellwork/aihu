# Never tag a release before the changesets Version PR is merged — the idempotency check publishes nothing

**Topic:** seo-ssr
**Session:** 2026-05-25 (the v0.4.11 misfire)
**Category:** release-engineering, changesets
**Severity:** high (a "release" that silently publishes zero packages)

## Symptom

You push a release tag, the release workflow runs green, exit code 0 — but **nothing new appears on npm**. Every package reports "already published, skipping."

## Root cause

The changesets **Version PR** is what actually applies the version bumps to each `package.json` (consuming the changeset files and writing the new `version`). If you tag at `main` HEAD **before** that PR has merged, the tree still has the **old, un-bumped** versions. `publish-all.sh`'s idempotency check (it skips any package whose current `version` already exists on the registry) then sees the old versions — which ARE already published — and skips every package. The workflow succeeds while publishing nothing.

## Fix / recipe

Strict ordering for every release:

1. Merge all changeset files to main.
2. Let the changesets action open/update the **Version PR**.
3. Inspect + correct the bump table (see `changesets-pre-1.0-cascade.md`).
4. **Merge the Version PR** so main HEAD carries the bumped `package.json` versions.
5. Refresh the lockfile if you corrected versions (`version-pr-correction-refresh-lockfile.md`).
6. **Only now** create + push the release tag.

The invariant: the commit you tag MUST already contain the new versions. Tagging is the last step, never a step before the bump commit exists on the tagged ref.

## How it bit us

v0.4.11 was tagged at main HEAD before the Version PR merged. The publish-all idempotency check saw the un-bumped versions as already-published and published nothing — a complete no-op "release." Diagnosed, then redone correctly in the v0.4.14 → v0.4.15 sequence.

## Related

- `changesets-pre-1.0-cascade.md` — what to inspect/correct in the Version PR before merging it.
- `version-pr-correction-refresh-lockfile.md` — lockfile refresh after corrections.
- `publish-all-pkgs-array-gap.md` — the other "release succeeds but a package never reaches npm" failure mode.
