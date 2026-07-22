---
'@aihu/compiler': minor
---

In-process napi compile backend + single-parse envelope API.

- New Rust `compile_envelope()` (envelope.rs): parse + validate + lower ONCE,
  emit per requested target (`client|server|universal`), and serialize every
  requested artifact (`js|ast|route|manifest`) into one JSON envelope. Exposed
  on the CLI as `--envelope <options-json>` — so even the spawn path gets
  single-parse, multi-output compiles.
- New napi addon (`packages/compiler/src-native`, shipped as
  `@aihu/compiler-native-<platform>` optionalDependencies):
  `compileEnvelope(source, optionsJson) → envelopeJson`, one boundary crossing
  per file, eliminating the per-file process spawn on the build path.
- `transform()` / `compileToAst()` / `compileRouteMeta()` now route
  memo → native addon → envelope CLI spawn → legacy per-output spawn, and one
  `transform()` seeds the memo entries for the AST and route artifacts from the
  SAME parse — css-engine's AST pass and the router's route scan become cache
  hits instead of re-parses. Output is byte-identical to the legacy spawn
  (differential-tested per target across representative fixtures).
- Escape hatches: `AIHU_COMPILER_NATIVE=0` disables the addon;
  `AIHU_COMPILER_NATIVE_ADDON=<path>` pins one (fail-loud); an explicit
  `AIHU_COMPILE_BIN`/`SCRIBE_COMPILE_BIN` binary pin keeps the spawn backend.
