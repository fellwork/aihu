# State — Agent-Readiness Track

**Last updated:** 2026-04-30
**Branch at close:** `feat/round-n2-compliance` @ `456c42c`
**Tests:** 206 → 255 (+49 from Round N+2)

---

## Track status: COMPLETE (Round N+2)

All agent-protocol compliance gates are live. The three badges in the README
(`llms.txt supported`, `MCP compatible`, `agent-ready`) are backed by failing
test suites — spec violations in the source will break `bun run test`.

---

## What was built

### Agent-readiness packages (Phases 1–3, cf99d76)
- `@aihu/server` — fetch-API router, middleware, api helpers, SSR, data loaders, config
- `@aihu/agent-readiness` — `llms.txt`, MCP Server Card, `robots.txt`, content negotiation, Vite plugin

### Round N+2 — Track A: compliance tests (3e756aa)

| File | Tests | Spec |
|---|---|---|
| `packages/agent-readiness/tests/compliance/llms-txt-spec.test.ts` | 9 | llmstxt.org |
| `packages/agent-readiness/tests/compliance/mcp-server-card-schema.test.ts` | 14 | SEP-1649 |
| `packages/agent-readiness/tests/compliance/robots-rfc9309.test.ts` | 7 | RFC 9309 |
| `packages/agent-readiness/tests/compliance/isitagentready.test.ts` | 7 | isitagentready.com checklist |

Source fixes made to pass compliance (not test workarounds):
- `packages/agent-readiness/src/llms-txt.ts` — empty sections now omitted (spec §4)
- `packages/server/src/ssr.ts` — `HeadConfig.lang` → `<html lang="…">` (Lighthouse a11y)

### Round N+2 — Track B: Lighthouse gate (456c42c)

| File | Purpose |
|---|---|
| `demo/server.ts` | Bun server on port 3456: SSR + agent-readiness routes |
| `demo/pages/home.ts` | HomePage component factory |
| `demo/pages/about.ts` | AboutPage component factory |
| `scripts/lighthouse.ts` | Quality gate runner — asserts ≥ 90 on perf/a11y/bp/seo |
| `packages/server/tests/compliance/ssr-output.test.ts` | 12 SSR structural tests |

Lighthouse results at close: Performance 100, Accessibility 100, Best Practices 96, SEO 91.
LCP ~900ms (≤ 2500ms limit), CLS 0.000.

---

## Known gaps (v1 scope)

- Full hydration (`MountScope.serialize()`) still throws `ArborNotImplementedError` — sub-project #6
- Agent live-binding (`MountScope.agent`) — sub-project #7
- `when`/`each` reconciler — v1 reconciler
- Lighthouse CI in GHA — deferred until v1 auto-trigger cutover

---

## Acceptance criteria met

- [x] All 49 compliance tests pass in `bun run test` (255 total, 0 failures)
- [x] `generateLlmsTxt` spec violation → test failure (regression guard in place)
- [x] `generateMcpServerCard` missing field → test failure
- [x] isitagentready checklist: all 7 endpoint tests pass
- [x] Demo app starts and serves valid HTML on port 3456
- [x] `bun scripts/lighthouse.ts` exits 0 with all 4 categories ≥ 90
- [x] `package.json` has `test:quality` script
- [x] Badges in README link to `#compliance` anchor (not external sites)
