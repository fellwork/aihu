---
'@aihu/app': minor
'@aihu/compiler': patch
'@aihu/css-engine': patch
---

Forward `shadowMode` through `viteAihuPlugin` for utility-class CSS frameworks.

- **`@aihu/app`** — new `css.shadowMode` option on `AihuConfig`. When set, it
  forwards to the compiler's per-plugin `shadowMode` injection
  (`'open' | 'closed' | 'none'`). Required for consumers of
  `@aihu/css-engine` (and other cascade-dependent CSS frameworks) so the
  utility classes the compiler folds in are not trapped inside a shadow root.
  Default behaviour is unchanged.
- **`@aihu/compiler`** — `_maybeCompileUtilityCss` now emits a one-shot
  `console.warn` when `@aihu/css-engine` resolves but `compileSfc()` throws
  (typically: the native `aihu-css-core` binary is unresolvable). Build is
  still non-fatal; previously this case was completely silent and users
  could not discover why their utility classes never emitted.
- **`@aihu/css-engine`** — README now documents the canonical
  `viteAihuPlugin({ css: { shadowMode: 'none' } })` wiring and points to the
  new `examples/css-engine-utility/` end-to-end example.
