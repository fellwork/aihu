---
'@aihu/app': patch
---

Give the `output: 'ssr'` request path an error boundary, and make the server
child/layout registries degrade per entry instead of all-or-nothing. Both are
the same failure shape — a rejected promise where an HTTP response should be —
and either one alone leaves the other's outage intact.

**Nothing on the render chain caught anything.** Neither
`@aihu/router/server`'s `handle()`, nor the generated `handler` in
`virtual:aihu-server-entry`, nor `@aihu/adapter-cloudflare`'s `fetch` wrapper
wrapped `route.module()`, `mod.loader()` or `renderToString` in a try/catch. A
throw anywhere on that chain therefore rejected the Worker's `fetch` promise,
and Cloudflare answers a rejected fetch with **error 1101: no status, no body,
no response at all** — not a 500. Nothing a browser, a monitor or a
`wrangler tail` can act on.

This was known and documented rather than fixed. `workers-ssr-e2e.test.ts`
assertion 17 already recorded measuring it ("the throw propagates out of the
fetch handler and the request gets NO RESPONSE") and closed the one *cause* it
had in front of it — a DOM access in a setup body — leaving the missing
boundary open for every other cause.

**Reproduced against a real built Worker, then fixed.** A new fixture page
throws from its `@state` block, i.e. from inside `renderToString`, the deepest
point on the chain. Before: `Error: E2E-BOOM` thrown out of `mod.default.fetch`
— `fetchThrough` itself rejected. After: `500` `text/plain`
`Internal Server Error`.

**The boundary is in the generated `handler`, and the layer was chosen, not
defaulted.** Three could hold it:

| layer | why not |
| --- | --- |
| `handle()` (`@aihu/router/server`) | a runtime library a consumer wires by hand; callers legitimately want the throw. Also insufficient — `__getRouter()` and the document wrapper sit outside it and both can throw |
| an adapter's `fetch` wrapper | per-adapter. Cloudflare, Vercel and every community adapter need their own copy, and an `output: 'ssr'` build with **no** adapter falls back to the bare `handler` export with no boundary at all |
| the generated `handler` | the one place every `output: 'ssr'` build passes through, directly beneath the platform entry point |

Two details are load-bearing. The response is `text/plain`, which is what
`createSsrDocument`'s `isHtml` gate passes through unwrapped — an HTML 500 would
be spliced into the client template and served as a document. And it is a `500`,
not a `404`, so the Cloudflare wrapper's ASSETS fallthrough does not mask a
broken route with a `200` SPA shell. The body is generic and the error is
logged, never served: a thrown value here can carry a query string, a binding
name or a build-time filesystem path. `return await`, not `return` — a bare
`return` of a promise resolves the try block before the promise settles and the
rejection escapes.

**The registries were all-or-nothing, and permanently sticky.** `__buildRouter`
resolved both with `await Promise.all(…)` over `await load()`, so ONE component
module that throws on import rejected the whole build — every other component
lost with it. `__getRouter()` memoises the promise (correctly, for reasons its
docblock gives), so the isolate then answered nothing to **every** request for
its entire life. Compounded with the missing boundary: one 1101 per request
until Cloudflare recycles it.

`eca2ab46` fixed one specific *cause* of a child import throwing
(`@aihu/primitives` evaluating `class … extends HTMLElement` at module scope).
A different module throwing for a different reason still took everything down.

Both loops now catch per entry: a failing component or layout logs a named
warning and is SKIPPED, matching `__aihu_schild`'s established degrade-to-empty
posture for a child it cannot render, and `withLayout`'s for a layout not in the
map. Verified with a new `poison` build variant that injects one unloadable
entry into each registry while leaving every real one intact. Before:
`fetchThrough` rejected with `E2E-POISON…` and nothing rendered. After: `200`
with every real component and the layout composed, the poisoned pair the only
thing missing.

The sticky rejection is deliberately unchanged, and is now *more* clearly
correct: with per-entry catches the only things that can still reject are
`buildChildRegistry` and `createServerRouter`'s boot validation — pure functions
of the build, which genuinely cannot succeed on a retry. And a sticky rejection
is no longer a dropped request, because `handler` catches it.

Pinned by 10 new assertions in `workers-ssr-e2e.test.ts` against real
`vite build` output, including that the 500 leaks neither message nor stack,
that it is not re-served from ASSETS, and that one throwing route does not
poison the isolate for the others.
