import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'
import aihuConfig from './aihu.config.ts'

// The SSG build is driven entirely by `aihu.config.ts` (output: 'static').
// viteAihuPlugin wires the Rust compiler, the file-router integration, per-route
// <head> injection, and the prerender closeBundle pass.
export default defineConfig({
  plugins: [viteAihuPlugin(aihuConfig)],
})
