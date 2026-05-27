# M2-A3 SEO Verifier Report — Round 2

**Branch:** `feat/m2-a3-plugins/seo-greenfield`
**Verified at:** `d6eeca7` (feat(seo): add @aihu/seo greenfield package skeleton)
**Date:** 2026-05-27
**Verifier:** Sonnet 4.6 (verify/m2-a3-seo)

---

## Pre-flight Checks

| Check | Exit Code | Notes |
|-------|-----------|-------|
| `bun install` | 0 | Clean install |
| `bun run --filter @aihu/seo build` | 0 | `dist/index.js` produced (2.35 kB), `dist/index.d.ts` (3.52 kB) |
| `bun run --filter @aihu/seo typecheck` | 0 | No type errors |
| `bunx biome ci packages/seo/` | **1** | 10 fixable issues across src + tests (see Biome section below) |
| `bun run --filter @aihu/seo test` | 0 (via vitest direct) | All 15 tests pass |
| `bun run check:size-rows` | **1** | `@aihu/auth` accidentally declassified (see S13 + Over-scope) |

### Biome Issues (non-blocking per `biome ci` exit semantics but technically exit 1)

All issues are `FIXABLE` and auto-correctable. None are errors that prevent build or runtime correctness:

- `packages/seo/src/plugin.ts:46` — `useLiteralKeys` (bracket notation can use dot notation)
- `packages/seo/tests/seo.test.ts:149` — `useLiteralKeys`
- `packages/seo/tests/seo.test.ts:256,257` — `useOptionalChain`
- `packages/seo/rolldown.config.ts` — formatting
- `packages/seo/src/index.ts` — import organization
- `packages/seo/src/sitemap.ts` — formatting
- `packages/seo/src/types.ts` — formatting
- `packages/seo/tests/seo.test.ts` — import organization + formatting

**Assessment:** Biome issues are style/format violations, not correctness bugs. The repo's `check:pre-push` hook runs `bunx biome ci .` — these would block a push. Builder should run `bunx biome check --write packages/seo/` before merging.

---

## Sample Results (S01–S13)

### S01 — Package builds
**PASS**
- `bun run --filter @aihu/seo build` exits 0
- `packages/seo/dist/index.js` exists (2.35 kB)
- `packages/seo/dist/index.d.ts` exists (3.52 kB)

### S02 — Public exports
**PASS**
- Runtime exports confirmed present: `seo`, `createSeoRoutes`, `seoLlmsSections`
- Type exports confirmed in `dist/index.d.ts`: `SeoConfig`, `SeoRoutes` (plus `SitemapSource`, `JsonLdPage`, `RobotsOptions`)
- All 5 required exports present

### S03 — Plugin factory shape
**PASS**
- `seo({ siteName: 'My App', baseUrl: 'https://x.test' })` returns object with `name === '@aihu/seo'`
- Has `hooks` property
- `__aihu_plugin === true` brand check passes
- Test confirmed via vitest

### S04 — `createSeoRoutes` returns RouteHandler record
**PASS**
- Returns `{ sitemapXml, robotsTxt, llmsTxt }`
- All three handlers called with `new Request(...)` return a `Response` instance
- No throws

### S05 — Sitemap XML well-formed
**PASS**
- `Content-Type` header contains `application/xml`
- `status === 200`
- Body starts with `<?xml`
- Body contains `<url>` and `/about`

### S06 — `robots.txt` includes AI bot directives
**PASS**
- Body contains `User-agent: GPTBot`
- Body contains `Disallow:`
- Full AI bot list includes: GPTBot, ClaudeBot, PerplexityBot, Googlebot-Extended, CCBot, anthropic-ai, Google-Extended, Bytespider, cohere-ai, OAI-SearchBot, ChatGPT-User, DuckAssistBot, Applebot

### S07 — JSON-LD injection (afterParse)
**PASS**
- `seo({...}).hooks.afterParse` exists and is a function
- Calling with mock `SfcContext` and mock AST does not throw
- `generateJsonLd({})` returns string containing `"@context": "https://schema.org"` and `"@type": "WebPage"`
- Builder-time decision documented in `packages/seo/src/plugin.ts` JSDoc:
  > Since SfcContext provides no frontmatter/meta slot in v0.2.1, this hook injects a default WebPage JSON-LD using config.jsonLdDefaults merged with the baseUrl as the default page URL. When the compiler exposes per-SFC metadata, the hook can be updated to read page-level overrides.
- **Note for Director:** JSON-LD injection is conservative (config-level only, no per-page override). This is appropriate for v0.2.1 API constraints. Per-SFC override support should be tracked for when `symbolTable.frontmatter` becomes available in the compiler.

### S08 — `seoLlmsSections` returns composable shape
**PASS**
- Returns non-empty array with at least 1 entry
- Each entry has `title` (string) and `links` (array) matching `LlmsTxtSection` shape
- Tested with `sitemapSources: [{ path: '/docs' }]`

### S09 — Composition pattern works
**PASS**
- `[...['custom section'], ...seoLlmsSections(config)]` spreads correctly
- Merged array has length = userSections.length + seoSections.length

### S10 — Dep-free thesis (no third-party SDKs)
**PASS**
- `packages/seo/package.json` dependencies:
  - `@aihu/plugin: workspace:*`
  - `@aihu/server: workspace:*`
  - `@aihu-plugin/agent-readiness: workspace:*`
- All three are `@aihu/*` or `@aihu-plugin/*` scoped
- No third-party npm packages in `dependencies`

### S11 — install-manifest validates
**PASS**
- `packages/seo/install-manifest.json` exists
- `pluginName === "@aihu/seo"` ✓
- `pluginVersion === "0.1.0"` matches `package.json` version ✓
- `aihuVersion === "^0.2.0"` (non-empty string) ✓
- `installSteps` is array with 2 entries (register-plugin, register-routes) ✓

### S12 — Changeset present
**PASS**
- `.changeset/a3-seo-greenfield.md` exists
- Contains `"@aihu/seo": minor` in frontmatter ✓
- Description: "Add @aihu/seo greenfield package skeleton: sitemap.xml, robots.txt, llms.txt, and JSON-LD injection via afterParse hook."

### S13 — NO size-limit row
**PARTIAL PASS / BLOCKED**
- `.size-limit.json` does NOT contain any `@aihu/seo` entry ✓
- `@aihu/seo` IS correctly listed in `SERVER_SIDE` set in `scripts/check-size-rows.ts` ✓
- **HOWEVER:** `bun run check:size-rows` exits **1** due to a spurious side-effect in the seo commit

**Root cause:** The seo builder commit (`d6eeca7`) modified `scripts/check-size-rows.ts` to add `@aihu/seo` to `SERVER_SIDE`, but accidentally removed `@aihu/auth` from `SERVER_SIDE` in the same edit. This causes `@aihu/auth` to be reclassified as `browser-eligible` without a `.size-limit.json` row, triggering a policy violation.

**Evidence:**
```
# Before seo commit (2a964a8):
SERVER_SIDE contains: '@aihu/auth'

# After seo commit (d6eeca7):
SERVER_SIDE no longer contains '@aihu/auth'
```

The seo package itself correctly has no size-limit row. The policy failure is a merge conflict artifact in the script, not a problem with the seo package classification.

---

## Bidirectional Audit

### Over-scope Check A: `packages/plugin-agent-readiness/**`
**INFORMATIONAL (not blocking)**
- Files modified: `CHANGELOG.md`, `README.md`, `package.json` (version bump to 2.0.3)
- `packages/plugin-agent-readiness/src/` — **NOT modified** (no source changes)
- `packages/plugin-agent-readiness/src/vite-plugin.ts` — NOT modified
- These are release automation artifacts (version bumps from earlier commits in the branch's history), not from the seo builder commit directly

### Over-scope Check B: `packages/auth/**`, `packages/arbor/**`, `packages/agent-service/**`
**INFORMATIONAL (not blocking for seo, but see S13 root cause)**
- Modified files are limited to `CHANGELOG.md`, `README.md`, `package.json` in these packages
- Source files (`src/**`) in all three packages are **NOT modified**
- Changes are from release automation commits (version bumps, README autogen) in the branch history, not from the seo builder commit
- Exception: The seo builder commit (`d6eeca7`) did touch `packages/auth/README.md` as part of autogen artifact update, and `packages/arbor/README.md`

### Over-scope Check C: `@aihu/seo` in `.size-limit.json`
**PASS (no seo row)**
- `.size-limit.json` contains no entry with `name` matching `@aihu/seo` or `path` matching `packages/seo`

### Over-scope Check D: `.size-limit.json` modifications
**INFORMATIONAL (not from seo specifically)**
- `.size-limit.json` WAS modified, but not by the seo builder commit
- Changes include: `@aihu/runtime` limit bump (3400 B → 3450 B), addition of `@aihu-plugin/kindly-note` row, `@aihu/app` limit bump + new ignore entry, new `@aihu/css-engine/runtime/*` and `@aihu/primitives/*` sub-rows
- These changes are from earlier commits in the branch history (B5, css-engine, primitives work)
- None of these changes are from the seo builder commit

### Over-scope Check E: Browser field or browser export conditions in `packages/seo/package.json`
**PASS**
- No `browser` field present
- `exports` contains only `"."` with `types` + `import` conditions
- No `browser` condition in any export entry
- Package is correctly server-only

---

## Do-Not-Break Checks

| Check | Result |
|-------|--------|
| `bun run check:size-rows` | **FAIL** (exit 1) — caused by `@aihu/auth` being accidentally removed from SERVER_SIDE (see S13) |
| `bun run --filter @aihu/plugin typecheck` | **PASS** (exit 0) |
| `packages/plugin-agent-readiness/src/vite-plugin.ts` modified | **PASS** — NOT modified |
| `packages/plugin-agent-readiness/src/**` modified | **PASS** — NOT modified |

---

## Blocking Issues

### BLOCK-1: `scripts/check-size-rows.ts` — `@aihu/auth` accidentally removed from SERVER_SIDE

**Severity:** Blocking (breaks `check:size-rows` CI gate)

The seo builder commit modified `scripts/check-size-rows.ts` to add `@aihu/seo` to the `SERVER_SIDE` set. In doing so, `@aihu/auth` was accidentally dropped from the same set. Before the seo commit, `@aihu/auth` was at position 4 in `SERVER_SIDE`; after, it is absent.

**Fix required:**
```diff
 export const SERVER_SIDE = new Set<string>([
   '@aihu/server',
   '@aihu-plugin/agent-readiness',
   '@aihu-plugin/drizzle',
+  '@aihu/auth',
   '@aihu/ai',
   '@aihu/mcp',
   '@aihu/scraping',
   '@aihu/seo',
 ])
```

### BLOCK-2: Biome lint/format violations in `packages/seo/`

**Severity:** Blocking (would fail pre-push hook `bunx biome ci .`)

10 fixable biome issues across `src/plugin.ts`, `src/index.ts`, `src/sitemap.ts`, `src/types.ts`, `rolldown.config.ts`, and `tests/seo.test.ts`. All are auto-fixable with `bunx biome check --write packages/seo/`.

---

## Non-Blocking Observations

1. **S07 — Per-page JSON-LD**: The `afterParse` hook injects a single config-level JSON-LD for all SFCs. This is correct given `@aihu/plugin` v0.2.1's opaque `symbolTable`, but per-page override support is absent. Director should track this for when `symbolTable.frontmatter` is available.

2. **S13 partial**: The seo package itself has zero size-limit violations. The `check:size-rows` failure is entirely caused by the spurious `@aihu/auth` reclassification — once restored, the script will pass.

3. **`llmsTxt` route**: The `createSeoRoutes` implementation renders a basic `llms.txt` inline. The comment in `routes.ts` correctly notes that for full llms.txt with header/summary/optional sections, callers should use `seoLlmsSections(config)` composed into `@aihu-plugin/agent-readiness`. This is acceptable for a greenfield v0.1.0.

---

## STATUS: PARTIAL

The `@aihu/seo` package itself is functionally complete and correct. All 13 acceptance samples pass functionally (15/15 tests green, build clean, types clean). Two blocking issues prevent merge:

1. `scripts/check-size-rows.ts` has `@aihu/auth` accidentally removed (1-line fix)
2. Biome lint/format violations in `packages/seo/` (auto-fixable)

Neither blocking issue affects the correctness of the seo package's behavior — they are CI hygiene issues introduced as side effects of the builder commit.
