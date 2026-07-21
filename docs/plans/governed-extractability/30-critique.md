# Governed Extractability — adversarial critique of designs A and B

**Effort:** `governed-extractability` · **Track:** `da4-govern` · **Branch:** `design/govern-critique`
**Status:** critique (no design, no implementation). Every claim below was re-verified against this
worktree's code, not against the designs' own citations. Where a design's citation was checked and
found accurate, it is not re-litigated; where the code says something the design does not, that is
the finding. Verified 2026-07-20.

**Verification note.** I spot-checked the load-bearing citations of both designs: `hydrate.ts`
(:44-46, :92-100, :103-119, :136-146, :186-197, :276, :279-286), `ssr.ts` (:248-271, :305-405,
:407-425, :485), `router/src/server.ts` (:28-64), `agent-service.ts` (:129-336, :373-383),
`auth/src/server.ts` (:125-147, :166), `auth/src/verified-plugin.ts` (:45-58),
`content-negotiation.ts` (:23, :92-101, :130-141), `emit.rs` (:267-287, :3285-3291, :3695-3760,
:3947-3949, :6947), `state_macros.rs` (:273-299), `sfc.rs` (parse_route_body), `types.rs` (:14-24),
`prerender.ts` (:200-218, :380-400), `define-element.ts` (:20-90), `materialize.ts`,
`rate-limiter.ts` (:86-95), `robots.ts`, `markdown-resolver.ts` (:110-127),
`check-governed.ts`, `check-dual-audience.ts` (:403-409, :501-507), `thesis.md`, and the DA4 flip
spec (`origin/design/da4-flip:docs/plans/da4-flip/design-spec.md`). **Both architects' file:line
references are accurate.** The defects below are not citation errors — they are places where the
cited code, read further, does not support the design built on it.

---

## 0. Ground-truth corrections both designs inherit

Three facts about the current code that the survey states softly or not at all, and that change
the severity ranking of everything downstream.

### 0.1 The SSR channel both designs gate barely exists for compiled components today

- A compiled `.aihu` route module **exports no default renderable** — it registers a custom
  element as an import side-effect (`packages/app/src/prerender.ts:203-208` says exactly this;
  `grep "export default" packages/compiler/src/codegen/emit.rs` → zero component-default
  emissions). `createServerRouter.handle` reads `mod.default` (`packages/router/src/server.ts:40`)
  and `resolveComponent` returns `null` for such modules (`prerender.ts:210-218`) — the page is
  skipped with a warning. Live SSR of a compiled page is not a working path yet.
- **Nested component internals are never in SSR HTML.** The render walk
  (`packages/server/src/ssr.ts:248-271`) serializes the tree the factory returns; a child
  component appears as a bare `<x-child>` branch tag whose internals are built client-side by
  `connectedCallback` → `_build()` → `_mount` (`packages/runtime/src/define-component.ts:250-280`).
  An `@agent` component nested in a page contributes at most an empty custom-element tag to the
  crawler's HTML.
- **Structural nodes (`$if`/`$each`) render zero SSR bytes.** `_renderNode` handles only
  `kind === 'leaf'` and `kind === 'branch'`; `kind === 'structural'` falls through to
  `return ''` (`ssr.ts:270`, and `:403-404` in the async walker). The client always
  `_materialize`s structural subtrees fresh (`hydrate.ts:92-100`).

**Consequence:** the survey's "sharpest conflict" — *the unexposed member's rendered `0.4` ships
in SSR HTML to every crawler* — is reproducible today only for hand-authored factory routes or
`toHtml()` providers, not for the compiled `@agent` components where `expose:` actually lives.
The channel that leaks governed content **today** is the **client JS bundle plus the client-side
render**, not SSR. Both designs gate the channel that will matter post-flip (correct per
sequencing B), but both under-rank the channel that matters now: B files it as W2 ("static
template text", understated — see §1.1); A never mentions the bundle at all (see §3.6).

### 0.2 The hydration rail B builds on is dormant in the default pipeline

- `hydrate()` runs only when the element was defined with `hydrate: true` **and**
  `globalThis.__aihu_state__[tag]` has a snapshot (`packages/runtime/src/define-element.ts:44-56`,
  opt-in flag at `:84`). Otherwise `connectedCallback` falls through to a full client
  `_build`+`_mount`.
- The live SSR handler **never emits `__aihu_state__`** — `handle()` passes no `serializer`
  (`router/src/server.ts:50`), and `emitStateScriptAndClose` only emits the script when one is
  supplied (`ssr.ts:411-420`).
- Inside `hydrate()`, the snapshot is **discarded** — `void snapshot`, pre-seeding deferred
  (`hydrate.ts:276`).
- The state-script contract is split-brained: the emitter writes one global path-keyed JSON
  (`ssr.ts:414-416`), the consumer reads a per-tag record `__aihu_state__[name]`
  (`define-element.ts:46-49`). The two ends do not currently line up.

**Consequence:** every parity argument in B §4.3 reasons about a code path (`_hydrateNode`'s
pathMap adoption) that no default-pipeline request currently reaches. The mechanism is real and
testable, but B's T3 ("filter the serialized record") and the self-heal story are claims about
machinery that must first be *made* to work end-to-end. This does not falsify B; it means B's
"the existing mismatch fallback becomes the designed self-heal" quietly promotes a dormant,
contract-mismatched rail to load-bearing without listing that promotion as work.

### 0.3 The verified tier's floor is lower than either design's prose

- `verifyJwt` checks signature **only**. No `exp`, no `nbf`, no `aud` — and its own docstring
  falsely claims "expired" tokens fail (`packages/auth/src/server.ts:117-118` vs `:125-147`,
  where no claim beyond `sub` is ever read). A leaked signed token is valid forever, on every
  gate, for both designs. B lists this as prerequisite W7; **A never mentions it** although its
  `agents`/`gated` markdown channel rides the same primitive (§2.2 of A).
- One symmetric HMAC secret signs everything; there is no token-type/`aud` separation today, so
  any site-issued session JWT is also a valid agent credential at any gate that only checks
  signature + `sub` — B's `typ: 'agent'` claim (§1.4) is proposed, not existing.
- The rate limiter fails **open** at `maxKeys` (`packages/scraping/src/rate-limiter.ts:88-94`)
  and is per-process — under key-pressure or horizontal scale, the budget on the verified tier
  is advisory.

---

## 1. Attack 1 — B's hydration-parity redaction (the crux)

**Verdict: BOUNDED — the path-preservation mechanism itself holds, but the design's "hard
withhold" is defeated for any value present in the client bundle, which includes B's own worked
example.**

### What was attacked and held

- **Placeholder adoption.** An empty element carrying `data-aihu-path` lands in the pathMap
  (`hydrate.ts:279-286` — `querySelectorAll('[data-aihu-path]')`), the branch lookup at
  `hydrate.ts:186` succeeds, recursion proceeds into the placeholder, child branch lookups miss,
  and `_materialize` appends **inside the placeholder** (`hydrate.ts:188-196` passes the found
  element as `host`; `materialize.ts:185` appends to `host`). Sibling paths are tree-positional
  (array index, `hydrate.ts:220-231`; `ssr.ts:263-265`), not DOM-positional, so an empty
  placeholder renumbers nothing. B's C-1/C-3 reasoning is correct as stated.
- **C-2 (mandatory wrap for governed text) is correct and genuinely mandatory.** The text cursor
  claims "next unclaimed text node" per host (`hydrate.ts:103-119`). A server-omitted bare text
  interpolation emits zero bytes → no DOM text node → every later text sibling in that host binds
  one node early → silent cross-wired content, worse than duplication. If an author's governed
  interpolation escapes the wrap (I1 failure), the failure mode is silent corruption for the
  *entitled* audience. The wrap is exactly the kind of codegen string-surgery the DA4 spec's G3
  and the whitespace-trim landmines show can rot; I1 must be a should-fail compile fixture, not a
  review item.

### Defect B-1 (CRITICAL): the client runtime un-redacts the redaction

`_hydrateNode` recursing into the placeholder calls `_materialize` for every missing child —
**unconditionally, for every principal**. `_materialize` builds the subtree from the client
component tree (`component()`, `hydrate.ts:296`) with whatever values the client-side signals
hold. For B's own worked example (§3.2: `state: { margin: 0.4 }`, no `expose:`), **`0.4` is a
literal in the compiled chunk** — the client factory initializes the signal to it, and the
"hard-withheld" verified-agent GET followed by running the page's own JS re-renders `0.4` into
the placeholder. The same applies to every `$scope`'d (C2) subtree whose initial state is
authored literals rather than gated-loader results.

B's W2 concedes "static markup strings" leak via the bundle but asserts "Governed *values* are
safe (they arrive only via gated loaders/tools)" — **that sentence is false for any value whose
initial state is compiled in**, which is B's own illustrative case. The honest statement is:

> T2 withholding is hard **only for server-sourced data** (loader results, per-request state,
> tool-call results). For bundle-resident structure and initial values, the placeholder is
> compliance-tier against *every* JS-executing reader — including verified agents — because the
> framework's own hydration self-heal reconstructs it client-side.

Fix shape (must be in synthesis): the client walker needs to honor `data-aihu-withheld` — i.e.
**do not materialize into a withheld placeholder unless the client can obtain the data through a
gated channel** — plus B's deferred per-chunk gating. Without the client-side guard, B's emission
table's four "withhold (hard)" cells are wrong for a JS-executing reader in exactly the rows that
carry the founder's requirement.

### Defect B-2 (HIGH): the self-heal silently loses static content for the entitled audience

B §4.3 makes cache skew ("a cache serves the anonymous variant to a signed-in human") a designed,
self-healing state: "content flash[es] in after an authenticated fetch (degraded, not broken)."
The walker says otherwise:

- A **static text leaf** with no matching DOM node is skipped, not materialized —
  `hydrate.ts:144-146`: "Static text leaf — SSR already rendered it; nothing to wire." Inside a
  served-withheld placeholder that a legitimately entitled human hydrates, every static text
  child is **permanently absent**. Nothing throws.
- **Static attrs** are likewise never restored — hydration wires only reactive attrs
  (`hydrate.ts:160-162`, `:204-214`); the placeholder was emitted with its governed attrs
  stripped, and no client path re-applies static ones.

So under the exact skew scenario B designs for, the entitled user gets a subtree missing all
authored copy and static attributes — silent partial content loss, not "degraded flash-in." This
is fatal to the *claim*, not the design: the fix is either "materialize the whole placeholder
subtree when entitled data arrives" (throw away the per-leaf walk inside placeholders) or extend
the walker to materialize static leaves on miss. Either is real walker work B does not scope, and
I4 as specified (paths stable, zero duplication) would pass while this content loss occurs — the
invariant must also assert **content completeness for the entitled principal over the withheld
variant**.

### Defect B-3 (HIGH, inherited): the streaming renderer B taps is broken for interior async boundaries

`renderNodeAsync` on a pending DataSource enqueues the open tag, registers `onReady`, and
**returns — the walk continues to the next sibling and enqueues its bytes**; when the data
resolves, the boundary's children and its close tag are enqueued at wherever the stream now is
(`ssr.ts:375-400`). Any async boundary that is not the last content in the document produces
interleaved, mis-nested HTML. B lists T2 taps at `:305` without noticing the tap target emits
malformed output in the general case. Bounded for B (a withheld pending boundary can skip
`onReady` entirely and close immediately — withholding actually *simplifies* streaming), but the
placeholder contract "byte-identical sibling paths" cannot be honestly claimed on `renderToStream`
until this pre-existing defect is fixed or streaming of governed trees is refused under I2.

### Defect B-4 (MEDIUM): withheld structural boundaries are outside the mechanism entirely

A `$if`/`$each` region emits no SSR bytes (§0.3 above) and is always client-materialized. So for
a governed structural region there is nothing for T2 to withhold and nothing for the placeholder
to preserve — enforcement collapses entirely onto the (nonexistent) client-side guard and the
gated-loader path of B-1. B never distinguishes structural from element subtrees; C-1's "only
element boundaries can host the placeholder" is stated but its corollary — *structural regions
are ungovernable by T2* — is not. Same class as B-1; listed separately because I3's fixtures must
include a governed `$each` whose data is bundle-resident to catch it.

### Also noted (LOW)

- **`unknown-bot` is unreachable.** `Principal.uaClass` includes `'unknown-bot'` but
  `resolvePrincipal` step 3 classifies only via `isAiCrawlerUserAgent` (binary). The emission
  table has a column no resolution rule produces. Underspecification, not a hole.
- **Cloaking exposure is real but narrow.** C1-row withholding keys on self-declared AI-crawler
  UAs; Googlebot proper is not in `AI_BOT_LIST` (`robots.ts:33-107` — only `Google-Extended` /
  `Googlebot-Extended`), so classic SEO cloaking penalties are not triggered. But OAI-SearchBot
  *is* listed and is a **user-fetcher** (`robots.ts` fetcher tier): B's C1 row withholds from a
  bot the robots default deliberately *allows*, so cited-search answers will show gaps where the
  page shows values. B's gate and #430's tier policy disagree about the fetcher population —
  composition seam, needs one table, not two.

---

## 2. Attack 2 — the honesty tiering, pressure-tested

**Verdict: the tiering is honest in B, half-honest in A, and the founder needs the ceiling
stated without the lattice vocabulary softening it.**

### The ceiling, plainly

**Anything an anonymous human can see, an anonymous scraper can extract, and the framework
cannot change that.** The request classification is built from attacker-chosen bytes
(`Accept`, `User-Agent`, `Authorization` — `content-negotiation.ts:92-101`; B §1.4 step 3;
A §3.1). Every "withhold from anonymous machines, serve anonymous humans" cell in either design
is enforcement of *etiquette*: it binds the population that already self-identifies (the same
population that already honors robots.txt), and adds real enforcement only against the sliver
that declares an AI UA while ignoring robots. A scraper that presents `Accept: text/html` +
a Chrome UA receives, by both designs' explicit intent, exactly what a person receives — A gives
it the sealed document whose bytes contain the content (A §7.1 concedes DSD is byte-visible);
B gives it the full C1 emission (B §2's "deliberately uncomfortable cell").

The non-HTML channels do not raise the ceiling: DSD sealing and `ssr:false` stop only readers
that don't execute or don't parse raw bytes; the client bundle carries governed components'
markup and literal initial state (§1 B-1) to any reader with `curl`; `robots.txt` is advisory
(`robots.ts:13-15`); discovery artifacts advertise rather than gate (survey rows 12-16).

**Therefore: against anonymous scrapers, aihu with either design is robots.txt-with-teeth for
declared crawlers, plus not-rendering — and nothing more.** The founder's sentence — "control
what is extractable" — is fully true **only for content behind a verified principal** (`$scope`
in B; `gated` machine-reps in A), plus the degenerate hard control of never shipping the content
to anonymous audiences at all (auth-walling the page — which both designs put out of scope).
`ssr:false` is **not** a hard control (see A-6, §3.6). If the founder wants hard control over
content that anonymous humans can see, the honest answer is: that is edge/IP/fingerprint/PoW
territory, in control planes the framework does not own — precisely the thesis's "config that
claims to control what it cannot reach" anti-pattern if aihu pretended otherwise.

### And the verified tier's own ceiling

The "hard" tier is as strong as the credential, which today means (§0.3): no expiry — a
once-leaked token reads gated content indefinitely; a bearer replayed on a page GET is
indistinguishable from its owner (B designs this reuse in deliberately, §1.4 — right call for
UX, but it widens a stolen token from "can call tools" to "can read every scoped page");
symmetric single-secret signing with no audience separation. B makes `exp`/`nbf` a shipping
prerequisite (W7 — correct); **the synthesis must also add `aud`/type separation and treat
token-revocation story as part of the control, or "hard" is "hard until the first leak, then
permanent".** A is silent on all of this — a real omission for a design whose `gated` level's
only enforced channel rides that token.

---

## 3. Attack 3 — A's lattice and compile-error model

**Verdict: the declared-intent/derivation frame is the strongest idea in either document, but
the lattice as specified overclaims on the HTML channel, has no hydration story, forbids a
legitimate pattern, and cannot express the distinction the founder actually cares about.**

### A-1 (CRITICAL): the middle levels do not gate the primary surface — the table overclaims

Read A §2.1's rows against its own §0 scoping: for `agents`, `gated`, and `never` (with
`ssr:true`), the anonymous HTML response contains the **full content**, wrapped in
`<template shadowrootmode>` + noindex headers. The lattice column "who may machine-extract:
verified principal / with scope / no one" is true only of the *negotiated* channels (markdown,
tool reads). On the channel with the traffic — the HTML — `gated` content is delivered to every
anonymous requester in the bytes, guarded by parser politeness. A concedes this in §7.1, but the
concession does not reach the table, the lattice names, or §8's framing. A level named `gated`
whose bytes ship to everyone is the thesis's own named failure ("config that claims to control
what it cannot reach… fails silently") wearing a type system. B's C2 handling — **withhold the
bytes** — is strictly stronger on the same content, and the two designs' difference here is not
emphasis but bytes-on-the-wire (§4.1).

### A-2 (CRITICAL): sealed-DSD serialization has no hydration story, and the default one breaks

A's §2.3 makes DSD emission the enforcement mechanism for every non-public surface, and §7.3
admits render-time threading is the biggest implementation surface — but nowhere does A analyze
what the *client* does with a sealed subtree. The current walker gives the answer: a
DSD-parsed template's content either stays inert or is auto-attached as a shadow root; either
way its nodes are invisible to `querySelectorAll('[data-aihu-path]')` on the light tree
(`hydrate.ts:279-286`). Every path inside the sealed subtree misses; `_materialize` rebuilds the
whole subtree **beside** the shadow copy in light DOM (`hydrate.ts:188-196`) — for the human the
content was rendered *for*, producing exactly the duplicated-content failure the root-path
comment warns about (`hydrate.ts:44-46`), or a double render (shadow copy + light copy). B spent
its §4 on precisely this problem; A does not contain the word "hydration" in a load-bearing
sentence. This is not fatal to the *idea* (a DSD-aware client walker is designable) but it is a
missing chapter, and it lands in the same walker code B's constraints C-1..C-3 already touch —
the synthesis cannot adopt A's sealed serialization without adopting B-grade parity analysis
for it.

### A-3 (HIGH): C481 forbids "act but never read" — a legitimate, thesis-blessed pattern

A §4 R2: any `expose:` on a `never` surface is compile error C481, argued from row 10's
"'extract nothing' ∧ 'agents may read' — contradiction." But `expose:` also covers **actions**
(`emit.rs:3712-3737`), and "this page's *content* is never machine-extractable, but an agent may
invoke this *capability*" is not a contradiction — it is the thesis's own property 1, consequence
1 ("some capabilities are agent-only… the author decides what belongs on the agent axis").
Concretely: a human-only dashboard (`extract: 'never'`) exposing a `book-slot` or
`export-my-own-data` action; a paywalled article page exposing a `purchase` action to shopping
agents. A's own §0 scoping ("extractability governs the machine axis's *representation*")
supports the distinction — an action invocation is not a representation of the surface. C481
must be narrowed to `expose: { read: true }`; as written it forces authors to lower a `never`
surface to `gated` (leaking existence into discovery, §3.5) just to keep one action, which is
the lattice pushing intent in the wrong direction.

### A-4 (HIGH): the total order collapses the one distinction the founder's problem is made of

The founder's concern is AI-extraction. The web posture nearly every real site wants — and the
one aihu itself shipped as the #430 **default** (`robots.ts:174` `'allow-agents'`: user-fetchers
`Allow`, training crawlers `Disallow`, wildcard `Allow`) — is *crawlable-by-search /
answerable-by-user-agents / not-extractable-for-training*. That posture is **incomparable** with
the lattice's chain: it is more open than `agents` (anonymous Googlebot and OAI-SearchBot get
content) and less open than `public` (Bytespider/CCBot must not). A §7.5 concedes the case and
relegates it to advisory robots. So under A, the *enforced* model can express "public" and
"verified-only" but the framework's own default *advisory* posture — and the founder's actual
target — lives outside the enforced model entirely. The order isn't wrong; it is answering a
different axis (verification strength) than the founder's question (extraction purpose). The
synthesis needs either B-style UA-tier rows (honestly compliance-grade) attached to A-style
declarations, or an explicit founder ratification that purpose-tiering remains advisory-only.

### A-5 (MEDIUM): `never`'s existence-hiding contradicts its own robots derivation

§2.1/§3.5: `never` surfaces are "absent from every artifact," refusals are 404-shaped so
existence is never confirmed (matching `agent-service.ts:141-145`) — and robots.txt "gains…
per-route `Disallow: <path>` lines… for every non-public route." A public, unauthenticated
`robots.txt` enumerating the paths of `never` routes *is* existence confirmation, in the one
file every scraper reads first. One of the two derivations must yield: either `never` routes are
excluded from robots derivation (leaving them crawlable-in-etiquette-terms but sealed), or the
404-shaping claim is dropped. As specified, DA-f3 ("discovery contains no `never` surface") and
§3.5's robots rule cannot both pass.

### A-6 (MEDIUM): `never + ssr:false` is oversold as "the strongest withholding"

§3.3: "no server bytes at all… the strongest withholding the open web permits short of human
authentication." False as stated: no *HTML* bytes. The content still renders client-side, which
means its markup, logic, and literal initial data ship in `dist/assets/*.js` to any anonymous
`curl` (§0.1, §1 B-1), or arrive via an API the design never gates. `ssr:false` removes the
content from *non-executing* readers only — the same tier DSD sealing already achieves — while
costing JS-required rendering for humans. A design whose hardest level is byte-equivalent to its
middle levels, and says otherwise, will misinform exactly the author reaching for `never`.

### A-7 (LOW): compile-time contradiction model — attacked and largely held

C480 ($shadow:'none' on non-public) and C482 (gated without scope) are sound; the
most-restrictive-meet (R1) is well-defined because the order is total; the three-artifact
fan-out claim matches the code (`emit.rs:267-287` — marker, route_json, agent meta); DA-f2's
derived-artifact-agreement check is the right invariant shape. The default-`public` +
scaffold-explicit + census posture (§5.1) survives attack (see §5). The compile-error posture is
the part of A the synthesis should keep wholesale — **with C481 narrowed per A-3.**

---

## 4. Attack 4 — composition and contradiction between A and B

### 4.1 The real contradiction: does governing content gate *people* or only *machines*?

- A §0: "extractability governs the machine axis only. Humans always receive the authored
  experience" — a `gated` route's content is served (sealed) to **anonymous browsers**.
- B §2: a `$scope`'d subtree is withheld from **anonymous browsers** — "withhold (hard)" in the
  `anonymous · browser` column of the C2 row.

Same authored intent ("this needs scope X"), opposite bytes to the same requester. This is not
an emphasis difference; it is the load-bearing semantic of the whole design, and it decides
whether the control is real (B: the bytes don't go out) or ceremonial on the main channel
(A: they do, wrapped). It is also the fork with the UX cost: B's semantic means scoped content
is invisible to signed-out humans (correct for actually-sensitive data; surprising for
"agent-governed but publicly viewable" widgets); A's semantic preserves the public page but
reduces the middle of its lattice to etiquette (A-1). **This is founder decision #1 (§7).**

### 4.2 `$shadow`'s post-design meaning: the designs disagree

- A §2.3: `$shadow` is bounded below by the level floor; `$shadow:'none'` on a non-public
  surface is compile error C480 — shadow *retains* extraction-coupled semantics, and DSD sealing
  is A's enforcement serialization.
- B §5: `$shadow` has "**zero** extractability semantics"; DSD absence-from-crawlers is "a side
  effect of the renderer, not a guarantee… the design treats it as **no control at all** and
  never leans on it."

Both claim shadow-as-privacy becomes redundant, but A rebuilds the coupling one level up (the
floor forces sealed serialization) while B severs it. B is right on the merits: the thesis's own
DA4 entry says spec-compliant extractors read DSD subtrees as empty — a statement about
*compliant* extractors, i.e. compliance-tier, and A's §7.1 admits the bytes are visible. A
compile error (C480) that forbids `$shadow:'none'` in order to protect a serialization that
doesn't withhold bytes is ceremony enforced at build time. If the synthesis adopts byte-level
withholding (B) as the enforcement, C480 loses its reason to exist and `$shadow` returns cleanly
to encapsulation — which is also what the DA4 flip spec wants (`leaf-only` semantics).

### 4.3 Vocabulary: `extract:` levels vs `$scope` values — both are half right

A rejects overloading `expose:`/`$scope` (drift between granularities); B rejects a new
`$extract` axis (drift between vocabularies). The code adjudicates: B **cannot express
route-level intent at all** — there is no B declaration for "this whole page is not for
anonymous machines" short of `$scope`-ing the page component, which (per B's own C2 semantics)
also blanks it for anonymous humans. A's route-level `extract:` key in the `@route` block
(`sfc.rs` parse_route_body; `RouteBlock` `types.rs:14-24`; route_json fan-out verified) is the
natural authored surface B lacks. Conversely A's enforcement (DSD + channel refusal) is weaker
than B's principal-keyed byte withholding. **Take A's declaration and derivation spine; take B's
`resolvePrincipal` + emission-decision enforcement; map A's levels onto B's principal classes**
(`public` → emit-to-all; `agents` → withhold-from-anonymous-machine-reps + B-style per-principal
page handling; `gated` → C2; `never` → C3/`@human`). B's `@human`/`@verified` reserved scopes
slot in as the principal-side vocabulary for A's `gated`-and-beyond levels.

### 4.4 Thesis and landed-work composition

- **Tier-0 Attributed:** B's `resolvePrincipal` gives every SSR request an identity context —
  it advances the thesis invariant ("no transport reaches an invoker without a RequestContext")
  onto the render path. A resolves a principal only for machine-rep requests; its HTML path
  stays principal-less. Point to B.
- **Governed anti-overclaim:** B labels every soft cell compliance-tier (§1.4, §2, W1) —
  compliant. A's middle levels overclaim on HTML (A-1) — non-compliant as written.
- **Derived:** both derive from declarations; both pass. A's three-artifact DA-f2 agreement
  check is the stronger derived-integrity invariant and should be kept.
- **#420 verified principal:** both reuse `verify` correctly (single primitive,
  `verified-plugin.ts:53` → `server.ts:125`); both inherit §0.3's expiry hole; only B flags it.
- **#430 tiered robots:** B reuses `AI_BOT_LIST` as the single bot source (right), but its C1
  row withholds from user-fetcher bots that #430 deliberately allows (§1, LOW note) — needs one
  reconciled table. A appends per-route Disallows that break `never`'s own secrecy (A-5).
- **Content-negotiation superset:** both designs close the "agents get a superset"
  hole at the same place (`markdown-resolver.ts:110-127`) — A by level, B by principal.
  Equivalent; B's per-principal filtering is the more precise cut.
- **DA4 flip:** B composes without touching the flip (gate runs pre-serialization); A rewrites
  the flip's default-marker rule to be level-aware (`emit.rs:3285-3291`) — a coupling that means
  the flip cannot land until `extract:` parses, which A admits. Sequencing-B is satisfied either
  way; B's shape leaves the flip spec intact.

---

## 5. Attack 5 — the default posture

**Verdict: A's `public` default survives the attack; the founder's sentence does not require —
and his own ratified decisions forbid — a closed default. The genuine open question is the
middle tier, not the default.**

The case for closed-by-default collapses on three of the founder's own artifacts: the thesis's
Dual-audience property (agents are first-class; a framework hiding content from machines by
default contradicts §1), the ratified DA4 decision ("primary content must reach [crawlers] as
server-rendered light DOM" — `thesis.md` §Ratified sub-decisions), and the #430 default
(`allow-agents`, not `disallow`). A closed default would also protect almost nothing real: §2's
ceiling means anonymous-facing content is extractable regardless of posture, so `agents`-default
would tax every public site's SEO to buy compliance-tier withholding. The founder's verbatim
complaint is about *control existing*, not about the default: "if we **can't control** the data
flow… normal web framework." A's two guards (scaffold writes `extract: 'public'` explicitly;
per-level census in every build log) convert the default from silent to declared — that is the
correct answer to the complaint, and B's zero-declaration default table agrees cell-for-cell.

What the default debate is actually hiding (and the synthesis must surface instead): **is the
scaffold's default posture `public`, or `public`-with-the-#430-tier enforced at emission** (B's
C1-style UA withholding promoted to a route-level default)? That choice is where "crawlable by
search, not extractable for AI training" either stays a robots suggestion or becomes
enforced-for-declared-crawlers. It has a real cost (per-UA response variance on every route —
`Vary` cache tax, W4) and a real ceiling (spoofers, §2). It is a founder call, not an
architect call.

---

## 6. Confirmed-defect summary

| # | Design | Severity | Defect | Anchor |
|---|--------|----------|--------|--------|
| B-1 | B | **Critical** | Hydration self-heal re-materializes withheld subtrees from bundle-resident values for every principal; "hard" withhold holds only for server-sourced data; B's own worked example (`margin: 0.4`) defeats it | `hydrate.ts:186-196`, `materialize.ts:96-186`, B §3.2/§4.3/W2 |
| A-1 | A | **Critical** | `agents`/`gated`/`never`+ssr levels ship full content bytes to anonymous requesters (DSD-wrapped); lattice/table claim enforcement the HTML channel doesn't have | A §2.1 vs §7.1; thesis §rules-out |
| A-2 | A | **Critical** | Sealed-DSD serialization has no hydration analysis; current walker duplicates/misses sealed subtrees for the entitled human | `hydrate.ts:279-286`, `:44-46` |
| B-2 | B | High | Cache-skew "self-heal" silently loses static text/attrs for entitled principals; I4 as specified would not catch it | `hydrate.ts:144-146`, `:160-162` |
| B-3 | B | High | `renderToStream` interleaves mis-nested HTML for interior async boundaries; T2's streaming tap inherits a broken renderer | `ssr.ts:375-400` |
| A-3 | A | High | C481 forbids `never` + exposed **actions** — a thesis-blessed pattern ("act but never read") | A §4 R2; thesis prop 1 |
| A-4 | A | High | Total order cannot express search-yes/AI-no — the #430 default and the founder's actual concern | `robots.ts:174`; A §7.5 |
| B-4 | B | Medium | Structural (`$if`/`$each`) regions emit no SSR bytes and always client-materialize — ungovernable by T2 | `ssr.ts:270`, `hydrate.ts:92-100` |
| A-5 | A | Medium | robots per-route `Disallow` publishes `never` routes' existence, contradicting 404-shaping and DA-f3 | A §2.1/§3.5 |
| A-6 | A | Medium | `never+ssr:false` called "strongest withholding" while content ships in JS chunks / ungated APIs | A §3.3; §0.1 here |
| B-5 | B | Medium | Parity story rests on a dormant rail: hydrate opt-in + absent `__aihu_state__` emission + global-vs-per-tag contract mismatch + voided snapshot | §0.2 anchors |
| A-7 | A | Medium | No mention of `exp`/`nbf`/`aud` although `gated` channels ride the same token; B lists it (W7), A doesn't | `auth/src/server.ts:125-147` |
| B-6 | B | Low | `unknown-bot` principal class has no resolution rule; C1 withholding hits user-fetcher bots #430 allows (OAI-SearchBot) | B §1.1/§2; `robots.ts` tiers |
| — | both | Low | Both designs' rate/quota "budget" on the verified tier fails open at `maxKeys` and is per-process | `rate-limiter.ts:88-94` |

**Single worst defect across both: B-1** — because it is the one that quietly falsifies the
founder-facing promise ("hard withholding under verification") using the framework's own runtime,
and because A has no equivalent mechanism at all (A never reaches per-principal byte withholding,
so it cannot even fail this way). A-1/A-2 are equally severe within A, but they mark A's
enforcement as not-yet-designed rather than designed-and-self-defeating.

---

## 7. Reconciliation — what the synthesis should take from each

**From A (keep):** the single declared `extract:` intent with route-level authoring position and
compiler fan-out; derivation into discovery/robots/negotiation; compile-time contradiction
errors (C480 dropped per §4.2, C481 narrowed to reads, C482 kept, C483 kept); most-restrictive
meet; default-`public` + scaffold-explicit + census; DA-f2 three-artifact agreement; fail-closed
router↔auth seam with G4b.

**From B (keep):** `resolvePrincipal` as the one principal source for tools *and* render;
per-principal **byte withholding** (not sealing) as the enforcement for non-public levels;
placeholder path-preservation C-1..C-3 *plus* a new client-side withheld-placeholder guard
(B-1) and entitled-rematerialization completeness (B-2); I2's refuse-ungated-render invariant;
`@human`/`@verified` reserved scopes; honesty labeling of every compliance-tier cell; W7
(`exp`/`nbf`) escalated to prerequisite with `aud`/type separation added.

**Neither design has:** the client bundle/chunk gate (the actual current leak channel, §0.1) —
the synthesis must either scope per-chunk gating in, or the shipped docs must carry B's W2
sentence corrected per B-1 ("governed protects **server-sourced** state and server-rendered
content — not compiled templates, not literal initial values, not client-computed values").

## 8. Founder decisions the synthesis must surface (ranked)

1. **Does declared governance gate people or only machines?** A serves `gated` content to
   anonymous humans (sealed); B withholds it from everyone unqualified. This single choice
   decides whether the control is bytes or etiquette on the primary channel, and what signed-out
   humans see. (§4.1. Recommendation implicit in the defect list: B's semantic, with A's
   `agents` level available for the humans-yes/machines-no middle.)
2. **Ratify the ceiling in writing:** hard control exists only behind a verified principal (and
   only for server-sourced data until chunk gating exists); anonymous-scraper control is
   compliance-tier — robots-with-teeth — no matter which design ships. The thesis amendment
   should carry this sentence so "we control extraction" is never marketed above it. (§2.)
3. **The middle tier:** is search-yes/AI-no (the #430 default posture) enforced at emission for
   declared crawler UAs (cloaking-adjacent, Vary tax, spoofable) or advisory-only forever? The
   lattice cannot hold it; the principal gate can only compliance-tier it. (§3 A-4, §5.)
4. **Prerequisites before any "governed extraction" ships:** `exp`/`nbf`/`aud` verification;
   the client-side withheld-placeholder guard (B-1); entitled-completeness invariant (B-2);
   streaming either fixed or refused for governed trees (B-3). These are not enhancements — each
   one open converts a "hard" cell to soft.
5. **Existence advertising:** are `gated` surfaces listed in discovery with auth annotations
   (A §3.5's default), and are `never`/non-public routes named in robots at all (A-5)? Needs a
   per-surface override or a global rule; today's A contradicts itself and B is silent.
