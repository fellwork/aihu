# CSS Engine Plan 4 — `@aihu/primitives` (DOM-walk context + Phase 0/1 headless primitives)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **DESIGN-LOCKED — implement exactly as specified; do not redesign the `@aihu/context` reconciliation (see Task 3 / decision below).**

**Goal:** Ship `@aihu/primitives` — the **headless behavior layer** that sits on top of the now-feature-complete CSS engine (Plans 1–3, merged at main `ba63651`). Deliver: (1) the package scaffold with per-primitive `.size-limit.json` rows (each under 4 KB gz tree-shakable); (2) a self-contained DOM-walk `createContext` utility (live ancestor traversal across custom-element boundaries, Symbol-keyed, signal-backed); (3) the five **Phase 0** primitives (`presence-gate`, `form-control`, `config-provider`, `roving-focus`, `collection`); (4) the three **Phase 1** primitives (`dialog-root` + pieces, `tooltip-root` + pieces, `button` headless base). Every primitive is HEADLESS — it emits DOM structure + ARIA + `data-state` attributes and owns its state on `@aihu/signals`; it ships **NO CSS**. Consumers style via Plan 3's `cn()` + style packs.

**Architecture:** Plans 1–3 made the engine compile `.aihu` SFCs to scoped shadow-DOM CSS, with the full Tailwind v4 utility table, WC-native + standard variants, theming, two style packs, four progressive features, the `cn()` runtime helper, and `defineStylePack()`. Plan 4 adds **behavior, not styling**. Primitives are vanilla custom elements (authored as `.aihu` SFCs) that manage focus, keyboard interaction, ARIA wiring, and controlled/uncontrolled state — the WAI-ARIA APG patterns — while delegating all visual presentation to the consumer's classes. State lives on `@aihu/signals`; DOM structure and boundaries come from `@aihu/arbor`; focus/ARIA use native DOM APIs; cross-component coordination (a `dialog-root` finding its `dialog-trigger`, a `roving-focus` enumerating its items) uses the new DOM-walk context. Output stays vanilla custom elements — the consumer-output thesis holds; the framework promise bends only at the consumer-*authoring* boundary, an already-adjudicated LOW trade (master spec §5 Risk #2).

**Tech Stack:** TypeScript (primitives authored as `.aihu` SFCs + `.ts` base classes), `@aihu/signals` (state), `@aihu/arbor` (DOM structure), `@aihu/css-engine/runtime/progressive` (`position()` shim — REUSED, not reimplemented), native DOM `focus()`/`setAttribute`/`KeyboardEvent`, Vitest + `happy-dom`/`jsdom` for keyboard + APG conformance tests, `size-limit` (`bun run size`) for per-primitive budget rows, Bun, Moon, rolldown + `rolldown-plugin-dts`. Browser baseline Chrome/Edge 113+, Safari 16.4+, Firefox 113+ (`decision-baseline-browser-window`).

---

## THE BLOCKING DECISION — `@aihu/context` reconciliation: **Option C (self-contained DOM-walk util inside `@aihu/primitives`)**

**Verified from source (this round):** `packages/context/src/index.ts` exports `createContext<T>()` / `provide()` / `inject()` / `setSsrContextMap()` / `clearSsrContextMap()` / `runWithContext()`. Its mechanism is a **module-level `Map<symbol, unknown>`**, Symbol-keyed, **DOM-FREE / SSR-safe** (per-request isolation via `runWithContext`). Its file header literally states "no DOM references." Its `.size-limit.json` row is **300 B** (Scout: 242 B actual → **+51 B headroom only**). Live consumers (confirmed via `.size-limit.json` ignore-lists): `@aihu/router` (RouteContext), `@aihu-plugin/data` (ResourceStoreToken); `@aihu/server` consumes the SSR entry points.

Plan 4 needs the opposite mechanism: a **live DOM-walk ancestor traversal** that resolves a provider by walking up the actual DOM tree (and across `ShadowRoot` boundaries) at runtime — the mechanism Radix/Ark use for root↔piece coordination. Same vocabulary, fundamentally different mechanism.

- **Option A (add DOM-walk to `@aihu/context` main): RULED OUT** by the dispatch. A DOM walk needs ~100–150 B; that exceeds the +51 B headroom by >2× and couples the deliberately DOM-free/SSR-safe package to the DOM, breaking its stated thesis.
- **Option B (new `@aihu/context/dom` subpath):** own `dist/dom.js` + own `.size-limit.json` row, mirroring the existing `./ssr` subpath. Pro: vocabulary consistency — one package owns the word "context." Con: it puts a DOM-coupled export inside a package whose entire identity is "DOM-free"; and it still risks **two competing `createContext` symbols** a consumer could import the wrong one of (the explicit anti-goal: "avoid two competing `createContext` symbols that a consumer could confuse").
- **Option C (self-contained DOM-walk util inside `@aihu/primitives`) — CHOSEN.** A new `packages/primitives/src/dom-context.ts` with **distinct vocabulary** (`createDomContext` / `provideContext` / `injectContext`, exported as `@aihu/primitives` surface) bundled into the primitives size accounting. **It does NOT depend on `@aihu/context` at all.**

**Rationale for C (crisp):** (1) The DOM-walk mechanism is a *behavior-layer* concern — it exists only because primitives are live custom elements coordinating across a real DOM tree; it has no SSR-context meaning, so it does not belong in the SSR-oriented `@aihu/context` package. (2) Distinct vocabulary (`createDomContext`, NOT `createContext`) directly satisfies the master-spec anti-goal "no two competing `createContext` symbols" — Option B keeps the colliding name. (3) Zero coupling: `@aihu/context`'s 300 B row and its three consumers are provably untouched because `@aihu/primitives` never imports it. (4) Encapsulation: a consumer reaching for primitives gets one cohesive surface; the SSR context system stays orthogonal. The minor cost — two context APIs in the monorepo — is mitigated entirely by the distinct names making their different mechanisms obvious at the call site.

**What flips if the user prefers Option B instead:** Move `dom-context.ts` out of `@aihu/primitives` into `packages/context/src/dom.ts`; add a `"./dom"` entry to `@aihu/context`'s `package.json` exports (mirroring `./ssr`) and a rolldown input; add `@aihu/context` to `@aihu/primitives`'s `dependencies` and to each primitive's `.size-limit.json` `ignore` list; rename the factory to `createContext` (re-exported from `@aihu/context/dom`) and keep `provide`/`inject` names; add a NEW `.size-limit.json` row `@aihu/context/dom` (~150 B) and register `@aihu/context/dom` in the size-rows allowlist. The `@aihu/context` main row (300 B), its `./ssr` subpath, and its three consumers stay untouched under **both** options. **No other task changes** — Tasks 4–9 consume the context util by its interface, which is identical in shape under B or C; only the import path and the factory name differ. This is the one decision flagged to surface to the user before the Builder runs.

---

**Reference spec:** Architect R7.1 CSS-engine spec `22d3a66e-e7fe-4fce-a191-1c003abb70fa` (§2.5 milestone `css-4`, §4 decisions, §5 Risk #2 authoring-boundary trade). Scout report `d0617e8a-df8a-4663-871f-60f2b9394b27`. Director note `e2a9a575-55ae-4b25-82ba-686f83699454`. Builds on `docs/superpowers/plans/2026-05-22-css-engine-plan-3-style-packs.md` (Task 12 hand-off) and `docs/superpowers/plans/2026-05-22-css-engine-plan-2-ast-scanner.md`.

**Maps to plan-items** (milestone group `css-4` in plan `aihu-v1-css-engine`; per-item slugs are not addressable — items referenced by title):

| Task | `css-4` item title | Priority |
|---|---|---|
| 2 | @aihu/primitives package scaffold with size-limit row | HIGH |
| 3 | createContext utility module with DOM-walk inject/provide pair, Symbol-keyed | HIGH |
| 4–8 | Phase 0 primitives: presence-gate, form-control, config-provider, roving-focus, collection | HIGH |
| 9–11 | Phase 1 primitives: dialog-root + pieces, tooltip-root + pieces, button headless base class | HIGH |

**Size budget (RESOLVED from `team plan render` + master spec §2.5 item 26 + §4 `decision-browser-size-budget-impact` + §2.7 css-6 item 46):** the budget is **per-primitive, under 4 KB gz tree-shakable** — NOT one bundled ~4 KB row. The formal per-primitive rows are restated in css-6 item 46, but the **scaffold lands its rows in css-4 (item 26)**. This plan therefore emits **one `.size-limit.json` row per primitive entry point** (each a separate rolldown input, so each tree-shakes independently), every row limited to **`4 KB` gz**, plus one row for the shared DOM-walk context util. Per-package/per-row figures are the contract, not any combined total (`.size-limit.README.md`).

---

## File Structure

This plan creates a new package `packages/primitives/` and modifies three repo-root registration files.

**Depends on (must exist first):** `@aihu/signals` (merged), `@aihu/arbor` (merged), `@aihu/css-engine/runtime/cn` + `@aihu/css-engine/runtime/progressive` (Plan 3, merged at `ba63651`).

**Create — package scaffold:**
- `packages/primitives/package.json` — name `@aihu/primitives`, `type: module`, `sideEffects: false`, exports map (one entry per primitive + the context util), `dependencies` on `@aihu/signals`, `@aihu/arbor`, `@aihu/css-engine`
- `packages/primitives/moon.yml` — `language: typescript`, `layer: library`, `dependsOn: [signals, arbor, css-engine]`, build/test tasks (typecheck inherited — do NOT override)
- `packages/primitives/rolldown.config.ts` — multi-entry `input` object (one entry per primitive + `dom-context`), `output.dir: dist`, ESM, `dts()` plugin
- `packages/primitives/tsconfig.json` — extends `../../tsconfig.base.json`, `outDir ./dist`, `rootDir ./src`, `declaration` + `declarationMap`, `exclude` tests
- `packages/primitives/README.md` — with `<!-- BEGIN_AUTOGEN: ... -->` markers so `scripts/sync-readme.ts` populates it

**Create — context util (Option C):**
- `packages/primitives/src/dom-context.ts` — `createDomContext` / `provideContext` / `injectContext`, signal-backed

**Create — Phase 0 primitives (each: `.aihu` SFC or `.ts` base + `.stories.ts` stub + `accessibility.md` + `keyboard.test.ts`):**
- `packages/primitives/src/presence-gate/` — `presence-gate.aihu`, `index.ts`, `presence-gate.stories.ts`, `accessibility.md`, `keyboard.test.ts`
- `packages/primitives/src/form-control/` — same file set
- `packages/primitives/src/config-provider/` — same file set
- `packages/primitives/src/roving-focus/` — same file set
- `packages/primitives/src/collection/` — same file set

**Create — Phase 1 primitives (each adds an `apg.test.ts` WAI-ARIA conformance test):**
- `packages/primitives/src/dialog/` — `dialog-root.aihu` + pieces (`dialog-trigger`, `dialog-content`, `dialog-backdrop`, `dialog-close`, `dialog-title`, `dialog-description`), `focus-trap.ts`, `index.ts`, `dialog.stories.ts`, `accessibility.md`, `keyboard.test.ts`, `apg.test.ts`
- `packages/primitives/src/tooltip/` — `tooltip-root.aihu` + pieces (`tooltip-trigger`, `tooltip-content`), `index.ts`, `tooltip.stories.ts`, `accessibility.md`, `keyboard.test.ts`, `apg.test.ts`
- `packages/primitives/src/button/` — `button.ts` (headless base class), `index.ts`, `button.stories.ts`, `accessibility.md`, `keyboard.test.ts`, `apg.test.ts`

**Modify (repo root — registration):**
- `.size-limit.json` — add **one row per primitive entry** (`4 KB` gz each) plus the `dom-context` row (see Task 2 for the exact rows)
- `scripts/__package-inventory.json` — add the `@aihu/primitives` entry (alpha-sorted, after `@aihu/plugin`)
- `scripts/check-size-rows.ts` — classify `@aihu/primitives` as browser-eligible so its new rows pass the lint
- `.size-limit.README.md` — add `@aihu/primitives` primitives to the browser-eligible table

---

## Task 1: Precheck — Plan 3 merged, clean tree, substrate available

**Files:** none — verification only

- [ ] **Step 1:** `git -C c:/git/fellwork/aihu log -1 --format=%H main` shows `ba63651...` (or later); Plan 3 (`css-3`) merged. `cargo test -p aihu-css-core` and `bun run test` (root) both pass.
- [ ] **Step 2:** Confirm the substrate sub-exports resolve: `@aihu/css-engine/runtime/cn` and `@aihu/css-engine/runtime/progressive` both exist in `packages/css-engine/package.json` exports, and `progressive.ts` exports a `position(...)` shim (the REUSE target for `tooltip`). Run `bun run typecheck` to confirm `@aihu/signals` + `@aihu/arbor` types resolve.
- [ ] **Step 3:** `git status` clean on the working branch (or only Plan 4 docs). Confirm `@aihu/arbor`'s known ~15 B size overage is PRE-EXISTING (do NOT touch it — out of scope, fix scheduled v0.2.3).

---

## Task 2: `@aihu/primitives` package scaffold + size-limit rows

> Maps to `css-4` item **"@aihu/primitives package scaffold with size-limit row"** (HIGH). Depends on `css-3-cn-runtime` (merged). Gate for everything below.

**Files:**
- Create: `packages/primitives/package.json`, `moon.yml`, `rolldown.config.ts`, `tsconfig.json`, `README.md`, `src/index.ts` (barrel)
- Modify: `.size-limit.json`, `scripts/__package-inventory.json`, `scripts/check-size-rows.ts`, `.size-limit.README.md`

- [ ] **Step 1: Author `package.json`** mirroring `@aihu/css-engine`'s shape: `"name": "@aihu/primitives"`, `"version": "0.0.0"`, `"license": "MIT"`, `"type": "module"`, `main`/`module`/`types` → `./dist/index.js`/`.d.ts`, `"sideEffects": false`, `"files": ["dist", "README.md", "LICENSE"]`, `"publishConfig": { "access": "public" }`, repository/homepage/bugs pointing at `packages/primitives`. `dependencies`: `"@aihu/signals": "workspace:*"`, `"@aihu/arbor": "workspace:*"`, `"@aihu/css-engine": "workspace:*"`. **Exports map** — one entry per primitive + the context util + a root barrel, each with `types` + `import` (per-primitive entries enable tree-shaking + the per-primitive size rows):

  - `"."` → `./dist/index.js`
  - `"./context"` → `./dist/dom-context.js`
  - `"./presence-gate"`, `"./form-control"`, `"./config-provider"`, `"./roving-focus"`, `"./collection"`
  - `"./dialog"`, `"./tooltip"`, `"./button"`

  Scripts: `"build": "rolldown -c"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"prepublishOnly": "bun run build"`.

- [ ] **Step 2: Author `moon.yml`** — `language: typescript`, `layer: library`, `dependsOn: ['signals', 'arbor', 'css-engine']` (so Moon builds upstream `dist` + `.d.ts` before primitives typecheck — same rationale as css-engine's compiler dep). `build` task `rolldown -c` with inputs `src/**/*.ts`, `src/**/*.aihu`, `rolldown.config.ts`, output `dist`, `options.mergeArgs: replace`. `test` task `vitest run` with `deps: ['~:build']`. **Do NOT override `typecheck`** (inherited from `.moon/tasks/tasks.yml`; overriding without `mergeArgs: replace` breaks it — see css-engine moon.yml note).

- [ ] **Step 3: Author `rolldown.config.ts`** — `defineConfig` with a multi-entry `input` object: `{ index: 'src/index.ts', 'dom-context': 'src/dom-context.ts', 'presence-gate': 'src/presence-gate/index.ts', ... }` (one key per primitive). `output: { dir: 'dist', format: 'esm', sourcemap: true, entryFileNames: '[name].js' }`. `plugins: [dts()]`. This guarantees each primitive lowers to its own `dist/<name>.js` for an independent size row (the same multi-entry pattern css-engine uses for `runtime/cn` + `runtime/progressive`).

- [ ] **Step 4: Author `tsconfig.json`** — copy css-engine's verbatim (`extends ../../tsconfig.base.json`, `outDir ./dist`, `rootDir ./src`, `declaration` + `declarationMap`, `include ["src/**/*"]`, `exclude ["tests/**/*", "dist", "node_modules"]`).

- [ ] **Step 5: Add the `.size-limit.json` rows** — one per primitive entry + the context util. Each primitive row uses `ignore` for the shared substrate (`@aihu/signals`, `@aihu/arbor`, `@aihu/css-engine`) so the row measures only the primitive's own code (matching how `@aihu/arbor` ignores `@aihu/signals`). Exact rows to add:

  ```json
  { "name": "@aihu/primitives/context",        "path": "packages/primitives/dist/dom-context.js",      "limit": "1 KB", "gzip": true, "ignore": ["@aihu/signals"] },
  { "name": "@aihu/primitives/presence-gate",  "path": "packages/primitives/dist/presence-gate.js",    "limit": "4 KB", "gzip": true, "ignore": ["@aihu/signals", "@aihu/arbor", "@aihu/css-engine"] },
  { "name": "@aihu/primitives/form-control",   "path": "packages/primitives/dist/form-control.js",     "limit": "4 KB", "gzip": true, "ignore": ["@aihu/signals", "@aihu/arbor", "@aihu/css-engine"] },
  { "name": "@aihu/primitives/config-provider","path": "packages/primitives/dist/config-provider.js",  "limit": "4 KB", "gzip": true, "ignore": ["@aihu/signals", "@aihu/arbor", "@aihu/css-engine"] },
  { "name": "@aihu/primitives/roving-focus",   "path": "packages/primitives/dist/roving-focus.js",     "limit": "4 KB", "gzip": true, "ignore": ["@aihu/signals", "@aihu/arbor", "@aihu/css-engine"] },
  { "name": "@aihu/primitives/collection",     "path": "packages/primitives/dist/collection.js",       "limit": "4 KB", "gzip": true, "ignore": ["@aihu/signals", "@aihu/arbor", "@aihu/css-engine"] },
  { "name": "@aihu/primitives/dialog",         "path": "packages/primitives/dist/dialog.js",           "limit": "4 KB", "gzip": true, "ignore": ["@aihu/signals", "@aihu/arbor", "@aihu/css-engine"] },
  { "name": "@aihu/primitives/tooltip",        "path": "packages/primitives/dist/tooltip.js",          "limit": "4 KB", "gzip": true, "ignore": ["@aihu/signals", "@aihu/arbor", "@aihu/css-engine"] },
  { "name": "@aihu/primitives/button",         "path": "packages/primitives/dist/button.js",           "limit": "4 KB", "gzip": true, "ignore": ["@aihu/signals", "@aihu/arbor", "@aihu/css-engine"] }
  ```

  > NOTE: `progressive` (the `position()` shim) is `ignore`d implicitly because `tooltip` imports it via `@aihu/css-engine` — already in the ignore list. The `dom-context` row uses `1 KB` (it is a small util); the eight primitive rows each use `4 KB` per the resolved per-primitive budget. **Under Option B**, ALSO add a `@aihu/context/dom` (~150 B) row and drop the `@aihu/primitives/context` row.

- [ ] **Step 6: Register the package.** Add to `scripts/__package-inventory.json` (alpha-sorted, `{ "name": "@aihu/primitives", "version": "0.0.0", "dir": "packages/primitives", "isPlatform": false }`). Add `@aihu/primitives` to the browser-eligible classification allowlist in `scripts/check-size-rows.ts` so the new rows pass the lint (per `.size-limit.README.md` § "Adding a new browser-eligible package"). Add the primitives to the browser-eligible table in `.size-limit.README.md`.

- [ ] **Step 7: Author `README.md`** with `<!-- BEGIN_AUTOGEN: package-overview -->` / `<!-- END_AUTOGEN: ... -->` markers, then run `bun scripts/sync-readme.ts` to populate the package list + size table. Confirm it does not error.

- [ ] **Step 8: Author `src/index.ts`** as a barrel that re-exports the context util + every primitive's public surface (filled in as each primitive lands; in this task it may be a stub that compiles).

- [ ] **Acceptance:** `bun install` links the workspace package; `bun run typecheck` passes for `@aihu/primitives`; `bun run check:size-rows` is green (the new rows are recognized as browser-eligible); `bun scripts/sync-readme.ts --check` passes. A scaffold-only `bun run build` emits `dist/index.js`.

- [ ] **Commit:**
```
git add packages/primitives/package.json packages/primitives/moon.yml packages/primitives/rolldown.config.ts packages/primitives/tsconfig.json packages/primitives/README.md packages/primitives/src/index.ts .size-limit.json .size-limit.README.md scripts/__package-inventory.json scripts/check-size-rows.ts
git commit -m "feat(primitives): @aihu/primitives package scaffold + per-primitive size rows"
```

---

## Task 3: `createDomContext` — self-contained DOM-walk inject/provide util (Option C)

> Maps to `css-4` item **"createContext utility module with DOM-walk inject/provide pair, Symbol-keyed"** (HIGH). Depends on Task 2. **Carries the BLOCKING DECISION — implement as Option C exactly; do NOT import `@aihu/context`.**

**Files:**
- Create: `packages/primitives/src/dom-context.ts`, `packages/primitives/tests/dom-context.test.ts`

- [ ] **Step 1: Define the named interface** (no bodies here — the Builder writes them). The util is **distinct in vocabulary** from `@aihu/context` to avoid the two-`createContext` collision:

  - **Token type:** `DomContext<T>` — `{ readonly _key: symbol; readonly _name: string; readonly _default: T | undefined }`. The `_key` is `Symbol(name)` (Symbol-keyed, mirroring `@aihu/context`'s pattern). `_name` aids debugging/throw messages.
  - **Factory:** `createDomContext<T>(name: string, defaultValue?: T): DomContext<T>` — returns the token.
  - **Provide:** `provideContext<T>(host: Element, ctx: DomContext<T>, value: T | Read<T>): void` — stamps the value onto `host` keyed by `ctx._key` (via a `WeakMap<Element, Map<symbol, unknown>>` module-level registry, NOT a DOM attribute, so values can be non-serializable signals). The value may be a raw `T` or a signal `Read<T>` (see Step 3).
  - **Inject:** `injectContext<T>(from: Element, ctx: DomContext<T>): T | Read<T>` — walks **up** the DOM from `from.parentNode`, crossing `ShadowRoot` boundaries (when a node is a `ShadowRoot`, continue from its `.host`), checking each ancestor's registry entry for `ctx._key`. Returns the first match; if none found, returns `ctx._default`; if `_default` is `undefined`, **throws** `MissingContextError(ctx._name)` (the spec's own unit-test requirement: throw-on-missing).
  - **Cleanup:** `provideContext` is idempotent per `(host, key)`; the WeakMap auto-releases when the host element is GC'd (no manual teardown needed — this is why a WeakMap, not a Map).

- [ ] **Step 2: Specify ancestor-walk semantics** for the unit tests:
  - **ancestor walk:** a child injecting finds the nearest providing ancestor (not a sibling, not a descendant).
  - **multi-root:** two sibling provider subtrees are isolated — a child under provider A never sees provider B's value.
  - **shadow boundary:** a child inside a `ShadowRoot` finds a provider on the shadow host's ancestor (walk steps `ShadowRoot → host`).
  - **nearest-wins:** when two ancestors both provide the same token, the closer one wins.
  - **throw-on-missing:** injecting a token with no provider and no default throws `MissingContextError`.

- [ ] **Step 3: Specify the `@aihu/signals` composition.** Context values are designed to carry signals so consumers react. `provideContext(host, ctx, signal)` stores the `Read<T>`; `injectContext` returns it; a consuming primitive reads it inside an `effect(...)` so it re-runs when the provider updates (e.g. `config-provider` updating `colorScheme` propagates to every injecting descendant). The util itself is signal-agnostic (stores whatever value is passed) — the *convention* is "provide a signal when you want reactivity," documented in the module header. This keeps `dom-context.ts` tiny (no signals dependency in its own code path beyond the `Read<T>` type import) and under its 1 KB row.

- [ ] **Step 4: Unit tests** (`tests/dom-context.test.ts`, happy-dom): cover all five semantics in Step 2, plus the signal-composition case (provide a signal, update it, assert an injecting `effect` re-ran). Assert `MissingContextError` is thrown by name.

- [ ] **Acceptance:** `bun run test` green for `dom-context.test.ts` (all five walk semantics + signal reactivity + throw-on-missing); `bun run size` shows `@aihu/primitives/context` under 1 KB gz; `@aihu/context`'s 300 B row + its three consumers are untouched (no import of `@aihu/context` anywhere in `packages/primitives/`).

- [ ] **Commit:**
```
git add packages/primitives/src/dom-context.ts packages/primitives/tests/dom-context.test.ts
git commit -m "feat(primitives): createDomContext DOM-walk inject/provide (self-contained, signal-backed)"
```

---

## Task 4: Phase 0 — `presence-gate`

> Part of `css-4` item **"Phase 0 primitives: presence-gate, form-control, config-provider, roving-focus, collection"** (HIGH). Depends on Task 3.

**Files:** `packages/primitives/src/presence-gate/{presence-gate.aihu,index.ts,presence-gate.stories.ts,accessibility.md,keyboard.test.ts}`

- [ ] **Step 1: Public interface.**
  - **Tag:** `<aihu-presence-gate>`. **Attributes (reflected):** `present` (boolean — controlled visibility), `data-state` (`"open" | "closed"`).
  - **Signals owned:** `present` (boolean signal), `mounted` (computed — true while open OR while a closing transition runs).
  - **Behavior:** when `present` flips false, the element keeps its children mounted until any CSS transition/animation on the content completes (listen for `transitionend`/`animationend`), then unmounts. This is the headless "mount/unmount with exit animation" gate (the Radix `Presence` pattern). Emits NO CSS — the consumer's exit animation drives the timing.
  - **ARIA:** none of its own (it is a structural gate); it sets `data-state` so consumers can target `[data-state=closed]` for exit styling.
  - **Context:** provides a `PresenceContext` (`createDomContext('presence', ...)`) carrying the `present` signal so descendant pieces (e.g. `dialog-content`) can read presence state.

- [ ] **Step 2: Acceptance (`keyboard.test.ts` + a presence test, happy-dom):** flipping `present` false keeps children in the DOM until a dispatched `transitionend`, then removes them; `data-state` reflects `open`/`closed`; an injecting descendant reads the presence signal reactively. `accessibility.md` documents "no ARIA role; structural only."

- [ ] **Commit:** `git commit -m "feat(primitives): presence-gate (mount/unmount with exit-animation hold)"`

---

## Task 5: Phase 0 — `form-control`

> Part of the Phase 0 item (HIGH). Depends on Task 3.

**Files:** `packages/primitives/src/form-control/{form-control.aihu,index.ts,form-control.stories.ts,accessibility.md,keyboard.test.ts}`

- [ ] **Step 1: Public interface.**
  - **Tag:** `<aihu-form-control>`. **Attributes (reflected):** `disabled`, `required`, `invalid` (boolean); `name`, `control-id` (string).
  - **Signals owned:** `disabled`, `required`, `invalid` signals.
  - **ARIA emitted (onto the slotted control + label/error pieces):** `aria-required`, `aria-invalid`, `aria-disabled`; wires `aria-describedby` from the control to a slotted error/description element's id; associates a slotted label via `id`/`for`.
  - **Context:** provides a `FormControlContext` (`createDomContext('form-control', ...)`) carrying `{ disabled, required, invalid, controlId, describedById }` signals so descendant label/input/error pieces consume the shared state and id wiring without prop-drilling.
  - **Behavior:** generates a stable `control-id` if not supplied; recomputes `aria-describedby` when an error message piece mounts/unmounts.

- [ ] **Step 2: Acceptance (`keyboard.test.ts`, happy-dom):** setting `invalid` reflects `aria-invalid="true"` on the slotted control; a slotted error element gets its id wired into `aria-describedby`; `disabled` propagates `aria-disabled`; descendant pieces injecting `FormControlContext` see the same signal values. `accessibility.md` documents the label/control/error association contract.

- [ ] **Commit:** `git commit -m "feat(primitives): form-control (disabled/required/invalid + ARIA association)"`

---

## Task 6: Phase 0 — `config-provider`

> Part of the Phase 0 item (HIGH). Depends on Task 3.

**Files:** `packages/primitives/src/config-provider/{config-provider.aihu,index.ts,config-provider.stories.ts,accessibility.md,keyboard.test.ts}`

- [ ] **Step 1: Public interface.**
  - **Tag:** `<aihu-config-provider>`. **Attributes (reflected):** `color-scheme` (`"light" | "dark" | "system"`), `density` (`"comfortable" | "compact"`), `dir` (`"ltr" | "rtl"`).
  - **Signals owned:** `colorScheme`, `density`, `dir` signals.
  - **Context:** provides a `ConfigContext` (`createDomContext('config', { colorScheme, density, dir })`) carrying the three signals. Any descendant primitive injects it to read app-level config reactively (e.g. a `tooltip` reading `dir` to flip its placement). This is the canonical signal-composition demonstrator from Task 3 Step 3.
  - **ARIA/DOM:** sets the `dir` attribute and `data-density`/`color-scheme` on its host so the engine's `host-context-dark:` variant + density tokens resolve. Emits NO CSS.

- [ ] **Step 2: Acceptance (`keyboard.test.ts`, happy-dom):** updating `color-scheme` signal updates every injecting descendant's effect (assert re-run); `density`/`dir` reflect to host attributes; nested `config-provider`s resolve nearest-wins (re-uses the Task 3 nearest-wins guarantee). `accessibility.md` documents `dir` propagation.

- [ ] **Commit:** `git commit -m "feat(primitives): config-provider (colorScheme/density/dir via reactive DOM context)"`

---

## Task 7: Phase 0 — `roving-focus`

> Part of the Phase 0 item (HIGH). Depends on Task 3.

**Files:** `packages/primitives/src/roving-focus/{roving-focus.aihu,index.ts,roving-focus.stories.ts,accessibility.md,keyboard.test.ts}`

- [ ] **Step 1: Public interface.**
  - **Tag:** `<aihu-roving-focus>` (container) + a registration contract for items (items register via the `collection` context from Task 8, OR via a lightweight item-registration context this primitive provides — REUSE `collection` if landed; this task may depend on Task 8 for descendant enumeration).
  - **Attributes (reflected):** `orientation` (`"horizontal" | "vertical" | "both"`), `loop` (boolean), `dir` (inherited from `config-provider` if present).
  - **Signals owned:** `currentIndex` (signal), `items` (signal/collection of focusable descendants), `activeId` (computed).
  - **Behavior (WAI-ARIA roving tabindex):** exactly one item has `tabindex="0"` (the current), all others `tabindex="-1"`; Arrow keys move `currentIndex` (respecting `orientation` + `loop` + `dir` for horizontal RTL), `Home`/`End` jump to first/last, and `element.focus()` is called on the new current. Updating `currentIndex` re-stamps tabindex across items reactively.
  - **ARIA:** does not impose a role (the consumer sets `role="toolbar"`/`"menu"`/etc.); it only manages tabindex + focus movement.

- [ ] **Step 2: Acceptance (`keyboard.test.ts`, happy-dom):** ArrowRight/Down advances `currentIndex` and moves focus; ArrowLeft/Up retreats; `loop` wraps at the ends; `Home`/`End` jump; exactly one item has `tabindex=0` at all times; RTL flips horizontal arrow direction. `accessibility.md` documents the roving-tabindex contract + which roles it pairs with.

- [ ] **Commit:** `git commit -m "feat(primitives): roving-focus (arrow-key roving tabindex, orientation/loop/RTL)"`

---

## Task 8: Phase 0 — `collection`

> Part of the Phase 0 item (HIGH). Depends on Task 3. **Author BEFORE `roving-focus` (Task 7) if `roving-focus` reuses it for descendant enumeration — the Builder may reorder Tasks 7/8 accordingly; the dependency edge is `collection → roving-focus` in that case.**

**Files:** `packages/primitives/src/collection/{collection.aihu,index.ts,collection.stories.ts,accessibility.md,keyboard.test.ts}`

- [ ] **Step 1: Public interface.**
  - **Tag:** `<aihu-collection>` (or a base mixin) providing descendant registration. **No reflected attributes of its own.**
  - **Signals owned:** `items` — an ordered signal array of registered descendant elements, kept in DOM order.
  - **Context:** provides a `CollectionContext` (`createDomContext('collection', ...)`) exposing `{ register(el): () => void; items: Read<Element[]> }`. Descendants call `register` on connect (returns an unregister disposer called on disconnect); the collection maintains DOM order (re-sorts on registration using `compareDocumentPosition`).
  - **Behavior:** this is the descendant-registration substrate that `roving-focus`, `menu`-style, and future list primitives build on — the Radix `Collection` pattern, implemented over the Task 3 DOM-walk context.

- [ ] **Step 2: Acceptance (`keyboard.test.ts`, happy-dom):** descendants registering in any insertion order yield `items` in DOM order; disconnecting a descendant removes it from `items`; an injecting consumer reads `items` reactively. `accessibility.md` documents "structural; no ARIA."

- [ ] **Commit:** `git commit -m "feat(primitives): collection (DOM-ordered descendant registration over dom-context)"`

---

## Task 9: Phase 1 — `dialog-root` + pieces

> Part of `css-4` item **"Phase 1 primitives: dialog-root + pieces, tooltip-root + pieces, button headless base class"** (HIGH). Depends on Phase 0 (`presence-gate` for content mount/unmount, `dom-context` for root↔piece wiring). Ships with a WAI-ARIA APG **Dialog (Modal)** conformance test passing.

**Files:** `packages/primitives/src/dialog/{dialog-root.aihu,dialog-trigger.aihu,dialog-content.aihu,dialog-backdrop.aihu,dialog-close.aihu,dialog-title.aihu,dialog-description.aihu,focus-trap.ts,index.ts,dialog.stories.ts,accessibility.md,keyboard.test.ts,apg.test.ts}`

- [ ] **Step 1: Public interface.**
  - **Tags:** `<aihu-dialog-root>` (state owner) and pieces `<aihu-dialog-trigger>`, `<aihu-dialog-content>`, `<aihu-dialog-backdrop>`, `<aihu-dialog-close>`, `<aihu-dialog-title>`, `<aihu-dialog-description>`.
  - **Root attributes (reflected):** `open` (boolean, controlled), `modal` (boolean, default true). **Root signals owned:** `open` signal. **Context:** root provides a `DialogContext` (`createDomContext('dialog', { open, contentId, titleId, descriptionId, close() })`) injected by all pieces.
  - **`data-state`:** every piece reflects `data-state="open"|"closed"` (composes with `presence-gate` for exit animation on `dialog-content`).
  - **Pieces behavior:**
    - `dialog-trigger`: `role`/keyboard via native `<button>` semantics; click toggles `open`; sets `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls={contentId}`.
    - `dialog-content`: wraps children in a `presence-gate`; sets `role="dialog"` (or `"alertdialog"` via attribute), `aria-modal="true"` when modal, `aria-labelledby={titleId}`, `aria-describedby={descriptionId}`. Mounts a **focus-trap** (Task piece `focus-trap.ts`): Tab/Shift+Tab cycle within content; focus moves to the first focusable (or content) on open. **Return-focus:** on close, focus returns to the trigger that opened it (store the `activeElement` at open time).
    - `dialog-backdrop`: click closes when `modal` (unless `data-dismissable-outside=false`); sets `data-state`.
    - `dialog-close`: click sets `open=false`.
    - `dialog-title`/`dialog-description`: generate stable ids consumed by content's `aria-labelledby`/`aria-describedby`.
  - **Escape:** `Escape` keydown on content closes (when not suppressed). **Backdrop/scroll:** headless — no scroll-lock CSS; expose a `data-scroll-lock` hook attribute only.
  - **`focus-trap.ts`:** named helper `createFocusTrap(container: Element): { activate(): void; deactivate(): void }` — queries focusable descendants, wraps Tab at the edges, restores focus on deactivate. Uses native DOM only (no library). REUSED by `tooltip` only if needed (tooltip is non-modal, so likely not).

- [ ] **Step 2: Acceptance.**
  - `keyboard.test.ts` (happy-dom): open via trigger → focus enters content; Tab cycles and wraps; Shift+Tab reverse-wraps; `Escape` closes; close → focus returns to trigger.
  - `apg.test.ts` (WAI-ARIA APG Dialog Modal pattern): assert `role=dialog`, `aria-modal=true`, `aria-labelledby`/`aria-describedby` resolve to real ids, `aria-haspopup`/`aria-expanded`/`aria-controls` on trigger, focus-trap + return-focus behavior — all per the APG Dialog spec.
  - `bun run size` shows `@aihu/primitives/dialog` under 4 KB gz.
  - `accessibility.md` documents the full APG Dialog conformance mapping.

- [ ] **Commit:** `git commit -m "feat(primitives): dialog-root + pieces (focus-trap, return-focus, escape, APG Dialog)"`

---

## Task 10: Phase 1 — `tooltip-root` + pieces

> Part of the Phase 1 item (HIGH). Depends on Phase 0 + `dom-context`. **REUSES Plan 3's `@aihu/css-engine/runtime/progressive` `position()` shim for placement — do NOT reimplement positioning.** Ships with a WAI-ARIA APG **Tooltip** conformance test passing.

**Files:** `packages/primitives/src/tooltip/{tooltip-root.aihu,tooltip-trigger.aihu,tooltip-content.aihu,index.ts,tooltip.stories.ts,accessibility.md,keyboard.test.ts,apg.test.ts}`

- [ ] **Step 1: Public interface.**
  - **Tags:** `<aihu-tooltip-root>`, `<aihu-tooltip-trigger>`, `<aihu-tooltip-content>`.
  - **Root attributes (reflected):** `open` (boolean), `open-delay`/`close-delay` (ms, default 700/300), `placement` (`"top"|"bottom"|"left"|"right"` + alignment). **Root signals owned:** `open` signal, `coords` (signal of computed position). **Context:** root provides `TooltipContext` (`createDomContext('tooltip', { open, contentId, triggerId, placement, coords })`).
  - **Trigger behavior:** shows on `mouseenter`/`focus` after `open-delay`; hides on `mouseleave`/`blur` after `close-delay`; sets `aria-describedby={contentId}` (APG tooltip: the trigger is described-by, NOT labelled-by, the tooltip).
  - **Content behavior:** `role="tooltip"`, stable `contentId`; mount/unmount via `presence-gate`; **positioned by calling the REUSED `position()` shim** from `@aihu/css-engine/runtime/progressive` (import path `@aihu/css-engine/runtime/progressive`) with the trigger as anchor + `placement` — writes the result into the `coords` signal; the content reads `coords` in an effect to set inline `top`/`left`. The engine's `anchor:`/`popover:` progressive variants already wrap this shim; tooltip reuses the same code (no new positioning, no floating-ui dependency added to primitives).
  - **Dismiss:** `Escape` hides; pointer-leave hides after delay; only one tooltip open at a time is the consumer's concern (not enforced here).

- [ ] **Step 2: Acceptance.**
  - `keyboard.test.ts` (happy-dom): focus trigger → content appears after delay; blur → hides after delay; `Escape` hides immediately; hover open/close honor delays (fake timers).
  - `apg.test.ts` (WAI-ARIA APG Tooltip pattern): `role=tooltip` on content; trigger has `aria-describedby={contentId}`; tooltip is NOT focusable; Escape dismisses.
  - **Positioning REUSE assertion:** a test (or a code-level grep in the self-review) confirms `tooltip` imports `position` from `@aihu/css-engine/runtime/progressive` and does NOT contain its own positioning math.
  - `bun run size` shows `@aihu/primitives/tooltip` under 4 KB gz (with `@aihu/css-engine` ignored).
  - `accessibility.md` documents the APG Tooltip conformance mapping.

- [ ] **Commit:** `git commit -m "feat(primitives): tooltip-root + pieces (reuses css-engine position() shim, APG Tooltip)"`

---

## Task 11: Phase 1 — `button` headless base

> Part of the Phase 1 item (HIGH). Depends on `dom-context` (optional) + `form-control` (for disabled inheritance). Ships with a WAI-ARIA APG **Button** conformance test passing.

**Files:** `packages/primitives/src/button/{button.ts,index.ts,button.stories.ts,accessibility.md,keyboard.test.ts,apg.test.ts}`

- [ ] **Step 1: Public interface.**
  - **Base class:** `AihuButton extends HTMLElement` (headless base — consumers/recipes extend it; NOT a registered tag in this package, since `@aihu/ui` recipes in Plan 5 register the concrete `<aihu-button>`). Provide a `defineButton(tag: string)` registration helper for tests/consumers.
  - **Attributes (reflected):** `disabled`, `pressed` (for toggle buttons), `type` (`"button"|"submit"|"reset"`).
  - **Signals owned:** `disabled`, `pressed` signals. `data-state` reflects `pressed`/`disabled`.
  - **ARIA + keyboard:** if the host is not a native `<button>`, set `role="button"` and `tabindex="0"`, and handle `Enter`/`Space` to fire a synthetic `click` (APG Button keyboard contract); set `aria-pressed` when it is a toggle; set `aria-disabled` + suppress activation when disabled. If it IS a native `<button>`, defer to native semantics and only manage `data-state` + toggle state. Reads `FormControlContext` (Task 5) so a button inside a disabled `form-control` inherits `disabled`.

- [ ] **Step 2: Acceptance.**
  - `keyboard.test.ts` (happy-dom): on a non-native host, `Enter` and `Space` fire `click`; `disabled` suppresses activation + sets `aria-disabled`; toggle mode reflects `aria-pressed`.
  - `apg.test.ts` (WAI-ARIA APG Button pattern): `role=button` + Enter/Space activation on a non-native host; toggle `aria-pressed`; disabled handling — all per APG Button.
  - `bun run size` shows `@aihu/primitives/button` under 4 KB gz.
  - `accessibility.md` documents the APG Button conformance mapping + native-vs-synthetic behavior.

- [ ] **Commit:** `git commit -m "feat(primitives): button headless base (ARIA/keyboard/toggle/disabled, APG Button)"`

---

## Task 12: Verify acceptance criteria

**Files:** none — verification only

The Plan 4 milestone (`css-4`) is complete when:

- [ ] `@aihu/primitives` scaffold exists; `bun install`, `bun run typecheck`, `bun run build` (emits `dist/<entry>.js` per primitive), and `bun scripts/sync-readme.ts --check` all pass.
- [ ] `bun run check:size-rows` is green: `@aihu/primitives` is classified browser-eligible and every primitive entry has a `.size-limit.json` row.
- [ ] `bun run size` shows EVERY `@aihu/primitives/*` primitive row **under 4 KB gz**, and `@aihu/primitives/context` under 1 KB gz.
- [ ] **`@aihu/context` is untouched:** its `.size-limit.json` row is still `300 B`; its `package.json` exports are unchanged; nothing in `packages/primitives/` imports `@aihu/context`; its three consumers (`@aihu/router`, `@aihu-plugin/data`, `@aihu/server`) are unmodified. (Under Option B this criterion instead reads: `@aihu/context` main row + `./ssr` + consumers untouched; a new `@aihu/context/dom` row added.)
- [ ] `createDomContext` passes all five DOM-walk semantics (ancestor walk, multi-root isolation, shadow-boundary crossing, nearest-wins, throw-on-missing) + the signal-reactivity case.
- [ ] All five Phase 0 primitives pass their `keyboard.test.ts`; each has an `accessibility.md` + a `.stories.ts` stub.
- [ ] All three Phase 1 primitives pass their `keyboard.test.ts` AND their `apg.test.ts` (WAI-ARIA APG conformance: Dialog Modal, Tooltip, Button).
- [ ] `tooltip` REUSES `position()` from `@aihu/css-engine/runtime/progressive` (verified by import-grep) and contains no reimplemented positioning math.
- [ ] No primitive emits CSS — all are headless (DOM structure + ARIA + `data-state` only); styling is the consumer's via `cn()` + style packs.
- [ ] `@aihu/arbor`'s pre-existing ~15 B overage was NOT modified by this plan.
- [ ] `cargo test -p aihu-css-core` (unchanged), `bun run test`, `typecheck`, `build` all pass.

If any fail, do not mark complete — fix in place or open a follow-up.

---

## Task 13: Hand off to Plan 5

**Files:** none

After Plan 4, `@aihu/primitives` ships the DOM-walk context util + five Phase 0 + three Phase 1 headless primitives, all under per-primitive 4 KB budgets, all WAI-ARIA APG-conformant for the Phase 1 set. **What comes next:** Plan 5 builds the `@aihu/ui` copy-paste registry (`RegistryItem`/`RegistryFile` schema, Phase 1 recipes `aihu-button`/`aihu-card`/`aihu-badge`/`aihu-separator` that EXTEND these headless primitives and ADD the styling via `cn()` + style packs) + the `aihu add <name>` CLI. Plan 6 adds the Storybook app (consuming the `.stories.ts` stubs authored here), Chromatic baselines, the required-story CI gate, the fresh-project Playwright harness, and the formal per-primitive size-budget rows (css-6 item 46 restates the rows this plan already added).

---

## Anti-goals for Plan 4

- **Don't build the `@aihu/ui` registry or `aihu add` CLI** — Plan 5. Primitives are headless behavior; recipes (styled, copy-paste) are Plan 5.
- **Don't wire Storybook/Chromatic** — Plan 6. This plan authors `.stories.ts` STUBS only; it does NOT create `apps/storybook` or run a Storybook build.
- **Don't emit ANY CSS from primitives** — they are headless. No `<style>`, no scoped CSS, no class strings baked in. Consumers style via Plan 3's `cn()` + style packs. (A primitive that ships CSS is a bug.)
- **Don't reimplement positioning** — `tooltip` REUSES `@aihu/css-engine/runtime/progressive`'s `position()` shim. No floating-ui dependency added to `@aihu/primitives`; no new positioning math.
- **Don't pick Option A or B for the context reconciliation** — Option C is design-locked (self-contained `createDomContext` in `@aihu/primitives`, distinct vocabulary). Do NOT add a second `createContext` symbol. (If the user overrides to B before the Builder runs, follow the "what flips" note in the decision section — but absent that override, build C.)
- **Don't modify `@aihu/context`** — not its DOM-free API, not its 300 B row, not its `./ssr` subpath, not its three consumers. `@aihu/primitives` must not import it (Option C).
- **Don't touch `@aihu/arbor`'s size overage** — the ~15 B over is pre-existing, fix scheduled v0.2.3, unrelated to Plan 4. Do not attempt to "fix" arbor.
- **Don't add a combined "@aihu/primitives" single size row** — the budget is per-primitive (one row per entry, each under 4 KB), not one bundled row.

---

## Self-review checklist (run after writing this plan)

- [ ] Every task maps to a named `css-4` item (table at top).
- [ ] The BLOCKING `@aihu/context` decision is made (Option C), justified, and the "what flips under B" note is written for the user-confirmation gate.
- [ ] The size budget is per-primitive under 4 KB gz (NOT one bundled row); the exact `.size-limit.json` rows are spelled out (Task 2 Step 5).
- [ ] `@aihu/context` (300 B row, `./ssr` subpath, three consumers) is provably untouched under the chosen option.
- [ ] `createDomContext` defines token type, factory, provide/inject signatures, ancestor-walk + shadow-boundary + multi-root + nearest-wins + throw-on-missing semantics, and the `@aihu/signals` composition — all as INTERFACES (no bodies).
- [ ] Each Phase 0 + Phase 1 primitive specifies tag(s)/base class, reflected attributes, owned signals, ARIA emitted, the context it provides/injects, and a runnable acceptance check.
- [ ] Phase 1 primitives each require a passing WAI-ARIA APG conformance test (Dialog Modal, Tooltip, Button).
- [ ] `tooltip` REUSES the Plan 3 `position()` shim (no reimplementation) — called out in interface + acceptance + anti-goals.
- [ ] All primitives are headless (no CSS) — stated in goal, each interface, and anti-goals.
- [ ] The linear dependency chain (scaffold → createDomContext → Phase 0 → Phase 1) is preserved by task ordering; the `collection ↔ roving-focus` edge is noted.
- [ ] Each task has a concrete file list, numbered steps, a runnable acceptance check, and an exact `git commit -m` message. No "TODO"/"TBD".
- [ ] NO implementation code — interfaces, signatures, and acceptance only.
