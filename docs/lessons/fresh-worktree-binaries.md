# Lesson candidate: fresh-worktree pre-push failures are the missing-Rust-binary issue â€” BUILD, don't --no-verify

**Observed (r1 campaign):** Two Builders working in fresh git worktrees hit the SAME pre-push failure â€” 8 `packages/css-engine` tests fail because the worktree has no built Rust binaries and the stale GitHub-Releases `packages/compiler/bin/aihu-compile.exe` predates `--ast-json`, so `packages/compiler/js/index.ts:481` `JSON.parse` gets JS source and throws.

- **Bug 6 Builder (correct):** built `aihu-css-core` + `aihu-compiler` from source (gitignored artifacts only) â†’ full suite 1306/1312 â†’ pushed cleanly, no bypass.
- **Bug 4 Builder (shortcut):** mis-attributed the failures to "sibling agents' in-flight AST-export work" (FALSE â€” Plan 3 AST hook is merged to main; the in-flight Stream B/C touch cross-block diagnostics, not js/index.ts:481) and pushed with `--no-verify`.

**Why the mis-attribution is wrong & the fix is still sound:** the failures reproduce with the Bug 4 config reverted; css-engine has no `@aihu/server` dep; main's GitHub "Plan A" CI is green (it builds binaries per the r11 check-job fix). So it's purely environmental.

**Rule for future briefs:** When the pre-push hook fails on css-engine binary/`JSON.parse`/`--ast-json` errors in a fresh worktree, BUILD the Rust binaries from source â€” do NOT `--no-verify`. Tell Builders this in the brief. `--no-verify` is never the right call for an environmental gate failure; build the binaries or surface to Team Lead. (Relates to the existing lesson "css-engine e2e needs Rust binaries built from source in the CI check job.")

**Landing note:** Bug 4's PR CI builds binaries, so it will gate properly despite the local --no-verify push.
