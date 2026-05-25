# @aihu/css-engine

## 0.2.0

### Minor Changes

- [#219](https://github.com/fellwork/aihu/pull/219) [`a866af7`](https://github.com/fellwork/aihu/commit/a866af78d41931e28c5b19084342e566ca47bdee) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Ship `@aihu/css-engine`'s native `aihu-css-compile` binary per-platform so the
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

- [#214](https://github.com/fellwork/aihu/pull/214) [`45b393c`](https://github.com/fellwork/aihu/commit/45b393c3f48758bf82c152bbe6088c63edaa68a6) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Make the two built-in style packs importable both ways. Previously only
  `defineStylePack()` was exported (from `.`); the shipped `styles/*.css` bundles
  were published as `files` but unreachable through `exports` (a bare
  `import '@aihu/css-engine/styles/aihu-default.css'` threw
  `ERR_PACKAGE_PATH_NOT_EXPORTED`).

  New `exports` entries:

  - `./packs` — `aihuDefault` and `aihuGraphite` as `StylePack` objects (the same
    `defineStylePack()` shape external orgs use) plus a `builtinPacks` registry.
    Read `.tokens` / `.dark` or emit `.toCss()`.
  - `./styles/aihu-default.css`, `./styles/aihu-graphite.css` (and a `./styles/*`
    glob) — the CSS bundles now resolve through `exports`, so Vite/bundlers inline
    them directly.

  The `./packs` objects are the SOURCE OF TRUTH for the `styles/*.css` bundles:
  each `.css` file is GENERATED from `pack.toCss()` (`bun run gen:style-packs`,
  wired into the package build + `prepublishOnly`), so the JS objects and the CSS
  files can never drift. A `style-pack.test.ts` parity test asserts
  `pack.toCss()` byte-equals each shipped file.

  Build/dev-time-only package — zero browser-bundle impact, no `.size-limit.json`
  row (the pure-data `./packs` entry rides on the existing `@aihu/css-engine`
  build-dev-only classification).

### Patch Changes

- Updated dependencies [[`574af6d`](https://github.com/fellwork/aihu/commit/574af6d4214889e9b3f7c407a42aa2e53252fddc), [`55298d5`](https://github.com/fellwork/aihu/commit/55298d51f9c6a3723a441d18a71b458e9f2cd035)]:
  - @aihu/compiler@1.0.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`55ce81c`](https://github.com/fellwork/aihu/commit/55ce81ca9ff6e63b0ba7d9eb878f175704096140)]:
  - @aihu/compiler@0.4.1

## 0.1.0

### Minor Changes

- [#187](https://github.com/fellwork/aihu/pull/187) [`31a37ef`](https://github.com/fellwork/aihu/commit/31a37eff5506f913c7081698745eac5092e04463) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the AST-consuming scanner and full compile pipeline to `@aihu/css-engine`.
  The scanner walks the compiler's exported SFC AST (via `compileToAst` / the
  `aihu-compile --ast-json` hook), extracting utility classes from static and
  macro forms and deferring reactive `$class={…}` bindings to runtime. Adds a full
  Tailwind v4 utility table (with arbitrary `[…]` bracket values), a scoped
  shadow-DOM emitter, WC-native variants (`host:`, `slotted:`, `slotted-img:`,
  `part-*:`, `host-context-dark:`) plus standard variants (`hover:`, `focus:`,
  `dark:`, `md:`, `[&>div]:`), a `@theme` token registry seeded with aihu brand
  tokens, and an AST-hashed incremental compilation cache. Build-time only — zero
  browser-bundle impact.

- [#185](https://github.com/fellwork/aihu/pull/185) [`eed6ce6`](https://github.com/fellwork/aihu/commit/eed6ce6d600c06d3fa22ea228f3f370c6cebb2dc) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Initial release of `@aihu/css-engine` — the build-time, compile-time CSS engine
  (Tailwind v4 hard-fork, WC-native scoped shadow-DOM output). This bootstrap
  release ships the `@aihu/css-engine` package + the `aihu-css-core` Rust crate
  with a `compile(classes)` entry point. Build-time-only: it adds zero to the
  browser bundle (no CSS-in-JS, no runtime row in `.size-limit.json`).

### Patch Changes

- Updated dependencies [[`faca280`](https://github.com/fellwork/aihu/commit/faca2804cf62c05ffc90ef867faa2058b5e267ad), [`173705b`](https://github.com/fellwork/aihu/commit/173705bde39bdd5b79b7e3665bb91719e0a74e63)]:
  - @aihu/compiler@0.4.0
