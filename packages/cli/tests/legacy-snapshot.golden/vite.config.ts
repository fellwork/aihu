import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'
import aihuConfig from './aihu.config.ts'

export default defineConfig({
  // Vite/esbuild pre-bundles dependencies for dev. `@aihu/app`'s client entry
  // imports the `virtual:aihu-routes` / `virtual:aihu-layouts` modules that the
  // router plugin resolves at request time — esbuild's pre-bundle pass can't see
  // them, so it MUST be excluded or `vite dev` fails to start.
  optimizeDeps: { exclude: ['@aihu/app'] },
  // Everything project-shaped lives in aihu.config.ts — pages dir, <head>,
  // css mode, and the agent/SEO surface. This file stays Vite-shaped.
  plugins: [viteAihuPlugin(aihuConfig)],
})
