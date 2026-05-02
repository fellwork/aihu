# Director Note — server-native session 002

**Date:** 2026-05-02
**Topic:** Adjudication of Builder fall-through default deviation
**Status:** Decision binding on Verifier; possible Builder re-dispatch.

---

## 1. Decision

**Option A (spec as written — loud default).** Builder must revert.

The session-001 acceptance bar item 3 is unambiguous: *"Loud failure on corruption — missing/corrupt binary on a platform that should have one fails loud at first call with install instructions. **Never silently fall through in that case.**"* Spec §5.1 codifies this with a `ScribeNativeError` and §5.3 designates `SCRIBE_NATIVE_SKIP=1` as the explicit, documented opt-out for the silent path. The Builder's inversion turns the documented opt-out (silent) into the default and makes the safety contract (loud) opt-in via `SCRIBE_FORCE_NATIVE=1`. That is exactly the "silent parity drift / silent perf degradation" failure mode the original frame called load-bearing.

The Builder's concern is real but mis-located: the friction is "developer machine without a built addon," not "developer machine running production." The right tool for that friction is the already-specified `SCRIBE_NATIVE_SKIP=1`, set once in the repo's local test env (see §3 below). Inverting the production default to fix a dev-onboarding paper cut is the wrong tradeoff.

Option C (env-detected) is rejected: three-state defaults are surprising (`NODE_ENV=production bun test` would flip behavior), and `NODE_ENV` is not a reliable production signal in edge/serverless contexts which already have their own detection path (§3.2).

## 2. Acceptance criteria revision

No spec change. AC-9 stands as written in §8: missing binary on supported platform throws `/\[@scribe\/server\] Native renderer binary not found/`. AC-10 (`SCRIBE_NATIVE_SKIP=1` → silent TS) also stands.

`SCRIBE_FORCE_NATIVE` is **removed from the contract.** It was not in the spec and adds a third env-var lever for no benefit once the default is correct. Builder must delete the flag and its branch.

## 3. Implication for Verifier

- AC-9: must execute *unconditionally* on a supported platform with the `.node` removed. No `SCRIBE_FORCE_NATIVE=1` precondition. Fail the commit if the assertion is gated.
- AC-7 (parity test): unchanged — runs when native is present. CI's existing `SCRIBE_FORCE_NATIVE=1` reference in spec §4.4 should be re-read as "on CI, the absence of the binary is a hard fail by default; no flag needed." Update the CI comment accordingly.
- AC-10: must pass — `SCRIBE_NATIVE_SKIP=1` is the documented escape hatch.
- Repo-local test ergonomics: add `SCRIBE_NATIVE_SKIP=1` to `packages/server/.env.test` (or the equivalent vitest setup) so `bun run test` on a fresh clone passes without the addon. This is a one-line repo config, not a contract change. Verifier confirms the file exists and the 454 tests pass without the addon built.

## 4. Implication for production users

Documented contract: *"On a supported platform, `@scribe/server` requires its native addon. If your package manager skipped the optionalDependency or the binary is corrupt, import will throw with reinstall instructions. To opt into the TS-only path (slower, always correct), set `SCRIBE_NATIVE_SKIP=1`."* This is what users want — a missed optionalDependency in production should never silently halve their SSR throughput.

## 5. Open question for Team Lead

**Builder re-dispatch required.** As-built loader is not acceptable. Re-dispatch with: (a) invert default to loud-on-supported-platform-missing-binary per spec §3.1/§5.1, (b) delete `SCRIBE_FORCE_NATIVE` flag entirely, (c) add `SCRIBE_NATIVE_SKIP=1` to the repo's test env so the 454 existing tests pass on fresh clones. Verifier runs after re-dispatch, not against the current commit `0af3ccb`.
