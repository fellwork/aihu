---
'@aihu/compiler': patch
---

Fix `_injectShadowMode` corrupting emitted modules.

The options object is appended to `defineElement(tag, defineComponent(setup))`.
Its anchor was a greedy `defineComponent\([^]*\)` — and `[^]` crosses newlines,
so on a server-target module (where the string renderer is emitted AFTER
`defineElement`) it ran past its own call and landed on the module's last `))`.
For a component with an `if=`, that is the emitted condition, which became
`if ((n() > 5), { shadowMode: 'light', … })` — the comma operator, always
truthy, so a dead branch rendered. It also corrupted `__aihu_stext(…)` for any
parenthesis in interpolated text, and `setFormValue(…)` in every `$form`
component on all targets.

Replaced with a lexer that skips string literals, template literals (with
`${…}` nesting) and comments, plus a merge path that folds the fields into
`$form`'s existing options object rather than bailing. A naive paren counter is
not sufficient: it miscounts `leaf('(')` from ordinary text content and bails
silently, costing that component both `shadowMode` and `lightScopeId`.
