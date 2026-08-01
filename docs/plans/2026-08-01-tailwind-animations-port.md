# Porting `midudev/tailwind-animations` into aihu — roadmap + Slice 1

**Date:** 2026-08-01
**Status:** Design. Slice 1 in progress.
**Upstream:** `github.com/midudev/tailwind-animations` — MIT, © Miguel Ángel Durán. Single file
`src/index.css` (918 lines), Tailwind v4 CSS-first plugin dialect.
**Follows the recipe-transcription workflow of**
[`docs/plans/2026-07-26-option-4-daisyui-design.md`](./2026-07-26-option-4-daisyui-design.md) §6 —
**with one deliberate departure**, argued in §2.

---

## 1. Verified ground truth (read from source in this worktree, not recalled)

| Fact | Where | Consequence for this port |
|---|---|---|
| Recipe channel needs **zero** Rust/build changes to add a family | `crates/aihu-css-core/build.rs` globs `recipes/*.css` → `RECIPE_SOURCES`; `recipes.rs` `include!`s it | The cheap-looking option. **But see the next three rows.** |
| **`compile_recipes` silently DROPS every top-level at-rule.** | `src/recipes.rs:78-101` — the emit loop only matches `StyleNode::Rule(rule)`. `StyleNode::AtRule` / `AtStatement` fall through with no branch. | A `@keyframes fade-in { … }` written into a recipe file parses fine and then vanishes. All 79 animations would emit `animation: fade-in …;` referencing a keyframe that does not exist. Confirmed live in current `main`. |
| Recipe rules are matched **by literal class name only** | `recipes.rs` `selector_class_names()` + `rule_is_used()` compare `.foo` against the raw scanned token | `hover:animate-shake` scans as the token `hover:animate-shake`, which never equals `animate-shake` — recipes have no variant support at all. |
| Recipe CSS **never** goes through `light_scope` | `emit.rs:386` calls `compile_recipes` into the `components` channel; `light_scope` scoping is only applied to the `authored` channel | Recipe-channel `@keyframes` would not need `@keyframes $global` — moot anyway since recipes are the rejected channel. |
| The **utility** channel already has a working keyframe-hoist mechanism | `tokens.rs:1597-1618` `animation_keyframes()`; hoisted as a top-level sibling by the emitter, idempotently | This is the mechanism 79 animations should reuse. |
| Utility variants wrap correctly, incl. `@media` | `emit.rs` variant loop, `variants.rs` | Adding `motion-safe:`/`motion-reduce:` is a small, well-understood change. |
| Parameterized numeric utilities already exist | `tokens.rs:1286-1290` — `duration-<int>` pattern | The 29 modifier families are ordinary parameterized/fixed utilities. No `--value()` analog needed. |
| `style_parser.rs` tolerates modern at-rules | `parse_statement` classifies any `@name prelude { … }` as `StyleNode::AtRule` with opaque prelude + recursively parsed body | `@starting-style`, `transition-behavior: allow-discrete`, `animation-timeline`, `::backdrop` all round-trip. |
| Only one name collision with aihu's existing 4 built-ins | Upstream's `--animate-pulse` is byte-identical to `tokens.rs:818`'s `animate-pulse` | Collision is a no-op if lookup order favors the built-in. |
| Any change to `aihu-css-core/src/*.rs` **must** bump the platform binaries | `scripts/check-css-engine-binary-bump.ts` | Every slice touching Rust bumps `packages/css-engine/package.json` + all 5 platform packages. |
| D4 §6 step 6 ("golden-file test per family") was prescribed but never executed | No `tests/recipes.rs` exists for btn/card/badge | Slice 1 discharges this debt. |

---

## 2. The load-bearing decision: utility engine, not recipe channel

**Decision D-A: the 79 animations and the 29 modifier families all land in the utility engine
(`tokens.rs` + a new `src/animations.rs` data table). The recipe channel is not used for this port.**

Reasons, in descending weight:

1. **Recipes cannot carry `@keyframes` today** — `compile_recipes` only emits `StyleNode::Rule`.
   Fixing that is more Rust work than the utility-engine approach, not less.
2. **Recipes get no variants** — `hover:animate-shake` would silently emit nothing.
3. **The 29 modifier families must be utilities regardless** — `animate-delay-500` is a functional
   value class, not a compound selector; it has no recipe representation.
4. **`animate-*` already lives in `tokens.rs`** — extending the established, tested pattern is
   idiomatic; forking a second animation mechanism is not.

The "79 match arms" concern is avoided with a data table, not a different channel:

```rust
// src/animations.rs  (NEW)
pub struct Animation {
    pub class: &'static str,      // "animate-fade-in"
    pub shorthand: &'static str,  // "fade-in 0.6s ease-in both"
    pub keyframes: &'static str,  // "@keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }"
}
pub static ANIMATIONS: &[Animation] = &[ /* … */ ]; // sorted by `class`
pub fn lookup(class: &str) -> Option<&'static Animation>;
```

**Decision D-B: reduced motion = a compiler-emitted global guard, PLUS `motion-safe:`/`motion-reduce:`
variants. Both in Slice 1.**

- (a) **Primary.** A `@media (prefers-reduced-motion: reduce)` guard emitted once per sheet,
  covering every ported animation class actually used, forcing `animation-duration: 1ms !important`
  (not `animation: none` — so `animationend` still fires) with a `:not([data-motion="always"])`
  per-element escape hatch.
- (b) **Also do it.** `motion-safe:`/`motion-reduce:` variants in `variants.rs` — the opt-in half.
  One enum variant, one arm in the prefix match, one arm in selector application, one arm in the
  emitter's variant loop.
- (c) **Rejected as sole mechanism.** `@aihu/use`'s `useReducedMotion` stays the JS-side escape
  hatch for non-CSS-driven behavior, not the only line of defense — CSS-only animations must be
  accessible without JS.

**Decision D-C: the 29 modifier families are ordinary utilities in `tokens.rs`.** ~45 new
`fixed_utility` arms (closed keyword sets) + ~8 `parameterized_utility` branches (numeric) + ~10
`arbitrary_prop` entries via the existing bracket path. No new value-parser needed.

**Decision D-D: almost no token renaming.** Unlike daisyUI, this catalog shares no design tokens
with aihu. Exactly one custom property survives:

| Upstream | aihu | Where |
|---|---|---|
| `--tw-anim-slide-distance` (default `20px`) | `--aihu-anim-slide-distance` | Inline `calc()` fallback inside slide keyframe bodies. No `theme.rs` registration needed. |

---

## 3. Roadmap

| # | Slice | Depends on | Notes |
|---|---|---|---|
| **1** | **Mechanism proof.** Vendor upstream + `NOTICES.md`; `src/animations.rs` table + `lookup`; 8 animations across 4 clusters; reduced-motion guard (D-B·a); `motion-safe:`/`motion-reduce:` variants (D-B·b); golden-test infra — `tests/animations.rs` **and** `tests/recipes.rs` (discharges D4 §6 step 6 debt for btn/card/badge) | — | In progress. |
| 2 | Timing modifiers: `animate-delay-*`, `animate-duration-*`, `animate-iteration-count-*` (incl. `infinite`), `animate-fill-mode-*`, `animate-direction-*`, `animate-play-*`. Plus `conflict_groups()` entries | 1 | ~20 fixed arms + 4 parameterized branches + 6 conflict rows. |
| 3 | Easing modifiers: `animate-ease[-in|-out|-in-out]`, `animate-linear`, `animate-steps-*`, `animate-bezier-*` | 1 | Independent of 2. Sets `animation-timing-function`, distinct from existing `ease-*` (`transition-timing-function`). |
| 4 | Fade cluster (~14): `fade-in`, `fade-out`, `blurred-fade-in`, `fade-in-{up,down,left,right}`, `fade-out-{up,down,left,right}`, `blink`, `flash`, `pulsing` | 1 | `fade-in`/`fade-out` land in Slice 1. |
| 5 | Slide cluster (~10) + `animate-slide-distance-*` (the D-D token) | 1 | `slide-in-left`/`slide-in-top` land in Slice 1. |
| 6 | Zoom/scale/expand-contract (~11): `zoom-{in,out}`, `scale`, `pop`, `squeeze`, `expand-*`, `contract-*`, `jelly`, `rubber-band` | 1 | `zoom-in` lands in Slice 1. |
| 7 | Rotate/spin (~12): `rotate-{90,180,360}`, `rotate-{in,out}`, `spin-{clockwise,counter-clockwise}`, `roll-{in,out}`, `impulse-rotation-*`, `rotational-wave` | 1 | `rotate-in` lands in Slice 1. |
| 8 | Flip (8): `flip-{horizontal,vertical}`, `flip-{x,y}`, `flip-in-{x,y}`, `flip-out-{x,y}` | 1 | Needs `perspective`/`backface-visibility`. |
| 9 | Attention seekers (~19): `shake`, `jiggle`, `tada`, `wobble`, `swing`, `heartbeat`, `horizontal-vibration`, `dancing`, `sway`, `skew`, `skew-right`, `tilt`, `jump`, `hang`, `float`, `sink`, `bouncing`, `vertical-bounce`, `horizontal-bounce` | 1 | Largest batch — split 9a/9b if reviewed as too large. `shake`/`jump` land in Slice 1. |
| 10 | Composites (3): `bounce-fade-in`, `swing-drop-in`, `pulse-fade-in` — plus the inventory-complete gate (`ANIMATIONS.len() == 78`) | 4–9 | Gate asserted against the vendored file, not a hand-list. |
| 11 | Scroll-driven timelines: `timeline-*`, `scroll-timeline-axis-*`, `view-timeline-axis-*`, `animate-range-*` | 1 (ideally 2–3) | Decide `progressive.rs` routing in this slice. |
| 12 | Dialog set: `animate-dialog-fade`, `animate-dialog-zoom`, `animate-dialog-from-*`, `animate-dialog-duration-*` | 11 | Multi-rule output; likely needs Slice 13's recipe fix. Not a blocker for 1–11. |
| 13 | Recipe-channel at-rule fix + binary-bump-guard hole | — | Independent, parallel with everything. Prerequisite of 12 if 12 uses the recipe route. |
| 14 | Docs + demo gallery rendering all 78 | 10 | Real visual regression net. |

**Parallelism.** 1 blocks everything. Once 1 lands: 2, 3, 4, 5, 6, 7, 8, 9, 11, 13 are mutually
independent — append-only, sorted `ANIMATIONS` array, conflicts resolve trivially. 10 joins 4-9.
12 needs 11 (and probably 13).

---

## 4. Slice 1 — implementation notes

See the execution plan for the exact file list, transcription batch, and acceptance checklist —
summarized here for reference:

- Vendor upstream into `vendor/tailwind-animations-<SHA>/` (`index.css`, `LICENSE`, `PROVENANCE.md`),
  plus root `NOTICES.md`.
- 8-animation batch across 4 clusters: `animate-fade-in`, `animate-fade-out`, `animate-slide-in-left`,
  `animate-slide-in-top`, `animate-zoom-in`, `animate-rotate-in`, `animate-shake`, `animate-jump`.
- New `src/animations.rs`; edits to `lib.rs`, `tokens.rs`, `variants.rs`, `emit.rs`.
- New `tests/animations.rs` (structural invariants + insta snapshots) and `tests/recipes.rs`
  (golden tests for existing btn/card/badge recipes, closing prior debt).
- Binary version bump across `packages/css-engine/package.json` + 5 platform packages.
