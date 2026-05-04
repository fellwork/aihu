import { viteRouterIntegration } from '@scribe/router/plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [viteRouterIntegration({ pagesDir: 'src/pages' })],
  ssr: {
    target: 'node',
  },
})
