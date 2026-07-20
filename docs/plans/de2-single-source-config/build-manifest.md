# DE2 — single-source `AgentReadinessConfig`

Slice DE2 of the thesis-conformance effort. Clears the **Rule D1** finding in
`check:derived`: `AgentReadinessConfig` was declared in two agent-surface
packages, each carrying a "Mirror of … keep in sync" comment (one of which
wrongly claimed to mirror itself — a copy-paste artifact).

## Canonical-owner decision

**Canonical declaration lives in `@aihu/server`**
(`packages/server/src/agent-readiness-config.ts`).
`@aihu-plugin/agent-readiness` re-exports it:

```ts
// packages/plugin-agent-readiness/src/types.ts
export type { AgentReadinessConfig } from '@aihu/server'
```

### Justification (dependency direction)

- The dependency arrow runs **`@aihu-plugin/agent-readiness` → `@aihu/server`**
  (the plugin's `package.json` lists `@aihu/server` as a dependency). `@aihu/server`
  does **not** depend on the plugin.
- Making the plugin canonical would require inventing a **backward**
  `@aihu/server → @aihu-plugin/agent-readiness` edge — a cycle between two
  published packages, and a runtime SSR package reaching up into a build-time
  vite plugin. The original "Mirror … keep in sync" hack existed precisely to
  avoid that edge; re-introducing it would trade one defect for another.
- Keeping the type in `@aihu/server` flows **with** the existing arrow: the
  plugin, already a dependent, simply imports it. No new edge, no cycle.
- **Ownership fit:** `@aihu/server` owns the `AihuConfig` contract and
  `defineAihuConfig`. `AgentReadinessConfig` is the declared type of
  `AihuConfig.agent` (`packages/server/src/config.ts:114`) — the contract
  belongs with its owner. `@aihu/server` already declares `plugins?: Plugin[]`
  via a type-only import for a feature it doesn't yet run, so carrying a
  passthrough config type it doesn't fully consume is the established pattern.
- A lower-level home (e.g. `@aihu/agent`, which both depend on) was rejected:
  the rich type references `AgentSkill`, declared in
  `packages/plugin-agent-readiness/src/mcp-server-card.ts`, which is owned by
  the concurrent **DE1** builder and may not be edited. Relocating it there was
  off the table.

### Deviation note

`@aihu/server` keeps the member shapes **inlined** (its existing self-contained
style) rather than importing the plugin's named sub-types (`A2aSkill`,
`SitemapUrl`, `AgentSkill`, `LlmsTxtSection`, `RobotsRule`, …) — importing them
would require the forbidden backward dependency. These inline shapes are
structurally validated against the plugin's named types by `tsc`: the plugin
binds `config: AgentReadinessConfig` (= server's type via re-export) and passes
its fields into generators typed with the named versions
(`generateA2aCard`, `generateSitemapXml`, `generateMcpServerCard`, …), so any
structural drift fails `bun run typecheck`. Server previously carried a DRIFTED
copy missing five fields (`siteUrl`, `a2aCard`, `mcpDiscovery`, `sitemapPages`,
`jsonLd`); the canonical version now includes them, so the plugin's rich runtime
type-checks against a complete contract for the first time.

`McpAuthConfig` remains declared in
`packages/plugin-agent-readiness/src/types.ts` (it is plugin-only — no
cross-package duplication, so no D1 concern — and DE1's `mcp-server-card.ts`
imports it from there). Server inlines the equivalent `auth` shape, as before.

### Why no new D1 finding

Rule D1 keys on the same **exported named** declaration (`interface` / type-alias
with a type literal) appearing in ≥2 distinct `packages/*`. After the fix,
`AgentReadinessConfig` is a real `interface` in exactly ONE package (`server`);
the plugin side is an `export type { … } from …` **re-export**, which is not a
declaration and is not counted. No third structural clone was introduced.

## Files changed

- `packages/server/src/agent-readiness-config.ts` — now the canonical, complete
  declaration (added the five previously-drifted fields, inline); removed the
  "Mirror of … keep in sync" comment.
- `packages/plugin-agent-readiness/src/types.ts` — replaced the re-declaration
  with `export type { AgentReadinessConfig } from '@aihu/server'`; dropped the
  now-unused sibling-type imports; kept `McpAuthConfig`; removed the self-mirror
  comment.
- `docs/plans/slice-0-invariants/baselines.json` — `derived.expect` 2 → 1 (same
  commit), with `expectChangedFrom`/`expectChangedOn`/`expectChangedReason` and
  `blockedBy` narrowed to `["DE1"]`.

## Acceptance — measured numbers

| Criterion | Before | After |
| --- | --- | --- |
| `check:derived` findings | 2 | **1** |
| — D1 (`AgentReadinessConfig` duplicated) | present | **GONE** |
| — D2 (`skills` literal, `cli/src/index.ts:207`, DE1's) | present | **present** |
| `baselines.json` `derived.expect` | 2 | **1** |
| `bun run typecheck` (full workspace) | pass | **pass** (50 tasks, exit 0) |
| `packages/server` tests | 162 passed | **162 passed** |
| `packages/plugin-agent-readiness` tests | 146 passed | **146 passed** |
| `check:governed` | 0 | **0** |
| `check:attributed` | 0 | **0** |
| `check:dual-audience` | 0 | **0** |
| `check:hydration-adoption` | pre-existing error* | **pre-existing error*** (unchanged) |

\* `check:hydration-adoption` exits non-zero because `baselines.json` has no
numeric `expect` entry for `hydration-adoption` — a pre-existing state
independent of DE2. Identical before and after this change.

### check:derived output — before

```
check:derived — 2 finding(s):
  packages/plugin-agent-readiness/src/types.ts:30  [D1]  `AgentReadinessConfig` is declared in 2 agent-surface packages with overlapping members — a hand-maintained sync seam. Sites: packages/plugin-agent-readiness/src/types.ts:30, packages/server/src/agent-readiness-config.ts:3. Single-source it; the agent surface must be derived, not mirrored.
  packages/cli/src/index.ts:207  [D2]  hand-authored `skills` array of 3 literal entries — an agent artifact maintained beside the source it should be derived from. Generate it from the compiler-emitted registry/manifest. (inside a scaffold template emitted by this file)
```

### check:derived output — after

```
check:derived — 1 finding(s):
  packages/cli/src/index.ts:207  [D2]  hand-authored `skills` array of 3 literal entries — an agent artifact maintained beside the source it should be derived from. Generate it from the compiler-emitted registry/manifest. (inside a scaffold template emitted by this file)
check:derived — 1 finding(s), matching the committed baseline of 1.
```
