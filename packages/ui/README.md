# @aihu/ui

> **Aihu** — agentic discovery and interaction, for human purpose.

aihu styled-recipe registry — copy-paste `.aihu` recipes distributed as source via `aihu add` (no runtime bundle).

<!-- BEGIN_HANDWRITTEN: prose -->
The **styled-recipe layer** on top of the headless [`@aihu/primitives`](../primitives)
and the [CSS engine](../css-engine). A recipe is an `.aihu` SFC with a `@meta`
variant declaration, a `@template` wiring `data-*` attributes, and a `@style`
block of `@apply` utilities resolved against the active style pack.

**`@aihu/ui` is source-distributed.** Its payload is the `registry/**` `.aihu`
recipe sources plus a generated `registry.json` index — NOT a bundled runtime
dependency. You install it as a devDependency and `aihu add <name>` copies the
recipe source into your project (you own the copy). Because nothing from this
package is bundled into your runtime *from the package*, it carries **no
`.size-limit.json` row** — your own build measures the copied recipes. See
[`.size-limit.README.md`](../../.size-limit.README.md).

### Phase 1 recipes

| Recipe | Kind | Notes |
|---|---|---|
| `button` | styled | extends the headless `AihuButton` from `@aihu/primitives/button` (class-extension model) |
| `card` | styled | presentational; slotted header/body/footer |
| `badge` | styled | presentational; variant matrix |
| `separator` | styled | presentational; `orientation` + `role="separator"` |

### Local development

```bash
bun run gen:registry   # scan registry/** → registry.json (index-only)
bun run test           # vitest (recipe-compile + runtime shadow-adoption)
bun run typecheck      # tsc --noEmit (no dist; recipes are typechecked, not compiled)
```
<!-- END_HANDWRITTEN: prose -->

## Install

<!-- BEGIN_AUTOGEN: install -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

```bash
npm install @aihu/ui
# or
bun add @aihu/ui
```

<sub><i>Auto-generated against `@aihu/ui@0.1.0`.</i></sub>

<!-- END_AUTOGEN: install -->

## Package facts

<!-- BEGIN_AUTOGEN: stats -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| | |
|---|---|
| **Version** | `0.1.0` |
| **Tier** | E — Held private (unmapped tier) |
| **Published files** | 5 entries |
| **License** | MIT |

<sub><i>Auto-generated against `@aihu/ui@0.1.0`.</i></sub>

<!-- END_AUTOGEN: stats -->

## Exports

<!-- BEGIN_AUTOGEN: exports -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Subpath | ESM | CJS |
|---|---|---|
| `./registry.json` | `./registry.json` | — |
| `./schema` | `—` | `—` |

<sub><i>Auto-generated against `@aihu/ui@0.1.0`.</i></sub>

<!-- END_AUTOGEN: exports -->

## Dependencies

<!-- BEGIN_AUTOGEN: deps -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

_Zero runtime dependencies_ (per the [dep-free thesis](../../README.md#project-posture))_._

<sub><i>Auto-generated against `@aihu/ui@0.1.0`.</i></sub>

<!-- END_AUTOGEN: deps -->

## See also

<!-- BEGIN_AUTOGEN: see-also -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

- [Aihu framework root](../../README.md)
- [v1.1 roadmap](../../docs/roadmap/SUMMARY.md)

<sub><i>Auto-generated against `@aihu/ui@0.1.0`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../LICENSE).

<sub><i>Auto-generated against `@aihu/ui@0.1.0`.</i></sub>

<!-- END_AUTOGEN: license -->
