# Architecture Spec — SOTA Plugins + Magna Integration

**Author:** Architect A3 · **Date:** 2026-05-05
**Inputs:** scout-aihu §1E, §4G · scout-magna full
**Constraints:** dep-free thesis, plugin contract spec, macro vocabulary spec, magna v0.1 limits

## 0. Three Non-Negotiables

1. **Dep-free thesis** — `@aihu/*` packages have ZERO non-`@aihu/*` runtime deps. Plugins expose interfaces; apps wire SDK implementations (Stripe, jose, etc.).
2. **`handleToolCall` stub** — all agent tool plugins are dead weight until live-binding is real. **Live-binding architecture is the keystone of this entire work-stream and is specified in §3.**
3. **Magna v0.1 gaps** — no FTS, no pgvector, no upsert, no bulk ops, `RemoteExtension` field-gen unfinished. Plugins gate on magna v0.2 explicitly.

## 1. Plugin Matrix

| Domain | Package | Magna integration | Browser budget | Spec status | Live-binding required |
|---|---|---|---|---|---|
| Search | `@aihu/search` | TIER-3-WEBHOOK (Typesense/Algolia now) → TIER-1-EXTENSION (FTS v0.2) | ~2 kB | YELLOW | Yes |
| SEO | `@aihu/seo` | DATA-SOURCE | build-only | GREEN | No |
| Scraping control | `@aihu/scraping` | NONE (v0.1) → TIER-1 (`trusted_documents_only` v0.2) | build-only | GREEN | No |
| Auth | `@aihu/auth` | DATA-SOURCE (JWT relay → RLS) | ~1.5 kB | GREEN — strongest fit | Yes (scope/rate-limit) |
| ACP extension | `@aihu/agent-acp-ext` | TIER-3-WEBHOOK + NOTIFY bridge | server-only | YELLOW | Yes |
| Data interfacing | `@aihu/magna` (bridge) | TIER-1-EXTENSION + NAPI-BUILD-TIME | ~1.8 kB | GREEN | Yes |
| Commerce | `@aihu/commerce` | DATA-SOURCE + TIER-3-WEBHOOK (Stripe) | ~2.5 kB | YELLOW (v0.2 upsert/bulk) | Yes |

## 2. Per-Plugin Design

### 2.1 `@aihu/search`
- **Public API:** `search({ provider: 'typesense'|'algolia'|'magna-fts', endpoint, apiKey, indexes })`; runtime `createSearchResource`, `searchClient`; macro `$resource results = search.query({...})`
- **Server:** `GET /__aihu/search/query` (proxy, strips API key, rate-limits per user); `POST /__aihu/search/index` (service-role only)
- **Client:** `<SearchBox>`, `<SearchResults>`, `<SearchHighlight>` (~1.1 kB) + `createSearchResource` (~900 B)
- **Build-time:** `beforeCompile` validates indexes against magna SDL (when `magna-fts`); `$resource search.*` macro lowering
- **Magna path:** v0.1 → Typesense/Algolia webhook via `magna-remote` `WebhookRequest` envelope. v0.2 → Tier-1 `SchemaExtension` with `Query.searchPosts(q, index): SearchConnection` running `tsvector @@ tsquery` via raw `Arc<QueryExecutor>` SQL. **pgvector NOT in scope** — separate `@aihu/semantic-search` plugin (M4).
- **Live-binding:** `<SearchBox>` `$action search()` requires real component reach
- **AgentManifest:** `tool: "search-box/search"`, args `{ query, index, page }`

### 2.2 `@aihu/seo`
- **Public API:** `seo({ siteName, baseUrl, defaultImage, sitemapSources, llmsTxtExtensions, structuredData })`
- **Server:** `GET /sitemap.xml` (paginated), `GET /sitemap-{n}.xml`, `GET /llms.txt` (delegates to `@aihu/agent-readiness`), `GET /robots.txt` (delegated)
- **Client:** None (build-time only)
- **Build-time:** `afterParse` augments `$meta` macro to emit JSON-LD `<script type="application/ld+json">`; canonical URL injection from `@route` block; OG tag generation
- **Magna path:** DATA-SOURCE — sitemap queries `Query.allPosts(orderBy: UPDATED_AT_DESC, first: 1000, after: cursor)` for pagination
- **Live-binding:** Not required

### 2.3 `@aihu/scraping`
- **Public API:** `scraping({ rateLimit: { default, perBot, perIp, trusted }, trustedTokens, allowedBots, blockedBots, trustHeader })`
- **Server middleware** (stage `before-handler`): User-Agent vs combined `AI_BOT_LIST` + `blockedBots`, evaluates `X-Scrape-Token`, sliding-window in-memory rate counter, returns 429/403, decorates response with `X-Robots-Tag: noai` on untrusted bots
- **Build-time:** validates no overlap between `allowedBots` and `AI_BOT_LIST`. v0.2: when magna `trusted_documents_only` ships, `beforeCompile` writes allowed operations to magna config
- **Live-binding:** Not required

### 2.4 `@aihu/auth` 🟢🟢 STRONGEST FIT
- **Public API:** `auth({ jwtSecret, jwtAlgorithm, scopes, loginPath, cookieName, cookieOptions })`; runtime `getAuthState`, `signIn`, `signOut`, `useCurrentUser`; macros `$auth.session()`, `$auth.currentUser()` (RFC-001)
- **Server:** before-handler middleware extracts JWT (cookie or Authorization header), validates with `jwtSecret`, attaches `JwtClaims` to request context. Routes: `POST /__aihu/auth/sign-in`, `POST /__aihu/auth/sign-out`, `GET /__aihu/auth/me`. Helpers: `requireAuth(req)`, `requireScope(req, scope)`.
- **Client:** Reactive auth signal, `<$guard scope="X" redirect="/login">` enforcement (this plugin makes `<$guard>` real, not decorative)
- **Build-time:** Validates `$scope` declarations in `@agent` blocks against config; generates `User` type from claims shape
- **Magna path:** DATA-SOURCE — `Authorization: Bearer <jwt>` on every magna fetch; magna's `magna-serv/jwt.rs` decodes; `magna-serv/rls.rs` sets `SET LOCAL "request.jwt.claims"` and `SET LOCAL role`. Maps EXACTLY to Supabase RLS pattern.
- **AgentManifest:** Registers scope metadata; `auth/currentUser` tool
- **Live-binding required for:** `$scope` enforcement, `$rate-limit` enforcement (currently parsed but not enforced)

### 2.5 `@aihu/agent-acp-ext`
- **Extends `@aihu/agent-acp`** (does NOT replace). Namespace: `acp-ext`.
- **Public API:** `acpExt({ magnaBridge: bool, notifyBridge: bool, skills: { 'data.query': { rateLimit, scope } } })`
- **Server:** Composition over `mountAcpAdapter` to route `data.*`/`auth.*`/`notify.*` skill prefixes. New route: `GET /acp/subscriptions/{channelId}` (SSE) streams from `magna-subscriptions` `PgSubscriptionManager` using `{schema}_{table}_mutation` channel naming.
- **Magna path:** Pattern A — service-role JWT on GraphQL HTTP. Pattern B — long-lived Postgres LISTEN connection fanned out to ACP-SSE.
- **Live-binding:** All ACP tool dispatch routes through `handleToolCall` (gates on §3)

### 2.6 `@aihu/magna` — UNIFIED BRIDGE PACKAGE
- **Runtime exports:** `createMagnaResource<T>(query, vars)` (typed `createResource` wrapper, auth header injected), `createMagnaFetch` (HTTP client), `useMagnaSubscription<T>(channel, handler)` (WS — degrades gracefully until magna v0.2 streaming)
- **Build-time:** `beforeCompile` runs `magna export-sdl` → `graphql-codegen` → `src/generated/magna.ts`; validates `$resource` operations via `magna-gqlmin` napi `parseExecutableDocument` (build-time only — NOT runtime)
- **Auth integration:** When `@aihu/auth` registered, `createMagnaFetch` reads JWT from auth context, attaches `Authorization: Bearer`. Server-side: from request context. Client-side: from cookie-backed auth signal.
- **Versioning:** `@aihu/magna` pins magna git rev mirror api repo's pattern. `magna-gqlmin` as `optionalDependency` (graceful skip with warning if napi binary absent — gates `beforeCompile` SDL validation).
- **Consumed by:** auth (service-role JWT validation), data macro (`$resource` lowering), search (FTS queries), commerce (typed product/cart resources), seo (sitemap), agent-acp-ext (service-role data queries)

### 2.7 `@aihu/commerce`
- **Public API:** `commerce({ stripe: { publicKey, secretKey, webhookSecret, webhookEvents }, tables: { products, orders, cartItems, lineItems }, currency })`
- **Server:** `POST /__aihu/commerce/webhook` (Stripe sig validation via HMAC-SHA256 — implementable WITHOUT Stripe SDK); `POST /__aihu/commerce/create-payment-intent` (server-only with `secretKey`); `requireCartOwner` helper
- **Client:** `useCart()`, `createCartResource()`, `<Cart>`, `<CartItem>`, `<ProductCard>`, `<Checkout>`, `<OrderSummary>` (~1.5 kB); `$cart` macro (RFC-002)
- **Build-time:** Validates `products`/`orders`/`cart_items` tables in magna SDL; generates `Product`/`Order`/`CartItem` types
- **Magna path:** v0.1 — CRUD available with RLS-enforced user isolation. **v0.2 unlocks:** `upsertCartItem` (add-or-increment in single round-trip), bulk `createOrderLineItems` for checkout. Until v0.2, add-to-cart is two round-trips.
- **Stripe specifically:** Outside magna entirely. Webhook validation is HMAC (no SDK needed). `secretKey` operations are `$server` functions developer writes — Stripe SDK lives in app, not plugin runtime. **PCI-clean:** raw card data NEVER touches aihu or magna.
- **Live-binding:** Cart mutations must reach live component signals

## 3. Live-Binding Architecture (THE KEYSTONE)

### 3.1 The problem
`AgentContext` in `packages/arbor/src/types.ts:127` is a frozen sentinel `{ _brand: 'AgentContext' }`. `MountScope.agent` returns it. The `@aihu/agent` registry maps tag → `AgentMetadata` (compile-time). NO map of tag → live component instance exists. NO mechanism to read signals or call methods on a mounted instance.

### 3.2 The protocol

**Step 1 — Instance registry per mount.** Add module-level `componentInstanceRegistry: Map<string, LiveBinding[]>` in arbor.

```typescript
interface LiveBinding {
  rootId: number
  tag: string
  getSignal(name: string): unknown
  setSignal(name: string, value: unknown): void
  callAction(name: string, args: unknown[]): Promise<unknown>
  scope(): string | null
  rateLimit(): string | null
  dispose$: () => boolean
}
```

**Step 2 — Compiler emits `__agentBinding`.** The `@agent` block compiler pass emits, into the server artifact:
```typescript
export const __agentBinding = {
  tag: 'weather-card',
  actions: { fetchForecast: (args) => fetchForecast() },
  reads: { location: () => location, forecast: () => forecast },
  writes: { location: (v) => { location = v } },
  scope: 'authenticated',
  rateLimit: '100/min',
}
```

**Step 3 — `mount()` registers the binding.** When materializing a component with `__agentBinding`, push `{ tag, rootId, getSignal, callAction }` into `componentInstanceRegistry`. Push disposer that calls `deregisterLiveBinding(rootId)` on unmount.

**Step 4 — `handleToolCall` resolves the binding.**
```typescript
async handleToolCall(toolName, params) {
  const [tag, action] = toolName.split('/')
  const bindings = componentInstanceRegistry.get(tag) ?? []
  if (bindings.length === 0) return { error: `no live instance: ${tag}` }
  const binding = bindings[0]  // M2 single-instance; M3 adds instanceId param
  if (!checkScope(binding.scope(), currentRequestContext)) return { error: 'unauthorized', code: 403 }
  if (!checkRateLimit(binding.rateLimit(), currentRequestContext)) return { error: 'rate_limited', code: 429 }
  if (action in binding.actions) return await binding.actions[action](params)
  if (action === '__read') return binding.reads[params.name]?.()
  return { error: `no action: ${action}` }
}
```

### 3.3 Contract evolution

`packages/arbor/src/types.ts:127` evolves from sentinel to:
```typescript
export interface AgentContext {
  readonly _brand: 'AgentContext'
  readonly rootId: number
  readonly tag: string
  readonly readSignal: (name: string) => unknown
  readonly writeSignal: (name: string, value: unknown) => void
  readonly callAction: (name: string, args: unknown[]) => Promise<unknown>
}
```
Backward compatible — callers check `'rootId' in agent`.

### 3.4 Security
- **Per-call auth:** every `handleToolCall` checks request context for valid JWT (auth plugin's before-handler injects claims)
- **Scope enforcement:** `binding.scope()` evaluated against JWT claims via auth plugin's scope definitions — makes `$scope` REAL (not decorative)
- **Rate-limit enforcement:** sliding-window counter from `@aihu/scraping`, key `{userId}:{tag}` — makes `$rate-limit` REAL
- **Instance isolation:** M2 = first live instance; M3 = optional `instanceId` parameter mapping to `rootId`
- **Action sanitization:** `__agentBinding.actions` table is the allowlist — agents can't call actions not in the table

### 3.5 SSR consideration
Server-rendered `LiveBinding` is ephemeral (lives only for SSR request duration). Persistent agent interactions need client-hydrated component OR dedicated server-side headless mount endpoint (M3 specifies pattern).

## 4. `@aihu/magna` Bridge Package — Detailed (see §2.6 above for summary)

Same as §2.6 — the bridge package is the single backbone all data-consuming plugins use.

## 5. Phased Delivery

### M1 — Foundation
- Live-binding RFC ratified per §3
- `LiveBinding` interface + `componentInstanceRegistry` in `@aihu/arbor`
- `AgentContext` evolved (backward compat)
- `__agentBinding` compiler emission in `@agent` block codegen
- `handleToolCall` wired to live registry with scope + rate-limit checks
- `@aihu/magna` bridge package skeleton + `beforeCompile` SDL/codegen pipeline
- `magna-gqlmin` napi optional dep (graceful skip)
- Tests: `handleToolCall` returns real signal value; returns 401 without JWT; returns 429 over rate-limit

### M2 — Core Four (zero v0.2 blockers)
- Ship `@aihu/auth` (JWT middleware, `<$guard>` wiring, scope defs, `requireAuth`)
- Ship `@aihu/magna` (full implementation)
- Ship `@aihu/seo` (sitemap, JSON-LD, canonical)
- Ship `@aihu/scraping` (rate-limit middleware, bot detection)
- Wire `@aihu/data` `$resource` macro to emit `createMagnaResource` when magna source configured
- E2E example: auth-gated page reading from magna with SEO metadata
- Doc updates for all four packages
- Compliance verification: `$scope` enforcement exercised in `mcp-server-card-schema` suite

### M3 — Advanced Three (v0.2-dependent)
- Ship `@aihu/search` (webhook path now; FTS path on v0.2 — IDENTICAL public API)
- Ship `@aihu/commerce` (basic CRUD now; upsert + bulk on v0.2)
- Ship `@aihu/agent-acp-ext` (service-role bridge + NOTIFY SSE)
- `$cart` macro RFC-002 ratified + Macro Vocabulary Spec amendment
- Multi-instance agent dispatch (`instanceId` parameter)
- Headless mount pattern for server-side agent interactions

### M4 — Polish
- `@aihu/semantic-search` plugin (external pgvector — magna NOT in roadmap for vector)
- `useMagnaSubscription` full impl when magna v0.2 streaming subscriptions ship
- MCP streaming on `/__aihu/tools/call` (SSE for long-running tool calls)
- MCP `resources/subscribe` for live signal updates
- `aihu add @aihu/auth` CLI command (wires plugin install + config scaffolding)
- Plugin hot-reload in dev mode (compiler cache invalidation per §12.2 plugin contract)

## 6. RFC Requirements

### RFC-001: `$auth.*` macro family
- Plugin: `@aihu/auth`
- Macros: `$auth.session()`, `$auth.currentUser()`
- Valid in: `@state`
- Rationale: auth state is cross-cutting; imperative `getAuthState()` breaks reactive contract. `$auth.currentUser()` lowers to `$shared` + server-side init.

### RFC-002: `$cart` macro
- Plugin: `@aihu/commerce`
- Valid in: `@state`
- Rationale: cart must be reactive, SSR-serializable, RLS-scoped to user. Lowers to specialized `$shared` + server-init pattern bootstrapping `useCart()` with typed `CartItem[]` from magna. Encapsulates ceremony every commerce component would otherwise duplicate.

### RFC-003: `$query` macro
- Plugin: `@aihu/magna` (via `@aihu/data` lowering)
- Valid in: `@state`
- Rationale: typed shorthand `$query name = data.X.query(vars)` makes magna origin explicit, allows compile-time validation against SDL via `magna-gqlmin`. Specializes `$resource` for magna source. Both remain valid; `$resource` for non-magna sources.

## 7. Risk Register

### R1 — Magna v0.2 schedule (HIGH)
Search FTS, commerce upsert, ACP streaming all gate. **Mitigation:** webhook/external-provider fallback paths designed as production-viable, not scaffolding. Apps ship on Typesense/Algolia waiting for native FTS. Provider is config line — public API identical.

### R2 — MCP spec evolution (MEDIUM)
Schema `2025-06-18` pinned. `resources/subscribe` and streaming tool calls in M4. Compliance suite catches breaks immediately. Budget 1 sprint per MCP revision.

### R3 — Live-binding security surface (HIGH)
`componentInstanceRegistry` is global mutable Map. New attack surface. Mitigations: (a) only `mount()` registers (compiled component code), external callers cannot; (b) scope/rate-limit checked before dispatch; (c) `dispose$` prevents stale bindings. **Dedicated security review required before M2 ships** — single most security-critical new surface in v1.1.

### R4 — Dep-free thesis pressure (MEDIUM)
Stripe webhook validation is HMAC-SHA256 (zero-dep implementable). Search webhook is `fetch`. SDKs live in apps, not plugins.

### R5 — Multi-instance ambiguity (LOW M2, MEDIUM M3)
M2 uses first live instance. Most agent components are page-level singletons. M3 introduces `instanceId`.

### R6 — `magna-gqlmin` napi distribution (MEDIUM)
Pre-built per-platform binaries needed (mirror `@napi-rs/cli` pattern). File issue upstream in magna.

### R7 — RLS behavioral testing (MEDIUM)
Magna sets Postgres session vars; pool reuse with stale vars = wrong-role queries. Add `@aihu/auth` integration tests with concurrent JWTs asserting RLS isolation. Requires live Postgres — `test:integration` suite separate from unit tests.

### R8 — `trusted_documents_only` enforcement timing (LOW)
v0.2 trusted-docs requires app redeploy on schema migration. Document.

## Appendix: File Map

### Create
- `packages/auth/`, `packages/seo/`, `packages/scraping/`, `packages/magna/`, `packages/search/`, `packages/commerce/`, `packages/agent-acp-ext/`

### Modify
- `packages/arbor/src/types.ts` — evolve `AgentContext` (§3.3)
- `packages/arbor/src/mount.ts` — `componentInstanceRegistry`, populate `agent` in `MountScope` (§3.2)
- `packages/agent-service/src/agent-service.ts` — real `handleToolCall` dispatch
- `packages/agent-service/src/types.ts` — `LiveBinding`, `InstanceRegistry` types
- `docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` — append plugin macros post-RFC

### Reference (read-only)
- magna's `crates/magna-build/src/extension.rs` (Tier-1 SchemaExtension)
- `crates/magna-serv/src/{jwt,rls}.rs` (auth integration)
- `crates/magna-remote/src/lib.rs` (Tier-3 webhook pattern)
- `crates/magna-gqlmin/src/napi.rs` (build-time JS bridge)
- `crates/magna-subscriptions/src/publisher.rs` (NOTIFY wire format)

---

*Live-binding (§3) is the M1 keystone. No M2 plugin ships before live-binding RFC ratifies + `handleToolCall` is real.*
