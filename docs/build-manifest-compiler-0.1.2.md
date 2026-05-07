# Build Manifest: @aihu/compiler 0.1.2

**Branch:** main (direct commit — see "Issues encountered" §1)
**Commit:** `7ed8bab` (`fix(compiler): rebuild bin against post-rebrand source; bump 0.1.2`)
**Tag pushed:** NONE — Step 4 BLOCKED on pre-push hook (`check:ci`) failure unrelated to this fix.
**GitHub Actions release.yml triggered:** NO — tag not pushed.

## Files modified

- `packages/compiler/package.json`
  - `"version": "0.1.0"` → `"version": "0.1.2"` (jumps over the on-disk-absent 0.1.1 — see Issues §3)
  - `"prepublishOnly": "bun run build"` → `"prepublishOnly": "bun run js/prepublish-guard.ts && bun run build"`
- `packages/compiler/bin/aihu-compile.exe` (rebuilt; **gitignored** — staged locally only, not committed; will be packed by `bun publish`)
- `packages/compiler/bin/scribe-compile.exe` (DELETED locally; was gitignored too, never tracked)
- `packages/compiler/js/prepublish-guard.ts` (new — fail-fast guard checks no `scribe-compile*` exists, `aihu-compile.exe` is present, and binary mtime newer than last `src/` commit)

Pre-commit hook `sync-readme.ts` auto-touched 24 README files + `scripts/__package-inventory.json`. Those updates were swept into the same commit `7ed8bab`. They are mechanical (compiler version 0.1.0 → 0.1.2 propagated into table rows). No manual review needed.

## Cargo build result

- **Command:** `cargo build --release` (run from `c:\git\fellwork\aihu\packages\compiler\`)
- **Exit code:** 0
- **Duration:** 5.01s
- **Binary path:** `c:\git\fellwork\aihu\packages\compiler\target\release\aihu-compile.exe`
- **Binary mtime:** 2026-05-05 20:49:11 (fresh, post-router-primitives commit `16fafa1` and post-rebrand commit `63215ed`)
- **Binary size:** 540,160 bytes
- **String content verification:**
  - `@scribe/` count: **0** (clean)
  - `@aihu/` count: **9** (post-rebrand)
  - `beforeNavigate` count: **3** (router primitives present)

Then copied to `packages/compiler/bin/aihu-compile.exe` after deleting the stale `bin/scribe-compile.exe`.

## Verify

- Old `bin/scribe-compile.exe` gone: **YES**
- New `bin/aihu-compile.exe` present: **YES** (mtime 2026-05-05 20:49:11)
- Version in `packages/compiler/package.json`: **0.1.2**
- `prepublishOnly` runs guard + build cleanly: **YES** (verified by running `bun run prepublishOnly` end-to-end — guard passed, rolldown emitted dist/index.js + .d.ts in 718ms)
- Other packages unchanged: **YES** — `agent`, `arbor`, `runtime`, `signals`, `router`, `app`, `cli`, `context`, `data`, `plugin`, `server`, `agent-readiness`, `agent-service`, `agent-a2a`, `agent-acp`, `adapter-cloudflare`, `adapter-vercel` all still at on-disk `0.1.0` (cli at `0.2.1`, vscode-aihu private at `1.0.0`). Only `compiler` was bumped.
- Cross-package compiler refs: only `packages/app/package.json` references `@aihu/compiler` and uses `"workspace:*"` — auto-resolves at publish time, no version pin to update.

## Next steps for user (handoff)

### IMMEDIATE: unblock Step 4 (tag + push)

The compiler fix commit `7ed8bab` is on local `main` but **NOT pushed**. The pre-push hook (`check:ci` → `bunx biome ci .`) fails because:

- `biome.json` schema pins `2.4.13`; installed CLI is `2.4.14` (auto-bumped via `^2.4.13`).
- Many pre-existing lint/style warnings across `packages/adapter-vercel/src/index.ts`, `fwp-smoke.mjs`, etc.

Neither issue is caused by this fix. The previous commit `f11c7d6` was either pushed before biome 2.4.14 dropped or pushed with `--no-verify`. To proceed, choose one:

**Option A (fastest, follows your earlier session pattern):**
```bash
cd c:\git\fellwork\aihu
git push origin main --no-verify
git tag v0.1.2
git push origin v0.1.2
```

**Option B (clean main):** revert my direct commit, redo as a PR through `feat/*` branch + squash-merge. The fix is small (40 lines + version bump) — easy to recreate.

**Option C:** fix biome drift first (`bun add -D @biomejs/biome@2.4.14` + bump biome.json schema reference), commit/push that as a chore, then return to push the compiler fix.

### Once tag is pushed

1. Wait ~5 min for `release.yml` to build all-platform `aihu-compile-*` binaries and the WASM bundle, then create a GitHub Release tagged `v0.1.2` with all assets uploaded.
   - Watch: https://github.com/fellwork/aihu/actions
2. Once Releases page has the platform binaries:
   ```bash
   cd c:\git\fellwork\aihu\packages\compiler
   bun publish
   ```
   - The `prepublishOnly` chain will run the new guard (passes — binary is fresh) then rolldown.
   - Note: my local `packages/compiler/bin/aihu-compile.exe` will be packed into the tarball. macOS/Linux consumers will fetch their platform binaries via `js/postinstall.ts` from the GitHub Release.
3. After successful npm publish, signal Team Lead so the mail-side downstream Builder can proceed (bump `@aihu/compiler` dep in mail repo's `package.json` to `^0.1.2`, `npm install`, retry `npm run build`, and finally remove the `resolve.alias` workaround in `mail/vite.config.ts`).

## Issues encountered

### 1. SURFACE: direct commit to `main` against feature-branch convention

Recent main commits are squash-merged from feature branches (`#92`, `#91`, `#90`, ...). My commit `7ed8bab` was made directly on local `main`. Per dispatch: "verify with `git log` first." Recent pattern is feature-branch + PR. The dispatch noted "user has been comfortable with master commits in earlier work in this session" — I took that as license but flag it here for explicit user confirmation. If the user prefers PR, see Next-steps Option B.

### 2. SURFACE: pre-push hook failure (BLOCKED)

`bun run check:ci` runs full biome ci + typecheck + tests + build + size + check-size-rows. The biome step fails on:
- biome.json schema version mismatch (config 2.4.13 vs CLI 2.4.14) — env drift, unrelated to this fix
- pre-existing template-literal-style warnings in unrelated files

Per `c:/git/fellwork/api/CLAUDE.md` rule "Never skip hooks (--no-verify) unless the user has explicitly asked for it," I did NOT push. User decision required (see Next-steps).

### 3. SURFACE: on-disk `0.1.0` vs published `0.1.1` divergence

Dispatch instructed: "`'version': '0.1.1'` → `'version': '0.1.2'`" — but on-disk `package.json` showed `0.1.0`, NOT 0.1.1. Investigation:
- Commit `d29d8e3` ("chore: bump aihu packages 0.1.0 → 0.1.1", 2026-05-05 18:02) bumped all 18 `@aihu/*` packages to 0.1.1. That commit was on `main`, then `main` was reset back via `HEAD~1` (visible in reflog `HEAD@{50}`, `HEAD@{51}`, `refs/heads/main@{11}`).
- npm registry kept `@aihu/compiler@0.1.1` (the publish was already done from the now-reverted commit).
- So the on-disk-vs-registry divergence is `0.1.0 < 0.1.1` for ALL `@aihu/*` packages, not just compiler. I bumped only compiler `0.1.0 → 0.1.2` per dispatch's explicit "No other package versions change." Other packages still appear at 0.1.0 on disk; their published 0.1.1 is undisturbed. This may surface as an oddity in changesets / future bumps.

### 4. SURFACE: tag pattern interpretation

Dispatch asked me to read `release.yml` to pick exact tag pattern. The workflow triggers on `v*`. Existing tags use plain semver (`v0.1.0`, `v0.2.0`, `v0.2.1`). I plan to push `v0.1.2` — but `v0.1.2 < v0.2.1` (the latest existing tag). The aihu repo treats tags as workspace-wide (single tag, all packages), so jumping back numerically is semantically odd. Two interpretations:

- **A (Investigator's recommendation):** push `v0.1.2` because that's the compiler's version. The release.yml builds binaries against the tagged commit regardless of tag value.
- **B (consistency with existing pattern):** push `v0.2.2` so tag monotonicity holds.

I lean A per the Investigator + dispatch (you), but flag the choice. Either tag triggers the same workflow and produces the same binaries for the same commit. Tag value matters for: (a) Release page title shown to users, (b) `releases/latest/download/` redirect uses chronological-latest not numerically-latest so unaffected.

The `release.yml` `publish-packages` job runs `bun run release` (= `changeset publish`), which only publishes packages with version mismatches between npm and disk. Since I bumped only compiler, only compiler's 0.1.2 publish would fire. **However**, since changesets respects pending `.changeset/*.md` files and there are none for compiler, `changeset publish` is likely a no-op. The user's manual `bun publish` in `packages/compiler/` is therefore the actual publish path. The tag's real value is to fire the **binary build + GitHub Release** so postinstall consumers can fetch platform binaries.

### 5. INFO: prepublish-guard scope

Per dispatch, I picked option (b) "fail-fast guard." The guard checks: (1) no `scribe-compile*` files exist, (2) `aihu-compile.exe` (or no-ext on POSIX) is present, (3) binary mtime > last `src/` commit. It uses `execFileSync` (not `exec`) per the codebase's security hook reminder. Live-tested by running `bun run prepublishOnly` — guard passed, build emitted dist/. Guard is NOT in the npm tarball's `files` list (intentional — only used at publish time, not consumer install).

## Iteration count

Dispatch round 1 of 1 (this is a Mode-3 focused defect fix, single-shot).

## STATUS: BLOCKED at Step 4 (push + tag) on environment-drift pre-push hook failure.

Cargo build (Step 1), prepublish guard wiring (Step 2), and version bump + commit (Step 3) all completed cleanly. The last mile (push + tag → GitHub Actions release pipeline) needs user decision on hook bypass / branch convention.
