/**
 * `@aihu/server` — the governed data-access boundary (GX Phase 4, #466).
 *
 * Ratified spec: `docs/plans/governed-extractability/70-governed-data-access.md`
 * (§3 the generated loader, §4.1–4.7 the seven ratified decisions). ONE
 * governed boundary for the whole data path: data-source access and the live
 * entitlement decision, generated together from a route's declared governed
 * data type (`data: { type, preview }`) and enforced by server-side loaders.
 *
 * The pipeline (§3.2), per request on a governed route:
 *
 *   1. principal        — `resolvePrincipal` (shipped, consumed unchanged)
 *   2. static meet      — `decideEmission` (shipped; token scopes ∩ declared)
 *   3. live entitlement — `checkEntitlement` (THIS module: per-request memo,
 *                         positive-only TTL cache, 2000 ms default deadline)
 *   4. provider fetch   — ONLY after grant; withheld requests run `preview`
 *                         instead — governed bytes are never fetched for a
 *                         request that will not receive them
 *   5. emit             — `Entitled<T>` | `Withheld<T>` | error
 *
 * SERVER-ONLY by construction: this module lives in `@aihu/server`, which the
 * browser graph is already forbidden to import (see `@aihu/router`'s
 * `server.ts` isolation note). There is no client-importable registration API.
 *
 * Fail direction is CLOSED at every stage (§4.3): a control that cannot
 * answer never answers "yes" — and never lies. A resolver outage is
 * `'unavailable'`/503, never presented as an entitlement verdict; a provider
 * failure after grant is an error state, never a locked state.
 */

import type {
  EmissionDecision,
  EntitledPrincipal,
  EntitlementMemo,
  EntitlementsHandle,
  EntitlementVerdict,
  ExtractReadValue,
  Principal,
  PrincipalGateDeps,
  PrincipalSource,
} from '@aihu/agent-service'
import { decideEmission, resolvePrincipal } from '@aihu/agent-service'
import { deriveReadPolicy } from './extract-read-policy.ts'

// Re-export the shared entitlement/principal contract so `@aihu/router/server`
// (which depends on `@aihu/server`, not on `@aihu/agent-service`) can consume
// it — one type source, no structural drift.
export type {
  EntitledPrincipal,
  EntitlementMemo,
  EntitlementsHandle,
  EntitlementVerdict,
  Principal,
  PrincipalGateDeps,
  PrincipalSource,
}

// ─── Ratified constants ──────────────────────────────────────────────────────

/** Default live-resolver deadline (ms) — ratified Q1 (§7). */
export const DEFAULT_ENTITLEMENT_TIMEOUT_MS = 2000

/**
 * `Retry-After` seconds on `'unavailable'` responses (503). Mirrored by the
 * call axis in `@aihu/agent-service`'s runGate stage; keep in sync.
 */
export const GOVERNED_RETRY_AFTER_SECONDS = 30

// ─── The emission shapes (§3.1 / §4.5) ───────────────────────────────────────

/** Why a withheld response is withheld — the template's "sign in" vs "upgrade" vs "try later". */
export type WithheldReason = 'auth' | 'scope' | 'entitlement' | 'unavailable'

/** The granted shape: the declared type plus the reserved `$gx` discriminant. */
export type Entitled<T> = T & { readonly $gx: { readonly entitled: true } }

/**
 * The withheld shape: NO field of `T` beyond the declared `preview:` subset.
 * Never produced by redacting a full fetch — the granted payload is never in
 * memory for a withheld request (§3.2 step 4, §4.5).
 */
export type Withheld<T> = {
  readonly $gx: {
    readonly entitled: false
    readonly reason: WithheldReason
  }
  readonly preview?: Partial<T>
}

// ─── Registration surface (§4.1) ─────────────────────────────────────────────

/** The context a provider's `fetch`/`preview` receives. */
export interface GovernedFetchContext {
  readonly params: Record<string, string>
  readonly url: URL
  /**
   * The SETTLED principal (§4.7): a hand-written fetch may further narrow on
   * it, never widen. On the granted path this is always a verified principal;
   * on the `preview` path it may be anonymous.
   */
  readonly principal: Principal
}

/** WHERE a governed type's data comes from. Keyed by resource type (§4.1). */
export interface DataProvider<T> {
  /** The one data-source access. Runs ONLY after grant. Server-only, never bundled. */
  fetch(ctx: GovernedFetchContext): Promise<T>
  /** Optional: data for the declared `preview:` fields of the withheld state. */
  preview?(ctx: GovernedFetchContext): Promise<Partial<T>>
}

/** The live per-request entitlement check's context (§3.1, §4.3). */
export interface EntitlementContext {
  /** Static meet already passed — never anonymous (§4.2). */
  readonly principal: EntitledPrincipal
  readonly scope: string
  /** Never the raw credential. */
  readonly request: { readonly url: URL }
  /**
   * Aborted when the registered `timeoutMs` (default 2000) elapses (§4.3).
   * Deadline exhaustion is indistinguishable from a throw: `'unavailable'`.
   */
  readonly signal: AbortSignal
}

/** Whether a principal may have the scope's authority RIGHT NOW. Keyed by scope (§4.2). */
export interface EntitlementRegistration {
  /** The LIVE per-request check. `true` = entitled now. Throw/timeout ⇒ withhold. */
  resolve(ctx: EntitlementContext): Promise<boolean>
  /** Resolver deadline in ms; default {@link DEFAULT_ENTITLEMENT_TIMEOUT_MS}. */
  timeoutMs?: number
  /** Positive-verdict TTL cache, per (scope, principal.sub). Negatives are NEVER cached (Q2). */
  cache?: { ttlMs: number }
}

/** @internal Telemetry counters for tests/dashboards (G7d/G7e spy points). */
export interface GovernedRegistryStats {
  /** Live resolver invocations (post-memo, post-cache). */
  readonly resolves: number
  /** Cross-request TTL cache consults. */
  readonly cacheReads: number
  /** Cross-request TTL cache hits (positive, unexpired). */
  readonly cacheHits: number
}

/**
 * The single server-init registration surface (§4.1): a builder passed to
 * `createServerRouter(routes, { governed })` and (same instance) to
 * `AgentServiceOptions.entitlements`. Binding is by name equality: the
 * route's `data.type` string keys the provider; a surface's effective
 * `{ scope }` keys the resolver. Both are checked at boot (§2.3).
 *
 * Structurally satisfies `@aihu/agent-service`'s `EntitlementsHandle`, so the
 * SAME instance serves both axes (§4.6) — one scope, one live meaning.
 */
export interface GovernedRegistry extends EntitlementsHandle {
  /** Register the data-source provider for a governed resource type. */
  provider<T>(type: string, p: DataProvider<T>): GovernedRegistry
  /**
   * Register the live entitlement resolver for a scope — or declare the scope
   * explicitly static with `'token-only'` (required in strict mode, §2.3).
   * Registering a resolver makes EVERY use of the scope — both axes — live.
   */
  entitlement(scope: string, r: EntitlementRegistration | 'token-only'): GovernedRegistry
  /**
   * Revocation composition hook (§4.4.3): purge every cached entitlement
   * entry for `sub`, so "revoke this delegation" also drops cached
   * entitlement warmth immediately (in-process; a shared cache store is an
   * operator upgrade, not a framework default).
   */
  onRevoke(sub: string): void
  /** @internal Provider lookup for the generated loader / boot validation. */
  providerFor(type: string): DataProvider<unknown> | undefined
  /** @internal How a scope is registered — drives strict-mode boot validation. */
  entitlementKind(scope: string): 'live' | 'token-only' | 'unregistered'
  /** @internal Telemetry counters (G7d/G7e assertions). */
  stats(): GovernedRegistryStats
}

/**
 * Create the governed registry (§2.2). Server-only. One instance per app;
 * two apps in one process cannot collide because nothing here is ambient.
 */
export function createGovernedRegistry(): GovernedRegistry {
  const providers = new Map<string, DataProvider<unknown>>()
  const entitlements = new Map<string, EntitlementRegistration | 'token-only'>()
  /** Positive-verdict TTL cache: `(scope, sub)` → expiry epoch ms (§4.4 layer 2). */
  const positiveCache = new Map<string, number>()
  const stats = { resolves: 0, cacheReads: 0, cacheHits: 0 }

  const cacheKey = (scope: string, sub: string): string => `${scope} ${sub}`

  async function resolveLive(
    reg: EntitlementRegistration,
    scope: string,
    principal: EntitledPrincipal,
    url: URL,
  ): Promise<EntitlementVerdict> {
    // Layer 2: the cross-request TTL cache — POSITIVE verdicts only (Q2:
    // never cache negatives — a member who just paid is entitled on their
    // next request; denies are not the hot path).
    if (reg.cache) {
      stats.cacheReads++
      const key = cacheKey(scope, principal.sub)
      const expires = positiveCache.get(key)
      if (expires !== undefined) {
        if (expires > Date.now()) {
          stats.cacheHits++
          return 'granted'
        }
        positiveCache.delete(key)
      }
    }

    stats.resolves++
    const timeoutMs = reg.timeoutMs ?? DEFAULT_ENTITLEMENT_TIMEOUT_MS
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      // The deadline is enforced HERE (not merely offered): the resolver
      // receives the signal, but even a resolver that ignores it cannot hold
      // the request past `timeoutMs` — the race settles 'unavailable'.
      const verdict = await Promise.race([
        reg.resolve({ principal, scope, request: { url }, signal: ac.signal }),
        new Promise<never>((_, reject) => {
          ac.signal.addEventListener(
            'abort',
            () => reject(new Error(`entitlement resolver for '${scope}' exceeded ${timeoutMs}ms`)),
            { once: true },
          )
        }),
      ])
      if (verdict === true) {
        if (reg.cache) {
          positiveCache.set(cacheKey(scope, principal.sub), Date.now() + reg.cache.ttlMs)
        }
        return 'granted'
      }
      // Anything that is not EXACTLY `true` is a denial — a sloppy resolver
      // returning truthy junk never rounds to a grant (fail-closed).
      return 'denied'
    } catch {
      // Throw or deadline: an outage is NEVER presented as a verdict (§4.3).
      return 'unavailable'
    } finally {
      clearTimeout(timer)
    }
  }

  const registry: GovernedRegistry = {
    provider<T>(type: string, p: DataProvider<T>): GovernedRegistry {
      providers.set(type, p as DataProvider<unknown>)
      return registry
    },
    entitlement(scope: string, r: EntitlementRegistration | 'token-only'): GovernedRegistry {
      entitlements.set(scope, r)
      return registry
    },
    onRevoke(sub: string): void {
      const suffix = ` ${sub}`
      for (const key of [...positiveCache.keys()]) {
        if (key.endsWith(suffix)) positiveCache.delete(key)
      }
    },
    createMemo(): EntitlementMemo {
      return { verdicts: new Map() }
    },
    check(
      scope: string,
      principal: EntitledPrincipal,
      memo?: EntitlementMemo,
      url?: URL,
    ): Promise<EntitlementVerdict> {
      const reg = entitlements.get(scope)
      // Unregistered (non-strict) or 'token-only': step 3 is a no-op — the
      // static meet's verdict stands (§4.2). Strict mode makes "unregistered
      // hard scope" a BOOT refusal (validateGovernedBoot), never a silent
      // token-only at request time.
      if (reg === undefined || reg === 'token-only') return Promise.resolve('granted')
      // Layer 1: the per-request memo — a scope resolves at most once per
      // (request, scope); concurrent consults share the in-flight promise.
      const memoized = memo?.verdicts.get(scope)
      if (memoized) return memoized
      const pending = resolveLive(reg, scope, principal, url ?? new URL('gx://call-axis'))
      memo?.verdicts.set(scope, pending)
      return pending
    },
    providerFor(type: string): DataProvider<unknown> | undefined {
      return providers.get(type)
    },
    entitlementKind(scope: string): 'live' | 'token-only' | 'unregistered' {
      const reg = entitlements.get(scope)
      if (reg === undefined) return 'unregistered'
      return reg === 'token-only' ? 'token-only' : 'live'
    },
    stats(): GovernedRegistryStats {
      return { ...stats }
    },
  }
  return registry
}

/**
 * THE single live check, both axes (§4.6) — a named alias over the registry's
 * `check` so call sites read as the spec does. The read axis's generated
 * loader and the call axis's `runGate` both land here (via the same memo).
 */
export function checkEntitlement(
  registry: EntitlementsHandle,
  principal: EntitledPrincipal,
  scope: string,
  memo?: EntitlementMemo,
  url?: URL,
): Promise<EntitlementVerdict> {
  return registry.check(scope, principal, memo, url)
}

// ─── The route's `data:` declaration (§2.1) ──────────────────────────────────

/** The normalized `data:` route declaration. */
export interface GovernedRouteDataDecl {
  /** Names the governed resource type — the provider key. */
  readonly type: string
  /** Fields renderable in the locked state (declared public-tier, §4.5). */
  readonly preview?: readonly string[]
}

/**
 * Normalize a `.route.json` `data` field fail-closed: `null` when absent,
 * `'malformed'` when present but unparseable (a corrupted declaration is
 * refused at boot, never rounded to ungoverned — the same posture as
 * `deriveReadPolicy`'s `'malformed'`).
 */
export function normalizeGovernedData(data: unknown): GovernedRouteDataDecl | 'malformed' | null {
  if (data === undefined || data === null) return null
  if (typeof data !== 'object') return 'malformed'
  const type = (data as { type?: unknown }).type
  if (typeof type !== 'string' || type === '') return 'malformed'
  const preview = (data as { preview?: unknown }).preview
  if (preview === undefined) return { type }
  if (!Array.isArray(preview) || !preview.every((k): k is string => typeof k === 'string')) {
    return 'malformed'
  }
  return { type, preview }
}

// ─── Escape hatch (§4.7) ─────────────────────────────────────────────────────

/** The branded route-local provider — replaces step 4 ONLY, never the gate. */
export interface DefinedGovernedFetch<T> extends DataProvider<T> {
  readonly _brand: 'DefinedGovernedFetch'
}

/**
 * The escape hatch (§4.7): hand-written data logic on a governed route. The
 * author registers a ROUTE-LOCAL provider in the loader file; the framework
 * still generates the gate around it — steps 1–3 and 5 remain
 * framework-generated and non-bypassable. `ctx` carries the settled
 * principal: a hand-written fetch may further narrow, never widen (R3).
 */
export function defineGovernedFetch<T>(p: DataProvider<T>): DefinedGovernedFetch<T> {
  return {
    _brand: 'DefinedGovernedFetch',
    fetch: p.fetch,
    ...(p.preview ? { preview: p.preview } : {}),
  }
}

/** Is this module export the branded governed-fetch escape hatch? */
export function isGovernedFetch(x: unknown): x is DefinedGovernedFetch<unknown> {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as { _brand?: unknown })._brand === 'DefinedGovernedFetch' &&
    typeof (x as { fetch?: unknown }).fetch === 'function'
  )
}

// ─── The generated loader (§3) ───────────────────────────────────────────────

/** The context the generated loader runs in (principal settled by `handle`). */
export interface GovernedLoadContext {
  readonly params: Record<string, string>
  readonly url: URL
  /** Settled by `resolvePrincipal` in `handle` — step 1, once per request. */
  readonly principal: Principal
  /** The per-request memo (§4.4 layer 1). */
  readonly entitlements: EntitlementMemo
}

/** What the generated loader emits (§3.1). */
export type GovernedEmission<T> =
  | { readonly kind: 'granted'; readonly data: Entitled<T> }
  | {
      readonly kind: 'withheld'
      readonly data: Withheld<T>
      readonly decision: EmissionDecision
    }
  /** Provider failed AFTER grant (§4.3): an error state, never a locked state. */
  | { readonly kind: 'error'; readonly status: 500 }

/** The generated loader — what the framework materializes per governed route. */
export type GeneratedLoader<T> = (ctx: GovernedLoadContext) => Promise<GovernedEmission<T>>

/** Map a static-meet denial onto the withheld reason vocabulary (§3.2 step 2). */
function withheldReasonOf(decision: Extract<EmissionDecision, { allow: false }>): WithheldReason {
  switch (decision.reason) {
    case 'AUTH_MISSING':
    case 'AUTH_UNVERIFIABLE':
    case 'AUTH_REQUIRED':
    case 'AUTH_INVALID':
      return 'auth'
    case 'ENTITLEMENT_DENIED':
      return 'entitlement'
    case 'ENTITLEMENT_UNAVAILABLE':
      return 'unavailable'
    default:
      // SCOPE_DENIED / HUMAN_ONLY / UA_REFUSED / SURFACE_UNAVAILABLE
      return 'scope'
  }
}

/** Synthesize the live-stage decisions (the §4.3 ladder rows 2–3, read axis). */
function entitlementDecision(
  verdict: 'denied' | 'unavailable',
  scope: string,
): Extract<EmissionDecision, { allow: false }> {
  return verdict === 'denied'
    ? {
        allow: false,
        axis: 'read',
        tier: 'hard',
        code: 403,
        reason: 'ENTITLEMENT_DENIED',
        message: `ENTITLEMENT_DENIED: live entitlement check refused scope '${scope}'`,
      }
    : {
        allow: false,
        axis: 'read',
        tier: 'hard',
        code: 503,
        reason: 'ENTITLEMENT_UNAVAILABLE',
        message:
          `ENTITLEMENT_UNAVAILABLE: entitlement for scope '${scope}' could not be verified ` +
          '(resolver failure/timeout); withholding, retry later',
      }
  // An outage is NEVER presented as a verdict: 'unavailable' is its own
  // reason and its own HTTP shape (503 + Retry-After), not a 403 (§4.3).
}

/** A synthesized fail-closed decision for a malformed compiled read value. */
const MALFORMED_READ_DECISION: Extract<EmissionDecision, { allow: false }> = {
  allow: false,
  axis: 'read',
  tier: 'hard',
  code: 403,
  reason: 'SCOPE_DENIED',
  message: 'SCOPE_DENIED: malformed compiled read policy — refused, never rounded to open',
}

/**
 * Materialize the generated loader for one governed route (§3, §4.7):
 * `data:` present and no sibling loader → registry provider; the
 * `defineGovernedFetch` escape hatch supplies `override` — replacing step 4
 * ONLY. This loader is the ONLY path by which a `data:`-declared route's
 * provider is invoked (invariant I2, §3.2).
 */
export function materializeGeneratedLoader<T>(
  registry: GovernedRegistry,
  decl: GovernedRouteDataDecl,
  readValue: unknown,
  override?: DataProvider<T>,
): GeneratedLoader<T> {
  return async (ctx: GovernedLoadContext): Promise<GovernedEmission<T>> => {
    const provider = (override ?? registry.providerFor(decl.type)) as DataProvider<T> | undefined

    const withhold = async (
      reason: WithheldReason,
      decision: Extract<EmissionDecision, { allow: false }>,
    ): Promise<GovernedEmission<T>> => {
      let preview: Partial<T> | undefined
      // The preview fetch is a SEPARATE, public-tier-by-declaration access —
      // never a redaction of the governed fetch (§4.5). It runs only when the
      // route declared `preview:` fields and the provider offers one. A
      // failed preview degrades to less data, never to an error/leak.
      if (decl.preview && decl.preview.length > 0 && provider?.preview) {
        try {
          const fetched = await provider.preview({
            params: ctx.params,
            url: ctx.url,
            principal: ctx.principal,
          })
          preview = filterPreview<T>(fetched, decl.preview)
        } catch {
          preview = undefined
        }
      }
      const data: Withheld<T> = {
        $gx: { entitled: false, reason },
        ...(preview !== undefined ? { preview } : {}),
      }
      return { kind: 'withheld', data, decision }
    }

    // ── Step 2: the static meet (shipped, sync, pure — consumed unchanged).
    // The cheap check always runs first: a request that cannot pass on token
    // scopes never costs a billing call (§3.2).
    const derivation = deriveReadPolicy(readValue)
    if (derivation.value === 'malformed') {
      return withhold('scope', MALFORMED_READ_DECISION)
    }
    const decision = decideEmission(ctx.principal, {
      axis: 'read',
      value: derivation.value as ExtractReadValue,
    })
    if (!decision.allow) {
      return withhold(withheldReasonOf(decision), decision)
    }

    // ── Step 3: the live entitlement (this design). Runs iff the effective
    // scope has a registered resolver; 'token-only'/unregistered are no-ops.
    const scope =
      typeof derivation.value === 'object' && derivation.value !== null
        ? derivation.value.scope
        : null
    if (scope !== null && ctx.principal.class !== 'anonymous') {
      const verdict = await checkEntitlement(
        registry,
        ctx.principal,
        scope,
        ctx.entitlements,
        ctx.url,
      )
      if (verdict === 'denied') {
        return withhold('entitlement', entitlementDecision('denied', scope))
      }
      if (verdict === 'unavailable') {
        return withhold('unavailable', entitlementDecision('unavailable', scope))
      }
    }

    // ── Step 4: provider fetch — ONLY now, after grant (§3.2). A missing
    // provider is a boot-validation failure; if reached anyway (hand-edited
    // artifacts), fail closed as an error — never serve ungated.
    if (!provider) return { kind: 'error', status: 500 }
    let payload: T
    try {
      payload = await provider.fetch({
        params: ctx.params,
        url: ctx.url,
        principal: ctx.principal,
      })
    } catch {
      // Post-grant provider failure: access WAS granted, so a locked state
      // would be a lie — this is an error state (§4.3), and no partial
      // governed bytes ride it.
      return { kind: 'error', status: 500 }
    }

    // ── Step 5: emit. `$gx` is reserved (C48x guards it at compile time);
    // the runtime discriminant always wins over any colliding data field.
    const data = { ...(payload as object), $gx: { entitled: true as const } } as Entitled<T>
    return { kind: 'granted', data }
  }
}

/** Narrow a preview fetch to the DECLARED keys only (defense in depth, §4.5). */
function filterPreview<T>(fetched: Partial<T>, declared: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {}
  const source = fetched as Record<string, unknown>
  for (const key of declared) {
    if (key in source) out[key] = source[key]
  }
  return out as Partial<T>
}

// ─── Boot-time validation (§2.3) — fail-closed at init, not at first request ─

/** One row of the compiled route census the boot check reads. */
export interface GovernedRouteCensusEntry {
  readonly pattern: string
  readonly data?: unknown
  readonly extract?: { readonly read?: unknown; readonly call?: unknown } | undefined
}

/** Extract the `{ scope }` string from a compiled axis value, if scope-shaped. */
function scopeOf(value: unknown): string | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { scope?: unknown }).scope === 'string' &&
    (value as { scope: string }).scope !== ''
  ) {
    return (value as { scope: string }).scope
  }
  return null
}

/**
 * Validate the registry against the compiled route census at
 * `createServerRouter` construction (§2.3). Throws — boot refusal — when:
 *
 * - any route declares `data:` but no registry was passed (a governed route
 *   must never be servable ungated);
 * - a `data:` declaration is malformed (fail-closed, C48x posture);
 * - a `data.type` has no registered provider (names route + missing key);
 * - strict mode (DEFAULT whenever any hard-tier `read` exists — ratified Q3):
 *   a `{ scope }` used by a hard-tier surface has no entitlement
 *   registration. `'token-only'` is the explicit opt-out (§4.2).
 *
 * No registry and no `data:` declarations ⇒ no-op (G7j byte-identical).
 *
 * INTEGRATION SEAM (Builder A, #466 compiler): this census is route-level
 * (`.route.json` `data` + `extract`). Member-level `$scope` values ride the
 * agent-meta artifact and are validated by the same rule once the compiler
 * fans `data:` out — the check here consumes whatever census it is handed.
 */
export function validateGovernedBoot(
  registry: GovernedRegistry | undefined,
  routes: readonly GovernedRouteCensusEntry[],
  opts?: { strict?: boolean },
): void {
  const dataRoutes: { pattern: string; decl: GovernedRouteDataDecl }[] = []
  for (const route of routes) {
    const decl = normalizeGovernedData(route.data)
    if (decl === null) continue
    if (decl === 'malformed') {
      throw new Error(
        `[aihu governed] boot refusal: route '${route.pattern}' carries a malformed ` +
          `data: declaration — expected { type: string, preview?: string[] } (fail-closed)`,
      )
    }
    dataRoutes.push({ pattern: route.pattern, decl })
  }

  if (dataRoutes.length > 0 && !registry) {
    throw new Error(
      `[aihu governed] boot refusal: route '${dataRoutes[0]!.pattern}' declares governed ` +
        `data (type '${dataRoutes[0]!.decl.type}') but no governed registry was passed to ` +
        `createServerRouter — a governed route must never boot ungated`,
    )
  }
  if (!registry) return

  for (const { pattern, decl } of dataRoutes) {
    if (!registry.providerFor(decl.type)) {
      throw new Error(
        `[aihu governed] boot refusal: route '${pattern}' declares data type ` +
          `'${decl.type}' but no provider is registered for that key`,
      )
    }
  }

  // Strict mode (ratified Q3): on by default in the presence of ANY hard-tier
  // read — every hard scope must choose live vs 'token-only' explicitly, so a
  // serving path cannot silently run token-only.
  const anyHardRead = routes.some((r) => deriveReadPolicy(r.extract?.read).tier === 'hard')
  const strict = opts?.strict ?? anyHardRead
  if (!strict) return

  for (const route of routes) {
    const readScope =
      deriveReadPolicy(route.extract?.read).tier === 'hard' ? scopeOf(route.extract?.read) : null
    const callScope = scopeOf(route.extract?.call)
    for (const scope of [readScope, callScope]) {
      if (scope !== null && registry.entitlementKind(scope) === 'unregistered') {
        throw new Error(
          `[aihu governed] boot refusal (strict mode): scope '${scope}' is used by a ` +
            `hard-tier surface ('${route.pattern}') but has no entitlement registration — ` +
            `register a resolver, or declare .entitlement('${scope}', 'token-only') explicitly`,
        )
      }
    }
  }
}

// ─── Request-side helpers for the router's governed `handle` path ────────────

/** The host-injected auth material for principal resolution on the SSR path. */
export interface GovernedRequestAuth extends PrincipalGateDeps {
  /**
   * Resolve a HOST-VERIFIED session from the request (e.g. `getAuthState`
   * over the cookie). Same injection posture as `PrincipalSource.session`:
   * never pass unverified cookie contents.
   */
  readonly resolveSession?: (
    req: Request,
  ) =>
    | { readonly sub: string; readonly scopes: readonly string[] }
    | null
    | undefined
    | Promise<{ readonly sub: string; readonly scopes: readonly string[] } | null | undefined>
}

/**
 * Step 1 for the SSR/E3 transports: settle THE principal for one request from
 * its credential material (Authorization bearer, User-Agent, host-verified
 * session). Delegates to the shipped `resolvePrincipal` — no second
 * verification path exists (§1.3).
 */
export async function resolveRequestPrincipal(
  req: Request,
  auth?: GovernedRequestAuth,
): Promise<Principal> {
  const authorization = req.headers.get('authorization')
  const jwt = authorization?.replace(/^Bearer\s+/i, '') ?? null
  const session = auth?.resolveSession ? ((await auth.resolveSession(req)) ?? null) : null
  const source: PrincipalSource = {
    jwt,
    userAgent: req.headers.get('user-agent'),
    session,
  }
  const deps: PrincipalGateDeps = {
    authPlugin: auth?.authPlugin,
    classifyUserAgent: auth?.classifyUserAgent,
  }
  return resolvePrincipal(source, deps)
}

/**
 * Route-level read decision for the T4 fallback path (a hard-`read` route
 * with a plain `defineLoader` and no `data:`): may this principal receive the
 * route's loader output at all? Compliance-tier values keep today's
 * semantics; hard values require the matching verified principal.
 */
export function passesRouteRead(principal: Principal, readValue: unknown): boolean {
  const derivation = deriveReadPolicy(readValue)
  if (derivation.value === 'malformed') return false
  const decision = decideEmission(principal, {
    axis: 'read',
    value: derivation.value as ExtractReadValue,
  })
  return decision.allow
}

/** The HTTP status a governed emission serves with (read axis, §4.3 ladder). */
export function governedHttpStatus<T>(emission: GovernedEmission<T>): 200 | 401 | 403 | 500 | 503 {
  if (emission.kind === 'granted') return 200
  if (emission.kind === 'error') return 500
  switch (emission.data.$gx.reason) {
    case 'auth':
      return 401
    case 'unavailable':
      return 503
    default:
      return 403
  }
}
