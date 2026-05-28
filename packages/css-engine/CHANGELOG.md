# @aihu/css-engine

## 0.2.5

### Patch Changes

- [#258](https://github.com/fellwork/aihu/pull/258) [`74273e0`](https://github.com/fellwork/aihu/commit/74273e0a015805f3c878c9b2c7890ed0c80a23fd) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix Bug 6: utility CSS from `@aihu/css-engine` now lands in the bundled `dist/assets/*.css` asset when `viteAihuPlugin({ css: { shadowMode: 'none' } })` is set, so utility classes like `.flex`, `.gap-6`, `.text-lg` actually take effect in the document cascade.

  - `@aihu/compiler`: `aihuCompilerPlugin` now branches on `shadowMode === 'none'` and routes utility CSS through Vite's CSS pipeline via a `virtual:aihu-utility/<hash>.css` virtual import (resolved by the plugin's new `resolveId` + `load` hooks). The `'open' | 'closed'` shadow paths still fold into `host.adoptedStyleSheets` as before — only the no-shadow case changes. Also makes the compiler-binary path resolution lazy (call-time) so the `SCRIBE_COMPILE_BIN` handshake with `@aihu/css-engine`'s bundled `compileToAst` actually fires.
  - `@aihu/css-engine`: rebuild against the deferred compiler-bin resolver so `compileSfc()` no longer ENOENTs against the missing `packages/css-engine/bin/aihu-compile` on the first call (the SCRIBE_COMPILE_BIN env var is now read at every call, not captured at module load).

- [#261](https://github.com/fellwork/aihu/pull/261) [`c6860e0`](https://github.com/fellwork/aihu/commit/c6860e022a374b3c5e35aaf8775cbb6332b1b75d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Externalize `@aihu/compiler` from the rolldown bundle so consumers always use the
  live compiler module (with its current binary-resolution logic) instead of a
  frozen embedded copy. Pre-fix the `compileToAst` from `@aihu/compiler` was
  inlined into `dist/index.js` at build time, freezing a module-scope `binPath`
  constant that resolved at import time to a non-existent
  `node_modules/@aihu/css-engine/bin/aihu-compile` path. Marking `@aihu/compiler`
  external means the bundle now does `import { compileToAst } from "@aihu/compiler"`
  so the consumer-installed compiler module — including any subsequent binary
  resolver fixes — is what runs. Also bumps the workspace dep range to
  `workspace:^` so publish rewrites to a caret range.

- [#259](https://github.com/fellwork/aihu/pull/259) [`5f21125`](https://github.com/fellwork/aihu/commit/5f211252c7500973c6976ca48f29b09ea8aa049b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix publishing pipeline so `@aihu/css-engine-<platform>` tarballs ship `aihu-css-compile` with the executable bit set. `actions/download-artifact@v4` does not preserve POSIX mode bits, so the `chmod 0755` performed in `build-css-native` was lost in transit and the `publish-css-native` job published `-rw-r--r--` binaries. Consumers on Bun could not auto-repair this (postinstall scripts are blocked by default for untrusted deps), surfacing as a "binary not found" error from `resolveBinary()`. The next release will be the first to ship correctly-mode'd tarballs across all 4 platforms; existing releases stay broken and require the documented `chmod +x` workaround.

- Updated dependencies [[`74273e0`](https://github.com/fellwork/aihu/commit/74273e0a015805f3c878c9b2c7890ed0c80a23fd)]:
  - @aihu/compiler@0.5.4

## 0.2.4

### Patch Changes

- [#253](https://github.com/fellwork/aihu/pull/253) [`d42793b`](https://github.com/fellwork/aihu/commit/d42793b8258d723ae7c80179dcc82e2db8d0afc4) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Forward `shadowMode` through `viteAihuPlugin` for utility-class CSS frameworks.

  - **`@aihu/app`** — new `css.shadowMode` option on `AihuConfig`. When set, it
    forwards to the compiler's per-plugin `shadowMode` injection
    (`'open' | 'closed' | 'none'`). Required for consumers of
    `@aihu/css-engine` (and other cascade-dependent CSS frameworks) so the
    utility classes the compiler folds in are not trapped inside a shadow root.
    Default behaviour is unchanged.
  - **`@aihu/compiler`** — `_maybeCompileUtilityCss` now emits a one-shot
    `console.warn` when `@aihu/css-engine` resolves but `compileSfc()` throws
    (typically: the native `aihu-css-core` binary is unresolvable). Build is
    still non-fatal; previously this case was completely silent and users
    could not discover why their utility classes never emitted.
  - **`@aihu/css-engine`** — README now documents the canonical
    `viteAihuPlugin({ css: { shadowMode: 'none' } })` wiring and points to the
    new `examples/css-engine-utility/` end-to-end example.

- Updated dependencies [[`d42793b`](https://github.com/fellwork/aihu/commit/d42793b8258d723ae7c80179dcc82e2db8d0afc4), [`52a7ee6`](https://github.com/fellwork/aihu/commit/52a7ee600c1f94ac741c01d6d9c0a4a203fc0ef3)]:
  - @aihu/compiler@0.5.3

## 0.2.3

### Patch Changes

- Updated dependencies [[`6ed33f8`](https://github.com/fellwork/aihu/commit/6ed33f80bfdf193382e9fb1d192c0c1d4e6ef069), [`6ed33f8`](https://github.com/fellwork/aihu/commit/6ed33f80bfdf193382e9fb1d192c0c1d4e6ef069)]:
  - @aihu/compiler@0.5.2

## 0.2.2

### Patch Changes

- Updated dependencies [[`e31df0b`](https://github.com/fellwork/aihu/commit/e31df0bbf43cca38d55528bf31d00088897e5579)]:
  - @aihu/compiler@0.5.1

## 0.2.1

### Patch Changes

- [#226](https://github.com/fellwork/aihu/pull/226) [`71ca28e`](https://github.com/fellwork/aihu/commit/71ca28ece93dfcfdad4bd9edda2a2ead415d26f2) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Make `resolveBinary()` robust to a present-but-unusable per-platform stub.
  R6c added `@aihu/css-engine-<platform>` packages as `optionalDependencies`,
  and refreshing `bun.lock` made their in-source PLACEHOLDER `aihu-css-compile`
  resolvable inside the workspace. The old resolver accepted that candidate on
  `existsSync` alone, returned the non-executable placeholder, and then died with
  `EACCES` inside `execFileSync` — never reaching the dev `target/` fallback (CI
  `check` failures across `sfc-e2e`, `css-engine-hook`, and `style-pack`). The
  candidate is now gated on `isUsableExecutable()`: a zero-byte / non-executable
  stub is rejected (POSIX `accessSync(_, X_OK)`; on Windows, a non-empty regular
  file) so resolution falls THROUGH to the monorepo `target/release|debug/`
  binary. The structured "no binary" error is thrown only when BOTH a real
  platform executable AND the dev `target/` are absent. The published-consumer
  path is unchanged: a real per-platform executable is still used when installed.
- Updated dependencies []:
  - @aihu/compiler@0.5.0

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
  - @aihu/compiler@0.5.0

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
