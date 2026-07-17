---
"@aihu/runtime": patch
---

Bless composables as a supported, tested contract.

A plain function called from an `@state` block runs inside the component's setup,
so it can use the full reactive surface — signals, lifecycle hooks bound to the
calling component, and hierarchical `inject`/`provide`. This is aihu's Vue-style
composable pattern; the mechanism already existed, and a contract test now locks
it (signals + `onMount`/`onCleanup` + inject-with-default all work inside a
composable). A new "Composition & Injection" guide documents the `use*`
convention and the layered-injection pattern.
