---
'@aihu/app': minor
'@aihu/router': patch
---

`output: 'ssr'` now serves a full document, so an SSR route actually hydrates.

The response body was a bare fragment: no doctype, no `<html>`, no `<head>`, no
`<title>`, and — the part that mattered — no client `<script type="module">`. A
deployed Worker painted server-rendered markup and then stopped. No hydration,
no interactivity, no SEO tags, and nothing in the build said so.

`renderToString`'s own document wrapper is gated on `SsrOptions.head`, which
neither `handle()` arm passes, and passing it would not have helped: `buildHead`
has no facility for `<script src>` at all (`ScriptTag` is `{ type, content }`).
Meanwhile the SSG path had solved this from the start by never computing a
document — it reads the finished client `dist/index.html`, which already carries
Vite's hashed entry script, and splices the render into the outlet. The only
missing input was that nothing passed that template into the server bundle.

A new `virtual:aihu-ssr-document` inlines the built `index.html` into the Worker
(the client environment builds first, so the file is on disk when the `ssr`
environment's `load()` runs), and the generated `virtual:aihu-server-entry`
splices each rendered fragment into it. `@aihu/app/ssr-document` is a new pure,
Worker-safe entry holding the splice — the SAME function the SSG prerender now
calls, so the two paths cannot drift.

The wrap lives in the generated entry rather than in `createServerRouter` on
purpose. The template is a BUILD ARTIFACT, and the only thing that knows about
build artifacts is the Vite plugin that generates the entry. `handle()` is
therefore byte-identical for every existing consumer — adapters, hand-wired Node
servers, the SSG path — and `@aihu/server` is untouched.

Only `text/html` responses are wrapped. A 404, a 500 and the E3 governed-data
endpoint pass through as the same object, which is what keeps an adapter's
`status !== 404 → env.ASSETS.fetch(request)` fallthrough serving the very bundle
the document now references.

Per-route `<head>` lands with it: the matched route's compiled `head` is lowered
through the same `routeHeadToSsrHead` + `applyHeadToHtml` pair the SSG and
client-navigation paths use, folded under `app.head` and resolved against
`site.url`. It is memoised per route pattern, so the per-request cost is a map
lookup.

**`app.outletId` is new, and it fixes a latent SSG bug.** `runPrerender`
hardcoded `const outletId = 'outlet'` while its splice already took the id as a
parameter — and `AihuConfig` had no `outletId` key at all, so the only way to
move the outlet was `createApp({ outletId })` in a hand-written `src/main.ts`,
which the prerender never sees. Any project that did so got a client mounting
one element and a prerender splicing another: every prerendered page shipped
with its content dropped, silently. `app.outletId` is now read by the prerender,
by the SSR splice, and by the virtual client entry (`createApp({ outletId })`),
so one value drives all three. It is verified on a NON-DEFAULT value in both
paths — against the default, hardcoding and resolving are indistinguishable.

A splice that finds no matching element now says so instead of returning the
template unchanged, on both paths. That silence is how the bug above survived.

A missing client `index.html` FAILS the `ssr` build rather than degrading. The
degraded outcome is a green build, a successful deploy and a site that never
hydrates — the exact defect this change removes.
