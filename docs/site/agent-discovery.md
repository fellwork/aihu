# Agent Discovery & MCP Compliance

aihu is designed from the ground up for the agentic web. Every aihu application automatically exposes standard discovery endpoints that let AI agents find, understand, and call your components as tools — with no manual configuration.

## How AI agents discover aihu apps

Aihu apps expose four discovery endpoints that agents and crawlers check:

| Endpoint | Purpose |
|---|---|
| `/llms.txt` | Human-readable index of docs and links in llmstxt.org format |
| `/llms-full.txt` | Extended index with full package list, examples, and spec links |
| `/.well-known/mcp/server-card.json` | Machine-readable MCP server card (SEP-1649) |
| `/robots.txt` | Agent-friendly crawl directives (RFC 9309) |

All four are generated automatically by `@aihu/agent-readiness` from a single config object. The minimum viable setup is:

```ts
import { createAgentReadinessRoutes } from '@aihu/agent-readiness'
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

The MCP Server Card is a machine-readable JSON document at `/.well-known/mcp/server-card.json` that describes your application's agent capabilities per the SEP-1649 schema.

A minimal server card looks like:

```json
{
  "schema_version": "1.0",
  "name": "My App",
  "summary": "A aihu-powered app.",
  "mcp_endpoint": "https://myapp.workers.dev/mcp",
  "skills": [
    {
      "id": "my-counter",
      "name": "Live Counter",
      "description": "Read and increment a counter"
    }
  ]
}
```

The `skills` array is auto-populated from the `@agent` blocks in your SFCs — the compiler emits an MCP tool schema alongside each compiled component, and `@aihu/agent-readiness` aggregates them at build time.

To configure the server card, pass `AgentReadinessConfig` to `createAgentReadinessRoutes`:

```ts
const ar = createAgentReadinessRoutes({
  name: 'My App',
  version: '1.0.0',
  summary: 'A aihu-powered app.',
  endpoint: 'https://myapp.workers.dev/mcp',
  // Optional: declare skills explicitly (merged with auto-derived from @agent blocks)
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

`@aihu/agent-readiness` generates both files from `LlmsTxtConfig`:

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
import { generateLlmsTxt, generateLlmsFullTxt } from '@aihu/agent-readiness'

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

**Step 2 — Compiler emits `.mcp.json`**

When the Rust SFC compiler processes this file with `BuildTarget.Server` or `BuildTarget.Universal`, it emits a `.mcp.json` sidecar describing the exposed tools:

```json
{
  "tools": [
    {
      "name": "increment",
      "description": "Increment the counter by one",
      "inputSchema": { "type": "object", "properties": {} }
    }
  ],
  "resources": [
    { "name": "count", "description": "Current counter value", "type": "number" }
  ]
}
```

Note: with `BuildTarget.Client`, the `@agent` block is fully elided — no manifest JSON is emitted and no agent code reaches the browser bundle.

**Step 3 — `@aihu/agent-service` exposes via `aihu mcp serve`**

The `@aihu/agent-service` package reads the aggregated tool schemas and exposes them over the MCP protocol. Run:

```bash
aihu mcp serve
```

This starts an MCP-compatible server that AI agents (Claude, GPT, Gemini, etc.) can connect to and call your component actions as tools.

**Step 4 — Live-binding connects tools to the running component**

When an AI agent calls the `increment` tool, `@aihu/agent-service` uses the live-binding registry (RFC APPROVED) to find the running component instance and call the action against its actual signal graph — the UI updates in real time.

## Testing compliance

All compliance checks are backed by vitest test suites that run as part of `bun run test`. The test files serve as the executable specification:

| Suite | File | Tests |
|---|---|---|
| llms.txt format | `packages/agent-readiness/tests/compliance/llms-txt-spec.test.ts` | 9 |
| MCP Server Card (SEP-1649) | `packages/agent-readiness/tests/compliance/mcp-server-card-schema.test.ts` | 14 |
| robots.txt (RFC 9309) | `packages/agent-readiness/tests/compliance/robots-rfc9309.test.ts` | 7 |
| isitagentready.com checklist | `packages/agent-readiness/tests/compliance/isitagentready.test.ts` | 7 |
| SSR output structure | `packages/server/tests/compliance/ssr-output.test.ts` | 12 |

Run all compliance checks:

```bash
bun run test       # TS + Rust unit, integration, and compliance suites
bun run test:quality   # Lighthouse gate (≥ 90 on perf/a11y/best-practices/seo)
```

## isitagentready.com

Aihu passes all 7 checks on [isitagentready.com](https://isitagentready.com). The checks are exercised by the compliance test suite at `packages/agent-readiness/tests/compliance/isitagentready.test.ts`. The seven gates are:

1. `llms.txt` present at root
2. `llms.txt` first line is `# <Name>`
3. `/.well-known/mcp/server-card.json` returns valid JSON
4. MCP server card contains `mcp_endpoint`
5. `robots.txt` present and allows AI agents
6. App sets `X-Agent-Friendly: true` response header
7. MCP endpoint responds to `POST` with a valid tool-list response
