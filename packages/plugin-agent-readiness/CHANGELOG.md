# @aihu/agent-readiness

## 2.1.0

### Minor Changes

- [#430](https://github.com/fellwork/aihu/issues/430) Consolidate `@aihu/seo` into this package; tiered AI-bot robots.txt default.
  - **New default `aiAgents: 'allow-agents'`** (was `'allow-all'`): the 13-bot list is now classified per bot — user-delegated fetchers / cited-search agents (`ChatGPT-User`, `OAI-SearchBot`, `DuckAssistBot`, `Applebot`) get `Allow: /`; training/scraping crawlers (`GPTBot`, `ClaudeBot`, `PerplexityBot`, `Googlebot-Extended`, `CCBot`, `anthropic-ai`, `Google-Extended`, `Bytespider`, `cohere-ai`) get `Disallow: /` and are explicit opt-in. New exports `AI_USER_FETCHER_BOTS` / `AI_TRAINING_CRAWLER_BOTS` (both derived from one classified registry). `'allow-all'`, `'deny-all'`, and rule arrays keep working.
  - **Runtime value guard**: an unknown `aiAgents` string (e.g. the phantom documented values `'disallow-all'` / `'allow-verified'`) now throws a helpful error naming the valid options instead of silently iterating the string's characters as rules.
  - **Wildcard block policy**: robots.txt always ends with `User-agent: * / Allow: /` (predictable output, now also in the rules-array branch) unless `wildcard: false` suppresses it or one of your own rules already targets `*`.
  - **Ported from `@aihu/seo`**: `seoLlmsSections` (llms.txt composition sugar) and the JSON-LD helpers (`JsonLdPage`, `generateJsonLd`).

## 2.0.4

### Patch Changes

- Updated dependencies [[`5a94938`](https://github.com/fellwork/aihu/commit/5a949381544afd8276a0f6f5dba10cc4561b1d1a)]:
  - @aihu/server@0.2.1

## 2.0.3

### Patch Changes

- Updated dependencies [[`f2005e2`](https://github.com/fellwork/aihu/commit/f2005e222bc720a8cbc69ed81cfafa0cab8d8ced), [`90d3174`](https://github.com/fellwork/aihu/commit/90d3174896ee03cf1756f5b92d125be45d13983f)]:
  - @aihu/server@0.2.0

## 2.0.2

### Patch Changes

- Updated dependencies [[`ec9f59b`](https://github.com/fellwork/aihu/commit/ec9f59b345116576b58f85298501d43d9ac33d61)]:
  - @aihu/server@0.1.4

## 2.0.1

### Patch Changes

- Updated dependencies [[`afead86`](https://github.com/fellwork/aihu/commit/afead86a982ca8df290f2970e3a16f5f003c0c03)]:
  - @aihu/server@0.1.3

## 2.0.0

### Major Changes

- [#171](https://github.com/fellwork/aihu/pull/171) [`7577bd1`](https://github.com/fellwork/aihu/commit/7577bd10f391b9f3996048371706c9be34b08e2e) Thanks [@srmcguirt](https://github.com/srmcguirt)! - v1.0.9 — Naming Scheme A: rename `@aihu/data` → `@aihu-plugin/data` and
  `@aihu/agent-readiness` → `@aihu-plugin/agent-readiness`.

  The two plugin-contract packages move from the framework-core `@aihu/*`
  scope into the new `@aihu-plugin/*` scope so that plugin-contract and
  framework-core surfaces can evolve at independent cadences. Decision
  record `6c7aa75b-...` (Amendment 04) ratified the scope on 2026-05-09 and
  v1.0.9 §400-416 of the v1 framework plan covers the cutover mechanics.

  **Per-package effect**

  - `@aihu-plugin/data` (new) — first publish at `1.0.0`. Same public API as
    `@aihu/data@0.1.0`; only the npm name changed.
  - `@aihu-plugin/agent-readiness` (new) — first publish at `1.0.0`. Same
    public API as `@aihu/agent-readiness@0.1.1`; only the npm name changed.
  - `@aihu/data@1.0.0` — published as a **moved stub**. The legacy name now
    installs a tiny package that re-exports `@aihu-plugin/data`. Carries
    `"deprecated"` metadata so npm surfaces the move on `npm install`.
  - `@aihu/agent-readiness@1.0.0` — same moved-stub treatment.
  - `@aihu/cli` — extends `aihu migrate` with a v1.0.9 pass that rewrites
    package.json `dependencies` blocks, static imports, dynamic imports, and
    JSDoc / Markdown URL references. Idempotent on already-renamed input.

  **Migration**

  Existing installs keep working via the deprecated stubs. To upgrade:

  ```sh
  bun add @aihu-plugin/data @aihu-plugin/agent-readiness
  bun remove @aihu/data @aihu/agent-readiness
  bunx aihu migrate
  ```

  `@aihu/agent-service` is explicitly **out of scope** for this rename and
  stays under the framework-core `@aihu/*` scope.

## 0.1.2

### Patch Changes

- [#172](https://github.com/fellwork/aihu/pull/172) [`ac63d4b`](https://github.com/fellwork/aihu/commit/ac63d4b9a2a5296de8a20b80049e2c5bbc493880) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix critical packaging bug: @aihu/server@0.1.1 shipped with optionalDependencies pinning native subpackages at 0.1.1, but those versions were never published (only 0.1.0 exists). This made @aihu/server unusable on every platform.

  Republishes all 6 server packages in lockstep at 0.1.2:

  - @aihu/server: 0.1.2 with native pinned at 0.1.2 (coherent)
  - @aihu/server-{darwin-arm64,darwin-x64,linux-x64-gnu,win32-x64-msvc}: 0.1.2 (first publish at this version)
  - @aihu/agent-readiness: 0.1.2 with @aihu/server@0.1.2 pin (was pinning broken 0.1.0)

  Reported by a downstream consumer. Bug surface includes the original workspace:\* leak in @aihu/server@0.1.0 (immutable; will be deprecated separately) and the broken transitive chain through @aihu/agent-readiness@0.1.1.

- Updated dependencies [[`ac63d4b`](https://github.com/fellwork/aihu/commit/ac63d4b9a2a5296de8a20b80049e2c5bbc493880)]:
  - @aihu/server@0.1.2
