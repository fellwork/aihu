# scribe docs

**Updated 2026-05-02 (v1 reconciliation session, Builder R4 migration).**

The four scribe spec quartet documents and three amendments have been **ratified and migrated** to `docs/superpowers/specs/` as of 2026-05-02. This file used to serve as the spec-amendments index; that index is now superseded by the per-spec ratification headers and the applied-amendments tracking directory.

---

## Authority pointers

### Spec quartet (ratified 2026-05-02)

| Spec | Authority location |
|---|---|
| Block Structure | [`superpowers/specs/2026-05-02-spec-block-structure.md`](superpowers/specs/2026-05-02-spec-block-structure.md) |
| Template Attribute Syntax | [`superpowers/specs/2026-05-02-spec-template-attribute-syntax.md`](superpowers/specs/2026-05-02-spec-template-attribute-syntax.md) |
| Macro Vocabulary | [`superpowers/specs/2026-05-02-spec-macro-vocabulary.md`](superpowers/specs/2026-05-02-spec-macro-vocabulary.md) |
| Plugin Contract | [`superpowers/specs/2026-05-02-spec-plugin-contract.md`](superpowers/specs/2026-05-02-spec-plugin-contract.md) |

### Applied amendments (audit trail)

| Amendment | Applied to | Audit copy |
|---|---|---|
| AMD-01 — `@route` clarification in Macro Vocabulary §1 | `2026-05-02-spec-macro-vocabulary.md` | [`superpowers/specs/applied-amendments/2026-05-02-AMD-01-applied.md`](superpowers/specs/applied-amendments/2026-05-02-AMD-01-applied.md) |
| AMD-02 — Block Structure §11.5 split-bundle (Option B paths locked) | `2026-05-02-spec-block-structure.md` | [`superpowers/specs/applied-amendments/2026-05-02-AMD-02-applied.md`](superpowers/specs/applied-amendments/2026-05-02-AMD-02-applied.md) |
| AMD-03 — Plugin Contract §6.5 server contributions (Option A provisional locked) | `2026-05-02-spec-plugin-contract.md` | [`superpowers/specs/applied-amendments/2026-05-02-AMD-03-applied.md`](superpowers/specs/applied-amendments/2026-05-02-AMD-03-applied.md) |

### v1 framework plan (ratified 2026-05-02)

[`superpowers/plans/2026-05-02-scribe-v1-framework.md`](superpowers/plans/2026-05-02-scribe-v1-framework.md) — covers v0.2 → v1.0 milestones with all 12 ratified decisions baked in (Q3:A layouts, Q5:B path, Q6:A middleware provisional, Q8 collapse, Q10:D Shield, Q6 router middleware Option 1, Interpretation A full syntax migration, etc.) and Director's 6 polish notes applied inline.

### v0 plan (archival)

[`superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md`](superpowers/plans/2026-04-24-scribe-v0-plan-a-ts-runtime.md) — TypeScript runtime family (signals → arbor → runtime → agent). All five v0 phases shipped + Rounds N+1 / N+2 / N+3 perf work. Retained for archival reference; current state lives in `state-plan-a.md` at the repo root.

---

## Other docs in this directory

- [`grammar.md`](grammar.md) — historical grammar reference
- [`tthw-log.md`](tthw-log.md) — tthw session log
- [`superpowers/`](superpowers/) — ratified plans + specs
- [`topic-director-notes/`](topic-director-notes/) — topic-director session notes
