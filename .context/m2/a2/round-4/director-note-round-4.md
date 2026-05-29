---
topic: aihu-m2-a2
track: aihu-m2-a2
kind: director_note
layer: delta
round: 4
slug: aihu/delta/m2/a2/round-4/director-note-round-4
---

# Director Note — Round 4 (aihu-m2-a2)

**Author:** Topic Director · **Date:** 2026-05-27 · **Storage:** file fallback (GBrain MCP unavailable)

---

## 1. Round-3 Digest + Source Quality Decision

Round 3 (EX-12 realtime-scores) is VERIFIED: 8/8 assertions pass, over-extension audit clean across 21 files, do-not-break suite (7 examples, 42/42 tests) confirmed intact, Iron Law gate properly fired and documented in `builder-investigation-apis.md`. The Verifier raised three source quality observations — none are gate failures, all are design consistency gaps. Decision for each:

**Observation 1 — CSS fallback hex colors are Catppuccin Mocha dark values (differ from tokens.css light-mode defaults); `--warning`/`--warning-bg` tokens used in the SFC but not defined in `tokens.css`.** Decision: **log as M4 polish item, do NOT retrofit EX-12 now.** EX-12 uses `var(--*)` throughout — the token system is structurally correct; only the fallback values are inconsistent. Retrofitting mid-track requires a second builder touching a verified example on a different branch, which introduces merge risk for no correctness gain. The `--warning`/`--warning-bg` gap is a `tokens.css` extension task, not an EX-12 task — it belongs in an M4 token-audit round. **Baked forward as a requirement for EX-07: no hardcoded hex fallbacks permitted; all tokens must be defined in `tokens.css` (not invented in-component).**

**Observation 2 — No `@media (max-width: 480px)` in EX-12's `@style` block; mobile usability relies on `max-width` container only.** Decision: **log as M4 polish item, do NOT retrofit EX-12 now.** The `32rem` cap is a reasonable responsive constraint and the Verifier did not classify this as a gate failure. However, the absence of a mobile breakpoint is a known pattern gap. **Baked forward as a hard acceptance criterion for EX-07: Builder must include an `@media (max-width: 480px)` block per arch-2 §3.**

**Observation 3 — Dark-by-default appearance when `tokens.css` is not imported; `index.html` does not apply `.dark` class.** Decision: **log as M4 polish item, acceptable for M2.** Arch-2 §3 specifies dark mode is toggled via `.dark` class on `<html>` — it is not the default state. EX-12 in isolation defaults to the hardcoded dark fallbacks rather than the light-mode token values because the token import is absent. For M2 dev-only examples this is tolerable. **Baked forward for EX-07: `index.html` must import `tokens.css` (via `@shared` alias or relative path) so the example defaults to light mode and responds to `.dark` class correctly.**

---

## 2. EX-07 Scope Analysis

### Confirmed from sources

**`@aihu/agent-a2a`** exports: `mountA2aAdapter(service: AgentService, options?: A2aAdapterOptions): A2aAdapter`. The adapter exposes `.asMiddleware()` returning an async `(req: Request) => Promise<Response | null>`. Routes handled: `GET /.well-known/agent.json`, `POST /a2a/tasks/send`, `POST /a2a/tasks/sendSubscribe`. The `sendSubscribe` route emits `data: ${JSON.stringify(task)}\n\ndata: [DONE]\n\n` — exactly two SSE frames, no incremental streaming. This is confirmed single-shot SSE, consistent with D-A2-R3-A2A-STREAMING-CHARACTERIZATION.

**`@aihu/agent-acp`** exports: `mountAcpAdapter(service: AgentService, options?: AcpAdapterOptions): AcpAdapter`. Routes: `GET /.well-known/acp-agent`, `POST /acp/messages`. Real, fully-wired, NOT a stub. ACP message routing dispatches to `service.handleToolCall` and returns a structured ACP response.

**`@aihu/agent-service`** exports: `createAgentService(options?: AgentServiceOptions): AgentService`. Key signature detail: `options.manifests?: AgentMetadata[]` is the explicit list; when omitted, the service is created from an empty array (registry snapshot). The `AgentService` has `getManifest()`, `handleToolCall(toolName, params, requestContext?)`, and `asMiddleware()`. The `handleToolCall` returns 404 for all calls without a live `getRegistry` binding, which is expected behavior in an example context (no live DOM mounting on the server side).

**`@aihu/agent`** exports: `getAllAgentMetadata(): AgentMetadata[]` (from `registry.ts:86`), `getAgentMetadata(tag)`, `registerAgentMetadata`. In the hub context, `getAllAgentMetadata()` is used by `agent-panel.aihu` (already imported there) to show all registered component metadata in the inspector panel. EX-07 also uses it explicitly in the hub-root component to display a summary list of which sub-components are wired.

**`@aihu/context`** exports: `createContext<T>(defaultValue?)`, `provide<T>(token, value)`, `inject<T>(token)`. Note: `provide` is a no-op when no active context map is set (i.e., `_activeContextMap === null`). In a client-side SFC context, the compiler's `@context` block (or manual `setSsrContextMap`) must activate the map. For EX-07 the usage pattern is: a hub-root component creates a context token holding the `AgentService` reference and makes it available to child components via `provide`; sub-components call `inject` to read it. The pattern from EX-09 (blog-loader, round-2 verified) is the canonical reference.

### Greenfield scope

`examples/agent-hub/` does not exist on disk. This is fully greenfield. No existing work to extend or coordinate with.

### Sub-components (3, per arch-2 §2 row 07)

1. **`hub-root`** (`hub-root.aihu`) — the top-level orchestrator. Imports `createAgentService` and initializes the service. Creates a context token for the service. Provides the service to children. Displays `getAllAgentMetadata()` summary list. Mounts `agent-panel.aihu`. Has an `@agent` block exposing hub-level metadata.

2. **`a2a-panel`** (`a2a-panel.aihu`) — A2A demo sub-component. Injects the service from context (or receives as a prop — see phasing note below). Displays the `/.well-known/agent.json` discovery card (fetched on mount from the dev server). Fires a `POST /a2a/tasks/sendSubscribe` call via `fetch()` and streams (reads) the SSE response. Displays the single result frame. Badges as "A2A: single-shot SSE (multi-frame streaming pending Plan 5.3)".

3. **`acp-panel`** (`acp-panel.aihu`) — ACP demo sub-component. Injects the service from context. Displays the `/.well-known/acp-agent` discovery card (fetched on mount). Sends a `POST /acp/messages` test call and displays the response. Badges as "ACP: live" (ACP is real, not a stub).

### How `getAllAgentMetadata()` is used

`getAllAgentMetadata()` is called in `hub-root.aihu`'s `@state` computed block to render a summary list of all registered component metadata. This is the hub's "connected agents" overview — it shows which SFCs have `@agent` blocks registered, so the developer can verify the hub is picking up all three sub-components. It is also the data source for the agent-panel (which already calls it internally via its own `@state` block).

### A2A handling (per D-A2-R3-A2A-STREAMING-CHARACTERIZATION)

The A2A adapter is a single-shot SSE stub. The `a2a-panel` component must:
1. On a "Send A2A request" button click, `fetch('/a2a/tasks/sendSubscribe', { method: 'POST', body: JSON.stringify({ message: 'ping', params: null }) })` and read the response body as text (the response is `text/event-stream` with two lines: `data: {...}` then `data: [DONE]`).
2. Parse the first `data:` line and display the task result JSON.
3. Display badge: **"A2A: single-shot SSE (multi-frame streaming pending Plan 5.3)"** — this is the exact badge text per D-A2-R3-A2A-STREAMING-CHARACTERIZATION and arch-2 §9.2.
4. Do NOT simulate fake incremental frames.

### ACP handling

The ACP adapter is real (fully wired). The `acp-panel` component must:
1. On a "Send ACP message" button click, `fetch('/acp/messages', { method: 'POST', body: JSON.stringify({ role: 'user', content: 'ping', parts: [] }) })`.
2. Parse and display the ACP response (`{ role: 'agent', content: '...', parts: [...] }`).
3. Display badge: **"ACP: live"** — no stub caveat, because the adapter is real.

### `@aihu/context` usage

`hub-root.aihu` creates a context token: `const HubServiceContext = createContext<AgentService>()`. After `createAgentService()` is called, `provide(HubServiceContext, service)` makes the service available. Sub-components call `inject(HubServiceContext)` to access it. Important note from source: `provide` is a no-op when `_activeContextMap` is null — the compiler's `@context` block or explicit `setSsrContextMap` must activate it. Since EX-07 is a client-side SFC example (no SSR), the context wiring must follow the established EX-09 pattern (confirmed verified in round 2). Builder must read EX-09's blog-loader context usage as a pre-write gate reference.

### Server.ts requirement

EX-07 **requires a real `server.ts`** — not a Vite `configureServer` hook. The reason: `mountA2aAdapter` and `mountAcpAdapter` return adapters with `.asMiddleware()` that take `Request` objects (fetch API `Request`, not Node.js `IncomingMessage`). The Vite `configureServer` hook exposes `server.middlewares` which is a Connect-style middleware (`(req: IncomingMessage, res: ServerResponse) => void`) — incompatible with the adapters' `(req: Request) => Promise<Response | null>` signature without a Bridge shim. Using a real `Bun.serve`-based `server.ts` is the correct approach: Bun's native `fetch` handler provides a `Request` object natively, matching the adapter interface exactly.

The canonical `server.ts` pattern in this repo is **`Bun.serve`** (confirmed from `examples/css-pluggability/server.ts` which uses `Bun.serve({ port, fetch })` with static file serving). EX-07 extends this pattern to add dynamic middleware routing: the server chains the A2A adapter, the ACP adapter, and the AgentService middleware before falling back to static file serving.

Port assignment: API server on **5107** (same as the Vite dev port — they run on the same port, with the Vite dev server proxying to the Bun server, OR the Bun server is the dev server with file serving). See decision D-A2-R4-EX07-SERVER-PATTERN below.

### Is EX-07 completable in one Builder round?

**No. EX-07 requires two Builder rounds.** The scope is: 1 `server.ts`, 3 SFC sub-components, `@aihu/context` wiring between them, A2A + ACP fetch interactions, smoke tests covering all three components, and a `server.ts` integration pattern not previously established in this track. The `server.ts` pattern introduces non-trivial complexity: the Bun.serve + adapter chain must be proven to work before the SFC layer is built. Attempting all of this in one round risks a PARTIAL at Verifier, which wastes a round.

**Round-4 slice (this brief):** `server.ts` + `hub-root.aihu` + smoke test for hub-root + package/vite scaffold. This establishes the server pattern, the AgentService initialization, the context creation, and the basic hub structure. The A2A and ACP fetch interactions are mocked in the smoke test (no live server calls).

**Round-5 slice (next brief):** `a2a-panel.aihu` + `acp-panel.aihu` + their smoke tests + discovery-card fetch logic + README row update + do-not-break verification of all 8 prior examples.

---

## 3. Source Quality Note for EX-07 Builder

The round-3.5 Verifier observed that EX-12 used hardcoded Catppuccin Mocha hex fallbacks (e.g., `var(--panel-bg, #1e1e2e)`) and referenced tokens (`--warning`, `--warning-bg`) not defined in `tokens.css`. EX-07 must not repeat these errors. The following are **hard acceptance criteria**, not advisory:

1. **All CSS custom properties must be `var(--token-name)` with NO hex fallback.** If a token is needed that does not yet exist in `examples/_shared/tokens.css`, the Builder must use the closest existing token or request Director approval — never invent a fallback hex value.
2. **Only tokens defined in `examples/_shared/tokens.css` may be used.** The defined tokens are: `--bg`, `--fg`, `--muted`, `--border`, `--accent`, `--hover-bg`, `--code-bg`, `--btn-bg`, `--panel-bg`, `--input-bg`, `--tag-bg`, `--tag-fg`, `--focus-ring`, `--success`, `--success-bg`, `--error`, `--error-bg`, `--card-shadow`, `--radius`, `--max-w`, `--agent-bg`, `--agent-border`, `--stub-bg`, `--stub-border`, `--stub-fg`, `--hn-orange`, `--header-h`. **`--warning` and `--warning-bg` are NOT in `tokens.css` — do not use them.** Use `--stub-bg`/`--stub-border`/`--stub-fg` for warning-style treatment (they are already the amber palette).
3. **Each `@style` block must include an `@media (max-width: 480px)` rule** that at minimum reduces container padding to `1rem` and stacks flex children vertically. This applies to `hub-root.aihu`, `a2a-panel.aihu`, and `acp-panel.aihu`.
4. **`index.html` must import `tokens.css`** via the `@shared` alias or relative path (e.g., `<link rel="stylesheet" href="/@shared/tokens.css">` or the Vite-aliased equivalent) so the example defaults to light mode. Do not rely on hardcoded dark fallbacks.

---

## 4. Decisions

### D-A2-R4-EX07-SERVER-PATTERN

**Decision:** EX-07 uses a **standalone `server.ts` run via `bun --watch server.ts`** alongside the Vite dev server on a separate port. Specifically:

- Vite dev server: port **5107** (standard dev/HMR, serves the SFC bundle and `index.html`).
- Bun API server: port **5207** (handles `/.well-known/agent.json`, `/.well-known/acp-agent`, `/a2a/tasks/*`, `/acp/messages`, `/__aihu/tools/call`).
- The `index.html` Vite config adds a proxy: `server: { proxy: { '/a2a': 'http://localhost:5207', '/acp': 'http://localhost:5207', '/.well-known': 'http://localhost:5207', '/__aihu': 'http://localhost:5207' } }` so browser fetches from the SFC (which uses relative URLs) route to the Bun server transparently.
- `package.json` scripts: `"server": "bun --watch server.ts"`, `"dev": "concurrently \"bun run server\" \"vite --port 5107\""` (use `concurrently` in devDeps), `"dev:server": "bun run server"` for standalone server testing.

**Rationale:** This is the simplest pattern that correctly wires the fetch-API adapters (`mountA2aAdapter`, `mountAcpAdapter`) without a shim. The `css-pluggability` `server.ts` establishes the `Bun.serve` pattern. The Vite proxy is the standard dev-time bridge. A Vite plugin spawning a subprocess adds complexity with no correctness benefit. The `configureServer` hook pattern (EX-12) cannot be used because Connect middleware is incompatible with `(req: Request) => Promise<Response | null>` without adaptation.

**`server.ts` skeleton structure:**

```ts
import { createAgentService } from '@aihu/agent-service'
import { mountA2aAdapter } from '@aihu/agent-a2a'
import { mountAcpAdapter } from '@aihu/agent-acp'
import { getAllAgentMetadata } from '@aihu/agent'

const service = createAgentService({ manifests: getAllAgentMetadata() })
const a2a = mountA2aAdapter(service)
const acp = mountAcpAdapter(service)
const agentMw = service.asMiddleware()

Bun.serve({
  port: 5207,
  async fetch(req) {
    return (await a2a.asMiddleware()(req))
      ?? (await acp.asMiddleware()(req))
      ?? (await agentMw(req))
      ?? new Response('not found', { status: 404 })
  },
})
```

**Surface to user:** PROCEED ON DEFAULT.

### D-A2-R4-EX07-PHASING

**Decision: 2 rounds.** Round 4 ships: `server.ts` + `hub-root.aihu` + package scaffold + smoke test for hub-root (source-text assertions only, no live server). Round 5 ships: `a2a-panel.aihu` + `acp-panel.aihu` + their smoke tests + full README row update.

**Rationale:** The server pattern (`Bun.serve` + multi-adapter chain) is new to this track. Hub-root context wiring with `getAllAgentMetadata()` is new. Scoping round 4 to establish these foundations lets the Verifier (round 4.5) confirm the server starts, the adapters mount, and the hub-root renders — before the more complex SSE-fetch and ACP-fetch UI interactions are added in round 5.

**Surface to user:** PROCEED ON DEFAULT.

### D-A2-R4-EX12-CSS-QUALITY

**Decision: Log as M4 polish items, do NOT fix in round 4.**

- Catppuccin Mocha hex fallbacks in EX-12: M4 token-audit task. No round-4 builder action.
- Missing `@media (max-width: 480px)` in EX-12: M4 polish task. No round-4 builder action.
- Dark-by-default when `tokens.css` not imported: M4 polish task. No round-4 builder action.
- Adding `--warning`/`--warning-bg` to `tokens.css`: deferred to M4 token-extension round. EX-07 Builder must NOT use these tokens; use `--stub-*` for amber treatment.

EX-12 is verified and passing. Retrofitting mid-track introduces merge risk (two builders on different branches, potential rebase conflicts on `examples/README.md` row updates). The correctness argument for fixing now is weak — these are all visual/polish gaps, not logical errors. Bake the lessons forward as hard requirements for EX-07 and log for M4.

**Surface to user:** PROCEED ON DEFAULT.

---

## 5. Verbatim-Dispatchable Builder Brief

```
======================================================================
BUILDER BRIEF — aihu-m2-a2 / round 4
======================================================================

Topic:        aihu-m2-a2
Track:        aihu-m2-a2
Round:        4
Branch name:  feat/m2-a2-examples/ex-07-agent-hub
Storage:      File fallback (GBrain MCP unavailable)

Mode:         BUILDER — you write code, you run tests, you commit.

OUTPUT REQUIREMENTS
-------------------
Write a build_manifest at:
  /Users/smcguirt/conductor/workspaces/aihu/seville/.context/m2/a2/round-4/build-manifest-round-4.md

With YAML headers:
  ---
  topic: aihu-m2-a2
  track: aihu-m2-a2
  kind: build_manifest
  layer: delta
  round: 4
  slug: aihu/delta/m2/a2/round-4/build-manifest-round-4
  ---

The manifest lists every file touched, the commit SHA(s), per-acceptance
PASS/FAIL with evidence, and a STATUS block at the bottom.

IRON LAW — PRE-WRITE GATE (MANDATORY, RUNS BEFORE ANY CODE IS WRITTEN)
------------------------------------------------------------------------
Before writing a single line of implementation code, you MUST verify
the following from the actual package source. Write a 1-paragraph
investigation page at:
  .context/m2/a2/round-4/builder-investigation-apis.md

Check each item AND document exact findings (file path + line number):

1. Read `packages/agent-service/src/index.ts`.
   Confirm `createAgentService` is exported.
   Read `packages/agent-service/src/agent-service.ts` lines 235–238.
   Confirm signature: `createAgentService(options?: AgentServiceOptions): AgentService`
   Note: `options.manifests?: AgentMetadata[]` is the explicit list.
   Note: `asMiddleware()` returns `(req: Request) => Promise<Response | null>`.
   If NOT exported or signature differs materially → STOP and re-ask Director.

2. Read `packages/agent-a2a/src/index.ts`.
   Confirm `mountA2aAdapter` is exported.
   Read `packages/agent-a2a/src/a2a-adapter.ts` lines 1–10.
   Confirm signature: `mountA2aAdapter(service: AgentService, options?: A2aAdapterOptions): A2aAdapter`
   Confirm `A2aAdapter` has `.asMiddleware()` returning `async (req: Request) => Promise<Response | null>`.
   Note the sendSubscribe path: `/a2a/tasks/sendSubscribe` (POST).
   Note SSE response format: `data: ${JSON.stringify(task)}\n\ndata: [DONE]\n\n`
   If NOT matching → STOP and re-ask Director.

3. Read `packages/agent-acp/src/index.ts`.
   Confirm `mountAcpAdapter` is exported.
   Read `packages/agent-acp/src/acp-adapter.ts` lines 11–15.
   Confirm signature: `mountAcpAdapter(service: AgentService, options?: AcpAdapterOptions): AcpAdapter`
   Confirm `AcpAdapter` has `.asMiddleware()`.
   Note ACP message path: `POST /acp/messages`.
   Note discovery path: `GET /.well-known/acp-agent`.
   Confirm this is NOT a stub (it dispatches to service.handleToolCall).
   If NOT matching → STOP and re-ask Director.

4. Read `packages/agent/src/index.ts`.
   Confirm `getAllAgentMetadata` is exported.
   Note it returns `AgentMetadata[]` (all registered metadata).
   If NOT exported → STOP and re-ask Director.

5. Read `packages/context/src/index.ts`.
   Confirm exports: `createContext`, `provide`, `inject`.
   Note: `provide` is a no-op when `_activeContextMap === null`.
   Note the SSR entry points (`setSsrContextMap`, `runWithContext`) exist
   but are NOT needed for client-side SFC context usage.
   If NOT exported or signature differs → STOP and re-ask Director.

6. Read `examples/blog-loader/` (or the confirmed path for EX-09).
   Find the `@context` block usage pattern (how `provide` is called from
   a parent SFC to make a value available to children).
   Document the exact syntax. Use it verbatim in hub-root.aihu.
   If no `@context` block is found, read
   `examples/blog-loader/src/blog-loader.aihu` and note how context
   is provided. If still unclear → STOP and write investigation page,
   re-ask Director before coding.

Once all 6 checks PASS: write the investigation page with findings
and proceed. If any FAIL: STOP, write investigation page with
FAIL evidence, then re-ask Director before coding.

For all other ambiguities: write a 1-paragraph investigation page at
.context/m2/a2/round-4/builder-investigation-<topic>.md BEFORE
writing code.

Trivial decisions (CSS class naming, placeholder text, badge wording
within the prescribed constraints): just proceed.

ROUND-4 SCOPE (PHASE 1 OF 2)
-----------------------------
This round ships the FOUNDATION slice of EX-07 agent-hub:

  - server.ts (Bun.serve with AgentService + A2A + ACP adapters)
  - hub-root.aihu (main component: getAllAgentMetadata, context, agent-panel)
  - Package scaffold (index.html, package.json, vite.config.ts, vitest.config.ts)
  - Smoke test for hub-root

Round-5 ships a2a-panel.aihu + acp-panel.aihu + their smoke tests +
README row update. DO NOT start a2a-panel.aihu or acp-panel.aihu this
round. They are round-5 work.

WHAT TO BUILD — ROUND 4
------------------------

1. Bun API server — examples/agent-hub/server.ts

   Purpose: hosts AgentService + A2A + ACP adapters.

   Exact structure:
   - Import `createAgentService` from `@aihu/agent-service`
   - Import `mountA2aAdapter` from `@aihu/agent-a2a`
   - Import `mountAcpAdapter` from `@aihu/agent-acp`
   - Import `getAllAgentMetadata` from `@aihu/agent`
   - Call `createAgentService({ manifests: getAllAgentMetadata() })` to
     create the service (snapshots the registry at server start time).
   - Call `mountA2aAdapter(service)` and `mountAcpAdapter(service)`.
   - Call `service.asMiddleware()` for the tool-call route.
   - Serve via `Bun.serve({ port: 5207, async fetch(req) { ... } })`.
   - Middleware chain: try a2a adapter → try acp adapter → try agentMw
     → 404. Pattern:
       const a2aMw = a2a.asMiddleware()
       const acpMw = acp.asMiddleware()
       const agentMw = service.asMiddleware()
       async fetch(req) {
         return (await a2aMw(req))
           ?? (await acpMw(req))
           ?? (await agentMw(req))
           ?? new Response('not found', { status: 404 })
       }
   - Console.log on start: `[agent-hub] API server listening on http://localhost:5207`

2. Main SFC — examples/agent-hub/src/hub-root.aihu

   @state block:
   - Import `getAllAgentMetadata` from `@aihu/agent`
   - Import `createContext`, `provide` from `@aihu/context`
   - Import `signal` from `@aihu/signals'
   - Create context token: `const HubServiceContext = createContext()`
     (typed for AgentService or left untyped — either is fine)
   - $computed:
       agentList: () => getAllAgentMetadata()
       agentCount: () => agentList.length
   - Signal: `const [activeTab, setActiveTab] = signal<'a2a' | 'acp'>('a2a')`
     (for the tab panel, even though a2a/acp panels are round-5 —
      the tab UI scaffold ships now)

   Context provision: follow the @context block pattern from EX-09
   (confirmed from pre-write gate check 6). Provide the hub service
   reference to child sub-components.

   @template block:
   - Page header: "Agent Hub" h1, subtitle "AgentService aggregation demo"
   - A "Registered agents" section showing agentCount and a list of
     agentList entries (tag + describes)
   - A tab bar with "A2A" and "ACP" tabs (clicking sets activeTab signal)
   - Placeholder panels for A2A and ACP tabs:
       - $if={activeTab === 'a2a'}: show a placeholder div "a2a-panel
         (round 5)" with the badge text:
         "A2A: single-shot SSE (multi-frame streaming pending Plan 5.3)"
       - $if={activeTab === 'acp'}: show a placeholder div "acp-panel
         (round 5)" with badge text "ACP: live"
   - Mount `<agent-panel>` at the bottom (import from @shared)
   - Include an @agent block:
       @agent
       $expose agentCount: number of sub-agents registered
       $expose activeTab: currently active protocol tab
       getAgentList: { description: "Return all registered agent metadata" }

   @style block (HARD REQUIREMENTS — do not deviate):
   - ALL CSS must use `var(--token-name)` — NO hardcoded hex values
   - Only tokens from `examples/_shared/tokens.css` (listed in §3 above)
   - DO NOT use `--warning` or `--warning-bg` (not in tokens.css)
   - Must include `@media (max-width: 480px)` block:
       .hub-root { padding: 1rem; }
       .tab-bar { flex-direction: column; }
       (at minimum — expand as needed for usability at 375px)

3. Standard scaffold files:

   a. examples/agent-hub/index.html
      - Standard HTML5 boilerplate
      - Import `tokens.css` via @shared alias:
          <link rel="stylesheet" href="/@shared/tokens.css">
        (Vite alias `@shared` resolves to `examples/_shared/`)
      - Import the SFC entry module
      - Mount `<hub-root>` in body

   b. examples/agent-hub/package.json
      name: "@aihu/example-agent-hub"
      private: true
      scripts:
        "server": "bun --watch server.ts"
        "dev": "concurrently \"bun run server\" \"vite --port 5107\""
        "dev:server": "bun run server"
        "build": "vite build"
        "preview": "vite preview"
        "test": "vitest run"
      dependencies:
        "@aihu/compiler": "workspace:*"
        "@aihu/agent": "workspace:*"
        "@aihu/agent-a2a": "workspace:*"
        "@aihu/agent-acp": "workspace:*"
        "@aihu/agent-service": "workspace:*"
        "@aihu/context": "workspace:*"
      devDependencies:
        "vite": "^5.0.0"
        "vitest": "^2.1.1"
        "concurrently": "^8.0.0"

   c. examples/agent-hub/vite.config.ts
      - `aihuCompilerPlugin()` as before
      - Vite proxy for API routes:
          server: {
            proxy: {
              '/a2a':          'http://localhost:5207',
              '/acp':          'http://localhost:5207',
              '/.well-known':  'http://localhost:5207',
              '/__aihu':       'http://localhost:5207',
            }
          }
      - Vite alias `@shared` → `examples/_shared/` (resolve to absolute path)
      - Standard workspace aliases for @aihu/* packages

   d. examples/agent-hub/vitest.config.ts
      Standard pattern (same as realtime-scores or blog-loader)

4. Smoke test — examples/agent-hub/tests/smoke.test.ts

   Pattern: source-text + registry simulation (same harness as EX-06,
   EX-09, EX-12). NO DOM-mount. NO live server calls. Offline-safe.

   Required assertions (MINIMUM — do not omit any):

   A5-1: hub-root.aihu source contains `getAllAgentMetadata`
         — string .toContain check
   A5-2: hub-root.aihu source contains `createContext`
         — string .toContain check
   A5-3: hub-root.aihu source contains `provide`
         — string .toContain check
   A5-4: hub-root.aihu source contains `@agent`
         — string .toContain check
   A5-5: hub-root.aihu source contains `$expose`
         — string .toContain check
   A5-6: hub-root.aihu source contains `A2A: single-shot SSE`
         — exact substring: "A2A: single-shot SSE (multi-frame streaming pending Plan 5.3)"
         — string .toContain check
   A5-7: hub-root.aihu source contains `ACP: live`
         — string .toContain check
   A5-8: server.ts source contains `mountA2aAdapter`
         — string .toContain check (confirms adapter is imported + called)
   A5-9: server.ts source contains `mountAcpAdapter`
         — string .toContain check
   A5-10: server.ts source contains `5207`
          — string .toContain check (confirms API server port)
   A5-11: registerAgentMetadata() can be called without throwing
          — registry simulation, same pattern as EX-06 weather-card A5-1
          — import { registerAgentMetadata } from '@aihu/agent'
          — call registerAgentMetadata({ tag: 'hub-root', describes: 'test' })
          — assert no throw

   Use `readFileSync` on the SFC and server.ts paths relative to the
   test file. Reference: examples/realtime-scores/tests/smoke.test.ts
   for the exact harness pattern (read that file first as a template).

CONCRETE ACCEPTANCE CRITERIA (runnable, not interpretive)
---------------------------------------------------------
A1. `cd examples/agent-hub && bun run server` starts on port 5207
    without error. `curl http://localhost:5207/.well-known/agent.json`
    returns valid JSON with a `name` field and `capabilities.streaming: true`.
    `curl http://localhost:5207/.well-known/acp-agent` returns valid JSON
    with an `agent_id` field.

A2. `cd examples/agent-hub && bun run dev` starts Vite on port 5107
    and the Bun server on port 5207 without error. Both processes
    start within 5 seconds.

A3. hub-root.aihu exists at `examples/agent-hub/src/hub-root.aihu`.
    Source contains all required substrings (checked by smoke test):
    getAllAgentMetadata, createContext, provide, @agent, $expose,
    "A2A: single-shot SSE (multi-frame streaming pending Plan 5.3)",
    "ACP: live".

A4. hub-root.aihu @style block:
    - No hardcoded hex colors (grep for `#[0-9a-fA-F]{3,6}` in @style
      block — must return 0 matches)
    - Contains `@media (max-width: 480px)` rule
    - Only uses tokens defined in tokens.css (no --warning, no --warning-bg)

A5. `cd examples/agent-hub && bun run test` passes all 11 smoke test
    assertions. No DOM-mount, no live server. Offline-safe.

A6. index.html imports tokens.css via @shared alias.
    `grep -c "tokens.css" examples/agent-hub/index.html` returns ≥ 1.

A7. vite.config.ts includes proxy entries for /a2a, /acp, /.well-known,
    /__aihu pointing to http://localhost:5207.

A8. ALL 8 do-not-break examples pass their smoke tests:
    - examples/live-counter/tests/smoke.test.ts
    - examples/temperature-converter/tests/smoke.test.ts
    - examples/timer/tests/smoke.test.ts
    - examples/todo-mvc/tests/smoke.test.ts
    - examples/color-theme/tests/smoke.test.ts
    - examples/weather-card/tests/smoke.test.ts     (15 tests)
    - examples/blog-loader/tests/smoke.test.ts      (8 tests)
    - examples/realtime-scores/tests/smoke.test.ts  (8 tests)
    Run each via `cd examples/<name> && bun run test`. Report PASS per
    example in the build_manifest.

A9. No new root package.json dep. No new .size-limit.json row.
    All new deps go only in examples/agent-hub/package.json.
    `concurrently` goes in devDependencies only.

FILES BUILDER MAY WRITE (MAY-WRITE)
------------------------------------
- examples/agent-hub/**
    (the full new example directory — server.ts, src/hub-root.aihu,
     package.json, vite.config.ts, vitest.config.ts, index.html,
     README.md, tests/smoke.test.ts)
- .context/m2/a2/round-4/**
    (build_manifest + any investigation pages)

FILES BUILDER MUST NOT WRITE (MUST-NOT-WRITE)
----------------------------------------------
- packages/** (frozen for this round — do not edit any package source)
- apps/docs/** (M3 scope)
- apps/playground/** (cross-track concern)
- examples/_shared/** (no changes needed for round-4 slice; agent-panel
    already has A2A/ACP indicators from round-1; tokens.css is read-only)
- examples/README.md (round-5 scope — README row update after a2a-panel
    and acp-panel are complete)
- Any example directory OTHER than agent-hub:
    Do NOT touch examples/{live-counter,temperature-converter,timer,
    todo-mvc,color-theme,weather-card,blog-loader,realtime-scores,
    hacker-news,blog-router,cf-adapter,plugin-demo,storefront}/
- Root package.json
- .size-limit.json
- .github/workflows/**
- docs/**
- state-aihu-m2-a2.md (Director writes state files, not Builder)

CRITICAL CSS CONSTRAINT (NON-NEGOTIABLE)
-----------------------------------------
The Verifier for round-4.5 will grep hub-root.aihu's @style block for
hardcoded hex values. ANY match against `#[0-9a-fA-F]{3,6}` in an
@style block is an AUTOMATIC FAIL. No exceptions.

Tokens NOT in tokens.css (do NOT use): --warning, --warning-bg, and
any custom token you invent. Map everything to an existing token.

BADGE TEXT CONSTRAINTS (EXACT STRINGS — DO NOT PARAPHRASE)
-----------------------------------------------------------
A2A badge: "A2A: single-shot SSE (multi-frame streaming pending Plan 5.3)"
ACP badge: "ACP: live"

These exact strings must appear in hub-root.aihu source (the smoke test
asserts on them). Do not alter punctuation or capitalization.

STATUS REPORTING
----------------
At the end of round 4, Builder reports in the build_manifest:

STATUS: DONE | PARTIAL | BLOCKED
- Per-acceptance-item PASS/FAIL with evidence:
    A1: PASS/FAIL — evidence: <curl outputs>
    A2: PASS/FAIL — evidence: <process start confirmation>
    A3: PASS/FAIL — evidence: <grep/read confirmation of substrings>
    A4: PASS/FAIL — evidence: <grep for hex in @style + breakpoint confirm>
    A5: PASS/FAIL — evidence: <bun run test output, 11 tests>
    A6: PASS/FAIL — evidence: <grep output>
    A7: PASS/FAIL — evidence: <vite.config.ts proxy block confirmation>
    A8: PASS/FAIL — evidence: <bun run test per example, all 8>
    A9: PASS/FAIL — evidence: <git diff confirming no root deps, no .size-limit.json change>
- Git commit SHA(s): <sha list>
- Slug: aihu/delta/m2/a2/round-4/build-manifest-round-4
- Iron Law investigation page: .context/m2/a2/round-4/builder-investigation-apis.md
  (MUST be present; manifest is incomplete without it)

STANDING IRON LAW PATTERN (codified from rounds 1–3)
-----------------------------------------------------
API-shape questions that are fully deterministic from reading package
source code (no scope or priority judgment required) do NOT need
Director re-ask. Write a 1-paragraph investigation page, resolve from
source, and proceed. Scope or priority questions DO require re-ask.

======================================================================
END BUILDER BRIEF
======================================================================
```

---

## 6. Verifier Sketch — Round 4.5

The Verifier for round 4.5 reads `build-manifest-round-4.md` and performs bidirectional + CSS spot-check verification. **Under-implementation:** independently re-run `cd examples/agent-hub && bun run test` and confirm all 11 assertions pass; directly read `examples/agent-hub/server.ts` and confirm `mountA2aAdapter`, `mountAcpAdapter`, `Bun.serve`, and port `5207` are present; read `examples/agent-hub/src/hub-root.aihu` and confirm all required substrings (`getAllAgentMetadata`, `createContext`, `provide`, `@agent`, `$expose`, exact A2A badge text, exact ACP badge text); read `examples/agent-hub/vite.config.ts` and confirm proxy entries for `/a2a`, `/acp`, `/.well-known`, `/__aihu`; read `examples/agent-hub/index.html` and confirm `tokens.css` import is present. **Over-extension:** run `git diff origin/main...HEAD --name-only` and confirm no file outside `examples/agent-hub/**` and `.context/m2/a2/round-4/**` was modified; specifically grep for `packages/`, `apps/`, `examples/_shared/`, `.size-limit.json`, root `package.json` modifications, and any example directory other than `agent-hub`. **CSS spot-check (new for round 4.5):** grep `hub-root.aihu`'s `@style` block for the pattern `#[0-9a-fA-F]{3,6}` — ANY match is an automatic FAIL; confirm `@media (max-width: 480px)` is present; confirm no `--warning` or `--warning-bg` tokens appear. **Do-not-break verification:** re-run all 8 smoke suites by name and confirm PASS counts match: live-counter (2), temperature-converter (3), timer (3), todo-mvc (7), color-theme (4), weather-card (15), blog-loader (8), realtime-scores (8); any single FAIL is a Verifier-FAIL. Write `verifier-report-round-4.md` at `.context/m2/a2/round-4.5/` with VERIFIED or FAILED status, per-check evidence, and (if FAILED) root cause classification.

---

## 7. STATUS

```
STATUS: DONE
- chosen slice: EX-07 agent-hub (round-4 slice: server.ts + hub-root + scaffold)
- ex-12 css observations: accepted as M4 polish items (do not fix in round 4)
- phasing: 2 rounds (round 4 = server + hub-root; round 5 = a2a-panel + acp-panel)
- server pattern: Bun.serve on port 5207 + Vite proxy on port 5107
- a2a characterization: single-shot SSE, badge text baked into brief as exact string
- acp characterization: live (not a stub), badge text "ACP: live"
- css constraint: no hex fallbacks, tokens.css only, @media breakpoint required
- do-not-break suite: 8 examples (added realtime-scores)
- ready-to-dispatch: YES
```
