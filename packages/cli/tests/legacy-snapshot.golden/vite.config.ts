import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      dir: { pages: 'src/pages' },
    }),
  ],
})
