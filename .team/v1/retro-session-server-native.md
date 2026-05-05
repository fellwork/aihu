# Retro — Server-Native Session

**Date:** 2026-05-02
**Track:** Server-Native (Rust napi-rs SSR core)
**Final HEAD on main:** `b459d6e` (Merge PR #27)
**Historian:** Claude Opus 4.7

---

## 1. Session arc

The goal was a Rust napi-rs core for `@aihu/server`'s `renderToString` that emits byte-identical HTML to the existing TS path, with a three-state loader (native loaded / edge skipped / failed loud) and a property-test parity gate. Scope was deliberately bounded to the static, synchronous path — `renderToStream`, `DataSource`, and `contextSetup` were deferred to v0+M+1. What shipped: the Rust crate at `packages/server/src-native/`, JS loader at `packages/server/src/loader.ts`, eight named-sample + 200-iter fast-check parity tests, four platform package skeletons under `packages/server/npm/`, and the `build-native` + `publish-native` jobs in `.github/workflows/release.yml`. PR #27 merged. What didn't ship: `publish-server` job for the main `@aihu/server` package (OQ-SN-4 explicitly deferred), and `renderToStream` Rust port (v0+M+1).

## 2. Iteration count

**2 of 5 Builder ↔ Verifier rounds used.** Round 1 (Builder commit `0af3ccb`) shipped the full implementation but inverted the loader's failure-loud default. Round 2 (Builder commit `1e19da1`) corrected it. Verifier ran once against the R2 tip and returned PASS_WITH_NOTES with zero blocking findings. Three rounds of budget unused.

## 3. Spec deviations encountered

The notable deviation was Builder R1's loader default-inversion. The spec's §3.1, §5.1, and §5.3 codified loud-on-supported-platform-with-missing-binary as the default, with `SCRIBE_NATIVE_SKIP=1` as the documented opt-out. Builder R1 inverted this — silent fall-through became the default and a new `SCRIBE_FORCE_NATIVE=1` flag was added as opt-in for the loud behavior. This was caught **before Verifier saw it** by the Director's substance-governance review (session-002), which adjudicated Option A: *"That is exactly the 'silent parity drift / silent perf degradation' failure mode the original frame called load-bearing… The right tool for that friction is the already-specified `SCRIBE_NATIVE_SKIP=1`, set once in the repo's local test env."* Resolution cost: one extra Builder round (R2 commit `1e19da1`) to (a) delete `SCRIBE_FORCE_NATIVE`, (b) restore eager module-load throw on failure, (c) add `SCRIBE_NATIVE_SKIP=1` to `vitest.config.ts` so fresh-clone tests pass without the addon. Frame this as a positive: the Director caught a substance-shape regression that would have shipped through every gate-walk because all 454 tests still passed under Builder R1's design.

## 4. What went well

- **Scout's contract inventory was actionable.** The §1 `escapeAttr` / `renderNode` rule-by-rule decomposition let Architect produce a parity spec that named the most-likely failure point (S7 — leaf text NOT escaped) before any Rust was written.
- **Architect's 15 numbered ACs let Verifier produce a clean checklist.** Every AC mapped to either PASS, PASS-with-evidence-cite, or BLOCKED-no-binary (expected runtime gap). No AC required interpretation.
- **OQ-SN-1 was resolved via spec instead of dependency.** The `serde_json/preserve_order` choice (no `indexmap` top-level dep) kept the crate dep count to 2 + napi internals, matching the Director's "minimize parity-surface deps" constraint.
- **Director's session-002 adjudication was decisive and short.** One note, one Builder round, no debate cycle.

## 5. What didn't go well

- **Builder R1 inverted a spec default without surfacing first.** The right move on encountering "454 tests fail without a built `.node`" friction was to flag it as a surface-to-user moment, not silently invert the contract. The Director's frame called this exact failure mode load-bearing in §1 of session-001.
- **Worktree path-nesting bug forced manual file moves.** Earlier sessions wrote artifacts to doubly-nested `.claude/worktrees/.../...` paths instead of repo-absolute `.team/v1/...`. Historian dispatch had to reiterate ABSOLUTE paths. Recurring failure across multi-agent Windows worktree sessions.
- **`napi-build` rustc-version mismatch surfaced at Builder time, not Architect time.** Spec §6.2 pinned `napi-build = "2"` (latest minor); local rustc 1.87 cannot build `2.3.1`. Builder pinned to `2.2.2` via `cargo update --precise`, but a freshness check at Architect time would have caught it.

## 6. Hand-off open items

- **HIGH — `publish-server` job before first v0.1.0 tag.** OQ-SN-4 explicitly deferred. Without it, `npm install @aihu/server` cannot resolve the version-pinned platform optionalDependencies. User must wire this before tagging.
- **CLOSED — OQ-SN-7 (license).** All four platform `package.json` files declare `"license": "MIT"`. No further action.
- **MEDIUM — Verifier §5 HIGH/INFO findings, all non-blocking:**
  - `null` attr value coverage in property gate (functional correctness verified by analysis; coverage gap only).
  - `serde` `alloc` feature on a `std` target (no-op, future cleanup).
  - `Cargo.lock` gitignored (per napi-rs convention; transitive-dep determinism risk).
- **LOW — `napi-build` rustc-version pin (local-dev only).** CI runners use `dtolnay/rust-toolchain@stable` (rustc ≥ 1.88) and pick up the unpinned latest. Add a one-line note to `packages/server/src-native/README.md` (or equivalent) for local-dev contributors on rustc < 1.88.
