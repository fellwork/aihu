---
topic: aihu-m2-a2
track: aihu-m2-a2
kind: build_manifest
layer: delta
round: 7
slug: aihu/delta/m2/a2/round-7/build-manifest-round-7
---

# Build Manifest — Round 7 — EX-13 Storefront

## STATUS: DONE

## Commit SHA: 988ef40

## Acceptance Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| A1 | 19 smoke tests pass | PASS | `Tests 19 passed (19)` |
| A2 | 10 do-not-break examples pass | PASS | live-counter 2, temperature-converter 3, timer 3, todo-mvc 7, color-theme 4, weather-card 15, blog-loader 8, realtime-scores 8, agent-hub 15, cf-adapter 8 = 73 total |
| A3 | 0 hex literals in SFCs; `@media (max-width: 480px)` in each | PASS | grep found no matches; all 3 SFCs have media query |
| A4 | server.ts imports `requireAuth` from `@aihu/auth`, port 5213 | PASS | `import { requireAuth } from '@aihu/auth'` + `port: PORT` where `PORT = 5213` |
| A5 | cart-drawer.aihu contains `live Stripe binding pending arch-3` | PASS | exact substring present |
| A6 | cart-drawer.aihu contains `demo-token-xyz` | PASS | in Authorization header value |
| A7 | storefront-root.aihu contains `createResourceSerializer` + M3 TODO | PASS | both present |
| A8 | OVER-1: only storefront/**, README.md, .context/round-7/** | PASS | committed files match |
| A9 | No root package.json / .size-limit.json changes | PASS | not touched |

## Files Created

| File | Purpose |
|------|---------|
| `examples/storefront/src/cart-context.ts` | CartContext token + CartItem/CartSignal types |
| `examples/storefront/src/product-list.aihu` | Product grid SFC — createResource + inject CartContext |
| `examples/storefront/src/cart-drawer.aihu` | Cart sidebar SFC — inject + checkout action + stub badge |
| `examples/storefront/src/storefront-root.aihu` | Root SFC — provide CartContext, createResourceStore/Serializer, M3 TODO |
| `examples/storefront/server.ts` | Bun API server port 5213 — GET /api/products, POST /api/checkout (requireAuth) |
| `examples/storefront/vite.config.ts` | Vite config — aihuCompilerPlugin + inline mock middleware (offline-safe) |
| `examples/storefront/index.html` | Entry HTML — title EX-13, tokens.css, storefront-root |
| `examples/storefront/package.json` | Package manifest — @aihu/auth, @aihu/context, @aihu-plugin/data deps |
| `examples/storefront/vitest.config.ts` | Vitest config — node environment |
| `examples/storefront/tests/smoke.test.ts` | 19 smoke tests A6-1 through A6-19 |

## Files Modified

| File | Change |
|------|--------|
| `examples/README.md` | Row 16 storefront: `M2` → `M2 ready` |

## Key Technical Decisions

1. **requireAuth shape**: Factory pattern `requireAuth() => (req, next) => Response`. Wired as `checkAuth(req, async () => { /* checkout logic */ })`.

2. **vite.config.ts approach**: Used inline `configureServer` middleware (option a — offline-safe) rather than proxy to localhost:5213. This ensures smoke tests work without a running server.

3. **CSS tokens**: All 3 SFCs use only tokens from `_shared/tokens.css`. Avoided `--warning`, `--warning-bg`, `--surface`, `--text`, `--text-muted` (undefined). Used `--fg`, `--muted`, `--panel-bg`, `--border`, `--radius`, `--card-shadow`, `--accent`, `--btn-bg`, `--hover-bg`, `--tag-bg`, `--tag-fg`, `--stub-bg`, `--stub-border`, `--stub-fg`, `--success`, `--success-bg`, `--error`, `--error-bg`.

4. **Resource.state access**: Used `products.state()` — calling the signal getter function per `Resource<T>.state: Signal<DataState<T>>` typing confirmed in pre-write gate.

5. **Linter fixes**: Pre-commit hook (biome) auto-fixed template literal style in server.ts and vite.config.ts — tests continued to pass.
