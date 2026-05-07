import { defineConfig } from 'rolldown'

const external = [
  'node:child_process',
  'node:path',
  'node:url',
  'node:util',
  'node:fs',
  'node:fs/promises',
  'node:os',
  '@modelcontextprotocol/sdk',
  '@modelcontextprotocol/sdk/server/index.js',
  '@modelcontextprotocol/sdk/server/stdio.js',
  '@modelcontextprotocol/sdk/types.js',
]

export default defineConfig({
  input: 'src/server.ts',
  external,
  checks: { circularDependency: true },
  output: {
    file: 'dist/server.js',
    format: 'esm',
    banner: '#!/usr/bin/env node',
    sourcemap: true,
  },
})
