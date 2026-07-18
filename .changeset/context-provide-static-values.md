---
"@aihu/compiler": patch
---

`$context` provide: static `value:` expressions are provided verbatim, not
called. Stacked on the O2 prototype-chain lowering (#417), which wrapped every
provide `value:` in `({expr})()` — correct for arrow factories
(`value: () => themeSignal`), but a runtime TypeError for static values
(`value: 'light'` lowered to `('light')()`).

The lowering now only wraps-and-calls function-shaped values (`function …` or
an arrow containing `=>`); everything else — string/number literals,
identifiers, object literals — is passed through as-is:

- `value: () => themeSignal` → `provide(contextKey('theme'), (() => themeSignal)())` (unchanged)
- `value: 'light'` → `provide(contextKey('theme'), 'light')`
- `value: themeSignal` → `provide(contextKey('theme'), themeSignal)`

Edge to note: an identifier that happens to name a factory function is NOT
called — "value is the value". Write `value: () => makeThing()` when you want
a call at provide time.

Both lowering paths (codegen/emit.rs and the legacy parser/state_macros.rs
path) are fixed identically. The cookbook context-provider/context-consumer
pair is reworked to be a correct static-value example.
