---
'@aihu/router': patch
---

Fix a stored-XSS gap in the SSR loader embed: `<script type="application/json"
id="__aihu_loader__">` interpolated `JSON.stringify(data)` directly, on both
the governed and ungoverned response paths in `packages/router/src/server.ts`.
`JSON.stringify` does not escape `<`/`>`, so route data containing a literal
`</script>` closed the embed early and turned everything after it into live
DOM — the exact CWE-79/94/116 vulnerability class `router-codegen-escaping.md`
already fixed at build time in `vite-plugin.ts`, present at runtime too, and
missed by that sweep because these two sinks are a sibling package (`@aihu/server`
data flowing through `@aihu/router`'s request handler), not a codegen emitter.

**Why this one is live, unlike the codegen sinks.** This branch's SSR work
newly wires loaders to real platform bindings (D1/KV/R2) via `PlatformContext`,
so `emission.data`/`loaderData` can now carry stored, non-developer-authored
content — a comment, a title, anything round-tripped through a database. A
single field containing `</script><img src=x onerror=alert(1)>` is live markup
in the response the instant that route is requested. `packages/app/src/head-apply.ts`
already documents the concern for its own script-tag path ("no `</script>`
escaping needed, unlike the string path" — this is that string path).

Both sinks now use `jsSourceLiteral()` (the escaper `router-codegen-escaping.md`
built for the build-time generators) instead of `JSON.stringify`. `\uXXXX`
escapes round-trip through `JSON.parse` unchanged, so the client-side loader —
which reads `#__aihu_loader__`'s `textContent` and parses it — receives
byte-identical data; nothing on the client needed to change.

**Verified.** Reproduced the breakout against the pre-fix code (a payload
containing `</script><img ...>` survives verbatim in the response body) and
confirmed the fix neutralizes it while the parsed payload is unchanged.
Regression-tested end to end through `createServerRouter(...).handle()` on
both the governed and ungoverned arms (`packages/router/tests/governed-handle.test.ts`,
new `G7k` describe block) — mutation-tested: reverting the fix turns both new
tests red for exactly this reason, restoring it turns them green. Full
`packages/router`/`packages/app`/`packages/server` suites (811 tests) and the
real-built-Worker `workers-ssr-e2e` harness (23 tests) all pass.

Grepped for other `__aihu_loader__` write sites — these are the only two.
