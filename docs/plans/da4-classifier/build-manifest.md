# DA4 classifier, phase 1 — W472 warning release: build manifest

**Issue:** #437 (founder-ratified 2026-07-20 via /autoplan) · **Branch:** `fix/da4-classifier` · **Base:** `origin/main` at `774b38cf`
**Scope:** the ONE W-code warning release that must precede the semver-major
default flip (ratification amendment 1). The flip itself, css-engine mixed-mode,
`--shadow` flag/wizard semantics, and the styling-docs corrections are the
FOLLOW-UP major PR — nothing here changes any compiled output's shadow behavior.

---

## 1. W-code chosen: **W472**

Numbering convention: warnings take a free number in the topical range of their
related C-codes (precedent: W562 beside C560/C561 for `$prop` writes). The
`$shadow`/`$extends` per-file-mode topic owns C470/C471
(`packages/compiler/src/parser/state_macros.rs`); 472 was free in both the C and
W namespaces → **W472**.

Message (ratified wording): *"this page-level component will default to
shadowMode 'none' (light DOM) in the next major; write `$shadow open` to keep
shadow DOM, or `$shadow none` to adopt light DOM now"* — with the full uniform
tail from `packages/compiler/src/diagnostics.rs`: `hint:` (why — DA4/crawlers),
`fix:` (pin the mode in `@state`), and the machine rewrite
`replace: @state {` / `with: @state {\n  $shadow: 'open'` ('open' because the
machine-applied form must preserve today's behavior).

## 2. Classifier + plumbing path

Decision fn: `route_shadow_flip_warning(&AihuSource) -> Option<CompileError>`
(pub, `packages/compiler/src/lib.rs`) — pure, so the precedence triple is
directly testable. `Some` iff `source.route.is_some()` AND no
`StateMacro::Shadow` parses out of `@state`. Any `$shadow` mode
(open/closed/none) suppresses: the macro always wins in the ratified
classifier.

Emission: called at the end of `compile_full_with_options` (after the
script-macro validation block, so a hard `@state` parse error wins), routed
through `diagnostics::emit_warning` → stderr. Non-fatal by construction — it
never touches the `Result` channel, so the build cannot fail on it.

Where it renders (the same plumbing W210/W562 already use):
- **CLI:** `aihu-compile` prints it on stderr; exit stays 0 (demonstrated below).
- **Vite plugin / dev overlay path:** the plugin's `transform()`
  (`packages/compiler/js/index.ts`) spawns the binary via `execFileSync`, which
  passes child stderr through to the dev-server terminal. Warnings do not throw,
  so they surface in terminal output rather than the error overlay — identical
  to every existing W-code (the overlay is the fatal-error channel).
  `compileSidecar` deliberately captures stderr (pre-existing, so warnings don't
  interleave with `aihu-tsc` type diagnostics).
- **wasm:** same library call site (`wasm.rs` → `compile_full_with_options`).

## 3. Tests (all in `packages/compiler/tests/route_shadow_warning.rs`)

Precedence triple + two hardening tests:

| Test | Verifies | Result |
|------|----------|--------|
| `route_with_shadow_macro_no_warning` | (a) `$shadow` present (`'open'` AND `'none'`) → no warning | pass |
| `route_without_shadow_warns_w472` | (b) `@route`, no `$shadow` → W472 with code/hint/fix/replace/with + both escape hatches named | pass |
| `leaf_without_shadow_no_warning` | (c) no `@route`, no `$shadow` → no warning | pass |
| `warning_is_not_a_compile_error_and_changes_no_output` | warning never fails `compile_full`; no `@aihu:shadow` marker injected in phase 1 | pass |
| `shadow_macro_emits_marker_for_both_hatches` | escape hatches end-to-end (Rust side): `$shadow: 'open'`/`'none'` → leading `// @aihu:shadow <mode>` marker | pass |

**`cargo test -p aihu-compiler`: 863 passed, 0 failed** (baseline ~858 + 5 new).

Escape-hatch JS side (pre-existing, re-run green): marker →
`_injectShadowMode` covered by `packages/compiler/tests/inject-shadow-mode.test.ts`;
full `packages/compiler` vitest lane: 109 passed, 5 skipped.

## 4. Rendering demonstrated (release binary)

`@route` + no `$shadow` (compiled at `src/pages/index.aihu`), exit 0:

```
warning: W472: this page-level component will default to shadowMode 'none' (light DOM) in the next major; write `$shadow open` to keep shadow DOM, or `$shadow none` to adopt light DOM now
  hint: DA4: components with an `@route` block are pages, and pages become light DOM by default so server-rendered content is reachable by non-JS crawlers; leaf components keep shadow DOM
  fix:  pin the mode in `@state`: `$shadow: 'open'` keeps today's behavior, `$shadow: 'none'` adopts the future default now and silences this warning
  replace: @state {
  with:    @state {
  $shadow: 'open'
```

Same fixture with `$shadow: 'open'`: stderr empty, output leads with
`// @aihu:shadow open`, exit 0.

## 5. check:dual-audience — DA-e informational count (ratchet prep)

`scripts/check-dual-audience.ts` gains **DA-e**: scans shipped `.aihu` sources
(`packages/apps/examples/cookbook` globs, `GLOBAL_EXCLUDES` honored) for the
W472 shape (`@route` block, no `$shadow`), REPORTS the count, never pushes to
`findings` — it joins the `expectCount` contract when the flip lands. Detector
has bidirectional self-test cases (should-flag: `@route` no `$shadow`;
should-not-flag: pinned page + routeless leaf), same bar as the enforced rules.

Measured: **10 route component(s) without `$shadow`, of 88 shipped .aihu files**
(all 10 in `examples/*/src/pages/`). Enforced findings unchanged at **0**.

All five thesis invariants (fresh `bun install`, `SCRIBE_NATIVE_SKIP=1` via npm
scripts): derived 0, attributed 0, governed 0, dual-audience 0,
hydration-adoption 0 — every self-test ok, `check:thesis` exit 0.

## 6. Scaffold decision

Ratified: new apps adopt light DOM now (no warning noise on a fresh scaffold).

- `packages/cli/src/templates/app.ts` (`APP_INDEX_SCRIBE`) — `$shadow: 'none'`
  added as directed. **Surfaced:** this module has NO consumers (grep across
  packages/apps: only its own definition) — it is a vestigial template. The
  live `aihu app` emitter is `packages/cli/src/index.ts::appIndexAihu`.
- `appIndexAihu` (the real default scaffold), **plain/non-css branch:** pins
  `$shadow: 'none'`. The **css-engine branch deliberately does NOT pin** — its
  shadow mode is the user's `--shadow` wizard choice carried as the
  plugin-global `css: { shadowMode }` in vite.config.ts, and a per-file
  `$shadow` marker would override that choice; `--shadow` semantics are
  flip-PR scope by the ratification.
- `legacy-snapshot.golden` regenerated (documented refresh path): exactly one
  hunk, the `$shadow: 'none'` line in `src/pages/index.aihu`; provenance
  README updated with the regeneration log entry; freeze test re-verified
  byte-identical.
- Not pinned (surfaced, flip-PR scope): `appAboutAihu`, `appDocsIndexAihu`,
  `appDocsGuideAihu` (full/docs templates) and `pageAihu` (`aihu page`) also
  emit `@route` pages and will compile with W472 until the flip PR settles
  template-wide semantics.

Scaffold tests: `scaffold-and-compile.test.ts` 3 passed / 3 skipped (compile
phase gated on `AIHU_SCAFFOLD_COMPILE`, as on main); `scaffold-compile-clean`
passes (W472 is a W-code — its clean gate is `C\d{3}` + exit 0, both
unchanged); full `packages/cli` vitest lane: 292 passed, 6 skipped.

## 7. Migration doc

`docs/site/migration.md` §7 "Preparing for light-DOM pages (W472)" — the flip,
the classifier, the warning, both escape hatches, the scaffold default; W472
row added to the diagnostic quick reference. Mirrored byte-identical to
`apps/docs/src/content/docs/migration.md` (diff-verified).

## 8. Compiler binary bump

0.1.10 → 0.1.11 in all five `packages/compiler/npm/<platform>/package.json`
`version` fields AND the five `@aihu/compiler-*` pins in
`packages/compiler/package.json` optionalDependencies.
`BASE_REF=main bun scripts/check-compiler-binary-bump.ts` → `ok`.

## 9. Measured results (summary)

| Gate | Result |
|------|--------|
| `cargo test -p aihu-compiler` | 863 pass / 0 fail |
| `bun scripts/check-emit-parses.ts --expect-parse 0 --expect-compile 11` | exit 0 — 11/59 failed (11 compile, 0 parse). Neither of the briefed flag pairs matches: the examples lane has NOT merged (compile still 11) but parse is 0, not 1 (main's parse fixes landed). A flagless run exits 1 against the stale committed staged baseline (5 parse) — pre-existing; the check is parked outside CI (CO4 owns wiring). The warning changed neither count (stderr never feeds either stage) |
| `bun run check:thesis` (all five invariants) | 0 findings each, exit 0 |
| DA-e informational | 10 of 88 shipped .aihu |
| `bun run typecheck` | PASS (50 tasks) |
| `biome ci` on touched TS | exit 0 |
| `packages/cli` vitest | 292 pass / 6 skip |
| `packages/compiler` vitest | 109 pass / 5 skip |
| legacy-snapshot freeze | pass (byte-identical after documented golden refresh) |
