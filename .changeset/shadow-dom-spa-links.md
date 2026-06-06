---
"@aihu/app": patch
---

Fix SPA link interception for `<a>` nested inside a shadow root. A click inside
a shadow-DOM layout/page (the default shadow mode) is retargeted at the host, so
`e.target.closest('a')` missed the real anchor and the click fell through to a
full page reload. The handler now resolves the anchor via `composedPath()`, so
client-side navigation works inside shadow-DOM layouts — `shadowMode: 'none'` is
no longer required just to make in-layout nav links work.
