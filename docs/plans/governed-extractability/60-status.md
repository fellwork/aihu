# Governed Extractability (GX) — status

Live status of the GX build. Thesis: `docs/architecture/thesis.md` §GX (ratified 2026-07-21).
Design of record: `40-spec.md` (+ `50-credential-lifecycle.md`). Tracking epic: GitHub #464.

## Shipped — the compliance tier (in `main`)

An author writes one declaration and the framework derives every discovery surface + the
gate decision from it, provably drift-free:

```
@route { path: '/pricing', extract: { read: 'agents', call: 'anonymous' } }
```

| PR | What |
|---|---|
| #457 | Security: JWT `exp`/`nbf`/`aud` validation + fail-closed rate limiter |
| #458 | Thesis amendment §GX ratified |
| #459 | Phase 0: auth routes verify tokens before cookieing (P7/P8) |
| #460 | Design record published (spec + credential-lifecycle + charter) |
| #461 | Phase 1: `extract:` two-axis vocabulary, compile-error composition, three-artifact fan-out (compiler binary 0.1.12) |
| #462 | Phase 2: principal gate (`resolvePrincipal`/`decideEmission`) + `call:` axis + unified bot registry |
| #463 | Phase 3: robots.txt / `noindex` / discovery derived per-route from `read:` |

**What the compliance tier is:** `read:` derives per-route robots directives
(searchers + user-directed AI fetchers allowed, training crawlers disallowed under the
`'agents'` default), `noindex` signals, and discovery-doc listings; `call:` is enforced at
the serving gate as a ceiling over `expose:`/`$scope`. Undeclared apps are byte-identical
to today. **It is compliance-tier — advisory, honored by compliant self-identifying
crawlers, defeated by a UA-spoofer.** (Thesis §GX honest ceiling.)

## Shipped — the hard tier (in `main`)

Control is *hard* (a verified principal + server-held data, not advisory) for
`read: verified|{scope}|human`. An author declares a governed data type beside the policy;
the framework generates the loader that gates the whole data path:

```
@route { path: '/lexicon/[slug]', ssr: true,
         extract: { read: { scope: 'members' }, call: { scope: 'members' } },
         data: { type: 'LexiconEntry', preview: ['headword'] } }
```

| PR | What |
|---|---|
| #470 | Ratified design — the governed data-access boundary (`70-governed-data-access.md`): generated loaders + live entitlements |
| #471 | P3 keystone — `--target server` renders a compiled route server-side (pure Node, no DOM); compiler binary 0.1.13 |
| #472 | Phase 4 gate engine — `createGovernedRegistry` (provider + entitlement), the generated loader pipeline, `Entitled<T>`/`Withheld<T>`, memo + positive-only TTL cache, `runGate` call-axis stage, P5/I2s guard |
| #473 | Phase 4 compiler + integration — `@route data:` parse, generated withheld type (unguarded `route.data` is a compile error), P3 item-2 server render, the render seam threading gated data into SSR; binary 0.1.14 |
| #474 | Phase 5 invariants — `check:governed` G4a-c/G5a-c + `check:dual-audience` DA-f1-3, each proven to bite (self-tests both directions) |
| #475 | Runtime registry governed — `registerAgentMetadata` carries `extract`, byte-agreeing with the sidecar as a fourth artifact; binary 0.1.15 |

**What the hard tier is:** a governed route's data is fetched server-side **only after** a
verified principal passes the static token-scope meet **and** a live entitlement resolver
(e.g. "is this Fellwork member's subscription active *right now*"); withheld responses are
byte-verified clean of the governed payload across HTML **and** the loader JSON, and the
provider is never even called. Fail-closed distinguishes `entitlement` (403 denied) from
`unavailable` (503 — an outage is never a verdict). The same gate serves SSR, the E3 data
endpoint, and the agent `call:` axis from one per-request memo. The G4/G5/DA-f invariants
make every guarantee above non-regressable at build time. Undeclared apps are byte-identical
to today.

**Honest ceiling in practice:** entitled dual-audience currently holds for **direct
interpolations**; entitled-only content inside a structural `{#if}`/`{#each}` guard is not
yet in the server HTML (the SSR structural walk is the remaining P3 slice, #465). The
withholding guarantee is unaffected — the Phase-5 G5c check and the e2e test auto-tighten
the moment that slice lands.

## Remaining

- **#437 — the DA4 light-DOM flip (Phase 6).** Page-level components default to
  `shadowMode: 'none'` so server-rendered content reaches non-JS crawlers; leaf components
  keep shadow encapsulation. A **breaking, next-major** change, gated on a light-DOM
  slot-projection prerequisite — held for a founder decision on release approach.
- **#465 — the P3 SSR remainder.** Structural directive SSR walk (the highest-value item —
  it lifts entitled dual-audience beyond direct interpolations), reactive/tuple leaf
  rendering, `$suspense`/`@stream` boundaries, hydration parity, host-less lifecycle.

## The honest ceiling (never claim above this)
Anything an anonymous human can see, an anonymous scraper can extract. Anonymous-crawl
control is compliance-tier; hard control exists only for content behind a verified
principal AND server-held. No aihu artifact or claim may state control above this.
