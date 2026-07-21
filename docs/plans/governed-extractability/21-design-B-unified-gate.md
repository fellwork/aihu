# Governed Extractability — Design B: unified server-side gate, principal-keyed emission

**Effort:** `governed-extractability` · **Track:** `da4-govern` · **Branch:** `design/govern-B`
**Status:** design only — no implementation. Independent of design A (not read).
**Inputs:** `00-charter.md` (founder framing, ratified D1–D3), `10-survey.md` (code-verified
control map), `docs/architecture/thesis.md` (four properties), `docs/plans/da4-flip/design-spec.md`
(branch `design/da4-flip`).

---

## 0. The model in one paragraph

Extractability is **one server-side decision, made once per request, keyed on the verified
principal**. The framework already makes exactly this decision for tool calls — `runGate`
(`packages/agent-service/src/agent-service.ts:129`) resolves a signature-verified principal
(#420) and decides, fail-closed, what may be invoked. This design does **not** invent a second
control plane for crawlers; it makes the *same* decision function reach the *other* emission
surface — SSR/prerender HTML (`packages/server/src/ssr.ts:485`,
`packages/router/src/server.ts:50`, `packages/app/src/prerender.ts:395`), the state script
(`ssr.ts:407`), the loader script (`router/src/server.ts:54`), and the markdown representation
(`plugin-agent-readiness/src/markdown-resolver.ts`). The authored vocabulary is **not new**:
`$scope` and `expose:` already declare access intent; today they simply stop at the tool gate.
The design extends their *reach* into render output, so that "what a principal may call" and
"what a principal may read off the wire" are decided by one policy at one point — which is the
thesis's Governed property ("enforced server-side, client never authoritative") applied to the
one surface the survey shows has no gate at all (survey §1 row 17: "identical HTML to human
and crawler").

---

## 1. The gate

### 1.1 What "one gate" means concretely

There is one **policy module** and several **enforcement taps**. The policy module is the
choke point: every tap asks it the same question with the same inputs and cannot answer the
question itself. This mirrors how `runGate` is already the single source of truth for both
`handleToolCall` and `authorize` (`agent-service.ts:373-383` — "the security ordering can
never diverge between the two entry points"). We widen that single source, we do not add a
peer.

**New module: `packages/agent-service/src/principal-gate.ts`** (lives beside `runGate`, same
package, so tool-path and emission-path policy share one file's blast radius). It exports:

```ts
// The verified principal, resolved ONCE per request.
type Principal =
  | { class: 'anonymous'; uaClass: 'ai-crawler' | 'browser' | 'unknown-bot' }
  | { class: 'agent';  sub: string; scopes: string[] }   // valid site-issued JWT, agent-typed
  | { class: 'human';  sub: string; scopes: string[] }   // valid session JWT

// Resolve from a raw Request (SSR path) or a RequestContext (tool path).
async function resolvePrincipal(req: Request, deps: {
  authPlugin?: AuthPlugin           // createVerifiedAuthPlugin — verified-plugin.ts:45
  isAgentUserAgent?: (ua: string) => boolean  // isAiCrawlerUserAgent — content-negotiation.ts:23
}): Promise<Principal>

// The single emission decision. `gov` is compiler-emitted governance meta (§3).
function decideEmission(principal: Principal, gov: GovMeta): 'emit' | 'withhold'
```

Refactor, not addition: `runGate` step 2 (`agent-service.ts:194-269`) becomes a call into
`resolvePrincipal` + the existing 401 envelope mapping. The scope consult (step 3,
`:275-286`) and rate-limit keying (step 4, `:315-333`) read `Principal.scopes` /
`Principal.sub` — same verified source, unchanged semantics, one implementation.

### 1.2 The enforcement taps (all of them — the emission surface is five outputs, not one)

| # | Tap | Where | What it does with the decision |
|---|-----|-------|-------------------------------|
| T1 | Tool-call gate | `agent-service.ts:129` (`runGate`) — **already exists** | Unchanged behavior; now consumes `resolvePrincipal`. |
| T2 | SSR tree walk | `ssr.ts:248` (`_renderNode`) and `:305` (`renderNodeAsync`) | When a branch carries `gov` meta, consult the decider; on `withhold`, emit the **in-place placeholder** (§4) instead of children. |
| T3 | State script | `ssr.ts:407` (`emitStateScriptAndClose`) | Filter the serialized record (it is **path-keyed** — see `hydrate.ts` serialize contract) by withheld path prefixes. A redacted subtree's signal values never ship in `__aihu_state__`. |
| T4 | Loader script | `router/src/server.ts:52-55` (`__aihu_loader__`) | Route-level: if any withheld `gov` node was encountered during the render, the loader JSON for that route is withheld for that principal (coarse; see weakness W6). |
| T5 | Markdown representation | `plugin-agent-readiness/src/markdown-resolver.ts:110-127` (capabilities section) + body | The resolver receives the principal; the capabilities section lists only tools whose gate this principal could pass; the body derives from the same redacted render. Fixes the survey's "negotiation gives agents a superset" conflict at the same gate. |

### 1.3 How the decider reaches `ssr.ts` without breaking its hard boundary

`ssr.ts` declares "zero client runtime imports" and already has the pattern for this: the
injection slot (`_setContextFns`, `ssr.ts:31`) and per-call options (`SsrOptions.serializer`,
`:91`). The decider follows the **per-call option** form, not the ambient slot, because of the
lesson written into `router/src/server.ts:41-49`: *"`hydratable` is a property of the
DESTINATION, not of the renderer, so it must be explicit at every call site."* Emission policy
is likewise a property of the request being answered:

```ts
interface SsrOptions {
  // ...existing...
  readonly emission?: (gov: GovMeta) => 'emit' | 'withhold'
}
```

Call sites:

- **Live SSR** — `router/src/server.ts:31` (`handle(req)`): resolve the principal from `req`
  once, close it into the decider, pass to `renderToString` at `:50`. This is where an agent
  authenticates to an SSR request (§1.4).
- **SSG prerender** — `prerender.ts:395` (page) and `:286` (layout shell): there is **no
  request at build time**, so the principal is pinned to the most-restrictive public class,
  `{ class: 'anonymous', uaClass: 'ai-crawler' }`. Static output ships exactly one variant:
  the anonymous one. Richer variants exist only where a server answers requests. (A human on
  a static site gets withheld content client-side after auth — §4.3 shows why that composes
  with hydration rather than fighting it.)
- **Rust native renderer** — `packages/server/src-native/src/render.rs` is a third
  implementation of the render walk (`ssr.ts:236-244`). It must implement the same
  consult **or refuse governed trees** (§6 invariant I2 makes refusal the default).

### 1.4 How the verified principal reaches the SSR path

SSR has no JWT parameter today; it has a `Request`. `resolvePrincipal(req)` reads, in order:

1. **`Authorization: Bearer <jwt>`** → `authPlugin.verify` — the *same* HMAC-verify primitive
   the tool gate uses (`packages/auth/src/verified-plugin.ts:53` →
   `packages/auth/src/server.ts:125`). **This is how an agent authenticates to a page GET: the
   same site-issued credential it uses for tool calls, on the same header it already sends to
   `/__aihu/tools/call`.** No new credential type, no new issuance flow — thesis §Attributed:
   "issued by the service and verified by the service." Whether the token is agent-class or
   human-class is a claim the site controls at issuance (`typ: 'agent'` / an `act` actor
   claim on delegated tokens); the site signs, the site reads.
2. **Session cookie** (`aihu_session`) → `getAuthState` (`auth/src/server.ts:166`), which
   verifies with the same `verifyJwt`. Valid → `{ class: 'human', sub, scopes }`.
3. **Neither, or verification fails** → anonymous. The UA subclass comes from
   `isAiCrawlerUserAgent` (`content-negotiation.ts:23`), the single shared `AI_BOT_LIST`
   robots.txt is generated from (`content-negotiation.ts:7-11` — reusing it here is the same
   no-second-bot-list discipline that comment demands).

Fail-closed inheritance: a *presented but invalid* credential resolves to `anonymous`, never
to a verified class — verification failure cannot yield more access than sending nothing
(and `anonymous` receives the least of any class, so downgrade-on-failure is safe).

**Honesty about step 3 (this shapes the whole taxonomy):** UA classification is spoofable.
The only **hard** boundary `resolvePrincipal` can establish is *verified vs unverified*.
Within unverified, `ai-crawler` vs `browser` is a **compliance-tier** signal — good against
declared, well-behaved crawlers (the same population robots.txt addresses, but now enforced
at emission rather than requested politely), worthless against a scraper that lies about its
UA. The emission table below is explicit about which withholdings are hard and which are
compliance-tier, because a control that overclaims is the thesis's named anti-pattern
("config that claims to control what it cannot reach… fails silently").

---

## 2. Principal taxonomy → emission table

Content classes (derived from declarations, §3 — authors do not write these names):

- **C0 — public content.** Everything not otherwise classified: static authored markup, text,
  loader-rendered content in ungoverned components. The default.
- **C1 — unexposed governed state.** Values of members *without* `expose: read` interpolated
  into the render tree of an `@agent` component (the survey's sharpest conflict: the author
  withheld it from the agent axis, SSR ships it anyway).
- **C1x — exposed, unscoped state.** Members with `expose: read` and no `$scope`. These are
  public *by declaration* — the tool gate already dispatches them to anyone
  (`agent-service.ts:213-215`: unscoped ⇒ no principal needed), so their rendered values are
  public too. Coherence, not a new decision.
- **C2 — scoped subtree.** The subtree of a component declaring `$scope: '<scope>'`.
- **C3 — human-session-only subtree.** `$scope: '@human'` (the one vocabulary addition, §3.3).

| Emission ↓ / Principal → | anonymous · ai-crawler | anonymous · unknown-bot | anonymous · browser | agent (verified, no matching scope) | agent (scope matches) | human session |
|---|---|---|---|---|---|---|
| C0 public | **emit** (markdown-negotiable) | **emit** | **emit** | **emit** | **emit** | **emit** |
| C1x exposed+unscoped | **emit** | **emit** | **emit** | **emit** | **emit** | **emit** |
| C1 unexposed governed state | **withhold** *(compliance-tier)* | **withhold** *(compliance-tier)* | **emit** — it is the UI | **withhold** *(hard)* | **withhold** *(hard — expose still gates member read)* | **emit** |
| C2 `$scope`'d subtree | **withhold** *(hard)* | **withhold** *(hard)* | **withhold** *(hard)* | **withhold** *(hard)* | **emit** | emit iff session carries scope |
| C3 `$scope: '@human'` | **withhold** | **withhold** | **withhold** | **withhold** | **withhold** | **emit** |
| Capability advertisement (T5 markdown section; per-request llms.txt) | unscoped tools only | unscoped tools only | n/a (gets HTML) | unscoped + scope-matching tools | unscoped + scope-matching tools | n/a |
| `__aihu_state__` / `__aihu_loader__` | filtered per above (T3/T4) | filtered | filtered (C2/C3 paths out) | filtered | filtered | filtered per scopes |

Reading the two axes back (the survey §0 reconciliation, done at the gate):

- **Axis (a) crawler extractability** is now a *row outcome*, not a separate mechanism:
  a crawler is just the least-privileged principal class, and what it extracts is whatever
  the gate emits to `anonymous`.
- **Axis (b) agent extractability** is unchanged at T1 and *extended* at T2: a verified agent
  reading a page gets exactly the content classes its credential entitles it to — the page
  read and the tool call can no longer disagree about the same member.
- **Axis (c) authored intent** is expressed by the declarations that already exist (§3), with
  one addition (`@human`).

The one deliberately uncomfortable cell: **C1 → anonymous·browser = emit.** An unexposed
member's rendered value must reach an anonymous *person* — it is the UI; withholding it
would blank ordinary pages for signed-out users. Consequence: C1 withholding against
crawlers is compliance-tier only (a scraper wearing a browser UA gets what a person gets).
The hard version of "not extractable" is spelled `$scope` — verification, not UA. The
design refuses to pretend otherwise (see W1).

---

## 3. Deriving intent from existing primitives

### 3.1 What already expresses extractability intent, unmodified

The claim of this design: **`$scope` + `expose:` + component boundaries already express
nearly all extractability intent; they just don't reach the SSR output.** Evidence from the
survey:

- `$scope` (parse `parser/agent_macros.rs:37`; emitted server-only `emit.rs:3943,4211`;
  live binding `arbor/src/mount.ts:399`; enforced `agent-service.ts:275-286`) — already means
  "this capability requires a principal bearing scope X." A component whose *invocation*
  requires auth, but whose *rendered state* ships to every crawler, is not a second design
  question — it is the same declaration failing to reach one of its outputs.
- `expose:` (parse `state_macros.rs:1175`; default-hidden gate `emit.rs:3695-3752`, test
  `:6947`; server allowlist `agent-service.ts:185-192`) — already means "this member is on
  the agent axis." The survey's sharpest conflict (§0) is precisely that this declaration is
  honored at T1 and ignored at T2.
- **Component boundaries** are custom elements — element-rooted subtrees in the render tree.
  They are the natural redaction unit (§4 shows this is also the *required* unit).

### 3.2 The mechanism: compiler-emitted governance meta on the render tree

The compiler is "the only place that can see the whole picture at once" (thesis §Derived).
It already parses both declarations; it now also *emits* them into the render tree it
generates, as a `gov` field on branch nodes:

```
GovMeta =
  | { kind: 'scope',  scope: string, tag: string }        // component host branch, from $scope
  | { kind: 'member', member: string, exposedRead: bool,  // wrapper branch around a governed
      tag: string }                                       //   interpolation, from expose:
```

- **Component-level (`$scope` → C2/C3):** the host branch of the component's emitted tree
  carries `gov: { kind: 'scope', … }`. One field on a node the codegen already builds; the
  value comes from the macro already parsed at `agent_macros.rs:37`.
- **Member-level (`expose:` → C1/C1x):** the compiler generates every interpolation binding,
  so it knows which text leaves read which member's signal. For members of `@agent`
  components it **wraps the interpolation in an element** (`<span>`; existing enclosing
  element reused when the interpolation is its sole text content) carrying
  `gov: { kind: 'member', … }`. The element wrap is not cosmetic — §4.2 constraint C-2 makes
  it mandatory (bare text nodes cannot be redacted without corrupting the hydration text
  cursor). Scope of the taint: `@agent` components only. Ordinary UI components have no
  agent vocabulary and are C0 — this is what keeps default SEO intact (§6).

This is the Derived property doing the work: the SSR gate consumes a projection of the same
declarations that build the tool gate. No hand-maintained "extractability manifest" exists
anywhere — if it did, it would drift, which is the exact failure the thesis names.

**Worked example — the survey's sharpest conflict, resolved.** An author writes an `@agent`
component `<x-quote>` with `state: { margin: 0.4 }` and deliberately no `expose:` on
`margin`, and `{margin}` appears in its template. Today: no MCP tool, no card skill, 404 at
T1 — and the rendered `0.4` ships in SSR HTML to every crawler (`ssr.ts:485` →
`router/server.ts:50`, no principal check). Under this design: the compiler wraps the
interpolation, `gov: { kind: 'member', member: 'margin', exposedRead: false }`; `handle(req)`
resolves the crawler to `anonymous·ai-crawler`; `_renderNode` consults the decider at that
branch → `withhold` → the placeholder (§4) is emitted; T3 strips the value from
`__aihu_state__`. The crawler's HTML says `<span data-aihu-path="0.3.1"
data-aihu-withheld="member"></span>` where `0.4` used to be. A verified agent GET gets the
same withholding (hard, keyed on its verified principal). A human — anonymous or signed-in —
sees `0.4`, because it is the UI. Both axes now point the same direction, per principal.

### 3.3 The minimal unavoidable addition

Two things the existing vocabulary cannot say; both are added as **values on the existing
`$scope` axis**, not new directives:

1. **Reserved class-scope `@human`** — `$scope: '@human'`: emitted/invocable only for a
   verified human session; no agent credential qualifies, regardless of scopes. This is the
   honest spelling of "never-extractable even by verified agents." (Truly "never
   extractable" is unenforceable — a human's own tooling can read their screen; the
   enforceable statement is "never emitted to a request not bearing a verified human
   session," and that is what this means.) Enforced at **both** T1 (runGate 403s any
   agent-class principal) and T2 — one declaration, both gates, by construction.
2. **Reserved class-scope `@verified`** — any verified principal (human or agent), no
   specific grant. The "logged-in only" posture without inventing a business scope.

Reserved names are prefixed `@` so they cannot collide with site-issued scopes; the compiler
validates them at parse (`agent_macros.rs:37` already validates `$scope` shape; W-diagnostic
for unknown `@…` names). Explicitly rejected alternatives: a new `$extract:` directive
(second vocabulary for the same intent = drift surface between `$extract` and `$scope`);
`noindex`/`data-nosnippet` authoring (advisory, crawler-honored, not server-enforced — the
robots problem restated); per-element ACL syntax in templates (policy scattered into markup
instead of declared next to the capability it governs).

---

## 4. The redaction mechanism and hydration parity (the crux)

### 4.1 Why naive withholding is catastrophic, precisely

The hydration contract: paths are positional (`parent.childIndex`), the server stamps
`data-aihu-path` during its walk (`ssr.ts:260`), the client builds a path→element map and
walks its own full tree (`arbor/src/hydrate.ts:279-286`). A path miss is treated as DOM
mismatch and falls back to `_materialize`, which **builds a second copy of the subtree
beside the server's DOM** (`hydrate.ts:186-197`; the root-path comment at `:44-46` spells
out the failure: "Nothing throws; the user just sees duplicated content"). So if the gate
*removed* a withheld child from the tree before the walk, every following sibling would be
renumbered on the server but not on the client → all their lookups miss → the client
duplicates the rest of the page. Withholding by pruning is not an option.

### 4.2 The mechanism: in-place placeholder, path-preserving

**A withheld node is never omitted; it is emitted empty.** `_renderNode` (`ssr.ts:248`), on
`withhold`, emits the branch's open/close tags with its `data-aihu-path` and a
`data-aihu-withheld="<kind>"` marker, and **skips only its children** (and its governed
attrs/text). The node still occupies position `i` in the parent's child walk, so every
sibling path is byte-identical to the full render.

Three constraints this imposes (the honest cost of the design):

- **C-1: redaction granularity is the element subtree.** Only branch nodes carry attributes;
  only element boundaries can host the placeholder. Component-level (`$scope`) redaction
  gets this for free — components are custom elements. Member-level redaction requires the
  compiler wrap of §3.2.
- **C-2: a governed interpolation must never be a bare text leaf.** The text cursor claims
  "the next unclaimed text node" per host (`hydrate.ts:103-119`); a server-omitted text node
  would shift every later text sibling onto the wrong DOM node — silent content corruption,
  worse than duplication. The compiler wrap (§3.2) is therefore **mandatory**, not an
  optimization, and invariant I1 (§6) checks it.
- **C-3: partial redaction inside a branch still emits every withheld child as a
  placeholder** — `_materialize`'s fallback *appends* (`hydrate.ts:186-197`), so an omitted
  middle child rebuilt client-side would land at the end of its parent, reordering the DOM.
  Placeholder-in-place keeps rebuild position correct.

### 4.3 Why parity holds — case by case

- **The principal that will hydrate is the principal the server rendered for.** A human
  session gets the full emission; its client render is also full; server HTML == client
  first render, exactly as today. Parity is per-principal, and each principal's document is
  self-consistent. This is the core resolution: *there is no single "the HTML" anymore, and
  parity was only ever required between a document and the client that hydrates it.*
- **Crawlers don't hydrate.** The withheld variant goes to JS-less readers; no walker ever
  runs against it in the intended flow. (JS-executing scrapers: see next case + W2.)
- **Mismatched delivery** (a cache serves the anonymous variant to a signed-in human; a
  JS-executing agent hydrates the withheld variant): the walker finds the placeholder branch
  at its expected path (`hydrate.ts:186` — the pathMap hit succeeds), recurses to children,
  misses, and `_materialize` rebuilds them **inside the placeholder, in place** — because
  C-1/C-3 preserved the numbering, the fallback is localized and non-duplicating. What it
  rebuilds *with* is client-side data: for C2/C3 content that data comes only from
  authenticated loaders/tool calls, which the same gate refuses to the wrong principal — so
  an unauthenticated JS-executing reader materializes an empty governed subtree (correct),
  and a mis-cached human sees the content flash in after an authenticated fetch (degraded,
  not broken). The existing mismatch fallback, previously a bug-recovery path, becomes the
  designed self-heal for variant skew.
- **Caching is part of the mechanism, not an afterthought.** Responses containing any
  governed node carry `Vary: Authorization, Cookie, User-Agent` and
  `Cache-Control: private` for non-anonymous variants (the negotiation middleware already
  models the both-variants Vary discipline, `content-negotiation.ts:130-134`). Ungoverned
  routes (the common case) emit one variant and stay fully cacheable — §6 defaults.
- **SSG:** one variant (anonymous), so no variant skew exists on static hosting at all;
  humans get governed content via the self-heal path above by construction.

Net: **per-principal SSR withholding does not break light-DOM hydration parity, provided
redaction is element-granular, in-place, and path-preserving (C-1..C-3).** The residual
costs are the compiler wrap, the Vary surface on governed routes, and flash-in under cache
skew — stated, bounded, and testable (I4).

---

## 5. Composition with the DA4 light/shadow flip

Against `docs/plans/da4-flip/design-spec.md` (branch `design/da4-flip`):

- **The gate is what makes the flip safe to ship.** The charter's sequencing B exists
  because the flip removes the one emergent privacy lever (survey §0: "the only lever that
  incidentally protects content on axis (a) is being removed as a default"). Under this
  design the flip removes an *accident*, not a *control*: extractability is decided by the
  gate on the arbor tree **before serialization**, independent of whether the serialized
  output lands in light DOM. Pages flipping to light changes what the DA4 spec's §3 CSS
  pipeline does; it changes nothing about what T2 withholds.
- **Shadow-as-privacy becomes redundant as a control — deliberately — while shadow remains
  as encapsulation.** `$shadow` returns to meaning exactly what DA4 wants it to mean
  (encapsulation for leaves, DA4-spec §6 "leaf-only"), with zero extractability semantics.
  It was never a real privacy control anyway: it is client-enforced, absent from the SSR
  surface entirely (no DSD is emitted — survey row 17), and silent about the JS bundle. Any
  doc sentence implying "use shadow to hide content from crawlers" should be corrected to
  point at `$scope` when this lands.
- **One residual complementarity, stated precisely:** shadow leaves are simply *not in* SSR
  HTML (survey row 17: light-DOM only, `ssr.ts:248-267`), so a shadow leaf's content is
  incidentally absent from every crawler variant. That is a side effect of the renderer, not
  a guarantee — it does not govern the bundle, and DA4's own D1 makes layouts/pages light —
  so the design treats it as **no control at all** and never leans on it.
- **Mechanical interactions to flag to the DA4 implementer:** (1) the mixed-mode e2e
  (DA4-spec §5, assertion 1: "page text present in dist HTML") needs a governed-fixture
  variant where the assertion *inverts* — `$scope`'d subtree text **absent**, placeholder
  present — otherwise the flip's own gate would fight I3; (2) the layout shell prerender
  (`prerender.ts:269-303`) renders with the same pinned anonymous principal as pages —
  layouts can carry governed components too (D1 makes layouts light, hence SSR'd, hence
  inside the gate's jurisdiction).

---

## 6. Defaults and the invariant

### 6.1 Default posture per principal class (out of the box, zero declarations)

A freshly scaffolded app with no `expose:`, no `$scope`, no `@agent` components:

| Principal | Gets by default |
|---|---|
| anonymous crawler | **The full rendered page.** Everything is C0. SEO/dual-audience fundamentals are untouched — the thesis explicitly rules out breaking "server-rendered… crawlable content" as the documented answer, and DA4 exists to *increase* crawler-visible content. Extraction control is opt-in by declaration, never a default tax on public sites. |
| anonymous browser | Same full page. |
| verified agent | Same full page via GET; tool surface = whatever `expose:` grants (default: nothing — `emit.rs:3707`). |
| human session | Same full page. |

The moment an author writes `$scope` on a component, that subtree drops out of every
non-qualifying emission — **fail-closed at the same declaration site that already governs
its tool calls**, with no second thing to remember (the Derived test: "if a human has to
remember to update something… the property is violated").

### 6.2 The invariant — how the SSR path cannot silently un-gate

The load-bearing one is **I2**, modeled on `RATE_LIMIT_MISSING` (`agent-service.ts:315-325`
— "a declaration is a REQUEST FOR ENFORCEMENT; when the server cannot enforce it, the call
must be refused"):

- **I2 (runtime, fail-closed):** `renderToString`/`renderToStream` **refuse to render**
  (throw `GOVERNED_UNGATED`) when the walk encounters a node carrying `gov` meta and
  `opts.emission` was not supplied. A new render path added later — a custom adapter, a new
  prerenderer, the Rust native renderer before it implements the consult — cannot leak
  governed content by *forgetting* the gate; it can only fail loudly on the first governed
  component it meets. Ungoverned trees render exactly as today, so no existing caller
  breaks. This converts "every SSR call site is gated" from a review item into a property
  that cannot silently stop being true.
- **I1 (compile-time):** every `$scope`/`@agent` declaration produces `gov` meta and the C-2
  element wrap — compiler snapshot tests beside the existing expose-gate tests
  (`emit.rs:6947`).
- **I3 (behavioral CI, `check:governed` G4/G5):** extend `scripts/check-governed.ts` (the
  survey row-19 gate, today axis-(b)-only) with a real-`handle()` probe over a governed
  fixture: anonymous GET → withheld text absent from body **and** from `__aihu_state__` /
  `__aihu_loader__`, placeholder + `Vary` present; scoped GET → text present. Same
  stand-up-the-real-thing style as G1–G3.
- **I4 (parity CI):** extend `tests/integration/ssr-hydrate-path-parity.test.ts` /
  `scripts/check-hydration-adoption.ts` with the redacted fixture: hydrating the full client
  tree over the anonymous variant materializes **inside** the placeholder, sibling paths
  stable, zero duplicated content.

---

## 7. Weaknesses of this approach (honest)

- **W1 — the compliance-tier cell is soft, and it sits on the founder's core sentence.** The
  founder's framing is "control what is extractable." For content a signed-out *person* must
  see (C1 for anonymous browsers, all of C0), the hard truth is that a scraper wearing a
  browser UA extracts whatever a person sees; the crawler column of the C1 row is enforced
  robots, not cryptography. This design's answer — the hard boundary is verification
  (`$scope`), everything softer is honestly labeled — is defensible and thesis-aligned
  (never overclaim reach), but it means the sentence "we control scraping" is only fully
  true for content sites are willing to put behind a verified principal. If the founder
  wants hard control over *public-to-humans* content, that is a different weapon
  (rate-limiting by IP/fingerprint at the edge, proof-of-personhood walls) and mostly lives
  in control planes the framework cannot reach.
- **W2 — the client bundle leaks static template text.** SSR redaction governs rendered
  output, not `dist/assets/*.js`: a `$scope`'d component's *static* markup strings ship in
  the compiled chunk any JS-capable reader can fetch. Governed *values* are safe (they
  arrive only via gated loaders/tools), but authored copy inside governed components is
  bundle-readable. Closing this needs per-chunk gating (governed components split into
  chunks served through the gate) — real work, out of scope here, and until it lands the
  docs must say "governed protects state and server-rendered content, not compiled template
  text."
- **W3 — hydration parity is solved only under constraints C-1..C-3.** Element-granular
  only; a mandatory compiler wrap adds DOM nodes (one span per governed interpolation) and
  is exactly the kind of codegen the DA4 spec's G3 shows can rot (string-surgery fragility);
  cache skew produces content flash-in for humans. The `_materialize` self-heal is
  load-bearing for skew — a designed use of what is today a recovery path, and it needs I4
  to keep it honest.
- **W4 — per-principal emission taxes caching.** Governed routes carry
  `Vary: Authorization, Cookie, User-Agent` — effectively per-user at shared caches. Bounded
  (only routes containing governed nodes; ungoverned sites unaffected) but real for
  high-traffic governed pages. And CDN config remains an unreachable control plane: a CDN
  that ignores `Vary` can serve a human's variant to a crawler; the framework can emit
  correct headers and document the risk, not enforce it.
- **W5 — three renderers must agree.** `ssr.ts`, `renderToStream`'s async walker, and the
  Rust native renderer each implement the walk; T2 + the placeholder contract must be
  implemented in each (I2 makes the un-implemented ones refuse rather than leak, but
  refusal means governed components are unusable on that path until done).
- **W6 — loader-script redaction is coarse.** `__aihu_loader__` JSON (`router/server.ts:54`)
  is untyped; the gate cannot taint it member-wise, so T4 withholds the whole script for
  principals failing any governed node on the route — over-withholding that may degrade
  ungoverned parts of mixed pages for agents. Member-granular loader taint would need typed
  loaders; deferred.
- **W7 — inherited gaps get a wider blast radius.** `verifyJwt` checks signature only, not
  `exp`/`nbf` (survey row 5); today that bounds tool calls — under this design a leaked
  signed token also reads scoped SSR content forever. Fixing expiry moves from "should" to
  "prerequisite for T2 shipping."
- **W8 — SSG is single-variant.** Static output serves the anonymous emission to everyone;
  verified agents get no richer static variant (they self-heal client-side only if they run
  JS, which crawlers-by-design don't). Sites wanting per-principal service need a server —
  worth stating in docs as the honest cost of static hosting, not papering over.

---

## 8. Founder decisions this design needs

1. **Ratify the two-tier honesty (W1):** compliance-tier withholding for declared crawlers
   on C1, hard withholding only under verification. The alternative — no soft tier at all,
   gate only on verification — is simpler and never overclaims, but leaves the survey's
   sharpest conflict unresolved against exactly the compliant-crawler population that
   robots.txt already addresses. (This is the one that most needs the founder: it defines
   what "we control extraction" means in public.)
2. **Reserved class-scopes `@human` / `@verified`** as the only vocabulary addition (§3.3).
3. **W7 prerequisite:** `exp`/`nbf` verification lands before or with T2.
