import { viteRouterIntegration } from '@aihu/router/plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Scan src/pages/ for routes; sibling `*.loader.ts` files are picked up
    // by `@aihu/router` as the route's `defineLoader` registration.
    viteRouterIntegration({ pagesDir: 'src/pages' }),
  ],
  // SSR target for this example — the loader runs server-side per request.
  ssr: {
    target: 'node',
  },
})
