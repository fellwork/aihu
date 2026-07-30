/**
 * Shared types and utilities for __APP_NAME__.
 *
 * This package's `package.json` has always declared `"main": "./src/index.ts"`.
 * Until FEL-431 that file did not exist — the manifest pointed at nothing, the
 * root `tsconfig.json` referenced the directory as a composite project, and the
 * root `moon.yml` depended on a `build` task it does not have. A package that
 * every layer refers to and none of them could load.
 */

/** Shape returned by the worker's health route. Imported by apps/web. */
export interface AppStatus {
  readonly app: string
  readonly status: 'ok' | 'degraded'
}

/**
 * Build the health payload.
 *
 * Deliberately shared rather than inlined in the worker: it is the seam that
 * makes the workspace reference graph REAL. A `shared` package nothing imports
 * is decoration, and a tsconfig reference to decoration is what produced the
 * TS6053 pair this fixes.
 */
export function appStatus(app: string, healthy = true): AppStatus {
  return { app, status: healthy ? 'ok' : 'degraded' }
}
