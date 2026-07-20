# @aihu/seo

## 1.0.0

### Major Changes

- [#430](https://github.com/fellwork/aihu/issues/430) Consolidate `@aihu/seo` into `@aihu-plugin/agent-readiness`. This package is now a DEPRECATED thin shim (the name is kept for discoverability):
  - `createSeoRoutes` delegates to the sibling's generators — the sitemap now XML-escapes URLs (previously a path containing `&` produced invalid XML).
  - `seoLlmsSections` and the JSON-LD capability (`JsonLdPage`, `generateJsonLd`) are ported into `@aihu-plugin/agent-readiness`; `seoLlmsSections` and `JsonLdPage` are re-exported here.
  - BREAKING (behavioral): with `robotsOptions.disallowAiBots` ABSENT, `createSeoRoutes` still behaves as its historical block-all default (`deny-all`) — no silent robots.txt flip — but now emits a deprecation warning asking you to state your choice in the new `aiAgents` vocabulary. Explicit `disallowAiBots: true` → `'deny-all'` and `false` → `'allow-all'` map unchanged, forever.
  - All exports carry `@deprecated` JSDoc pointing at their `@aihu-plugin/agent-readiness` replacements.

### Patch Changes

- Updated dependencies:
  - @aihu-plugin/agent-readiness@2.1.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`5a94938`](https://github.com/fellwork/aihu/commit/5a949381544afd8276a0f6f5dba10cc4561b1d1a)]:
  - @aihu/server@0.2.1
  - @aihu-plugin/agent-readiness@2.0.4

## 0.2.0

### Minor Changes

- [#240](https://github.com/fellwork/aihu/pull/240) [`9482565`](https://github.com/fellwork/aihu/commit/9482565293cb0998dcae15eb1f3c5b9aa20db9be) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add @aihu/seo greenfield package: sitemap.xml, robots.txt, llms.txt, and JSON-LD injection via afterParse hook. Exports seoLlmsSections() for composition with @aihu-plugin/agent-readiness.
