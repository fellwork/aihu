# Styling

aihu styles components with **`@aihu/css-engine`** — a hard fork of Tailwind v4 re-targeted for Web Components. Instead of a single global utility stylesheet, the engine scans your `.aihu` SFCs at build time and folds the utility classes each component actually uses into that component's shadow `<style>`. There is no global utility sheet, no runtime CSS-in-JS, and (for the static case) nothing extra ships to the client.

> **See also:** the [full utility reference](#utility-classes) — the authoritative index of every supported class, variant, and brand token, plus a "Not yet supported" callout.

> **Status:** `@aihu/css-engine@0.1.0` is published. The build-time engine (`compile`, `compileSfc`) currently depends on the `aihu-css-compile` Rust binary built from the workspace (`cargo build --release -p aihu-css-core`); a prebuilt binary ships with the package in a later plan. The runtime helpers (`cn`, `progressive`) are stable and tiny.

## How it works

- **Build-time scanning.** The engine reads `.aihu` SFC source, walks the compiler AST (via `@aihu/compiler`), collects the utility classes referenced in each component, and emits a per-SFC stylesheet.
- **Scoped output, not global.** The emitted CSS is embedded into the component's shadow root: `:host`-level theme tokens, the variant-resolved utility rules for that component, and the authored `@style` block — all folded into one shadow `<style>`. Two components on the same page never share or leak utility rules.
- **Zero-bundle for the static case.** Because utilities resolve to plain CSS at compile time, the static styling path adds no JavaScript to the client. The only runtime code is the optional `cn()` helper and the progressive-feature fallbacks, and only when you import them.

## WC-native variants

On top of the standard Tailwind variant set, the engine adds variants that only make sense inside a shadow root:

| Variant | Targets | Example |
|---------|---------|---------|
| `host:` | the component's `:host` | `host:block` |
| `slotted:` | `::slotted(...)` projected children | `slotted:text-sm` |
| `part-*:` | a named `::part(...)` exposed by the component | `part-label:font-bold` |

These compile to the corresponding shadow-DOM selectors so you can style the host, slotted content, and exposed parts with the same utility vocabulary you use for regular elements.

### group / peer relational variants

`group-*:` and `peer-*:` style an element based on the *state of a related element* — an ancestor (`group`) or a previous sibling (`peer`). Mark the related element with the bare `group` or `peer` class, then prefix the styled element's utilities with the matching variant.

| Variant | Relationship | Compiles to |
|---------|--------------|-------------|
| `group-hover:` | ancestor marked `group` is hovered | `.group:hover .group-hover\:<u>` |
| `group-focus:` / `group-focus-visible:` / `group-active:` / `group-disabled:` | ancestor marked `group` is in that state | `.group:<state> .group-<state>\:<u>` |
| `peer-checked:` | previous sibling marked `peer` is checked | `.peer:checked ~ .peer-checked\:<u>` |
| `peer-hover:` / `peer-focus:` / `peer-focus-visible:` / `peer-disabled:` | previous sibling marked `peer` is in that state | `.peer:<state> ~ .peer-<state>\:<u>` |

The bare `group` / `peer` classes are *markers*: they carry no styles of their own, they just anchor the relationship. Because everything is scoped inside one shadow root, the marker and the styled element must live in the same component tree. `peer` only looks **backward** to earlier siblings (CSS has no previous-sibling-forward combinator), so the `peer` element must appear before the styled element in source order.

```html
<!-- input → output -->
<div class="group">
  <span class="group-hover:bg-primary">…</span>
</div>
<!-- emits: .group:hover .group-hover\:bg-primary { background-color: var(--color-primary) } -->

<input class="peer" type="checkbox" />
<span class="peer-checked:bg-primary">…</span>
<!-- emits: .peer:checked ~ .peer-checked\:bg-primary { background-color: var(--color-primary) } -->
```

These stack with the other variants left-to-right, e.g. `md:group-hover:bg-primary` wraps the relational rule in the `md` media query.

## Light DOM vs Shadow DOM (and using css-engine)

The rendering mode is a **binary choice** — `shadowMode: 'light' | 'shadow'`. Leaf components default to `'shadow'` (an open shadow root; open is the only browser mode aihu's composition/hydration can use, which is why no `'closed'` value exists). Pages (`@route`) and layouts default to `'light'` (DA4: server-rendered page content must be reachable by non-JS crawlers). `@aihu/css-engine` works in either mode: under `'shadow'` it compiles each SFC's utility classes to a scoped stylesheet and folds it into that component's shadow `<style>`. **css-engine needs no special configuration to work behind a shadow root** — `shadowMode: 'light'` is *not* required. (That requirement is real only for global-cascade frameworks like Tailwind, UnoCSS, or Pico, which emit one global sheet that a shadow root would block.)

If you want **every** component in the light DOM — for example to style external/slotted children, or to emit a single global utility sheet — flip one knob:

```ts
// vite.config.ts
viteAihuPlugin({
  dir: { pages: 'src/pages' },
  css: { shadowMode: 'light' },  // light DOM — utility CSS lands in dist/assets/*.css
})
```

What changes when you cross the shadow boundary:

- **`'shadow'`.** Utility CSS folds into each component's shadow `<style>` via `adoptedStyleSheets`. External / global stylesheets do **not** pierce in; theme tokens still cascade in through `:host` because custom properties inherit across the boundary. To deliberately reach across, use the WC-native variants — `host:`, `slotted:`, and `part-*:`.
- **`'light'`.** There is no shadow root (`this.shadowRoot === null`), so the engine routes the per-SFC utility CSS through Vite's CSS pipeline and it lands in the bundled `dist/assets/*.css`. Now ordinary descendant selectors and global sheets reach your elements (and external children) normally.

**Verification gotcha.** "I switched to shadow mode and `grep dist/assets/*.css` finds nothing" is expected — in `'shadow'` mode the utilities are folded into each component's `<style>`, not the global CSS asset. Grep the *compiled component* (the emitted `__style__.replaceSync(...)` stylesheet) instead. Only in `shadowMode: 'light'` do the utilities appear in `dist/assets/*.css`.

## Scaffolding with css-engine

`@aihu/cli` can wire `@aihu/css-engine` into a fresh project out of the box:

```bash
aihu app myapp --css engine                  # css-engine, shadow (default, scoped)
aihu app myapp --css engine --shadow light    # css-engine, light DOM
```

`--css engine` adds `@aihu/css-engine` to `dependencies` and emits a starter page that uses utility classes (`flex gap-4 max-w-7xl mx-auto p-8`, `text-3xl font-bold`, …) instead of a hand-written `@style` block. Every css-engine scaffold writes an explicit `css: { shadowMode }` block carrying the wizard's `--shadow` choice (default `shadow`) — pages default to light DOM, so the plugin-global config is how the choice survives the DA4 default. The interactive `create-aihu` wizard (`npm create aihu@latest`) asks the same two questions — *"Include @aihu/css-engine?"* and, if yes, a shadow-mode select.

## Style packs

Component styling resolves against **design tokens** (CSS custom properties): a utility like `bg-primary` emits `var(--color-primary)`, and the *value* comes from a **style pack** (`aihu-default`, `aihu-graphite`, or your own via `defineStylePack()`). The token contract, the two shipped packs, `:root` + `.dark` emission, and how a consumer applies a pack are covered in full on the dedicated [Theming](#theming) page.

## `cn()` — runtime class merge

For the cases where a class string is decided at runtime (consumer overrides, conditional classes), import `cn()` from the dedicated sub-export. It is a separate sub-1 kB gz module so it never pulls in the rest of the engine:

```ts
import { cn } from '@aihu/css-engine/runtime/cn'

cn('p-2', 'p-4')                 // 'p-4'        (last-wins per property group)
cn('a', false && 'b', ['c'])     // 'a c'        (falsy dropped, arrays flattened)
cn('bg-red-500', 'bg-blue-500')  // 'bg-blue-500'
```

`cn()` resolves Tailwind-style conflicts last-wins per property group. The conflict map is **generated at engine build time** from the utility registry (not hand-maintained), so it never drifts from the utility table. Variant prefixes are respected: `hover:p-2` and `hover:p-4` conflict, but `p-2` and `hover:p-4` do not.

> Recipes use static utility strings resolved at compile time. Reach for `cn()` only for the runtime-override case — not as a general styling mechanism.

## Progressive features

Some utilities target modern CSS features (CSS anchor positioning, the Popover API). The engine emits these `@supports`-gated, and ships a tiny optional fallback shim under a separate sub-export:

```ts
import { anchorFallback, popoverFallback, position } from '@aihu/css-engine/runtime/progressive'
```

This is a hand-written ~2 kB floating-ui-style positioning shim (NOT the npm `@floating-ui/dom` package — aihu's thesis is dependency-free). `anchorFallback(anchor, floating, opts)` and `popoverFallback(anchor, panel, opts)` position a floating element with JS only when the native feature is unsupported, and return a cleanup function. It is kept in its own sub-export from `cn` so the lighter merge helper stays under its size budget.

## The component registry (`@aihu/ui` / `aihu add`)

A shadcn-style component registry — copy-in styled components distributed via an `aihu add <component>` CLI command, built on `@aihu/primitives` + the css-engine — is **on the roadmap, not yet published**. It is part of the in-progress SFC-primitives arc; do not depend on `@aihu/ui` or `aihu add` yet. See [Primitives](#primitives) for the headless behaviors that registry will be built on.

## See also

- [Theming](#theming) — design tokens, the `aihu-default` / `aihu-graphite` packs, and `defineStylePack()`
- [Primitives](#primitives) — headless WAI-ARIA behaviors that consume `cn()` + style packs
- [API Reference](#api-reference) — full `@aihu/css-engine` export tables
- [Authoring Components](#authoring-components) — the `@style` block
