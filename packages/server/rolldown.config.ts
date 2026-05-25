import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  // platform:'node' makes Rolldown emit a real
  // `import { createRequire } from "node:module"; var __require = createRequire(import.meta.url)`
  // for the externalized require, instead of the default `typeof require` Proxy
  // interop shim. The shim evaluates false (→ a no-op Proxy) when a downstream
  // bundler (e.g. Vite 8's Rolldown config loader) re-bundles a transitive
  // @aihu/server import into an ESM scope with no `require`, which broke the
  // native loader with SCRIBE_NATIVE_LOAD_FAILED (Bug 4). The createRequire
  // import is a real static ESM external that survives a downstream re-bundle.
  platform: 'node',
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
