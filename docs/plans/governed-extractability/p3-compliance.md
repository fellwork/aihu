# GX Phase 3 — compliance-tier derivation (#437-GX)

**Spec:** `40-spec.md` §4.3, §8, §12 Phase 3 · **Branch:** `feat/gx-phase3-compliance`
**Consumes:** Phase 1's compiled `extract` fan-out (`.route.json` / agent-meta) and
Phase 2's `BOT_REGISTRY` tiers + `decideEmission` `read` decisions.
**Scope:** TS-only. No compiler (`.rs`) change, no render-path change.

---

## What this phase makes real — and what it does not

Phase 3 makes the **`read` axis visible at the derived surfaces**: robots.txt,
the noindex signal, and the discovery documents now derive from each surface's
compiled `extract.read` declaration. One declaration in the `.aihu` source fans
out to every output — no hand-maintained path list, bot list, or route list
anywhere.

**The honesty constraint, stated plainly (spec §1):** everything in this phase
is **compliance-tier**. robots.txt is advisory (RFC 9309 compliance is
voluntary), `X-Robots-Tag: noindex` binds only crawlers that honor it, and
absence from llms.txt hides nothing from a client that guesses URLs. These
signals bind exactly the population that identifies itself — a UA-spoofing
scraper defeats all of them, and nothing in this phase claims otherwise. The
**hard tier** (per-principal SSR withholding + the bundle/data boundary for
`'verified'`/`'human'`/`{ scope }` reads) is **Phase 4**, blocked on the
P3/P4/P5 SSR prerequisites, and is deliberately untouched: `ssr.ts`,
`prerender.ts`, and every render path are unmodified. A hard-tier route in this
phase still serves its full body to every requester — what it gains is the
noindex header and absence from every advertisement.

Also out of this phase: origin UA refusal (403) in `handle`, per-principal
markdown/negotiation (T5), and `Vary` discipline — spec §12 lists them under
Phase 3's umbrella, but they act on the request path and are sequenced with the
Phase 4 emission work; this slice is the derived-OUTPUT half the founder-scoped
brief named. Issuance (Phase 2b) and the G4/G5 + DA-f invariants (Phase 5)
remain later phases.

## 1. The one derivation source

`packages/server/src/extract-read-policy.ts` — `deriveReadPolicy(read)`
normalizes a compiled `read` value (fail-closed: absent → the resolved default
`'agents'`; malformed → hard-shaped, never rounded to open) and returns every
signal the derived surfaces need:

| `read:` | tier | searchers | user-fetchers | trainers | robots advertises path | noindex | in agent discovery (llms/tools) | in search discovery |
|---|---|---|---|---|---|---|---|---|
| `'all'` | compliance | ✓ | ✓ | ✓ | ✓ (per-path `Allow` where the baseline blocks) | — | ✓ | ✓ |
| `'agents'` (default) | compliance | ✓ | ✓ | ✗ | ✓ — as the global tiered blocks (no per-path lines; see §2) | — | ✓ | ✓ |
| `'search'` | compliance | ✓ | ✗ | ✗ | ✓ (`Disallow` under fetcher/trainer groups) | — | ✗ | ✓ |
| `'none'` | compliance | ✗ | ✗ | ✗ | ✓ (`Disallow` under every group incl. `*`) | ✓ | ✗ | ✗ |
| `'verified'` / `'human'` / `{ scope }` | **hard** | ✗ | ✗ | ✗ | **✗ — path not named at all** | ✓ | ✗ | ✗ |
| malformed value | fail-closed | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |

Hard-tier paths are **absent** from robots.txt rather than Disallowed — a
Disallow line naming a governed path would advertise its existence (spec §8
existence-advertising). `read:'none'` paths ARE Disallowed: they serve
anonymous humans, so their existence is not a secret.

`@aihu/server` hosts the module because both consumers already depend on it
(`@aihu/router` for the header, `@aihu-plugin/agent-readiness` for
robots/discovery) and it owns the `AgentReadinessConfig` contract.

## 2. Route-aware robots.txt (`robots.ts`)

`generateRobotsTxt({ routes })` — `routes` is the **compiled route table**
(structurally `@aihu/router`'s `RouteDefinition[]`, e.g. `import routes from
'virtual:aihu-routes'`, the same array handed to `createServerRouter`; the
plugin threads `AgentReadinessConfig.routes` through). Derivation:

- Per route, `deriveReadPolicy` gives per-tier access; a directive is emitted
  only where it differs from the tier's baseline under the active global
  policy, appended to the existing per-bot blocks from Phase 2's
  `BOT_REGISTRY` — **no bot is re-listed, no second registry exists**.
- Searcher/unknown-crawler refusals (`read:'none'`) ride the `User-agent: *`
  group — the group search bots actually follow (no dedicated searcher blocks,
  so Phase 2's "no search bot in any aiAgents output" pin still holds). If the
  operator suppressed or owns the wildcard, the declared refusals emit as a
  minimal derived `*` group (RFC 9309 §2.2.1 group merging).
- Route patterns map to their static prefix (`/reports/:id` → `/reports/`) —
  robots matching is prefix-based.
- The recorded default (`read:'agents'`) emits **no per-path lines**: the #430
  tiered global blocks already state that posture, which is what makes an
  undeclared app's robots.txt **byte-identical** to #430's shipped default
  (asserted by test) under all three named policies.
- Under the named policies a declared non-default value is authoritative both
  ways (`read:'all'` punches a per-path `Allow` through `deny-all`); under an
  operator-authored **rules array**, derivation only ever narrows — declared
  restrictions are stated as separate merged groups, declared widenings are
  never emitted against operator rules.

## 3. noindex / X-Robots-Tag

`createServerRouter.handle` (`packages/router/src/server.ts`) derives the
header from the matched route's compiled `extract.read`: `'none'`, every hard
value, and malformed values get `X-Robots-Tag: noindex`; everything else is
untouched. The body is served in full either way (compliance tier; content
withholding is Phase 4). The `extract` member reaches `RouteDefinition` through
the Phase 1 sidecar → router `SK` threading (`vite-plugin.ts`), so file-routed
apps get this with zero configuration. Stated residual: statically-hosted
prerendered output has no header path until Phase 4/hosting integration — the
robots absence still applies there.

## 4. Discovery derivation (llms.txt, server-card, agent-card)

- **llms.txt / llms-full.txt**: a derived `## Routes` section lists exactly the
  routes whose `read` admits user-directed AI fetchers (`'all'`/`'agents'`);
  `'search'`, `'none'`, and hard routes are absent. The `## Components`
  section is filtered by the same predicate plus call advertisability
  (`call:'none'` → absent). Sources: `config.routes` (compiled) and the agent
  registry — no hand-maintained list.
- **MCP server-card**: `skillsFromRegistry` filters surfaces by
  `read`-advertisability × `isCallAdvertised` (absent/`'anonymous'`/
  `'verified'`/`{scope}` advertised; `'none'`/malformed closed — mirroring
  `surfaceCallPolicy` exactly, pinned by test).
- **A2A agent card**: lists no routes; skills remain config-provided; a test
  pins that no hard route pattern appears in its output.
- Known residual (flagged in `p2-gate.md` §5, unchanged): the compiler's
  **runtime** `registerAgentMetadata` emission does not yet carry `extract`,
  so registry-fed discovery sees the pre-GX shape (→ default, advertised) for
  runtime-registered components until the next compiler touch. Sidecar-fed
  paths are fully derived today.

## 5. The agreement check (the Derived property)

All three output families call the **same** `deriveReadPolicy` — they cannot
drift from each other by construction. The remaining second decision-maker is
Phase 2's `decideEmission` (the request path), and
`packages/plugin-agent-readiness/tests/read-derivation.test.ts` pins the two
together behaviorally:

- for every compliance `read` value × crawler tier, `deriveReadPolicy(...)
  .crawl[tier] === decideEmission(anonymous(tier), read).allow`;
- end-to-end: registry UA string → `classifyBotUserAgent` → gate decision
  `===` the RFC 9309-evaluated robots.txt answer for that bot × path;
- for every hard value: gate denies anonymous ∧ derivation never advertises;
- `isCallAdvertised === (surfaceCallPolicy(...) !== 'none')` for every call
  value including malformed.

## 6. Per-test mapping

`packages/plugin-agent-readiness/tests/read-derivation.test.ts` (21):

| Requirement | Tests |
|---|---|
| Per-`read`-value robots derivation (fixture app, RFC 9309-style evaluator) | `robots.txt derives per-route directives` — `'all'`, `'agents'` (default derives the #430 posture with zero extra lines), `'search'`, `'none'` (incl. unknown-crawler via `*`), hard-paths-not-advertised, static-prefix mapping, deny-all punch-through, custom-array narrowing-only, suppressed-wildcard minimal `*` group |
| No bot dropped vs #430; searchers never blocked by `'agents'` | `#430 compatibility` (13-bot presence, no searcher group / no wildcard Disallow) |
| Undeclared-app byte-compat | `byte-identical to the shipped #430 default` + `allow-all`/`deny-all` variants |
| Discovery agreement (`read:'none'`/hard absent from llms.txt + cards; public present) | `discovery documents derive from the declared policy` (routes section, components filter, server-card tools filter, a2a absence) |
| Cannot-drift vs the principal gate | `derivation agrees with @aihu/agent-service decideEmission` (4) |

`packages/router/tests/noindex.test.ts` (5): no-declaration/public → no
header; `'none'` → noindex; hard values → noindex + full body still served;
malformed → noindex.

`packages/server/tests/extract-read-policy.test.ts` (12): the per-value
table, absent→default, malformed→fail-closed, `extractReadValue`,
`isCallAdvertised`.

Regressions green (unchanged expectations): `robots.test.ts`,
`bot-registry.test.ts`, `llms-txt.test.ts`, `mcp-server-card.test.ts`,
`content-negotiation.test.ts`, `markdown-resolver.test.ts`, the four
`tests/compliance/*` suites, `principal-gate.test.ts`, `call-axis.test.ts`,
router/server suites.

## 7. Measured results (2026-07-21, this branch)

- `bunx vitest run packages/plugin-agent-readiness packages/agent-service
  packages/server` — **37 files, 501 tests, all pass**.
- Full workspace `bun run test` — **199 files passed, 2 skipped (2425 tests)**.
- `check:governed` (4 G1, 4 G2, 1 G3), `check:attributed` (3 transports),
  `check:derived` (82 files), `check:dual-audience` (198 files, 3 negotiation
  cells, SSR + SSG) — **0 findings each**; `check:emit-parses` — 58 components,
  **0/0**.
- `bun run typecheck` — PASS (50 tasks). `biome ci .` — exit 0.
- `bun run build` + `bun scripts/size.ts` — all 33 budgets pass; `@aihu/router`
  browser entry unchanged at 1.71 kB (the `extract` member is type-only there;
  the header logic lives in the server-only subpath).
- Undeclared-app robots.txt byte-compat with #430 — asserted by test
  (`generateRobotsTxt() === generateRobotsTxt({ routes: [defaults] })`).
