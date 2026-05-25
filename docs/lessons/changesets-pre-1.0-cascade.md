# Pre-1.0 changesets cascade mis-projects dependents to 1.0.0 — inspect the Version-PR bump table before tagging

**Topic:** seo-ssr
**Session:** 2026-05-25 (v0.4.15 release)
**Category:** release-engineering, changesets
**Severity:** high (ships wrong major version; sweeps in UNCHANGED packages)

## Symptom

The changesets Version PR proposes a bump table where packages jump to **1.0.0** — including packages you never touched this session (e.g. `@aihu/adapter-vercel`, which had no source change at all). For a pre-1.0 (`0.x`) project this is almost always wrong: you intended a `0.x` minor, not a 1.0 major.

## Root cause

A `0.x` **minor** changeset on a package with internal dependents makes changesets cascade a bump to those dependents. Under semver's "in 0.x, minor is the breaking slot" interpretation, changesets can project the cascade as a **major** (`1.0.0`) on the dependents — and it cascades transitively, touching packages whose own source is unchanged. The bump is purely dependency-driven, not behavior-driven.

## Fix / recipe

ALWAYS inspect the Version-PR bump table **before tagging**. For each row:

1. **Correct anomalies to the intended `0.x` version.** This session: `@aihu/app` 1.0.0 → **0.2.0**, `@aihu/compiler` 1.0.0 → **0.5.0**, `@aihu/adapter-cloudflare` 1.0.0 → **0.1.10**.
2. **Revert spurious-cascade packages to `origin/main`.** A package with no real change should not publish at all — restore its `package.json` + `CHANGELOG.md` to main. This session: `@aihu/adapter-vercel` (and private `bench`/`cookbook` + the deprecated `_moved/agent-readiness` stub).
3. **Set brand-new packages to their initial version, not a bump.** A first publish is `0.1.0`, not whatever the PR auto-incremented to. This session: `language-server`/`drizzle` were PR-mis-set to 0.2.0 → corrected to **0.1.0**; `kindly-note` 0.3.0 → **0.2.0**.
4. **Fix CHANGELOG "Updated dependencies" refs** that quote the wrong version (e.g. `@aihu/app@1.0.0` → `0.2.0`). Internal deps using `workspace:*` need no range edit; only version-pinned ranges and CHANGELOG prose do.
5. **Verify no package ends at 1.0.0** (except any legitimately-1.0 marketplace artifact like `vscode-aihu`, which is changeset-ignored). A full `git diff origin/main` version sweep should match your intended table exactly.

After correcting versions you MUST refresh the lockfile — see `version-pr-correction-refresh-lockfile.md`.

## How it bit us

v0.4.14's Version PR projected `app`, `compiler`, `adapter-cloudflare`, AND the untouched `adapter-vercel` all to 1.0.0. Caught at the pre-tag inspection gate; corrected to the intended 0.x set (manifest: pre-1.0 cascade correction, branch `changeset-release/main`). v0.4.15 then shipped the corrected set.

## Related

- `version-pr-correction-refresh-lockfile.md` — the mandatory follow-up after manual version edits.
- `tag-after-version-pr-merge.md` — the other half of the tag-timing discipline.
- `cross-package-version-drift.md` — downstream symptom when a cascaded dependent is published against an unpublished sibling.
