/**
 * @aihu/magna — shared type definitions.
 *
 * All interfaces in this file are exported from the package root (`src/index.ts`).
 * Types annotated "documentation artifact only" are included for IDE discoverability
 * and schema generation; they are never instantiated at runtime.
 */
import type { BuildContext } from '@aihu/plugin'
import type { Resource } from '@aihu-plugin/data'
import type { Signal } from '@aihu/signals'

/** Configuration options for the magna GraphQL plugin. */
export interface MagnaPluginOptions {
  /** Magna GraphQL endpoint URL (e.g., https://magna.example.com/graphql). */
  readonly url: string
  /** Path to the GraphQL SDL schema file. Default: 'schema.graphql'. */
  readonly schemaPath?: string
  /** Static headers merged into every request. */
  readonly headers?: Readonly<Record<string, string>>
  /** Git revision (informational; injected into build metadata). */
  readonly gitRev?: string
  /**
   * Getter for the current JWT. Called per-request.
   * Return null to omit the Authorization header entirely.
   */
  readonly getToken?: () => string | null
  /**
   * Custom fetch implementation. Defaults to globalThis.fetch.
   * Useful for testing or non-standard environments.
   */
  readonly fetch?: typeof globalThis.fetch
}

/**
 * Typed fetch wrapper for Magna GraphQL operations.
 * Sends a POST with the GraphQL envelope; returns the parsed response.
 * Network failures throw; GraphQL errors are returned in the envelope.
 */
export type MagnaFetch = <TData = unknown>(
  operation: string,
  variables?: Readonly<Record<string, unknown>>,
) => Promise<{
  readonly data: TData | null
  readonly errors?: ReadonlyArray<{ readonly message: string }>
}>

/** Reactive resource handle wrapping a Magna GraphQL query. */
export type MagnaResource<T> = Resource<T>

/**
 * Handle returned by `useMagnaSubscription`.
 * In v0.1 this is a degraded shim: subscriptions are not yet streamed.
 */
export interface MagnaSubscriptionHandle<T> {
  /** Current value signal. Always starts as null in the v0.1 shim. */
  readonly state: Signal<T | null>
  /** Idempotent close. No-op in v0.1. */
  readonly close: () => void
  /**
   * True when streaming is not available and the handle is a degraded fallback.
   * Always true in v0.1.
   */
  readonly degraded: boolean
}

/** Extended build context passed to the magna beforeCompile hook. */
export interface MagnaBuildContext extends BuildContext {
  readonly magna: {
    readonly options: MagnaPluginOptions
    readonly untyped: boolean
    readonly outputPath: string
    readonly warnings: ReadonlyArray<string>
  }
}

/**
 * JWT relay documentation artifact — describes where tokens originate in SSR
 * and client contexts. This interface is never instantiated at runtime; it
 * exists for IDE discoverability and schema generation.
 */
export interface MagnaJwtRelay {
  readonly ssr: {
    readonly source: 'request-context'
    readonly extractor: 'requireAuth(req) → token → wrap in getToken closure'
  }
  readonly client: {
    readonly source: 'cookie-backed-auth-signal'
    readonly extractor: '@aihu/auth ScopeSignal layer reads cookie → getToken returns live value'
  }
}
