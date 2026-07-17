---
"@aihu/compiler": minor
---

Route manifest: the compiler now lists each page's component dependencies.

`.route.json` gains a `components` member — the custom-element tags a page's
template references (hyphenated names and PascalCase component references, from
nested elements and inside `{#if}`/`{#each}`; plain HTML tags and `<$macro>`
intrinsics are excluded). This is the per-route component graph the router needs
to import and register exactly a page's components on demand, instead of the app
eagerly importing every component at boot.

Additive and backward-compatible: a page that references no components omits the
`components` member entirely, so existing consumers and no-component pages are
byte-identical. Emitted runtime JS is unchanged.
