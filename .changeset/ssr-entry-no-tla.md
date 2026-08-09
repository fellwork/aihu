---
'@aihu/app': patch
---

Fix `output: 'ssr'` emitting a Worker that can never be loaded, by removing the
module-scope top-level await from `virtual:aihu-server-entry`.

The entry resolved both registries — the child-component registry and the
layout registry — with `await` at module scope. That makes `_worker.js` an ESM
**async module**, and vite/rollup hoists the shared runtime INTO the entry
chunk, so the lazy component and layout chunks statically import back into
`_worker.js`. Measured in a consumer-shaped tree on vite 6.4.3: **7 of 8 chunks
carried that back-edge.**

Async-module semantics then close the loop. The entry suspends at its top-level
await; the dynamically imported chunk cannot finish evaluating until the entry's
evaluation promise settles; and that settles only once the dynamic import
resolves. `await import('./_worker.js')` never settles — node reports
`Warning: Detected unsettled top-level await` and exits 13.

The build was **GREEN**. The failure was at module load, i.e. on every request
in production, on a Worker that had already been deployed.

Both registries are now resolved lazily inside `__buildRouter()` and memoised
behind a single init **promise**, awaited by `handler` before `handle()` is
called. The memo holds the promise rather than the resolved router, and the
check-and-assign pair is synchronous, so a cold burst of concurrent requests all
await the same initialisation: `__buildRouter` runs exactly once, no module is
loaded twice, and `createServerRouter`'s one-time boot validation is not
replayed. The cost is one await, paid by whichever request arrives first on a
cold isolate.

The synchronous-render contract is unchanged. `ServerRouterOptions.children` is
still a RESOLVED `Map`, because `__aihu_schild` still runs inside the compiled
string fast path, which is still synchronous. Only the location of the awaiting
moved — from module scope to the first request, still strictly before any render
begins.

**The static import cycle is still present after this change, and is harmless.**
A cycle without a top-level await resolves normally, and the dynamic imports now
happen during a request, long after the entry finished evaluating. That is the
point: this removes the *necessary* condition rather than the incidental one, so
no future chunking decision can reintroduce the deadlock. `inlineDynamicImports`
and a `manualChunks` shape that keeps the entry a leaf were both rejected for
the opposite reason — they only tune where the cycle lands on today's bundler,
and their failure mode is a green build that hangs on every production request.

Chunking really is that unstable: the same fixture emits 9 chunks with zero
back-edges on vite 8 before this change, and 8 chunks with 2 back-edges after
it. Vite 8/rolldown was not immune, only lucky.

`packages/app/tests/workers-ssr-e2e.test.ts` now imports every built worker
**under a timeout**. Unbounded, that import HUNG against a deadlocked build —
a hung CI job, not a red test — which is precisely why the defect was invisible
to the gate that exists to catch it. It now fails with a message naming the
deadlock and how to confirm it. Two evaluation-level unit tests were added
alongside: one asserts that module evaluation touches neither registry (no
top-level await), the other that five concurrent first requests share one init.

`output: 'spa'` and `output: 'static'` are untouched — verified byte-identical
output before and after.
