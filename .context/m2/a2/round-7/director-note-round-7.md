---
topic: aihu-m2-a2
track: aihu-m2-a2
kind: director_note
layer: delta
round: 7
slug: aihu/delta/m2/a2/round-7/director-note-round-7
---

# Director Note — Round 7

## §1 Key Research Findings

### Spec row (arch-2 §2, row 13)

| # | Slug | Tier | Key features | Port |
|---|------|------|--------------|------|
| 13 | `storefront` (NEW) | 3 | `@aihu/data` `createResource` + `createResourceSerializer` (SSR-safe), `@aihu/context` cart, `$shared` cross-component, dummy Stripe `POST /api/checkout` | 5113 |

Coverage matrix contributions: `@aihu/context` provide/inject (07, 09, **13**), `defineLoader` (08, 09, **13**), `<$suspense>` (09, **13**), file-based routing (08-10, **13**), `createResource` / `createResourceSerializer` (**12, 13**), `$shared` cross-component state (**13 only**).

### What is on disk

- `examples/storefront/` — **MISSING** (greenfield)
- `examples/README.md` row 16 already names it: `storefront/ (new) | meta | M2 | 5113 | cart + checkout | @aihu-plugin/data, $shared, dummy Stripe`

### Available packages

**`@aihu-plugin/data`** (`packages/plugin-data/`): fully built, dist present. Exports:
- `createResource(key: Signal<string|null|undefined>, fetcher, options?)` — reactive data resource with `state` signal (idle/loading/ready/error/streaming)
- `createResourceSerializer(store)` — SSR dehydration; **already implemented and exported**; the A3 soft-dep concern noted in arch-2 §8.3 is moot — the serializer exists in the workspace now
- `createResourceStore()`, `ResourceStoreToken` — context-injectable store
- `data()` — plugin factory for `defineAihuConfig`

**`@aihu/auth`** (`packages/auth/`): fully built (v0.1.1), dist present. Exports:
- `requireAuth(options?)` — server middleware; 401 when no JWT in `Authorization` header
- `requireScope(scope, options?)` — 403 when scope absent
- `decodeJwt`, `hasScope` — client-side JWT utilities
- `createScopeSignal`, `getScopeSignal`, `clearCurrentScopes`, `setCurrentScopes` — `<$guard>` signal pattern for client-side scope gating

**`@aihu/context`**: `createContext`, `provide`, `inject` — used in EX-07 and EX-09; same pattern available for cart token.

**`@aihu/agent`**: `registerAgentMetadata`, `getAllAgentMetadata` — standard.

### Auth fallback decision

The state file says: "Fallback: EX-13 starts with manual JSON serialization + TODO; uplift after A3 lands." However, `@aihu/auth` is already built and resident in the workspace with a passing test suite. The `requireAuth` middleware is importable today. **Round 7 decision: use `@aihu/auth` directly.** The checkout server endpoint wraps `requireAuth()` from `@aihu/auth`. A demo JWT (`Bearer demo-token-xyz`) is injected by the client; the middleware passes it through. No signature verification is exercised (per `requireAuth` design — it only checks presence). The README notes: "Signature verification is out of scope; use a full JWT library in production." This is not an uplift — it is the available implementation.

### `createResourceSerializer` status

Already implemented in `packages/plugin-data/src/serializer.ts` and exported from `@aihu-plugin/data`. The arch-2 §8.3 note ("falls back to manual JSON serialization with TODO comment if `createResourceSerializer` not yet exposed") was written before the package reached its current state. Round 7 uses `createResourceSerializer` directly with a `ResourceStore` and the `dehydrate: true` option on the products resource. A TODO comment is still added to the server-side render path noting: "SSR rehydration client bootstrap (read `__aihu_state__` into ResourceStore) deferred to M3 per arch-2 §M3."

---

## §2 Scope Decision — Round 7

**Full delivery in one round.** EX-13 is greenfield, all dependencies are available, and the pattern is a direct extension of EX-12 (createResource) + EX-07 (@aihu/context + provide/inject). The storefront consists of three SFCs + one server file + standard scaffold — comparable in size to EX-07 (which also had three SFCs + server.ts).

### What EX-13 delivers in round 7

1. **`examples/storefront/src/product-list.aihu`** — `createResource` fetches mock products from `/api/products`; renders product cards with "Add to cart" button; `$shared` cart signal is the cross-component link; `@agent` block exposes `products` and `addToCart` action
2. **`examples/storefront/src/cart-drawer.aihu`** — `inject(CartContext)` receives the shared cart signal; renders line items, total, and "Checkout" button; posts `POST /api/checkout` with `Authorization: Bearer demo-token-xyz`; `@agent` block exposes `cartItems` and `checkout` action
3. **`examples/storefront/src/storefront-root.aihu`** — `provide(CartContext, cartSignal)`; composes `<product-list>` and `<cart-drawer>`; `@agent` block exposes `cartCount`; uses `createResourceSerializer` import (demonstrates SSR-safe pattern)
4. **`examples/storefront/server.ts`** — Bun API server on port 5213; mounts `requireAuth()` only on `POST /api/checkout`; serves `GET /api/products` (no auth); responds 200 with `{ orderId }` on authenticated checkout; 401 on missing token
5. **`examples/storefront/vite.config.ts`** — `aihuCompilerPlugin()`, configureServer for `/api/products` and `/api/checkout` proxy to port 5213 (same server-proxy pattern as EX-07/EX-12)
6. **`examples/storefront/index.html`** — port 5113 title, tokens.css link, `<storefront-root>` mount
7. **`examples/storefront/package.json`** — name `@aihu/example-storefront`, deps: `@aihu/agent`, `@aihu/compiler`, `@aihu/context`, `@aihu-plugin/data`, `@aihu/auth`, dev: vite, vitest, concurrently
8. **`examples/storefront/tests/smoke.test.ts`** — 10 source-text assertions + 1 registry simulation (pattern identical to EX-07/EX-12)
9. **`examples/storefront/README.md`** — explains `createResource`, `createResourceSerializer`, `@aihu/context` cart token, `requireAuth` wiring, dummy Stripe note
10. **`examples/README.md`** — update row 16 status from `M2` to `M2 ready`

---

## §3 CSS + Iron Law Constraints (carry-forward)

All CSS in `.aihu` `@style` blocks and in `index.html` MUST use `var(--token)` exclusively — no hex literals, no rgb() fallbacks, no hardcoded colour values. The only permitted tokens are those defined in `examples/_shared/tokens.css` (light + dark variants already cover: `--bg`, `--fg`, `--muted`, `--border`, `--accent`, `--hover-bg`, `--panel-bg`, `--input-bg`, `--tag-bg`, `--tag-fg`, `--focus-ring`, `--success`, `--success-bg`, `--error`, `--error-bg`, `--card-shadow`, `--radius`, `--max-w`, `--agent-bg`, `--agent-border`, `--stub-bg`, `--stub-border`, `--stub-fg`, `--btn-bg`, `--code-bg`, `--header-h`). Every SFC `@style` block MUST include a `@media (max-width: 480px)` block. No new tokens may be added to `tokens.css` — map storefront concepts (price, badge, cart count) to the existing set (`--accent` for price emphasis, `--tag-bg`/`--tag-fg` for count badge, `--success`/`--success-bg` for checkout confirmation). The Iron Law: API-shape questions (function signatures, export names, package structure) are self-resolved by reading source files before writing any code; scope or priority questions are re-raised to Director before proceeding. No changes to root `package.json` or `.size-limit.json`.

---

## §4 OVER-1 Scope (round 7)

Base SHA: `1e95d83`

```
git log 1e95d83..HEAD --name-only
```

Expected new files under `examples/storefront/`:
- `src/product-list.aihu`
- `src/cart-drawer.aihu`
- `src/storefront-root.aihu`
- `server.ts`
- `vite.config.ts`
- `index.html`
- `package.json`
- `tests/smoke.test.ts`
- `README.md`

Modified file:
- `examples/README.md` (row 16 status update)

Do-not-touch list (must remain green): `examples/live-counter/`, `examples/temperature-converter/`, `examples/timer/`, `examples/todo-mvc/`, `examples/color-theme/`, `examples/weather-card/`, `examples/blog-loader/`, `examples/realtime-scores/`, `examples/agent-hub/`, `examples/cf-adapter/` — 73 existing tests must remain passing.

---

## §5 Verbatim-Dispatchable Builder Brief

---

**BUILDER BRIEF — EX-13 storefront (round 7)**

Branch: `feat/m2-a2-examples/ex-07-agent-hub`  
Base SHA: `1e95d83`  
Working directory: `/Users/smcguirt/conductor/workspaces/aihu/seville`  
Port: `5113` (Vite); API server: `5213`

**What you are building:** A multi-component aihu storefront example demonstrating `createResource` for product fetching, `@aihu/context` provide/inject for a shared cart signal (`$shared` cross-component pattern), `createResourceSerializer` (imported to show SSR-safe pattern with TODO for M3 client bootstrap), and `@aihu/auth` `requireAuth` protecting a dummy Stripe checkout endpoint.

**Step 0 — Read before writing (Iron Law)**

Before writing any file, read each of these to confirm current signatures and export names:

- `/Users/smcguirt/conductor/workspaces/aihu/seville/packages/plugin-data/src/index.ts` — confirm `createResource`, `createResourceSerializer`, `createResourceStore`, `ResourceStoreToken` exports
- `/Users/smcguirt/conductor/workspaces/aihu/seville/packages/plugin-data/src/types.ts` — confirm `Resource<T>`, `DataState<T>` shape (`state` is a `Signal<DataState<T>>`, called as `resource.state()` to read current value)
- `/Users/smcguirt/conductor/workspaces/aihu/seville/packages/auth/src/index.ts` — confirm `requireAuth` export and middleware shape `(req, next) => Response | Promise<Response>`
- `/Users/smcguirt/conductor/workspaces/aihu/seville/packages/context/src/index.ts` — confirm `createContext`, `provide`, `inject` exports
- `/Users/smcguirt/conductor/workspaces/aihu/seville/examples/_shared/tokens.css` — confirm all token names before using in `@style` blocks
- `/Users/smcguirt/conductor/workspaces/aihu/seville/examples/realtime-scores/src/realtime-scores.aihu` — reference SFC structure (createResource usage, `@state`, `@template`, `@agent`, `@style`)
- `/Users/smcguirt/conductor/workspaces/aihu/seville/examples/agent-hub/src/hub-root.aihu` — reference multi-SFC + provide/inject pattern
- `/Users/smcguirt/conductor/workspaces/aihu/seville/examples/agent-hub/tests/smoke.test.ts` — reference smoke test harness shape

**Step 1 — Create `examples/storefront/` directory structure**

Create these files (all greenfield — directory does not exist):

```
examples/storefront/
  src/
    product-list.aihu
    cart-drawer.aihu
    storefront-root.aihu
  tests/
    smoke.test.ts
  server.ts
  vite.config.ts
  index.html
  package.json
  README.md
```

**Step 2 — `package.json`**

```json
{
  "name": "@aihu/example-storefront",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "server": "bun --watch server.ts",
    "dev": "concurrently \"bun run server\" \"vite --port 5113\"",
    "dev:server": "bun run server",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@aihu/agent": "workspace:*",
    "@aihu/auth": "workspace:*",
    "@aihu/compiler": "workspace:*",
    "@aihu/context": "workspace:*",
    "@aihu-plugin/data": "workspace:*"
  },
  "devDependencies": {
    "concurrently": "^8.0.0",
    "vite": "^5.0.0",
    "vitest": "^2.1.1"
  }
}
```

**Step 3 — `server.ts`**

Bun API server on port 5213. Serves:
- `GET /api/products` — no auth; returns JSON array of 4 mock products with fields `{ id, name, price, description }`
- `POST /api/checkout` — protected by `requireAuth()` from `@aihu/auth`; when auth passes returns `{ orderId: 'order-' + Date.now(), status: 'ok' }`; missing token returns 401 automatically via middleware

Use the same `asMiddleware`-style chain as EX-07 (`agent-hub/server.ts`), but here compose `requireAuth()` manually for the checkout route only. Pattern:

```ts
import { requireAuth } from '@aihu/auth'

const authMw = requireAuth()

Bun.serve({
  port: 5213,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/api/products' && req.method === 'GET') {
      // return mock products — no auth
    }

    if (url.pathname === '/api/checkout' && req.method === 'POST') {
      // run requireAuth middleware first
      let authResult: Response | null = null
      await authMw(req, () => {
        authResult = null
        return new Response(null) // sentinel — replaced below
      })
      // If authMw returned a 401, it returned before calling next()
      // Simpler: use the middleware's direct return pattern:
      const guarded = await new Promise<Response>((resolve) => {
        authMw(req, () => {
          resolve(new Response(JSON.stringify({ orderId: `order-${Date.now()}`, status: 'ok' }), {
            headers: { 'Content-Type': 'application/json' },
          }))
          return new Response(null) // never used
        }).then((r) => resolve(r))
      })
      return guarded
    }

    return new Response('not found', { status: 404 })
  },
})
```

NOTE: The middleware shape is `(req, next) => Response | Promise<Response>`. When no token is present it returns a `401 Response` directly without calling `next`. When a token is present it calls `next()` and returns that result. Use this to gate checkout cleanly.

Log: `console.log('[storefront] API server listening on http://localhost:5213')`

**Step 4 — `vite.config.ts`**

Pattern from EX-12 `realtime-scores/vite.config.ts`. Use `aihuCompilerPlugin()`. Add `configureServer` middleware that proxies `/api/products` and `/api/checkout` to `http://localhost:5213` (or serve them directly as in-process mocks — same approach as EX-12 which serves `/api/initial-scores` inline via `server.middlewares.use`). Either approach is acceptable; inline is simpler for offline-safe tests.

Resolve aliases for `@aihu/agent`, `@aihu/context`, `@aihu-plugin/data` pointing to `node_modules/`.

**Step 5 — `src/product-list.aihu`**

An `.aihu` SFC. Demonstrates `createResource` for product catalog fetch.

`@state` block:
- Import `createResource` from `@aihu-plugin/data`
- Import `inject` from `@aihu/context`
- Import `signal` from `@aihu/signals`
- Import `CartContext` from `./cart-context` (a sibling `.ts` file — see step 5a)
- `const [resourceKey] = signal('products')`
- `const products = createResource(resourceKey, async (_key) => { const r = await fetch('/api/products'); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })`
- `const cart = inject(CartContext)` — the cart signal provided by storefront-root
- `function addToCart(item) { if (cart) { const [getCart, setCart] = cart; setCart([...getCart(), item]) } }`

`@template` block: renders a `.product-grid` with one card per product (status 'ready'). Each card shows name, price (formatted as `$price.toFixed(2)`), description snippet, and "Add to cart" button. Show loading and error states. `@media (max-width: 480px)` must be present.

`@agent` block:
```
$expose products: current products resource state
$expose addToCart: add a product to the cart
addToCart: { description: "Add a product by id to the cart", params: { id: "string" } }
```

`@style` block: grid layout, card with `var(--panel-bg)`, `var(--border)`, `var(--radius)`, `var(--card-shadow)`. Price in `var(--accent)`. Button uses `var(--btn-bg)`. `@media (max-width: 480px)` required.

**Step 5a — `src/cart-context.ts`**

```ts
import { createContext } from '@aihu/context'
import type { Signal } from '@aihu/signals'

export type CartItem = { id: string; name: string; price: number }
export type CartSignal = Signal<CartItem[]>

// Typed context token for the shared cart signal.
export const CartContext = createContext<CartSignal | null>(null)
```

**Step 6 — `src/cart-drawer.aihu`**

`@state` block:
- Import `inject` from `@aihu/context`
- Import `CartContext` from `./cart-context`
- `const cartSignal = inject(CartContext)`
- `const [getCart, _setCart] = cartSignal ?? [() => [], () => {}]`
- `$computed: { cartItems: () => getCart(), total: () => cartItems.reduce((s, i) => s + i.price, 0), cartCount: () => cartItems.length }`
- `const [checkoutStatus, setCheckoutStatus] = signal<'idle' | 'pending' | 'ok' | 'error'>('idle')`
- `async function checkout() { setCheckoutStatus('pending'); try { const r = await fetch('/api/checkout', { method: 'POST', headers: { Authorization: 'Bearer demo-token-xyz', 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cartItems }) }); if (!r.ok) { setCheckoutStatus('error'); return } setCheckoutStatus('ok') } catch { setCheckoutStatus('error') } }`

`@template` block: drawer/sidebar panel showing cart line items, total, checkout button. Status messages for pending/ok/error states. "Tool call stubbed — live Stripe binding pending arch-3" badge visible when checkoutStatus is 'idle' or after a mock call. Empty cart message when `cartCount === 0`.

`@agent` block:
```
$expose cartItems: current cart items array
$expose cartCount: number of items in cart
$expose checkoutStatus: checkout flow status (idle/pending/ok/error)
checkout: { description: "Initiate checkout with current cart items" }
```

`@style` block: drawer layout, `var(--panel-bg)`, `var(--border)`, `var(--agent-bg)` for stub badge, `var(--stub-border)` + `var(--stub-fg)` for stub text (reuse these for the Stripe-pending badge), `var(--success-bg)` + `var(--success)` for checkout-ok state, `var(--error-bg)` + `var(--error)` for error state. `@media (max-width: 480px)` required.

**Step 7 — `src/storefront-root.aihu`**

`@state` block:
- Import `createContext, provide` from `@aihu/context`
- Import `CartContext` from `./cart-context`
- Import `signal` from `@aihu/signals`
- Import `createResourceSerializer, createResourceStore` from `@aihu-plugin/data`
- `const [cartItems, setCartItems] = signal([])`
- `provide(CartContext, [cartItems, setCartItems])`
- `const store = createResourceStore()`
- `const serialize = createResourceSerializer(store)`
- `// TODO (M3): pass serialize to renderToString SSR options; dehydrate products into <script id="__aihu_state__"> for client rehydration (arch-2 §M3)`
- `$computed: { cartCount: () => cartItems().length }`

`@template` block: page layout with `<product-list>` and `<cart-drawer>` as children; header with cart count badge; import scripts for the two child SFCs.

`@agent` block:
```
$expose cartCount: total number of items currently in cart
```

`@style` block: page grid (sidebar + main), `var(--bg)`, `var(--border)`. `@media (max-width: 480px)` collapses to single column.

**Step 8 — `index.html`**

Follow `examples/realtime-scores/index.html` pattern:
- `<title>Storefront — aihu EX-13</title>`
- Inline `:root` token block importing from `examples/_shared/tokens.css` equivalents (use the same inline token block pattern as other examples — do NOT reference `../` paths; inline the `:root` vars)
- `<storefront-root></storefront-root>`
- `<script type="module" src="/src/storefront-root.aihu"></script>`

**Step 9 — `tests/smoke.test.ts`**

Source-text + registry simulation. Use EX-07 `agent-hub/tests/smoke.test.ts` as the structural template. Read SFC sources with `readFileSync`. Assert:

- **A6-1**: `storefront-root.aihu` contains `createResourceSerializer`
- **A6-2**: `storefront-root.aihu` contains `createResourceStore`
- **A6-3**: `storefront-root.aihu` contains `provide`
- **A6-4**: `storefront-root.aihu` contains `CartContext`
- **A6-5**: `storefront-root.aihu` contains `@agent`
- **A6-6**: `product-list.aihu` contains `createResource`
- **A6-7**: `product-list.aihu` contains `@aihu-plugin/data`
- **A6-8**: `product-list.aihu` contains `inject`
- **A6-9**: `product-list.aihu` contains `$expose`
- **A6-10**: `cart-drawer.aihu` contains `inject`
- **A6-11**: `cart-drawer.aihu` contains `checkout`
- **A6-12**: `cart-drawer.aihu` contains `Authorization`
- **A6-13**: `cart-drawer.aihu` contains `demo-token-xyz`
- **A6-14**: `cart-drawer.aihu` contains stub badge text (assert it contains the string `"live Stripe binding pending"`)
- **A6-15**: `server.ts` contains `requireAuth`
- **A6-16**: `server.ts` contains `5213`
- **A6-17**: `server.ts` contains `/api/checkout`
- **A6-18**: `server.ts` contains `/api/products`
- **A6-19**: Registry simulation — `registerAgentMetadata` for `storefront-root` with state `cartCount` and no-throw assertion; `getAllAgentMetadata()[0].tag === 'storefront-root'`

Import `__resetRegistryForTesting` from `../../../packages/agent/src/registry.ts` with `@ts-expect-error` comment (same as every prior smoke test).

**Step 10 — Update `examples/README.md`**

Change row 16 status column from `M2` to `M2 ready`. Also update the description to add a link: `| 16 | [`storefront/`](./storefront) | meta | M2 ready | 5113 | cart + checkout | \`@aihu-plugin/data\`, \`$shared\`, dummy Stripe |`

**Step 11 — Verify**

Run from `examples/storefront/`:
```
bun install && bun run test
```

Then run from repo root to confirm no regressions:
```
bun run test 2>&1 | tail -20
```

All 73 existing tests must remain passing. The storefront smoke test must add exactly 19 new passing tests (A6-1 through A6-19).

**Constraints recap:**
- CSS: `var(--token)` only, tokens from `_shared/tokens.css`, `@media (max-width: 480px)` in every `@style` block
- No changes to `packages/`, root `package.json`, `.size-limit.json`
- `examples/storefront/` is 100% greenfield — do not touch any other example directory except `examples/README.md` row 16
- Branch: `feat/m2-a2-examples/ex-07-agent-hub` (no new branch)
- Commit when all 19 smoke tests pass and existing 73 remain green

---

## §6 Verifier Sketch (round 7.5)

Verifier receives the commit SHA from Builder and runs:

1. `git log 1e95d83..HEAD --name-only` — confirm only `examples/storefront/**` and `examples/README.md` are touched; no `packages/` changes; no `.size-limit.json` changes
2. `bun run test` from repo root — confirm 73 + 19 = 92 tests pass (or the exact prior total + 19)
3. Source-text spot checks (read file, assert):
   - `storefront-root.aihu` contains `createResourceSerializer` AND the `// TODO (M3):` comment
   - `cart-drawer.aihu` contains `live Stripe binding pending`
   - `cart-drawer.aihu` contains `Authorization: 'Bearer demo-token-xyz'`
   - `server.ts` imports `requireAuth` from `@aihu/auth`
   - `server.ts` port is `5213`
4. Token law check: grep `@style` blocks in all three SFCs for any hex literal (`#[0-9a-fA-F]{3,6}`) or `rgb(` — must find none
5. Mobile breakpoint check: grep all three SFCs for `@media (max-width: 480px)` — must appear in each
6. README row 16 status is `M2 ready` (not just `M2`)
7. `cart-context.ts` exists at `examples/storefront/src/cart-context.ts`
8. `package.json` name is `@aihu/example-storefront`, port reference is `5113`

Pass criteria: all 8 checks green. If any fail, Verifier returns specific failure lines to Builder for a targeted fix in round 7.5.

---

## §7 STATUS: DONE

Research complete. EX-13 is unblocked. All dependencies (`@aihu-plugin/data`, `@aihu/auth`, `@aihu/context`) are built and available in the workspace. Builder brief is dispatchable immediately. No Director follow-up required before dispatch.
