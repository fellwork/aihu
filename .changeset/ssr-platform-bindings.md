---
'@aihu/agent-service': minor
'@aihu/adapter-cloudflare': minor
'@aihu/router': minor
'@aihu/server': minor
'@aihu/app': minor
---

Thread the host runtime's per-request platform context into live SSR.

`ServerRouter.handle(req)` took a `Request` and nothing else, so a Cloudflare
Worker's `env` — the KV namespaces, D1 databases, R2 buckets, Durable Object
stubs and secrets — was unreachable from a page render. Those values exist ONLY
per request; there is no module-scope handle a loader could have closed over, so
a route loader on a Worker had exactly one data source: the public internet.

`handle(req, platform?)` now forwards an opaque, adapter-supplied value to every
consumer that can act on it:

- plain route loaders, as a second argument `{ request, url, platform }` (which
  also gives a loader the request and query string for the first time)
- the governed provider's `fetch` and `preview`
- the live entitlement resolver (`EntitlementContext.platform`)
- the host-verified session resolver (`GovernedRequestAuth.resolveSession`)
- the E3 `/__aihu/data/*` transport, so it and SSR still reach the same sources

The framework never reads inside the value, and its type is `unknown` — an
augmentable interface with an index signature was rejected because TypeScript
gives interfaces no implicit index signature, so `wrangler types`' generated
`interface Env` would not have been assignable. `@aihu/adapter-cloudflare`
passes `{ env, ctx }`, so both bindings and `waitUntil` are reachable.

`handle(req)` with no platform is unchanged: every consumer receives no
`platform` key at all, which is the state they were already in.
