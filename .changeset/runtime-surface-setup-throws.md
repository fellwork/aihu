---
"@aihu/runtime": patch
---

Surface component `setup()`/render throws instead of silently leaving an empty
shadow root. `connectedCallback` now `console.error`s with the offending
component tag (`[aihu] setup failed for <tag>:`) and re-throws, so a failing
setup produces an attributable error rather than a blank component with no
console signal. The `SCR-R0002`/`SCR-R0003` invariant throws still propagate;
the hydration path is unchanged. Fixes upstream Bug 6.
