/**
 * @aihu/magna — resource composition over @aihu-plugin/data.
 *
 * createMagnaResource wraps createResource with a cache-key strategy that
 * combines the GraphQL operation string + serialised variables. The key signal
 * is derived from an optional reactive variables signal so queries automatically
 * re-fetch when variables change.
 *
 * Cache-key strategy (Builder-time decision): alphabetically-sorted key
 * serialisation via JSON.stringify — dep-free, ~15 LOC, deterministic.
 * Variables `{ b: 2, a: 1 }` and `{ a: 1, b: 2 }` produce the same key,
 * preventing spurious cache misses from object-property-ordering differences.
 */
import { createResource } from '@aihu-plugin/data'
import type { ResourceOptions } from '@aihu-plugin/data'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import type { MagnaFetch, MagnaResource } from './types.js'

/**
 * Alphabetically-sorted JSON serialisation of an object.
 * Produces a stable string regardless of property insertion order.
 * Returns '{}' for null/undefined input (maps to "no variables").
 */
function stableSerialise(obj: Readonly<Record<string, unknown>> | null | undefined): string {
  if (obj == null) return '{}'
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = obj[k]
  }
  return JSON.stringify(sorted)
}

/**
 * Build a stable cache key from the operation string and current variables.
 * Format: `<operation>|<sorted-vars-json>` — unique per query+variable pair.
 */
function buildCacheKey(
  operation: string,
  vars: Readonly<Record<string, unknown>> | null | undefined,
): string {
  return `${operation}|${stableSerialise(vars)}`
}

/**
 * Create a reactive Magna GraphQL resource.
 *
 * @param fetch      Magna fetch function (from createMagnaFetch).
 * @param operation  GraphQL operation string (query/mutation).
 * @param variables  Optional reactive signal whose value is passed as variables.
 *                   When the signal value changes the resource automatically
 *                   re-fetches with the new variables. A null signal value puts
 *                   the resource into idle state (no fetch).
 * @param options    Optional ResourceOptions forwarded to createResource
 *                   (initialData, dehydrate, store).
 *
 * Returns a Resource<T> (state, refetch, invalidate).
 */
export function createMagnaResource<T>(
  fetch: MagnaFetch,
  operation: string,
  variables?: Signal<Readonly<Record<string, unknown>> | null>,
  options?: ResourceOptions<T>,
): MagnaResource<T> {
  // Build a stable key signal from the operation + current variables value.
  // null variables → null key → idle state (no fetch fired).
  const [getKey, setKey] = signal<string | null>(
    variables ? buildCacheKey(operation, variables[0]()) : buildCacheKey(operation, undefined),
  )

  // When variables signal changes, recompute the key.
  // We wire this as an effect-like subscription via the createResource key signal.
  // The key signal passed to createResource is a derived value that reads the
  // variables signal (or a static key when variables is undefined).
  const keySignal: Signal<string | null | undefined> = variables
    ? ([
        () => {
          const vars = variables[0]()
          return vars === null ? null : buildCacheKey(operation, vars)
        },
        setKey,
      ] as unknown as Signal<string | null | undefined>)
    : ([() => getKey(), setKey] as unknown as Signal<string | null | undefined>)

  // Fetcher: call the magna fetch function, throw on GraphQL errors
  // (drives the resource into 'error' state).
  async function fetcher(_key: string): Promise<T> {
    // Extract variables from the key is not needed — we re-read them from the signal.
    const vars = variables ? (variables[0]() ?? undefined) : undefined
    const result = await fetch(operation, vars)
    if (result.errors && result.errors.length > 0) {
      const msgs = result.errors.map((e) => e.message).join('; ')
      throw new Error(`GraphQL error: ${msgs}`)
    }
    return result.data as T
  }

  return createResource<T>(keySignal, fetcher, options)
}
