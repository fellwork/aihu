import type { RouteDefinition } from '@aihu/router'
import type { ServerEntryContext } from './server-entry.ts'

export type { ServerEntryContext }

/** Options for AdapterContext.createHandlerSource(). */
export interface CreateHandlerSourceOptions {
  /**
   * Import specifier for the compiled routes manifest module.
   * Default: './routes-manifest.js'
   */
  routesSpecifier?: string
  /**
   * Import specifier for @aihu/server.
   * Default: '@aihu/server'
   * Adapters that bundle server deps may override this to a relative path.
   */
  serverSpecifier?: string
}

/**
 * Context provided to adapter.adapt() after Vite's closeBundle completes.
 * All paths are absolute. All async utilities return Promise<void>.
 */
export interface AdapterContext {
  /** Absolute path to Vite's output directory (resolved build.outDir). */
  readonly outDir: string
  /** Absolute path to the project root (Vite's config.root). */
  readonly root: string
  /**
   * Route definitions derived from the pages directory scan.
   * Contains pattern, segments, and name — module() is irrelevant at adapt() time.
   */
  readonly routes: ReadonlyArray<RouteDefinition>
  /** The resolved AihuConfig passed to viteAihuPlugin(). */
  readonly config: import('./config.ts').AihuConfig

  /**
   * Emit a file relative to outDir. Creates parent directories as needed.
   * path is relative to outDir.
   */
  emitFile(path: string, content: string): Promise<void>

  /**
   * Copy a file or directory (absolute paths). Recursive. Overwrites existing.
   */
  copy(src: string, dest: string): Promise<void>

  /**
   * Write a file at an absolute path. Creates parent directories as needed.
   */
  writeFile(absolutePath: string, content: string): Promise<void>

  /**
   * Generate the source text of a server handler module.
   *
   * Returns a JS string that imports routes and createRequestRouter,
   * wires the handler, and exports `{ handler }`. The adapter appends
   * its platform-specific export wrapper.
   *
   * @deprecated Use `AihuAdapter.serverEntry` with `output: 'ssr'`.
   *
   * This produces a module that is written to disk AFTER Vite finishes, so it
   * lives outside the build graph: it cannot import `virtual:aihu-routes`, and
   * the `routes` it is handed carry
   * `module: () => Promise.resolve({ default: null })`. Every route it wires
   * therefore 404s by construction. Retained so existing `ssr: true` adapter
   * configs keep building; slated for deletion in a follow-up.
   */
  createHandlerSource(options?: CreateHandlerSourceOptions): string
}

/**
 * The AihuAdapter interface. Implemented by @aihu/adapter-cloudflare,
 * @aihu/adapter-vercel, and community adapters.
 *
 * @example
 * // aihu.config.ts
 * import { defineConfig } from '@aihu/app'
 * import { cloudflare } from '@aihu/adapter-cloudflare'
 *
 * export default defineConfig({
 *   adapter: cloudflare({ name: 'my-worker' }),
 * })
 */
export interface AihuAdapter {
  /**
   * Unique adapter name. Used in log output and error messages.
   * Convention: '<platform>' e.g. 'cloudflare', 'vercel', 'node'.
   */
  readonly name: string

  /**
   * Called by viteAihuPlugin's closeBundle hook after Vite finishes
   * writing all output files. The adapter reads from context.outDir,
   * transforms the build output into the platform's required format,
   * and writes the final deployment artifact.
   *
   * Under `output: 'ssr'` this fires ONCE, for the client environment only —
   * `closeBundle` is a per-environment hook and an unguarded adapter would
   * otherwise run twice per build.
   */
  adapt(context: AdapterContext): Promise<void>

  /**
   * Contribute the platform wrapper for `virtual:aihu-server-entry`
   * (`output: 'ssr'` only). Returns JS SOURCE, appended verbatim after the
   * framework prelude, and expected to carry the platform's own
   * `export default`.
   *
   * This replaces `AdapterContext.createHandlerSource`, and the difference is
   * not stylistic. `createHandlerSource` text is written to disk after the
   * build; this text is INSIDE the build graph, so `ctx.handler` is a real
   * router over real route chunks rather than a manifest of 404 placeholders.
   *
   * Optional: an adapter without it still works for `'spa'` / `'static'`, and
   * an `'ssr'` build without one falls back to the prelude's bare named
   * `handler` export (usable by hand, not deployable as-is).
   *
   * @example
   * serverEntry: ({ handler }) => `export default {
   *   async fetch(request, env) {
   *     const res = await ${handler}(request)
   *     return res.status === 404 ? env.ASSETS.fetch(request) : res
   *   },
   * }`
   */
  serverEntry?(context: ServerEntryContext): string
}
