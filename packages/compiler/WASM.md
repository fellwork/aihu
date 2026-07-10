# aihu-compiler — WASM Build

`aihu-compiler` cross-compiles to WebAssembly via `wasm-pack`, exposing a
`wasm_compile(source: string)` function for use in browser playgrounds.

This unlocks **Directive 1** (homepage interactive playground per `docs/roadmap/_user-directives.md`) and **arch-4 §4.6** — compile `.aihu` source files entirely client-side at <200ms p50 for 50-line fixtures.

## Build

Prerequisites:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack   # one-time
```

Build the WASM bundle:

```bash
cd packages/compiler
wasm-pack build --target web --out-dir pkg-wasm
```

Output (gitignored):

- `pkg-wasm/aihu_compiler_bg.wasm` — the WASM binary
- `pkg-wasm/aihu_compiler.js` — JS glue (ESM, `--target web`)
- `pkg-wasm/aihu_compiler.d.ts` — TypeScript types
- `pkg-wasm/package.json` — package metadata

## Integration (Homepage Playground)

```typescript
import init, { wasm_compile, wasm_version } from '@aihu/compiler-wasm/aihu_compiler.js'

// One-time initialization (lazy-load the .wasm file)
await init()

console.log(`aihu-compiler v${wasm_version()}`)

// Compile a .aihu source string
const result = wasm_compile(source)
// result: { js: string, manifest_json: string, route_json: string | null }
```

The `wasm_compile` function runs the full parse → compile_full → emit pipeline in one call. Tag name is resolved from `@state.meta.name` → `@route.name` → `"aihu-component"`.

## Performance Targets (Directive 1)

| Metric | Target | Source |
|---|---|---|
| Compile latency, 50-line fixture | <200ms p50 | Directive 1 acceptance criterion #2 |
| Initial JS bundle | <1 MB | Directive 1 acceptance criterion #3 |
| `.wasm` gzipped size | <500 KB | arch-4 §4.6 + Directive 1 |
| WASM init | one-time, lazy | Behind playground iframe boundary |

To measure bundle size after build:

```bash
gzip -9 -c pkg-wasm/aihu_compiler_bg.wasm | wc -c
```

## Size Budget & Measured Sizes

The gzipped `.wasm` budget is **<500 KB (512,000 B)** — Directive 1 acceptance
criterion #3 + arch-4 §4.6. Since W2 (advanced-js-template-expressions) the
release CI **hard-fails** past the budget (previously a non-blocking warning).

W2 embedded `oxc_parser` (expression validation behind `--expr-parser ast`) and
adopted a size-optimized `[profile.release]` at the workspace root
(`opt-level = "z"`, fat LTO, `codegen-units = 1`, `panic = "abort"`,
`strip = true`) so the combined cdylib stays comfortably inside budget.

Measured 2026-07-10 (wasm-pack `--target web`, local Apple Silicon; gzip -9):

| Build | rustc | raw `.wasm` | gzipped |
|---|---|---|---|
| Pre-W2 baseline (no oxc, default O3 release profile) | 1.87.0 | 668,236 B | 250,786 B |
| W2 (oxc 0.139 embedded, `z`+LTO profile) | 1.95.0 | 926,337 B | **325,133 B** |

Net cost of real-JS expression parsing: **+258 KB raw / +74 KB gzip** after the
profile change — 63.5% of budget used, ~187 KB gzip headroom remaining for W3+.


## Smoke Benchmark

`bench/wasm-smoke.html` runs a 5-iteration benchmark of the 50-line fixture and reports min / max / p50. WASM requires a real HTTP server (not `file://`):

```bash
cd packages/compiler
python3 -m http.server 8080
# open http://localhost:8080/bench/wasm-smoke.html
```

PASS = p50 < 200ms (Directive 1 §2). FAIL surfaces the actual measurement.

## Native Build (Unchanged)

`cargo build --release -p aihu-compiler` and `cargo test -p aihu-compiler` continue to work unchanged. The `[lib] crate-type = ["cdylib", "rlib"]` preserves the rlib for native consumers; cdylib is only activated by `wasm-pack`. The `wasm-bindgen` and `serde-wasm-bindgen` deps are gated under `[target.'cfg(target_arch = "wasm32")'.dependencies]` so they don't enter the native build at all.

## CI Release Flow

Per arch-4 §4 + §4.6, every `v*` tag push to `.github/workflows/release.yml` produces:

| Asset | Source job | Consumer |
|---|---|---|
| `aihu-compile-darwin-arm64`, `…-darwin-x64`, `…-linux-x64`, `…-linux-arm64`, `…-windows-x64.exe` | `build` matrix (5 targets) | `js/postinstall.ts` — downloads the asset matching `process.platform` × `process.arch` on `npm install`. |
| `<asset>.sha256` (one per binary) | `build` matrix | `js/postinstall.ts` — verified against `crypto.createHash('sha256')` of the downloaded binary; mismatch is a hard fail (binary deleted, `process.exit(1)`). |
| `aihu-compile-wasm.tar.gz` | `build-wasm` job | Homepage playground (Directive 1) — fetched from `releases/latest/download/aihu-compile-wasm.tar.gz`, expanded into `pkg-wasm/`. |
| `aihu-compile-wasm.tar.gz.sha256` | `build-wasm` job | Same — sidecar verification before extraction. |

### Cross-compilation for aarch64-linux

`aarch64-unknown-linux-gnu` cannot be built natively on the GitHub-hosted Ubuntu runners; the matrix entry sets `use_cross: true`, which:

1. Installs `cross` (pinned commit `4090beca3cfffa44371a5bba524de3a578aa46c3` for reproducibility).
2. Runs `cross build --release --target aarch64-unknown-linux-gnu --manifest-path packages/compiler/Cargo.toml` — `cross` provisions an emulated build environment via Docker.

All other targets use the native runner toolchain (`cargo build`).

### WASM build job

The `build-wasm` job runs in parallel with the platform-binary matrix:

```bash
rustup target add wasm32-unknown-unknown
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
cd packages/compiler && wasm-pack build --target web --out-dir pkg-wasm
tar -czf aihu-compile-wasm.tar.gz -C packages/compiler pkg-wasm
```

Size gate: the job **fails** (`::error::` + exit 1) if the gzipped `.wasm` exceeds 500 KB (Directive 1 acceptance criterion #3 + arch-4 §4.6). W2 turned the old non-blocking warning into a hard assert — with oxc embedded, a deliberate chunk of the budget is spent, so regressions must block the release. See "Size Budget & Measured Sizes" above for current numbers.

### SHA256 verification

`js/postinstall.ts` follows arch-4 §4.3:

1. Resolves asset name from `process.platform` × `process.arch`.
2. Downloads `releases/latest/download/<asset>` (or the pinned tag).
3. Downloads `releases/latest/download/<asset>.sha256` (sidecar).
4. Computes `crypto.createHash('sha256')` of the downloaded binary.
5. Compares against the sidecar value (case-insensitive hex match, regex-validated `^[0-9a-f]{64}$`).
6. **Mismatch:** deletes the binary, prints both digests, exits 1.
7. **Sidecar 404 / network error:** soft-warn (lets pre-v1.1 releases without sidecars install successfully — temporary; v1.1+ tags always emit sidecars).

### Dry-run via workflow_dispatch

Manual `workflow_dispatch` runs `build` + `build-wasm` and uploads artifacts to the workflow run, but the `release` job is gated by `if: startsWith(github.ref, 'refs/tags/v')` — no GitHub Release is created. Use this to validate the workflow before cutting a real tag.

### Spec sources

- arch-4 §4 — pre-built compiler binary distribution
- arch-4 §4.3 — SHA256 sidecar verification
- arch-4 §4.6 — WASM bundle for browser playground
- Directive 1 — interactive homepage playground; latency + bundle-size targets

## Spec source

This implementation closes the WASM track in arch-4 §4.6. Updates to this document should cite arch-4 §4.6 and Directive 1 from `docs/roadmap/_user-directives.md`.
