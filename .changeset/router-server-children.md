---
'@aihu/router': minor
---

Forward the child-component registry on both server render paths.

`createServerRouter` forwarded `lightScopeId` to `renderToString` and nothing
else, so every request-time SSR consumer rendered a component reference as an
empty element with no diagnostic — the failure the child work exists to remove,
left behind at the live-SSR edge while SSG got the fix. `ServerRouterOptions`
gains `children`, typed as `buildChildRegistry`'s own return type:

```ts
const children = buildChildRegistry(discovered)
export default createServerRouter(routes, { children })
```

A resolved `Map` rather than a loader, because `__aihu_schild` runs inside the
compiled string fast path, which is synchronous — awaiting belongs at module
init, once. Both the governed and ungoverned arms forward it: child rendering
must not depend on whether a route happens to declare `extract`.

Omitting it is byte-identical to before.

**Scope, stated because it is easy to overestimate.** This closes the
forwarding hole and nothing more. It does not by itself give any shipped
adapter non-empty children: `@aihu/adapter-cloudflare` and `-vercel` emit their
entry as a raw string at `closeBundle` (so it never enters Vite's module
graph), wire `createRequestRouter` rather than this function, and give every
route a `notFound` placeholder — they render nothing at all today. A consumer
also still needs a way to BUILD the map on the server. That is a separate piece
of work.
