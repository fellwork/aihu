# State — @scribe/app Track

**Track:** app
**Branch:** feat/docs-site (current working branch)
**Last updated:** 2026-05-04

---

## Current phase

**Builder dispatched 2026-05-04. User sign-off received.**

All architecture specs (A1-A4) and scout findings (S1-S3) are complete and written to `.team/app/`. The topic summary is at `.team/app/topic-summary-app.md`.

---

## Iteration counter

Builder ↔ Verifier rounds: **0 of 5** (hard-stop at 5)

---

## Planning artifacts

| Artifact | Status | File |
|---|---|---|
| Scout S1 (main.ts audit) | ✅ Complete | `scout-report-app-track.md` |
| Scout S2 (CLI scaffold audit) | ✅ Complete | `scout-report-app-track.md` |
| Scout S3 (defineScribeConfig audit) | ✅ Complete | `scout-report-app-track.md` |
| Architect A1 (ScribeConfig schema) | ✅ Complete | `spec-app-a1-a4.md` |
| Architect A2 (scribe() Vite plugin) | ✅ Complete | `spec-app-a2.md` |
| Architect A3 (@scribe/app/client) | ✅ Complete | `spec-app-a3.md` |
| Architect A4 (route param protocol) | ✅ Complete | `spec-app-a1-a4.md` |
| Topic summary | ✅ Written | `topic-summary-app.md` |

---

## User decisions (confirmed 2026-05-04)

- **Q1:** `createApp(config?)` — **Option B: inline-arg** (no virtual:scribe-config needed)
- **Q2:** Vite plugin export name — **`viteScribePlugin()`**
- **Q3:** **Reserve `adapter?: null`** in V0 ScribeConfig (prevents breaking change at V1+)
- **Q4:** Field name — **`agentReadiness`** (avoids confusion with @scribe/agent registry package)

All questions resolved. Builder pre-conditions met.

---

## V0 scope summary

IN: `@scribe/app` package (main + /client entries), `defineConfig`, `scribe()` Vite composer, `viteAppPlugin()`, `createApp()`, route param flat-attribute protocol, CLI scaffold update, blog-router migration, size-limit row.

DEFERRED: SSR/static/hybrid output modes, adapter field, `loadConfigFromFile`, `_injectAutoWiring` removal, config unification with `@scribe/server`.

---

## Do-not-break

- `@scribe/server` `ScribeConfig`/`defineScribeConfig` — not deleted or renamed
- `viteRouterIntegration` — stays directly importable
- `_injectAutoWiring` in compiler plugin — not removed in V0
- All 620 TS + 232 Rust tests passing
- No existing `.size-limit.json` row increased
