---
'@aihu/router': minor
---

Agree with the compiler on both the custom-element tag and the collision
tie-break.

`readAihuComponentTag` preferred `@meta { name }` over everything else, but the
compiler never reads it: `SfcMeta` has no `name` field, and the parser hardcodes
`ScriptMeta { name: None }`, so the "@meta name" leg the OQ-C6 comments refer to
names an older script-level field that no longer parses. The convention that
`@meta` must not redefine the component name is written down as R-META-COEXIST
and asserted by the compiler's own tests; the router was the only thing that
believed otherwise.

The consequence was worse than an SSR miss. A component declaring
`@meta { name: "custom-thing" }` in `x-plain.aihu` compiles to
`defineElement('x-plain', …)`, so the router registered its loader under a tag
no module ever defines: `<custom-thing>` never upgraded on the client, and the
tag templates actually reference resolved to nothing. Precedence is now
`@route { name }` → file stem, matching `resolve_tag`.

**Behaviour change.** A component relying on `@meta { name }` to set its tag now
resolves to its file stem. That reliance was already broken — the browser
registered the stem regardless — so this makes the router agree with what
`customElements.define` actually receives rather than changing what ships. No
`.aihu` file in this repo declares `@meta` at all. Use `@route { name }`, or
rename the file.

`scanComponents` also kept the LAST file claiming a tag, over raw `readdirSync`
order, while `@aihu/server`'s `buildChildRegistry` keeps the FIRST over a sorted
list. The prerendered page shipped one module's markup while the client
upgraded with the other's — a content swap on hydrate — and the winner was not
reproducible across filesystems. Now sorts and keeps the first, over the same
key, so both sides select the same module from the same tree.
