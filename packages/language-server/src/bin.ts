/**
 * packages/language-server/src/bin.ts
 *
 * Runnable entry for the `aihu-language-server` binary. Editors launch this over
 * stdio (e.g. VS Code via vscode-languageclient, or any LSP-aware editor with a
 * `{ command: "aihu-language-server" }` server spec).
 *
 * The rolldown build prepends a `#!/usr/bin/env node` shebang to dist/bin.js.
 */
import { startServer } from './server.ts'

startServer()
