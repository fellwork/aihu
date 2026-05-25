# Theming

aihu themes components with **design tokens** — CSS custom properties that the
`@aihu/css-engine` utility table resolves against. A utility like `bg-primary`
compiles to `background: var(--color-primary)`; the *value* of that token is
supplied by a **style pack**. Swap the pack and every component re-themes with
no markup change, because the token *names* are the contract and the *values*
are interchangeable.

This page is the single source of truth for theming. For the broader styling
model (scoped output, WC-native variants, `cn()`), see [Styling](#styling).

> **Status:** `@aihu/css-engine@0.1.1` ships the two built-in packs plus
> `defineStylePack()`. `defineStylePack()` is the stable, importable API. The
> built-in pack CSS bundles are shipped *files* (see [Applying a pack](#applying-a-pack))
> but are **not** subpath-exported — read that section before wiring an import.

## The design-token contract

A token is a CSS custom property. Throughout this doc and the
`defineStylePack()` API, token **names are given without the leading `--`** —
the engine adds it. The shipped packs declare these token groups:

| Group | Tokens (names without `--`) |
|-------|------------------------------|
| Color | `color-primary`, `color-primary-foreground`, `color-secondary`, `color-secondary-foreground`, `color-accent`, `color-accent-foreground`, `color-surface`, `color-surface-foreground`, `color-background`, `color-foreground`, `color-muted`, `color-muted-foreground`, `color-border`, `color-ring`, `color-destructive`, `color-destructive-foreground` |
| Radius | `radius-sm`, `radius-md`, `radius-lg`, `radius-pill` |
| Spacing | `space-1`, `space-2`, `space-3`, `space-4`, `space-6`, `space-8`, `space-12`, `space-16` |
| Typography | `font-sans`, `font-mono` |

The utility table resolves brand utilities against the color names: `bg-primary`
→ `var(--color-primary)`, `text-accent` → `var(--color-accent)`, and so on. Any
pack that declares this name set works under every recipe with no dangling
`var()`.

## The two shipped packs

Two packs ship with the engine. They declare the **same token names** — only
the values differ — so they are drop-in interchangeable:

- **`aihu-default`** — the aihu brand palette (warm paper + ink, accent
  `#c8543a`), light values in `:root`, dark overrides in `.dark`.
- **`aihu-graphite`** — a neutral monochrome ramp expressed in `oklch()`
  (chroma ≈ 0), same token names, same `:root` + `.dark` structure.

A pack emits a light block under `:root { … }` and an optional dark block under
`.dark { … }`. The consumer toggles dark by putting the `.dark` class on (or
above) the themed subtree; the same token names carry the dark values, so
nothing in component markup changes.

```css
/* shape of a shipped pack (aihu-default) */
:root {
  --color-primary: #1a1d24;
  --color-accent: #c8543a;
  --color-surface: #faf8f4;
  --radius-md: 8px;
  /* …the full token set… */
}
.dark {
  --color-primary: #ede8e0;
  --color-accent: #e8705a;
  --color-surface: #1a1d24;
  /* …dark values, same names… */
}
```

## How tokens reach shadow-scoped components

The css-engine emits per-component CSS into each component's **shadow root**
(see [Styling](#styling)). The utility rules inside a shadow root reference the
tokens as `var(--color-primary)` etc. CSS custom properties **inherit through
the shadow boundary**, so a pack declared once on `:root` (light) flows into
every component on the page. There is no per-component theme wiring.

The `dark:` variant works the same way: a utility like `dark:bg-surface`
compiles to a rule gated on the `.dark` ancestor, and because the `.dark` block
re-declares the *same* token names with dark values, the variant resolves to
the dark token automatically.

## `defineStylePack()` — custom packs

External orgs declare their own pack against the same token-name contract with
`defineStylePack()`. This is the stable, importable API (`import { defineStylePack }
from '@aihu/css-engine'`). The built-in packs are themselves expressible through
it — `defineStylePack()` is just the typed, programmatic form of the shipped CSS
bundles.

```ts
import { defineStylePack } from '@aihu/css-engine'

const acme = defineStylePack({
  name: 'acme',
  tokens: { 'color-primary': '#0a7', 'radius-md': '6px' },
  dark: { 'color-primary': '#3fc' },
})

acme.toCss()
// :root {
//   --color-primary: #0a7;
//   --radius-md: 6px;
// }
// .dark {
//   --color-primary: #3fc;
// }
```

`defineStylePack({ name, tokens, dark })` returns a `StylePack` descriptor with:

- `name` — the pack name (used for registration / debugging).
- `tokens` — the light-theme `TokenMap` (the `:root` block).
- `dark` — the dark-theme `TokenMap` (the `.dark` block); empty if you pass none.
- `toCss()` — serialize to a `:root { … }` (+ `.dark { … }`) CSS string in the
  same shape as the shipped bundles.

Token names are normalized whether or not you write the leading `--`
(`'color-accent'` and `'--color-accent'` both emit `--color-accent`). An empty
`name` or empty `tokens` map throws. Only declare the tokens you override —
declare the full contract set (above) if you want a stand-alone pack with no
dangling utilities.

## Applying a pack

A pack is just a `:root { … }` (+ `.dark { … }`) stylesheet. You apply it by
getting that CSS onto the page's `:root`, then toggling `.dark` for dark mode.
There are two verified paths:

**1. `defineStylePack().toCss()` (recommended — fully importable).** Generate
the CSS at build time or runtime and inject it. This path resolves cleanly
through the package `exports`:

```ts
import { defineStylePack } from '@aihu/css-engine'
import { aihuDefaultTokens, aihuDefaultDark } from './tokens.ts' // your token maps

const pack = defineStylePack({ name: 'app', tokens: aihuDefaultTokens, dark: aihuDefaultDark })

// e.g. emit into a <style> in your document head:
const style = document.createElement('style')
style.textContent = pack.toCss()
document.head.appendChild(style)

// dark mode: toggle the class the pack's `.dark` block targets
document.documentElement.classList.toggle('dark')
```

**2. The shipped built-in CSS bundles.** `aihu-default.css` and
`aihu-graphite.css` are published in the package's `files` list and land on disk
at `node_modules/@aihu/css-engine/styles/aihu-default.css` (and
`…/aihu-graphite.css`). They are real, shippable stylesheets you can copy into
your app or load directly by filesystem path.

> **Gap to know:** these `styles/*.css` files are **not** declared in the
> package `exports` map (which exposes only `.`, `./runtime/cn`,
> `./runtime/progressive`). A bare `import '@aihu/css-engine/styles/aihu-default.css'`
> therefore fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. To use a built-in pack
> today, either copy the file into your own assets, load it by its on-disk path,
> or reproduce its tokens via `defineStylePack()`. (The built-in packs are
> expressible through `defineStylePack()`, so path #1 covers every case without
> touching the unexported file.)

## See also

- [Styling](#styling) — the scoped-output model, WC-native variants, `cn()`
- [API Reference](#api-reference) — full `@aihu/css-engine` export tables
- [Primitives](#primitives) — headless behaviors that consume these tokens
