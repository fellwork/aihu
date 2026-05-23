# session retro — CSS-engine implementation arc (r9-11): AST hook + Plan 1 + Plan 2 + CI fix

**Topic:** aihu-v1-framework
**Rounds:** 9-11
**Date:** 2026-05-23
**Status:** session-end close-out — the CSS-engine arc crossed from *planning* (r3-8) into *building*; nothing has LANDED yet, so the arc is NOT complete and the topic stays ACTIVE.

---

## What shipped (all verified, none landed)

Everything below is **implemented + verified, pending landing**. No css-* plan item is marked done; the worktree branches are not merged. v1.0.10 stays open by design (Path B).

| Track / Plan | Round | What | Branch / commit | Manifest | Verification |
|---|---|---|---|---|---|
| **Track A — `v1.0.10a` compiler AST-export hook** | r9 | Purely-additive `compile_to_ast()` + owned `SfcAstOwned` Serialize mirror + `--ast-json` flag (short-circuits before codegen) + thin TS `compileToAst()`. Freezes the three-variant `Attr` distinction (Static/Binding/Macro) as the v1.0 AST stability contract. `serde_json` added to compiler `Cargo.toml`; `@aihu/compiler` minor changeset written. No grammar/parser/codegen change. | `worktree-agent-a79f8114fd367dd4f`, commit `173705b` | `324e44ce-ac9d-4c90-a0b9-97ee012fc7fc` | PASS (in r9 report `5981eeff-7d40-4ae7-b969-b1a17bb05afc`) |
| **Track B — Plan 1 css-engine bootstrap (css-1-*, 7/7)** | r9 | Root `Cargo.toml` workspace (compiler + aihu-css-core members); `@aihu/css-engine` TS package; `aihu-css-core` crate with bootstrap utility subset + `compile(classes)`; e2e vitest; README + inventory sync. Build-time-only — added to `BUILD_DEV_ONLY` allowlist in `check-size-rows.ts`, **no `.size-limit.json` row**. | `worktree-agent-a63a976336770c562`, 2 commits ending `10bff96` | `bdebf3b6-03bd-48a2-a731-c8e8b989605e` | PASS (same r9 report `5981eeff`) |
| **Plan 2 — css-2-ast-scanner (css-2-*, 7/7)** | r10 | AST-consuming scanner (replaces the Plan 1 stub class-list, branches Static/Binding/Macro, flags unresolved bindings, skips component nodes); full Tailwind v4 utility table (6 categories + arbitrary `-[...]`); scoped shadow-DOM emitter (no global sheet); WC-native variants (`host:`/`slotted:`/`part-*:`/`host-context-dark:`) + standard variants (`hover:`/`focus:`/`dark:`/`md:`/`[&>div]:` + stacked); `@theme` parser seeded with aihu brand tokens; AST-hashed per-SFC cache. 492 Rust + 8 vitest green. Dark cascade emits ZERO `:host-context(`. | `feat/css-2-ast-scanner` (worktree) | `b3c85283-6164-47ed-8bb8-239c06135594` | NEEDS_FIX → fixed (report `c7b9f1e2-6c1d-4761-8c90-c3d61f81a6cd`) |
| **CI fix — Plan 2/Track B binary-build gate** | r11 | Added to the `plan-a.yml` `check` job: workspace-root `cargo build --release` (emits BOTH `aihu-compile` + `aihu-css-compile`), staged the fresh `aihu-compile` into `packages/compiler/bin/`, `SCRIBE_SKIP_POSTINSTALL=1` so postinstall does not clobber it, and an `actions/cache@v4` cargo cache. plan-a.yml only, 31 insertions, purely additive. Both e2e suites pass 8/8 (Track B's 3 + Plan 2's 5). | `feat/css-2-ast-scanner`, commit `9bbdd05` | `b92cb214-6cb9-497a-b8c2-8c141a202306` | (closes the r10 NEEDS_FIX) |

Build-time-only / zero-browser-bundle stance now **empirically confirmed three times** — r9 both tracks + r10 Plan 2 each added zero browser bytes, `.size-limit.json` byte-identical every time.

---

## What worked

- **Parallel worktree-isolated Builders (r9).** Track A (`packages/compiler/` additive export) and Track B (brand-new crate + TS package + root workspace) are genuinely independent file/crate sets, dispatched in ONE message into separate worktrees (`worktree-agent-a79f8114fd367dd4f` and `worktree-agent-a63a976336770c562`). Zero thrash on shared files; both verified PASS in the same round. The only shared touch-point (`packages/compiler/Cargo.toml`) was a clean superset, not a true conflict.
- **The Bash-capable, bidirectional Verifier caught the CI defect by probing the published binary (r10).** Run as `general-purpose` (with Bash), the r10 Verifier independently re-ran every gate (492 Rust + 8 vitest, not self-reported counts) AND went further: it *downloaded the published `v0.4.4` `aihu-compile` and probed it*, confirming it ignores `--ast-json` and emits TS so `JSON.parse` throws. That is a "works on my machine" defect a read-only no-Bash reviewer could never have found — the local PASS depended entirely on the Builder's manually-copied fresh binary.
- **Worktree-based stacked-PR landing topology.** The branch topology gives a clean stack: docs PR #183 → Track A → Track B → Plan 2 (rebased onto merged A+B). A and B remain independently landable in order; Plan 2 inherits the CI fix once rebased.
- **Team-Lead trust-but-verify, re-running gates.** Because the r9 Verifier subagent (code-reviewer type) had no Bash, the Team Lead independently re-ran the acceptance gates in each worktree and persisted the verification record (`5981eeff`) itself — closing the self-reported-counts gap rather than trusting the Builders' pasted output.
- **Iron Law respected on the r11 fix.** Root cause was fully traced by the r10 Verifier (postinstall resolution order → stale-release probe → no cargo step in `check`), so r11 dispatched a direct fix-Builder with NO Investigator and closed in one iteration.

## What didn't work

- **Verifier dispatched as `feature-dev:code-reviewer` had no Bash (r9).** It could neither run acceptance gates nor write its own delta. Its `team write` silently no-op'd at session time; the r9 verification record was recovered/persisted by the Team Lead. It "verified" by reading committed artifacts (snapshots, vitest results.json, byte-comparing `.size-limit.json`) — adequate here, but it could not have caught the kind of binary-probe defect the r10 general-purpose Verifier found. **Promoted as lesson 1 below; also flagged for a fw-agent-skill methodology fix.**
- **`team read latest verification_report <topic>` ordering bug.** During r10 routing the Director could not retrieve the r9 verification_report via `team read by-id` / `team search --kind verification_report` — every probe returned only the stale r8 report `780de799`, not the newest. This briefly looked like the r9 verifier write had failed entirely. Confirming writes required `team read by-id` / `team search` against the known id. **Promoted as lesson 2 below.**

## What the next session needs to start cleanly

User makes the final landing call. **The landing stack (order fixed):**

1. **Docs PR #183** (already up).
2. **Track A** — self-contained additive compiler change (compiler-only, no css-engine e2e in the `check` job, so needs NO CI fix). Pre-merge: merged `packages/compiler/Cargo.toml` keeps `serde` (main) AND `serde_json` (Track A); regenerate `Cargo.lock`.
3. **Track B** [+ CI fix cherry-pick] — adds the root Cargo workspace + css-engine package. **CRITICAL:** the moment Track B lands, the `check` job starts running the css-engine e2e (`e2e.test.ts` spawns `aihu-css-compile`), so the CI binary-build fix (commit `9bbdd05`) **cannot be deferred past Track B** — cherry-pick it onto Track B's PR at PR-prep time. Pre-merge: re-run `bun run build` + `sync-readme.ts` post-merge so README/`__bundle-sizes.json` regenerate from main's current state (Track B's base predates main's v1 sync commit `7a6a28e`); verify `cargo build -p aihu-compiler` AND `cargo build -p aihu-css-core` from root.
4. **Plan 2** — rebased onto merged A+B; inherits the CI fix (commit `9bbdd05`, already on the `feat/css-2-ast-scanner` branch).

Once Track A merges, mark `v1.0.10a` done; once Track B merges, mark css-1-* done; once Plan 2 merges, mark css-2-* done. **Until then nothing is done.**

**Remaining after the stack lands:** Plans 3-6 (~22 css items — `@aihu/primitives`, the `@aihu/ui` registry + `aihu add` CLI, Storybook/Chromatic/dogfooding), the MEDIUM/LOW docs prose batches, and the gated **kindly-note** items (5 user inputs still owed: fellwork org admin, integration shape A/B/C, npm scope, "markdown-extra" meaning, whether it enters the session). Plans 4-6 are unwritten — an Architect pass is owed just-in-time. The **RC-after-Plan-2 release variant** becomes actionable once Plan 2 lands.

### Constraints carried forward

- v1.0.10 stays OPEN. Do NOT call `team plan complete aihu-v1-framework`. Do NOT mark any css-* item done pre-merge.
- Topic round stays at 11. Topic stays ACTIVE.
