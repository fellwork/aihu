# GX Phase 1 — the `extract:` vocabulary + compiler

**Effort:** `governed-extractability` · **Issue:** #437-GX · **Branch:** `feat/gx-phase1-vocabulary`
**Spec:** `40-spec.md` §2 (the declaration), §3 (composition + compile errors), §12 checklist "Phase 1"
(ratified on `design/govern-synth`; this doc records what Phase 1 SHIPPED).

Phase 1 parses, validates, stores, resolves, and fans out the declaration.
It enforces **nothing**: the principal gate (Phase 2), issuance (Phase 2b),
compliance-tier derivation (Phase 3), the bundle/data boundary (Phase 4), and
the G4/G5/DA-f invariants (Phase 5) are later phases. The resolved default is
byte-identical in behavior to today for humans, search, and user-directed
fetchers.

---

## 1. What parses

One declaration, two authoring positions, one compiler value (`ExtractDecl`,
`packages/compiler/src/types.rs`):

```
@route {
  path: '/reports/:id'
  ssr: true
  extract: {
    read: { scope: 'reports:read' }
    call: { scope: 'reports:read' }
  }
}
```

```
@state {
  $extract: { read: 'verified', call: 'verified' }
  balance = $prop(0)
}
```

- **`read`** (crawl-visibility) ∈ `'all' | 'agents' | 'search' | 'none' |
  'verified' | 'human' | { scope: '<name>' }`.
- **`call`** (agent-callability) ∈ `'none' | 'anonymous' | 'verified' |
  { scope: '<name>' }`.
- Either axis may be omitted (it resolves through derivation → default).
  Single-string sugar (`extract: 'agents'`) is deferred per spec §2.2 — one
  canonical shape.
- Scope names are validated (non-empty, single-token, not in the reserved `@`
  namespace). The `{ scope }` value SHAPE carries its scope, so design A's
  C482 ("gated without a scope") is **unrepresentable** — an empty scope name
  is a malformed value (C483), not a policy state.
- Reserved class-scopes on the member/component `$scope` axis: `@human` and
  `@verified` parse; any other `@`-prefixed scope is C485
  (`parser/agent_macros.rs`).

One shared value parser (`packages/compiler/src/extract.rs::parse_extract_literal`)
serves all three parse sites — the production `@route` parser
(`parser/sfc.rs::parse_route_body`), the unit-test `@route` parser
(`parser/route.rs::parse_route`), and the `$extract` state macro
(`parser/state_macros.rs`) — so the positions cannot drift.

## 2. Resolution — declaration → derivation → default

`extract::resolve_extract(source) -> ResolvedExtract` (one call per compile):

1. **Declared** — explicit `extract:` / `$extract` values win.
2. **Derived** — a component-level `$scope: 'x'` with no explicit `extract.read`
   derives the fail-closed `read: { scope: 'x' }` (spec §2.3; `@human` /
   `@verified` class-scopes map to the `'human'` / `'verified'` enum values).
   The `call` axis does not derive — member `$scope` already gates calls.
3. **Default** — the ratified posture `{ read: 'agents', call: 'anonymous' }`.

Each axis carries its origin (`Declared | DerivedFromScope | Default`), which
the census surfaces.

## 3. The compile-error table (spec §3), with fixtures

| Code | Fires when | Should-fail fixture | Should-pass sibling |
|---|---|---|---|
| **C481** | An `expose:`d member under a declared-closed call axis (`call: 'none'`) — narrowed per critique A-3: only the CALL axis closing fires it | `$extract: { read: 'all', call: 'none' }` + `$computed: { total: { expose: { read: true }, … } }` | same policy with **no** `expose:` (row 2, crawlable-not-callable); `expose:` under `call: 'anonymous'` (row 1) |
| **C483** | Malformed policy value: unknown enum word, unquoted value, unknown key, non-object `$extract`, empty/whitespace/`@`-prefixed scope name | `extract: { read: 'everyone', … }`; `$extract: 'agents'`; `read: { scope: '' }` | every legal value shape incl. `{ read: { scope: 'x' }, call: { scope: 'x' } }` |
| **C484** | More than one declaration per surface: `@route extract:` ∧ `$extract`; two `$extract` lines; duplicate axis key | `@route { extract: … }` + `$extract: …` in one file | one declaration in either position |
| **C485** | An unknown `@`-class-scope on `$scope` (the namespace is reserved) | `$scope "@admin"` | `$scope "@human"`, `$scope "@verified"`, plain `$scope "reports:read"` |
| **W480** | Component `$scope` ∧ explicit public-tier `extract.read` (author overrode the fail-closed derivation — both statements visible; advisory) | `$scope "reports:read"` + `$extract: { read: 'agents' }` | explicit hard-tier read, or no explicit read (derivation applies) |
| **W481** | `call: { scope }` with no `expose:`d member anywhere (nothing to govern; advisory) | `$extract: { call: { scope: 'x' } }`, nothing exposed | same policy with an exposed member (also: act-but-never-read `read:'human'` + `call:'verified'` + exposed action is legal AND quiet — row 4) |

C482 is **not implemented and cannot be**: the scope rides inside the value.
Hard errors flow through the `compile_full` `Result` channel
(`lib.rs::validate_extract_composition`); warnings are a pure, testable
decision function (`lib.rs::extract_policy_warnings`, the W472 pattern)
emitted via `diagnostics::emit_warning`.

## 4. Three-artifact fan-out + the agreement mechanism (spec §2.4)

`codegen/emit.rs::emit()` computes **one** `ResolvedExtract` per compile and
threads that single value into all three emitters:

1. **Code marker** — `// @aihu:extract read=<v> call=<v>` beside the
   `// @aihu:shadow` marker (`ResolvedExtract::marker_line`). Emitted on
   server/universal artifacts only: the marker is POLICY (a scope name is a
   `$scope` value in another position), and policy never reaches client
   artifacts — the same gate that elides `__agentBinding`/manifest
   (T1-b: client output contains no `scope` bytes).
2. **`.route.json` sidecar** — an always-present `"extract"` member
   (`emit_route_json`), `{ "read": …, "call": … }` with `{ "scope": "x" }`
   for scope shapes. The default is **recorded**, never implied by absence.
3. **Agent-meta manifest** — the same `"extract"` object beside
   `scope`/`rateLimit` (`emit_manifest`), for the registry → serving-gate
   path Phase 2 consumes.

**Why they cannot drift:** all three render from the same resolved value via
two canonical renderers (`marker_value`/`json_value` on `ExtractRead`/
`ExtractCall`) — there is no second resolution path. The agreement is also
asserted from the artifacts themselves (not the resolver) by
`tests/extract_vocabulary.rs::fan_out_three_artifacts_agree_{declared,default}`,
which parse the marker tokens and both sidecars' `"extract"` objects and
require byte-equality — a drift in ANY emitter breaks the tests. (DA-f2 in
`check:dual-audience` extends this over built fixtures in Phase 5.)

## 5. The census

The Vite plugin (`packages/compiler/js/index.ts`) records each compiled
surface's marker in `transform` and prints the per-value distribution at
`buildEnd` (the DA-e census pattern from #437):

```
[aihu] extract census — 3 surface(s)
  read=agents: 2
  read=scope:reports:read: 1
  call=anonymous: 2
  call=verified: 1
```

Measured above by driving the real plugin over three fixtures (two default,
one declared hard-tier). Helpers `_parseExtractMarker` /
`_formatExtractCensus` are pure and unit-tested
(`tests/extract-census.test.ts`, 5 tests).

## 6. Measured results (2026-07-21, this branch)

- `cargo test -p aihu-compiler` — **35/35 test binaries pass, 0 failures**.
  New: `tests/extract_vocabulary.rs` (20 tests: C481×2 + 2 pass-siblings,
  C483×3, C484×2 + 1 pass-sibling, W480/W481 + quiet-row-4, both parse
  positions, scope-shape fixture, derivation, default, 2 fan-out-agreement);
  `src/extract.rs` unit tests (parse/resolve/render, 24); `$extract` macro
  tests in `state_macros.rs` (5); C485 tests in `agent_macros.rs` (2).
- `bun scripts/check-emit-parses.ts --expect-parse 0 --expect-compile 0` —
  **58 components scanned; 0 compile / 0 parse failures** (existing examples
  carry no `extract:`; the recorded default breaks nothing).
- All five thesis invariants — **0 findings each**: `check:derived` (81
  files), `check:attributed` (3 transports), `check:governed` (4 G1 cells,
  4 G2, 1 G3), `check:dual-audience` (196 files, 3 negotiation cells, SSR +
  SSG), `check:hydration-adoption` (2 probes).
- `bun run typecheck` — PASS (50 tasks). `biome ci` on touched TS — exit 0.
- Workspace `bun run test` — **193 test files pass** (2323 tests).
- Compiler binary bump 0.1.11 → 0.1.12 (5 npm platform packages + 5 pins);
  `BASE_REF=main bun scripts/check-compiler-binary-bump.ts` → ok.
- Baseline churn, all mechanical: 14 insta codegen snapshots + 5
  `bench/…/blocks/*.golden.js` (+ the other universal golden.js for corpus
  consistency) gained the marker line; 3 `bench/…/route/*.route.json`
  goldens gained the `"extract"` member.

## 7. Surfaced-but-not-built (later phases)

- `resolvePrincipal` / `decideEmission` / the T1–T5 taps — Phase 2. The
  manifest's `"extract"` member is emitted but nothing reads it yet.
- robots.txt / noindex / discovery derivation from `read` — Phase 3. (The
  `'search'`/`'none'` values parse today but drive no bot-registry tier.)
- E1/E2 server-only emission + governed chunks — Phase 4. The marker exists
  for E2's seam; Phase 1 deliberately does NOT route chunks on it.
- The scaffold writing `extract: { read: 'agents', call: 'anonymous' }`
  explicitly (`cli/src/index.ts`) — spec §9 lists it under the default-
  posture guards; the default posture itself is still OPEN for founder
  ratification (spec §13), so the scaffold line waits for that call.
- G4/G5 + DA-f invariants — Phase 5 (the Phase-1 agreement tests are their
  compiler-level precursor).
