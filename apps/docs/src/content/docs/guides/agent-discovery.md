# Agent Discovery & MCP Compliance

aihu is designed for the agentic web. When you opt in to the `@aihu-plugin/agent-readiness` integration, an aihu app can expose a set of standard discovery endpoints that let AI agents find, understand, and call your components as tools.

> **🚧 Opt-in, not automatic.** These endpoints are **not** exposed by default and there is no zero-config path today. You must add the `@aihu-plugin/agent-readiness` integration and either use its Vite plugin (`viteAgentReadinessIntegration()`) or hand-wire its route handlers (shown below).

## How AI agents discover aihu apps

With the integration enabled, an aihu app can serve four core discovery endpoints that agents and crawlers check:

| Endpoint | Purpose |
|---|---|
| `/llms.txt` | Human-readable index of docs and links in llmstxt.org format |
| `/llms-full.txt` | Extended index with full package list, examples, and spec links |
| `/.well-known/mcp/server-card.json` | Machine-readable MCP server card (SEP-1649) |
| `/robots.txt` | Agent-friendly crawl directives (RFC 9309) |

These four endpoints are produced by `@aihu-plugin/agent-readiness`. In a Vite app, `viteAgentReadinessIntegration()` serves them automatically in dev and emits them as static assets at build. For a server/edge app there is no auto-wiring — you hand-wire each route yourself. The minimum viable setup is:

```ts
import { createAgentReadinessRoutes } from '@aihu-plugin/agent-readiness'
import { createRequestRouter, defineRoute } from '@aihu/server'

const ar = createAgentReadinessRoutes({
  name: 'My App',
  endpoint: 'https://myapp.workers.dev/mcp',
  summary: 'A aihu-powered app.',
})

const router = createRequestRouter({
  routes: [
    defineRoute('/llms.txt', ar.llmsTxt),
    defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
    defineRoute('/robots.txt', ar.robotsTxt),
  ],
})
```

This works on Cloudflare Workers, Bun, and Deno — anywhere with a fetch-API request handler.

## The MCP Server Card

The MCP Server Card is a machine-readable JSON document at `/.well-known/mcp/server-card.json` that describes your application's agent capabilities.

> **⚠️ Not a ratified spec artifact.** Earlier drafts of these docs described this card as "SEP-1649 compliant." That is inaccurate: SEP-1649 is a **closed** proposal and its successor (SEP-2127) has been moved off the MCP Standards Track. This card is aihu's **own** documented shape — useful to agents that know to look for it, but do not describe it as MCP-spec compliant.

A minimal server card looks like:

```json
{
  "$schema": "https://modelcontextprotocol.io/schemas/server-card/v1.0",
  "version": "1.0",
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "My App",
    "version": "0.0.0",
    "description": "A aihu-powered app."
  },
  "transport": {
    "type": "streamable-http",
    "url": "https://myapp.workers.dev/mcp"
  },
  "capabilities": { "tools": true, "resources": false, "prompts": false }
}
```

When skills are present, they are emitted under a top-level `tools` array (each entry is `{ "name", "description" }`). There is no top-level `skills`, `mcp_endpoint`, or `schema_version` key in the emitted output — the MCP endpoint URL lives at `transport.url`.

> **🚧 Partial — skills are not yet auto-aggregated at build time (tracked in #430 / DE4).** The generator derives its `tools` from the `@aihu/agent` runtime registry (`skillsFromRegistry()`), which is populated only when your compiled component modules are evaluated in the same process. The standard Vite build path does **not** import your components while emitting the card, and nothing yet reads the compiler's `agent-manifest.json` sidecar — so in practice you declare skills explicitly in config (they are hand-mirrored, e.g. in `vite.config.ts`). Build-time auto-population from `@agent` blocks is **planned, not shipped**.

To configure the server card, pass `AgentReadinessConfig` to `createAgentReadinessRoutes`:

```ts
const ar = createAgentReadinessRoutes({
  name: 'My App',
  version: '1.0.0',
  summary: 'A aihu-powered app.',
  endpoint: 'https://myapp.workers.dev/mcp',
  // Declare skills explicitly — today this is the source of truth for the card.
  // (Auto-derivation from @agent blocks at build time is planned — #430.)
  skills: [
    { id: 'counter', name: 'Counter', description: 'Read and set counter value' },
  ],
})
```

### Auth configuration (opt-in)

By default the MCP endpoint is public (no-auth, Option A). To require OAuth 2.0 (Option C per RFC 9728):

```ts
const ar = createAgentReadinessRoutes({
  name: 'My App',
  endpoint: 'https://myapp.workers.dev/mcp',
  auth: {
    type: 'oauth2',
    authorizationUrl: 'https://auth.myapp.com/authorize',
    tokenUrl: 'https://auth.myapp.com/token',
    scopes: ['mcp:read', 'mcp:write'],
  },
})
```

## llms.txt

The `llms.txt` file at the app root follows the [llmstxt.org](https://llmstxt.org) specification. It gives AI coding assistants a structured map of your app's documentation and endpoints.

### Format

The file uses a small Markdown subset:

- First line: `# <Name>` (H1 heading — the app name)
- Optional second non-blank line: `> <tagline>` (blockquote summary)
- Sections: `## <Section Title>` (H2 headings)
- Links: `- [Title](URL)` or `- [Title](URL): Optional description`
- An optional `## Optional` section at the end (for supplementary links)

The `llms-full.txt` variant follows the same format but uses `## More` instead of `## Optional` for the trailing section, and typically includes more links (all packages, examples, spec files).

### LlmsTxtConfig type

`@aihu-plugin/agent-readiness` generates both files from `LlmsTxtConfig`:

```ts
interface LlmsTxtLink {
  readonly title: string
  readonly url: string
  readonly description?: string
}

interface LlmsTxtSection {
  readonly title: string
  readonly links: ReadonlyArray<LlmsTxtLink>
}

interface LlmsTxtConfig {
  readonly name: string
  readonly summary?: string
  readonly sections: ReadonlyArray<LlmsTxtSection>
  readonly optional?: ReadonlyArray<LlmsTxtLink>
}
```

To generate the files programmatically:

```ts
import { generateLlmsTxt, generateLlmsFullTxt } from '@aihu-plugin/agent-readiness'

const config: LlmsTxtConfig = {
  name: 'My App',
  summary: 'A aihu-powered app.',
  sections: [
    {
      title: 'Getting Started',
      links: [
        { title: 'Installation', url: 'https://myapp.com/docs/install' },
        { title: 'Quickstart', url: 'https://myapp.com/docs/quickstart' },
      ],
    },
  ],
  optional: [
    { title: 'Contributing', url: 'https://github.com/org/myapp/blob/main/CONTRIBUTING.md' },
  ],
}

const llmsTxt = generateLlmsTxt(config)      // uses "## Optional"
const llmsFullTxt = generateLlmsFullTxt(config) // uses "## More"
```

The `llmsSections` and `llmsOptional` fields on `AgentReadinessConfig` feed directly into these generators, so you can customize the content without calling the generators manually.

## robots.txt

Aihu generates an agent-friendly `robots.txt` per RFC 9309. The default (`aiAgents: 'allow-all'`) produces directives that permit all compliant AI agents to crawl your app:

```
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /
```

To restrict AI agent access, set `aiAgents: 'disallow-all'` or `aiAgents: 'allow-verified'`. You can also add custom rules for specific bots via `standardBots`:

```ts
const ar = createAgentReadinessRoutes({
  name: 'My App',
  endpoint: 'https://myapp.workers.dev/mcp',
  aiAgents: 'allow-all',
  standardBots: [
    { userAgent: 'Googlebot', allow: ['/'], disallow: ['/admin'] },
  ],
  sitemap: 'https://myapp.com/sitemap.xml',
})
```

## Calling aihu components as MCP tools

Agent-callable components are the core proposition of aihu. Here is the end-to-end flow:

**Step 1 — Declare an agent surface in the SFC**

Add an `@agent` block and expose actions from `@state`:

```
@state {
  $prop: {
    count: { default: 0, type: "number", expose: { read: true } }
  }

  $action: {
    increment: {
      describe: "Increment the counter by one",
      expose: { write: true },
      handler: () => setCount(count() + 1),
    },
  }
}

@agent {
  $describe: "A simple counter component"
}
```

**Step 2 — Compiler emits `agent-manifest.json`**

When the Rust SFC compiler processes this file with `BuildTarget.Server` or `BuildTarget.Universal`, it emits an `agent-manifest.json` sidecar (one per output directory) describing the exposed surface. The real shape is aihu's own — it is **not** an MCP `.mcp.json` document:

```json
{
  "tools": [
    {
      "name": "live_counter",
      "tag": "live-counter",
      "inputs": {},
      "actions": {
        "increment": { "returns": {}, "describe": "Increment the counter by one" }
      },
      "state": { "count": "Current counter value" }
    }
  ]
}
```

> **🚧 `agent-manifest.json` currently has no consumers.** The compiler emits this sidecar, but nothing in the runtime or the agent-readiness build path reads it yet. The live agent surface is wired instead through the `registerAgentMetadata(...)` call the compiler also emits (see [Authoring Agents](./authoring-agents.md) §3) and the `__agentBinding` server export. Giving this file a consumer — and using it to auto-populate the server card's skills — is planned (#430).

Note: with `BuildTarget.Client`, the `@agent` block is fully elided — no manifest JSON is emitted and no agent code reaches the browser bundle.

**Step 3 — `@aihu/agent-service` exposes tools over HTTP**

The `@aihu/agent-service` package reads the aggregated tool schemas (from the `@aihu/agent` registry) and dispatches agent tool calls to live components. You expose it by mounting its middleware — `service.asMiddleware()` handles `POST /__aihu/tools/call` — or by wrapping it with the A2A / ACP protocol adapters (see [Authoring Agents](./authoring-agents.md) §4, §9).

> **⚠️ `aihu mcp serve` does NOT serve your component actions.** That command starts an unrelated authoring-helper stdio server whose only tools are `aihu_example` and `aihu_validate` (see [Authoring Agents](./authoring-agents.md) §8). It exists for AI coding assistants writing `.aihu` files — it is not a runtime bridge to your running components.

**Step 4 — Live-binding connects tools to the running component**

When an AI agent calls the `increment` tool, `@aihu/agent-service` uses the live-binding registry (RFC APPROVED) to find the running component instance and call the action against its actual signal graph — the UI updates in real time.

## Testing compliance

All compliance checks are backed by vitest test suites that run as part of `bun run test`. The test files serve as the executable specification:

| Suite | File | Tests |
|---|---|---|
| llms.txt format | `packages/plugin-agent-readiness/tests/compliance/llms-txt-spec.test.ts` | 9 |
| MCP Server Card (aihu shape) | `packages/plugin-agent-readiness/tests/compliance/mcp-server-card-schema.test.ts` | 14 |
| robots.txt (RFC 9309) | `packages/plugin-agent-readiness/tests/compliance/robots-rfc9309.test.ts` | 7 |
| isitagentready.com checklist | `packages/plugin-agent-readiness/tests/compliance/isitagentready.test.ts` | 7 |
| SSR output structure | `packages/server/tests/compliance/ssr-output.test.ts` | 12 |

Run all compliance checks:

```bash
bun run test       # TS + Rust unit, integration, and compliance suites
bun run test:quality   # Lighthouse gate (≥ 90 on perf/a11y/best-practices/seo)
```

## isitagentready.com

The compliance test suite at `packages/plugin-agent-readiness/tests/compliance/isitagentready.test.ts` exercises the generated endpoints. What that suite actually asserts today:

1. `GET /llms.txt` → 200 `text/plain`, first line `# <Name>`
2. `GET /llms-full.txt` → 200, no `## Optional` heading
3. `GET /.well-known/mcp/server-card.json` → 200 JSON, valid against the (aihu-shape) `McpServerCard`
4. `GET /robots.txt` → 200 `text/plain` with `User-agent` entries
5. `GET /about` with `Accept: text/markdown` → `text/markdown` (content negotiation)
6. `GET /about` with `Accept: text/html` → falls through to the HTML route
7. `GET /.well-known/mcp/server-card.json` → 404 when no `endpoint` is configured

> **⚠️ Corrected.** Earlier drafts listed gates that do not exist in the code — an `X-Agent-Friendly: true` response header and an `mcp_endpoint` field on the card (the real field is `transport.url`), plus a `POST` tool-list gate. No `X-Agent-Friendly` header is emitted anywhere in the codebase; do not rely on it. The claim that aihu "passes all 7 checks on [isitagentready.com](https://isitagentready.com)" is **unverified against the live service** — it is asserted only by the in-repo test suite above.
