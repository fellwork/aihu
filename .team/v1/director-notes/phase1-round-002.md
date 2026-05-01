# Director Note — Phase 1, Round 2

**Date:** 2026-05-01
**HEAD:** `64356cf` (`feat/phase1-contract`)
**Track:** Phase 1 — DX artifacts (Lane C) + Release CI (Lane D)
**Author:** Team Lead (after substance dispatch — first-pass Director couldn't reach Write; substance synthesized from retro + carry-forward)

---

## 1. On-Thesis Check

Round 2 ships the developer-facing surface that makes the Round 1 compiler usable: examples, grammar docs, editor support, MIT licensing, and pre-built binaries. Every item flows directly from the locked Phase 1-DX scope set during the eng review (TODO-DX promotion).

**No scope creep risks at the Lane level.** The constraints that hold:
- Examples must round-trip through the SHIPPED binary (see retro learning #1). No speculation on emitter output.
- `docs/grammar.md` must reflect RC-3 ('' fallback) and RC-4 (Set validation) as locked — not aspirational alternatives.
- Lane D uses `cross` (or equivalent) for cross-compile; `serde_json` stays out of the compiler dependency tree (T-4 from Round 1 still applies).

**Latent thesis pressure to call out:** the `examples/` directory is the public face of scribe. The two examples must communicate the value prop ("one file, two surfaces") in their structure — not just compile cleanly.

---

## 2. Lane Sequencing

| Lane | Owner | Depends on | Independent of | Files |
|------|-------|-----------|----------------|-------|
| C | Builder C (TS/markdown) | Lane A binary (DONE — `64356cf`) | Lane D | `examples/`, `docs/`, `editors/`, `LICENSE`, root `package.json` |
| D | Builder D (CI/TS) | Lane A binary (DONE) | Lane C | `.github/workflows/release.yml`, `packages/compiler/js/index.ts`, `packages/compiler/package.json` |

**Lane C internal sequencing:**
- C-1 (airtime-quote example) → must run BEFORE C-3 (grammar.md) because the canonical emitter output should be inspected to ensure docs match reality.
- C-2 (scripture-reference) can run in parallel with C-1 (different fixture).
- C-4 (tthw-log), C-5 (vscode), C-6 (LICENSE) are independent of C-1/C-2.

**Recommended C ordering for one Builder:** C-1 → C-2 → C-3 → C-5 → C-4 → C-6.

**Lane D / Lane C parallel-safe:** zero file overlap. Dispatch in parallel.

---

## 3. Lane-vs-Files Matrix

| File / Path | Lane C | Lane D |
|-------------|:------:|:------:|
| `examples/airtime-quote/airtime-quote.scribe` | ✓ | — |
| `examples/airtime-quote/dist/*` (built output) | ✓ | — |
| `examples/scripture-reference/scripture-reference.scribe` | ✓ | — |
| `examples/scripture-reference/dist/*` | ✓ | — |
| `docs/grammar.md` | ✓ | — |
| `docs/tthw-log.md` | ✓ | — |
| `editors/vscode/**` | ✓ | — |
| `LICENSE` (repo root) | ✓ | — |
| `package.json` (root) — `"license": "MIT"` field | ✓ | — |
| `packages/*/package.json` — `"license": "MIT"` field | ✓ | — |
| `.github/workflows/release.yml` | — | ✓ |
| `packages/compiler/js/index.ts` (postinstall edit) | — | ✓ |
| `packages/compiler/package.json` (postinstall hook + bin field) | — | ✓ |
| `packages/compiler/src/**` | NEITHER | NEITHER |
| `packages/runtime/src/**`, `packages/agent/src/**` | NEITHER | NEITHER |
| `.team/v1/state-phase1.md` | NEITHER (Team Lead only) | NEITHER |

If either Builder finds a file not in this matrix, escalate before touching it.

---

## 4. Scout Brief

The Scout is read-only. Run from `C:/git/fellwork/scribe` on `feat/phase1-contract`. Report PASS/FAIL with raw output for each.

**SC-1: Branch state clean**
```bash
git status --short
```
Expected: only Track-C-related untracked or stashed files. No modified files under `packages/`, `.team/v1/director-notes/`, or `examples/`. (My local working tree may have Track C investigation .md files untracked — those are scope-clean for Phase 1.)

**SC-2: Round 1 commits present**
```bash
git log --oneline 201bd85..HEAD
```
Expected: commits include `e585eeb`, `8d8439f`, `309528a`, `b7b9b09` (Lane B), `9246047`, `751d168`, `4178b4c`, `5911f60` (Lane A), merge commits `708b7b0`, `469f12d`, plus state and retro commits.

**SC-3: Tests green at Round 1 levels**
```bash
bun run test 2>&1 | tail -3
cargo test --manifest-path packages/compiler/Cargo.toml 2>&1 | grep "test result" | tail -10
```
Expected: 323 TS tests pass. 68 Rust tests pass + 1 ignored.

**SC-4: Lane A release binary builds**
```bash
cargo build --release --manifest-path packages/compiler/Cargo.toml 2>&1 | tail -3
```
Expected: "Finished release profile [optimized]". Binary exists at `packages/compiler/target/release/scribe-compile.exe` (Windows) or `scribe-compile` (Unix).

**SC-5: Binary smoke test against airtime-quote contract**
Use the binary to compile a tmp `.scribe` with the canonical airtime-quote contract. Verify:
- Output JS contains `defineComponent({`, `attrs: ['plan', 'amount']`, `_plan_V`, `computed(() => Number(`, `defineElement('airtime-quote'`
- `agent-manifest.json` is produced with `"airtime_quote"`, `"airtime-quote"`, `"plan"`, `"amount"`, `"quote"`

(I already ran this manually — see Round 2 dispatch chat for output. Scout verifies it still passes.)

**SC-6: Stale dist hunt**
```bash
git ls-files packages/*/dist/ 2>&1 | head
```
Expected: NO files committed under any `packages/*/dist/` directory. (Phase 1 dist regeneration was not committed — verify nothing leaked.)

**SC-7: License / package.json baseline**
```bash
ls LICENSE 2>&1; grep -l '"license"' packages/*/package.json package.json 2>&1
```
Record current state. Expected: no `LICENSE` file at root yet. No `"license"` field in any `package.json` yet (or if some packages have it, note which).

**SC-8: c4_transform_produces_typescript still ignored?**
```bash
grep -n "ignore" packages/compiler/tests/c4_integration.rs 2>&1 | head -3
```
Expected: `#[ignore]` attribute still present. This is the latent item from Round 1 SC-7.

**SC-9: GitHub Actions workflow inventory**
```bash
ls -la .github/workflows/ 2>&1
```
Record what workflows currently exist. Expected: no `release.yml`. (If one exists, surface it — D will need to extend not replace.)

---

## 5. Builder C Brief (DX Artifacts)

Work entirely within Lane C files (see §3 matrix). Branch from `feat/phase1-contract`. Each sub-step must leave the test suite green and a clean working tree.

### Pre-flight (do BEFORE coding)

Run `bun run test` and `bun run typecheck` to confirm a green baseline. Build the release binary: `cargo build --release --manifest-path packages/compiler/Cargo.toml`. Confirm it exists at `packages/compiler/target/release/scribe-compile.exe` (Windows) or `scribe-compile` (other platforms). **All examples below are authored against this binary's output, NOT speculation.**

### Step C-1: `examples/airtime-quote/airtime-quote.scribe`

Create the directory and the canonical `.scribe` file. Use this exact contract source:

```html
<contract>
input plan: enum(daily, weekly, monthly) = daily
input amount: number = 100
state total: number   # Final quoted total shown to the user
action quote() -> { plan: string, amount: number, fee: number, total: number }
</contract>
<script setup lang="ts" name="airtime-quote">
import { computed } from '@scribe/signals'

const fee = computed(() => plan() === 'daily' ? 5 : plan() === 'weekly' ? 10 : 20)
const total = computed(() => amount() + fee())

export function quote() {
  return { plan: plan(), amount: amount(), fee: fee(), total: total() }
}
</script>
<template>
  <div class="airtime-quote">
    <span>{{ total }}</span>
  </div>
</template>
<style>
.airtime-quote { padding: 0.5rem; font-family: system-ui; }
</style>
```

**Verify by running the binary** against this file. Expected: clean JS output to stdout (or to `--out dist/`), and an `agent-manifest.json` matching:

```json
{
  "tools": [{
    "name": "airtime_quote",
    "tag": "airtime-quote",
    "inputs": {
      "plan": { "type": "enum", "values": ["daily","weekly","monthly"], "default": "daily" },
      "amount": { "type": "number", "default": "100" }
    },
    "actions": {
      "quote": { "returns": { "plan": {"type":"string"}, "amount": {"type":"number"}, "fee": {"type":"number"}, "total": {"type":"number"} } }
    }
  }]
}
```

**Also create** `examples/airtime-quote/README.md` (3-5 sentences max): what the example demonstrates, how to compile it, what the output is. No tutorial bloat.

### Step C-2: `examples/scripture-reference/scripture-reference.scribe`

Fellwork-specific dogfood. Look up a Bible verse by reference. Use this contract:

```html
<contract>
input book: string = Genesis
input chapter: number = 1
input verse: number = 1
state text: string   # The verse text after lookup
action look_up() -> { book: string, chapter: number, verse: number, text: string }
</contract>
<script setup lang="ts" name="scripture-reference">
import { signal, computed } from '@scribe/signals'

const [text, setText] = signal('')

export function look_up() {
  // In a real component, fetch from a corpus. For the example, return the input.
  setText(`${book()} ${chapter()}:${verse()} (text would be fetched here)`)
  return { book: book(), chapter: chapter(), verse: verse(), text: text() }
}
</script>
<template>
  <div class="scripture-reference">
    <span>{{ text }}</span>
  </div>
</template>
<style>
.scripture-reference { font-family: Georgia, serif; padding: 1rem; }
</style>
```

Same verification pattern: compile with binary, confirm manifest. Add a `README.md` (3-5 sentences) that names this as the Fellwork dogfood example.

### Step C-3: `docs/grammar.md`

Full BNF for the contract mini-language. Must include:

1. Grammar rules in BNF for: `input`, `state`, `action`, type tokens (`string`, `number`, `boolean`, `enum(...)`), comments (`#`), enum syntax.
2. **Null/missing behavior table:**
   | Type | No default declared | Coercion at runtime |
   |------|---------------------|--------------------|
   | `string` | `''` (empty string) | none |
   | `number` | `0` | `Number(attr)` via computed |
   | `boolean` | `false` | `attr === 'true'` via computed |
   | `enum(a,b,c)` | first variant `a` | Set.has check via computed; falls back to first variant |
3. **Error code table:** C001 (unknown keyword) through C007 (duplicate input). Reference `packages/compiler/src/parser/contract.rs` test cases for canonical examples.
4. **Manifest emission table:** how each contract construct maps to `agent-manifest.json` fields.
5. **Stability annotations:** mark all v1 grammar items as STABLE; note that `string!` (required) is reserved for v2.

Length target: 200-400 lines. Concrete, no fluff. Use the `airtime-quote` and `scripture-reference` examples as worked references.

### Step C-4: `docs/tthw-log.md`

Time-to-Hello-World log. Skeleton structure:

```markdown
# TTHW Log

Measurements of how long it takes a developer to go from `git clone` to a working `.scribe` component.

## Methodology
- TTHW_UI: time to a custom element rendering in browser
- TTHW_MCP: time to an agent calling the MCP tool

## Measurements
| Date | Setup | TTHW_UI | TTHW_MCP | Notes |
|------|-------|---------|----------|-------|
| TBD | macOS, Bun 1.3.8 | TBD | TBD | First measurement after Lane D ships pre-built binaries |
```

50 lines max. This is a tracking artifact, not docs.

### Step C-5: `editors/vscode/`

Minimal VS Code extension:
- `editors/vscode/package.json` — extension manifest
- `editors/vscode/syntaxes/scribe.tmLanguage.json` — TextMate grammar for `.scribe` files. Should highlight: `<contract>`, `<script setup>`, `<template>`, `<style>` block boundaries, contract keywords (`input`, `state`, `action`), type tokens.
- `editors/vscode/snippets/scribe.json` — 3-5 snippets: `contract-input`, `contract-action`, `contract-state`, `script-setup`, `template-block`.
- `editors/vscode/README.md` — install instructions (extension is not yet on the marketplace; load locally via "Developer: Install Extension from Folder").

Length target: a working extension that highlights at minimum the contract block keywords. Do NOT publish to marketplace this round.

### Step C-6: MIT LICENSE + package.json fields

1. Create `LICENSE` at repo root with the standard MIT license text. Copyright line: `Copyright (c) 2026 Fellwork`.
2. Add `"license": "MIT"` to root `package.json`.
3. Add `"license": "MIT"` to every workspace `packages/*/package.json` that doesn't already have it.

**Acceptance:** `git ls-files | grep -i license` shows the root LICENSE; every workspace package.json has the field.

### Builder C acceptance gate (BEFORE declaring DONE)

Per Round 1 retro learning #4, paste the green output from each of:
```bash
bun run typecheck 2>&1 | tail -10
bun run test 2>&1 | tail -5
bun run build 2>&1 | tail -10
cargo build --release --manifest-path packages/compiler/Cargo.toml 2>&1 | tail -3
./packages/compiler/target/release/scribe-compile examples/airtime-quote/airtime-quote.scribe --out examples/airtime-quote/dist/ 2>&1
./packages/compiler/target/release/scribe-compile examples/scripture-reference/scripture-reference.scribe --out examples/scripture-reference/dist/ 2>&1
```

All must succeed. The two example compilations must produce both `<name>.ts` and `agent-manifest.json` files in their respective `dist/` directories. Add `examples/*/dist/` to `.gitignore` so build outputs aren't committed.

### Builder C deliverable

Commits:
- `feat(examples): C-1+C-2 — airtime-quote and scripture-reference .scribe examples`
- `docs(grammar): C-3 — full BNF + null behavior + error codes`
- `docs(tthw): C-4 — TTHW measurement log skeleton`
- `feat(editors): C-5 — VS Code TextMate grammar + snippets`
- `chore(license): C-6 — MIT LICENSE + package.json license fields`

Or squash these into 1-2 commits if the author prefers. Either way: branch `feat/phase1-lane-c`. Push when complete; do not merge to `feat/phase1-contract` until Verifier C clears.

---

## 6. Builder D Brief (Release CI + Postinstall)

Work entirely within Lane D files (§3 matrix). Branch from `feat/phase1-contract` to `feat/phase1-lane-d`.

### Step D-1: `.github/workflows/release.yml`

Cross-compile matrix workflow. Trigger on `push: tags: ['v*']`. Build `scribe-compile` for four targets:

| Target | Runner | Rust target triple | Asset name |
|--------|--------|--------------------|-----------|
| mac-arm64 | macos-14 | `aarch64-apple-darwin` | `scribe-compile-darwin-arm64` |
| mac-x64 | macos-13 | `x86_64-apple-darwin` | `scribe-compile-darwin-x64` |
| linux-x64 | ubuntu-22.04 | `x86_64-unknown-linux-gnu` | `scribe-compile-linux-x64` |
| windows-x64 | windows-2022 | `x86_64-pc-windows-msvc` | `scribe-compile-windows-x64.exe` |

For each: `cargo build --release --target <triple> --manifest-path packages/compiler/Cargo.toml`. Upload binary to GitHub Release using `softprops/action-gh-release@v2` (or current stable equivalent).

The workflow should ALSO run on `workflow_dispatch` so the user can dry-run it manually without tagging.

### Step D-2: `packages/compiler/js/index.ts` postinstall hook

Add a postinstall script (likely as a separate file `packages/compiler/js/postinstall.ts` referenced from `package.json` → `"scripts": { "postinstall": "..." }`).

Behavior:
1. Detect platform: `process.platform` + `process.arch` → asset name (use the same naming as D-1).
2. Download from `https://github.com/fellwork/scribe/releases/latest/download/<asset-name>` to `packages/compiler/bin/scribe-compile<extension>`.
3. `chmod 0755` on Unix.
4. **Fail loud** on missing artifact: `process.exit(1)` with a clear stderr message naming the URL it tried.
5. Skip download if the binary already exists (idempotent — for CI re-installs).

Add a fallback: if `SCRIBE_COMPILE_BIN` env var is set, use that path instead of downloading. (Useful for local development where the binary is built from source.)

Update `packages/compiler/package.json`:
- `"scripts": { "postinstall": "bun run packages/compiler/js/postinstall.ts" }` (or equivalent)
- `"bin": { "scribe-compile": "./bin/scribe-compile" }` (so it's available as a CLI after install)
- `"files"` includes `bin/`, `js/`, `dist/`

### Step D-3: Verification without pushing a tag

Document a dry-run procedure in `packages/compiler/RELEASE.md`:
1. `gh workflow run release.yml` — manual dispatch
2. Inspect the produced artifacts on the workflow run page
3. Confirm all 4 binaries are uploaded
4. Confirm `packages/compiler/js/postinstall.ts` against `SCRIBE_COMPILE_BIN=$(pwd)/packages/compiler/target/release/scribe-compile.exe bun install` resolves correctly without network

### Builder D acceptance gate

Before declaring DONE:
- `release.yml` passes `gh workflow view release.yml --yaml` validation (no syntax errors)
- `bun run typecheck` green (postinstall.ts compiles)
- Manual dry-run of postinstall in a clean directory succeeds via `SCRIBE_COMPILE_BIN` fallback
- Workflow file uses pinned action versions (not `@main` or `@latest`)

### Builder D deliverable

Commits:
- `ci: D-1 — release.yml cross-compile workflow (mac-arm64, mac-x64, linux-x64, windows-x64)`
- `feat(compiler): D-2 — postinstall download hook with SCRIBE_COMPILE_BIN fallback`
- `docs(compiler): D-3 — RELEASE.md dry-run procedure`

Branch `feat/phase1-lane-d`. Do not merge until Verifier D clears.

---

## 7. Surface-to-User Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| T-1 | Test count drops below baseline (323 TS, 68 Rust + 1 ignored) | Stop, escalate |
| T-2 | Lane A binary fails to compile any example | Stop, escalate — likely Round 1 regression |
| T-3 | `bun run build` size budget fails | Stop, escalate — examples might be importing wrong path |
| T-4 | `serde_json` or other JSON crate added to `[dependencies]` of compiler | Stop, escalate — D11 hand-rolled JSON is the design |
| T-5 | Lane C example contract doesn't match `agent-manifest.json` from binary | Stop, escalate — example is speculation, retro learning #1 |
| T-6 | Lane D needs a `secrets.GITHUB_TOKEN` scope beyond default | Stop, escalate — security review |
| T-7 | Builder attempts to extend Rust compiler scope (e.g., add `--json-errors`) | Stop, redirect — Round 2 is DX-only |
| T-8 | Repo has a license already and adding MIT would conflict | Stop, escalate — legal question |
| T-9 | More than 2 findings from a single Verifier | Re-spin Builder, don't inline-fix (retro inline-fix heuristic) |

---

## 8. Latent Items from Round 1

| Item | Decision |
|------|----------|
| `c4_transform_produces_typescript` ignored test | DEFER to TODOS.md — not Round 2 scope. Add a TODO-004 entry. |
| Stale `dist/index.d.ts` in any other package | Scout SC-6 verifies. If found, surface in Round 2 (likely Lane C touches one). |
| `serde_json` for example manifest validation | NOT introduced — examples use the binary's output, parsed by native `JSON.parse` in tooling if needed. |

---

## On-Thesis One-Liner

Round 2 makes scribe usable: pre-built binaries (no Rust toolchain required), worked examples that round-trip through the actual compiler, BNF-grade docs, editor highlighting, and an MIT license. After Round 2, a developer can `bun add @scribe/compiler` and ship a `.scribe` component to production in under 5 minutes.
