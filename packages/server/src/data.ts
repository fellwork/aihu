import type { RouteContext } from './types.ts'

export interface LoaderResult<T> {
  readonly data: T
  readonly error?: Error
  readonly status: number
}

export type LoaderFn<T> = (ctx: RouteContext) => Promise<T>

export interface DefinedLoader<T> {
  readonly _brand: 'DefinedLoader'
  /** @internal */
  readonly fn: LoaderFn<T>
}

export interface LoadedRouteContext<T> extends RouteContext {
  readonly loaderData: LoaderResult<T>
}

/**
 * Loaders run before the route handler. All errors are caught and wrapped —
 * loaders never throw to the router. Multiple loaders run in parallel.
 *
 * @example
 * const userLoader = defineLoader(async (ctx) => fetchUser(ctx.params.id))
 * const userRoute = defineRoute('/users/:id', async (req, ctx) => {
 *   const { data, error } = ctx.loaderData
 *   if (error) return serverError(error)
 *   return json(data)
 * }, { loader: userLoader })
 */
export function defineLoader<T>(fn: LoaderFn<T>): DefinedLoader<T> {
  return { _brand: 'DefinedLoader', fn }
}

export async function runLoader<T>(
  fn: LoaderFn<T>,
  ctx: RouteContext,
): Promise<LoaderResult<T>> {
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
