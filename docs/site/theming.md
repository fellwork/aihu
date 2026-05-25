# Theming

aihu themes components with **design tokens** — CSS custom properties that the
`@aihu/css-engine` utility table resolves against. A utility like `bg-primary`
compiles to `background: var(--color-primary)`; the *value* of that token is
supplied by a **style pack**. Swap the pack and every component re-themes with
no markup change, because the token *names* are the contract and the *values*
are interchangeable.

This page is the single source of truth for theming. For the broader styling
model (scoped output, WC-native variants, `cn()`), see [Styling](#styling).

> **Status:** `@aihu/css-engine` ships the two built-in packs three ways, all
> stable and importable: as `defineStylePack()`, as `StylePack` objects from
> `@aihu/css-engine/packs`, and as CSS bundles via `@aihu/css-engine/styles/*.css`.
> See [Applying a pack](#applying-a-pack).

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

## The built-in packs as JS objects

The two built-in packs are exported as ready-made `StylePack` objects from
`@aihu/css-engine/packs`, so you can read their tokens or emit their CSS without
re-declaring anything:

```ts
import { aihuDefault, aihuGraphite } from '@aihu/css-engine/packs'

aihuDefault.tokens['color-accent'] // '#c8543a'
aihuDefault.toCss()                // ':root { … } .dark { … }'
aihuGraphite.toCss()               // the monochrome oklch() bundle
```

These objects are the **source of truth** for the shipped `styles/*.css`
bundles below — the CSS files are generated from them (`pack.toCss()`), so the
two access paths can never drift. They are produced by `defineStylePack()`, the
same API external orgs use, so the built-ins carry no privileged shape.

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
Three subpath-exported, verified paths:

**1. Import a built-in CSS bundle directly.** `@aihu/css-engine/styles/aihu-default.css`
and `@aihu/css-engine/styles/aihu-graphite.css` are declared in the package
`exports`, so Vite (and any bundler that handles CSS imports) inlines them into
your app's stylesheet:

```ts
// in your app entry — Vite inlines the CSS, no extra config
import '@aihu/css-engine/styles/aihu-default.css'

// dark mode: toggle the class the pack's `.dark` block targets
document.documentElement.classList.toggle('dark')
```

**2. The built-in packs as JS objects.** Import the ready-made `StylePack`
objects from `@aihu/css-engine/packs` and inject `toCss()` yourself — handy when
you generate the `<style>` at runtime or need to read individual tokens:

```ts
import { aihuDefault } from '@aihu/css-engine/packs'

const style = document.createElement('style')
style.textContent = aihuDefault.toCss()
document.head.appendChild(style)
```

**3. `defineStylePack().toCss()` for a custom pack.** Declare your own token
bundle and inject its CSS the same way:

```ts
import { defineStylePack } from '@aihu/css-engine'
import { appTokens, appDark } from './tokens.ts' // your token maps

const pack = defineStylePack({ name: 'app', tokens: appTokens, dark: appDark })

const style = document.createElement('style')
style.textContent = pack.toCss()
document.head.appendChild(style)
```

> **Source-of-truth note:** the `styles/*.css` bundles are GENERATED from the
> `@aihu/css-engine/packs` objects (`pack.toCss()`), so path #1 and path #2
> emit byte-identical CSS — they cannot drift. The CSS files remain in the
> package `files` list, so they are also on disk at
> `node_modules/@aihu/css-engine/styles/*.css` if you prefer to copy them.

## See also

- [Styling](#styling) — the scoped-output model, WC-native variants, `cn()`
- [API Reference](#api-reference) — full `@aihu/css-engine` export tables
- [Primitives](#primitives) — headless behaviors that consume these tokens
