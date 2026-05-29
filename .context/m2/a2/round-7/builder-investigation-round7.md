---
topic: aihu-m2-a2
track: aihu-m2-a2
kind: investigation
layer: delta
round: 7
slug: aihu/delta/m2/a2/round-7/builder-investigation-round7
---

# Builder Investigation — Round 7 — EX-13 Storefront

## CHECK 1: packages/plugin-data/src/index.ts + types.ts

### Exports confirmed:
- `createResource` — from `./resource.ts`
- `createResourceSerializer` — from `./serializer.ts`
- `createResourceStore` — from `./store.ts`
- `ResourceStoreToken` — from `./store.ts`
- Types: `DataState<T>`, `Resource<T>`, `ResourceOptions`

### Resource<T> shape:
```ts
interface Resource<T> {
  readonly state: Signal<DataState<T>>
  refetch(): void
  invalidate(): void
}
```

IMPORTANT: `resource.state` is a Signal (tuple), NOT a method.
Access pattern: `resource.state()` — calling the getter signal function.
This matches realtime-scores usage: `initialScores.state().status`

### DataState<T> discriminant:
- `{ status: 'idle' }`
- `{ status: 'loading' }`
- `{ status: 'ready'; data: T }`
- `{ status: 'error'; error: unknown }`
- `{ status: 'streaming'; data: T; done: false }`

### createResource signature (from resource.ts usage in realtime-scores):
```ts
createResource(keySignalGetter: () => string, fetcher: (key: string) => Promise<T>, options?: ResourceOptions<T>): Resource<T>
```

Status: CONFIRMED — proceed.

## CHECK 2: packages/auth/src/index.ts + middleware.ts

### Export confirmed: `requireAuth` — exported from `./middleware.ts`

### EXACT shape:
```ts
function requireAuth(options?: AuthMiddlewareOptions): Middleware
// where Middleware = (req: Request, next: Next) => Response | Promise<Response>
// and Next = () => Response | Promise<Response>
```

`requireAuth` is a **factory** — it returns a middleware function.
Call pattern: `const authMiddleware = requireAuth()`
Then wire: `authMiddleware(req, () => checkoutHandler(req))`

This is the FACTORY shape — `requireAuth(opts?)` returns `(req, next) => Response`.

Status: CONFIRMED — will wire as factory in server.ts.

## CHECK 3: packages/context/src/index.ts

### Exports confirmed:
- `createContext<T>(defaultValue?: T): ContextToken<T>`
- `provide<T>(token, value): void` — no-op when no map active (client-side safe)
- `inject<T>(token): T | undefined`
- `setSsrContextMap`, `clearSsrContextMap`, `runWithContext` (SSR utilities)

Status: CONFIRMED — proceed.

## CHECK 4: examples/_shared/tokens.css

### VALID token names (complete list):
**Layout/structure:** `--bg`, `--fg`, `--muted`, `--border`, `--accent`, `--hover-bg`, `--code-bg`, `--btn-bg`, `--header-h`
**Panel/card:** `--panel-bg`, `--input-bg`, `--tag-bg`, `--tag-fg`, `--focus-ring`
**Status:** `--success`, `--success-bg`, `--error`, `--error-bg`
**Card:** `--card-shadow`, `--radius`, `--max-w`
**Agent:** `--agent-bg`, `--agent-border`
**Stub:** `--stub-bg`, `--stub-border`, `--stub-fg`
**Special:** `--hn-orange`

### DO NOT USE (undefined):
- `--warning`, `--warning-bg` — NOT defined
- `--surface` — NOT defined
- `--text`, `--text-muted` — NOT defined
- `--muted-bg` — NOT defined (note: realtime-scores uses it with fallback, avoid)

Status: CONFIRMED — will use only valid tokens.

## CHECK 5: examples/realtime-scores/src/realtime-scores.aihu

### createResource usage pattern:
```js
const [resourceKey] = signal('initial-scores')
const initialScores = createResource(
  resourceKey,           // getter from signal tuple
  async (_key: string) => { ... }
)
```

Key point: `resourceKey` is the GETTER from `signal()` (first element of tuple).
State access: `initialScores.state().status` — call `state` as a function (it's a Signal getter).

## CHECK 6: examples/agent-hub/src/hub-root.aihu

### provide pattern:
```js
provide(HubServiceContext, null)
```
Called at top-level in @state block. No-op on client side when no map is active.
Context token is imported from a separate file (`./hub-context.ts`).

### Model for storefront:
- `cart-context.ts` → defines `CartContext` token
- `storefront-root.aihu` → imports CartContext, calls `provide(CartContext, [cartItems, setCartItems])`
- Child SFCs inject via `inject(CartContext)`

## CHECK 7: examples/agent-hub/tests/smoke.test.ts

### Template structure:
1. `readFileSync` per SFC path
2. `describe` blocks, each with `it` assertions using `toContain`
3. Registry simulation: `__resetRegistryForTesting()` in `beforeEach`, then `registerAgentMetadata()` + `getAllAgentMetadata()`
4. Import pattern: `// @ts-expect-error — internal test reset not on public types`
5. `import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'`

### Key for A6-19:
```js
registerAgentMetadata({ tag: 'storefront-root', ... })
const entries = getAllAgentMetadata()
expect(entries[0].tag).toBe('storefront-root')
```

## SUMMARY: All 7 checks complete — ready to write files.
