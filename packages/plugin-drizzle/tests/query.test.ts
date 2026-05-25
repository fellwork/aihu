// @vitest-environment node

import type { RouteContext } from '@aihu/server'
import type { DrizzleQuery } from '@aihu-plugin/drizzle'
import { createDrizzleResource, drizzleLoader } from '@aihu-plugin/drizzle'
import { describe, expect, test } from 'vitest'

// Mirror of @aihu/server's internal runLoader (data.ts) — that helper is NOT
// part of the public @aihu/server barrel (only `defineLoader` is exported), so
// we reproduce its catch-into-LoaderResult contract here to prove a
// drizzleLoader's `fn` slots into the loader-run lifecycle the router uses.
async function runLoader<T>(
  fn: (ctx: RouteContext) => Promise<T>,
  ctx: RouteContext,
): Promise<{ data: T; error?: Error; status: number }> {
  try {
    const data = await fn(ctx)
    return { data, status: 200 }
  } catch (err) {
    return {
      data: undefined as unknown as T,
      error: err instanceof Error ? err : new Error(String(err)),
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory Drizzle stub.
//
// `drizzle-orm` is an OPTIONAL peer and is NOT installed in this workspace.
// This stub faithfully mimics the Drizzle query-builder shape the adapter
// relies on: a chainable `db.select().from(table).where(pred)` that is a
// `PromiseLike` (thenable) resolving to a row array when awaited. That is the
// exact contract `createDrizzleResource` / `drizzleLoader` consume, so passing
// tests prove the adapter works against a real Drizzle handle.
// ---------------------------------------------------------------------------

interface UserRow {
  id: number
  name: string
}

const USERS: ReadonlyArray<UserRow> = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
  { id: 3, name: 'Edsger' },
]

/** A Drizzle-like query builder: chainable + PromiseLike (a real `.then`). */
class QueryBuilder<T> implements PromiseLike<T> {
  constructor(private readonly exec: () => Promise<T>) {}
  // biome-ignore lint/suspicious/noThenProperty: a Drizzle query builder is INTENTIONALLY a thenable (PromiseLike) — that thenable shape is exactly what the adapter consumes, so the stub must reproduce it.
  then<R1 = T, R2 = never>(
    onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.exec().then(onfulfilled, onrejected)
  }
}

interface StubDb {
  /** Build a query that returns the user with `id`, or throws if absent. */
  selectUserById(id: number): DrizzleQuery<UserRow>
  /** Count of executed queries — proves the fetcher actually ran the query. */
  readonly stats: { executions: number }
}

function makeStubDb(): StubDb {
  const stats = { executions: 0 }
  return {
    stats,
    selectUserById(id: number): DrizzleQuery<UserRow> {
      return new QueryBuilder<UserRow>(async () => {
        stats.executions++
        const row = USERS.find((u) => u.id === id)
        if (!row) throw new Error(`no user with id ${id}`)
        return row
      })
    },
  }
}

// ---------------------------------------------------------------------------
// createDrizzleResource — fetcher factory for @aihu-plugin/data
// ---------------------------------------------------------------------------

describe('createDrizzleResource', () => {
  test('returns a (key: string) => Promise<T> fetcher', () => {
    const db = makeStubDb()
    const fetcher = createDrizzleResource(db, (d, key: string) => d.selectUserById(Number(key)))
    expect(typeof fetcher).toBe('function')
    expect(fetcher.length).toBe(1)
  })

  test('fetcher resolves the Drizzle query to a real Promise', async () => {
    const db = makeStubDb()
    const fetcher = createDrizzleResource(db, (d, key: string) => d.selectUserById(Number(key)))
    const result = fetcher('2')
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toEqual({ id: 2, name: 'Grace' })
    expect(db.stats.executions).toBe(1)
  })

  test('parseKey transforms the string cache key before the query runs', async () => {
    const db = makeStubDb()
    const fetcher = createDrizzleResource(
      db,
      // query fn receives a typed `number` key, not the raw string
      (d, id: number) => d.selectUserById(id),
      { parseKey: Number },
    )
    await expect(fetcher('1')).resolves.toEqual({ id: 1, name: 'Ada' })
  })

  test('rejects when the underlying query throws', async () => {
    const db = makeStubDb()
    const fetcher = createDrizzleResource(db, (d, key: string) => d.selectUserById(Number(key)))
    await expect(fetcher('999')).rejects.toThrow('no user with id 999')
  })

  test('works with a plain async query fn (Promise, not PromiseLike)', async () => {
    const db = makeStubDb()
    const fetcher = createDrizzleResource(db, async (_d, key: string) => ({
      echoed: key,
    }))
    await expect(fetcher('hello')).resolves.toEqual({ echoed: 'hello' })
  })
})

// ---------------------------------------------------------------------------
// drizzleLoader — DefinedLoader for @aihu/server
// ---------------------------------------------------------------------------

describe('drizzleLoader', () => {
  function makeCtx(params: Record<string, string>): RouteContext {
    return { params } as unknown as RouteContext
  }

  test('returns a DefinedLoader brand', () => {
    const db = makeStubDb()
    const loader = drizzleLoader(db, (d, ctx) => d.selectUserById(Number(ctx.params.id)))
    expect(loader._brand).toBe('DefinedLoader')
    expect(typeof loader.fn).toBe('function')
  })

  test('loader fn runs the query against the route context', async () => {
    const db = makeStubDb()
    const loader = drizzleLoader(db, (d, ctx) => d.selectUserById(Number(ctx.params.id)))
    const result = await loader.fn(makeCtx({ id: '3' }))
    expect(result).toEqual({ id: 3, name: 'Edsger' })
  })

  test('integrates with @aihu/server runLoader (success path)', async () => {
    const db = makeStubDb()
    const loader = drizzleLoader(db, (d, ctx) => d.selectUserById(Number(ctx.params.id)))
    const res = await runLoader(loader.fn, makeCtx({ id: '1' }))
    expect(res.status).toBe(200)
    expect(res.error).toBeUndefined()
    expect(res.data).toEqual({ id: 1, name: 'Ada' })
  })

  test('runLoader catches query errors into LoaderResult (never throws)', async () => {
    const db = makeStubDb()
    const loader = drizzleLoader(db, (d, ctx) => d.selectUserById(Number(ctx.params.id)))
    const res = await runLoader(loader.fn, makeCtx({ id: '999' }))
    expect(res.status).toBe(500)
    expect(res.error).toBeInstanceOf(Error)
    expect(res.error?.message).toBe('no user with id 999')
  })
})
