# v1 Learnings

Accumulated learnings from Sessions 1–8. Numbers continue from the project-wide learning sequence.

---

## Learning #50 — Branch name collision in parallel builders

**Session:** 8
**Context:** Both the A2A (Plan 5.3-A2A) and ACP (Plan 5.3-ACP) parallel builders landed on the same branch name `feat/v1-acp-adapter`, despite the director note assigning `feat/v1-a2a-adapter` to A2A.

**Root cause:** Two independent agents read the director note and both anchored to the most visually prominent branch name in §3. The A2A section's designated `feat/v1-a2a-adapter` name was less prominent than `feat/v1-acp-adapter` (which appeared in the ACP section header).

**Resolution:** ff-merge captured all commits; no work lost. Remote branches deleted post-session.

**Mitigation:** Builder briefs for parallel-dispatched agents must state the branch name as the *first action item* in imperative form: "Your branch name is `feat/v1-a2a-adapter`. Create this branch as your first action. Do not use any other name." Embedding branch name in the brief summary line prevents both agents from defaulting to the same visible pattern.

---

## Learning #51 — Locking vs. replacing in Option B scope decisions

**Session:** 8
**Context:** Director note §2 described Option B for Plan 4.3 as changing `as unknown as Signal<string>` to `as [Signal<string>, (v: string) => void]`. The builder instead locked the existing cast with a test (stabilizing it rather than replacing it).

**Root cause:** "Option B (scoped-down)" was framed around what was NOT being done (no OXC), not as an explicit imperative for what the emit MUST produce. The builder reasonably interpreted "stable v1 form" as "document what exists" rather than "replace with the precise form."

**Mitigation:** When a director note frames an option as "change X to Y," the acceptance criteria in the builder brief must include explicit constraints: `MUST emit <precise form>` and `MUST NOT emit <old form>`. Without these in the AC, a builder may satisfy the goal (stable, locked) without satisfying the full intent (emit-form replacement).

---

## Learning #52 — Dep-free Cargo.toml as hard gate for compiler additions

**Session:** 8
**Context:** `packages/compiler/Cargo.toml` has no `[dependencies]` section. Any plan touching the compiler that requires a new crate (e.g., OXC) must be surfaced as a surface trigger before proceeding.

**Mitigation:** Add "Cargo.toml unchanged — zero new dependencies" to the do-not-break list for every session that includes compiler work. Add ST-N: "Plan X requires new Cargo.toml dependency → Stop; surface for scope re-decision" to the surface trigger set as a standard entry.

---

## Learning #53 — `TextEncoder` for SSE in jsdom test environments

**Session:** 8
**Context:** `@scribe/agent-a2a` implements `POST /a2a/tasks/sendSubscribe` as an SSE stream. Tests run in Vitest with jsdom, where `Response` constructor does not accept `ReadableStream` with raw string chunks.

**Resolution:** Encode SSE chunks with `new TextEncoder().encode(chunk)` to produce `Uint8Array` — jsdom-compatible. Add a `// jsdom compat` comment in the test file.

**Mitigation:** All SSE/streaming packages should document this encoding requirement in their test file as a standard pattern comment. The pattern applies to any package that pushes string chunks into a `ReadableStream` and tests them in a jsdom Vitest environment.
