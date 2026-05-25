---
"@aihu/compiler": minor
---

Wire `@aihu/css-engine` into the `.aihu` SFC compile so utility classes
actually scope and emit. Previously `compileSfc()` existed but nothing in the
build called it, so Tailwind-style utility classes written in `@template` (e.g.
`<div class="flex gap-2 p-4">`) compiled to nothing. `aihuCompilerPlugin`'s
`.aihu` transform now folds the scoped utility CSS into each component's shadow
`<style>`.

css-engine is wired in via a GUARDED, LAZY `await import('@aihu/css-engine')`
and declared an OPTIONAL `peerDependency` (`peerDependenciesMeta.optional`).
This avoids a dependency cycle: css-engine already depends on `@aihu/compiler`
(for the SFC AST), so the compiler must not hard-depend on css-engine. When
css-engine is present the hook compiles the SFC's utilities to scoped CSS
(`:host` theme tokens + utility rules + the folded authored `@style` block) and
adopts it as the component's single shadow stylesheet; when css-engine is
absent the dynamic import throws, the hook no-ops, and the build still succeeds
(utility classes simply don't emit — the prior behaviour). The authored
`@style` block continues to emit exactly once in both paths.
