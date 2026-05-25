/**
 * @aihu-plugin/drizzle — shared types for the Drizzle ORM data adapter.
 *
 * Drizzle's own types (`drizzle-orm`, `postgres`, `@libsql/client`) are
 * OPTIONAL peer dependencies. To keep this package importable when those peers
 * are absent, we DO NOT statically import any `drizzle-orm` runtime value and
 * we reference Drizzle types only through `import type` in the files that need
 * them (see `query.ts`). The structural types below describe the minimal shape
 * the adapter actually depends on, so consumers get useful typing whether or
 * not `drizzle-orm` is installed.
 */

/**
 * The minimal "thenable" shape Drizzle query builders satisfy. A Drizzle query
 * (e.g. `db.select().from(users).where(...)`) is a `PromiseLike` that resolves
 * to a row array; awaiting it executes the SQL. We accept any `PromiseLike<T>`
 * so prepared statements, `.execute()` results, and raw promises all work.
 */
export type DrizzleQuery<T> = PromiseLike<T>

/**
 * A query factory: given a Drizzle database handle and a key, returns either a
 * Drizzle query (PromiseLike) or a plain Promise of the result. This is the
 * single user-supplied function both `createDrizzleResource` and
 * `drizzleLoader` are built from.
 *
 * @typeParam DB  The Drizzle database handle type (kept generic — the adapter
 *                never inspects it, so any of the pg / sqlite / libsql handles
 *                fit without importing their concrete types).
 * @typeParam K   The key type. For `createResource` fetchers this is the cache
 *                key (a string); for loaders it is the loader context.
 * @typeParam T   The resolved row/result type.
 */
export type DrizzleQueryFn<DB, K, T> = (db: DB, key: K) => DrizzleQuery<T> | Promise<T>

/**
 * Options accepted by `createDrizzleResource`.
 */
export interface DrizzleResourceOptions {
  /**
   * Map the resolved key string into the typed key passed to the query fn.
   * Defaults to identity (the raw cache-key string). Use this when your query
   * needs a parsed value (e.g. `Number(key)`).
   */
  readonly parseKey?: (key: string) => unknown
}
