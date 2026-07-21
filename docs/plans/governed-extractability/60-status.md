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

## In progress — the hard tier (founder go given)

Makes control *hard* (a verified principal + server-held data, not advisory) for
`read: verified|{scope}|human`. Sequenced:

1. **SSR infra prerequisites — #465 (P3/P4/P5).** SSR of compiled routes must actually
   render (`resolveComponent` returns null today), the hydration rail wired, streaming
   fixed. The largest, least-predictable chunk — real framework internals, investigate-first.
2. **Phase 4 — hard tier / data-layer — #466.** Server-held emission (E1), governed chunks
   split from the public graph (E2), gate-served data (E3), SSR/state/loader filtering (E4),
   client placeholder guard (E5), byte-check hard sentinels absent from dist HTML+JS (E6);
   RevocationStore consult on the verify path. Depends on #465.
3. **Phase 5 — invariants — #467.** `check:governed` G4/G5 + `check:dual-audience` DA-f, so
   the control is non-regressable at build time.
4. **Phase 6 — the DA4 light-DOM flip (#437)** lands into GX (`$shadow` is now pure
   encapsulation).
5. **Compiler one-liner — #468.** Runtime `registerAgentMetadata` carries the `extract`
   member (sidecar path is fully governed today; runtime-registry path defaults safe).

## The honest ceiling (never claim above this)
Anything an anonymous human can see, an anonymous scraper can extract. Anonymous-crawl
control is compliance-tier; hard control exists only for content behind a verified
principal AND server-held. No aihu artifact or claim may state control above this.
