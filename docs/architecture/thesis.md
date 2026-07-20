# aihu — framework thesis

**Layer:** base. Founder-ratified 2026-07-19. **Not modifiable by automated work.**
Changes require deliberate human review, same as any base-layer document.

This is the statement everything else answers to. Plans, slices, and specs are downstream:
a proposal is in scope if it makes one of the four properties below more true, and out of
scope if it doesn't.

---

## Thesis

> **aihu builds services that treat people and their agents as first-class audiences of
> one codebase.** What an agent may see and do is declared in source alongside the UI,
> derived into every discovery surface rather than maintained beside it, enforced
> server-side, and evaluated against a principal the service can verify.

The framework's bet is that "add an API for the agents" is the wrong shape. A parallel
surface drifts from the one it parallels — always, and silently. aihu's position is that
the agent surface must be a **projection of the same declarations that build the UI**, so
that drift is structurally impossible rather than merely discouraged.

---

## The four properties

### 1. Dual-audience — different by nature, not merely by format

Humans and agents are both first-class, but **not symmetric**, and the asymmetry is the
point:

- **A human receives an experience.** The site decides layout, sequence, emphasis,
  interaction. Presentation is the service's authorship.
- **An agent negotiates a representation.** Same underlying content and capability, but
  the *agent* chooses the form — markdown, structured JSON, a tool schema, plain HTML.
  Format selection moves to the client.

So content negotiation is not a fallback path bolted on for crawlers. For the agent
audience it **is** the interface.

**But the divergence runs deeper than format.** The two axes of service are expected to
*function differently*, because their consumers differ in kind. Derivation produces
**different shapes from one source** — not one shape rendered twice. An agent surface that
is merely the UI re-serialized has failed this property, not satisfied it.

| Concern | Human nature | Agent nature |
|---|---|---|
| Consumption | Sequential, attention-bounded | Parallel, context-bounded |
| Discovery | Browses; benefits from serendipity | Queries; wants completeness |
| Structure | Progressive disclosure, visual hierarchy | Flat, complete, explicitly typed |
| Volume | Pagination | Cursors, bulk, streaming |
| Confirmation | "Are you sure?" dialog | Idempotency key, declared limit |
| Errors | Visual feedback, recoverable in place | Explicit codes, machine-branchable |
| Rate limits | Invisible; never encountered | **A first-class budget to plan against** |
| Trust | Design cues, brand, social proof | Verification, schema, deterministic contract |

Two consequences worth stating plainly, because both are easy to get wrong:

1. **Some capabilities are agent-only and some are human-only, and that is correct.** Bulk
   export and structured query have no sensible UI. Visual comparison and exploratory
   browsing have no sensible tool call. Forcing either to project is a design error. This
   is why `expose:` is an explicit per-member opt-in rather than automatic — the author
   decides what belongs on the agent axis, and the default is "nothing."
2. **Any content reachable only by executing the site's presentation logic is unavailable
   to the agent axis entirely.** Primary content must be projectable into a representation
   the agent asked for, independent of the UI that renders it for a person.

⚠️ **Directional, and honestly ahead of adoption.** Today only a minority of agent clients
negotiate format at all (see `docs/domain-hints/seo-and-agent-discoverability.md` §7.5:
3 of 7 tested send `Accept: text/markdown`, and those are coding agents). We hold this
property because it is where the web is going and because the architecture is cheap when
derived — not because the readers have arrived. **Do not justify work on this property by
claiming demand that doesn't exist yet.**

### 2. Derived — the agent surface comes from the same source as the UI

Every agent-facing artifact — tool schemas, discovery documents, capability manifests,
catalogs — is **generated** from the declarations that already exist in the component and
route source. Nothing about the agent surface is hand-maintained.

The compiler is the only place that can see the whole picture at once: the route table,
the component tree, and the per-member capability annotations. That vantage point is the
framework's structural advantage, and it is what makes derivation enforceable rather than
aspirational.

**Test of the property:** if a human has to remember to update something when they add an
`$action`, the property is violated. A comment reading "kept in sync with…" is a defect
report.

### 3. Governed — capability, authority, and rate are declared per-member and enforced by the server

What may be called, by whom, and how often is declared next to the code it governs
(`expose:`, `$scope`, `$rate-limit`) and **enforced on the server**.

The client is never the policy authority. A client-side surface may be narrow, opaque, or
convenient, but it is not a security boundary — it is a convenience over a decision the
server has already made independently.

**Failure modes this property exists to prevent:** enforcement displaced to the browser;
a declared control that silently no-ops when its plugin is absent; a check that is
structurally always-true.

### 4. Attributed — the service can verify whose agent is asking

Attribution is **tiered**. Tier 0 is universal; the deeper tiers apply only where the
work requires them.

| Tier | Claim | Required for | Mechanism |
|---|---|---|---|
| **0 — Attributable** | The request carries an identity context at all, even if anonymous is the answer | **Every path, always** | `RequestContext` threaded through every transport |
| **1 — Delegated** | This agent acts for principal X, with scope Y | Any capability invocation | Site-issued scoped credential; OAuth-shaped |
| **2 — Bounded** | …within limit Z, time-boxed, auditable | Transactions | Site-issued, site-verified capability token carrying authorization details |

**Tier 0 is co-equal with the other three properties.** A transport that cannot express
"who is asking" has failed the thesis even if it never transacts — because the gate
downstream has nothing to decide against, and the failure is invisible until someone
audits it.

Tiers 1 and 2 belong to the transaction layer and are scoped work, not baseline.

**Deliberately local.** The credential is issued by the service and verified by the
service. No external trust root, no global PKI, no dependency on unshipped standards.
This is sufficient because in aihu's target flow **the human is the discovery mechanism** —
a person steers their assistant to the service, so first-contact identity at internet
scale is not the problem being solved. When global identity fabrics (Web Bot Auth, ARD
registries) mature, they become *additional inputs* to a decision the local gate already
makes.

**Explicitly out of scope:** regulated KYC/AML, custody of funds, cross-site agent
reputation, and verifying agent identity on first contact absent delegation. These are
either someone else's problem or nobody's yet.

---

## Invariants — the properties as build-time checks

A thesis that lives only in prose rots. Each property gets a check that fails the build,
in keeping with the framework's own compile-time bias.

| Property | Invariant | Status |
|---|---|---|
| **Dual-audience** | Every route's primary content is retrievable without executing JS | not built |
| **Derived** | No agent-facing artifact is hand-maintained; no "keep in sync" seams | not built |
| **Governed** | Every reachable dispatch path consults the server gate; a permissive binding is still denied | partial — `AC11b` covers the live path |
| **Attributed (tier 0)** | No transport reaches an action invoker without a `RequestContext` | not built |

These four are worth more than most of the feature work, because each one converts a
property from "true today if you check" into "cannot silently stop being true."

Precedent from 2026-07-19: `check:emit-parses` found five simultaneous invalid-output bugs
in one run, none of which any existing test caught, because the suites asserted substrings
rather than validity. Invariants catch classes; tests catch instances.

---

## How current work maps

Every defect catalogued in `TODOS.md` as of ratification is a violation of exactly one
property. That correspondence is the main evidence the thesis is load-bearing rather than
decorative.

| Property | Violations found |
|---|---|
| **Dual-audience** | AI crawlers can't see shadow-DOM content; `MarkdownResolver` is an interface with no implementation; content negotiation ignores user-agent |
| **Derived** | `describe:` parsed then dropped; server-card `skills` hand-mirrored in `vite.config.ts`; `@aihu/seo` and `plugin-agent-readiness` duplicating identity with opposite defaults; `agent-manifest.json` emitted for no consumer; deprecated `/.well-known/agent.json`; non-spec `/.well-known/mcp.json` |
| **Governed** | Action allowlist was dead code with the client as de-facto authority; rate limiting fails open where scope fails closed; bridge accepts any channel without a handshake check |
| **Attributed** | a2a and acp forward no `RequestContext` — anonymous by construction; ACP structurally cannot pass arguments |

**Priority follows from the property, not from taste.** Sequence by which property is
furthest from true, not by which slice is most interesting.

---

## What this thesis rules out

Stating the negative space, so scope arguments are short:

- **A separate agent API.** If it isn't derived from the UI's declarations, it drifts. That
  is the specific failure this framework exists to avoid.
- **Optimizing for AI search as a distinct discipline.** GEO's replication failed
  (`docs/domain-hints/seo-and-agent-discoverability.md` §8: 3 of 54 cases significant,
  methods "frequently have a negative impact"). Fundamentals — server-rendered head,
  crawlable content, structured data, speed — are the documented answer.
- **Config that claims to control what it cannot reach.** Four of six relevant control
  planes are unreachable from a build step (§7.9). A setting that generates a file while
  the real control sits in a vendor dashboard is worse than no setting, because it fails
  silently.
- **Emitting into a void as a strategy.** Artifacts with no demonstrated reader may be
  emitted when derivation makes them ~free, but must not be load-bearing in any plan.
  llms.txt: 97% of published files received zero requests in May 2026.

---

## Related

- `docs/domain-hints/seo-and-agent-discoverability.md` — the researched external facts
  constraining all of the above, with sources and verification status.
- `docs/plans/2026-07-19-twenty-issue-remediation.md` — the remediation plan, to be
  restructured underneath these four properties.
- `TODOS.md` — live defect catalogue.
