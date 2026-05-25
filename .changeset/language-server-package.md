---
"@aihu/language-server": minor
---

Stand up `@aihu/language-server` as a standalone package shipping the runnable
`aihu-language-server` binary (cross-editor LSP over stdio, arch-4 §2.6). The
language-server logic — diagnostics bridge (`aihu-compile --machine-errors`),
the 13-keyword hover table, `$`/`@` completion items, and the C440–C444
migrate-codemod quick-fix — moves out of the `vscode-aihu` extension into the
new package, laid out with an editor-agnostic `src/core/` seam (clean adoption
path for a future `@volar/language-core` layer; Volar itself is NOT adopted yet).

The `vscode-aihu` extension is reduced to a thin `LanguageClient` that resolves
and launches the `aihu-language-server` binary; it no longer hosts the server
inline. Diagnostics/hover/completion/code-action behavior is preserved — the
ported `lsp-server` test suite stays green. No new LSP features. Build-time /
editor-tooling package — zero browser-bundle impact (no `.size-limit.json` row).

Note: `vscode-aihu` is changeset-ignored (published to the VS Code marketplace,
not npm), so its accompanying client-trim change is versioned manually at
marketplace-publish time rather than through this changeset.
