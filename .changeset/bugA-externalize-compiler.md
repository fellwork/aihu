---
'@aihu/css-engine': patch
---

Externalize `@aihu/compiler` from the rolldown bundle so consumers always use the
live compiler module (with its current binary-resolution logic) instead of a
frozen embedded copy. Pre-fix the `compileToAst` from `@aihu/compiler` was
inlined into `dist/index.js` at build time, freezing a module-scope `binPath`
constant that resolved at import time to a non-existent
`node_modules/@aihu/css-engine/bin/aihu-compile` path. Marking `@aihu/compiler`
external means the bundle now does `import { compileToAst } from "@aihu/compiler"`
so the consumer-installed compiler module — including any subsequent binary
resolver fixes — is what runs. Also bumps the workspace dep range to
`workspace:^` so publish rewrites to a caret range.
