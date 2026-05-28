---
"@aihu/css-engine": minor
---

Add the Tailwind-v4 `divide-x-*` / `divide-y-*` sibling-border utilities to the
css-engine token table:

- `divide-x` / `divide-y` — bare forms default to `1px`, emitting the nested
  sibling-border recipe (`& > * + * { border-inline-width | border-block-width: 1px; }`).
- `divide-x-{0,2,4,8}` / `divide-y-{0,2,4,8}` — width scale →
  `& > * + * { border-inline-width | border-block-width: 0 / 2px / 4px / 8px; }`.
- `divide-x-reverse` / `divide-y-reverse` — set the
  `--tw-divide-{x,y}-reverse` custom property for Tailwind API parity.

These reuse the proven `space-x/y` nested `& > * + *` emission path, so they
minify correctly to `.divide-y-2>*+*{border-block-width:2px}` in the production
Vite/Lightning pipeline and survive the scoped CSS-nesting path. `cn()` last-wins
conflict groups are registered per axis. All compile at build time into
per-component scoped CSS; no runtime cost and no change to browser-bundle size
budgets (the logic lives in the `aihu-css-core` Rust crate, which does not ship
to the client).
