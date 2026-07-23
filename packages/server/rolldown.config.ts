import type { Plugin } from 'rolldown'
import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

// Shared externals for both entries. The four platform-specific native addon
// packages are loaded at runtime via createRequire(); they must never be
// bundled (and may not even be installed on the consumer's platform).
const nativeAddonExternals = [
  '@aihu/server-darwin-arm64',
  '@aihu/server-darwin-x64',
  '@aihu/server-linux-x64-gnu',
  '@aihu/server-win32-x64-msvc',
]

// @aihu/signals MUST be external in every entry that reaches the SSR scope
// wrap (main + native). Scope adoption works through a module-global
// `_currentScope` inside signals; bundling a private copy into dist would
// give the server's `effectScope()` a DIFFERENT `_currentScope` than the
// one the app's `effect()`/`computed()` calls register against — the
// per-render scope would silently adopt nothing and the SSR leak fix would
// be a no-op. One shared signals instance, always.
const signalsExternal = '@aihu/signals'

// loader.ts lazily does `import('./native.ts')` so that TS (moduleResolution:
// Bundler + allowImportingTsExtensions) and vitest resolve it to src/native.ts.
// In the build we must (a) keep it external so it is NOT inlined back into
// dist/index.js (which would re-introduce the node:module leak) AND (b) rewrite
// the specifier to './native.js' so the emitted dynamic import resolves the
// sibling dist/native.js at runtime. A bare `external: ['./native.ts']` keeps
// it external but leaves the wrong (.ts) specifier in the output.
const externalizeNativeAsJs: Plugin = {
  name: 'externalize-native-as-js',
  resolveId(source) {
    if (source === './native.ts' || source === './native.js') {
      return { id: './native.js', external: true }
    }
    return null
  },
}

export default defineConfig([
  // ---------------------------------------------------------------------------
  // MAIN entry — runtime-agnostic. MUST build node:module-free.
  // ---------------------------------------------------------------------------
  //
  // No `platform: 'node'` here. The Bug 4 fix put platform:'node' on this entry
  // so the externalized require became a real `import { createRequire } from
  // "node:module"`. That static node:module import does NOT tree-shake, so any
  // consumer that bundled @aihu/server for the browser (transitively via
  // @aihu/app) leaked createRequire and threw a TypeError on bootstrap
  // (@aihu/app@0.1.8 regression). The native loader now lives in src/native.ts
  // (the @aihu/server/native entry below) and is imported LAZILY from
  // loader.ts via `import('./native.js')`, so this main entry's static import
  // graph contains no node: builtin. See investigation
  // 4a796a8f-0f2b-4865-a498-73cf11b6f04c.
  {
    input: 'src/index.ts',
    external: [
      '@aihu/agent',
      // GX P4 (#466): the governed boundary consumes resolvePrincipal /
      // decideEmission from the principal gate — external, never inlined.
      '@aihu/agent-service',
      // @aihu/plugin is type-only at the @aihu/server boundary (config.ts
      // imports `Plugin` purely for the `plugins?: Plugin[]` field type). The
      // runtime bundle MUST NOT pull it in. Marked external to stay safe.
      '@aihu/plugin',
      // See signalsExternal note above — a bundled copy breaks scope adoption.
      signalsExternal,
      ...nativeAddonExternals,
    ],
    checks: { circularDependency: true },
    transform: { define: { __DEV__: 'false' } },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
    },
    // externalizeNativeAsJs must run before dts so the .ts→.js rewrite applies
    // to the dynamic import('./native.ts') in loader.ts.
    plugins: [externalizeNativeAsJs, dts()],
  },

  // ---------------------------------------------------------------------------
  // NATIVE entry — @aihu/server/native. The ONLY node:module-bearing artifact.
  // ---------------------------------------------------------------------------
  //
  // platform:'node' lives HERE so Rolldown emits a real
  // `import { createRequire } from "node:module"; var __require = createRequire(import.meta.url)`
  // that survives a downstream Rolldown re-bundle (e.g. Vite 8's config loader)
  // into an ESM scope — keeping the Bug 4 fix intact for the native path.
  {
    input: { native: 'src/native.ts' },
    platform: 'node',
    // signalsExternal: same shared-instance requirement as the main entry —
    // renderToStringNative wraps the factory in a per-render effectScope.
    external: ['node:module', signalsExternal, ...nativeAddonExternals],
    checks: { circularDependency: true },
    transform: { define: { __DEV__: 'false' } },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
      entryFileNames: '[name].js',
    },
    plugins: [dts({ outFile: 'dist/native.d.ts' })],
  },

  // ---------------------------------------------------------------------------
  // HEAD-LOWERING entry — @aihu/server/head-lowering. Pure, browser-safe.
  // ---------------------------------------------------------------------------
  //
  // The SEO `routeHeadToSsrHead` mapper is dependency-free and side-effect free
  // (only uses the web-standard `URL`). It is reachable from the BROWSER via
  // @aihu/app's client bundle (B5 client-nav head updater) — importing it from
  // the main barrel would drag loader.ts and re-introduce the lazy-native graph.
  // This dedicated entry keeps the client import node:-free (check:runtime-purity).
  {
    input: { 'head-lowering': 'src/head-lowering.ts' },
    external: ['@aihu/agent', '@aihu/plugin', ...nativeAddonExternals],
    checks: { circularDependency: true },
    transform: { define: { __DEV__: 'false' } },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
      entryFileNames: '[name].js',
    },
    plugins: [dts({ outFile: 'dist/head-lowering.d.ts' })],
  },
])
