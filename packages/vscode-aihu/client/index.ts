/**
 * packages/vscode-aihu/client/index.ts
 *
 * VS Code extension client — activates on onLanguage:aihu and spawns the
 * Aihu LSP server as an out-of-process Node.js child via stdio transport.
 */
import * as path from 'node:path'
import { type ExtensionContext, workspace } from 'vscode'
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node.js'

let client: LanguageClient | undefined

export function activate(context: ExtensionContext): void {
  // The server module is compiled to dist/server/index.js
  const serverModule = context.asAbsolutePath(path.join('dist', 'server', 'index.js'))

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
