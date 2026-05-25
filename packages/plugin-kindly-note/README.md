# @aihu-plugin/kindly-note

> **Aihu** — agentic discovery and interaction, for human purpose.

Runtime syntax highlighting for aihu — <aihu-code> custom element + signal-aware highlight() helper, powered by published @kindly-note/* packages with lazy language loading.

Held-private workspace package. Not yet published to npm.

> **Status:** Held private — not yet published to npm. See [v1.1 roadmap](../../docs/roadmap/SUMMARY.md) for ratification gating (e.g. RFC #56 live-binding for `@aihu/plugin` enforcement).

<!-- BEGIN_HANDWRITTEN: prose -->
# peer deps (the kindly-note engine + emitter + lazy loader):
bun add @kindly-note/core @kindly-note/emitters-html @kindly-note/loader-dynamic-import
```

Language tokenizers are fetched on demand via dynamic `import()`. Install the
ones you intend to use so the resolver can find them:

```bash
bun add @kindly-note/lang-typescript @kindly-note/lang-json @kindly-note/lang-markdown
```

Pair with a theme for the `kn-*` classes:

```ts
import '@kindly-note/themes-default/dark.css'
```

## Scope

This package ships the **highlighting** half only. Markdown **rendering**
(`<aihu-markdown>` / `renderMarkdown` / GFM) is **out of scope** — that path
depends on the unbuilt `@kindly-note/emitters-markdown` and is blocked on org
access to the kindly-note repo. Highlighting markdown *source* via the
`@kindly-note/lang-markdown` tokenizer is supported (that is highlighting, not
rendering).
<!-- END_HANDWRITTEN: prose -->

## Install

<!-- BEGIN_AUTOGEN: install -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

```bash
npm install @aihu-plugin/kindly-note
# or
bun add @aihu-plugin/kindly-note
```

<sub><i>Auto-generated against `@aihu-plugin/kindly-note@0.1.0`.</i></sub>

<!-- END_AUTOGEN: install -->

## Package facts

<!-- BEGIN_AUTOGEN: stats -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| | |
|---|---|
| **Version** | `0.1.0` |
| **Tier** | E — Held private (unmapped tier) |
| **Bundle size** | 1.29 kB (gz) — limit 1500 B |
| **Published files** | 3 entries |
| **License** | MIT |

<sub><i>Auto-generated against `@aihu-plugin/kindly-note@0.1.0`.</i></sub>

<!-- END_AUTOGEN: stats -->

## Exports

<!-- BEGIN_AUTOGEN: exports -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Subpath | ESM | CJS |
|---|---|---|
| `.` | `./dist/index.js` | `—` |

<sub><i>Auto-generated against `@aihu-plugin/kindly-note@0.1.0`.</i></sub>

<!-- END_AUTOGEN: exports -->

## Dependencies

<!-- BEGIN_AUTOGEN: deps -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

**Dependencies:**

- `@aihu/signals` — `workspace:*`

**Peer dependencies:**

- `@kindly-note/core` — `^0.1.0`
- `@kindly-note/emitters-html` — `^0.1.0`
- `@kindly-note/loader-dynamic-import` — `^0.1.0`

<sub><i>Auto-generated against `@aihu-plugin/kindly-note@0.1.0`.</i></sub>

<!-- END_AUTOGEN: deps -->

## See also

<!-- BEGIN_AUTOGEN: see-also -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

- [Aihu framework root](../../README.md)
- [v1.1 roadmap](../../docs/roadmap/SUMMARY.md)

<sub><i>Auto-generated against `@aihu-plugin/kindly-note@0.1.0`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../LICENSE).

<sub><i>Auto-generated against `@aihu-plugin/kindly-note@0.1.0`.</i></sub>

<!-- END_AUTOGEN: license -->
