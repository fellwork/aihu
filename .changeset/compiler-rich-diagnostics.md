---
"@aihu/compiler": patch
---

render hint/fix/codeframe in human diagnostics

The `aihu-compile` binary already computed rich `CompileError` data (`hint`, `fix`, `from`, `to`) but the human (non-`--machine-errors`) stderr emitted a single `file:LINE: message` line and discarded the rest. AIs and humans reading the dev overlay / build log got a bare message with no source context or remedy.

`bin/main.rs` now renders, when present: the message header, a **codeframe** (the offending source line with a caret underline), a `hint:` line (why it's wrong), a `fix:` line (the remedy), and the machine `replace:`/`with:` rewrite. The codeframe anchors on the unique `from` literal in the source where one exists — so it points at the *real* offending line even for codes whose internal `line` is template-block-relative (e.g. C305's `@click=`) — and degrades to message + hint + fix where no trustworthy position exists (the ~142 `line:0` sites are left for a later pass per scope).

High-traffic codes upgraded with `hint`/`fix` (and, for the migration codes, `from`/`to` so the LSP can offer code actions): C204, C205, C304, C305, C306, W210. The `--machine-errors` JSON *shape* (`{code, message, from, to, range}`) is unchanged; only previously-`null` `from`/`to` values for C304/C305/C306 are now populated with their correct rewrite text (the LSP types these `string | null` and consumes them for code actions).
