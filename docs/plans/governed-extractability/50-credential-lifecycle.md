# Governed Extractability — credential lifecycle (issuance, consent, revocation)

**Effort:** `governed-extractability` · **Track:** `da4-govern` · **Branch:** `design/govern-synth`
**Status:** design — no implementation. Folds ISSUANCE into GX so the ratifiable unit is the
whole loop: **declare → issue → present → verify → enforce**. Extends `40-spec.md` (which
designed declaration + enforcement) and `41-thesis-amendment-proposal.md` (updated in the
same commit). Realizes thesis §Attribution **Tier 1 (Delegated)** and **Tier 2 (Bounded)**.
All file:line references verified against this worktree 2026-07-20; where a finding lives on
`origin/main` but not this branch, that is stated explicitly.

---

## 0. Investigation — the issuance surface that exists today (ground truth)

### 0.1 The key finding: aihu verifies tokens; it mints none

GX's gate is real and fail-closed — and there is **no aihu-provided way to obtain the token
it demands**. Every credential-touching code path in the repo is verify-, decode-, or
carry-only:

- **`verifyJwt`** (`packages/auth/src/server.ts:125-147`) — HMAC-SHA-256 **verify** via
  `crypto.subtle.verify` (`:140`). The one place a key touches crypto. `importHmacKey`
  requests `['sign', 'verify']` usages (`server.ts:73-82`) — the `'sign'` usage is imported
  and **never used**. Grep for `crypto.subtle.sign`, `signJwt`, `mintToken`, `issueToken`
  across `packages/`, `apps/`, `examples/`, `cookbook/`: **zero hits**.
- **`createAuthRoutes`** (`packages/auth/src/routes.ts:61-155`) — the only auth endpoints
  aihu mounts (`/auth/sign-in`, `/auth/sign-out`, `/auth/refresh`, wired by the `auth()`
  plugin's middleware contributions, `auth-plugin.ts:60-76`). `signIn` reads a
  **caller-supplied** `{ token }` body and `Set-Cookie`s it (`routes.ts:85-96`); `refresh`
  is the same swap (`:137-148`). Neither mints. Neither even **verifies** the token it
  cookies — any non-empty string becomes the session cookie, and verification happens only
  later, per-request, in `getAuthState` (`server.ts:175`). (Defect flagged → P7, §8.)
- **`decodeJwt`** (`packages/auth/src/jwt.ts:27-60`) — decode-only by design; its module
  docstring punts issuance outright: *"use a trusted JWT library or your IdP's SDK when you
  need full signature verification"* (`jwt.ts:5-6`). The middleware pair
  (`requireAuth`/`requireScope`, `middleware.ts:47,71`) and the legacy `createAuthPlugin`
  (`plugin.ts:37-47`) are decode-only consumers.
- **`createVerifiedAuthPlugin`** (`verified-plugin.ts:45-58`) — wraps `verifyJwt` for the
  agent-service gate (`agent-service.ts:194-269`, runGate step 2). Verify path, not mint.
- **False docstrings, mirroring critique §0.3's pattern:** `AuthConfig.jwtSecret` claims
  "HMAC-SHA-256 secret for JWT **signing**/verification" (`types.ts:40`) and
  `verified-plugin.ts:25-27` claims it is "the same secret the `auth()` routes **sign**
  with" — no aihu route signs anything. The docs describe the issuer aihu doesn't have.

There is **no `/authorize` endpoint, no `/token` endpoint, no consent surface, and no
API-key facility** anywhere in the repo. The assumed issuer is an external IdP the operator
brings.

### 0.2 What backs the discovery URLs: nothing aihu provides

The declaration/enforcement half already *points* refused agents somewhere. Both pointers
point off-framework:

- The gate's 401 envelope carries `authDiscoveryUrl` "(e.g. the deployment's
  `/.well-known/oauth-protected-resource`)" — **operator-configured, informational only,
  never a policy input** (`agent-service/src/types.ts:206-213`; envelope inclusion
  `agent-service.ts:67-70`). Nothing in aihu serves that well-known: grep for
  `oauth-protected-resource` finds only comments and type docstrings, and the server-card
  module says so in as many words — *"the former is this server's responsibility but we
  don't serve it"* (`mcp-server-card.ts:112-120`); compliance tests **assert** its absence
  (`tests/compliance/mcp-server-card-schema.test.ts:85-97`).
- The MCP server card's `auth.authorizationServer` is computed as
  `new URL(config.auth.tokenUrl).origin` (`mcp-server-card.ts:121-122`) from
  `McpAuthConfig.tokenUrl` (`plugin-agent-readiness/src/types.ts:11-21`) — an
  **operator-configured external authorization server**. aihu is not that server and
  deliberately synthesizes no RFC 8414 document for it (`mcp-server-card.ts:60-68`).

So the loop today is: gate refuses → 401 names a discovery URL → the URL is either unset,
or backed by an IdP outside the framework. For the thesis's *site-issued, site-verified,
deliberately local* credential (thesis:121-128), that external dependency is exactly what
must not be load-bearing. **This document designs the issuer.**

### 0.3 Claim validation (#457) — landed on main, not on this branch

`origin/main` commit `11e4ae51` (2026-07-20, after this branch's base) closes most of spec
P1 and all of P6: `verifyJwt` now validates `exp` (required by default), `nbf`, a
future-`iat` sanity bound, and `aud` when configured, behind
`VerifyJwtOptions { allowNoExpiry?, audience?, clockSkewSec? = 60, now? }`, inherited by
`VerifiedAuthPluginOptions extends VerifyJwtOptions` and mirrored on `AuthConfig`; the rate
limiter fails **closed** at `maxKeys` capacity (see `docs/plans/jwt-claims/build-manifest.md`
on main). Residual from P1: **token-type separation (`typ: 'agent'` / `act` claim)** —
unfinishable from the verify side alone, because only a minting path can *set* those
claims. It completes here (§4.2).

---

## 1. Scope and constraints

**What folds in:** the issuance half of the loop — discovery documents, human consent /
delegation, token + API-key minting, management, revocation — so that an author who writes
`extract: { read: { scope: 'reports:read' } }` has an aihu-provided path by which a
legitimate consumer obtains a credential the gate will accept.

**Hard constraints (thesis + founder):**

- **C1 — site-issued, site-verified.** The service mints and the service verifies. No
  external PKI, no global identity fabric, no dependency on unshipped standards
  (thesis:121-128: "deliberately local... the human is the discovery mechanism").
  OAuth-*shaped* — the RFC 9728/8414/7009 document shapes and the code+PKCE grant, because
  agents already speak them — never OAuth-the-federation: no client registration authority,
  no third-party issuer trust.
- **C2 — one trust root.** Minted tokens are HMAC-signed with the **same** `jwtSecret` the
  gate already verifies (`verified-plugin.ts:53` → `server.ts:125`) under the same #457
  claim validation. Issuance adds a `sign` call beside the existing `verify`; it adds no
  second verification path, no second key, no new principal type the gate doesn't already
  model.
- **C3 — attenuation only.** A minted credential's scopes are always **⊆ the delegator's
  own** (session scopes at consent time). Issuance can narrow authority, never widen it —
  the R3 doctrine ("never widens", spec §3) applied to the mint.
- **C4 — the loop realizes Tier 1 → Tier 2.** A human already authenticated on the site
  delegates *scoped, time-boxed* authority to their agent (Tier 1: "this agent acts for
  principal X, with scope Y"); the minted token carries the bounds and an audit handle
  (Tier 2: "within limit Z, time-boxed, auditable"). The scopes it carries are exactly the
  values GX's `call:` / `read: { scope }` axes enforce.

---

## 2. Credential taxonomy — three credentials, one verify path

| Credential | Who holds it | Form | Lifetime | Obtained via | Verified at |
|---|---|---|---|---|---|
| **Session** (exists) | Human, browser | JWT in `aihu_session` cookie | `maxAge` (default 24h, `types.ts:51`) | External IdP today; unchanged by this design | `getAuthState` (`server.ts:166`) |
| **Delegated agent token** (new — Tier 1/2) | The human's agent | JWT, `Authorization: Bearer` | Short (default OPEN — §10 F3; recommended 15 min access + refresh) | Consent flow: `/auth/authorize` → `/auth/token` (§4) | Same `verifyJwt` path via `AuthPlugin.verify` (`verified-plugin.ts:53`), gate step 2 (`agent-service.ts:194-269`) / GX `resolvePrincipal` (spec §4.1) |
| **API key** (new — non-interactive) | A server-side integration | Opaque reference `aihu_k_<id>.<secret>` (recommended — §10 F4), stored hashed | Long / unset, listable | Management surface `/auth/keys` (§5) | Key-store lookup branch in `resolvePrincipal`; resolves to the same `Principal` shape |

One deliberate asymmetry: delegated tokens are stateless JWTs (verify = crypto, fast,
revocation is the hard part — §6); API keys are **server-side references** (verify = store
lookup, inherently listable/rotatable/instantly revocable, and the secret at rest is a
hash, so a database read never yields a usable credential). Each form is the honest shape
for its lifetime.

---

## 3. Flow 1 — discovery: the 401 that leads somewhere

Mostly exists (spec §8 "existence advertising"); what changes is that the advertised URLs
become **real and aihu-served**, and the operator config becomes derivation:

1. **`GET /.well-known/oauth-protected-resource`** (RFC 9728) — NEW, served by the auth
   plugin when issuance is on (§7). Contains `resource` (site origin),
   `authorization_servers: [<site origin>]` — the site names **itself** — and
   `scopes_supported` **derived from the compiled scope census**: every `$scope` value in
   the agent-meta sidecar (`emit.rs:4388-4461`) plus every `extract` `{ scope }` value
   (spec §2). No hand-maintained scope list (thesis §Derived).
2. **`GET /.well-known/oauth-authorization-server`** (RFC 8414) — NEW: `issuer` = site
   origin, `authorization_endpoint: /auth/authorize`, `token_endpoint: /auth/token`,
   `revocation_endpoint: /auth/revoke`, `grant_types_supported:
   ["authorization_code", "refresh_token"]`, `code_challenge_methods_supported: ["S256"]`,
   same derived `scopes_supported`. The server-card's *"that document belongs on the
   authorization server, not on this MCP server"* (`mcp-server-card.ts:64-65`) stays true —
   the site now **is** the authorization server, so it serves it.
3. **The 401 pointer becomes derived.** `authDiscoveryUrl`
   (`agent-service/src/types.ts:213`) defaults to the site's own
   `/.well-known/oauth-protected-resource` when issuance is on (operator override kept).
   Same for GX's hard-tier `read` refusals: the AUTH_* ladder at the content gate (spec §5
   E3) carries the same pointer. Refused-agent UX: 401 → protected-resource doc →
   authorization-server doc → `/auth/authorize`. Self-navigable, no out-of-band knowledge.
4. **The server card stops pointing off-site.** `McpAuthConfig` gains a derived default:
   when issuance is on, `authorizationServer` is the site origin
   (`mcp-server-card.ts:121-122` reads it from config instead of requiring an external
   `tokenUrl`), and the compliance tests asserting the well-knowns are *absent*
   (`mcp-server-card-schema.test.ts:85-97`) invert for issuance-on fixtures.

Per-principal discovery (spec §8) is unchanged: anonymous discovery documents still name
no hard-read surface; the scopes census in the well-knowns is the *vocabulary*, not a map
of which surface requires which scope.

---

## 4. Flow 2 — human consent / delegation ("steer your assistant")

The founder flow, concretely. Precondition: the human has a verified session on the site
(cookie → `getAuthState`, `server.ts:166`). The agent has hit a 401 (or the human starts
from a "connect your assistant" page) and knows the authorize URL from §3.

### 4.1 `GET /auth/authorize` — the consent surface

Parameters (OAuth-code-shaped, public client, PKCE mandatory):

- `client_id` — a **free-form agent identifier** (e.g. `"Claude"`, `"acme-crm-bot"`).
  There is no client registration and no client secret — deliberately (C1): the human
  approving *this* request is the registration. The value is recorded for audit and shown
  on the consent screen; it is never a trust input.
- `scope` — space-separated, validated against the compiled census (§3.1); unknown scopes
  are a 400, not a silent grant.
- `code_challenge` + `code_challenge_method=S256` — binds the code to the agent that asked.
- `ttl` — requested token lifetime, clamped to the operator's configured maximum.
- Delivery: `redirect_uri` (standard code flow) **or** none — in which case the approved
  code is **displayed to the human** to paste back to their agent, and `/auth/token`
  accepts it from the poll/paste path. Agents steered by a human frequently have no
  redirect endpoint; the display-code mode is the device-grant (RFC 8628) shape kept
  deliberately local. (Both modes ship; neither is a founder decision — the consent step
  is identical.)

What the human sees (requires the session; anonymous hit → the site's normal sign-in, then
back): **"⟨client_id⟩ requests: ⟨scope list with human descriptions⟩ — for ⟨TTL⟩"** with
approve/deny. Scope descriptions derive from the census + authored `describe:` text — the
same derived source the MCP tool descriptions use (`mcp-server-card.ts:154-161`); a consent
screen whose scope list could drift from the enforced vocabulary would be a "kept in sync"
seam, which the thesis names a defect (thesis §Derived). Deny → the agent's poll/redirect
gets `access_denied`; nothing minted.

On approve: a **single-use authorization code** (opaque, ~60 s expiry, bound to
`code_challenge`, recording: delegator `sub`, granted scopes — already intersected with the
session's own scopes per C3 — TTL, `client_id`).

### 4.2 `POST /auth/token` — the mint

- `grant_type=authorization_code` + `code` + `code_verifier` → verify PKCE, burn the code,
  and **mint** (§5's `signJwt`):

  ```jsonc
  {
    "sub": "<the delegating human's sub>",   // authority derives from the person
    "act": { "sub": "<client_id>" },          // RFC 8693-shaped actor: WHO wields it
    "typ": "agent",                           // token-type separation — completes P1
    "scope": "reports:read",                  // ⊆ delegator's scopes ∩ requested (C3)
    "aud": "<site origin>",                   // #457 audience check now has a value
    "iat": ..., "exp": ...,                    // the requested/clamped TTL
    "jti": "<family id>"                      // audit + revocation handle (§6)
  }
  ```

  Response: `access_token`, `expires_in`, `refresh_token` (opaque, server-side family
  record), `scope`. This is Tier 1 (sub + act + scope) and Tier 2 (exp + jti + the
  member-declared `$rate-limit` budget the gate already enforces per verified `sub`,
  `agent-service.ts:315-333`) in one object.
- `grant_type=refresh_token` → rotate: new access token, new refresh token, old refresh
  invalidated; **reuse of a rotated refresh token revokes the family** (the standard
  theft-detection tripwire, and the durable revocation point of §6).

The session-verify path never accepts `typ: 'agent'` tokens as sessions and the agent path
requires `typ: 'agent'` for `act`-bearing tokens — the two credential populations cannot
impersonate each other (this is the P1 residual, closed at mint + checked at verify).

### 4.3 Presentation and enforcement (exists — unchanged)

The agent presents `Authorization: Bearer <access_token>`. Verification is the **same
HMAC + #457 claims path** GX already specifies: `AuthPlugin.verify`
(`verified-plugin.ts:53`) → `verifyJwt` (`server.ts:125`), consumed by runGate step 2
(`agent-service.ts:194-269`) for the `call` axis and by `resolvePrincipal` /
`decideEmission` (spec §4.1) for the `read` axis. Scope meets (`agent-service.ts:275-286`;
spec §3 R1) and rate-limit keying (`:315-333`) operate on the verified claims. Nothing in
the enforcement half changes because issuance exists — that is C2 working.

---

## 5. Flow 3 — non-interactive issuance: API keys, and the minting primitive

### 5.1 The minting function `@aihu/auth` gains

```ts
// packages/auth/src/server.ts — the dual of verifyJwt, same module, same key
export async function signJwt(
  claims: Record<string, unknown>,   // sub required; iat/exp filled from options
  secret: string,
  options?: SignJwtOptions,          // { expiresInSec, audience?, notBefore?, now? }
): Promise<string>
```

Server-only export (`server-index.ts:12` gains it), HMAC-SHA-256 via `crypto.subtle.sign`
using the already-imported key (`importHmacKey`'s unused `'sign'` usage,
`server.ts:73-82`). Invariants at mint, not left to callers: `exp` always set unless the
caller passes an explicit no-expiry override mirroring #457's `allowNoExpiry` posture;
round-trip property `verifyJwt(await signJwt(c, s), s)` succeeds with the same options.
The issuance endpoints (§4.2) and any app-level custom issuance both go through this one
function — grep for `crypto.subtle.sign` should find exactly one call site, permanently.

### 5.2 API keys (server-to-server, listable)

Management surface (session-authenticated, human-only — an agent token cannot mint keys;
minting authority is not delegable, another face of C3):

- `POST /auth/keys` `{ name, scopes, expiresAt? }` → returns `aihu_k_<id>.<secret>`
  **once**; stores `{ id, hash(secret), sub: creator, scopes ⊆ creator's, name, createdAt,
  expiresAt?, lastUsedAt, revokedAt: null }`.
- `GET /auth/keys` → list (id, name, scopes, timestamps — never the secret).
- `DELETE /auth/keys/:id` → revoke, effective on the key's next use.

At the gate: `resolvePrincipal` (spec §4.1) gains one branch — a Bearer value with the
`aihu_k_` prefix resolves through the key store (constant-time hash compare) to the same
`Principal` shape a JWT yields; unknown/revoked/expired key → anonymous, exactly like an
invalid JWT (spec §4.1: "verification failure never yields more access than sending
nothing"). Recommended form is the opaque reference, not a JWT — founder call §10 F4.

---

## 6. Revocation — the design, and its honest cost

JWTs are stateless: a signed token is valid until `exp` no matter what the server later
wishes. GX's honest ceiling names the revocation story a **prerequisite of the hard tier**
(spec §11 P2: "hard until the first leak, then permanent" otherwise). The design is two
layers with the cost stated, not hidden:

**Layer 1 — expiry is the floor (no verify-path cost).** Access tokens are short-lived
(default OPEN — §10 F3; recommended 15 min). Continued access rides refresh rotation
(§4.2), and **refresh is the durable revocation point**: the family record is server-side
state, so "revoke this delegation" = kill the family = the agent is out within one access
TTL, with zero added work on the per-request verify path. Sessions revoke by cookie
expiry/sign-out as today; API keys are store-backed and revoke instantly by construction
(§5.2).

**Layer 2 — the revocation check on the verify path (opt-in, required for the hard
tier).** A `RevocationStore` consulted **after** signature + claims pass, keyed by `jti`
family (delegated tokens) / key id:

- Check point: inside the gate's principal resolution — concretely, the
  `createVerifiedAuthPlugin.verify` seam (`verified-plugin.ts:53-56`) gains a post-verify
  store consult, so **both** consumers (runGate step 2, `agent-service.ts:194-269`, and
  GX's `resolvePrincipal`) inherit it from the one plugin, preserving the
  one-implementation posture of spec §4.1. `getAuthState` (`server.ts:175`) gains the same
  consult for sessions when a store is configured.
- Revocation surface: `POST /auth/revoke` (RFC 7009-shaped; accepts the token or a family
  id; authorized by the delegator's session — or the token itself, self-revocation being
  always safe), plus a human management page listing active delegations ("Claude —
  reports:read — expires in 12 m — [revoke]") from the family records.
- **Fail direction: closed.** Store configured but unreachable → deny, matching #457's
  rate-limiter posture and G-series doctrine (a control that cannot answer does not
  answer "yes").

**The honest cost, stated plainly (D2 discipline):** Layer 2 makes verification no longer
pure computation — **one store read on every governed request**, on the serving path's
latency budget, and a new stateful operational dependency for the hard tier. With the
default in-process store the check is per-instance — the same per-process honesty as the
rate limiter (survey §1 #8, `rate-limiter.ts:64`) — so cross-instance revocation still
propagates only at access-TTL speed unless the operator configures a shared store.
Without Layer 2 at all, "revoked" honestly means: *dead at the refresh boundary, dying
everywhere within one access TTL.* Docs must say exactly that; which layer the hard tier
*requires* is founder decision §10 F1.

---

## 7. The operator/authoring shape — issuance is declared, like everything else

Issuance turns on where auth already lives — the `auth()` plugin (`auth-plugin.ts:40`) —
one declaration, everything in §3–§6 derived from it (mirroring how `extract:` made
extractability declarative):

```ts
// aihu.config.ts
auth({
  jwtSecret: env.JWT_SECRET,
  issue: {
    delegation: true,          // /auth/authorize + /auth/token + consent surface (§4)
    apiKeys: true,             // /auth/keys management (§5.2)
    accessTtlSec: 900,         // defaults OPEN — §10 F3
    refreshTtlSec: 1_209_600,
    maxDelegationTtlSec: 86_400,
    revocation: 'memory',      // RevocationStore | 'memory' | undefined (Layer 1 only)
  },
})
```

Declaring `issue:` fans out (spec §8's derivation map gains these rows): the two
well-knowns (§3.1–.2) + `scopes_supported` from the census; the `/auth/authorize`,
`/auth/token`, `/auth/revoke`, `/auth/keys` routes via the same
`contributes.middleware` surface the three existing auth routes use
(`auth-plugin.ts:60-76`); the derived `authDiscoveryUrl` default on the gate and the
content-gate 401s (§3.3); the server-card auth block (§3.4); the consent surface's scope
descriptions. No `issue:` block → byte-identical to today: no endpoints, no well-knowns,
externally-issued tokens keep verifying exactly as now (C2 — additive, zero migration).

**Consent surface: first-class, app-replaceable (recommended — founder call §10 F2).**
The plugin serves a default consent page (unstyled-but-complete, in the site's document
shell); an app may replace the *presentation* via a documented slot, but the scope list,
descriptions, TTL display, and approve/deny POST contract are plugin-supplied. Rationale:
the consent screen is a security surface whose content must equal the enforced vocabulary
— scaffolding it into the app creates the exact "kept in sync" seam the thesis calls a
defect report (thesis §Derived), and a stale scaffold lies to the human at the moment of
delegation. Scaffold-and-own remains the counter-position for full brand control; flagged,
not decided.

---

## 8. Additions to Phase 0 (spec §11) surfaced by this investigation

| # | Prerequisite | Anchor |
|---|---|---|
| P1 (update) | `exp`/`nbf`/`aud` + skew **landed on main** (#457, commit `11e4ae51`; `VerifyJwtOptions`); **residual: `typ:'agent'`/`act` separation — closes at the mint (§4.2), so it moves from Phase 0 into the issuance phase** | §0.3 |
| P2 (superseded) | "Revocation story" is no longer a bare prerequisite: it is **designed** (§6); the open founder call is which layer the hard tier requires (§10 F1) | §6 |
| P6 (update) | Rate limiter fail-closed at capacity **landed on main** (#457); per-process scope note stands | §0.3 |
| **P7 (new)** | `/auth/sign-in` and `/auth/refresh` cookie **caller-supplied tokens without verifying them** (`routes.ts:85-96`, `:137-148`) — verify-before-Set-Cookie, else the session channel accepts arbitrary strings and every later `getAuthState` pays for it | §0.1 |
| **P8 (new)** | False issuer docstrings corrected (`types.ts:40`, `verified-plugin.ts:25-27`) — same class as P1's false-docstring item | §0.1 |

---

## 9. Invariants — the loop closes only if it stays closed

Extending spec §10's fixtures (`check:governed` pattern, `scripts/check-governed.ts:131`):

- **G6a — round trip:** `signJwt` → present → `runGate`/`resolvePrincipal` admits with
  exactly the minted scopes; one scope short → `SCOPE_DENIED`.
- **G6b — attenuation:** consent with a session lacking scope `x` can never mint a token
  bearing `x` (C3, probed not assumed).
- **G6c — type separation:** a `typ:'agent'` token presented as a session cookie →
  anonymous; a session JWT presented as Bearer on an `act`-required path → refused.
- **G6d — revocation:** family revoked → next verify (Layer 2) or next refresh (Layer 1)
  refused; store unreachable → deny (fail-closed).
- **G6e — PKCE/one-shot:** code replay and wrong-verifier exchange both refuse; codes
  expire.
- **G6f — discovery agreement:** issuance-on fixtures serve both well-knowns;
  `scopes_supported` ≡ the compiled census ≡ the consent screen's list (three-way, DA-f2
  style); issuance-off fixtures serve neither and the 401 carries no derived pointer.
- **G6g — secret hygiene:** `/auth/keys` GET never returns a secret; key at rest is a
  hash; minted responses carry `Cache-Control: no-store`.

---

## 10. Founder decisions — flagged, NOT decided (fold into 41's register)

| # | Decision | Options (recommendation marked) |
|---|---|---|
| **F1** | **Revocation requirement for the hard tier** | (a) Layer 1 only — TTL + refresh-family kill; zero verify-path cost; revocation lag ≤ access TTL. (b) **Layer 2 required for hard-tier surfaces** — per-request store consult, fail-closed (recommended: the honest ceiling already says the hard tier is as strong as the credential). (c) Layer 2 with shared store required — full cross-instance immediacy, heaviest operational floor. |
| **F2** | **Consent surface ownership** | (a) **First-class plugin-served, presentation-replaceable (recommended — §7 rationale: derivation, no drift at the moment of delegation).** (b) Scaffolded-and-app-owned — full brand control, accepts the sync seam. |
| **F3** | **Default TTLs** | Access token (recommended 15 min), refresh (recommended 14 d), max delegation TTL a human may grant (recommended 24 h), API-key default (recommended non-expiring, listed + revocable). Numbers are policy, not architecture — founder's call. |
| **F4** | **API-key form** | (a) **Opaque server-side reference, hashed at rest (recommended — instant revocation, listable, DB leak yields no credential).** (b) Long-lived JWT under `allowNoExpiry` — stateless verify, but revocation degrades to Layer 2 and a leak is permanent-until-denylisted. |

Everything else in this document composes from already-ratified D1–D3 + the thesis's
Attribution tiers and requires no new ratification beyond the amendment text in `41`.
