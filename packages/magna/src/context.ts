/**
 * @aihu/magna — injection token for the Magna fetch function.
 *
 * The compiler lowers `$query name = data.X.query(vars)` (and magna-origin
 * `$resource` entries) to
 * `const name = createMagnaResource(inject(MagnaFetchToken), data.X.query(vars))`.
 * `MagnaFetchToken` is the context token that `inject(...)` resolves at
 * component setup so `createMagnaResource` receives its `MagnaFetch`.
 *
 * Provide at app root: `provide(MagnaFetchToken, createMagnaFetch(options))`.
 * Inject in setup:    `const fetch = inject(MagnaFetchToken)`.
 *
 * Mirrors the @aihu-plugin/data `ResourceStoreToken` pattern
 * (packages/plugin-data/src/store.ts). No default value — `inject` returns
 * `undefined` when no fetch is provided.
 */
import { createContext } from '@aihu/context'
import type { MagnaFetch } from './types.js'

export const MagnaFetchToken = createContext<MagnaFetch>()
