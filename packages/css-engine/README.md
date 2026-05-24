# @aihu/css-engine

> **Aihu** — agentic discovery and interaction, for human purpose.

aihu CSS engine — Tailwind v4 hard fork with WC-native scoped output.

Part of the **compiler + toolchain** layer of Aihu. Build-time only — does not ship to the client. The compiler reads `.aihu` SFC source (per the [Block Structure spec](../../docs/superpowers/specs/2026-05-02-spec-block-structure.md)) and emits standards-compliant Web Components.

<!-- BEGIN_HANDWRITTEN: prose -->
> aihu CSS engine — a hard fork of Tailwind v4 with Web-Component-native scoped output, AST-aware scanning, and progressive feature emission.

**Status:** v0 — bootstrap. The fork's identity, perf optimizations, and scoped emitter are all under construction. See [`docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md`](../../docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md) for the full design.

### Status by capability (Plan 1 bootstrap)

| Capability | Plan that lands it |
|---|---|
| Package builds; compile pipeline scaffolded | **Plan 1 (this one)** |
| AST scanner consuming `@aihu/compiler` | Plan 2 |
| Scoped-output mode (`:host` embedding) | Plan 2 |
| WC-native variants (`host:`, `slotted:`, `part-*:`) | Plan 2 |
| Progressive features (`view-transition:`, `anchor:`, etc.) | Plan 3 |
| Style packs (`aihu-default`, `aihu-graphite`) | Plan 3 |
| `cn()` runtime helper | Plan 3 |

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

<sub><i>Auto-generated against `@aihu/css-engine@0.0.0`.</i></sub>

<!-- END_AUTOGEN: install -->

## Package facts

<!-- BEGIN_AUTOGEN: stats -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| | |
|---|---|
| **Version** | `0.0.0` |
| **Tier** | D — Compiler — CSS engine (Tailwind v4 hard fork, WC-native scoped output) |
| **Published files** | 5 entries |
| **License** | MIT |

<sub><i>Auto-generated against `@aihu/css-engine@0.0.0`.</i></sub>

<!-- END_AUTOGEN: stats -->

## Exports

<!-- BEGIN_AUTOGEN: exports -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Subpath | ESM | CJS |
|---|---|---|
| `.` | `./dist/index.js` | `—` |

<sub><i>Auto-generated against `@aihu/css-engine@0.0.0`.</i></sub>

<!-- END_AUTOGEN: exports -->

## Dependencies

<!-- BEGIN_AUTOGEN: deps -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

**Dependencies:**

- `@aihu/compiler` — `workspace:*`

<sub><i>Auto-generated against `@aihu/css-engine@0.0.0`.</i></sub>

<!-- END_AUTOGEN: deps -->

## See also

<!-- BEGIN_AUTOGEN: see-also -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

- [CSS Engine + Primitives design spec](../../docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md)
- [@aihu/compiler](../compiler)
- [Aihu framework root](../../README.md)

<sub><i>Auto-generated against `@aihu/css-engine@0.0.0`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../LICENSE).

<sub><i>Auto-generated against `@aihu/css-engine@0.0.0`.</i></sub>

<!-- END_AUTOGEN: license -->
