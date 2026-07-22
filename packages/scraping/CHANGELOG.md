# @aihu/scraping

## 0.2.0

### Minor Changes

- [#457](https://github.com/fellwork/aihu/pull/457) [`11e4ae5`](https://github.com/fellwork/aihu/commit/11e4ae5165dedb23edb4a37e7bc4300eec6212e0) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Security hardening: JWT verification now enforces registered claims, and the rate limiter fails closed at capacity.

  - `@aihu/auth` (minor): `verifyJwt` (and therefore `createVerifiedAuthPlugin` and `getAuthState`) validates registered claims after the signature check: `exp` is now REQUIRED and enforced (a token without `exp` is rejected unless the service opts in via `allowNoExpiry: true`), `nbf` is enforced, a wildly future `iat` is rejected, and `aud` is enforced when an expected `audience` is configured. A configurable clock-skew leeway (`clockSkewSec`, default 60s) absorbs minor clock drift. New options surface on `VerifyJwtOptions`, `VerifiedAuthPluginOptions`, and `AuthConfig`. All failures return `null`, which the agent-service gate maps to 401 `AUTH_INVALID` (fail-closed).
  - `@aihu/scraping` (minor): `createRateLimiter` now DENIES a call it cannot positively account for — a new key when the key map is at `maxKeys` capacity, or an internal error — instead of allowing it. Under-limit behavior is unchanged. The store remains per-process; distributed accounting is a separate concern.

  Behavior change: tokens without `exp` (previously accepted forever) are now refused unless `allowNoExpiry` is explicitly set — this is the security fix.
