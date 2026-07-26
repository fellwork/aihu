# Compliance by construction: what aihu emits for a user's project

**Status:** proposed
**Date:** 2026-07-26

**Intent.** The aihu framework compiles a user's project into output that is compliant
with the SEO and agent-readiness standards their `aihu.config` declares, with safe
defaults. Compliance is a property of *the compiler's output for any project*, not a
property of our documentation site.

That framing changes what has to be true. It is not enough for `aihu.dev` to score well;
it must be true that **an arbitrary project built with aihu is compliant without its
author having to know what llms.txt is.**

---

## 1. Two gaps, and the second is the important one

### Gap A — nothing verifies conformance against anything external

Every test under `packages/plugin-agent-readiness/tests/compliance/` imports our own
generator, calls it, and asserts against rules a human transcribed from a spec.

```
imports across ALL four compliance tests:
  ../../src/robots.ts  ../../src/llms-txt.ts
  ../../src/mcp-server-card.ts  ../../src/index.ts
  @aihu/server, vitest
```

No schema validator, no reference parser, no network. The sharpest instance:

```ts
expect(generateMcpServerCard(base).$schema).toBe(
  'https://modelcontextprotocol.io/schemas/server-card/v1.0',
)
```

That asserts **the label is spelled correctly** while never fetching the schema to check
the document validates against it.

### Gap B — the default emits nothing at all

```ts
// packages/app/src/config.ts
/**
 * Opt-in agent-readiness integration.
 * When absent or false, a no-op plugin is substituted.
 */
readonly agentReadiness?: AgentReadinessConfig | false
```

**A zero-config aihu project emits no agent surface.** No `llms.txt`, no `robots.txt`,
no `sitemap.xml`, no MCP card, no A2A card. A user gets compliance only if they already
know to ask for it — which inverts the stated intent.

Gap A is about whether our checks mean anything. **Gap B is about whether the product
does what it claims.** Fixing A without B produces rigorously verified emptiness.

Two pieces of evidence that B is real and not theoretical:

1. `apps/docs-next` shipped with **nine agent endpoints returning Cloudflare's SPA
   fallback `index.html` at HTTP 200** until 2026-07-25. It was built with aihu, by us,
   and the framework emitted no agent surface because nothing asked it to.

2. When fixing it, I wired `viteAgentReadinessIntegration` **manually in
   `vite.config.ts`** — `apps/docs-next/aihu.config.ts` still has no `agentReadiness`
   key. The framework's own first-class config path went unused by the person who had
   just spent hours on exactly this problem. If that path is not reachable by default,
   it is not reachable.

---

## 2. The contract

> Given a project and an `aihu.config`, `aihu build` emits artifacts that satisfy the
> standards that config declares. Absent an explicit declaration, it emits a **safe
> baseline**. Opting *out* is explicit; opting *in* is not required.

Three consequences:

- **Defaults invert.** `agentReadiness` absent must mean *baseline*, not *no-op*.
  `agentReadiness: false` remains the opt-out.
- **Conformance is tested across the config space,** not for one site. A single fixture
  proves one point in that space.
- **The site becomes a consumer, not the subject.** `aihu.dev` should get its surface
  the same way a user's project does — via `aihu.config`, exercising the path we ship.

---

## 3. Config surface

Today `AgentReadinessConfig` is a flat bag of generator inputs (`name`, `llmsSections`,
`sitemapPages`, `a2aCard`, `mcpDiscovery`, …). It expresses *what to emit* but not
*which standards to satisfy*, so there is nothing for a conformance test to check
against — no declared target, no way to say "this project claims MCP conformance".

Proposed: keep the existing fields as the detail layer, add a declaration layer.

```ts
agentReadiness?: false | {
  /**
   * Standards this project targets. Determines what is emitted AND what the
   * conformance suite validates against. Absent => 'baseline'.
   */
  standards?: 'baseline' | 'full' | ReadonlyArray<StandardId>

  // ... existing fields unchanged (name, summary, llmsSections, ...)
}

type StandardId =
  | 'robots'      // RFC 9309
  | 'sitemap'     // sitemaps.org 0.9
  | 'llms-txt'    // llmstxt.org
  | 'json-ld'     // schema.org
  | 'mcp'         // Model Context Protocol discovery + server card
  | 'a2a'         // Agent2Agent agent card
  | 'openapi'     // OpenAPI 3.x, when the project exposes an API
```

**Baseline** (what you get for free): `robots`, `sitemap`, `llms-txt`, `json-ld`. These
are well-specified, universally useful, cheap to emit, and carry no risk of asserting a
capability the project lacks.

**Not in baseline:** `mcp` and `a2a`. Emitting an MCP server card advertises an endpoint
that must exist and answer. A default that publishes a card for a server nobody wrote
would be *precisely* the failure this document is about — an artifact asserting something
untrue. Those stay opt-in, and the conformance suite must verify the endpoint responds
before considering them satisfied.

`standards` is what makes the guarantee checkable: it is the declared claim, and the
suite's job is to prove the emitted output honours it.

---

## 4. Three layers of oracle

Not alternatives — each catches a class the others structurally cannot.

| Layer | Oracle | Catches | Cannot catch |
|---|---|---|---|
| **L1 Schema** | vendored spec schema + validator | wrong shape, missing required fields | valid shape a real consumer still misreads |
| **L2 Parse-back** | the spec's own reference parser | wrong *interpretation* — output that validates but is read differently | grader checks the spec does not mandate |
| **L3 Live probe** | deployed origin + the real grader | deploy-time loss; the grader changing its rules | anything before deploy |

The current suite is a fourth thing — *our generator vs our transcription of the spec* —
the only combination in which both sides can be wrong together.

**L3 is the layer that would have caught the docs-next defect.** Pages' SPA fallback
answering a missing file with `index.html` at HTTP 200 is invisible to any in-memory
test, because in memory the file genuinely is not there and the router says so honestly.

### L1 — schema validation

`ajv` + `ajv-formats` for JSON Schema; `@apidevtools/swagger-parser` for OpenAPI
(validate + dereference), optionally `@stoplight/spectral-core` for rule linting; a real
XML validator (`xsd-schema-validator` / `libxmljs`) for `sitemap-0.9.xsd`, which JSON
tooling cannot check.

**Start with MCP:** `@modelcontextprotocol/sdk` is *already a dependency* in
`packages/mcp` and `packages/agent-server` and ships Zod schemas for protocol messages.
Cheapest real win available.

### L2 — parse-back

- **robots.txt** → `google/robotstxt`, Google's production parser, open-sourced;
  `robots-parser` (npm) for an in-process option. The assertion is not "text matches"
  but **"the reference parser reaches the decisions we claim"**:

  ```
  for (userAgent, path, expectedAllowed) in policy matrix:
      parser.isAllowed(emittedRobotsTxt, userAgent, path) === expectedAllowed
  ```

  That encodes the `aiAgents: 'allow-all' | 'allow-agents' | 'deny-all'` contract as
  behaviour rather than formatting, and removes the hand-transcription step entirely.

- **llms.txt** → Answer.AI's `llms_txt` reference parser. Round-trip is the oracle: if
  the official parser recovers the sections, titles and links we emitted, we conform.
  Python in the test path is a real cost — schedule rather than gate.

### L3 — live probe

Runs against a deployed origin, not a fixture. Catches headers lost at deploy, CDN
fallbacks, content-type drift, and the external grader changing. **Not a PR gate** — it
depends on a deployment and, for the grader, a third party's uptime.

The manual version of this verified the 2026-07-25 cutover: 14 endpoints with
content-types, security headers, and crawl-visible byte counts read from the live origin.
This layer is that check, automated and diffed over time.

---

## 5. Conformance matrix — the piece that makes it a framework guarantee

Because the claim is about *any* project, the suite has to sample the config space rather
than test one site.

```
tests/conformance/
  fixtures/
    minimal/        # zero config — proves the SAFE DEFAULT is compliant
    static-site/    # output: 'static', file router
    ssr-app/        # server runtime + adapter
    api-project/    # exposes OpenAPI
    agent-app/      # standards: ['mcp','a2a'] — opted in
  matrix.test.ts
```

For each fixture: build it, collect emitted artifacts, and assert **for every standard
its config declares** that the artifact exists, is served with the right content-type,
and passes L1 and L2 for that standard.

Two properties matter more than coverage breadth:

1. **`minimal/` is the load-bearing fixture.** It has no `agentReadiness` key at all.
   If baseline emission regresses to a no-op, that fixture goes red. Today there is
   nothing that would notice.

2. **Declared-but-absent must fail.** A config declaring `standards: ['mcp']` whose build
   emits no MCP card is a failure, not a skip. Skipping on absence is `_no dist_` again —
   an absent check reported as a passing one.

---

## 6. Referencing discipline — keeping vendored specs honest

The failure mode of L1 is that **a cached external artifact drifts from its source and
nothing says so.** `__bundle-sizes.json` did exactly this: it recorded a pre-LIS arbor
size for weeks while every check stayed green.

```
packages/plugin-agent-readiness/spec/
  README.md
  mcp/server-card.v1.0.schema.json
  a2a/agent-card.schema.json
  sitemap/sitemap-0.9.xsd
  _provenance.json
```

1. **Never hand-edit `spec/`.** It is someone else's artifact; editing it makes our tests
   pass against a document that does not exist.
2. **Provenance is recorded** — source URL, sha256, `fetched_at`, spec revision, and a
   `note` for provisional specs:
   ```json
   { "mcp/server-card.v1.0.schema.json": {
       "source": "https://modelcontextprotocol.io/schemas/server-card/v1.0",
       "sha256": "...", "fetched_at": "2026-07-26", "spec_revision": "2025-11-25",
       "note": "no /.well-known/mcp server-card is standardized; SEP-1649 closed" } }
   ```
3. **Refresh is an explicit command** (`bun run spec:refresh`), never a side effect of
   another task. This is the `readme:remeasure` lesson: incidental refresh is what
   corrupts; cache-authoritative-by-default is what stabilises.
4. **Drift opens an issue; it does not auto-update.** Auto-updating would let the spec
   move without anyone deciding we should follow it.
5. **Snapshot age appears in failure output**, so a green run reads as "green against the
   2026-07-26 snapshot" rather than simply "green".
6. **A missing snapshot fails loudly** — never skip.

---

## 7. Sequencing

Ordered by value per unit of risk.

| # | Work | Why here |
|---|---|---|
| 0 | Label every existing `compliance/` file with its layer and limitation | Free, no risk. `mcp-server-card-schema.test.ts` already states it does not claim spec conformance; the other three do not, and read as if they do. |
| 1 | **Invert the default** to `baseline`, keep `false` as opt-out | Closes Gap B. Without it every later layer verifies emptiness. Behaviour change — needs a changeset and a migration note. |
| 2 | **`minimal/` conformance fixture** | Makes the new default a property that can regress visibly. Pairs with 1; landing 1 without 2 leaves it unguarded. |
| 3 | **L2 robots.txt** via reference parser | Replaces hand-transcribed RFC 9309 with the parser that actually decides. In-process, no Python. |
| 4 | **L1 MCP** via `@modelcontextprotocol/sdk` | Already a dependency; string-equality → real validation at near-zero cost. |
| 5 | **Move `apps/docs-next` onto `aihu.config.agentReadiness`** | Dogfood the shipped path instead of the manual wiring, so the config surface is exercised by us before users meet it. |
| 6 | **Rest of the conformance matrix** | Mechanical once 2 exists. |
| 7 | **L3 live probe**, scheduled | Catches the SPA-fallback class and deploy-time loss. |
| 8 | **L1 sitemap / OpenAPI**, then **L2 llms.txt**, then **L3 grader diff** | Descending value, ascending external dependency. |

Steps 1 and 2 are the ones that change what the product does. Everything else improves
confidence in a guarantee that, today, is not made.

---

## 8. What this does not solve

- **Standards are moving.** No `/.well-known/mcp` server-card is standardized today.
  Vendoring an unstandardized schema pins us to a guess; the `note` field records that a
  snapshot is provisional.
- **A grader is not a spec.** Passing `isagentready.com` and being agent-ready are
  different claims. L3 measures the former.
- **Coverage is not conformance.** Three green layers mean three oracles agreed — better
  than one transcription, still not proof.
- **Emission is not correctness.** A sitemap listing every route is compliant and can
  still be wrong for the project. The framework can guarantee *well-formed and present*;
  it cannot guarantee *appropriate*.

The load-bearing improvement is narrower than "aihu projects are compliant": it is that
**the framework's compliance claim becomes something that can fail out loud** — at the
default, across the config space, against oracles we did not write.
