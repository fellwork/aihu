# @scribe/assets — Package Family Design Stub (v1.5)

**Date:** 2026-05-02
**Author:** Architect (Round 2)
**Status:** STUB — full design session deferred (Director Decision 7)
**Companion to:** `roadmap-draft.md` §v1.5

---

## Why three packages, not one

Per Director Decision 3, the asset pipeline splits into `@scribe/image` + `@scribe/fonts` + `@scribe/css-pipeline` rather than landing as a monolithic `@scribe/assets`. The concerns are genuinely separable:

- **Lifecycle differs.** Image processing is per-asset (one Sharp pipeline per file). Font subsetting is per-corpus (one pass over `*.woff2` + glyph manifest). CSS pipeline orchestrates PostCSS/Tailwind across the whole project. Bundling them forces a single rebuild scheduler that's wrong for at least two of the three.
- **Build-time deps differ.** Sharp (image), fontkit/Subset-CLI (fonts), PostCSS + Tailwind (CSS) — three independent build-time toolchains. Combining them forces one package to peer-dep all three even if a consumer only needs one.
- **Size-budget gating differs.** Image and fonts emit zero runtime code (just bytes + CSS). CSS pipeline emits zero runtime code (just CSS). The image package has a small runtime component (`<scribe-image>`) that gets its own `.size-limit.json` row. Three packages = three independent gates.
- **Roll-forward independence.** A breaking change in `@scribe/image` shouldn't force a `@scribe/fonts` major bump. Splitting lets each package evolve on its own SemVer cadence.

---

## @scribe/image

### Goal
Build-time image optimisation pipeline + runtime `<scribe-image>` SFC component for responsive image rendering.

### Build-time pipeline
- **Dep:** Sharp (build-time only — never enters the runtime call graph).
- **Trigger:** `<scribe-image src="./hero.png" alt="..." />` in any `.scribe` SFC; compiler scans for these and emits a build manifest.
- **Output:** Multiple resolutions (`hero@1x.webp`, `hero@2x.webp`, `hero@1x.avif`, `hero@2x.avif`), an `<img srcset="...">` snippet baked into the SFC's emitted JS, and a `BlurHash`/LQIP placeholder.
- **Format negotiation:** `<picture>` with `<source type="image/avif">` / `<source type="image/webp">` / `<img>` fallback.

### Runtime component
- `<scribe-image>` is a defineComponent built on `@scribe/runtime` + `@scribe/arbor`. Renders the compiler-generated `<picture>` markup.
- **Responsibilities:** lazy-load via IntersectionObserver (reuses `_hydrateOnVisible` pattern from `@scribe/runtime`); placeholder swap on load; layout-shift prevention via aspect-ratio CSS.
- **Size budget target:** ≤ 200 B gz.

### Runtime dep envelope (Learning #49)
- **Runtime imports:** `@scribe/runtime`, `@scribe/arbor`. **No Sharp at runtime.**
- **Build-time imports:** Sharp (orchestrated by the compiler/Vite plugin).

### Pattern
> Compiler scans `.scribe` SFCs for `<scribe-image>` references → emits a manifest → Vite plugin (or compiler-direct in v3) drives Sharp at build → emits optimised assets to `dist/_scribe/img/` → consumer ships `dist/`. Runtime is "pre-optimised bytes are served; component just renders the right `<picture>` element."

---

## @scribe/fonts

### Goal
Build-time font subsetting + preload directive emission + `@font-face` codegen.

### Build-time pipeline
- **Dep:** fontkit / subset-cli (build-time only).
- **Trigger:** `<scribe-font src="./Inter.woff2" weights="[400, 600]" subsets="['latin']" />` declaration in any SFC, OR a top-level `scribe.config.fonts` entry.
- **Output:** Subsetted `.woff2` files (only declared weights/subsets), generated `@font-face` CSS injected into the global stylesheet via `@scribe/css-pipeline`, `<link rel="preload" as="font">` directives in the `<head>`.

### Runtime
- **Zero runtime code.** Output is pure CSS + preload links emitted at SSR time by `@scribe/server`.
- The component (if any) is a compiler-emitted snippet that injects preload links via `@scribe/server`'s `head` API; no userland component.

### Runtime dep envelope (Learning #49)
- **Runtime imports:** none.
- **Build-time imports:** fontkit (orchestrated by compiler).

### Pattern
> "Fonts are bytes + CSS." The package is build-time tooling, not a runtime artefact.

---

## @scribe/css-pipeline

### Goal
PostCSS / Tailwind orchestration via the compiler. Critical CSS extraction at SSR time.

### Build-time pipeline
- **Dep:** PostCSS + plugins (autoprefixer, tailwindcss, lightningcss, etc.) — all build-time only.
- **Compiler integration:** Vite plugin (and v3 compiler-direct path) calls into the CSS pipeline before emitting the final SFC JS. `<style>` blocks (scoped + global) are processed through PostCSS before being passed to `CSSStyleSheet.replaceSync` (per existing `emit_style_block` in `packages/compiler/src/codegen/emit.rs`).
- **Tailwind:** Tailwind config is honored at build-time; the JIT compiler emits only the classes referenced in template strings + `<style>` blocks. Output is flat CSS — no Tailwind runtime ships.

### Critical CSS extraction
- **At SSR time:** `@scribe/server`'s `renderToStream` walks the route tree, collects `adoptedStyleSheets` from each rendered SFC, and emits a single `<style>` block in the document `<head>`. Non-critical (route-specific) CSS is loaded lazily via `<link rel="stylesheet">` deferred until idle.
- **Build-time component:** the css-pipeline package emits a manifest mapping route → CSS chunks; SSR consumes it.

### Package vs compiler-internal
- **Open question (deferred to design session):** does `@scribe/css-pipeline` ship as a separately published package, or is it compiler-internal (the compiler's CSS phase)?
- **Architect-leaning:** compiler-internal. Reduces published-package count; CSS pipeline is intrinsically tied to the compiler's emission step. A separate package only makes sense if consumers want to override/extend the pipeline (which is rare).

### Runtime dep envelope (Learning #49)
- **Runtime imports:** **none**. Output is pure CSS.
- **Build-time imports:** PostCSS + plugins (compiler-orchestrated).

---

## v3 dep-free compliance summary

| Package | Build-time deps (allowed) | Runtime deps (must be `@scribe/*` only) |
|---|---|---|
| `@scribe/image` | Sharp | `@scribe/runtime`, `@scribe/arbor` |
| `@scribe/fonts` | fontkit | none |
| `@scribe/css-pipeline` | PostCSS, Tailwind, lightningcss | none (or compiler-internal — TBD) |

**No package introduces any non-`@scribe/*` runtime dep.** Per Learning #49, build-time deps are unrestricted (Sharp, fontkit, PostCSS are all fine); the contract is that production runtime imports are `@scribe/*` only. All three packages PASS.

---

## Open design questions (for the future session)

1. **Should `@scribe/css-pipeline` be a separately published package or compiler-internal?** Architect-leaning: compiler-internal. Final call: future design session.

2. **What's the cache layer for the build-time image pipeline?** Per-content-hash directory (`dist/_scribe/img/<hash>.webp`) or a manifest-driven scheme? Sharp re-runs are expensive; cache invalidation strategy is load-bearing for dev-loop ergonomics.

3. **Does `<scribe-image>` need a `priority` / `fetchpriority` API?** Nuxt and Next both surface this; we either match or skip and document the workaround (`<scribe-image fetchpriority="high">` passthrough).

4. **Critical CSS thresholds:** what's the cutoff between "inline in `<head>`" and "lazy-load via `<link>`"? Nuxt uses ~14 KB (initial TCP congestion window). Configurable via `scribe.config.css.inlineThreshold`?

5. **Tailwind integration depth:** does scribe ship a Tailwind preset (`@scribe/tailwind-preset`) with sane defaults for the `.scribe` SFC convention, or do we leave config entirely to the consumer?

6. **Font display strategy default:** `font-display: swap` vs `optional` vs `fallback`. We pick a default; surface the choice in the design session.

---

## Out of scope for this stub (per Director Decision 7)

- **Detailed API surface for any of the three packages** — design session.
- **Specific Sharp pipeline knobs** (quality presets, format priority, blur radius) — design session.
- **Tailwind preset content** — design session.
- **Migration path from existing Vite asset handling** — design session.

---

**Token spend (Architect, this stub):** ~3 K.
