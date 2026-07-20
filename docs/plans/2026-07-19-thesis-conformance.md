# Thesis conformance — measured scorecard and restructured plan

**Date:** 2026-07-19 · **Track:** `thesis-conformance` · **Supersedes the track structure of**
`2026-07-19-twenty-issue-remediation.md` (its slice contents, acceptance criteria, and
dispatch rules remain valid and are referenced, not repeated).

Restructures the remediation work under `docs/architecture/thesis.md`. Priority is derived
from **measured distance per property**, not from judgment.

---

## Method

Each property gets binary checks against real source. A check passes only if verified by
reading code or running it — not by reading a comment claiming it. Every row below cites
the file and line it was measured at.

⚠️ **Correction on the record:** before measuring, I asserted the order was
Governed → Derived → Attributed → Dual-audience, closest-to-furthest. Measurement reverses
the first two. Governed is *not* closest. This is exactly the failure the scorecard exists
to prevent, and it happened on the first attempt.

---

## Scorecard

| Property | Passing | Distance | Rank |
|---|---|---|---|
| **Derived** | 3 / 5 | 60% | closest |
| **Governed** | 2 / 4 | 50% | |
| **Attributed** | 1 / 3 | 33% | |
| **Dual-audience** | **0 / 3** | **0%** | **furthest** |

### Derived — 3/5

| Check | Result | Evidence |
|---|---|---|
| `registerAgentMetadata` compiler-generated | ✅ | `emit.rs` `emit_agent_metadata_registration` (landed today) |
| `__agentBinding` compiler-generated | ✅ | `emit.rs` `emit_agent_binding_export` |
| `agent-manifest.json` compiler-generated | ✅ | `emit.rs` `emit_manifest`, now fed by the same walk |
| MCP server-card `skills` generated | ❌ | `packages/cli/src/index.ts:206` — *"kept in sync with the `$action` entries"*, hand-written in the scaffold |
| `AgentReadinessConfig` single-sourced | ❌ | **mirrored in two files**, both carrying *"Mirror of … keep in sync"*: `packages/server/src/agent-readiness-config.ts:1` and `packages/plugin-agent-readiness/src/types.ts:1` |

⚠️ **New finding, not previously catalogued.** The config type is duplicated across package
boundaries with a sync comment on each copy. Note the second file claims to mirror *itself*
— a copy-paste artifact that suggests the duplication was never deliberate.

### Governed — 2/4

| Check | Result | Evidence |
|---|---|---|
| Gate is universal across entry points | ✅ | `agent-service.ts:238` (`handleToolCall`) and `:271` (`authorize`) both call `runGate` |
| Action allowlist enforced server-side | ✅ | fixed today; `AC11b` proves a permissive binding is still denied |
| Rate limiting fails closed | ❌ | `agent-service.ts:215` — `if (rateLimitSpec !== null && rateLimitPlugin)`. Declare `$rate-limit`, omit the plugin, get silently unlimited |
| Bridge handshake verified | ❌ | `BRIDGE_PROTOCOL_VERSION` is **sent** (`bridge-client.ts:67`) and **exported** (`index.ts:15`) — and never checked server-side. Nothing validates it |

### Attributed (tier 0) — 1/3

| Transport | Forwards `RequestContext`? | Evidence |
|---|---|---|
| `agent-server` (MCP) | ✅ | `agent-server.ts:279` — `service.handleToolCall(toolName, params, ctx)` |
| `agent-a2a` | ❌ | `a2a-adapter.ts:59` — `service.handleToolCall((msg as string) ?? '', body.params ?? null)` — **two args, no ctx** |
| `agent-acp` | ❌ | `acp-adapter.ts:57` — `service.handleToolCall(toolName, null)` — **two args, no ctx, and params hardcoded null** |

Reference counts corroborate: `agent-service` 12, `agent-server` 6, **`agent-a2a` 1,
`agent-acp` 1** — and the single reference in each is a type import, not a use.

**Two of three transports fail tier 0.** Per the thesis this is a violation regardless of
whether they transact, because the gate downstream has nothing to decide against.

### Dual-audience — 0/3

| Check | Result | Evidence |
|---|---|---|
| A markdown representation can be produced | ❌ | `MarkdownResolver` has **zero production implementations**. Every reference is the interface declaration (`content-negotiation.ts:13`), the config field (`:22`), or a test mock |
| Negotiation reaches non-`Accept` clients | ❌ | no user-agent handling in `content-negotiation.ts` — `Accept`-header only, and AI crawlers don't send it |
| Primary content retrievable without JS | ❌ | `packages/router/src/server.ts:41` — `renderToString(component)` with **no options**, so the production path emits non-hydratable output; combined with shadow-DOM-invisible-to-non-JS-extractors, content does not reach the agent axis |

**Zero passing.** The furthest property, and the measurement agrees with the prior estimate.

---

## Sequencing, derived

Order follows distance, with one override: **the invariants come first regardless.**

### Slice 0 — the four invariants

Build the checks before the fixes. Each converts a property from "true if someone looks"
into "cannot silently stop being true." Precedent: `check:emit-parses` found five
simultaneous invalid-output bugs in one run this morning, none caught by any existing test,
because the suites asserted substrings rather than validity. **Invariants catch classes;
tests catch instances.**

| Invariant | Fails when | Would have caught |
|---|---|---|
| `check:derived` | any agent-facing artifact is hand-maintained; any "keep in sync" seam in agent-surface code | the `skills` array; the doubled `AgentReadinessConfig` |
| `check:governed` | a reachable dispatch path bypasses the gate; a declared control no-ops when its plugin is absent | the dead allowlist; rate-limit fail-open |
| `check:attributed` | any transport reaches an action invoker without a `RequestContext` | a2a and acp, on the day they landed |
| `check:dual-audience` | a route's primary content is absent from a scriptless fetch | the shadow-DOM gap, structurally |
| **`check:agent-conformance`** | **a freshly generated app, built and served with zero manual config, fails the SEO / agent-readiness checklist** | **everything below** |

#### `check:agent-conformance` — the OOB bar

**The existing compliance suites are green and measure nothing.** Measured 2026-07-19:
115/115 passing across 13 files, including four `tests/compliance/` suites — and:

| Suite | What it actually exercises |
|---|---|
| `isitagentready.test.ts` | **hand-wires its own router** via `defineRoute`, and **injects its own mock** `mdResolver` |
| `llms-txt-spec.test.ts` | calls the generator directly; never touches an app |
| `mcp-server-card-schema.test.ts` | same — and validates against **closed SEP-1649** |
| `robots-rfc9309.test.ts` | same |

**No test starts from a generated app.** All three `MarkdownResolver` instances in the test
tree are inline mocks, which is exactly why content negotiation reports green while
measuring 0/3 in production — *the test supplies the thing that does not exist*. The only
well-known path any compliance test asserts is `well-known/mcp/server-card.json`, which is
in no MCP spec.

This is the same shape as `hydrate.test.ts` hand-writing `hydrate.0` markup, `AC11`
asserting the invoker's rejection rather than the gate's, and the compiler suites asserting
substrings rather than validity. **Four green suites, four things not measured.**

What a generated app ships today (`packages/cli/src/index.ts`): non-spec
`/.well-known/mcp/server-card.json`, a placeholder `endpoint`, and a hand-written `skills`
array carrying **three separate comments** (lines 306, 315, 318) about keeping it mirrored
with the `$action` entries. No sitemap, no `agent-card.json`, no `MarkdownResolver`, no ARD
catalog.

**The harness:**

1. `aihu create` a fresh app into a temp dir — **no manual configuration whatsoever**
2. `bun run build`
3. Serve the built output
4. Run the conformance checklist against the **served app over HTTP**
5. Repeat across `examples/`
6. Fail on any gap

**Rules, because the failure mode here is well-documented:**
- **No mocks.** If `MarkdownResolver` must exist in production, the harness may not supply one.
- **No hand-wired routers.** Routes come from the app's own build output.
- **Validate against current specs**, not the ones we happen to serve: `agent-card.json`
  (not `agent.json`), no SEP-1649 claim, OAuth well-knowns either served or not advertised.
- **Assert the SEO half too** — server-rendered `<head>` (title, description, canonical,
  OG), a sitemap with real `lastmod` (never build-date stamped), and JSON-LD in `<head>`
  or light DOM.

**This invariant subsumes the other four in practice.** A generated app cannot pass unless
the surface is genuinely derived, the paths genuinely correct, and the content genuinely
reachable without JS. It is the only check that measures what a **user** receives rather
than what a fixture provides.

**Acceptance:** it must **fail** against the current scaffold on first run. If it passes
immediately, the harness is wrong — rewrite it, don't celebrate.

Mode 2, Architect → Builder → Verifier. Branch `ci/thesis-invariants`. These four are worth
more than most of the feature work below.

**Acceptance:** each invariant fails against the current tree at the counts in the
scorecard, then passes as its property's slices land. An invariant that passes on day one
is measuring nothing — treat that as a defect in the check, not a win.

### Track D-A — Dual-audience (0/3, furthest)

| Slice | What | Branch |
|---|---|---|
| **DA1** | Ship a `MarkdownResolver` implementation | `feat/markdown-resolver` |
| **DA2** | UA-aware negotiation (cf. Next's `htmlLimitedBots`) | `feat/ua-negotiation` |
| **DA3** | Production SSR path emits hydratable, crawlable content | `fix/ssr-production-path` |
| **DA4** | **Open decision:** `shadowMode: 'none'` default for page-level components | — |

DA4 is the largest single lever on the furthest property and remains unanswered. It also
simplifies the shard track independently.

### Track AT — Attributed (1/3)

| Slice | What | Branch |
|---|---|---|
| **AT1** | Thread `RequestContext` through a2a and acp | `fix/a2a-acp-request-context` |
| **AT2** | Full a2a/acp spec conformance (decision 2b) | `feat/a2a-acp-spec-conformance` |

**AT1 splits out of AT2 deliberately.** Tier-0 attribution is a thesis violation and a live
security hole; spec conformance is a large, multi-round slice. Do not let the security fix
wait on the rewrite.

### Track GO — Governed (2/4)

| Slice | What | Branch |
|---|---|---|
| **GO1** | Rate limiting fails closed; keys not caller-derived | `fix/ratelimit-fail-closed` |
| **GO2** | Bridge verifies the handshake it already sends | `fix/bridge-auth` |

### Track DE — Derived (3/5, closest)

| Slice | What | Branch |
|---|---|---|
| **DE1** | Server-card `skills` generated from the registry | `feat/server-card-from-manifest` |
| **DE2** | Single-source `AgentReadinessConfig` | `refactor/agent-readiness-config` |
| **DE3** | Correct discovery endpoints (`agent-card.json`; drop SEP-1649 claims; serve or stop advertising OAuth well-knowns) | `fix/discovery-endpoints` |
| **DE4** | `@aihu/seo` → re-export + deprecate (decision 3a) | `refactor/seo-reexport` |
| **DE5** | Typed MCP parameter schemas | `feat/mcp-param-schemas` |

### Track CO — Correctness (thesis-neutral, still required)

Not property violations, but shipped defects. Retains full acceptance criteria from the
prior plan.

| Slice | What | Branch |
|---|---|---|
| **CO1** | `$prop` write rewriting (decision 1a) | `fix/prop-write-rewrite` |
| **CO2** | Retire stale C205 | `fix/c205-retire` |
| **CO3** | Migrate 11 stale examples | `fix/examples-v2-codemod` |
| **CO4** | Gate `check:emit-parses` in CI | `ci/emit-parses-gate` |
| **CO5** | SSR path-key unification + the missing integration test | `fix/ssr-path-keys` |
| **CO6** | fellwork/web `@aihu/context` dep + dedupe | `fix/aihu-context-dedupe` (web repo) |

**CO1 is highest-urgency in this track** — `cookbook/aihu-counter` throws on first click.
**CO5 overlaps DA3**; sequence CO5 first, as DA3 depends on the path keys agreeing.

---

## Dependencies

```
Slice 0 (invariants) ─── informs every track, blocks none

CO1 ──> DE5            (shared handler parsing)
CO1, CO3 ──> CO4
CO5 ──> DA3 ──> DA4?   (path keys before production SSR)
AT1 ──> AT2            (context before conformance)
DE3 ──> ARD adoption   (catalog references the cards)
```

Independent and parallelizable: CO2, CO6, GO1, GO2, DE1, DE2, DE4, DA1, DA2.

---

## Carried forward unchanged

From `2026-07-19-twenty-issue-remediation.md`, still binding:

- The 10 universal dispatch rules mapped to the 11 known failure patterns.
- Project guardrails: never syntax-check with a stale binary; `bun run check:emit-parses`
  as the fast signal for compiler changes; suites assert substrings, not validity;
  pre-commit hooks rewrite files; `.aihu` fixtures are documentation, not scratch.
- Substrate: files, not GBrain (decision 4d). Fresh sync on `main` afterward, sourced from
  a **stable** path.
- Session protocol: Researcher → verify STATUS against artifact → Topic Director →
  Synthesizer → next Researcher. Historian at session end.

## Definition of done

- All **five** invariants exist, gate in CI, and pass.
- `check:agent-conformance` passes against a **freshly generated app with zero manual
  config**, and across `examples/` — the OOB bar.
- Scorecard reads 5/5, 4/4, 3/3, 3/3.
- The four existing `tests/compliance/` suites are rewritten to exercise the real pipeline,
  or deleted. A suite that injects the resolver it is meant to be testing is worse than no
  suite, because it reports coverage that does not exist.
- All 20 catalogued issues fixed or explicitly closed with rationale in `TODOS.md`.
- No fixture edited to dodge a compiler bug.
- Retro written, findings promoted, fresh GBrain sync on `main`.
