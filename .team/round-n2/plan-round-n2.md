# Round N+2 — Agent Compliance + Meta-Framework Quality Gates

**Track:** `test-quality`
**Branch convention:** `feat/round-n2-*`
**Parallel-safe:** YES — zero overlap with `compiler` track. All work lives in `tests/`, `scripts/`, `packages/*/tests/`, and a new `demo/` directory. No changes to any `packages/*/src/`.
**Prerequisite:** Round N+1 (agent-readiness Phases 0–3) merged to `main` ✓

---

## Goal

Back the three agent-protocol badges with real test gates that can fail. Add a Lighthouse CI gate for meta-framework quality. Both run in `bun run test` or a dedicated `bun run test:quality` script.

```
[llms.txt supported]    ← fails if generateLlmsTxt output breaks spec
[MCP compatible]        ← fails if McpServerCard output breaks SEP-1649 schema
[agent-ready]           ← fails if any isitagentready.com endpoint is missing/malformed
[Lighthouse ≥ 90]       ← fails if demo app drops below score threshold
```

---

## Track A — Agent Protocol Compliance Tests

**Files touched:** `packages/agent-readiness/tests/compliance/` (new subdirectory), `packages/server/tests/compliance/` (new subdirectory)
**No source changes.**

### A-1 · llms.txt format validator

File: `packages/agent-readiness/tests/compliance/llms-txt-spec.test.ts`

Validate `generateLlmsTxt` output against the llmstxt.org specification rules:

| Rule | Check |
|---|---|
| First non-blank line must be `# {name}` (H1) | `lines[0] === '# ' + config.name` |
| Summary block (if present) must be `> {text}` immediately after H1 blank line | regex `^> .+` |
| Every section must open with `## {title}` (H2) | no H1/H3+ headings in body |
| `## Optional` section, if present, must be **last** | index of Optional = last H2 index |
| Link format: `- [title](url)` or `- [title](url): description` | regex per line |
| Empty sections (zero links) must be **omitted** | test with empty section in config |
| No trailing whitespace on any line | check each line |
| Output ends with a newline or is trimmed (no trailing `\n\n`) | check end |
| `generateLlmsFullTxt` must NOT contain `## Optional` heading | dedicated test |

Minimum: **9 tests** (one per rule).

### A-2 · MCP Server Card schema validator

File: `packages/agent-readiness/tests/compliance/mcp-server-card-schema.test.ts`

Validate `generateMcpServerCard` output against the SEP-1649/SEP-2127 required fields:

| Field | Constraint |
|---|---|
| `$schema` | exact string `'https://modelcontextprotocol.io/schemas/server-card/v1.0'` |
| `version` | exact string `'1.0'` |
| `protocolVersion` | matches `YYYY-MM-DD` format |
| `serverInfo.name` | non-empty string |
| `serverInfo.version` | non-empty string |
| `transport.type` | `'streamable-http'` or `'sse'` only |
| `transport.url` | valid URL (parseable by `new URL()`) |
| `capabilities` | object with exactly `{ tools: boolean, resources: boolean, prompts: boolean }` |
| `tools[].name` | non-empty string when tools array present |
| `tools[].description` | non-empty string when tools array present |
| Auth `authorizationServer` | valid URL when auth present |
| Auth `resourceMetadata` | valid URL when present |
| No `clientSecret`, `token`, `password`, `secret` keys anywhere in output | deep JSON scan |
| `JSON.stringify()` round-trips cleanly (no undefined values) | parse(stringify(card)) deep-equals card |

Minimum: **14 tests**.

### A-3 · robots.txt RFC 9309 compliance

File: `packages/agent-readiness/tests/compliance/robots-rfc9309.test.ts`

| Rule | Check |
|---|---|
| Each record block: `User-agent:` lines must come **before** `Allow:`/`Disallow:` lines | parse blocks, check line order |
| No blank `User-agent:` value | `User-agent: ` with no value is invalid |
| `Allow:` and `Disallow:` paths must start with `/` | validate each path |
| `Sitemap:` must appear **after** all records, not inside a block | check position |
| `Crawl-delay:` value must be a positive number when present | parse and check |
| `deny-all` path: `User-agent: *` with `Disallow: /` must exist OR per-bot deny blocks cover all `AI_BOT_LIST` entries | validate coverage |
| Empty output not produced for default config (no args) | `generateRobotsTxt()` returns non-empty string |

Minimum: **7 tests**.

### A-4 · isitagentready.com integration checklist

File: `packages/agent-readiness/tests/compliance/isitagentready.test.ts`

Spin up a `createRouter` instance with `createAgentReadinessRoutes` and verify all four endpoints pass the isitagentready.com checklist items:

| Endpoint | Check |
|---|---|
| `GET /llms.txt` | 200, `Content-Type: text/plain`, body starts with `# ` |
| `GET /llms-full.txt` | 200, body starts with `# `, no `## Optional` heading |
| `GET /.well-known/mcp/server-card.json` | 200, `Content-Type: application/json`, body parses as valid McpServerCard |
| `GET /robots.txt` | 200, `Content-Type: text/plain`, contains `User-agent:` |
| `GET /about` with `Accept: text/markdown` | content negotiation middleware returns `text/markdown` when resolver has content |
| `GET /about` with `Accept: text/html` | falls through to HTML handler |
| `GET /.well-known/mcp/server-card.json` without endpoint in config | 404 |

Minimum: **7 tests**.

---

## Track B — Meta-Framework Quality Gate (Lighthouse)

**Files touched:** `demo/` (new), `scripts/lighthouse.ts` (new), `packages/server/tests/compliance/ssr-output.test.ts` (new)
**No changes to existing source.**

### B-1 · Demo app

Directory: `demo/`

A minimal scribe application that exercises the full stack:
- `demo/server.ts` — `createRouter` + `renderToString` + `createAgentReadinessRoutes`
- `demo/pages/home.ts` — a component returning `{ kind: 'branch', tag: 'main', ... }` with a heading, paragraph, and nav link
- `demo/pages/about.ts` — second route for multi-page Lighthouse test coverage
- `demo/package.json` — `"start": "bun demo/server.ts"` on port 3456

The demo app is intentionally minimal — its purpose is a valid Lighthouse target, not a showcase. It must:
- Serve a full HTML document via `renderToString` + `opts.head`
- Pass `<!DOCTYPE html>`, `<html lang="en">`, `<title>`, `<meta name="viewport">`
- Serve `/llms.txt`, `/.well-known/mcp/server-card.json`, `/robots.txt`
- Return 404 for unknown routes

### B-2 · Lighthouse runner script

File: `scripts/lighthouse.ts` (run with `bun`)

Uses `lighthouse` npm package + `puppeteer` (or `playwright`) to:
1. Start the demo server as a subprocess on port 3456
2. Run Lighthouse against `http://localhost:3456/` and `http://localhost:3456/about`
3. Assert scores ≥ thresholds:

| Category | Threshold |
|---|---|
| Performance | ≥ 90 |
| Accessibility | ≥ 90 |
| Best Practices | ≥ 90 |
| SEO | ≥ 90 |

4. Assert Core Web Vitals (simulated):
   - LCP ≤ 2500 ms (server-rendered, should be near-instant)
   - CLS = 0 (static HTML, no layout shift)

5. Write results to `scripts/lighthouse-results.json` (gitignored)
6. Exit non-zero on any threshold failure

Run via: `bun scripts/lighthouse.ts`

Add to `package.json` scripts: `"test:quality": "bun scripts/lighthouse.ts"`

### B-3 · SSR output structural tests

File: `packages/server/tests/compliance/ssr-output.test.ts`

Unit-level checks that `renderToString` produces structurally valid HTML:

| Check |
|---|
| Output includes `<!DOCTYPE html>` when `opts.head` provided |
| `<html>` tag present |
| `<head>` contains `<title>` when `opts.head.title` set |
| `<meta>` tags from `opts.head.meta` appear in `<head>` |
| `<link>` tags from `opts.head.links` appear in `<head>` |
| No `undefined` or `[object Object]` in output |
| Branch with boolean attr `disabled: true` → `disabled` attribute (no value) |
| Branch with boolean attr `disabled: false` → attr omitted |
| Nested branches render correct depth |
| `data-scribe-path` attributes present when `opts.hydratable: true` |
| Serializer result injected as `<script id="__scribe_state__">` |
| Serializer throw → no script tag, no error thrown |

Minimum: **12 tests**.

---

## File ownership map (parallel-safety proof)

| File/directory | Round N+2 | Compiler track |
|---|---|---|
| `packages/*/src/` | ❌ untouched | ❌ untouched (compiler gets its own `packages/compiler/`) |
| `packages/*/tests/compliance/` | ✅ new | ❌ |
| `demo/` | ✅ new | ❌ |
| `scripts/lighthouse.ts` | ✅ new | ❌ |
| `scripts/check-*.sh` | ❌ existing | ❌ existing |
| `packages/compiler/` | ❌ | ✅ new |
| `.team/round-n2/` | ✅ this plan | ❌ |
| `.team/compiler/` | ❌ | ✅ other plan |

Zero overlap. Both tracks can run on separate branches simultaneously with no merge conflicts.

---

## Acceptance criteria

**Track A complete when:**
- [ ] All 37+ compliance tests pass in `bun run test`
- [ ] `generateLlmsTxt` with intentional spec violation → test failure (regression guard)
- [ ] `generateMcpServerCard` with missing required field → test failure
- [ ] isitagentready checklist: all 7 endpoint tests pass from `createRouter` instance

**Track B complete when:**
- [ ] Demo app starts and serves valid HTML on port 3456
- [ ] `bun scripts/lighthouse.ts` exits 0 with all 4 categories ≥ 90
- [ ] `bun run test` still 206+ passing (SSR compliance tests added)
- [ ] `package.json` has `test:quality` script

**Round N+2 complete when:**
- [ ] All above
- [ ] Badges in README link to `#compliance` anchor or CI results (not external sites)
- [ ] `state-agent-readiness.md` updated with compliance coverage

---

## Suggested Scout brief (session start)

> Read `packages/agent-readiness/src/` and `packages/server/src/` to confirm current export shapes. Confirm `renderToString` in `ssr.ts` handles `opts.head` with `lang` attribute on `<html>`. Confirm `robots.ts` `RobotsRule` has `crawlDelay?: number`. Check whether `lighthouse` and `puppeteer` are in `package.json` devDependencies yet. Report blockers.

---

*Plan authored: 2026-04-30. Prerequisite: `main` at `cf99d76` (agent-readiness + README badges).*
