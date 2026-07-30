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
 * M2 A4 round-2. #486 step 5 replaced the regex-based `@state`-only virtual
 * file with the compiler's `compileSidecar` surface, shared with `aihu-tsc`.
 * Features:
 *   - Virtual TypeScript for the whole SFC (@state inlined + template lifts),
 *     type-checked by the real TS language service (volar-service-typescript)
 *   - Hover: 36-entry HOVER_TABLE via AihuLanguageServicePlugin
 *   - Completion and code-action: wired through LanguageServicePlugin layer
 *
 * All feature logic lives in ./core (editor-agnostic). This file only wires
 * the Volar connection — the clean seam per arch-4 §2.6/§2.7.
 *
 * See: .context/m2/a4/round-1/architect-brief-volar-refactor.md §6.1
 */

import { loadTscProjectConfig } from '@aihu/tsc'
import {
  createConnection,
  createTypeScriptProject,
  createServer as createVolarServer,
} from '@volar/language-server/node'
import ts from 'typescript'
import { create as createTypeScriptServices } from 'volar-service-typescript'
import { URI } from 'vscode-uri'
import {
  createAihuLanguagePlugin,
  createAihuLanguageServicePlugin,
  withAihuDiagnosticParity,
} from './core/volar-plugin.ts'

/**
 * Best-effort workspace-root resolution from `InitializeParams` — `rootUri`
 * is the pre-3.16 field, `workspaceFolders[0]` the modern one; either may be
 * absent (a client that opens a single loose file, not a folder). Returns
 * `undefined` rather than throwing so a client that gives us neither still
 * gets a working server, just without config-sourced `target`.
 */
function workspaceRoot(params: {
  rootUri?: string | null
  workspaceFolders?: ReadonlyArray<{ uri: string }> | null
}): string | undefined {
  const uri = params.workspaceFolders?.[0]?.uri ?? params.rootUri ?? undefined
  if (!uri) return undefined
  try {
    return URI.parse(uri).fsPath
  } catch {
    return undefined
  }
}

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

  connection.onInitialize(async (params) => {
    // Read the workspace's vite.config.ts (AihuConfig.compiler.target) so the
    // editor's diagnostics match `aihu-tsc`'s — without this, the language
    // server always type-checked against the compiler's `universal` default
    // regardless of what the project actually configured. Best-effort: never
    // blocks initialize, and a client that gave us no workspace root (or a
    // project with no vite.config.ts) falls back to the previous behavior
    // exactly (see loadTscProjectConfig's own doc comment).
    const root = workspaceRoot(params)
    const { target } = root ? await loadTscProjectConfig(root) : {}

    // #486 step 5 — the TypeScript project consumes the SAME
    // compileSidecar-backed language plugin `aihu-tsc` runs, so template
    // expressions get real TS hover/completion/diagnostics in the editor and
    // an editor squiggle equals the CI diagnostic by construction. The TS
    // service plugins are wrapped with the CLI's implicit-any parity filter.
    const result = server.initialize(
      params,
      createTypeScriptProject(ts, undefined, () => ({
        languagePlugins: [createAihuLanguagePlugin(target ? { target } : undefined)],
      })),
      [
        ...createTypeScriptServices(ts).map(withAihuDiagnosticParity),
        createAihuLanguageServicePlugin(),
      ],
    )
    return result
  })

  connection.onInitialized(() => {
    server.initialized()
  })

  connection.listen()
}
