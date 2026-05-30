# aihu — Auth · Magna · SEO (imperative integration)

A server-only worked example that proves the **3-package integration contract**
— `@aihu/auth` + `@aihu/magna` + `@aihu/seo` — using **only the imperative
APIs**. No `$auth` / `$query` macros yet; those land in **G3b / Round 3**.

The protected `/product` route demonstrates the full chain:

1. **Auth gate** — `getAuthState(req, authConfig)` from `@aihu/auth/server`.
2. **Magna read** — `createMagnaFetch(...)` reads product data server-side, with
   the session JWT relayed as a Bearer token via `getToken`.
3. **SEO emission** — a hand-rolled `<script type="application/ld+json">`
   block (a `JsonLdPage` from `@aihu/seo`) plus `createSeoRoutes` for
   `/sitemap.xml`, `/robots.txt`, and `/llms.txt`.

`createMagnaResource` is also wired (`makeProductResource`) as the **reactive
surface** demonstration and is exercised in the smoke test.

---

## The contract

| Request | Result |
|---|---|
| No session JWT | `401 Unauthorized` |
| Valid JWT, missing `magna:read` scope | `403 Forbidden` |
| Valid JWT **with** `magna:read` | `200` — HTML with magna data + JSON-LD |
| `GET /sitemap.xml` | `200` — XML from `createSeoRoutes` |

---

## Run it

```bash
# 1. Build the workspace packages FIRST so @aihu/* dist targets exist
#    (CI's examples job does this before building examples).
bun run build          # at the repo root

# 2. Then build + test this example
cd examples/auth-magna-seo
bun run build          # bundles src/routes.ts via Bun.build (no Vite)
bun run test           # vitest smoke test (jsdom)
```

---

## Imperative-only — macros land in G3b

This slice deliberately uses the imperative factories
(`getAuthState` / `createMagnaFetch` / `createMagnaResource` /
`createSeoRoutes`) wired directly in `src/routes.ts`. A `TODO(G3b)` comment at
the auth-gate + magna-read site marks where the `$auth` / `$query` macro uplift
(Round 3) will collapse the gate + read into declarative calls.

---

## Files

- `src/routes.ts` — the integration: `createApp()` + `makeProductResource()`.
- `aihu.config.ts` — consumer-app config (empty `plugins` for the imperative slice).
- `build.ts` — `Bun.build` bundle of `src/routes.ts` (no Vite, no `.aihu`).
- `tests/smoke.test.ts` — 401 / 403 / 200 + sitemap XML + reactive-resource asserts.
