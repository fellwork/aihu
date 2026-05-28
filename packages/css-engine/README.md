# @aihu/css-engine

> **Aihu** — agentic discovery and interaction, for human purpose.

aihu CSS engine — Tailwind v4 hard fork with WC-native scoped output.

Part of the **compiler + toolchain** layer of Aihu. Build-time only — does not ship to the client. The compiler reads `.aihu` SFC source (per the [Block Structure spec](../../docs/superpowers/specs/2026-05-02-spec-block-structure.md)) and emits standards-compliant Web Components.

<!-- BEGIN_HANDWRITTEN: prose -->
> aihu CSS engine — a hard fork of Tailwind v4 with Web-Component-native scoped output, AST-aware scanning, and progressive feature emission.

**Status:** v1 — shipped. The fork identity, AST scanner, scoped emitter, WC-native
variants, progressive features, both style packs, and the `cn()` runtime helper
are all landed. See [`docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md`](../../docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md) for the full design.

### Status by capability

| Capability | Status |
|---|---|
| Package builds; `compile()` / `compileSfc()` pipeline | ✅ shipped |
| AST scanner consuming `@aihu/compiler` (`compileSfc`) | ✅ shipped |
| Scoped-output mode (`:host` embedding) | ✅ shipped |
| WC-native variants (`host:`, `slotted:`, `part-*:`) | ✅ shipped |
| Progressive features (`view-transition:`, `anchor:`, etc.) — `@aihu/css-engine/runtime/progressive` | ✅ shipped |
| Style packs (`aihu-default`, `aihu-graphite`) — `defineStylePack()`, `./packs`, `./styles/*.css` | ✅ shipped |
| `cn()` runtime helper — `@aihu/css-engine/runtime/cn` | ✅ shipped |

### Native binary distribution

`compile()` / `compileSfc()` shell out to the prebuilt `aihu-css-compile`
executable (the `aihu-css-core` Rust crate). For npm consumers the binary ships
as a per-platform `optionalDependencies` package
(`@aihu/css-engine-{darwin-arm64,darwin-x64,linux-x64-gnu,win32-x64-msvc}`),
resolved automatically at build time — no Rust toolchain required. In a monorepo
dev clone the engine falls back to the workspace `target/release` binary.

### Usage with `viteAihuPlugin`

When `@aihu/css-engine` is installed alongside `@aihu/app`, the compiler hook
inside `viteAihuPlugin` automatically scans every `.aihu` SFC and folds the
generated utility CSS into the build. **No additional plugin wiring is needed.**

There is one configuration knob you almost certainly want: **`shadowMode: 'none'`**.
Utility classes rely on the global cascade, so they must escape the per-component
shadow root. Forward this through `viteAihuPlugin`'s `css` option:

```ts
// vite.config.ts
import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      css: { shadowMode: 'none' },
    }),
  ],
})
```

If `compileSfc()` fails at build time (e.g. the native `aihu-css-core` binary
is unresolvable in your install), the compiler emits a one-shot warning to the
console — utility classes will not appear in the output until the binary is
restored. The build itself still succeeds.

See [`examples/css-engine-utility/`](../../examples/css-engine-utility) for a
minimal end-to-end demonstration, including an acceptance script that greps
the built CSS for the expected `.flex { display: flex }` rule.

### Local development

```bash
# Build Rust core (run from repo root or this dir)
cargo build --release -p aihu-css-core

# Build TS layer
bun run build

# Run tests
bun run test         # vitest e2e
bun run test:rust    # cargo + insta snapshots
```
<!-- END_HANDWRITTEN: prose -->

## Install

<!-- BEGIN_AUTOGEN: install -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

```bash
npm install @aihu/css-engine
# or
bun add @aihu/css-engine
```

<sub><i>Auto-generated against `@aihu/css-engine@0.2.3`.</i></sub>

<!-- END_AUTOGEN: install -->

## Package facts

<!-- BEGIN_AUTOGEN: stats -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| | |
|---|---|
| **Version** | `0.2.3` |
| **Tier** | D — Compiler — CSS engine (Tailwind v4 hard fork, WC-native scoped output) |
| **Published files** | 5 entries |
| **License** | MIT |

<sub><i>Auto-generated against `@aihu/css-engine@0.2.3`.</i></sub>

<!-- END_AUTOGEN: stats -->

## Exports

<!-- BEGIN_AUTOGEN: exports -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Subpath | ESM | CJS |
|---|---|---|
| `.` | `./dist/index.js` | `—` |
| `./packs` | `./dist/packs.js` | `—` |
| `./styles/aihu-default.css` | `./styles/aihu-default.css` | — |
| `./styles/aihu-graphite.css` | `./styles/aihu-graphite.css` | — |
| `./styles/*` | `./styles/*` | — |
| `./runtime/cn` | `./dist/runtime/cn.js` | `—` |
| `./runtime/progressive` | `./dist/runtime/progressive.js` | `—` |

<sub><i>Auto-generated against `@aihu/css-engine@0.2.3`.</i></sub>

<!-- END_AUTOGEN: exports -->

## Dependencies

<!-- BEGIN_AUTOGEN: deps -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

**Dependencies:**

- `@aihu/compiler` — `workspace:*`

**Optional dependencies (platform-specific):**

- `@aihu/css-engine-darwin-arm64` — `0.1.2`
- `@aihu/css-engine-darwin-x64` — `0.1.2`
- `@aihu/css-engine-linux-x64-gnu` — `0.1.2`
- `@aihu/css-engine-win32-x64-msvc` — `0.1.2`

<sub><i>Auto-generated against `@aihu/css-engine@0.2.3`.</i></sub>

<!-- END_AUTOGEN: deps -->

## See also

<!-- BEGIN_AUTOGEN: see-also -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

- [CSS Engine + Primitives design spec](../../docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md)
- [@aihu/compiler](../compiler)
- [Aihu framework root](../../README.md)

<sub><i>Auto-generated against `@aihu/css-engine@0.2.3`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../LICENSE).

<sub><i>Auto-generated against `@aihu/css-engine@0.2.3`.</i></sub>

<!-- END_AUTOGEN: license -->
