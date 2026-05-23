# Verifier (and any record-writing Researcher) needs Bash — dispatch as general-purpose

**Topic:** aihu-v1-framework
**Round:** 11 (earned r9-r10)
**Category:** orchestration, fw-agent-skill-playbook
**Severity:** high (silent verification-record loss + lost ability to run acceptance gates and probe artifacts)

## The lesson

Dispatch Verifiers — and any Researcher that must write its own delta record — as `subagent_type: general-purpose`, **NOT** `feature-dev:code-reviewer` or `Explore`. Those types have `BashOutput`/`KillShell` but **no `Bash`**, so they can neither:

1. **Run the acceptance gates** (`cargo test`, `bun run test`, `bun run typecheck`, byte-comparing `.size-limit.json`, probing a published binary), nor
2. **Persist their own record** via the `team` CLI.

A no-Bash Verifier can only read committed artifacts (snapshots, vitest results.json) and trust the Builder's pasted output — exactly the self-reported-counts gap the Verifier exists to close. And its `team write` silently no-ops, so the verification record is lost unless someone recovers it.

This is the same dispatch-shape class as `docs/lessons/scout-subagent-type.md` (Scout-as-Explore has no Bash → can't write its delta). Verifiers are the sharper case because their whole job is *running* gates.

## How it bit us (and how it paid off when fixed)

- **r9 — bit us.** The Verifier was dispatched as `feature-dev:code-reviewer`. It could not run `cargo test`/`bun test`, so it "verified" Track A + Track B by reading committed snapshots, vitest results, and byte-comparing `.size-limit.json`. Its `team write delta verification_report` **silently no-op'd at session time** — the record had to be recovered and persisted by the Team Lead (final record `5981eeff-7d40-4ae7-b969-b1a17bb05afc`), and the Team Lead independently re-ran the gates in each worktree to close the gap.
- **r10 — paid off.** The Verifier was dispatched as `general-purpose` (Bash-capable). It independently re-ran all 492 Rust + 8 vitest gates AND went further than artifact-reading: it **downloaded the published `v0.4.4` `aihu-compile` and probed it**, confirming it ignores `--ast-json` and emits TS so `JSON.parse` throws. That probe is what surfaced the CI-reproducibility defect (report `c7b9f1e2-6c1d-4761-8c90-c3d61f81a6cd`) — a no-Bash reviewer could never have found it, because the local PASS depended entirely on the Builder's manually-copied fresh binary.

## The rule

**Default to `general-purpose` for any Verifier, and for any Scout/Architect/Investigator that needs to run commands or persist a delta.** Reserve read-only `Explore` only for sub-questions where the Director will synthesize and persist the result itself — and never for a Verifier, whose job is to *run* the gates.

| Subagent needs to... | Use type |
|----------------------|----------|
| Verify (run gates, probe artifacts, write the report) | `general-purpose` |
| Write any delta record | `general-purpose` |
| Run `team` CLI / `cargo` / `bun` | `general-purpose` |
| Read-only investigation, Director persists | `Explore` (NOT a Verifier) |

## Methodology-fix flag (for human promotion to the skill)

The `fw-agent-skill` playbook currently recommends `feature-dev:code-reviewer` for the Verifier role. That recommendation is the root cause of the r9 failure and should be changed to `general-purpose`. **Flagging for human promotion into the skill — do NOT edit the skill from a Historian close-out.**

## Related

- `docs/lessons/scout-subagent-type.md` — sibling: Scout-as-Explore has no Bash.
- r9 verification report `5981eeff-7d40-4ae7-b969-b1a17bb05afc` (Team-Lead-persisted).
- r10 verification report `c7b9f1e2-6c1d-4761-8c90-c3d61f81a6cd` (the binary-probe catch).
