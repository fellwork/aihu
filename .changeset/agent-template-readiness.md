---
'@aihu/cli': minor
---

**`--template agent`: give the agent template an agent-readiness surface, and fix its gate.**

The template named for agents was the only one with no discovery surface — the generic
`full` template had one, `agent` had none. An agent handed the app's URL could not find
out what the app was or how to call it. It now serves the full surface, and two of its
own headline flows that were broken are fixed.

**Discovery, served live rather than emitted statically.** `readiness.ts` wires
`@aihu-plugin/agent-readiness`'s `createAgentReadinessRoutes()` into `server.ts` and
`mcp.ts`, and `vite.config.ts` proxies the paths so they answer on the app's own URL:

| Path | Content-Type |
| --- | --- |
| `/llms.txt`, `/llms-full.txt`, `/robots.txt` | `text/plain` |
| `/sitemap.xml` | `application/xml` |
| `/.well-known/mcp/server-card.json` | `application/json` |
| `/.well-known/agent-card.json` (+ the deprecated `/.well-known/agent.json` alias) | `application/json` |
| `/.well-known/mcp.json` | `application/json` |

This template deliberately does not use `viteAgentReadinessIntegration()` the way
`minimal`/`full`/`docs` do. That integration emits the documents from a browser-target
build, where the `@aihu/agent` registry is empty — the files would exist and advertise
zero tools. Serving them from the process that calls `registerAgentMetadata()` means the
MCP card's tools, the A2A card's skills and llms.txt's `## Components` section are all
derived from the same registry the `/agent/call` gate authorizes against, so the
advertised surface cannot drift from the callable one.

Also in this template:

- **`/agent/call` was returning 401 `AUTH_UNVERIFIABLE` for every call**, authorized or
  not — the whole documented 404/401/403/429/200 ladder was dead. `@aihu/agent-service`
  will not serve a scoped or rate-limited tool through an auth plugin that cannot
  signature-verify a credential, and the template's demo plugin only implemented
  `checkScope`. It now implements `verify` as well.
- **The A2A card was emitted with no skills**; it is now handed the registry-derived list,
  so both cards describe the same surface.
- `registerAgentMetadata` actions carry their `describe:` text, so the MCP tool
  descriptions are populated instead of empty strings.
- Documented that `/agent/call` always answers HTTP 200 with the outcome in the body's
  `code`, and that the rate-limit key is the verified subject — not the caller-supplied
  `userId`, which rotating does not reset the quota.
