---
"@aihu/compiler": patch
---

Fix `<$link href={expr}>` non-reactivity. A dynamic href was evaluated once at
the `createLinkBoundary` call site and baked into the rendered `<a>`, so a link
whose href derived from a signal (e.g. `href={readHref()}` over a selection)
never updated — Read/Study links stayed pointed at the whole chapter regardless
of the verse selection, even though the label and highlight updated reactively.

The compiler now passes a dynamic href as a thunk (`() => (expr)`) instead of
its evaluated value, and `createLinkBoundary` binds a function href via the
reactive thunk-array attribute form (`href: [() => href()]`) — the same shape a
plain `<a $href={…}>` produces — while reading the live value for SPA
navigation and `aria-current`. Static hrefs (`href="/x"`) stay plain quoted
strings, so they pay no per-link effect. Bare getter reads inside the href
expression are rewritten to calls (consistent with the FEL-172 fix), so
`href={study.url}` reads the value, not the signal function.
