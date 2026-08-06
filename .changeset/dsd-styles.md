---
'@aihu/compiler': patch
'@aihu/runtime': minor
---

Carry a shadow component's CSS into its declarative shadow template.

The server target now exports `__aihu_css__` — the component's own CSS as a
plain string — and `__aihu_schild` inlines it as `<style>` inside the
`<template shadowrootmode="open">`, ahead of the content.

This is not optional polish. A shadow root is style-isolated by construction,
so a declarative one whose CSS lives outside it paints unstyled until the
component's chunk loads — content rendering ahead of its scoped CSS, which is
the failure that cost ~1.9s of LCP in #754. Emitting the tree without its
styles would trade an empty header for a broken one.

The client's `CSSStyleSheet` declaration stays elided on the server target
(that is a DOM dependency), and both now share one escape function so the
bytes cannot diverge. `</style` sequences in authored CSS are escaped for
`<style>`'s raw-text context.

Light-DOM children are unaffected: their rules arrive via the app stylesheet's
`@scope([data-a=…])` blocks. Global `@style` blocks are never inlined — they
belong to the document, and scoping them to a child would change what they
match.
