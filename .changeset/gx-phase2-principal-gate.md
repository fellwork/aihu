---
'@aihu/agent-service': minor
'@aihu/plugin-agent-readiness': minor
---

GX Phase 2 — the principal gate, `call`-axis enforcement, and the unified bot registry (#437-GX).

`@aihu/agent-service` gains `principal-gate.ts`: `resolvePrincipal` (request →
one of four principal classes: anonymous / verified-agent / scoped-agent /
human-session, derived exclusively from `AuthPlugin.verify` — never decode-only,
never caller-supplied identity; a presented-but-invalid credential resolves to
anonymous) and `decideEmission` (principal × surface policy → allow/deny with
enforcement tier). The tool gate's AUTH_* ladder and scope check now route
through this one gate — behavior for existing callers is unchanged (same rungs,
same order, same messages, same rate-limit keys).

New enforcement: the `extract.call` axis from GX Phase 1 is consumed
server-side as a CEILING over per-member `expose:`/`$scope` — `call: 'none'`
makes the agent surface unavailable (404-shaped), `'verified'` forces a
verified principal for every member, `{ scope }` is met with each member's own
`$scope` (both must pass). Surfaces with no declaration keep today's behavior
exactly; a malformed declared value fails closed.

The `read` axis is DECIDED by `decideEmission` but not yet enforced anywhere —
compliance-tier derivation is Phase 3, hard-tier withholding is Phase 4.

`@aihu/plugin-agent-readiness` unifies its bot lists into one exported
`BOT_REGISTRY` with a tier classification (`searcher` / `user-fetcher` /
`training-crawler`) and a `classifyBotUserAgent` classifier
(longest-token-first, so `Googlebot-Extended` is a trainer, not search). The
13-bot AI list, robots.txt output, and markdown negotiation are byte-identical;
search bots (`Googlebot`, `Bingbot`, `DuckDuckBot`, `Baiduspider`, `YandexBot`)
exist only for classification until Phase 3 derives output from `read:`.
