import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  external: [
    '@scribe/agent',
    'node:module',
    // The four platform-specific native addon packages are loaded at runtime
    // via createRequire(); they must not be bundled (and they may not even be
    // installed on the consumer's platform).
    '@scribe/server-darwin-arm64',
    '@scribe/server-darwin-x64',
    '@scribe/server-linux-x64-gnu',
    '@scribe/server-win32-x64-msvc',
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
