import { defineConfig } from 'rolldown'

/**
 * Bundle the playground preview runtime as an IIFE (`window.__aihu`).
 *
 * The `<playground-embed>` preview iframe is `sandbox="allow-scripts"` with a
 * `srcdoc` document — no module resolution, no bundler. It therefore needs the
 * aihu runtime as one plain classic script that hangs every symbol a compiled
 * component can reference off a single global. See `playground/preview-runtime.ts`.
 *
 * Ported from `apps/docs/rolldown.preview.config.ts`. The one difference is the
 * output path: apps/docs emitted straight into its hand-rolled `dist/`, whereas
 * docs-next is a plain Vite app, so this writes into `public/` and lets Vite's
 * standard public-dir copy place it at the dist root (same final URL,
 * `/aihu-preview-bundle.js`, with no custom Vite plugin). Run from `prebuild`,
 * ahead of `vite build`. Git-ignored — it is a build artifact.
 */
export default defineConfig({
  input: 'playground/preview-runtime.ts',
  output: {
    format: 'iife',
    name: '__aihu',
    file: 'public/aihu-preview-bundle.js',
    minify: true,
  },
})
