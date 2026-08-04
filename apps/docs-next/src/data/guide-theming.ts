/**
 * Theming guide body. Ported from apps/docs/src/content/docs/guides/theming.md
 * and UPDATED against the shipped packs — the original predated two additive
 * waves and understated the contract by a third:
 *
 *   - The daisyUI port (D4 §3.4, E1+E2) added eight semantic-state /
 *     filled-surface color tokens: info/success/warning/neutral + foregrounds.
 *     The old table listed 16 color tokens; the contract is 24.
 *   - The same work plus the performativeUI port added NON-COLOR scalars the
 *     old page never mentioned at all: --size-selector, --size-field, --border,
 *     --depth, --noise, --gradient-brand, --font-serif, --ease-brand. These
 *     are not bg-/text-/border- utility roles, which is exactly why they were
 *     easy to miss, and why style-pack.test.ts asserts them in a separate list.
 *
 * Verified against packages/css-engine/src/packs.ts and
 * packages/css-engine/tests/style-pack.test.ts at the time of writing. The
 * accurate parts of the original — defineStylePack, named themes, the cascade
 * ordering rule, and the :root-only alias pitfall — are kept close to
 * verbatim; they were correct and are still correct.
 *
 * Fenced code uses ~~~ and inline code uses <code> so the source carries no
 * raw backticks inside this template literal.
 */
export const THEMING = `# Theming

aihu themes components with <strong>design tokens</strong> — CSS custom properties the <code>@aihu/css-engine</code> utility table resolves against. A utility like <code>bg-primary</code> compiles to <code>background-color: var(--color-primary)</code>; the <em>value</em> of that token comes from a <strong>style pack</strong>. Swap the pack and every component re-themes with no markup change, because the token <em>names</em> are the contract and the <em>values</em> are interchangeable.

For the broader styling model — scoped output, WC-native variants, <code>cn()</code> — see [Styling](/guides/styling).

## The design-token contract

A token is a CSS custom property. Throughout this page and the <code>defineStylePack()</code> API, token names are written <strong>without the leading <code>--</code></strong>; the engine adds it.

### Color tokens

These are the <strong>brand</strong> tokens: the ones the utility table resolves <code>bg-*</code>, <code>text-*</code> and <code>border-*</code> against. Every pack must declare all 24, or some utility somewhere resolves to a dangling <code>var()</code>.

| Role | Tokens |
|------|--------|
| Core | <code>color-primary</code>, <code>color-primary-foreground</code>, <code>color-secondary</code>, <code>color-secondary-foreground</code>, <code>color-accent</code>, <code>color-accent-foreground</code> |
| Surfaces | <code>color-surface</code>, <code>color-surface-foreground</code>, <code>color-background</code>, <code>color-foreground</code> |
| Support | <code>color-muted</code>, <code>color-muted-foreground</code>, <code>color-border</code>, <code>color-ring</code> |
| Semantic state | <code>color-destructive</code>, <code>color-destructive-foreground</code>, <code>color-info</code>, <code>color-info-foreground</code>, <code>color-success</code>, <code>color-success-foreground</code>, <code>color-warning</code>, <code>color-warning-foreground</code> |
| Filled surface | <code>color-neutral</code>, <code>color-neutral-foreground</code> |

Every color role is <strong>paired</strong> with a <code>-foreground</code>. That is not decoration: the pairing is what makes a role safe to use as a background, and the contrast of every pair is verified against WCAG tiers by <code>.tastemaker/check_contrast.py --pairings</code>. If you author a pack, run it — a role whose foreground fails contrast is a bug in the pack, not a matter of taste.

### Non-color scalars

Packs also declare scalars that are <strong>not</strong> part of the <code>bg-</code>/<code>text-</code>/<code>border-</code> utility path. Recipes and components reference them directly as <code>var(--border)</code> and friends, so a pack that omits them leaves those components unstyled rather than mis-styled:

| Group | Tokens |
|-------|--------|
| Radius | <code>radius-sm</code>, <code>radius-md</code>, <code>radius-lg</code>, <code>radius-pill</code> |
| Spacing | <code>space-1</code>, <code>space-2</code>, <code>space-3</code>, <code>space-4</code>, <code>space-6</code>, <code>space-8</code>, <code>space-12</code>, <code>space-16</code> |
| Typography | <code>font-sans</code>, <code>font-mono</code>, <code>font-serif</code> |
| Control metrics | <code>size-selector</code>, <code>size-field</code>, <code>border</code>, <code>depth</code>, <code>noise</code> |
| Expressive | <code>gradient-brand</code>, <code>ease-brand</code> |

<code>font-serif</code> is worth calling out. The <code>font-serif</code> utility has existed in the table for a long time, emitting <code>font-family: var(--font-serif)</code> — but no pack defined the token, so the utility was silently dangling. It is part of the contract now.

## The two shipped packs

Both declare the <strong>same token names</strong> — only values differ — so they are drop-in interchangeable:

- <strong><code>aihu-default</code></strong> — the aihu brand palette (warm paper and ink, accent <code>#c8543a</code>). Light values in <code>:root</code>, dark overrides in <code>.dark, [data-theme="dark"]</code>.
- <strong><code>aihu-graphite</code></strong> — a neutral monochrome ramp in <code>oklch()</code> (chroma ≈ 0), same names, same structure.

A pack emits a light block under <code>:root</code>, an optional dark block under <code>.dark, [data-theme="dark"]</code>, and one <code>[data-theme="&lt;name&gt;"]</code> block per named theme.

## How tokens reach scoped components

Custom properties <strong>inherit through the shadow boundary</strong>. A pack declared once on <code>:root</code> flows into every component on the page, shadow-scoped or not. There is no per-component theme wiring.

That inheritance is the whole mechanism, and it is why the aliasing pitfall below bites.

> <strong>Caveat — <code>dark:</code> utilities.</strong> The dark block is dual-keyed on both <code>.dark</code> and <code>[data-theme="dark"]</code>, so token <em>values</em> flip either way. The <code>dark:</code> <em>variant</em> compiles to a <code>:root.dark</code> / <code>:host([data-theme])</code> gate, so a page that sets only <code>data-theme="dark"</code> on <code>&lt;html&gt;</code> gets correct token values but not <code>dark:</code>-variant rules. If you use <code>dark:</code> variants, set the <code>.dark</code> class as well.

## The packs as JS objects

~~~ts
import { aihuDefault, aihuGraphite } from '@aihu/css-engine/packs'

aihuDefault.tokens['color-accent'] // '#c8543a'
aihuDefault.toCss()                // ':root { … } .dark, [data-theme="dark"] { … }'
~~~

These objects are the <strong>source of truth</strong> for the shipped <code>styles/*.css</code> bundles — the CSS is generated from them via <code>pack.toCss()</code>, so the two access paths cannot drift. They are produced by <code>defineStylePack()</code>, the same API you would use, so the built-ins carry no privileged shape.

## <code>defineStylePack()</code> — custom packs

~~~ts
import { defineStylePack } from '@aihu/css-engine'

const acme = defineStylePack({
  name: 'acme',
  tokens: { 'color-primary': '#0a7', 'radius-md': '6px' },
  dark: { 'color-primary': '#3fc' },
})

acme.toCss()
// :root { --color-primary: #0a7; --radius-md: 6px; }
// .dark, [data-theme="dark"] { --color-primary: #3fc; }
~~~

The returned <code>StylePack</code> carries <code>name</code>, <code>tokens</code>, <code>dark</code>, <code>themes</code>, <code>themeNames</code>, and <code>toCss()</code>.

Token names normalize whether or not you write the leading <code>--</code>. An empty <code>name</code> or empty <code>tokens</code> map throws. Declare only what you override — or the full contract above if you want a stand-alone pack with no dangling utilities.

## Named themes

Beyond light and dark, a pack can declare any number of named themes. Each emits its own <code>[data-theme="&lt;name&gt;"]</code> block:

~~~ts
const acme = defineStylePack({
  name: 'acme',
  tokens: { 'color-primary': '#0a7', 'color-background': '#fff' },
  dark:   { 'color-primary': '#3fc' },
  themes: {
    cupcake: { 'color-primary': '#65c3c8', 'color-background': '#faf7f5' },
    dracula: { 'color-primary': '#ff79c6' },
  },
})

acme.themeNames // ['cupcake', 'dracula']
~~~

A named theme is an <strong>override layer over <code>tokens</code></strong>, not a standalone theme — list only what differs, exactly as <code>dark</code> works.

<strong>Order is the cascade.</strong> <code>:root</code>, the dark block and every <code>[data-theme]</code> block have identical (0,1,0) specificity, so the last match wins. <code>toCss()</code> emits them in that order deliberately: with <code>&lt;html class="dark" data-theme="cupcake"&gt;</code> you get cupcake, because an explicit selection should beat an inherited one.

Theme names must match <code>/^[a-z][a-z0-9-]*$/</code>, since they become attribute selectors. <code>dark</code> is reserved — use the <code>dark</code> field.

## Applying a pack

<strong>1. Import a built-in CSS bundle.</strong> Both bundles are declared in the package <code>exports</code>, so Vite inlines them:

~~~ts
import '@aihu/css-engine/styles/aihu-default.css'

document.documentElement.classList.toggle('dark')
~~~

<strong>2. Inject <code>toCss()</code> yourself</strong> — for runtime-generated <code>&lt;style&gt;</code>, or when you need to read individual tokens:

~~~ts
import { aihuDefault } from '@aihu/css-engine/packs'

const style = document.createElement('style')
style.textContent = aihuDefault.toCss()
document.head.appendChild(style)
~~~

<strong>3. A custom pack</strong> — same shape, your tokens:

~~~ts
import { defineStylePack } from '@aihu/css-engine'
import { appTokens, appDark } from './tokens.ts'

const pack = defineStylePack({ name: 'app', tokens: appTokens, dark: appDark })
document.head.appendChild(
  Object.assign(document.createElement('style'), { textContent: pack.toCss() }),
)
~~~

## Aliasing pack tokens

If you layer your own semantic properties over the pack's <code>--color-*</code> tokens, declare the alias under <strong>every theme selector the pack uses</strong> — not just <code>:root</code>:

~~~css
/* re-resolves per theme */
:root, .dark, [data-theme="dark"] {
  --surface: var(--color-surface);
  --ink: var(--color-foreground);
}
~~~

A <code>:root</code>-only alias silently breaks dark mode:

~~~css
/* freezes the LIGHT value */
:root {
  --surface: var(--color-surface);
}
~~~

Custom properties are computed <strong>where they are declared</strong>. A <code>:root</code>-only alias resolves <code>var(--color-surface)</code> against the light value once, and that fixed value then inherits into <code>.dark</code> containers and every shadow root beneath them. The symptom is a half-dark page: elements using <code>--color-*</code> directly flip, while elements using the alias stay light.

## See also

- [Styling](/guides/styling) — scoped output, WC-native variants, <code>cn()</code>
- [Utility Classes](/guides/utility-classes) — the full utility index
- [Primitives](/guides/primitives) — headless behaviors that consume these tokens
- [@aihu/css-engine](/api/css-engine) — the export tables
`
