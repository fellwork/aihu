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

### Authoring a recipe: `@state` runs on the SERVER too

A `@state` block is emitted verbatim into the component's setup body, and under
`output: 'ssr'` that body executes inside a Cloudflare Worker — where
`HTMLElement`, `CSSStyleSheet`, `customElements` and `document` are all
`undefined`. A bare DOM reference there is not a degraded render, it is a
`ReferenceError`: as a child the element comes out empty, as a page the request
gets no response at all.

So anything in `@state` that touches a DOM global directly must be guarded:

```js
@state {
  if (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {
    class AihuThing extends HTMLElement { /* … */ }
    if (!customElements.get('aihu-thing')) customElements.define('aihu-thing', AihuThing)
  }
}
```

Three things do NOT need a guard, and should not get one:

- `onMount` / event handlers / `@aihu/use` composables — never run during a
  server render (the composables carry their own `isClient` no-op contract).
- `@aihu/primitives`' `defineX()` entry points (`defineSlider()`,
  `defineRadioGroup()`, …) — each is a documented no-op without a DOM.
- The `@style` block — the compiler already elides its `new CSSStyleSheet()`
  on the server target and ships the CSS as a string instead.

`tests/ssr-recipe-safety.test.ts` enforces this by compiling every recipe to
the server target and running its renderer in a DOM-less realm.

### Local development

```bash
bun run gen:registry   # scan registry/** → registry.json (index-only)
bun run test           # vitest (recipe-compile + shadow-adoption + SSR safety)
bun run typecheck      # tsc --noEmit (no dist; recipes are typechecked, not compiled)
```

### Ported catalogs — provenance

Some recipes in this registry are ported from third-party open-source catalogs, per
`docs/plans/2026-08-01-performative-ui-port.md`:

- **[tailwind-animations](https://github.com/midudev/tailwind-animations)** (MIT, ©
  Miguel Ángel Durán) — the ported `animate-*` utility classes are transcribed into
  `@aihu/css-engine`'s utility engine; see `vendor/tailwind-animations-*/PROVENANCE.md`
  and root [`NOTICES.md`](../../NOTICES.md).
- **[performativeUI](https://github.com/vorpus/performativeUI)** (MIT) — components in
  this registry inspired by performativeUI's design/behavior/style are reimplemented in
  aihu-native code (no `pui-` prefixed class names or source text copied); each such
  recipe's header comment carries a one-line attribution. See
  `docs/plans/2026-08-01-performative-ui-port.md` for the transcription policy and
  `scripts/check-no-vendored-pui.ts` for the CI guard enforcing it.
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
| **Tier** | F — UI — styled-recipe registry distributed as source via `aihu add` |
| **Published files** | 6 entries |
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

- [@aihu/primitives](../primitives)
- [@aihu/css-engine](../css-engine)
- [Aihu framework root](../../README.md)

<sub><i>Auto-generated against `@aihu/ui@0.1.0`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../LICENSE).

<sub><i>Auto-generated against `@aihu/ui@0.1.0`.</i></sub>

<!-- END_AUTOGEN: license -->
