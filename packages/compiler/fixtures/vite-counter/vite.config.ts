import { defineConfig } from 'vite'
import { scribeCompilerPlugin } from '../../js/index.ts'

export default defineConfig({
  plugins: [scribeCompilerPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
})
