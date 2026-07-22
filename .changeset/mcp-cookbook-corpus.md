---
'@aihu/mcp': minor
---

Cookbook corpus unification — `@aihu/mcp` becomes publishable, its index becomes generated.

- The `aihu_example` cookbook index is now GENERATED from the `cookbook/` corpus
  (`scripts/build-cookbook-index.ts` + `scripts/cookbook-lib.ts`): 20 entries in the
  current wrapper grammar, filenames mirroring `cookbook/*.aihu`, carrying the full
  `<!-- @cookbook -->` frontmatter schema (id/type/granularity/constructs/packages/
  concerns/since/playground/anti-patterns/related) plus derived retrieval tags.
  This replaces the pre-#497 fossil index (21 `$action:`-collection-era entries whose
  filenames matched nothing on disk).
- The builder FAILS LOUDLY (non-zero exit, all offenders listed) on any recipe with
  missing/invalid frontmatter, unknown construct/type/concern IDs, duplicate ids,
  or an empty scan — it can no longer emit a vacuous empty index.
- Package flipped publish-ready (tier C — agent surface); publish rides the next
  release cut. CI staleness guard: `bun run check:cookbook` diffs the committed
  index (plus `llms-cookbook.txt` and the generated playground presets) against a
  fresh corpus build.
