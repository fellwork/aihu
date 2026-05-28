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

### Effects

| Class | Declaration |
|-------|-------------|
| `shadow` / `-md` / `-lg` / `-none` | `box-shadow: …;` |
| `opacity-*` | `opacity: …;` |

### Z-index

`z-0`, `z-10`, `z-20`, `z-30`, `z-40`, `z-50`, `z-auto` → `z-index: …;`.

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

- `group:` / `peer:` variants
- Container queries (`@container`)
- `aria-*` / `data-*` attribute variants
- Motion utilities: `transform`, `translate-*`, `rotate-*`, `scale-*`, `transition-*`, `duration-*`, `ease-*`, `animate-*`
- `divide-x` / `divide-y` (use `space-x/y` for a similar effect)
- `ring-{n}` widths and `ring-offset-*`
- `top` / `right` / `bottom` / `left` / `inset` named scale (use arbitrary: `top-[1rem]`)
- `leading-*` / `tracking-*` named scale (use arbitrary: `leading-[1.4]`)

## Worked examples

One input → output pair per new family.

### `space-y-4` (Spacing)

```html
<ul class="space-y-4"> … </ul>
```

```css
.space-y-4 { & > * + * { margin-block-start: 1rem; } }
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

## See also

- [Styling](#styling) — how the engine scans and scopes utilities
- [Theming](#theming) — design tokens and style packs
- [API Reference](#api-reference) — `@aihu/css-engine` export tables
