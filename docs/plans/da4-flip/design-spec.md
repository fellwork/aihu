# DA4 light-DOM default flip — architecture spec (#437 phase 2)

**Status:** design — no implementation in this branch.
**Ratified basis:** `docs/architecture/thesis.md` §Ratified sub-decisions →DA4
(2026-07-20) and the #437 ratification comment (classifier = `@route`-block
presence; `$shadow` always wins; route wins everywhere; semver-major, gated
behind the shipped W472 release).
**Phase 1 (shipped, `bf50b223`):** W472 warning, `route_shadow_flip_warning()`
(`packages/compiler/src/lib.rs:176`), scaffold `$shadow: 'none'` pin,
informational DA-e count, migration.md §8.

This spec covers phase 2: the flip itself, the mixed-mode CSS pipeline (the
centerpiece), the `check:dual-audience` ratchet, `--shadow`/wizard semantics,
layouts, docs, and versioning.

---

## 1. Consumer map — every place shadow mode is read today

Ratified precedence after the flip:

```
$shadow macro (per-file)  >  @route present → 'none'  >  css.shadowMode (project)  >  'open'
```

| # | Consumer | Where | What it does today |
|---|----------|-------|--------------------|
| C1 | `$shadow` macro → marker | `packages/compiler/src/codegen/emit.rs:3189-3192` (macro find), `:3285-3291` (prepends `// @aihu:shadow <mode>`) | Only an explicit `$shadow` produces the marker. Malformed → C471 (`packages/compiler/src/types.rs:413-415`). |
| C2 | W472 warning | `packages/compiler/src/lib.rs:139-149` (emission), `:176-211` (decision fn) | Warns on `@route` + no `$shadow`; changes no output. |
| C3 | Vite plugin option | `packages/compiler/js/index.ts:79` (`shadowMode?: 'open'\|'closed'\|'none'`), read at `:1144` | The single global knob. JSDoc at `:75` still claims "Per-component override is not yet supported via SFC syntax" — already stale ($shadow exists). |
| C4 | Per-file marker read | `packages/compiler/js/index.ts:1196-1201` | `perFileShadow ?? shadowMode` → `effectiveShadow`. **The per-component seam already exists and already drives everything below, per file.** |
| C5 | Runtime injection | `_injectShadowMode`, `packages/compiler/js/index.ts:115-123`, called at `:1202-1203` | Appends `{ shadowMode: '<mode>' }` as 3rd arg to `defineElement`. |
| C6 | Authored-style globalization | `_globalizeAuthoredStyle`, `packages/compiler/js/index.ts:135-142`, called at `:1209` | When `effectiveShadow === 'none'`, redirects the compiled `host.adoptedStyleSheets = [__style__]` to `document.adoptedStyleSheets` — **unscoped**. |
| C7 | Utility-CSS fold, shadow branch | `_foldCssEngineStyles`, `packages/compiler/js/index.ts:613-674`, called at `:1237` | Folds css-engine output into the per-component constructable sheet (`__style__.replaceSync`). |
| C8 | Utility-CSS fold, light branch | `_foldCssEngineStylesGlobal` `:730-745`, `VIRTUAL_UTILITY_PREFIX` `:689`, store `:1154`, `resolveId`/`load` `:1159-1172`, called at `:1229-1233` | Routes the same css-engine text through a `\0virtual:aihu-utility/<hash>.css` module → Vite CSS pipeline → `dist/assets/*.css`. |
| C9 | Static-island shim | `_buildStaticIsland`, `packages/compiler/js/index.ts:461-504`; branch at `:1256-1262` | **Hardcodes `this.attachShadow({ mode: 'open' })` at `:496`** — ignores `effectiveShadow` entirely. See G3. |
| C10 | Runtime | `packages/runtime/src/define-element.ts:26-41` (`wrapClass`), default `'open'` at `:83` | Already fully per-component via `options.shadowMode`. No structural change needed. |
| C11 | App config | `packages/app/src/config.ts:85-95` (field), `:214-222` (validation); forwarded at `packages/app/src/vite-plugin.ts:243-253` | `css.shadowMode` → plugin-global `shadowMode`. `viteAihuPlugin` always sets `islands: false` (`vite-plugin.ts:248`), which is why C9's defect hasn't fired on the app path. |
| C12 | CLI / wizard | `packages/cli/src/bin.ts:66-98`, `packages/cli/src/create.ts:109-118,157,313-318`, `packages/cli/src/index.ts:154-168` (config emission), `:317-325` (plain-scaffold `$shadow: 'none'` pin) | `--shadow` valid only with `--css engine`; writes `css: { shadowMode }` when ≠ open. |
| C13 | css-engine | `compileSfc(source, id)` (`packages/compiler/js/index.ts` local `CssEngineModule` interface, ~`:1049`); engine emission `packages/css-engine/crates/aihu-css-core/src/emit.rs:276-352` (`emit_sfc_scoped`); binary `packages/css-engine/crates/aihu-css-core/src/bin/main.rs:50-58` (`--ast-json`) | **Mode-blind.** One output shape: `:host { tokens }` (emit.rs:347-350), preflight reset (`:303`), `.class` utility rules, folded authored `@style` (`:313-340`). Same text is used by both C7 and C8. |
| C14 | Layout mount | `packages/app/src/client.ts:244-274`, esp. `:263` `layoutEl.shadowRoot ?? layoutEl`; prerender layout shell `packages/app/src/prerender.ts:343-355`, outlet injection `:176-190` | Client places the page element **inside the layout's shadow root when the layout has one**; prerender writes a light-DOM layout shell. See §8. |
| C15 | Storybook | `apps/storybook/.storybook/main.ts:54` | Pins `shadowMode: 'open'` globally; stories are leaves (no `@route` in stories) — unaffected by the flip. |
| C16 | check:dual-audience | `scripts/check-dual-audience.ts:535-570` (DA-e detector), `:713-722` (informational print), `:405-407` and `:503-505` (`textInShadow` extractability assertions in DA-c/DA-d) | DA-e counts, never enforces. |

Key observation: **the mixed-mode plumbing largely exists.** C4's
`effectiveShadow` is computed per file, and C5–C8 already branch on it inside
one plugin instance — one build can already hold folded shadow sheets for some
files and virtual light CSS for others. What is missing is (a) the compiler
emitting the default marker for pages (today only `$shadow` produces it), and
(b) fixing what breaks when light mode becomes a *default* rather than an
app-wide opt-in (G1–G5 below).

---

## 2. What breaks when shadow mode varies per component (the gaps)

**G1 — authored `@style` collides app-wide.** `_globalizeAuthoredStyle`
(`index.ts:135-142`) dumps the page's authored sheet into
`document.adoptedStyleSheets` **unscoped**. Under the global `'none'` knob this
was a knowing, app-wide opt-in. Post-flip it is the *default for every page*:
two pages that each author `.card { … }` now fight in one global cascade, and a
page's element selectors (`h1 { … }`) restyle every other light page and the
layout chrome. This is the load-bearing delivery problem — §3.

**G2 — dead `:host` in light CSS.** The engine emits theme tokens at `:host`
(`aihu-css-core/src/emit.rs:347-350`, snapshot
`tests/snapshots/scoped_snapshot__scoped_output_for_sfc.snap`), dark-mode
selectors as `:host([data-theme="dark"])` (`emit.rs:193-199`), and the `host:`
variant as `:host(<sel>)` (`emit.rs:134`). In light DOM `:host` matches
nothing. Today's light builds survive because style packs emit `:root`/`.dark`
token blocks globally (`packages/css-engine/src/define-style-pack.ts:78`), but
per-SFC `@theme` overrides (folded into the `:host` block via
`theme.apply_theme_block`, `emit.rs:283-288`) are **silently lost** on light
components. The flip makes that the default-path behavior for every page that
uses `@theme` — unacceptable.

**G3 — static-island shim is shadow-hardcoded and regex-brittle.**
`_buildStaticIsland` hardcodes `attachShadow({ mode: 'open' })`
(`index.ts:496`), and its closing rewrite `/\)\s*\)\s*$/` (`:499`) does not
match once `_injectShadowMode` has appended `, { shadowMode: '…' })` — the
module is left half-rewritten (first bookend applied, second not). Latent
today because `viteAihuPlugin` forces `islands: false`
(`app/src/vite-plugin.ts:248`) and markers are rare; post-flip **every page
carries a marker**, so any direct `aihuCompilerPlugin({ islands: true })`
consumer breaks immediately. Must be fixed in the flip PR.

**G4 — duplicated base CSS in `dist/assets/*.css`.** Each light page's virtual
CSS carries its own copy of the preflight reset (`emit.rs:303`) and referenced
token block. N pages → N copies. Correctness is unaffected (identical rules);
bytes and noise grow linearly. Addressed as a SHOULD (§3.4).

**G5 — shadow layouts trap light pages.** See §8.

---

## 3. The mixed-mode CSS pipeline (centerpiece)

### 3.1 The routing mechanism: the marker becomes the default channel

The concrete mechanism is: **the compiler emits `// @aihu:shadow none` for
every `@route` component without `$shadow`** (§4), and the plugin's existing
per-file branch (C4→C5/C6/C7/C8) becomes the router of a genuinely mixed
build:

- Shadow leaves: `effectiveShadow ∈ {open, closed, undefined→open}` → utility
  CSS folds into the per-component constructable sheet (C7); authored `@style`
  keeps its `host.adoptedStyleSheets` assignment. `dist/assets` untouched.
- Light pages: `effectiveShadow === 'none'` → utility + authored CSS routed
  through the virtual-module path (C8) into Vite's CSS pipeline →
  `dist/assets/*.css`; runtime gets `{ shadowMode: 'none' }` (C5) so no shadow
  root is attached (`define-element.ts:26-29`).

Both branches already coexist per plugin instance (`utilityCssStore` at
`index.ts:1154` is keyed per virtual id; folded sheets are per-module). No new
build phases, no second plugin, no config schema change. **One build, both
pipelines, keyed off a per-file marker the compiler already owns.**

What §3.2 must decide is the *content* of the light-page CSS, because reusing
the shadow-shaped text (today's behavior) is what produces G1/G2.

### 3.2 CSS delivery for light pages — alternatives

**Option A (recommended) — engine-native light output mode, `@scope`-wrapped.**
`aihu-css-core` gains a light emission target alongside `OutputMode::Scoped`
(`emit.rs:27`): `compile_sfc_light(ast, tag)` emitting one per-page sheet:

```css
@scope (aihu-blog-index) {
  :scope { --color-primary: …; /* tokens + @theme overrides */ }
  *, ::before, ::after { border-style: solid; border-width: 0; }  /* preflight, now scoped */
  .bg-primary { background-color: var(--color-primary); }
  /* authored @style (scoped) */ .inner { display: grid; }
}
/* authored @style ($global) passes through OUTSIDE the @scope wrapper, as today */
```

- `:host` → `:scope` structurally, in the emitter that owns those selector
  forms: token block target (`emit.rs:347-350`), `Variant::Host`
  `:host(<sel>)` → `:scope<sel>` compound (`emit.rs:134`), dark triple
  (`emit.rs:193-199`) → light-mode equivalents. Specificity parity: `:scope`
  and `:host` are both (0,1,0), so utility/recipe override order is identical
  in shadow and light components.
- Surface: `compileSfc(source, id, opts?: { mode: 'shadow' | 'light' })` in
  `packages/css-engine/src`; binary flag `--light-tag <tag>` beside
  `--ast-json` (`bin/main.rs:26`); the plugin threads `effectiveShadow` into
  `_maybeCompileUtilityCss` (`index.ts:1094`) and updates its local
  `CssEngineModule` interface (~`:1049`).
- Plain path (no css-engine): the Rust codegen's authored-style emission wraps
  the `__style__.replaceSync` body in `@scope (<tag>) { … }` when the
  component's effective mode is `none` — a pure text wrap, no CSS parsing in
  the compiler. `_globalizeAuthoredStyle` keeps redirecting adoption to
  `document.adoptedStyleSheets`; the *text* is now scoped, closing G1.
- Nesting caveat (document, don't fight): `@scope` without an explicit lower
  boundary extends into descendant *light* subtrees, so a light layout's
  scoped rules can match a light page nested inside it — classic scoped-CSS
  semantics. Shadow leaves keep true isolation.

Cost: a browser floor (`@scope`: Chrome 118+, Safari 17.4+, Firefox 128+ — all
evergreen as of 2026). Degradation without it = today's unscoped behavior. One
implementation subtlety to verify with a browser test before building:
ancestor-referencing selectors inside `@scope` (the `:root.dark <sel>` arm of
the dark triple) — if subject-scoping rules make that arm unreliable, emit the
dark tokens via the `[data-theme]`/media arms only, or hoist the `:root.dark`
arm outside the wrapper.

**Option B (fallback) — engine-native tag-prefix descendant scoping.** Same
engine-owned split, but emit `aihu-blog-index .bg-primary { … }`, tokens at
the bare tag selector, `:host(<sel>)` → `<tag><sel>`. No `@scope` dependency;
works in every browser that runs the framework at all. Cost: every rule gains
(0,0,1) type specificity and light/shadow specificity parity breaks
(`<tag> .p-4` = (0,1,1) vs shadow `.p-4` = (0,1,0)); debugging output is
noisier. Choose B only if the founder rejects the Option A browser floor.

**Option C (rejected) — flip without fixing delivery.** Keep today's `'none'`
semantics: unscoped globalization (C6) + shadow-shaped engine text through the
virtual path (C8). Zero CSS churn, and it is literally what `shadowMode:
'none'` ships today — but as a *default* it makes cross-page collisions (G1)
and silent `@theme` loss (G2) the out-of-box experience of every scaffolded
app, discovered only when a second page is added. That is a footgun release,
not a structural fix; rejected.

**Recommendation: A**, with B as the pre-approved fallback if the `@scope`
floor is refused. The deciding argument against doing any of this in the JS
plugin (a fourth option: textually wrapping/rewriting in `index.ts`) is that
`:host(<sel>)`/`:host-context` rewriting is selector surgery, and the engine
already composes those selectors structurally — post-hoc regex CSS rewriting
is exactly the fragile string-surgery class the plugin is already suffering
from (see G3).

### 3.3 Per-consumer changes for mixed mode

| Consumer | Change |
|----------|--------|
| C1/C2 (compiler) | §4: default marker emission; W472 retirement. |
| C3 (plugin option) | Semantics narrow to **leaf default** (§6). JSDoc rewrite (`index.ts:64-79`, incl. the stale `:75` claim). No schema change. |
| C4 | Unchanged mechanics; add layout default (§8): `effectiveShadow = perFileShadow ?? (isLayout ? 'none' : shadowMode)` at `index.ts:1201` (`isLayout` already computed at `:1186`). |
| C5 | Unchanged. |
| C6 | Keep the `document.adoptedStyleSheets` redirect; the sheet body arrives pre-scoped from Rust/engine (Option A). |
| C7/C8 | Unchanged routing; C8's payload becomes the light-mode engine output. |
| C9 | Rewrite `_buildStaticIsland(compiledCode, elementTag, mode)`: `'none'` → mount into `this` (no `attachShadow`); `'closed'` honored; make the closing regex options-aware (or run the island rewrite before `_injectShadowMode`). Regression test for the half-rewrite. |
| C10 (runtime) | No change. Default `'open'` at `define-element.ts:83` stays — pages are explicit via injected options. |
| C11 (app config) | Doc-comment updates only (`config.ts:72-95`); validation unchanged. |
| C12 (CLI) | §6 copy changes; drop the now-redundant plain-scaffold `$shadow: 'none'` pin (`cli/src/index.ts:317-325`) and refresh `legacy-snapshot.golden`. |
| C13 (css-engine) | §3.2 Option A: light output mode + CLI flag + `compileSfc` mode param. |
| C14 (app renderers) | No code change required by this spec beyond §8's classification; client/prerender already handle light layouts. |
| C16 (check) | §5 ratchet. |

### 3.4 Base-sheet dedupe (SHOULD, not release-gating)

Split the light emission into `base` (tokens + preflight) and `rules`; the
plugin registers the base once per build under a fixed virtual id
(`\0virtual:aihu-utility/__base.css`) and per-page virtual modules carry rules
only. Pure size optimization; ship as a fast-follow if it doesn't fit the
flip PR.

---

## 4. The flip itself (compiler)

**Where:** `packages/compiler/src/codegen/emit.rs:3285-3291`. Today the marker
is emitted only from the `$shadow` macro (`:3189-3192`). Change the effective
mode to:

```rust
let effective: Option<&str> = shadow_mode
    .or_else(|| unit.source.route.is_some().then_some("none"));
```

`emit()` already has `unit.source.route` (`types.rs:100-101`; cf. the same
check in `lib.rs:177`). The existing prepend at `:3289-3291` then emits
`// @aihu:shadow none` for every page. `$shadow` (any value) wins by
construction. Update the marker contract comment at `types.rs:413-415`.

**W472 becomes retired, not an FYI.** Its entire purpose was the ratified
one-release notice (amendment 1), which shipped in 0.1.11. Keeping it as a
per-build FYI would warn forever on *default-correct* code. Remove the
emission (`lib.rs:147-149`), delete `route_shadow_flip_warning`
(`lib.rs:176-211`) and `tests/route_shadow_warning.rs` (replace with
marker-default tests), and mark W472 **retired — never reuse the code** in the
diagnostics registry and migration.md quick-ref (`docs/site/migration.md:226`).
Migration.md §8 (`:178-226`) is rewritten from "preparing for" to "the flip
landed in vX", keeping the same escape hatches.

**Scaffold:** remove the plain-branch `$shadow: 'none'` pin
(`cli/src/index.ts:317-325`, golden at
`packages/cli/tests/legacy-snapshot.golden/src/pages/index.aihu`) — post-flip
it is redundant and the scaffold should demonstrate the idiomatic default.

---

## 5. `check:dual-audience` ratchet (DA-e enforced)

Post-flip, "route component without `$shadow`" is *correct*, so the enforced
finding inverts polarity from the informational count:

**DA-e (enforced): a shipped `@route` component whose resolved shadow mode is
not `'none'`** — i.e. `@route` + `$shadow: 'open'|'closed'`. Resolution
mirrors the ratified precedence in text shape (same rationale as the current
detector, `check-dual-audience.ts:546-566`: must run on a plain checkout, no
Rust binary). Expected count 0 via `expectCount` (`:728`); legitimate
escape-hatch pages go in `baselines.json` with a reason, exactly like DA-d's
scope note (`:36-42`). Self-test cases (`:654-675`) flip accordingly:
should-flag = `@route` + `$shadow: 'open'`; should-not-flag = `@route` with no
`$shadow`, and a routeless leaf.

**Content extractability (the CEO-review amendment 4).** Recommendation:
**split it across two enforcement points rather than forcing it into the
check script.**

- The check script *already* asserts extractability behaviorally where it can
  run binary-free: DA-c/DA-d drive the real SSR and SSG paths and fail if
  primary text "sits inside a declarative shadow root"
  (`check-dual-audience.ts:405-407`, `:503-505`). Those stay.
- What they cannot cover on a plain checkout is a *compiled `.aihu` page
  through the flipped compiler*. That belongs in a new **mixed-mode e2e**
  (modeled on `packages/compiler/tests/vite-build-utility-css.e2e.test.ts:70-98`,
  which already runs real Vite builds): scaffold-shaped fixture app — one
  `@route` page (no `$shadow`, utility classes, authored `@style`), one shadow
  leaf, one layout — build + prerender, then assert on bytes:
  1. page text present in `dist/**/index.html` and **not** preceded by any
     `shadowrootmode` occurrence (mirror the check's guard);
  2. `data-aihu-path` hydration markers present;
  3. `dist/assets/*.css` contains the page's utility rules and its
     `@scope (<tag>)`-scoped authored rules (no `:host` in light output);
  4. the compiled leaf chunk still contains the folded
     `__style__.replaceSync(...)` sheet (shadow pipeline alive in the same
     build).

So: DA-e in the check = the classifier gate (cheap, binary-free, ratcheted);
the e2e = the extractability gate for the compiled default path. This
satisfies the amendment's substance ("extractability, not just the
classifier") — but because the amendment names `check:dual-audience`
specifically, §13 flags the placement for founder sign-off. Putting a
compiled-page probe *inside* the check would require committing compiled
golden fixtures or making the check depend on the Rust binary; both were
explicitly avoided in phase 1 (`check-dual-audience.ts:546-550`).

**Residual gap (flag, follow-up):** a file under `src/pages/` with no `@route`
block is still file-routed (`packages/router/src/vite-plugin.ts:426`
`scanPages`) but classifies as a leaf — it silently stays shadow and neither
DA-e nor W-anything sees it. Every shipped example page carries `@route`
today. Recommend a follow-up plugin-side warning ("routed file without
`@route` block"), not a flip blocker.

---

## 6. `--shadow` flag and `create-aihu` wizard: leaf-only

**Decision: leaf-only** (matches the phase-2 issue comment). `css.shadowMode`
/ `--shadow` becomes the **default for components the classifier doesn't
claim** — leaves (and nothing else, since pages and layouts get `'none'` by
classification and `$shadow` is the only page-level override). This is forced
by ratified amendment 3 ("route wins everywhere; `$shadow open` to opt back"):
a global knob that could drag pages back to shadow would reintroduce the
sealed-content default DA4 exists to kill. Mechanically it is already true —
the marker wins over the plugin global at `index.ts:1201` — so the change is
copy, not plumbing:

- `bin.ts:66-98` + `:107`: help text → "shadow mode for **leaf** components
  when css-engine is on; pages/layouts are light DOM (pin `$shadow` per
  component to override)". Same three values; `--shadow none` stays valid
  (all-light app).
- `create.ts:313-318`: wizard prompt copy likewise.
- `cli/src/index.ts:154-168`: config-emission comment; emission rule
  unchanged (`open` writes no block).
- `config.ts:85-95` + plugin JSDoc `index.ts:64-79`: same semantic rewrite.

No deprecation, no new flag.

---

## 7. Doc corrections inventory (claims that go false)

All under `docs/site/`, mirrored byte-identical to
`apps/docs/src/content/docs/` (phase-1 convention).

| Doc | Claim that goes false / stale | Correction |
|-----|-------------------------------|------------|
| `styling.md:56` | "By default every `.aihu` component renders into an open shadow root" | Per-classifier: leaves open, pages/layouts light. |
| `styling.md:58-66` | "flip one knob" — `css.shadowMode` as the whole-app switch | Knob is leaf-only default; pages are light by classification; `$shadow` is the per-component control. |
| `styling.md:68-73` | The shadow/light "what changes" split + verification gotcha are described app-globally | Rewrite per-component: grep `dist/assets/*.css` for **page** utilities, compiled chunks for **leaf** sheets — in the same build. |
| `styling.md:80-85` | `--shadow` scaffold semantics ("default shadow mode is open") | Leaf-only wording (§6); note pages scaffold light with no pin. |
| `utility-classes.md:12` | "Output is scoped CSS (shadow DOM by default, light DOM via `shadowMode: 'none'`)" | "shadow-scoped for leaves, `@scope`-scoped light CSS for pages/layouts". |
| `authoring-components.md:311` | "Styles are scoped to the component shadow root by default (unless `$global` is used)" | False for pages/layouts: scoped via `@scope (<tag>)` in the global cascade; `$global` unchanged. |
| `authoring-components.md:295` | "`$global { ... }` hoists styles out of the shadow root" | For light components there is no shadow root; `$global` = escape the `@scope` wrapper. |
| `migration.md:178-226` (§8) | "Preparing for light-DOM pages (W472)" — future tense; W472 quick-ref row | Rewrite as the landed flip; W472 marked retired (§4). |
| `docs/architecture/thesis.md:207` | — | Append "implemented at vX" note to the DA4 ratified entry. |
| `packages/compiler/js/index.ts:75` | "Per-component override is not yet supported via SFC syntax (post-v1)" | Already false; delete with the C3 JSDoc rewrite. |

Plus new prose: the mixed-mode pipeline section in `styling.md` (both
pipelines in one build; the `@scope` browser floor; the light-in-light
nesting caveat from §3.2).

---

## 8. Layouts: the rule

**Rule: layout SFCs (files under `layoutsDir`, compiled in layout mode)
default to `'none'`, same as pages. `$shadow` in the layout still wins.**

Layouts have no `@route`, so the ratified classifier text makes them leaves →
`'open'`. That outcome is wrong for page-chrome:

- The client mounts the page **inside** the layout root —
  `layoutEl.shadowRoot ?? layoutEl` (`packages/app/src/client.ts:263`). A
  shadow layout seals the light page inside a shadow tree.
- The prerenderer writes the layout shell as **light** HTML and injects page
  content into its `data-aihu-outlet` marker (`prerender.ts:343-355`,
  `:176-190`) — there is no DSD emission anywhere in the repo. A shadow
  layout therefore already renders structurally differently server vs client;
  post-flip that mismatch would sit directly on the crawl-critical path and
  defeat the hydration-parity rationale in the DA4 thesis entry.

**Where:** the Vite plugin, not Rust — layout-ness is a plugin/router
convention (`_isLayoutFile` at `index.ts:1186`; the Rust compiler only sees a
`--tag aihu-layout-*` override, `index.ts:534`). One-line change at
`index.ts:1201` (§3.3 C4). CLI-direct compiles of layout files outside the
plugin get no layout classification — accepted; the layout convention itself
lives in the plugin/router.

**This extends the ratified classifier** ("else leaf → open") — flagged in
§13 for founder ratification.

---

## 9. Versioning and release train

- **Compiler platform binary** `0.1.11 → 0.2.0` (emitted-output behavior
  change): 5 npm manifests + 5 `optionalDependencies` pins + bump guard, per
  the phase-1 pattern (`bf50b223`).
- **css-engine**: new binary flag + output mode → core binary and
  `@aihu/css-engine` `0.4.5 → 0.5.0` (+ its platform manifests).
- **Framework packages (breaking):** `@aihu/compiler` `0.11.0 → 0.12.0` (0.x
  breaking-minor convention), `@aihu/app` `4.0.0 → 5.0.0`, `@aihu/cli` minor
  (scaffold/wizard), docs releases as usual. `@aihu/runtime` **unchanged** —
  no API or default change (`define-element.ts:83` stays `'open'`).
- One release train: binaries + packages together; the W472 release (0.1.11)
  already satisfies the ratified one-warning-release gate.

---

## 10. Acceptance criteria (runnable)

1. `cargo test -p aihu-compiler` — new marker-default tests replace
   `tests/route_shadow_warning.rs`: `@route`+no-`$shadow` → output starts with
   `// @aihu:shadow none`; `$shadow: 'open'` + `@route` → `open` marker;
   no-route no-`$shadow` → no marker; W472 no longer emitted anywhere.
2. `cargo test -p aihu-css-core` — light-mode snapshots: `@scope (<tag>)`
   wrapper, `:scope` tokens, no `:host` token block, `host:` variant and dark
   triple in light form, `$global` outside the wrapper.
3. Mixed-mode e2e (new, §5): one real Vite build+prerender over the
   page+leaf+layout fixture; all four byte-level assertions pass.
4. `bun run check:dual-audience` — DA-e enforced at expected 0; self-test
   passes with flipped polarity.
5. `vitest` compiler suite — `_buildStaticIsland` honors
   `'none'`/`'open'`/`'closed'`; regression test for the options-injected
   half-rewrite (G3); `inject-shadow-mode.test.ts` extended for
   marker-over-global precedence.
6. Scaffold: `aihu app x` (plain and `--css engine`) builds green with no
   `$shadow` pin in the page; `legacy-snapshot.golden` refreshed with
   provenance note.
7. Bump guard passes; docs mirror byte-identical.

---

## 11. Risks and migration

| Risk | Mitigation |
|------|------------|
| `@scope` semantics (browser floor; ancestor-referencing `:root.dark` arm inside the wrapper) | Pre-build browser verification test (§3.2); Option B pre-approved as fallback; degradation = today's unscoped behavior, never worse than status quo. |
| G3 half-rewrite hits `islands: true` consumers the moment markers become universal | Fixed in the same PR; regression test in AC-5. |
| Upgrading apps: pages silently flip to light; authored page styles that relied on shadow scoping change behavior | Semver-major + the already-shipped W472 release; migration.md §8 escape hatches (`$shadow: 'open'`); optional conservative codemod: insert `$shadow: 'open'` into every `@route` component (the W472 `from`/`to` rewrite pair, `lib.rs:207-208`, is machine-applicable). |
| `@theme` on light pages previously lost silently (G2) — fixing it *changes* today's `'none'`-knob apps' rendering (tokens now resolve) | Call out in release notes; it is a bug-fix-shaped change, strictly toward authored intent. |
| Per-page duplicate base CSS growth (G4) | §3.4 dedupe fast-follow; size-budget note in release notes. |
| Dev-server parity (virtual CSS + markers under HMR) | e2e runs dev-mode transform assertions in addition to build (extend AC-3). |
| Pages-dir file without `@route` stays shadow unseen | §5 residual-gap follow-up warning. |

---

## 12. Ordered implementation checklist

Land order chosen so each step is green in isolation; steps 4–6 must ship in
the same release (the flip itself).

1. **css-core light mode** (`compile_sfc_light(ast, tag)`, `@scope`/`:scope`
   emission, `--light-tag` binary flag) + snapshots. Pre-work: the `@scope`
   dark-arm browser verification. [css-engine 0.5.0 groundwork; no consumer
   yet]
2. **css-engine TS surface**: `compileSfc(source, id, { mode })`;
   resolve-binary tests.
3. **Plugin hardening (pre-flip, non-behavioral):** fix `_buildStaticIsland`
   (mode param + options-aware closer), thread `effectiveShadow` into
   `_maybeCompileUtilityCss`, update `CssEngineModule` interface, add
   marker-precedence tests. Behavior unchanged while no default marker exists.
4. **The flip (compiler):** emit.rs default marker; retire W472 (emission, fn,
   test file); types.rs marker doc; binary 0.2.0 bumps.
5. **Plugin defaults:** layout `'none'` default at `index.ts:1201`; authored
   `@style` `@scope` wrap in Rust codegen for effective-light components
   (plain path).
6. **App/CLI:** config + plugin JSDoc rewrites; wizard/`--shadow` copy;
   scaffold pin removal + golden refresh.
7. **check:dual-audience ratchet:** DA-e polarity flip + self-tests +
   baselines.
8. **Mixed-mode e2e** (AC-3) — gates the release.
9. **Docs:** §7 inventory + mirror; migration.md §8 rewrite; thesis note.
10. **Release train:** version bumps (§9), bump guard, release notes
    (breaking-change section + codemod pointer).

---

## 13. Founder decisions required (flagged, not decided here)

1. **Layouts classified as page-chrome (§8).** Extends the ratified classifier
   ("else leaf → open") to layout-mode files. Recommended `'none'`; needs
   ratification because it amends the classifier text.
2. **`@scope` browser floor (§3.2 A vs B).** Option A leans on `@scope`
   (evergreen-2024+). If the framework must serve older engines, Option B
   (tag-prefix) with its specificity shift is the alternative.
3. **Placement of the extractability ratchet (§5).** Amendment 4 names
   `check:dual-audience`; this design puts the compiled-page extractability
   probe in a paired e2e (binary-free check constraint) and keeps the check's
   ratchet at classifier level plus the existing DA-c/DA-d byte-level
   shadow-seal assertions. Confirm this satisfies the amendment's intent.
