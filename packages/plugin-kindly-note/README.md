# @aihu-plugin/kindly-note

> **Aihu** — agentic discovery and interaction, for human purpose.

Runtime syntax highlighting for aihu — <aihu-code> custom element + signal-aware highlight() helper, powered by published @kindly-note/* packages with lazy language loading.

Held-private workspace package. Not yet published to npm.

> **Status:** Held private — not yet published to npm. See [v1.1 roadmap](../../docs/roadmap/SUMMARY.md) for ratification gating (e.g. RFC #56 live-binding for `@aihu/plugin` enforcement).

<!-- BEGIN_HANDWRITTEN: prose -->
Runtime syntax highlighting for [aihu](../../README.md), powered by the
published [`@kindly-note/*`](https://www.npmjs.com/org/kindly-note) packages.
Ships an `<aihu-code>` custom element and a signal-aware `highlight()` helper
that render scoped-span HTML **in the browser, at runtime**, with
**lazy-loaded** per-language tokenizers (~1.5 kB gz each).

## Peer dependencies

The kindly-note engine + emitter + lazy loader are peer dependencies:

```bash
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

## Usage

### `<aihu-code>` element

```ts
import { defineCodeElement } from '@aihu-plugin/kindly-note'
defineCodeElement() // registers <aihu-code> (idempotent, SSR-safe)
```

```html
<aihu-code lang="typescript">const x: number = 1</aihu-code>
```

Signal-driven (re-highlights automatically when the signal changes):

```ts
import { signal } from '@aihu/signals'
const [code, setCode] = signal('const a = 1')

const el = document.createElement('aihu-code')
el.language = 'typescript' // JS property is `language` (native `lang` is reserved)
el.code = code // pass the signal reader → element subscribes
document.body.append(el)

setCode('let b = 2') // <aihu-code> re-highlights
```

### `highlight()` helper

```ts
import { highlight } from '@aihu-plugin/kindly-note'

const { html, language, fallback } = await highlight('{"a": 1}', 'json')
// html === '<span class="kn-punctuation">{</span>…'
```

`highlight()` never throws: an unknown language returns the HTML-escaped source
with `fallback: true`.

### Plugin registration

```ts
// aihu.config.ts
import { kindlyNote } from '@aihu-plugin/kindly-note'
import { defineAihuConfig } from '@aihu/server'

export default defineAihuConfig({ plugins: [kindlyNote()] })
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
| **Bundle size** | 1.37 kB (gz) — limit 1500 B |
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
