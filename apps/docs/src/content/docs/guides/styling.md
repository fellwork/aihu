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
