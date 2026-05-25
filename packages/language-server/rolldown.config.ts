import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

// Runtime deps + node builtins stay external. The vscode-languageserver packages
// are declared dependencies and resolved from node_modules at runtime; node:
// builtins must never be bundled. The migrate() codemod (relative import from
// @aihu/compiler source) IS bundled so the server is self-contained.
const external = [
  /^node:/,
  'vscode-languageserver',
  'vscode-languageserver/node.js',
  'vscode-languageserver-textdocument',
]

export default defineConfig([
  // ---------------------------------------------------------------------------
  // Library entries — server connection layer + editor-agnostic core surface.
  // ---------------------------------------------------------------------------
  {
    input: {
      server: 'src/server.ts',
      'core/index': 'src/core/index.ts',
    },
    platform: 'node',
    external,
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      entryFileNames: '[name].js',
    },
    plugins: [dts()],
  },

  // ---------------------------------------------------------------------------
  // Bin entry — the runnable `aihu-language-server` binary (stdio LSP server).
  // ---------------------------------------------------------------------------
  {
    input: { bin: 'src/bin.ts' },
    platform: 'node',
    external,
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      banner: '#!/usr/bin/env node',
      entryFileNames: '[name].js',
    },
  },
])
