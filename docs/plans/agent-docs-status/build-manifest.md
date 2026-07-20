# Build manifest — agent docs status markers (#431)

Audit of `docs/site/agent-discovery.md` and `docs/site/authoring-agents.md` (mirrored to
`apps/docs/src/content/docs/guides/`) against actual source. Every claim below was verified
against code before editing; the doc prose was treated as the thing under audit, not as truth.

## Files changed (docs only)

- `docs/site/agent-discovery.md`
- `docs/site/authoring-agents.md`
- `apps/docs/src/content/docs/guides/agent-discovery.md` (mirror — byte-identical to site)
- `apps/docs/src/content/docs/guides/authoring-agents.md` (mirror — byte-identical to site)
- `docs/plans/agent-docs-status/build-manifest.md` (this file)

The two doc pairs were byte-identical before editing and are kept byte-identical after
(edited in `docs/site/`, then copied over the `apps/docs` mirror; `diff` confirms zero drift).

## The four known contradictions

### 1. "Every aihu application automatically exposes standard discovery endpoints … with no manual configuration" — CORRECTED

- **Old:** "Every aihu application automatically exposes standard discovery endpoints that let AI
  agents find, understand, and call your components as tools — with no manual configuration."
- **New (agent-discovery.md ¶1 + marker):** "When you opt in to the `@aihu-plugin/agent-readiness`
  integration, an aihu app can expose a set of standard discovery endpoints…" + `> **🚧 Opt-in,
  not automatic.** These endpoints are **not** exposed by default and there is no zero-config path
  today. You must add the … integration and either use its Vite plugin … or hand-wire its route
  handlers."
- **Verified against:** `packages/plugin-agent-readiness/src/vite-plugin.ts`
  (`createAgentReadinessRoutes` returns handlers the caller must `defineRoute`-wire by hand;
  server/edge has no auto-injection), `types.ts` (auth/no-auth is opt-in). The `viteAgentReadinessIntegration()`
  path does auto-serve the four core endpoints, so the corrected text distinguishes the Vite path
  (auto) from the server/edge path (hand-wired) — both gated on opting into the integration.
- Also softened the parallel over-claim in **authoring-agents.md §10** ("Every aihu application ships
  these agent-readiness endpoints by contract" → `> **🚧 Opt-in, not "by contract."** …`).

### 2. "The `skills` array is auto-populated from the `@agent` blocks … aggregated at build time" — MARKED PLANNED (#430 / DE4)

- **Old:** "The `skills` array is auto-populated from the `@agent` blocks in your SFCs — the compiler
  emits an MCP tool schema alongside each compiled component, and `@aihu-plugin/agent-readiness`
  aggregates them at build time."
- **New (agent-discovery.md, marker at server-card section):** `> **🚧 Partial — skills are not yet
  auto-aggregated at build time (tracked in #430 / DE4).** The generator derives its `tools` from the
  `@aihu/agent` runtime registry (`skillsFromRegistry()`), which is populated only when your compiled
  component modules are evaluated in the same process. The standard Vite build path does **not** import
  your components while emitting the card, and nothing yet reads the compiler's `agent-manifest.json`
  sidecar — so in practice you declare skills explicitly in config (they are hand-mirrored, e.g. in
  `vite.config.ts`). Build-time auto-population from `@agent` blocks is **planned, not shipped**.`
- **Verified against:** `mcp-server-card.ts` (`skillsFromRegistry()` reads the runtime registry, not a
  build-time aggregation of `agent-manifest.json`); `docs/architecture/thesis.md` §Derived (lists
  "server-card `skills` hand-mirrored in `vite.config.ts`" as an open gap); `TODOS.md`;
  `docs/plans/2026-07-19-twenty-issue-remediation.md` #5 ("makes the docs' 'aggregated at build time'
  claim true" — i.e. it is not true yet). The `registerAgentMetadata` wire exists
  (`.changeset/agent-metadata-describe-wire.md`, `compiler/src/codegen/emit.rs`), but that populates the
  *runtime* registry, not the build-time card.
- Also softened the inline config comment ("merged with auto-derived from @agent blocks" → "today this
  is the source of truth … auto-derivation … is planned — #430").

### 3. `.mcp.json` sidecar that does not exist — CORRECTED (real file is `agent-manifest.json`)

- **Old (both files):** the compiler emits a `.mcp.json` sidecar, with a `{ tools:[{name,description,
  inputSchema}], resources:[…] }` (agent-discovery) / `{ tag, tools:[{name,description,inputSchema}] }`
  (authoring §7) shape.
- **New:** filename corrected to `agent-manifest.json` in all mentions (opening ¶, key-properties bullet,
  §7 heading "Compiler-emitted agent manifest", Step 2 of the MCP-tools flow). JSON replaced with the
  real emitted shape: `{ "tools": [ { "name": "<tag_underscored>", "tag", "inputs": {}, "actions":
  { "<name>": { "returns": {}, "describe": "…" } }, "state": { … } } ] }`. Added marker: `> **🚧
  `agent-manifest.json` currently has no consumers.** … The live agent surface is wired instead through
  `registerAgentMetadata(...)` … and `__agentBinding` …`
- **Verified against:** `packages/compiler/src/bin/main.rs:479` (`format!("{}/agent-manifest.json", dir)`);
  `packages/compiler/src/codegen/emit.rs` `emit_manifest` (final `format!` assembling
  `{ "tools":[{ "name","tag","inputs","actions","state"[,"scope","rateLimit","streamOutput"] }] }`);
  `TODOS.md` ("nothing in the repo reads `agent-manifest.json` anyway").

### 4. `MarkdownResolver` has no concrete impl / content negotiation is Accept-only, no UA sniff — ISSUE PREMISE IS STALE; docs make no such claim

- **Finding:** the issue's claim-4 description is out of date relative to `main`. The code now has a
  concrete `RouteMarkdownResolver implements MarkdownResolver` (`markdown-resolver.ts`, exported from
  `index.ts`), and `content-negotiation.ts` **does** UA-sniff (`isAiCrawlerUserAgent`, `userAgentFallback`
  defaults to `true`) — so a recognized AI crawler that omits `Accept` receives markdown, not HTML.
- **Doc action:** none needed. **Neither doc mentions `MarkdownResolver` or content negotiation at all**,
  so there is no false claim in the docs to correct or mark. Adding a "planned" marker would be inventing
  content, and the underlying capability actually ships. Left untouched deliberately.
- **Verified against:** `packages/plugin-agent-readiness/src/content-negotiation.ts` (UA fallback
  default-true, `negotiate()` precedence), `markdown-resolver.ts` (concrete `RouteMarkdownResolver`),
  and the isitagentready compliance test (asserts `Accept: text/markdown` → markdown and
  `Accept: text/html` → HTML fallthrough), confirming content negotiation is shipped and tested.

## Additional inaccuracies found beyond the four (all corrected/marked)

- **MCP Server Card JSON shape was entirely wrong.** Doc showed `{schema_version, name, summary,
  mcp_endpoint, skills}`; real emitted shape is `{$schema, version, protocolVersion, serverInfo,
  transport:{type,url}, capabilities, tools?, auth?}`. Replaced with the real shape and noted the MCP
  endpoint URL lives at `transport.url`. Source: `mcp-server-card.ts`.
- **"SEP-1649 compliant" is false.** Source comment in `mcp-server-card.ts` states SEP-1649 is CLOSED
  and SEP-2127 moved off the Standards Track: "Do not describe this card as SEP-1649/spec compliant."
  Added `> **⚠️ Not a ratified spec artifact.**` and relabeled every "SEP-1649" mention (server-card
  section, test table, §10 table, isitagentready checklist) to "aihu shape (not MCP-spec)".
- **`aihu mcp serve` does NOT serve component actions.** agent-discovery Step 3 claimed it exposes your
  components over MCP. Real `aihu mcp serve` (`packages/mcp/src/index.ts`) is an authoring stdio server
  with only `aihu_example` / `aihu_validate`. Corrected Step 3 to route agent-service via HTTP middleware
  (`asMiddleware()` → `POST /__aihu/tools/call`) / A2A-ACP adapters, and added a `⚠️` marker.
- **isitagentready 7-gate list was fabricated.** Real `isitagentready.test.ts` asserts different gates
  (no `X-Agent-Friendly` header — none exists in the codebase; no `mcp_endpoint` card field — real field
  is `transport.url`; includes content-negotiation gates instead). Replaced with the actual assertions
  and added a `⚠️ Corrected` marker; downgraded "passes all 7 checks on isitagentready.com" to
  "unverified against the live service."
- **OAuth card over-advertisement.** authoring §6 said the card "includes public OAuth URLs only."
  Real card emits only `auth.authorizationServer` (the `tokenUrl` origin) and deliberately does not
  advertise `/.well-known/oauth-*` documents. Corrected. Source: `mcp-server-card.ts`.

## Not changed (verified accurate or out of scope)

- **A2A adapter route `/.well-known/agent.json` (authoring §9).** Accurate for the `@aihu/agent-a2a`
  package: `packages/agent-a2a/src/a2a-adapter.ts:45` serves exactly this path. (Note: the *plugin's*
  own a2aCard uses the newer canonical `/.well-known/agent-card.json` with `agent.json` as a deprecated
  alias — a different package. §9 documents the adapter, so it is left as-is and correct.)
- **Live-binding (§5), `registerAgentMetadata` (§3), `__agentBinding` client-elision (§7).** Verified
  emitted by the compiler (`emit.rs`) and confirmed by the describe-wire changeset. Left as-is.
- **Test-count numbers in the compliance table.** Test files exist; exact per-file counts not
  independently recounted (low value, no false capability claim). Only the "SEP-1649" label was fixed.

## Out-of-scope code work surfaced (left doc-marked, per constraints)

- #430 / DE4: make `agent-manifest.json` a consumer and auto-populate server-card skills at build time
  (would make claim 2 true). Docs marked "planned" pending this.
- No `X-Agent-Friendly` response header exists; if it is desired for isitagentready gate 6, that is a
  code change. Docs no longer assert it.
