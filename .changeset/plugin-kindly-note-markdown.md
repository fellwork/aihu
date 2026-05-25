---
'@aihu-plugin/kindly-note': minor
---

Add the markdown-rendering half to `@aihu-plugin/kindly-note` (0.1.0 → 0.2.0),
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
