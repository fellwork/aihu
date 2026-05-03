import { defineConfig } from 'vite'
import { viteRouterIntegration } from '@scribe/router/plugin'

export default defineConfig({
  plugins: [
    viteRouterIntegration({ pagesDir: 'src/pages' }),
  ],
  ssr: {
    target: 'node',
  },
})
