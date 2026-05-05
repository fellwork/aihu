import { defineConfig } from 'vite'
import { aihuCompilerPlugin } from '../../js/index.ts'

export default defineConfig({
  plugins: [aihuCompilerPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
})
