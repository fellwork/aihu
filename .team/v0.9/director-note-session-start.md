# Director Note — v0.9 Session Start

**Date:** 2026-05-03
**Track:** plan-a
**Milestone:** v0.9 — Docs and testing pass
**Preceding:** v0.8 CLOSED (PR #43 — @aihu/cli scaffolder + migrate command; fix commit 90c95dc)

---

## On-thesis assessment

v0.8 shipped cleanly. The @aihu/cli package provides `aihu app`, `aihu page`, `aihu component`,
`aihu plugin`, and `aihu migrate` commands. Hello World template is complete. The only v0.8
deficiency was the check-size-rows classification fix (resolved at 90c95dc).

The framework is now at v0.8. The v0.9 milestone is explicitly the **docs and testing pass** — no new
features. Per the v1 framework plan §v0.9, this is also the release-pipeline rehearsal.

---

## v0.9 scope (per framework plan §v0.9)

**Theme: Documentation site at `docs/site/`, end-to-end test coverage, dep-free re-audit. No new features.**

| Sub-item | Description | Priority |
|----------|-------------|----------|
| v0.9.1 | `docs/site/` Markdown site — Getting Started, API Reference per package | HIGH |
| v0.9.2 | End-to-end test coverage — integration test suite that exercises aihu app scaffold → dev server flow | HIGH |
| v0.9.3 | Dep-free re-audit — verify zero non-@aihu/* runtime deps across all packages | MEDIUM |
| v0.9.4 | v1.0 release-pipeline rehearsal — dry run of release process | MEDIUM |
| v0.9.5 | `llms.txt` and MCP support validation — verify all contract surfaces are reachable via MCP | MEDIUM |

**v0.9 is scope-frozen for features.** Any new capability surfaced during docs/testing work is
deferred to v1.0 open issues.

---

## Priority routing for Builder

For the first Builder dispatch, target **v0.9.1 + v0.9.3** in parallel:

**v0.9.1:** Create `docs/site/` with the following Markdown files:
- `docs/site/index.md` — overview and quick-start
- `docs/site/guides/getting-started.md` — `npx aihu app` through running Hello World
- `docs/site/api/signals.md` — `@aihu/signals` public API
- `docs/site/api/arbor.md` — `@aihu/arbor` public API
- `docs/site/api/runtime.md` — `@aihu/runtime` public API
- `docs/site/api/router.md` — `@aihu/router` public API
- `docs/site/api/server.md` — `@aihu/server` public API
- `docs/site/api/cli.md` — `@aihu/cli` commands reference

**v0.9.3:** Run dep audit: `grep -r "from '" packages/*/src/ | grep -v "@aihu/"` to confirm zero
non-builtin runtime deps. Fix any violations found. Document result in `docs/dep-audit.md`.

---

## Acceptance criteria (v0.9 definition of done)

1. `docs/site/` contains ≥ 8 Markdown pages covering all main packages
2. dep-free re-audit confirms zero non-@aihu/* runtime deps across all packages
3. All 570+ TS tests still passing after docs work
4. Release rehearsal: `bun run build` for all packages succeeds cleanly

---

## Surface conditions

- Do NOT add new exports or change existing APIs to satisfy docs.
- Do NOT re-open size budgets.
- If any package is found to have unauthorized deps, fix them before proceeding.
- Budget ceiling: 3 Builder↔Verifier rounds.

