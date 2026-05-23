# css-engine e2e needs Rust binaries built from source in the CI `check` job

**Topic:** aihu-v1-framework
**Round:** 11
**Category:** ci, css-engine, shared-infra
**Severity:** high (guaranteed CI red on a clean checkout; "works on my machine" — passes locally, fails in CI)

## The lesson

The css-engine e2e suites spawn **locally-built, gitignored Rust binaries**. Any CI job that runs `bun run test` against a css-engine package MUST build those binaries from source first, or the suite fails on a clean checkout. Specifically:

- `packages/css-engine/tests/e2e.test.ts` (Plan 1 / Track B) spawns **`aihu-css-compile`**, resolved by `resolveBinary()` in `packages/css-engine/src/index.ts` from the **workspace-root `target/release/`** (then `target/debug/`).
- `packages/css-engine/tests/sfc-e2e.test.ts` (Plan 2) calls `compileSfc` → `compileToAst` (`packages/compiler/js/index.ts`), which spawns **`aihu-compile --ast-json`**, resolved from **`packages/compiler/bin/`** (the postinstall location, `SCRIBE_COMPILE_BIN ?? ../bin/aihu-compile{ext}`) — NOT `target/release`.

On a clean checkout, `bun install` postinstall **downloads the published `latest` release `aihu-compile`** (was `v0.4.4`, predates the `--ast-json` hook), which silently emits TS instead of JSON → `JSON.parse` throws → both e2e suites fail. They only pass locally because of manually-built/copied fresh binaries.

## The required CI shape (the fix — commit `9bbdd05`)

In the `check` job of `.github/workflows/plan-a.yml`, **before** `bun run test`, mirroring the existing `examples`-job pattern but building BOTH binaries:

1. `cargo build --release` at the **workspace root** → emits both `target/release/aihu-compile` AND `target/release/aihu-css-compile`. (A workspace build does NOT use `packages/compiler/target/`; cache the root `target`, not the per-crate one.)
2. **Stage the fresh compiler binary**: `cp target/release/aihu-compile packages/compiler/bin/aihu-compile` (+ `chmod 0755`). `aihu-css-compile` needs no staging — `resolveBinary()` reads `target/release/` directly.
3. Set **`SCRIBE_SKIP_POSTINSTALL: "1"`** on the `bun install` step (confirmed env var at `packages/compiler/js/postinstall.ts:224`) so postinstall does NOT clobber the freshly staged binary with the stale download. Order it so the install step does not overwrite the staged binary.
4. (Recommended) `actions/cache@v4` on `~/.cargo/registry`, `~/.cargo/git`, and the root `target` keyed on `Cargo.lock`, so the cargo build doesn't materially slow CI.

The fix is `plan-a.yml`-only, 31 insertions, purely additive (no existing `check`-job step removed/reordered). After it, both e2e suites pass 8/8 (Track B's 3 + Plan 2's 5).

## Shared-infra constraint — applies to ANY css-engine package's e2e

This is **not Plan-2-specific**. Whichever css-engine work first reaches a `check`-job-running state on main carries this requirement. **The moment Track B (Plan 1) lands, the `check` job starts running `e2e.test.ts`, which needs `aihu-css-compile` built from source** — so the fix cannot be deferred past Track B. Cherry-pick commit `9bbdd05` onto Track B's PR at PR-prep time; Plan 2 (rebased onto merged A+B) inherits it. Track A is exempt (compiler-only, no css-engine e2e in `check`).

Future css-engine packages (Plans 3-6) that add e2e suites spawning these binaries inherit the same requirement — the `check` job already builds both, so no change is needed as long as the cargo-build + stage + `SCRIBE_SKIP_POSTINSTALL` steps stay in place.

## Root cause (already traced — no re-investigation needed)

Postinstall resolution order: (A) no-op if `bin/` or `target/release` present → (B) download `releases/latest/download/aihu-compile-windows-x64.exe` → (C) `cargo build --release` only if download fails. A `latest` release existed (`v0.4.4`) and was downloaded + probed by the r10 Verifier, confirming it ignores `--ast-json`. The `check` job had no cargo step. Full trace in verification report `c7b9f1e2-6c1d-4761-8c90-c3d61f81a6cd`; fix manifest `b92cb214-6cb9-497a-b8c2-8c141a202306`.

## Related

- `docs/lessons/compiler-grammar-needs-changeset.md` — the AST hook (`v1.0.10a`) that the `--ast-json` flag belongs to.
- `docs/lessons/verifier-needs-bash.md` — the Bash-capable Verifier that probed the published binary to find this defect.
