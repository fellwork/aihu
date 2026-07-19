---
'@aihu/agent-service': patch
---

The server-side action allowlist is now actually enforced.

`runGate` checked `typeof binding.callAction === 'function'` before dispatching
— always true for a `LiveBinding`. The real membership check (`action in
meta.actions`) existed only on the branch that returns 404 unconditionally two
lines later, so no reachable path enforced it. Enforcement was displaced to the
browser's opaque-ID map, which made the **client** the allowlist authority —
inverting this package's stated design that "the server-side gate is
load-bearing."

The gate now checks the requested action against the compiler-emitted metadata
registered for that tag: it must be advertised in `actions`, or be a readable
member of `state` (`handleToolCall` falls through to `getSignal` for those).
`LiveBinding` intentionally exposes no action list — it is a set of invokers,
not a manifest — so the metadata is the authority. This composes with the
compiler now emitting `registerAgentMetadata`, which is what makes that
metadata present for any component compiled from source.

When no metadata is registered for a tag, there is nothing to enforce against
and the call proceeds to the invoker, which rejects unknown names itself.
Closing that remaining gap requires giving `LiveBinding` an advertised surface
and is tracked separately; it is not reachable by a component compiled from
source.

The existing AC11 test did not catch this: its fixture's `callAction` throws
`no action: …`, so it asserted the invoker's rejection rather than the gate's —
the same inversion, mirrored in the test. The new AC11b tests use a binding
whose `callAction` succeeds for any name, so only a real server-side check can
produce a 404. Verified failing against the old code, where an unadvertised
`wipeDatabase` executed.
