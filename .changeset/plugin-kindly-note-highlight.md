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
