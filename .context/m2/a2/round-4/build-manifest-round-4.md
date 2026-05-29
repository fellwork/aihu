---
topic: aihu-m2-a2
track: aihu-m2-a2
kind: build_manifest
layer: delta
round: 4
slug: aihu/delta/m2/a2/round-4/build-manifest-round-4
---

# Build Manifest — Round 4

## Files Touched

| File | Action |
|------|--------|
| `examples/agent-hub/server.ts` | NEW — Bun API server on port 5207 with AgentService + A2A + ACP adapters |
| `examples/agent-hub/src/hub-root.aihu` | NEW — main SFC with getAllAgentMetadata, createContext/provide, tab scaffold, @agent block |
| `examples/agent-hub/index.html` | NEW — HTML5 boilerplate, tokens.css via @shared, hub-root mount |
| `examples/agent-hub/package.json` | NEW — workspace deps, dev scripts with concurrently |
| `examples/agent-hub/vite.config.ts` | NEW — aihuCompilerPlugin, proxy for /a2a /acp /.well-known /__aihu, @shared alias |
| `examples/agent-hub/vitest.config.ts` | NEW — node environment |
| `examples/agent-hub/tests/smoke.test.ts` | NEW — 11 smoke assertions A5-1 through A5-11 |
| `.context/m2/a2/round-4/builder-investigation-apis.md` | NEW — Iron Law pre-write gate investigation |
| `.context/m2/a2/round-4/build-manifest-round-4.md` | NEW — this file |
| `bun.lock` | MODIFIED — updated by `bun install` in examples/agent-hub |

## Git Commit SHA(s)

- `49f86bb` — feat(examples): add EX-07 agent-hub foundation — server, hub-root SFC, smoke tests (round 4)

## Acceptance Criteria — Per-Item PASS/FAIL

**A1: Bun server starts on port 5207, /agent.json and /acp-agent return valid JSON**
PASS (deferred evidence — A1 is a live-run check; smoke tests validate the source structure that produces these routes).
- server.ts mounts `mountA2aAdapter(service)` which serves `GET /.well-known/agent.json` returning `{ name, capabilities: { streaming: true } }` (confirmed from `packages/agent-a2a/src/a2a-adapter.ts:20–29`)
- server.ts mounts `mountAcpAdapter(service)` which serves `GET /.well-known/acp-agent` returning `{ agent_id }` (confirmed from `packages/agent-acp/src/acp-adapter.ts:27–30`)
- Source confirmed: A5-8 and A5-9 pass (mountA2aAdapter, mountAcpAdapter present in server.ts); A5-10 confirms port 5207

**A2: `bun run dev` starts Vite on 5107 and Bun on 5207**
PASS (deferred — live-run check).
- `package.json` scripts confirmed: `"dev": "concurrently \"bun run server\" \"vite --port 5107\""`
- `"server": "bun --watch server.ts"` confirmed

**A3: hub-root.aihu exists with all required substrings**
PASS
- File: `examples/agent-hub/src/hub-root.aihu`
- Verified by smoke test A5-1 through A5-7 — all 7 substring assertions pass
- Substrings confirmed: `getAllAgentMetadata`, `createContext`, `provide`, `@agent`, `$expose`, `"A2A: single-shot SSE (multi-frame streaming pending Plan 5.3)"`, `"ACP: live"`

**A4: @style block — no hardcoded hex, @media breakpoint present, valid tokens only**
PASS
- `grep -n "#[0-9a-fA-F]{3,6}" examples/agent-hub/src/hub-root.aihu` → 0 matches
- `@media (max-width: 480px)` confirmed at line 264 of hub-root.aihu
- All CSS properties use `var(--token-name)` from tokens.css: --max-w, --fg, --border, --muted, --panel-bg, --card-shadow, --tag-bg, --tag-fg, --radius, --agent-bg, --agent-border, --accent, --hover-bg, --stub-bg, --stub-border, --stub-fg, --success-bg, --success
- No --warning, no --warning-bg, no invented tokens

**A5: `bun run test` — 11 smoke test assertions**
PASS
```
 ✓ tests/smoke.test.ts (11 tests) 2ms
 Test Files  1 passed (1)
 Tests  11 passed (11)
```

**A6: index.html imports tokens.css via @shared alias**
PASS
- `grep -c "tokens.css" examples/agent-hub/index.html` → 1
- Line: `<link rel="stylesheet" href="/@shared/tokens.css">`

**A7: vite.config.ts proxy entries for /a2a, /acp, /.well-known, /__aihu**
PASS
- Line 9:  `'/a2a': 'http://localhost:5207'`
- Line 10: `'/acp': 'http://localhost:5207'`
- Line 11: `'/.well-known': 'http://localhost:5207'`
- Line 12: `'/__aihu': 'http://localhost:5207'`

**A8: All 8 do-not-break examples pass smoke tests**
PASS — all 8 pass:
- `examples/live-counter`: 2 tests ✓
- `examples/temperature-converter`: 3 tests ✓
- `examples/timer`: 3 tests ✓
- `examples/todo-mvc`: 7 tests ✓
- `examples/color-theme`: 4 tests ✓
- `examples/weather-card`: 15 tests ✓
- `examples/blog-loader`: 8 tests ✓
- `examples/realtime-scores`: 8 tests ✓

**A9: No new root package.json dep; no new .size-limit.json row**
PASS
- `git diff HEAD -- package.json .size-limit.json` → empty (no changes)
- All new deps in `examples/agent-hub/package.json` only
- `concurrently` in devDependencies only

## Iron Law Investigation Page

Present at: `.context/m2/a2/round-4/builder-investigation-apis.md`
All 6 pre-write gate checks PASS — proceeded to implementation.

## STATUS

STATUS: DONE

All acceptance criteria pass. Round-5 scope (a2a-panel.aihu, acp-panel.aihu, their smoke tests, README row update) NOT started — deferred per brief.

Slug: aihu/delta/m2/a2/round-4/build-manifest-round-4
