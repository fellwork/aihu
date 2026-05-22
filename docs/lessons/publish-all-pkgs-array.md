# publish-all.sh PKGS array completeness audit

**Topic:** aihu-v1-framework
**Round:** 7
**Category:** release-engineering, ci-lint
**Severity:** high (Release-PR claims success while silently skipping packages)

## The lesson

Whenever a new publishable package is added to the workspace, it MUST be added to `scripts/publish-all.sh`'s `PKGS` array. Otherwise Release-PRs will bump the package's `version` field in `package.json` (because changesets sees the changeset), but `publish-all.sh` will never call `npm publish` for it (because the bash loop only iterates the array). The Release-PR will appear to succeed.

## How it bit us this session

`@aihu/auth@0.1.0` shipped without being in the PKGS array. The first changeset bumped it to 0.1.1. Changesets generated the version commit. `publish-all.sh` ran and published every package in its array. `auth` was not in the array, so it was never pushed. The workflow exit code was 0. The deprecation pass at v1.0.x cleanup caught it ~3 days later.

Same root cause: `mcp`, `ai`, `scraping` were also absent. All four added in this session.

## The rule

Any PR that adds a new package directory under `packages/` where `package.json` has `"publishConfig": { "access": "public" }` MUST also add the package's directory name to the `PKGS` array in `scripts/publish-all.sh`.

## Detection

Add a CI lint that fails on drift between `packages/*/package.json` and the array:

```bash
# scripts/check-publish-array.sh
set -euo pipefail

declared=$(grep -oE '"@aihu/[^"]+"' scripts/publish-all.sh | sed 's|"@aihu/||; s|"||' | sort -u)
actual=$(for f in packages/*/package.json; do
  if jq -e '.publishConfig.access == "public"' "$f" >/dev/null 2>&1; then
    basename "$(dirname "$f")"
  fi
done | sort -u)

missing=$(comm -23 <(echo "$actual") <(echo "$declared"))
if [ -n "$missing" ]; then
  echo "ERROR: these public packages are missing from scripts/publish-all.sh PKGS array:"
  echo "$missing"
  exit 1
fi
```

Wire into `bun run check` and `.github/workflows/ci.yml`.

## Related

- Lesson: `cross-package-version-drift.md` (downstream symptom)
- Lesson: `release-pr-autogen-sync.md` (sibling class of Release-PR-quietly-lies bugs)
