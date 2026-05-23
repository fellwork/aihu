---
"@aihu/css-engine": minor
---

Initial release of `@aihu/css-engine` — the build-time, compile-time CSS engine
(Tailwind v4 hard-fork, WC-native scoped shadow-DOM output). This bootstrap
release ships the `@aihu/css-engine` package + the `aihu-css-core` Rust crate
with a `compile(classes)` entry point. Build-time-only: it adds zero to the
browser bundle (no CSS-in-JS, no runtime row in `.size-limit.json`).
