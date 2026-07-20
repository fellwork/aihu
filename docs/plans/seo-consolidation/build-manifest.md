# Build manifest — #430 (DE4): consolidate `@aihu/seo` into `@aihu-plugin/agent-readiness`

Branch: `fix/seo-consolidation`. Ratified design per the founder comment on #430
(2026-07-20); all six amendments implemented. TS/docs-only — no
`packages/compiler/src` (Rust) changes, no binary bump.

## Per-bot classification (13 bots)

Single source of truth: `AI_BOT_REGISTRY` in
`packages/plugin-agent-readiness/src/robots.ts`. `AI_BOT_LIST`,
`AI_USER_FETCHER_BOTS`, and `AI_TRAINING_CRAWLER_BOTS` are all derived from it
(no second list to keep in sync — this issue is a Derived-property fix).
Registry order preserves the pre-#430 `AI_BOT_LIST` order so `'allow-all'` /
`'deny-all'` output block order is byte-stable.

| User agent | Tier | Classification rationale |
|---|---|---|
| `GPTBot` | training-crawler (opt-in) | OpenAI autonomous model-training crawler |
| `ClaudeBot` | training-crawler (opt-in) | Anthropic crawler gathering content to train/improve models |
| `PerplexityBot` | training-crawler (opt-in) | Autonomous index crawler; the user-delegated Perplexity agent is `Perplexity-User`, which is not in the list (the ratification's "PerplexityBot-User if present" — not present) |
| `Googlebot-Extended` | training-crawler (opt-in) | Variant token of Google-Extended (AI training control) |
| `CCBot` | training-crawler (opt-in) | Common Crawl; corpus widely used for LLM training |
| `anthropic-ai` | training-crawler (opt-in) | Legacy Anthropic training token predating ClaudeBot |
| `Google-Extended` | training-crawler (opt-in) | Google token governing Gemini/Vertex training use of content |
| `Bytespider` | training-crawler (opt-in) | ByteDance LLM-training scraper |
| `cohere-ai` | training-crawler (opt-in) | Cohere training-data token |
| `OAI-SearchBot` | user-fetcher (allowed) | ChatGPT search index; cited links; not used for training (named allow-tier in the ratification) |
| `ChatGPT-User` | user-fetcher (allowed) | Fetches when a ChatGPT user asks (named allow-tier in the ratification) |
| `DuckAssistBot` | user-fetcher (allowed) | Fetches sources for cited DuckAssist answers to user queries |
| `Applebot` | user-fetcher (allowed) | Siri/Spotlight **search** crawler — blocking it harms discoverability like blocking Googlebot; Apple's AI-training control is the separate `Applebot-Extended` token |

Split: 4 fetchers / 9 trainers. A test asserts the two tiers partition the 13.

## `aiAgents` vocabulary + default change

`AgentReadinessConfig.aiAgents` (canonical type in
`packages/server/src/agent-readiness-config.ts`) and `RobotsConfig.aiAgents`:

- `'allow-agents'` — **NEW, the default** (was `'allow-all'`): fetchers `Allow: /`, trainers `Disallow: /`.
- `'allow-all'` | `'deny-all'` | `RobotsRule[]` — unchanged (back-compat tested).
- Any other string → throws (see value guard).

Semver: default flip + new union member ⇒ `@aihu-plugin/agent-readiness`
**2.0.4 → 2.1.0** (minor, per ratification: "new default applies to the new
package only"; the ratified breaking-change budget was spent on `@aihu/seo`'s
major).

## Shim mapping (`@aihu/seo` → consolidated surface)

| Legacy input (`@aihu/seo`) | Mapped to | Notes |
|---|---|---|
| `robotsOptions.disallowAiBots` **absent** | `aiAgents: 'deny-all'` | Legacy block-everything default preserved — no silent robots.txt flip for published consumers. Emits **one deprecation warning at `createSeoRoutes` time** telling the operator to state a choice in the new vocabulary. |
| `disallowAiBots: true` | `aiAgents: 'deny-all'` | Maps correctly forever; no warning. |
| `disallowAiBots: false` | `aiAgents: 'allow-all'` | Maps correctly forever; no warning. |
| `robotsOptions.additionalRules` | `standard` rules | Legacy block order preserved (custom rules → bot blocks → wildcard). |
| `sitemapSources[{path,…}]` + `baseUrl` | `SitemapUrl[{url: baseUrl+path,…}]` → `generateSitemapXml` | Shim sitemap **gains XML escaping** (the old non-escaping generator is deleted). |
| `llmsTxt` route | `generateLlmsTxt({name: siteName, sections: seoLlmsSections(config)})` | Output byte-identical to the pre-shim renderer. |
| `seo()` plugin factory | kept in shim; `generateJsonLd` imported from agent-readiness | `ast.__seoJsonLd` behavior unchanged. |

The new `'allow-agents'` tier can NEVER be reached through the shim (tested:
fetchers are still denied when entering via `@aihu/seo` with absent config).

## Value-guard design

In `generateRobotsTxt`: if `aiAgents` is a string not in
`['allow-agents','allow-all','deny-all']`, throw
`Unknown aiAgents value "<v>". Valid values are 'allow-agents' (default — …),
'allow-all', 'deny-all', or an array of RobotsRule objects… ('disallow-all' and
'allow-verified' appeared in older docs but were never implemented…)`.
Guard runs before any branch, so an invalid string can no longer fall into the
array branch and iterate characters as rules. Tested with `'disallow-all'`,
`'allow-verified'`, and `'x'`.

## Wildcard-block decision (amendment 5/7)

The merged surface **always emits the trailing `User-agent: * / Allow: /`
block** (predictable output — now also in the `rules[]` branch, which
previously omitted it) except when: (a) `wildcard: false` is set (new optional
field on `RobotsConfig` and `AgentReadinessConfig`, passed through the Vite
plugin), or (b) one of the config's own rules (aiAgents rules or `standard`)
already targets `*` — that rule is the wildcard decision and a second block
would contradict it. A blanket wildcard `Disallow: /` is never emitted.
Documented in `docs/site/agent-discovery.md`.

## Port inventory

| Item | Old home (`packages/seo/src/`) | Disposition |
|---|---|---|
| `seoLlmsSections` | `llms-sections.ts` (deleted) | **Ported** to `plugin-agent-readiness/src/llms-txt.ts` (+ `SeoLlmsSectionsConfig`); shim re-exports it. |
| `JsonLdPage` type + `generateJsonLd` | `json-ld.ts` (deleted) | **Ported** to new `plugin-agent-readiness/src/json-ld.ts` (live public API — `JsonLdPage` consumed by `examples/auth-magna-seo`, `generateJsonLd` by the seo plugin factory). Shim re-exports `JsonLdPage`; `generateJsonLd` is newly public from agent-readiness (it was never public from seo). |
| `generateRobots` + duplicated `AI_BOT_LIST` | `robots.ts` (deleted) | Replaced by `generateRobotsTxt` mapping in the shim. The "kept in sync manually" duplicate list is gone. |
| `generateSitemap` (non-escaping) | `sitemap.ts` (deleted) | Replaced by escaping `generateSitemapXml`. Regression test with `&` in a path added at both layers. |
| `createSeoRoutes`, `seo()`, config types | `routes.ts` / `plugin.ts` / `types.ts` | Kept as the deprecated shim surface (all `@deprecated`-tagged), delegating to agent-readiness. |

New agent-readiness exports: `AI_USER_FETCHER_BOTS`, `AI_TRAINING_CRAWLER_BOTS`,
`generateJsonLd`, `JsonLdPage`, `seoLlmsSections`, `SeoLlmsSectionsConfig`;
`RobotsConfig.wildcard`; `AgentReadinessConfig.aiAgents` gains `'allow-agents'`
and `AgentReadinessConfig.wildcard` is added (type-only, additive, in
`@aihu/server`'s canonical declaration).

## Semver + changelog

- `@aihu/seo`: **0.2.1 → 1.0.0** (major; `install-manifest.json` pluginVersion
  updated; plugin factory version string → 1.0.0). CHANGELOG entry added.
- `@aihu-plugin/agent-readiness`: **2.0.4 → 2.1.0** (minor). CHANGELOG entry added.
- CHANGELOG entries were written by hand in the changesets style (linking #430);
  no `.changeset/*.md` files were added because the versions are already bumped
  in package.json (a changeset would double-bump at the next `changeset version`).
- `@aihu/server` gains additive type-only changes with **no version bump** —
  it releases with the normal train (surfaced below).

## Measured results (2026-07-20, this worktree)

| Check | Result |
|---|---|
| `bunx vitest run packages/seo packages/plugin-agent-readiness` | **15 files / 187 tests passed, 0 failed** (baseline before change: 15 / 167; +20 new tests) |
| `bun scripts/check-emit-parses.ts` | **11 compile / 0 parse failures, exit 0** — identical before and after (TS-only change; fresh `cargo build --release` binary) |
| `bun run check:thesis` (all five invariants) | **0 findings each** (derived, attributed, governed, dual-audience, hydration-adoption), matching committed baselines of 0; check:derived did not regress |
| `bun run typecheck` (moon, 50 tasks) | **PASS** |
| `biome ci` on touched files (36 files) | **exit 0** |
| `bun run build && bun scripts/size.ts` | **exit 0, all 33 size rows within limit.** Neither `@aihu/seo` nor `@aihu-plugin/agent-readiness` has a `.size-limit.json` row (a seo test asserts the absence of a seo row), so "headroom" is N/A for both; every gated package unchanged and green. |
| `examples/auth-magna-seo` | `bun run build.ts` **compiles**; 5/5 smoke tests pass; `tsc --noEmit --strict` on `src/routes.ts` **passes**. (With `--exactOptionalPropertyTypes` two errors appear in its magna `fetch:` wiring — verified **pre-existing on the base commit** via `git stash`, unrelated to seo.) |
| Docs mirror | `docs/site/agent-discovery.md` and `apps/docs/src/content/docs/guides/agent-discovery.md` — `diff` clean |

## Surfaced, not changed

- The founder comment's phantom-values list included `standardBots`; that field
  is REAL on `AgentReadinessConfig` (mapped to `RobotsConfig.standard`
  internally), so the docs keep `standardBots` in `createAgentReadinessRoutes`
  examples and now note the `standard` name at the `generateRobotsTxt` layer.
- `docs/site/agent-discovery.md` carries two `#430`-referenced status markers
  about build-time skill auto-aggregation / `agent-manifest.json` consumers.
  Those describe a different piece of work than this consolidation; left as-is
  (docs/site/migration.md untouched per lane constraints).
- `examples/auth-magna-seo` pre-existing `exactOptionalPropertyTypes` errors in
  its magna wiring (above).
- `bun run build` locally regenerates `packages/mcp/src/cookbook-index.json` to
  an empty array (build side-effect, unrelated); restored via `git checkout`
  and not committed.
- `@aihu/server` version not bumped for its additive type-only change.
