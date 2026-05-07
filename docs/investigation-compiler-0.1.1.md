# Investigation: @aihu/compiler 0.1.1 — three build-blocking bugs

**Topic:** mail-aihu-migration | **Date:** 2026-05-05 | **Investigator iteration:** 1

## Summary

All three bugs (A: bin name mismatch, B: `@scribe/*` imports in compiled output, C: missing `$beforeNavigate` lowering) share a single root cause: **the published `@aihu/compiler@0.1.1` tarball ships a stale, pre-rebrand Rust binary** (`bin/scribe-compile.exe`, mtime `2026-05-04 09:34:55`) that was built BEFORE both the `scribe → aihu` rebrand commit (`63215ed`, `2026-05-05 12:36`) AND the arch-5 M1 router primitives commit (`16fafa1`, `2026-05-05 15:20`) which introduced `$beforeNavigate`. The version bump (`d29d8e3`, `2026-05-05 18:02`) and `bun publish` ran `prepublishOnly: bun run build` which builds **only the JS glue via rolldown** — `prepublishOnly` does **not** rebuild the Rust binary. The `files: ["bin"]` array in `package.json` then packed whatever happened to be sitting in the developer's `bin/` worktree directory: a leftover `scribe-compile.exe` from a `cargo build --release` run made the day before the rename. The JS layer in `dist/index.js` is correct (post-rebrand, emits `@aihu/*` strings, references `bin/aihu-compile`). The mismatch is entirely in the binary file. Recommended fix is to **build a fresh `aihu-compile` binary from current HEAD**, drop it at `packages/compiler/bin/aihu-compile.exe` (and matching macOS/Linux assets), bump to `0.1.2`, **publish the v0.1.2 git tag first** so the GitHub Releases workflow uploads platform binaries, then `npm publish` from the same commit. The release workflow at `.github/workflows/release.yml` is correct and was simply never triggered for v0.1.1 (no `v0.1.1` tag exists; the GitHub Releases page is empty).

## Bug A — bin/scribe-compile.exe vs aihu-compile

### Reproduction

```
$ cd /tmp && npm pack @aihu/compiler@0.1.1
$ tar -xzf aihu-compiler-0.1.1.tgz
$ ls package/bin/
scribe-compile.exe
$ grep '"bin"' -A2 package/package.json
  "bin": {
    "aihu-compile": "./bin/aihu-compile"
  },
```

Concrete failure: npm reads `package.json` `bin` entries during install and tries to create the shim/symlink for `aihu-compile` pointing at `./bin/aihu-compile`. That path does not exist in the tarball. npm prints `npm warn ... bin 'bin/aihu-compile' does not exist`. The first invocation of the compiler from `dist/index.js` then `execFileSync`s `../bin/aihu-compile.exe` (resolved via `o=process.env.SCRIBE_COMPILE_BIN??r(n(i(import.meta.url)),`../bin/aihu-compile${a}`)` in the published `dist/index.js`, line 1) and crashes with `ENOENT`.

### Root cause

Two compounding facts:

1. **The Rust binary was renamed in the source on `2026-05-05 12:36`** at commit `63215ed` (squash merge of `22848b9` from `2026-05-04 22:32`):
   ```
   --- a/packages/compiler/Cargo.toml
   +++ b/packages/compiler/Cargo.toml
   -name = "scribe-compile"
   +name = "aihu-compile"
   ```
   So `cargo build --release` from HEAD now produces `target/release/aihu-compile.exe`.

2. **The version bump to 0.1.1 (`d29d8e3`, `2026-05-05 18:02`) ran `bun publish`, which executes `prepublishOnly: bun run build`. That `build` script is `rolldown -c` — it only rebuilds the JS bundle in `dist/`. It does not rebuild the Rust binary.** Whatever was already sitting at `packages/compiler/bin/` got packed by virtue of `files: ["bin"]`. The developer's worktree contained a leftover `bin/scribe-compile.exe` — the artifact of a `cargo build --release` run on `2026-05-04 09:34:55` (before the rename), which was never cleaned up.

Confirmed by binary string-extraction: the published `bin/scribe-compile.exe` contains the literal strings `'@scribe/runtime'`, `'@scribe/arbor'`, `'@scribe/signals'` (multiple variants) and contains **zero** strings matching `Navigate`, `useRoute`, `useRouter`, `MatchResult`. This binary was built before both the rebrand and before the router primitives commit landed.

There is also no `v0.1.1` git tag and no GitHub Release for v0.1.1 — the postinstall fallback in `js/postinstall.ts` strategy A (download from `releases/latest/download/aihu-compile-windows-x64.exe`) returns 404, falls through to strategy B (local `cargo build`) which fails on most consumer machines (no Rust toolchain), then silently exits 0 leaving `bin/aihu-compile.exe` absent. The leftover `bin/scribe-compile.exe` from the tarball is what consumers actually end up running, after the Builder's manual workaround `cp scribe-compile.exe aihu-compile.exe`.

### Recommended fix

Two complementary actions:

1. **Source fix (none required).** `Cargo.toml`, `package.json`, `js/postinstall.ts`, and `.github/workflows/release.yml` are all already correct at HEAD: the binary name is `aihu-compile`, the JS glue resolves `bin/aihu-compile${ext}`, and the release workflow stages `aihu-compile-windows-x64.exe` as the GitHub asset. No code change needed.

2. **Build/publish hygiene.** Either:
   - **(a)** Add a step to `prepublishOnly` that runs `cargo build --release` and copies `target/release/aihu-compile${ext}` to `bin/`. This makes the local-publish path produce a usable binary even on developer machines.
   - **(b)** Adopt a release-tag-then-publish convention (see "Recommended fix mechanic" below): create the `v0.1.2` git tag first, let `release.yml` upload all-platform binaries to the GitHub Release, **then** run `bun publish`. The postinstall script will then successfully fetch from `releases/latest/download/` on consumer machines, regardless of what's in `bin/`.

   Option (b) is preferred — the `bin/` directory in the tarball can stay empty (or be removed from the `files` array entirely) since postinstall handles binary acquisition. Shipping a Windows binary inside the tarball but leaving postinstall to fetch the macOS/Linux ones is asymmetric and fragile.

## Bug B — @scribe/* imports in compiled output

### Reproduction

In a project consuming `@aihu/compiler@0.1.1`, compile any `.aihu` file containing reactive primitives (`signal`, `computed`, etc.) plus DOM rendering. The compiler's stdout contains:

```js
import { branch, leaf, slot } from '@scribe/arbor'
import { signal } from '@scribe/signals'
import { /* ... */ } from '@scribe/runtime'
```

Vite then fails to resolve those module IDs unless `resolve.alias` is configured (which is the workaround the Builder applied at `c:\git\fellwork\mail\vite.config.ts`).

The Rust source HEAD emits the correct `@aihu/*` strings — confirmed via grep:
```
packages/compiler/src/codegen/emit.rs:678:    "import { branch, leaf, slot, each } from '@aihu/arbor'"
packages/compiler/src/codegen/emit.rs:687:    lines.push("import type { Signal } from '@aihu/signals'".to_string());
packages/compiler/src/codegen/emit.rs:725:    lines.push(format!("import {{ {} }} from '@aihu/runtime'", rt_items.join(", ")));
```

Zero matches for `@scribe/` in `packages/compiler/src/`. So source is clean.

But running `tr -c '[:print:]' '\n' < packages/compiler/bin/scribe-compile.exe | grep '@scribe/'` returns:
```
import { branch, leaf, slot } from '@scribe/arbor'
import { branch, leaf, slot, each } from '@scribe/arbor'
import type { Signal } from '@scribe/signals'
import { computed } from '@scribe/signals'
import { effect } from '@scribe/signals'
import { signal } from '@scribe/signals'
import { signal, effect } from '@scribe/signals'
import { ... } from '@scribe/runtime'
```

These strings are baked into the **shipped binary itself**, not the JS glue (which uses `@aihu/*` correctly).

### Root cause

Same as Bug A: the published `bin/scribe-compile.exe` was compiled from pre-rebrand Rust source. At that point `emit.rs` had `'@scribe/runtime'`, `'@scribe/arbor'`, `'@scribe/signals'` literals (string-coded into the binary's `.rdata` section). The rebrand commit `63215ed` rewrote those literals to `'@aihu/*'`, but the binary in the dev's worktree was never rebuilt before publish.

There is no "build-time substitution" or codemod — the strings are static `&'static str` constants in Rust. Recompiling against current HEAD produces a binary with `@aihu/*` strings (verified: `packages/compiler/target/release/aihu-compile.exe` mtime `2026-05-04 22:29:46`, contains `@aihu/*` strings, zero `@scribe/*` strings).

### Recommended fix

Same fix as Bug A. There is no source change required; rebuilding the binary from current HEAD eliminates Bug B atomically with Bug A. Once a fresh `aihu-compile.exe` is in place (either inside the tarball or downloadable from a v0.1.2 GitHub Release), the consumer can drop the `vite.config.ts` `resolve.alias` workaround.

## Bug C — $beforeNavigate lowering

### Reproduction

In `c:\git\fellwork\mail\src\pages\calendar.aihu` (and other auth-guarded pages), the source contains:

```
$beforeNavigate((to, from, next) => {
  if (!session) return next('/login')
  next()
})
```

When the published `bin/scribe-compile.exe` processes this, the output is invalid JS — the macro body lands outside the component's `defineComponent` callback. Rollup rejects it at parse time on the trailing orphan `})`. The Builder cited `pages/calendar.aihu` line 51 as the failure site.

The Rust source HEAD has correct `$beforeNavigate` parser support (`packages/compiler/src/parser/state_macros.rs:163-188` — `if let Some(after_kw) = rest.strip_prefix("beforeNavigate")`) and codegen (`packages/compiler/src/codegen/emit.rs:340, 576` — `StateMacro::BeforeNavigate { expr } =>` arms). Tests exist at `packages/compiler/tests/route_macros.rs` and `tests/parser/route-macros.test.ts`.

### Root cause

The `$beforeNavigate` / `$afterNavigate` / `$route` / `<$router>` / `<$navigate>` primitives all landed at commit `16fafa1` ("feat(router,compiler): arch-5 M1 routing primitives", `2026-05-05 15:20:24 -0400`). The shipped binary is from `2026-05-04 09:34:55` — over 24 hours BEFORE that commit. So the binary's parser literally has **no knowledge of the `$beforeNavigate` token**.

Confirmed by binary string-extraction: `tr -c '[:print:]' '\n' < bin/scribe-compile.exe | grep -E 'Navigate|useRoute|MatchResult'` returns zero lines. The strings the parser would compare against (`"beforeNavigate"`, `"afterNavigate"`, `"route"`, etc. in `state_macros.rs`) are not in this binary.

Since the parser doesn't recognise `$beforeNavigate`, the most likely behaviour is that it falls through to the generic `$<identifier>(...)` path (e.g. treating it like a `$action` / `$effect` / unknown call) and emits the body as a top-level statement OUTSIDE the component callback. The resulting JS has dangling parens that rollup rejects. The Builder's report of "trailing `})` at line 51" matches this hypothesis exactly.

This is not a "lowering bug" in the literal sense — there is no buggy lowering path to fix. The macro is **wholly absent** from the published binary's parser and codegen. The HEAD source already implements correct lowering; rebuilding the binary makes the bug go away.

### Recommended fix

Same fix as Bug A and Bug B. No source change required. Rebuild the binary from HEAD and republish. There is no point hot-patching `state_macros.rs` because the file is already correct.

## Cross-cutting findings

I packed and inspected `@aihu/runtime@0.1.1`, `@aihu/arbor@0.1.1`, `@aihu/signals@0.1.1`, `@aihu/router@0.1.1`, and `@aihu/app@0.1.1`. None of them contain `@scribe/` references in any `.js`, `.d.ts`, `.cjs`, or `.json` file. **Only `@aihu/compiler@0.1.1` ships a stale binary**, because only the compiler ships a Rust binary that isn't rebuilt by `prepublishOnly`. The rolldown-built JS dist of the other packages was correctly regenerated at publish time.

So this is **scoped to one package**. There is no fleet-wide rebuild needed.

The systemic gap is in the publish workflow:

1. **`prepublishOnly: bun run build` rebuilds JS but not Rust.** This is the load-bearing assumption that broke. For a package whose primary artifact is a Rust binary, the prepublish hook needs to invoke `cargo build --release` (and copy the resulting binary into `bin/`) — OR — the `bin/` directory needs to be excluded from the `files` allowlist and exclusively populated by `js/postinstall.ts` at consumer install time, with a real GitHub Release providing the binaries.

2. **`bun publish` was run without first creating a `v0.1.1` git tag.** The `release.yml` workflow only fires on `push: tags: 'v*'`. So no GitHub Release was created, no platform binaries were uploaded, and the postinstall fallback has nothing to download. The `0.1.0 → 0.1.1` bump commit (`d29d8e3`) was made and `bun publish` ran from the developer's machine without going through the tag-driven release pipeline.

3. **There's no postpublish/CI sanity check that the published tarball's binary matches the source.** A simple smoke test like "build the example with the published tarball, fail if it errors" would have caught this.

## Recommended fix mechanic

**Bump to `@aihu/compiler@0.1.2` and re-publish via the tag pipeline.**

Concrete steps (NOT applied — per Iron Law, this report is read-only):

1. From a clean checkout of `main` at HEAD:
   ```bash
   cd packages/compiler
   cargo build --release
   cp target/release/aihu-compile.exe bin/aihu-compile.exe   # or platform-equivalent
   ```
   *Or, preferably, leave `bin/` empty and trust the postinstall fetch path.*

2. Bump version: `packages/compiler/package.json` → `"version": "0.1.2"`. Optional: bump README autogen stamp.

3. Commit, push, **create and push the `v0.1.2` git tag**. This triggers `release.yml` which runs `cargo build --release` on macOS-arm64, macOS-x64, Linux-x64, and Windows-x64, uploads each as a release asset with SHA256 sidecars.

4. After the GitHub Release is up, run `bun publish` (or `npm publish`) from `packages/compiler/`. Since `prepublishOnly: bun run build` only rebuilds JS, no risk of stale binary contamination — and consumers' postinstall step will fetch the freshly-uploaded platform binaries from GitHub Releases with SHA256 verification.

5. Optional but recommended: add a `prepublishOnly` step that **fails if `bin/scribe-compile*` exists**, to prevent regression.

6. Optional: bump dependent `@aihu/*` packages to `0.1.2` for consistency, but they don't strictly need it — only `@aihu/compiler` was broken.

Risk if instead a manual hotfix is attempted (e.g. directly publishing 0.1.2 without the tag pipeline): if the developer's machine has the same leftover `bin/scribe-compile.exe`, the bug recurs. The tag pipeline is the safer mechanic because it builds binaries in CI from a clean checkout, guaranteeing source-binary alignment.

## What I did NOT do (per Iron Law)

- No source files modified in `c:\git\fellwork\aihu\` or anywhere else.
- No commits, no pushes, no tags created.
- No `bun publish` or `npm publish` run.
- No `cargo build` run that writes outside `target/` (no rebuilds of `bin/`).
- No `package.json` version bumps.
- No removal of the `vite.config.ts` workaround in the mail repo.
- No deletion of the stale `packages/compiler/bin/scribe-compile.exe` (it is the evidence — the next-dispatch executor will need it for verification).

This investigation is purely read-only. All findings are reproducible from the current state of `c:\git\fellwork\aihu\` (commit-tip `9a8a926`) and the published `@aihu/compiler@0.1.1` tarball on the npm registry.
