# session retro — v1.0 cutover (9/10) + Bug 1-class cleanup + research arc

**Topic:** aihu-v1-framework
**Round:** 7
**Date:** 2026-05-22
**Status:** session-end close-out (v1.0.10 still open — topic stays active)

---

## What shipped

### v1.0.x cutover (9 of 10 closed)

| Item | Description | PRs |
|------|-------------|-----|
| v1.0.1 | CI re-enabled | #166 |
| v1.0.2 | Branch protection | #160 |
| v1.0.3 | Release pipeline gate | multiple |
| v1.0.4 | Dep-free audit | #167 |
| v1.0.5 | Thesis-compliance check | #167 |
| v1.0.6 | Spec migration to `docs/superpowers/specs/` | #165 |
| v1.0.7 | Dual-grammar deprecation removal | #168 |
| v1.0.8 | Vue-shape `:attr`/`@event` removal + Amendment 04 (`$attr={expr}`) | #170 |
| v1.0.9 | Naming Scheme A renames (`@aihu-plugin/data`, `@aihu-plugin/agent-readiness`) | #171 |
| v1.0.10 | **OPEN.** Path B: hold for CSS engine + UI + kindly-note absorption | — |

### Bug 1-class workspace fixes

- `@aihu/cli@0.3.2` + deprecate 0.3.1
- `@aihu/server@0.1.2` + deprecate 0.1.0, 0.1.1
- `@aihu/agent-readiness@0.1.2`
- `@aihu/agent-service@0.1.3` + deprecate 0.1.0, 0.1.2 (cascade to `agent-a2a@0.1.1`, `agent-acp@0.1.1`)
- `@aihu/auth@0.1.1` + deprecate 0.1.0
- `@aihu/compiler@0.3.0` (republish for v1.0.7 + v1.0.8 grammar — SPA rendering breakage trigger)

### Infrastructure

- `publish-all.sh`: migrated from `changeset publish` → bash script with `bun pm pack` + `npm publish`
- OIDC trusted publisher allowlist (`NPM_PROVENANCE_PKGS`), then global `NPM_PROVENANCE=1`
- `release-pr.yml`: regen `sync-readme.ts` + `bun install` in version step (structural fix for chronic Release-PR drift)
- `scripts/publish-all.sh`: `bun.lock` refresh before pack; added `auth`/`mcp`/`ai`/`scraping` to PKGS array
- `packages/server/src-native/Cargo.lock`: committed (was gitignored)

### Research arcs (Wave 1 + Wave 2 of round 7)

- **Scout R7.1** — audit gates 1+2 (errors+lint): 0 blockers, framework GREEN
- **Scout R7.2** — cso security brief: ready for user to run `/cso`
- **Scout R7.3** — codex review brief: ready for user to run `/codex`
- **Architect R7.1** — CSS engine plan: 47 plan-items proposed across 6 plans + 2 bridge; new plan `aihu-v1-css-engine` recommended. Spec record: `22d3a66e-e7fe-4fce-a191-1c003abb70fa`
- **Scout R7.4** — kindly-note research: shape clarified (`@aihu-plugin` adapter integrating kindly-note into server file rendering); 12 plan-items proposed. Record: `910e3a26-b3ed-4ee2-925a-4a7601ba3ca6`
- **Scout R7.8** — docs staleness audit: 40 surfaces, 8 high-priority, 14 Builder dispatches suggested. Record: `6e23ae2e-8719-4268-8d91-e12419242822`

### Decisions ratified

- **Strategy:** Path B (hold v1.0 until CSS engine + UI primitives + kindly-note absorbed). Estimate: 9-11 wk typical, 12-16 wk pessimistic.
- **kindly-note:** keep at `@kindly-note/*` scope; move repo ownership to fellwork; build `@aihu-plugin/*` adapter
- **Markdown-extra = GFM** (tables, task lists, strikethrough, autolinks)
- **CSS engine:** hard-fork Tailwind v4
- (Plus 4 decision rows already in DB from earlier rounds: Amendment 02 Option B, Q6 router middleware Option 1, Naming Scheme A scope, implicit Path B)

---

## What worked

- **Director's compression calls.** When Wave 1 of round 7 turned into a 9-Scout fanout, the Director collapsed overlapping briefs into 4 batched dispatches and saved an estimated round of churn.
- **Parallel-dispatch via single-message Agent calls.** Wave 1 of round 7 ran 4 Scouts in one message; Wave 2 ran 3 Builders in one message. ~3× wall-clock speedup over sequential.
- **Bidirectional Verifier audits.** Verifier R6.2 reversed Director's earlier confidence on v1.0.5 — caught a thesis-compliance regression nobody else surfaced.
- **Trust-but-verify on Director reversal-of-Verifier.** When the Director attempted to re-reverse Verifier R6.2, we cross-checked the decisions table and found Verifier was right. The decisions table was the tiebreaker.
- **Iron Law applied to v1.0.7 + v1.0.8.** Investigator R5.1's root-cause work on SPA rendering breakage prevented a "just bump the version" patch that would have shipped the bug downstream. Saved blast radius across `@aihu/cli`, `@aihu/server`, `@aihu/compiler` consumers.
- **Changesets-cascade exploited for agent-service.** Bumping `agent-service@0.1.3` cascaded to `agent-a2a@0.1.1` and `agent-acp@0.1.1` automatically through changesets' peer-bump logic. Free bug fix.

## What didn't work

- **Recurring README/inventory drift.** `sync-readme.ts` ran in dev but not in Release-PR workflow → version step would commit stale READMEs. **Now fixed structurally** in `release-pr.yml` (regen + `bun install` in version step).

  > **Historian's correction, 2026-07-26 — "now fixed structurally" was wrong, and the fix became the cause.**
  > `release-pr.yml`'s only install is `bun install --frozen-lockfile`; **it never builds.** So the regen this
  > line celebrates ran `sync-readme` in *write* mode against a tree with no `dist/`, committing 48 `_no dist_`
  > rows and `"bytes": -1` on all 108 cache rows into every release. The comment above that step reads
  > *"Without this, every Release-PR ships drift that downstream CI's sync-readme --check would flag."*
  > Actually fixed 2026-07-25 in #591 (`24c08c33`). See instance 22 in
  > `docs/lessons/absent-value-rendered-as-real.md`.

- **Repeated Builder UUID hallucination.** Builders R5.2c, R5.4a, R5.6 invented record IDs when referencing prior records. **Now a promoted lesson** (see `docs/lessons/builder-uuid-hallucination.md` if it exists, or as part of the playbook).

  > **Historian's correction, 2026-07-26 — that lesson was never written.**
  > `git log --all --diff-filter=A -- docs/lessons/builder-uuid-hallucination.md` is empty: the file has never
  > existed on any ref. "**Now a promoted lesson**" describes a promotion that did not happen, and the hedge
  > *"if it exists"* makes the claim unfalsifiable — a reader cannot tell a missing file from a deliberate maybe.
  > Caught by `scripts/check-lesson-refs.sh` on its **first run**. Instance 29 in
  > `docs/lessons/absent-value-rendered-as-real.md`. **The underlying lesson still deserves writing;** the
  > citation is left in place, corrected rather than deleted, so the debt stays visible.
- **Scout dispatched as Explore subagent.** Explore has no Bash → Scout couldn't write its own delta record. Director had to relay. **Promoted as lesson e below.**
- **Builder R5.2b-2 shipped parser changes without bumping `@aihu/compiler` package.** Caused downstream SPA breakage — consumers using `@aihu/compiler@latest` got the OLD binary, silent grammar feature regression. **Promoted as lesson d below.**
- **publish-all.sh PKGS array gaps.** `auth`, `mcp`, `ai`, `scraping` weren't in the array → Release-PRs bumped them but the script never published them. `@aihu/auth@0.1.1` was the canary case. **Promoted as lesson b below.**

## Cross-session signals worth promoting

1. **Cross-package version drift (Bug 3 class)** → `docs/lessons/cross-package-version-drift.md`
2. **publish-all.sh PKGS array completeness audit** → `docs/lessons/publish-all-pkgs-array.md`
3. **Release-PR autogen artifact regen** → `docs/lessons/release-pr-autogen-sync.md`
4. **Compiler version bump for grammar changes** → `docs/lessons/compiler-grammar-needs-changeset.md`
5. **Scout dispatch subagent_type** → `docs/lessons/scout-subagent-type.md`

---

## What the next session needs to start cleanly

User signal: *"start `/fw-agent-skill` for css engine work, docs update, and roadmap updates"*

### Pending work entering next session

1. **CSS engine** — 47 plan-items proposed but NOT yet written to DB. Architect R7.1's spec at `22d3a66e-e7fe-4fce-a191-1c003abb70fa` is the source.
2. **CSS engine bootstrap Plan 1** (1,002 lines, in tree at `docs/superpowers/plans/2026-05-11-css-engine-bootstrap.md`) is ready to execute; Plans 2-6 are UNWRITTEN — Architect rounds needed.
3. **kindly-note integration** — 12 plan-items proposed by Scout R7.4 at `910e3a26-b3ed-4ee2-925a-4a7601ba3ca6`. Shape clarified to `@aihu-plugin` adapter. Plan-items NOT yet written.
4. **Docs/README staleness** — Scout R7.8 enumerated 40 surfaces, 14 Builder dispatches at `6e23ae2e-8719-4268-8d91-e12419242822`. Builders NOT yet dispatched.
5. **Roadmap structure** — current `aihu-2026` roadmap has 2 plans. Next session may want to add `aihu-v1-css-engine` (Architect's proposal), maybe `aihu-v1-kindly-note-adapter` plan, possibly restructure.

### Constraints carried forward

- v1.0.10 stays OPEN. Do NOT call `team plan complete aihu-v1-framework`.
- Topic round stays at 7. Next session advances if and only if it's starting a new arc.
- Topic stays ACTIVE.

---

## DB outage note

At close-out time the Supabase tenant `postgres.hccvlehbposnhxpqakgw` returned ENOTFOUND on both pooler hosts — total DB outage. This retro and the 5 lessons were written to disk; the user must run the corresponding `team write delta retro` and `team promote` commands once connectivity returns. See `scripts/historian-replay.sh` (TBD) or run manually:

```bash
team write delta retro aihu-v1-framework \
  --title "session retro — v1.0 cutover (9/10) + Bug 1-class cleanup + research arc" \
  --round 7 --file docs/retros/aihu-v1-framework-2026-05-22.md

# Then for each lesson:
team write delta lesson aihu-v1-framework \
  --title "<title>" --round 7 --file docs/lessons/<slug>.md
# Capture the record-id, then:
team promote <record-id> docs/lessons/<slug>.md
```
