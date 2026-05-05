# `.team/director-notes/`

Governance artifacts produced by the **Topic Director** subagent role
across multi-round build/refactor sessions. **Not human-authored docs.**

## Layout

```
.team/director-notes/
  <track-id>-<round>.md     # one note per round per track
  README.md                 # this file
```

Examples:
- `cli-templates-001.md` — Round 001 of the cli-templates track
- `mail-system-002.md` — Round 002 of the mail-system track (mirrored
  in AGENTS.db as `kind:director_note round:2`)

## What goes in a director-note

Per the `fw-agent-skill` playbook (substance vs orchestration split): the
Director's note covers **substance only** — on-thesis assessment,
routing for synthesis, priority, scope signal, refined brief for the
next role, surface-to-user triggers, continuity check. Branch picking,
agent dispatch, merge mechanics belong to the Team Lead and **do not
appear here**.

## Lifecycle

- **Append-only.** Each round writes a new file; old notes are not edited.
- **Mirrored to AGENTS.db delta layer** via `agents_context_write` at
  the time of writing (so future Researchers can `agents_search` for
  prior decisions on the same track).
- **Promoted by Historian only.** A finding here becomes durable team
  knowledge (AGENTS.db user layer) only when the end-of-session
  Historian promotes it.

## Reading order for a new session on an active track

1. Read the most recent director-note for the track here.
2. Read `state-<track>.md` at repo root for the living topic summary.
3. `agents_search` for prior context with `topic:<track-id>`.

If all three are silent, the track is fresh — dispatch a Director with
the user's brief as the primary input, and that Director writes the
first note.
