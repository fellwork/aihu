import { defineConfig } from 'vite'
import { scribeCompilerPlugin } from '@scribe/compiler'

export default defineConfig({
  plugins: [scribeCompilerPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
})
