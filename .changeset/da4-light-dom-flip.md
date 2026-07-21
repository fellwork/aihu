---
"@aihu/compiler": major
---

DA4 (#437): pages and layouts default to light DOM (`shadowMode: 'none'`).

Page-level components — those with an `@route` block — and layout SFCs (files
under the configured layouts dir, default `src/layouts/`) now compile to
`shadowMode: 'none'` by default, so server-rendered page content is reachable
by crawlers and agents that do not execute JavaScript. Leaf components (no
`@route` block) keep shadow DOM (`'open'`).

Precedence, in order: a per-file `$shadow` pin > an explicit plugin-global
`shadowMode` config > the page/layout default `'none'` > the leaf default
`'open'`. An unpinned page carries a new `// @aihu:shadow-default none`
marker (distinct from the `$shadow` pin marker) so the implicit default ranks
below an explicit plugin-global config.

Breaking implications:

- A `$shadow`-less `@route` page's `@style` block now joins the global
  cascade instead of being trapped in a shadow root — scope bare element
  selectors under a page root class (see the migration guide §8).
- W472 (the phase-1 advisory that announced this flip) is retired.
- The static-island fast path is skipped for light-DOM components — the shim
  cannot honor `shadowMode: 'none'`; such components keep the full runtime
  path.
