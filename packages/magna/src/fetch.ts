/**
 * @aihu/magna — dep-free GraphQL fetch with JWT relay.
 *
 * createMagnaFetch builds a typed GraphQL POST wrapper. No external deps;
 * uses globalThis.fetch (or options.fetch for testing/edge environments).
 */
import type { MagnaFetch, MagnaPluginOptions } from './types.js'

/**
 * Create a typed GraphQL fetch function bound to the given options.
 *
 * JWT relay: reads `options.getToken?.()` per request. When the getter
 * returns a non-null string the Authorization header is added; when it
 * returns null the header is omitted entirely (per relay spec).
 *
 * Static headers in `options.headers` are merged before the per-call
 * Authorization header so callers can override if needed.
 *
 * Network failures propagate as thrown errors. GraphQL-level errors are
 * returned inside the response envelope (`{ data: null, errors: [...] }`).
 */
export function createMagnaFetch(options: MagnaPluginOptions): MagnaFetch {
  const fetchImpl = options.fetch ?? globalThis.fetch

  return async function magnaFetch<TData = unknown>(
    operation: string,
    variables?: Readonly<Record<string, unknown>>,
  ): Promise<{
    readonly data: TData | null
    readonly errors?: ReadonlyArray<{ readonly message: string }>
  }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...options.headers,
    }

    const token = options.getToken?.() ?? null
    if (token !== null) {
      headers.authorization = `Bearer ${token}`
    }

    const body = JSON.stringify({
      query: operation,
      ...(variables !== undefined ? { variables } : {}),
    })

    const response = await fetchImpl(options.url, {
      method: 'POST',
      headers,
      body,
    })

    const json = (await response.json()) as {
      data?: TData | null
      errors?: Array<{ message: string }>
    }

    return {
      data: json.data ?? null,
      ...(json.errors ? { errors: json.errors } : {}),
    }
  }
}
