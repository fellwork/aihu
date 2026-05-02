/**
 * Typed base for all `@scribe/arbor` runtime errors. Per v0 spec §10.2.
 *
 * `code` and a dev-mode `origin` field land with devtools — matching the
 * pattern in `packages/signals/src/errors.ts`. v0 ships only `name` +
 * `message`. See `.team/phase-3/spec-arbor.md` §1.8.
 */
export class ArborError extends Error {
  override name = 'ArborError'
}

/**
 * Thrown by `when()`, `each()`, and `MountScope.serialize()` v0 stubs.
 * Subclass of `ArborError` so `catch (e: ArborError)` catches both.
 */
export class ArborNotImplementedError extends ArborError {
  override name = 'ArborNotImplementedError'
  constructor(feature: string) {
    super(`${feature} is not implemented in v0 — see v1 roadmap`)
  }
}
