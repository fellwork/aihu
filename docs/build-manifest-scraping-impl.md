# Build Manifest — `@aihu/scraping` v0.1.0

**Branch:** `feat/scraping-impl`  
**Date:** 2026-05-07  
**Base commit:** 763c507 (live-binding v0.3.0)

---

## Files Created

| Path | Purpose |
|------|---------|
| `packages/scraping/src/rate-limiter.ts` | O(1) fixed-window rate limiter + `createRateLimiter` / `createRateLimitPlugin` |
| `packages/scraping/src/bot-detection.ts` | Fetch-API bot-detection middleware + `createBotDetectionMiddleware` |
| `packages/scraping/src/index.ts` | Public re-export barrel |
| `packages/scraping/tests/scraping.test.ts` | 16 vitest tests (≥11 required) |
| `packages/scraping/package.json` | Package metadata, ESM exports, build scripts |
| `packages/scraping/tsconfig.json` | Extends `../../tsconfig.base.json` |
| `packages/scraping/rolldown.config.ts` | Rolldown + dts build config |
| `packages/scraping/moon.yml` | Moon project descriptor (`layer: library`) |

## Files Modified

| Path | Change |
|------|--------|
| `package.json` (root) | `"packages/scraping"` added to `workspaces` |

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| AC1 | `src/index.ts` exports `createRateLimiter`, `createRateLimitPlugin`, `createBotDetectionMiddleware` | PASS |
| AC2 | `createRateLimiter({ now: () => 0 }).checkRateLimit('3/min', 'user:tag')` returns `true` 3× then `false` | PASS |
| AC3 | After advancing `now` by ≥ 60 001 ms, `checkRateLimit` returns `true` again | PASS |
| AC4 | O(1) invariant: 1 000 sequential calls to exhausted key complete in < 10 ms | PASS |
| AC5 | `bun run vitest run packages/scraping/tests/` passes — 16 tests (≥ 11) | PASS |
| AC6 | `bun run typecheck` passes in `packages/scraping/` | PASS |
| AC7 | `bun run build` produces `packages/scraping/dist/index.js` (1.48 kB, minified ESM) | PASS |

---

## Build Output

```
packages/scraping/dist/index.d.ts      2.08 kB
packages/scraping/dist/index.js        1.48 kB  (minified ESM)
packages/scraping/dist/index.js.map    7.17 kB
packages/scraping/dist/index.d.ts.map  0.49 kB
```

Built with rolldown v1.0.0-rc.18 in 588 ms.

---

## Algorithm Notes

### Rate Limiter (O(1) guarantee)

Uses `Map<key, { count: number; windowStart: number }>`. Each call:
1. `Map#get` — O(1) hash lookup.
2. Inline window reset (mutate in-place, no new allocation on hot path).
3. Increment and return — no sorted structures, no iteration, no scans.

Spec-parse results are cached in a secondary `Map<string, ParsedSpec>` — bounded by the number of distinct `rateSpec` strings (typically 1–5).

When `maxKeys` (default 100 000) is reached, new keys are fail-opened with a `console.warn` — no eviction scan.

### Bot Detection

Default blocklist lowercased at construction; each call does `ua.toLowerCase()` + `String#includes` per entry. No RegExp compilation on the hot path.
