# @aihu/language-server

Cross-editor [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) implementation for `.aihu` Single File Components, built on [Volar](https://volarjs.dev/) (`@volar/language-server@2.4.28`). Ships the runnable `aihu-language-server` binary that any LSP-aware editor (VS Code via `vscode-languageclient`, Neovim, Helix, Zed, …) launches as an out-of-process Node.js child over stdio.

Dev-time tooling only — it never enters browser bundles and has no size-limit row.

> **Status:** held-private workspace package — not yet published to npm. The binary and exports below are available inside the workspace today; the published-package install will follow v1.x ratification.

## Features

- **Diagnostics** — shells out to the `aihu-compile` Rust binary with `--machine-errors` (debounced) and maps the structured compiler errors onto LSP diagnostics.
- **Hover** — Markdown documentation for the aihu macro keywords and block names, aware of `@state` vs `@template` block context, served from a 36-entry hover table.
- **Completion** — `$`-triggered macro-kind snippets (context-filtered) and `@`-triggered top-level block names.
- **Code actions** — QuickFix for the `C440`–`C444` old-spec macro diagnostics, backed by the macro-simplification codemod.
- **Virtual code** — source-mapped virtual-file generation for the `@state` block, so TypeScript-side features resolve positions back to the original `.aihu` source.

## Running the server

The package exposes the `aihu-language-server` bin. Any LSP client config that can launch a stdio command works:

```lua
-- Neovim (vim.lsp.config / lspconfig-style)
{ cmd = { "aihu-language-server" }, filetypes = { "aihu" } }
```

```toml
# Helix languages.toml
[language-server.aihu]
command = "aihu-language-server"
```

The binary binds the Volar connection to `process.stdin`/`process.stdout` explicitly, so it works when launched directly as a command.

## API overview

### Root export (`@aihu/language-server`)

The transport layer — wires the editor-agnostic core onto a Volar connection.

- `startServer()` — create the Volar connection + server, register the aihu language and language-service plugins, and start listening on stdio. This is what the `aihu-language-server` bin calls.
- `createTestServer()` — test seam: returns the Volar server object (without listening) so integration tests can drive `.initialize()` directly.

### Core export (`@aihu/language-server/core`)

Editor-agnostic feature logic — pure functions plus the compiler bridge, with no LSP connection objects. This barrel is the seam a Volar (or any other) integration consumes.

#### Volar plugins

- `createAihuLanguagePlugin()` — the Volar language plugin: recognises `.aihu` sources and produces source-mapped virtual code. Types: `AihuLanguagePlugin`, `AihuSource`, `AihuVirtualCode`.
- `createAihuLanguageServicePlugin()` — the Volar language-service plugin wiring hover, completion, diagnostics, and code actions.

#### Diagnostics

- `compileWithDiagnostics(source, uri)` — invoke the `aihu-compile` binary with `--machine-errors` (source fed on stdin, argv arrays — no shell) and return a `CompileResult`.
- `parseMachineErrors(stderr)` — parse the compiler's machine-error output into `AihuDiagnostic` records (0-based LSP positions).

#### Hover

- `getHoverContent(word, blockContext)` — Markdown hover documentation for a macro or block keyword.
- `getMacroAtPosition(line, character)` — extract the macro token under the cursor.
- `getBlockContext(source, line)` — determine whether a position is inside `@state`, `@template`, etc., so hover entries are context-filtered.

#### Completion

- `BLOCK_COMPLETIONS` — `@`-triggered top-level block-name completions.
- `STATE_MACRO_COMPLETIONS` — `$`-triggered macro-kind snippet completions for the `@state` block. Item type: `LspCompletionItem`.

#### Code actions

- `buildMigrateFix(diagnostic, source)` — build the QuickFix edit (a `MigrateFix`) for an old-spec macro diagnostic.
- `MIGRATE_CODES` — the set of compiler codes (`C440`–`C444`) the QuickFix applies to.

#### Virtual code + source maps

- `generateStateVirtualCode(input)` — generate the source-mapped TypeScript virtual code for a `@state` block (`GeneratorInput` → `GeneratorOutput`).
- `SourceMap`, `mapToOriginal(...)`, `mapToVirtual(...)` — translate positions between the original `.aihu` source and the generated virtual code. Types: `AihuCodeMapping`, `AihuSourcePosition`, `AihuVirtualPosition`.

## Layout

- `src/core/*` — pure logic + the compiler bridge (everything under `/core` above).
- `src/server.ts` — wires the core plugins onto the Volar connection (root export).
- `src/bin.ts` — the runnable `aihu-language-server` stdio entry.

The server runs out-of-process for editor isolation; all feature logic lives in `core` so transports can change without touching it.
