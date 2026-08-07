/**
 * The per-request platform context — the host runtime's ambient state for one
 * request, threaded from the adapter's `fetch` down to route loaders and the
 * governed data path.
 *
 * ## Why it is `unknown` and not a shape
 *
 * On Cloudflare Workers this carries the KV namespaces, D1 databases, R2
 * buckets, Durable Object stubs, queue producers and secrets that `fetch`
 * receives as its second argument, plus the `ExecutionContext` (`waitUntil`)
 * it receives as its third. On Vercel/Node it is something else entirely.
 * The framework never reads inside it, so it never needs to know.
 *
 * TWO shapes were considered and one was REJECTED for a concrete reason worth
 * recording, because it is the shape most frameworks reach for first:
 *
 * ```ts
 * export interface PlatformContext { readonly [key: string]: unknown }
 * ```
 *
 * An augmentable interface with an index signature reads better and would let
 * `ctx.platform.DB` type-check without a cast. But TypeScript does not give
 * INTERFACES an implicit index signature, and `wrangler types` generates
 * `interface Env { … }`. So `handle(request, env)` — the exact call every
 * Cloudflare consumer writes — would be a type error, and the workaround
 * (`env as unknown as PlatformContext`) is strictly worse than the one cast
 * this alias asks for. Opaque wins.
 *
 * The adapter decides what goes in. `@aihu/adapter-cloudflare` passes
 * `{ env, ctx }`; a consumer narrows once at the edge of their own code:
 *
 * ```ts
 * export const loader = async (params, { platform }) => {
 *   const { env } = platform as { env: Env }
 *   return env.DB.prepare('select 1').first()
 * }
 * ```
 */
export type PlatformContext = unknown
