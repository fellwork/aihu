# @aihu/css-engine

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
