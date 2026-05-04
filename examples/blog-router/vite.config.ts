import { scribeCompilerPlugin } from '@scribe/compiler'
import { viteRouterIntegration } from '@scribe/router/plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    scribeCompilerPlugin(),
    // Scan src/pages/ for `.scribe` files with `@route` blocks and emit a
    // virtual:scribe-routes manifest module consumed by the runtime router.
    viteRouterIntegration({ pagesDir: 'src/pages' }),
  ],
})
