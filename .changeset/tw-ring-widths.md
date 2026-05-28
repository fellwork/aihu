---
"@aihu/css-engine": minor
---

Add Tailwind-v4 ring width + ring-offset utilities to the css-engine token table:

- `ring` (3px default) and `ring-{0,1,2,4,8}` — emit the Tailwind v4 focus-ring
  recipe: a `box-shadow` composed from `--tw-ring-*` custom properties
  (`--tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(<n>px + var(--tw-ring-offset-width)) var(--tw-ring-color);`),
  so width, color, and offset compose independently and layer with `shadow-*`.
- `ring-inset` — sets `--tw-ring-inset: inset;`.
- `ring-offset-{0,1,2,4,8}` — sets `--tw-ring-offset-width: <n>px;`.

The existing `ring-<color>` path is unchanged: `ring-blue-500`, `ring-primary`,
`ring-ring`, etc. still emit `--tw-ring-color: var(--color-*)`. The bare `ring`
keyword (a width) is matched before the color path so it never collides with a
color token, and all `ring*` utilities already last-wins under the existing
`ring` conflict-group prefix.

Build-time only — the new logic lives in the `aihu-css-core` Rust crate, which
does not ship to the client, so there is no browser-bundle size impact.
