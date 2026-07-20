---
'@aihu/agent-service': minor
'@aihu/auth': minor
'@aihu/agent-server': minor
---

Security fix (#420): rate-limit keys and scope checks derive from a signature-VERIFIED JWT principal.

Rate-limit keys were `${userId}:${tag}` with `userId` caller-supplied over MCP and never cross-checked against the JWT `sub`, so a caller reset its own quota by rotating `userId`; the scope check likewise consulted unverified claims, so a forged `scope` claim bypassed `$scope`.

- `@aihu/agent-service` (minor — optional interface member): `AuthPlugin.verify?(jwt) → Promise<VerifiedClaims | null>` is the single verified-claims source for BOTH the rate-limit key (`sub:tag`) and the scope gate; the gate is now async end-to-end and FAILS CLOSED (401) when a scoped/rate-limited tool meets a plugin that cannot verify. New `authDiscoveryUrl` option: 401 envelopes carry the deployment's auth-discovery URL so refused agents know where to obtain a credential.
- `@aihu/auth` (minor): `@aihu/auth/server` exports `verifyJwt` and `createVerifiedAuthPlugin({ jwtSecret })` — the `crypto.subtle` HMAC path backing `verify`. The decode-only `createAuthPlugin` remains but cannot serve scoped/rate-limited tools.
- `@aihu/agent-server` (minor): the MCP boundary forwards only the `jwt` credential from caller-supplied `context`; caller identity (`userId`) is dropped, never forwarded as authoritative. `authDiscoveryUrl` is threaded through and surfaced in MCP 401 error text.

Behavior change: callers that relied on caller-supplied identity to satisfy scoped/rate-limited tools (i.e. spoofing callers, or deployments without a verifying auth plugin) are now refused with 401 — this is the security fix. Un-scoped, un-rate-limited tools are unaffected.
