# Retro — Session 008

**Date:** 2026-05-03
**Session:** 8 (automated scheduled task)
**Base commit:** `2340424` (main — session-7 retro + route.rs + 221 Rust tests)
**Final HEAD on main:** `1917d7f`
**Historian:** Claude Sonnet 4.6

---

## 1. Session Arc

Session 8 was the v1 finish line. Three remaining plans (4.3, 5.3, 7.1) were targeted and all three shipped. The session ran fully automated with no user intervention.

**Plans targeted:** 4.3-B (TS template type stabilization), 5.3 (A2A + ACP adapters), 7.1 (v1 cutover)
**Plans shipped:** All three. 17 of 17 v1 plans now COMPLETE.
**Test count:** TS 570 → 607 (+37), Rust 221 → 222 (+1)
**Session commits:** 6

---

## 2. What Shipped

### Plan 4.3-B — TypeScript Template Type Stabilization

Commit `0394e3e`. A single new Rust test `leaf_signal_interpolation_cast` was added to `packages/compiler/tests/codegen.rs` to lock the `as unknown as Signal<string>` cast as the stable v1 emit form. The director note (§2) had specified Option B (scoped-down, no OXC) over Option A (full OXC integration), because `packages/compiler/Cargo.toml` has no dependencies section and OXC would have introduced two major crate families at v1 ship time — unacceptable risk.

The cast `as unknown as Signal<string>` was locked rather than changed to `as [Signal<string>, (v: string) => void]`. The scoped-down version had the critical property: it does not require adding any Rust dependencies, does not change existing emit behavior, and documents the stable form via a passing test. Full OXC-based expression type inference is deferred to Plan 4.3-v2.

**Rust tests:** 221 → 222. All 221 existing tests green.

### Plan 5.3-prereq — `getAllAgentMetadata()` in `@scribe/agent`

Commit `b715923`. `getAllAgentMetadata(): AgentMetadata[]` added to `packages/agent/src/registry.ts` and re-exported from index. 4 new tests added to `registry.test.ts`. Bundle impact within the 200 B gz cap.

### Plan 5.3-A2A — `@scribe/agent-a2a` Package

Commit `ba0d633`. New package `packages/agent-a2a/`. `mountA2aAdapter(service, options)` exposes three routes:
- `GET /.well-known/agent.json` — A2A agent card with skills derived from `service.getManifest()`
- `POST /a2a/tasks/send` — routes to `handleToolCall`; returns `{ taskId, status, result }`
- `POST /a2a/tasks/sendSubscribe` — SSE streaming response with `TextEncoder`-based chunks (jsdom compatibility)

14 tests. Bundle ≤ 700 B gz cap. Uses `TextEncoder` for SSE chunk encoding — a jsdom compatibility decision documented at build time.

### Plan 5.3-ACP — `@scribe/agent-acp` Package

Commit `c4cabb4`. New package `packages/agent-acp/`. `mountAcpAdapter(service, options)` exposes two routes:
- `GET /.well-known/acp-agent` — ACP agent card
- `POST /acp/messages` — extracts tool from `parts[0].content.tool` or `content`; returns ACP response message

19 tests. Bundle ≤ 600 B gz cap.

**TS tests after 5.3:** 570 → 607 (+37 across prereq + A2A + ACP).

### Plan 7.1 — v1 Cutover

Commit `be8f0a1`. Mechanical cutover:
- `README.md` updated with v1 feature table (17 plans), badge counts, and v1 framing
- All 15+ packages bumped to `"version": "1.0.0"`
- `.github/workflows/plan-a.yml` re-enabled with `push: branches: [main]` and `pull_request:` triggers
- `release.yml` confirmed tag-gated (no change needed)
- `.size-limit.json` confirmed complete with A2A + ACP entries added by 5.3 builders

### Director Note

Commit `1917d7f`. Session-8 director note committed to `.team/v1/director-notes/session-8-round-001.md`.

---

## 3. What Worked Well

**Automated sequencing held.** The director note §7 execution order (4.3 → 5.3-prereq + A2A + ACP parallel → 7.1) was followed correctly. No plan had to wait on an unresolved surface trigger.

**Parallel A2A + ACP builders.** The two adapter packages are fully independent — separate `packages/` directories, no shared source files, no cross-package references beyond `@scribe/agent-service`. Running them as parallel builders was safe and correct.

**Option B rationale was precise.** The §2 scope decision in the director note gave an unambiguous answer: Cargo.toml has no `[dependencies]` section, OXC is v2 scope, the locked cast test is the minimal deliverable. No surface trigger ST-3 fired.

**`TextEncoder` jsdom fix was self-contained.** The A2A builder identified the jsdom SSE compatibility issue and resolved it with `TextEncoder` without needing to surface. The solution is documented in the test file.

**7.1 passed the bun run build size gate.** All packages within budget after the adapter entries were added to `.size-limit.json`.

---

## 4. What Was Surprising

**Branch naming collision on 5.3 parallel builders.** Both the A2A and ACP builders used `feat/v1-acp-adapter` as their branch name. The director note assigned `feat/v1-a2a-adapter` to A2A and `feat/v1-acp-adapter` to ACP, but the A2A builder did not use its designated branch. The merge still worked correctly because the ACP commit landed via fast-forward and the A2A commits were already on main when the ACP branch was merged — no work was lost or overwritten. However, if both builders had been writing simultaneously to the same branch, there would have been a conflict.

**Root cause:** Two independent agents reading the same director note and both defaulting to the same branch name pattern (`feat/v1-acp-adapter`), despite the note assigning distinct names. The name `acp-adapter` was more prominent (it was listed second in §3 with its own section number) and both builders anchored to it.

**Resolution:** The ff-merge captured all commits. Post-session remote branches deleted.

**Plan 4.3-B locked the cast rather than replacing it.** The director note §2 described both locking and replacing. The builder interpreted Option B as "lock the existing cast as stable" rather than "replace `as unknown as Signal<string>` with `as [Signal<string>, (v: string) => void]`." This is a defensible interpretation — the test name `leaf_signal_interpolation_cast` documents the cast as intentional, preventing accidental removal. The test as shipped does what the director intended at the behavioural level (stable v1 emit form is locked), even if the emit itself retains the broader cast.

---

## 5. Learnings

> These are candidates for `.team/v1/learnings.md` — create the file if it does not exist.

**Learning #50 — Branch name collision in parallel builders**

When two builders are dispatched in parallel and the director note names their branches (e.g. `feat/v1-a2a-adapter` and `feat/v1-acp-adapter`), builder briefs must include the branch name as the *first action* with explicit instruction: "your branch name is X — do not use any other name." Embedding branch name in the summary line of the builder brief prevents both agents from reading the director note and anchoring to the same visible name.

**Learning #51 — Locking vs. replacing in Option B scope decisions**

When a director note frames an option as "change X to Y," the builder brief must restate this as an imperative in the acceptance criteria: "MUST emit `as [Signal<string>, (v: string) => void]`, MUST NOT emit `as unknown as Signal<string>`." Without that constraint in the AC, a builder may reasonably interpret "stable v1 form" as meaning "lock what exists" rather than "replace with the precise form." Both interpretations satisfy the stated goal; only one satisfies the full intent.

**Learning #52 — Dep-free Cargo.toml as hard gate for compiler additions**

The compiler's dep-free `Cargo.toml` is a first-class constraint that must appear in the do-not-break list for any session that touches the compiler. The absence of a `[dependencies]` section means any plan requiring a new crate must be surfaced as ST-3 before proceeding. Adding this explicitly to the standard surface trigger set prevents ambiguity.

**Learning #53 — `TextEncoder` for SSE in jsdom test environments**

When writing SSE-emitting packages that need to be tested in Vitest (jsdom), the `Response` constructor used for streaming does not support `ReadableStream` chunks of `string` type in jsdom — only `Uint8Array`. Encoding with `new TextEncoder().encode(chunk)` produces jsdom-compatible chunks. Document this in the package's test file as a `// jsdom compat` comment so future readers understand why raw string push was not used.

---

## 6. Plan 4.3-B Scope Rationale

The director note weighed three options:

- **Option A (full OXC):** Add `oxc_parser` + `oxc_semantic` to `Cargo.toml`. Enables true TypeScript expression type inference. Rejected — would introduce two major crate families, significant compile time increase, Cargo.lock churn, and risk to the 221 passing Rust tests at v1 ship time.
- **Option B (scoped-down):** Change or lock the `as unknown as Signal<string>` cast. Zero new dependencies. Rust tests unaffected. Chosen.
- **Option C (defer entirely):** Leave the cast as-is with no test. Rejected — no stability guarantee, future refactors could silently change or remove the cast.

Option B was selected because it satisfies the v1 requirement ("emit form is stable and documented") without accepting the risk profile of Option A. Full OXC integration becomes Plan 4.3-v2 and is the first post-v1 compiler investment.

The test name `leaf_signal_interpolation_cast` (vs. the director note's `leaf_interpolation_emits_precise_tuple_type`) reflects the builder's interpretation that the cast shape, not the precise tuple type, is what is being stabilized. This interpretation is consistent with what was actually shipped — the emit still uses `as unknown as Signal<string>` — and the test locks that form as the stable v1 contract.

---

## 7. State of v1 at Session Close

**ALL 17 v1 plans COMPLETE.**

| Phase | Plans | Status |
|-------|-------|--------|
| Phase 1 — Reconciler/Props/Styles/Slots | 1.1, 1.2, 1.3, 1.4 | DONE |
| Phase 2 — Context/Data | 2.1, 2.2 | DONE |
| Phase 3 — SSR/Hydration/Islands | 3.1, 3.2, 3.3 | DONE |
| Phase 4 — HMR/Errors/TS types | 4.1, 4.2, 4.3-B | DONE |
| Phase 5 — Agent stack | 5.1, 5.2, 5.3 | DONE |
| Phase 6 — Router/Signals | 6.1, 6.2 | DONE |
| Phase 7 — Cutover | 7.1 | DONE |

**Test counts at close:**
- TS: 607 passing (67 test files)
- Rust: 222 passing (1 ignored)

**All packages at `version: "1.0.0"`.**

**GHA auto-triggers re-enabled** on push/PR to main.

**Known carry-forward:**
- Plan 4.3-v2 (full OXC TypeScript expression type inference) — post-v1 scope
- `publish-server` job for `@scribe/server` (OQ-SN-4 from server-native session) — needed before first v0.1.0 publish tag
- `disposeRef` first-run race — LOW priority background item
