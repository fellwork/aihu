# @aihu/cli

> **Aihu** — agentic discovery and interaction, for human purpose.

Aihu CLI (`aihu`, `create-aihu`) — scaffolding, dev, build commands.

Part of the **compiler + toolchain** layer of Aihu. Build-time only — does not ship to the client. The compiler reads `.aihu` SFC source (per the [Block Structure spec](../../docs/superpowers/specs/2026-05-02-spec-block-structure.md)) and emits standards-compliant Web Components.

<!-- BEGIN_HANDWRITTEN: prose -->
# or
bun add @aihu/cli
```

# Scaffold a new aihu app
bun create aihu my-app
# or
npm create aihu my-app

# Inside the project
aihu dev      # start dev server
aihu build    # build for production
```
<!-- END_HANDWRITTEN: prose -->

## Install

<!-- BEGIN_AUTOGEN: install -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

```bash
# Scaffold a new app
bunx @aihu/cli app my-app
# Or install globally
bun add -g @aihu/cli
```

<sub><i>Auto-generated against `@aihu/cli@0.1.0` on commit `ccf5564`.</i></sub>

<!-- END_AUTOGEN: install -->

## Package facts

<!-- BEGIN_AUTOGEN: stats -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| | |
|---|---|
| **Version** | `0.1.0` |
| **Tier** | D — Toolchain — `aihu` / `create-aihu` CLI |
| **Published files** | 3 entries |
| **License** | MIT |

<sub><i>Auto-generated against `@aihu/cli@0.1.0` on commit `ccf5564`.</i></sub>

<!-- END_AUTOGEN: stats -->

## Exports

<!-- BEGIN_AUTOGEN: exports -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Subpath | ESM | CJS |
|---|---|---|
| `.` | `./dist/index.js` | `—` |

<sub><i>Auto-generated against `@aihu/cli@0.1.0` on commit `ccf5564`.</i></sub>

<!-- END_AUTOGEN: exports -->

## Dependencies

<!-- BEGIN_AUTOGEN: deps -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

_Zero runtime dependencies_ (per the [dep-free thesis](../../README.md#project-posture))_._

<sub><i>Auto-generated against `@aihu/cli@0.1.0` on commit `ccf5564`.</i></sub>

<!-- END_AUTOGEN: deps -->

## See also

<!-- BEGIN_AUTOGEN: see-also -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

- [docs/cli.md](../../docs/cli.md)
- [@aihu/compiler](../compiler)
- [Aihu framework root](../../README.md)

<sub><i>Auto-generated against `@aihu/cli@0.1.0` on commit `ccf5564`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../LICENSE).

<sub><i>Auto-generated against `@aihu/cli@0.1.0` on commit `ccf5564`.</i></sub>

<!-- END_AUTOGEN: license -->
