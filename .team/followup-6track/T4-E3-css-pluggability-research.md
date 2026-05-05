# T4-E3 — CSS Pluggability Research

**Track:** T4-E3 (Researcher+Builder, follow-up 6-track session)
**Branch:** `t4e/examples-css` (base `origin/main` @ `7665c2e`)
**Date:** 2026-05-03
**Author:** Researcher+Builder (Track T4-E3)

---

## 0. Question

How does a developer plug a CSS framework — Tailwind, UnoCSS, Pico, vanilla CSS Modules — into a aihu SFC? aihu ships with `@style { ... }` (scoped via Constructable Stylesheets in shadow DOM by default) and `@style { $global { ... } }` (scoped to `document.adoptedStyleSheets`). The current docs do not cover framework integration. The example proposed in T4-D omitted CSS entirely.

This document picks **one** integration to ship as a worked example and explains how to swap to the alternatives.

---

## 1. Existing aihu surface

What aihu ships (relevant to CSS), as of `origin/main` @ `7665c2e`:

- **`@style { ... }`** — block in `.aihu` SFC. Compiler emits `const __style__ = new CSSStyleSheet(); __style__.replaceSync(\`...\`)` plus `(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__]` in the setup function. Default: **scoped to component shadow root**. Source: `packages/compiler/src/codegen/emit.rs::emit_style_block`, conformance test `packages/compiler/tests/sfc_conformance.rs::v033_style_at_form_no_global_emits_scoped`.
- **`@style { $global { ... } }`** — flips emission to `document.adoptedStyleSheets = [...document.adoptedStyleSheets, __style__]`. Global scope, no component scoping. Conformance test: `v033_style_at_form_global_keyword_emits_document_style`.
- **Light DOM opt-out** — runtime supports `defineElement(name, Ctor, { shadowMode: 'none' })` (`packages/runtime/src/define-element.ts`). With `'none'`, no shadow root is attached and `mount()` runs against the element itself.
- **Capability gap (small):** the `.aihu` SFC source has **no syntax to declare `shadowMode: 'none'`**. The compiler always emits `defineElement(tag, defineComponent(...))` with no options object. To opt into light DOM today, you'd hand-author the component or post-process the compiled JS.

The capability gap is the load-bearing finding for this track — Tailwind/UnoCSS utility classes only apply to elements they can reach through the CSS cascade; shadow roots block global stylesheets.

---

## 2. Framework-by-framework analysis

### 2.1 Tailwind CSS

Tailwind generates utility classes (`text-xl`, `bg-blue-500`, etc.) at build time by scanning template files for class names. Tailwind 4 ships a Vite plugin and a CLI; v3 is widely deployed via PostCSS.

| Approach | Mechanics | Verdict |
|---|---|---|
| **A. Compile Tailwind output, inline into `@style { }`** | Author writes `@style { @tailwind utilities; ... }`, the compiler treats it as raw CSS. The generated stylesheet is per-component, scoped to shadow DOM. | **Rejected.** The compiler does not understand Tailwind's `@apply` / `@tailwind` directives, and there is no plugin hook today that runs PostCSS over `@style` content (Plugin Contract `transformBlock` is reserved but not implemented yet). Even with PostCSS, the generated stylesheet would be duplicated per component (storage + parse cost). |
| **B. Light-DOM custom element + global Tailwind sheet** | Pre-compile Tailwind utilities to `tailwind.css`. Mount the link in `<head>`. Components opt into light DOM (`shadowMode: 'none'`). Utility classes apply through the normal cascade. | **Picked.** Single Tailwind output for the whole app, classes work natively on every component, no compiler changes required to support `@apply`, no PostCSS-in-compiler plumbing. Trade-off: components lose shadow-DOM style isolation (utility classes will leak between components — but that's the contract you opt into when you pick a global utility framework). |
| **C. `<style global>` block per component with Tailwind directives** | Each `.aihu` writes `@style { $global { @tailwind utilities; } }`. | **Rejected.** Worse than A: every component re-emits the entire utility set globally, duplicate-stylesheet cost. Plus same `@apply` issue. |
| **D. Plugin-Contract integration** | A `@aihu/plugin-tailwind` would register a `transformBlock` hook that runs Tailwind's PostCSS pipeline on `@style` content during compile. | **Future-direction.** The Plugin Contract (`docs/superpowers/specs/2026-05-02-spec-plugin-contract.md` §4.1) declares the hook but lowering passthrough for arbitrary CSS is not implemented yet. This is the eventual best path; ship-able after the plugin lowering pipeline is wired. Documented in the README as the future direction. |

**Capability requirement for option B:** SFC syntax to declare `shadowMode: 'none'`. We add this as a small compiler addition (≤ 50 LOC) — a `@element { shadow: 'none' }` declaration block (or a CLI-flag fallback for the example).

### 2.2 UnoCSS

UnoCSS is to Tailwind what Vite is to webpack — same general shape, atomic class generation, but on-demand and with first-class build-tool integration. Like Tailwind, options A–D apply, with UnoCSS shining brightest at option D because UnoCSS's runtime mode (`@unocss/runtime`) generates utilities on the fly by observing the DOM, which is exactly the integration shape that suits a custom-element framework.

**Selection for swap-doc:** Recommend UnoCSS via `@unocss/vite` + `presetUno`, configured to scan `.aihu` files. Same light-DOM requirement as Tailwind. The README's "swap to UnoCSS" section gives the 5-line config diff.

### 2.3 Pico CSS / classless frameworks

Pico CSS styles raw HTML elements (`button`, `h1`, `nav`) without utility classes. Two approaches:

| Approach | Mechanics | Verdict |
|---|---|---|
| **Light DOM + Pico `<link>`** | Drop Pico's CSS file in `<head>`, components in light DOM inherit Pico's styling automatically. | **Easiest swap.** Zero compiler changes, zero per-component config. |
| **Shadow DOM + per-component `@style { @import 'pico.css'; }`** | Each component imports Pico into its own shadow root. | Works but expensive — Pico is ~10 KB and gets re-applied per component. Avoid. |

Pico is the **lowest-friction** integration aihu can advertise. If a developer just wants "make this look pretty," `<link>` + light-DOM components is one line of HTML. The README documents this as the recommended starting point for non-utility-class users.

### 2.4 Vanilla / CSS Modules / native

The baseline. `@style { ... }` per component, scoped to shadow DOM, no framework. Nothing to integrate. CSS Modules are Vite-level; they apply to imported `.css` / `.module.css` files in `@state` blocks if a developer chooses to import a stylesheet that way (instead of writing `@style`). The compiler doesn't impede this — CSS Modules end up as imported strings just like any other module.

This is what aihu ships out-of-box; the example documents it as the "no framework" path.

---

## 3. Decision

**Ship Tailwind via light-DOM (option 2.1.B) as the primary worked example.** Reasons:

1. Tailwind is the most-used CSS framework in the JS ecosystem (>11M weekly downloads on v3).
2. The integration exercises the most surface area: a build-time CSS pipeline (Tailwind CLI), the runtime shadow-mode option, and a global-stylesheet pattern. UnoCSS, Pico, and vanilla all simplify from this baseline.
3. The Tailwind config + light-DOM pattern translates directly to UnoCSS by swapping the build tool and to Pico by replacing the generated CSS with a CDN `<link>`.

**Document UnoCSS, Pico, and vanilla as alternatives in the README.**

---

## 4. Capability addition (small, user-authorized)

To ship the worked example with `.aihu` SFCs (per directive: "use v1 `@blockname { }` form"), the compiler needs a way for the SFC to declare `shadowMode: 'none'`. Today the compiler emits `defineElement(tag, defineComponent(...))` with no options.

**Smallest viable change:** the `scribeCompilerPlugin` accepts an `options.shadowMode` setting (`'open' | 'closed' | 'none'`). When set, the plugin post-processes the compiled JS to inject `, { shadowMode: 'X' }` as the third arg to `defineElement(...)`. Project-wide setting in `vite.config.ts`. Per-component override deferred to v1.x (tracked as future work — would require a new `@element { shadow: 'none' }` SFC block, post-v1 feature).

**Size impact:** ~15 LOC in `packages/compiler/js/index.ts`, no Rust changes. Test: 1 unit test in `packages/compiler/tests/`. No runtime size change.

**Why not a new `.aihu` block:** would require Rust parser changes, conformance-suite updates, and grammar surface area additions. The plugin-option approach is reversible and additive.

---

## 5. Example structure

```
examples/css-pluggability/
├── src/
│   ├── components/
│   │   ├── Card.aihu        # Tailwind-styled card
│   │   └── Button.aihu      # Tailwind-styled button (variants via attrs)
│   ├── styles/
│   │   └── tailwind.css       # Tailwind input file
│   └── main.ts                # Bootstraps both components
├── tailwind.config.ts         # Content scan paths include .aihu
├── package.json               # Tailwind CLI as devDep
├── build.ts                   # Bun script: compile .aihu + run tailwindcss CLI
├── server.ts                  # Bun.serve to view output
├── index.html
└── README.md                  # Cover Tailwind, UnoCSS swap, Pico swap, vanilla swap, trade-offs
```

The build skips Vite (the compiler's Vite path has a known Bun-specific limitation, see `packages/compiler/js/index.ts` JSDoc on `scribeCompilerPlugin`). Instead `build.ts` calls `transform()` from `@aihu/compiler` directly and `bunx @tailwindcss/cli` for the CSS. This is the same pattern as the existing `tests/manual-demo/` fixture and works under Bun without the Vite/Rollup4 ESM bridge issue.

---

## 6. Trade-offs surfaced in the README

The README will explicitly note:

- **Shadow DOM scoping is given up** when using global utility frameworks (Tailwind, UnoCSS). Component CSS leaks. This is the deal you sign for utility-class frameworks. If isolation matters more than utility classes, stay in shadow DOM with vanilla `@style { }`.
- **Tailwind-style `@apply` is unavailable inside `@style { }` blocks** until the Plugin Contract `transformBlock` lowering pipeline is implemented. Today, write utility classes on elements directly; reach for `@apply` only via the global stylesheet.
- **Build cost.** Tailwind/UnoCSS adds a compile step. Pico and vanilla don't.
- **Runtime cost.** Light-DOM components are slightly cheaper at attach time (no shadow root) but lose CSS encapsulation. Net: rarely measurable for either direction.

---

## 7. Out-of-scope (deferred)

- A `@aihu/plugin-tailwind` package that runs Tailwind through `transformBlock` (waits on plugin lowering pipeline implementation).
- A `@element { shadow: 'none' }` SFC block (requires Rust parser changes; post-v1).
- CSS Modules first-class support inside `@style` (Vite-level, not aihu's concern).
- Container queries / view-transitions integration — not specific to framework pluggability, deferred.
- Build-time critical-CSS extraction.

---

## 8. References

- `docs/superpowers/specs/2026-05-02-spec-block-structure.md` — `@style` block syntax, plugin block contributions
- `docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` § 4 — `@style` macros (`$reactive`, `$tokens`, `$global`, `$media`, `$when`)
- `docs/superpowers/specs/2026-05-02-spec-plugin-contract.md` § 4 — lifecycle hooks (`transformBlock` for future Tailwind-aware plugin)
- `packages/compiler/src/codegen/emit.rs` — `emit_style_block` (current scoped/global emission)
- `packages/runtime/src/define-element.ts` — `shadowMode: 'open' | 'closed' | 'none'` runtime support
- `packages/compiler/js/index.ts` — Vite plugin (the post-process site for the capability addition)
- `tests/manual-demo/` — pattern for a self-contained Bun-served demo without Vite

---

## 9. Status

- Research: COMPLETE.
- Capability addition: 1 file (`packages/compiler/js/index.ts`), ~15 LOC, 1 new test.
- Example: 7 source files + README.
