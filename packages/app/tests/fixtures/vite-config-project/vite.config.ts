import { defineConfig } from 'vite'

// A hand-written plugin carrying the aihu config contract, rather than a real
// `viteAihuPlugin()` call.
//
// Deliberate: this fixture's job is to prove `loadAihuConfig()` can read a
// config out of a real Vite config file. Importing `@aihu/app` here would make
// that depend on `@aihu/app` being BUILT — which is true locally and false in
// CI, where the app package is typechecked but not built before tests run.
// That is the same local-vs-CI disagreement that has bitten twice today.
//
// `viteAihuPlugin()` actually registering the marker is covered separately, by
// unit tests that call it directly.
const isProd = process.env.NODE_ENV !== 'development'

const aihuConfig = {
  dir: { pages: 'src/pages', components: 'src/components' },
  build: { bundler: 'rolldown' },
  dev: { port: 4321 },
  // COMPUTED on purpose — proves the loader reads the evaluated config, which
  // a source-parsing approach could not.
  compiler: { islands: isProd },
  app: { head: { title: 'read-from-vite-config' } },
}

export default defineConfig({
  plugins: [
    {
      name: 'aihu:config',
      api: {
        getAihuConfig: () => aihuConfig,
        aihuModule: '@aihu/app',
        getOptions: () => aihuConfig,
      },
    },
  ],
})
