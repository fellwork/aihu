# Governed Extractability — unified design spec (synthesis)

**Effort:** `governed-extractability` · **Track:** `da4-govern` · **Branch:** `design/govern-synth`
**Status:** design synthesis — no implementation. Reconciles `20-design-A-declared-intent.md`,
`21-design-B-unified-gate.md`, and `30-critique.md` under the founder-ratified constraints
(D1–D3 below). Paired doc: `41-thesis-amendment-proposal.md` (the thesis-amendment text, for
founder ratification — the thesis itself is base-layer and untouched).
All file:line references are the survey/designs' citations, re-verified by the critique
(30-critique.md §Verification note) against this worktree, 2026-07-20.

---

## 0. Ratified basis — decided, not re-litigated here

- **D1 — governance gates both humans and machines.** Unverified/anonymous requesters get
  the **public tier only**. Governed content requires verification — a human session **or** a
  verified agent principal. (B's posture; A's "humans always receive the authored experience"
  scoping is rejected for governed content — critique §4.1, founder decision #1.)
- **D2 — the honest ceiling is accepted** and stated plainly in §1 below and in the thesis
  amendment. Anonymous-crawl control is compliance-tier; hard control exists only for content
  that is behind a verified principal **and** server-held.
- **D3 — the declared policy is two independent axes**, not A's total-order lattice
  (`public ⊐ agents ⊐ gated ⊐ never` is rejected — critique A-4): a **crawl-visibility**
  axis and an **agent-callability** axis. A surface can be crawlable-but-not-agent-callable
  or agent-callable-but-not-crawlable.

Also carried from the charter (already founder-ratified): DA4-D1 (layouts default
`shadowMode: 'none'`), DA4-D2 (`@scope` CSS, Option A), sequencing B (this control ships
first; the light-DOM flip lands into it).

---

## 1. The honest ceiling (read this before the mechanism)

Stated first because every claim below is bounded by it (D2; critique §2):

1. **Anything an anonymous human can see, an anonymous scraper can extract, and the
   framework cannot change that.** Request classification is built from attacker-chosen
   bytes (`Accept`, `User-Agent`, `Authorization` — `content-negotiation.ts:92-101`). Every
   "withhold from anonymous machines, serve anonymous humans" behavior in this design binds
   only the population that identifies itself — the same population that honors robots.txt.
   That tier is **robots-with-teeth**: real enforcement against declared, compliant crawlers
   at the origin; nothing against a UA-spoofer.
2. **Hard control exists only for content that is (a) behind a verified principal and
   (b) server-held** — never emitted into the client bundle, never present in anonymous SSR.
   HTML withholding alone is not hard control: the framework's own hydration self-heal
   reconstructs withheld nodes from bundle-resident values (critique B-1, `hydrate.ts:186-196`,
   `materialize.ts`). The bundle/data boundary of §5 is what makes the hard tier hard.
3. **The hard tier is as strong as the credential.** Today `verifyJwt` checks signature only —
   no `exp`, `nbf`, or `aud` (`auth/src/server.ts:125-147`; critique §0.3). The Phase-0
   prerequisites (§11) are not enhancements; each one open converts a hard cell to soft.
4. **The framework never markets above this ceiling.** A control that claims reach it does
   not have is the thesis's own named anti-pattern ("config that claims to control what it
   cannot reach… fails silently").

---

## 2. The declaration — two axes, one `extract:` block

### 2.1 The two axes

| Axis | Question it answers | Tier | Enforced where |
|---|---|---|---|
| **`read`** (crawl-visibility) | Who may index/read this surface's rendered content? | Compliance-tier for anonymous values; **hard-tier** for verified values | Origin emission gate (§4–5) + derived robots/headers/discovery |
| **`call`** (agent-callability) | Whether/what of this surface's agent surface (`expose:` members, MCP tools) is available, and to whom? | **Hard-tier** | The serving gate (`agent-service.ts:129`) |

The axes are independent: `read: 'all'` + `call: 'none'` is crawlable-but-not-callable;
`read: 'human'` + `call: 'verified'` is callable-but-not-crawlable (the "act but never read"
pattern the critique showed A's lattice wrongly forbade — A-3). No total order relates them.

**`read` values** (each is a requirement set; anonymous values above the line, verified
below it — the line **is** the compliance/hard tier break of §1):

| Value | Who may read the rendered surface | Tier |
|---|---|---|
| `'all'` | Everyone, including declared training crawlers | compliance |
| `'agents'` | Anonymous humans, search, user-directed AI fetchers; **declared training crawlers refused** (the shipped #430 tier split, `robots.ts:174`, `:33-107`) | compliance |
| `'search'` | Anonymous humans + traditional search; declared AI fetchers and trainers refused | compliance |
| `'none'` | Anonymous humans only; all declared crawlers refused; `noindex` | compliance |
| — tier break — | *everything below requires verification; content is server-held (§5)* | — |
| `'verified'` | Any verified principal — human session or agent JWT (`verified-plugin.ts:53` → `auth/src/server.ts:125`) | **hard** |
| `{ scope: 'x' }` | Verified principal whose claims carry scope `x` | **hard** |
| `'human'` | Verified human session only; no agent credential qualifies | **hard** |

**`call` values:**

| Value | Meaning |
|---|---|
| `'none'` | No agent surface. Any `expose:` member on this surface is a compile error (C481, §3). |
| `'anonymous'` | Today's semantics exactly: `expose:` stays per-member opt-in (default hidden, `emit.rs:3707`); member `$scope`/`$rate-limit` gate as they do now (`agent-service.ts:213-215`). |
| `'verified'` | Every exposed member requires a verified principal (`needsPrincipal` forced true). |
| `{ scope: 'x' }` | Surface-level scope, **met with** each member's own `$scope` (both must pass). |

Note on D3 fidelity: D3 assigns the compliance tier to the crawl axis and the hard tier to
the gate. The `read` axis's verified values are where D1 ("governed content requires
verification") and D2 ("hard control = verified + server-held") land in the authoring
surface — without them, hard *content* control would have no declaration and the critique's
route-level-intent gap (§4.3: "B cannot express route-level intent at all") would reopen.
The tier break inside the axis is explicit precisely so the verified values never launder
compliance-tier claims.

### 2.2 Authoring shape

**Routes — a key in the `@route` block**, beside `ssr:`/`head:`/`middleware:` (parse: new
match arms in `parse_route_body`, `packages/compiler/src/parser/sfc.rs:624`, dispatch `:667`;
fields on `RouteBlock`, `packages/compiler/src/types.rs:14-24`):

```
@route {
  path: '/pricing'
  ssr: true
  extract: {
    read: 'agents'        // crawl-visibility: search + user-directed fetch yes, trainers refused
    call: 'anonymous'     // agent-callability: per-member expose/$scope as today
  }
}
```

```
@route {
  path: '/reports/:id'
  ssr: true
  extract: {
    read: { scope: 'reports:read' }   // hard tier: server-held, per-principal emission
    call: { scope: 'reports:read' }
  }
}
```

**Non-route components — a `$extract` state macro**, parallel to `$shadow` (new `:`-shorthand
arm in the state-macro scanner beside the `$shadow` arm, `state_macros.rs:273-299`):

```
@state {
  $extract: { read: 'verified', call: 'verified' }
  balance = $prop(0)
}
```

Both lower to the **same compiler field** (A §1.2's one-declaration/two-positions shape).
Single-string sugar (`extract: 'agents'` ≡ `{ read: 'agents', call: 'anonymous' }`) is
deferred — one canonical shape first.

### 2.3 Division of labor with the existing primitives (kept from A, reshaped)

- **`extract:` owns content policy** (both axes, per surface).
- **`expose:` stays member-capability** — the only member-level agent opt-in, unchanged
  (`emit.rs:3695-3752`; default hidden). `extract.call` is a ceiling over it, never a grant.
- **Member `$scope` / `$rate-limit`** — authority and budget per member, unchanged
  (`agent_macros.rs:37`; `agent-service.ts:275-286`, `:315-333`). Member `$scope` gates
  **calls only**, never content.
- **Component-level `$scope` derives a fail-closed read default:** a component carrying a
  component-level `$scope: 'x'` whose author wrote no `extract.read` defaults to
  `read: { scope: 'x' }`. This closes the survey's sharpest conflict (declared at the tool
  gate, leaking at SSR — survey §0) in the Derived way: no second thing to remember. An
  explicit `extract.read` on the same surface **wins** (both statements are visible in
  source; W480 informs when the explicit value is a public tier).
- **`$shadow` returns to pure encapsulation** — §7.
- **B's reserved class-scopes `@human` / `@verified`** are kept for the member `$scope` axis
  (human-only / any-verified actions); on the `read` axis the same intents are the `'human'`
  and `'verified'` enum values.

### 2.4 What one declaration emits (A's fan-out, kept)

The compiler fans one parse into three artifacts (`emit.rs:267-287`); `extract` rides all
three: (1) code marker `// @aihu:extract read=<v> call=<v>` beside the shadow marker
(`emit.rs:3285-3291`) — consumed by the Vite plugin's per-file seam
(`compiler/js/index.ts:1196-1201`) for §5's chunk routing; (2) `.route.json` sidecar via
`emit_route_json` (`emit.rs:1160`) → `RouteDefinition` (`router/src/vite-plugin.ts:41,184-186`;
`router.ts:47-60`) — what the server, prerenderer, and discovery generators read; (3) the
agent-meta sidecar (`emit.rs:4388-4461`) → registry → serving gate. DA-f2 (§10) asserts the
three can never disagree.

---

## 3. Composition — meets and compile errors

**R1 — meet law (kept from A, per-axis).** Each axis value is a requirement set; the
effective policy of nested surfaces is the **union of requirements** along the path
(route ∧ component ∧ member). `{scope:'a'}` ∧ `{scope:'b'}` = both scopes; `'human'` ∧
`{scope:'x'}` = human session bearing `x`; `'agents'` ∧ `'search'` = `'search'`. Nesting
composes silently by meet (a component reused across hosts cannot know its host); it is
never an error to be *narrower* than the host.

**R2 — declared contradictions on one surface are compile errors** (A's best mechanic,
kept): a combination where one declaration promises what another forbids fails the build —
never resolved by runtime precedence the author didn't write.

**R3 — `extract:` never widens.** It never exposes a member (`expose:` remains the only
grant), never bypasses a member `$scope`, never re-opens what a narrower nested declaration
closed.

| # | Combination | Verdict |
|---|---|---|
| 1 | `read: 'agents'`, `call: 'anonymous'` (the default, §8) | legal — today's public posture, now declared and governable |
| 2 | `read: 'all'`, `call: 'none'`, no `expose:` anywhere | legal — crawlable, not callable (D3 independence) |
| 3 | `call: 'none'` ∧ any `expose:` member on the surface | **C481** — contradiction (narrowed from A per critique A-3: it fires only when the call axis is closed, not when content is) |
| 4 | `read: 'human'`, `call: 'verified'`, `expose:` action | legal — **act-but-never-read**, the thesis-blessed pattern A's lattice forbade |
| 5 | `read: {scope}` ∧ member `expose:{read:true}` | legal — member read requires the surface principal ∧ member gates (R1 meet); not a contradiction |
| 6 | "gated without a scope" (A's C482) | **unrepresentable** — the scope is part of the value `{ scope: 'x' }`; empty/missing string → C483 |
| 7 | Malformed `extract`/`$extract` value | **C483** (mirror of C471) |
| 8 | `@route extract:` ∧ `$extract` in the same file | **C484** — one declaration per surface |
| 9 | `$shadow: 'none'` ∧ hard-tier `read` | **legal** — A's C480 is **retired**; `$shadow` has no extractability semantics (§7; critique §4.2) |
| 10 | Nested component declares wider than host (e.g. `read:'all'` inside a `read:'verified'` route) | legal; effective = meet (host wins by narrowing); no error |
| 11 | `call: {scope}` with no exposed member anywhere | legal + **W481** (declaration with nothing to govern) |
| 12 | component `$scope` ∧ explicit `extract.read: 'agents'` | legal + **W480** (author overrode the fail-closed derivation; both statements visible) |

Compile-time enforcement: C481/C483/C484 get should-fail/should-pass fixtures beside the
C470/C471 tests (`state_macros.rs` test mod region); the contradiction rows exist before any
artifact does.

---

## 4. Enforcement — one principal gate, extended to every emission surface

### 4.1 The gate (B, kept wholesale)

**`packages/agent-service/src/principal-gate.ts`** — B §1.1's module: `resolvePrincipal`
(one principal per request) + `decideEmission` (one decision function). `runGate` step 2
(`agent-service.ts:194-269`) refactors onto `resolvePrincipal`; scope (`:275-286`) and
rate-limit keying (`:315-333`) read `Principal.scopes`/`Principal.sub` — one implementation,
tool path and emission path sharing one file's blast radius.

`resolvePrincipal(req)` order (B §1.4): `Authorization: Bearer` → `authPlugin.verify`
(same primitive as the tool gate, `verified-plugin.ts:53` → `auth/src/server.ts:125`);
session cookie → `getAuthState` (`auth/src/server.ts:166`); else anonymous, with the UA
subclass from the single shared bot registry (`isAiCrawlerUserAgent`,
`content-negotiation.ts:23`, extended per §4.3). A presented-but-invalid credential resolves
to anonymous — verification failure never yields more access than sending nothing.

### 4.2 The five taps (B §1.2, kept) + the decisions they now make

| # | Tap | Where | Decision |
|---|---|---|---|
| T1 | Tool-call gate | `agent-service.ts:129` (`runGate`) — exists | `call` axis: `needsPrincipal` predicate extended (`:213-215` → `memberScope ∨ rateLimit ∨ surfaceCall ≠ 'anonymous'`); surface `{scope}` met with member `$scope` at `:275-286`; `call:'none'` surfaces are compile-time empty (C481), gate 404 is defense-in-depth (ordering invariant `:141-145`). |
| T2 | SSR tree walk | `ssr.ts:248` (`_renderNode`), `:305` (async) | `read` axis per principal: on `withhold`, emit the in-place, path-preserving placeholder (§6). |
| T3 | State script | `ssr.ts:407` (`emitStateScriptAndClose`) | Withheld subtrees' signal values never ship in `__aihu_state__`. |
| T4 | Loader script | `router/src/server.ts:52-55` | Route-level withholding for principals failing the route's `read` (B's W6 coarseness accepted, revisit with typed loaders). |
| T5 | Markdown / negotiation | `markdown-resolver.ts:110-127` + body | Per-principal: body from the same redacted render; the "Interactive capabilities" section lists only tools **this principal** could pass — the survey's agents-get-a-superset hole closed at the same gate. |

Entry points: live SSR resolves the principal in `createServerRouter.handle`
(`router/src/server.ts:31`) and closes it into `SsrOptions.emission` per B §1.3 (per-call
option, not ambient state — the `hydratable` lesson at `router/src/server.ts:41-49`).
Prerender pins `{ class: 'anonymous', uaClass: 'ai-crawler' }` (`prerender.ts:395`, `:286`) —
static output ships exactly one variant: the anonymous one. The Rust native renderer
implements the consult **or refuses governed trees** (I2, §10).

### 4.3 The compliance tier, precisely

For anonymous principals, `decideEmission` applies the surface's `read` value against the
UA class from the **one** bot registry — the same `AI_BOT_LIST` robots.txt is generated from
(`content-negotiation.ts:7-11`, `robots.ts:33-107`), extended with a search-bot tier
(Googlebot proper is not in the AI list today — critique §1 LOW note) so `'search'`/`'none'`
are expressible. One table drives robots.txt, negotiation, and emission — resolving the
critique's B-6 seam (B's C1 row withheld from user-fetchers #430 allows) by construction:
`read: 'agents'` refuses exactly the trainer tier that `allow-agents` already Disallows.

Refusal shape at compliance tier: 403 + `X-Robots-Tag: noindex` for the refused UA class;
anonymous humans always get the full public-tier render. This is enforcement of etiquette
(ceiling §1.1) and is labeled compliance-tier everywhere it appears.

B's per-member C1 taint (unexposed-member values withheld from crawler UAs inside otherwise
public surfaces) is **dropped**: the governance unit is the surface (§6.1), the honest rule
is "governed values live in governed surfaces," and D1 already classifies
anonymous-human-visible content as public tier.

---

## 5. The bundle/data boundary — where the hard tier becomes hard (the critique's addition)

Critique B-1 is the central correction this synthesis exists to encode: **HTML withholding
alone is defeated by the framework's own hydration self-heal**, which rebuilds withheld
subtrees from bundle-resident template text and literal initial state
(`hydrate.ts:186-196` → `materialize.ts`; B's own worked example `margin: 0.4` defeats B's
"hard" cell). Therefore, for every surface whose effective `read` is a verified value:

**E1 — Compiler: server-only emission of governed content.**
`packages/compiler/src/codegen/emit.rs`. Hard-read surfaces' template constants and literal
initial state are emitted into the **server-only artifact channel** — the same split that
already keeps `$scope` values out of client artifacts (`emit.rs:3943`, `:4211` is the
precedent). The client factory for a hard surface compiles to structure-with-holes: no
literal governed values, no governed static markup; the holes fill only from the gated
fetch (E3).

**E2 — Vite plugin: governed chunks out of the public graph.**
`packages/compiler/js/index.ts` — the per-file marker seam that already routes CSS per
component (`:1196-1201`, C4 in the flip spec) reads the `extract` marker and routes
hard-read modules into **governed chunks** (`dist/assets/governed/*`), referenced only via a
runtime dynamic import that goes through the gate. Nothing in the public entry graph
imports them; `curl` over `dist/assets/*.js` never contains governed bytes.

**E3 — Serving: governed chunks and governed data are gate-served.**
`router/src/server.ts`: `dist/assets/governed/*` and the per-surface data endpoint are
served only through `resolvePrincipal` + `decideEmission`, with the same fail-closed AUTH_*
ladder as tool calls (`agent-service.ts:194-269`). On pure-static deploys governed chunks
are **not emitted at all** — the capability degrades to absent, never to open (A §3.3's
posture, B's W8 honesty).

**E4 — SSR/prerender: never in anonymous output.**
T2/T3/T4 (§4.2) plus the pinned-anonymous prerender principal guarantee governed content is
absent from anonymous HTML, `__aihu_state__`, `__aihu_loader__`, and everything in `dist/`.

**E5 — Client runtime: the withheld-placeholder guard (the B-1 fix).**
`arbor/src/hydrate.ts` / `materialize.ts`: the walker honors `data-aihu-withheld` — it never
materializes into a withheld placeholder from local values. The entitled path materializes
the **whole subtree** from the gated chunk + data once fetched (full-subtree
materialization, not the per-leaf walk — which also fixes B-2's silent static-content loss
for entitled principals under cache skew; `hydrate.ts:144-146`, `:160-162` are the loss
sites the per-leaf walk cannot restore).

**E6 — Invariant: byte-checked.** DA-f1/G5 (§10) grep hard-tier sentinels out of
`dist/**/*.html` **and** `dist/assets/**/*.js` (outside `governed/`), and probe the
governed-chunk endpoint anonymously (deny) and entitled (serve, complete).

**Hydration parity, honestly (D2):**
- Compliance-tier withholding (refusing declared crawler UAs) needs no parity story —
  crawlers don't hydrate, humans get the full render.
- Hard-tier surfaces use B's placeholder mechanics (C-1/C-3: element-granular, in-place,
  path-preserving — verified sound by the critique §1 "held" findings) for the *document*,
  and the not-in-bundle boundary for the *data*. The placeholder alone is compliance-tier;
  placeholder + E1/E2/E3 is the hard tier. Entitled principals get per-principal SSR when a
  server answers (full emission; parity trivially holds per B §4.3 — parity is between a
  document and the client that hydrates it), or the E5 client path on static hosting.
- Responses containing governed nodes carry `Vary: Authorization, Cookie` +
  `Cache-Control: private` (negotiation's both-variants discipline,
  `content-negotiation.ts:130-141`). Ungoverned routes emit one variant, fully cacheable.

### 6.1 Granularity: the governance unit is the surface, not the interpolation

Redaction hosts are custom-element boundaries — route hosts and component hosts. This keeps
C-1 satisfied structurally and makes B's mandatory per-interpolation `<span>` wrap (C-2)
unnecessary in the common case: a governed value renders inside a governed component, whose
host is the placeholder. Consequences, stated:

- Structural regions (`$if`/`$each`) emit no SSR bytes and always client-materialize
  (`ssr.ts:270`; `hydrate.ts:92-100`; critique B-4). Inside a hard surface this is safe *by
  the boundary*: their data and template live in the governed chunk (E1/E2), so
  client-materialization has nothing local to leak.
- A governed value interpolated into an **ungoverned** surface is not withheld. The rule is
  documented and linted (W-lint follow-up), not silently half-enforced.

---

## 7. `$shadow` — pure encapsulation; the DA4 flip lands into this

All three inputs converge (A §2.3's split, B §5, critique §4.2 adjudicating for B):
`$shadow` has **zero extractability semantics**. A's C480 floor is retired — a compile
error protecting a serialization (DSD sealing) that does not withhold bytes is ceremony
(critique A-1/A-2). DSD absence-from-compliant-extractors remains a side effect, never a
control; no doc may point at shadow for privacy — the pointer is `extract:`.

The flip (`design/da4-flip:docs/plans/da4-flip/design-spec.md`) lands **unmodified in
mechanics**: classifier `@route → 'none'`, precedence `$shadow > @route→none >
css.shadowMode > 'open'`, Option-A `@scope` CSS, DA4-D1 layouts-as-chrome, leaf-only
`--shadow`, W472 retirement. Rendering mode derives from the classifier (pages light — which
is what serves the `read` axis's public tiers to non-JS crawlers) plus `$shadow` as authored
encapsulation intent. Extractability never reads `$shadow`; `$shadow` never enforces
extractability. Two additions to the flip's test matrix (B §5): a governed-fixture variant
of the mixed-mode e2e where the byte assertion inverts (governed sentinel **absent**,
placeholder present), and the layout-shell prerender rendering under the same pinned
anonymous principal as pages.

Ordering: the flip stays **parked** until this design's Phases 1–5 ship (§12) — sequencing
B, restated: crawlable-by-default lands only after crawlability is a governed, declared,
per-surface property.

---

## 8. Derivation map — one declaration, every surface derived

One source of truth (thesis §Derived); no hand-maintained manifest anywhere.

| Derived artifact | Derived from | Site | Tier |
|---|---|---|---|
| robots.txt per-route rules | `read` (compliance values) over the tiered registry | `robots.ts:172-213`, served `vite-plugin.ts:103` | compliance (advisory belt; origin gate is the authority) |
| `X-Robots-Tag` / meta noindex | `read: 'none'` and refused-UA responses | router `handle` | compliance |
| Origin UA refusal (403) | `read` compliance values × bot registry | `decideEmission` in T2 path | compliance (robots-with-teeth) |
| Bundled vs server-held (governed chunks, server-only state) | `read` hard values | E1 `emit.rs` / E2 `compiler/js/index.ts` / E3 `router/src/server.ts` | **hard** |
| Per-principal SSR emission + state/loader filtering | `read` × principal | T2/T3/T4 (`ssr.ts:248`, `:407`; `router/src/server.ts:52-55`) | **hard** |
| Prerender posture (anonymous variant only; hard content absent from `dist/`) | `read` | `prerender.ts:395`, `:286` | **hard** |
| `runGate` predicate + surface-scope meet | `call` | `agent-service.ts:213-215`, `:275-286` | **hard** |
| MCP tools / agent-card skills / llms.txt capability lists | `call` × principal | `llms-txt.ts:104`; `a2a-card.ts:51`; `mcp-server-card.ts:105,:173` | hard (registry is compile-filtered; per-principal at serve time) |
| Markdown body + capabilities section | both axes × principal | T5 `markdown-resolver.ts:110-127` | per-tier |
| Discovery existence (below) | `read` | per-principal discovery | — |

**Existence advertising (critique #8.5, A-5 fixed):** discovery is itself an emission and
goes through the same gate. The **anonymous** variants of llms.txt/cards/robots contain no
hard-read surface — no per-route `Disallow` naming them (A-5's self-contradiction removed:
hard surfaces are simply absent, 404-shaped, matching `agent-service.ts:141-145`), while
compliance-tier `read:'none'` routes (already served to humans; existence not secret) do get
`Disallow` lines. A **verified** principal's negotiated discovery (T5) lists the hard
surfaces its credential could enter, with the required scope named — agents can find the
door without the door being on the anonymous map.

---

## 9. Default posture — recommendation (the one remaining founder ratification)

**Recommended default: `extract: { read: 'agents', call: 'anonymous' }`.**

- **`call: 'anonymous'`** is not a loosening: the agent surface is *already* opt-in
  per member (`expose:` default-hidden, `emit.rs:3707`) — a fresh app exposes nothing.
- **`read: 'agents'`** means: public content is **crawlable by default** — humans, search
  engines, and user-directed AI fetchers get everything (SEO intact; Dual-audience intact;
  zero break for every legitimate audience) — while **declared training crawlers are
  refused at the origin**. This is not a new posture: the shipped #430 default
  (`allow-agents`, `robots.ts:174`) already *tells* trainers to stay out; today the server
  then serves them anyway. The default makes the framework stop contradicting its own
  robots.txt — the already-declared policy gains teeth.
- **The founder's concern, answered on the founder's own terms:** the verbatim complaint is
  "if we **can't control** the data flow… just a normal web framework." The delta from a
  normal web framework is not a closed default — the critique (§5) shows closed-by-default
  collapses against the thesis, DA4, and the #430 default, and buys almost nothing (ceiling
  §1.1). The delta is that the posture is now a **declared, derivable, per-surface property
  with a real gate behind every non-default value**, and the trainer tier is refused rather
  than asked. "Crawlable by default" applies only to the public tier, and it is governable
  with one authored line.
- **Guards that keep the default declared rather than silent** (A §5.1, critique-endorsed):
  the scaffold writes `extract: { read: 'agents', call: 'anonymous' }` explicitly in the
  page template (`cli/src/index.ts:154-168` region); every build prints the per-value census
  (§10). No project-wide default-override knob — the same source must mean the same posture
  in every repo (the flip spec's own §6 argument, stronger for a security posture).
- **Stated costs:** trainer-UA refusal is origin-authoritative only — shared caches without
  `Vary: User-Agent` discipline can serve cached public renders to trainer UAs (within the
  compliance tier's honesty budget; documented, not papered over). And a spoofing scraper
  defeats it entirely (ceiling §1.1).

**The alternative** if the founder rejects any served-bytes delta at all: default
`read: 'all'` (byte-identical to today; #430 stays advisory; `'agents'` becomes the
recommended first authored line). This trades the "we enforce our own robots.txt" story for
absolute zero-delta.

**FLAGGED FOR RATIFICATION — this is the single remaining founder decision.** Everything
else in this spec builds on already-ratified D1–D3.

---

## 10. Invariants — the declaration cannot silently regress

**Compile-time:** C481 (narrowed), C483, C484 fixture pairs (§3); the `{scope}` value shape
makes A's C482 unrepresentable.

**`check:governed` gains G4 + G5** (pattern of G1: stand up the real thing, probe
behaviorally — `scripts/check-governed.ts:131`):

- **G4a** — real `createServerRouter` over per-value fixtures: anonymous GET → compliance
  values serve humans/refuse declared trainer UA; hard values → AUTH_* ladder; entitled
  GET → full emission.
- **G4b** — non-default `read` + **no auth plugin** + any request → deny, never serve
  (G1 posture at the new boundary; the router↔auth seam is type-only and fail-closed,
  A §3.2).
- **G4c** — decode-only (unverified) JWT must not pass — the boundary uses `verify`, not
  `decodeJwt` (key provenance, G3's concern at the content gate; probe style of
  `check-governed.ts:57`).
- **G5a** — **bundle absence**: hard-tier sentinels absent from `dist/**/*.html` and
  `dist/assets/**/*.js` outside `governed/`; `governed/` absent from static-deploy output.
- **G5b** — governed-chunk endpoint: anonymous fetch → deny; entitled fetch → serve.
- **G5c** — **entitled completeness** (the B-2 catch): hydrating the entitled path over the
  anonymous variant yields a subtree with **all** static text and attributes present —
  asserting content, not just path stability.

**`check:dual-audience` gains DA-f** (pattern of DA-c/DA-d, `check-dual-audience.ts:405-407`,
`:503-505`): **DA-f1** per-value sentinel byte checks over build+prerender (public sentinels
present as light DOM; hard sentinels never in `dist/`); **DA-f2** three-artifact agreement —
marker ≡ `.route.json` ≡ agent-meta for every fixture (the §2.4 fan-out cannot drift);
**DA-f3** discovery agreement — anonymous artifacts contain no hard surface, annotate
compliance values correctly, per-principal discovery lists entitled surfaces. Census print
every run; counts via `expectCount` (`:728`).

**Runtime, fail-closed:** **I2** (B, kept) — `renderToString`/`renderToStream` throw
`GOVERNED_UNGATED` on a governed node when `opts.emission` is absent (modeled on
`RATE_LIMIT_MISSING`, `agent-service.ts:315-325`). A future render path cannot forget the
gate; it can only fail loudly. **I2s** — `renderToStream` refuses governed trees entirely
until the interior-async mis-nesting is fixed (critique B-3, `ssr.ts:375-400`).

---

## 11. Phase 0 — prerequisites (each open converts a hard cell to soft)

| # | Prerequisite | Anchor |
|---|---|---|
| P1 | `verifyJwt` checks `exp`/`nbf`/`aud` + token-type separation (`typ:'agent'` / `act` claim); its false docstring corrected | `auth/src/server.ts:117-147`; critique §0.3 |
| P2 | Revocation story: short-lived tokens + refresh at minimum; documented as part of the control ("hard until the first leak, then permanent" otherwise) | critique §2 |
| P3 | Live SSR of compiled routes actually works (compiled `.aihu` exports no default renderable; `resolveComponent` returns null) — without it the SSR gate governs a near-empty channel | `prerender.ts:203-218`; `router/src/server.ts:40`; critique §0.1 |
| P4 | Hydration rail activation: state-script emission wired in `handle` and the global-vs-per-tag contract mismatch fixed | `router/src/server.ts:50`; `ssr.ts:411-420` vs `define-element.ts:44-56`; critique §0.2 |
| P5 | Streaming: fix `renderNodeAsync` mis-nesting or keep I2s refusal | `ssr.ts:375-400`; critique B-3 |
| P6 | Rate limiter: fail-closed at `maxKeys` for governed routes; note per-process scope | `rate-limiter.ts:64`, `:88-94` |

---

## 12. Migration + ordered implementation checklist

**Migration:** no declarations → default `{ read: 'agents', call: 'anonymous' }`: humans,
search, user-fetchers, hydration, and the agent axis are byte-identical to today; the only
delta is declared-trainer-UA refusal (release-note callout; one-line escape `read: 'all'`).
Components carrying component-level `$scope` gain the derived fail-closed read (§2.3) —
blast radius near zero today because compiled-component SSR barely exists (critique §0.1),
and the census makes every affected surface visible. No codemod needed — no old syntax to
rewrite. The compile errors + census are the migration tooling. Release shape: Phases 1–3
are additive (minor); the default trainer-refusal and the flip ride the same semver-major
train the flip already requires.

**Phased checklist (each phase green in isolation; a builder could execute in order):**

1. **Phase 0 — prerequisites.** P1–P6 (§11). P1/P3/P4 gate everything hard-tier.
2. **Phase 1 — vocabulary + compiler.** Parse `extract:` in `parse_route_body`
   (`sfc.rs:624,:667`; `RouteBlock` fields `types.rs:14-24`) and `$extract`
   (`state_macros.rs:273-299` region); reserved `@human`/`@verified` on `$scope`
   (`agent_macros.rs:37`); C481/C483/C484 + W480/W481 with fixtures; three-artifact fan-out
   (marker at `emit.rs:3285-3291`, route-json `emit.rs:1160`, agent meta `emit.rs:4388-4461`);
   component-`$scope`→read derivation; census print.
3. **Phase 2 — the principal gate.** `principal-gate.ts` (`resolvePrincipal`,
   `decideEmission`); refactor `runGate` step 2 onto it; extend `needsPrincipal`
   (`agent-service.ts:213-215`) and the surface-scope meet (`:275-286`) for the `call` axis;
   bot registry unification + search tier (`content-negotiation.ts:7-23`, `robots.ts:33-107`).
4. **Phase 3 — compliance-tier derivation.** Route-aware robots (`robots.ts:172`),
   noindex/X-Robots-Tag headers, origin UA refusal in `handle`
   (`router/src/server.ts:31-60`), per-principal markdown/negotiation (T5,
   `markdown-resolver.ts:110-127`), per-principal discovery (§8), `Vary` discipline.
5. **Phase 4 — hard tier / data layer.** E1 server-only emission (`emit.rs`, `$scope`
   precedent `:3943,:4211`); E2 governed chunks (`compiler/js/index.ts:1196-1201` seam);
   E3 gated chunk/data serving (`router/src/server.ts`); T2 placeholder + T3/T4 filters
   (`ssr.ts:248,:407`; `router/src/server.ts:52-55`); E5 client withheld-guard +
   full-subtree entitled materialization (`hydrate.ts`, `materialize.ts`); prerender pinned
   anonymous; I2/I2s.
6. **Phase 5 — invariants.** G4a–c, G5a–c in `check:governed`; DA-f1–f3 + census in
   `check:dual-audience`; parity fixture with entitled-completeness.
7. **Phase 6 — the DA4 flip lands** (its own spec §12 checklist, unmodified), plus the
   governed-fixture e2e variant and layout-prerender principal (§7). Same major release
   train as the default posture.
8. **Docs:** the honest-ceiling statement (§1) verbatim in the security docs; "governed
   protects server-sourced state and server-rendered content — not compiled templates, not
   literal initial values — *unless* the surface is hard-tier, where E1/E2 move those
   server-side"; shadow-for-privacy corrections (§7); static-hosting degradation (E3);
   migration notes.

---

## 13. Decision register

| Decision | Status |
|---|---|
| D1 gate humans and machines; D2 honest ceiling; D3 two axes | **Ratified** (founder, 2026-07-20) |
| DA4-D1 layouts light; DA4-D2 `@scope`; sequencing B | **Ratified** (charter) |
| `$shadow` = pure encapsulation; C480 retired | Synthesis (all three inputs agree; per ratified D3 + critique §4.2) |
| Governance unit = surface, not interpolation; B's C1 member taint dropped | Synthesis (§6.1) |
| Existence advertising: per-principal discovery; hard surfaces absent anonymously | Synthesis (§8; resolves critique #8.5/A-5) |
| **Default posture `{ read: 'agents', call: 'anonymous' }`** (vs `read: 'all'`) | **OPEN — the one remaining founder ratification** (§9) |
