# `team read latest verification_report` returns a stale record — confirm writes by-id

**Topic:** aihu-v1-framework
**Round:** 11 (observed r10)
**Category:** team-cli-dx
**Severity:** medium (creates false-negative "the write failed" panics; degrades trust in the latest-read path)

## The lesson

`team read latest <kind> <topic>` does **not** reliably return the newest record. For `verification_report` on `aihu-v1-framework`, it returns a stale round-2-era record (`780de799…`, the r8 report) instead of the most recently persisted report. Do NOT rely on `team read latest …` to confirm that a write landed.

To confirm a record actually persisted, use:
- `team read by-id <full-uuid>` — when you know the id, or
- `team search "<query>" --kind <kind>` — to enumerate and pick the newest by inspection.

## How it bit us

During r10 routing the Director went looking for the r9 verification_report. `team read by-id` (against the dispatch-cited id) and every `team search --kind verification_report` probe returned only the stale r8 report `780de799` as the "most recent." This briefly looked like the r9 Verifier's `team write` had failed entirely — compounding the *actual* r9 no-Bash write failure (see `docs/lessons/verifier-needs-bash.md`) and making it hard to tell the two apart. The routing decision had to fall back on corroborating the PASS verdict from the two build manifests (`324e44ce`, `bdebf3b6`) directly. The r9 report was ultimately persisted by the Team Lead as `5981eeff-7d40-4ae7-b969-b1a17bb05afc`; confirming it required a by-id read.

## The rule

- **Never trust `team read latest …` as proof of a write.** Treat it as a convenience read that may be ordering-buggy.
- After any `team write`, capture the returned record-id and confirm with `team read by-id <id>`.
- When auditing "did the latest verification land?", use `team search --kind verification_report` and sort/inspect, not `read latest`.

## CLI-DX debt (for the team-cli-dx follow-up)

This is a real ordering bug in `team read latest` — it should ORDER BY the actual recency column (created/round) DESC and return the true newest, not a stale early row. Bundle with the other carried team-cli-dx items: the css-item slug-granularity limitation, the `team plan item update` legacy-row no-op, and `team read by-id` throwing a psycopg UUID error on a short prefix instead of resolving it.

## The same bug, a second instrument (2026-07-27): the swarm dashboard's "current task"

Retro C-FEL-RETRO-0727, incident 7. The swarm **dashboard** showed a **stale**
contract as an agent's *current task*, and worse, **hid** that one agent held **two**
contracts. Same root as the `team read latest` bug above — a read that means "the
newest" but does not order by recency — now in a different tool.

**Mechanism, at code level.** `~/.swarm/dashboard.py`, per-role current-task query.
The fix comment records the pre-fix shape verbatim (`dashboard.py:87-93`):

> *"The old query had no `ORDER BY` and took `fetchone()`, so an agent holding two
> claimed contracts displayed whichever SQLite returned first — … the contract it
> claimed yesterday, so the panel reported a stale task as the current one. Worse,
> holding >1 claimed contract is itself a condition worth seeing."*

Two failures in one query, and both are this directory's patterns:
1. **No `ORDER BY` → stale row as "current"** — a `SELECT … fetchone()` returns an
   *arbitrary* row, and "arbitrary" resolved to *yesterday's*. Identical to the
   `team read latest` bug; the lesson did not stay learned because it lived as prose
   about a *different* tool.
2. **`fetchone()` collapsed a set → a real condition hidden** — an agent holding two
   `claimed` contracts is a coordination violation the bus refuses for a single
   contract, and the dashboard's single-row read made it invisible. An `absent-value`
   inverse: a present multiplicity rendered as absent.

**Promotion rung: structural.** Fixed at `dashboard.py:97-98` —
`SELECT id FROM contract WHERE owner=? AND status IN ('claimed','building')
ORDER BY ts DESC` with `.fetchall()`, and the panel now **surfaces** every hold
instead of hiding the extras. The generalized rule below (ORDER BY the recency
column; never `fetchone()` when multiplicity is meaningful) is the prose; the query
change is the gate.

> **A "latest"/"current" read is a claim about ordering. If the query has no
> `ORDER BY`, it is not returning the latest — it is returning whatever the engine
> happened to hand back, and any `LIMIT 1` / `fetchone()` on top of that both
> lies about recency AND hides multiplicity.**

## Related

- `docs/lessons/verifier-needs-bash.md` — the co-occurring r9 write failure this bug masked.
- `docs/lessons/promotion-rungs.md` — incident 7 in the 2026-07-27 retro audit table.
- `docs/lessons/absent-value-rendered-as-real.md` — a present multiplicity (two holds) rendered as absent.
