# State — Track: plan-a

**Last updated:** 2026-04-30
**Written by:** Team Lead (session start, post-Phase-3)
**Track:** plan-a (TypeScript runtime family — signals → arbor → runtime → agent)
**Active branch:** `claude/scribe-phase-3-team-Za4UQ`
**Develop-on branch (all sessions):** `claude/scribe-phase-3-team-Za4UQ`

---

## What shipped

| Phase | Package | Status | PR |
|---|---|---|---|
| 1 | Scaffold | ✅ Done | #1 |
| 2 | `@scribe/signals` | ✅ Done — 59 tests, 716 B gz | #2 |
| 2.5 | Bench-spike + perf | ✅ Done — cellx fix, wide-fanout recovery | #6, #8 |
| 3 | `@scribe/arbor` | ✅ Done — 51 tests, 1.16 kB gz | #7 |
| 4 | `@scribe/runtime` | 🔴 Not started — spec ready at `.team/phase-4/spec-runtime.md` |  |
| 5 | `@scribe/agent` | 🔴 Not started — spec ready at `.team/phase-5/spec-agent.md` |  |

**Current test count:** 111 (59 signals + 51 arbor + 1 integration)
**Current bundle footprint:** ~1.9 kB gz of ~4 kB total budget

---

## Active specs (binding)

| Spec | Status | Tasks |
|---|---|---|
| `.team/phase-4/spec-runtime.md` | Final — Builder may consume | Tasks 20–22 |
| `.team/phase-5/spec-agent.md` | Final — Builder may consume | Tasks 23–24 |

**Phase 4 Task 20 pre-done items:**
- CI trigger fix → already broad (plan-a-phase-*, plan-*, phase-*/** etc.) in `.github/workflows/plan-a.yml`
- `.prototools` Node bump → already at 22.12.0 (exceeds 20.19.0 requirement)
- `vitest.config.ts` @scribe/runtime alias → already wired (line 19)
- `vitest.config.ts` @scribe/agent alias → already wired (line 20)

**Phase 5 §3.3 and §3.4 pre-done items:**
- CI trigger → already broad
- `vitest.config.ts` @scribe/agent alias → confirmed present

---

## Open items (from Phase 3 retro + cross-review)

| Item | Priority | Status |
|---|---|---|
| ~~Telemetry tree-shake fix~~ | ✅ CLOSED | Already shipped in PR #7 (`29fe64d`). Both rolldown configs have `minify: true`. Phase 3 retro and cross-review were stale on this. Builder #1 (2026-04-30) caught it via Iron Law staleness check before edits. |
| **Investigate signals 49 B headroom** | MEDIUM-HIGH | The 1.55 kB / 1.6 kB number IS post-minify. ~840 B of growth from 716 B baseline (Phase 2.5 perf work). Budget was bumped 1024 → 1500 → 1600 to absorb it. Not blocking Phase 4 (runtime has no signals imports), but Learning #11 yellow flag for any future work touching signals bundle. |
| Plan staleness banner (Option 1) | LOW | Doc-only, 10 min. Add banner to `docs/superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md` per cross-review recommendation. Should also update Phase 3 retro to mark item #1 closed and reference `29fe64d`. |
| Branch protection audit on `main` | LOW | PR #6 merged with red CI. Check protection rules. |
| **Re-enable CI before v1 ships** | HIGH (at v1) | `.github/workflows/plan-a.yml` is manual-only (`workflow_dispatch`) during v0 development. Restore triggers by uncommenting the push/pull_request blocks. Verifier subagent validates gates locally on every Builder round. |

---

## Iteration budget

- Mode 2 (Build/refactor) — Phase 4 + Phase 5
- Hard stop: 5 Builder ↔ Verifier ping-pong rounds per phase
- Phase 4 budget: 0 rounds used
- Phase 5 budget: 0 rounds used

---

## Known repo facts (pre-Scout, for Director context)

- `packages/runtime/` — does NOT exist
- `packages/agent/` — does NOT exist
- `.size-limit.json` — has signals + arbor rows only; runtime/agent rows NOT present
- `packages/arbor/src/mount.ts` — 195 lines (Learning #13 soft cap is 150; known deviation from Phase 3)
- `_setMountObserver` — already tree-shaken from public dist (not in index.ts exports)
- All 4 package aliases pre-wired in `vitest.config.ts`
- Learnings #1–22 all present in `.team/learnings.md`

---

## Durable references

- Plan: `docs/superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md`
- v0 spec: `docs/superpowers/specs/2026-04-23-scribe-v0-vertical-slice-design.md`
- Learnings: `.team/learnings.md`
- Phase 4 spec: `.team/phase-4/spec-runtime.md`
- Phase 5 spec: `.team/phase-5/spec-agent.md`
- Phase 3 retro: `.team/phase-3/retro.md`
- Cross-review: `.team/plan-a-cross-review-2026-04-29.md`
- Telemetry investigation: `.team/phase-3/telemetry-treeshake-investigation.md`
