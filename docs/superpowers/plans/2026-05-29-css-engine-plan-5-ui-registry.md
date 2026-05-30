# CSS Engine Plan 5 — `@aihu/ui` styled-recipe registry + `aihu add` CLI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Surface the BLOCKING DECISIONS (§ below) to the user before the Builder runs the registry-distribution and CLI-transformer tasks.**

**Goal:** Ship `@aihu/ui` — the **styled-recipe layer** that sits on top of the headless `@aihu/primitives` (Plan 4, merged) and the CSS engine (Plans 1–3, merged). Deliver: (1) the `@aihu/ui` package whose payload is **copy-paste recipe source** (`.aihu` SFCs) plus a generated `registry.json` index — NOT a bundled runtime dependency, so it adds **no `.size-limit.json` row**; (2) the registry schema (`RegistryItem` / `RegistryFile`, master spec §9.5); (3) the four **Phase 1 recipes** (`aihu-button`, `aihu-card`, `aihu-badge`, `aihu-separator`) — `button` EXTENDS the headless `AihuButton` base via the class-extension model (master spec §9.4), the other three are standalone styled custom elements; (4) the `aihu add` / `aihu list` / `aihu rename` CLI subcommands on the existing `aihu` binary, with `--dry-run`, `--diff`, `--prefix`; (5) the `ui` field on `AihuConfig` (`@aihu/server`). **Every recipe is the FIRST `.aihu` SFC in the stack to carry a non-trivial `@style` block** — this is where Plans 1–3's AST-consuming scanner + scoped shadow-DOM emission finally have a real workload, and where the compile/runtime CSS optimization is proven end-to-end.

**Architecture:** Plan 4 delivered headless primitives that export **classes + `define*()` registration helpers** (`AihuButton` + `defineButton(tag)`, `AihuDialogRoot` + `defineDialog()`) and emit zero CSS. Plan 5 adds the **styling + distribution** layer. A recipe is an `.aihu` SFC with a `@meta` variant declaration, a `@template` that wires `data-*` attributes, and a `@style` block of `@apply` utilities resolved against the active style pack. `button.aihu` imports `AihuButton` from `@aihu/primitives/button` and registers a prefixed concrete element (`<aihu-button>`); `card`/`badge`/`separator` are presentational-only (no primitive dependency). `aihu add <name>` reads the installed `@aihu/ui` registry, resolves `registryDependencies` transitively, runs the **existing scaffold substitution pipeline** (`scaffold-pipeline.ts`) to rewrite the `aihu-` tag prefix to the consumer's chosen prefix, and writes the source into the consumer's `ui.target` directory. The consumer OWNS the copied source. The css-engine scanner picks up the copied `.aihu` files at the consumer's next `aihu build` — `aihu add` itself compiles nothing. The output the consumer ships stays vanilla custom elements with per-component scoped shadow-DOM CSS; the consumer-output thesis holds.

**Tech Stack:** TypeScript; recipes authored as `.aihu` SFCs consuming `@apply` + `cn()` from `@aihu/css-engine/runtime/cn`; `@aihu/primitives/*` class bases (button recipe only); the existing `packages/cli/` dispatcher (`bin.ts`) + command modules (`commands/*.ts`) + substitution pipeline (`scaffold-pipeline.ts` `readSubstituteWrite`); `AihuConfig` in `@aihu/server` (`config.ts:88`); style packs at `@aihu/css-engine/styles/{aihu-default,aihu-graphite}.css`; Vitest + happy-dom for CLI + recipe-compile tests; Bun, Moon, rolldown. Browser baseline Chrome/Edge 113+, Safari 16.4+, Firefox 113+.

---

## THE BLOCKING DECISIONS — surface to user before Builder runs

**D-1 — Registry distribution mechanism (default: local-package read, NOT hosted HTTP).**
shadcn's production model serves a **hosted JSON registry over HTTP** (`https://ui.shadcn.com/r/<name>.json`). The master spec §9.2 says "source copied via `aihu add`" and §6.6 sets `ui.registry: '@aihu/ui'` — a package specifier, not a URL. **Default: v1 publishes `@aihu/ui` as an npm package whose files are the recipe `.aihu` sources + a generated `registry.json` index; consumers install it as a devDependency; `aihu add` resolves it from `node_modules/@aihu/ui/` on the local filesystem — no network.** This keeps `aihu add` offline, deterministic, and CI-friendly, and defers the hosted-registry/`registries: {}` multi-registry slot to v2 (already schema-reserved, spec §9.5). **What flips if the user prefers hosted HTTP:** `aihu add` gains a `fetch()` path keyed off a base URL in `ui.registry`; add a network-error/offline fallback; the `registry.json` index becomes a served artifact; CI tests need a local fixture server. Larger surface, network dependency — recommend deferring.

**D-2 — Does `@aihu/ui` get a `.size-limit.json` row? (default: NO.)**
Master spec §10.7 marks `@aihu/ui` as "n/a — source-distributed." Its payload is never bundled into a consumer's runtime *from the package* — it's copied, then the consumer's OWN build measures it. **Default: NO size row for `@aihu/ui`; `scripts/check-size-rows.ts` classifies it as NOT browser-eligible (source-distribution tier), and `.size-limit.README.md` documents the exemption rationale alongside the server-only packages.** This is the inverse of Plan 4's per-primitive rows. **What flips if the user wants a budget:** the recipe sizes would have to be measured post-compile in a fixture project (a different harness than `size-limit`), which is really Plan 6's fresh-project portability gate — recommend keeping size accountability in Plan 6, not here.

**D-3 — Prefix-substitution engine: reuse `scaffold-pipeline.ts` or build a recipe-specific transformer? (default: REUSE.)**
The existing `scaffold-pipeline.ts` already does `readSubstituteWrite` token substitution for `aihu app --template`. **Default: REUSE it for the `aihu-` → `<prefix>-` tag rewrite during copy**, extending its substitution map rather than authoring a parallel transformer. **What flips if reuse proves too coupled to the template flow:** author a small `commands/registry-transform.ts` with a focused `substitutePrefix(source, from, to)` (≈30 lines, regex on tag names + `customElements.define` string + import specifiers); the task list below is written so only Task 6 Step 3 changes.

**D-4 — `ui.primitives` lockfile scope (default: record-only).**
Spec §6.6 shows a `primitives: { button: '^1.0.0' }` lockfile section updated on `aihu add`. **Default: Plan 5 writes/updates a minimal record (recipe name → `@aihu/primitives` version at add-time) so `aihu add --update` (Plan 6+) has something to re-pull against; full semver-range resolution + drift detection is deferred to when `aihu add --update` actually lands.** **What flips if the user wants full lockfile now:** add semver range resolution + a `--update` re-pull path in this plan (adds ~1 task).

---

## REVIEW DECISIONS — locked 2026-05-29 (plan-eng-review)

These 8 decisions came out of the eng review and are reflected in the tasks below. They refine or override the drafted blocking decisions.

1. **R1 (was scope) — `aihu rename` DEFERRED to Plan 6.** `--prefix` on `aihu add` covers prefix-at-copy-time; `rename` only re-sweeps already-copied recipes, of which there are none at registry launch. Riding the same substitution code, it's near-free to add later. (Side benefit: removes the prefix-substitution DRY duplication between `add` and `rename`.)
2. **R2 (refines D-2/§6.3) — recipe CSS-attachment contract is `adoptedStyleSheets`.** The css-engine emits a Constructable StyleSheet per recipe; the registered element adopts it into its shadow root at registration. Construct the sheet ONCE as a static on the element class (shared across instances), NOT per-instance. This makes the "scoped, no global sheet" claim concrete and testable.
3. **R3 (refines D-1) — `registry.json` is INDEX-ONLY.** Catalog metadata only (name, type, variants, dependencies, registryDependencies); it does NOT inline recipe source. `aihu add` reads the `.aihu` files directly from the installed package. Kills the source duplication + regen-drift hazard.
4. **R4 — recipe-compile test asserts PACK-INVARIANCE.** Emitted recipe CSS is byte-identical across `aihu-default`/`aihu-graphite` and references `var(--color-...)`, not baked colors — protecting §6.9's swap-without-recompile promise. **VERIFY FIRST:** confirm the engine emits `var(...)` for semantic utilities before locking the assertion.
5. **R5 — `@aihu/primitives` goes in `dependencies`, not `registryDependencies`.** `registryDependencies` is for other recipes in the registry; `@aihu/primitives` is an npm package. All four Phase 1 recipes have EMPTY `registryDependencies`.
6. **R6 — `aihu add` gets explicit error paths + tests:** missing `aihu.config.ts`, `@aihu/ui` not installed, missing `ui` field, and unknown recipe name each produce an actionable message + nonzero exit.
7. **R7 — Task 5 adds a runtime shadow-adoption test:** register the button recipe, instantiate it, assert `shadowRoot.adoptedStyleSheets` contains the compiled sheet. Compile-passing ≠ rendered-styling; this is the runtime half of the proof.
8. **R8 — resolver test gets a synthetic multi-recipe fixture:** recipe-A declares `registryDependencies: ['recipe-B']` so the transitive-resolution + cycle-guard path is exercised now, even though no shipped Phase 1 recipe uses it.
9. **R9 (folded) — `aihu add --force`** is a defined flag (overrides collisions), matching the collision test.

---

**Reference spec:** master CSS-engine spec `docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md` §9 (styled recipes), §9.5 (registry schema), §9.6 (`aihu add` CLI), §9.7 (Phase 1 recipe rollout), §6.6 (`aihu.config.ts → ui`), §6.9 (style packs), §12.2 Track B, §12.4 acceptance. Builds on `docs/superpowers/plans/2026-05-24-css-engine-plan-4-primitives.md` (Task 13 hand-off).

**Maps to plan-items** (milestone group `css-5`):

| Task | `css-5` item title | Priority |
|---|---|---|
| 2 | `@aihu/ui` package scaffold (source-distributed, no size row) | HIGH |
| 3 | `AihuConfig.ui` field (registry/target/style/prefix) in `@aihu/server` | HIGH |
| 4 | Registry schema (`RegistryItem`/`RegistryFile`) + `registry.json` generator | HIGH |
| 5 | Phase 1 recipes: `aihu-button`, `aihu-card`, `aihu-badge`, `aihu-separator` | HIGH |
| 6 | `aihu add <name>` (resolve deps, prefix-transform, `--dry-run`/`--diff`/`--prefix`/`--force`) | HIGH |
| 7 | `aihu list` / `aihu list --installed` | MED |
| 8 | ~~`aihu rename --from --to`~~ — **DEFERRED to Plan 6 (R1)** | — |
| 9 | Dispatcher wiring in `bin.ts` (`add`/`list`) | HIGH |

---

## File Structure

This plan creates a new package `packages/ui/`, adds CLI command modules, and extends `@aihu/server` config + the CLI dispatcher.

**Depends on (must exist first):** `@aihu/primitives` (Plan 4, merged), `@aihu/css-engine/runtime/cn` + style packs (Plan 3, merged), `@aihu/cli` dispatcher + `scaffold-pipeline.ts` (exist), `@aihu/server` `AihuConfig` (exists).

**Create — package scaffold:**
- `packages/ui/package.json` — name `@aihu/ui`, `type: module`, `"files": ["registry", "registry.json", "README.md", "LICENSE"]` (ships SOURCE, not `dist`), `"publishConfig": { "access": "public" }`. **No `main`/`module` runtime entry** (it is not imported at runtime); a `"./registry.json"` export for tooling resolution. `devDependencies` on `@aihu/primitives`, `@aihu/css-engine` for the recipes to typecheck in-repo.
- `packages/ui/moon.yml` — `language: typescript`, `layer: library`, `dependsOn: ['primitives', 'css-engine']`; a `gen:registry` task (runs the index generator) and a `test` task. **No `build` that emits `dist`** (source-distributed).
- `packages/ui/tsconfig.json` — extends base; `noEmit` (recipes are not compiled here, only typechecked).
- `packages/ui/README.md` — with `<!-- BEGIN_AUTOGEN -->` markers for `scripts/sync-readme.ts`.

**Create — registry schema + generator:**
- `packages/ui/src/schema.ts` — `RegistryItem`, `RegistryFile`, `RegistryItemType` types (spec §9.5).
- `packages/ui/scripts/gen-registry.ts` — scans `registry/**` and emits `registry.json` (the index `aihu add` reads).

**Create — Phase 1 recipes (each: `<name>.aihu` + `meta.json` fragment + a recipe-compile test):**
- `packages/ui/registry/button/button.aihu` — `@meta` variants (`variant`, `size`), `@template` extends + registers, `@style` `@apply` block. Imports `AihuButton` from `@aihu/primitives/button`.
- `packages/ui/registry/card/card.aihu` — presentational; slots header/body/footer.
- `packages/ui/registry/badge/badge.aihu` — presentational; variant matrix.
- `packages/ui/registry/separator/separator.aihu` — presentational; `orientation` attribute, `role="separator"`.

**Create — CLI command modules:**
- `packages/cli/src/commands/add.ts` — `aihu add <names...>` (default export async fn, mirroring `dev.ts`/`build.ts`).
- `packages/cli/src/commands/list.ts` — `aihu list [--installed]`.
- `packages/cli/src/registry-resolve.ts` — shared: locate installed `@aihu/ui`, read `registry.json` (index-only, R3), read recipe `.aihu` sources directly from the package, resolve `registryDependencies` transitively, preflight target collisions.
- ~~`packages/cli/src/commands/rename.ts`~~ — **DEFERRED to Plan 6 (R1).**

**Modify:**
- `packages/server/src/config.ts` — add `ui?: UiConfig` to `AihuConfig` (+ the `UiConfig` interface).
- `packages/cli/src/bin.ts` — dispatch `add` / `list` / `rename` (async-import block, mirroring `dev`/`build`/`mcp`); extend `usage()`.
- `scripts/__package-inventory.json` — add `@aihu/ui` (alpha-sorted).
- `scripts/check-size-rows.ts` — classify `@aihu/ui` as source-distributed / NOT browser-eligible (D-2).
- `.size-limit.README.md` — document the `@aihu/ui` no-row exemption.

---

## Task 1: Precheck — Plan 4 merged, substrate resolves, clean tree

**Files:** none — verification only

- [ ] **Step 1:** `git log -1 --format=%H main` includes Plan 4 (`@aihu/primitives` scaffold + Phase 0/1 primitives). `bunx vitest run packages/primitives` is green (67 tests). `bun run typecheck` passes repo-wide.
- [ ] **Step 2:** Confirm the seams resolve: `@aihu/primitives/button` exports `AihuButton` + `defineButton`; `@aihu/css-engine/runtime/cn` exports `cn`; `@aihu/css-engine/styles/aihu-default.css` + `aihu-graphite.css` exist; `@aihu/css-engine` `compileSfc(source, id?)` is callable (the path the consumer build uses to scan recipe `@style` blocks).
- [ ] **Step 3:** `git status` clean on the working branch (or only Plan 5 docs).

---

## Task 2: `@aihu/ui` package scaffold (source-distributed, no size row)

> Maps to `css-5` item **"@aihu/ui package scaffold"** (HIGH). Carries **D-2** (no size row). Gate for everything below.

**Files:** create `packages/ui/{package.json,moon.yml,tsconfig.json,README.md}`, `packages/ui/src/schema.ts` (stub); modify `scripts/__package-inventory.json`, `scripts/check-size-rows.ts`, `.size-limit.README.md`.

- [ ] **Step 1: Author `package.json`** — `"name": "@aihu/ui"`, `"version": "0.0.0"`, `"license": "MIT"`, `"type": "module"`, `"files": ["registry", "registry.json", "src", "README.md", "LICENSE"]`, `"exports": { "./registry.json": "./registry.json", "./schema": { "types": "./src/schema.ts" } }`, `"publishConfig": { "access": "public" }`. `devDependencies`: `"@aihu/primitives": "workspace:*"`, `"@aihu/css-engine": "workspace:*"`. Scripts: `"gen:registry": "bun scripts/gen-registry.ts"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"prepublishOnly": "bun run gen:registry"`. **No `build` script emitting `dist`.**
- [ ] **Step 2: Author `moon.yml`** — `language: typescript`, `layer: library`, `dependsOn: ['primitives', 'css-engine']`; `gen:registry` task; `test` task `vitest run`. Do NOT override `typecheck`.
- [ ] **Step 3: Author `tsconfig.json`** — extends `../../tsconfig.base.json`, `noEmit: true`, `include ["src/**/*", "registry/**/*"]`, `exclude ["tests/**/*"]`.
- [ ] **Step 4: Register the package + record the no-size-row decision (D-2).** Add `@aihu/ui` to `scripts/__package-inventory.json` (alpha-sorted, after `@aihu/templates`/before/per ordering). In `scripts/check-size-rows.ts`, classify `@aihu/ui` as **source-distributed → NOT browser-eligible** (so the lint does NOT demand a `.size-limit.json` row). Add `@aihu/ui` to `.size-limit.README.md` with the exemption rationale ("source-distributed via `aihu add`; consumer's build measures the copied recipes, not this package").
- [ ] **Step 5: Author `README.md`** with autogen markers; run `bun scripts/sync-readme.ts` — confirm no error.
- [ ] **Acceptance:** `bun install` links `@aihu/ui`; `bun run typecheck` passes; `bun run check:size-rows` is green **without** a `@aihu/ui` row (proves the source-distribution classification works); `bun scripts/sync-readme.ts --check` passes.
- [ ] **Commit:** `git commit -m "feat(ui): @aihu/ui package scaffold (source-distributed, no size row)"`

---

## Task 3: `AihuConfig.ui` field in `@aihu/server`

> Maps to `css-5` item **"AihuConfig.ui field"** (HIGH). Depends on Task 2.

**Files:** modify `packages/server/src/config.ts`; add `packages/server/tests/ui-config.test.ts`.

- [ ] **Step 1: Define `UiConfig`** (spec §6.6 `ui` block, names verbatim):
  ```typescript
  export interface UiConfig {
    /** Source registry to pull recipes from. v1: the '@aihu/ui' package specifier. */
    readonly registry?: string          // default '@aihu/ui'
    /** Directory `aihu add` copies recipe sources into. */
    readonly target?: string            // default './src/components/ui'
    /** Active style pack name. */
    readonly style?: string             // default 'aihu-default'
    /** Custom-element tag prefix for copied recipes. */
    readonly prefix?: string            // default 'aihu'
    /** RESERVED for v2 multi-registry support — schema slot only, unimplemented. */
    readonly registries?: Readonly<Record<string, string>>
  }
  ```
- [ ] **Step 2: Add `readonly ui?: UiConfig`** to `AihuConfig` (after `rendering`), with a doc comment noting it is **build-time-only** (consumed by the `aihu add` CLI + the css-engine scanner; no runtime/edge effect — matching the existing `build`/`plugins` field posture). Do NOT apply defaults inside `defineAihuConfig` (the CLI resolves defaults at read-time, since the config may omit `ui` entirely). 
- [ ] **Step 3: Test** — `defineAihuConfig({ ui: { prefix: 'acme', target: './x' } })` round-trips; omitting `ui` is valid; `registries` accepts an empty object.
- [ ] **Acceptance:** `bun run typecheck` + the new test pass; existing `@aihu/server` tests unaffected.
- [ ] **Commit:** `git commit -m "feat(server): AihuConfig.ui field (registry/target/style/prefix, registries reserved)"`

---

## Task 4: Registry schema + `registry.json` generator

> Maps to `css-5` item **"Registry schema + registry.json generator"** (HIGH). Depends on Task 2. Carries **D-1** (local-package read).

**Files:** `packages/ui/src/schema.ts`, `packages/ui/scripts/gen-registry.ts`, `packages/ui/tests/gen-registry.test.ts`.

- [ ] **Step 1: Author `schema.ts`** (spec §9.5 verbatim): `RegistryItemType = 'ui' | 'block' | 'style' | 'theme' | 'lib'`; `RegistryFile { path; source; type: 'component'|'style'|'lib'|'block' }`; `RegistryItem { name; type; description?; files; dependencies?; registryDependencies?; variants?; meta? }`. `VariantMap = Record<string, string[]>`.
- [ ] **Step 2: Author `gen-registry.ts`** — **INDEX-ONLY (R3).** Scan `registry/<name>/` dirs; for each, read its `meta.json` fragment (name, type, variants, dependencies, registryDependencies) + the list of file PATHS (relative to the package). Emit a top-level `registry.json` = `{ items: RegistryItem[] }` where each `RegistryFile` carries `path` but **NOT** `source` — `aihu add` reads the actual `.aihu` files from the installed package at copy time. This keeps the `.aihu` files the single source of truth (no inlined duplication, no regen-drift hazard). Deterministic ordering (alpha by name) so the artifact is diff-stable. Idempotent. (NOTE: `RegistryFile.source` stays in the §9.5 type for the reserved hosted-registry path, but the v1 local generator leaves it unset.)
- [ ] **Step 3: Test** — running the generator over a fixture `registry/` produces a `registry.json` whose items match the fixtures **and whose `RegistryFile` entries have `path` set but `source` unset** (index-only assertion); re-running yields byte-identical output (determinism); a recipe declaring `registryDependencies: ['button']` is preserved.
- [ ] **Acceptance:** `bun run --filter @aihu/ui gen:registry` emits `registry.json`; the generator test is green.
- [ ] **Commit:** `git commit -m "feat(ui): registry schema + registry.json generator"`

---

## Task 5: Phase 1 recipes — `aihu-button`, `aihu-card`, `aihu-badge`, `aihu-separator`

> Maps to `css-5` item **"Phase 1 recipes"** (HIGH). Depends on Task 4. **This is the first non-trivial `@style`/`.aihu` workload the css-engine scanner consumes — the recipe-compile test is the end-to-end optimization proof.**

**Files:** `packages/ui/registry/{button,card,badge,separator}/{<name>.aihu,meta.json}`; `packages/ui/tests/recipe-compile.test.ts`.

- [ ] **Step 1: `button.aihu`** — the class-extension recipe (spec §9.2, §9.4):
  - `@meta` declares `variants: { variant: ['default','destructive','outline','ghost','link'], size: ['sm','md','lg','icon'] }`, `slots: ['button']`, **`dependencies: ['@aihu/primitives']`** (R5 — npm dep, NOT `registryDependencies`), and `registryDependencies: []`.
  - `@state` imports `cn` from `@aihu/css-engine/runtime/cn` and the `AihuButton` base from `@aihu/primitives/button`; the concrete element `class AihuButtonRecipe extends AihuButton` is registered under the prefixed tag (`customElements.define('aihu-button', ...)`). Default `variant`/`size` from props.
  - **CSS attachment (R2):** the compiled recipe stylesheet is a **Constructable StyleSheet** adopted into the element's shadow root at registration — constructed ONCE as a `static` on the element class and shared across all instances (`shadowRoot.adoptedStyleSheets = [AihuButtonRecipe.sheet]`), never a per-instance inline `<style>`. This is the concrete form of "scoped, no global sheet."
  - `@template` emits `<button data-slot="button" $data-variant $data-size class={cn('aihu-button', props.class)}>`.
  - `@style` block of `@apply` utilities using **semantic tokens only** (`bg-primary`, `text-primary-foreground`, `border-input`, `hover:bg-accent`, `disabled:opacity-50`) keyed off `[data-variant=...]` / `[data-size=...]` — copy the matrix from spec §9.2.
- [ ] **Step 2: `card.aihu`, `badge.aihu`, `separator.aihu`** — presentational (NO primitive import):
  - `card`: slotted header/body/footer regions; `@apply` rounded/border/shadow/padding off tokens.
  - `badge`: `variant` matrix (default/secondary/destructive/outline); inline-flex pill.
  - `separator`: `orientation` (`horizontal`/`vertical`) reflected attribute, `role="separator"` + `aria-orientation`; a 1px token-colored rule.
- [ ] **Step 3: Validate against `@meta`** — engine-side compile-time work (spec §9.2): every `[data-variant="x"]` selector in `@style` must match a value declared in `@meta.variants` (typo'd variants are a build error). Add this assertion to the recipe-compile test.
- [ ] **Step 4: `recipe-compile.test.ts`** — for each recipe, call `@aihu/css-engine` `compileSfc(source, id)` and assert: (a) it emits **scoped shadow-DOM CSS** (not a global sheet); (b) the emitted CSS contains the expected utility expansions and references **`var(--color-...)`** for semantic tokens, NOT baked color literals; (c) **PACK-INVARIANCE (R4):** compiling the recipe under `aihu-default` vs `aihu-graphite` yields **byte-identical** output (the pack only changes runtime `@theme` var values, not the emitted recipe CSS) — this protects §6.9's swap-without-recompile promise. **VERIFY FIRST:** confirm the engine emits `var(...)` for semantic utilities; if it bakes pack values at compile time, escalate before locking this assertion; (d) NO undeclared `data-variant` leaks through; (e) `button.aihu` references `AihuButton`.
- [ ] **Step 5: Runtime shadow-adoption test (R7)** — register the `button` recipe (`defineButton`-style), instantiate `<aihu-button>` in happy-dom, and assert `el.shadowRoot.adoptedStyleSheets` contains the compiled Constructable StyleSheet (the R2 contract) and that the sheet is the SAME object across two instances (shared-static, not per-instance). Compile-passing ≠ rendered-styling; this is the runtime half of the proof.
- [ ] **Acceptance:** recipe-compile test green for all four recipes with pack-invariance asserted; the runtime shadow-adoption test green; `bun run --filter @aihu/ui gen:registry` includes all four items with their variants; `button` recipe declares `dependencies: ['@aihu/primitives']` and EMPTY `registryDependencies` (R5).
- [ ] **Commit:** `git commit -m "feat(ui): Phase 1 recipes (button extends primitive; card/badge/separator presentational)"`

---

## Task 6: `aihu add <names...>` command

> Maps to `css-5` item **"aihu add"** (HIGH). Depends on Tasks 3, 4, 5. Carries **D-1** (local read) + **D-3** (reuse substitution pipeline).

**Files:** `packages/cli/src/registry-resolve.ts`, `packages/cli/src/commands/add.ts`, `packages/cli/tests/add.test.ts`.

- [ ] **Step 1: `registry-resolve.ts`** — `resolveRegistry(cwd)`: read `aihu.config.ts → ui` (with defaults from Task 3); locate the installed `@aihu/ui` (resolve `node_modules/@aihu/ui/registry.json` from `cwd`); parse it (index-only, R3). `resolveItems(names, registry)`: collect requested items + transitively pull `registryDependencies` (cycle-safe). `readRecipeSource(item)`: read the `.aihu` file(s) from the installed package by `path` (R3 — source is NOT in the index). `preflight(items, target)`: detect existing-file collisions; return the write plan. **Error paths (R6) — each returns a typed error the command renders as an actionable message + nonzero exit:** (i) no `aihu.config.ts` found walking up from `cwd`; (ii) `@aihu/ui` not resolvable in `node_modules` ("run: bun add -D @aihu/ui"); (iii) config present but no `ui` field; (iv) a requested recipe name not present in `registry.json` ("unknown recipe 'x' — run `aihu list`").
- [ ] **Step 2: `add.ts`** — default-export async `add(rest: string[])`:
  - Parse names (non-`--` args) + flags `--dry-run`, `--diff`, `--prefix <p>` (overrides `ui.prefix`), `--style <s>`, **`--force`** (R9 — overwrite on collision).
  - `resolveRegistry` → `resolveItems` → `readRecipeSource` → `preflight`. Render any R6 error path as an actionable message + `process.exit(1)`.
  - For each file: run the **prefix transform** (Step 3) then write to `ui.target`. `--dry-run` prints the plan without writing; `--diff` prints a unified diff against any existing target file; a collision **aborts with a message unless `--force`** is passed (R9).
  - Update the `ui.primitives` record per **D-4** (record-only: recipe name → `@aihu/primitives` version).
  - Print `added N files.` (spec §9.6 flow steps 1–6).
- [ ] **Step 3: Prefix transform (D-3 — REUSE).** Use `scaffold-pipeline.ts` `readSubstituteWrite`'s substitution machinery to rewrite `aihu-` → `<prefix>-` across: custom-element tag names in `@template`, the `customElements.define('aihu-...', ...)` string, and the recipe's own class selectors in `@style`. After copy, the consumer's source has hard-coded prefixed tag names they own (spec §9.4). **If reuse proves too coupled (per D-3 fallback), implement `substitutePrefix` locally — only this step changes.**
- [ ] **Step 4: Tests** (`add.test.ts`, happy-dom + temp dir): `aihu add button` into a fixture project writes `button.aihu` to `ui.target`; `--prefix acme` rewrites the tag to `acme-button` AND the `customElements.define` call; `--dry-run` writes nothing but prints the plan; `--diff` shows a diff when the target exists; **a collision without `--force` aborts with a message and writes nothing; with `--force` it overwrites (R9)**; **transitive `registryDependencies` resolution is exercised via a synthetic two-recipe fixture (recipe-A → recipe-B) including a cycle-guard case (R8)** — Phase 1 recipes are flat, so this fixture is the only thing testing the transitive path. **Error-path tests (R6):** no `aihu.config.ts`, `@aihu/ui` not installed, no `ui` field, and unknown recipe name each exit nonzero with the expected message.
- [ ] **Acceptance:** all `add.test.ts` cases green; `aihu add button --prefix acme` in a scratch project produces an `<acme-button>` recipe whose `@style` still compiles via css-engine.
- [ ] **Commit:** `git commit -m "feat(cli): aihu add (resolve deps, prefix-transform, --dry-run/--diff/--prefix)"`

---

## Task 7: `aihu list` / `aihu list --installed`

> Maps to `css-5` item **"aihu list"** (MED). Depends on Task 6 (`registry-resolve.ts`).

**Files:** `packages/cli/src/commands/list.ts`, `packages/cli/tests/list.test.ts`.

- [ ] **Step 1:** `list(rest)` — without flags, print every `registry.json` item (name, type, description). With `--installed`, scan `ui.target` for copied recipes and print name + the version recorded in the `ui.primitives` record (D-4).
- [ ] **Step 2: Tests** — `list` over a fixture registry prints all items; `--installed` reflects only what was added.
- [ ] **Acceptance:** tests green.
- [ ] **Commit:** `git commit -m "feat(cli): aihu list / aihu list --installed"`

---

## Task 8: ~~`aihu rename --from --to`~~ — DEFERRED to Plan 6 (R1)

> **Deferred per eng-review R1.** `--prefix` on `aihu add` covers prefix-at-copy-time; `rename` only re-sweeps already-copied recipes, of which there are none at registry launch. It rides the same prefix-substitution code (Task 6 Step 3), so it is near-free to add in Plan 6 once consumers have copied recipes worth sweeping. Deferring it also removes the prefix-substitution DRY duplication between `add` and `rename`. **Do NOT build `rename` in Plan 5.**

---

## Task 9: Dispatcher wiring in `bin.ts` + usage

> Maps to `css-5` item **"Dispatcher wiring"** (HIGH). Depends on Tasks 6–7.

**Files:** modify `packages/cli/src/bin.ts`.

- [ ] **Step 1:** In `main()`, add async-import dispatch blocks for `add` and `list` (mirroring the existing `dev`/`build`/`mcp` blocks: `if (cmd === 'add') { const { default: add } = await import('./commands/add.js'); await add(rest); return }`). (`rename` deferred — R1.)
- [ ] **Step 2:** Extend the top-of-file usage doc comment + `usage()` output with the two new commands and their flags (`add <names...> [--prefix p] [--dry-run] [--diff] [--force]`, `list [--installed]`).
- [ ] **Step 3: Test** — a dispatcher-level test (or smoke) confirms `aihu add --dry-run button` reaches `add.ts` and exits 0; `aihu list` reaches `list.ts`.
- [ ] **Acceptance:** `bun run typecheck` + CLI tests green; `aihu` with no args still prints usage including the new commands.
- [ ] **Commit:** `git commit -m "feat(cli): wire add/list into the aihu dispatcher + usage"`

---

## Task 10: Verify acceptance criteria

**Files:** none — verification only

The `css-5` milestone is complete when:

- [ ] `@aihu/ui` scaffold exists; `bun install`, `bun run typecheck`, `bun run --filter @aihu/ui gen:registry`, and `bun scripts/sync-readme.ts --check` all pass.
- [ ] **`@aihu/ui` has NO `.size-limit.json` row** and `bun run check:size-rows` is green with it classified source-distributed (D-2 honored).
- [ ] `AihuConfig.ui` typechecks; omitting `ui` stays valid; existing `@aihu/server` tests unaffected.
- [ ] All four Phase 1 recipes compile via `@aihu/css-engine` to **scoped shadow-DOM CSS** with `@meta`-variant validation catching undeclared `data-variant`s, the emitted CSS references `var(--color-...)` (not baked colors), and recipe output is **byte-identical across `aihu-default`/`aihu-graphite`** (pack-invariance, R4).
- [ ] A **runtime shadow-adoption test** passes: a registered `<aihu-button>` instance has the compiled Constructable StyleSheet in `shadowRoot.adoptedStyleSheets`, shared across instances (R2/R7).
- [ ] `button.aihu` EXTENDS `AihuButton` from `@aihu/primitives/button` (class-extension model verified by import-grep), declares `dependencies: ['@aihu/primitives']` with EMPTY `registryDependencies` (R5); `card`/`badge`/`separator` import no primitive.
- [ ] `aihu add button --prefix acme` in a fresh fixture project writes a working `<acme-button>` recipe (tag + `customElements.define` + `@style` selectors all rewritten) whose `@style` compiles clean. (Spec §12.4 acceptance line.)
- [ ] `aihu add` resolves `registryDependencies` transitively (exercised by the synthetic fixture, R8); `--dry-run` writes nothing; `--diff` shows diffs; collisions abort unless `--force` (R9); the four error paths (no config / no registry / no `ui` field / unknown recipe) exit nonzero with actionable messages (R6).
- [ ] `aihu list` / `aihu list --installed` work end-to-end with tests. (`aihu rename` deferred to Plan 6 — R1.)
- [ ] Both new commands (`add`, `list`) dispatch from `bin.ts`; `usage()` documents them.
- [ ] `bun run test`, `typecheck`, `cargo test -p aihu-css-core` (unchanged) all pass; `@aihu/primitives`, `@aihu/context`, `@aihu/css-engine` size rows untouched.

If any fail, do not mark complete — fix in place or open a follow-up.

---

## Task 11: Hand off to Plan 6

**Files:** none

After Plan 5, `@aihu/ui` ships the registry schema + four Phase 1 recipes + the `aihu add`/`list` CLI, and the recipe `.aihu` SFCs are the first real workload exercising the Plans 1–3 scanner end-to-end. **What comes next (Plan 6):** `aihu rename --from --to` (deferred R1 — sweep already-copied recipe prefixes); the Storybook app (`apps/storybook`, consuming the `.stories.ts` stubs Plan 4 authored); Chromatic visual-regression baselines + the required-story CI gate; the **fresh-project Playwright portability harness** (spec §10.5 — the real post-compile size/render accountability deferred from D-2); and `aihu add --update` against the D-4 lockfile. Phase 2 recipes (`aihu-dialog`, `aihu-tooltip`, `aihu-input`, …) layer on once their Phase 2 primitives land — each its own follow-up.

---

## Anti-goals for Plan 5

- **Don't build a hosted HTTP registry** — v1 reads the installed `@aihu/ui` package from the local filesystem (D-1). The `registries: {}` multi-registry slot stays schema-reserved, unimplemented.
- **Don't add a `.size-limit.json` row for `@aihu/ui`** — it is source-distributed; the consumer's build measures the copied recipes. Size accountability is Plan 6's fresh-project harness (D-2).
- **Don't compile CSS inside `aihu add`** — it copies source only; the css-engine scanner picks the recipes up at the consumer's next `aihu build`. This separation is the whole point of the optimization landing at the consumer boundary.
- **Don't emit a `dist` from `@aihu/ui`** — no rolldown bundle, no runtime entry. The package payload is `.aihu` source + `registry.json`.
- **Don't reach for `tailwind-merge`/`clsx`/`cva`** — recipes use the in-house `cn()` from `@aihu/css-engine/runtime/cn` (spec §9.3 / anti-goals §13).
- **Don't register primitive tags in `@aihu/ui`** — primitives export classes; recipes register the concrete prefixed tags via the class-extension model (spec §9.4). `card`/`badge`/`separator` define their own standalone elements; only `button` extends a primitive.
- **Don't ship blocks** (`login-form`, `dashboard-shell`) — `type: 'block'` is schema-reserved; v1 ships zero blocks (spec §4, §13).
- **Don't wire Storybook/Chromatic or the Playwright portability harness** — Plan 6.
- **Don't build `aihu rename`** — deferred to Plan 6 (R1). `--prefix` on `add` covers copy-time prefixing; nothing to re-sweep yet.
- **Don't inline recipe source into `registry.json`** — index-only (R3). The `.aihu` files are the single source of truth; `aihu add` reads them directly.
- **Don't ship a per-instance inline `<style>`** — recipes adopt a shared static Constructable StyleSheet into the shadow root (R2). Per-instance inline CSS defeats the dedupe win.
- **Don't put `@aihu/primitives` in `registryDependencies`** — it's an npm `dependencies` entry (R5). `registryDependencies` is for other recipes only.
- **Don't author Phase 2+ recipes** — only the four Phase 1 recipes; later phases lag their primitives.
- **Don't hand-roll a parallel substitution engine** if `scaffold-pipeline.ts` reuse works (D-3) — extend the existing pipeline.

---

## Self-review checklist (run after writing this plan)

- [ ] Every task maps to a named `css-5` item (table at top).
- [ ] The four BLOCKING DECISIONS (registry distribution, no-size-row, substitution reuse, lockfile scope) are made with defaults + "what flips" notes for the user-confirmation gate.
- [ ] `@aihu/ui` is explicitly source-distributed: no `dist`, no runtime entry, no size row — stated in scaffold, acceptance, and anti-goals.
- [ ] The recipe-compile test is the end-to-end proof that Plans 1–3's scanner + scoped emitter work on a real `.aihu`/`@style` workload (Task 5 Step 4).
- [ ] `button` uses the class-extension model over `AihuButton`; `card`/`badge`/`separator` are presentational — stated in interface + acceptance.
- [ ] `aihu add` resolves `registryDependencies` transitively, supports `--dry-run`/`--diff`/`--prefix`, and never silently overwrites — covered by tests.
- [ ] Prefix substitution reuses `scaffold-pipeline.ts` (D-3), with a local-transformer fallback isolated to one step.
- [ ] `AihuConfig.ui` is build-time-only, defaults resolved at CLI read-time, omitting `ui` stays valid.
- [ ] Dispatcher wiring mirrors the existing `dev`/`build`/`mcp` async-import pattern in `bin.ts`.
- [ ] The handoff to Plan 6 (Storybook/Chromatic, portability harness, `--update` lockfile, Phase 2 recipes) is explicit.
- [ ] Each task has a concrete file list, numbered steps, a runnable acceptance check, and an exact `git commit -m`. No "TODO"/"TBD".
- [ ] NO implementation code — interfaces, signatures, and acceptance only.

---

## NOT in scope (deferred, with rationale)

- **`aihu rename --from --to`** — deferred to Plan 6 (R1). `--prefix` on `add` covers copy-time prefixing; nothing to re-sweep at launch.
- **Hosted HTTP registry / multi-registry (`registries: {}`)** — schema-reserved; v1 is local-package read (D-1). Lights up in v2 when a second registry exists.
- **`@aihu/ui` size budget / row** — source-distributed (D-2); real post-compile size accountability is Plan 6's fresh-project harness.
- **`aihu add --update` + full `ui.primitives` lockfile semver resolution** — D-4 keeps record-only; `--update` re-pull is Plan 6.
- **Storybook / Chromatic / Playwright portability harness** — Plan 6.
- **Phase 2+ recipes** (`aihu-dialog`, `aihu-tooltip`, `aihu-input`, …) — lag their Phase 2 primitives; each its own plan.
- **Blocks** (`login-form`, `dashboard-shell`) — `type: 'block'` schema-reserved; zero blocks in v1.

## What already exists (reused, not rebuilt)

- `scaffold-pipeline.ts` `readSubstituteWrite` — reused for prefix substitution (D-3), not a parallel transformer.
- `bin.ts` async-import dispatch (`dev`/`build`/`mcp`) — mirrored for `add`/`list`.
- `cn()` (`@aihu/css-engine/runtime/cn`), style packs, `compileSfc()` — consumed by recipes.
- `AihuButton` + `defineButton` class-extension seam (`@aihu/primitives/button`) — extended by the button recipe.
- `AihuConfig` (`@aihu/server/config.ts:88`) — extended with `ui`, same build-time-only posture as `build`/`plugins`.

## Failure modes (per new codepath)

| Codepath | Realistic failure | Test? | Error handling? | Visible? |
|---|---|---|---|---|
| recipe registration | sheet never adopted → unstyled render | YES (R7 runtime test) | n/a | was silent → now caught |
| `aihu add` resolve | no config / no registry / no `ui` field | YES (R6) | YES (actionable msg + exit 1) | clear |
| `aihu add` resolve | unknown recipe name | YES (R6) | YES | clear |
| `aihu add` write | target collision | YES (R9) | YES (abort unless `--force`) | clear |
| resolveItems | transitive dep / cycle | YES (R8 synthetic fixture) | cycle-guard | n/a |
| gen-registry | stale index vs `.aihu` | mooted by R3 (index-only, source read live) | n/a | n/a |

**No critical gaps** (no codepath is untested AND unhandled AND silent).

## Parallelization

| Lane | Steps | Modules | Depends on |
|---|---|---|---|
| A | Task 2 → 4 → 5 | `packages/ui/**` | — |
| B | Task 3 (config) | `packages/server/**` | — |
| C | Task 6 → 7 → 9 | `packages/cli/**` | Lane A (registry.json + recipes) for end-to-end add test |

Launch **A + B in parallel** worktrees (disjoint modules). Lane **C** starts once Lane A's registry + recipes exist (it reads them). No two parallel lanes touch the same module directory → no conflict flags.

## Implementation Tasks
Synthesized from this review's findings.

- [ ] **T1 (P1, human: ~2h / CC: ~20min)** — ui-recipes — Pin `adoptedStyleSheets` CSS-attachment + runtime shadow-adoption test
  - Surfaced by: Architecture (D2/R2) + Test (D7/R7) — injection mechanism unspecified; compile-pass ≠ rendered styling
  - Files: `packages/ui/registry/button/button.aihu`, `packages/ui/tests/recipe-compile.test.ts`
  - Verify: registered `<aihu-button>` has the sheet in `shadowRoot.adoptedStyleSheets`, shared across instances
- [ ] **T2 (P1, human: ~30min / CC: ~10min)** — ui-recipes — button declares `@aihu/primitives` in `dependencies`, empty `registryDependencies`
  - Surfaced by: Code Quality (D5/R5) — field misuse breaks `aihu add button` resolution
  - Files: `packages/ui/registry/button/meta.json`
  - Verify: `aihu add button` resolves without treating `@aihu/primitives` as a registry item
- [ ] **T3 (P2, human: ~1h / CC: ~15min)** — ui-registry — index-only `registry.json`; `aihu add` reads `.aihu` directly
  - Surfaced by: Architecture (D3/R3) — inlined source duplicates files, regen-drift hazard
  - Files: `packages/ui/scripts/gen-registry.ts`, `packages/cli/src/registry-resolve.ts`
  - Verify: `RegistryFile` entries have `path` set, `source` unset; generator deterministic
- [ ] **T4 (P2, human: ~1.5h / CC: ~20min)** — cli — `aihu add` error paths + tests
  - Surfaced by: Code Quality (D6/R6) — raw stack trace on first-run failure
  - Files: `packages/cli/src/registry-resolve.ts`, `packages/cli/tests/add.test.ts`
  - Verify: each of 4 error paths exits nonzero with an actionable message
- [ ] **T5 (P2, human: ~1h / CC: ~15min)** — ui-recipes — pack-invariance + `var()` recipe-compile test (verify engine emits `var()` first)
  - Surfaced by: Architecture (D4/R4) — per-pack compile assertion likely tests a non-existent difference
  - Files: `packages/ui/tests/recipe-compile.test.ts`
  - Verify: recipe CSS byte-identical across packs; references `var(--color-*)`
- [ ] **T6 (P2, human: ~45min / CC: ~10min)** — cli — synthetic multi-recipe fixture for transitive deps + cycle guard
  - Surfaced by: Test (D8/R8) — transitive resolver path untested (Phase 1 recipes flat)
  - Files: `packages/cli/tests/add.test.ts`
  - Verify: A→B pulls B; cycle does not hang
- [ ] **T7 (P3, human: ~20min / CC: ~5min)** — cli — define `--force` flag + collision-overwrite test
  - Surfaced by: Code Quality (R9) — `--force` tested but not defined
  - Files: `packages/cli/src/commands/add.ts`, `packages/cli/tests/add.test.ts`
  - Verify: collision aborts without `--force`, overwrites with it

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 8 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0 — all 9 decisions made and applied to the plan.
- **VERDICT:** ENG CLEARED — ready to implement. Scope reduced (`aihu rename` deferred to Plan 6). One implementation precondition: T5 must verify the engine emits `var()` for semantic utilities before locking the pack-invariance assertion.
