import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

// Compile the .aihu SFC for the browser (client target) and build the static
// client into ./dist. Wrangler then serves ./dist via Workers Static Assets,
// and the Worker handles /ws + /agent/call (routed to the room Durable Object).
export default defineConfig({
  plugins: [aihuCompilerPlugin({ target: 'client' })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
