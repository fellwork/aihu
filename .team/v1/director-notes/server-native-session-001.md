# Director Note — server-native session 001

**Date:** 2026-05-02
**Topic:** Rust napi-rs core for `@aihu/server` SSR
**Status:** Fresh topic — no prior session.

---

## 1. Substance frame

**Success looks like:** a `@aihu/server` import path that, on platforms where a prebuilt native binary is available, runs `renderToString` 5×+ faster than the current TS implementation in `packages/server/src/ssr.ts` while emitting **byte-identical** HTML. On platforms where a native binary cannot load (edge runtimes, unsupported triples, stripped install), the module silently falls through to the existing TS path. Public API is unchanged.

**What's at stake:** SSR is the production hot path for any aihu app. A Rust core is the lever that turns aihu from "fast on the client" into "fast end-to-end" — a credible v1+ differentiator. Failure modes are equally load-bearing: silent parity drift would poison the "vanilla custom elements out the back" promise; a hard-fail on Cloudflare Workers would kneecap the edge story.

**Acceptance bar:**
1. **Byte-identical output** — property test (random arbor trees → both impls → assert string equality). No "semantically equivalent" wiggle room. Cement this as a CI gate on every PR touching either implementation.
2. **Edge-runtime fall-through** — when the native binary cannot load, the module exports the TS impl with no behavioral difference and no console noise.
3. **Loud failure on corruption** — missing/corrupt binary on a platform that *should* have one fails loud at first call with install instructions. Never silently fall through in that case.
4. **Zero new public API** — `renderToString` / `renderToStream` signatures unchanged.

---

## 2. Priorities for Round 1

**Scout audits:**
- The full `ssr.ts` HTML emission contract — every escape rule, every attr ordering choice, every conditional (`hydratable`, `serializer`, `contextSetup`, `dataSource` boundary).
- The `_setContextFns` injection slot — how it interacts with FFI boundary (Rust cannot import `@aihu/context`).
- The `packages/compiler/` postinstall + release pattern as a template (NOT to copy — to learn the gaps; current compiler is a *binary spawned via execFileSync*, napi-rs ships a `.node` addon loaded via `require`).
- napi-rs current state of the art (release 2.x, build matrix conventions, `@napi-rs/cli` capabilities).
- Edge-runtime detection signals (how Workers/Deno/Vercel-Edge advertise themselves at runtime).

**Architect designs:**
- The FFI boundary: what types cross Rust/JS, what stays in JS (context-map activation must remain JS-side; the Rust core receives a fully-resolved tree or a JS-callable factory).
- The fall-through loader — three-state resolution (native loaded / native skipped / native failed-loud).
- Property-test harness shape — generator for `branch`/`leaf` trees, equality oracle, CI integration.
- The crate skeleton, build matrix, and release-pipeline shape.

---

## 3. Recommended scope (v0+M)

**Recommended:** `renderToString` static rendering, no async boundaries, no `dataSource` suspension, no `contextSetup` (TS path only when contextSetup is provided in v0+M). Property-test parity vs TS on synchronous trees. **Defer** `renderToStream` and `DataSource` to v0+M+1 — the streaming controller machinery (`emitStateScriptAndClose`, pending counter, async suspension) is the most subtle code in `ssr.ts` and is worth a second session of dedicated design.

**Why not bare-minimum (no hydration markers):** `hydratable: true` is one branch in `renderNode`. Cutting it saves nothing and loses test surface.

**Why not stretch (streaming):** the async boundary protocol is a moving target (`DataSource<T>` is the v1 SSR streaming-suspension contract per `stream-types.ts`); committing the Rust impl to a not-yet-stable protocol is premature. Land static parity first, then layer streaming.

---

## 4. Crate-location recommendation

**Recommend `packages/server/src-native/`** (co-located with the TS package).

Reasoning:
- napi-rs convention puts the crate next to the JS that loads it; `@napi-rs/cli` defaults assume this layout.
- One npm package owns both the JS loader and the native binary — simpler postinstall mapping, simpler version pinning (no separate Cargo workspace version).
- The existing `packages/compiler/` precedent already proves co-location works for our build pipeline.
- Tauri-style `crates/` at root is appropriate when many crates share dependencies — we have one server crate and a separate compiler crate that won't share much.

**Surface to user:** this is a one-time choice. Reorganizing later rewrites git history. Confirm before Architect commits.

---

## 5. Build matrix recommendation

**Initial release: 4 platforms** — `darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `win32-x64-msvc`. Mirrors the existing `packages/compiler/` release workflow exactly. Add `linux-arm64-gnu` and `linux-x64-musl` (Alpine) in a follow-up release once the 4-platform pipeline is green and we have one downstream user actually deploying.

**Why not start with all 6:** every additional target is a runner cost and a CI failure surface. Match the proven-working compiler matrix first; expand on demand.

---

## 6. Open questions for the user

1. **npm package name** — `@aihu/server` already exists. The native addon needs *some* identity. Options: (a) bundle the `.node` directly inside `@aihu/server` with platform-specific optionalDependencies (napi-rs default), (b) split a `@aihu/server-core` package consumed by `@aihu/server`, (c) `@aihu/server-native`. Recommend (a) — fewest moving parts. **User decides.**
2. **Permitted Rust dependencies** — any restrictions? `napi`, `napi-derive` are required. Beyond that: do we permit a small HTML-escape crate, or write our own (matching `escapeAttr` in `ssr.ts`)? Recommend writing our own — escape rules are the parity surface and a dep there couples us to that crate's semver.
3. **License of bundled binaries** — repo has no `LICENSE` per README §License. Compiler postinstall ships binaries under no declared license. Surface this for v1.
4. **Performance bar** — is "5× faster `renderToString` on a 10k-leaf tree" enough? Or do we want a specific target (e.g., 10× on a defined workload) before we declare the work shipped?

---

## 7. Surface-to-user triggers

Pause for user review at:
- **After Scout report** — if Scout finds the `_setContextFns` injection cannot be cleanly bridged across FFI for v0+M+1 streaming, that's a scope-rethink moment.
- **After Architect spec, before Builder dispatch** — user confirms (a) crate location, (b) package-naming choice from §6, (c) initial build matrix, (d) the property-test parity bar wording.
- **First parity-test failure during Builder phase** — if Rust output diverges from TS on a non-trivial input, Team Lead surfaces immediately rather than patching one-off.
- **Before merging Lane A binary into a release tag** — first cross-compile run is gated; user approves the v-tag push.

---

## 8. Refined briefs

### Scout brief (paste-ready)

> Audit the surface for a Rust napi-rs port of `@aihu/server`'s `renderToString`. Read `packages/server/src/ssr.ts` and `packages/server/src/stream-types.ts` end-to-end and produce a contract inventory: every HTML emission rule (tag default, attr ordering, escape behavior in `escapeAttr`, boolean-attr handling, `data-aihu-path` formatting, head/body assembly, state-script emission, fall-through behavior on unknown `kind`). Document the `_setContextFns` injection slot and how it interacts with a future FFI boundary (Rust cannot import `@aihu/context`). Report the napi-rs 2.x release pattern, edge-runtime detection signals (Workers/Deno/Vercel-Edge), and the deltas vs `packages/compiler/`'s release workflow (compiler ships a *spawned binary*; napi-rs ships a *loaded `.node` addon* — different postinstall shape). Do NOT touch `ssr.ts`, `packages/server/src/`, `packages/compiler/`, or any release workflow. Output: `.team/v1/scout-report-server-native-session-001.md`.

### Architect brief (paste-ready)

> Design the Rust napi-rs core for `@aihu/server`'s `renderToString` — static-only, no streaming, no async boundaries, no `contextSetup` in v0+M (TS fall-through covers those). Recommended crate location: `packages/server/src-native/` (confirm with Director). Recommended build matrix: 4 platforms matching `packages/compiler/`'s release.yml (darwin-arm64, darwin-x64, linux-x64-gnu, win32-x64-msvc).
>
> The spec MUST contain:
> 1. **FFI boundary types** — what crosses Rust/JS (recommend: a serialized tree representation; JS factory invocation stays JS-side).
> 2. **Three-state loader** — native-loaded / native-skipped (edge runtime) / native-failed-loud (corrupt binary on supported platform). Edge detection mechanism. Exactly which export shape replaces the TS `renderToString`.
> 3. **Parity acceptance** — property test using fast-check generators emitting random `branch`/`leaf` trees with arbitrary attrs, asserting `rustImpl(tree) === tsImpl(tree)` byte-for-byte. CI gate on every PR touching `ssr.ts` OR the Rust crate.
> 4. **Failure-loud contract** — when binary is corrupt/missing on a triple that *should* have it, error message includes platform, expected binary name, and reinstall instruction. Never silently fall through in this case.
> 5. **Crate skeleton** — `Cargo.toml`, module layout, `napi`/`napi-derive` versions, no other deps unless justified (HTML escape stays hand-written for parity-surface stability).
> 6. **Release pipeline delta** — what `.github/workflows/release.yml` changes are needed (additional jobs, NOT a separate workflow file).
> 7. **Open questions** flagged for the user from this director-note's §6.
>
> Output: `.team/v1/spec-server-native.md`. Do NOT write the Rust crate itself. Stop at spec; Builder dispatch is gated on user review.
