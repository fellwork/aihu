---
"@aihu/compiler": major
"@aihu/runtime": major
"@aihu/app": major
"@aihu/cli": major
---

DA4 (#437): the binary shadow API (`'light' | 'shadow'`) and light-DOM-by-default pages — one breaking change.

**The API.** `ShadowMode` collapsed to a BINARY `'light' | 'shadow'`; the
`'open'`, `'closed'`, and `'none'` tokens are retired everywhere (the
`$shadow` macro, the plugin-global `shadowMode` config /
`css: { shadowMode }`, the runtime `defineElement` options, and the CLI
`--shadow` flag). `'shadow'` attaches an OPEN root internally — open is the
only browser mode aihu's composition/hydration can use; `'closed'` was
self-contradictory (a closed root nulls `this.shadowRoot`, so light-DOM
detection misclassified it and content rendered into the host anyway).
`'light'` attaches no root, so `this.shadowRoot === null` is an unambiguous
detection. Migration: `'open'` → `'shadow'`, `'none'` → `'light'`,
`'closed'` → `'shadow'`.

**The defaults.** Page-level components — those with an `@route` block — and
layout SFCs (files under the configured layouts dir, default `src/layouts/`)
now default to `'light'`, so server-rendered page content is reachable by
crawlers and agents that do not execute JavaScript. Leaf components (no
`@route`) default to `'shadow'` (behaviorally the old `'open'` default).

Precedence, in order: a per-file `$shadow` pin > an explicit plugin-global
`shadowMode` config > the page/layout default `'light'` > the leaf default
`'shadow'`. An unpinned page carries a new `// @aihu:shadow-default light`
marker (distinct from the `$shadow` pin marker) so the implicit default ranks
below an explicit plugin-global config.

Breaking implications:

- Retired tokens fail loudly: `$shadow` with an old token is a C471 compile
  error; `css.shadowMode` with one throws at config validation; `--shadow`
  with one warns and falls back to the default.
- A `$shadow`-less `@route` page's `@style` block now joins the global
  cascade instead of being trapped in a shadow root — scope bare element
  selectors under a page root class (see the migration guide §8).
- W472 (the phase-1 advisory that announced this flip) is retired.
- The static-island fast path is skipped for light-DOM components — the shim
  cannot honor `shadowMode: 'light'`; such components keep the full runtime
  path.
- css-engine scaffolds now always emit an explicit `css: { shadowMode }`
  block carrying the wizard's `--shadow` choice (default `'shadow'`), since
  the page default would otherwise override it.
