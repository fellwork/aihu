import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      dir: { pages: 'src/pages' },
      // `@aihu/css-engine` CSS is scoped to each component (folded into its
      // shadow style by default). This demo sets `shadowMode: 'none'` so the
      // bundled utility CSS also reaches external / light-DOM children — it is
      // a styling choice for this example, not a requirement of css-engine.
      css: { shadowMode: 'none' },
    }),
  ],
})
