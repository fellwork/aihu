import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

// A COMPUTED value, deliberately. Reading the config off the plugin's api
// handle means we get the evaluated object — a source-parsing approach would
// see `isProd` here and have to give up.
const isProd = process.env.NODE_ENV !== 'development'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      dir: { pages: 'src/pages', components: 'src/components' },
      build: { bundler: 'rolldown' },
      dev: { port: 4321 },
      compiler: { islands: isProd },
      app: { head: { title: 'read-from-vite-config' } },
    }),
  ],
})
