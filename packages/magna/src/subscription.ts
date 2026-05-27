/**
 * @aihu/magna — useMagnaSubscription v0.1 degraded shim.
 *
 * v0.2 will introduce real WebSocket/SSE streaming. Until then this shim
 * returns a handle with `degraded: true` so consumers can branch on that flag
 * without breaking when streaming lands.
 *
 * A warn-once message is emitted on first call via console.warn.
 */

import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import type { MagnaSubscriptionHandle } from './types.js'

let _warned = false

/**
 * Return a degraded subscription handle.
 *
 * The handle contains:
 *   - `state`: a signal always holding null (no streaming data yet).
 *   - `close`: idempotent no-op.
 *   - `degraded`: always true in v0.1.
 *
 * A warn-once message is emitted via console.warn on first call.
 */
export function useMagnaSubscription<T>(): MagnaSubscriptionHandle<T> {
  if (!_warned) {
    _warned = true
    console.warn('magna subscriptions require v0.2 streaming; returning degraded handle')
  }

  const [getState] = signal<T | null>(null)

  const noop = (): void => {
    // no-op setter — degraded handles do not accept external writes
  }

  return {
    state: [getState, noop] as unknown as Signal<T | null>,
    close(): void {
      // Idempotent no-op in v0.1.
    },
    degraded: true,
  }
}
