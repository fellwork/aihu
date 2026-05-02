# build-manifest-server-native.md

**Track:** Server-Native (v0+M)
**Session:** server-native-session-001
**Builder:** Claude (Opus 4.7), 2026-05-02
**Branch:** `feat/v1-server-native` (off `main` at `b5692a4`)
**Spec:** `.team/v1/spec-server-native.md` (locked)

---

## §1 Files created

### Rust crate (`packages/server/src-native/`)

| Path | Summary |
|------|---------|
| `Cargo.toml` | napi-rs cdylib package; serde_json with `preserve_order` (per OQ-SN-1 — no `indexmap` dep); release profile with `lto=thin`, `strip=symbols`. |
| `Cargo.lock` | (excluded by `.gitignore` — generated on build) |
| `build.rs` | Calls `napi_build::setup()` for the linker flag generation napi-rs needs. |
| `.gitignore` | Ignores `target/`, `*.node`, `Cargo.lock`. |
| `src/lib.rs` | `#[napi]` exports: `render_tree(tree_json, hydratable)` and `render_document(tree_json, head_json, hydratable)`. Maps Rust `Result<String, String>` to napi `Error` on parse failure. |
| `src/escape.rs` | `escape_attr(&str) -> String`. Single-pass `&` → `&amp;`, `"` → `&quot;`. Byte-identical to `ssr.ts:110-112`. Includes 6 unit tests. |
| `src/render.rs` | `render_tree_string`, `render_document_string`, `build_head`. Uses permissive `serde_json::Value` walker to mirror JS duck-typing exactly (kind check, default tag='div', insertion-order attrs via `preserve_order`, leaf text NOT escaped, hydratable path injection). 15 unit tests covering all branches. |

### JS loader (`packages/server/src/`)

| Path | Summary |
|------|---------|
| `loader.ts` | Three-state loader (`native-loaded`, `edge-skipped`, `unsupported-platform`, `native-failed-loud`). Exports `renderToString` matching ssr.ts signature. Hard fall-throughs to TS for `serializer`, `contextSetup`, `{ toHtml() }` providers, edge runtime, missing platform package. `SCRIBE_FORCE_NATIVE=1` promotes missing-binary to thrown `ScribeNativeError` (CI parity gate signal). Corrupt-binary errors are always loud. Exports `_getLoaderStateKind`/`_resetLoaderState` for the parity-test harness only. |
| `index.ts` (modified) | Line 8 split: `renderToString` now from `./loader.ts`; `renderToStream` and `_setContextFns` still from `./ssr.ts`. All other exports unchanged. |

### Tests (`packages/server/tests/`)

| Path | Summary |
|------|---------|
| `native-parity.test.ts` | 306 lines. 8 named samples (S1-S8 from spec §4.3) tested as both fragment and full-document renders; 2 fast-check property tests (200 + 100 random trees); edge-runtime detection unit test (AC-11); SCRIBE_NATIVE_SKIP env test; JS-fall-through correctness tests (`{ toHtml() }`, serializer, factory throw). All gated by `nativeLoaded` flag from `beforeAll`. Skips silently when native is not loaded. |

### Platform packages (`packages/server/npm/`)

| Path | Summary |
|------|---------|
| `.gitignore` | Ignores `*.node` (binary added by CI publish job, not committed). |
| `darwin-arm64/package.json` | `@scribe/server-darwin-arm64@0.1.0`, `os:["darwin"]`, `cpu:["arm64"]`, `license:"MIT"`. |
| `darwin-x64/package.json` | `@scribe/server-darwin-x64@0.1.0`, `os:["darwin"]`, `cpu:["x64"]`, `license:"MIT"`. |
| `linux-x64-gnu/package.json` | `@scribe/server-linux-x64-gnu@0.1.0`, `os:["linux"]`, `cpu:["x64"]`, `libc:["glibc"]`, `license:"MIT"`. |
| `win32-x64-msvc/package.json` | `@scribe/server-win32-x64-msvc@0.1.0`, `os:["win32"]`, `cpu:["x64"]`, `license:"MIT"`. |

### Files modified

| Path | Change |
|------|--------|
| `packages/server/package.json` | Added `optionalDependencies` block with all four platform packages pinned at `0.1.0`. |
| `packages/server/src/index.ts` | Line 8 split (renderToString from loader.ts). |
| `packages/server/rolldown.config.ts` | Added `node:module` and the four `@scribe/server-<platform>` packages to `external` list so they are not bundled. |
| `.github/workflows/release.yml` | Appended `build-native` (matrix: darwin-arm64, darwin-x64, linux-x64-gnu, win32-x64-msvc) and `publish-native` jobs. AC-15 comment block at line 117 documents the parity-gate paths (`packages/server/src/ssr.ts` and `packages/server/src-native/**`). |

### Build artifact (this manifest)

| Path | Summary |
|------|---------|
| `.team/v1/build-manifest-server-native.md` | This file. |

---

## §2 Files NOT modified (per spec §10)

Verified untouched:
- `packages/server/src/ssr.ts` — reference TS implementation.
- `packages/server/src/router.ts`, `middleware.ts`, `api.ts`, `data.ts`, `config.ts`, `types.ts`, `agent-readiness-config.ts`, `stream-types.ts`.
- `packages/server/tests/ssr.test.ts`, `tests/compliance/ssr-output.test.ts`, `tests/ssr-stream.test.ts`, all other existing tests.
- `packages/compiler/`, `packages/signals/`, `packages/arbor/`, `packages/runtime/`, `packages/agent/`, `packages/context/`, `packages/data/`.
- `.github/workflows/plan-a.yml`.

---

## §3 Open-question dispositions

| OQ | Decision (per Director/User locks) | Implementation |
|----|-----------------------------------|----------------|
| OQ-SN-1 | `serde_json` with `preserve_order` (no `indexmap`). | Cargo.toml line: `serde_json = { ..., features = ["alloc", "preserve_order"] }`. render.rs uses `serde_json::Map` directly. |
| OQ-SN-2 | Crate at `packages/server/src-native/`. | Confirmed. |
| OQ-SN-3 | Hydratable implemented but excluded from parity gate. | `render_value` honours `hydratable`; named samples + fast-check arbitraries do NOT toggle hydratable. Rust unit test covers it. |
| OQ-SN-4 | Wire npm publish for the 4 platform packages. | `publish-native` job in release.yml. (Main `@scribe/server` publish is OQ-SN-4 future work — not in this delivery.) |
| OQ-SN-7 | MIT license on each platform package. | `"license": "MIT"` in all four package.json files. |

---

## §4 AC self-check (compile-time + lint, not runtime)

Captured at branch tip on Windows 11 / rustc 1.87.0 / bun 1.x:

| AC | Command | Result |
|----|---------|--------|
| AC-1 | `cargo build --release --manifest-path packages/server/src-native/Cargo.toml` | **PASS** (exit 0; required `cargo update -p napi-build --precise 2.2.2` because newer napi-build needs rustc 1.88) |
| AC-3 | `bun run typecheck` (server only) | **PASS** — `server:typecheck` clean. (Other packages have pre-existing rootDir errors unrelated to this change.) |
| AC-4 | `grep -n "from './loader" packages/server/src/index.ts` | **PASS** — `8:export { renderToString } from './loader.ts'` |
| AC-5 | `bun run test` | **PASS** — 454 tests, 54 files, all green. Native-parity skips silently as designed (loader state `native-failed-loud` because no .node binary on this host). |
| AC-6 | `wc -l packages/server/tests/native-parity.test.ts` | **PASS** — 306 lines, ≥150 required. |
| AC-12 | `ls packages/server/npm/*/package.json` | **PASS** — 4 files. |
| AC-13 | `grep -A 6 optionalDependencies packages/server/package.json` | **PASS** — 4 entries pinned at 0.1.0. |
| AC-14 | `bun run build` | **PASS for server:build** (`rolldown` 668ms, no errors). `baselines:build` fails with "No rolldown.config configuration file found" — pre-existing, documented in spec dispatch as acceptable. |
| AC-15 | `grep -n "native-parity\|server-native" .github/workflows/release.yml` | **PASS** — comment block at line 117 documents the parity-gate trigger paths. |

Cargo unit tests (bonus): `cargo test --release` reports 21 passed / 0 failed. Confirms escape and render correctness against the named cases hardcoded into the test module.

---

## §5 Deferred to Verifier (need built `.node` binary)

| AC | Reason deferred |
|----|-----------------|
| AC-2 | Requires running `node -e "require('./server-native.<platform>.node')"` against a built binary on a build host. |
| AC-7 | Requires `SCRIBE_FORCE_NATIVE=1 bun test packages/server/tests/native-parity.test.ts` against a host with the addon resolvable from the loader's `createRequire`. |
| AC-8 | Subsumed by AC-7. |
| AC-9 | Requires renaming/removing the addon and re-running with `SCRIBE_FORCE_NATIVE=1` to assert the formatted error message body. |
| AC-10 | Requires `SCRIBE_NATIVE_SKIP=1 node -e "..."` against a built and installed `@scribe/server`. |
| AC-11 | Partially covered by `native-parity.test.ts` (mocks `EdgeRuntime` global and asserts `_getLoaderStateKind() === 'edge-skipped'`); full integration check needs the addon present so the bypass behaviour is observable end-to-end. |

---

## §6 Surface-to-user notes

- **napi-build pin:** rustc 1.87 (current toolchain) cannot build `napi-build@2.3.1` (needs 1.88). Pinned to `2.2.2` via `cargo update --precise`. CI runners using `dtolnay/rust-toolchain@stable` already get rustc ≥ 1.88 so they will pick up the unpinned latest. The pin is encoded in the lockfile only — Cargo.toml uses `version = "2"` per spec §6.2 verbatim.
- **Loader fall-through behaviour:** Per the dispatch brief and existing test compatibility, missing-binary errors fall through silently to TS by default; `SCRIBE_FORCE_NATIVE=1` is required to promote them to `ScribeNativeError`. This keeps all 454 existing tests green on developer machines without a built addon. AC-9's "throws on missing binary" assertion is therefore conditional on `SCRIBE_FORCE_NATIVE=1` — flagged for the Verifier.
- **`AttrValue`/typed `Node` enum:** Kept under `#[allow(dead_code)]` in `render.rs` for documentation purposes and as a starting point for any future typed-deserialization optimization. Active rendering uses the permissive `Value` walker for byte-exact JS duck-typing parity.

---

## §7 Verification commands (for Verifier)

On a supported platform, after `cargo build --release` the addon at `packages/server/src-native/target/release/{libscribe_server_native.dylib | .so | scribe_server_native.dll}` must be staged into `packages/server/npm/<platform>/server-native.<platform>.node` and the platform package symlinked or installed for `createRequire('@scribe/server-<platform>')` to resolve.

```bash
# 1. Build native
cargo build --release --manifest-path packages/server/src-native/Cargo.toml

# 2. Stage (Linux example)
cp packages/server/src-native/target/release/libscribe_server_native.so \
   packages/server/npm/linux-x64-gnu/server-native.linux-x64-gnu.node

# 3. Make resolvable (workspace link)
cd packages/server/npm/linux-x64-gnu && bun link && cd -
cd packages/server && bun link @scribe/server-linux-x64-gnu

# 4. Run parity gate
SCRIBE_FORCE_NATIVE=1 bun test packages/server/tests/native-parity.test.ts
```
