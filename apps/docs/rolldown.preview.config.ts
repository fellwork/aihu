import { defineConfig } from 'rolldown'

export default defineConfig({
  input: 'playground/preview-runtime.ts',
  output: {
    format: 'iife',
    name: '__aihu',
    file: 'dist/aihu-preview-bundle.js',
  },
})
