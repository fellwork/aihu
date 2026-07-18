# @aihu-plugin/kindly-note

## 0.2.2

### Patch Changes

- Updated dependencies [[`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3)]:
  - @aihu/signals@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f)]:
  - @aihu/signals@0.2.0

## 0.2.0

### Minor Changes

- [#209](https://github.com/fellwork/aihu/pull/209) [`a4e45a7`](https://github.com/fellwork/aihu/commit/a4e45a78769744f35c9df8d3fe2cff901b454f43) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add `@aihu-plugin/kindly-note`: runtime syntax highlighting for aihu, powered by
  the published v0.1.0 `@kindly-note/*` packages. Ships an `<aihu-code>` custom
  element and a signal-aware `highlight()` helper that render scoped-span HTML in
  the browser, with lazy-loaded per-language tokenizers (loaded on first use via
  `@kindly-note/loader-dynamic-import`). Markdown rendering (`<aihu-markdown>` /
  `renderMarkdown`) is intentionally out of scope this round — it depends on the
  unbuilt `@kindly-note/emitters-markdown`.

  The three `@kindly-note/*` packages (`core`, `emitters-html`,
  `loader-dynamic-import`) are **optional peer dependencies** and are imported
  **lazily** via dynamic `import()` inside `highlight()` / `ensureLanguage()`.
  Importing `@aihu-plugin/kindly-note` and defining `<aihu-code>` therefore require
  none of them installed — they are resolved only when `highlight()` actually
  runs, and when absent at call time `highlight()` degrades to HTML-escaped plain
  text (`fallback: true`) rather than throwing. This keeps the package import-safe
  and on the dep-free browser-bundle thesis (per-package size row holds).

- [#223](https://github.com/fellwork/aihu/pull/223) [`91da506`](https://github.com/fellwork/aihu/commit/91da506bbc3c3830c1f4241d45e60b21edec6a8b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the markdown-rendering half to `@aihu-plugin/kindly-note` (0.1.0 → 0.2.0),
  the sibling of the existing highlighting half. Ships an `<aihu-markdown>` custom
  element and a signal-aware `renderMarkdown()` helper that render CommonMark to
  **safe** semantic HTML in the browser, powered by the published
  `@kindly-note/render-markdown@0.1.0` (one-call wrapper over
  `@kindly-note/lang-markdown` + `@kindly-note/emitters-markdown`). The emitter is
  security-first by default: raw HTML is escaped, `javascript:`/unsafe `data:`
  URLs are neutralised, and `on*` handlers are never emitted — so the output is
  safe to assign to `innerHTML` / `nodeValue`. `<aihu-markdown>` renders into an
  open shadow root and re-renders reactively when its `source`/`markdown` is set
  to a signal reader. CommonMark only — GFM stays out of scope
  (`@kindly-note/lang-markdown-gfm`).

  `@kindly-note/render-markdown` is an **optional peer dependency**, imported
  **lazily** via dynamic `import()` inside `renderMarkdown()` (mirroring the
  highlight half). Importing `@aihu-plugin/kindly-note` and defining
  `<aihu-markdown>` therefore require none of the `@kindly-note/*` peers installed
  — `@kindly-note/render-markdown` is resolved only when `renderMarkdown()`
  actually runs, and `<aihu-markdown>` degrades to escaped text (never raw, never
  throwing into its render effect) when the peer is absent. The `@kindly-note/core`
  peer is bumped to `^0.2.0` (required by `@kindly-note/render-markdown`). All
  `@kindly-note/*` deps stay externalized, so the per-package browser-bundle size
  row holds; the row limit is raised 1500 B → 1850 B to cover the second element +
  helper (measured 1.66 kB gz).
