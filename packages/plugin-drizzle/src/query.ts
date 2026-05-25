/**
 * @aihu-plugin/drizzle — query adapters.
 *
 * Turns a Drizzle query into the two data-access shapes aihu uses:
 *
 *   1. `createDrizzleResource(db, queryFn)` → a `(key: string) => Promise<T>`
 *      fetcher, drop-in for `@aihu-plugin/data`'s `createResource`.
 *   2. `drizzleLoader(db, queryFn)` → a `DefinedLoader<T>` for `@aihu/server`'s
 *      `defineLoader` (parallel SSR loaders).
 *
 * SERVER-ONLY. A Drizzle `db` handle holds a live DB connection, so these run
 * exclusively in the SSR / loader tier — never in a browser bundle. This
 * package therefore carries NO `.size-limit.json` row (see
 * `.size-limit.README.md`, server-side classification).
 *
 * Optional-peer discipline: `drizzle-orm` and its drivers (`postgres`,
 * `@libsql/client`) are OPTIONAL peerDependencies. This module imports NO
 * `drizzle-orm` runtime value and references Drizzle types only via
 * `import type`, so `import('@aihu-plugin/drizzle')` succeeds even when no
 * Drizzle package is installed. The user supplies the `db` handle and query
 * fn; we only `await` the result.
 */

// Type-only re-exports of the structural Drizzle shapes. These erase at build
// time (verbatimModuleSyntax), so nothing from `drizzle-orm` is required at
// runtime — the optional-peer guarantee.
import type { LoaderFn, RouteContext } from '@aihu/server'
import { defineLoader } from '@aihu/server'
import type { DrizzleQueryFn, DrizzleResourceOptions } from './types.ts'

// Re-export DefinedLoader so consumers do not need a direct @aihu/server import
// just to type the return of drizzleLoader.
export type { DefinedLoader } from '@aihu/server'

/**
 * Run a user query fn against a Drizzle handle and normalize the result to a
 * real `Promise<T>`. A Drizzle query builder is a `PromiseLike`, not a true
 * `Promise`, so we wrap it in `Promise.resolve(...)` to give callers a value
 * `createResource`'s `fetcher: (key) => Promise<T>` contract guarantees.
 */
async function runQuery<DB, K, T>(db: DB, queryFn: DrizzleQueryFn<DB, K, T>, key: K): Promise<T> {
  return await Promise.resolve(queryFn(db, key))
}

/**
 * Build a `createResource`-compatible fetcher from a Drizzle query.
 *
 * The returned function has signature `(key: string) => Promise<T>` — exactly
 * what `@aihu-plugin/data`'s `createResource(keySignal, fetcher, options?)`
 * expects as its second argument.
 *
 * @param db       A Drizzle database handle (pg / sqlite / libsql). Kept fully
 *                 generic; the adapter never inspects it.
 * @param queryFn  `(db, key) => DrizzleQuery<T> | Promise<T>`. `key` is the
 *                 parsed cache key (see `options.parseKey`; defaults to the raw
 *                 string).
 * @param options  `parseKey` to transform the string cache key before it hits
 *                 the query (e.g. `Number`).
 *
 * @example
 * import { drizzle } from 'drizzle-orm/libsql'
 * import { eq } from 'drizzle-orm'
 * import { createResource } from '@aihu-plugin/data'
 * import { createDrizzleResource } from '@aihu-plugin/drizzle'
 *
 * const db = drizzle(client)
 * const fetchUser = createDrizzleResource(
 *   db,
 *   (db, id: number) => db.select().from(users).where(eq(users.id, id)),
 *   { parseKey: Number },
 * )
 * const user = createResource(idSignal, fetchUser)
 */
export function createDrizzleResource<DB, K, T>(
  db: DB,
  queryFn: DrizzleQueryFn<DB, K, T>,
  options?: DrizzleResourceOptions,
): (key: string) => Promise<T> {
  const parseKey = options?.parseKey
  return (key: string): Promise<T> => {
    const typedKey = (parseKey ? parseKey(key) : key) as K
    return runQuery(db, queryFn, typedKey)
  }
}

/**
 * Build a `defineLoader`-wrapped SSR loader from a Drizzle query.
 *
 * The query fn receives the Drizzle handle and the `@aihu/server` `RouteContext`
 * (params, request, etc.), so loaders can read `ctx.params.id` directly. The
 * result is a `DefinedLoader<T>` ready to pass to `defineRoute(..., { loader })`.
 * Loader errors are caught by `@aihu/server`'s `runLoader` and surfaced as
 * `ctx.loaderData.error` — this adapter does not swallow them.
 *
 * @example
 * import { drizzle } from 'drizzle-orm/libsql'
 * import { eq } from 'drizzle-orm'
 * import { defineRoute } from '@aihu/server'
 * import { drizzleLoader } from '@aihu-plugin/drizzle'
 *
 * const db = drizzle(client)
 * const userLoader = drizzleLoader(db, (db, ctx) =>
 *   db.select().from(users).where(eq(users.id, Number(ctx.params.id))),
 * )
 * export const userRoute = defineRoute('/users/:id', handler, { loader: userLoader })
 */
export function drizzleLoader<DB, T>(
  db: DB,
  queryFn: DrizzleQueryFn<DB, RouteContext, T>,
): ReturnType<typeof defineLoader<T>> {
  const fn: LoaderFn<T> = (ctx: RouteContext) => runQuery(db, queryFn, ctx)
  return defineLoader<T>(fn)
}
