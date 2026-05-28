---
"@aihu/css-engine": minor
---

Add five Tailwind-v4 utility families to the css-engine token table:

- `space-x-*` / `space-y-*` — emit the standard sibling-margin recipe
  (`& > * + * { margin-inline-start | margin-block-start: <scale>; }`).
- `mx-auto` / `my-auto` (and `mt/mr/mb/ml-auto`) — `spacing_value` now
  accepts `auto`.
- `max-w-*` named scale — `max-w-xs`…`max-w-7xl`, `max-w-prose`,
  `max-w-screen-*`, and the `none/full/min/max/fit` keywords.
- Grid templating — `grid-cols-N` / `grid-rows-N` → `repeat(N, minmax(0, 1fr))`,
  `col-span-N` / `row-span-N` → `span N / span N`, plus the `none`/`full`/`auto`
  keyword forms.
- Border widths — `border-{0,2,4,8}` and directional
  `border-x/y/t/r/b/l-{0,2,4,8}`.

All compile at build time into per-component scoped CSS; no runtime cost and no
change to browser-bundle size budgets (the new logic lives in the `aihu-css-core`
Rust crate, which does not ship to the client).
