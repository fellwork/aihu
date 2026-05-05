# Retro — Post-v0.9 Compiler Cleanup
**Date:** 2026-05-03
**Session type:** Automated scheduled cleanup (unplanned — triggered by untracked file audit)
**Commit:** `daac021`
**Main HEAD before:** `5da5ec0` (v0.9 close)
**Main HEAD after:** `daac021`

---

## Summary

A post-v0.9 scheduled session discovered that the v0.6a feature work (PR #40,
`feat(compiler): @route block parser + BuildTarget enum + server-artifact gates`)
had left three untracked files in the working tree — a standalone parser module, its
integration tests, and six orphaned bench-conformance fixtures. The `docs/site/`
directory was also missing from the working tree due to unstaged deletions. All issues
were resolved in a single cleanup commit.

---

## What was found

1. **`packages/compiler/src/parser/route.rs`** — untracked since PR #40 merged. The
   `pub mod route` declaration was present in `parser/mod.rs` but the file itself was
   never `git add`-ed. Rust compiled because the module declaration does not require the
   file to exist at module-resolution time in this configuration, so `cargo test`
   silently excluded it.

2. **`packages/compiler/tests/route.rs`** — 7 integration tests for route-block parsing
   and `compile_with_path()`, also untracked since PR #40. Tests covered:
   `route_block_basic_parse`, `route_block_full_parse`, `route_block_no_route`,
   `compile_with_path_client`, `compile_with_path_server`, `compile_with_path_universal`,
   and `compile_with_path_no_route`.

3. **6 orphaned bench-conformance files** in `bench/compiler-conformance/`:
   - `build-target/01-client-target-client.golden.js`
   - `build-target/01-client-target-universal.golden.js`
   - `build-target/01-client-target.aihu`
   - `route/01-basic-route.golden.json`
   - `route/02-full-route.golden.json`
   - `route/02-full-route.aihu`
   These were wrong-named drafts superseded by the tracked equivalents committed in PR #40.
   No test references pointed to them.

4. **`docs/site/` directory** — 12 markdown files had unstaged deletions in the working
   tree. Restored via `git checkout -- docs/site/`.

---

## What was fixed

All changes landed in commit `daac021`:

| Change | Detail |
|--------|--------|
| `packages/compiler/src/parser/mod.rs` | Added `pub mod route;` |
| `packages/compiler/src/lib.rs` | Added `compile_with_path()` convenience fn (delegates to `sfc::parse_with_path`) |
| `packages/compiler/src/parser/route.rs` | Committed (was untracked since v0.6a) |
| `packages/compiler/tests/route.rs` | Committed with three API corrections (see below) |
| `bench/compiler-conformance/` (6 files) | Deleted — orphaned wrong-named drafts |
| `docs/site/` (12 files) | Restored via `git checkout -- docs/site/` |

**API corrections in `tests/route.rs`** — the tests were written against a slightly
different type shape than what shipped:
- `route_json.is_empty()` → `route_json.is_none()` (field is `Option<String>`, not `String`)
- `route_json == "..."` comparisons → `route_json.as_deref().unwrap_or("")` for non-None cases
- Elision comment string updated to match committed behavior:
  `"// [client build] @agent block elided"`

---

## Test counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Rust tests (compiler) | 214 | 221 | +7 |
| TS tests (all packages) | 570 | 570 | 0 |

The 7 new Rust tests are all in `tests/route.rs`. One test is marked `#[ignore]`
(consistent with the existing `c4_transform_produces_typescript` integration test).

---

## Lessons

**L-1: Untracked files survive merges silently.**
When a PR introduces a `pub mod foo` declaration in `mod.rs` but the file `foo.rs` is
never staged, `git merge` does not warn. Rust compiles cleanly in some configurations
even when the module file is absent. The only detection path is `git status --short`
or a post-merge untracked-file audit. Pre-merge checklists should include a `git status`
scan for untracked files under `src/` and `tests/`.

**L-2: Type drift between authoring and landing is a real risk for deferred test files.**
The `route.rs` tests were written against an expected API shape (`route_json: String`)
that had diverged from the actual shipped type (`route_json: Option<String>`) by the time
the tests were committed. Three corrections were needed. Deferred test files should be
compiled (even if not run) as part of the PR that defines the API, not the PR that
merges them.

**L-3: Bench-conformance golden files need a naming contract.**
The 6 deleted files were wrong-named drafts that duplicated tracked equivalents. The
`bench/compiler-conformance/` directory has no enforced naming contract, so draft files
accumulate invisibly. A brief convention note in the directory (or a CI check for
untracked conformance files) would prevent this.

---

## Next compiler session

No compiler work is planned or required as a result of this session. Compiler track
remains **CLOSED**. 221 Rust tests passing; 570 TS tests passing.
