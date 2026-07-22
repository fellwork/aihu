# Releasing aihu

> Workflow for cutting `@aihu/*` releases.

## Day-to-day: adding a changeset

Whenever a PR meaningfully changes a published package, add a changeset:

```bash
bun changeset
```

The interactive prompt asks:
1. Which packages changed?
2. Major / minor / patch for each?
3. Description (becomes the CHANGELOG entry).

The resulting `.changeset/<name>.md` file is committed in your PR.

### Bump-level rules

| Change | Bump |
|---|---|
| Breaking API change, removed export, behavior reversal | `major` |
| New API surface, new public type, additive | `minor` |
| Bug fix, internal refactor with no API impact, doc fix that affects npm tarball | `patch` |
| No published-package impact (examples/, docs/ outside packages, CI) | No changeset needed |

### Skip the changeset when

- Touching only `examples/`, root `docs/`, `.github/`, `scripts/` — the changeset bot won't ask
- Touching only TypeScript types in non-published packages — but flag it in the PR description for sanity

## Cutting a release

1. **Open the Version PR** — happens automatically. Whenever changesets land on `main`, the `release-pr.yml` workflow opens (or updates) a PR titled `chore(release): version packages`. This PR:
   - Rewrites every affected `package.json` to the new version
   - Regenerates `CHANGELOG.md` per package
   - Deletes the consumed `.changeset/*.md` files
2. **Review the Version PR** — confirm the bumps look right. Edit the auto-generated CHANGELOG entries if needed (they're committed to the branch; just commit on top).
3. **Merge the Version PR** — merge it like other PRs. This lands the version
   bumps + CHANGELOGs on `main`. **It does NOT publish** — `release-pr.yml` has
   no publish step, so nothing reaches npm yet.
4. **Push the release tag — MANUAL.** Publishing is gated on a `v*` tag, and
   nothing creates that tag automatically. Pick the next aggregate tag (a repo
   release counter, independent of individual package versions — e.g. `v0.4.4`
   → `v0.4.5`) and push an annotated tag at the merged Version-PR commit:
   ```bash
   git checkout main && git pull
   git tag -a v0.4.5 -m "Release v0.4.5"
   git push origin v0.4.5
   ```
   The tag **name** is only the GitHub Release marker — `release.yml` publishes
   each package at *its own `package.json` version*, not the tag name.
5. **`release.yml` fires** — the `v*` tag triggers the build matrix (5 platform
   binaries + WASM) and the `publish-packages` job (npm publish with workspace
   dep rewrites).
6. **Verify on npm** — `npm view @aihu/signals versions --json` shows the new
   version within ~3 minutes of the tag push.

> **Why manual?** Auto-publishing on every Version-PR merge is deliberately
> avoided so release timing stays under maintainer control (e.g. batching, or
> holding the v1.0.0 narrative tag under Path B). To make tagging automatic
> instead, add a publish/tag step to `release-pr.yml` — tracked as a follow-up.

## Canary (snapshot) releases

To let a consumer (e.g. fellwork/web) pin unreleased `main` without cutting a
stable release, publish a **canary snapshot**: every non-ignored `@aihu/*`
package at version `0.0.0-canary-<shortsha>`, published under the `canary` npm
dist-tag. `latest` is untouched, so ordinary installs are unaffected. Snapshot
versions are ephemeral — nothing is committed, no git tag, no GitHub Release;
pending `.changeset/*.md` files stay in place for the next stable release.

```bash
# Dry-run (DEFAULT — build + pack + validate, no npm write):
gh workflow run release.yml -f canary=true

# LIVE canary publish (explicit opt-in):
gh workflow run release.yml -f canary=true -f dry_run=false
```

Both run the full binary matrix (5 compiler platforms, WASM, server + css-engine
natives) at the tip of `main`, then:

1. Each publish job writes an ephemeral catch-all changeset
   (`scripts/canary-catchall-changeset.ts` — covers every publishable
   `packages/*` package, so the snapshot isn't limited to packages with
   pending changesets) and runs `changeset version --snapshot canary` —
   deterministic `0.0.0-canary-<sha>` for every package
   (`.changeset/config.json` `snapshot.prereleaseTemplate: "{tag}-{commit}"`
   keys the suffix to the commit, so all jobs agree without coordination).
2. `scripts/stamp-platform-snapshot.ts` syncs the native platform packages
   (`packages/{compiler,server,css-engine}/npm/*` — not workspace members, so
   changesets never sees them) and the hosts' `optionalDependencies` pins to
   the same snapshot version.
3. `scripts/publish-all.sh --tag canary` (JS packages) and the platform-package
   jobs publish with `npm publish --tag canary` — plus `--dry-run` unless
   `dry_run=false`.

Consume it with:

```bash
npm install @aihu/app@canary                # moving canary pointer
npm install @aihu/app@0.0.0-canary-abc1234  # exact snapshot pin
```

Note: the `packages/_moved/*` legacy-name stubs are excluded from the
catch-all (frozen at their 1.x stable versions; the live publish's idempotency
check skips them). The compiler `postinstall`
GitHub-release fallback still points at the latest stable Release assets;
canary consumers get canary binaries via the `@aihu/compiler-<platform>`
optionalDependencies path, which is the primary resolution route.

## Pre-release channels (alpha / beta / rc)

For unstable releases pre-v1.1 GA:

```bash
# Enter pre mode for the alpha channel (or beta, rc, next)
bun changeset pre enter alpha

# Add changesets as normal during pre mode
bun changeset

# Version PR will produce e.g. 0.2.0-alpha.0, 0.2.0-alpha.1, ...

# When ready to graduate:
bun changeset pre exit
# Next Version PR produces 0.2.0
```

The `pre.json` file in `.changeset/` tracks pre mode state. It's committed.

## Hotfix releases

For a hotfix on a published version when `main` has unrelated WIP:

```bash
git checkout v0.1.0
git checkout -b hotfix/v0.1.x

# Cherry-pick fix commits...

bun changeset add  # patch bump

git push origin hotfix/v0.1.x
# Open PR targeting hotfix/v0.1.x branch (not main).
# Merge the PR, then merge a Version PR off hotfix/v0.1.x.
```

The `release.yml` is keyed on `v*` tags regardless of source branch, so a `v0.1.1` tag from `hotfix/v0.1.x` publishes correctly.

## One-time admin setup (run once per repo lifetime)

### Install Changeset Bot

The Changeset Bot comments on PRs that should add a changeset but haven't. Install at <https://github.com/apps/changeset-bot> and grant access to `fellwork/aihu`.

### Apply branch protection

```bash
bash scripts/setup-branch-protection.sh
```

Requires `gh` CLI authenticated as a repo admin. Idempotent.

### NPM_TOKEN secret

Generate a publish token at <https://www.npmjs.com/settings/{user}/tokens>:
- Type: **Granular Access Token** scoped to `@aihu` org with `Read and write` on packages, AND with "Allow this token to bypass two-factor authentication" enabled
- OR Classic with type **Automation** (bypasses 2FA by design)

Add the token as `NPM_TOKEN` repo secret at <https://github.com/fellwork/aihu/settings/secrets/actions>.

Account 2FA mode must be **Authorization only** (not "Authorization and writes"), otherwise CI publishes will prompt for OTP.

## Conventional commits

Commit messages enforced by Husky's `commit-msg` hook (commitlint with `@commitlint/config-conventional`):

```
type(scope): subject
```

| Type | Example | Bumps |
|---|---|---|
| `feat` | `feat(signals): add untrack() utility` | minor |
| `fix` | `fix(arbor): keyed list reorder regression` | patch |
| `docs` | `docs(arch-5): clarify $route lifetimes` | none |
| `chore` | `chore(deps): bump vite to 5.4` | none |
| `refactor` | `refactor(compiler): extract @style lowering` | patch |
| `test` | `test(agent): cover registry reset` | none |
| `perf` | `perf(signals): batch dependency walk` | patch |
| `ci` | `ci: cache cargo target` | none |
| `revert` | `revert: feat(signals): add untrack()` | none |

Bump levels are still author-controlled via `bun changeset`; types here are about commit grammar.

## Troubleshooting

**Changeset Bot didn't comment on my PR.** Confirm the bot is installed on the repo. If it's installed but silent, check `.changeset/config.json` `baseBranch` is `main`.

**Version PR has wrong bumps.** Edit the changeset files in your feature PR before merge — once merged, they're consumed by the Version PR.

**`bun changeset publish` fails with `EOTP`.** The `NPM_TOKEN` secret is on a 2FA-required account. See "NPM_TOKEN secret" above for the bypass flags.

**Want to skip a release.** Don't merge the Version PR. New changesets accumulate; the Version PR updates with each landed change.
