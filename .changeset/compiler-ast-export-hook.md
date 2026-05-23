---
"@aihu/compiler": minor
---

Add the AST-export hook (`v1.0.10a`) — a purely-additive public API that
serializes the parsed `.aihu` SFC AST.

New surface:

- **Rust:** `compile_to_ast(source, file_path) -> Result<SfcAstOwned, CompileError>`
  in a new `src/ast_export.rs`, plus the owned `Serialize` mirror types
  (`SfcAstOwned`, `SfcNodeOwned`, `SfcAttrOwned`, `SfcMacroValueOwned`,
  `SfcStyleBlockOwned`, …). Uses an owned mirror struct (not a serde-borrow on
  the internal AST) so the v1.0 wire shape stays decoupled from the parser
  representation.
- **CLI:** a new `--ast-json` flag on `aihu-compile` that runs parse →
  `compile_to_ast` → emits the AST as JSON to stdout and short-circuits before
  codegen. Existing flags/behavior are untouched.
- **TS:** `compileToAst(source, id?): SfcAst` plus the `SfcAst` type family,
  exported from the package entry. Thin wrapper over `aihu-compile --ast-json`.

This is the contract the CSS engine's AST scanner (`css-2-ast-scanner`)
consumes — it freezes the three `Attr` class-forms (Static / Binding / Macro)
as part of the v1.0 stability contract.

Adds `serde_json` to the crate's dependencies (used by the binary to serialize
the AST). No grammar, parser, or existing-function behavior changed — additive
only. Per the round-7 lesson, any `packages/compiler/src/**` change ships with
a changeset so the npm-published binary stays in sync with the source.
