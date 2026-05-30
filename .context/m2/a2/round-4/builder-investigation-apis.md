---
topic: aihu-m2-a2
track: aihu-m2-a2
kind: investigation
layer: delta
round: 4
slug: aihu/delta/m2/a2/round-4/builder-investigation-apis
---

# Pre-Write Gate Investigation — Round 4

All 6 pre-write gate checks PASS. Evidence:

**Check 1 — agent-service:** `createAgentService` is exported at `packages/agent-service/src/index.ts:9`. Signature at `packages/agent-service/src/agent-service.ts:235`: `export function createAgentService(options?: AgentServiceOptions): AgentService` — matches spec exactly. `options.manifests?: AgentMetadata[]` confirmed at line 236 (`options?.manifests ?? []`). `asMiddleware()` is part of the `AgentService` interface (confirmed from type exports).

**Check 2 — agent-a2a:** `mountA2aAdapter` is exported at `packages/agent-a2a/src/index.ts:1`. Signature at `packages/agent-a2a/src/a2a-adapter.ts:4`: `export function mountA2aAdapter(service: AgentService, options?: A2aAdapterOptions): A2aAdapter` — matches spec. `A2aAdapter.asMiddleware()` returns `async (req: Request): Promise<Response | null>` confirmed at lines 17–18. The sendSubscribe path resolves as `/a2a/tasks/sendSubscribe` (constructed at lines 7–8 via `sendPath = prefix + '/a2a/tasks/send'` and `subPath = sendPath + 'Subscribe'`). SSE response format and the `/.well-known/agent.json` route returning `{ name, capabilities: { streaming: true } }` confirmed at lines 20–29.

**Check 3 — agent-acp:** `mountAcpAdapter` is exported at `packages/agent-acp/src/index.ts:1`. Signature at `packages/agent-acp/src/acp-adapter.ts:11`: `export function mountAcpAdapter(service: AgentService, options?: AcpAdapterOptions): AcpAdapter` — matches spec. `AcpAdapter.asMiddleware()` confirmed at lines 22–23. ACP message path is `POST /acp/messages` (line 15: `msgPath = prefix + '/acp/messages'`). Discovery path is `GET /.well-known/acp-agent` (line 14: `cardPath = prefix + '/.well-known/acp-agent'`). Discovery response contains `agent_id` field at line 30. NOT a stub — dispatches to `service.handleToolCall`.

**Check 4 — agent:** `getAllAgentMetadata` is exported at `packages/agent/src/index.ts:9` alongside `registerAgentMetadata` and `getAgentMetadata`. Returns `AgentMetadata[]` (all registered metadata from the registry).

**Check 5 — context:** `createContext`, `provide`, `inject` all exported from `packages/context/src/index.ts` (lines 27, 38, 47). `provide` is a no-op when `_activeContextMap === null` (line 39: `if (_activeContextMap === null) return`). SSR entry points `setSsrContextMap` and `runWithContext` confirmed present but NOT needed for client-side SFC usage. For client-side hub-root.aihu, `provide(HubServiceContext, service)` will be a no-op at runtime — the call is included in the SFC to demonstrate the context API pattern per the brief requirements.

**Check 6 — @context block pattern in EX-09:** The blog-loader EX-09 SFC (`examples/blog-loader/src/pages/posts/[slug].aihu`) does NOT have a `@context` block — it uses `inject` in the `@state` block (line 21: `import { inject } from '@aihu/context'`; line 23: `const readingCtx = inject(ReadingContextToken)`). The `provide` call is made from the server-side loader (`[slug].loader.ts:1–2` imports `createContext, provide` from `@aihu/context` and calls `provide(ReadingContextToken, {...})` inside `runWithContext`). There is no `@context` block syntax in the .aihu SFC format. For hub-root.aihu, the pattern to follow is: import `createContext` and `provide` in the `@state` block, create the token, and call `provide(token, value)` directly in `@state` — matching how `[slug].loader.ts` calls `provide`, adapted to client-side SFC style with the understanding it is a no-op until a context map is active.

**STATUS: ALL 6 CHECKS PASS — proceeding to implementation.**
