/**
 * packages/vscode-aihu/client/index.ts
 *
 * VS Code extension client — activates on onLanguage:aihu and launches the
 * standalone `aihu-language-server` binary (from @aihu/language-server) as an
 * out-of-process Node.js child via stdio transport.
 *
 * The server itself no longer lives in this extension; it ships as the separate
 * @aihu/language-server package (arch-4 §2.6). This client is a thin
 * LanguageClient wrapper that resolves and spawns that binary.
 */
import { dirname, join } from 'node:path'
import { type ExtensionContext, workspace } from 'vscode'
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node.js'

let client: LanguageClient | undefined

/**
 * Resolve the @aihu/language-server stdio entry (dist/bin.js). Resolved via
 * Node module resolution (CommonJS `require.resolve`, available in the VS Code
 * extension host) so the bundled dependency is used regardless of install
 * layout. Falls back to the package main if the bin path is not resolvable.
 */
function resolveServerModule(): string {
  // The package's bin maps to ./dist/bin.js — resolve it via the package root
  // (package.json is always exported, dist/bin.js may not be in `exports`).
  const pkgJson = require.resolve('@aihu/language-server/package.json')
  return join(dirname(pkgJson), 'dist', 'bin.js')
}

export function activate(_context: ExtensionContext): void {
  const serverModule = resolveServerModule()

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: {
        // Enable Node.js inspector on a fixed port when debugging
        execArgv: ['--nolazy', '--inspect=6009'],
      },
    },
  }

  const clientOptions: LanguageClientOptions = {
    // Only activate for .aihu files
    documentSelector: [{ scheme: 'file', language: 'aihu' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.aihu'),
    },
    outputChannelName: 'Aihu Language Server',
  }

  client = new LanguageClient(
    'aihu-language-server',
    'Aihu Language Server',
    serverOptions,
    clientOptions,
  )

  // Start the client. This will also launch the server.
  client.start()
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
