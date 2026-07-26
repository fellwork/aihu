# Option 4 (hybrid daisyUI) — detailed design

**Date:** 2026-07-26
**Status:** Design. Slice 1 landed with this document; Slices 2-9 are proposed, not approved.
**Fills:** the `PLACEHOLDER` at
[`2026-07-23-use-parity-and-daisyui.md`](./2026-07-23-use-parity-and-daisyui.md) §3(a) —
"token-mapping mechanics, tree-shake/content-scan implementation, recipe-transcription
workflow, migration plan for the `.dark`-class → `data-theme` StylePack reconciliation."
**Amended by, and honours:**
[`2026-07-24-light-dom-leaf-flip.md`](./2026-07-24-light-dom-leaf-flip.md) §6 and §8.
**Escalations requiring founder sign-off:** §7.4 (two of them). Nothing downstream of them
should land first.

> **The four ratified decisions are not re-litigated here.** Full recipe port (D1), Option 4
> hybrid with content-scanned emission (D2), `data-theme` on `<html>` (D3), primitives-first
> (D4). This document specifies the *mechanism*. Where a decision turns out to be more
> expensive or less complete than its one-line statement implies, that is said plainly in
> §7.4 and escalated — not redesigned around.

---

## 0. Summary

| | |
|---|---|
| **The semantic layer lives** | in a **new recipe channel in `aihu-css-core`** (§2), authored in the `@apply` dialect that already exists, emitted global/unscoped alongside utilities, tree-shaken by the scanner that already exists. `@aihu/ui` registry recipes (D1) consume it rather than duplicating it. |
| **Token mapping** | a one-time **rename at transcription time** (§3). aihu's `--color-*` names stay the interchange contract; daisyUI's `-content` suffix maps to `-foreground`. Five daisyUI roles have **no aihu equivalent** and must be added to the brand contract — that addition is one of the two escalations. |
| **Tree-shaking** | mostly **already done** (§5). The utility channel has been JIT since day one. Two channels are not shaken: brand tokens and (once it exists) recipes. Both are fixed by generalizing one existing 25-line function. |
| **`.dark` → `data-theme`** | **two independent halves** (§4) that are routinely conflated: token *values* (`defineStylePack`) and dark-variant *rules* (`emit.rs`). Half A is additive and shipped in Slice 1; Half B is a Rust change. No flag day is required in either. |
| **style-lock tension** | **resolved by surface separation** (§7), enforced by a test, with two genuine collisions escalated rather than papered over. |
| **Landed today** | Slice 1 — the named-theme dimension + dual-keyed dark selector (§9). |

**Honest scope.** daisyUI ships ~35 component families. This is not one pass. §8 sequences
nine slices; Slice 1 is landed, Slice 4 is the load-bearing one, and the port itself (Slice 9)
is per-component and open-ended.

---

## 1. Verified ground truth

Everything in this section is **measured** — read from source in this worktree at
`origin/main` (`57202988`). Citations are `file:line`.

### 1.1 What exists and works

| Thing | Where | What it gives us |
|---|---|---|
| `@apply` expander | `packages/css-engine/crates/aihu-css-core/src/apply.rs:87-174` | Handles variants **structurally**: `@apply hover:bg-accent` inside `.btn {}` becomes `.btn { … &:hover { … } }` (`apply.rs:111-147`). This is the authoring dialect a semantic layer needs — it already exists. |
| CSS rule-tree parser | `.../src/style_parser.rs` (587 lines) | Real parsing, not regex. Recipes can be authored as CSS and parsed, not string-spliced. |
| AST content scanner | `.../src/scanner.rs:43-124` | Walks the template AST, collects every class token from static attrs, `class={expr}` string literals, and `class:name` macros. **This is the JIT.** |
| Palette shaking | `.../src/tokens.rs:520-545` | Scans the *assembled body* for `var(--color-X)` and registers only those. "Only the referenced tokens are added — not all 286" (`emit.rs:346-348`). The exact technique §5 generalizes. |
| Global escape hatch | `.../src/ast.rs:50` — `SfcStyleScope::{Scoped, Global}` | An authored block can already opt out of scoping. |
| `defineStylePack()` | `packages/css-engine/src/define-style-pack.ts` | Typed pack authoring; both built-ins go through it (`src/packs.ts:31,94`), byte-parity tested (`tests/style-pack.test.ts:120-127`). |
| Registry | `packages/ui/registry/` — 11 recipes + `registry.json` | badge, button, card, checkbox, dialog, input, label, separator, switch, textarea, tooltip. `aihu add` copies them. |

### 1.2 The three gaps — confirmed

**G1 — there is no semantic-class layer.** `tokens.rs` (1660 lines) is atomic utilities only;
`utility_to_css()` is a class→*flat declaration string* lookup (`tokens.rs:1316-1327`). Grepping
the Rust core for `btn|card|badge|navbar|hero|alert` as string literals returns exactly one hit,
a doc comment (`ast.rs:117`: ``/// Form A — `class="btn primary"`.``). **There is no `.btn`
anywhere in the engine.** Confirmed.

**G2 — `StylePackInput` admitted exactly two themes.** `tokens` (`:root`) and optional `dark`
(`.dark`). No named-theme dimension existed. **Closed by Slice 1** (§9).

**G3 — `data-theme` is a Firefox workaround, not a theme switcher.** `emit.rs:189-200` emits
`:host([data-theme="dark"]) {sel}, :root.dark {sel}`, matched on the **component host**, only
ever against the literal `"dark"`. `apply.rs:180-193` mirrors it. Neither branch matches
`<html data-theme="dark">`. Also confirmed: no `useTheme` anywhere in `packages/use/`
(`useColorScheme` and `usePreferredDark` ship, both explicitly state-only —
`packages/use/src/useColorScheme/index.ts:51`), and `config-provider` reflects onto its **own
host** (`packages/primitives/src/config-provider/index.ts:67`) with no `documentRoot` option.

### 1.3 Two things found during this pass that were not in the brief

**F1 — `config-provider` documents a link that does not exist.**
`packages/primitives/src/config-provider/index.ts:67` writes `data-color-scheme`, and its own
doc comment at `:14` claims this is what "the engine's `host-context-dark:` variant + density
tokens resolve" against. The engine emits `:host([data-theme="dark"])` / `:root.dark` and
**never reads `[data-color-scheme]`** (`emit.rs:189-200`). The reflected attribute has no CSS
consumer. This is a live bug, and the `documentRoot` extension (D3) is where it gets fixed.

**F2 — the color-scheme enum is forked.** `@aihu/use` uses `'light' | 'dark' | 'auto'`
(`packages/use/src/useColorScheme/index.ts:30`); `@aihu/primitives` uses
`'light' | 'dark' | 'system'` (`packages/primitives/src/config-provider/index.ts:20`). Any
`useTheme` composing the two must reconcile this. Not blocking, but it will bite Slice 8.

### 1.4 Blocking dependencies (not fixed here, must be fixed before the slices that need them)

| Dep | Effect | Blocks |
|---|---|---|
| **`--shadow` default defect.** `packages/cli/src/create.ts:236` — `const shadowMode: ShadowChoice = css === 'engine' ? (opts.shadow ?? 'shadow') : 'shadow'`. Confirmed. Since DA4 this emits an *explicit plugin-global* `css: { shadowMode: 'shadow' }`, outranking the page-level light default, so `create-aihu app --css engine` produces shadow DOM. Filed separately; **do not fix here.** | The one scaffold that most needs global CSS to reach components does not get it. A global recipe channel (§2) is invisible in that scaffold. | Slices 4, 5, 9 |
| **FEL-424.** Scaffolds emit no `aihu.config.ts`, so `aihu add` cannot run in a CLI-created project, and `vite-plugin.ts` never reads the config. | Verified independently: there is **no pack-selection surface at all** — `grep 'stylePack\|pack:' packages/app/src/config.ts packages/compiler/js/vite-plugin.ts` returns nothing. A consumer cannot choose a pack or a theme today, by any mechanism. | Slices 5, 9 |
| **Light-DOM leaf flip** (`2026-07-24-light-dom-leaf-flip.md`) — proposed, not approved. | §2's channel placement is correct in both modes, but the *value* of a global recipe channel is much higher post-flip. Also fixes the `:host` token bug (flip §6). | Nothing hard-blocks; Slice 6 is cheaper after. |

---

## 2. Where the semantic layer lives

### 2.1 The decision

**A new `recipes` channel in `aihu-css-core`.** Global and unscoped, emitted next to the
utility channel, tree-shaken by the scanner that already runs, authored in the `@apply` dialect
`apply.rs` already implements.

The flip doc pre-empted this and is right: daisyUI's `.btn`/`.btn-primary`/`.card-body` are
plain global class rules, so "they belong in the **utilities** channel, unscoped and
deduplicated" (flip §8). This design agrees on placement and splits it into its **own named
channel** rather than literally reusing the utility one, for three reasons:

1. **Different lookup shape.** `utility_to_css()` returns a *flat declaration string*
   (`tokens.rs:1316-1327`). `.btn` is not flat — it has `&:hover`, `&:disabled`, and possibly
   `@media`. A recipe must return a *rule subtree*, which means going through `parse_style` +
   `expand_apply`, not through `utility_to_css`.
2. **Different override rank.** Recipes must lose to utilities: `class="btn p-8"` has to give
   you `padding: 2rem`, not `.btn`'s padding. Separate channels make that an ordering fact
   rather than a specificity accident (§2.3).
3. **Different provenance.** A utility is generated from a token grammar; a recipe is authored
   CSS with a source file and an upstream daisyUI counterpart. Auditing "did we transcribe
   `.btn` faithfully" needs the recipes to be a reviewable, diffable set — not table rows.

### 2.2 Why *not* the other two homes

**Not "registry-only" (today's mechanism).** D1 says the port lands in
`packages/ui/registry/<name>/*.aihu`, and the shipped recipes prove that shape works
(`packages/ui/registry/button/button.aihu`, whose `@style` block already authors a full variant
matrix). But registry-only cannot satisfy D2: **`aihu add` needs no tree-shaking**, because you
already pay only for what you copy. If the port were registry-only, the ratified "tree-shake
the emission like Tailwind's JIT" requirement would be answering a question nobody asked. More
importantly, registry-only is not daisyUI — daisyUI's proposition is `class="btn btn-primary"`
on a bare `<button>` with no component at all. Porting it into 35 SFCs delivers shadcn's model
under daisyUI's name.

**Not a vendored compiled stylesheet.** The flip doc floats this as an open question (flip §8,
last block) and correctly kills it: it cannot cross a shadow boundary, so it is a light-only
convenience layer, and `$shadow: 'shadow'` stays supported. It also cannot be tree-shaken.

### 2.3 How the two homes compose — the load-bearing point

They are **not alternatives**. The recipe channel is the CSS; the registry recipe is the
component. D1 is satisfied *and* the CSS stops being duplicated 35 times:

```
aihu-css-core/recipes/btn.css        ← the transcribed daisyUI CSS. One copy. Tree-shaken.
        ↑ used by
packages/ui/registry/button/button.aihu   ← behavior + ARIA + props (D1's deliverable).
        ↑ used by                            Its template carries class="btn"; its @style
<button class="btn btn-primary">             block shrinks to what is genuinely component-
        ← plain markup, no component.        specific.
```

Both entry points go through the same scanner, so both are shaken identically.

**Emission order and layering.** Ordering must be explicit, because `.btn` and `.p-8` are both
(0,1,0) and source order would otherwise decide by accident of scan order:

```css
@layer aihu.reset, aihu.tokens, aihu.components, aihu.utilities;
```

`aihu.components` before `aihu.utilities` is what makes `class="btn p-8"` behave the way every
Tailwind user expects. **Note:** no `@layer` exists in the engine today —
`grep -rn '@layer' crates/aihu-css-core/src` returns nothing. The layer preamble is proposed by
flip §1.4 and is a **prerequisite of Slice 4**, not something Slice 4 can assume.

**Both modes.** In shadow mode the recipe rules are folded into the component's own sheet
(where `emit_sfc_scoped` already puts the utility channel — `emit.rs:305-310`), so they work
unchanged. This is exactly the dual-mode-coverage argument flip §8 identifies as the strongest
surviving reason for Option 4, and it is the reason the channel must be *in the engine* rather
than a static sheet.

---

## 3. Token-mapping mechanics

### 3.1 The rule: aihu names win, daisyUI names are renamed once

aihu's token names are a hard contract in three places:
`packs.ts:15` states it outright ("Token NAMES are the interchange contract"); `is_brand_token`
resolves `bg-primary` → `var(--color-primary)` at the utility level (`tokens.rs:550-552`,
`1316-1318`); and `AIHU_BRAND_TOKENS` (`theme.rs:176-193`) seeds the default registry. Renaming
them would break both shipped packs, all 11 registry recipes, and every consumer stylesheet.

So: **daisyUI theme variables are mapped onto aihu names by a transcription script, once, at
catalog-build time.** No alias layer.

**Alias layer explicitly rejected.** Emitting `--color-primary-content: var(--color-primary-foreground)`
would let a literally-copied daisyUI recipe work unmodified, but it doubles the token surface in
*every* emitted sheet — and `emit_host_tokens()` (`theme.rs:102-119`) emits **all** registered
tokens unconditionally, so the cost is paid per component, ×168 leaves post-flip. Two names for
one value is also a permanent teaching liability. The rename is a `Map` in one script.

### 3.2 The mapping table

daisyUI column is **assumed** — from daisyUI 5's documented theme-variable set. daisyUI is
**not vendored in this repo** (`grep -ril daisyui` over all `*.json`/`*.ts`/`*.rs` excluding
`node_modules` → zero hits), so this table **must be re-verified against a pinned upstream
release before Slice 3 lands**. The aihu column is measured (`theme.rs:176-193`, `packs.ts:33-67`).

| daisyUI variable | aihu token | Kind |
|---|---|---|
| `--color-primary` | `--color-primary` | identical |
| `--color-primary-content` | `--color-primary-foreground` | rename (`-content` → `-foreground`) |
| `--color-secondary` / `-content` | `--color-secondary` / `-foreground` | rename |
| `--color-accent` / `-content` | `--color-accent` / `-foreground` | rename |
| `--color-error` / `-content` | `--color-destructive` / `-foreground` | rename |
| `--color-base-100` | `--color-background` | rename |
| `--color-base-content` | `--color-foreground` | rename |
| `--color-base-200` | `--color-surface` | **lossy** — see §3.3 |
| `--color-base-300` | `--color-border` | **lossy** — see §3.3 |
| `--color-neutral` / `-content` | `--color-muted` / `-foreground` | **lossy** — see §3.3 |
| `--radius-selector` | `--radius-sm` | rename |
| `--radius-field` | `--radius-md` | rename |
| `--radius-box` | `--radius-lg` | rename |
| `--color-info` / `-content` | — | **NEW** |
| `--color-success` / `-content` | — | **NEW** |
| `--color-warning` / `-content` | — | **NEW** |
| `--size-selector`, `--size-field` | — | **NEW** (non-color scalars) |
| `--border`, `--depth`, `--noise` | — | **NEW** (non-color scalars) |
| — | `--color-ring` | aihu-only; no daisyUI source. Keep; transcription leaves it at the pack default. |

### 3.3 The three lossy mappings — stated, not hidden

- **`--color-neutral` → `--color-muted`.** daisyUI's `neutral` is a *filled dark surface* (the
  default `.btn` background). aihu's `muted` is a *de-emphasis* color for secondary text
  (`packs.ts:45` pairs it with `muted-foreground` at `#8a8880`). Using aihu `muted` as a button
  fill will look wrong. **Recommendation:** add `--color-neutral` / `--color-neutral-foreground`
  as genuinely new tokens rather than force the mapping. This adds to the escalation in §7.4.
- **`--color-base-200` → `--color-surface`.** Defensible, but note that in `aihu-default` today
  `--color-surface` and `--color-background` are the **same value** (`#faf8f4`, `packs.ts:41,43`),
  so the distinction is currently inert. Transcribed daisyUI themes *do* distinguish them, which
  will make surface/background divergence visible for the first time — a visual change to
  anything already using both.
- **`--color-base-300` → `--color-border`.** daisyUI uses `base-300` for both borders and a
  third surface step. Collapsing to `border` loses the surface use.

### 3.4 The additive-token slice

Adding `info`/`success`/`warning` (+ `-foreground`) and probably `neutral` (+ `-foreground`) to
the brand contract is a **four-touchpoint change**, each mechanically checkable:

1. `AIHU_BRAND_TOKENS` — `crates/aihu-css-core/src/theme.rs:176-193`
2. `is_brand_token` — `crates/aihu-css-core/src/tokens.rs` (so `bg-success` resolves)
3. both shipped packs — `src/packs.ts` `tokens` **and** `dark` (the interchangeability test at
   `tests/style-pack.test.ts:151-154` requires both packs to carry identical name sets)
4. `EXPECTED_BRAND_TOKENS` — `tests/style-pack.test.ts:29-46`

It must land **after** the token tree-shake (§5.2), or every emitted sheet grows by 8-10
unconditional custom properties. **It also requires founder sign-off (§7.4).**

---

## 4. `.dark`-class → `data-theme` migration

### 4.1 The distinction that makes this tractable

The reconciliation is routinely described as one thing. It is **two**, with different owners,
different risk, and different sequencing:

| | **Half A — token *values*** | **Half B — dark-variant *rules*** |
|---|---|---|
| Question it answers | Where do `--color-*` get their dark values? | When does `dark:bg-surface` apply? |
| Owner | `packages/css-engine/src/define-style-pack.ts` | `crates/aihu-css-core/src/emit.rs:189-200` + `apply.rs:180-193` |
| Today | `.dark { … }` | `:host([data-theme="dark"]) sel, :root.dark sel` |
| Risk | Additive; `.dark` keeps working | Rust + 3 insta snapshots + 2 assertions |
| Status | **LANDED (Slice 1)** | Slice 6 |

### 4.2 Half A — landed

`defineStylePack().toCss()` now emits the dark block under
`.dark, [data-theme="dark"]` (`define-style-pack.ts`, `DARK_SELECTOR`). One comma-list, one
block, no duplicated declarations. Every `.dark` consumer is untouched; `<html data-theme="dark">`
now resolves correct token values for the first time.

### 4.3 The half-state Slice 1 creates — say it out loud

With Half A but not Half B, a page that sets **only** `data-theme="dark"` on `<html>` gets:

- correct dark **token values** (Half A), so `bg-background`, `text-foreground`, and every
  `var(--color-*)` in an authored `@style` flip correctly; but
- **no `dark:`-variant utilities**, because `emit.rs:189-200` gates them on `:root.dark`
  (fails — no class) or `:host([data-theme="dark"])` (fails — the attribute is on `<html>`, not
  the component host).

**Why this is safe to ship anyway:** the half-state is **unreachable by any current consumer**.
Nothing in the repo sets `data-theme` on a document root. The only writer of `data-theme`
anywhere is the Storybook decorator (`apps/storybook/.storybook/preview.ts:62-63`), which stamps
it on *component hosts* — the exact selector `emit.rs` already handles. Every real consumer
(`apps/docs`, `apps/docs-next`, `examples/_shared`, storybook, cookbook) uses the `.dark` class.
So Slice 1 is a **partially-complete new capability**, not a regression of an existing one. That
distinction is the whole safety argument, and it stops being true the moment anyone ships a
`data-theme` root switcher — so Half B must land before Slice 7 (consumer migration), not after.

### 4.4 Half B — the Rust change

Add `[data-theme="dark"]` as a third branch, alongside the two that exist:

```rust
// emit.rs:189-200 — from two branches to three
:host([data-theme="dark"]) {sel},   // component host (Firefox workaround; keep)
[data-theme="dark"] {sel},          // NEW — document root or any ancestor, per D3
:root.dark {sel}                    // legacy class (keep through Slice 7, then drop)
```

Same change at `apply.rs:180-193` (`dark_cascade_node`).

**Cost, measured-adjacent:** the selector list goes from 2-wide to 3-wide per `dark:` utility.
`register_used_palette` shows the engine already cares about per-sheet bytes. Two mitigations,
either acceptable: (a) drop `:root.dark` at the end of Slice 7, returning to 2-wide; (b) post-flip,
`:host(…)` is dead in light mode and can be emitted conditionally (flip §6 already makes
`emit_host_tokens` mode-aware — the same mode flag serves here).

**Test churn, enumerated:** `crates/aihu-css-core/tests/apply.rs:141-142`,
`tests/emit.rs:92`, and three insta snapshots —
`snapshots/apply__dark_variant_cascade_in_apply.snap:7`,
`snapshots/scoped_snapshot__standard_variants.snap:26`,
`snapshots/scoped_snapshot__wc_native_variants.snap:25`.

### 4.5 Every consumer that breaks, and the order to fix them

No flag day is needed: dual-keying (Half A) plus the three-branch cascade (Half B) means both
conventions work simultaneously, so consumers migrate one at a time and `.dark` is removed last.

1. **`examples/_shared`** — `tokens.css:39` (`.dark {`), `example-shell.aihu:19,25,29`. Smallest,
   and has **no pre-paint script**, so it FOUCs today regardless; fix both together.
2. **`apps/storybook`** — `.storybook/preview.ts:48` (root class), `:62-63` (host stamping),
   `:108,110` (Chromatic modes). Migrating this first after examples gives visual coverage of
   everything downstream.
3. **`apps/docs-next`** — `index.html:19` (pre-paint), `src/styles/tokens.css:112` (`:root.dark`),
   `src/styles/base.css:87-94,321-322` (`html.dark`), `src/components/theme-toggle.aihu:10`.
   localStorage key is `dn-theme`.
4. **`apps/docs`** — the big one. `index.html:18` (pre-paint), `style.css` (**27** `.dark`
   selectors incl. the whole token block at `:140`), `src/components/theme-toggle.aihu:11,89-90`,
   `src/worker.ts:80` (llms.txt copy). localStorage key is `theme`.
5. **Cookbook + its four generated mirrors** — edit `cookbook/theme-toggle.aihu:23-24`, then
   regenerate `packages/mcp/src/cookbook-index.json`, `apps/docs-next/src/data/gallery.ts`,
   `apps/docs/playground/presets.generated.ts`, `llms-cookbook.txt`. **One edit, five files** —
   do not hand-patch the mirrors.
6. **Docs prose** — `guides/theming.md` (17 hits, the consumer contract page),
   `guides/utility-classes.md:269`, `guides/styling.md:88`, `api-reference.md:216`, `llms.txt:17`.
7. **Drop `:root.dark`** from `emit.rs`/`apply.rs` and `.dark` from `DARK_SELECTOR`. Last.

**Highest miss risk — the one that will not grep.** `apps/docs` contains **20 hand-written
`:host-context(.dark)` rules**: `src/components/docs-shell.aihu:213,290-306` and
`src/components/theme-toggle.aihu:89-90`. They match neither `.dark {` nor `classList`, and
they encode the exact pattern the engine deliberately refuses to emit because **Firefox does
not support `:host-context`** — meaning those rules are *already broken in Firefox today*.
Migrating to `[data-theme]` on `<html>` cascading into light-DOM leaves (post-flip) **fixes**
them. Call this out as a win, and add a lint forbidding `:host-context` in `.aihu` sources.

### 4.6 What Half A/B do *not* cover

`config-provider` (F1) writes `data-color-scheme` to its own host, read by nothing. D3's
`documentRoot` extension should make it write `data-theme` to the document root and delete the
false doc claim at `index.ts:14`. That is Slice 8, and it must also settle the `'auto'`/`'system'`
fork (F2).

---

## 5. Tree-shake / content-scan implementation

### 5.1 The correction: the utility channel is already JIT

D2 asks to "make css-engine's emission content-scanned/tree-shaken the way Tailwind's JIT is,"
which reads as though it is not. **For the utility channel it already is**, and has been since
the engine shipped. Measured, end to end:

```
scanner.rs:43   scan(ast)                → BTreeSet<String> of class tokens actually in the template
emit.rs:255-275 emit_with_progressive()  → emits a rule ONLY for scanned tokens
tokens.rs:520   register_used_palette()  → scans the assembled body for var(--color-X);
                                           registers only those ("not all 286" — emit.rs:346-348)
emit.rs:278-353 emit_sfc_scoped()        → assembles the above
```

There is no unshaken utility surface to remove. Restating the requirement accurately: **extend
the existing JIT to two channels that are not yet covered.**

### 5.2 Gap 1 — brand tokens are emitted unconditionally

`emit_host_tokens()` (`theme.rs:102-119`) iterates **every registered token** and emits it. With
`with_aihu_defaults()` seeding 16 brand tokens (`theme.rs:176-193`), every component sheet
carries all 16 whether it references one or none.

**Fix — generalize the function that already solves this.** `register_used_palette` already
scans the assembled body for `var(--color-X)`. Apply the same filter to the emitted token block:

```rust
// theme.rs — emit_host_tokens(&self)  →  emit_used_tokens(&self, body: &str, mode: Mode)
// Emit a token only if `body` contains `var(--<name>)`.
// `mode` picks `:host {` (shadow) vs `:root {` (light) — flip §6's bug fix, same function.
```

Both changes land in one edit because they touch the same three lines. This is also the
**prerequisite of §3.4**: without it, adding 8-10 daisyUI roles to the brand contract grows every
sheet unconditionally; with it, a component that uses none of them pays nothing.

Two tests currently assert the *unshaken, `:host`* behaviour and must be rewritten to assert the
correct selector and set per mode (flip §6 names both): `packages/css-engine/tests/sfc-e2e.test.ts:24`
(`expect(css).toContain(':host {')`) and `packages/compiler/tests/css-engine-hook.test.ts:136-137`.

### 5.3 Gap 2 — the recipe channel (once §2 exists)

**Zero scanner changes required.** Recipe class names arrive as ordinary tokens in
`ScanResult.utilities` — `scanner.rs` does not know or care what a token means. The only change
is at emission, in `emit_with_progressive`'s per-token loop (`emit.rs:255-275`):

```
for token in scanned:
    utility_to_css(token)  →  hit? emit into @layer aihu.utilities   (today)
    recipe_lookup(token)   →  hit? emit into @layer aihu.components  (NEW)
    neither                →  skip silently (today's behaviour, unchanged)
```

Tree-shaking is therefore **structural, not an added pass**: a recipe that no template mentions
is never looked up, so it is never emitted. Emitting recipes into `@layer aihu.components` (§2.3)
gives them the correct rank against utilities regardless of the order the loop happens to hit them.

**Recipe storage.** `crates/aihu-css-core/recipes/<family>.css`, authored CSS, `include_str!`'d.
A `build.rs` splits each file into per-class entries keyed on the top-level subject selector, so
using `btn` but not `btn-outline` emits only `.btn`. Per-class granularity, not per-family — this
is what keeps a 35-component catalog from being an all-or-nothing payload.

### 5.4 Three known holes in the scan — none blocking, all worth stating

1. **Component `class` attrs are skipped.** `scanner.rs:63-70` deliberately does not collect
   `class` on `MacroElement`/component nodes ("components own their own shadow scope"). So
   `<aihu-card class="card-bordered">` emits nothing for `card-bordered`. Correct pre-flip;
   **wrong post-flip and wrong for recipes**, since a recipe class on a component host is exactly
   how daisyUI modifiers are applied. Needs a decision in Slice 4.
2. **Dynamic class names.** `scanner.rs:137-154` extracts string literals from `class={expr}` and
   files bare identifiers under `unresolved`. `cn('btn', variant)` emits `.btn` but not
   `.btn-primary`. This is Tailwind's identical, well-understood limitation; the existing
   `unresolved` set already feeds `aihu css doctor` diagnostics. A safelist escape hatch should be
   added when the first recipe consumer hits it — not before.
3. **The preflight reset** (`emit.rs:300`) is one unconditional rule per sheet. Fine at one rule;
   flip §1.4 notes shipping its unqualified `*` selector into a consumer's global cascade is a
   separate live bleed-out bug. Out of scope here.

---

## 6. Recipe-transcription workflow

### 6.1 The workflow

1. **Pin upstream.** Vendor one daisyUI release's source CSS into `vendor/daisyui-<version>/`,
   committed and never edited. Everything downstream is diffable against it, and §3.2's table
   gets verified against it rather than against memory.
2. **Rename tokens** with the §3.2 map. Mechanical; scripted; the script is the map.
3. **Reduce declarations to `@apply` where a utility exists** — `display:inline-flex` →
   `inline-flex`. This is the step that makes the recipe read like aihu instead of like vendored
   CSS, and it is where a human is genuinely required. Anything with no utility equivalent stays
   a raw declaration; that is normal and correct (`button.aihu`'s variant matrix already does
   exactly this).
4. **Drop what aihu owns.** daisyUI's CSS-only interactivity hacks (checkbox-driven drawers,
   `<details>` dropdowns, radio-input tabs) are **not transcribed** — D4 gates those behind
   `@aihu/primitives` assemblies. Transcribe appearance only.
5. **Write the recipe file** to `crates/aihu-css-core/recipes/<family>.css`.
6. **Golden-file test** per family: input class set → emitted CSS, snapshotted. The crate already
   uses `insta` (`crates/aihu-css-core/tests/snapshots/`), so this is the house pattern.
7. **Thin the registry SFC** (D1): its template gains `class="btn"`, and its `@style` block keeps
   only genuinely component-specific rules.

### 6.2 Worked example — `.btn`, end to end

**Input** (daisyUI 5, paraphrased to its essential declarations — reproduced here for shape, to
be replaced by the pinned vendored source at step 1):

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 0.375rem; height: var(--size-field); padding-inline: 1rem;
  border-radius: var(--radius-field); border: var(--border) solid transparent;
  font-size: 0.875rem; font-weight: 600; text-align: center;
  background-color: var(--color-neutral); color: var(--color-neutral-content);
  transition: color .2s, background-color .2s, border-color .2s;
  user-select: none;
}
.btn:hover    { background-color: color-mix(in oklab, var(--color-neutral) 90%, black); }
.btn:disabled { pointer-events: none; opacity: .5; }
.btn-primary  { background-color: var(--color-primary); color: var(--color-primary-content); }
.btn-ghost    { background-color: transparent; border-color: transparent; }
.btn-sm       { height: 2rem;   padding-inline: .75rem; font-size: .75rem; }
.btn-lg       { height: 2.5rem; padding-inline: 2rem; }
```

**Output** — `crates/aihu-css-core/recipes/btn.css`, after steps 2-4:

```css
/* daisyUI `btn` — transcribed from vendor/daisyui-5.x/components/button.css.
   Tokens renamed per docs/plans/2026-07-26-option-4-daisyui-design.md §3.2.
   Interactivity is @aihu/primitives' AihuButton (D4); this is appearance only. */

.btn {
  @apply inline-flex items-center justify-center gap-1.5 px-4
         text-sm font-semibold text-center select-none transition-colors
         disabled:pointer-events-none disabled:opacity-50;
  height: var(--size-field);
  border-radius: var(--radius-md);              /* daisyUI --radius-field */
  border: var(--border) solid transparent;
  background-color: var(--color-neutral);        /* NEW token — §3.3, §7.4 */
  color: var(--color-neutral-foreground);        /* renamed from -content */

  &:hover { background-color: color-mix(in oklab, var(--color-neutral) 90%, black); }
}

.btn-primary { background-color: var(--color-primary); color: var(--color-primary-foreground); }
.btn-ghost   { background-color: transparent; border-color: transparent; }
.btn-sm      { @apply h-8  px-3 text-xs; }
.btn-lg      { @apply h-10 px-8; }
```

**What the existing machinery does with that, unchanged:**

- `parse_style` (`style_parser.rs`) builds the rule tree, including the nested `&:hover`.
- `expand_apply` (`apply.rs:37-47`) inlines the base utilities as declarations
  (`apply.rs:105-108`) and lifts `disabled:pointer-events-none` / `disabled:opacity-50` into a
  nested `&:disabled { … }` rule structurally (`apply.rs:111-147`) — **exactly the
  `@apply hover:bg-accent` → `.btn { & {…} &:hover {…} }` behaviour the brief identifies as the
  mechanism.**
- `register_used_palette` / `emit_used_tokens` (§5.2) then define only the `--color-*` this
  output actually references.

**Emitted for `class="btn btn-primary"`** (schematic — `.btn-ghost`, `.btn-sm`, `.btn-lg` are
never looked up, so they are absent; that is the tree-shake, and it is free):

```css
@layer aihu.components {
  .btn { display: inline-flex; align-items: center; justify-content: center;
         gap: .375rem; padding-inline: 1rem; font-size: .875rem; font-weight: 600;
         text-align: center; user-select: none; transition-property: color, background-color, …;
         height: var(--size-field); border-radius: var(--radius-md);
         border: var(--border) solid transparent;
         background-color: var(--color-neutral); color: var(--color-neutral-foreground);
         &:disabled { pointer-events: none; opacity: .5; }
         &:hover    { background-color: color-mix(in oklab, var(--color-neutral) 90%, black); } }
  .btn-primary { background-color: var(--color-primary); color: var(--color-primary-foreground); }
}
```

**Step 7 — the registry SFC.** `packages/ui/registry/button/button.aihu` today authors a full
5-variant × 4-size matrix in its own `@style` (roughly 60 lines of CSS). Post-transcription its
template becomes `class={cn('btn', variantClass(variant), sizeClass(size))}` and the `@style`
block drops to whatever is genuinely aihu-specific. **This is the payoff of §2.3**: D1's port
adds components, not 35 copies of the same CSS.

### 6.3 Known limitation of v1: `@apply btn` is not supported

`expand_rule` calls `utility_to_css(&base)` and hard-errors via
`CompileError::UnknownApplyUtility` on a miss (`apply.rs:101-103`). Wiring recipes in there is
strictly harder than wiring them into emission, because a recipe expands to a *rule subtree*
while `@apply` currently splices a *declaration list* (`apply.rs:154-158`). **Slice 4 should
therefore make `@apply btn` a targeted error** — "`btn` is a recipe, not a utility; use
`class=\"btn\"`" — rather than half-implement it. Lift the restriction in a later slice if
demand appears.

---

## 7. Interaction with `.tastemaker/style-lock.md`

### 7.1 The tension, stated fairly

`style-lock.md:3` — "**LOCKED.** This is a contract, not a suggestion." `:14` — "Terracotta is
the **only** brand hue… **No second brand color. Ever.**" A 35-theme swappable catalog with
`cupcake` and `dracula` in it is, on its face, the negation of that.

### 7.2 Resolution: the two govern different surfaces

`style-lock.md:3` scopes itself: "every aihu UI (docs-next, examples, playground, any future
surface)." That is **aihu's own first-party product surfaces**. The daisyUI catalog is a
**capability aihu ships to its users' applications**. A framework shipping a theme catalog is not
the framework adopting those themes — the same way shipping `<input type=color>` is not a
statement about brand color.

This is not merely an assertion; it is **mechanically enforceable**:

1. **The catalog never touches `:root`.** By construction, a named theme emits
   `[data-theme="<name>"]` and nothing else (§9). The default remains whatever `tokens` says.
2. **`aihu-default` gains zero named themes.** The catalog ships as a *separate* pack
   (`aihu-daisy`), opt-in. **Slice 1 pins this with a test** — `tests/style-pack.test.ts`,
   "neither shipped pack declares named themes yet" — so a future catalog landing on
   `aihu-default` is a red build, not a silent drift.
3. **First-party surfaces may not select a catalog theme.** `apps/docs`, `apps/docs-next`,
   `examples/**` must never set `data-theme` to anything but `dark`. Add a CI grep in Slice 7,
   when those files are being touched anyway.

Under those three, style-lock stays literally true of every surface it claims, and the catalog is
inert unless a consumer opts in.

### 7.3 The genuine collision, flagged not resolved

style-lock names **a different token vocabulary** than css-engine: `--fg`, `--bg`, `--surface`,
`--accent`, `--graphite`, `--border`, `--muted` (`style-lock.md:17-25`, realized in
`apps/docs-next/src/styles/tokens.css`), versus css-engine's `--color-foreground`,
`--color-background`, `--color-surface`, `--color-accent`, … (`theme.rs:176-193`). There is no
`--graphite` in the engine and no `--color-ring` in style-lock.

**This divergence predates daisyUI and is not created by this design** — `apps/docs-next` is
already styled outside the engine's token contract. It is flagged here because §4.5 step 3
touches those exact files, which is the natural moment to reconcile them. **Do not fold that
reconciliation into a daisyUI slice**; it is its own decision with its own founder review.

### 7.4 Escalations — founder sign-off required before Slice 3

Two, both real, neither resolvable at this layer:

> **E1 — adding `info` / `success` / `warning` to the brand contract adds three hues to a
> declared single-accent identity.** §3.4 needs them because daisyUI recipes reference them
> pervasively (`alert`, `badge`, `toast`, form validation). style-lock:14 says "No second brand
> color. Ever." These are *semantic status* colors, not brand colors, and every design system
> including aihu's own already has one (`--color-destructive`, `packs.ts:49` — a red that is not
> terracotta, already shipped, already an exception). **The precedent exists; the ruling should
> be explicit anyway,** because the count goes from one exception to four and because style-lock
> requires every new pairing to be contrast-checked and added to its table before shipping
> (`style-lock.md:44-46`).

> **E2 — `--color-neutral` should be added rather than mapped to `--color-muted`.** §3.3 shows
> the mapping is semantically wrong (a filled surface vs. a de-emphasis text color) and will
> produce visibly bad buttons. Adding it is the right call technically, but `neutral` overlaps
> conceptually with style-lock's `--graphite` ("AI/governance axis," `style-lock.md:27-29`), and
> conflating those two would quietly repurpose a brand semantic. **Ask before naming it.**

Neither escalation blocks Slices 1, 2, or 4 (the recipe channel can land with three recipes that
use only existing tokens). Both block Slice 3 and everything after it.

---

## 8. Sequencing

| # | Slice | Depends on | Notes |
|---|---|---|---|
| **1** | **Named-theme dimension + dual-keyed dark in `defineStylePack`** | — | **LANDED** with this doc (§9). |
| 2 | Token tree-shake — `emit_host_tokens` → `emit_used_tokens(body, mode)`; folds in flip §6's `:host`/`:root` bug fix | — | Same three lines serve both. Rewrites `sfc-e2e.test.ts:24`, `css-engine-hook.test.ts:136-137`. Prerequisite of 3. |
| 3 | Token-contract extension (`info`/`success`/`warning`/`neutral` + foregrounds) | 2, **E1 + E2** | Four touchpoints (§3.4). |
| 4 | **Recipe channel** — `@layer` preamble, `recipes/*.css`, `build.rs` splitter, emission branch, golden tests. Ships 3 recipes (`btn`, `card`, `badge`) as proof | 2; `--shadow` defect | The load-bearing slice. Decide the `MacroElement` scan hole (§5.4·1). |
| 5 | Catalog transcription script → `aihu-daisy` pack with `themes:` entries | 1, 3, 4; FEL-424 | FEL-424 is hard: there is no pack-selection surface at all (§1.4). |
| 6 | Half B — `[data-theme="dark"]` third branch in `emit.rs`/`apply.rs` | — | Must precede 7. 3 snapshots + 2 assertions (§4.4). |
| 7 | Consumer migration, in the §4.5 order; drop `:root.dark` and `.dark` at the end | 6 | Add the `:host-context` lint and the first-party `data-theme` CI grep (§7.2·3). |
| 8 | `useColorScheme` persistence (`@aihu/use`) + `AihuConfigProvider` `documentRoot` (`@aihu/primitives`) | 6 | Fixes F1; must settle F2's `'auto'`/`'system'` fork. |
| 9 | Registry recipe port, per component | 4, 5; D4 gate | Open-ended. drawer/dropdown/tabs/accordion stay gated behind their primitives, per D4 — and that gate is **per-component, not a batch** (2026-07-23 §5 step 6). |

Slices 2, 4, and 6 are independent of each other and can run in parallel.

---

## 9. Slice 1 — what landed with this document

**Chosen because** it is the only piece that is self-contained (one file, no Rust, no compiler,
no consumer), unblocks a ratified decision that is otherwise unrepresentable (G2 — there was no
way to express a third theme at all), advances D3 without a flag day, and cannot regress anything
(§4.3). It is deliberately *not* the recipe channel: that is Slice 4, it depends on the `@layer`
preamble and on the `--shadow` defect being fixed, and it is too large to be a first step.

**`packages/css-engine/src/define-style-pack.ts`**

- `StylePackInput.themes?: Record<string, TokenMap>` — the named-theme dimension. Each entry
  emits `[data-theme="<name>"] { … }`, and is an **override layer over `tokens`**, exactly as
  `dark` already is (only differing names need listing).
- `StylePack.themes` / `StylePack.themeNames` on the descriptor.
- Exported `DARK_SELECTOR = '.dark, [data-theme="dark"]'` — the dual key (Half A, §4.2).
- Emission order is `:root` → dark → named themes, **and that order is load-bearing**: all three
  weigh (0,1,0), so `<html class="dark" data-theme="cupcake">` must resolve to cupcake. Pinned by
  an explicit ordering test.
- Validation: `'dark'` is rejected as a named theme (it would emit a second, colliding
  `[data-theme="dark"]`); names must match `/^[a-z][a-z0-9-]*$/` (they become attribute
  selectors); a theme with no tokens is rejected; input maps are copied.

**A constraint discovered while landing it, worth recording.** The generated `styles/*.css`
bundles are byte-parity tested against `toCss()` (`tests/style-pack.test.ts:120-127`) **and** are
biome-checked by the pre-commit hook — and biome's CSS formatter breaks a comma-separated
selector list onto one selector per line. The first version of this slice emitted
`.dark, [data-theme="dark"] {` on one line; the hook silently reformatted the generated files
*after* staging, which would have made the parity test fail on the following commit rather than
here. `toCss()` now emits biome's canonical form (`formatSelectorList`, exported), making the
formatter a no-op over generated output, and a test pins it. **Anything that later emits a
multi-selector rule into a generated bundle inherits this constraint** — notably Slice 6, whose
three-branch dark cascade is a comma list.

**Also touched:** `src/index.ts` (export `DARK_SELECTOR`); `styles/aihu-default.css` +
`styles/aihu-graphite.css` regenerated via `bun run gen:style-packs` (**one line each** — the
`.dark {` selector); `tests/define-style-pack.test.ts` and `tests/style-pack.test.ts` updated for
the dual key and extended with 11 new assertions.

**Not touched:** no Rust, no compiler, no consumer app, no `.size-limit.json` row —
`@aihu/css-engine`'s only rows are `runtime/cn` and `runtime/progressive`
(`.size-limit.json:113-123`); `packs`/`define-style-pack` are build-time and unrationed.

**Neither shipped pack declares a named theme.** The catalog is Slice 5, and a test now pins
that (§7.2·2).
