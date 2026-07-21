---
'@aihu-plugin/agent-readiness': minor
'@aihu/server': minor
'@aihu/router': minor
'@aihu/compiler': patch
---

GX Phase 3 (#437-GX) — derive robots.txt, noindex, and discovery output from
the compiled `extract.read` axis.

- `@aihu/server`: new `deriveReadPolicy` / `extractReadValue` /
  `isCallAdvertised` — the one read-axis derivation table (crawl access per
  bot tier, robots advertisability, noindex, discovery membership), fail-closed
  on malformed values. `AgentReadinessConfig` gains `routes` (the compiled
  route table conduit).
- `@aihu-plugin/agent-readiness`: `generateRobotsTxt` accepts `routes` and
  derives per-path directives per route `read:` value over the tiered bot
  registry (`'all'` → all tiers; `'agents'` → the #430 tiered default, now
  derived per route; `'search'` → searchers only; `'none'` → all crawlers
  disallowed; hard values → not advertised at all). llms.txt gains a derived
  `## Routes` section and filters its components section by the declared
  policy; MCP server-card tools are filtered by read + call advertisability.
  With no routes declared, robots.txt is byte-identical to the shipped #430
  default.
- `@aihu/router`: `RouteDefinition`/`RouteSidecar` carry the compiled
  `extract` member; `createServerRouter.handle` sends `X-Robots-Tag: noindex`
  for `read:'none'`/hard/malformed routes.
- `@aihu/compiler`: `RouteMeta` types the `extract` member the binary already
  emits (type-only).

All of this is compliance-tier: advisory signals honored by compliant,
self-identifying crawlers. Hard-tier enforcement (SSR withholding, the
bundle/data boundary) is Phase 4 and is not part of this change.
