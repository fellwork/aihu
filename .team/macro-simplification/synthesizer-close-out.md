# Synthesizer Close-Out · macro-simplification · round 006 · 2026-05-05

**Author:** Synthesizer · **Topic:** `topic:macro-simplification` · **Branch:** `plan/macro-simplification`

---

## §1 — Executive Summary

Aihu macros suffered triple-duplication: every `$prop`, `$action`, `$computed`, and `$describe`
declaration had to be written in three separate locations inside the same block (`@state`, `@agent`,
and the expose list). Round 006 eliminated this by landing **Option 4 — object-literal collection
form**: each macro kind now accepts a single keyed object block (`$prop: { name: ... }`) that
carries all per-name metadata inline. The implementation comprised a normative spec (B6.1), a
1 719-line TypeScript codemod (B6.2), a Rust parser rewrite for the v2 grammar with a hard v1
hard-cut error code C440 (B6.3), corpus-wide migration of 30/47 `.aihu` files (B6.4), and a
verification pass that surfaced two BLOCKERs (stale golden + router v1 residue), both patched
in-band by B6.5.1 before the branch reached merge-readiness.

---

## §2 — Acceptance Criteria Final Status

| AC | Description | Status | Notes |
|----|-------------|--------|-------|
| AC-1 | DRY identifiers — each prop/action/computed name appears exactly once | **PASS** | v2 collection-form encodes name, type, handler, describe, expose as one keyed entry |
| AC-2 | Cold-read intelligibility — a new engineer can follow the syntax without prior docs | **PASS** | Director-3 §1 + B6.5 verifier confirmed; spec §2 examples suffice |
| AC-3 | `@agent` LOC reduction — target ≤5 lines | **PASS** | `@agent` blocks gone entirely from corpus post-B6.4; per-name metadata moves into `@state` collection entries |
| AC-4 | Macro invocation count — N props → 1 `$prop:` block | **PASS** | Parser enforces single collection per kind within a block |
| AC-5 | Codemod LOC — estimate ≤200 lines | **KNOWN-OVERAGE** | Delivered at 1 719 LOC. Director-accepted: estimate missed tokenizing complexity (line-split heuristics, D.1 type inference, D.7 formatter, idempotency loop). See §4. |
| AC-6 | No public API change (additive-only) | **PASS (revised wording, Q.B-2 → a)** | `@state`-side JS lowering is byte-identical; `@agent` metadata payload shape may shift per-name. New exports: `CollectionEntry`, `CollectionKind`. |

---

## §3 — Build Round Outcomes

| Step | Role | Deliverable | Status | Notable |
|------|------|-------------|--------|---------|
| B6.1 | Spec Author | `docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md` (311 lines) | DONE | Normative spec; locked grammar, error codes C440–C444, D.1–D.7 design decisions, Q.B-1/Q.B-2 resolutions incorporated verbatim from Director-3 |
| B6.2 | Builder (codemod) | `packages/compiler/js/codemods/macro-simplification/migrate.ts` (1 719 LOC) + `_smoketest.ts` + 23 vitest cases | DONE · 23/23 pass | Covers all 6 state macros + agent-side; D.1 type-drop heuristic; D.7 inline/multi-line formatter; idempotent on already-migrated files; Q.B-1 anonymous `$effect` preserved bare |
| B6.3 | Builder (parser) | `state_macros.rs` (771 → 1 592 lines, +821) + `agent_macros.rs` (192 → 224, +32) | DONE · 260 tests pass | v2 Collection variant + EffectAnon; C440 hard-cut on every v1 form; C441 (duplicate anon effect); C444 ($prop must-be-wrapped; $lifecycle must-be-bare); byte-identical AC-6 lowering via emit.rs update; 20 pre-existing scribe→aihu rename failures unrelated |
| B6.4 | Builder (migration) | Codemod run across 47 `.aihu` files; `run-migration.ts` batch runner added | DONE | 30 files modified (v1 → v2), 17 already clean, 0 PARSE-FAILs |
| B6.5 | Verifier | Verification pass | PASS-WITH-NOTES | Surfaced 2 BLOCKERs: (1) stale `agent-basic.golden.js` out-of-sync with v2 compiler output; (2) router v1 residue — bare `$prop` lines remaining in `Link.aihu`, `Navigate.aihu`, `Router.aihu` |
| B6.5.1 | Builder (patch) | 4 files patched (`agent-basic.golden.js` + 3 router components) | DONE | BLOCKER 1: golden regenerated. BLOCKER 2: router v1 residue → 0 hits. `sfc_conformance`: 24/24 |

---

## §4 — Known Overages and Deviations

### AC-5 — Codemod LOC (1 719 vs ≤200 estimate)

The pre-build estimate of ≤200 lines was written before the full tokenizing scope was understood.
The actual codemod had to handle:

- A line-split tokenizer for all 6 state macro kinds with multiline body extraction
- D.1 type-inference heuristic (TS 6.03 narrowing; widening guard for union literals, `[]`, `{}`, `null`/`undefined`)
- D.7 inline/multi-line formatter (≤3 keys AND ≤100 chars post-indent → inline; else multi-line)
- PC-1.4.A multi-line type literal flattening before D.7 measurement
- Idempotency loop: re-parses v2 collection-form so the codemod is a no-op on already-migrated files
- Q.B-1 carve-out: anonymous `$effect(() => {...})` preserved without name synthesis
- Agent-side `$expose`/`$describe` row merging into `@state` collection entries

Director-accepted per director-note-003 §4 (round 006 authorization). No re-scoping required.

### B6.3 Parser LOC (+853 vs -80 estimate)

The director note pre-B6.3 estimated net -80 lines (v1 arms deleted, v2 arms simpler). Actual
outcome was +853 net lines (`state_macros.rs` +821, `agent_macros.rs` +32). The delta came from:

- Full per-kind validation logic (C440/C441/C444 with precise span reporting)
- `CollectionEntry` enum with all 8 optional metadata keys
- Indented-line offset-math fix (whitespace-stripping before `$` position calculation)
- `EffectAnon` variant + duplicate-anon guard

The v1 arm deletions were smaller than expected because prior arms were short dispatch stubs;
the v2 arms carry the full parsing and validation weight inline.

---

## §5 — What's Left Before Merge

1. **Open a PR** from `plan/macro-simplification` → `main`. No blocking code work remains;
   the branch is at `4c24576` with all BLOCKERs resolved.

2. **Changeset entry** — a `@aihu/compiler` minor bump is needed (additive `CollectionEntry` /
   `CollectionKind` exports; v1 hard-cut is a breaking change for any downstream consuming the
   Rust AST types directly, though no public consumers are known). Check `.changeset/` for
   any pre-existing entry from the build round before creating a new one.

3. **CLAUDE.md test count** — the repo's CLAUDE.md or state file likely records the prior Rust
   test count (≤240). Update to reflect 260 passing (or whatever `cargo test -p aihu-compiler`
   reports at merge time).

4. **scribe→aihu rename audit** — the 20 pre-existing scribe→aihu rename failures in B6.3's
   test run are unrelated to macro-simplification but should be tracked in a follow-on item to
   avoid accumulating noise in CI output.

5. **Spec index** — `docs/superpowers/specs/` has no index file; if one exists or is added,
   register `2026-05-05-spec-macro-vocabulary-v2.md` as superseding
   `2026-05-02-spec-macro-vocabulary.md`.
