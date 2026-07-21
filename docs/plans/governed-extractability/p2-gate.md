# GX Phase 2 — the principal gate (#437-GX)

**Spec:** `40-spec.md` §4.1–§4.3, §12 Phase 2 · **Branch:** `feat/gx-phase2-gate`
**Consumes:** Phase 1's `extract` declaration (`p1-vocabulary.md` — the
`.route.json` / agent-meta `extract` member and the `// @aihu:extract` marker).
**Scope:** TS-only. No compiler change, no render-path change.

---

## What this phase makes real — and what it does not

Phase 2 makes the **`call` axis** (agent-callability) real: the serving gate
now reads a surface's compiled `extract.call` policy and enforces it on every
tool call, through one shared principal gate. It also unifies the bot
registry and builds the anonymous-UA tier classifier.

The **`read` axis** (crawl-visibility) is **NOT enforced by this phase**.
`decideEmission` returns the correct decision for `read` surfaces — so
Phase 3 (compliance-tier derivation: robots/headers/origin UA refusal) and
Phase 4 (hard-tier SSR withholding + the bundle/data boundary) can consume it
— but nothing downstream acts on a `read` decision yet. Any claim that
`read:` is enforced before Phases 3/4 ship would be marketing above the
ceiling (spec §1.4). Deliberately deferred, not faked.

Also out of this phase: issuance (`signJwt`, consent, `/auth/authorize` —
Phase 2b), robots.txt/llms/discovery OUTPUT derivation (Phase 3), SSR
withholding / server-only emission / governed chunks (Phase 4, blocked on the
P3/P4/P5 prerequisites), and the G4/G5 + DA-f invariants (Phase 5).

---

## 1. `principal-gate.ts` — the module

`packages/agent-service/src/principal-gate.ts`, beside `runGate`. Two
functions, exported from the package barrel.

### 1.1 `resolvePrincipal(source, deps) → Principal`

One principal per request. Resolution order (spec §4.1):

1. **Bearer credential** → `deps.authPlugin.verify` — the SAME
   signature-verifying primitive the tool gate has used since #420
   (`verified-plugin.ts` → `verifyJwt` with the #457 claim discipline).
   Never `decodeJwt`, never caller-supplied identity. Verified claims with a
   usable `sub` yield an **agent principal**.
2. **Host-verified session** (`source.session`, resolved by the host via
   `getAuthState` — injection keeps this package auth-library-agnostic, the
   `resolveAuth` posture) → `human-session`.
3. Otherwise **`anonymous`**, carrying:
   - `uaTier` from the injected bot-registry classifier
     (`classifyBotUserAgent`, §3) — `'searcher' | 'user-fetcher' |
     'training-crawler' | null`;
   - `credentialFailure` — WHY no verified principal exists, one rung of the
     #420 fail-closed ladder in its original order:
     `no-auth-plugin` → `unverifiable-plugin` → `no-credential` →
     `invalid-credential` → `no-subject`.

A presented-but-invalid credential resolves to anonymous — verification
failure never yields more access than sending nothing. A failed Bearer beside
a valid session yields the session (exactly what sending no Bearer would).

**Principal classes** (classification is by presentation channel until
Phase 2b's minted `typ:'agent'`/`act` claims exist):

| Class | Meaning |
|---|---|
| `anonymous` | No verified principal; carries `uaTier` + `credentialFailure` |
| `verified-agent` | Signature-verified Bearer JWT, no scopes in claims |
| `scoped-agent` | Signature-verified Bearer JWT carrying ≥ 1 scope (`scope`/`scp`/`scopes`) |
| `human-session` | Host-verified session (cookie → `getAuthState`) |

### 1.2 `decideEmission(principal, query, deps) → EmissionDecision`

One decision function, one axis per query. Decisions carry
`allow`, the enforcement `tier` (`'compliance' | 'hard'`), and on deny a
`code` (401/403/404), a machine `reason`, and the human `message` (for the
tool path, the exact #420 envelope messages).

**`call` axis** (hard tier, ENFORCED — spec §4.2 T1):

- `'none'` → 404 for every principal class, shaped like "does not exist"
  (compile-time C481 already empties such surfaces; this is defense-in-depth,
  and a credential never distinguishes closed from absent).
- `'anonymous'` → today's semantics byte-for-byte: only member `$scope` /
  `$rate-limit` demand a principal.
- `'verified'` → `needsPrincipal` forced for every member; any verified
  principal (agent or human session) qualifies.
- `{ scope }` → a verified principal carrying the surface scope, **met** with
  the member's own `$scope`.

**The meet / ceiling law** (spec §3 R1/R3): the effective requirement is the
UNION of surface and member requirements. `extract.call` is a ceiling over
per-member `expose:`/`$scope` — it can only add requirements, never satisfy,
waive, or widen one:

- exposed member ∧ `call:'none'` → denied (the ceiling closes the surface);
- `call:'verified'` ∧ member `$scope: 'x'` → verified AND `x` (no waiver);
- `call:{scope:'a'}` ∧ member `$scope: 'b'` → both `a` and `b` must pass
  (surface ceiling checked first, then the member's own gate);
- `call:'anonymous'` grants nothing a member didn't already have.

**`read` axis** (DECIDED only — spec §2.1 tier break):

- compliance values bind only declared anonymous crawler tiers:
  `'all'` refuses nobody; `'agents'` refuses `training-crawler`; `'search'`
  refuses `training-crawler` + `user-fetcher`; `'none'` refuses all three
  tiers. Unclassified anonymous requesters (humans, per the honest ceiling)
  always pass; verified principals always pass compliance values.
- hard values require the matching verified principal: `'verified'` any;
  `'human'` a human session only (agents → 403 `HUMAN_ONLY`); `{ scope }` a
  verified principal carrying the scope. Anonymous → the 401 ladder.

### 1.3 `surfaceCallPolicy(meta) → ExtractCallValue`

Reads `extract.call` off a compiled `AgentMetadata` entry (the agent-meta
artifact rides the spec-mandated open index signature). Absent `extract` or
absent `call` key → `'anonymous'` (the resolved default — byte-identical to
the pre-GX registry). A present-but-malformed `call` value → `'none'`,
fail-closed: a corrupted policy is refused, never rounded to open.

## 2. The `runGate` refactor

`agent-service.ts` steps 2+3 (the AUTH_* ladder + scope check) now route
through `resolvePrincipal` + `decideEmission`. Deliberate parity choices:

- The scope predicate is injected as
  `(s) => authPlugin.checkScope(jwt, s) === true`, so the member-scope
  decision is byte-for-byte the check the gate always ran — including
  third-party `checkScope` semantics (the a2a/acp attribution suites use a
  non-claims `checkScope`; they stay green untouched).
- 401 envelopes keep `authDiscoveryUrl`; 403s never carry it (#420 tests).
- The rate-limit consult (step 4) stays in `runGate`, keyed
  `${principal.sub}:${tag}` — same keys as the old `verifiedSub` (#420 G3
  key provenance unchanged).
- Error ordering invariant preserved: 404 (absent/closed) → 401 → 403 → 429.
- `handleToolCall` and `authorize` both flow through the one `runGate`, so
  the agent-server capability-bridge path inherits the call axis for free.

## 3. Bot-registry unification + the search tier

`packages/plugin-agent-readiness/src/robots.ts`:

- `BOT_REGISTRY` — the ONE registry, three tiers
  (`searcher` / `user-fetcher` / `training-crawler`). The 13 AI bots of #430
  are unchanged in membership, tier, and order; five search bots are added
  (`Googlebot`, `Bingbot`, `DuckDuckBot`, `Baiduspider`, `YandexBot`).
- `AI_BOT_LIST` / `AI_USER_FETCHER_BOTS` / `AI_TRAINING_CRAWLER_BOTS` are
  still derived, still exactly #430's lists — **no bot dropped** (tested
  against the verbatim 13-name list). Search bots never enter them, so
  robots.txt output and markdown negotiation are byte-identical.
- `classifyBotUserAgent(ua) → BotTier | null` — substring, case-insensitive,
  **longest-token-first** so a `Googlebot-Extended` UA classifies as the
  trainer it is, never as plain search. This is the classifier
  `resolvePrincipal` consumes (injected — agent-service takes no dependency
  on the readiness plugin) and the classification Phase 3's `read:`
  derivation will consume.
- `isAiCrawlerUserAgent` is now a two-tier view over the same classifier
  (`user-fetcher ∨ training-crawler`) — the last separately-built pattern is
  gone.

robots.txt OUTPUT derivation from `read:` is deliberately NOT wired
(Phase 3); a test pins that no search bot appears in any `aiAgents` policy
output.

## 4. Per-test mapping

`packages/agent-service/tests/principal-gate.test.ts` (38):

| Requirement | Tests |
|---|---|
| Four principal classes from representative requests | `resolvePrincipal — principal classes` (anonymous, no-plugin, decode-only, forged→anonymous, no-sub, verified-agent, scoped-agent incl. `scp`, human-session, failed-Bearer+session, Bearer-over-session) |
| Anonymous UA classification via the registry | `resolvePrincipal — anonymous UA classification` (4) |
| `call:'none'` + exposed member → denied | `decideEmission × call axis` first case (all four classes) |
| `'verified'` + anonymous → 401 / + valid principal → allowed | ladder + allow cases, incl. exact envelope message and AUTH_MISSING/UNVERIFIABLE/INVALID discrimination |
| `{scope}` match/mismatch, meet, ceiling-not-grant | MEET + CEILING cases; injected `hasScope` parity probe |
| `read` decisions for Phase 3/4 | `decideEmission × read axis` (8 cases across all values × tiers) |
| Metadata → policy normalization (default open only when undeclared; malformed fails closed) | `surfaceCallPolicy` (4) |

`packages/agent-service/tests/call-axis.test.ts` (14, live `handleToolCall`):
closed surface 404 shaped like absent tag (with and without a valid
credential), `call:'verified'` anonymous 401 / verified 200 / forged 401 /
no-plugin AUTH_MISSING, `call:{scope}` pass/403/meet-both-directions,
no-declaration and declared-default byte-parity, malformed→404, ordering
invariant (unknown action 404 before call-axis 401).

`packages/plugin-agent-readiness/tests/bot-registry.test.ts` (12): the
verbatim #430 13-bot no-drop check, tier-split parity, search-bots-never-in-
AI-lists, robots output untouched, classifier mapping
(GPTBot→training, ChatGPT-User→user-fetcher, Googlebot→searcher,
Googlebot-Extended→training via longest-match, browser/curl→null,
Applebot-vs-AppleWebKit guard), `isAiCrawlerUserAgent` behavioral no-drop
over all 13.

Regressions (unchanged files, green through the refactor):
`verified-principal.test.ts` (#420 incl. rotated-userId same-bucket),
`live-dispatch.test.ts`, `mcp-scope-compliance.test.ts`,
`agent-a2a`/`agent-acp` attribution (46), `check:governed` (G1–G3),
`check:attributed`.

## 5. Known residual (flagged, not hidden)

The compiler's **runtime** `registerAgentMetadata({...})` emission does not
yet include the `extract` member — only the agent-meta **sidecar** and
`.route.json` carry it (both from the same `ResolvedExtract`). A service fed
from sidecar-derived `manifests` is fully governed today; a service reading
only the runtime registry sees no declaration and correctly falls back to
`'anonymous'` (the resolved default — same posture the compiler resolved for
an undeclared surface, so nothing is silently loosened; a DECLARED non-default
`call:` does not reach that path yet). Wiring `extract` into
`emit_agent_metadata_registration` is a small Rust change, out of this
phase's TS-only constraint — tracked for the next compiler touch (Phase 3
already edits the emitter's derivation surface).
