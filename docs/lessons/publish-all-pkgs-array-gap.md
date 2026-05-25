# New publishable packages must be added to publish-all.sh's PKGS array (recurrence) — or they are silently skipped

**Topic:** seo-ssr
**Session:** 2026-05-25 (the v0.4.16 mop-up)
**Category:** release-engineering, ci-lint
**Severity:** high (Release succeeds while a new package never reaches npm)
**Recurrence of:** `publish-all-pkgs-array.md` (round 7 — `auth`/`mcp`/`ai`/`scraping`)

## Symptom

A brand-new package is version-bumped in its `package.json` by the Version PR and looks shipped — but `npm view @scope/pkg@<new-version>` returns 404. The release workflow exited 0 and never published it.

## Root cause

`scripts/publish-all.sh` iterates a hand-maintained `PKGS=( ... )` bash array, not the filesystem. Changesets bumps the `version` field for any package with a changeset, but `publish-all.sh` only ever runs `npm publish` for packages **named in the array**. A new package directory is therefore SILENTLY skipped — no error, no nonzero exit.

This is the **same bug class** that bit round 7 (`auth`, `mcp`, `ai`, `scraping` were all absent then). It recurs every time a new publishable package is added without a paired PKGS edit.

## Fix / recipe

After adding ANY new browser- or server-publishable package (one whose `package.json` has `"publishConfig": { "access": "public" }`):

1. Add its **short directory name** to the `PKGS` array in `scripts/publish-all.sh`.
2. **Place it in dependency order** — a package must follow every internal package it depends on, because publish proceeds top-to-bottom and a dependent published before its dependency declares an unpublished range. This session added, in order:
   - `language-server` (after `compiler`)
   - `plugin-drizzle` (after `server` + `plugin-data`)
   - `plugin-kindly-note` (after `signals`)
3. Re-run the publish for the missed versions (this session: the v0.4.16 mop-up tag re-published the three skipped packages).

## How it bit us

v0.4.15 bumped + appeared to ship `@aihu/language-server@0.1.0`, `@aihu-plugin/drizzle@0.1.0`, and `@aihu-plugin/kindly-note@0.2.0`, but none were in `PKGS`, so none reached npm. v0.4.16 added all three (in dependency order) and mopped them up.

## Detection (carry-forward debt)

Wire a CI lint that fails on drift between `packages/*/package.json` (`publishConfig.access == "public"`) and the `PKGS` array — see the `check-publish-array.sh` sketch in `publish-all-pkgs-array.md`. This guard would have caught BOTH the round-7 gap and this session's gap before tagging.

## Related

- `publish-all-pkgs-array.md` — the round-7 original (this is the recurrence).
- `cross-package-version-drift.md` — what happens downstream when a skipped sibling is a peer/optional dep of a published package.
- `tag-after-version-pr-merge.md` — sibling "release succeeds but ships nothing" failure mode.
