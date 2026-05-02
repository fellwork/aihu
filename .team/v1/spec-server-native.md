# spec-server-native.md

**Track:** Server-Native
**Session:** server-native-session-001
**Author:** Architect agent
**Date:** 2026-05-02
**Status:** READY FOR USER REVIEW — Builder dispatch gated on user sign-off

---

## §1 Goals + Non-Goals

**v0+M Goals (this spec):**

- Accelerate the synchronous, static `renderToString` hot path in `packages/server/src/ssr.ts` via a Rust napi-rs addon.
- The addon handles only the `renderNode` tree-walk (ssr.ts:114-142) and `buildHead` (ssr.ts:144-162) paths — the two pure-string-concatenation routines with no side effects.
- Three-state loader: native loaded / native skipped (edge runtime) / native failed loud (corrupt binary on supported platform).
- Parity acceptance: property-test gate asserting `rustImpl(tree) === tsImpl(tree)` byte-for-byte.
- Crate at `packages/server/src-native/`, 4-platform build matrix, separate npm optionalDependencies packages per platform.

**v0+M Non-Goals (deferred to v0+M+1):**

- `renderToStream` — async boundaries cannot be expressed in the synchronous Rust path; TS implementation covers all streaming and DataSource paths (ssr.ts:168-285).
- `contextSetup` / `_setContextFns` — these are injection slots that call JS callbacks (ssr.ts:31-37, 95-98); all context activation stays JS-side.
- `serializer` — the `() => Record<string, unknown>` callback (ssr.ts:76) is a JS closure; Rust cannot invoke it. The state-script emission stays in the TS drain wrapper.
- `hydratable` mode — deferred. The `data-scribe-path` path injection (ssr.ts:135) adds indexing logic that must be parity-tested independently before Rust takes it on.
- `{ toHtml(): string }` component shape — direct HTML provider bypasses tree-walk entirely (ssr.ts:307-318); Rust adds zero value here. TS handles it unchanged.
- WASM fallback — not in scope. napi-rs produces `.node` native addons only.
- The `@scribe/compiler` CLI binary pattern is explicitly NOT followed. That package uses `execFileSync` against a standalone binary (compiler/js/index.ts:8). This addon uses `require()` of a `.node` napi binding — a different distribution shape.

---

## §2 FFI Boundary

### §2.1 Tree Serialization Format (JS → Rust)

**Recommendation: JSON string, serialized on the JS side before crossing FFI.**

Rationale: The tree shape (`kind: 'leaf' | 'branch'`, `tag`, `attrs`, `children`) is already a plain JS object graph. JSON serialization is zero-dependency, already available in every runtime that `@scribe/server` targets (ssr.ts:2-3 — Workers, Deno, Bun, Node ESM), and gives Rust a stable, version-independent contract. napi-rs types (`JsObject`, `JsArray`) require per-field extraction at the Rust boundary, adding N round-trips per node; a single `JSON.parse` on the Rust side is faster and simpler.

The JS loader calls:

```
nativeAddon.renderTree(JSON.stringify(root), hydratable)
```

where `root` is the raw object returned by `component()` (ssr.ts:345-376, the factory-invocation path). JSON serialization happens entirely in JS before the FFI call. Rust calls `serde_json::from_str` internally (no serde dep — use `serde` + `serde_json` with `default-features = false, features = ["alloc"]`). Serde is justified: it is the only external dep, it handles the recursive tree deserialization cleanly, and its `no_std` mode keeps the binary lean. All other functionality (HTML escape, string building) stays hand-written per the Director's constraint.

Fallback: if `component()` throws, the exception is caught in JS before reaching the FFI boundary. Rust never sees an invalid call.

### §2.2 Return Shape (Rust → JS)

**Plain UTF-8 string** — napi-rs `String` return type, mapped to JS `string`.

No Buffer, no streaming chunks. The Rust function signature at the napi layer is:

```rust
#[napi]
pub fn render_tree(tree_json: String, hydratable: bool) -> napi::Result<String>
```

The returned `napi::Result<String>` maps to a JS string on success or a thrown `Error` on Rust panic/parse failure. The JS three-state loader wraps the call in `try/catch`.

A second exported function handles the full-document path:

```rust
#[napi]
pub fn render_document(tree_json: String, head_json: String, hydratable: bool) -> napi::Result<String>
```

`head_json` is `JSON.stringify(opts.head)` from JS. Rust produces the complete `<!DOCTYPE html>...<body>..content..</body></html>` string, mirroring the TS path through `buildHead` + `renderNode`.

### §2.3 What Stays JS-Side

These are never passed to Rust and never called from Rust:

- `component()` factory invocation — JS only (ssr.ts:323-325). Rust receives the already-materialized tree.
- `contextSetup` / `_setContextMap` / `_clearContextMap` — JS injection slots (ssr.ts:15-37). Context is set up and torn down in the JS `renderToString` wrapper's `try/finally` block before and after the Rust call.
- `serializer` — JS callback (ssr.ts:76). State-script emission stays in the TS drain.
- `renderToStream` / `renderNodeAsync` — all async boundaries, DataSource handling (ssr.ts:168-285) — untouched.
- `{ toHtml(): string }` path — handled by the TS short-circuit (ssr.ts:306-318) before the Rust call is considered.

---

## §3 Three-State Loader

### §3.1 Loader Pseudocode (State Machine)

The loader runs at module initialization time in `packages/server/src/loader.ts` (new file). States are mutually exclusive and resolved exactly once.

```
State: UNKNOWN
  -> on module load: run detectEdge()
     if detectEdge() === true  -> STATE = EDGE_SKIPPED (terminal)
     else: attempt requireAddon()
       if requireAddon() succeeds -> STATE = NATIVE_LOADED (terminal)
       else: check isPlatformSupported()
         if isPlatformSupported() === true  -> STATE = NATIVE_FAILED_LOUD (throws, terminal)
         if isPlatformSupported() === false -> STATE = EDGE_SKIPPED (terminal, silent)

STATE = NATIVE_LOADED:
  renderToString = (component, opts) => nativeRenderToString(component, opts)

STATE = EDGE_SKIPPED:
  renderToString = tsRenderToString  // re-export from ssr.ts unchanged

STATE = NATIVE_FAILED_LOUD:
  THROW ScribeNativeError (see §5.1)
  [module never finishes loading; callers get the thrown error]
```

`requireAddon()` uses `createRequire(import.meta.url)(platformPackageName)` where `platformPackageName` is resolved from `process.platform` + `process.arch` using the same mapping as the postinstall would use.

`isPlatformSupported()` returns `true` if the current `process.platform`/`process.arch` pair is one of the four supported triples; `false` otherwise (e.g., `linux/arm64`, `darwin/arm64` on unsupported musl, `win32/arm64`).

### §3.2 Edge-Runtime Detection

Detection is a synchronous `OR` of two conditions:

1. `typeof EdgeRuntime !== 'undefined'` — Cloudflare Workers and Vercel Edge Runtime both set this global. Workers sets it to `'experimental'`; Vercel Edge sets it to `'vercel'`. Any truthy value means edge.
2. `process.env.NEXT_RUNTIME === 'edge'` — Next.js App Router edge routes set this at startup. Guarded with `typeof process !== 'undefined'` since Workers has no `process`.

If either condition is true, the loader enters `EDGE_SKIPPED` silently. No warning, no log. This matches the Director's contract: edge fall-through is completely transparent.

The detection runs before any `require()` attempt. `createRequire` is never called on edge runtimes.

### §3.3 Public Export Shape

The loader re-exports `renderToString` with the same signature as the existing TS implementation (ssr.ts:345). `packages/server/src/index.ts:8` currently exports:

```typescript
export { renderToString, renderToStream, _setContextFns } from './ssr.ts'
```

After this change, the index.ts line becomes:

```typescript
export { renderToString } from './loader.ts'
export { renderToStream, _setContextFns } from './ssr.ts'
```

The loader's `renderToString` export has the exact same TypeScript signature:

```typescript
export async function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string>
```

The function remains `async` regardless of native/TS state, because:
- The TS fallback is async (ssr.ts:345).
- The native path wraps the synchronous Rust call in an async function for signature parity. The `await` resolves in the same microtask.

All existing imports of `renderToString` from `@scribe/server` are drop-in compatible. No consumer changes.

---

## §4 Parity Acceptance

### §4.1 Harness Location

`packages/server/tests/native-parity.test.ts` — new file.

Import both implementations directly:

```typescript
import { renderToString as tsImpl } from '../src/ssr.ts'
import { renderToString as nativeImpl } from '../src/loader.ts'
```

The test file is skipped when `loader.ts` state is `EDGE_SKIPPED` (see §4.4).

### §4.2 Generator Shape (fast-check Arbitraries)

The tree structure follows ssr.ts:119-141. The arbitraries mirror the two node kinds:

```
leafArb: fc.record({
  kind: fc.constant('leaf'),
  text: fc.string({ maxLength: 200 })
})

attrValueArb: fc.oneof(
  fc.string({ maxLength: 100 }),       // string attr value
  fc.constant(true),                    // boolean true -> valueless attr
  fc.constant(false)                    // boolean false -> omitted
)

attrMapArb: fc.dictionary(
  fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/),  // valid HTML attr names
  attrValueArb,
  { maxKeys: 8 }
)

branchArb (depth-limited, max depth 5):
  fc.record({
    kind: fc.constant('branch'),
    tag: fc.constantFrom('div', 'span', 'p', 'a', 'section', 'button', 'ul', 'li'),
    attrs: attrMapArb,
    children: fc.array(fc.oneof(leafArb, fc.lazy(() => branchArb)), { maxLength: 4 })
  })

treeArb: fc.oneof(leafArb, branchArb)
```

The generator intentionally excludes `dataSource` (async boundaries not in Rust scope, §1 non-goals) and uses `kind` discriminant matching ssr.ts:119.

### §4.3 Named Sample Tests

Eight named samples. Each is both a standalone `it()` assertion AND a fast-check seed (via `fc.seed(namedSeed)`).

| # | Name | Tree Shape | Escape / Edge Focus |
|---|---|---|---|
| S1 | `empty-tree` | `{ kind: 'leaf', text: '' }` | Zero-length text, no attrs |
| S2 | `single-leaf` | `{ kind: 'leaf', text: 'Hello World' }` | Plain text passthrough |
| S3 | `single-branch-no-children` | `{ kind: 'branch', tag: 'div', attrs: {}, children: [] }` | Self-opening-closing element |
| S4 | `branch-with-leaf-child` | `{ kind: 'branch', tag: 'p', attrs: {}, children: [{ kind: 'leaf', text: 'X' }] }` | Basic nesting |
| S5 | `deeply-nested-5` | 5 levels of `{ kind: 'branch', tag: 'div', children: [...] }` each with one leaf | Deep recursion |
| S6 | `all-attr-types` | branch with `{ href: '/path', disabled: true, hidden: false, 'data-x': 'val' }` | Boolean true (no-value), boolean false (omit), string attr |
| S7 | `escape-edge-ampersand-quote` | leaf with text `a < b & c > d`, branch attr value `fo"o` | `escapeAttr` produces `fo&quot;o`; leaf text is NOT escaped (ssr.ts:120-122 outputs raw text) |
| S8 | `unicode-multibyte` | leaf text `中文`, attr value `élève` | UTF-8 round-trip through FFI boundary |

Assertion for each named sample: `expect(await nativeImpl(factory)).toBe(await tsImpl(factory))`.

Property assertion (runs all 8 as seeds then 200 random cases):

```typescript
await fc.assert(
  fc.asyncProperty(treeArb, async (tree) => {
    const factory = () => tree
    const ts = await tsImpl(factory)
    const native = await nativeImpl(factory)
    return ts === native
  }),
  { numRuns: 200, seed: 0xcafe }
)
```

Note on S7: ssr.ts:120-122 — leaf text is returned raw (no HTML escaping). The `escapeAttr` function (ssr.ts:110-112) only escapes `&` → `&amp;` and `"` → `&quot;` in attribute values. Rust `escape.rs` must replicate this exactly and nothing more. This is the most likely parity failure point.

### §4.4 CI Gate

The parity test runs when:
- The test runner is NOT in an edge-runtime environment (loader state is not `EDGE_SKIPPED`).
- The current platform is one of the four supported triples AND the platform package is installed.

The test file uses a `beforeAll` hook: if `loader.ts` state is `EDGE_SKIPPED` or the native addon is not present, all tests in the file are skipped via `test.skip`. No failure is emitted — this allows the test suite to pass on unsupported platforms (e.g., a developer on `linux/arm64`).

CI gate trigger: any PR that modifies `packages/server/src/ssr.ts` OR any file under `packages/server/src-native/` must have the parity test execute and pass (not skip). The CI job sets `SCRIBE_FORCE_NATIVE=1` to bypass the edge detection guard and require native load. If the native binary is not built, the job fails at the load step (§3.1 `NATIVE_FAILED_LOUD` state) rather than silently skipping.

---

## §5 Failure-Loud Contract

### §5.1 Missing Binary Error

When `isPlatformSupported() === true` and `requireAddon()` fails with `MODULE_NOT_FOUND`:

```
[@scribe/server] Native renderer binary not found for this platform.

  Platform:         darwin-arm64
  Expected package: @scribe/server-darwin-arm64
  Expected file:    @scribe/server-darwin-arm64/server-native.darwin-arm64.node

  This binary is distributed as an optionalDependency of @scribe/server.
  Your package manager may have skipped it.

  To reinstall:
    npm install @scribe/server
    # or: pnpm install   or: bun install

  If you built from source or are running a CI environment without npm access,
  set SCRIBE_NATIVE_SKIP=1 to use the TypeScript fallback (slower, always correct).
```

This error is thrown as a `ScribeNativeError extends Error` with `code: 'SCRIBE_NATIVE_MISSING'`. The error message includes the platform string, the package name, and the `.node` filename — all derived from the same platform mapping table used by `isPlatformSupported()`.

### §5.2 Corrupt Binary Error

When `requireAddon()` throws an error other than `MODULE_NOT_FOUND` (e.g., invalid ELF, version mismatch, napi ABI incompatibility):

```
[@scribe/server] Native renderer binary failed to load.

  Platform:         linux-x64-gnu
  Expected package: @scribe/server-linux-x64-gnu
  Load error:       <original error message>

  The binary exists but could not be initialized. This usually means:
    - The binary was built for a different Node.js version (ABI mismatch)
    - The file is corrupted (incomplete download or disk error)

  To fix:
    npm install @scribe/server   (re-downloads the platform package)

  Original error: <stack trace>
```

The original error is wrapped: `new ScribeNativeError(msg, { cause: originalError })`.

### §5.3 Edge Runtime Behavior

When edge-runtime detection fires (§3.2), the loader silently uses the TS implementation. No warning is logged. No error is thrown. The `renderToString` export is `tsRenderToString` re-exported unchanged. This is transparent — callers cannot distinguish edge from native.

The environment variable `SCRIBE_NATIVE_SKIP=1` also triggers the same silent fallthrough (useful for debugging, source builds, and CI environments without npm access). It is distinct from the corrupt-binary path — it is always silent.

---

## §6 Crate Skeleton

### §6.1 Directory Layout

```
packages/server/src-native/
  Cargo.toml
  build.rs
  src/
    lib.rs       -- napi exports: render_tree(), render_document()
    render.rs    -- tree deserialization (serde_json) and HTML string building
    escape.rs    -- escapeAttr() parity: only & -> &amp; and " -> &quot;
```

No `main.rs` — this is a `cdylib` crate, not a binary.

### §6.2 Cargo.toml Content

```toml
[package]
name    = "scribe-server-native"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi        = { version = "2", default-features = false, features = ["napi4"] }
napi-derive = { version = "2" }
serde       = { version = "1", default-features = false, features = ["derive"] }
serde_json  = { version = "1", default-features = false, features = ["alloc"] }

[build-dependencies]
napi-build = { version = "2" }

[profile.release]
lto           = "thin"
codegen-units = 1
strip         = "symbols"
opt-level     = 3
```

Justification for `napi4`: the `napi4` feature covers the `napi_create_string_utf8` / `napi_get_string_utf8` APIs needed for string passing. No async work (napi6 thread-safe functions) is required since the Rust path is synchronous.

Justification for `serde`/`serde_json`: the only external runtime deps. No `reqwest`, no `tokio`, no `rayon`. HTML escape stays hand-written in `escape.rs` per the Director's constraint (parity-surface stability).

A `build.rs` at the crate root calls `napi_build::setup()` — this generates the linker flags napi-rs requires.

### §6.3 package.json for the Addon

The addon is distributed as four platform-specific npm packages. Each contains only a `.node` file. The main `@scribe/server` package.json gains:

```json
"optionalDependencies": {
  "@scribe/server-darwin-arm64":    "0.1.0",
  "@scribe/server-darwin-x64":      "0.1.0",
  "@scribe/server-linux-x64-gnu":   "0.1.0",
  "@scribe/server-win32-x64-msvc":  "0.1.0"
}
```

Each platform package has its own `package.json`:

```json
{
  "name": "@scribe/server-linux-x64-gnu",
  "version": "0.1.0",
  "os": ["linux"],
  "cpu": ["x64"],
  "libc": ["glibc"],
  "main": "server-native.linux-x64-gnu.node",
  "files": ["server-native.linux-x64-gnu.node"]
}
```

The `os`/`cpu`/`libc` fields cause npm/pnpm/bun to install only the matching platform package. Filename convention: `server-native.<platform>.node`. The loader's `requireAddon()` resolves the package name from `process.platform`/`process.arch` using the same mapping.

No postinstall script — the `.node` file is included directly in the platform package. This is the canonical napi-rs distribution pattern and avoids the HTTPS-download-at-install-time complexity of the compiler's postinstall approach.

### §6.4 Module API Surface (Rust Function Signatures)

```rust
// lib.rs — napi-exported surface
#[napi]
pub fn render_tree(tree_json: String, hydratable: bool) -> napi::Result<String>

#[napi]
pub fn render_document(
    tree_json: String,
    head_json: String,
    hydratable: bool,
) -> napi::Result<String>
```

```rust
// render.rs — internal types matching ssr.ts:119-141
#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Node {
    Leaf { text: String },
    Branch {
        tag: String,
        #[serde(default)]
        attrs: indexmap::IndexMap<String, AttrValue>,  // see OQ-SN-1
        #[serde(default)]
        children: Vec<Node>,
    },
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum AttrValue { Bool(bool), Str(String) }

fn render_node(node: &Node, path: &str, hydratable: bool, out: &mut String)
fn build_head(head: &HeadConfig, out: &mut String)
```

`indexmap::IndexMap` for attrs preserves insertion order, matching JS `Object.entries()` (ssr.ts:131). Required for byte-for-byte parity. See OQ-SN-1 for the alternative.

```rust
// escape.rs — exactly mirrors ssr.ts:110-112
pub fn escape_attr(val: &str) -> String
// Replaces & -> &amp; then " -> &quot;. No other replacements.
// Leaf text is NOT escaped (mirrors ssr.ts:120-122).
```

---

## §7 Release Pipeline Delta

### §7.1 New Jobs in `.github/workflows/release.yml`

Add a new `build-native` job in the existing `release.yml` file (not a new workflow file). It runs in parallel with the existing `build` job (the compiler binary job).

```yaml
build-native:
  name: Build native ${{ matrix.platform }}
  runs-on: ${{ matrix.runner }}
  strategy:
    fail-fast: false
    matrix:
      include:
        - runner: macos-14
          target: aarch64-apple-darwin
          platform: darwin-arm64
          node-file: server-native.darwin-arm64.node
        - runner: macos-13
          target: x86_64-apple-darwin
          platform: darwin-x64
          node-file: server-native.darwin-x64.node
        - runner: ubuntu-22.04
          target: x86_64-unknown-linux-gnu
          platform: linux-x64-gnu
          node-file: server-native.linux-x64-gnu.node
        - runner: windows-2022
          target: x86_64-pc-windows-msvc
          platform: win32-x64-msvc
          node-file: server-native.win32-x64-msvc.node
  steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@<pinned-sha>
      with: { toolchain: stable, targets: "${{ matrix.target }}" }
    - uses: actions/setup-node@v4
      with: { node-version: '20' }
    - run: |
        cargo build --release \
          --target ${{ matrix.target }} \
          --manifest-path packages/server/src-native/Cargo.toml
    - name: Stage .node file (Unix)
      if: runner.os != 'Windows'
      run: |
        cp packages/server/src-native/target/${{ matrix.target }}/release/libscribe_server_native.so \
           ${{ matrix.node-file }} 2>/dev/null || \
        cp packages/server/src-native/target/${{ matrix.target }}/release/libscribe_server_native.dylib \
           ${{ matrix.node-file }}
    - name: Stage .node file (Windows)
      if: runner.os == 'Windows'
      shell: pwsh
      run: |
        Copy-Item "packages/server/src-native/target/${{ matrix.target }}/release/scribe_server_native.dll" `
          -Destination "${{ matrix.node-file }}"
    - uses: actions/upload-artifact@v4
      with:
        name: native-${{ matrix.platform }}
        path: ${{ matrix.node-file }}
        if-no-files-found: error
```

Add a `publish-native` job (parallel to the existing `release` job, both under `needs: [build, build-native]`):

```yaml
publish-native:
  name: Publish platform npm packages
  needs: [build-native]
  runs-on: ubuntu-22.04
  if: startsWith(github.ref, 'refs/tags/v')
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20', registry-url: 'https://registry.npmjs.org' }
    - uses: actions/download-artifact@v4
      with: { path: native-artifacts }
    - name: Publish each platform package
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      run: |
        for dir in packages/server/npm/*/; do
          platform=$(basename "$dir")
          node_file=$(ls native-artifacts/native-$platform/*.node 2>/dev/null)
          if [ -n "$node_file" ]; then
            cp "$node_file" "$dir/"
            cd "$dir" && npm publish --access public && cd -
          fi
        done
```

Platform package `package.json` files live at `packages/server/npm/<platform>/package.json` (committed to the repo, `.node` file excluded via `.gitignore`). The publish step copies the built `.node` into each directory and publishes.

### §7.2 npm Publish

Credential: `secrets.NPM_TOKEN` (org-level secret, same credential used by any future `@scribe/*` npm publish). Scope: `@scribe`. All four platform packages are published with `--access public`. The main `@scribe/server` package is published in the existing release pipeline (or a new `publish-server` job; exact location is an open question — see §9 OQ-SN-4).

### §7.3 Postinstall Behavior in `@scribe/server`

No postinstall script. The `.node` file is included in each platform package's `files` array. npm/pnpm/bun install the matching `optionalDependency` automatically at `npm install @scribe/server` time based on `os`/`cpu`/`libc` fields. The loader in `loader.ts` calls `createRequire(import.meta.url)('@scribe/server-<platform>')` to load the `.node` file at runtime.

No HTTPS download at install time. No postinstall script in `@scribe/server`. This is the key distinction from `@scribe/compiler`'s postinstall pattern: the platform packages ship the binary directly, not as a GitHub Release download.

---

## §8 Acceptance Criteria for Builder

**AC-1:** `packages/server/src-native/Cargo.toml` exists and `cargo build --release --manifest-path packages/server/src-native/Cargo.toml` exits 0 on the host platform.

**AC-2:** The built `.node` file loads without error via `node -e "require('./server-native.<platform>.node')"` on the build host.

**AC-3:** `packages/server/src/loader.ts` exports `renderToString` with the signature `(component: ComponentDescription, opts?: SsrOptions) => Promise<string>` — verified by `bun run typecheck` exiting 0.

**AC-4:** `packages/server/src/index.ts` exports `renderToString` from `./loader.ts` (not from `./ssr.ts` directly) — verified by `grep -n "from './loader'" packages/server/src/index.ts` returning a match.

**AC-5:** All existing tests pass without modification: `bun run test` exits 0 with all tests in `packages/server/tests/ssr.test.ts` and `packages/server/tests/compliance/ssr-output.test.ts` green.

**AC-6:** `packages/server/tests/native-parity.test.ts` exists and contains at least 8 named sample tests (S1-S8 from §4.3) plus one fast-check property test.

**AC-7:** On a supported platform with the native addon installed, `SCRIBE_FORCE_NATIVE=1 bun test packages/server/tests/native-parity.test.ts` exits 0 with all 8 named tests and the property test passing (not skipped).

**AC-8:** On a supported platform with the native addon installed, `await nativeImpl(factory) === await tsImpl(factory)` for all 8 named samples in §4.3 — verified by AC-7 passing.

**AC-9:** When the platform package `.node` file is renamed/removed and `isPlatformSupported()` returns `true`, requiring `@scribe/server` throws an error matching `/\[@scribe\/server\] Native renderer binary not found/` with the platform name, expected package name, and `npm install @scribe/server` in the message body.

**AC-10:** When `SCRIBE_NATIVE_SKIP=1` is set, `require('@scribe/server')` succeeds and `renderToString` is the TS implementation — verified by `SCRIBE_NATIVE_SKIP=1 node -e "const {renderToString} = require('@scribe/server'); console.log(typeof renderToString)"` printing `function`.

**AC-11:** When `EdgeRuntime = 'experimental'` is set as a global before `loader.ts` initializes, the loader enters `EDGE_SKIPPED` state and no `require()` of the platform package is attempted — verified by unit test in `native-parity.test.ts` mocking the global.

**AC-12:** `packages/server/npm/darwin-arm64/package.json`, `packages/server/npm/darwin-x64/package.json`, `packages/server/npm/linux-x64-gnu/package.json`, and `packages/server/npm/win32-x64-msvc/package.json` all exist with correct `os`/`cpu`/`libc` fields.

**AC-13:** `packages/server/package.json` contains `optionalDependencies` entries for all four platform packages.

**AC-14:** `bun run build` (the existing build gate) exits 0 — adding `loader.ts` must not break the rolldown build configuration.

**AC-15:** The parity test CI gate (`SCRIBE_FORCE_NATIVE=1 bun test native-parity`) is documented in a comment in `.github/workflows/release.yml` specifying which PR paths trigger it (`packages/server/src/ssr.ts` or `packages/server/src-native/**`).

---

## §9 Open Questions Before Builder Dispatch

**OQ-SN-1 (HIGH — potential parity failure): Attribute ordering JS vs Rust**

TS `renderNode` uses `Object.entries(attrs)` (ssr.ts:131) which returns insertion order. JSON serialization preserves insertion order for object keys. Rust `BTreeMap` sorts keys lexicographically. If an attr object has keys in non-alphabetical insertion order, the rendered attribute string order differs and the byte-for-byte parity test fails.

**Recommendation:** Use `indexmap::IndexMap` (preserves insertion order, same as JS) instead of `BTreeMap`. This adds one external dep (`indexmap = "2"`). Alternatively, use `serde_json`'s `preserve_order` feature on the existing `serde_json` dep (no new top-level dep). The insertion-order approach is load-bearing for parity — recommend committing to it.

**Alternative if user rejects the dep:** Require that all callers pass attrs with lexicographically sorted keys before the FFI call (sort in JS before `JSON.stringify`). This imposes a cost on the JS path and changes the parity surface. Not recommended.

**OQ-SN-2 (HIGH — scope confirmation): Crate location**

The Director brief recommends `packages/server/src-native/`. This is confirmed in the spec. However, it means the crate lives inside a JS package directory, which may conflict with workspace Cargo.toml resolution if a root `Cargo.toml` workspace is added in the future. Confirm with Director: should the crate be at `crates/server-native/` (a top-level `crates/` directory parallel to `packages/`) to keep Rust and JS workspace roots separate? The `packages/compiler/` precedent puts a Rust crate inside a JS package, so `packages/server/src-native/` is consistent with existing conventions. **Recommendation: keep `packages/server/src-native/` for convention consistency.** Hard to reverse once the release pipeline is wired.

**OQ-SN-3 (MEDIUM — hydratable deferral): Should hydratable be in v0+M or v0+M+1?**

This spec defers `hydratable` mode (§1 non-goals). The `data-scribe-path` indexing in ssr.ts:135 (`${path}.${i}`) requires path tracking through the recursive walk — straightforward in Rust but adds parity surface. The parity test would need 2 additional named samples (S9: hydratable false, S10: hydratable true path indexing). The `render_tree` signature already accepts `hydratable: bool` (§6.4), leaving the door open.

**Recommendation: keep deferred.** The hydratable path is used only when `opts.hydratable === true`, which is uncommon in production SSR. The deferred scope reduces parity surface and Builder risk. However, since the function signature already takes `hydratable: bool`, the Builder should implement it correctly even in v0+M — just exclude it from the parity AC and property test until a follow-on spec adds the named samples.

**OQ-SN-4 (MEDIUM — publish coordination): When and how does `@scribe/server` itself get published to npm?**

The existing `release.yml` publishes only the compiler binaries as GitHub Release assets. It has no npm publish step for any `@scribe/*` package. This spec adds a `publish-native` job for the four platform packages, but the main `@scribe/server` package also needs to be published (with the updated `optionalDependencies` in its `package.json`) before or simultaneously with the platform packages, otherwise npm install of `@scribe/server` will fail to resolve the version-pinned platform packages.

**Recommendation:** Add a `publish-server` job in `release.yml` that `npm publish`es `@scribe/server` immediately after `publish-native`. The sequencing must be: `build-native` → `publish-native` → `publish-server`.

**OQ-SN-5 (MEDIUM — Director §6.2 carryover): Permitted Rust dependencies**

Director §6.2 asks whether Rust deps beyond `napi`/`napi-derive` are permitted. This spec uses `serde`, `serde_json`, and recommends `indexmap` (or `serde_json/preserve_order`). Total external deps: 3 (or 4). All are widely-used crates with stable semver. HTML escape stays hand-written (parity surface).

**Recommendation: permit serde/serde_json + indexmap (or serde_json/preserve_order).** Reject reqwest, tokio, rayon, html5ever, kuchiki, and similar — the parity surface lives entirely in our hand-written render+escape code.

**OQ-SN-6 (LOW — Director §6.4 carryover): Performance bar wording**

Director §6.4 asks for a concrete perf target. The acceptance criteria above (§8) do not include perf — they only assert correctness and parity. A perf bar should be added before declaring v0+M shipped, but is not a Builder gate.

**Recommendation:** "≥5× faster `renderToString` p50 latency on the existing `bench/server/` workload (or similar benchmark to be added) versus the TS implementation, measured on `linux-x64-gnu` Node 20." Add as a separate bench task post-Builder; do not block Builder on this.

**OQ-SN-7 (LOW — Director §6.3 carryover): License of bundled binaries**

Director §6.3 notes the repo has no `LICENSE` per README. This Builder will add binary `.node` files to npm-published packages. Each platform package's `package.json` should declare a license (recommend MIT, matching the implicit project posture). Surface to user before first publish; not a Builder gate.

---

## §10 Do-Not-Touch List

The following files must remain byte-identical after Builder completes. Any modification is a scope violation requiring an explicit spec update.

- `packages/server/src/ssr.ts` — the TS implementation is the reference. The loader wraps it; Rust must match it. The Builder must not alter `renderNode`, `renderNodeAsync`, `escapeAttr`, `buildHead`, `renderToStream`, or any exported type in this file.
- `packages/server/src/index.ts` — only the `renderToString` export source changes (from `./ssr.ts` to `./loader.ts`). All other exports are untouched.
- `packages/server/tests/ssr.test.ts` — existing ssr tests must pass unmodified.
- `packages/server/tests/compliance/ssr-output.test.ts` — existing compliance tests must pass unmodified.
- `packages/server/tests/ssr-stream.test.ts` — streaming tests untouched.
- `packages/compiler/` — no changes. The compiler crate and its release pipeline are a separate package.
- `.github/workflows/plan-a.yml` — untouched.
- All files under `packages/signals/`, `packages/arbor/`, `packages/runtime/`, `packages/agent/`, `packages/context/`, `packages/data/` — this spec is server-only.
- `packages/server/src/router.ts`, `middleware.ts`, `api.ts`, `data.ts`, `config.ts`, `types.ts`, `agent-readiness-config.ts`, `stream-types.ts` — all untouched.

---

**Sources cited during design:**
- [Release native packages – NAPI-RS](https://napi.rs/docs/deep-dive/release)
- [A simple package – NAPI-RS](https://napi.rs/docs/introduction/simple-package)
- [napi-rs/package-template package.json](https://github.com/napi-rs/package-template/blob/main/package.json)
