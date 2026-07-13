---
"@aihu/compiler": minor
---

Advanced JS in template expressions, waves 1–3 (opt-in via `--expr-parser ast`
or `AIHU_EXPR_PARSER=ast`; default behavior unchanged):

- **Shared lexical scanner** for `{expr}` boundaries — strings, template
  literals (with nested `${}` holes), comments, and regex are understood by
  every brace scanner, closing the whole brace-in-literal misparse class
  (`'}'` in strings, regex after `{`, quotes inside attribute braces).
  Rejection diagnostics now state the allowed expression forms and suggest
  hoisting to `$computed`.
- **oxc-powered expression validation** (`ast` mode): every captured template
  expression is parsed in TS mode; syntax errors become C320 diagnostics with
  codeframes, statements/sequences/`await` get C321 steering.
- **Scope-aware AST signal rewrite** (`ast` mode): spread arguments, template
  literal holes, arrow bodies, and param defaults now rewrite signal reads
  correctly; `{#each}` aliases that shadow a signal no longer emit the signal
  tuple; write targets are left alone (legacy emitted invalid `count() = 5`).
  Corpus-verified: legacy emit stays byte-identical; the only `ast`-mode diffs
  are fixes to previously silent miscompiles.

Note: the toolchain now pins rustc 1.95 and wasm-opt is re-enabled with
bulk-memory flags (it had been silently skipped, shipping unoptimized wasm).
