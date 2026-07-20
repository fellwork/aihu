# Build manifest — examples → v2 migration (#425)

Branch `fix/examples-v2` off `origin/main` (94ad14f7). Founder-ratified scope:
migrate all non-archived examples to the v2 macro vocabulary, delete
`examples/archived/`, fix the three codemod defects, wire the v1→v2 pass into
`aihu migrate`, extend the migration docs, and true-up `examples/README.md`.
(The showcase smoke-test wiring in `.github/workflows/plan-a.yml` is a
follow-up owned by another lane — deliberately untouched here.)

## Measured results

| Gate | Before | After |
|---|---|---|
| `bun scripts/check-emit-parses.ts` | **11 compile / 0 parse** failures of 59 components | **0 compile / 0 parse** of 58 components |
| `--expect-compile 0 --expect-parse 0` | — | PASS |
| `--expect-compile 0 --expect-parse 1` (issue's ratified target) | — | fails in the good direction: "parse: expected 1, found 0 — 1 defect(s) appear to have been FIXED" |

The anticipated hacker-news parse failure (#446, `$afterNavigate` head-strip)
**does not reproduce** against a compiler binary freshly built from this HEAD —
one of the recent compiler fixes on `main` (post-dry-run) cleared it. The CI
ratchet can therefore land at `--expect-compile 0 --expect-parse 0`.

Component count 59 → 58: `examples/archived/markdown-preview/markdown-preview.aihu`
deleted with `examples/archived/` (git history is the archive).

## Codemod defect fixes

All in JS/TS only — `packages/compiler/src/*.rs` untouched, no binary bump.

| # | Defect | Fixed in | Test |
|---|---|---|---|
| (a) | `$lifecycle.mount: { … }` / `: () => { … }` colon forms fell through to the bare-`$macro` passthrough and mangled the file | `packages/compiler/js/codemods/macro-simplification/migrate.ts` (`handleLifecycleColon`) | `codemod-macro-simplification.test.ts` — "migrates $lifecycle.mount colon-block form into the $lifecycle collection" (+ colon-arrow variant) |
| (b) | quoted `$let="…"` (C500 in v2) not rewritten to curly `$let={…}` | `packages/cli/src/commands/migrate.ts` (`migrateInlineAttrs`) | `packages/cli/tests/migrate.test.ts` — "converts quoted $let=\"…\" to curly $let={…} (#425 b)" |
| (c) | `onclick={…}`-family event handlers missing from the C306 pass | `packages/cli/src/commands/migrate.ts` (`C306_EVENT_HANDLER_ATTRS` → rewrites to canonical `$on.<event>={…}`, not `$onclick`) | `packages/cli/tests/migrate.test.ts` — "rewrites onclick={expr} event handlers to $on.click={expr} (#425 c)" |

Additional codemod defects found during the run and fixed in the same files
(all were silent-corruption modes of the macro-simplification pass):

- **async arrows unrecognized** — a v2 `$action: { x: { handler: async () => … } }` entry was silently *deleted* on re-run (the idempotency path), and `async` was dropped from `$lifecycle`/`$effect`/`$computed`/`$resource` thunks. `parseArrowOrFunctionExpr`/`stripThunk` now carry `isAsync` through to emit. Test: "round-trips async handlers on the v2 idempotency path (no silent drop)".
- **line-by-line passthrough** — multi-line `const x = call(\n…\n)` / `function f() { … }` statements were shredded into one passthrough entry per line, scrambling the emitted `@state`. Passthrough is now statement-aware (`consumeBalancedStatement`).
- **trailing comments dropped** — comments at the end of `@state` with no following statement were discarded; now preserved as a final passthrough entry.

## CLI wiring

- `aihu migrate --v2 <files…>` runs the three v0→v1 passes, then the
  macro-simplification v1→v2 pass (`migrateFileV2` in
  `packages/cli/src/commands/migrate.ts`). Default `aihu migrate` behavior
  (v0→v1 only) is byte-identical to before; `--dry-run` composes with `--v2`.
- The codemod is imported by relative path and **bundled** by the CLI's
  rolldown build (verified: lands in `dist/migrate-*.js`), so the published
  package stays self-contained.
- Standalone runner `packages/compiler/js/codemods/macro-simplification/run-migration.ts`
  gained `--dry-run` (prints `WOULD-MODIFY`, writes nothing — verified via md5
  before/after on scratch copies).

## Per-file migration table

Chain = `aihu migrate --v2` (v0→v1 attr passes + fixed macro-simplification codemod). Order documented: the v0→v1 passes run first (block framing, C304/C305/C306 + (b)/(c) fixes, package renames), then macro-simplification.

| File | Migrated by | Hand-edit reason |
|---|---|---|
| `examples/agent-hub/src/hub-root.aihu` | codemod-chain + hand-edit | metadata fold: `$expose agentCount: <desc>` had been silently dropped (no collection entry carried it) → `describe`/`expose` added to the `agentCount` `$computed` entry by hand. `activeTab` exposure lost: raw `signal()` has no entry to carry it. `getAgentList` tool decl had no `@state` backing → dropped. |
| `examples/agent-hub/src/a2a-panel.aihu` | hand-edit + codemod-chain | `$action sendA2aRequest: async () => {…}` colon-arrow form is not a codemod-supported v1 form (it mangles: header line passes through, body braces orphan). Hand-rewrote to a v2 `$action` collection entry with `describe`/`expose`; codemod then handled `$lifecycle.mount: {` (defect a) and emit ordering. `$attr.disabled={…}` → `$disabled={…}` by hand (stale template dialect; emitted invalid JS). `@agent` `$expose result/loading` lost (raw signals); `getDiscoveryCard` had no backing. |
| `examples/agent-hub/src/acp-panel.aihu` | hand-edit + codemod-chain | same shape as a2a-panel (`sendAcpMessage`). |
| `examples/blog-loader/src/pages/posts/[slug].aihu` | codemod-chain | `@agent { expose: { getPost…, listPosts… } }` was a declarative-only surface with no `@state` backing (never valid v2); dropped by the codemod. Noted in README. |
| `examples/cf-adapter/src/cf-adapter-demo.aihu` | codemod-chain | `$expose workerName/deployMode` + `getConfig` dropped: raw signals / no backing (codemod WARNs). |
| `examples/plugin-demo/src/plugin-demo.aihu` | codemod-chain | `onclick={…}` fixed by defect (c); `$expose count/doubled` + `getCount` dropped (raw signals / no backing). |
| `examples/realtime-scores/src/realtime-scores.aihu` | codemod-chain + hand-edit | quoted `$let` fixed by defect (b). Hand-edit: `$class.connected={…}` → colon-namespaced `$class:connected={…}` (dot form emits invalid JS; colon form is the canonical namespace — not a codemod-owned rewrite). `$expose scores/connected` + `getScores` dropped (raw signals / no backing). |
| `examples/storefront/src/cart-drawer.aihu` | codemod-chain + hand-edit | quoted `$let` fixed by (b). Hand edits: fold `$expose cartItems/cartCount: <desc>` into the `$computed` entries; convert plain `async function checkout()` (the `@agent` `checkout` tool) into an exposed `$action` entry — plain functions cannot carry `expose:`; `$attr.disabled` → `$disabled`. `checkoutStatus` exposure lost (raw signal). |
| `examples/storefront/src/product-list.aihu` | codemod-chain + hand-edit | quoted `$let` + `aria-label={…}` fixed by chain. Hand edit: convert `function addToCart(item)` (the `@agent` `addToCart` tool) into an exposed `$action` entry. `products` exposure lost (plain `createResource` const). |
| `examples/storefront/src/storefront-root.aihu` | codemod-chain + hand-edit | `aria-label` fixed by chain; metadata fold: `describe`/`expose` added to the `cartCount` `$computed` entry by hand. |
| `examples/archived/markdown-preview/` | deleted | unfixable HTML-tag `<style>` framing; archived; founder-ratified deletion. |

Cosmetic residue accepted from the codemod: blank-line normalization between
statements and canonical bucket ordering (collections before plain consts)
inside `@state` — compiles identically; handlers are thunks so ordering is
runtime-safe.

## Docs & README

- `docs/site/migration.md` — retitled "Migration (v0 → v1 → v2)"; new §7
  "Migration (v1 → v2) — the macro-vocabulary pass" covering: `$lifecycle`
  colon/call forms → collection, `@agent` per-name macros → `describe:`/`expose:`
  (including `$expose name: <description>` and ad-hoc `getX: { description }`
  decls), quoted `$let` → curly, curly event handlers → `$on.<event>`, the
  `aihu migrate --v2 [--dry-run]` command, the standalone runner, and the three
  hand-edit classes (`$action name: <arrow>`, metadata on raw `signal()`
  bindings, stale `$attr.<name>`/`$class.<name>` template spellings). C500 row
  added to the diagnostic table.
- `apps/docs/src/content/docs/migration.md` — mirror kept byte-identical (diff clean).
- `examples/README.md` — archived section removed; intro rewritten (no more
  "$expose block" language); the six migrated rows marked `(v2)` with
  agent-surface columns reflecting post-migration reality (explicit "none" where
  the v1 surface was declarative-only and is now retired).
- `TODOS.md` — the "11 example components no longer compile" entry struck
  through as FIXED (#425); `scripts/check-emit-parses.ts` header comment
  updated (baseline now 0/0).

## Verification (measured)

- `check-emit-parses`: 11 compile / 0 parse (59) → **0 / 0 (58)**; `--expect-compile 0 --expect-parse 0` PASS.
- New tests: 3 defect tests + async round-trip + colon-arrow variant; full suite **2241 passed | 7 skipped** (2248), 0 failed (`bun run test`, after rebase onto 774b38cf which added the #445 CI-gate tests). One existing assertion updated (`dev-build.test.ts` pins the migrate dispatch call, now `migrateFiles(files, dryRun, process.cwd(), v2)`).
- `bun run typecheck` PASS (exit 0). `biome ci` on the 7 touched TS files: exit 0.
- `--dry-run`: scratch copies md5-identical after both `run-migration.ts --dry-run` and `aihu migrate --v2 --dry-run`.
- Thesis invariants: `check-derived`, `check-attributed`, `check-governed`, `check-dual-audience`, `check-hydration-adoption` — **0 findings each**.
- Idempotency: re-running `aihu migrate --v2` over all ten migrated files reports `(unchanged)`.

## Surfaced, not changed

- **#446 (hacker-news `$afterNavigate` parse failure)** — no longer reproduces with a fresh binary; the issue and its TODOS.md entry are left for the owning lane to close. The ratchet numbers here assume 0 parse.
- **`plan-a.yml` showcase smoke tests + `check:emit-parses` CI gating** — other lane, untouched per brief.
- **Raw-`signal()` agent exposure gap** — v2 has no way to `expose:` a bare signal binding; five examples lost (already-broken) agent surfaces. If those surfaces matter, either the spec grows an exposure form for plain bindings or the examples should migrate their state into collection entries.
- **`$attr.<name>` / `$class.<name>` emit invalid JS instead of a diagnostic** — the compiler accepts the stale dot forms and emits unparseable output (`attr.disabled:` / `class.connected:` object keys). A C-series diagnostic would catch this class at compile time; Rust-side, so out of scope here.
