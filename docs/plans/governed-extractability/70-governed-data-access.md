# Governed Extractability — the governed data-access boundary (generative loaders)

**Effort:** `governed-extractability` · **Track:** GX hard tier, Lane 2 · **Branch:** `docs/gx-entitlement-design`
**Status:** design — no implementation. Extends `40-spec.md` (E1–E6, T1–T5, I2/I2s) and
`50-credential-lifecycle.md` (issuance, RevocationStore). Designs the founder-directed
unification: **one governed boundary for the whole data path** — data-source access and the
entitlement decision, generated together from a declared governed data type, enforced by
server-side loaders (Option A, founder-ratified).
All file:line references verified against this worktree (`origin/main@74eaea47`), 2026-07-21.

---

## §1 Problem & the boundary

### 1.1 What exists, and where it leaks

Today's loader path (`packages/router/src/server.ts:31-68`) is fully ungated:

```
handle(req) → match → mod.loader(params) → renderToString → append __aihu_loader__ JSON
```

`mod.loader` (`defineLoader`, `packages/server/src/data.ts:33`; worked example
`examples/blog-loader/src/pages/posts/[slug].loader.ts`) receives only `params` — it cannot
see a principal, so it cannot withhold. Its result is serialized into `__aihu_loader__` for
**every** requester (`server.ts:52-55`). The spec already names this T4 ("route-level
withholding for principals failing the route's `read`", 40-spec §4.2) and E3 ("governed
data … gate-served", §5) — but as two separately hand-satisfied obligations: the author
would write a loader that fetches, and somewhere else the framework would gate.

Separately, the shipped gate is **static-only**: `decideEmission`'s `{ scope }` check reads
scopes baked into the JWT at issuance (`scopesOf`, `principal-gate.ts:190-197`; membership
check `:442-451`, `:502`). A member whose Fellwork subscription lapsed ten minutes ago
still carries `scope: 'members'` until the token expires. There is no place to ask the
question *"is this principal entitled right now?"*

### 1.2 The boundary, in one diagram

One governed boundary answers both questions, generated from one declaration:

```
                       ┌─────────────────────────────────────────────────────────────┐
                       │            THE GOVERNED DATA-ACCESS BOUNDARY                │
                       │              (the generated loader, §3)                     │
                       │                                                             │
 Request ──────────────┼─▶ 1 resolvePrincipal        (shipped, principal-gate.ts)    │
   │ Bearer / cookie   │        │  ▲ RevocationStore consult lives inside verify     │
   │ / anonymous       │        ▼                                                    │
   │                   │   2 decideEmission          (shipped — the STATIC meet:     │
   │                   │        │                     token scopes ∩ declared scope) │
   │                   │        ▼                                                    │
   │                   │   3 checkEntitlement        (NEW — the LIVE resolver,       │
   │                   │        │                     registered per scope, §4.1-2)  │
   │                   │        ▼                                                    │
   │                   │   4 provider fetch          (NEW — registered per resource  │
   │                   │        │                     type; runs ONLY after grant)   │
   │                   │        ▼                                                    │
   │                   │   5 emit                                                    │
   │                   │      granted  → route.data = Entitled<T>                    │
   │                   │      withheld → route.data = Withheld<T>   (never fetched)  │
   │                   └─────────────────────────────────────────────────────────────┘
   │                                        ▲                    ▲
   └── same boundary, three transports ─────┤                    │
        • SSR handle (T4)                   │                    │
        • the E3 governed-data endpoint ────┘                    │
        • the call axis (runGate, T1) — steps 1–3 only ──────────┘
```

Steps 1–2 are shipped code, consumed unchanged. Steps 3–5 are this design. The author
writes exactly two functions — a **data-source provider** (keyed by resource type) and an
**entitlement resolver** (keyed by scope) — and the framework generates the loader that
composes them. No per-route loader boilerplate for governed routes; no way to fetch
governed data that does not pass through the gate, because the fetch **is a stage of** the
gate.

### 1.3 Non-goals

- No change to the `extract:` vocabulary (both axes and all values stay as parsed by
  `packages/compiler/src/extract.rs`).
- No second verification path: the principal comes only from `resolvePrincipal`
  (`principal-gate.ts:214`), the static meet only from `decideEmission` (`:397`).
- Nothing here claims control above the honest ceiling — §8.

---

## §2 Declaration — what the author writes

Three declarations, each in the place that owns it. The worked example is Fellwork's
paid-member lexicon page.

### 2.1 The route: governed type + policy (in the `.aihu` file)

```
@route {
  path: '/lexicon/[slug]'
  ssr: true
  extract: {
    read: { scope: 'members' }     // hard tier: server-held, per-principal emission
    call: { scope: 'members' }     // agent calls gated by the SAME scope (§4.6)
  }
  data: {
    type: 'LexiconEntry'           // NEW: names the governed resource type
    preview: ['headword']          // optional: fields renderable in the locked state
  }
}

@template {
  <article>
    <$if test="route.data.$gx.entitled">
      <h1>{route.data.headword}</h1>
      <section>{route.data.senses}</section>
    </$if>
    <$else>
      <h1>{route.data.preview?.headword}</h1>
      <gx-locked reason="{route.data.$gx.reason}"></gx-locked>
    </$else>
  </article>
}
```

`data:` is a new `@route` key beside `extract:`/`ssr:`/`head:` (same parse seam,
`parser/sfc.rs` route-body dispatch; fanned into `.route.json` exactly like `extract`
rides today, `router.ts:69`). It does two jobs: **binds the route to a provider** (the
`type` name is the provider key) and **anchors the generated `Withheld` variant** (§4.5).

### 2.2 The two registrations (server init, once per app)

```ts
// server.ts — the app's server entry. Server-only by construction: the registry
// is created where createServerRouter lives (@aihu/router/server), a module the
// browser graph is already forbidden to import (router/src/server.ts:1-6).
import { createServerRouter } from '@aihu/router/server'
import { createGovernedRegistry } from '@aihu/server'

const governed = createGovernedRegistry()

  // ── Data-source provider: WHERE a type's data comes from. Keyed by resource
  //    type. One registration, every governed route declaring the type uses it.
  .provider('LexiconEntry', {
    fetch: async (ctx) => db.getLexiconEntry(ctx.params.slug),   // never bundled
    preview: async (ctx) => db.getLexiconHeadword(ctx.params.slug), // optional (§4.5)
  })

  // ── Entitlement resolver: whether a principal may have it RIGHT NOW. Keyed
  //    by scope. Registering a resolver makes every use of the scope live (§4.2).
  .entitlement('members', {
    resolve: async ({ principal }) =>
      (await billing.subscription(principal.sub)).status === 'active',
    timeoutMs: 1500,               // resolver deadline; timeout ⇒ withhold (§4.3)
    cache: { ttlMs: 30_000 },      // positive-verdict TTL cache, per (scope, sub) (§4.4)
  })

const router = createServerRouter(routes, { governed })
```

That is the entire authored surface for the Fellwork case. End-to-end behavior:

| Requester | Steps taken | Result |
|---|---|---|
| Anonymous human | 1 → 2 fails (AUTH_REQUIRED) | `Withheld<LexiconEntry>` with `reason: 'auth'`, preview headword, 401-shaped page state; no DB fetch |
| Member, valid session, active subscription | 1 → 2 → 3 (billing: active) → 4 → 5 | Full `LexiconEntry`; response `Cache-Control: private`, `Vary: Authorization, Cookie` |
| Member whose subscription lapsed, token still carries `members` | 1 → 2 passes (static) → 3 **fails live** | `Withheld` with `reason: 'entitlement'`; no fetch — the exact hole static scopes cannot close |
| Agent with delegated token, scope `members`, delegator active | 1 → 2 → 3 → 4 → 5 | Full data on read; `call:` members invocable (§4.6) |
| Billing service down | 1 → 2 → 3 times out | Withhold, `reason: 'unavailable'` (fail-closed, honestly labeled — §4.3) |

### 2.3 Boot-time validation (fail-closed at init, not at first request)

At `createServerRouter` construction, the registry is checked against the compiled
artifacts (the `.route.json` census the build already prints — 40-spec §9/§10):

- Every route with a `data:` declaration must have a provider for its `type` → else
  **boot refusal** naming the route and the missing key.
- In `strict` mode (default when any hard-tier `read` exists): every `{ scope }` used by a
  hard-tier surface must have a registered entitlement resolver → else boot refusal. An
  operator who wants token-scope-only for a given scope says so explicitly:
  `.entitlement('archive', 'token-only')` (§4.2).

---

## §3 The generated loader — the contract

### 3.1 Types (illustrative sketch — the named interfaces of this design)

```ts
// ── Registration (server-only, @aihu/server) ────────────────────────────────
interface GovernedRegistry {
  provider<K extends string, T>(type: K, p: DataProvider<T>): GovernedRegistry
  entitlement(scope: string, r: EntitlementRegistration | 'token-only'): GovernedRegistry
}

interface DataProvider<T> {
  /** The one data-source access. Runs ONLY after grant. Server-only, never bundled. */
  fetch(ctx: GovernedFetchContext): Promise<T>
  /** Optional: data for the declared `preview:` fields of the withheld state. */
  preview?(ctx: GovernedFetchContext): Promise<Partial<T>>
}

interface EntitlementRegistration {
  /** The LIVE per-request check. true = entitled now. Throw/timeout ⇒ withhold. */
  resolve(ctx: EntitlementContext): Promise<boolean>
  timeoutMs?: number          // default 2000 (§7 Q1)
  cache?: { ttlMs: number }   // positive verdicts only, per (scope, principal.sub) (§4.4)
}

interface EntitlementContext {
  readonly principal: Exclude<Principal, AnonymousPrincipal>  // static meet already passed
  readonly scope: string
  readonly request: { readonly url: URL }     // never the raw credential
}

// ── The generated loader (what the framework materializes per governed route) ──
type GeneratedLoader<T> = (ctx: GovernedLoadContext) => Promise<GovernedEmission<T>>

interface GovernedLoadContext {
  readonly params: Record<string, string>
  readonly url: URL
  readonly principal: Principal               // settled by resolvePrincipal in handle
  readonly entitlements: EntitlementMemo      // per-request memo (§4.4 layer 1)
}

type GovernedEmission<T> =
  | { readonly kind: 'granted';  readonly data: Entitled<T> }
  | { readonly kind: 'withheld'; readonly data: Withheld<T>; readonly decision: EmissionDecision }
  | { readonly kind: 'error';    readonly status: 500 }      // provider failed AFTER grant (§4.3)

// ── What the template sees as route.data (§4.5) ─────────────────────────────
type Entitled<T> = T & { readonly $gx: { readonly entitled: true } }
type Withheld<T> = {
  readonly $gx: {
    readonly entitled: false
    readonly reason: 'auth' | 'scope' | 'entitlement' | 'unavailable'
  }
  readonly preview?: Partial<T>   // only the declared preview: fields
}
```

### 3.2 The pipeline, precisely

For a route whose `.route.json` carries both `extract` (hard `read`) and `data`:

1. **Principal** — `handle` calls `resolvePrincipal({ jwt, userAgent, session }, deps)`
   once per request (shipped, `principal-gate.ts:214`) and closes it into the loader
   context. The RevocationStore consult (50-credential §6 Layer 2) is inside the verify
   seam (`verified-plugin.ts` `verify`) and therefore already settled here — a revoked
   credential arrives as `anonymous`, never reaching step 3.
2. **Static meet** — `decideEmission(principal, { axis: 'read', value })` (shipped,
   `:397`). Deny → skip to 5-withheld with the decision's reason mapped
   (`AUTH_*` → `'auth'`, `SCOPE_DENIED` → `'scope'`, `HUMAN_ONLY` → `'scope'`). The cheap
   check always runs first; a request that cannot pass on token scopes never costs a
   billing call.
3. **Live entitlement** — for the effective scope(s) of the surface (the R1 meet set), if
   a resolver is registered: `entitlements.check(scope)` — memoized per request, TTL-cached
   per (scope, sub) if configured. `false` → withheld `'entitlement'`; throw/timeout →
   withheld `'unavailable'`. `'token-only'` registration or (non-strict) no registration →
   step is a no-op (today's semantics).
4. **Provider fetch** — only now does `provider.fetch(ctx)` run. Withheld requests never
   touch the data source: no fetch-then-redact, no governed bytes in memory for a request
   that will not receive them, no accidental leak through logging or timing of a redaction
   step. On the withheld path, `provider.preview` runs instead iff the route declared
   `preview:` fields (preview data is public-tier by declaration — §4.5).
5. **Emit** — `granted` → `route.data = Entitled<T>`, serialized into `__aihu_loader__`
   (and the SSR render), response carries `Cache-Control: private` +
   `Vary: Authorization, Cookie` (40-spec §5 discipline). `withheld` → the `Withheld<T>`
   shape is what serializes — the granted payload never exists in the response. Agent
   callers on the call axis get the envelope error instead (§4.3, §4.6).

**Invariant (extends I2):** the generated loader is the *only* path by which a
`data:`-declared route's provider is invoked. `handle` never calls `mod.loader` on a
governed route outside this pipeline; a governed route reaching render without a settled
`GovernedEmission` throws `GOVERNED_UNGATED` (the I2 posture, 40-spec §10).

### 3.3 One boundary, three transports

The same `GeneratedLoader` serves:

- **SSR** — `handle` awaits it and passes `route.data` into the render (T4 realized).
- **The E3 governed-data endpoint** — `GET /__aihu/data/<route>` (exact path TBD with E2/E3
  build): the client-side entitled path (E5 full-subtree materialization) and client-nav
  refetch call the same loader over HTTP; anonymous fetch gets the withheld shape with the
  AUTH_* envelope, entitled fetch gets granted JSON. One contract, byte-equal decisions.
- **The call axis** — `runGate` shares steps 1–3 (not 4–5): same principal, same static
  meet, same live resolver via the same memo (§4.6).

---

## §4 The seven design decisions

### 4.1 Registration surface

**Decision.** A single server-init builder — `createGovernedRegistry().provider(type,
{...}).entitlement(scope, {...})` — passed to `createServerRouter(routes, { governed })`
(§2.2, §3.1). Binding is by name equality: the route's `data.type` string keys the
provider; the surface's effective `{ scope }` value (the R1 meet set from `extract`) keys
the resolver. Both bindings are checked at boot against the compiled census (§2.3), so a
typo is a boot refusal, not a 500 at first request.

**Rationale.** (a) Server-only by construction — the registry exists only in the module
graph that already must not reach the browser (`router/src/server.ts:1-6`); there is no
client-importable registration API to misuse. (b) One value, explicitly threaded — the
same injection posture as `AgentServiceOptions.resolveAuth` and `PrincipalGateDeps`
(`principal-gate.ts:175-187`): no ambient state, trivially testable, two apps in one
process cannot collide. (c) Name-keyed binding means the `.aihu` file stays free of
imports/closures — the compiler fans out a plain string, and the three-artifact agreement
machinery (40-spec §2.4, DA-f2) extends to `data` unchanged.

**Rejected alternative.** Module-global `registerProvider()`/`registerEntitlement()` calls
(import-for-side-effect). Rejected because registration order and module-evaluation timing
become load-bearing, tests can't isolate registries, and a stray import in a shared module
can drag registration code toward the client graph. Also rejected: per-route inline
providers in the `.loader.ts` file — that is exactly the per-route boilerplate the founder
wants generated away, and it scatters the data-source surface across N files instead of
one auditable registry.

### 4.2 Static token-scope vs live resolver

**Decision.** Two tiers, strictly ordered: the static token-scope meet (shipped,
`decideEmission`) always runs first and is never skippable; the live resolver runs second,
**iff a resolver is registered for the scope**. Liveness is a property of the *scope's
registration*, not of the surface declaration: registering `.entitlement('members',
{ resolve })` makes every surface using `{ scope: 'members' }` — both axes — live-checked;
registering `'token-only'` (or, in non-strict mode, not registering) leaves the scope
static. Strict mode (§2.3, default in the presence of any hard-tier read) forces every
hard-tier scope to make that choice explicitly at boot, so Fellwork's serving path cannot
silently run token-only.

**Rationale.** The scope's semantics ("what does `members` mean?") belong to exactly one
place. Putting liveness on the surface (`read: { scope: 'members', live: true }`) would
let two routes disagree about what the same scope means — one live, one stale — which is a
policy drift the thesis's Derived doctrine exists to forbid. The registration is also the
only place that *knows* whether a live check is possible (it holds the billing client).
And ordering static-first is both cheap (claims are in memory; billing is a network hop)
and correct: the live resolver's contract assumes a verified principal — it must never run
for a request the static gate already refuses.

**Rejected alternative.** Declaring liveness on the surface (`live: true` in `extract`).
Rejected per above: splits one scope's meaning across surfaces, adds a vocabulary knob the
compiler must validate against a registry it cannot see, and makes "did the live check
run?" a per-route archaeology question instead of a one-line registry read. Also rejected:
replacing the static meet with the resolver ("the resolver is the only check") — the
static meet is the attenuation contract of issuance (C3, 50-credential §1): a delegated
token deliberately narrowed to exclude `members` must stay excluded even if the delegating
human is an active member. The meet and the resolver answer different questions
(*was this authority granted to this credential* vs *is the authority current*); both must
pass.

### 4.3 Fail-closed semantics

**Decision.** Every failure in steps 3–4 withholds; no failure emits governed data. The
exact ladder:

| Failure | Read axis (page) | Call axis (agent) | Fetched? |
|---|---|---|---|
| Static meet deny | `Withheld` `reason: 'auth' \| 'scope'` | Shipped AUTH_*/SCOPE_DENIED envelope (401/403) | never |
| Resolver returns `false` | `Withheld` `reason: 'entitlement'` | 403, `ENTITLEMENT_DENIED` (new reason, §5) | never |
| Resolver throws / exceeds `timeoutMs` | `Withheld` `reason: 'unavailable'` | 503, `ENTITLEMENT_UNAVAILABLE` + `Retry-After` | never |
| Provider throws / times out (post-grant) | `kind: 'error'` → 500-shaped page state | 500 envelope | attempted |

Timeout posture: each resolver runs under its registered `timeoutMs` (default 2000 ms,
open — §7 Q1) enforced by the framework with `AbortSignal` passed into the resolver;
deadline exhaustion is indistinguishable from a throw. The template surface for all
withheld rows is the one `Withheld<T>` shape — the page always renders a coherent locked
state (§4.5); `reason` lets it say "sign in" vs "upgrade" vs "temporarily unavailable".

**Rationale.** The G-series doctrine verbatim: a control that cannot answer does not
answer "yes" (40-spec G4b; 50-credential §6 "fail direction: closed"). But fail-closed
must not lie: a billing outage is **not** an entitlement verdict, and telling a paying
member "you are not entitled" (or an agent `ENTITLEMENT_DENIED`) during an outage is a
false statement about their account. Hence `'unavailable'` is its own reason and the call
axis says 503-with-Retry-After, not 403. Provider failure is separated for the same
honesty reason in the other direction: at that point access was *granted* — the locked
state would be a lie; it is an error state. The withheld shape reveals only what the
requester already knows (they requested the route; existence of governed routes at this
granularity is already conceded by 40-spec §8's per-principal discovery design).

**Rejected alternative.** Collapsing resolver failure into `SCOPE_DENIED`/`'entitlement'`
(one fewer state). Rejected: it converts every dependency outage into a mass false-denial
event that is indistinguishable — to users, agents, and dashboards — from mass entitlement
lapse; and it teaches agent callers to treat 403 as retryable, corroding the meaning of
the real denial. Also rejected: fail-open-with-alarm ("serve stale on resolver outage") —
it is precisely the "hard until the first outage" softening the hard tier exists to
refuse; the TTL cache (§4.4) is the sanctioned availability lever because its staleness
bound is declared, not incidental.

### 4.4 Cost, caching & revocation

**Decision.** Three layers, each with a stated staleness bound:

1. **Per-request memo (always on).** One `EntitlementMemo` per request; a scope is
   resolved at most once per (request, scope) no matter how many surfaces/members consult
   it — a page with a governed route + three governed `call:` members costs one billing
   call, and the read-axis check and any call-axis check within the same request share
   the verdict. Staleness bound: the request's own duration.
2. **Cross-request TTL cache (opt-in per registration).** `cache: { ttlMs }` caches
   **positive verdicts only**, keyed `(scope, principal.sub)`, in-process. A lapsed
   entitlement is served for at most `ttlMs` after lapse — a bound the operator chose and
   can state. Negative verdicts are never cached: a member who just paid is entitled on
   their next request, and the deny path costs a resolver call (acceptable: denies are not
   the hot path; revisit only with evidence — §7 Q2).
3. **Revocation composition.** Credential revocation and entitlement lapse are different
   events and neither may hide behind the other's cache:
   - The RevocationStore consult (50-credential §6 Layer 2) lives on the **verify path**,
     upstream of principal resolution — it is never TTL-cached by this layer, so a revoked
     credential resolves to `anonymous` and fails step 2 regardless of any warm entitlement
     cache entry (the cache is keyed by scope+sub but only *reachable* through a live
     credential).
   - The entitlement cache **subscribes to revocation events**: the registry accepts an
     optional `onRevoke(sub)` wiring from the RevocationStore (an additive hook on the
     50-credential design — see §5) and purges every cache entry for that sub, so "revoke
     this delegation" also drops any cached entitlement warmth immediately, in-process.
   - Worst-case table, stated for docs: credential revoked → 0 lag with Layer 2 store,
     ≤ access-TTL with Layer 1 only (50-credential §6); entitlement lapsed → ≤ `ttlMs`
     (0 if no cache configured). Both bounds are per-process, the same honesty as the rate
     limiter (`rate-limiter.ts` per-process note, 40-spec P6) — a shared cache store is an
     operator upgrade, not a framework default.

**Rationale.** The expensive thing (a live billing call per SSR request) is made cheap in
the two places it is safe to be cheap — within one request (trivially safe: one instant in
time) and within a declared TTL (safe because the bound is explicit and chosen). The
subtle failure this layering prevents: without the ordering rule in (3), a warm entitlement
cache could keep serving a principal whose *credential* was revoked mid-TTL — the cache
would effectively extend the credential. By construction that cannot happen here, because
the cache is consulted only at step 3, which is only reached through a live, unrevoked
credential at steps 1–2 on every request.

**Rejected alternative.** Caching the *composed* decision (principal × scope × route →
allow) keyed by token. Rejected: it fuses the two staleness domains — a token-keyed
composite cache must be flushed on both credential events and entitlement events, and any
miss in that bookkeeping serves governed data on a dead credential; it also caches the
static meet, which is already ~free. Also rejected: no cross-request cache at all
("always live"). Kept available (omit `cache:`), but wrong as the only mode — it makes the
hard tier's cost scale 1:1 with page traffic and pushes operators toward fail-open
workarounds; a declared-TTL cache is the honest version of the caching they would build
anyway.

### 4.5 Type redaction / generation

**Decision.** The compiler generates the withheld variant; the author declares **one**
type. From `data: { type: 'LexiconEntry', preview: [...] }` the framework derives the
discriminated union the template sees (§3.1): `route.data : Entitled<T> | Withheld<T>`,
discriminated on `$gx.entitled`. `Withheld<T>` carries **no** field of `T` except the
declared `preview:` subset (typed `Partial<T>` narrowed to those keys), populated by the
provider's separate `preview` fetch — never by redacting a full fetch. The `$gx`
discriminant namespace is reserved (a `data:` type with its own `$gx` field is a compile
error, C48x). Compile-time enforcement: template member access on `route.data` outside a
`$gx.entitled`-guarded region is checked where the compiler already type-threads
`route.data` from the `$prop` declaration; at minimum the generated TS types make
unguarded access a type error in the emitted module.

**Rationale.** This is the core of "generative loaders from governed data types": one
declared type is the single source from which the entitled shape, the withheld shape, the
loader, and the locked-state rendering contract are all derived — the author cannot express
a governed route whose locked state is unrenderable or whose withheld shape drifts from
its entitled shape. Making preview fields *declared* (not inferred, not redacted-out) puts
the public/governed line for partial data in the artifact where every other GX line lives:
the declaration. And populating them by a separate fetch keeps the invariant of §3.2 step
4 — governed bytes are never in memory for a withheld request.

**Rejected alternative.** Author declares both shapes (an `EntryLocked` type beside
`LexiconEntry`). Rejected: it is the thesis's named "kept in sync" defect — two
hand-maintained shapes whose drift is silent until a locked page crashes or, worse,
renders a field that should have been governed. Also rejected: fields-become-optional
(`route.data: Partial<T>` when withheld, same type otherwise). Rejected because it erases
the distinction the template most needs — "withheld" becomes indistinguishable from
"empty", entitled code paths inherit `undefined` checks on every field forever, and a
missing guard fails soft (blank rendering) instead of failing at compile time.

### 4.6 One resolver, both axes

**Decision.** `checkEntitlement(registry, principal, scope, memo)` is the single live
check, and both axes call it after their existing static meet:

- **Read axis:** step 3 of the generated loader (§3.2) — after `decideEmission` passes.
- **Call axis:** `runGate` gains one stage after its shipped scope meet
  (`agent-service.ts` step 3, the `hasScope` consults at `:227-235` and the member-scope
  meet): for each scope in the met set (surface `extract.call` scope ∧ member `$scope`)
  with a registered resolver, consult the same function through the same per-request memo.
  Deny → `ENTITLEMENT_DENIED` (403); failure → `ENTITLEMENT_UNAVAILABLE` (503) — the §4.3
  ladder in the tool envelope.

The registry reaches the call axis by injection: `AgentServiceOptions` gains an optional
`entitlements` handle (the same injected-dependency posture as `resolveAuth` /
`PrincipalGateDeps`), and the host that constructs both the server router and the agent
service passes the **same registry instance**, so one page request that both renders a
governed route and executes a governed tool call shares one memo, one verdict.

**Rationale.** This is the founder's unification applied to the axis pair: `read` and
`call` already share one scope *vocabulary* (`extract.rs` parses one `{ scope }` shape for
both; one census) and one static gate (`decideEmission` handles both axes). A scope whose
live meaning differed by axis — page says lapsed, tool says active — would be a
contradiction the author never wrote. One resolver, met after each axis's own static
rules, keeps the axes independent (D3) in *policy* while unified in *fact*.

**Rejected alternative.** Separate resolver registries per axis (`readEntitlements` /
`callEntitlements`). Rejected: no use case survives contact — "may read the page but may
not call the tool *right now*" is expressible today with different scope *names* on the
two axes (the vocabulary already supports it); duplicating registries for the same name
just creates the split-brain. Also rejected: gating calls only ("reads are cheap, let the
token ride") — Fellwork's case is exactly a read (the served lexicon page), and R1's meet
law makes the read axis the *more* data-bearing of the two.

### 4.7 Generated-loader contract & escape hatch

**Decision.** Generation is opted into by the `data:` declaration, and the escape hatch
replaces exactly one stage — the provider — never the gate:

- **`data:` present, no sibling `.loader.ts`** → the framework materializes the
  `GeneratedLoader` (§3) at boot from the registry. This is the default governed path.
- **`data:` present *and* a sibling `.loader.ts`** → **compile-time error (C486)**: one
  data source per route. The conflict check lives in the router Vite integration (the
  layer that discovers sibling loaders — `examples/blog-loader/vite.config.ts` comment;
  the Rust compiler cannot see sibling files).
- **Hand-written data logic on a governed route** → `defineGovernedFetch`: the author
  registers a *route-local provider* in the loader file, and the framework still generates
  the gate around it:

  ```ts
  // [slug].loader.ts on a governed route — the escape hatch
  import { defineGovernedFetch } from '@aihu/server'
  export const loader = defineGovernedFetch<LexiconEntry>({
    fetch: async (ctx) => assembleFromThreeSources(ctx),   // replaces step 4 ONLY
    preview: async (ctx) => ({ headword: await db.headword(ctx.params.slug) }),
  })
  ```

  Steps 1–3 and 5 remain framework-generated and non-bypassable; `ctx` carries the settled
  principal (a hand-written fetch may *further* narrow, never widen — R3).
- **No `data:`, plain `defineLoader`** → the shipped path, unchanged — for ungoverned
  routes it behaves byte-identically to today. On a route whose `extract.read` is
  hard-tier, a plain `defineLoader` is a **build warning (W48x)** and its output is still
  route-level filtered by T4 (the coarse fallback the 40-spec already accepts): the gate
  cannot be escaped by declining the contract, only the generated ergonomics can.

Where generation stops: the framework generates composition, emission shapes, and
transport (SSR + E3 endpoint). It never generates data access itself — the innermost
fetch is always an authored function (registry provider or `defineGovernedFetch`), because
that function is the app's trust boundary with its own infrastructure.

**Rationale.** The gate/provider split is what makes "single governed boundary" compatible
with real apps: every route eventually needs a bespoke fetch, and if bespoke meant
"hand-write the whole loader including the gate", the gate would be exactly as reliable as
the least careful route. C486 (rather than precedence) because a route with two declared
data sources is a contradiction, and R2 says declared contradictions fail the build —
runtime precedence the author didn't write is the forbidden resolution.

**Rejected alternative.** "Sibling loader silently wins over `data:`" (precedence).
Rejected per R2 — and it makes the governed declaration a dead letter without any signal.
Also rejected: allowing fully hand-written loaders on governed routes with documentation
telling authors to call the gate themselves. Rejected: a convention is not a boundary; the
I2 invariant exists precisely because "a future code path forgot the gate" must be a loud
failure, not a silent leak.

---

## §5 Composition with shipped GX — what rides, what's added

| Shipped surface | Relationship | Change needed? |
|---|---|---|
| `resolvePrincipal` / principal classes (`principal-gate.ts:214`) | Consumed as-is; step 1. The loader context carries the settled `Principal`. | **None.** |
| `decideEmission` static meet (`:397`) | Consumed as-is; step 2; stays sync/pure. Live checking is a *separate subsequent stage*, so the shipped function's contract is untouched. | **Additive:** widen `EmissionDenyReason` with `ENTITLEMENT_DENIED` / `ENTITLEMENT_UNAVAILABLE` (used by the new stage's decisions, never returned by `decideEmission` itself). |
| `scopesOf` / static token scopes | The static tier, unchanged — the live resolver composes after it, never replaces it (§4.2). | None. |
| `extract.rs` vocabulary | Both axes and all values unchanged. | **Additive:** parse the new `@route` `data:` block (type + preview keys); fan into `.route.json` beside `extract` (same three-artifact machinery); reserve `$gx`; new diagnostics C48x (bad `data:` shape), C486 (data ∧ sibling loader — enforced in the Vite layer), W48x (plain loader on hard route). |
| `runGate` (`agent-service.ts:130`) | Call axis gains the post-meet live stage (§4.6). | **Additive:** optional `entitlements` in `AgentServiceOptions`; one new stage between scope meet and rate limit; absent registry ⇒ byte-identical behavior. |
| Router `handle` (`router/src/server.ts:31-68`) | Today's ungated `mod.loader` + `__aihu_loader__` embed is replaced, for governed routes, by the generated loader; this **is** T4/E3's implementation. Ungoverned routes unchanged. | **Planned Phase-4 change** (already scheduled as #466); this design specifies its shape. `handle` also gains the `Vary`/`Cache-Control: private` discipline for governed responses (40-spec §5). |
| E1/E2 (server-only emission, governed chunks) | Orthogonal-and-composing: E1/E2 govern template/state bytes; this layer governs `route.data`. The E3 endpoint (§3.3) is the data half of the governed-chunk serving path; E5's entitled materialization fetches from it. | None beyond what #466 already plans. |
| T3 (state script) / T2 (SSR walk) | The withheld shape means governed loader data never enters `__aihu_state__` or anonymous SSR — this design *satisfies* E4 for the loader channel. | None. |
| RevocationStore (50-credential §6 — design, not yet shipped) | Consulted on the verify path, upstream (§4.4.3); the entitlement cache never fronts it. | **Additive to the 50-doc design:** an `onRevoke(sub)` event hook so the registry can purge per-sub entitlement cache entries (design-to-design change; no shipped code affected). |
| Issuance / scope census (50-credential §3; `emit.rs` sidecars) | `scopes_supported` and consent screens already derive from the census; `data:` adds no scopes. Strict-mode boot validation (§2.3) reads the same census. | None. |
| `check:governed` / DA-f invariants | Gains the §6 criteria below (G7 family). | Additive fixtures. |

**Explicitly flagged changes to already-shipped code:** (1) `EmissionDenyReason` union
widened in `principal-gate.ts` (additive union members — no existing decision changes);
(2) `runGate` gains the optional live-entitlement stage behind an injected registry
(absent ⇒ no behavior change); (3) `extract.rs`/`sfc.rs` parse the new `data:` route key;
(4) `router/src/server.ts` `handle` — the already-scheduled Phase-4 rework, now specified.
Nothing else shipped is modified.

---

## §6 Acceptance criteria (G7 family — Verifier/Builder checkable)

- **G7a — generation:** a fixture route with `data:` + hard `read:` and no sibling loader
  serves: anonymous → withheld shape (no provider invocation — assert via provider spy);
  entitled → full data. The same assertions pass against the E3 endpoint with identical
  decisions (transport parity).
- **G7b — live delta:** a principal whose token carries the scope but whose resolver
  returns `false` receives the withheld shape with `reason: 'entitlement'` on the read
  axis and `ENTITLEMENT_DENIED` 403 on the call axis — the case static scopes cannot
  express, probed both axes from one fixture registry.
- **G7c — fail-closed:** resolver throw and resolver deadline-exceeded each yield
  withheld `'unavailable'` (read) / 503 + `Retry-After` (call); provider throw *after*
  grant yields the 500-shaped error state, never a withheld shape; in no failure case do
  governed bytes appear in the response (byte-scan, E6 style).
- **G7d — memo & cache:** one request touching a governed route plus N governed call
  members invokes the resolver exactly once (spy count). With `cache.ttlMs` set, a second
  request within TTL invokes zero times; after TTL, once; a negative verdict is re-resolved
  on the immediately following request (negatives uncached).
- **G7e — revocation composition:** with a warm positive cache entry, revoking the
  credential (store consult on verify) makes the next request resolve anonymous and
  receive the auth-withheld shape — the entitlement cache must not be consulted at all
  (spy: zero cache reads on the anonymous path). Firing `onRevoke(sub)` purges the sub's
  entries (next entitled-credential request re-resolves live).
- **G7f — attenuation preserved:** a delegated token minted *without* the scope is refused
  at the static meet even when the delegating human's resolver verdict is `true` — the live
  layer never widens (C3/R3 probed at this boundary).
- **G7g — type contract:** the generated `Withheld<T>` for a fixture type contains no key
  of `T` beyond declared `preview:` fields (runtime assertion on the serialized
  `__aihu_loader__` payload of a withheld response); unguarded `route.data` field access
  in a fixture template fails the build/typecheck.
- **G7h — boot validation:** `data:` naming an unregistered type refuses to boot naming
  route + key; strict mode with an unregistered hard-tier scope refuses to boot;
  `'token-only'` registration boots and skips step 3.
- **G7i — escape hatch:** `defineGovernedFetch` on a governed route passes G7a–c
  unchanged (the gate is identical; only the fetch differs); `data:` + sibling
  `defineLoader` fails the build (C486); plain `defineLoader` on a hard-read route emits
  W48x and its output is absent from anonymous responses (T4 fallback holds).
- **G7j — no-registry regression:** an app with no `createGovernedRegistry` and no `data:`
  declarations is byte-identical to today across the existing check suites (`check:governed`
  G4/G5, `check:dual-audience`).

---

## §7 Open questions for founder ratification

- **Q1 — default resolver timeout.** 2000 ms proposed (§3.1). Policy, not architecture;
  bounds the worst-case SSR latency added by a hung entitlement dependency.
- **Q2 — negative-verdict caching.** Design says never cache negatives (§4.4). If a hot
  public page draws heavy non-member traffic, deny-path resolver load could argue for a
  short (~5 s) negative TTL. Recommend shipping uncached and revisiting with evidence.
- **Q3 — strict mode default.** Design defaults `strict: true` whenever any hard-tier
  `read` exists (§2.3): every hard scope must declare live vs `'token-only'` at boot.
  Ratify the default (the permissive alternative is silent-token-only, which is the drift
  the founder's ask exists to close — recommended: strict).
- **Q4 — preview-field placement.** `preview:` lives on the route's `data:` block (§2.1).
  Alternative: on the provider registration (one preview policy per type rather than per
  route). Route-level chosen for per-surface control; cheap to ratify either way before
  build.
- **Q5 — the E3 endpoint path & client contract.** `/__aihu/data/<route>` is a
  placeholder; the exact URL shape and client-nav refetch protocol should be fixed
  together with #466's E2/E3 build (not a policy question, but it touches public URL
  surface).

---

## §8 Honest-ceiling check

Nothing in this design claims control above **verified principal + server-held +
live-checked**, and each stage is bounded by the shipped ceiling statements:

- The boundary governs **server-sourced loader data**. It adds nothing for content an
  anonymous human can already see — compliance-tier surfaces are untouched, and every
  40-spec §1 ceiling statement stands verbatim.
- The live check is **as strong as the credential and the resolver's own data source**. A
  revoked credential is dead at the RevocationStore's honesty bound (50-credential §6 —
  0 with Layer 2, ≤ access-TTL with Layer 1); a lapsed entitlement is dead within the
  operator's declared `ttlMs` (0 uncached). Both bounds are per-process for in-memory
  stores, stated in docs, same as the rate limiter's honesty note.
- The withheld shape and preview fields are **declared public-tier**: nothing in a
  withheld response exceeds what the author explicitly marked renderable-when-locked, and
  the granted payload is never fetched, never in memory, never in any anonymous artifact —
  the E6/G5 byte checks extend over this channel (G7a/c/g).
- Fail direction is closed at every stage, and the one place closure could shade into a
  false claim (an outage presented as a verdict) is explicitly surfaced as
  `'unavailable'`/503 instead — the framework refuses to serve, without asserting an
  entitlement fact it does not know.
- No marketing surface may describe this as DRM, client-side protection, or protection
  against a principal who *is* entitled and chooses to exfiltrate what they can read —
  Tier 2's audit handles (`jti`, `act`, rate budgets) are the honest instrument for that
  population, and they ride the same credentials unchanged.
