# After manually correcting versions on a Version PR, refresh and commit bun.lock — frozen-lockfile install will reject the mismatch

**Topic:** seo-ssr
**Session:** 2026-05-25 (the v0.4.14 failure)
**Category:** release-engineering, lockfile, ci
**Severity:** high (release workflow fails at the install step before publishing anything)

## Symptom

After hand-editing `package.json` versions on the changesets Version PR, the release workflow fails at the dependency-install step. `release.yml` runs `bun install --frozen-lockfile` and aborts because the lockfile no longer matches the manifests.

## Root cause

Manually correcting versions (see `changesets-pre-1.0-cascade.md`) edits `package.json` `version` fields and any internal version ranges — but does NOT regenerate `bun.lock`. A `--frozen-lockfile` install is, by design, allowed to make **zero** changes to the lockfile; any drift between manifests and lockfile is a hard error. So the very corrections that fix the version table break the frozen install.

## Fix / recipe

Immediately after manually correcting versions on the Version PR, **before tagging**:

1. Run `bun install` (NOT frozen) to regenerate `bun.lock` against the corrected manifests.
2. Commit the refreshed `bun.lock` onto the Version PR branch.
3. Re-run the local CI replay (`biome ci`, typecheck, test, build, size, check:size-rows) to confirm green.
4. THEN merge the Version PR and tag (per `tag-after-version-pr-merge.md`).

Make the lockfile refresh a non-optional step of the "correct the Version PR" recipe — the manual correction and the lockfile refresh are a single atomic operation.

## How it bit us

The v0.4.14 release failed in part because the pre-1.0 cascade correction edited versions without refreshing `bun.lock`; the `--frozen-lockfile` install in `release.yml` rejected the mismatch. Refreshing + committing the lockfile (alongside the `resolveBinary` fix — see `resolvebinary-executability-fallback.md`) cleared the path to the corrected v0.4.15 release.

## Related

- `changesets-pre-1.0-cascade.md` — the manual correction that necessitates the refresh.
- `tag-after-version-pr-merge.md` — the tag-timing the refreshed lockfile precedes.
- `resolvebinary-executability-fallback.md` — the other v0.4.14 failure cause (the lockfile refresh itself surfaced the placeholder-stub bug).
