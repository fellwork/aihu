# Retro — Agent-Readiness Phases 1–3

**Date:** 2026-04-30
**Track:** `@scribe/server` + `@scribe/agent-readiness`
**Branch at close:** `feat/agent-readiness-phase3` @ `8e4f885`
**Tests:** 140 → 206 (+66)

---

## What Was Built

### Phase 0 (pre-session, squash-merged)
Package scaffolds, `server/types.ts`, `agent-readiness/llms-txt.ts`, `agent-readiness/robots.ts`.

### Phase 1
- `server/`: `data.ts`, `middleware.ts`, `router.ts`, `api.ts`, `ssr.ts`
- `agent-readiness/`: `mcp-server-card.ts`, `types.ts`, `content-negotiation.ts`
- Fixed `robots.ts` `RobotsRule` interface: `allow`/`disallow` → `ReadonlyArray<string>`, added `crawlDelay`
- `__DEV__: 'false'` define added to `packages/server/rolldown.config.ts`
- AC-2, AC-3, AC-4, AC-8 acceptance tests

### Phase 2
- `server/config.ts` + `server/agent-readiness-config.ts` (mirror, sync comment in both)
- Final barrels: `server/index.ts` (spec §2.8 complete) + `agent-readiness/index.ts` (spec §3.7 minus vite-plugin)
- Removed `@internal` functions from agent-readiness barrel
- 4 config tests (ScribeConfig shape, defineScribeConfig identity, AgentReadinessConfig mirror)

### Phase 3
- `agent-readiness/vite-plugin.ts` — `agentReadiness()` Vite plugin + `createAgentReadinessRoutes()`
- `agent-readiness/index.ts` — final barrel with vite-plugin export (spec §3.7 complete)
- 5 vite-plugin unit tests + 2 integration tests (`createRouter` + `createContentNegotiationHandler`)
- `scripts/check-edge-safe.sh` — AC-6 bundle inspection script

---

## Acceptance Criteria Status

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | `generateLlmsTxt` produces valid llms.txt structure | PASS |
| AC-2 | `generateMcpServerCard` output matches SEP-1649 schema | PASS |
| AC-3 | Content negotiation returns markdown on `Accept: text/markdown` | PASS |
| AC-4 | Content negotiation falls through when no markdown match | PASS |
| AC-5 | `generateRobotsTxt` allow-all includes all AI_BOT_LIST bots | PASS |
| AC-6 | No forbidden Node-only globals in dist bundles | Script written (`scripts/check-edge-safe.sh`); dist not yet built — verify after `bun run build` |
| AC-7 | Hard boundary: zero client-runtime imports in source | PASS (tsc clean, grep verified) |
| AC-8 | `MountScope.agent` shape unchanged | PASS |

206/206 tests passing. `tsc --noEmit` clean.

---

## Spec §8 Implementation Sequence

| Phase | Items | Status |
|-------|-------|--------|
| Phase 0 | Package scaffolds, `types.ts`, `llms-txt.ts`, `robots.ts` | COMPLETE |
| Phase 1 | `router.ts`, `middleware.ts`, `api.ts`, `ssr.ts`, `data.ts`, `types.ts`, `mcp-server-card.ts`, `content-negotiation.ts` | COMPLETE |
| Phase 2 | `config.ts`, `agent-readiness-config.ts`, barrels | COMPLETE |
| Phase 3 | `vite-plugin.ts`, integration tests, AC-6/AC-7 scripts | COMPLETE |

---

## Key Learnings

1. **`RobotsRule` interface drift** — Phase 0 built `robots.ts` with `allow: string` / `disallow: string` (scalar). Phase 1 tests caught the mismatch against spec §3.4 which uses `ReadonlyArray<string>`. Fixed in Phase 1 before any dependents existed — low blast radius.

2. **`@internal` barrel discipline** — `agentMetadataToLlmsTxtLink` and `agentMetadataToSkills` were accidentally included in the Phase 2 barrel. Spec §9 (and JSDoc `@internal`) is explicit: these are test-accessible, not stable API. Removed in same phase. Pattern: scan barrel diff against spec §X.7 explicitly.

3. **`__DEV__` define timing** — `serverError` security requirement (S-1) depends on the build-time `__DEV__` constant. Needed in `rolldown.config.ts` before tests can assert production behavior. Added in Phase 1 alongside `api.ts`.

4. **Vite as `external` in rolldown** — `vite-plugin.ts` imports `type { Plugin } from 'vite'`. `vite` must be listed in `rolldown.config.ts` externals (alongside `@scribe/server`, `@scribe/agent`) or the build tries to bundle Vite itself. Caught in Phase 3 config review.

5. **`createAgentReadinessRoutes` decoupling** — Spec §3.6 explicitly notes the plugin does NOT inject into `createRouter` automatically; it exports named handlers instead. This preserves consumer flexibility (e.g., add auth middleware per-route). Pattern validated by integration tests.

6. **OQ-3 deferral pattern** — `getAllAgentMetadata()` is absent from `@scribe/agent` v0. Rather than block vite-plugin.ts, a TODO comment was left at the call site with the OQ-3 reference. The plugin works fully without it; auto-generation of the Components section is additive when the minor bump lands.

---

## Open Items

| Item | Ref | Detail |
|------|-----|--------|
| `getAllAgentMetadata()` integration | OQ-3 | `@scribe/agent` needs minor-version bump. TODO comment in `vite-plugin.ts`. Blocks llms.txt Components auto-section at runtime. |
| Hot-reload wiring | Phase 3 note | `configureServer` hook is in place in `vite-plugin.ts`. Invalidation listener for `.scribe` module changes not yet wired. Dev-mode follow-on. |
| Dist build + AC-6 verification | AC-6 | `bun run build` not yet run on `feat/agent-readiness-phase3`. `scripts/check-edge-safe.sh` is ready; needs dist files to run against. |

---

## Next Round Scope

1. Squash-merge `feat/agent-readiness-phase1` → `phase2` → `phase3` → `main`
2. Run `bun run build` from repo root — verify rolldown output + `.d.ts` emission for both packages
3. Run `bash scripts/check-edge-safe.sh` against dist files — AC-6 final PASS/FAIL
4. Minor-version bump `@scribe/agent` to add `getAllAgentMetadata()` (OQ-3)
5. Wire hot-reload invalidation in `vite-plugin.ts` `configureServer` hook
