/**
 * build.ts — bundle the imperative auth+magna+seo integration.
 *
 * Server-only example: no .aihu SFCs, no index.html, no Vite. This mirrors
 * examples/css-pluggability's Stage-2 Bun.build bundling only — it validates
 * that the imperative wiring in src/routes.ts bundles cleanly against all
 * three packages (@aihu/auth, @aihu/magna, @aihu/seo) plus @aihu/server and
 * @aihu/signals, and exits 0 on success.
 *
 * PREREQUISITE: the workspace packages must be built first so the `@aihu/*`
 * dist targets exist:
 *
 *   bun run build      # at the repo root
 *
 * (CI's examples job runs `bun run build` before building examples.)
 *
 * Run:
 *   bun run build.ts
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const out = await Bun.build({
  entrypoints: [resolve(__dirname, 'src/routes.ts')],
  outdir: resolve(__dirname, 'dist'),
  target: 'bun',
  format: 'esm',
})

if (!out.success) {
  console.error('[build] bundle failed:', out.logs)
  process.exit(1)
}

console.log('[build] done. Bundled src/routes.ts → dist/')
