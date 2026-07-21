# Governed Extractability — Design A: Declared intent, derived enforcement

**Status:** design (no implementation). Architect A, branch `design/govern-A`.
**Inputs:** `00-charter.md` (founder framing, ratified D1/D2/sequencing-B),
`10-survey.md` (code-verified control map, 2026-07-20), `docs/architecture/thesis.md`
(four properties), `docs/plans/da4-flip/design-spec.md` (branch `design/da4-flip`).
All file:line references below re-verified against this worktree (`a151bdd8`).

---

## 0. The position in one paragraph

The author declares extractability intent **once per surface** — a single `extract:`
level on the route or component — and the framework **derives everything else**:
the SSR serialization (light vs sealed), the content-negotiation verdict, the
prerender/SSG posture, robots and discovery advertisement, and the agent-gate
predicate. No consumer ever *infers* extractability from another mechanism
(component type, `$shadow`, `expose:` presence) — the survey shows that inference
is exactly what produced the expose-hidden-but-SSR-visible contradiction
(`10-survey.md` §0). The declared level is a **ceiling in a total lattice**; every
existing lever (`expose:`, `$scope`, `$shadow`, `ssr:`) becomes a *monotone
restriction beneath it* — each can narrow, none can widen — and any combination
that would widen is a **compile error**, not a runtime surprise. This is the
thesis's Derived property applied to governance itself: one source of truth,
drift structurally impossible.

A scoping decision that makes the rest coherent: **extractability governs the
machine axis only.** Humans always receive the authored experience (Dual-audience
property 1: "a human receives an experience"). The lattice controls who may obtain
a *machine representation* — crawl the HTML as data, negotiate markdown, read
state, call tools. This is how "never-extractable yet server-rendered for humans"
stops being a paradox: the human response is not a machine representation, and
every machine representation the framework owns is refusable.

---

## 1. The declaration

### 1.1 The lattice — four levels, totally ordered

```
public  ⊐  agents  ⊐  gated  ⊐  never
(most extractable)      (least extractable)
```

| Level | Meaning (authored intent) | Who may machine-extract |
|---|---|---|
| **`public`** | Fully crawlable and agent-readable. The open-web default posture. | Anyone, including anonymous JS-less crawlers. |
| **`agents`** | Not for anonymous crawlers; available to a **verified principal** (any signature-verified agent, no particular scope). | Any request carrying a JWT that passes `verify` (#420). |
| **`gated`** | Requires a named `$scope` on the verified principal. | Verified principal whose claims carry the declared scope. |
| **`never`** | No machine extraction, ever. Server-rendered for humans; withheld from every machine channel the framework controls. | No one. The surface has no machine representation. |

Total order matters: it makes composition a **meet** (`min`) — a component's
effective level inside a page is `min(page level, component level)`, and every
"which wins?" question in §4 reduces to "most restrictive wins" with no partial-
order ambiguity. Each level is strictly less extractable than the one above it:
`agents` adds a principal requirement, `gated` adds a scope requirement on top of
the principal, `never` removes the channel entirely. Four levels cover the
charter's requirement exactly; the lattice is deliberately closed — no plugin-
defined levels, because an extensible lattice reintroduces the drift the
declaration exists to kill.

### 1.2 Authoring shape

**Routes: a key in the `@route` block.** Page-level intent belongs where page
intent already lives — beside `ssr:`, `head:`, `middleware:`:

```
@route {
  path: '/reports/:id'
  ssr: true
  extract: 'gated'
  scope: 'reports:read'      // required iff extract: 'gated' (else C482)
  head: { title: 'Report' }
}
```

**Non-route components: a `$extract` state macro,** parallel to `$shadow`:

```
@state {
  $extract: 'never'
  salary = $prop(0)
}
```

Both lower to the **same compiler field**; there is one declaration, expressed in
the syntactic position natural to the surface kind.

**Why a macro/key and not an `expose:`-style member bag:** `expose:` is
per-*member* intent ("this action is on the agent axis") and it already works —
survey §0 calls axis (b) "the one axis with a real, first-class, server-
authoritative control today." Extraction is per-*surface* intent ("this page/
component's content"). Overloading `expose:` to also mean surface extraction
would make one keyword answer two different questions at two different
granularities — exactly the couplings (shadow ⇒ privacy, expose-absence ⇒
privacy) the survey shows failing. The pair reads as a system:

- `extract:` — what machine audiences may take **from this surface** (level).
- `expose:` — which **members** project onto the agent axis (opt-in, unchanged).
- `$scope` / `$rate-limit` — under what authority and budget (unchanged).
- `$shadow` — DOM encapsulation, now bounded below by the level's floor (§2.3).

**Where it parses:**

- `@route { extract:, scope: }` → new match arms in `parse_route_body`
  (`packages/compiler/src/parser/sfc.rs:624`, key dispatch at `:667`), fields on
  `RouteBlock` (`packages/compiler/src/types.rs:14-24`).
- `$extract:` → new `:`-shorthand in the state-macro scanner, directly beside the
  `$shadow` arm (`packages/compiler/src/parser/state_macros.rs:273-299`), same
  quoted-literal validation shape; malformed value → new diagnostic **C483**
  (mirror of C471).

### 1.3 What one declaration emits (the fan-out)

The compiler already fans one parse into three artifacts at
`packages/compiler/src/codegen/emit.rs:267-287`; `extract` rides all three:

1. **Code marker** `// @aihu:extract <level>` beside the shadow marker
   (`emit.rs:3285-3291`) — consumed by the Vite plugin (§2.3).
2. **`.route.json` sidecar** field via `emit_route_json` (`emit.rs:1160`) —
   consumed by the router build (`packages/router/src/vite-plugin.ts:41,184-186`),
   threaded onto `RouteDefinition` (`packages/router/src/router.ts:47-60`), which
   is what the server, prerenderer, and discovery generators read.
3. **Agent meta sidecar** (`emit.rs:4388-4461`) — consumed by the agent registry
   (`packages/agent/src/registry.ts`) and the serving gate (§3.4).

Three consumers, one parsed field, zero hand-maintenance: the Derived property's
test ("if a human has to remember to update something, the property is violated")
passes by construction. §6 adds the check that the three artifacts can never
disagree.

---

## 2. Derivation — what each level makes the framework do

### 2.1 The derivation table

"Anon HTML" = the response to a request the server cannot attach a verified
principal to and that negotiates as HTML (a human browser). "Machine rep" = any
representation addressed to software: negotiated markdown, structured content,
agent reads/calls.

| Level | SSR anon HTML (`ssr.ts` / `router/src/server.ts` / `prerender.ts`) | Content negotiation (machine rep) | Discovery (llms.txt, cards, robots) | Agent gate (`agent-service.ts`) | Rendering serialization (§2.3) |
|---|---|---|---|---|---|
| **`public`** | Full light-DOM HTML (DA4 flip applies) | Markdown served to anyone (current resolver behavior) | Fully advertised; robots per tiered policy | Current behavior: `expose:` + optional `$scope`/`$rate-limit` | DA4 classifier decides: `@route` → light; `$shadow` free |
| **`agents`** | Full content for humans, **sealed serialization** + `X-Robots-Tag: noindex` + `data-nosnippet` | **401 deny chain without verified principal** (same AUTH_* ladder as the tool gate); markdown served to a verified principal | Listed in llms.txt/cards **with `auth: required`**; robots: per-route `Disallow` appended | `needsPrincipal` forced `true` even for unscoped members | **Sealed floor**: light emission forbidden (C480) |
| **`gated`** | Same as `agents` | 401/403 without principal+scope; markdown served when scope present | Listed with the required scope named; robots `Disallow` | Declared scope enforced on **every** member of the surface (meet with member `$scope`) | Sealed floor (C480) |
| **`never`** | Full content for humans, sealed + noindex/nosnippet; **`+ ssr:false` = no server bytes at all** (§3.3) | **404-shaped refusal, always** — no existence confirmation (matches the gate's 404-first invariant, `agent-service.ts:141-145`) | **Absent from every artifact**; robots `Disallow` | No members may be exposed: `expose:` on a `never` surface is compile error **C481** | Sealed floor (C480) |

### 2.2 The deny chain is the existing one, reused

`agents`/`gated` refusal on the machine-rep path reuses the exact fail-closed
ladder the survey certifies (`10-survey.md` #5): no auth plugin → `AUTH_MISSING`
(deny, G1 posture), plugin without `verify` → `AUTH_UNVERIFIABLE`, no JWT →
`AUTH_REQUIRED`, bad signature/`sub` → `AUTH_INVALID`, missing scope →
`SCOPE_DENIED`. Same codes, same ordering, one new call site (§3.2). No second
auth mechanism is designed; the verified-principal primitive
(`packages/auth/src/verified-plugin.ts:46` → `packages/auth/src/server.ts:125`)
is the only principal source, for tools and for content alike.

### 2.3 Light/shadow becomes **derived-with-a-floor** — the key reconciliation

Answer to the charter's central question: the light/shadow lever **does not stay
an independent extractability control, and does not disappear**. It splits into
its two conflated meanings (survey #9: "couples DOM encapsulation to
extractability"):

- **Extractability of the serialization** — now derived from `extract:`, full stop.
- **DOM encapsulation** (style isolation, DA4's "leaves keep shadow") — stays
  authored via `$shadow`, but **bounded below by the level's floor**.

The rule, stated as the monotone law every lever in this design obeys:

> `$shadow` may seal *more* than the level requires, never less.
> `extract: public` → `$shadow` is free (`none`/`open`/`closed` all legal — the
> content is public either way, so encapsulation is purely the author's styling
> choice). `extract ∈ {agents, gated, never}` → the serialization floor is
> *sealed*; `$shadow: 'none'` is a declared contradiction → compile error
> **C480** at the marker-emission site (`emit.rs:3285-3291`), the same place the
> DA4 flip computes the default marker.

**Reconciliation with the DA4 flip spec** (`docs/plans/da4-flip/design-spec.md`):

- The flip's compiler change (§4 there: `shadow_mode.or_else(|| route.is_some()
  .then_some("none"))` at `emit.rs:3285-3291`) becomes **level-aware**:
  `@route ∧ effective-extract = public → 'none'`. Non-public routes derive a
  sealed serialization regardless of the classifier. Since the default level is
  `public` (§5), the flip's observable behavior for every existing app is
  **unchanged** — the flip lands *into* the control exactly as sequencing B
  requires, as one composed derivation at one site rather than two levers.
- The flip's ratified precedence gains one term at the top:
  `extract floor > $shadow macro > @route→'none' > css.shadowMode > 'open'` —
  with the floor and `$shadow` unable to contradict (C480 makes the conflict
  unrepresentable rather than resolved-at-runtime).
- The flip's DA-e ratchet ("shipped `@route` whose resolved mode isn't `'none'`",
  design-spec §5) exempts non-public routes — their sealed mode is *correct*,
  and §6's DA-f asserts the sealed side.
- Ratified D1 (layouts default `'none'`) is unaffected: layouts are page chrome;
  a non-public *page* inside a light layout is sealed at the page subtree, which
  is the unit the intent was declared on.

**What "sealed serialization" concretely is:** SSR emits the subtree inside
`<template shadowrootmode="open">` (declarative shadow DOM) with `data-nosnippet`
on the host, instead of today's pure light-DOM walk
(`packages/server/src/ssr.ts:248-267` is currently light-only and emits no shadow
markers — survey #17; this is the one new emission capability the design needs).
Human browsers attach the template natively; spec-compliant extractors read the
subtree as empty (the DA4 thesis entry's own citation, §1.3 of the domain hints);
JS-less crawlers get nothing. §7.1 is honest about the byte-level limit of DSD
sealing and `never + ssr:false` is the stronger escape (§3.3).

---

## 3. Enforcement — where the server says no

Client is never the authority. Every verdict below is computed server-side from
the sidecar-derived route table and the verified principal; the emitted client
code carries the level only as inert metadata (for devtools), never as a gate.

### 3.1 The request classification

At the top of the server handler, one classification, reusing the negotiation
logic that already exists (`packages/plugin-agent-readiness/src/content-negotiation.ts:92`
`negotiate`: `Accept: text/markdown` → machine; `Accept: text/html` → human;
crawler UA fallback → machine):

- **machine-rep request** → the level gate runs *before any render* (§3.2).
- **HTML request** → always rendered (humans are always served), but with sealed
  serialization + `X-Robots-Tag: noindex, nosnippet` headers for non-public
  routes (§2.3). A crawler spoofing `Accept: text/html` therefore obtains only
  the sealed document — spoofing the classification gains raw bytes, not an
  unsealed machine representation (residual risk in §7.1).

### 3.2 Dynamic SSR — `createServerRouter.handle`

**Site:** `packages/router/src/server.ts:31-60`, before the `renderToString` call
at `:50`. Today `handle` matches, loads, renders unconditionally. It gains:

```
createServerRouter(routes, opts?: { auth?: AuthPlugin })   // server.ts:28
handle(req):
  1. match → route.extract ?? 'public'                     // from RouteDefinition (router.ts:47-60)
  2. classify request (§3.1)
  3. machine-rep ∧ level > public:
       - never  → 404-shaped refusal (no existence confirmation)
       - agents → principal := opts.auth.verify(Authorization)   // auth/src/server.ts:125
                  deny chain of §2.2 on any failure; fail-closed if opts.auth absent
       - gated  → principal + checkScope(jwt, route.scope) or SCOPE_DENIED
  4. HTML: renderToString(component, { hydratable: true, audience })  // server.ts:50
     with sealed emission + noindex headers for non-public
```

The dependency this adds — router/server consuming `AuthPlugin` — is the same
inversion `agent-service` already made for #420; the plugin interface, not the
auth package, is the import (type-only), keeping the router deployable without
`@aihu/auth` for all-public apps (and fail-closed, never fail-open, when a
non-public route exists without an auth plugin — G1 posture, `check-governed.ts:19`).

### 3.3 Prerender / SSG — the static boundary

**Site:** `packages/app/src/prerender.ts`, route loop at `:380-400`, render call
at `:395`. Static output has no per-request gate — whatever bytes land in `dist/`
are served by any CDN to anyone. Therefore prerender derives, per route:

- `public` → prerender as today.
- `agents` / `gated` / `never` with `ssr: true` → prerender the **sealed**
  document only (DSD + nosnippet meta). The unsealed text never enters `dist/`
  as light DOM — byte-checkable (§6 DA-f).
- `never` + `ssr: false` (the existing `RouteBlock.ssr` field, `types.rs:18`)
  → **no server bytes at all**: prerender skips the route, dynamic SSR returns
  the app shell only, content renders client-side. This is the strongest
  withholding the open web permits short of human authentication, and it reuses
  a lever that already exists rather than inventing a `render:` mode.
- `agents`/`gated` markdown-for-verified-principals **cannot exist on pure
  static hosting** (no server to verify). Prerender emits no markdown siblings
  for non-public routes; the capability degrades to absent, never to open
  (weakness §7.4).

### 3.4 The agent core — one new consult in `runGate`

**Site:** `packages/agent-service/src/agent-service.ts:129` (`runGate`). The gate
gains a level consult between step 1 (404, `:141-160`) and step 2 (401,
`:205-268`), reading the level from the same compiler meta the registry already
carries (`emit.rs:4388-4461` → `agent/src/registry.ts`):

- surface `never` → **404** (not 403 — the ordering invariant at `:141-145`
  exists precisely so unauthorized callers learn nothing; a `never` surface
  should be indistinguishable from an absent one). Defense-in-depth only, since
  C481 (§4 R2) already makes `expose:` on a `never` surface uncompilable.
- surface `agents` → `needsPrincipal` forced `true` (extend the predicate at
  `:213-215`: `scope !== null || rateLimit !== null || level !== 'public'`).
- surface `gated` → effective scope = the route/surface `scope:` **met with**
  any member-level `$scope` (both must pass; most-restrictive-wins §4 R1),
  enforced at the existing step-3 site (`:270-286`).

Both entry points inherit this automatically — `handleToolCall` and the
bridge-path `authorize` (`packages/agent-server/src/agent-server.ts:379`) already
share `runGate` ("the security ordering can never diverge", `agent-service.ts:124-127`).

### 3.5 Discovery — derived advertisement

- **llms.txt** (`packages/plugin-agent-readiness/src/llms-txt.ts:104`): `public`
  listed fully; `agents`/`gated` listed with `auth: required` / the scope named
  (agents need discovery to know to authenticate — Dual-audience, not a leak of
  content); `never` **absent**. Existence of gated surfaces is deliberately
  advertised; existence of `never` surfaces is not (they have no machine
  representation to advertise).
- **agent-card / mcp-server-card** (`a2a-card.ts:51`;
  `mcp-server-card.ts:105`, skills from registry `:173`): skills filtered by
  level — defense-in-depth, since C481 keeps `never` members out of the registry
  at compile time.
- **robots.txt** (`robots.ts:172`, tiered default `:174`, served
  `vite-plugin.ts:103`): gains route-table awareness — per-route
  `Disallow: <path>` lines derived for every non-public route, appended to the
  tiered `allow-agents` policy. Still advisory (survey #12) — it is the *belt*;
  the server gate is the authority.
- **MarkdownResolver** (`markdown-resolver.ts:110-127`): the "Interactive
  capabilities" section — the survey's "agents get a superset" finding — is now
  emitted only for surfaces whose level admits the requesting principal. The
  superset stops being unconditional.

---

## 4. Composition — the truth table

Resolution rules, in order:

- **R1 — Most-restrictive-wins (the meet law).** The effective level of any
  content is the `min` over every declaration on its path: route level ∧
  component `$extract` ∧ (for members) the member's own gates. Every lever
  narrows; none widens.
- **R2 — Declared contradictions are compile errors, not runtime resolutions.**
  A combination where one declaration *promises* what another *forbids* fails
  the build: `expose:` on a `never` surface → **C481**; `$shadow: 'none'` on a
  non-public surface → **C480**; `extract: 'gated'` without a scope → **C482**.
  Rationale: a runtime "winner" between contradicting declarations means one of
  the author's two statements silently lies — the exact failure mode the survey
  documents for expose-vs-SSR.
- **R3 — `expose:` remains the only member-level agent opt-in.** `extract:`
  never exposes anything by itself; a `public` surface with no `expose:` still
  offers agents nothing callable/readable (survey #1's closed default,
  `emit.rs:3707`, is untouched).

| # | `extract:` | `expose:` | `$scope` (member) | `$shadow` | Anon crawler (HTML bytes) | Anon machine-rep (md/read) | Verified agent (md/read/call) | Verdict / winner |
|---|---|---|---|---|---|---|---|---|
| 1 | `public` | read | — | none/route-default | full light DOM | served | served, per expose | today's behavior, now declared |
| 2 | `public` | absent | — | any | full light DOM | md served; **no member reads/calls** (R3) | same | content public, capability closed — coherent, both declared |
| 3 | `public` | read | `'x'` | any | full light DOM | md served; member read → 401/403 chain | member read needs scope `x` | member gate composes beneath a public surface |
| 4 | `public` | — | — | `'open'` | **hidden from JS-less crawlers** (shadow) | md served | served | legal: `$shadow` seals *more* than `public` requires (R1 monotone) — encapsulation choice, not policy |
| 5 | `agents` | read | — | (floor: sealed) | sealed DSD + noindex | **denied** (AUTH_* chain) | served | level forces `needsPrincipal` even though member is unscoped |
| 6 | `agents` | absent | — | (sealed) | sealed | denied | md served; no member surface | content for agents, capabilities closed |
| 7 | `gated` + `scope:'r'` | read | `'w'` | (sealed) | sealed | denied | needs **both** `r` and `w` (R1 meet) | most restrictive wins |
| 8 | `gated` | any | — | — | — | — | — | **C482**: gated with no scope anywhere — undischargeable declaration |
| 9 | `never` | absent | — | (sealed) | sealed + noindex; `+ssr:false` → no bytes | **404-shaped** | **404-shaped** | the survey's missing primitive |
| 10 | `never` | read | — | — | — | — | — | **C481**: "extract nothing" ∧ "agents may read" — contradiction, build fails |
| 11 | `agents`/`gated`/`never` | — | — | `'none'` | — | — | — | **C480**: "sealed" ∧ "serialize as light DOM" — contradiction, build fails |
| 12 | absent (default `public`) | absent | — | absent | full light DOM (post-flip) | md served | md served | out-of-box posture — §5 |

**The survey's sharpest conflict, resolved explicitly (row 2 vs old world):**
"expose says private, SSR says public" dissolves because the two keywords stop
competing for the same meaning. `expose:` was never a content-privacy
declaration — it is a capability opt-in, and the survey shows authors *reading*
it as privacy because nothing else existed. Under this design the content
question has its own keyword: an author who wants the content withheld writes
`extract: 'agents' | 'gated' | 'never'` and the SSR/negotiation/discovery
boundaries enforce it (§3); an author who leaves `extract` at `public` with
`expose:` absent has declared "content public, capabilities closed," which the
framework now makes true on **both** axes instead of true on one and silently
false on the other. Where the old ambiguity would have been a real contradiction
(`never` + `expose:`), it is C481 — surfaced at build, decided by the author,
never resolved by a precedence rule they didn't write.

---

## 5. Defaults and migration

### 5.1 Default level: **`public`** — declared posture, not accidental posture

The out-of-box default is `extract: 'public'` for every surface. Reasoning:

- **The thesis demands it.** Dual-audience says agents are a first-class
  audience; a framework that hides content from machines by default contradicts
  its own §1. DA4's ratified rationale ("primary content must reach [crawlers]
  as server-rendered light DOM") is a public-by-default argument.
- **The founder's complaint is not crawlable-by-default; it is crawlable-by-default
  *without control*.** ("If we can't control the data flow… just a normal web
  framework.") The delta from a normal web framework is that here the posture is
  a *declared, derivable, per-surface* property with a real server gate behind
  every non-public level — not that the default flips to closed.
- **Migration is then non-breaking by construction** (§5.3).

Two guards keep the default honest rather than silent:

1. **The scaffold declares it.** `create-aihu` page templates write
   `extract: 'public'` explicitly (CLI scaffold site:
   `packages/cli/src/index.ts:154-168` config emission and the page template) —
   every new author sees the lever on day one, in the file, next to `path:`.
2. **The build reports the census.** The §6 check prints a per-level route count
   every run (like DA-e's informational count pre-flip), so "everything is
   public" is a stated fact in every build log, never an unexamined one.

No project-wide `extractDefault` config knob. A global knob that re-bases the
lattice per-project makes the same `.aihu` source mean different postures in
different repos — the DA4 flip spec §6 already rejected this shape for shadow
("a global knob that could drag pages back… would reintroduce the sealed-content
default"), and the argument is stronger for a security posture.

### 5.2 Change to the DA4 flip

One line of the flip spec changes meaning (§2.3 above): the default-marker rule
at `emit.rs:3285-3291` becomes `@route ∧ effective-public → 'none'`. The flip's
W472 retirement, CSS pipeline (Option A `@scope`, ratified D2), layouts-D1,
`--shadow` leaf-only semantics: all unchanged. The flip ships **with or after**
the `extract` field lands in the compiler (sequencing B) — the field must exist
for the marker rule to consult it, even though every undeclared route resolves
`public` and flips exactly as the spec already describes.

### 5.3 Upgrading existing apps

- **No declarations → no behavior change.** Default `public` reproduces today's
  crawler axis exactly (SSR already ships everything — survey #17), and the
  agent axis is untouched (R3). The feature is additive; version as minor for
  the compiler field + marker, major only if it rides the flip train (which is
  already semver-major).
- **Adopting:** annotate sensitive routes/components; the census (§5.1) and the
  compile errors (C480-C482) are the migration tooling. A codemod is not needed —
  there is no old syntax to rewrite.
- **Server opt-in:** apps with non-public routes must pass `auth` to
  `createServerRouter` (§3.2). Fail-closed: a non-public route with no auth
  plugin denies machine-reps rather than serving them — an upgrade cannot
  accidentally open anything (it can only accidentally deny, which is loud).

---

## 6. The invariant — `extract` cannot silently regress

Three enforcement layers, matching where regressions could enter:

**Compile-time (compiler test suite):** C480/C481/C482/C483 each get
should-fail and should-pass fixtures beside the existing C470/C471 tests
(`packages/compiler/src/parser/state_macros.rs` test mod, `:2432` region). These
make declared contradictions unrepresentable — the truth table's error rows are
enforced before any artifact exists.

**`check:governed` gains G4 — the content boundary is fail-closed**
(`scripts/check-governed.ts`, pattern of G1 at `:131`: stand up the real thing,
probe behaviorally):

- G4a: real `createServerRouter` over fixtures (one route per level); anonymous
  `Accept: text/markdown` request → `public` serves, `agents`/`gated` deny with
  the AUTH_* ladder, `never` refuses 404-shaped.
- G4b: **no auth plugin configured** + non-public route + machine-rep request →
  deny, never serve (the G1 posture at the new boundary).
- G4c: regression probe (like G1's always-permissive-plugin probe,
  `check-governed.ts:57`): a request presenting a *decode-only* (unverified) JWT
  must not pass — proves the boundary uses `verify`, not `decodeJwt`
  (key-provenance, the G3 concern at the content gate).

**`check:dual-audience` gains DA-f — bytes match the declaration**
(pattern of DA-c/DA-d's extractability assertions,
`scripts/check-dual-audience.ts:405-407`, `:503-505`; fixture-app shape from the
flip spec's mixed-mode e2e, §5 there):

- DA-f1: fixture routes carry per-level sentinel strings; build + prerender;
  assert `public` sentinels present as light DOM in `dist/**/*.html`, non-public
  sentinels **never present outside a `<template shadowrootmode>` subtree**, and
  the `never+ssr:false` sentinel absent from `dist/` entirely.
- DA-f2: derived-artifact agreement — for each fixture, the code marker, the
  `.route.json` level, and the agent-meta level are equal (the three-way fan-out
  of §1.3 cannot drift).
- DA-f3: discovery agreement — generated llms.txt/cards/robots contain no
  `never` surface and annotate `agents`/`gated` correctly.
- Census print (§5.1) every run; enforced counts via the existing
  `expectCount`/baseline machinery (`check-dual-audience.ts:728`).

Together: an author's declaration cannot be contradicted at compile time (C48x),
cannot be served-around at runtime (G4), and cannot rot in the emitted bytes or
advertisements (DA-f). Invariants catch classes; these are the classes.

---

## 7. Weaknesses of this approach (honest)

1. **`never` is not DRM, and DSD-sealing is byte-visible.** Sealed content still
   travels in the HTML bytes (inside `<template shadowrootmode>`); a scraper
   that parses raw bytes — rather than a spec-compliant DOM — reads it. The
   design's honest claim is narrower: every machine channel the framework *owns*
   refuses; JS-less and spec-compliant extraction gets nothing; the extraction
   channel narrows to "run a full browser and present as a human," which is the
   irreducible floor of serving unauthenticated humans at all. `never+ssr:false`
   closes even that at the cost of JS-required content. If the founder wants a
   harder `never`, the missing ingredient is human-session auth — out of this
   design's scope and arguably out of the framework's.
2. **Anonymous-human vs anonymous-crawler is not authoritatively
   distinguishable.** The §3.1 classification is spoofable by construction
   (headers are attacker-chosen). The design leans on this only for *format
   selection*, never for widening: spoofing "human" yields the sealed HTML,
   spoofing "machine" yields a denial. Still, the sealed-HTML channel of
   weakness 1 exists *because* humans must be served anonymously.
3. **Render-time level threading is new machinery.** The meet rule (§4 R1)
   requires the SSR walk (`ssr.ts:248-267`) to know each component's level
   mid-render — component descriptions/classes must carry the compiler-derived
   level to the server renderer. That is a real threading change across
   compiler-js → runtime → server, and the per-subtree DSD emission is a new
   `ssr.ts` capability (it currently emits no shadow forms at all). This is the
   design's largest implementation surface.
4. **Static hosting degrades `agents`/`gated` to absent.** With no server,
   verified-principal markdown cannot be served; those levels degrade to
   "sealed HTML only" on pure-CDN deploys. Degradation is closed-not-open, but
   an author reading the lattice may expect capabilities static hosting cannot
   deliver. Needs loud docs + possibly an adapter-time warning.
5. **The lattice is total and closed by design — which is also a limit.** Real
   intents like "public to search engines but not to model-training crawlers"
   (the robots tier distinction of #430) don't fit a total order; this design
   deliberately leaves that distinction to the advisory robots tier rather than
   the enforced lattice, because the framework cannot verify *which kind* of
   anonymous crawler is asking. If verifiable crawler identity (Web Bot Auth)
   matures, the lattice needs a revisit — the thesis's Attributed §"deliberately
   local" note anticipates exactly this.
6. **`extract:` and `middleware:`/session-auth overlap is undesigned.** Apps
   with their own human auth middleware (`RouteBlock.middleware`) get no
   composition story here — a `gated` route behind human-session middleware has
   two gates with different principals. Design B or synthesis should address it.
7. **Router→auth coupling.** §3.2 adds an `AuthPlugin` seam to
   `createServerRouter`. Type-only and optional, but it is a new cross-package
   contract that `check:governed` G4b must hold honest forever.

---

## 8. Founder decisions this design needs

1. **The default level is `public` (§5.1).** This is the framework's out-of-box
   posture and the single highest-leverage call in the design. The alternative —
   default `agents` or mandatory explicit declaration per route — trades
   thesis-coherence and zero-break migration for a closed-by-default posture.
   Recommend `public` + scaffold-explicit + census; needs ratification.
2. **`never`'s honesty clause (§7.1):** accept DSD-sealing + channel-refusal as
   the meaning of `never` for server-rendered pages, with `ssr:false` as the
   hard variant — or demand a stronger primitive (which requires human auth).
3. **Advertising gated existence (§3.5):** `agents`/`gated` surfaces are listed
   in discovery with auth annotations (agents must be able to find the door).
   If existence itself is sensitive, that listing rule needs a per-surface
   override this design did not include.
