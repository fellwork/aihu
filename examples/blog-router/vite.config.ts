import { defineConfig } from 'vite'
import { viteScribePlugin } from '@scribe/app'

export default defineConfig({
  plugins: [
    viteScribePlugin({
      dir: { pages: 'src/pages' },
    }),
  ],
})
