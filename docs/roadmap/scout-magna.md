# Scout Report: Magna Engine — Integration Survey

**Date:** 2026-05-05 · **Magna:** v0.1.0.0 (2026-04-27) · **Repo:** `c:/git/fellwork/magna` · **Public:** github.com/fellwork/magna (MIT/Apache 2.0)

---

## Preamble

Magna is a Rust/Axum **GraphQL-from-Postgres engine**. The Fellwork API consumes it via pinned git rev (`cb26a99`). **Aihu has zero direct Rust dep on magna today.** All integration is forward-looking.

---

## Section 1 — Magna Capabilities

### 1.1 The 12 Crates

| Crate | Status | Purpose |
|---|---|---|
| `magna-types` | stable | Shared types: `StepId`, `PgValue`, `JwtClaims`, `JwtRole`, `FwGraphError` |
| `magna-core` | stable | Two-phase planner + executor; DAG via `petgraph::algo::toposort`; optimizer with fingerprint dedup |
| `magna-sql` | stable | Composable SQL AST builder (parameterized, safe-by-construction): `SqlBuilder`, `InsertBuilder`, etc. |
| `magna-introspect` | stable | Queries 9 `pg_catalog` tables; moka cache; NOTIFY-driven invalidation via `postgraphile_schema_reload` |
| `magna-dataplan` | stable | Postgres steps: `PgSelectStep`, `PgInsertStep`, `PgUpdateStep`, `PgDeleteStep`; batched execution |
| `magna-config` | experimental | `Preset` (the config object), `Plugin` trait (gather_hook + schema_hook) |
| `magna-build` | experimental | 17-pass schema builder; `SchemaExtension` trait is the **Tier 1 public API** |
| `magna-serv` | stable | Axum server: `POST /graphql`, `GET /graphql` (WS), `GET /playground`, `GET /health`. `SchemaRegistry` hot-reload, `PlanCache` (DashMap, 512). |
| `magna-subscriptions` | experimental | `PgSubscriptionManager` LISTEN/NOTIFY multiplexer; channel `{schema}_{table}_mutation` |
| `magna-remote` | experimental | Tier 3 HTTP webhook resolvers; `RemoteResolver`, `WebhookRequest`. **Field-generation glue is W-1 v0.1 polish work.** |
| `magna-gqlmin` | experimental | GraphQL parser. **Compiles as napi cdylib** — exposes `parseExecutableDocument(src)` for Node/Bun. The direct JS bridge crate. |
| `magna` (binary) | stable | CLI: `magna run`, `magna export-sdl`, `magna doctor`. Default port 4800. |

### 1.2 GraphQL Surface
Per table/view: `allX(first/last/after/before/condition/filter/orderBy)` → `XConnection`, `xById(id)`, `node(id)`. Mutations: `createX`, `updateXById`, `deleteXById`. Relations via DataLoader. Subscriptions over WS (`graphql-transport-ws`) — **handler scaffolded but `subscribe` returns immediate `complete`** (full streaming is v0.2).

### 1.3 Type Mappings
text/varchar→String, int→Int/BigInt, uuid→custom UUID scalar, timestamptz→DateTime, jsonb→JSON. Enums→GraphQL enums (camelCase). Arrays→list types. FKs→relation fields with DataLoader batching. **Functions (pg_proc) introspected but field generation EMPTY at v0.1.**

### 1.4 Auth Model (Three Layers)

1. **JWT validation** (`magna-serv/src/jwt.rs`): HS256 from `JWT_SECRET`. JWKS URL declared but not implemented. Roles: Anon, Authenticated, ServiceRole, Custom.
2. **RLS context propagation** (`rls.rs`): `SET LOCAL role`, `SET LOCAL "request.jwt.claims"`, `SET LOCAL "request.jwt.sub"` — **maps exactly to Supabase RLS** (`auth.uid()`).
3. **Behavior-level access**: `BehaviorSet` bitflags per resource (INSERT/UPDATE/DELETE/etc.).

**No per-field auth at v0.1** — requires Tier 1 `SchemaExtension`. `trusted_documents_only` declared but not enforced.

### 1.5 Performance
- **Plan cache:** O(1) DashMap lookup, 512 entries default
- **DataLoader:** `HasManyLoader` (lateral join), `BelongsToLoader` (`= ANY($1)`); default has-many limit 20
- **Introspection cache:** moka, 60s TTL default, NOTIFY-invalidated
- **Schema limits:** complexity 200, depth 10
- **Pool:** sqlx, max 10 / min 1, 30s acquire timeout

---

## Section 2 — Per-Plugin Integration Surface

### 2.1 Search 🟡 (gaps)
- **Today:** ILIKE/like/eq/ne/in/isNull operators on string columns. No FTS, no `pgvector`, no aggregates.
- **Path:** Tier 1 `SchemaExtension` adding custom `Query.search` / `Query.semanticSearch` resolver that runs raw SQL via `Arc<QueryExecutor>`. `PgValue` enum lacks `Array(Vec<f32>)` variant for vectors — gap in `magna-types`.
- **v0.2 targets** include FTS (tsvector @@ tsquery). pgvector is NOT on magna's roadmap at all.

### 2.2 SEO 🟢 (data source)
- **Magna contributes nothing SEO-specific.** Auto-exposes any `page_metadata` table you create.
- **Pattern:** `defineLoader` queries `Query.allPageMetadata(condition: { slug_eq: $slug })`, injects into SSR head tags.
- **`llms.txt` already in aihu** (`@aihu/agent-readiness`) — independent of magna.

### 2.3 Scraping Control 🟡
- **`@aihu/agent-readiness` already covers** robots.txt + AI_BOT_LIST + content negotiation.
- **Magna's `trusted_documents_only`** (v0.2 unfulfilled) gates which operations execute — meaningful future contribution.
- **Rate-limiting:** would need Tier 1 extension reading a `rate_limits` table OR magna-serv middleware (no pluggable middleware chain today).

### 2.4 Auth 🟢🟢 STRONGEST FIT
- **Purpose-built for Supabase:** JWT decode + RLS propagation + role mapping is the entire stack.
- **Aihu auth plugin pattern:** validate JWT (reuse magna's logic or replicate), attach `JwtClaims` to request, issue magna queries with `Authorization: Bearer` header — RLS automatically applies.
- **Gaps:** no session storage (stateless per-request), no refresh token handling, no multi-tenant beyond Postgres roles.

### 2.5 ACP 🟡
- **Magna has no native ACP primitives.**
- **Bridge pattern A:** ACP adapter queries magna's `/graphql` as a data source (service-role JWT). The ACP `WebhookRequest { args, context, parent }` envelope is structurally identical to magna's `magna-remote` Tier 3 webhook envelope.
- **Bridge pattern B:** Use `PgSubscriptionManager` LISTEN/NOTIFY as agent-to-agent comms channel — unconventional but technically sound.

### 2.6 Data Interfacing 🟢🟢 STRONG FIT
- **Plan:** `beforeCompile` hook fetches `magna export-sdl`, generates TS types via `graphql-codegen`. Runtime: `$resource` macro lowers to typed `fetch('/graphql', ...)` with `createResource` reactivity.
- **NOTIFY → reactive signals:** WebSocket subscription updates a signal on NOTIFY, drives fine-grained DOM updates via `@aihu/arbor`.
- **Optimistic updates:** must be implemented at JS layer (magna has no built-in mechanism).
- **Gaps blocking complex use:** JSONB filter operators (v0.2), aggregates (NOT planned), upsert (v0.2), bulk mutations (v0.2), array filters (v0.2).

### 2.7 Commerce 🟡 (foundations work, integrations external)
- **Today:** Any `products`/`orders`/`line_items` table auto-exposes CRUD with RLS.
- **v0.1 limits:** No upsert (inventory writes), no bulk insert (line items).
- **v0.2 unlocks:** Tier 3 Webhooks (`magna-remote` W-1) → Stripe webhook handlers, fulfillment APIs.
- **Stripe specifically:** entirely outside magna. Lives in aihu server middleware (`defineMiddleware` in `@aihu/server`). Magna NEVER sees raw payment data (PCI-clean).

---

## Section 3 — Aihu ↔ Magna Bridging

### 3.1 Runtime Path (Primary): GraphQL HTTP
`fetch('https://api.fellwork.com/graphql', { method: 'POST', headers: { Authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })`. Standard GraphQL-over-HTTP. Works in `defineLoader` (server) and `createResource` (client). Auth header → magna JWT decode → RLS context applied.

### 3.2 Build-Time Path: napi via `magna-gqlmin`
`magna-gqlmin` with `napi` feature → native Node addon. `parseExecutableDocument(src: string)` returns `{ ok: true, document }` or `{ ok: false, error }`. **Use case:** aihu compiler validates GraphQL operations embedded in `$resource` macros against magna SDL at compile time.

### 3.3 Future: Rust FFI for Server Embedding
If aihu's Rust SSR addon (`packages/server/src-native/`) embeds magna directly instead of HTTP-calling, eliminates round-trip latency. **Cost:** significantly larger binary, longer compile. Worth evaluating at v1.0+ if SSR latency becomes a bottleneck.

### 3.4 Type Sharing
`magna export-sdl > schema.graphql` → `graphql-codegen` → `src/generated/magna.ts`. **No existing bridge in aihu.** Building it is the data plugin's job. Standard `graphql-codegen` pattern works.

### 3.5 Schema Evolution
Stable crates: minor-version semver. Experimental: may break on minor through v0.5. **No `@deprecated` / schema stitching / field aliasing at engine level** — schema changes silently break unregistered queries unless `trusted_documents_only` is enforced (v0.2).

---

## Section 4 — Magna Roadmap Signals

### v0.2 Targets (relevant to aihu)
- **FTS** (tsvector @@ tsquery) ← unblocks search plugin
- **JSONB operators** ← unblocks complex data interfacing
- **Array filters** ← unblocks collection queries
- **Bulk insert/update/delete** ← unblocks commerce, data interfacing
- **Upsert** (`ON CONFLICT DO UPDATE`) ← unblocks idempotent writes
- **Tier 2b/2c:** computed SQL fields + CEL authorization in YAML (declarative per-field auth)
- **Introspection gating in production** ← unblocks scraping control
- **`RemoteExtension` field-generation** (W-1 polish) ← unblocks Tier 3 webhooks for commerce/auth/ACP

### v0.5 Targets
- **Tier 4:** WASM component plugins via `magna-wasm` + WIT
- **Live queries** (auto-refresh on data change) — unblocks reactive data without explicit subscription wiring
- **Cursor-based streaming subscriptions**

### v1.0 Governance
- crates.io publication (currently git-dep only)
- Full semver freeze

---

## Section 5 — Synthesis for Architects

### Strongest integration domains TODAY

1. **Auth** — purpose-built; zero gaps for Supabase Auth + RLS use case
2. **Data interfacing (CRUD)** — auto-generated, DataLoader-batched; gaps at edges (aggregates, bulk, JSONB)
3. **SEO (as data source)** — magna serves any metadata table you create

### Domains needing bridging work

4. **Search** — Tier 1 extension OR Tier 3 webhook to external search (Algolia/Typesense). Vector search NOT in magna roadmap.
5. **Commerce** — fundamentals work; inventory writes need v0.2 upsert; Stripe entirely external
6. **ACP** — query magna as data source (service JWT); NOTIFY for agent-to-agent comms (unorthodox)
7. **Scraping control** — `trusted_documents_only` (v0.2) is the meaningful contribution

### Critical insight: napi bridge ≠ runtime data path
`magna-gqlmin` napi is for **compile-time GraphQL validation**, not runtime fetching. Runtime is HTTP `/graphql`.

---

## Key Files for Architects

- `c:/git/fellwork/magna/crates/magna-build/src/extension.rs` — `SchemaExtension` trait (Tier 1 API)
- `c:/git/fellwork/magna/crates/magna-build/src/lib.rs` — `build_schema` 17 phases
- `c:/git/fellwork/magna/crates/magna-serv/src/jwt.rs` — `decode_jwt`
- `c:/git/fellwork/magna/crates/magna-serv/src/rls.rs` — RLS wiring
- `c:/git/fellwork/magna/crates/magna-config/src/preset.rs` — `Preset` config
- `c:/git/fellwork/magna/crates/magna-config/src/plugin.rs` — `Plugin` trait
- `c:/git/fellwork/magna/crates/magna-remote/src/lib.rs` — `RemoteResolver`, `WebhookRequest` (Tier 3)
- `c:/git/fellwork/magna/crates/magna-gqlmin/src/napi.rs` — JS bridge
- `c:/git/fellwork/magna/crates/magna-build/src/executor/dataloader.rs` — batching model
- `c:/git/fellwork/magna/crates/magna-subscriptions/src/publisher.rs` — NOTIFY wire format
- `c:/git/fellwork/magna/CHANGELOG.md` — v0.1 inventory
- `c:/git/fellwork/magna/.agent-team/v0.1-finishing-polish.md` — W-1 through W-6 in-flight work
