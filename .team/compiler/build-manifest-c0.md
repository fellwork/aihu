# Build Manifest — Phase C-0
**Date:** 2026-04-30
**Phase:** C-0
**Branch:** feat/compiler-c0
**Commit:** 3919bdb — "feat(compiler): Phase C-0 — scaffold + SFC block splitter"
**Team Lead verification:** INDEPENDENTLY CONFIRMED — cargo test 6/6, clippy clean, fmt clean, toolchain pins verified

## Files created
- .prototools (modified: added rust = "1.87.0")
- rust-toolchain.toml (new)
- packages/compiler/Cargo.toml (new)
- packages/compiler/Cargo.lock (new)
- packages/compiler/src/lib.rs (new)
- packages/compiler/src/types.rs (new)
- packages/compiler/src/parser/mod.rs (new)
- packages/compiler/src/parser/sfc.rs (new)
- packages/compiler/tests/sfc_split.rs (new)
- packages/compiler/tests/snapshots/sfc_split__split_valid_full.snap (new)
- packages/compiler/tests/snapshots/sfc_split__split_missing_template.snap (new)
- packages/compiler/tests/snapshots/sfc_split__split_missing_script.snap (new)
- packages/compiler/tests/snapshots/sfc_split__split_extra_whitespace.snap (new)
- packages/compiler/tests/snapshots/sfc_split__split_style_only.snap (new)

## Test results
```
running 6 tests
test compile_empty_source ... ok
test split_missing_template ... ok
test split_extra_whitespace ... ok
test split_style_only ... ok
test split_valid_full ... ok
test split_missing_script ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

## Clippy result
PASS — `cargo clippy -- -D warnings` exits 0 with no warnings.

## Fmt result
PASS — `cargo fmt --check` exits 0.

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| C0-1 | `packages/compiler/Cargo.toml` with `name = "aihu-compiler"`, `edition = "2021"` | PASS |
| C0-2 | `.prototools` contains `rust = "1.87.0"` | PASS |
| C0-3 | `rust-toolchain.toml` at repo root with `channel = "1.87.0"` | PASS |
| C0-4 | `cargo test` exits 0 | PASS — 6/6 tests pass |
| C0-5 | All 5 named snapshot functions present | PASS |
| C0-6 | Snapshot `.snap` files committed | PASS — 5 snap files committed |
| C0-7 | `cargo clippy -- -D warnings` exits 0 | PASS |
| C0-8 | `cargo fmt --check` exits 0 | PASS |
| C0-9 | No files outside `packages/compiler/`, `.prototools`, `rust-toolchain.toml` modified | PASS |
| C0-10 | `CompileError` implements `std::error::Error` | PASS — build passes |
| C0-11 | `compile("")` returns `Ok(AihuSource { script: None, template: None, style: None })` | PASS — `compile_empty_source` unit test |

## STATUS
DONE — 11/11 acceptance criteria passing.
