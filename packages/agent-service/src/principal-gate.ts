/**
 * `@aihu/agent-service` — the GX principal gate (#437-GX Phase 2).
 *
 * Spec: `docs/plans/governed-extractability/40-spec.md` §4.1–§4.3. ONE
 * principal resolution (`resolvePrincipal`) and ONE emission decision
 * (`decideEmission`) for every gated surface. `runGate` (the tool-call path,
 * `agent-service.ts`) routes its step-2 AUTH_* ladder and step-3 scope meet
 * through this module; the emission taps (SSR, state script, loader,
 * markdown/negotiation — spec §4.2 T2–T5) consume the same two functions in
 * Phase 3/4.
 *
 * WHAT IS ENFORCED IN PHASE 2 — the `call` axis (agent-callability) only.
 * `decideEmission` also returns correct decisions for the `read` axis
 * (crawl-visibility) so Phases 3/4 can consume them, but NOTHING downstream
 * acts on a `read` decision yet: compliance-tier derivation (robots/headers/
 * origin UA refusal) is Phase 3; hard-tier SSR withholding and the bundle/
 * data boundary are Phase 4. Do not represent `read:` as enforced.
 *
 * Security posture, inherited from the tool gate (#420):
 *   - The principal comes EXCLUSIVELY from `AuthPlugin.verify` — signature
 *     verification, never `decodeJwt`, never caller-supplied identity.
 *   - A presented-but-invalid credential resolves to ANONYMOUS: verification
 *     failure never yields more access than sending nothing (spec §4.1).
 *   - Every rung that cannot produce a verified principal fails closed.
 */

import type { AgentMetadata } from '@aihu/agent'
import type { AuthPlugin, VerifiedClaims } from './types.ts'

// ─── Extract-policy values (the Phase 1 vocabulary, TS side) ─────────────────

/**
 * The `{ scope: 'x' }` value shape shared by both axes. The scope is part of
 * the value by construction — "gated without a scope" is unrepresentable
 * (spec §3 row 6).
 */
export interface ExtractScopeValue {
  readonly scope: string
}

/**
 * `read` (crawl-visibility) axis values — spec §2.1. Anonymous values above
 * the tier break (`'all' | 'agents' | 'search' | 'none'`) are compliance-tier;
 * verified values (`'verified' | 'human' | { scope }`) are hard-tier.
 */
export type ExtractReadValue =
  | 'all'
  | 'agents'
  | 'search'
  | 'none'
  | 'verified'
  | 'human'
  | ExtractScopeValue

/** `call` (agent-callability) axis values — spec §2.1. Always hard-tier. */
export type ExtractCallValue = 'none' | 'anonymous' | 'verified' | ExtractScopeValue

/** Is this axis value the `{ scope }` shape? */
export function isScopeValue(value: unknown): value is ExtractScopeValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { scope?: unknown }).scope === 'string' &&
    (value as { scope: string }).scope !== ''
  )
}

// ─── Principal ───────────────────────────────────────────────────────────────

/**
 * Anonymous UA subclass, from the single shared bot registry
 * (`@aihu/plugin-agent-readiness`'s `classifyBotUserAgent` — injected, see
 * {@link PrincipalGateDeps.classifyUserAgent}). `null` means unclassified: a
 * human browser, an unlisted bot, or a spoofer. Classification binds only the
 * population that identifies itself (the honest ceiling, spec §1.1) — it is
 * compliance-tier input for the `read` axis, never an authentication.
 */
export type AnonymousUaTier = 'searcher' | 'user-fetcher' | 'training-crawler'

/**
 * Why this request resolved to anonymous rather than a verified principal.
 * Mirrors the fail-closed AUTH_* ladder of the tool gate (#420) exactly —
 * including its ORDER: plugin problems are reported before credential
 * problems, so a scoped surface behind a missing/unverifiable plugin refuses
 * with the deployment defect, not a misleading "send a JWT".
 */
export type CredentialFailure =
  /** No auth plugin is registered (→ AUTH_MISSING when a principal is required). */
  | 'no-auth-plugin'
  /** The registered plugin cannot signature-verify (no `verify`; → AUTH_UNVERIFIABLE). */
  | 'unverifiable-plugin'
  /** No credential was presented (→ AUTH_REQUIRED when a principal is required). */
  | 'no-credential'
  /** A credential was presented and `verify` rejected it (→ AUTH_INVALID). */
  | 'invalid-credential'
  /** The credential verified but carries no usable `sub` claim (→ AUTH_INVALID). */
  | 'no-subject'

/** An unauthenticated requester — possibly a declared crawler. */
export interface AnonymousPrincipal {
  readonly class: 'anonymous'
  /** Declared-crawler tier from the shared bot registry, or null. */
  readonly uaTier: AnonymousUaTier | null
  /** Why no verified principal could be produced (the AUTH_* ladder input). */
  readonly credentialFailure: CredentialFailure
}

/** A signature-verified agent principal (Bearer credential) with no scopes. */
export interface VerifiedAgentPrincipal {
  readonly class: 'verified-agent'
  readonly sub: string
  readonly scopes: readonly string[]
  readonly claims: VerifiedClaims
}

/** A signature-verified agent principal whose claims carry ≥ 1 scope. */
export interface ScopedAgentPrincipal {
  readonly class: 'scoped-agent'
  readonly sub: string
  readonly scopes: readonly string[]
  readonly claims: VerifiedClaims
}

/**
 * A verified human session (cookie path — `getAuthState` in
 * `@aihu/auth/server`, resolved by the HOST and passed in as
 * {@link PrincipalSource.session}; this package stays auth-library-agnostic,
 * the same injection posture as `AgentServiceOptions.resolveAuth`).
 */
export interface HumanSessionPrincipal {
  readonly class: 'human-session'
  readonly sub: string
  readonly scopes: readonly string[]
}

/**
 * The one principal per request (spec §4.1).
 *
 * Classification is by PRESENTATION CHANNEL until Phase 2b's minted
 * `typ: 'agent'` / `act` claims exist: a Bearer JWT is an agent principal
 * (`scoped-agent` when its verified claims carry scopes, `verified-agent`
 * otherwise); a session is a human principal.
 */
export type Principal =
  | AnonymousPrincipal
  | VerifiedAgentPrincipal
  | ScopedAgentPrincipal
  | HumanSessionPrincipal

/** The four principal classes. */
export type PrincipalClass = Principal['class']

// ─── resolvePrincipal ────────────────────────────────────────────────────────

/**
 * The credential material for one request, normalized. Callers with a raw
 * `Request` extract `Authorization` / `User-Agent` / their session themselves
 * (the router does this in Phase 3); the tool-call path maps
 * `RequestContext.jwt` straight in.
 */
export interface PrincipalSource {
  /** Raw JWT (with or without `Bearer ` prefix — the plugin's concern). */
  readonly jwt?: string | null | undefined
  /** `User-Agent` header, for anonymous crawler classification. */
  readonly userAgent?: string | null | undefined
  /**
   * A session the HOST already verified (e.g. `getAuthState` over the cookie
   * — which signature-verifies via the same `verifyJwt` primitive). `null`/
   * absent when there is no session. Never pass unverified cookie contents.
   */
  readonly session?: { readonly sub: string; readonly scopes: readonly string[] } | null | undefined
}

/** Injected dependencies for {@link resolvePrincipal}. */
export interface PrincipalGateDeps {
  /** The verifying auth plugin (same instance the tool gate uses). */
  readonly authPlugin?: AuthPlugin | undefined
  /**
   * Anonymous-UA classifier — wire `classifyBotUserAgent` from
   * `@aihu/plugin-agent-readiness` (the single shared bot registry). Absent →
   * every anonymous principal is unclassified (`uaTier: null`), which is the
   * fail-open-for-HUMANS / decided-later posture: `read` compliance values
   * treat unclassified as an anonymous human, and nothing downstream acts on
   * `read` decisions in Phase 2 anyway.
   */
  readonly classifyUserAgent?: ((userAgent: string) => AnonymousUaTier | null) | undefined
}

/** Scope extraction from verified claims: `scope` (space-separated) / `scp` / `scopes`. */
function scopesOf(claims: VerifiedClaims): string[] {
  if (typeof claims.scope === 'string') return claims.scope.split(' ').filter(Boolean)
  if (Array.isArray(claims.scp)) return claims.scp.filter((s): s is string => typeof s === 'string')
  if (Array.isArray(claims.scopes)) {
    return claims.scopes.filter((s): s is string => typeof s === 'string')
  }
  return []
}

/**
 * Resolve THE principal for one request (spec §4.1 order):
 *
 * 1. Bearer credential → `authPlugin.verify` (signature verification — the
 *    same primitive as the tool gate; NEVER `decodeJwt`). Verified + `sub` →
 *    agent principal (`scoped-agent` when scopes present).
 * 2. Host-verified session → `human-session`. (Also the landing when a
 *    presented Bearer credential FAILED but a valid session exists — the
 *    session grants exactly what sending no Bearer credential would.)
 * 3. Otherwise `anonymous`, with the UA subclass from the shared bot registry
 *    and the credential-failure rung recorded for the AUTH_* ladder.
 *
 * A presented-but-invalid credential resolves to anonymous — verification
 * failure never yields more access than sending nothing.
 */
export async function resolvePrincipal(
  source: PrincipalSource,
  deps?: PrincipalGateDeps,
): Promise<Principal> {
  const authPlugin = deps?.authPlugin
  const jwt = source.jwt
  const hasJwt = typeof jwt === 'string' && jwt !== ''

  // Failure-ladder order mirrors the #420 gate exactly (plugin rungs first).
  let failure: CredentialFailure
  if (!authPlugin) {
    failure = 'no-auth-plugin'
  } else if (typeof authPlugin.verify !== 'function') {
    failure = 'unverifiable-plugin'
  } else if (!hasJwt) {
    failure = 'no-credential'
  } else {
    // Verification COMPLETES here — every consumer of the returned principal
    // (scope meet, rate-limit keying, emission) reads only the settled result.
    const claims = await authPlugin.verify(jwt)
    if (claims === null) {
      failure = 'invalid-credential'
    } else {
      const sub = claims.sub
      if (typeof sub !== 'string' || sub === '') {
        failure = 'no-subject'
      } else {
        const scopes = scopesOf(claims)
        return scopes.length > 0
          ? { class: 'scoped-agent', sub, scopes, claims }
          : { class: 'verified-agent', sub, scopes, claims }
      }
    }
  }

  const session = source.session
  if (session && typeof session.sub === 'string' && session.sub !== '') {
    return { class: 'human-session', sub: session.sub, scopes: session.scopes ?? [] }
  }

  const ua = source.userAgent ?? ''
  const uaTier = ua && deps?.classifyUserAgent ? deps.classifyUserAgent(ua) : null
  return { class: 'anonymous', uaTier, credentialFailure: failure }
}

// ─── decideEmission ──────────────────────────────────────────────────────────

/**
 * One emission question: a surface's policy on ONE axis, plus (call axis)
 * the member-level gates that MEET with it.
 */
export type EmissionQuery =
  | {
      readonly axis: 'call'
      /** The surface's `extract.call` value. */
      readonly value: ExtractCallValue
      /**
       * The member's own `$scope`, met with any surface `{ scope }` — BOTH
       * must pass (spec §3 R1). The surface value is a CEILING, never a
       * grant: it can only add requirements on top of the member's.
       */
      readonly memberScope?: string | null | undefined
      /** The member declares `$rate-limit` (forces a verified principal, as today). */
      readonly memberRateLimited?: boolean | undefined
    }
  | {
      readonly axis: 'read'
      /** The surface's `extract.read` value. */
      readonly value: ExtractReadValue
    }

/** Which enforcement tier a decision belongs to (spec §2.1 / §1). */
export type EnforcementTier = 'compliance' | 'hard'

/** Machine-readable refusal reasons. */
export type EmissionDenyReason =
  /** `call: 'none'` — the agent surface does not exist for anyone (404-shaped). */
  | 'SURFACE_UNAVAILABLE'
  /** The AUTH_* ladder (401): no plugin / unverifiable plugin / no / bad credential. */
  | 'AUTH_MISSING'
  | 'AUTH_UNVERIFIABLE'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  /** A required scope (surface or member) is not carried (403). */
  | 'SCOPE_DENIED'
  /** `read: 'human'` and the verified principal is an agent (403). */
  | 'HUMAN_ONLY'
  /** Compliance-tier: the declared crawler tier is refused by the `read` value (403). */
  | 'UA_REFUSED'

/** The decision for one principal × one surface policy. */
export type EmissionDecision =
  | { readonly allow: true; readonly axis: 'call' | 'read'; readonly tier: EnforcementTier }
  | {
      readonly allow: false
      readonly axis: 'call' | 'read'
      readonly tier: EnforcementTier
      readonly code: 401 | 403 | 404
      readonly reason: EmissionDenyReason
      /** Human-readable message — for 401/403 this IS the envelope message. */
      readonly message: string
    }

/** Injected predicates for {@link decideEmission}. */
export interface EmissionDeps {
  /**
   * Scope-membership predicate. The tool-call path injects
   * `(s) => authPlugin.checkScope(jwt, s) === true` so the refactor is
   * byte-for-byte the check the gate always ran (third-party `checkScope`
   * semantics preserved). Default: membership in `principal.scopes` — the
   * claims-derived set the emission taps use, where no raw JWT exists.
   */
  readonly hasScope?: ((scope: string) => boolean) | undefined
}

const AUTH_MESSAGES: Record<CredentialFailure, { reason: EmissionDenyReason; message: string }> = {
  'no-auth-plugin': {
    reason: 'AUTH_MISSING',
    message: 'AUTH_MISSING: @aihu/auth middleware is not registered',
  },
  'unverifiable-plugin': {
    reason: 'AUTH_UNVERIFIABLE',
    message:
      'AUTH_UNVERIFIABLE: auth plugin cannot signature-verify JWTs; refusing unverified claims',
  },
  'no-credential': {
    reason: 'AUTH_REQUIRED',
    message: 'AUTH_REQUIRED: a signed JWT is required for this tool',
  },
  'invalid-credential': {
    reason: 'AUTH_INVALID',
    message: 'AUTH_INVALID: JWT signature verification failed',
  },
  'no-subject': {
    reason: 'AUTH_INVALID',
    message: 'AUTH_INVALID: verified JWT carries no usable `sub` claim',
  },
}

/** 401 for an anonymous principal, with the exact #420 ladder message. */
function deny401(
  axis: 'call' | 'read',
  tier: EnforcementTier,
  principal: AnonymousPrincipal,
): EmissionDecision {
  const { reason, message } = AUTH_MESSAGES[principal.credentialFailure]
  return { allow: false, axis, tier, code: 401, reason, message }
}

function denyScope(axis: 'call' | 'read', scope: string): EmissionDecision {
  return {
    allow: false,
    axis,
    tier: 'hard',
    code: 403,
    reason: 'SCOPE_DENIED',
    message: `SCOPE_DENIED: JWT lacks required scope '${scope}'`,
  }
}

/**
 * Decide whether `principal` may receive the emission this query describes.
 *
 * `call` axis (ENFORCED in Phase 2 — the tool gate routes through this):
 *   - `'none'` → 404 for everyone. The compiler already makes such surfaces
 *     empty (C481); this is defense-in-depth, shaped like "does not exist"
 *     (the ordering invariant: existence is never confirmed to the refused).
 *   - `'anonymous'` → today's semantics exactly: only member-level gates
 *     (`$scope` / `$rate-limit`) demand a principal.
 *   - `'verified'` → any verified principal (agent or human session).
 *   - `{ scope }` → a verified principal carrying that scope, MET with the
 *     member's own `$scope` (both must pass — surface ceiling first, then
 *     member). `extract.call` never widens: it cannot expose a member or
 *     bypass a member `$scope` (spec §3 R3).
 *
 * `read` axis (DECIDED here, enforced by Phases 3/4 — nothing acts on these
 * decisions yet):
 *   - compliance values (`'all'`/`'agents'`/`'search'`/`'none'`) bind only
 *     declared-crawler UA tiers; unclassified anonymous requesters (humans by
 *     the honest ceiling) always pass, and any verified principal passes.
 *   - hard values (`'verified'`/`'human'`/`{ scope }`) require the matching
 *     verified principal.
 */
export function decideEmission(
  principal: Principal,
  query: EmissionQuery,
  deps?: EmissionDeps,
): EmissionDecision {
  return query.axis === 'call'
    ? decideCall(principal, query, deps)
    : decideRead(principal, query.value)
}

function decideCall(
  principal: Principal,
  query: Extract<EmissionQuery, { axis: 'call' }>,
  deps?: EmissionDeps,
): EmissionDecision {
  const { value } = query

  // The closed surface refuses everyone — before any principal question, so
  // possession of a credential never distinguishes "closed" from "absent".
  if (value === 'none') {
    return {
      allow: false,
      axis: 'call',
      tier: 'hard',
      code: 404,
      reason: 'SURFACE_UNAVAILABLE',
      message: 'SURFACE_UNAVAILABLE: this surface exposes no agent-callable members',
    }
  }

  // The extended needsPrincipal predicate (spec §4.2 T1):
  //   memberScope ∨ memberRateLimit ∨ surfaceCall ≠ 'anonymous'.
  const surfaceScope = isScopeValue(value) ? value.scope : null
  const needsPrincipal =
    (query.memberScope !== null && query.memberScope !== undefined) ||
    query.memberRateLimited === true ||
    value === 'verified' ||
    surfaceScope !== null

  if (!needsPrincipal) return { allow: true, axis: 'call', tier: 'hard' }

  if (principal.class === 'anonymous') return deny401('call', 'hard', principal)

  // Scope meet (spec §3 R1): surface ceiling first, then the member's own
  // requirement. Both must pass; the refusal names the first missing scope.
  const hasScope = deps?.hasScope ?? ((s: string) => principal.scopes.includes(s))
  if (surfaceScope !== null && !hasScope(surfaceScope)) return denyScope('call', surfaceScope)
  if (
    query.memberScope !== null &&
    query.memberScope !== undefined &&
    !hasScope(query.memberScope)
  ) {
    return denyScope('call', query.memberScope)
  }

  return { allow: true, axis: 'call', tier: 'hard' }
}

/** Which anonymous UA tiers each compliance `read` value refuses. */
const READ_REFUSES: Record<'all' | 'agents' | 'search' | 'none', readonly AnonymousUaTier[]> = {
  all: [],
  agents: ['training-crawler'],
  search: ['training-crawler', 'user-fetcher'],
  none: ['training-crawler', 'user-fetcher', 'searcher'],
}

function decideRead(principal: Principal, value: ExtractReadValue): EmissionDecision {
  // Compliance-tier values: only declared anonymous crawler tiers are bound.
  if (value === 'all' || value === 'agents' || value === 'search' || value === 'none') {
    if (
      principal.class === 'anonymous' &&
      principal.uaTier !== null &&
      READ_REFUSES[value].includes(principal.uaTier)
    ) {
      return {
        allow: false,
        axis: 'read',
        tier: 'compliance',
        code: 403,
        reason: 'UA_REFUSED',
        message: `UA_REFUSED: declared '${principal.uaTier}' crawlers are refused by this surface's read policy ('${value}')`,
      }
    }
    return { allow: true, axis: 'read', tier: 'compliance' }
  }

  // Hard-tier values: a verified principal is required.
  if (principal.class === 'anonymous') return deny401('read', 'hard', principal)

  if (value === 'verified') return { allow: true, axis: 'read', tier: 'hard' }

  if (value === 'human') {
    if (principal.class === 'human-session') return { allow: true, axis: 'read', tier: 'hard' }
    return {
      allow: false,
      axis: 'read',
      tier: 'hard',
      code: 403,
      reason: 'HUMAN_ONLY',
      message:
        'HUMAN_ONLY: this surface requires a verified human session; no agent credential qualifies',
    }
  }

  // { scope } — claims-derived membership (no raw JWT exists on emission paths).
  if (!principal.scopes.includes(value.scope)) return denyScope('read', value.scope)
  return { allow: true, axis: 'read', tier: 'hard' }
}

// ─── Surface policy from compiled metadata ───────────────────────────────────

/**
 * Read the `extract.call` policy off a compiled `AgentMetadata` entry (the
 * agent-meta artifact of the Phase 1 fan-out; rides the spec-mandated open
 * index signature).
 *
 * - No `extract` member at all → `'anonymous'`: the pre-GX registry shape,
 *   byte-identical to today's behavior (the resolved default's call value).
 * - `extract` present with a well-formed `call` → that value.
 * - `extract` present but `call` missing → `'anonymous'` (the compiler always
 *   emits both axes; a missing key is a hand-authored partial, and `call`'s
 *   documented default applies).
 * - `call` present but MALFORMED → `'none'`, fail-closed: a corrupted policy
 *   is refused, never rounded to open.
 */
export function surfaceCallPolicy(meta: AgentMetadata | undefined): ExtractCallValue {
  const extract = meta?.extract
  if (typeof extract !== 'object' || extract === null) return 'anonymous'
  const call = (extract as { call?: unknown }).call
  if (call === undefined) return 'anonymous'
  if (call === 'none' || call === 'anonymous' || call === 'verified') return call
  if (isScopeValue(call)) return { scope: call.scope }
  return 'none'
}
