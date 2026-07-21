/**
 * `@aihu/agent-service` — the live-entitlement handle (GX Phase 4, #466).
 *
 * Spec: `docs/plans/governed-extractability/70-governed-data-access.md` §4.6
 * ("one resolver, both axes"). The gate ENGINE — resolvers, the per-request
 * memo, the positive-only TTL cache, revocation purge — lives in
 * `@aihu/server`'s `createGovernedRegistry()` (a server-only module). This
 * file defines only the STRUCTURAL contract by which that registry reaches
 * the call axis (`runGate`), so `@aihu/agent-service` keeps zero dependency
 * on `@aihu/server` (the dependency points the other way: `@aihu/server`
 * consumes `resolvePrincipal`/`decideEmission` from this package).
 *
 * The host that constructs both the server router and the agent service
 * passes the SAME registry instance to both (`createServerRouter(routes,
 * { governed })` and `AgentServiceOptions.entitlements`), so one page request
 * that both renders a governed route and executes a governed tool call can
 * share one memo, one verdict.
 */

import type { AnonymousPrincipal, Principal } from './principal-gate.ts'

/**
 * The three-way outcome of one live entitlement consult (spec §4.3):
 *
 * - `'granted'` — the resolver answered `true` (or the scope is registered
 *   `'token-only'` / carries no live resolver: step 3 is a no-op and the
 *   static meet's verdict stands).
 * - `'denied'` — the resolver answered `false`: the token carries the scope
 *   but the authority is not current (403 `ENTITLEMENT_DENIED`).
 * - `'unavailable'` — the resolver threw or exceeded its deadline: fail-closed
 *   withholding, honestly labeled (503 `ENTITLEMENT_UNAVAILABLE` +
 *   `Retry-After`). An outage is never presented as a verdict.
 */
export type EntitlementVerdict = 'granted' | 'denied' | 'unavailable'

/**
 * The per-request memo (spec §4.4 layer 1, always on): a scope is resolved at
 * most once per (request, scope) no matter how many surfaces/members consult
 * it. One instance per request; the read axis and any call-axis checks within
 * the same request share it (and therefore the verdict). The staleness bound
 * is the request's own duration.
 *
 * Verdicts are memoized as promises so concurrent consults of the same scope
 * within one request share a single in-flight resolver call.
 */
export interface EntitlementMemo {
  /** @internal scope → in-flight/settled verdict for this request. */
  readonly verdicts: Map<string, Promise<EntitlementVerdict>>
}

/**
 * A principal that passed the static meet — the live resolver's contract
 * assumes a verified principal and must never run for an anonymous request
 * (spec §4.2: ordering static-first is both cheap and correct).
 */
export type EntitledPrincipal = Exclude<Principal, AnonymousPrincipal>

/**
 * The structural handle `runGate` consults (spec §4.6). Implemented by
 * `@aihu/server`'s `createGovernedRegistry()` — inject that same instance as
 * `AgentServiceOptions.entitlements` (the same injected-dependency posture as
 * `resolveAuth` / `PrincipalGateDeps`). Absent handle ⇒ the live stage does
 * not exist and behavior is byte-identical to Phase 2/3.
 */
export interface EntitlementsHandle {
  /** One fresh per-request memo (spec §4.4 layer 1). */
  createMemo(): EntitlementMemo
  /**
   * THE single live check, both axes (spec §4.6). Memoized through `memo`
   * when supplied; TTL-cached per (scope, sub) when the registration
   * configured `cache:` (positive verdicts only — negatives are NEVER cached,
   * ratified Q2). A scope with no live resolver (unregistered or
   * `'token-only'`) returns `'granted'` — the step is a no-op and the static
   * meet's verdict stands.
   *
   * `url` is the request URL when the transport has one (threaded into
   * `EntitlementContext.request`); the call axis may omit it.
   */
  check(
    scope: string,
    principal: EntitledPrincipal,
    memo?: EntitlementMemo,
    url?: URL,
  ): Promise<EntitlementVerdict>
}
