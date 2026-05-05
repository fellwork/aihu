import { defineConfig } from 'vite'
import { viteAihuPlugin } from '@aihu/app'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      dir: { pages: 'src/pages' },
    }),
  ],
})
