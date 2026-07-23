/**
 * Shared SSR-simulation helper for `@aihu/use` tests.
 *
 * Runs a callback against a FRESH import of a composable module evaluated
 * with the DOM globals stubbed absent (`window`/`document`/`navigator`
 * undefined) — so the module-level `isClient` computes `false`, exactly the
 * `__ssr` environment (effect-scope plan §3/§5). Restores the globals and
 * the module registry afterwards.
 *
 * Usage (the `load` thunk keeps the import specifier static for vite):
 *
 * ```ts
 * await withSSR(
 *   () => import('../src/useMouse/index.ts'),
 *   (mod) => {
 *     const { x } = mod.useMouse()
 *     expect(x()).toBe(0)
 *   },
 * )
 * ```
 */
import { vi } from 'vitest'

export async function withSSR<M, T>(
  load: () => Promise<M>,
  fn: (mod: M) => T | Promise<T>,
): Promise<T> {
  vi.stubGlobal('window', undefined)
  vi.stubGlobal('document', undefined)
  vi.stubGlobal('navigator', undefined)
  // Re-evaluate the module graph so `isClient` (computed at module load)
  // sees the stubbed-absent globals.
  vi.resetModules()
  try {
    const mod = await load()
    return await fn(mod)
  } finally {
    vi.unstubAllGlobals()
    vi.resetModules()
  }
}
