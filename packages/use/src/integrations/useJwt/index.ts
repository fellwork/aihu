/**
 * `useJwt` — decode a JWT's payload, via the optional peer `jwt-decode`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5, wave0 seed for
 * the `@aihu/use/integrations` family — packages/use/families.json).
 *
 * THE seed that proves the per-composable optional-peer contract the whole
 * namespace redesign turns on:
 *  - `jwt-decode` is an OPTIONAL peer (`packages/use/package.json`
 *    `peerDependencies` + `peerDependenciesMeta.jwt-decode.optional`), also
 *    a `devDependency` so `tsc`/`vitest` can resolve it here.
 *  - This file is the ONLY place the `jwt-decode` specifier may appear —
 *    `scripts/dep-check.ts`'s `checkUseSubpathPurity` enforces that
 *    per-ENTRY (`families.json`'s `integrations.peers.useJwt`), not just
 *    per-package.
 *  - `/integrations` deliberately has NO aggregate entry: a bare
 *    `@aihu/use/integrations` would statically re-export all five peers'
 *    composables, so a consumer who installed only `jwt-decode` would fail
 *    a real bundler build resolving `axios`/etc — verified against Vite,
 *    resolution precedes tree-shaking. The parity gate asserts the
 *    aggregate stays absent.
 *  - CORE never imports this file (one-way rule; proven directly by
 *    `tests/integrations/core-isolation.test.ts`, which mocks `jwt-decode`
 *    to fail resolution and shows the CORE barrel still imports cleanly).
 *
 * `jwt-decode` is loaded via a lazy, memoized DYNAMIC import (not a static
 * top-level one) so that a resolution failure surfaces only when `useJwt`
 * is actually CALLED, never merely by importing this module — an unbundled
 * runtime where the peer is genuinely absent would otherwise throw at
 * module-LINK time and break every consumer, even ones that never call
 * this. Bundlers still resolve the dynamic specifier at BUILD time
 * (verified: Vite is not fooled by `import()` as an escape hatch) — the
 * per-composable ENTRY is what delivers the real isolation; this laziness
 * only keeps an unbundled load of this one module safe until invocation.
 *
 * No client/server SSR guard: decoding a JWT is pure string/JSON work with
 * no DOM dependency — same reasoning as `math/useClamp`.
 */
import { signal } from '@aihu/signals'

export interface UseJwtReturn<T> {
  /** Reactive decoded-payload getter — read as `{payload()}` in templates
   * (parens required). `undefined` until the first decode settles, or on
   * failure (see `error`). */
  readonly payload: () => T | undefined
  /** Reactive decode-error getter — a clear, descriptive `Error` when the
   * token is malformed OR the optional `jwt-decode` peer could not be
   * loaded; `undefined` once `payload` is set. `useJwt` never throws
   * synchronously — it degrades to this error state instead. */
  readonly error: () => Error | undefined
}

type JwtDecodeFn = <T>(token: string) => T

let jwtDecodeModule: Promise<JwtDecodeFn> | undefined

function loadJwtDecode(): Promise<JwtDecodeFn> {
  if (!jwtDecodeModule) {
    jwtDecodeModule = import('jwt-decode').then(
      (mod) => mod.jwtDecode as JwtDecodeFn,
      (cause: unknown) => {
        jwtDecodeModule = undefined // let a later call retry (e.g. peer installed afterward)
        throw new Error(
          "useJwt: the optional peer 'jwt-decode' could not be loaded — install it " +
            "(`npm install jwt-decode` or your package manager's equivalent) to decode tokens.",
          { cause },
        )
      },
    )
  }
  return jwtDecodeModule
}

/**
 * Decode `token`'s payload. Resolution is asynchronous (the optional peer
 * loads lazily, on first use); `payload()`/`error()` read `undefined` until
 * the decode settles, then update in place.
 */
export function useJwt<T = Record<string, unknown>>(token: string): UseJwtReturn<T> {
  const [payload, setPayload] = signal<T | undefined>(undefined)
  const [error, setError] = signal<Error | undefined>(undefined)

  loadJwtDecode()
    .then((jwtDecode) => {
      setPayload(() => jwtDecode<T>(token))
      setError(undefined)
    })
    .catch((err: unknown) => {
      setPayload(undefined)
      setError(err instanceof Error ? err : new Error(String(err)))
    })

  return { payload, error }
}
