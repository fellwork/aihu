---
"@aihu/css-engine": minor
---

Ship `@aihu/css-engine`'s native `aihu-css-compile` binary per-platform so the
package is usable by any npm consumer — not just a monorepo dev clone with a
Rust toolchain.

`compile()` / `compileSfc()` shell out to the `aihu-css-compile` CLI executable
(built from the `aihu-css-core` crate). Previously `resolveBinary()` only
searched the monorepo's `target/release|debug/`, so a published `npm install
@aihu/css-engine` shipped no binary and `compile()` threw immediately.

`resolveBinary()` now mirrors `@aihu/server`'s `detectPlatform()`: it maps
`process.platform`+`process.arch` to a per-platform `optionalDependencies`
package and resolves the executable's path via
`createRequire(import.meta.url).resolve('<pkg>/package.json')`. Because the
binary is invoked as a CLI subprocess (not a napi `.node` addon), the platform
package ships a raw executable and we resolve its path rather than `require()`-ing
it. The monorepo `target/` path is retained ONLY as a dev fallback. When the
platform is supported but the package is absent, a structured error tells the
user their `optionalDependencies` install was skipped (and how to reinstall);
unsupported platforms get a build-from-source remedy.

New per-platform `optionalDependencies` (initial `0.1.2`, binaries produced by
CI on the release tag):

- `@aihu/css-engine-darwin-arm64`
- `@aihu/css-engine-darwin-x64`
- `@aihu/css-engine-linux-x64-gnu` (glibc)
- `@aihu/css-engine-win32-x64-msvc`

Build-time-only package — zero browser-bundle impact, no `.size-limit.json` row.
