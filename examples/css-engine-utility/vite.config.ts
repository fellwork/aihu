import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      dir: { pages: 'src/pages' },
      // Utility classes from `@aihu/css-engine` rely on the global cascade —
      // they MUST escape the shadow root. `css.shadowMode: 'none'` forwards
      // through to `aihuCompilerPlugin({ shadowMode: 'none' })`.
      css: { shadowMode: 'none' },
    }),
  ],
})
