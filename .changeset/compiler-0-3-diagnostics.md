---
"@aihu/compiler": patch
---

0.3.0 migration diagnostics fixes (downstream-reported, lehman-realty):

- **C204** — error on an unknown top-level SFC block (e.g. a removed
  `@props { }` block) instead of silently dropping it, which previously turned
  an authoring mistake into a blank production page. (Bug 5)
- **Cross-block reference diagnostic** now recognizes `$prop:` keys,
  `$computed:` keys, and plain `@state` `const`/`let` bindings as declared, and
  scans v1 single-curly `{ }` interpolations (not only legacy `{{ }}`) — no more
  false positives on correctly-migrated code (which would otherwise become a
  v0.4 hard error). (Bug 7)
- **C205** — error when a plain `@state` `const` reads a prop (a temporal
  dead-zone trap), directing authors to read props in `$computed`. (Bug 8)
- **W210** — warn on `$on.<non-event>` (e.g. `$on.html`) dead attributes, and
  make `C305` point at `$html={…}` for innerHTML intent. (Bug 9a/9b)
