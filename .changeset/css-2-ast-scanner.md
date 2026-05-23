---
"@aihu/css-engine": minor
---

Add the AST-consuming scanner and full compile pipeline to `@aihu/css-engine`.
The scanner walks the compiler's exported SFC AST (via `compileToAst` / the
`aihu-compile --ast-json` hook), extracting utility classes from static and
macro forms and deferring reactive `$class={…}` bindings to runtime. Adds a full
Tailwind v4 utility table (with arbitrary `[…]` bracket values), a scoped
shadow-DOM emitter, WC-native variants (`host:`, `slotted:`, `slotted-img:`,
`part-*:`, `host-context-dark:`) plus standard variants (`hover:`, `focus:`,
`dark:`, `md:`, `[&>div]:`), a `@theme` token registry seeded with aihu brand
tokens, and an AST-hashed incremental compilation cache. Build-time only — zero
browser-bundle impact.
