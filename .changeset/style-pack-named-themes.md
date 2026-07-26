---
'@aihu/css-engine': minor
---

**`defineStylePack()` gains a named-theme dimension, and the dark block is dual-keyed on
`.dark` and `[data-theme="dark"]`.**

`StylePackInput` admitted exactly two themes: `tokens` (emitted at `:root`) and an optional
`dark` (emitted at `.dark`). There was no way to express a third named theme at all, which is
the dimension a swappable theme catalog needs. This is the first slice of the Option 4 design
(`docs/plans/2026-07-26-option-4-daisyui-design.md`).

**Named themes.** A pack may now declare `themes: Record<string, TokenMap>`; each entry emits
its own `[data-theme="<name>"] { … }` block and is selected by putting `data-theme="<name>"` on
an ancestor — per the founder-ratified convention, `<html>`.

```ts
const pack = defineStylePack({
  name: 'acme',
  tokens: { 'color-primary': '#0a7' },
  dark:   { 'color-primary': '#3fc' },
  themes: { cupcake: { 'color-primary': '#65c3c8' } },
})
pack.themeNames // ['cupcake']
```

A named theme is an **override layer over `tokens`**, not a standalone theme — only the names
that differ need listing, exactly as `dark` already works. The descriptor exposes `themes` and
`themeNames`.

**Dual-keyed dark.** The dark block's selector changes from `.dark` to
`.dark, [data-theme="dark"]` (exported as `DARK_SELECTOR`). One block, one comma-list, no
duplicated declarations. This is additive: every existing `.dark` consumer is untouched, and
`<html data-theme="dark">` now resolves correct token values for the first time.

**One thing it does not yet do.** `dark:`-variant *utility rules* are still gated on
`:host([data-theme="dark"])` / `:root.dark` by the Rust emitter, neither of which matches
`data-theme` on the document root. So a page on `data-theme="dark"` **alone** gets correct token
values but not `dark:`-variant utilities until that follow-up lands. No shipped consumer is
affected — nothing in the repo sets `data-theme` on a document root today; the only writer is
the Storybook decorator, which stamps it on component hosts, the selector the emitter already
handles. This is a partially-complete new capability, not a regression.

**Emission order is load-bearing.** `:root`, `.dark`/`[data-theme="dark"]`, and each named theme
all weigh (0,1,0), so the last matching block wins. Named themes are therefore emitted last:
`<html class="dark" data-theme="cupcake">` resolves to cupcake, because an explicit selection
should beat an inherited one. Pinned by test.

Validation: `dark` is rejected as a named theme (it has its own dual-keyed selector); theme names
must match `/^[a-z][a-z0-9-]*$/`, since they become attribute selectors; a theme declaring no
tokens is rejected.

`toCss()` now renders comma-separated selector lists one selector per line. That is not
cosmetic: the generated bundles are byte-parity tested against `toCss()` *and* biome-checked,
and biome's CSS formatter splits comma lists — so emitting one on a single line would let the
pre-commit hook reformat the generated file out from under the parity test. `formatSelectorList`
is exported and the canonical form is pinned by a test.

Neither shipped pack declares a named theme — `aihu-default.css` and `aihu-graphite.css` change
by exactly one line each, the dark selector. A test pins that, so a catalog landing on the
default pack is a visible diff rather than silent drift.
