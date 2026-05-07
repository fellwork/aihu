/**
 * `@aihu/scraping` — O(1) sliding-window rate limiter.
 *
 * Algorithm: Fixed-window sliding approximation.
 * Security invariant (Amendment 4 / §6.8): every operation is O(1).
 * No sorted structures, no expiry scans, no per-call iteration.
 */

export interface RateLimiterOptions {
  /** Maximum map size (for memory safety). Default: 100_000. */
  maxKeys?: number
  /** Clock override for testing. Default: Date.now. */
  now?: () => number
}

export interface RateLimitPlugin {
  checkRateLimit(rateSpec: string, key: string): boolean
}

interface WindowState {
  count: number
  windowStart: number
}

interface ParsedSpec {
  limit: number
  windowMs: number
}

const UNIT_MS: Record<string, number> = {
  sec: 1_000,
  min: 60_000,
  hour: 3_600_000,
}

/** Parse `'100/min'` → `{ limit: 100, windowMs: 60000 }`. O(1). */
function parseRateSpec(rateSpec: string): ParsedSpec {
  const slashIdx = rateSpec.indexOf('/')
  if (slashIdx === -1) {
    throw new Error(`@aihu/scraping: invalid rateSpec "${rateSpec}" — expected "<n>/<unit>"`)
  }
  const limit = parseInt(rateSpec.slice(0, slashIdx), 10)
  const unit = rateSpec.slice(slashIdx + 1)
  const windowMs = UNIT_MS[unit]
  if (windowMs === undefined || !Number.isFinite(limit) || limit <= 0) {
    throw new Error(
      `@aihu/scraping: invalid rateSpec "${rateSpec}" — unit must be sec|min|hour, limit must be positive integer`,
    )
  }
  return { limit, windowMs }
}

/**
 * Create an O(1) fixed-window rate limiter that satisfies `RateLimitPlugin`.
 *
 * Each key gets its own window record in the map. Window resets happen
 * in-place on the relevant key's record — no global scans.
 */
export function createRateLimiter(options?: RateLimiterOptions): RateLimitPlugin {
  const maxKeys = options?.maxKeys ?? 100_000
  const now = options?.now ?? Date.now

  // One Map entry per (key). No secondary structures.
  const store = new Map<string, WindowState>()

  // Spec parse cache — bounded by the number of distinct rateSpec strings
  // in practice (typically 1–5), so no memory concern.
  const specCache = new Map<string, ParsedSpec>()

  function getParsedSpec(rateSpec: string): ParsedSpec {
    let parsed = specCache.get(rateSpec)
    if (parsed === undefined) {
      parsed = parseRateSpec(rateSpec)
      specCache.set(rateSpec, parsed)
    }
    return parsed
  }

  return {
    checkRateLimit(rateSpec: string, key: string): boolean {
      const { limit, windowMs } = getParsedSpec(rateSpec)
      const ts = now()

      let state = store.get(key)

      if (state === undefined) {
        // Key not yet seen — check cap before inserting.
        if (store.size >= maxKeys) {
          console.warn(
            `@aihu/scraping: rate-limiter map cap (${maxKeys}) reached; ` +
              `allowing key "${key}" fail-open (safety valve).`,
          )
          return true
        }
        state = { count: 0, windowStart: ts }
        store.set(key, state)
      } else if (ts - state.windowStart >= windowMs) {
        // Window expired — reset in-place (O(1), no new allocation on hot path).
        state.count = 0
        state.windowStart = ts
      }

      if (state.count >= limit) {
        return false
      }

      state.count += 1
      return true
    },
  }
}

/** Convenience alias matching the `RateLimitPlugin` factory convention. */
export { createRateLimiter as createRateLimitPlugin }
