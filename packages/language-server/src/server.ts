/**
 * packages/language-server/src/server.ts
 *
 * The aihu cross-editor Language Server — Volar-based transport layer.
 *
 * Started as an out-of-process Node.js child by any LSP client (VS Code via
 * vscode-languageclient, Neovim, Helix, …) over stdio. The runnable binary
 * (`aihu-language-server`) is `src/bin.ts`, which calls `startServer()`.
 *
 * Migrated from vscode-languageserver to @volar/language-server@2.4.28 in
 * M2 A4 round-2. Features:
 *   - Virtual-file generation for @state block (12 macros, source-mapped)
 *   - Hover: 36-entry HOVER_TABLE via AihuLanguageServicePlugin
 *   - Completion and code-action: wired through LanguageServicePlugin layer
 *
 * All feature logic lives in ./core (editor-agnostic). This file only wires
 * the Volar connection — the clean seam per arch-4 §2.6/§2.7.
 *
 * See: .context/m2/a4/round-1/architect-brief-volar-refactor.md §6.1
 */
import {
  createConnection,
  createSimpleProject,
  createServer as createVolarServer,
} from '@volar/language-server/node'
import { createAihuLanguagePlugin, createAihuLanguageServicePlugin } from './core/volar-plugin.ts'

/**
 * Create and wire the test seam for integration / unit tests.
 * Renamed from `createServer` to avoid collision with Volar's own `createServer`
 * export from `@volar/language-server/node`.
 *
 * Returns the Volar server object (not a vscode-languageserver Connection) so
 * tests can inspect initialized state or call .initialize() directly if needed.
 */
export function createTestServer() {
  const connection = createConnection()
  return createVolarServer(connection)
}

/**
 * Start the language server on stdio and begin listening. This is the entry
 * point the `aihu-language-server` bin calls.
 *
 * Bind the connection to `process.stdin`/`process.stdout` explicitly so the
 * binary works when launched directly (e.g. `{ command: "aihu-language-server" }`
 * in Neovim/Helix).
 */
export function startServer(): void {
  const connection = createConnection()
  const server = createVolarServer(connection)

  connection.onInitialize((params) => {
    const result = server.initialize(params, createSimpleProject([createAihuLanguagePlugin()]), [
      createAihuLanguageServicePlugin(),
    ])
    return result
  })

  connection.onInitialized(() => {
    server.initialized()
  })

  connection.listen()
}
