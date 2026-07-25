# Light-DOM Leaf Default Flip + `@aihu/css-engine` Rescope

**Date:** 2026-07-24
**Status:** **RATIFIED (mechanism + sequencing) — 2026-07-24.** The founder has ratified both
load-bearing calls this doc exists to make: the flip-last sequencing, and the `data-a` attribute
marker as the scoping mechanism. See "Founder decisions (ratified 2026-07-24)" immediately below
for the record of what's decided and why. Migration §10 steps 1-5 are cleared to start now — they
are net improvements to the already-shipped light-DOM page path independent of whether/when the
final flip (step 8) lands. The sub-decisions in §11 (conditional vs. unconditional marker
stamping, `data-a` vs. `data-aihu-s` naming, the daisyUI recipe layer, whether pages keep a
global-CSS escape beyond `$global`, and whether `css.shadowMode` gains a `legacy` value) remain
OPEN — each carries a recommendation but none is a founder sign-off, and none blocks starting the
arc.
**Scope:** `@aihu/compiler` (`emit.rs` style/shadow emission, template codegen element stamping,
SSR string emit, the Vite plugin's fold + precedence resolution), `@aihu/css-engine`
(`aihu-css-core`: `emit.rs`, `theme.rs`, `variants.rs`, a NEW selector-rewrite pass; the TS
bridge; the shipped `StylePack` CSS), `@aihu/runtime` (`define-element.ts` default,
`define-component.ts` light-DOM slot projection stamping, a new `useId`), `@aihu/primitives`
(consolidate three ad-hoc id counters), `@aihu/cli` (scaffold defaults), plus the 168 leaf
`.aihu` files in-repo and 28 in `fellwork/web`.
**Depends on / extends:**
[`2026-07-23-use-parity-and-daisyui.md`](./2026-07-23-use-parity-and-daisyui.md) — this doc
**revises** that plan's §3(a) Option-4 rationale (§8 below); the *decision* survives, the
*argument* does not — and
[`2026-07-24-use-categorical-parity.md`](./2026-07-24-use-categorical-parity.md) — the
`@aihu/primitives` tabs / accordion / combobox assemblies whose APG conformance is the
motivating requirement for this flip, and whose focus-trap composed-tree-walk item (Wave 0)
gets substantially cheaper if leaves are light.
**Supersedes:** the leaf half of DA4 (#437). DA4's page/layout flip stands unchanged; this doc
generalizes it and collapses the two-tier precedence chain into one.

---

> **Reviewer corrections applied (2026-07-24)**: 5 fixes to this draft —
> (1) added a `:global()`/`:deep()` escape hatch to the rewrite-pass grammar for runtime-created
> content (`html=` blocks, d3/third-party-populated subtrees) that the compiler cannot stamp —
> §1.5, real in-repo victim `examples/hacker-news/src/components/hn-comment.aihu`.
> (2) added `@keyframes` hash-suffixing to the rewrite pass — §1.6 — closing a silent
> cross-component animation-collision class this draft previously did not mention at all.
> (3) namespaced client-minted `data-aihu-i` ordinals (`c{n}`) apart from server-stamped ones
> (`a{n}`) so a component mounted after hydration can never collide with an already-hydrated
> host — §3.2 Seed, R5.
> (4) corrected `useId`'s home: the element-reading core moves to a dependency-free shared
> module, not `@aihu/runtime`, because `@aihu/primitives` is ratified to never import runtime —
> §3.2, step 5 — resolving what the first draft left as an open question while its executable
> step quietly committed to the violating placement.
> (5) re-inventoried `fellwork/web`'s blast radius: 46 `:host`-bearing files, not 19 — 25 leaves
> (6 previously missed) plus 20 pages plus the app layout — and corrected the claim that the
> app's pages are "already light": `apps/web/package.json` pins pre-DA4 `@aihu/runtime`, so its
> pages are still shadow-default today and the leaf flip lands alongside an unabsorbed page flip
> for this specific consumer — §2, §7, §10 step 10, R3.

---

## Founder decisions (ratified 2026-07-24)

These two calls are **ratified**. They are the mechanism and sequencing decisions this document
exists to make; everything else below — options weighed, risks, migration steps — is the
supporting evidence and execution plan for them, not a pending ask. Sub-decisions not listed here
(attribute naming, conditional stamping, the daisyUI layer question, etc.) are unchanged in status
and remain OPEN in §11.

### Decision 1 — Flip last

The leaf-default flip is **approved as an arc**. The literal `?? 'shadow'` → `?? 'light'` change
(§7) is the **last commit** of that arc, not the first. Ratified sequence:

1. **Scoping mechanism** (§1) — the `data-a` marker, the selector-rewrite pass, and the escape
   hatch for runtime-created content (§1.5).
2. **`:host` / `::slotted` / `::part` lowering** (§2).
3. **Token / `:root` global-block fix** (§6) — `emit_host_tokens()` becomes mode-aware.
4. **`useId`** (§3).
5. **Then, and only then, flip the default** (§7).

Steps 1-4 are net improvements to the already-shipped light-DOM **page** path and land
independently of whether the flip itself is ever pulled — that property is exactly what makes
this arc safe to start now, ahead of the final commit. Migration §10 steps 1-5 implement this
sequence in order; step 8 (the flip) does not start until 1-5 have landed and been verified.

### Decision 2 — Scoping mechanism: the `data-a` attribute marker

**Chosen:** a per-element hashed attribute marker (`data-a="<scope-id>"`), stamped on both sides
of a descendant combinator, emitted identically in shadow mode and light mode (§1.3, §1.4).
**Rejected:** native CSS `@scope`, and hashed classes (Svelte-style scoping).

Decisive rationale:

- **(a) One emission shape serves both modes.** `data-a` is a single emission shape used
  identically whether a component is shadow or light — redundant but harmless in shadow (a
  `[data-a]` qualifier on a selector that already only matches inside its own shadow tree).
  `@scope (aihu-card)` **cannot match from inside `aihu-card`'s own shadow tree**, so choosing it
  would force a **second emission shape and a doubled test matrix** for a framework whose entire
  premise is that both modes stay live indefinitely. That cost recurs for the lifetime of the
  dual-mode contract; the attribute marker's cost is paid once, in the compiler.
- **(b) Browser floor and failure mode.** `@scope` raises the browser floor by roughly a year over
  the existing `adoptedStyleSheets`/`replaceSync` requirement already in place, and its failure
  mode is categorically worse: an unsupported `@scope` block **drops all its rules** — the
  component goes unstyled — rather than degrading to "slightly wrong," which is the worst-case
  failure mode of the attribute marker (at most a specific selector fails to match).

**This choice is reversible.** Scoping is compiler-emitted; authors never see `data-a` or write
selectors against it. Swapping it for `@scope` later — if the shadow-mode contract is ever
retired and the "one shape for both modes" argument in (a) stops applying — is a codegen change
plus a test-corpus sweep, **not a consumer migration**: no `.aihu` file's authored `@style` block
or template needs to change. `@scope` is the designated fallback **if and only if** shadow mode
is retired; it does not compete with `data-a` while both modes stay live.

---

## 0. Verdict

**Flip — but not first, and not as one commit.**

The rationale holds up under examination. IDREF-based ARIA (`aria-controls`,
`aria-labelledby`, `aria-describedby`, `aria-activedescendant`) genuinely cannot cross a
shadow boundary; this is not a polyfillable gap, it is how the spec defines IDREF resolution.
The repo already *documents its own defeat* on this point —
`packages/primitives/src/label/index.ts:86` carries the comment "Skip cross-root targets —
IDREFs cannot cross shadow boundaries," i.e. the shipped label primitive has a silent
degraded path today. And the one real consumer corroborates it independently: `fellwork/web`
hand-writes shadow-piercing traversal in **seven** places
(`search-panel.aihu:300`, `command-palette.aihu:47`, `capture-palette.aihu:167`,
`lib/ui/in-page.ts:32`, `pages/study/[ref].aihu:585`, `pages/subscribe.aihu:185`,
`pages/read/[ref].aihu:707`) purely to reach into leaf shadow roots from already-light pages.
That is a framework tax being paid in application code, which is the clearest possible signal
that the default is wrong. Tabs, accordion, and combobox — the three primitives on the
categorical-parity roadmap — are all IDREF-wired by APG. Building them on a shadow default
means building them broken.

**Where the evidence argues against the naive version of the ask:** the flip cannot be the
`?? 'shadow'` → `?? 'light'` one-liner it looks like, because **light DOM for pages today is
not a scoping mechanism — it is an escape from one.** The css-engine emits `.label { … }`,
`.error { … }`, `p { … }`, `[hidden] { display: none }` and a global
`*, ::before, ::after { border-style: solid; border-width: 0 }` preflight reset, and the light
path (`_foldCssEngineStylesGlobal`, `packages/compiler/js/index.ts:859-874`, and
`_globalizeAuthoredStyle`, `packages/compiler/js/index.ts:165-172`) relocates that string
**verbatim** into the document
cascade with zero selector rewriting. That is survivable for 23 pages, one of which is on
screen at a time. Applied to 168 leaves — 110 of which have an authored `@style` block — it is
not a migration, it is a regression: every generic class name in the repo becomes a global
symbol, and every app that installs aihu gets its `border-width` reset on every element on the
page, including third-party widgets.

So the verdict is: **flip the default, but land the scoping mechanism, the `:host` lowering,
the token fix and `useId` first, in that order, with the default flip as the *last* commit of
the arc.** Steps 1-4 are pure improvements to the already-shipped light-DOM path for pages —
they are worth landing even if the flip were cancelled. That property is what makes this arc
safe to start before the founder has signed off on the endpoint.

**Where the evidence argues for something narrower than "global default change":** nowhere on
the *default* itself — with no external consumers, and 196 in-repo/consumer components that are
all ours, a default flip is cheaper than a per-app opt-in flag we would have to carry forever.
But the *rollout* should stage behind the escape hatch that already exists: `fellwork/web`
pins `css: { shadowMode: 'shadow' }` for one release while it migrates its `:host`-bearing
surface — **46 files**, not the 19 leaf components originally counted here: 25 leaves plus 20
pages plus the app layout (§10 step 10 has the corrected inventory and the reason the page count
matters — the app is still pre-DA4) — then removes the pin. No new configuration surface is
required for that; §7 covers it.

---

## 1. The decision that matters: how leaf CSS is scoped without a shadow root

### 1.1 There is nothing to extend

The investigation's most consequential finding is negative. `aihu-css-core` states its scoping
model outright at `packages/css-engine/crates/aihu-css-core/src/emit.rs:6-9`: *"Class selectors
inside a shadow `<style>` only match that shadow tree — that IS the scoping mechanism."* There
is no hash, no attribute scoping, no `:where()` wrapper, no CSS-Modules step anywhere in the
pipeline. `_hashIdForUtilityCss` (`packages/compiler/js/index.ts:820-838`) hashes only a
virtual-module cache key; it never touches a selector.

So the answer to "if pages already have a light-DOM scoping answer, extend it" is: **they do
not have one.** Leaves need a genuinely new mechanism, chosen on evidence.

### 1.2 First: split the emission in two — utilities are not the thing that needs scoping

Before picking a mechanism, the output has to be decomposed, because `emit_sfc_scoped`
(`aihu-css-core/src/emit.rs:278-353`) currently concatenates four categorically different
things into one string:

| Channel | Content | Correct light-DOM treatment |
|---|---|---|
| **tokens** | `emit_host_tokens()` → `:host { --color-*: … }` | ONE global block at `:root`, hoisted, shared |
| **reset** | `*, ::before, ::after { border-style: solid; border-width: 0 }` | ONE global rule, lowest layer, **scoped to aihu-owned elements** |
| **utilities** | `.p-4 { padding: 1rem }`, variant-lowered | Global, **unscoped**, deduplicated — this is correct and desirable |
| **authored `@style`** | arbitrary author selectors | **Scoped per component** — the only channel that needs a mechanism |

Utility classes must NOT be scoped. They are a content-derived, collision-free vocabulary by
construction: `.p-4` means the same thing in every component, so N components emitting it is a
dedup problem, not a collision problem. Scoping them would defeat the entire point (and produce
168 copies of the Tailwind surface). This decomposition is load-bearing: it cuts the actual
scoping problem down from "all css-engine output" to "the 110 files with an `@style` block."

### 1.3 Options weighed

| Mechanism | Works in shadow mode too? | Raises browser floor? | Child-component leak | Template codegen cost | Verdict |
|---|---|---|---|---|---|
| **Attribute marker per element** (Vue `data-v-*`) | **Yes — identical emission** | No | **Structurally impossible** | Stamp elements in 2 emitters | **CHOSEN** |
| Hashed class per element (Svelte `.svelte-xyz`) | Yes | No | Impossible | Same + must merge with dynamic `class` bindings | Rejected — see below |
| Tag-rooted descendant (`aihu-card .label`) | **No** — a tag root never matches inside its own shadow tree | No | **Real**: `aihu-card .label` hits `aihu-badge`'s internal `.label` | Zero | Rejected |
| Native `@scope` + donut | No (same tag-root problem) | **Yes** — Firefox 128 / Safari 17.4, ~1 yr behind the repo's existing `adoptedStyleSheets` floor | Solvable via `to ([data-aihu-host])` | Zero | Rejected — see below |
| `:where()` wrapping | n/a | No | n/a | n/a | Not a scoping mechanism — it's a *specificity* tool; used in §4, not here |
| Cascade layers | n/a | No | n/a | n/a | Same — ordering, not scoping; used in §4 |

**Why not the hashed class.** Svelte's approach is equivalent in power, but it is
repo-hostile here for one specific reason: `@aihu/css-engine` **scans template `class`
attributes** to decide which utilities to emit, and `expand_apply` hard-errors on unknown
utilities. Injecting a synthetic `.aihu-x1y2z3` token into the very attribute the scanner
reads means the scanner must now special-case it, and any future strictness on unknown classes
becomes a trap. Aihu also allows expression-driven `class` bindings, so the hash would have to
be merged into author expressions at runtime. An attribute is orthogonal to `class`, invisible
to the scanner, and cannot collide with `classList` manipulation, `:has()`, or a consumer's
own class logic.

**Why not `@scope`.** It is genuinely elegant for this problem — `@scope (aihu-card) to
([data-aihu-host])` gives exact component-subtree semantics with zero per-element markers, and
the donut limit naturally stops at nested components. It loses on three counts. (1) It cannot
serve shadow mode: a `aihu-card` scope root does not match from inside `aihu-card`'s own shadow
tree, so we would maintain **two emission shapes and two test matrices** for a framework whose
entire premise here is that both modes stay live. (2) It raises the browser floor by roughly a
year over the existing `adoptedStyleSheets`/`replaceSync` requirement, with no degradation path
— an unsupported `@scope` block drops *all* its rules, so the failure mode is "the component is
unstyled," not "the component is slightly wrong." (3) `@scope`'s proximity-based cascade is a
third ordering axis on top of specificity and layers; debugging a three-axis cascade in a
framework whose users have already been surprised by shadow-boundary behavior is a cost we
should not volunteer for. (This is a founder-ratified call, not a live tradeoff — see "Founder
decisions" above, including the note that the choice is reversible if shadow mode is ever
retired.)

The decisive property of the attribute marker is the one in column 2: **one emission shape
serves both modes.** In shadow mode the marker is redundant but harmless (a `[data-a="…"]`
qualifier on a selector that already only matches inside its own tree). That single fact halves
the combinatorics of every css-engine test, every visual check, and every bug report for the
lifetime of the dual-mode contract.

### 1.4 Exact emission shape

**Marker.** `data-a="<h>"` where `<h>` is the first 8 hex chars of a hash of the module's
**repo-relative path** — deliberately *not* content, so the marker is stable across edits (HMR
and SSR/hydration must not churn it). Derived once in the Rust compiler alongside `tag_name`
and threaded into both the template emitters and `aihu-css-compile` (a new `--scope-id` flag on
the `--ast-json` invocation).

**Stamped only when needed.** The compiler stamps `data-a` on template-created elements **only
when the SFC has a non-`$global` `@style` block**. Components whose styling is utilities-only
(58 of the 168 leaves) pay zero bytes. `$global` blocks are unscoped by definition and stamp
nothing.

**Selector rewrite** (new pass in `aihu-css-core`, applied to the authored `@style` channel
only). Every compound selector in the *subject* position gains the attribute:

```css
/* authored */                    /* emitted (both modes) */
.label { … }                   →  .label[data-a="1a2b3c4d"] { … }
p { … }                        →  p[data-a="1a2b3c4d"] { … }
[hidden] { display: none }     →  [hidden][data-a="1a2b3c4d"] { display: none }
.tab-panel p { … }             →  .tab-panel[data-a="1a2b3c4d"] p[data-a="1a2b3c4d"] { … }
.row > td:first-child { … }    →  .row[data-a="1a2b3c4d"] > td[data-a="1a2b3c4d"]:first-child { … }
&:hover (nested)               →  nesting preserved; the parent already carries the attribute
@media (…) { .x { … } }        →  at-rule preserved, inner selectors rewritten
```

Both sides of a descendant combinator are stamped (Vue stamps only the subject; stamping both
is strictly tighter and prevents a component's `.a .b` from reaching through a child component
into *its* `.b`). `:root`, `html`, `body` are left alone with a warning — they cannot be scoped
and almost certainly want `$global`.

**Tokens and reset**, hoisted out of the per-component sheet into one shared module:

```css
@layer aihu.reset, aihu.tokens, aihu.components, aihu.utilities;
@layer aihu.reset   { [data-a], [data-a]::before, [data-a]::after {
                        border-style: solid; border-width: 0 } }
@layer aihu.tokens  { :root { --color-primary: …; } }
```

Note the reset is now scoped to aihu-stamped elements. Shipping the current unqualified `*`
selector into a consumer's global cascade is a live bleed-out bug the flip would otherwise
multiply by 168.

**Per-component sheet** (one per SFC, `@layer`-wrapped so ordering is deterministic regardless
of import order):

```css
@layer aihu.components { .label[data-a="1a2b3c4d"] { … } }
@layer aihu.utilities  { .p-4 { padding: 1rem } .md\:flex { … } }
```

**This applies to pages and layouts too.** DA4's pages currently ship genuinely global CSS, and
`apps/docs/src/content/docs/migration.md:223` documents the resulting hand-migration ("bare
element selectors apply app-wide") as an accepted cost. Once the mechanism exists there is no
reason pages should keep paying it. Making the transform universal also removes the last
behavioral difference between a page and a leaf, which is what lets §7 collapse the precedence
chain.

### 1.5 Escape hatch for runtime-created content — `:global()` and `:deep()`

**Reviewer finding.** Both-sides stamping (§1.4) means an authored rule that today matches the
whole shadow tree — including content the compiler never touched — silently stops matching the
instant a component flips to light. Three real sources of such content: (a) `html=` blocks
(`SfcNode::HtmlBlock`), which inject a raw string as markup the compiler cannot see inside to
stamp; (b) nodes a third-party library builds directly (d3 selections appending `<path>`/`<text>`
into a container the compiler *does* own) — the flip's own interop rationale produces exactly
this case; (c) any other runtime-constructed DOM (manual `document.createElement`, a portal
target). This is not hypothetical: `examples/hacker-news/src/components/hn-comment.aihu:20` uses
`html={comment().text}` and already writes `.text :global(p)` / `.text :global(pre)` at lines
33-34 — an author has already reached for exactly this operator, and neither the compiler nor
`aihu-css-core` recognizes it today (it currently passes through unstamped only because *nothing*
is stamped pre-flip; post-flip it would be silently rewritten like any other selector unless
handled explicitly).

**Resolution — options weighed.** Three shapes were considered for closing this gap:

- **(a) An opt-in looser per-component scope** — e.g. a blanket `[data-a] *` fallback rule
  emitted for any component that uses `html=`, accepting descendant bleed into runtime-injected
  content as the price of coverage.
- **(b) A documented limitation** — state that `@style` selectors never target `html=`-injected
  content, and require such content to carry its own (unscoped or `$global`) classes.
- **(c) Runtime stamping of `html=` output** — walk the injected string/fragment at mount time
  and stamp `data-a` onto it, the same way the compiler stamps template-created elements, so the
  marker's coverage is complete rather than partial.

**Recommendation: neither (a), (b), nor (c) as stated — a narrower shape that keeps the useful
half of each.** (c) is rejected outright: it requires parsing or DOM-walking runtime-injected
content (a raw HTML string, or reaching into a d3-managed subtree) on every mount, on a path the
compiler cannot reason about statically — real per-mount cost and real fragility for a case that
is rare today (2 in-repo components). (a) is rejected because a blanket, component-wide fallback
bleeds scoping for the **entire** component the instant it contains one `html=` block, quietly
defeating the bleed-out guarantee in §4 for content the author never intended to expose. What
ships is closest to (b) — a documented limitation — but sharpened from a prose warning into an
explicit, parsed, **selector-level** operator: `:global(sel)` / `:deep(sel)` (below) let an
author opt exactly the selectors that must reach runtime-created content out of stamping, leaving
every other selector in the same component fully scoped. This is strictly narrower than (a)
(per-selector, not per-component) and strictly more actionable than (b) (a parsed, testable
operator an author writes once, rather than a convention they must remember and self-police).
This is the resolution, not merely a noted gap; see "Mechanism" below.

**Mechanism.** The rewrite pass (§1.4) recognizes two operators before running the default
both-sides-stamp rule, matching the prior art already in the wild plus Vue's `:deep()` precedent:

| Operator | Semantics | Emission |
|---|---|---|
| `:global(sel)` | Everything inside `sel` is emitted **unstamped** — an explicit opt-out for content the compiler does not own. | `.text :global(p)` → `.text[data-a="…"] p` (left side stamped, right side passed through verbatim) |
| `:deep(sel)` | Stamp only the **left side** of the combinator; `sel` itself (and its descendants) are left unstamped. New — formalizes what components with `html=` blocks or d3-mounted subtrees need without going fully `$global`. | `.text :deep(p)` → same emission as `:global(p)` in this two-token case; the operators read identically for a single trailing selector and diverge once nesting/coordination with other stamped siblings is involved — both are provided because authors reaching for Vue muscle memory expect `:deep()` and authors already in this codebase have written `:global()` |

Both operators are parsed in the new selector-rewrite pass (not regex) and are **modeless**: in
shadow mode they are no-ops (the shadow boundary already provides the isolation `:global`/`:deep`
exist to bypass), so authored rules using them do not need a mode branch. `html=`-bearing
components and any deliberately d3/runtime-populated container are the intended audience;
`$global` remains the correct choice only when the *entire* block should escape scoping.

**Test-matrix impact.** `examples/hacker-news/hn-comment.aihu` and `apps/docs/src/components/
docs-shell.aihu` (the other in-repo `html=`/runtime-DOM user, see §2) join the golden-file
corpus (§9 R1, §10 step 3) specifically to exercise `:global()`/`:deep()` alongside the plain
both-sides case. "Runtime-created content" is added as its own row in the both-modes test matrix
(§10 step 7) rather than folded into the generic selector-shape coverage, since it is the one
category where shadow and light modes are *not* emission-equivalent in spirit even though the
emitted CSS happens to look similar (shadow mode needed no annotation at all; light mode needs an
explicit author signal).

---

## 2. `:host` / `::slotted` / `::part` lowering

`variants.rs:149-176,260-274` lowers these to literal `:host(…)`, `::slotted(…)`, `::part(…)`
with **no mode branch anywhere**. In light DOM they parse fine and match nothing — the worst
possible failure mode, because it is silent. The rewrite pass gains a mode parameter and lowers
them:

| Authored | Shadow mode (unchanged) | Light mode |
|---|---|---|
| `:host` | `:host` | `<tag>` — e.g. `aihu-tier-toggle` |
| `:host(.foo)` / `:host([accent="study"])` | as today | `aihu-tier-toggle.foo` / `aihu-tier-toggle[accent="study"]` |
| `:host-context(.dark) .x` | `:host-context(…)` (Chromium-only!) | `.dark .x[data-a="…"]` — **strictly better than shadow mode**, which is Chromium-only for this selector |
| `::slotted(p)` | `::slotted(p)` | `p[data-a="…"]` — see below |
| `::part(handle)` | `::part(handle)` | `[part~="handle"][data-a="…"]` |

**`::slotted` needs a runtime companion.** `_projectLightDomSlot`
(`packages/runtime/src/define-component.ts:294-309`) *replaces* the `<slot>` element with the
assigned nodes, so after projection there is no anchor element left to select against. The fix
is Vue's: `_projectLightDomSlot` stamps each projected **top-level element node** with the
*host component's* `data-a` value. That reproduces `::slotted()`'s exact contract (it matches
only top-level assigned nodes, never their descendants) with no selector gymnastics. Projected
nodes therefore carry two scope attributes — their author's and their host's — which is
correct: they are styleable by both, exactly as `::slotted` + the parent's own scope behave in
shadow DOM. The compiler must emit `data-a` as an **appendable** attribute for this (a list, or
a second attribute `data-as`) rather than an overwrite; a second attribute is simpler and is
what this design specifies.

**`::part` is a deliberate downgrade with no loss.** `::part()` exists so *outside* consumers
can style *into* a shadow tree; a component using `::part()` in its own sheet is already
writing a no-op-shaped selector. In light DOM the consumer simply writes `aihu-switch
[part~="handle"]` — direct access is the entire point of the flip. Lowering internal `::part()`
to `[part~="name"][data-a="…"]` keeps authored rules working; the *external* contract is
documented as "in light mode, `part=` is a plain attribute, select it directly."

**Migration of existing occurrences.** In-repo: 2 `.aihu` files
(`apps/docs/src/components/theme-toggle.aihu`, `docs-shell.aihu`, 23 occurrences), 0 in
`packages/primitives/src`, 1 comment in `packages/css-engine/src`. These need **no source
change** — the lowering handles them. In `fellwork/web`, the **leaf** subset — corrected against
a reviewer re-count: 25 components, not 19; the prior pass here missed `lexicon-panel`,
`lexgraph-map`, `lexgraph-explorer`, `lexgraph-picker`, `recents-sheet`, and
`workspace-sidebar` — use `:host { display: block }` as their box-layout mechanism
(`voice-picker`, `tier-toggle`, `capture-palette`, `command-palette`, `thumb-bar`,
`journal-{mirror,doorway,entry,room}`, `site-nav`, `site-footer`, `hero-section`,
`syntax-{tree,flow,outline}`, `study-layer-card`, `exegesis-section`, `passage-picker`,
`lexicon-panel`, `lexgraph-map`, `lexgraph-explorer`, `lexgraph-picker`, `recents-sheet`,
`workspace-sidebar`). These also need no source change once lowering lands — `:host { display:
block }` becomes `aihu-voice-picker { display: block }`, which is exactly the intent. **This
list is leaves only.** The app also has 20 `:host`-bearing *pages* plus `layouts/app.aihu` —
a separate, larger issue than a source-editing one, because those pages are still on
`@aihu/runtime` 2.0.0 (pre-DA4) and have not taken the page-side light-DOM flip at all; see §10
step 10 for the corrected 46-file inventory and why the page count changes the migration's
risk shape, not just its size. The migration risk for the leaf list here is in verification, not
in editing: §9 R3.

### 1.6 `@keyframes` namespace collision

**Reviewer finding.** `@keyframes` names are not selectors — the rewrite pass in §1.4 does not
touch them, and the emitter (`aihu-css-core/src/emit.rs`, `animation_keyframes` path) already
hoists `@keyframes` blocks as top-level siblings rather than nesting them under the per-component
scope. In shadow mode this is harmless: each shadow tree is its own style-sheet namespace, so two
components can both define `@keyframes spin` with different bodies and never collide. In light
mode all `@keyframes` share one document-level namespace. Two of the 168 leaves authoring
`@keyframes spin` with different keyframe bodies collide silently — whichever rule loads/parses
last wins for *every* element in the document animating `spin`, including in the component that
did not intend to change. Utility-emitted keyframes (from animation utility classes) are safe
because their content is generated deterministically from the same input and is therefore
dedup-safe by construction; the collision risk is specific to hand-authored `@keyframes` blocks.

**Mechanism.** The selector-rewrite pass (§1.4) gains a companion transform for the authored
channel only: every `@keyframes <name>` declaration is renamed to `<name>-<data-a-hash>`
(Vue's scoped-CSS precedent), and every `animation` / `animation-name` declaration in rules
scoped to the *same* component that references `<name>` is rewritten to the suffixed name. This
is a same-file, same-scope-id operation — no cross-component coordination needed — and runs in
the same Rust pass that stamps selectors, using the same `data-a` hash already threaded in.
Utility-emitted `@keyframes` are left alone: they stay global and deduplicated, which is correct
and desirable (§1.2's utility-channel argument applies identically here).

**Scope note.** This did not exist in the design doc's first draft — the doc previously made no
mention of keyframes at all despite the emitter's hoisting behavior being pre-existing. It is a
required part of §1.4's rewrite pass, not an optional follow-up; without it the flip introduces a
new, silent, load-order-dependent animation-collision class across 168 components that did not
exist under shadow mode.

---

## 3. Per-instance IDs for ARIA IDREF wiring

### 3.1 The gap

No compiler-level mechanism exists. Eight `.aihu` files author literal static `id="…"`
attributes today (`apps/storybook/src/recipes/aihu-{switch,input,checkbox,textarea}.aihu`,
`cookbook/aria-form.aihu`, `apps/docs/src/components/docs-shell.aihu`, …). In shadow mode each
root is its own ID scope and duplicates are harmless. In light DOM, two mounted instances put
two identical `id`s in one document, and every IDREF pointing at them resolves to whichever
came first. Meanwhile the hand-written TS primitives solved this **three separate times with no
shared util**: `primitives/src/label/index.ts:38-42`, `primitives/src/form-control/index.ts:35-36`,
`primitives/src/tooltip/index.ts:45-46` each carry a private module counter.

### 3.2 Mechanism: `useId()`, seeded from a per-instance scope id

**Layer — revised per reviewer finding.** The first draft of this doc put `useId` in
`@aihu/runtime` and exported it "for `@aihu/primitives`" to consume. That placement was checked
against the wrong rule: `@aihu/use` signals-only/no-DOM-coupling
(`2026-07-22-effect-scope-and-composables.md` §2) is not the rule that governs this — the rule
that governs it is that same doc's **§4 layering plan**, which pins `@aihu/primitives` as
hand-written custom elements that **never import `@aihu/runtime`** (verified against
`label/index.ts:38-42`, `form-control/index.ts:35-36`, `tooltip/index.ts:45-46` — none of the
three ad-hoc counters imports runtime today). Making `@aihu/primitives` depend on `@aihu/runtime`
for `useId` drags the compiled-component runtime transitively into all 17 primitives' size rows —
exactly the cost §4 of that doc rejects, and precisely the placement this design's own open
questions (§11 Q3, prior draft) flagged as unresolved while the executable migration step (§10
step 5) went ahead and committed to it anyway. That is corrected here rather than left open.

**Resolved placement.** The element-reading core — read `data-aihu-i` off a host, maintain a
per-host local sequence, mint `a{n}-{seq}` / `c{n}-{seq}` per §3.2's seed rules — lives in a
**dependency-free shared module** with no import of `@aihu/runtime` or `@aihu/use`: either a
`primitives-internal` entry point inside the existing `@aihu/primitives` package, or a new
micro-package (e.g. `@aihu/id-scope`) with zero dependencies, whichever the primitives-layer
maintainers prefer at build time (not a semantic difference, a packaging one). `@aihu/runtime`
**wraps or re-exports** that core for compiled `.aihu` components — the compiler-facing `useId()`
call site continues to work exactly as specified below — but `@aihu/primitives`'s three ad-hoc
counters collapse onto the shared core directly, never through `@aihu/runtime`. This keeps the
layering rule intact in both directions: primitives gain a shared util without gaining a runtime
dependency, and compiled components still get a single `useId()` entry point.

**Seed.** Every component instance gets a scope ordinal exposed as `data-aihu-i` on its host.

- **SSR**: assigned during the SSR walk from a render-scoped counter. The walk is already
  path-aware (`ssr_string_emit.rs` emits `data-aihu-path="…"` on every non-fragment branch in
  hydratable output), so this is one more attribute on an existing, already-deterministic pass.
- **Hydration**: the runtime **always** reads `data-aihu-i` off the host and never allocates.
  This is the SSR/hydration-stability requirement, and stating it as an invariant is what makes
  it hold: the client never *computes* an id during hydration, it *reads* one. A counter-based
  client scheme would be at the mercy of custom-element upgrade order, which is not guaranteed
  to match SSR document order once islands/lazy definition are in play.
- **Pure CSR, mounted after hydration**: no server output exists *for that instance* to
  disagree with, but the page around it may already be hydrated. A component mounted
  client-side after initial hydration — an `$if`-gated dialog, a route-transition target, a
  lazily-defined island — takes this path and, absent a fix, would allocate from a
  module-level counter starting at 0, which can mint the same ordinal a server-stamped host
  already used on the same page. That produces two elements with colliding `data-aihu-i` and,
  downstream, colliding `id`s wired into `aria-controls`/`aria-labelledby` — the exact failure
  class (duplicate IDREF targets) the flip exists to eliminate, reintroduced by the id
  *mechanism* itself rather than by the DOM. **Fix**: client-allocated ordinals use a visibly
  distinct namespace from server ordinals — `c{n}` for client-minted, `a{n}` reserved for
  server-stamped — so the two counters can never collide regardless of value. (An alternative,
  seeding the client counter from a server-emitted max, was considered and rejected: it
  requires threading a global max through every page, whereas a namespace prefix is a one-line
  change with no cross-cutting state.)

**Invariant, stated precisely** (this supersedes the informal "hydration reads, never
allocates" framing above, which covered only the server-rendered-host case): *a given page may
contain both server-stamped (`a{n}`) and client-minted (`c{n}`) hosts simultaneously; hydration
of a server-stamped host always reads `data-aihu-i` and never allocates; a host with no
server-rendered counterpart always allocates from the client counter and never reads.* The two
counters are namespaced apart specifically so neither path needs to know the other is running.
A hydrate-then-mount-new-component test (hydrate a page with N server-stamped hosts, then
mount an additional client-only component with a colliding-by-value ordinal) is added to the
migration's test matrix (§10 step 5) to make this concrete rather than aspirational.

**API.** `useId(prefix?)` returns `` `a${scopeOrdinal}-${localSeq}` `` for server-seeded hosts
and `` `c${scopeOrdinal}-${localSeq}` `` for pure-client hosts (e.g. `a7-0`, `c3-1`). Short by
design — these end up in `aria-*` attributes on every element in the page.

**Compiler support for `.aihu` templates.** A codegen pass detects a literal `id="x"` in a
template **that is also referenced from the same template** by `for`, `aria-controls`,
`aria-labelledby`, `aria-describedby`, `aria-activedescendant`, `aria-owns`, `list`, `form`,
`headers`, `popovertarget`, or `anchor`, and rewrites **both sides** to the same
`useId('x')` value. An `id` with **no** in-template referent is left verbatim and gets a new
advisory diagnostic (it is probably a deep-link anchor target, and rewriting it would break
`#fragment` navigation — that asymmetry is deliberate and is the safest available default).

---

## 4. Style bleed: what is mitigated and what is not

**Bleed OUT (component → app)** is fully mitigable and is mitigated:

1. Every authored `@style` selector carries `[data-a="…"]` (§1.4) — a component's `.label`
   cannot reach any element it did not create.
2. The preflight reset is qualified to `[data-a]` — no more unqualified `*` in the global
   cascade.
3. Utilities are global *by design*; their names are content-derived and identical across
   emitters, so "collision" is dedup, not conflict.
4. `$global` remains the explicit, greppable opt-out for CSS that genuinely must be global.
5. Authored `@keyframes` are hash-suffixed with the component's `data-a` scope id, and referencing
   `animation`/`animation-name` declarations are rewritten to match (§1.6) — two components both
   authoring `@keyframes spin` cannot collide in the single document-level keyframes namespace
   that light mode introduces (shadow mode gets this isolation for free; light mode does not).
   Utility-emitted keyframes are exempt and stay global/deduplicated by design.

**Specificity strategy.** The attribute adds exactly `(0,1,0)` to every scoped selector,
uniformly — intra-component ordering is preserved exactly. Selectors are **not** wrapped in
`:where()`: zero-specificity scoped rules would lose to any consumer's `article p`, which
inverts the intent. `:where()` is used only where css-engine already needs specificity
neutrality (variant lowering), not by this pass.

**Cascade layers** order the four channels deterministically:
`@layer aihu.reset, aihu.tokens, aihu.components, aihu.utilities;` — declared once in the
shared base module so ordering does not depend on import order. Utilities beating component
CSS is deliberate: `class="mt-8"` on a component that also styles `.card { margin-top: 0 }`
should win, which is Tailwind's model and what authors expect.

**Bleed IN (app → component) is NOT mitigable, and should not be presented as if it were.**
Unlayered author CSS beats *all* layered author CSS, so an app's `article p { margin: 0 }`
wins over `p[data-a][…]` inside `@layer aihu.components`. That is not an oversight; it is the
correct escape hatch and it is the direct consequence of the founder's own rationale — third-
party interop (d3), native form participation, and cross-boundary IDREFs all require that
outside CSS *can* reach in. What we can do is make it legible and give consumers a knob:

- Document `@layer` participation: an app that wants component styles to win puts its own
  global CSS in a layer declared **before** `aihu.components`.
- Ship the layer names as public API in the css-engine README, not as an implementation detail.
- Keep `$shadow: 'shadow'` as the real answer for any component that genuinely requires
  encapsulation (embeds, third-party-hostile environments, syndicated widgets). That is the
  whole reason the flip is a *default* and not a removal.

Also not mitigable, and worth saying plainly: third-party resets (`normalize.css`, a host
page's `* { box-sizing }`) now apply to component internals; `!important` from app CSS wins
unconditionally; and inherited properties (font, color, line-height) now flow in from ancestors
where the shadow boundary used to stop them. That last one will cause visible diffs in
components that relied on inheriting from the shadow root rather than from the page.

---

## 5. Injection and deduplication for N light-DOM instances

Today, light mode uses **two** mechanisms glued together by string surgery in the Vite plugin:
utilities go through a virtual `.css` module into Vite's CSS pipeline
(`_foldCssEngineStylesGlobal`, `packages/compiler/js/index.ts:859`), while the authored `@style`
block gets its `(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__]` line rewritten into
a `document.adoptedStyleSheets` push (`_globalizeAuthoredStyle`, lines 165-172). Both are
already instance-count-safe — the module-level `__style__` const is shared across instances and
the push is `.includes()`-guarded — so duplicate injection is **not** the problem to solve. Two
different problems are:

**(a) FOUC / hydration flash.** The authored-`@style` path injects at first *mount*. SSR'd
markup therefore renders unstyled until the component's JS executes. Invisible for a page
(one instance, above the fold, styles arrive with the page bundle); very visible for 168 leaves
hydrating progressively.

**(b) N× duplication of tokens and preflight in the bundle.** Each of the 168 virtual CSS
modules currently carries the full `emit_host_tokens()` block plus the preflight rule. Vite
bundles them as distinct modules; identical rules across modules are not merged.

**Resolution — one mechanism, build-time, for both channels:**

1. Route the authored `@style` block through the **same** virtual-`.css`-module path as
   utilities. Scoped `@style` blocks are always static — the `$reactive()` style-macro path in
   `emit_style_block` (`packages/compiler/src/codegen/emit.rs:96-151`) fires only for
   `StyleScope::Global`, verified — so there is nothing dynamic to preserve. This deletes
   `_globalizeAuthoredStyle` entirely, kills the FOUC, and means component CSS ships in the
   route chunk's CSS asset alongside its JS (Vite already splits CSS per chunk, so the CSS
   follows the component's code-split boundary for free).
2. Hoist tokens + preflight + the `@layer` declaration into **one** shared virtual module
   (`\0virtual:aihu-base.css`), imported by every component module. ESM dedup gives exactly one
   copy. This also finally makes the compiler-emitted token block *correct* in light mode — see
   §6.
3. `document.adoptedStyleSheets` survives only for `$global` blocks carrying `$reactive()`
   macros, which is its legitimate use.
4. **Shadow mode is untouched**: `_foldCssEngineStyles` keeps folding into the per-component
   `CSSStyleSheet`, which every shadow root adopts by reference. One sheet object, N adopters.

---

## 6. The token bug this flip forces us to fix

`theme.rs:103-117` hardcodes `:host { --color-*: … }`. In light mode that block lands in a
document-level stylesheet where it matches nothing, so none of its custom properties are ever
defined. This is a **live, currently-untested bug** on the already-shipped page path — masked
only because apps separately `<link>` the static `packages/css-engine/styles/aihu-default.css`,
which defines the same tokens at real `:root`/`.dark` scope (see
`examples/css-engine-utility/index.html:8` and its `vite.config.ts` comment). The e2e test
asserts the bug (`packages/css-engine/tests/sfc-e2e.test.ts:24`:
`expect(css).toContain(':host {')`), and the compiler-side test does too
(`packages/compiler/tests/css-engine-hook.test.ts:136-137`).

Fix: `emit_host_tokens()` becomes mode-aware — `:host {}` in shadow mode, `:root {}` in light
mode, emitted into `@layer aihu.tokens` in the shared base module (§5.2). Both tests get
rewritten to assert the correct selector per mode rather than the presence of a string.

The `dark:` variant path needs no change: `emit.rs:189-200` already emits the comma-list
`:host([data-theme="dark"]) {sel}, :root.dark {sel}`, whose second branch keeps working in the
global cascade. Worth noting for §8 — this is also where the daisyUI plan's ratified
`data-theme`-on-`<html>` convention lands naturally, since `[data-theme]` on the document root
cascades into light-DOM leaves with no `:host` machinery at all.

---

## 7. Flip mechanics

**The token.** `packages/compiler/src/codegen/emit.rs:1155` currently emits the distinct
default-marker `// @aihu:shadow-default light` **only** when `unit.source.route.is_some()`.
Drop the condition: emit it whenever the author did not pin `$shadow`. The token keeps its name
and its rank (below an explicit plugin-global config), so nothing about the marker protocol
changes — only which units receive it.

**The runtime line.** `packages/runtime/src/define-element.ts:111` —
`const mode: ShadowMode = options?.shadowMode ?? 'shadow'` → `?? 'light'`. This is the literal
line the ask is about; it governs hand-written `defineElement` calls where the plugin injected
nothing.

**The plugin.** `packages/compiler/js/index.ts:1420-1440` — `impliedShadowDefault` becomes
`perFileShadowDefault ?? 'light'`; `_isLayoutFile`'s special-case default becomes redundant
(keep the helper, it is still used for `_layoutTag`/`_passivizeOutlet`).

**New precedence chain — three levels, not four:**

> `$shadow` pin (per file) > plugin-global `css.shadowMode` > universal default `'light'`

The page/leaf distinction disappears from the chain entirely. That is the real prize of this
change: the current four-level chain requires anyone reasoning about a component's mode to
first classify the file, and file classification is split across two languages (`@route` in
Rust, `_isLayoutFile` in JS, because "the compiler cannot see layout-ness"). After the flip
nobody needs to classify anything.

**`$shadow` and `css.shadowMode` semantics are unchanged.** Both stay binary
(`'light' | 'shadow'`); `'closed'` stays unsupported for the documented reason (a closed root
nulls `this.shadowRoot` and misdetects as light DOM everywhere the
`this.shadowRoot ?? this` pattern is used). No new values, no `'auto'`.

**One expressiveness loss, stated honestly:** there will be no way to say "pages light, leaves
shadow" globally — the pre-flip default — except by pinning `$shadow: 'shadow'` per leaf. That
configuration is the thing we are deliberately abolishing, so the loss is intentional, but it
should be in the changelog rather than discovered.

**How a consumer opts a component back into shadow:**

```
@state
  $shadow: 'shadow'
```

Per file, outranks everything, already implemented and parsed
(`packages/compiler/src/parser/state_macros.rs:283-307`) — zero new machinery. App-wide:
`css: { shadowMode: 'shadow' }` in the aihu config (`packages/app/src/config.ts:99`, forwarded
at `vite-plugin.ts:252`), also already implemented. **Zero `.aihu` files in either repo carry a
`$shadow` pin today**, so there are no pin conflicts to resolve — but it also means both
explicit modes are currently untested against real components, which §9 R7 tracks.

**Also flips, for consistency:** the CLI scaffold's hardcoded `shadowMode = 'shadow'`
(`packages/cli/.../bin.ts:86,95`, `create.ts:157,313,336`, `index.ts:154,674`) should stop
emitting a `shadowMode` at all rather than flip to `'light'` — a scaffold that pins the default
freezes it.

**Versioning.** Major bump for `@aihu/runtime` (currently 4.0.0), `@aihu/compiler`, and
`@aihu/css-engine`, with a loud CHANGELOG entry — matching the flip-now-major precedent set for
DA4 (#437). There are no external consumers, but the package is published and the semantics of
`defineElement` change.

---

## 8. Revision to the daisyUI plan

[`2026-07-23-use-parity-and-daisyui.md`](./2026-07-23-use-parity-and-daisyui.md) §3(a) and
Founder-decision #2 justify Option 4 ("pseudo-daisy transcribed onto our own css-engine") and
reject Option 3 ("run real Tailwind + real daisyUI as a second pipeline") on this reasoning:

> Option 3 … remains **rejected** — not on cost alone, but because it re-introduces the exact
> global-cascade / second-vocabulary problem css-engine's shadow-DOM-scoped design exists to
> avoid.

**Firm recommendation: Option 4 stands. Its stated rationale does not.**

**What is now void.** The clause "the global-cascade problem css-engine's shadow-DOM-scoped
design exists to avoid" is void, and so is the framing that css-engine's design *exists* to
avoid global cascade. After this flip, css-engine's default output **is** global-cascade CSS.
Any argument in that plan of the form "daisyUI is global, we are scoped, therefore structural
conflict" must be struck. Concretely: the words "shadow-DOM-scoped model" in the Option 4
bullets should read "css-engine's own scoping model (attribute-scoped for authored recipes,
global for utilities)", and the parenthetical justification in Founder-decision #2 should be
replaced with the three reasons below. The `.dark`-class → `data-theme` reconciliation item
gets *easier*, not harder: `[data-theme]` on `<html>` cascades into light-DOM leaves natively
(§6), so it no longer needs the `:host([data-theme])` half of the dual selector for leaves.

**Why Option 4 nonetheless survives — three reasons that are independent of shadow/light:**

1. **Dual-mode coverage.** `$shadow: 'shadow'` stays live and supported. A global Tailwind +
   daisyUI stylesheet cannot cross a shadow boundary, so every component that opts into shadow
   would silently lose all daisyUI styling. css-engine folds per-component and therefore works
   in both modes. This is now the *strongest* argument for Option 4, and it is the one the
   original plan did not make.
2. **One utility vocabulary.** Option 3 does not replace css-engine, it runs *alongside* it.
   Two independent emitters would both scan `.aihu` templates and both emit `.p-4`, `.flex`,
   `.md\:grid` — with possibly different values (css-engine has its own theme registry and its
   own preflight) and no defined ordering between the two output sheets. That is a genuine
   structural conflict and it has nothing to do with shadow DOM. It would only dissolve if
   css-engine were *retired*, which is a far larger decision than "how do we get daisyUI
   recipes."
3. **No second build pipeline.** Option 3 adds a PostCSS/Tailwind plugin, a `@source` scan
   configuration, a second config surface, and a second set of cache-invalidation semantics to
   a build that currently spawns one Rust binary.

**What gets easier under the flip, and should be folded into the Option 4 design pass:**

- Transcribing daisyUI recipes is now nearly literal. `.btn`, `.btn-primary`, `.card-body` are
  plain global class rules; they belong in the **utilities** channel (§1.2), unscoped and
  deduplicated — exactly the shape daisyUI already ships. No re-shaping into `:host`-relative
  selectors is needed.
- daisyUI's theme catalog transcribes into the **tokens** channel at `:root` (§6) rather than
  fighting `:host`.
- The "tree-shake the emission like Tailwind's JIT" requirement becomes **more** urgent, not
  less: with 168 light leaves each pulling a virtual CSS module, unshaken output multiplies
  across modules. §5.2's shared base module is the first half of that work and should be
  sequenced as a prerequisite of the recipe port.
- daisyUI recipes styling *slotted / consumer-provided* markup (`.prose`-style descendant
  rules) now actually work, because there is no boundary between the recipe and the content.

**One option the flip newly puts on the table, listed as an open question rather than a
recommendation (§11):** vendoring daisyUI's *compiled* CSS as a `StylePack` — neither Option 3
(no second pipeline) nor a full hand-transcription. Pre-flip this was pointless because the
compiled sheet could not enter shadow roots. Post-flip it is at least coherent. It still fails
reason (1) above for shadow-mode components, so it can only ever be a light-only convenience
layer, not the strategy.

---

## 9. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | The selector-rewrite pass is **new code on a path that currently passes authored CSS through verbatim** (`emit_sfc_scoped` does `body.push_str(authored)`). A mis-parse of nesting, `@media`, `:is()`/`:has()`, attribute selectors containing brackets or quoted commas, or `@supports` makes rules silently stop matching. | **Highest** | Real selector parsing in Rust, never regex. Golden-file tests over every distinct selector shape in the 110 in-repo `@style` blocks, generated mechanically from those files. A `--no-scope` escape flag for debugging. |
| R2 | No visual-regression suite exists; 168 components change rendering context at once. | High | Stage per package (§10). Storybook recipes get screenshot baselines before the flip commit, not after. |
| R3 | `fellwork/web`'s **46** `:host`-bearing files (25 leaf components + 20 pages + `layouts/app.aihu`, corrected count — see §7/§10) are fixed *mechanically* by lowering — but "mechanically correct" is not "visually verified," and the page/layout set is also absorbing DA4's page-flip simultaneously because the app is still pinned to `@aihu/runtime` 2.0.0 (pre-DA4). | High | fellwork/web pins `css: { shadowMode: 'shadow' }` on the release that ships the flip and unpins on its own schedule (§7), verifying **pages first**. Per the standing coherence-audit rule, every web surface gets an auditor pass before preview. |
| R4 | **Inherited properties now flow in.** Font, color, line-height, and `--custom-props` from page ancestors reach component internals where the shadow boundary used to stop them. Components that relied on inheriting from the shadow root will shift. | Medium-High | Not preventable and not desirable to prevent. Catch by R2's baselines. |
| R5 | Hydration mismatches that shadow DOM concealed become visible, because SSR'd markup is now the component's real DOM. Includes the mixed-page case: a component mounted client-side *after* hydration (an `$if`-gated dialog, a route-transition target, a lazy island) takes a pure-CSR path and, unmitigated, could mint an ordinal colliding with an already-hydrated server-stamped host. | Medium | The `data-aihu-i` invariant (§3: server-stamped hosts always read on hydration and never allocate; client-only hosts always allocate from a namespace-distinct `c{n}` counter and never read) removes the id-collision class of mismatch by construction, not just by convention. A hydrate-then-mount-new-component test (§10 step 5) exercises this directly. Other mismatches surface as normal hydration warnings. |
| R6 | Literal-`id` rewriting has a false-positive mode: an `id` used as a deep-link target that *is* also referenced in-template gets rewritten, breaking `#fragment` navigation. | Medium | Rewrite only on in-template referent (§3.2); advisory diagnostic on the un-referenced case; audit the 8 affected files by hand — it is 8 files. |
| R7 | **Both explicit modes are currently untested against real components** — zero `.aihu` files carry a `$shadow` pin anywhere. The opt-back-in path we are promising as the escape hatch has never been exercised. | Medium | Pin `$shadow: 'shadow'` on a representative cookbook component *before* the flip lands, and keep it pinned permanently as a canary. |
| R8 | ~10 TS test files assert shadow-by-default with no explicit option — `define-element.test.ts` #3 ("attaches an open shadow root by default") and #9 ("independent shadow roots") fail outright; `app/tests/component-rendering.test.ts`, `create-app.test.ts`, `define-component.test.ts`, `hmr-replace.test.ts` use `el.shadowRoot!.querySelector(...)`. | Medium (mechanical) | Rewrite in the pattern `packages/ui/tests/shadow-adoption.test.ts` and `packages/runtime/tests/slot-light-dom.test.ts` already use: pass the mode explicitly, assert both branches. |
| R9 | Stale prose in four places asserts the leaf default: `docs/architecture/thesis.md:210-227`, `apps/docs/src/content/docs/migration.md:210-215`, `packages/css-engine/README.md:73,80`, `packages/compiler/tests/route_shadow_warning.rs:1-17,135-138` (doc comment only — the assertion itself stays valid). | Low | Same commit as the flip. |
| R10 | HMR must now replace a build-time CSS asset rather than swap a `CSSStyleSheet`. | Low-Medium | Vite's CSS HMR already handles virtual `.css` modules; this is a *simplification* of the current hand-rolled path, but `hmr-replace.test.ts` must be re-pointed. |
| R11 | SSR byte cost: `data-a="1a2b3c4d"` (~20 bytes) on every element of the 110 `@style`-bearing components, plus `data-aihu-i` per component host. | Low | Stamp only when an `@style` block exists (§1.4); measure against the existing SSR-performance baselines in `docs/plans/ssr-build-performance-findings.md` before and after. |
| R12 | **`@keyframes` namespace collision** (§1.6). Authored `@keyframes` are hoisted top-level today and are per-shadow-tree-scoped only because the shadow boundary provides it for free; light mode puts all authored keyframes in one document namespace, so two components both authoring `@keyframes spin` with different bodies collide silently, last-loaded wins. | Medium | Hash-suffix authored `@keyframes` names with the scope id and rewrite matching `animation`/`animation-name` declarations in the same pass that stamps selectors (§1.6). Utility-emitted keyframes stay global/deduplicated. Add a two-component colliding-keyframes case to the golden-file corpus. |
| R13 | **No escape hatch for runtime-created content** (§1.5). `html=` blocks, d3/third-party-populated subtrees, and other runtime-built DOM are invisible to the compiler's stamping pass; both-sides descendant stamping means authored rules that match such content today (whole-shadow-tree class matching) stop matching post-flip with no diagnostic. Real victim: `examples/hacker-news/src/components/hn-comment.aihu` already authors `:global(p)`/`:global(pre)`, which neither the compiler nor `aihu-css-core` currently recognizes. | High | Formalize `:global(sel)` (emit unstamped) and add `:deep(sel)` (stamp only the left side) to the rewrite-pass grammar, both mode-independent no-ops in shadow mode. Add `hn-comment.aihu` and `docs-shell.aihu` to the golden-file corpus and "runtime-created content" as its own row in the both-modes test matrix (§10 step 3/7). |

---

## 10. Migration

Ordered. Steps 1-5 are net improvements to the *already-shipped* page path and are safe to land
before the endpoint is approved; the default flip is step 8.

1. **Split the emission channels** (§1.2) in `aihu-css-core`: `emit_sfc_scoped` returns tokens /
   reset / utilities / authored as four distinct outputs instead of one concatenated string.
   Thread a `--scope-id` and a `--mode` flag through the `aihu-css-compile --ast-json`
   invocation and `compileSfc()`. No behavior change yet — the JS bridge re-concatenates.
2. **Shared base module + cascade layers** (§5.2, §4): hoist tokens/reset/`@layer` declaration
   into `\0virtual:aihu-base.css`; qualify the preflight to `[data-a]`; make
   `emit_host_tokens()` mode-aware (`:root` in light) — this alone fixes the live token bug of
   §6 for the 23 pages already on the light path. Rewrite `sfc-e2e.test.ts:24` and
   `css-engine-hook.test.ts:136-137` to assert per mode.
3. **Selector-rewrite pass + element stamping** (§1.4): the Rust pass, plus `data-a` emission in
   both the client template emitter and `ssr_string_emit.rs`. Golden-file tests over all 110
   in-repo `@style` blocks (R1), including the `:global()`/`:deep()` operators (§1.5) exercised
   via `examples/hacker-news/src/components/hn-comment.aihu` and `apps/docs/src/components/
   docs-shell.aihu`, and the `@keyframes` hash-suffix transform (§1.6) exercised via a
   two-component colliding-`@keyframes` case (R12). Ship it **enabled for pages/layouts** — they
   are already light, this immediately retires the hand-migration documented at
   `migration.md:223`, and it gives the mechanism a real 23-component shakedown before any leaf
   depends on it.
4. **`:host` / `::slotted` / `::part` lowering** (§2), including the `_projectLightDomSlot`
   stamping of projected top-level nodes.
5. **`useId`** (§3.2) + `data-aihu-i` in the SSR walk, with the `a{n}`/`c{n}` server/client
   namespace split (§3.2 Seed) so a component mounted client-side after hydration can never
   collide with a server-stamped host; add a hydrate-then-mount-new-component test (R5). The
   element-reading core lands in a dependency-free shared module (a `primitives-internal` entry
   point or a zero-dependency micro-package, per §3.2's resolved placement) — **not** in
   `@aihu/runtime` — with `@aihu/runtime` wrapping it for compiled `.aihu` components; collapse
   the three `@aihu/primitives` counters (`label`, `form-control`, `tooltip`) onto the shared
   core directly. Add the compiler's literal-`id` rewrite with its advisory diagnostic.
6. **Canary and baselines**: pin `$shadow: 'shadow'` on one cookbook component permanently
   (R7); capture Storybook screenshot baselines for the recipes (R2); capture SSR size/perf
   baselines (R11).
7. **Rewrite the mode-assuming tests** (R8) to the explicit-mode, both-branches pattern, and add
   "runtime-created content" (§1.5: `html=` blocks, d3/third-party-populated subtrees) as its own
   row in that matrix rather than folding it into generic selector-shape coverage — shadow mode
   needed no author signal for this case at all, light mode needs `:global()`/`:deep()`, so the
   two modes are not test-equivalent here even though their steady-state CSS looks similar.
8. **Flip the default** (§7): `emit.rs` marker condition, `define-element.ts:111`, the plugin's
   `impliedShadowDefault`, CLI scaffold. Update the four stale prose sites (R9). Major version
   bump + CHANGELOG.
9. **Repo consumers, in dependency order** — `packages/ui` registry recipes and
   `packages/primitives` first (they are the vocabulary everything else uses), then
   `apps/storybook` (visual diff against step 6's baselines), then `cookbook/` (21 files, the
   densest concentration of bare selectors — `.label`, `.error`, `.title`,
   `[hidden] { display: none }`, `.tab-panel p`, `.data-row td`), then `examples/` (41) and
   `bench/` (41), then `apps/docs` (22 — also the only in-repo `:host`/`::part` users).
10. **`fellwork/web` — re-inventoried per reviewer finding.** The first draft of this doc
    claimed 19 `:host`-dependent leaf components; the actual count is **46** `.aihu` files
    containing `:host`: 25 leaf components (the prior list omitted `lexicon-panel`,
    `lexgraph-map`, `lexgraph-explorer`, `lexgraph-picker`, `recents-sheet`, and
    `workspace-sidebar`) **plus 20 pages plus `layouts/app.aihu`**. That last group changes the
    shape of this step: `apps/web/package.json:20` currently pins `@aihu/runtime` at `2.0.0` —
    pre-DA4 — so fellwork/web's *pages* are still on the **shadow** default today
    (`pages/read/[ref].aihu:707`'s own comment: "The verse text lives in this component's
    SHADOW ROOT"). The doc's earlier framing — "shadow-piercing traversal … from already-light
    pages" — is therefore false for this app specifically: on `runtime` 2.0.0, pages pierce leaf
    shadow roots *from shadow pages*, not light ones. Landing the aihu bump for this app is not
    only "leaves flip" but **also absorbs DA4's page-default flip in the same release**, since
    the app has never taken that flip either. The `css: { shadowMode: 'shadow' }` pin (in
    `apps/web/vite.config.ts` — same file whose comment at lines 96-98 currently documents
    reliance on the implicit default) still mitigates this: it holds *leaves* at shadow for one
    release regardless of the page-default question. But the unpin-and-verify pass must be
    **scoped to pages first** (all 20 pages + the layout), not leaves, precisely because DA4's
    page flip and this doc's leaf flip land on fellwork/web simultaneously. Then, on its own
    schedule: unpin, verify all 46 `:host`-bearing files against lowering (R3), and **delete**
    the seven shadow-piercing workarounds (`search-panel.aihu:300`, `command-palette.aihu:47`,
    `capture-palette.aihu:167`, `lib/ui/in-page.ts:32`, `pages/study/[ref].aihu:585`,
    `pages/subscribe.aihu:185`, `pages/read/[ref].aihu:707`) — they are `if (el.shadowRoot)`
    guards that degrade to `null`, so they can be removed incrementally rather than in one
    commit. `apps/web/src/dev/dev-login.ts:128`'s deliberate `attachShadow` is unaffected.
11. **Docs**: rewrite the shadow/light section of `migration.md` around the three-level
    precedence chain; publish the `@layer` names as public API in the css-engine README (§4);
    document `part=` as a plain attribute in light mode (§2).

---

## 11. Open questions

Everything below is genuinely open — none of it is the founder decisions recorded above, and none
of it should be read as ratified. Each item carries a recommendation so implementers have a
default to work from, but each default is still waiting on a call.

1. **Should the marker be stamped unconditionally rather than only for `@style`-bearing
   components?** Conditional stamping saves bytes on 58 leaves but means a component's scoping
   posture changes the instant someone adds a style block — and `::slotted` lowering needs the
   marker even for a utilities-only component that projects slotted content it wants to style.
   **Recommendation: conditional, with an override** (a component can opt into unconditional
   stamping, e.g. because it projects slotted content today and doesn't want its scoping posture
   to shift later) — but this is a recommendation, not a decision; it needs one.
2. **Do pages and layouts keep truly-global authored CSS as an option?** Step 3 scopes them.
   Some page CSS legitimately wants to be global (body backgrounds, view transitions).
   **Recommendation: no new mechanism** — `$global` already covers this case and adding a second
   escape hatch multiplies the surface for a marginal ergonomic win. The cost is the one-time
   audit of 23 pages to reclassify which blocks should convert; that audit cost, not the
   mechanism choice, is why this stays open rather than closed here.
3. **`useId` layer vs. packaging.** The *layering* half of this question is resolved, not open:
   the element-reading core does not live in `@aihu/runtime` — it lives in a dependency-free
   shared module, with `@aihu/runtime` wrapping it for compiled components (§3.2, step 5). That
   follows directly from the hard rule that `@aihu/primitives` never imports `@aihu/runtime`, so
   it is not being reopened here even though founder sign-off on the arc invites revisiting
   sub-decisions — reopening it would contradict a rule already verified against three call
   sites. **What remains genuinely OPEN is the packaging choice**: a `primitives-internal` entry
   point inside the existing `@aihu/primitives` package, vs. a new zero-dependency micro-package
   (e.g. `@aihu/id-scope`). **Recommendation: the in-package entry point** — it ships the same
   dependency-free core without adding a new package to publish, version, and document for a
   single shared function; a standalone micro-package only earns its keep if a *third* consumer
   outside `@aihu/primitives`/`@aihu/runtime` needs the core directly. Left to whoever implements
   step 5 to confirm.
4. **Marker attribute naming and production stripping.** `data-a` is terse but generic enough to
   collide with an app's own attributes. `data-aihu-s` is safe and 6 bytes worse per element on
   every SSR'd page. **Recommendation: keep `data-a`.** The collision surface is narrow in
   practice — it is a fixed-shape `data-*` attribute holding an 8-hex-char value, not a name an
   app is likely to have chosen independently — and the byte cost compounds across every element
   of every `@style`-bearing component on every SSR'd page (R11), which is the more certain cost
   of the two. This should still get a repo-wide grep for pre-existing `data-a` usage before
   landing step 3, and that check, not taste, is what should close the question.
5. **Does the daisyUI recipe port change layer assignment?** Recipes like `.btn` are
   component-shaped but ship as global classes — `aihu.components` or `aihu.utilities`? It
   determines whether `class="btn mt-4"` resolves the way daisyUI users expect. **Recommendation:
   `aihu.utilities`** — §8 already treats `.btn`, `.btn-primary`, `.card-body` as "plain global
   class rules" belonging in the utilities channel, unscoped and deduplicated, which is the shape
   daisyUI itself ships and is what makes `class="btn mt-4"` resolve utilities-last as authors
   expect. That's a leaning carried over from §8's framing, not a ratified layer assignment — it
   should be confirmed as part of the Option 4 design pass, not assumed.
6. **Vendoring daisyUI's compiled CSS as a light-only `StylePack`** (§8): now coherent, still
   fails shadow-mode components. Is a light-only convenience layer worth carrying alongside the
   transcription, or does it just fragment the story?
7. **Should `css.shadowMode` gain a `'legacy'` value** reproducing the pre-flip pages-light /
   leaves-shadow split, purely as a migration aid for `fellwork/web`? **Recommendation: no** — a
   per-app pin to `'shadow'` for one release (§7, §10 step 10) is simpler and does not add a
   permanently supported third mode — but it is the founder's call whether one release of
   full-shadow is an acceptable interim for the web app, so this stays open rather than closed by
   this design alone.
8. **Do we owe a codemod?** 196 files change behavior but ~0 change source (lowering and
   scoping are compiler-side). The exceptions are the 8 literal-`id` files and any `$global`
   conversions from Q2. Probably a lint rule, not a codemod — but that presumes Q2 lands "no."
