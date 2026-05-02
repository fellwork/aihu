# Verification Report — server-native-session-001

**Track:** Server-Native (v0+M)
**Branch:** `feat/v1-server-native` @ `1e19da1` (Builder R1 + R2 corrective commit)
**Verifier:** Claude Sonnet 4.6, 2026-05-02
**Ref spec:** `.team/v1/spec-server-native.md`, Director session-002

---

## 1. Verdict: PASS_WITH_NOTES

No BLOCKING findings. Three HIGH/INFO items documented below. All 15 ACs either PASS or BLOCKED-no-binary for the expected runtime reasons.

---

## 2. AC Table

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 | PASS | `packages/server/src-native/Cargo.toml` exists. Build manifest reports `cargo build --release` exit 0 on rustc 1.87.0 with `napi-build` pinned to 2.2.2 in Cargo.lock. |
| AC-2 | BLOCKED-no-binary | No `.node` binary present in worktree (gitignored per `src-native/.gitignore`). |
| AC-3 | PASS | `loader.ts:301` exports `async function renderToString(component: ComponentDescription, opts?: SsrOptions): Promise<string>`. Build manifest reports `server:typecheck` clean. |
| AC-4 | PASS | `packages/server/src/index.ts:8` — `export { renderToString } from './loader.ts'`. |
| AC-5 | PASS | `ssr.test.ts`, `compliance/ssr-output.test.ts`, `ssr-stream.test.ts` are byte-for-byte identical to main. 454/454 tests passing. |
| AC-6 | PASS | `native-parity.test.ts` is 327 lines. Contains 8 named samples S1-S8 + 2 `fc.assert` calls (≥1 required). |
| AC-7 | BLOCKED-no-binary | Requires native addon loaded. |
| AC-8 | BLOCKED-no-binary | Requires native addon loaded. |
| AC-9 | PASS | `loader.ts:284-295` — top-level synchronous throw block; no `SCRIBE_FORCE_NATIVE` precondition. Error message includes platform name, package name, file name, "npm install @scribe/server", and "SCRIBE_NATIVE_SKIP=1". |
| AC-10 | PASS | `loader.ts:138-145` — `SCRIBE_NATIVE_SKIP === '1'` short-circuits silently. Also early-checked in `detectEdge()`. |
| AC-11 | PASS (partial) | `native-parity.test.ts:266-282` — `EdgeRuntime` global mock test exists. Full integration BLOCKED-no-binary. |
| AC-12 | PASS | All 4 platform `package.json` exist. Linux has `libc:["glibc"]`. All have `license:"MIT"`. |
| AC-13 | PASS | `packages/server/package.json` `optionalDependencies` lists 4 packages pinned at `0.1.0`. |
| AC-14 | PASS | `server:build` passes (rolldown 668ms). `baselines:build` failure is pre-existing. |
| AC-15 | PASS | `release.yml:114-129` parity-gate comment; zero `SCRIBE_FORCE_NATIVE` refs. |

---

## 3. Director Session-002 Compliance

| Check | Status | Evidence |
|-------|--------|---------|
| `loader.ts` has 0 references to `SCRIBE_FORCE_NATIVE` | PASS | `grep` returns 0 matches. |
| `release.yml` has 0 references to `SCRIBE_FORCE_NATIVE` | PASS | `grep` returns 0 matches. |
| `vitest.config.ts` sets `SCRIBE_NATIVE_SKIP=1` in test env | PASS | `vitest.config.ts:15-17` — `env: { SCRIBE_NATIVE_SKIP: '1' }` inside `test:`. |
| Loader throw site is unconditional | PASS | `loader.ts:284-295` — bare module-load block; only `SCRIBE_NATIVE_SKIP` (the documented escape) prevents it, not `SCRIBE_FORCE_NATIVE`. |

All four corrections confirmed present.

---

## 4. Spec §10 Over-Reach Check

Files verified unchanged vs. main:
- `packages/server/src/ssr.ts`
- `packages/server/tests/ssr.test.ts`, `compliance/ssr-output.test.ts`, `ssr-stream.test.ts`
- `.github/workflows/plan-a.yml`
- `packages/server/src/index.ts` — only the permitted line-8 export change

Files modified outside §10 list (all permitted):
- `packages/server/rolldown.config.ts` — added externals (necessary)
- `vitest.config.ts` — added test env (Director session-002)
- `packages/server/package.json` — `optionalDependencies` (AC-13)
- `.github/workflows/release.yml` — `build-native` + `publish-native` jobs (AC-15, §7)

No over-reach detected.

---

## 5. Bidirectional Findings

### HIGH — `null` attr value handling untested by property gate
`render.rs:175-190` handles `Value::Null` in attrs by emitting ` k="null"` (matches `String(null) = "null"` in TS). Logic is correct by analysis. However `attrValueArb` only generates `string | true | false`. Recommendation: extend a named sample to cover null, or add an explicit out-of-parity-gate note in the spec. **Not blocking** — correctness verified, only test coverage is the gap.

### HIGH — `serde` `alloc` feature on a `std` target
`Cargo.toml:12` has `serde = { ..., features = ["derive", "alloc"] }`. The `alloc` feature is a no_std artifact; in a std environment it's a no-op. Not a bug, but unusual. Future cleanup.

### INFO — `Cargo.lock` gitignored
Per Rust convention for library crates. CI uses `dtolnay/rust-toolchain@stable`. Without lockfile, transitive dep updates could affect binary determinism. Defensible per napi-rs package-template convention.

### INFO — `_resetLoaderState` / `_getLoaderStateKind` test helpers
Exported from `loader.ts` for test access. Not re-exported via `packages/server/src/index.ts` (only `renderToString` is named there), so package consumers cannot import them. Safe as-is.

### INFO — `indexmap` transitive dep
Pulled in by `serde_json/preserve_order`. No direct `indexmap` in `Cargo.toml`. Matches OQ-SN-1 resolution.

---

## 6. Required Actions for Builder

None. No BLOCKING findings.

---

## 7. Surface-to-User

**A. `napi-build` version pin (LOCAL ONLY):** Build required `cargo update -p napi-build --precise 2.2.2` because rustc 1.87 cannot compile `napi-build@2.3.1`. CI runners use `dtolnay/rust-toolchain@stable` → rustc ≥ 1.88, will pick up latest automatically. Local-dev-only friction; not a CI risk.

**B. `publish-server` job not yet wired (BEFORE FIRST v0.1.0 TAG):** OQ-SN-4 explicitly deferred. The main `@scribe/server` package is not published in this PR's release pipeline. Before cutting `v0.1.0`, either add a `publish-server` job to `release.yml` OR publish `@scribe/server` manually so `npm install @scribe/server` resolves the platform optionalDependencies. User must sequence before first tag.

**C. `null` attr coverage gap:** Functionally correct, untested by property gate. Optional spec extension before declaring perf parity.

---

**Sources:**
- `.team/v1/spec-server-native.md`
- `.team/v1/director-notes/server-native-session-001.md` and `server-native-session-002.md`
- `feat/v1-server-native` @ `1e19da1` (Builder R1 + R2)
