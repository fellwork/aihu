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

## Related

- `docs/lessons/verifier-needs-bash.md` — the co-occurring r9 write failure this bug masked.
