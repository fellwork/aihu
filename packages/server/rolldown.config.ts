import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  external: [
    '@aihu/agent',
    // @aihu/plugin is type-only at the @aihu/server boundary (config.ts
    // imports `Plugin` purely for the `plugins?: Plugin[]` field type). The
    // runtime bundle MUST NOT pull it in. Marked external to stay safe.
    '@aihu/plugin',
    'node:module',
    // The four platform-specific native addon packages are loaded at runtime
    // via createRequire(); they must not be bundled (and they may not even be
    // installed on the consumer's platform).
    '@aihu/server-darwin-arm64',
    '@aihu/server-darwin-x64',
    '@aihu/server-linux-x64-gnu',
    '@aihu/server-win32-x64-msvc',
  ],
  checks: { circularDependency: true },
  transform: { define: { __DEV__: 'false' } },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,
  },
  plugins: [dts()],
})
