# CSS Engine Plan 3 — Style Packs, Progressive Features & `cn()` Runtime

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first two style packs (`aihu-default`, `aihu-graphite`), the `ProgressiveFeature` Rust trait + registry + emitter (with the four built-in features: `view-transition:`, `anchor:`, `popover:`, `text-balance:`), the `@aihu/css-engine/runtime` `cn()` helper (< 1 KB gz), and the `defineStylePack()` export hook for external orgs.

**Architecture:** Plan 2 made the engine compile real SFCs to scoped CSS with full variants and theming. Plan 3 layers on the *distribution + progressive-enhancement* surface: design-token CSS bundles (style packs), `@supports`-gated forward-looking CSS features with graceful fallback, and the single runtime helper the engine ships to the browser. This is the last engine-internals plan before primitives (Plan 4) and the UI registry (Plan 5) build on top.

**Tech Stack:** Rust 2021 (`aihu-css-core` crate — `ProgressiveFeature` trait), TypeScript (`cn()` runtime, `defineStylePack()`), `insta` snapshots, Vitest, `size-limit` for the runtime budget, Bun, Moon. Browser baseline Chrome/Edge 113+, Safari 16.4+, Firefox 113+ (`decision-baseline-browser-window`).

**Scope boundary:**
- ✅ `aihu-default` style pack — token CSS bundle from `apps/docs/style.css` brand tokens
- ✅ `aihu-graphite` style pack — monochrome variant (oklch values)
- ✅ Rust `ProgressiveFeature` trait + registry + emitter (`@supports`-gated CSS + JS dispatch + fallback)
- ✅ `view-transition:` variant prefix (CSS-only gate, silent no-op fallback)
- ✅ `anchor:` variant prefix (`@supports (anchor-name)` gate + floating-ui shim ~2 KB shared)
- ✅ `popover:` variant prefix (Popover API gate + floating-ui + portal helper fallback)
- ✅ `text-balance:` variant (`text-wrap: balance` emission, CSS silent ignore, no JS)
- ✅ `@aihu/css-engine/runtime` `cn()` helper (< 1 KB gz)
- ✅ `defineStylePack()` export hook for external orgs
- ❌ NO `@aihu/primitives` package (Plan 4)
- ❌ NO `@aihu/ui` registry / `aihu add` (Plan 5)
- ❌ NO Storybook / Chromatic (Plan 6)

**Reference spec:** Architect R7.1 CSS-engine spec `22d3a66e-e7fe-4fce-a191-1c003abb70fa` (§2.4 milestone `css-3`, §4 decisions, §5 Risk #4 size-split). Builds on `docs/superpowers/plans/2026-05-22-css-engine-plan-2-ast-scanner.md`.

**Maps to plan-items** (milestone group `css-3` in plan `aihu-v1-css-engine`; per-item slugs are not addressable — items referenced by title):

| Task | `css-3` item title | Priority |
|---|---|---|
| 2 | aihu-default style pack: token CSS bundle from apps/docs/style.css brand tokens | HIGH |
| 3 | aihu-graphite style pack (monochrome variant) | MEDIUM |
| 4 | Rust ProgressiveFeature trait + registry + emitter for @supports-gated CSS + JS dispatch + fallback | HIGH |
| 5 | view-transition: variant prefix (CSS-only gate, silent no-op fallback) | MEDIUM |
| 6 | anchor: variant prefix (@supports (anchor-name) gate + floating-ui shim ~2KB shared) | MEDIUM |
| 7 | popover: variant prefix (Popover API gate + floating-ui + portal helper fallback) | MEDIUM |
| 8 | text-balance: variant (text-wrap: balance emission, CSS silent ignore, no JS) | LOW |
| 9 | @aihu/css-engine/runtime exports cn() helper | HIGH |
| 10 | defineStylePack() export hook for external orgs | LOW |

---

## File Structure

This plan creates or modifies the following files (all under `packages/css-engine/`):

**Depends on (must exist first):** all of Plan 2 (`css-2` items) — scanner, full utility table, scoped emitter, variants, `@theme` parser.

**Create:**
- `styles/aihu-default.css` — default token bundle (extracted from `apps/docs/style.css`)
- `styles/aihu-graphite.css` — monochrome token bundle
- `crates/aihu-css-core/src/progressive.rs` — `ProgressiveFeature` trait + registry + emitter
- `crates/aihu-css-core/src/features/` — the four built-in features (`view_transition.rs`, `anchor.rs`, `popover.rs`, `text_balance.rs`)
- `src/runtime/cn.ts` — the `cn()` helper (separate sub-export, separate size budget)
- `src/runtime/progressive.ts` — the floating-ui shim + Popover fallback + portal helper (separate sub-export)
- `src/define-style-pack.ts` — `defineStylePack()` export hook
- `tests/cn.test.ts`, `tests/style-pack.test.ts` + insta snapshots for progressive features

**Modify:**
- `crates/aihu-css-core/src/variants.rs` — register the four progressive-feature variant prefixes
- `crates/aihu-css-core/src/lib.rs` — wire the `ProgressiveFeature` registry into emit
- `packages/css-engine/package.json` — add `./runtime/cn` and `./runtime/progressive` sub-export entries
- `.size-limit.json` — **add rows** for `@aihu/css-engine/runtime/cn` (< 1 KB gz) and `@aihu/css-engine/runtime/progressive` (< 3 KB gz). These are the FIRST browser-eligible rows the engine adds (per ratified `decision-browser-size-budget-impact` size-split; the engine core stays build-time-only with no row).

---

## Task 1: Precheck — Plan 2 green, clean tree

**Files:** none — verification only

- [ ] **Step 1:** `cargo test -p aihu-css-core` and `bun run test` (in `packages/css-engine/`) both pass — Plan 2's scanner/emit/variants/theme/cache suites green.
- [ ] **Step 2:** `git -C c:/git/fellwork/aihu status` clean (or only Plan 3 docs). If dirty, ask the user.
- [ ] **Step 3:** Confirm `apps/docs/style.css` exists (the source of the `aihu-default` brand tokens). Run `ls apps/docs/style.css`.

---

## Task 2: `aihu-default` style pack

> Maps to `css-3` item **"aihu-default style pack: token CSS bundle from apps/docs/style.css brand tokens"** (HIGH). Depends on Plan 2 `@theme` directive parser.

**Files:**
- Create: `packages/css-engine/styles/aihu-default.css`
- Create: `packages/css-engine/tests/style-pack.test.ts`

- [ ] **Step 1: Extract the brand tokens from `apps/docs/style.css`**

Read `apps/docs/style.css` and pull the `--color-*`, `--radius-*`, `--space-*`, etc. custom-property declarations into `styles/aihu-default.css` as a `:root { ... }` (and `.dark { ... }`) token bundle. These are the same tokens Plan 2's theme registry bakes as defaults (Task 7 of Plan 2) — the style pack is the *consumer-shippable CSS file* form of those defaults.

- [ ] **Step 2: Smoke test imports and applies**

Create `tests/style-pack.test.ts`: import the CSS file content, assert it declares the expected token set (`--color-primary`, `--color-primary-foreground`, `--radius-md`, …) and that a compiled utility (`bg-primary`) references a token the pack defines (no dangling `var()`).

- [ ] **Step 3: Commit**
```
git add packages/css-engine/styles/aihu-default.css packages/css-engine/tests/style-pack.test.ts
git commit -m "feat(css-engine): aihu-default style pack (brand token CSS bundle)"
```

---

## Task 3: `aihu-graphite` style pack (monochrome variant)

> Maps to `css-3` item **"aihu-graphite style pack (monochrome variant)"** (MEDIUM). Depends on Task 2.

**Files:**
- Create: `packages/css-engine/styles/aihu-graphite.css`

- [ ] **Step 1: Define the monochrome oklch token set**

Mirror `aihu-default.css`'s token *names* but with monochrome `oklch()` values (a graphite/neutral ramp). Same `:root` + `.dark` structure so any recipe styled against the token names works under either pack with no markup change.

- [ ] **Step 2: Smoke test**

Extend `tests/style-pack.test.ts`: assert `aihu-graphite.css` defines the SAME token names as `aihu-default.css` (so packs are interchangeable) with distinct values.

- [ ] **Step 3: Commit**
```
git add packages/css-engine/styles/aihu-graphite.css packages/css-engine/tests/style-pack.test.ts
git commit -m "feat(css-engine): aihu-graphite monochrome style pack"
```

---

## Task 4: `ProgressiveFeature` trait + registry + emitter

> Maps to `css-3` item **"Rust ProgressiveFeature trait + registry + emitter for @supports-gated CSS + JS dispatch + fallback"** (HIGH). Depends on Plan 2 standard-variants. This is the foundation for Tasks 5–8.

**Files:**
- Create: `crates/aihu-css-core/src/progressive.rs`
- Modify: `crates/aihu-css-core/src/lib.rs`, `crates/aihu-css-core/src/emit.rs`

- [ ] **Step 1: Define the trait**

```rust
/// A forward-looking CSS feature gated behind `@supports`, optionally with a
/// JS runtime fallback. Each feature owns: its variant prefix, the `@supports`
/// condition, the gated CSS it emits, and whether it dispatches a JS fallback.
pub trait ProgressiveFeature {
    /// The variant prefix, e.g. "view-transition", "anchor", "popover", "text-balance".
    fn prefix(&self) -> &'static str;
    /// The `@supports(...)` condition string, or None for "always emit, silently ignored if unsupported".
    fn supports_condition(&self) -> Option<&'static str>;
    /// Emit the gated CSS for a given base utility/declaration.
    fn emit_css(&self, base: &str) -> String;
    /// Runtime fallback descriptor: which `@aihu/css-engine/runtime/progressive`
    /// export to dispatch when `@supports` fails. None = silent CSS no-op (no JS).
    fn js_fallback(&self) -> Option<&'static str>;
}
```

- [ ] **Step 2: Implement the registry + emitter**

A `ProgressiveRegistry` holds registered features keyed by prefix. The emitter, when it sees a variant prefix that matches a registered feature, emits: (a) the `@supports` block with the gated CSS; (b) optionally a small runtime-dispatch marker the TS layer reads to wire the JS fallback. Features with `js_fallback() == None` emit CSS only.

- [ ] **Step 3: Wire into the variant resolver**

Plan 2's `split_variants` (in `variants.rs`) already splits prefixes. Route any prefix matching a registered `ProgressiveFeature` to the progressive emitter instead of the standard selector path.

- [ ] **Step 4: Trait-level tests + commit**

Test the registry with a dummy feature; assert `@supports` gating wraps the CSS and that a `None`-fallback feature emits no JS marker.
```
git add crates/aihu-css-core/src/progressive.rs crates/aihu-css-core/src/lib.rs crates/aihu-css-core/src/emit.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): ProgressiveFeature trait + registry + @supports emitter"
```

---

## Task 5: `view-transition:` variant (CSS-only, silent no-op fallback)

> Maps to `css-3` item **"view-transition: variant prefix (CSS-only gate, silent no-op fallback)"** (MEDIUM). Depends on Task 4.

**Files:**
- Create: `crates/aihu-css-core/src/features/view_transition.rs`
- Modify: `crates/aihu-css-core/src/progressive.rs` (register)

- [ ] **Step 1: Implement the feature**

`view-transition:` emits `view-transition-name` / view-transition CSS gated behind `@supports (view-transition-name: none)`. `js_fallback()` returns `None` — when unsupported the browser silently skips the transition (no JS, no error). Per spec §6.7 this is the simplest progressive feature: CSS-only, no runtime cost.

- [ ] **Step 2: Snapshot + commit**

Snapshot the emitted `@supports` block. Confirm no runtime marker is produced.
```
git add crates/aihu-css-core/src/features/view_transition.rs crates/aihu-css-core/src/progressive.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): view-transition: progressive variant (CSS-only)"
```

---

## Task 6: `anchor:` variant (@supports gate + floating-ui shim ~2 KB shared)

> Maps to `css-3` item **"anchor: variant prefix (@supports (anchor-name) gate + floating-ui shim ~2KB shared)"** (MEDIUM). Depends on Task 4.

**Files:**
- Create: `crates/aihu-css-core/src/features/anchor.rs`
- Create: `packages/css-engine/src/runtime/progressive.ts` (the shared floating-ui shim)
- Modify: `crates/aihu-css-core/src/progressive.rs`

- [ ] **Step 1: Implement the Rust feature**

`anchor:` emits CSS anchor-positioning (`anchor-name` / `position-anchor`) gated behind `@supports (anchor-name: --a)`. `js_fallback()` returns `"anchorFallback"` — the runtime shim positions the element with floating-ui when native CSS anchor positioning is unsupported.

- [ ] **Step 2: Implement the runtime shim**

Create `src/runtime/progressive.ts` exporting `anchorFallback(...)`. This is the ~2 KB shared shim (shared with `popover:` in Task 7). It is a **separate sub-export** (`@aihu/css-engine/runtime/progressive`) from `cn` so the `cn` budget stays under 1 KB (per `decision-browser-size-budget-impact` size-split — Risk #4 mitigation).

- [ ] **Step 3: Snapshot the CSS + test the shim, commit**
```
git add crates/aihu-css-core/src/features/anchor.rs packages/css-engine/src/runtime/progressive.ts crates/aihu-css-core/src/progressive.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): anchor: progressive variant + floating-ui fallback shim"
```

---

## Task 7: `popover:` variant (Popover API gate + floating-ui + portal helper fallback)

> Maps to `css-3` item **"popover: variant prefix (Popover API gate + floating-ui + portal helper fallback)"** (MEDIUM). Depends on Task 6 (shares the runtime shim).

**Files:**
- Create: `crates/aihu-css-core/src/features/popover.rs`
- Modify: `packages/css-engine/src/runtime/progressive.ts` (add portal helper), `crates/aihu-css-core/src/progressive.rs`

- [ ] **Step 1: Implement the Rust feature**

`popover:` emits CSS gated behind `@supports selector(:popover-open)` (or the Popover API feature check). `js_fallback()` returns `"popoverFallback"`.

- [ ] **Step 2: Extend the runtime shim with the portal fallback**

Add `popoverFallback(...)` to `src/runtime/progressive.ts`, reusing the floating-ui positioning from Task 6 plus a portal helper for top-layer emulation when the Popover API is unavailable. Shares the ~2 KB floating-ui code with `anchor:` (no duplication — keeps the `progressive` sub-export under its 3 KB budget).

- [ ] **Step 3: Snapshot + test + commit**
```
git add crates/aihu-css-core/src/features/popover.rs packages/css-engine/src/runtime/progressive.ts crates/aihu-css-core/src/progressive.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): popover: progressive variant + portal fallback (shares floating-ui)"
```

---

## Task 8: `text-balance:` variant (text-wrap: balance, CSS silent ignore, no JS)

> Maps to `css-3` item **"text-balance: variant (text-wrap: balance emission, CSS silent ignore, no JS)"** (LOW). Depends on Task 4.

**Files:**
- Create: `crates/aihu-css-core/src/features/text_balance.rs`
- Modify: `crates/aihu-css-core/src/progressive.rs`

- [ ] **Step 1: Implement the feature**

`text-balance:` emits `text-wrap: balance`. `supports_condition()` returns `None` and `js_fallback()` returns `None` — unsupported browsers silently ignore the unknown value (standard CSS behavior). The simplest possible progressive feature: one declaration, no gate, no JS.

- [ ] **Step 2: Snapshot + commit**
```
git add crates/aihu-css-core/src/features/text_balance.rs crates/aihu-css-core/src/progressive.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): text-balance: progressive variant (no gate, no JS)"
```

---

## Task 9: `@aihu/css-engine/runtime` `cn()` helper (< 1 KB gz)

> Maps to `css-3` item **"@aihu/css-engine/runtime exports cn() helper"** (HIGH). Depends on Plan 2's utility table (the property map is generated from it).

**Files:**
- Create: `packages/css-engine/src/runtime/cn.ts`
- Modify: `packages/css-engine/package.json` (`./runtime/cn` sub-export), `.size-limit.json` (add the `< 1 KB` row)
- Create: `packages/css-engine/tests/cn.test.ts`

- [ ] **Step 1: Implement `cn()`**

`cn(...inputs)` merges class strings/arrays/conditionals into a single deduplicated class string, resolving Tailwind-style conflicts (last-wins per property group — e.g. `cn('p-2', 'p-4')` → `'p-4'`). The property-group map is **generated at engine build time** from the utility registry (Plan 2's `tokens.rs`), NOT hand-maintained — so it stays in sync with the utility table automatically. This is the runtime-merge helper for consumer-provided overrides (spec §9.3); recipes use static utility strings at compile time, `cn()` only for runtime overrides.

- [ ] **Step 2: Add the sub-export + size budget row**

`package.json` exports: add `"./runtime/cn": { "types": "./dist/runtime/cn.d.ts", "import": "./dist/runtime/cn.js" }`. Add a `.size-limit.json` row: `{ "name": "@aihu/css-engine/runtime/cn", "path": "dist/runtime/cn.js", "limit": "1 KB" }`. This is a deliberate, ratified browser-tier addition (`decision-browser-size-budget-impact`) — the FIRST browser-eligible row for the engine; the core compiler stays build-time-only.

- [ ] **Step 3: Test conflict-resolution + size**

`tests/cn.test.ts`: assert `cn('p-2', 'p-4')` → `'p-4'`, `cn('a', false && 'b', ['c'])` → `'a c'`, etc. Then run `bun run size` and confirm the `cn` row is under 1 KB gz.

- [ ] **Step 4: Commit**
```
git add packages/css-engine/src/runtime/cn.ts packages/css-engine/package.json .size-limit.json packages/css-engine/tests/cn.test.ts
git commit -m "feat(css-engine): cn() runtime helper (<1KB) with generated conflict map"
```

---

## Task 10: `defineStylePack()` export hook for external orgs

> Maps to `css-3` item **"defineStylePack() export hook for external orgs"** (LOW). Depends on Task 3 (the two built-in packs are the reference shape).

**Files:**
- Create: `packages/css-engine/src/define-style-pack.ts`
- Modify: `packages/css-engine/src/index.ts` (re-export)

- [ ] **Step 1: Implement `defineStylePack()`**

A typed factory letting an external org declare its own token bundle (same token-name contract as `aihu-default`/`aihu-graphite`) so it slots into the engine the same way the built-in packs do. Returns a `StylePack` descriptor (name + token map + optional dark overrides) the engine can register.

- [ ] **Step 2: Test + commit**

Test that a `defineStylePack({ name: 'acme', tokens: {...} })` produces a descriptor with the expected shape and that the built-in packs could be expressed through the same API.
```
git add packages/css-engine/src/define-style-pack.ts packages/css-engine/src/index.ts packages/css-engine/tests
git commit -m "feat(css-engine): defineStylePack() export hook for external orgs"
```

---

## Task 11: Verify acceptance criteria

**Files:** none — verification only

The Plan 3 milestone (`css-3`) is complete when:

- [ ] `aihu-default.css` and `aihu-graphite.css` exist; both define the same token names with distinct values (interchangeable packs)
- [ ] `ProgressiveFeature` trait + registry compile; the emitter wraps gated CSS in `@supports` and only emits JS markers for features with a non-`None` fallback
- [ ] All four built-in features behave per their fallback contract: `view-transition:` / `text-balance:` emit CSS only (no JS); `anchor:` / `popover:` emit `@supports` + a runtime-fallback marker
- [ ] `cn('p-2','p-4')` → `'p-4'` (generated conflict map); `bun run size` shows `@aihu/css-engine/runtime/cn` under 1 KB gz
- [ ] `@aihu/css-engine/runtime/progressive` (floating-ui shim shared by `anchor:`+`popover:`) under its 3 KB budget row
- [ ] `.size-limit.json` has exactly the two NEW runtime rows (`/runtime/cn`, `/runtime/progressive`); engine core has NO row
- [ ] `defineStylePack()` produces a valid pack descriptor; the built-ins are expressible through it
- [ ] `cargo test -p aihu-css-core`, `bun run test`, `typecheck`, `build` all pass

If any fail, do not mark complete — fix in place or open a follow-up.

---

## Task 12: Hand off to Plan 4

**Files:** none

After Plan 3, the engine is feature-complete for the v1 scope: full utility table, scoped output, all variants, theming, two style packs, four progressive features, the `cn()` runtime, and the `defineStylePack()` hook. **What comes next:** Plan 4 builds `@aihu/primitives` (headless behavior components — `createContext`, Phase 0 utilities, Phase 1 `dialog`/`tooltip`/`button`) on top of this engine; Plan 5 builds the `@aihu/ui` copy-paste registry + `aihu add` CLI; Plan 6 adds Storybook + Chromatic + dogfooding + the full acceptance gate.

---

## Anti-goals for Plan 3

- **Don't build `@aihu/primitives`** — Plan 4. Style packs and `cn()` are engine concerns; primitives are behavior.
- **Don't merge the `cn` and `progressive` runtime exports** — they MUST stay separate sub-exports with separate size rows (Risk #4: combined they blow the 1 KB `cn` budget).
- **Don't duplicate floating-ui** between `anchor:` and `popover:` — share the one ~2 KB shim in `runtime/progressive.ts`.
- **Don't add JS fallbacks to `view-transition:` or `text-balance:`** — they are deliberately CSS-only (silent no-op when unsupported).
- **Don't hand-maintain the `cn()` conflict map** — generate it from the utility registry at engine build time so it never drifts from the table.
- **Don't add a third style pack** — two (`default` + `graphite`) prove the interchangeable-token contract; more packs are post-v1.
- **Don't add browser-bundle rows for the engine core** — only the two runtime sub-exports are browser-eligible (`decision-browser-size-budget-impact`).

---

## Self-review checklist (run after writing this plan)

- [ ] Every task maps to a named `css-3` item (table at top)
- [ ] The `cn` / `progressive` runtime size-split (Risk #4 mitigation) is honored — two separate sub-exports, two separate budget rows
- [ ] `.size-limit.json` additions match `decision-browser-size-budget-impact` (only the two runtime rows; core has none)
- [ ] The four progressive features' fallback contracts are distinct and correct (2 CSS-only, 2 with shared JS shim)
- [ ] Style packs are interchangeable (same token names) — asserted in tests
- [ ] `cn()` conflict map is GENERATED from the utility registry, not hand-written
- [ ] No "TODO"/"TBD" in any task; each step has a concrete file + command/snapshot
