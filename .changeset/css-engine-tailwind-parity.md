---
"@aihu/css-engine": minor
---

Tailwind-v4 utility parity — render full Tailwind-authored pages on the engine.

Expands the `aihu-css-core` utility table and fixes two correctness bugs so a
marketing page authored against full Tailwind v4 compiles entirely on the engine
(under shadow DOM), instead of silently dropping ~230 unsupported utilities.

- **New families**: `size-*`, `aspect-*`, gradients (`bg-linear/gradient-to-*`,
  `from/via/to`), `mask-*`, `blur`/`backdrop-blur`, `isolate`, `transform-gpu`,
  outline width/offset, `shadow-xs/xl/2xl/inner`, `rounded-3xl/4xl`,
  `font-serif`, `text-6xl…9xl` + `text-<size>/<lh>` slash line-height,
  `text-wrap/pretty/balance`, `cursor-*`, `list-*`, `sr-only`, `self-*`,
  `shrink/grow`, `order-*`, negative margins, fractional positions, `-z-*`.
- **Arbitrary color typing**: `border-[…]`/`outline-[…]`/`ring-[…]` are now
  color-vs-width typed by value (`border-[var(--c)]` → `border-color`, not the
  previous invalid `border-width`); `[color:]`/`[length:]` hints honored.
- **`(--var)` shorthand**: `prefix-(--token)` resolves through the prefix's
  property type (`border-(--c)` is a color), with `/opacity` via color-mix.
- **Palette**: the scoped emitter registers the Tailwind-v4 oklch value for each
  `--color-<family>-<shade>` a component references (used tokens only), so
  `bg-amber-500` etc. resolve at `:host`.
- **Variants**: `open`, `first/last/only/odd/even/empty`, pseudo-elements
  `marker/placeholder/before/after/selection/file`, and `group-open`/`peer-open`.

No JS API or CLI change — utility table + scoped emission only. The native
`aihu-css-compile` binary is rebuilt from these sources by the existing
`publish-css-native` release job.
