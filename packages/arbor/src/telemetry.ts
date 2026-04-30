/**
 * Mount-lifecycle telemetry slot per `.team/phase-3/spec-arbor.md` §2.8.
 *
 * `_observeMount` is a no-op in production; the dev plugin overrides it via
 * `_setMountObserver` to stream events to a profile recorder. Rolldown
 * inlines the no-op default so call sites collapse to ~0 B in production
 * (verify via `bun run size`; if not, switch to a `__DEV__` constant).
 *
 * Extracted from `mount.ts` per Phase 3 Verifier Finding 1 + Learning #13
 * (module sizing): single-concern modules read more cleanly for agentic
 * navigation.
 */

/**
 * Telemetry event emitted at reactivity-relevant boundaries inside
 * `mount()`. Five event kinds:
 *   - `mount-start` / `mount-end` — scope lifecycle
 *   - `effect-create` / `effect-fire` / `effect-dispose` — per-binding
 *
 * Future extensions (dependency count, propagation depth) live behind
 * sub-project #10 (PGO) and are not in v0.
 *
 * @internal
 */
export interface MountTelemetry {
  readonly kind: 'mount-start' | 'mount-end' | 'effect-create' | 'effect-fire' | 'effect-dispose'
  readonly path: string
  readonly timestamp: number
}

/**
 * No-op observer in production. Dev plugin overrides via `_setMountObserver`
 * to stream events to a profile recorder. Per spec §2.8, Rolldown should
 * eliminate the call sites in production (verify via `bun run size` after
 * Task 16; if not, switch to a `__DEV__` constant).
 *
 * @internal
 */
export let _observeMount: (event: MountTelemetry) => void = () => {}

/**
 * Replace the active observer. Used by the dev-mode build plugin.
 * Tests reset to `() => {}` in a `finally` block.
 *
 * @internal
 */
export function _setMountObserver(fn: (event: MountTelemetry) => void): void {
  _observeMount = fn
}
