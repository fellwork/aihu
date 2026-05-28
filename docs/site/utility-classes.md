# Utility Classes

> Aihu's css-engine ships a focused Tailwind-v4 utility subset compiled at
> build time into per-component scoped CSS. This page is the authoritative
> index of every supported class, every variant, every brand token, and a
> "Not yet supported" callout so you know when to drop to arbitrary values
> or open an issue.

## At a glance

- Compiled by `@aihu/css-engine` from `.aihu` SFCs.
- Output is scoped CSS (shadow DOM by default, light DOM via `shadowMode: 'none'`).
- Unknown classes are silently dropped — there is no "JIT" and no global utility sheet.
- Conflict resolution (`cn()`) is last-wins per property group.

## Class index by family

### Layout (display, position, overflow)

| Class | Declaration |
|-------|-------------|
| `block` / `inline-block` / `inline` | `display: block / inline-block / inline;` |
| `flex` / `inline-flex` | `display: flex / inline-flex;` |
| `grid` / `inline-grid` | `display: grid / inline-grid;` |
| `hidden` | `display: none;` |
| `static` / `relative` / `absolute` / `fixed` / `sticky` | `position: …;` |
| `overflow-auto` / `-hidden` / `-scroll` / `-visible` | `overflow: …;` |

### Flex & Grid alignment

| Class | Declaration |
|-------|-------------|
| `flex-row` / `flex-col` | `flex-direction: row / column;` |
| `flex-wrap` / `flex-nowrap` | `flex-wrap: …;` |
| `items-start` / `-center` / `-end` / `-stretch` | `align-items: …;` |
| `justify-start` / `-center` / `-between` / `-around` / `-end` | `justify-content: …;` |

### Grid templating — NEW

| Class | Declaration |
|-------|-------------|
| `grid-cols-N` | `grid-template-columns: repeat(N, minmax(0, 1fr));` |
| `grid-cols-none` | `grid-template-columns: none;` |
| `grid-rows-N` | `grid-template-rows: repeat(N, minmax(0, 1fr));` |
| `grid-rows-none` | `grid-template-rows: none;` |
| `col-span-N` | `grid-column: span N / span N;` |
| `col-span-full` | `grid-column: 1 / -1;` |
| `col-auto` | `grid-column: auto;` |
| `row-span-N` | `grid-row: span N / span N;` |
| `row-span-full` | `grid-row: 1 / -1;` |
| `row-auto` | `grid-row: auto;` |

`N` is any positive integer.

### Spacing (padding, margin, gap, space-x/y)

Spacing uses the Tailwind scale: each unit is `0.25rem` (so `p-4` → `1rem`),
plus `px` → `1px` and `0` → `0`.

| Class | Declaration |
|-------|-------------|
| `p-*` / `px-*` / `py-*` / `pt-* pr-* pb-* pl-*` | `padding…: <scale>;` |
| `m-*` / `mx-*` / `my-*` / `mt-* mr-* mb-* ml-*` | `margin…: <scale>;` |
| `mx-auto` / `my-auto` / `mt-auto` … — NEW | `margin-inline / margin-block / margin-top: auto;` |
| `gap-*` / `gap-x-*` / `gap-y-*` | `gap…: <scale>;` |
| `space-x-N` — NEW | `& > * + * { margin-inline-start: <scale>; }` |
| `space-y-N` — NEW | `& > * + * { margin-block-start: <scale>; }` |

`space-x/y-*` emit Tailwind's standard sibling-margin recipe as a nested rule
(no margin on the first child; the gap lands on every following sibling).

### Position scale (top/right/bottom/left/inset) — NEW

Inset utilities use the same Tailwind spacing scale as padding/margin (each
unit `0.25rem`, `0` → `0`), plus the `auto` keyword. Prefix the class with `-`
for negative offsets (`-top-4` → `top: -1rem;`). `inset-*` sets all four
sides; `inset-x-*` / `inset-y-*` set the logical inline / block pairs.

| Class | Declaration |
|-------|-------------|
| `top-N` / `right-N` / `bottom-N` / `left-N` | `top / right / bottom / left: <scale>;` |
| `top-auto` / `right-auto` … | `top: auto;` etc. |
| `-top-N` / `-left-N` … (negative) | `top: -<scale>;` etc. |
| `inset-N` | `inset: <scale>;` |
| `inset-0` | `inset: 0;` |
| `inset-x-N` | `inset-inline: <scale>;` |
| `inset-y-N` | `inset-block: <scale>;` |

`N` is any spacing-scale step (e.g. `0`, `2`, `4`, `0.5`). Arbitrary values
still work for one-offs: `top-[3px]`, `inset-[10%]`.

### Sizing (width, height, min/max)

| Class | Declaration |
|-------|-------------|
| `w-*` / `h-*` (scale + fractions) | `width / height: …;` |
| `w-full` / `w-screen` / `w-auto` | `width: 100% / 100vw / auto;` |
| `h-full` / `h-screen` / `h-auto` | `height: 100% / 100vh / auto;` |
| `min-w-*` / `max-w-*` / `min-h-*` / `max-h-*` | min/max sizing |
| `max-w-{xs…7xl}` — NEW | named scale: `20rem … 80rem` |
| `max-w-prose` — NEW | `max-width: 65ch;` |
| `max-w-screen-{sm…2xl}` — NEW | breakpoint widths (`40rem … 96rem`) |
| `max-w-{none,full,min,max,fit}` — NEW | keyword max-widths |

Named `max-w-*` scale: `xs` 20rem, `sm` 24rem, `md` 28rem, `lg` 32rem,
`xl` 36rem, `2xl` 42rem, `3xl` 48rem, `4xl` 56rem, `5xl` 64rem, `6xl` 72rem,
`7xl` 80rem.

### Typography

| Class | Declaration |
|-------|-------------|
| `text-{xs…3xl}` | `font-size` + `line-height` |
| `text-left` / `-center` / `-right` | `text-align: …;` |
| `font-{thin…black}` | `font-weight: …;` |
| `italic` / `not-italic` | `font-style: …;` |
| `underline` / `line-through` / `no-underline` | `text-decoration-line: …;` |
| `uppercase` / `lowercase` / `capitalize` | `text-transform: …;` |
| `truncate` | ellipsis overflow recipe |

#### Leading & tracking scale — NEW

Named line-height (`leading-*`) and letter-spacing (`tracking-*`) scales,
matching the Tailwind v4 defaults. `leading-<n>` (numeric) maps to the spacing
scale (`leading-6` → `1.5rem`); the named steps are unitless multipliers.
Arbitrary values still work: `leading-[1.4]`, `tracking-[.2em]`.

| Class | Declaration |
|-------|-------------|
| `leading-none` | `line-height: 1;` |
| `leading-tight` | `line-height: 1.25;` |
| `leading-snug` | `line-height: 1.375;` |
| `leading-normal` | `line-height: 1.5;` |
| `leading-relaxed` | `line-height: 1.625;` |
| `leading-loose` | `line-height: 2;` |
| `leading-N` | `line-height: <spacing-scale>;` |
| `tracking-tighter` | `letter-spacing: -0.05em;` |
| `tracking-tight` | `letter-spacing: -0.025em;` |
| `tracking-normal` | `letter-spacing: 0em;` |
| `tracking-wide` | `letter-spacing: 0.025em;` |
| `tracking-wider` | `letter-spacing: 0.05em;` |
| `tracking-widest` | `letter-spacing: 0.1em;` |

### Colors (bg, text, border, fill, stroke, ring, outline)

`bg-*`, `text-*`, `border-*`, `fill-*`, `stroke-*` accept both **brand tokens**
(see below) and the **palette** (`bg-red-500`, `text-slate-700`, `bg-white`).
Brand-token classes emit `var(--color-*)`.

### Borders (width incl. directional, radius, color)

| Class | Declaration |
|-------|-------------|
| `border` | `border-width: 1px;` |
| `border-{0,2,4,8}` — NEW | `border-width: 0 / 2px / 4px / 8px;` |
| `border-x-{0,2,4,8}` / `border-y-{…}` — NEW | `border-inline-width` / `border-block-width` |
| `border-t/r/b/l-{0,2,4,8}` — NEW | `border-top/right/bottom/left-width` |
| `rounded` / `-sm` / `-md` / `-lg` / `-full` | `border-radius: …;` |

### Divide (sibling borders)

Borders between adjacent children, reusing the same nested `& > * + *` recipe
as `space-x/y`. The bare form defaults to `1px`.

| Class | Declaration |
|-------|-------------|
| `divide-x` / `divide-y` — NEW | `& > * + * { border-inline-width / border-block-width: 1px; }` |
| `divide-x-{0,2,4,8}` — NEW | `& > * + * { border-inline-width: 0 / 2px / 4px / 8px; }` |
| `divide-y-{0,2,4,8}` — NEW | `& > * + * { border-block-width: 0 / 2px / 4px / 8px; }` |
| `divide-x-reverse` / `divide-y-reverse` — NEW | `& > * + * { --tw-divide-{x,y}-reverse: 1; }` |

Set the border *color* on the same element with the standard color utilities
(e.g. `border-muted`). The `-reverse` tokens keep Tailwind's API surface via the
`--tw-divide-{x,y}-reverse` custom property.

### Effects

| Class | Declaration |
|-------|-------------|
| `shadow` / `-md` / `-lg` / `-none` | `box-shadow: …;` |
| `opacity-*` | `opacity: …;` |

### Ring

A focus ring drawn as a `box-shadow` composed from `--tw-ring-*` custom
properties (the Tailwind v4 recipe), so the ring **width**, **color**, and
**offset** are set independently and layer with a regular `shadow-*`.

| Class | Declaration |
|-------|-------------|
| `ring` — NEW | 3px ring (`box-shadow` from `--tw-ring-*`) |
| `ring-{0,1,2,4,8}` — NEW | ring at that pixel width: `--tw-ring-shadow: … calc({n}px + var(--tw-ring-offset-width)) var(--tw-ring-color);` |
| `ring-inset` — NEW | `--tw-ring-inset: inset;` (draws the ring inside the edge) |
| `ring-offset-{0,1,2,4,8}` — NEW | `--tw-ring-offset-width: {n}px;` (gap between the element and the ring) |
| `ring-<color>` | sets the ring **color**: `--tw-ring-color: var(--color-*);` |

The width side (`ring-{n}`) and the color side (`ring-<color>`) are
complementary — use them together, e.g. `focus:ring-2 ring-blue-500`. The color
path is unchanged; `ring-blue-500`, `ring-primary`, `ring-ring` etc. still emit
`--tw-ring-color`.

### Z-index

`z-0`, `z-10`, `z-20`, `z-30`, `z-40`, `z-50`, `z-auto` → `z-index: …;`.

## Motion — NEW

Round-2 motion utilities cover transforms, transitions, and animations. Each
transform utility (`translate-*`, `rotate-*`, `scale-*`) emits a **single
`transform:` declaration** rather than composing CSS variables — so within one
element the CSS cascade applies last-wins per family. To combine transforms
(e.g. translate *and* rotate) on one element, use an arbitrary value
(`transform-[...]` is not yet wired; compose with a custom `@style` rule).

### transform / translate

| Class | Declaration |
|-------|-------------|
| `transform` | identity baseline (`translate(0,0) rotate(0) … scaleX(1) scaleY(1)`) |
| `transform-none` | `transform: none;` |
| `translate-x-N` / `translate-y-N` | `transform: translateX/Y(<spacing-scale>);` |
| `-translate-x-N` / `-translate-y-N` | negative translate (e.g. `-0.5rem`) |

`translate-*` uses the spacing scale (`translate-x-2` → `0.5rem`). The leading
`-` produces the negative form.

### rotate / scale

| Class | Declaration |
|-------|-------------|
| `rotate-N` | `transform: rotate(Ndeg);` |
| `-rotate-N` | `transform: rotate(-Ndeg);` |
| `scale-N` | `transform: scale(N/100);` (e.g. `scale-105` → `1.05`) |
| `scale-x-N` / `scale-y-N` | `transform: scaleX/Y(N/100);` |

### transition / duration / ease

| Class | Declaration |
|-------|-------------|
| `transition` | default property set + `150ms` + `cubic-bezier(0.4, 0, 0.2, 1)` |
| `transition-none` | `transition-property: none;` |
| `transition-all` | `transition-property: all;` + default timing |
| `transition-colors` | color/bg/border/decoration/fill/stroke + default timing |
| `transition-opacity` | `transition-property: opacity;` + default timing |
| `transition-transform` | `transition-property: transform;` + default timing |
| `duration-N` | `transition-duration: Nms;` |
| `ease-linear` | `transition-timing-function: linear;` |
| `ease-in` / `ease-out` / `ease-in-out` | cubic-bezier easing functions |

### animate

| Class | Declaration |
|-------|-------------|
| `animate-none` | `animation: none;` |
| `animate-spin` | `animation: spin 1s linear infinite;` + `@keyframes spin` |
| `animate-ping` | `animation: ping …;` + `@keyframes ping` |
| `animate-pulse` | `animation: pulse …;` + `@keyframes pulse` |
| `animate-bounce` | `animation: bounce 1s infinite;` + `@keyframes bounce` |

Each `animate-*` (except `animate-none`) emits its **`@keyframes` block as a
top-level sibling rule** alongside the class rule — keyframes cannot be nested
inside a selector body. Re-emitting an identical block is idempotent in CSS.

## Variants

- **Web-Component-native:** `host:`, `slotted:`, `slotted-<tag>:`, `part-<name>:`, `host-context-<name>:`
- **Pseudo:** `hover:`, `focus:`, `focus-visible:`, `active:`, `disabled:`, `visited:`, `checked:`
- **Responsive (min-width):** `sm:` 40rem, `md:` 48rem, `lg:` 64rem, `xl:` 80rem, `2xl:` 96rem (override via `@theme`)
- **Dark mode:** `dark:` (Firefox-safe `[data-theme="dark"]` / `.dark` cascade)
- **Arbitrary selectors:** `[&>li]:`, `[&:has(img)]:`, etc.
- **Stacking:** `md:hover:bg-primary` — left-to-right composition

## Brand tokens (16)

Override any token in a component's `@style` block via
`@theme { --color-primary: oklch(...); }`.

| Token | Token |
|-------|-------|
| `primary` / `primary-foreground` | `secondary` / `secondary-foreground` |
| `accent` / `accent-foreground` | `surface` / `surface-foreground` |
| `destructive` / `destructive-foreground` | `background` / `foreground` |
| `muted` / `muted-foreground` | `border` / `ring` |

Use as `bg-primary`, `text-accent`, `border-muted`, `ring-ring`, etc.

## Palette

22 color families × 11 shades (`50`–`950`), matching the Tailwind v4 palette
(e.g. `bg-red-500`, `text-slate-700`, `border-zinc-200`). See the
[Tailwind v4 color palette](https://tailwindcss.com/docs/colors) for the full
swatch list.

## Arbitrary values

Use `prefix-[value]` to bypass the scale for: `bg`, `text`, `w`, `h`, `min-w`,
`max-w`, `min-h`, `max-h`, `p`, `px`, `py`, `m`, `mx`, `my`, `gap`, `rounded`,
`border`, `leading`, `tracking`, `z`, `top`, `right`, `bottom`, `left`,
`inset`, `fill`, `stroke`, `shadow`.

```
bg-[#1a1d24]   →  background-color: #1a1d24;
w-[34ch]       →  width: 34ch;
top-[1rem]     →  top: 1rem;
```

## Not yet supported

> The following are deliberately out of scope today. Most have an
> arbitrary-value workaround; the rest require variant-parser changes. Open an
> issue if you need one promoted.

- Container queries (`@container`)
- `aria-*` / `data-*` attribute variants

## Worked examples

One input → output pair per new family.

### `space-y-4` (Spacing)

```html
<ul class="space-y-4"> … </ul>
```

```css
.space-y-4 { & > * + * { margin-block-start: 1rem; } }
```

### `divide-y-2` (Divide — sibling borders)

```html
<ul class="divide-y-2 border-muted"> … </ul>
```

```css
.divide-y-2 { & > * + * { border-block-width: 2px; } }
```

### `mx-auto` (Margin auto)

```html
<div class="mx-auto"> … </div>
```

```css
.mx-auto { margin-inline: auto; }
```

### `max-w-7xl` (Named max-width)

```html
<section class="max-w-7xl"> … </section>
```

```css
.max-w-7xl { max-width: 80rem; }
```

### `grid-cols-3` (Grid templating)

```html
<div class="grid grid-cols-3 gap-4"> … </div>
```

```css
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
```

### `border-t-4` (Directional border width)

```html
<div class="border-t-4"> … </div>
```

```css
.border-t-4 { border-top-width: 4px; }
```

### `absolute top-4 right-4` (Position scale)

```html
<button class="absolute top-4 right-4"> … </button>
```

```css
.top-4 { top: 1rem; }
.right-4 { right: 1rem; }
```

### `leading-relaxed` (Line-height scale)

```html
<p class="leading-relaxed"> … </p>
```

```css
.leading-relaxed { line-height: 1.625; }
```

### `tracking-wide` (Letter-spacing scale)

```html
<h1 class="tracking-wide"> … </h1>
```

```css
.tracking-wide { letter-spacing: 0.025em; }
```

### `ring-2 ring-blue-500` (Ring width + color)

```html
<button class="focus:ring-2 ring-blue-500"> … </button>
```

```css
.ring-2 {
  --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
  --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);
  box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);
}
.ring-blue-500 { --tw-ring-color: var(--color-blue-500); }
```

### `ring-offset-2` (Ring offset width)

```html
<div class="ring-2 ring-offset-2"> … </div>
```

```css
.ring-offset-2 { --tw-ring-offset-width: 2px; }
```

### `hover:scale-105` + `transition-transform` (Motion)

```html
<button class="transition-transform duration-300 hover:scale-105"> … </button>
```

```css
.transition-transform { transition-property: transform; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.duration-300 { transition-duration: 300ms; }
.hover\:scale-105:hover { transform: scale(1.05); }
```

### `animate-spin` (Animation with hoisted keyframes)

```html
<div class="animate-spin"> … </div>
```

```css
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
```

## See also

- [Styling](#styling) — how the engine scans and scopes utilities
- [Theming](#theming) — design tokens and style packs
- [API Reference](#api-reference) — `@aihu/css-engine` export tables
