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

## Release Workflow Integration

Per arch-4 §4.6, the GitHub Actions release workflow at `.github/workflows/release.yml` will (in M1) gain a WASM build step that publishes `aihu-compile.wasm` alongside the platform binaries. The homepage playground bundle fetches it from `releases/latest/download/aihu-compile.wasm`.

## Spec source

This implementation closes the WASM track in arch-4 §4.6. Updates to this document should cite arch-4 §4.6 and Directive 1 from `docs/roadmap/_user-directives.md`.
