---
'@aihu/auth': minor
---

Security hardening (GX Phase 0): `createAuthRoutes` now verifies tokens before setting the session cookie.

- The sign-in and refresh routes verify the posted token with `verifyJwt` (HMAC signature plus the registered-claim validation from #457: `exp` required by default, `nbf`, and `aud` when `AuthConfig.audience` is set) BEFORE it is set as the session cookie. An unverifiable token is rejected with 401 and no `Set-Cookie` header. When `jwtSecret` is empty the routes fail closed (500, no cookie).
- Docstring corrections: `AuthConfig.jwtSecret` and `VerifiedAuthPluginOptions.jwtSecret` no longer imply aihu signs or issues JWTs. aihu verifies tokens; issuance is not yet provided (planned for the GX issuance phase).

Behavior change: previously the routes accepted any `{ token }` body and cookied it as-is; tokens must now be signed with the configured `jwtSecret` and carry valid registered claims. This matches what `getAuthState` already required to honor the cookie.
