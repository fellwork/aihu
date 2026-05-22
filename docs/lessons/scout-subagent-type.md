# Scout dispatch subagent_type

**Topic:** aihu-v1-framework
**Round:** 7
**Category:** orchestration, fw-agent-skill-playbook
**Severity:** medium (lost write capability, requires Director relay)

## The lesson

A Scout that needs to write its own report (via `team write delta scout-report ...`) MUST be dispatched with `subagent_type: general-purpose`, NOT `subagent_type: Explore`. The `Explore` subagent type has no `Bash` tool — it can read and analyze but cannot execute the `team` CLI to persist its findings.

If you dispatch a Scout as `Explore`, the Scout will return its findings as its final message, and the Director has to manually copy-paste them through `team write` afterward. This works, but:
- adds a round-trip of latency
- introduces a transcription error class
- silently consumes Director context budget for a step the Scout could have done itself
- breaks the playbook invariant that "every subagent persists its own deltas"

## How it bit us this session

Round 7, Wave 1 dispatched 4 Scouts in one message. Three were `general-purpose` and self-wrote their deltas. One (Scout R7.4 on kindly-note research) was dispatched as `Explore` — the Director, optimizing for token cost on a heavy-read task, chose the Explore type. R7.4 returned a 4,200-token report inline. The Director had to spend ~1,500 tokens of its own context to call `team write delta` on R7.4's behalf, AND a transcription error in the spec excerpt was caught only on a later cross-reference.

## The rule

**Default to `general-purpose` for any Scout/Architect/Investigator that needs to persist a delta.** Only use `Explore` for read-only sub-questions where the Director will synthesize and persist the result anyway (e.g., "look at this one file and tell me X" — and even then, the Director should consider whether the cheaper path is to use the `Read` tool inline).

Decision tree:

| Subagent needs to... | Use type |
|----------------------|----------|
| Write a delta record | `general-purpose` |
| Edit/Write files | `general-purpose` |
| Run `team` CLI commands | `general-purpose` |
| Read-only investigation, Director persists | `Explore` |
| Single-shot lookup the Director could do | (don't dispatch, use `Read`/`Grep`) |

## Related

- `fw-agent-skill` playbook section on subagent capabilities
- Lesson on Builder UUID hallucination (sibling class: dispatch-shape bugs degrade DB hygiene)
