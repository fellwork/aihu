import type { RouteDefinition } from '@scribe/router'

/** Options for AdapterContext.createHandlerSource(). */
export interface CreateHandlerSourceOptions {
  /**
   * Import specifier for the compiled routes manifest module.
   * Default: './routes-manifest.js'
   */
  routesSpecifier?: string
  /**
   * Import specifier for @scribe/server.
   * Default: '@scribe/server'
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
  /** The resolved ScribeConfig passed to viteScribePlugin(). */
  readonly config: import('./config.ts').ScribeConfig

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
   */
  createHandlerSource(options?: CreateHandlerSourceOptions): string
}

/**
 * The ScribeAdapter interface. Implemented by @scribe/adapter-cloudflare,
 * @scribe/adapter-vercel, and community adapters.
 *
 * @example
 * // scribe.config.ts
 * import { defineConfig } from '@scribe/app'
 * import { cloudflare } from '@scribe/adapter-cloudflare'
 *
 * export default defineConfig({
 *   adapter: cloudflare({ name: 'my-worker' }),
 * })
 */
export interface ScribeAdapter {
  /**
   * Unique adapter name. Used in log output and error messages.
   * Convention: '<platform>' e.g. 'cloudflare', 'vercel', 'node'.
   */
  readonly name: string

  /**
   * Called by viteScribePlugin's closeBundle hook after Vite finishes
   * writing all output files. The adapter reads from context.outDir,
   * transforms the build output into the platform's required format,
   * and writes the final deployment artifact.
   */
  adapt(context: AdapterContext): Promise<void>
}
