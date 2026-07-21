# PROPOSED thesis amendment — Governed Extractability (GX)

**Status: PROPOSAL — not applied.** `docs/architecture/thesis.md` is base-layer and
founder-ratified; this document is the amendment text offered for the founder to ratify,
edit, or reject. If ratified, the section below is appended to the thesis's
**"Ratified sub-decisions"** section, in the style of the existing DA4 entry.
Full design: `docs/plans/governed-extractability/40-spec.md` (declaration + enforcement)
and `50-credential-lifecycle.md` (issuance, consent, revocation — folded in by founder
decision so the ratifiable unit is the whole loop: **declare → issue → present → verify →
enforce**).

---

## Proposed text (verbatim, for `thesis.md` §Ratified sub-decisions)

### GX — extractability is a declared, two-axis, principal-gated property of every surface (2026-07-20)

**Decision (founder):** what any surface exposes to crawlers and agents is a first-class
**declared** policy — a single `extract:` declaration per surface carrying two independent
axes — derived into every emission and discovery surface, and enforced by one server-side
principal gate. It is never inferred from rendering mode, component type, or the absence of
`expose:`.

- **Crawl-visibility axis** (`read:`) — who may index/read the rendered surface.
  Anonymous values (`all` / `agents` / `search` / `none`) are **compliance-tier**: enforced
  at the origin against declared, self-identifying crawlers — robots.txt with teeth —
  aligned with the shipped tiered `allow-agents` robots default (#430). Verified values
  (`verified` / `{ scope }` / `human`) are **hard-tier**.
- **Agent-callability axis** (`call:`) — whether/what of the agent surface (`expose:`
  members, MCP tools) is available and to whom (`none` / `anonymous` / `verified` /
  `{ scope }`). Hard-tier, enforced at the serving gate. `expose:` remains the only
  member-level grant; `call:` is a ceiling, never a grant.

The axes are independent: a surface may be crawlable-but-not-agent-callable, or
agent-callable-but-not-crawlable ("act but never read" is legitimate and supported). There
is no total order across them, and no single "privacy level."

**Governance gates both humans and machines.** Unverified/anonymous requesters — human or
machine — receive the public tier only. Governed content requires a verified principal:
a human session or a verified agent credential, resolved by one `resolvePrincipal` per
request and decided by one `decideEmission` for every emission surface (SSR HTML, state
script, loader, negotiated markdown, tool calls, discovery).

**The hard tier is defined by the data layer, not by HTML.** Hard-governed content is
**server-held**: never emitted into the client bundle, never present in anonymous SSR or
prerender output, fetched per-principal through the gate. Withholding markup alone is not
control — the framework's own hydration self-heal reconstructs withheld nodes from
bundle-resident values; therefore the compiler emits hard-governed template constants and
initial state into the server-only channel, governed modules are split into gate-served
chunks outside the public graph, and the client walker refuses to materialize withheld
placeholders from local data.

**Declared contradictions are compile errors,** never runtime precedence: a closed `call`
axis with an `expose:`d member, a malformed policy, or duplicate declarations on one
surface fail the build. Composition across nested surfaces is a meet — requirements union;
narrowing composes silently, widening is impossible.

**The framework issues the credentials its own gate demands.** Declaring a verified tier
without providing a path to the credential would be a gate with no door — the loop is
whole: declare → **issue** → present → verify → enforce. Issuance is **site-issued and
site-verified** (the thesis's "deliberately local" attribution posture): a new mint
(`signJwt`) signs with the same secret the gate verifies — one trust root, no external
PKI, no client-registration federation. It is OAuth-*shaped* (the well-known discovery
documents, authorization-code + PKCE, RFC 7009-shaped revocation) so agents can
self-navigate from a 401 to a token, but the human remains the discovery and trust
mechanism: a person already authenticated on the site approves **"this agent, these
scopes, this long"** at a consent surface, and the minted token carries exactly that —
`sub` (the delegating human), `act` (the agent), `typ: 'agent'`, attenuated scopes (always
a subset of the delegator's own — issuance can narrow authority, never widen it), audience,
expiry, and an audit/revocation id. Non-interactive consumers get listable, hashed-at-rest,
instantly-revocable API keys. This **realizes Attribution Tier 1 (Delegated) and Tier 2
(Bounded)** — previously marked "scoped work, not baseline" — as baseline capability:
GX now ships the issuance those tiers require. Revocation is honest about statelessness:
short expiry plus refresh-family kill is the floor; a fail-closed revocation-store consult
on the verify path is the hard tier's option, and its cost (a store read per governed
request) is stated, never hidden. Issuance is **declared** like everything else — one
`issue:` config on the auth plugin fans into endpoints, discovery documents, 401 pointers,
and the consent screen's scope vocabulary, all derived from the compiled scope census; a
site that declares nothing issues nothing and behaves byte-identically to today.

**`$shadow` is pure encapsulation.** Shadow vs light DOM carries **zero** extractability
semantics in either direction. The DA4 light-DOM flip lands *into* this control
(sequencing B): rendering mode derives from the DA4 classifier plus authored encapsulation
intent; extractability derives only from `extract:`.

**The honest ceiling (explicit scope of this decision):**

1. Anything an anonymous human can see, an anonymous scraper can extract; the framework
   cannot change that. Anonymous-crawl control is **compliance-tier** — honored by
   compliant crawlers that identify themselves, defeated by a determined UA-spoofer.
2. **Hard** control exists only for content that is (a) behind a verified principal and
   (b) server-held — not in the client bundle, not in anonymous SSR.
3. The hard tier is as strong as the credential: token expiry/audience verification and a
   revocation story are prerequisites of the control, not enhancements.
4. No aihu artifact, doc, or marketing claim may state control above this ceiling. A
   control that claims reach it does not have is this thesis's own named anti-pattern.

**Why.** Before this decision the three extractability axes were separate mechanisms that
silently contradicted each other: the tool gate honored `expose:` while SSR shipped the
same content to every crawler; shadow DOM was an accidental privacy lever about to flip
open by default (DA4); authored intent had no expression at all. A crawlable-by-default
framework with only scattered escape hatches "becomes just a normal web framework." This
decision makes extractability governed the way invocation already is.

**How it strengthens the four properties.**

- **Dual-audience:** the machine representation is negotiated *per principal* — agents get
  exactly what their credential entitles, and the negotiated surface can no longer be a
  superset of the human one by accident.
- **Derived:** one declaration fans into the marker, route table, agent meta, robots,
  discovery, negotiation, chunk layout, and the gate predicate — with a build-time
  agreement check. Nothing about extractability is hand-maintained or inferred.
- **Governed:** the property's own words — "enforced server-side, client never
  authoritative" — now reach the render and data surfaces, not only tool calls; a render
  path that lacks the gate refuses to render governed trees (fail-closed by construction).
- **Attributed:** every SSR request now resolves a principal (tier-0 attribution extends
  to the render path); the verified tiers ride the same site-issued, site-verified
  credential as tool calls — no second trust root. And the deeper tiers stop being
  aspirational: the delegation flow mints the Tier-1 claim ("this agent acts for
  principal X, with scope Y") and the Tier-2 bounds ("within limit Z, time-boxed,
  auditable") as literal token claims (`sub`/`act`/`scope`; `exp`/`jti` + the
  member-declared rate budget), issued by the service and verified by the service. The
  thesis's tier table row "scoped work, not baseline" is closed by this amendment: baseline
  issuance exists, and any capability invocation can require it with one declared scope.

**Scope.** Per-surface (route/component) granularity; governed values live in governed
surfaces. Static hosting serves the anonymous variant only — verified tiers degrade to
absent, never to open. Edge/CDN behavior, IP/fingerprint defenses, and
proof-of-personhood walls are control planes the framework does not own and does not
claim.

---

## Sub-decisions already ratified (folded into the above)

- **D1** — governance gates both humans and machines; anonymous = public tier only
  (2026-07-20).
- **D2** — the honest ceiling accepted as the stated scope (2026-07-20).
- **D3** — two independent axes, not a total-order lattice (2026-07-20).
- **Issuance folds into GX** — the ratifiable unit is the whole loop (declare → issue →
  present → verify → enforce), not enforcement alone (2026-07-20; design:
  `50-credential-lifecycle.md`).
- Charter: DA4-D1 (layouts default light), DA4-D2 (`@scope` CSS), sequencing B (this
  control ships before the flip).

## Founder decisions still needed before ratification

Five open calls. The first concerns the declaration half; the other four arrived with the
issuance fold (full option analysis: `50-credential-lifecycle.md` §10). None are decided
here.

**1. Default posture.** Recommended (spec §9):
`extract: { read: 'agents', call: 'anonymous' }` — public content is crawlable by default
(humans, search, user-directed AI fetchers; SEO intact; zero break for every legitimate
audience), the agent axis stays opt-in (`expose:` is already default-hidden), and the
already-shipped #430 robots default ("training crawlers: Disallow") gains origin
enforcement instead of remaining a request the server itself contradicts. "Crawlable by
default" then applies only to the public tier and is governable with one authored line —
which answers the founder's concern ("we can't *control* the data flow") without the
closed-by-default posture that the thesis, DA4, and #430 all argue against.
Alternative if any served-bytes delta is unacceptable: default `read: 'all'`
(byte-identical to today; trainer refusal becomes the first recommended authored line).

The scaffold writes the chosen default explicitly and every build prints the per-value
census, so the default is a declared fact in every repo, never a silent one.

**2. Revocation requirement for the hard tier** (`50-credential-lifecycle.md` §6, §10 F1).
(a) TTL floor only — short access tokens + refresh-family kill; zero verify-path cost;
revocation lag bounded by the access TTL. (b) *Recommended:* a fail-closed
`RevocationStore` consult on the verify path required for hard-tier surfaces — immediate
per-instance revocation at the cost of one store read per governed request. (c) Shared
store required — cross-instance immediacy, heaviest operational floor. The honest-ceiling
clause "the hard tier is as strong as the credential" is why this is a ratification, not a
default.

**3. Consent-surface ownership** (§10 F2). *Recommended:* first-class plugin-served (the
scope list, descriptions, and approve/deny contract derive from the compiled census —
correct by construction), with app-replaceable presentation. Alternative:
scaffolded-and-app-owned, accepting a "kept in sync" seam at the exact moment a human
grants authority — the seam the thesis's Derived property calls a defect report.

**4. Default TTLs** (§10 F3). Access token (recommended 15 min), refresh (14 d), maximum
delegation TTL a human may grant (24 h), API-key default (non-expiring, listed +
revocable). Policy numbers, founder's call.

**5. API-key form** (§10 F4). *Recommended:* opaque server-side reference, hashed at rest
(instantly revocable, listable, a store leak yields no usable credential). Alternative: a
long-lived JWT under `allowNoExpiry` — stateless verification, but revocation degrades to
the store consult and a leak is permanent until denylisted.
