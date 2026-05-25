---
'@aihu-plugin/kindly-note': minor
---

Add `@aihu-plugin/kindly-note`: runtime syntax highlighting for aihu, powered by
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
