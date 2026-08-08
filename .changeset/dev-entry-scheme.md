---
'@aihu/app': patch
---

Fix the dev server serving a blank page on every new scaffolded project.

`injectEntryScript` wrote `<script type="module" src="virtual:aihu-entry">` —
a bare specifier. A `<script src>` is resolved by the BROWSER as a URL, and
`virtual:aihu-entry` parses as a URL with scheme `virtual`, which Chromium
rejects outright ("Cross origin requests are only supported for protocol
schemes: chrome, data, http, https"). Every `aihu dev` session failed silently
on first load with a CORS error in the console and nothing on the page.

Now emits `/virtual:aihu-entry` — a same-origin absolute path, Vite's own
documented convention for referencing a virtual module from HTML. The plugin's
`resolveId` accepts both the bare specifier (an `import` statement resolving
through Vite's plugin container) and the leading-slash form (the browser's
HTTP request for the injected `<script src>`, which Vite passes through
verbatim rather than stripping the slash) — confirmed by a real `vite build()`
in the test suite, which showed HTML's own transform pipeline hands
`resolveId` the leading-slash form too, not only the browser dev-server path.

Verified in-browser: before the fix, `aihu dev` on a fresh scaffold shows a
CORS error and an empty page; after, zero console errors and full content
(layout, page, child, grandchild all present).
