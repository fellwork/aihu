/**
 * @aihu/plugin-demo — runtime export.
 *
 * `createDemoRuntime()` returns a reactive surface backed by `@aihu/signals`.
 * This proves that plugins can export plain ESM runtime helpers (no plugin-
 * contract slot) that participate in the framework's reactive contract.
 *
 * Per the consumer contract (Pattern 3), runtime exports are direct package
 * exports — not plugin-contract slot contributions. They are consumed like
 * any ESM module.
 *
 * @example
 * import { createDemoRuntime } from '@aihu/plugin-demo'
 *
 * const runtime = createDemoRuntime()
 * console.log(runtime.count()) // 0
 * runtime.increment()
 * console.log(runtime.count()) // 1
 */

import { computed, signal } from '@aihu/signals'
import type { DemoResource } from './types.ts'

/**
 * Create a reactive demo runtime surface.
 *
 * Returns a `DemoResource` with a `count` signal (read-only getter) and an
 * `increment()` action. Uses `signal()` and `computed()` from `@aihu/signals`.
 */
export function createDemoRuntime(): DemoResource {
  const [_count, setCount] = signal(0)
  const countComputed = computed(() => _count())

  return {
    count: countComputed,
    increment: () => setCount((prev) => prev + 1),
  }
}
