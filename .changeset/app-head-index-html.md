---
"@aihu/app": patch
---

Inject `app.head` into the built `index.html`. `AihuConfig.app.head`
(`title`, `charset`, `viewport`, `meta[]`) was accepted by `defineConfig()`
but never read by any plugin, so the configured global head was silently
dropped from SPA/static output — bad for SEO and non-JS agents.

`viteAihuPlugin()` now registers an `aihu-head` plugin whose
`transformIndexHtml` hook applies the configured head. Precedence is
**config overrides source**: when the source `index.html` already declares a
tag that `app.head` also configures (title, charset, viewport, or a meta with
a matching `name`/`property`), the configured value replaces the source value
in place — no duplicate `<title>`/charset/meta is emitted. Tags present only
in config are injected before `</head>`. Values are HTML-escaped.
