---
"@aihu/compiler": patch
"@aihu/css-engine": patch
---

Fix Bug 6: utility CSS from `@aihu/css-engine` now lands in the bundled `dist/assets/*.css` asset when `viteAihuPlugin({ css: { shadowMode: 'none' } })` is set, so utility classes like `.flex`, `.gap-6`, `.text-lg` actually take effect in the document cascade.

- `@aihu/compiler`: `aihuCompilerPlugin` now branches on `shadowMode === 'none'` and routes utility CSS through Vite's CSS pipeline via a `virtual:aihu-utility/<hash>.css` virtual import (resolved by the plugin's new `resolveId` + `load` hooks). The `'open' | 'closed'` shadow paths still fold into `host.adoptedStyleSheets` as before — only the no-shadow case changes. Also makes the compiler-binary path resolution lazy (call-time) so the `SCRIBE_COMPILE_BIN` handshake with `@aihu/css-engine`'s bundled `compileToAst` actually fires.
- `@aihu/css-engine`: rebuild against the deferred compiler-bin resolver so `compileSfc()` no longer ENOENTs against the missing `packages/css-engine/bin/aihu-compile` on the first call (the SCRIBE_COMPILE_BIN env var is now read at every call, not captured at module load).
