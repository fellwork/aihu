# State — Adapters Track

**Track:** adapters
**Branch:** feat/docs-site (current)
**Last updated:** 2026-05-04

---

## Current phase

**Building — all specs complete, implementation in progress.**

---

## Planning artifacts

| Artifact | Status | File |
|---|---|---|
| Scout — server/adapter landscape | ✅ Complete | (inline in session) |
| Architect A1 (ScribeAdapter contract) | ✅ Complete | `spec-adapters-a1-a2-a3.md` |
| Architect A2 (@scribe/adapter-cloudflare) | ✅ Complete | `spec-adapters-a1-a2-a3.md` |
| Architect A3 (@scribe/adapter-vercel) | ✅ Complete | `spec-adapters-a1-a2-a3.md` |

---

## Implementation phases

- [ ] Phase 1: `packages/app/src/adapter.ts` + config.ts + index.ts + check-size-rows
- [ ] Phase 2: `viteScribePlugin` closeBundle hook + adapterPlugin sentinel
- [ ] Phase 3: `@scribe/adapter-cloudflare` package + tests
- [ ] Phase 4: `@scribe/adapter-vercel` package + tests
- [ ] Phase 5: Full test suite green

---

## Scope

### IN V1 adapters

- `ScribeAdapter` + `AdapterContext` interface in `@scribe/app`
- `viteScribePlugin` `closeBundle` hook calls `adapter.adapt(context)` (build mode only)
- `@scribe/adapter-cloudflare` — Workers SPA mode, `_worker.js` + `wrangler.toml`
- `@scribe/adapter-vercel` — Edge/Serverless SPA mode, Build Output API v3

### DEFERRED

- SSR mode adapters (page routes at edge — V2+)
- `@scribe/adapter-node` (Hono/Elysia/Nitro bridge)
- `@scribe/adapter-bun`
- `@scribe/adapter-tauri` (desktop IPC — completely different paradigm)
- Cloudflare env bindings typing (KV, D1, R2)
- `maxDuration` option for Vercel serverless

---

## Do-not-break

- `@scribe/app` `viteScribePlugin()` zero-config path must still work (no adapter = no-op)
- All 620 TS + 232 Rust tests pass
- `.size-limit.json` — no existing row increases; adapter packages are BUILD_DEV_ONLY
- `blog-router` example builds cleanly without an adapter configured
