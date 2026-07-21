---
'@aihu/compiler': minor
---

GX Phase 1 — the `extract:` two-axis governed-extractability vocabulary
(#437-GX, spec `docs/plans/governed-extractability/40-spec.md` §2–§3, §12
Phase 1). Parse, validate, store, fan out; **no enforcement** — the principal
gate, compliance derivation, and the bundle/data boundary are later phases.

**The declaration (one, two positions):**

- `@route { extract: { read: ..., call: ... } }` — routes.
- `$extract: { read: ..., call: ... }` in `@state` — non-route components.

Both lower to the same `ExtractDecl`. `read` (crawl-visibility) ∈ `'all' |
'agents' | 'search' | 'none' | 'verified' | 'human' | { scope: '<name>' }`;
`call` (agent-callability) ∈ `'none' | 'anonymous' | 'verified' |
{ scope: '<name>' }`. The `{ scope }` value shape carries its scope, making
"gated without a scope" (design A's C482) unrepresentable.

**Resolution:** explicit declaration → component-`$scope` derives a
fail-closed `read: { scope }` → the ratified default
`{ read: 'agents', call: 'anonymous' }`. Behavior is byte-identical to today
for humans, search, and user-directed fetchers — this phase only records the
posture.

**Compile errors / warnings:** C481 (an `expose:`d member under
`call: 'none'`), C483 (malformed policy value), C484 (more than one
declaration per surface), C485 (unknown `@`-class-scope on `$scope` —
`@human`/`@verified` are the reserved vocabulary), W480 (explicit public-tier
`read` overriding the component-`$scope` derivation), W481 (`call: { scope }`
with nothing exposed).

**Three-artifact fan-out:** the resolved policy is computed once per compile
and rendered into (1) a `// @aihu:extract read=<v> call=<v>` code marker
beside the shadow marker (server/universal artifacts only — policy never
reaches client bundles), (2) an `"extract"` member on the `.route.json`
sidecar, and (3) an `"extract"` member on the agent-meta manifest — agreement
by construction, asserted by tests. The Vite plugin prints a per-value census
(`[aihu] extract census — N surface(s)`) at the end of every build.
