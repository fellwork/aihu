---
'@aihu/runtime': minor
'@aihu/server': patch
---

Let components using `onMount` be server-rendered.

Lifecycle hooks register against `defineComponent`'s owner pointer, which a
server render never sets — it calls the compiled setup directly. Every
`onMount`/`onCommit`/`onAdopt`/`onAttributeChange` in a `@state` block
therefore threw `SCR-R0010 'no owner'`, so those components could not be
prerendered at all.

Registration is now a no-op inside a server-render window and still throws
outside one, so a null owner in the browser remains a genuine authoring error.

The window is keyed on `globalThis` via `Symbol.for`, because `@aihu/server`
bundles its own copy of the SSR helpers: a module-scoped counter would have the
server incrementing one instance while the runtime read another.
