# aihu Framework Roadmap — v0.3 through v0.6

**Document version:** 1.0  
**Date:** 2026-05-07  
**Author:** Director  
**Status:** APPROVED — versioned planning document for v0.3–v0.6 milestones

---

## Current state (2026-05-07)

- **Latest workspace tag:** v0.2.9 (compiler `@aihu/compiler@0.1.9`; CLI `@aihu/cli@0.3.1`)
- **Completed template-syntax-v2 track:** B1 (R1 $prop fix), B2 (R2–R4 + Q3/Q4), B3a (Variant B grammar + sidecar emit), B3b (codemod + corpus migration + $emit/$on + sidecar tsc wiring) — all merged to main
- **In flight:** B3c (AC16 Phase 2 C500 hard error + AC6 codemod:template-syntax package.json alias, ~80–120 LOC src + ~30–50 LOC tests) and B4 ($aria collection + auto-keyboard-promotion, R5) — B4 can run parallel with B3c
- **Queued:** B5 ($controller R6 + $context R7 combined, ~520–630 LOC src+tests)
- **Agent DX shipped:** llms.txt (root + packages), compiler diagnostics with inline fix hints, `--machine-errors` JSON flag (C44x structured output), vscode-aihu snippets v2, LSP language server spec (379ff27)
- **Agent DX pending:** cookbook (~20 CI-protected SFCs), MCP server (aihu_example + aihu_validate tools), LSP language server implementation, create-aihu AI-provider-selection prompt dimension
- **Live-binding:** RFC #56 ratified with 7 security amendments applied (PR #128); implementation not started; `handleToolCall` still returns `{ stub: true, result: null }`
- **v0.2.x Wave C follow-ups (small CLI):** F-3b (auth conditional-deps render pass), F-5b (conditionalFiles `rename` field / `.env.example.<provider>` → `.env.example`)
- **Mail dogfooding:** Green — 9/9 routes PASS at `inbox.fellwork.com`; known follow-up (PR #108, `$prop const → let` in `$action` body) not blocking

---

## v0.3.0 — Template-syntax-v2 complete

**Tag after B5 lands.** This version closes the entire Variant B compiler grammar, completes the v1-colon-form retirement, and delivers all seven RATIFY-now amendments (R1–R7).

### What ships

**B3c (in flight, lands before v0.3.0 tag):**
- AC16 Phase 2: C500 elevated to hard parse error in `directives.rs` + `emit.rs`; `b3_ac16_phase2_colon_form_is_hard_error` test (replaces `b3_ac6_v1_colon_form_still_compiles_during_transition`)
- AC6: `"codemod:template-syntax"` script alias in `packages/compiler/package.json`; W202 + C500 messages cite `bun run --cwd packages/compiler codemod:template-syntax`
- Branch: `feat/template-syntax-v2-b3c`; ~80–120 LOC src + ~30–50 LOC tests

**B4 ($aria, R5, in flight parallel to B3c):**
- `$aria` collection in `@state`: maps ElementInternals accessibility properties to collection-form macro entries
- Auto-keyboard-promotion: default tabindex injection for interactive elements lacking explicit tabindex
- `bun run size-by-feature` CI script — per-feature gzipped size gating ($aria ≤ 600 B)
- Lazy-attach: compiler conditionally emits `$aria` import only when SFC declares `$aria` collection
- Branch: `feat/template-syntax-v2-b4`; ~250–350 LOC src+tests

**B5 ($controller R6 + $context R7, combined):**
- `$controller` collection (R6): Lit-Reactive-Controller pattern via collection-form; per-instance lifecycle hooks; $controller ≤ 400 B gzipped
- `$context` collection (R7): WICG-Context-Protocol-aligned tree-scoped dependency injection; provider/consumer surface; microtask-deferred dispatch for consumer-mounts-before-provider; Lit interop acceptance test; $context ≤ 600 B gzipped
- `AihuContextRegistry` aggregation in `.aihu.ts` sidecar for compile-time type safety
- B5a/B5b split fallback if WICG interop test goes flaky (surface trigger: 1500 LOC)
- Branch: `feat/template-syntax-v2-b5`; ~520–630 LOC src+tests

**v0.2.x Wave C (ships before tag, disjoint file scope):**
- F-3b: `appPeerDepsConditional` `when` rules applied in `apps/web/package.json.tmpl` emit
- F-5b: `conditionalFiles` `rename` field pipeline pass (`.env.example.<provider>` → `.env.example`)

### Deferred items included

None from the D/L manifest — v0.3.0 closes the RATIFY-now items only.

### Deferred items explicitly NOT included

D1 (DSD-in-SSR), D5 ($form), D6 (defineAihuSanitizer + Trusted Types + LSP) remain v0.4.

### Agent DX items included

None mandatory for tag. LSP spec already shipped; implementation deferred to v0.4.

### LOC scope

- B3c: ~110–170 LOC
- B4: ~250–350 LOC src+tests
- B5: ~520–630 LOC src+tests
- Wave C: ~50–80 LOC
- **Total: ~930–1230 LOC across all branches**

### Dependencies

- B3c: B3b merged (done, PR #129)
- B4: B3b merged (done); disjoint from B3c (parallel OK)
- B5: B4 merged (B5 references $aria's lazy-attach machinery for size-by-feature)
- Wave C: independent; merge any time before tag

### Success criterion

v0.3.0 is done when B5 Verifier returns PASS, `feat/template-syntax-v2` branch is squash-merged to main as `feat: template-syntax-v2 (Variant B + R1–R7)`, and `bun run size-by-feature` reports all three lazy-attach budgets ($aria, $controller, $context) in green.

---

## v0.4.0 — Live binding + LSP foundation

**Tag after `handleToolCall` is real and LSP v1 ships.** This is the agent-infrastructure and developer-intelligence release.

### What ships

**Live binding (RFC #56 implementation):**
- `componentInstanceRegistry: Map<string, LiveBinding[]>` in `packages/arbor/src/mount.ts`
- `LiveBinding` interface + `registerLiveBinding` with `onCleanup` disposer
- `AgentContext` evolution from frozen sentinel to live interface (backward-compatible guard `'rootId' in agent`)
- `handleToolCall` dispatch algorithm: scope check (step 3) → rate-limit check (step 4) → action dispatch (step 5); fail-closed on absent `@aihu/auth`
- `__agentBinding` compiler emission into server artifact only; client artifact elision verified by CI grep
- `@aihu/auth` package: JWT middleware, `checkScope`, `requireAuth`, `requireScope`, `<$guard>` wiring
- `@aihu/scraping` package: sliding-window rate limiter, `checkRateLimit` (O(1) constant-time per §6.8), bot detection middleware
- Security amendment integration tests (a)–(i) from RFC §9 all green
- Registry capacity bound: 1000 entries/tag default; `agent.registry.maxBindingsPerTag` configurable

**$form collection (D5) — rationale for pairing here:**
- `$form` shares `attachInternals()` cache with $aria (R5, shipped in v0.3). Building $form immediately after $aria means the `attachInternals()` singleton guard is fresh and the B4 acceptance test suite acts as a regression baseline. Deferring $form past v0.4 would cost work reconstruction.
- Collection-form surface: `$form` entries map to `ElementInternals` form-associated custom element APIs (`setFormValue`, `setValidity`, `checkValidity`, `reportValidity`)
- Lazy-attach: $form ≤ 700 B gzipped (tentative; verify via `bun run size-by-feature`)
- Branch: `feat/live-binding` (arbor + agent-service + auth + scraping); `feat/form-collection` (compiler + runtime); can merge sequentially

**LSP language server v1:**
- Out-of-process Node.js child via `vscode-languageclient` / `vscode-languageserver`
- Diagnostic provider: shells out to `aihu-compile --machine-errors` (already shipped in `d6073e6`); debounced 300 ms; surfaces C440–C444 as VSCode diagnostics
- Code action provider: "Migrate to v2 macro syntax (aihu codemod)" for any C440–C444 diagnostic; imports `migrate()` from `macro-simplification` codemod (no shell-out)
- Hover provider: static lookup table for 12 macro tokens ($if, $each, $html, $show, $on:*, $bind:*, $prop, $computed, $action, $resource, $effect, $lifecycle); block-context detection via backward scan
- Completion provider: 6 v2 macro-kind collection-form snippets; `@` trigger for block-level completions
- AC1–AC12 from LSP spec all green
- Branch: `feat/lsp-v1`; estimate ~800–1200 LOC (server wiring, providers, tests)
- **`--machine-errors` flag ownership:** already implemented in `d6073e6`; LSP builder consumes it directly

### Deferred items included

- **D5** ($form collection) — paired with $aria (see rationale above)
- **D6 partial** (LSP implementation — the spec is D6; implementation lands here)

### Agent DX items included

- LSP v1 (editor intelligence for agent-generated `.aihu` source)
- `@aihu/auth` shipping enables create-aihu's D2 auth dimension to add `@aihu/auth` as an option (post-v0.4 tag, before v0.5)

### LOC scope

- Live binding (arbor + agent-service): ~400–600 LOC src + ~300–400 LOC tests
- `@aihu/auth` package: ~300–450 LOC
- `@aihu/scraping` (rate limiter only): ~150–250 LOC
- $form collection: ~200–300 LOC src+tests
- LSP v1: ~800–1200 LOC src + ~150–200 LOC tests
- **Total: ~2150–3200 LOC across all branches**

### Dependencies

- Live binding: RFC #56 security review sign-off (§9 gate; reviewer TBD); B5 merged (so $aria/$controller/$context lazy-attach pattern is stable reference)
- $form: B4 merged ($aria + `attachInternals()` cache in place)
- LSP v1: `--machine-errors` flag (shipped); `migrate()` codemod (shipped via B3b); no other blockers

### Success criterion

v0.4.0 is done when `handleToolCall('weather-card/fetchForecast', {}, ctx)` with a valid JWT returns a real signal value from a live mounted component (RFC §9 integration test (a) green), AC1–AC12 in LSP spec pass, and $form ships with a form-associated custom element acceptance test that round-trips `setFormValue` + `checkValidity` through `attachInternals()`.

---

## v0.5.0 — Agent DX + MCP

**Tag after cookbook, MCP server, and CLI AI-provider selection ship.** This is the agent-development-experience release — the point at which aihu becomes the best framework for building agent-interactive applications.

### What ships

**Cookbook (~20 CI-protected SFCs):**
- `cookbook/` directory: 20 named example SFCs each covering one concrete pattern (counter, fetch + $resource, $aria form, $context provider/consumer, $controller, live-binding @agent block, $guard-gated UI, $form validation, SSR + DSD hydration, Tailwind 4 + @style coexistence, etc.)
- Each SFC is a CI-tested first-class citizen: `bun run test` compiles each cookbook SFC and asserts zero compiler errors + expected output shape
- Cookbook drives the MCP server's `aihu_example` tool — every cookbook SFC is queryable by name
- ~20 SFCs × ~60–150 lines each = authoring work; CI harness ~200–350 LOC
- Branch: `feat/cookbook`

**MCP server (`@aihu/mcp-server`):**
- Two tools: `aihu_example` (returns a cookbook SFC by pattern name; feeds agent coding loops) and `aihu_validate` (compiles a proposed SFC string, returns C44x / C500 diagnostics as structured JSON)
- `aihu_validate` reuses `--machine-errors` JSON output (shipped); zero new compiler changes
- `aihu_example` indexes `cookbook/` at server startup; zero network calls
- Server ships as `packages/mcp-server/` with `@aihu/mcp-server` package name; wired into `.mcp.json` at repo root
- ~300–500 LOC src + ~100–150 LOC tests
- **Must ship before v0.5.0 tag** so it can be used in cookbook CI (the MCP server's test suite imports the cookbook index)
- Branch: `feat/mcp-server`

**create-aihu AI provider selection (D2 expansion):**
- `@aihu/auth` joins the auth prompt list in `create-aihu` (D2 dimension, state-cli-templates.md §2.D2 "held, gated on RFC #56 RATIFY")
- RFC #56 ratifies in v0.4.0; this prompt-dimension addition is the v0.5.0 consequence
- Scaffold option: `@aihu/auth` (JWT + $scope + $guard enforcement) alongside better-auth / Kinde / Supabase Auth
- Branch: `feat/cli-ai-provider` (extends `packages/cli/` templates registry); ~80–150 LOC

**DSD-in-SSR (D1) — conditional on Vite-elimination story:**
- Declarative Shadow DOM in SSR output; best-in-class WC SSR
- Condition: if `packages/server/` has eliminated hard Vite coupling by the time v0.5.0 scope is set, D1 lands here. If not, defer to v0.6.0.
- LOC: ~200–400 LOC (SSR render path + DSD template insertion + hydration marker)
- Branch: `feat/dsd-ssr`

**defineAihuSanitizer + Trusted Types chokepoint (D6 completion):**
- `defineAihuSanitizer` factory in `aihu.config.ts`; Trusted Types policy registration at `{@html}` sites
- Pairs naturally with LSP (already shipped in v0.4); LSP can surface a code hint when `{@html}` is used without a sanitizer configured
- ~150–250 LOC compiler + runtime + config surface
- Branch: `feat/trusted-types`

### Deferred items included

- **D1** (DSD-in-SSR) — conditional (see above)
- **D6** (defineAihuSanitizer + Trusted Types) — completes D6 (LSP was the first half; sanitizer + TT is the second)

### Agent DX items included

- Cookbook: feeds all agent coding workflows; every cookbook SFC is a real, tested usage example
- MCP server (`aihu_example` + `aihu_validate`): ships before v0.5.0 tag; CI validates it during cookbook build
- create-aihu AI-provider-selection: closes the RFC #56 → CLI template feedback loop

### LOC scope

- Cookbook (20 SFCs + CI harness): ~1400–3300 lines SFC source + ~200–350 LOC test harness
- MCP server: ~300–500 LOC src + ~100–150 LOC tests
- CLI AI-provider selection: ~80–150 LOC
- D1 DSD-in-SSR (if included): ~200–400 LOC
- D6 Trusted Types: ~150–250 LOC
- **Total: ~2430–4700 LOC/lines** (wide range driven by DSD-in-SSR conditionality and cookbook SFC depth)

### Dependencies

- Cookbook: v0.4.0 merged (live binding real; $form shipped; LSP v1 shipped — each pattern can be covered with confidence)
- MCP server: cookbook branch merged (indexes cookbook SFCs); `--machine-errors` flag (shipped)
- CLI AI-provider: RFC #56 ratified + `@aihu/auth` published (both v0.4.0 deliverables)
- D1 DSD-in-SSR: Vite-elimination progress assessment at v0.4 close
- D6 Trusted Types: LSP v1 shipped (v0.4 deliverable)

### Success criterion

v0.5.0 is done when `@aihu/mcp-server` is published and registered in `.mcp.json`, all 20 cookbook SFCs compile clean in CI, `bunx create-aihu --auth @aihu/auth` scaffolds a project with `<$guard>` in the example component, and `aihu_validate` returns a structured C440 diagnostic for a deliberately broken SFC input.

---

## v0.6.0 — Platform completeness

**Tag after the L-item tier lands.** This is the CSS, event-model, accessibility, and DevTools release — closing the gap between aihu's runtime primitives and the full breadth of the Web Components platform.

### What ships

**L1 — Shared `adoptedStyleSheets` aggregation:**
- `@aihu/runtime` aggregates `adoptedStyleSheets` across component instances sharing the same host; deduplicates identical stylesheet objects
- Enables single-stylesheet-per-component-class semantics without per-instance copies
- ~100–180 LOC runtime

**L2 — CSS `@layer aihu-component`:**
- Compiler wraps scoped `@style` block output in `@layer aihu-component { … }` (configurable layer name via `aihu.config.ts`)
- Enables consumer cascade control; pairs with Tailwind 4's `@layer` model
- ~80–120 LOC compiler emit + config

**L3 — Event modifiers `.once` / `.passive` (DEFER `.signal` — see Risk register):**
- `.once` and `.passive` modifiers on `$on.` bindings: `$on.click.once={handler}` → `addEventListener('click', handler, { once: true })`
- `.signal` modifier (AbortSignal-based listener removal) is DEFERRED pending WHATWG ratification — Q3 2026 re-verify trigger (documented in summary as v0.5+ watched assumption)
- ~120–200 LOC compiler parse + codegen

**L4 — Build-time a11y lint pass:**
- `aihu a11y <glob>` command: static analysis of `.aihu` template blocks for common a11y violations (missing `alt`, unlabeled interactive elements, incorrect ARIA role usage)
- Runs in CI via `bun run lint:a11y`; emits warnings as C-series codes in `--machine-errors` JSON format (LSP picks them up for free)
- ~300–500 LOC (rule engine + 6–10 initial rules + CLI integration)

**L5 — Community DevTools panel:**
- Browser extension (Chrome/Edge) surfacing live signal values, component tree, mount/unmount lifecycle events
- Uses `componentInstanceRegistry` (live binding, shipped in v0.4) as the data source
- MVP scope: signal value inspector + component list; no timeline or flame graph in v1
- ~400–700 LOC (extension popup + content script + arbor telemetry hooks)
- Branch: `feat/devtools-panel`

**L8 — `$reactive.motion`:**
- `$reactive: { motion: { … } }` collection-form entry in `@style`; compiles to `prefers-reduced-motion`-aware CSS custom property transitions
- Respects `@media (prefers-reduced-motion)` at compile time; zero JavaScript animation runtime
- ~150–250 LOC compiler + runtime CSS emission

### L-items deferred from v0.6.0

- **L6** ($BuildHost abstraction / Vite-decoupling): large architectural scope; deferred until Vite-elimination story is resolved (tracked as v0.7+ scope)
- **L7** (runtime plugin contract): depends on live binding (v0.4) + buildhost clarity (L6); deferred to v0.7+
- **L3 `.signal` modifier**: WHATWG AbortSignal-as-addEventListener-option not yet ratified as stable; Q3 2026 re-verify; add to v0.6.x patch if ratified on schedule

### Deferred items included

- **L1** (adoptedStyleSheets aggregation)
- **L2** (CSS @layer)
- **L3** (event modifiers, .once + .passive only)
- **L4** (build-time a11y lint)
- **L5** (DevTools panel)
- **L8** ($reactive.motion)

### Agent DX items included

- L4 a11y lint emits `--machine-errors` JSON format → LSP surfaces a11y violations as diagnostics in-editor with zero additional LSP work

### LOC scope

- L1: ~100–180 LOC
- L2: ~80–120 LOC
- L3 (.once + .passive): ~120–200 LOC
- L4 a11y lint: ~300–500 LOC
- L5 DevTools panel: ~400–700 LOC
- L8 $reactive.motion: ~150–250 LOC
- **Total: ~1150–1950 LOC**

### Dependencies

- L1, L2, L3, L8: v0.5.0 merged (clean baseline; no specific dependency)
- L4: `--machine-errors` JSON flag (shipped v0.4); LSP v1 (shipped v0.4) for in-editor display
- L5: `componentInstanceRegistry` (live binding, shipped v0.4); cookbook SFCs (v0.5) as the DevTools demo content

### Success criterion

v0.6.0 is done when `bun run lint:a11y packages/examples/**/*.aihu` reports zero violations on the cookbook SFCs, the DevTools extension inspects a live `weather-card` component's signal values in Chrome without errors, and `$reactive: { motion: { fadeIn: '200ms' } }` in a cookbook SFC compiles to a valid `@media (prefers-reduced-motion: no-preference)` guarded transition.

---

## Parallel execution plan

The following tracks have disjoint file scopes and can run concurrently during v0.4 and v0.5 development.

### v0.4 parallel tracks

| Branch | Primary files touched | Parallel with |
|---|---|---|
| `feat/live-binding` | `packages/arbor/src/mount.ts`, `packages/agent-service/src/agent-service.ts`, `packages/arbor/src/types.ts`, new `packages/auth/`, new `packages/scraping/` | `feat/lsp-v1`, `feat/form-collection` |
| `feat/lsp-v1` | `packages/vscode-aihu/server/`, `packages/vscode-aihu/src/extension.ts` | `feat/live-binding`, `feat/form-collection` |
| `feat/form-collection` | `packages/compiler/src/parser/state_macros.rs` ($form arm), `packages/runtime/` ($form lazy-attach) | `feat/live-binding`, `feat/lsp-v1` |

Merge order recommendation: `feat/form-collection` first (no runtime dependencies), then `feat/lsp-v1` (self-contained VS Code package), then `feat/live-binding` (largest; security review must sign off before merge to main). All three can develop concurrently.

### v0.5 parallel tracks

| Branch | Primary files touched | Parallel with |
|---|---|---|
| `feat/cookbook` | `cookbook/*.aihu`, `scripts/test-cookbook.ts` | `feat/mcp-server` (server reads cookbook index at startup — merge cookbook first, but server development can proceed against a local stub) |
| `feat/mcp-server` | new `packages/mcp-server/` | `feat/cookbook`, `feat/cli-ai-provider` |
| `feat/cli-ai-provider` | `packages/cli/src/templates-registry.ts`, `packages/cli/src/prompts.ts`, `packages/templates-cf-team/` | `feat/cookbook`, `feat/mcp-server` |
| `feat/trusted-types` | `packages/compiler/src/codegen/emit.rs` ({@html} sites), `packages/runtime/sanitizer.ts`, `aihu.config.ts` type surface | All of the above (disjoint) |
| `feat/dsd-ssr` | `packages/server/src/render.ts`, SSR test fixtures | All of the above (disjoint) |

Merge order recommendation: `feat/trusted-types` and `feat/cli-ai-provider` are self-contained and can merge any time. `feat/cookbook` merges before `feat/mcp-server` so the MCP server's integration tests can reference committed cookbook SFCs. `feat/dsd-ssr` merges last (largest; depends on Vite-elimination assessment).

---

## Agent DX integration

The cookbook, MCP server, and CLI AI-provider-selection form a dependency chain that must be sequenced carefully:

```
v0.3.0
  └── LSP spec (shipped 379ff27)
      └── v0.4.0
            ├── LSP v1 implementation (editor intelligence)
            ├── @aihu/auth (gates CLI prompt-dim expansion)
            └── live binding (gates aihu_validate correctness for @agent blocks)
                └── v0.5.0
                      ├── cookbook (20 SFCs — feeds MCP server; CI-protected)
                      │     └── feat/mcp-server (aihu_example indexes cookbook)
                      │           └── aihu_validate (reuses --machine-errors; no new compiler work)
                      └── create-aihu AI-provider-selection (@aihu/auth joins D2 prompt)
```

**Key sequencing decisions:**

1. The MCP server MUST ship before the v0.5.0 tag closes. The cookbook CI harness imports the MCP server's `cookbookIndex` module to verify that every SFC is indexed correctly. Shipping them in the same milestone window (v0.5.0) with cookbook merging first is the correct order.

2. The cookbook feeds `aihu_example` by name lookup — cookbook SFCs must be committed before the MCP server's integration tests can pass. Develop them concurrently but merge cookbook first.

3. `aihu_validate` uses `--machine-errors` JSON (already shipped in `d6073e6`). No compiler changes are needed for the MCP server's validation tool. This eliminates a blocking dependency.

4. The create-aihu AI-provider-selection dimension is gated on `@aihu/auth` publishing (a v0.4.0 deliverable). The CLI template prompt change is a small addition (~80–150 LOC) but must wait for `@aihu/auth` to be on npm with a stable API. Plan for it landing mid-v0.5.0 cycle.

5. The LSP server (v0.4.0) indirectly helps the cookbook — agents generating `.aihu` SFCs for the cookbook can use in-editor validation before submitting. Ship LSP before freezing the cookbook SFC content.

---

## Risk register

### R1 — WICG Context Protocol adoption risk ($context, B5)

**Probability:** Medium. **Impact:** Medium.

$context (R7) is documented as "WICG-Context-Protocol-aligned." The WICG Context Protocol has not yet reached Recommendation status; the spec's "composedPath()-style event propagation" model is the current working design but could change. Aihu ships its own implementation (not a `@lit/context` runtime dep), which means we are not locked to Lit's decisions, but any spec revision to the propagation model would require an implementation rework.

**Mitigation:** B5 brief explicitly names a B5a/B5b split fallback if the WICG interop test goes flaky. The compile-time type safety is via the `.aihu.ts` sidecar's `AihuContextRegistry` — this surface is compiler-only and can be revised independently of the runtime propagation model. Track WICG Context Protocol WG meetings; add a reverify trigger to the `v0.5+ watched assumptions` section of the topic summary if the spec advances to CG Draft Report.

### R2 — LSP scope risk (language server is large)

**Probability:** Medium. **Impact:** Medium-High.

The LSP spec targets 12 acceptance criteria covering four providers (diagnostics, code actions, hover, completion). The out-of-process Node.js child process model adds non-trivial wiring complexity (activation events, `LanguageClient` lifecycle, server crash recovery). The binary path strategy for packaged `.vsix` (pre-built platform binaries, OQ #3 in spec) is unresolved and could add scope if the Builder hits it.

**Mitigation:** Split LSP implementation into two sub-rounds if LOC exceeds 1200 LOC total: LSP-A (server wiring + diagnostic provider, ACs 1–2 + 9–12) and LSP-B (code actions + hover + completion, ACs 3–8). The diagnostic provider is the highest-value deliverable; it alone justifies the v0.4.0 tag. Surface trigger: if LSP-A Verifier returns NEEDS_FIX on the binary path issue, defer packaged `.vsix` binary bundling to LSP-B and ship with dev-mode activation only (binary on PATH required).

### R3 — Live binding security depth for `$scope` / `$rate-limit`

**Probability:** Low-Medium. **Impact:** High.

RFC #56 carries 7 security amendments (fail-closed on absent auth, O(1) rate-limit timing, cross-frame trust, registry capacity bounds, CSP compatibility, supply-chain template trust). The security review gate (§9 mandatory) is currently "reviewer TBD." If the security review is not assigned and completed before the v0.4.0 work window, the entire live-binding implementation sits built but un-merged.

**Mitigation:** Assign security reviewer at v0.3.0 close — do not wait for live-binding implementation to be done before starting review. The spec is complete (7 amendments applied via PR #128); the reviewer can evaluate the spec and the `componentInstanceRegistry` surface in parallel with implementation. Block v0.4.0 tag on security review sign-off, not on reviewer assignment.

### R4 — Vite-elimination ambiguity blocking D1 (DSD-in-SSR) and L6

**Probability:** Medium. **Impact:** Low-Medium for v0.5; Medium for v0.6.

D1 (DSD-in-SSR) is conditioned on the Vite-elimination story being resolved. L6 (BuildHost abstraction / Vite-decoupling) is already deferred to v0.7+. If the Vite-elimination direction is not clarified by the v0.4.0 close assessment, D1 will slip from v0.5.0 to v0.6.0 or later. This is a plan risk, not a correctness risk — DSD-in-SSR is a net-new capability, not a regression.

**Mitigation:** At v0.4.0 close, the Director performs a Vite-elimination status check: if `packages/server/` has removed the hard Vite import path (or has a clean abstraction seam), D1 is in-scope for v0.5.0. Otherwise D1 moves to v0.6.0. Document this checkpoint explicitly in the v0.4.0 retro. Do not let the ambiguity block cookbook or MCP server work.

### R5 — Effective Builder round ceiling and topic slip accumulation

**Probability:** Low. **Impact:** Medium.

The template-syntax-v2 track slipped from a 5-round projection to 6 effective rounds (B1, B2, B3a, B3b, B3c, B4, B5 = 7 dispatches against a 5-round plan). The per-defect-class ping-pong ceiling is 5; 1–2 have been used. v0.4.0 introduces three parallel tracks (live binding, LSP, $form) each with their own potential surface conditions. If two of the three tracks surface NEEDS_FIX in the same governance round, the combined iteration count could pressure the ceiling.

**Mitigation:** Keep the three v0.4.0 tracks on separate Verifier windows. Do not combine live-binding and LSP into a single Verifier audit — the defect classes are completely different. If live-binding security review delays the Builder's ability to get a Verifier sign-off, the LSP track can still close independently. Report iteration counts per-track in each governance round; do not aggregate them.

---

*End of roadmap document. — Director, 2026-05-07*
