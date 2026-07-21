# GX Phase 0 — auth-route hardening

Pre-work for the Governed Extractability issuance layer: the auth-route
surface must be trustworthy before tokens are ever minted onto it. Two
defects found during design review, fixed here.

## P7 — routes cookied a token without verifying it

**Defect.** `createAuthRoutes` (`packages/auth/src/routes.ts`) read
`{ token }` from the request body and set it directly as the session cookie.
Neither the sign-in nor the refresh handler called `verifyJwt`, so the
Set-Cookie header carried whatever string the caller posted. The docs
(`apps/docs/.../auth.md`) already described the sign-in handler as verifying
the token — the code did not match the docs. `getAuthState` verified the
cookie on later reads, but the route itself persisted an unverified
credential.

**Fix.** Both cookie-setting handlers (sign-in, refresh) now share one path
that verifies the token before cookieing it:

- `verifyJwt` (the same trust root used by `getAuthState` and
  `createVerifiedAuthPlugin`) checks the HMAC-SHA-256 signature and the
  registered claims from #457 — `exp` (required by default), `nbf`, and
  `aud` when `AuthConfig.audience` is configured.
- An unverifiable token → **401, no Set-Cookie**.
- Empty/missing `jwtSecret` → **500, no Set-Cookie** (fail closed; nothing
  can be verified without a trust root).

## P8 — docstrings implied aihu signs/issues tokens

**Defect.** `AuthConfig.jwtSecret` (`types.ts`) was documented as the secret
"for JWT signing/verification", and `VerifiedAuthPluginOptions.jwtSecret`
(`verified-plugin.ts`) as "the same secret the `auth()` routes sign with".
aihu has no signing path — only `crypto.subtle.verify` exists today.

**Fix.** Both docstrings now state that aihu verifies tokens and does not
sign or issue them; tokens come from the caller's identity provider signed
with the shared secret. Issuance arrives in the GX issuance phase.

## Blast radius

`createAuthRoutes` is exported from `@aihu/auth/server`
(`src/server-index.ts`) and referenced by:

- `packages/auth/tests/m2.test.ts` — its route tests (updated; see below).
- `apps/docs/src/content/docs/packages/auth.md` — already described the
  verified behavior; now accurate.
- `docs/specs/plugin-install-manifest.md` — names the factory as an example
  of the `add-route` wiring pattern only.

No example app or scaffold in-repo wires the routes today. Migration impact
for external users: the sign-in/refresh body token must now be a JWT signed
with the configured `jwtSecret` and carrying valid registered claims —
i.e. the same token `getAuthState` already required to honor the session.

## Test mapping (`packages/auth/tests/m2.test.ts`)

| Case | Test |
|---|---|
| Forged/unsigned token → 401, no cookie | `signIn rejects an unsigned/forged token with 401 and sets NO cookie` |
| Wrong-secret signature → 401, no cookie | `signIn rejects a token signed with the wrong secret (401, no cookie)` |
| Opaque non-JWT string → 401, no cookie | `signIn rejects a non-JWT opaque string (401, no cookie)` |
| Expired token (#457 claims) → 401, no cookie | `signIn rejects an expired token (401, no cookie) — #457 claim validation` |
| Future-`nbf` token → 401, no cookie | `signIn rejects a not-yet-valid (future nbf) token (401, no cookie)` |
| `aud` mismatch → 401; matching `aud` → cookied | `signIn enforces configured audience (401 on mismatch, no cookie)` |
| Refresh: forged → 401, no cookie | `refresh rejects a forged token with 401 and sets NO cookie` |
| Refresh: expired → 401, no cookie | `refresh rejects an expired token (401, no cookie)` |
| No secret configured → fail closed | `fails closed when no jwtSecret is configured (500, no cookie)` |
| Valid signed token → 200 + cookie | `returns 200 and sets cookie on a validly-signed token body` (sign-in), `returns 200 and updates the session cookie for a validly-signed token` (refresh) |

The three pre-existing route tests that posted opaque strings were updated
to post signed JWTs. #457's claim-validation suite
(`jwt-claims.test.ts`, 24 tests) is unchanged and still passes.
