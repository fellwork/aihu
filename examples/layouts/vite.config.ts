import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      dir: { pages: 'src/pages', layouts: 'src/layouts' },
      // Light-DOM rendering: layouts + pages share the global cascade, and SPA
      // link interception works for `<a>` inside the layout shell. (With the
      // default shadow mode each component is encapsulated.)
      css: { shadowMode: 'none' },
    }),
  ],
})
