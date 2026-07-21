---
"@aihu/compiler": major
"@aihu/cli": minor
"@aihu/language-server": minor
"@aihu/mcp": patch
"@aihu/router": patch
"@aihu-plugin/data": patch
---

Template grammar v2 — the prefix-less template (founder-ratified 40-spec).

One rule: naked keywords + naked HTML attributes + naked framework vocabulary;
`{expr}` braces mean expression, quoted strings mean static; `$` retreats to
`@state` macros only.

**New grammar:** `if={…}`/`elseif={…}`/`else` attribute chains (adjacency-checked),
the item-first `each={item, i of items}` `of`-binder with destructuring, `key={…}`,
`empty` siblings, colon directives `on:<event>` (with `.prevent`/`.stop`/`.self`/`.once`
modifiers), `bind:<prop>`, `class:<name>`, the `attr:<name>` literal escape hatch,
naked `show`/`html`/`ref`/`once`/`memo`/`raw`, the NEW `<group>` fragment carrier,
naked framework elements (`<slot>` is now THE projection form), and the enhanced
`<a>` (SPA navigation, `prefetch`, `replace`, `aria-current`, auto-opt-out +
explicit `reload`) replacing `<$link>`.

**Retired (compile errors with fix hints):** `{#if}` C601, `{#each}` C602,
`{@html}` C603, `{{ident}}` C604, `<$if>`/`<$else>` C605, `$if=`/`$each=`/`$let=`
C606, every other `$`-attribute C607, `<$link>` C608, other `<$…>` elements C609,
adjacency violations C610, unknown non-hyphenated elements C611. New lints:
W601 (keyless stateful `each`), W602 (non-empty string on a boolean attribute).

**Intended emission diffs:** internal `<a href>` links now lower to
`createLinkBoundary` (the retired `<$link>` lowering) with a runtime
origin/scheme auto-opt-out; everything else lowers through the same arbor
structural calls as v1 (`when`/`each`/fragment branches).

`aihu migrate --v2` now lands on this grammar (new final codemod pass:
`compiler/js/codemods/template-grammar-v2`).
