# aihu.dev Docs Dogfooding Overhaul — Dispatch-Ready Migration Plan

**Date:** 2026-05-29
**Author:** Architect (synthesis of 5 per-workstream investigation briefs)
**Status:** Ready for dispatch (pending the 3 gating decisions in "Open Decisions")

---

## Context & Why Now

`apps/docs` (aihu.dev) is the project's public showcase, yet it does **not dogfood
the framework's own shipped primitives** and it does **not pass the Lighthouse perf
gate reliably**. The gate (`scripts/lighthouse.ts` on `origin/main`) asserts
performance/a11y/best-practices/SEO ≥ 95 and LCP ≤ 2500 ms / CLS ≤ 0.1 against
`/docs/introduction`. It is flaky at the 95 / 2500 ms threshold, and a *best-of-3
retry stopgap* is being landed separately just to keep CI green. That stopgap masks
a real architectural problem rather than fixing it.

This overhaul fixes the perf problem at the root **and** makes the docs site actually
use aihu's own toolchain (kindly-note for markdown/highlighting, self-hosted fonts,
css-engine where it fits, build-time prerender), so the showcase is honest.

### The Perf Diagnosis It Fixes

The root cause is a **client-render-after-big-JS** critical path:

1. `apps/docs/build.ts` pre-renders every `docs/site/*.md` page to HTML with `marked`
   and writes them into a **214 KB / 4924-line committed blob**
   (`apps/docs/src/content.ts`, verified `wc -c` = 214,693 bytes) as a
   `window.__DOCS__ = { id: { title, html } }` map.
2. `src/main.ts` `import`s that blob, so **rolldown bundles all 214 KB of inline HTML
   into `dist/docs.js`** (the 339 KB client bundle).
3. The served HTML (`index.html`) contains **no per-page content** — only a hard-coded
   `<section id="static-intro">` introduction fallback. (The `worker.ts:9` comment
   claiming `window.__DOCS__` is "inlined by build.ts" into `index.html` is
   **inaccurate** — verified; `index.html` has no `__DOCS__` reference.)
4. LCP-critical doc body therefore does **not** appear until: docs.js downloads →
   parses → executes → the `docs-shell` custom element upgrades → `{@html activeHtml()}`
   reads `window.__DOCS__`. That is the flaky-LCP path.
5. Two **render-blocking third-party requests** further cap LCP: Google Fonts CSS
   (`index.html:9-12` + a duplicate `@import` at `style.css:7`) and highlight.js
   CSS + JS from cdnjs (`index.html:14,267`).

The fix is to (a) put real per-page content in the served HTML (WS1 prerender), (b)
bake highlighting at build time so cdnjs hljs can be deleted (WS2 kindly-note), (c)
self-host fonts so the Google Fonts blocker is removed (WS3), and (d) once content is
in the HTML, **delete the 214 KB `content.ts` blob from the client bundle** and
re-baseline budgets + retire the stopgap (WS5). WS4 (playground clipping) is an
independent UX bug fixed in parallel.

---

## Workstreams

### WS1 — Build-time prerender (the big structural one)
**Branch:** `feat/docs-overhaul/prerender`

**Current state.** `apps/docs` is a hand-rolled, client-rendered SPA. It does **not**
use `@aihu/app`'s Vite prerender pipeline (no `pages/` dir, no Vite, no `@aihu/app`
dep). `aihu.config.ts` (adapter cloudflare, `rendering.mode:'ssr'`, `hydratable:true`)
is **dead config** — the real build is `build.ts` + rolldown. Routing is hash-based:
every doc page is the same URL `/` with a different `#hash`; `docs-shell.aihu` seeds
`activePage` from `location.hash.slice(1)` and swaps `window.__DOCS__[id].html` into
its **shadow-DOM** `<article>`. Crawlers/no-JS users see only the static
`#static-intro` light-DOM section.

**Approach.** Do **not** adopt `@aihu/app`'s Vite/file-router prerender — that is a
rewrite out of scope for a perf fix. Instead add a build-time prerender **step** to
the existing `build.ts` that emits content-ful static HTML per doc page, reusing
**shipped** server primitives (`routeHeadToSsrHead` from `@aihu/server` +
`applyHeadToHtml`). Since content is already an HTML string, `renderToString` is the
wrong abstraction — use direct string injection. Repurpose `#static-intro` into a
generic light-DOM `#prerendered-content` region styled identically to the shadow-DOM
article, paint it before docs.js boots, and remove it on hydration (the same
progressive-enhancement pattern `#static-intro` already gestures at). Emit
`dist/<id>/index.html` per page so each has a crawlable, content-ful URL; keep
`#hash` anchors working for in-session SPA nav. Add a pre-paint inline theme script
to the template `<head>` to avoid a dark-mode flash.

**Files.** `apps/docs/build.ts`, `apps/docs/index.html`, `apps/docs/src/main.ts`,
`apps/docs/src/components/docs-shell.aihu`, `apps/docs/src/worker.ts`,
`apps/docs/style.css`, `apps/docs/package.json`.

**Steps.**
1. Factor `renderShell(template, { title, head, contentHtml })` into `build.ts` using
   `routeHeadToSsrHead` + a small string inject (avoid pulling an `@aihu/app` dep).
2. Repurpose `#static-intro` → `#prerendered-content`; move shadow-scoped article
   typography from `docs-shell.aihu` `@style` into global `style.css` so light-DOM and
   shadow-DOM render identically.
3. Loop over `pages` and write `dist/<id>/index.html` (home = `introduction`),
   injecting `page.html` and a per-page head (`title`, `canonical https://aihu.dev/<id>`).
4. `main.ts`: remove/hide `#prerendered-content` after `docs-shell` hydrates; seed
   `activePage` from `pathname` when no hash.
5. `docs-shell.aihu`: seed `activePage` from `location.pathname` segment when hash is
   empty; keep `hashchange`; add `popstate` if real-path nav is introduced.
6. `worker.ts`: change the ASSETS fallback to try `<path>/index.html` **before** the
   bare shell, so prerendered per-page files are served (content-ful). **This is the
   step that makes the fix user-visible — missing it silently no-ops the whole effort.**
7. Add the pre-paint inline theme script to the template `<head>`.
8. Prerender the playground page as a thin shell only — do **not** SSR the playground.
9. Add an e2e assertion: for ≥1 deep doc URL, content text is present in the **raw
   HTML response** (no-JS), proving content paints before docs.js executes.

**Acceptance (user-visible).** `curl https://<preview>/reactivity/` (or any deep doc
URL) returns the page's body text in the raw HTML, before any JS runs; the page is
theme-correct on first paint; SPA hash nav still works after hydration with no
duplicate/jumping content.

**Risks.**
- **Shadow-DOM vs light-DOM duplication / FOUC** — biggest correctness risk; article
  CSS must be globalized and the prerendered copy removed on hydration.
- **Theme flash** — mitigated by the pre-paint inline theme script.
- **Hash-routing is load-bearing** — pathname and hash seeding must be reconciled.
- **Worker fallback** — if step 6 is missed, per-page HTML is generated but never
  served → green CI, no fix (see MEMORY: acceptance must be user-visible).
- **Content-source mismatch** — `build.ts` reads `docs/site/*.md` (canonical, verified)
  while `src/content/docs/*.md` also exists and `aihu.config.ts` is dead; build against
  `docs/site/*.md`.

---

### WS2 — kindly-note build-time markdown + highlighting (dogfood)
**Branch:** `feat/docs-overhaul/kindly-note`

**Current state.** `build.ts` renders each `docs/site/*.md` with `marked` and bakes
HTML into `content.ts`. Syntax highlighting is **render-blocking third-party** from
cdnjs (solarized-dark CSS in `<head>`, `highlight.min.js` at end of body, re-run on
`hashchange`). The held-private `@aihu-plugin/kindly-note` package is fully present:
`renderMarkdown(src, opts?)` and `highlight(source, lang)` both run at build/SSR time
with no DOM (verified in Node) and emit `kn-*` scoped spans.

**Approach.** Use the shipped **helpers** (not the custom elements), all at **build
time**. Replace `marked.parse(...)` with kindly-note `renderMarkdown(source, { languages: [...] })`
so fences are highlighted into `kn-*` spans at build, keeping the `window.__DOCS__`
contract intact (this is exactly what WS1 consumes). Then delete the cdnjs hljs CSS
link, the hljs `<script>`, and the `DOMContentLoaded`/`hashchange` hljs blocks
(`index.html:14,267,268-289`). Add `kn-*` theme CSS (self-hosted/inlined). RFC #56
does **not** block this (see Open Decisions) — the helpers depend only on
`@aihu/signals` + `@kindly-note/*` and never touch the plugin-enforcement path.

**Files.** `apps/docs/build.ts`, `apps/docs/index.html`, `apps/docs/package.json`,
`apps/docs/src/components/docs-shell.aihu`, `apps/docs/style.css`,
`docs/site/*.md` (only if GFM tables are hand-converted).

**Steps.**
1. **RESOLVE the GFM-table blocker first** (see Open Decisions) — 14 of ~17
   `docs/site/*.md` files use pipe tables (verified `grep` = 14) and `renderMarkdown`
   is CommonMark-only (emits `| A | B |` as literal `<p>` text). Do not proceed until
   decided.
2. Add `@aihu-plugin/kindly-note: workspace:*` + required `@kindly-note/*` lang peers
   (`lang-typescript`, `lang-json`; add `bash`/`css`/`html` packs if those fences must
   be colored) to `apps/docs/package.json`; `bun install`.
3. `build.ts`: remove `import { marked }`; import `{ renderMarkdown }`; replace the
   render call. Keep title-extraction/escaping/`content.ts` write unchanged.
4. `bun run build`; diff regenerated `content.ts` — verify headings/lists/links/inline
   code render and (critically) tables are not mangled.
5. `index.html`: delete the cdnjs hljs `<link>`, `<script>`, and the DOMContentLoaded +
   hashchange hljs blocks.
6. Add `kn-*` theme CSS (prefer self-hosted: add `@kindly-note/themes-default` and
   inline its `dark.css` `kn-*` rules into `docs-shell.aihu` `@style` / `style.css`, or
   hand-author the palette — `themes-default` is **not** installed today).
7. Remove `marked` from `package.json`.
8. Verify in browser: code is colored, **no** cdnjs request, SPA hashchange nav still
   shows highlighted code (baked into `__DOCS__`).

**Acceptance (user-visible).** Code fences are colored with zero third-party network
requests; tables render as real `<table>`s; all docs pages render identically to or
better than the marked output.

**Risks.**
- **GFM tables** — dominant risk; a swap without a GFM fix is a visible regression.
- **Theme/CSS gap** — removing cdnjs CSS removes all coloring unless `kn-*` CSS is
  added; `kn-` classes differ from hljs, so existing CSS does not apply.
- **Lang-pack coverage** — only `ts`+`json` installed; `bash`/`css`/`html` fall back to
  uncolored text unless their packs are added.
- **Held-private dep** — fine via `workspace:*` for monorepo build; build-time-only use
  keeps it out of `dist/docs.js`.
- **Size gates** — build-time-only, must not add a `.size-limit` row; confirm no leak
  into `dist/docs.js`.

---

### WS3 — Self-host fonts + opportunistic css-engine
**Branch:** `feat/docs-overhaul/css-fonts`

**Current state.** Styling is a ~25 KB hand-written global `style.css` (≈300 custom-prop
refs), not css-engine. Two render-blocking Google Fonts loaders exist
(`index.html:9-12` + duplicate `@import` at `style.css:7`). The build uses `build.ts` +
rolldown + `aihuCompilerPlugin()`, **not** Vite. The compiler's css-engine hook is
shipped: default shadow mode folds per-component utility CSS into the shadow `<style>`;
`shadowMode:'none'` routes through a **virtual `.css` module** that depends on **Vite's
CSS pipeline** to hoist — which this rolldown build may not run.

**Approach — two parts.**
- **Part A (do first, low risk, high value): self-host fonts.** Vendor Inter
  (400/450/500/600/700) + JetBrains Mono (400/500/600) woff2 latin subsets into
  `apps/docs/public/fonts/`, author `@font-face` (`font-display:swap`) at the top of
  `style.css` (replacing the deleted `@import`), `<link rel="preload">` only the 1-2
  above-the-fold weights, and **delete both Google Fonts loaders**. Keep the existing
  `--font-sans`/`--font-mono` token values.
- **Part B (gated, higher risk): css-engine adoption.** Do **not** attempt a full
  `style.css` → utility rewrite — the light-DOM body chrome + `{@html}` Markdown article
  cannot be reached by shadow-scoped utilities. Scope to (1) opportunistic per-component
  utility classes in `.aihu` `@template` blocks (default shadow mode, zero infra change)
  and (2) optionally swap the `:root` token block for a css-engine style pack import.
  Treat a global utility sheet via `shadowMode:'none'` as **BLOCKED** until the
  rolldown-CSS-pipeline question is resolved.

**Files.** `apps/docs/index.html`, `apps/docs/style.css`, `apps/docs/build.ts`,
`apps/docs/public/fonts/` (new), `apps/docs/package.json`,
`apps/docs/src/components/{docs-shell,theme-toggle,live-demo}.aihu`,
`apps/docs/rolldown.config.ts`.

**Steps.**
1. Source woff2 (`@fontsource/inter` + `@fontsource-variable/jetbrains-mono`, OFL,
   self-hostable) or hand-subset; place latin-subset woff2 under `public/fonts/`.
2. Author `@font-face` rules at top of `style.css` with `font-display:swap`.
3. Delete `style.css:7` `@import` and `index.html:9-12` preconnect+stylesheet.
4. Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for above-the-fold
   weights only.
5. Confirm `build.ts:177-192` recursive `public/` copy ships `public/fonts/` to dist.
6. Verify `dist/index.html` no longer references `fonts.googleapis.com`; confirm
   `_headers` sets long-lived immutable cache for `/fonts/*.woff2`.
7. **Part B (only after Part A + open questions):** confirm whether rolldown executes
   the css-engine transform/virtual-CSS hook; if not, scope to shadow-folded utilities
   only. Add `@aihu/css-engine` dep + ensure the native `aihu-css-compile` binary
   resolves (else the hook silently no-ops). Opportunistically migrate `.aihu` `@style`
   rules to utility classes; optionally swap `:root` tokens (reconcile `--bg`/`--fg`/
   `--accent` ↔ `--color-*`).

**Acceptance (user-visible).** No request to `fonts.googleapis.com`; fonts render via
self-hosted woff2 with no FOUT beyond `swap`; no visual regression vs current site.

**Risks.**
- **rolldown ≠ Vite** — `shadowMode:'none'` virtual-CSS hoisting may silently emit
  nothing; the README's "auto-wired by presence" is a Vite-plugin claim.
- **Light-DOM dominance** — dropping `style.css` would break the whole page.
- **css-engine vocabulary gaps** — no `grid-cols-N`, `mx-auto`, `max-w-*`, responsive
  prefixes, `@media`; `docs-shell` relies on grid + media queries → keep hand-authored.
- **Native binary** — unresolvable `aihu-css-compile` → silent no-op, green CI, no
  utilities (matches prior css-engine wiring regression in MEMORY).
- **Font subsetting** — full unicode-range for 8 weights could add hundreds of KB; keep
  latin subset + preload only above-the-fold.

---

### WS4 — Playground clipping fix (independent UX bug)
**Branch:** `feat/docs-overhaul/playground-clip`

**Current state.** The playground is a client-only custom element. The preview iframe is
clipped: `:host { overflow:hidden }`, `.playground { grid; min-height:360px }`, `.pane`
has no height / no `min-height:0`, and the `iframe` has `flex:1; width:100%` with **no
height**. An iframe is a replaced element that does not auto-size to `srcdoc`, so tall
preview output (e.g. Todo preset) is clipped, not scrolled or grown. There is **zero**
iframe resize logic anywhere (grep for `scrollHeight`/`ResizeObserver`/`postMessage` =
0 matches). Lazy WASM/CodeMirror chunks are independent of this fix.

**Approach — ship both layers.**
- **(A) Minimum safe CSS fix** in `HOST_STYLES`: give `.playground` a real bounded
  height (`height: clamp(360px, 70vh, 720px)`), add `min-height:0` to `.pane`, make the
  iframe fill the pane (`flex:1; min-height:0; height:100%`) so its own document scrolls;
  keep `:host overflow:hidden` only to clip rounded corners (now safe). Fix `.error`
  `max-height:30%` → `160px`.
- **(B) True auto-grow (preferred):** postMessage handshake. The iframe is
  `sandbox="allow-scripts"` **without** `allow-same-origin`, so the host cannot read
  `contentDocument`. In `buildPreviewDoc`, append a script that posts
  `{type:'pe-height', height}` on a `ResizeObserver`; in the host, add a `message`
  listener validated by `event.source === this.iframe.contentWindow` (origin will be
  `null`) with a max-height clamp. **Never add `allow-same-origin`** (breaks the sandbox
  boundary).

**Files.** `apps/docs/playground/playground-embed.ts`,
`apps/docs/tests/playground.spec.ts`.

**Steps.** (1) `.playground` bounded height; (2) `.pane { min-height:0 }`; (3) iframe
fill rule; (4) keep `:host overflow:hidden` for corners only; (5) `.error` px cap;
(6) optional postMessage auto-grow (additive listener, removed in `disconnectedCallback`);
(7) do not rename `this.iframe` or touch lazy-load wiring; (8) extend Playwright spec to
load a tall-output preset and assert the preview is not clipped (current tests have no
height coverage, so the regression is invisible to CI).

**Acceptance (user-visible).** Selecting a tall preset shows all output (scrolls within
the frame or auto-grows); nothing is cut off; lazy WASM/CodeMirror still load.

**Risks.** Fixed `clamp` height means very tall output scrolls within frame if (B) is
skipped (acceptable, verify it reads as intentional); dropping `overflow:hidden` exposes
square corners; mobile single-column `@media(max-width:768px)` may compress stacked panes
with a fixed height — relax at that breakpoint. Apps are typically exempt from
`.size-limit` rows; confirm before adding the listener.

---

### WS5 — Build/perf budget re-baseline + Lighthouse-gate retirement (cross-cutting verifier)
**Branch:** `feat/docs-overhaul/perf-budget`

**Current state.** `build.ts` writes the 214 KB `content.ts` blob that gets bundled into
`dist/docs.js`. The Lighthouse gate (`scripts/lighthouse.ts` on `origin/main`) is a
**single run** against `/docs/introduction`, perf/a11y/bp/seo ≥ 95, LCP ≤ 2500 / CLS
≤ 0.1, wired only as `package.json` `test:quality` — **not referenced in any
`.github/workflows/`**. `deploy-docs.yml` runs Playwright smoke + a `content.ts`
staleness check, **not** Lighthouse. No `.size-limit.json` row for `apps/docs` (docs is
governed by Directive 1's <1 MB initial-JS budget). The local-tree `lighthouse.ts` is an
older divergent version — main is authoritative. A best-of-3 retry stopgap is being
landed separately.

**Approach.** WS5 is the enabler/verifier: it deletes the dead build machinery WS1/WS2
obsolete, re-baselines the budget, and retires the stopgap **after** the gate passes for
real. Sequence **after** WS1+WS2+WS3.

**Files.** `apps/docs/build.ts`, `apps/docs/src/main.ts`, `apps/docs/src/content.ts`
(delete), `apps/docs/src/components/docs-shell.aihu`, `apps/docs/rolldown.config.ts`,
`scripts/lighthouse.ts`, `.github/workflows/deploy-docs.yml`, `.size-limit.json`,
`.size-limit.README.md`, `apps/docs/src/worker.ts`.

**Steps.**
1. **WAIT** for WS1+WS2 to land the served-HTML content path; do not delete `content.ts`
   before the replacement render source exists.
2. Measure baseline: record `dist/docs.js` bytes and pre-overhaul Lighthouse perf/LCP.
3. `build.ts`: remove the `marked`-render loop that writes `content.ts` / `window.__DOCS__`
   (step 1 md-collection only kept if still needed; step 7 re-reads md for
   `llms-full.txt` independently).
4. Delete `import './content.ts'` from `main.ts:2`; delete `apps/docs/src/content.ts`.
5. Update `docs-shell.aihu` `activeHtml()` to read from WS1/WS2's content source instead
   of `window.__DOCS__` (coordinate exact API with WS1/WS2).
6. Remove the `content.ts` staleness check from `deploy-docs.yml`.
7. Fix the inaccurate `worker.ts:9` comment about `__DOCS__` being inlined into
   `index.html`.
8. Re-measure `dist/docs.js`; add a budget (a `.size-limit.json` row for
   `apps/docs/dist/docs.js` **or** a hard size assertion in `build.ts`), cap = measured +
   headroom, under Directive 1's 1 MB initial-JS ceiling. Update `.size-limit.README.md`
   if docs becomes a tracked browser bundle.
9. Re-run Lighthouse against `/docs/introduction` on the prerendered build; confirm
   deterministic perf ≥ 95 and LCP comfortably < 2500 ms across several runs.
10. After the separate stopgap PR lands, remove best-of-3 retry; restore single-run gate;
    tighten `CWV.lcp` to the **CI-measured** value + ~20% headroom.
11. Wire the gate into CI: add `bun run test:quality` to `deploy-docs.yml` (after Build
    docs) so it actually blocks regressions instead of being local-only.

**Acceptance (user-visible).** `dist/docs.js` drops dramatically (214 KB inline HTML
removed); the Lighthouse gate runs **in CI** and blocks regressions; perf ≥ 95 / LCP <
2500 ms holds across multiple consecutive runs without the best-of-3 crutch.

**Risks.** Deleting `content.ts` before WS1/WS2's replacement is live → blank pages
(strict ordering); if WS1's prerendered HTML is not what `wrangler pages dev` serves at
`/docs/introduction`, the gate still measures the un-prerendered shell; remaining
render-blocking fonts/hljs (WS3/WS2) cap LCP, so the LCP target **assumes WS2+WS3 land**;
tightening LCP from local numbers re-introduces CI flakiness (use CI-measured); docs
builds outside `scripts/size.ts`, so a `.size-limit` row may not measure the same way —
verify or use an in-build assertion.

---

## Sequenced Round Table

| Round | Workstreams (parallel) | Branch(es) | Gate to enter | Rationale |
|-------|------------------------|------------|---------------|-----------|
| **R1** | WS4 playground-clip; WS3 **Part A** (self-host fonts); WS2 kindly-note | `feat/docs-overhaul/playground-clip`, `feat/docs-overhaul/css-fonts` (Part A), `feat/docs-overhaul/kindly-note` | Resolve **D1 (GFM tables)** + **D2 (RFC #56)** before WS2 starts | All three are largely independent and quick. WS2 lands **before** WS1 so the prerendered HTML already contains kindly-note (`kn-*`) output and no cdnjs hljs. WS4 and WS3-A touch disjoint files. |
| **R2** | WS1 prerender | `feat/docs-overhaul/prerender` | WS2 merged (so `content.ts`/`__DOCS__` already carry baked highlighting); WS3-A merged (so prerendered head has self-hosted font links) | The big structural change. Benefits from WS2's baked output and WS3-A's font self-hosting being present in the page it prerenders. |
| **R3** | WS5 budget + gate; WS3 **Part B** (css-engine, *optional/if unblocked*) | `feat/docs-overhaul/perf-budget`, `feat/docs-overhaul/css-fonts` (Part B) | WS1 merged (served-HTML content path live) + WS2+WS3-A merged (render-blocking resources gone) | Only after content is in the served HTML can `content.ts` be deleted, the budget re-baselined, and the gate verified/retired. WS3-B is gated on the rolldown-CSS-pipeline answer (**D3**). |

**Architect → Builder → Verifier cadence** (per workstream, per round):
- **Architect**: confirms the workstream's open questions are resolved (or flagged as
  accepted scope), pins exact files/lines, hands the Builder a single-branch brief.
- **Builder**: implements on the named `feat/docs-overhaul/<slice>` branch, runs
  `bun run build` + `bun run test` locally, asserts the **user-visible** acceptance
  bullet (not just "tests pass" — per MEMORY).
- **Verifier**: checks out the branch, runs the acceptance assertion empirically
  (curl the raw HTML for WS1; network-tab for WS2/WS3 third-party requests; tall-preset
  screenshot for WS4; `dist/docs.js` byte count + multi-run Lighthouse for WS5), diffs
  vs `origin/main` to confirm it is not duplicating already-merged work (per MEMORY).

---

## Critical Path

`D1+D2 resolved` → **WS2 (kindly-note)** + **WS3-A (fonts)** land in R1 →
**WS1 (prerender)** lands in R2 (consumes WS2 baked HTML + WS3-A font links) →
**WS5 (delete content.ts, re-baseline, wire+verify+retire gate)** lands in R3.

WS4 (playground) and WS3-B (css-engine) are **off** the critical path — WS4 ships any
time in R1; WS3-B is optional and gated on D3.

The single longest dependency chain is **WS2 → WS1 → WS5**. WS5 cannot delete the
content blob or claim the perf win until WS1 puts content in the served HTML, and WS1's
prerendered output is most honest when WS2 has already baked highlighting in (so no
cdnjs hljs leaks into the prerendered pages) and WS3-A has removed the Google Fonts
blocker.

---

## Open Decisions (for the user — gate the rounds)

**D1 — GFM tables (BLOCKS WS2 / R1 start).** `renderMarkdown` is CommonMark-only and
emits the 14 table-bearing docs files' pipe tables as literal `<p>` text. Choose one:
(a) add `@kindly-note/lang-markdown-gfm` if it exists, renders `<table>`, and can be
wired into `renderMarkdown` (preferred — keeps full dogfooding); (b) hand-convert the 14
files' tables to non-table markup; (c) keep `marked` for table files only (defeats the
dogfooding goal). **Recommendation: (a) pending existence/verification, fall back to (b).**

**D2 — kindly-note RFC #56 / SSR safety (BLOCKS WS2 / R1 start; informs WS1).**
*Resolution from evidence:* RFC #56 does **not** block this. `plugin.ts` is
`contributes: {}` (a v0.4 no-op shim) and the README ties RFC #56 only to `@aihu/plugin`
**enforcement / npm-publish ratification**. The `renderMarkdown`/`highlight` helpers
depend solely on `@aihu/signals` + `@kindly-note/*`, never touch the plugin-enforcement
path, and are import-safe + DOM-free at build time (verified in Node). Consuming
`@aihu-plugin/kindly-note` via `workspace:*` **at build time only** is therefore
sanctioned and keeps it out of the browser bundle. **Flagged for user sign-off** that
`workspace:*` build-time consumption of the held-private package is acceptable, and that
WS1's prerender does **not** need to accommodate any kindly-note runtime (it consumes the
already-baked `__DOCS__` HTML — no SSR execution of kindly-note at prerender time).

**D3 — css-engine scope / rolldown CSS pipeline (gates WS3 Part B / R3 only).** Does
rolldown execute `aihuCompilerPlugin`'s `resolveId`/`load` hooks and hoist the virtual
`.css` module the way Vite does? If not, the `shadowMode:'none'` global-utility path is
unavailable and css-engine adoption is limited to per-component shadow-folded utilities.
Also decide: is a full `style.css` → css-engine migration in scope, or just self-hosted
fonts (Part A) + light opportunistic component utilities? **Recommendation: ship Part A
unconditionally (R1); treat Part B as opportunistic/optional and do not block the
overhaul on it.**

**Minor confirmations** (non-blocking): canonical content source is `docs/site/*.md`
(verified); apps are exempt from `.size-limit` rows so WS4's listener and WS5's docs
budget choice (row vs in-build assertion) is the size-gate owner's call; the new tightened
LCP threshold must come from **CI-measured** numbers, not local.

---

## Lighthouse-Gate Outcome

**What makes the gate pass for real (not via retries):** Today the LCP element waits on
the 339 KB `docs.js` (carrying 214 KB inline HTML) to download/parse/execute and the
`docs-shell` custom element to upgrade, plus two render-blocking third-party requests
(Google Fonts, cdnjs hljs). After the overhaul:
- **WS1** puts the doc body in the **served HTML** (`dist/<id>/index.html`), so LCP paints
  from the initial response with no JS on the critical path.
- **WS2** bakes highlighting at build time and **deletes the cdnjs hljs** request.
- **WS3-A** self-hosts fonts and **deletes the Google Fonts** request, preloading only
  above-the-fold weights.
- **WS5** removes the 214 KB `content.ts` blob from `docs.js`, slashing parse/execute/TBT.

**Realistic post-overhaul target:** perf **98–100**, LCP **~800–1500 ms** for
edge-served prerendered static HTML with no render-blocking first-paint JS, CLS well
under 0.1 (the main residual CLS risk is highlight restyle — eliminated by WS2 since
highlighting is now baked, not client-applied).

**Can the best-of-3 stopgap be removed?** **Yes — after R3.** Once WS1's prerendered HTML
is what `wrangler pages dev` serves at `/docs/introduction` and WS5 has confirmed
deterministic perf ≥ 95 / LCP < 2500 ms across several consecutive CI runs, WS5 removes
the best-of-3 retry, restores a single-run gate, and tightens `CWV.lcp` from 2500 ms to
the CI-measured value + ~20% headroom (target ~1500–2000 ms). The stopgap is a temporary
crutch that this overhaul is explicitly designed to retire; it must **not** be removed
before R3 lands and CI confirms the real numbers, because shared CI runners are noisier
than local.

**One non-negotiable wiring requirement:** the Lighthouse gate is currently local-only
(`test:quality`, in no workflow). WS5 must add `bun run test:quality` to
`deploy-docs.yml` so the gate actually blocks regressions in CI — otherwise the perf win
is unguarded and can silently regress (per MEMORY: acceptance must be user-visible / the
gate must run in CI).
