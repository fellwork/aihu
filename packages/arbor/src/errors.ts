/**
 * Typed base for all `@aihu/arbor` runtime errors. Per v0 spec §10.2.
 *
 * `code` and a dev-mode `origin` field land with devtools — matching the
 * pattern in `packages/signals/src/errors.ts`. v0 ships only `name` +
 * `message`. See `.team/phase-3/spec-arbor.md` §1.8.
 */
export class ArborError extends Error {
  override name = 'ArborError'
}
