/**
 * Public + internal types for `@scribe/runtime`.
 *
 * Per `.team/phase-4/spec-runtime.md` §1.2 / §1.3 / §2.1.
 */

/**
 * Shadow DOM mode for the custom element.
 *
 * - `'open'`   → `attachShadow({ mode: 'open' })`. `this.shadowRoot`
 *                accessible externally. **Default.**
 * - `'closed'` → `attachShadow({ mode: 'closed' })`. `this.shadowRoot`
 *                returns `null` externally. Runtime stores root on
 *                `SHADOW_ROOT_SYM`. **v0 LIMITATION:** compiler-emitted
 *                code reads `this.shadowRoot`, which returns `null` for
 *                closed roots. Fully functional in v1 when compiler
 *                gains `SHADOW_ROOT_SYM` awareness.
 * - `'none'`   → No shadow root. `mount()` is called with `this` (the
 *                element itself) as host. No style scoping.
 */
export type ShadowMode = 'open' | 'closed' | 'none'

export interface DefineOptions {
  shadowMode?: ShadowMode
}

/**
 * Internal — NOT re-exported from `index.ts` (spec §1.3, Decision 2B).
 *
 * The only throw site is a startup invariant violation (developer
 * error), not a production-time catchable condition. Exporting the class
 * would lock a public API contract for error codes before they
 * stabilize. Saves ~50 B gz.
 *
 * @internal
 */
export class RuntimeError extends Error {
  override name = 'RuntimeError'
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
