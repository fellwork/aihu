# Governed Extractability — control-surface survey (Scout, read-only)

**Effort:** `governed-extractability` · **Track:** `da4-govern` · **Branch:** `design/governed-extractability`
**Method:** code-first ground truth (docs cross-checked, code authoritative). Surveyed 2026-07-20 against
this worktree at `origin/main`. All line numbers are current as of this branch; the codebase changed
substantially on 2026-07-19/20 (verified-principal #420, robots tiering #430, markdown negotiation,
discovery-endpoint fixes all landed within the last day).

This is a **map of what exists**, not a design. Design is the next agent's job.

---

## 0. The synthesis the design needs — three axes, where they agree / conflict / have no control

The charter names three axes that are **separate mechanisms today**:

- **(a) crawler extractability** — what a JS-less crawler / HTML scraper can read: light-DOM content
  and server-rendered HTML.
- **(b) governed agent extractability** — what an authenticated agent may call/read through the
  agent core: `expose:` surface + `$scope`/`$rate-limit` + verified principal.
- **(c) authored intent** — what the author *means* a surface to be: public / agents-only / gated /
  never-extractable.

### Where the three axes AGREE

- **Agent tool-call invocation** is coherent across (b) and (c): an author writes `expose:` + `$scope`
  + `$rate-limit`, and the server gate (`agent-service.ts:129`) enforces exactly that, fail-closed,
  keyed to a signature-verified principal (`#420`). Intent → declaration → server enforcement line up.
  This is the one axis with a real, first-class, server-authoritative control today.
- **`expose:` default is closed** on axis (b): a member with no `expose:` is invisible to agents
  (`emit.rs:3707`, test `emit.rs:6947`). Intent "not for agents" is the *default*, which matches (c).

### Where the axes CONFLICT

- **The sharpest conflict: `expose:` decreases agent reach while SSR/prerender leaves the SAME content
  fully crawler-extractable.** An author who deliberately does NOT `expose:` a component believes they
  withheld it — and they did, on axis (b): no MCP tool, no agent-card skill, 404 at the gate. But the
  component's rendered text still ships in light-DOM SSR HTML (`ssr.ts:485`, `router/src/server.ts:50`,
  `prerender.ts:395`) to every crawler with no principal check. Axis (b) says "private"; axis (a) says
  "fully public." **The two axes point in opposite directions on the identical content, and nothing
  reconciles them.**
- **Content negotiation gives agents MORE, not less.** The `RouteMarkdownResolver` deliberately emits
  an "Interactive capabilities" section (`markdown-resolver.ts:110-127`) — the callable/readable
  surface that never appears in the HTML. So the agent-facing representation is a *superset* of the
  human one. If authored intent were "humans yes, agents no," the negotiation layer inverts it.
- **The DA4 flip inverts the one emergent privacy default.** Today the runtime default is `'open'`
  (shadow ⇒ not JS-less-extractable, `define-element.ts:83`). The flip (#437, warned by W472 but not
  yet implemented) makes `@route` pages default to light DOM ⇒ crawler-extractable-by-default. So the
  only lever that incidentally protects content on axis (a) is being *removed* as a default — which is
  precisely why this control must be designed first (charter §Why).

### Where there is NO control at all

- **An author cannot declare "server-render this for humans but do NOT let agents/crawlers extract
  it."** Grep across `packages/**/*.ts` for `noindex`, `data-nosnippet`, `never-extractable`,
  `agents-only`, `noai`, `extractable` returns **zero** enforcement sites. There is no per-surface
  intent primitive on axis (c). The only knobs are: `$shadow` (couples encapsulation to extractability,
  emergent), robots.txt (advisory), the agent-tool gate (doesn't touch HTML). None expresses "extract:
  never" for server-rendered content.
- **Axis (c) has no dedicated declaration.** Intent is *inferred* from other mechanisms (component
  type → shadow; `expose:` presence → agent visibility) rather than *declared*. There is no field an
  author writes that means "this is public" vs "this is gated" vs "this is never-extractable" as such.

**Net:** the agent-invocation axis (b) is well-governed and server-enforced; the crawler-extraction
axis (a) is ungoverned (SSR ships everything, robots is advisory, shadow is emergent and flipping
open); axis (c) has no first-class expression and is silently contradicted whenever (a) and (b)
disagree on the same content.

---

## 1. Per-mechanism control table

Layer key: **C** compiler (Rust) · **Cjs** compiler Vite plugin (JS) · **RT** runtime · **AS**
agent-service · **ASrv** agent-server · **AUTH** auth · **PL** plugin-agent-readiness · **SRV** server ·
**CI** test gate. Axis: (a) crawler / (b) agent / (c) intent.

| # | Mechanism | file:line | Layer | Axis | What it gates | Default | Enforcement | Known gaps |
|---|-----------|-----------|-------|------|---------------|---------|-------------|------------|
| 1 | **`expose:`** (per-member agent opt-in) | parse `parser/state_macros.rs:1175` → `CollectionEntry.meta` `types.rs:354`; gate `codegen/emit.rs:3695-3752` (read `:3708`, write `:3709`); emit `emit.rs:3817-3856`, JSON sidecar `emit.rs:4388-4461` | C | (b) | Whether a `$prop`/`$computed`/`$action` is agent-readable/callable | **Hidden** — no `expose:` ⇒ member reaches no artifact (`emit.rs:3707`, test `:6947`) | **Server-side** allowlist at gate `agent-service.ts:185-192` | **`expose:{write:true}` is inert** — bucketed `emit.rs:3743` but never emitted (`registry.ts` has no `writes`), no `setSignal` server path (`agent-service.ts:353-365`). Gate uses substring `.contains("read: true")` `emit.rs:3708` — whitespace-fragile |
| 2 | **`describe:`** (agent-facing docs) | parse `state_macros.rs:1175`; collect `emit.rs:3684`, gated-by-expose `emit.rs:3760`; emit `emit.rs:3831,3846`; `ActionSchema.describe` `agent/src/registry.ts:54` | C | (b) | Nothing — enriches agent-facing text (MCP tool desc, cards, llms.txt) | `''` / omitted; every consumer has synth fallback | Not a gate; **inherits** expose (dropped for unexposed members `emit.rs:3760`) | Silent discard for unexposed members — no author diagnostic |
| 3 | **`$scope`** (governed access) | parse `parser/agent_macros.rs:37`, enum `types.rs:459`; emit server-only `emit.rs:3943`, `emit.rs:4211`; binding `arbor/src/mount.ts:399`; gate `agent-service.ts:275-286` | C→AS | (b) | Requires a JWT bearing the named scope for the tool | `undefined` = **unscoped** (dispatches freely) | **Server, fail-closed** (`checkScope(...)!==true` ⇒ 403 `SCOPE_DENIED`) | Compile-time `$scope` is warn-only (`emit.rs:3916`); no build-time proof `@aihu/auth` is wired |
| 4 | **`$rate-limit`** (budget) | parse `agent_macros.rs:53` (`C421` if non-int), enum `types.rs:461`; emit `emit.rs:3947` (unit hardcoded `/min` `:3948`); gate `agent-service.ts:315-333` | C→AS | (b) | Per-`verifiedSub:tag` quota | `undefined` = **unthrottled** | **Server, fail-closed** — no plugin ⇒ 429 `RATE_LIMIT_MISSING` (`agent-service.ts:316`) | Unit hardcoded `/min` at emit — `sec`/`hour` (parsed by limiter `rate-limiter.ts:30`) unreachable from the directive |
| 5 | **Verified-principal gate** (#420) | `runGate` step 2 `agent-service.ts:194-269`; `verify` primitive `auth/src/verified-plugin.ts:53` → `auth/src/server.ts:125` (HMAC-SHA-256 via `crypto.subtle`) | AS+AUTH | (b) | Resolves the principal for any `$scope`/`$rate-limit` tool from a **signature-verified** JWT `sub`; caller `userId` never trusted | Un-gated tools require nothing | **Server, fail-closed chain**: no plugin→`AUTH_MISSING`, no `verify`→`AUTH_UNVERIFIABLE`, no JWT→`AUTH_REQUIRED`, bad sig/`sub`→`AUTH_INVALID` | **No `exp`/`nbf` check** — `verifyJwt` verifies signature only (`server.ts:125-147`); a signed-but-expired token passes |
| 6 | **Serving gate order** (404→401→403→429) | `agent-service.ts:129-336`, ordering const `:9,142` | AS | (b) | The single authoritative agent-tool-call gate; predicate `needsPrincipal = scope()!==null OR rateLimit()!==null` `:213-215` | Un-scoped/un-limited ⇒ passes | **Server**; reused by `agent-server.ts:379` (`authorize`) before handshake | Gates **tool calls only** — a crawler reading SSR HTML never touches it. Allowlist unenforceable when compiler `meta` absent (`:178-184`) |
| 7 | **Bridge handshake verification** (G2) | `checkHelloProtocol` `agent-server.ts:204-220`; `callTool` `:379-389` (503 `BRIDGE_UNVERIFIED`) | ASrv | (b) | Channel-as-authority: refuses tool delegation over an un-handshaken bridge | Fresh channel = unverified | **Server, fail-closed** — timeout ⇒ rejected (`:290-313`); no inherited status | — |
| 8 | **Rate-limiter store** (budget tracking) | `scraping/src/rate-limiter.ts:59-111`, check `:80` | SRV plugin | (b) | Tracks/decrements the quota | — | **Server, authoritative**, in-memory | **Fails OPEN at `maxKeys` capacity** (default 100k, `:88-94`) — the one intentional fail-open. **Per-process `Map`** (`:64`) — not distributed; quota is per-instance, not global |
| 9 | **light/shadow rendering (`$shadow`)** | parse `state_macros.rs:268-299` (`C471`), type `types.rs:412`; marker emit `emit.rs:3189,3285-3291`; consumer `compiler/js/index.ts:1193-1237` (`_injectShadowMode` `:107`); attach `runtime/define-element.ts:26-40,83`; light mount `define-component.ts:257,266,272` | C/Cjs/RT | **(a)** | Shadow (`open`/`closed`) ⇒ content NOT JS-less-extractable; light (`none`) ⇒ in light DOM ⇒ extractable | **`'open'`** (shadow) — `define-element.ts:83` | Build-time codegen + runtime attach; **no crawler gate** — "render light" and "expose to crawler" are the same act | **Emergent, not declared** — couples DOM encapsulation to extractability; author cannot decouple "light for humans" from "hidden from crawlers". Charter's `packages/plugin/src/index.ts` hint is **wrong package**; real site is `compiler/js/index.ts:1142` |
| 10 | **DA4 classifier warning** (`route_shadow_flip_warning`) | `compiler/src/lib.rs:176-211`, called `:147` | C | (a)/(c) | Emits **W472** advising `@route` pages will default to light DOM in the next major | Routeless ⇒ no warn (stays `'open'`) | **stderr only, non-fatal — changes NO output** | The `@route→light` rule is **NOT applied to codegen**; D1 ("layouts default `shadowMode:'none'`") is **planned only**, not implemented (`00-charter.md:14-16`) |
| 11 | **Content negotiation / MarkdownResolver** | `plugin-agent-readiness/src/content-negotiation.ts` (`negotiate` `:92`, UA sniff `isAiCrawlerUserAgent` `:23`); resolver `markdown-resolver.ts:68,137`, capabilities section `:110-127` | PL | (a)+(b) | Serves markdown to agents/crawlers vs HTML to humans; precedence: `Accept:text/markdown`→md, `Accept:text/html`→html always, else crawler-UA→md, else html | Falls through to HTML; `userAgentFallback` default `true` `:65` | **Opt-in library** — **NOT wired into any default pipeline** (only barrel re-exports); withholds nothing | Gives agents a **superset** (capabilities the HTML never shows). Not on by default — an author must mount it |
| 12 | **robots.txt tiered `allow-agents`** (#430) | `plugin-agent-readiness/src/robots.ts` — default `:174`, registry `:33-107`, fetchers `Allow` `:211`, trainers `Disallow` `:213`; served `vite-plugin.ts:103` | PL | (a) | Advises crawlers which of 13 known AI bots may crawl | **`'allow-agents'`** — user-fetchers `Allow: /`, training-crawlers `Disallow: /`, wildcard `*` `Allow: /` | **ADVISORY only** (RFC 9309 voluntary; CDN overrides) — header comment `robots.ts:13-15` | Not a server gate; a non-compliant scraper ignores it entirely |
| 13 | **llms.txt / llms-full.txt** | `plugin-agent-readiness/src/llms-txt.ts` (`generateLlmsTxt` `:104`, components `:90-95`); served `vite-plugin.ts:58,75` | PL | (b) | Advertises site summary + each agent component's tag/describe/actions/state | Empty components section omitted | Advertising surface (not a gate); derived from live registry at build/request | Exposes the callable/readable surface to any reader — advertising, no access control. Weak adoption evidence (see negotiation manifest §3) |
| 14 | **agent-card.json (A2A)** | `a2a-card.ts:51`; served `vite-plugin.ts:116`; canonical `/.well-known/agent-card.json` `:18`, deprecated alias `/.well-known/agent.json` `:133-141` | PL | (b) | Advertises A2A agent card (name/url/version/skills/capabilities) | `capabilities.streaming/pushNotifications` false; requires `a2aCard`+`siteUrl` | Advertising surface | Deprecated `agent.json` alias still served (with `Deprecation` header) |
| 15 | **mcp-server-card.json** | `mcp-server-card.ts:105`; tools from registry `skillsFromRegistry` `:173`; auth issuer-only `:121-122`; served `vite-plugin.ts:90` | PL | (b) | Advertises MCP tools (derived from `@aihu/agent` registry), transport, capabilities, auth issuer | `capabilities {tools:true,resources:false,prompts:false}`; requires `endpoint` | Advertising surface; **explicitly non-spec** (`:1-13`, SEP-1649 closed) | Emits only OAuth issuer origin; deliberately does NOT advertise unserved `/.well-known/oauth-*` |
| 16 | **mcp.json discovery** | `mcp-discovery.ts:35`; served `vite-plugin.ts:146` | PL | (b) | Points at the server-card URL | Opt-in (`mcpDiscovery`) | Advertising surface; non-spec (`:1-10`) | — |
| 17 | **SSR / prerender (the extractable surface)** | core `server/src/ssr.ts` (`renderToString` `:485`, light-DOM only `:248-267`); handler `router/src/server.ts:50`; SSG `app/src/prerender.ts:245,395` | SRV | **(a)** | What server-rendered HTML contains = the crawler-extractable surface | **Emits full light-DOM HTML to everyone** — no UA sniff, no principal check | None — identical HTML to human and crawler | **Emits no shadow markers, no `<template shadowrootmode>`, no markdown** — pure light-DOM HTML. Any server-rendered content is, by construction, crawler-extractable |
| 18 | **`superseded_by IS NULL AND sign_off`** (data-repo doctrine) | **ABSENT** — grep hits only `00-charter.md:41` (docs) | — | — | — | — | **Not implemented in this repo** — cross-repo doctrine cited by the charter; no such predicate in aihu TS/Rust source |
| 19 | **`check:governed`** invariant (CI) | `scripts/check-governed.ts` (G1 `:131`, G2 `:299`, G3 key-provenance `:471`) | CI | (b) | Asserts declared controls are server-enforced, fail-closed, non-no-op, keyed to verified `sub` | — | **CI test gate** (behavioral — stands up a real `AgentService`), not a runtime gate | Guards axis (b) only; nothing analogous exists for axis (a) crawler extraction |

---

## 2. Gaps — things an author CANNOT currently control

- **No "server-render for humans, hide from crawlers/agents" primitive.** The core founder ask has no
  mechanism. SSR/prerender (`ssr.ts:485`, `router/src/server.ts:50`, `prerender.ts:395`) ship the same
  light-DOM HTML to every requester with no principal check and no per-surface withholding. (axis c/a)
- **No declared extractability intent at all.** No `extract:`, `noindex`, `agents-only`, or
  `never-extractable` field exists (grep: zero enforcement sites). Intent is only ever *inferred* from
  component type (shadow) or `expose:` presence — never *declared*. (axis c)
- **Cannot decouple light-DOM rendering from crawler-extractability.** `$shadow` is one knob:
  `'none'` = light = extractable, `'open'` = shadow = hidden. An author who wants light-DOM styling/SSR
  parity for humans but NOT crawler-readability has no option. (axis a)
- **`expose:` withholding is silently contradicted by SSR.** Not exposing a component hides it from the
  agent core but leaves its rendered content in crawlable HTML. The author gets no signal that the
  "private" content is still fully public to scrapers. (axis a vs b)
- **Cannot grant agent WRITE access.** `expose:{write:true}` parses and gates but is inert end-to-end
  (`emit.rs:3743` bucketed, never emitted, no `setSignal` path). Author intent silently no-ops. (axis b)
- **Cannot express sub-minute or hourly quotas from the directive.** `$rate-limit N` hardcodes `/min`
  at emit (`emit.rs:3948`) though the limiter parses `sec|min|hour`. (axis b)
- **Cannot rely on token expiry.** The verified-principal gate checks signature only, not `exp`/`nbf`
  (`auth/src/server.ts:125-147`) — a leaked signed token is valid indefinitely. (axis b)
- **Cannot get distributed / capacity-safe rate limiting.** Budget is a per-process in-memory `Map`
  (`rate-limiter.ts:64`) that fails OPEN at `maxKeys` (`:88`). Across instances or under key pressure,
  the quota is not authoritative. (axis b)
- **Cannot turn content negotiation into a withholding control.** It is opt-in, unwired by default, and
  gives agents a *superset* of the human surface — it cannot express "agents get less." (axis a/b)
- **robots.txt / discovery cards are advertisements, not gates.** robots is advisory (CDN-overridable);
  llms.txt / agent-card / mcp-server-card publish the callable surface to any reader. None enforce
  access. (axis a/b)

---

## 3. Notes for the Architect (what the design must reconcile)

- The **only server-authoritative control today is the agent-tool gate** (`agent-service.ts:129`,
  axis b). It gates *invocation*, not *reading of rendered content*. Any "governed extractability"
  design must add an equivalent authoritative gate on the **SSR/crawler surface** (axis a), because
  that surface currently has none.
- **`expose:`, `$scope`, `$rate-limit`, verified-principal, `check:governed`** form a coherent,
  tested, fail-closed stack for axis (b). The design should *compose with* it, not replace it — but
  note `expose:` today only models agent visibility, not crawler visibility, so it is a candidate
  anchor for a unified declaration only if extended.
- The **light/shadow lever (axis a) is emergent and about to flip open** (W472 → #437). Whatever
  declared control is designed must land *before or with* the flip (charter sequencing B), or
  crawlable-by-default ships with only the scattered escape hatches enumerated above.
- **Charter hint correction:** the shadow-mode marker consumer is `packages/compiler/js/index.ts:1142`
  (`aihuCompilerPlugin`), **not** `packages/plugin/src/index.ts` (which has zero shadow logic).
- **`superseded_by IS NULL AND sign_off` does not exist in this repo** — it is data-repo doctrine cited
  by the charter, not an aihu serving predicate. The aihu serving path is `router/src/server.ts` +
  `ssr.ts` with no sign-off/supersede gate.
