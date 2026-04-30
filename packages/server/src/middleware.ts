import type { Middleware } from './types.ts'

export function defineMiddleware(handler: Middleware): Middleware {
  return handler
}

/**
 * Compose middleware in array order (index 0 = outermost).
 *
 * Middleware application order in the full request pipeline:
 * 1. RouterOptions.middleware  (global)
 * 2. Route.middleware          (route-level)
 * 3. Route handler
 *
 * Auth middleware is a plain Middleware — apply globally or per-route.
 */
export function composeMiddleware(
  middlewares: ReadonlyArray<Middleware>,
): Middleware {
  return function composed(req, next) {
    const dispatch = (i: number): Promise<Response> => {
      if (i >= middlewares.length) return next()
      return Promise.resolve(middlewares[i]!(req, () => dispatch(i + 1)))
    }
    return dispatch(0)
  }
}
