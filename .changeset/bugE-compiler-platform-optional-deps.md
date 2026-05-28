---
"@aihu/compiler": minor
---

Migrate `@aihu/compiler` from postinstall-downloads-binary to platform-optional-deps distribution (mirror of `@aihu/css-engine`'s pattern). Fixes the latent "Bun consumers get a Linux binary on macOS that can't exec" issue — Bun blocks postinstall scripts by default, so the previous compiler postinstall was silently skipped on the framework's most common consumer path.

Changes:
- New per-platform packages under `packages/compiler/npm/{darwin-arm64,darwin-x64,linux-x64-gnu,linux-arm64-gnu,win32-x64-msvc}/` declared as `optionalDependencies`. Package manager installs only the matching one per consumer host.
- `js/index.ts` exports a new `resolveBinary()` function that walks the platform-package tree via `createRequire().resolve()` + an `isUsableExecutable()` gate (mirror of css-engine's resolver).
- `bin/aihu-compile-wrapper.js` (new, committed) — thin Node shim preserving the `"bin"` field; shells through `resolveBinary()`.
- `js/postinstall.ts` — deleted. No longer needed.
- `SCRIBE_COMPILE_BIN` env override preserved for explicit overrides.
- `packages/mcp/src/compiler.ts` and `packages/language-server/src/core/diagnostics.ts` migrated to call the new `resolveBinary()` export instead of hard-coding `../../../compiler/bin/aihu-compile`.
- `.github/workflows/release.yml`: new `publish-compiler-native` job (mirror of `publish-css-native`) publishes each platform tarball with `chmod 0755` from day one (Bug B lesson applied during creation). Obsolete `Stage compiler bin (linux-x64 host)` step removed.

Adds the `linux-arm64-gnu` platform as a side effect (previously the existing compiler postinstall handled it via cross-compiled GH release asset; the new model gives it a proper npm-distributed platform package).

No breaking changes to the JS API — `transform`, `compileSfc`, `aihuCompilerPlugin`, etc. all unchanged. The `"bin"` field continues to expose `aihu-compile` (now via the wrapper, but consumers calling `npx aihu-compile` see no difference).
