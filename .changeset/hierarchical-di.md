---
"@aihu/context": minor
"@aihu/runtime": minor
---

Hierarchical provide/inject on the client.

`inject()` now resolves through the component tree: an ancestor's `provide()` is
visible to its descendants, scoped to the subtree (siblings don't see it, a
nearer provider overrides a farther one), and it crosses shadow boundaries. The
value is whatever you provided — provide a signal and descendants read it
reactively, for free.

The mechanism is the Solid/Vue-grade one: each component instance holds a
`provides` object whose prototype chain IS the ancestor context tree. A component
that provides nothing shares its parent's object by reference (zero allocation);
the first `provide()` does one `Object.create`. `inject()` is a single
prototype-chain lookup — no per-lookup tree walk. The parent is resolved once at
connect via a single shadow-host hop, which is correct under lazy/async component
registration too (it runs after upgrade).

Backward-compatible: the flat SSR context path (`setSsrContextMap` /
`runWithContext`) is unchanged, and the client hierarchical path only engages
during a component's setup. `createContext` / `provide` / `inject` keep their
signatures.
