# State — Server-Native Track

**Last updated:** 2026-05-03 (6-track follow-up Historian close — HEAD pointer refresh only)
**Current main HEAD:** `b704cd9` (Merge PR #51 — t4e/examples-integrated)
**Test floor:** 612 TS + 222 Rust
**Previously updated:** 2026-05-02 (post-PR #27 merge + Historian closeout)
**Written by:** Historian (server-native session-001/002 closeout)
**Track:** server-native (Rust napi-rs core for `@scribe/server` SSR)
**Track HEAD on main (server-native milestone):** `b459d6e` (Merge PR #27)

---

## What shipped (v0+M)

| Component | Status | Location |
|---|---|---|
| Rust crate (`scribe-server-native`, cdylib) | ✅ Done | `packages/server/src-native/` (Cargo.toml, build.rs, src/lib.rs, src/render.rs, src/escape.rs) |
| JS three-state loader | ✅ Done | `packages/server/src/loader.ts` |
| Index re-export wiring | ✅ Done | `packages/server/src/index.ts:8` |
| Property-test parity harness (8 named + 200 fast-check) | ✅ Done | `packages/server/tests/native-parity.test.ts` |
| Platform packages × 4 (darwin-arm64, darwin-x64, linux-x64-gnu, win32-x64-msvc) | ✅ Skeletons committed | `packages/server/npm/<platform>/package.json` (binary published by CI, not committed) |
| `optionalDependencies` block | ✅ Done | `packages/server/package.json` |
| Release pipeline `build-native` + `publish-native` jobs | ✅ Done | `.github/workflows/release.yml` |
| Test env safety (`SCRIBE_NATIVE_SKIP=1` for fresh clones) | ✅ Done | `vitest.config.ts` |
| MIT license declared on all platform packages | ✅ Done | All four `npm/<platform>/package.json` |

**Test count:** 454 / 454 passing. `native-parity.test.ts` skips silently when no `.node` binary is loaded (designed behavior).

**Cargo unit tests:** 21 passed / 0 failed (escape + render correctness on hardcoded named cases).

---

## Acceptance criteria

| AC | Status | Notes |
|----|--------|-------|
| AC-1 `cargo build --release` succeeds | PASS | rustc 1.87 + `napi-build` pinned to 2.2.2 in lockfile |
| AC-2 `.node` loads via require | BLOCKED-no-binary | Build-host-only check; CI verifies |
| AC-3 `loader.ts` exports `renderToString` with correct signature | PASS | `loader.ts:301`; typecheck clean |
| AC-4 `index.ts` re-exports from `./loader.ts` | PASS | `index.ts:8` |
| AC-5 All existing tests pass unmodified | PASS | 454/454; ssr.ts byte-identical to main |
| AC-6 Parity test ≥8 named samples + ≥1 fast-check | PASS | 327 lines, S1–S8 + 2 `fc.assert` |
| AC-7 Parity gate green with addon loaded | BLOCKED-no-binary | CI verifies on supported runners |
| AC-8 Byte-equal native vs TS | BLOCKED-no-binary | Subsumed by AC-7 |
| AC-9 Missing-binary throws unconditionally | PASS | `loader.ts:284-295` top-level synchronous throw; no env-flag precondition |
| AC-10 `SCRIBE_NATIVE_SKIP=1` silently uses TS | PASS | `loader.ts:138-145` short-circuit |
| AC-11 `EdgeRuntime` global skips native | PASS (partial) | Unit test in parity suite; integration BLOCKED-no-binary |
| AC-12 4 platform `package.json` with `os`/`cpu`/`libc` | PASS | All present, all `"license": "MIT"` |
| AC-13 `optionalDependencies` lists 4 platform packages | PASS | Pinned at `0.1.0` |
| AC-14 `bun run build` exit 0 | PASS | server:build clean (rolldown 668ms) |
| AC-15 CI parity-gate trigger paths documented | PASS | `release.yml:114-129` comment block |

Verifier verdict: **PASS_WITH_NOTES**. Zero blocking findings.

---

## Open items

| Item | Priority | Status / Notes |
|---|---|---|
| `publish-server` job for `@scribe/server` itself | **HIGH (before v0.1.0 tag)** | OQ-SN-4 deferred. Without it, `npm install @scribe/server` cannot resolve platform optionalDependencies. Sequence required: `build-native` → `publish-native` → `publish-server`. |
| Hydratable mode parity tests (S9 + S10) | MEDIUM | OQ-SN-3 deferred. Rust impl supports `hydratable` (Rust unit-tested); not in property gate. Add S9/S10 named samples in v0+M+1 spec. |
| `renderToStream` Rust port | MEDIUM (v0+M+1) | Async boundaries + DataSource suspension. Streaming-controller protocol stabilization first. |
| `null` attr coverage in property gate | LOW | Verifier §5 HIGH; correctness verified by analysis. Extend `attrValueArb` or add named sample. |
| `napi-build` rustc-version pin (local-dev only) | LOW | Local rustc < 1.88 cannot build `napi-build@2.3.1`. CI uses `dtolnay/rust-toolchain@stable` (1.88+). One-line README note for local contributors. |
| `serde alloc` feature on `std` target | LOW | No-op artifact in std env. Future cleanup. |
| `Cargo.lock` gitignored | INFO | Per napi-rs library convention. Transitive-dep determinism is on the CI toolchain pin. |

---

## Pending before main merge

None. PR #27 merged at `b459d6e`.

---

## Open questions

All session OQs resolved or deferred:

- OQ-SN-1 (attr ordering): RESOLVED — `serde_json/preserve_order` chosen (no `indexmap` top-level dep).
- OQ-SN-2 (crate location): RESOLVED — `packages/server/src-native/`.
- OQ-SN-3 (hydratable): DEFERRED to v0+M+1 (impl present; gate excluded).
- OQ-SN-4 (publish-server job): DEFERRED — see Open Items HIGH.
- OQ-SN-5 (Rust deps): RESOLVED — `serde` + `serde_json/preserve_order` only.
- OQ-SN-6 (perf bar): DEFERRED — bench task post-Builder; not a Builder gate.
- OQ-SN-7 (license): RESOLVED — MIT on all four platform packages.

---

## Durable references

- `.team/v1/director-notes/server-native-session-001.md` — opening substance frame
- `.team/v1/director-notes/server-native-session-002.md` — loader-default adjudication (Builder R2 trigger)
- `.team/v1/scout-report-server-native-session-001.md` — SSR contract audit
- `.team/v1/spec-server-native.md` — Architect spec, 15 ACs, OQ-SN-1..7
- `.team/v1/build-manifest-server-native.md` — Builder R1 + R2 manifests
- `.team/v1/verification-report-server-native.md` — Verifier PASS_WITH_NOTES
- `.team/v1/retro-session-server-native.md` — Historian retro
