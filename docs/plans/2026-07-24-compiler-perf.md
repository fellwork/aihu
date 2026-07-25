# Compiler + runtime performance: where the headroom actually is

**Date:** 2026-07-24
**Status:** RATIFIED — founder decisions locked 2026-07-24 (see section below). Phase 0–2 cleared to proceed; Phase 3 remains conditionally approved, gated on the corpus census clearing the ratified threshold.
**Scope:** `@aihu/arbor` (hot-path allocation), `@aihu/compiler` (`codegen/template_emit.rs`, `codegen/ssr_string_emit.rs`, napi backend), `bench/` (new `compiled-mount` harness + control workloads), `bench/ssr-string` (assertion fix)
**Depends on / extends:** the wave-3 SSR keystone (`packages/compiler/src/codegen/ssr_string_emit.rs`) and the in-process napi backend (`packages/compiler/src-native`, `packages/compiler/js/envelope.ts`). **Hard sequencing edge:** Phase 3 is additionally gated on PR #540 (`design/light-dom-leaf-flip`) — see Founder decision 3 below.

## Founder decisions (ratified 2026-07-24)

These are ratified answers to the open questions the original draft raised in
§Founder decisions this approval commits to. They are binding on the phase
plan below; where the phase text still describes alternatives, the ratified
choice here wins.

1. **Phase 1 = `signalRegistry` OPT-IN.** Adopt `MountOptions.trackSignals`,
   defaulted **OFF** for plain client mounts and **ON** for SSR/hydrate and for
   components that need serialization. Option (b) (deferred-tuple redesign) is
   rejected — not because it's wrong, but because the opt-in flag is the
   smaller, shippable change and the naive "gate on `registry != null`" framing
   the plan originally floated is *also* rejected: it never fires on a real
   top-level `mount()`/`hydrate()` call (both unconditionally allocate the
   registry today), so it would have delivered ~0% of the ablation ceiling.
   **Consequence that ships with this decision:** `serialize()` returns `{}`
   when the tree was mounted untracked — a public-API contract change, not an
   internal optimization. The two client consumers,
   `packages/agent-server/src/bridge-client.ts` and `packages/store/src/ssr.ts`,
   MUST be audited against this contract and, where they depend on
   `serialize()`'s output, must opt in via `trackSignals`. That audit is an
   explicit Phase-1 task (see Phase 1 below), not a follow-up.

2. **Phase 3 go/no-go threshold ACCEPTED**, decided before the corpus census
   runs: Phase 3 (clone units — codegen + the arbor `clone()` node kind +
   hydration integration) proceeds **only if** the corpus census finds
   fully-inert subtrees of **≥5 nodes in ≥30% of components** *and* an
   aggregate inert-node share **≥25%**. Below that bar, the measured
   6.9–18.6% (clone+STAMP) / −40.2% (fully-inert) ceiling from M1 cannot
   justify the engineering cost. This threshold is ratified and gates **all**
   of Phase 3, including the arbor `clone()` node kind — not codegen emission
   alone.

3. **Unify `data-a` scoping-attribute stamping BEFORE (or jointly with) Phase
   3.** Phase 3 reuses `ssr_string_emit.rs`'s static serialization, but the
   in-flight light-DOM leaf flip (PR #540, branch `design/light-dom-leaf-flip`,
   commit `330ce41c`) makes `template_emit.rs` and `ssr_string_emit.rs` each
   stamp a `data-a` scoping attribute — which breaks the "one shared
   serializer" safety argument this plan relies on unless the two emitters are
   unified first. **HARD SEQUENCING EDGE: PR #540's stamping work gates #542
   Phase 3.** A rendered-DOM (not string-only) conformance check between the
   two emit paths is required before Phase 3 can merge. See §Interaction with
   the light-DOM leaf flip below; cross-reference PR #540.

4. **`__tpl` = a real `<template>` element, never a `div.innerHTML` shim.**
   Two reasons, both ratified as the record for why this isn't optional:
   `<template>` content is **inert** — no script execution, no image loads, no
   custom-element upgrades at parse time — whereas a `div`'s content is not;
   and table-section elements (`<tr>`/`<td>`/`<tbody>`) are silently dropped
   when parsed inside a `div` but parse correctly inside a `<template>`.
   **SVG rule (precise, not blanket):** **ALLOW** a clone unit whose root **IS**
   the `<svg>` element — `<template><svg>…</svg></template>` triggers namespace
   switching and parses correctly, and this is the valuable large-inert case
   (icon blocks). **REFUSE** units rooted at an SVG **descendant** — a bare
   `<path>` root parses as an unknown HTML element and never renders. Enforce
   this precisely in the `is_inert` pass (not a blanket SVG refusal).
   **`<pre>`/`<textarea>`:** **EXCLUDE** from `is_inert` in v1 — the parser
   strips a leading newline immediately after those start tags, so a naive
   round-trip through `<template>` loses one character. The doubled-newline
   normalization fix is deferred, with a test pinning the exclusion.

**Independent of all four decisions above: Phase 2** (wiring the
already-written napi compile backend) **is not gated by any of this and can
start immediately.** Compile wall-clock is ~99% process spawn today; wiring
the existing addon is a measured ~90–95% per-file cut from code that already
exists. It is the highest-ROI item in this plan and nothing above blocks it.

## Summary

The framing question for this plan was: aihu emits a declarative `branch()/leaf()`
tree that arbor interprets, where Solid/Svelte emit cloned templates — should
static subtrees migrate to `<template>` + `cloneNode(true)`?

**Measured answer: the interpreted tree is not the bottleneck, and template
cloning is worth far less than the DOM-call-count arithmetic suggests.**
Building the declarative tree is **4% of mount cost**. Cloning beats
`createElement` chains by only **7–19%** on realistic per-row templates in real
Chrome — not the ~80% that counting DOM API calls implies. Meanwhile a change
confined to `@aihu/arbor`, requiring **no compiler work and no codegen change at
all**, has a measured **12–14% ablation ceiling** on the same workload — but,
per a grounding pass on the real mount/hydrate call sites (see Phase 1), the
realized win depends on a public-API decision this plan did not originally
make, and is likely to land well under that ceiling on a full-tree mount.

And on the compiler side: **no Rust change is justified**. 99% of per-file
compile wall-clock is process spawn, and the fix is already-written code that
simply is not built in this workspace.

This plan therefore leads with the cheap wins, requires the missing benchmark
before anything lands, and scopes template cloning to the one variant that is
both the highest-ratio win *and* the one that makes the node-path problem
disappear entirely.

## Measurements

All numbers below were taken this session, in **real headless Chrome**
(`/Applications/Google Chrome.app`), not JSDOM. Every comparison was run
**interleaved across three rounds** with invariant control workloads in the same
process, per the known CPU-contention gotcha. A first attempt at the
path-ablation comparison produced a *uniform* 2–8x slowdown across benches that
the patch could not possibly affect (including `raw-dom-construct` and a pure
`signals` workload) — the classic contention signature — and was discarded and
re-run. The controls below are stable to ±3% across rounds; the deltas are real.

### M1 — isolated DOM construction vs `<template>` clone

8000 rows/op, p50 of 60 reps. Both arms include the per-row "stamping"
(text values, listeners) a real row needs.

| shape | createElement chain | clone + stamp | delta |
|---|---:|---:|---:|
| krausest row (10 nodes, 2 listeners, 2 dyn texts, 1 dyn attr) | 31.1 ms | 25.3 ms | **−18.6%** |
| krausest row, `querySelector` instead of sibling walk | 31.1 ms | 24.9 ms | −19.9% |
| data-table row (7 nodes, 3 per-row texts, 0 bindings) | 14.4 ms | 13.4 ms | **−6.9%** |
| fully inert 7-node subtree (**no stamping at all**) | 18.9 ms | 11.3 ms | **−40.2%** |
| data-table via one bulk `innerHTML` string | 14.4 ms | 17.5 ms | **+21.5% (slower)** |

Three findings that shape the design:

1. **The clone win scales inversely with how much you stamp.** A fully inert
   subtree is 40% cheaper to clone; the moment you walk into it to set text and
   attach listeners, the win collapses to 7–19%. The value is in *skipping* the
   subtree, not in cloning per se.
2. **Precomputed sibling-walk paths are not measurably better than
   `querySelector`** (25.3 ms vs 24.9 ms — `querySelector` was marginally
   *faster*). The received wisdom that path indices are the important
   optimization does not survive measurement at this scale. Do not build
   elaborate path machinery on the strength of that assumption.
3. **Bulk `innerHTML` is slower than `createElement`**, so the "just serialize the
   whole list to a string" shortcut is dead. Rejected.

### M2 — where mount time actually goes, real `@aihu/arbor`

4000 rows/op, p50 of 40 reps, median of 3 interleaved rounds. Real
`packages/arbor/src` and `packages/signals/src`, bundled unmodified.

| | krausest row | data-table row |
|---|---:|---:|
| build the `branch()/leaf()` tree, **no DOM** | 1.1 ms (**4%**) | 0.3 ms (**4%**) |
| full `tree + mount()` | 26.3 ms | 9.1 ms |
| `mount()` of a prebuilt tree | 26.3 ms | 9.0 ms |
| raw `createElement` floor for the same DOM | 15.7 ms (**60%**) | 7.5 ms (**82%**) |
| 2 signals + 2 effects per row, no DOM | 0.7 ms (**3%**) | — |
| **arbor overhead above the raw-DOM floor** | **10.6 ms (40%)** | **1.6 ms (18%)** |

**The declarative tree costs 4%.** The premise that aihu pays a large
"interpretation tax" for emitting data instead of DOM instructions is not
supported. Signal/effect creation is another 3%. The DOM itself is 60–82%.
The remaining 40% / 18% is arbor's own per-node work inside `_materialize`
and `_applyAttrs` — and that is the part worth attacking, because it is neither
the browser's floor nor the tree.

### M3 — what arbor's per-node overhead is made of

`packages/arbor/src/materialize.ts:139,180` build `` `${pathBase}.${i}` `` for
every child of every branch and fragment; `:107` builds `` `${pathBase}.text` ``
per reactive text leaf; `packages/arbor/src/attrs.ts:97` builds
`` `${pathBase}.attr:${key}` `` per reactive attribute;
`packages/arbor/src/structural.ts` builds four more.

These strings are consumed by exactly three things: `registry?.set(path, get)`,
`__DEV__` observability, and `errorHandler(err, path)` on the error path.

**Correction from a code-grounding pass, after the ablation numbers below were
taken:** the ablation's own framing — "only non-null when `serialize()` is
needed, i.e. SSR" — does not hold on the code as it stands today.
`mount()` (`packages/arbor/src/mount.ts:346,369-377`) and `hydrate()`
(`packages/arbor/src/hydrate.ts:435`) **unconditionally** allocate a
`signalRegistry` and thread it through `_materialize`/`_hydrateNode` — the
registry is not null on any top-level client mount or hydration, so a gate of
the form "compute the path only when `registry != null`" does not fire on the
path this plan is trying to speed up. `MountScope.serialize()` is also not
SSR-only: it is a public client API consumed by
`packages/agent-server/src/bridge-client.ts` and `packages/store/src/ssr.ts`.
The gate *is* effective inside `when()`/`each()` subtrees, where `_mc`
(`structural.ts:80`) already omits the registry argument — so structural
children partially benefit today — but every component's top-level tree pays
the full path-string cost regardless. See Phase 1 below for the corrected
mechanism; the ablation ceiling itself (next table) is unaffected — it is
still a valid upper bound on what removing the strings entirely is worth —
but the naive "gate on `registry != null`" implementation does not realize it.

Ablation: arbor patched to pass `''` at all seven sites, run interleaved against
the unmodified build.

| bench | base | paths removed | delta |
|---|---:|---:|---:|
| krausest `tree + mount` | 26.3 ms | 22.5 ms | **−14.4%** |
| krausest `mount` (prebuilt) | 26.3 ms | 23.2 ms | −11.8% |
| data-table `tree + mount` | 9.1 ms | 8.6 ms | −5.5% |
| data-table `mount` (prebuilt) | 9.0 ms | 8.4 ms | −6.7% |
| *control:* raw-dom-construct | 15.7 ms | 15.7 ms | 0.0% |
| *control:* tree-alloc-only | 1.1 ms | 1.0 ms | ~0% |
| *control:* signals 2-bindings/row | 0.7 ms | 0.7 ms | 0.0% |

The three controls are untouched by the patch and are flat, which is what makes
the 14.4% believable. This is an **upper bound** — a correct implementation must
still produce paths when a registry, `__DEV__`, or an error needs them — but
most of it is recoverable because those are all cold or separate code paths.

**This is a bigger win than template cloning, in one package, with no compiler
change and no hydration exposure.**

### M4 — compiler throughput

`target/release/aihu-compile`, n=40 per row, median.

| invocation | median | p10 |
|---|---:|---:|
| `--version` (**spawns, compiles nothing**) | 14.71 ms | 7.81 ms |
| `cookbook/agent-weather.aihu` (small) | 16.08 ms | 8.19 ms |
| `apps/docs/src/components/docs-shell.aihu` (402 lines) | 14.86 ms | 11.76 ms |

The no-op control settles this. **Compiling a 402-line file costs the same as
printing a version string.** Parse + validate + emit is ~1–3 ms inside a ~15 ms
budget that is ~99% process spawn and dynamic linking.

Confirmed in this worktree: no `.node` addon exists anywhere
(`find . -name '*.node'` outside `target/` → empty), so `js/envelope.ts` falls
back to CLI spawn, i.e. these numbers are what the real Vite pipeline pays
today. Also confirmed: zero `rayon` / `par_iter` in `packages/compiler`.

### M5 — `bench/ssr-string` is not broken the way it looks

`bun bench/ssr-string/bench.ts` aborts at `bench.ts:117` with
`DIVERGENT OUTPUT`. Diffing the two strings: **the template bytes are
byte-identical for all 421 characters of markup.** The only difference is that
`renderToString` appends a trailing
`<script type="application/json" id="__aihu_state__">…</script>` state-channel
block and `__ssrString` does not — a different seam emits it in the real server
path.

This is a **bench harness defect, not a compiler correctness break**, and it
matters here because the whole clone design proposes to reuse
`ssr_string_emit.rs`. That serializer is sound; the assertion is comparing
apples to oranges. One-line fix, and it unblocks a bench that currently produces
no numbers at all.

## Verdict

- **Output speed:** real headroom, but it is in `@aihu/arbor`'s per-node
  allocation (40% of krausest mount), not in the declarative tree (4%) and not
  in codegen. The 14.4%/5.5% path-allocation figures are an ablation ceiling,
  not a committed Phase-1 number — realizing them requires a founder decision
  between two designs (see Phase 1), since the naive "gate on `registry != null`"
  approach does not fire on a real top-level mount or hydrate. Template cloning
  is worth roughly 15–25% of mount *after* the cheap arbor work under the
  clone+STAMP variant this design rejects; under the fully-inert-only
  restriction actually proposed, the payoff is unproven pending the Phase-3
  corpus census, for substantially more complexity and the only hydration risk
  in this plan.
- **Compile throughput:** **do not optimize the Rust.** It is already ~1–3 ms
  against a 15 ms spawn. The lever is building the napi addon that already
  exists. Any Rust-side allocation work is at best a few percent of a cost that
  is itself 1% of the real bill — and it should not be attempted before a
  compiler bench exists to price it.
- **Do not conflate the two.** They are separate levers in separate languages
  and should ship as separate arcs.

## Design — static-subtree `<template>` + `cloneNode(true)`

Proposed for Phase 3, *after* the cheaper wins have landed and the bench exists.

### Clone units are maximal *fully static* subtrees, and nothing else

A **clone unit** is a subtree in which every node is inert: no reactive binding,
no event listener, no interpolation, no per-instance value, no structural node,
no macro/directive with a mount-time effect, no `ref`, no `show`/`class:`/`html`.
A single root element (never a fragment — the unit must clone as one node).

This restriction is not conservatism, it is the design:

- **It is where the win is.** M1 measures the fully-inert case at −40% and the
  stamped cases at −7…−19%. The restricted form has the *best* ratio.
- **It makes the node-path problem vanish.** There are, by construction, zero
  dynamic nodes inside a clone unit, so there is nothing to locate after the
  clone. The entire class of bugs this plan was asked to be rigorous about —
  precomputed indices, unstable paths — only exists if you clone subtrees that
  *contain* dynamic parts. We do not.
- **It makes the conditional/keyed-list problem vanish.** A `when()`/`each()`
  node terminates a clone unit. Structural children split their parent into
  several smaller units. Paths inside a unit are static because a unit cannot
  span a structural boundary.

Dynamic siblings *around* a clone unit need no path lookup either: arbor's
existing recursion already holds the concrete parent element in the same call
frame (`materialize.ts:169-188`), which is why the current closure-capture
binding costs nothing. The clone unit is appended into that parent like any
other child. **No index-based traversal is introduced anywhere.**

### Detection in codegen

New pass over the same `TemplateNode` IR that `template_emit::emit_node` and
`ssr_string_emit::emit_node` already walk, computing one bit per node —
`is_inert` — bottom-up. A node is inert iff it is a static element or literal
text and all its children are inert. Maximal inert subtrees whose root is a
single element, and whose node count exceeds a threshold (start at **3 nodes**;
M1 shows a 7-node inert subtree at −40%, and a 1–2 node unit cannot repay the
`<template>` bytes), become clone units. Everything else lowers exactly as
today.

The bit is cheap and mirrors the existing island classification in
`codegen/emit.rs:879` — same conservative-by-construction discipline: any doubt
resolves to "not inert", which merely forfeits the optimization.

### Emitted shape

The unit's HTML comes from **`ssr_string_emit.rs`, reused verbatim**, invoked in
its non-hydratable variant (`__h = false`) so no `data-aihu-path` attributes,
no `<!--aihu:s:…-->` markers, and no `<!--|-->` text separators appear in the
template. That variant already exists — the emitter folds per-variant chunks and
`render_parts` will produce a single literal for an inert subtree, because an
inert subtree has no holes by definition.

Module scope gets one lazily-instantiated template per unit; the tree gets a new
arbor node kind:

```js
const __t0 = /* @__PURE__ */ __tpl('<div class="a"><div class="b">…</div></div>')
// …in the component body:
branch('tr', { class: cls }, [ clone(__t0), branch('td', undefined, [leaf(row.name)]) ])
```

`clone(tpl)` is a shape-locked object literal like `branch`/`leaf`
(`{ kind: 'clone', tpl }`), and `_materialize` grows one case:
`host.appendChild(node.tpl.content.firstChild.cloneNode(true))` — no attrs pass,
no child recursion, no path string, no disposer. That skipped recursion is a
second, independent saving on top of M1's DOM delta: it removes arbor's
per-node overhead (M2: 40% of krausest mount) for every node inside the unit.

`__tpl` parses lazily on first clone and caches, so a component that never
mounts pays nothing.

**`__tpl`'s parsing contract must be specified, not assumed.** Two correctness
gaps in the naive `innerHTML`-shim reading of `__tpl`:

- **SVG namespace — ratified rule (Founder decision 4).** A static icon block —
  the archetypal large, fully-inert clone unit expected in real apps — is
  commonly rooted at `<svg>`. Parsing markup via a
  `div.innerHTML = '<svg>…</svg>'` shim creates HTML-namespace elements
  (`HTMLUnknownElement`) that never paint; `_materialize` guards exactly this
  case today via the `SVG_TAGS` set → `createElementNS`
  (`packages/arbor/src/materialize.ts:8-43,169`). `__tpl` is therefore backed by
  a real `<template>` element (never `div.innerHTML`), never a shim, full stop.
  Given that, the rule is precise rather than a blanket refusal: **a clone unit
  whose root IS the `<svg>` element is ALLOWED** —
  `<template><svg>…</svg></template>` triggers namespace switching in the
  parser and parses correctly, and this is the valuable large-inert case
  (icon blocks, static illustrations). **A unit rooted at an SVG DESCENDANT is
  REFUSED** — a bare `<path>` (or any other SVG element) as the clone-unit root
  parses as an unknown HTML element outside an `<svg>` ancestor and never
  renders. `is_inert` must enforce exactly this distinction — root-is-svg
  qualifies, descendant-of-svg-root does not — with a conformance test proving
  both the allow and the refusal.
- **Parser normalization deltas.** The HTML parser strips a leading newline
  immediately after `<pre>` (and `<textarea>`), so a clone-lowered `<pre>` unit
  can differ from the current `createTextNode` lowering by one leading
  character. `<tr>`/`<td>`-rooted units are safe to clone from a real
  `<template>` (per the in-template parsing mode), because `__tpl` uses an
  actual `<template>` and not a div shim. **Ratified (Founder decision 4): v1
  excludes `<pre>`/`<textarea>`-rooted units from `is_inert`.** The
  leading-newline normalization fix is deferred to a follow-on, with a test
  pinning the v1 exclusion so the gap can't silently regress into a correctness
  bug if someone lifts the exclusion later.

Golden fixtures for both cases (SVG-rooted unit, `<pre>`-rooted unit) belong in
`bench/compiler-conformance` alongside the existing plan for that harness.

### Degradation when a subtree is partly dynamic

It is not a clone unit. It lowers to `branch()/leaf()` exactly as today. There
is no partial-clone mode, no mixed unit, no fallback path to get wrong. A
template with one interpolation in the middle simply yields two or three smaller
clone units around it, or none. **Emitting the same tree we emit today is always
a legal answer**, which is what makes this safely incremental.

Cloning partly-dynamic units (the Solid model, which *does* require compile-time
path indices) is explicitly out of scope — see §Not doing.

### SSR and hydration

Three facts make this tractable, all verified in code:

1. **SSR is unaffected.** The server has no DOM and never clones;
   `__ssr`/`__ssrString` keep their current lowering. The clone path is a
   `--target client` codegen concern only.
2. **The template HTML and the SSR HTML come from the same serializer**, so any
   divergence is a compile-time bug in one shared function rather than a runtime
   mismatch — and is directly testable as a conformance invariant.
3. **A clone unit needs no hydration work**, because it has no bindings.

The one real hazard is path *bookkeeping*, but the mechanism described in an
earlier draft of this section did not match the real walker and has been
corrected here after a code-grounding pass.

**How hydration actually resolves elements.** `hydrate()`
(`packages/arbor/src/hydrate.ts:421-427,331`) locates each branch element via a
`data-aihu-path → Element` map, where the paths are derived from **arbor-tree
child indices**, not from a positional walk over the DOM. There is no
"advance a DOM index" step for branch/element nodes to get wrong — the lookup
is a map hit keyed by the tree-index-derived path string. The only positional
cursor in the hydrator is a **per-host text-node cursor** used exclusively for
text leaves (`hydrate.ts:228-236`), and a clone unit rooted at a single element
contributes zero text nodes to its parent, so it cannot perturb that cursor
either.

The design's conclusion survives even though the mechanism it invoked does
not: a clone unit occupies exactly one arbor-tree child slot (it is rooted at
one element), so sibling branch paths — computed from tree indices — are
unchanged by its presence, and are resolved via the path map regardless of how
many real DOM elements the clone unit expands to. `_hydrateNode` still needs a
`kind === 'clone'` case, but its job is simply **"return without wiring
anything, adopting whatever DOM the server already sent for that path"** — not
"advance an index," because no such index exists in this walker.

This must be pinned by test, not by argument: a differential hydration fixture
with a clone unit sandwiched between two *bound* siblings, asserting the
siblings' bindings still resolve to the right elements — that is still the
right merge gate. Add a second fixture alongside it: a clone unit adjacent to
sibling **text** leaves, pinning that the text-node cursor stays aligned when a
clone unit contributes no text nodes of its own.

Separately, and not caused or fixed by clone units: `hydrate.ts:270-277`
matches element leaves by a first-tagName scan from index 0, which is a
pre-existing mis-binding hazard for same-tag siblings. The new fixtures above
will exercise it incidentally; it is called out here so it is not mistaken for
a regression introduced by this plan.

Secondary note: `data-aihu-path` attributes inside inert subtrees become dead
SSR bytes. Stripping them is a plausible follow-on but it **changes the wire
grammar that `packages/server/tests/ssr-string-differential.test.ts` pins**, so
it is a separate decision with its own review, not a rider on this one.

### Interaction with the light-DOM leaf flip (`data-a` scoping)

There is a founder-ratified design in flight that this plan must sequence
against: commit `330ce41c` (branch `design/light-dom-leaf-flip`) flips leaf
components to light DOM and stamps a per-element scoping attribute
(`data-a="<hash>"`) onto template elements whenever an SFC has a non-`$global`
`@style` block, via a new Rust selector-rewrite pass. This affects the shared-
serializer safety argument above in two ways:

1. **`template_emit.rs` (client-attribute lowering) and `ssr_string_emit.rs`
   are separate emitters.** The "same serializer, so any divergence is a
   compile-time bug in one function" argument above covers SSR-vs-template
   divergence only — it says nothing about whether a clone-unit HTML literal
   (built by reusing `ssr_string_emit`) carries the *same* `data-a` stamps that
   the `branch()`/`_materialize` lowering of the identical markup produces
   through `template_emit`. If the two emitters diverge on stamping, clone
   units silently lose their scoped styles while everything lowered the
   ordinary way keeps them — a hard-to-notice visual regression, not a crash.
2. **Inertness itself is unaffected** — `data-a` is a compile-time constant, so
   it does not change which nodes qualify for `is_inert` — but Phase 3 must not
   land before or independently of the flip's stamping pass, or every clone-unit
   template literal already emitted is invalidated the moment the flip lands.

**Ratified (Founder decision 3): HARD SEQUENCING EDGE — PR #540's `data-a`
stamping work gates #542 Phase 3.** Required before Phase 3 ships: the `data-a`
stamping must live in (or feed) a single attribute-normalization step consumed
by **both** `template_emit` and `ssr_string_emit`, and the Phase-3 conformance
invariant must compare **rendered DOM** (attributes included) of clone-lowered
vs. branch-lowered variants of the same fixture — not just the SSR strings,
which is what the current conformance framing checks. Phase 3 does not start
until PR #540 (`design/light-dom-leaf-flip`, commit `330ce41c`) has landed and
unified the stamping, or lands jointly with it; it is not independent parallel
work. Cross-link: PR #540.

### Island classification

Static-vs-interactive classification (`codegen/emit.rs:879`) is authoritative and
unchanged. Worth stating explicitly because it invites a misreading: **static
islands are not the target.** A static island ships zero JS and never
client-mounts, so cloning buys it nothing. The target is *static subtrees
inside interactive islands*.

**Correction:** an earlier draft claimed this is "exactly where the krausest
and data-table row shapes live." That is wrong under the fully-inert-only
restriction this design adopts. The M1 krausest row (id, label, and a
remove-link all bound; 2 listeners/row) contains essentially no qualifying
3+-node fully-inert subtree once you exclude the bound nodes and their static
siblings-of-convenience — the row *as a row* is not a clone-unit candidate. The
18.6%/6.9% figures for those two row shapes are for **clone+STAMP**, a variant
this design explicitly rejects (see §Not doing — no partial-clone mode); they
do not describe what the fully-inert restriction delivers. The only measured
number that supports the shipped (fully-inert-only) design is the **−40.2%
fully-inert 7-node subtree** row in M1, and this plan does not know how
common that shape is in the real corpus — that is precisely what the Phase-3
census (below) exists to find out. The honest target for this design is
**static chrome nested inside interactive islands** — headers, nav, icon
blocks, card scaffolding — not list rows, and Phase 3 should not be justified
by row-shape numbers.

## Founder decisions this approval commits to — RESOLVED, see top of doc

This section originally posed four open questions that a code-grounding pass
surfaced as unresolved. All four are now **ratified** — see
§Founder decisions (ratified 2026-07-24) near the top of this document for the
binding answers (opt-in `trackSignals`, the ≥5-node/≥30%-of-components/≥25%
aggregate-share census threshold, the #540 hard sequencing edge, and the
real-`<template>` + precise SVG-root rule + `<pre>`/`<textarea>` exclusion).
The phase plan below has been reconciled against those answers; where earlier
prose in this doc still frames any of the four as an open choice, the ratified
section governs.

## Plan

### Phase 0 — the benchmark, first, non-negotiable

Nothing else in this plan may land before this exists. No current bench can
attribute a codegen change to a runtime number: `bench/arbor` hand-writes
`branch()/leaf()` and never invokes the compiler; `bench/js-framework-benchmark`
is explicitly "no SFC, no compiler"; `bench/compiler-conformance` has zero
timing; `bench/ssr-string` measures the server string path only.

**`bench/compiled-mount`** — compile real `.aihu` fixtures with the release
binary at `--target client` (the proven `bench/ssr-string/bench.ts` method),
import the artifact, mount through real `@aihu/arbor`, assert DOM equivalence
before timing, then measure mount + dispose.

Two harness requirements, both learned the hard way this session:

- **Real headless Chrome, not JSDOM.** JSDOM implements `cloneNode` in
  JavaScript, so a JSDOM harness would mis-price the single operation under
  test. This is why `bench/arbor`'s JSDOM basis cannot be extended to cover
  this work.
- **Ship invariant control workloads in the same process** —
  `raw-dom-construct`, `tree-alloc-only`, and a pure `signals` loop, none of
  which any change here can affect. Contention then shows up *in-band*: if the
  controls moved, the run is void. This converts the "re-run before believing a
  regression" folklore into something the gate can check mechanically, and it is
  what separated a real 14% win from a bogus 2x regression in M3.

Also in Phase 0, independent and one line: fix the `bench/ssr-string/bench.ts:117`
assertion to compare template bytes rather than template-plus-state-channel
(M5), restoring an existing bench to service.

### Phase 1 — smallest provable win: stop allocating throwaway paths (`@aihu/arbor`)

**Ablation ceiling: −12…−14% mount on the krausest shape, −5…−7% on the
binding-free shape, with no compiler change and no hydration exposure. The
mechanism to realize it is now ratified (Founder decision 1, opt-in
`trackSignals`) — the number below is still an upper bound taken by removing
the strings outright, not by the opt-in flag as implemented, so it must be
re-measured once built, not assumed.**

**The naive gate does not fire where it matters.** `registry != null` is not a
usable proxy for "something will consume this path" on the real call graph:
`mount()` and `hydrate()` unconditionally construct a `signalRegistry` and
thread it into every top-level `_materialize`/`_hydrateNode` call
(`packages/arbor/src/mount.ts:346,369-377`, `packages/arbor/src/hydrate.ts:435`),
and `MountScope.serialize()` — the thing the registry backs — is a public
client API, not an SSR-only hook (consumed by
`packages/agent-server/src/bridge-client.ts` and `packages/store/src/ssr.ts`).
The gate is only free today inside `when()`/`each()` subtrees, where `_mc`
(`structural.ts:80`) already omits the registry. That covers part of the
krausest-row-list shape but none of a component's own top-level tree, and
none of the binding-free data-table shape unless it happens to be
`each()`-rendered.

**Ratified mechanism (Founder decision 1): make the top-level registry
opt-in.** Add a `MountOptions.trackSignals` flag, defaulted **on** for SSR and
hydrate paths and for any component tree that declares `__agentBinding` or
otherwise needs serialization, defaulted **off** for a plain client mount.
`serialize()` returns `{}` when the tree was mounted untracked — that contract
is now part of the public API surface, not an internal detail.

A deferred-tuple redesign (storing a `(parentPathRef, index, kind)` tuple per
node/binding instead of a formatted string, and building the string lazily
only inside `registry.set`, `__DEV__`, and the throw path) was considered and
**rejected** in favor of the opt-in flag: it avoids the public-API question but
is more invasive — it touches all seven call sites' data shape, not just their
gating — for no measured advantage over the flag. It is not being pursued.

**Explicit Phase-1 task, not optional cleanup: audit the two client
`serialize()` consumers against the new contract before this ships.**
`packages/agent-server/src/bridge-client.ts` and `packages/store/src/ssr.ts`
both call `serialize()` today assuming a populated registry. Each call site
must be checked and, where it depends on `serialize()`'s output, updated to
pass `trackSignals: true` (or otherwise land on a mount/hydrate path that
defaults it on) — otherwise it silently starts receiving `{}` the moment this
ships. This audit is a merge-blocking Phase-1 deliverable, tracked alongside
the flag itself, not a follow-up.

The `errorHandler(err, path)` case is cold either way and keeps a useful path
by reconstructing it at throw time from the DOM (`node.el` back-references
already exist at `materialize.ts:170`), so error reporting does not regress
under the opt-in design.

Ship behind the Phase-0 bench with the controls green, and re-run the
ablation-style measurement against the opt-in mechanism as implemented (not the
original all-strings-removed patch) before pricing Phase 3 against a Phase-1
number, per the Risks section.

### Phase 2 — compile throughput: build the napi addon

**Independent of all four ratified decisions above — can start immediately,
gated on nothing in this plan.** Not a Rust change. `packages/compiler/src-native`
exists and `js/envelope.ts` already prefers it; it simply is not built or
installed in this workspace, so every `.aihu` file pays the 14.7 ms spawn
measured in M4. Build it, wire it into the workspace install, and assert in CI
that the CLI-spawn fallback is not silently in use. Expected ~90–95% cut in
per-file compile wall-clock, from already-written code — the highest-ROI item
in this entire plan.

Add a minimal criterion harness around `compile_envelope()` at the same time —
compiler throughput currently has **zero** bench coverage, and Phase 4 must not
be attempted without one.

### Phase 3 — static-subtree clone units

Only after Phases 0–2, and only if the Phase-0 bench shows the remaining
DOM-construction share is still the top cost. **Additionally gated, before any
step below can start, on PR #540 (`design/light-dom-leaf-flip`) landing and
unifying `data-a` stamping across `template_emit.rs`/`ssr_string_emit.rs`, per
Founder decision 3 — this is a hard sequencing edge, not an ordering
preference.** Order within the phase:

0. **Sequencing precondition: PR #540's `data-a` stamping unification.**
   Confirm `template_emit.rs` and `ssr_string_emit.rs` stamp `data-a` through a
   single shared attribute-normalization step, and that a rendered-DOM
   conformance check (not string-only) exists comparing clone-lowered vs.
   branch-lowered output. Do not start step 1 until this is true.
1. **Corpus census, hard precondition for all of Phase 3 — not just codegen
   emission.** `is_inert` bottom-up pass + clone-unit selection (Rust, no emit
   change), run behind a flag against real apps, counting qualifying units by
   size under the fully-inert-only restriction (not the clone+STAMP variant the
   18.6%/6.9% numbers came from). **Ratified acceptance threshold (Founder
   decision 2), decided before the census runs: fully-inert subtrees of ≥5
   nodes present in ≥30% of components, AND an aggregate inert-node share
   ≥25%.** Below that bar, **stop here**: this includes step 2 (the arbor
   `clone()` node kind), which an earlier draft treated as conceptually
   independent of the census result and thus separately fundable. It is not —
   building the `_materialize`/`_hydrateNode` machinery for a node kind the
   codegen will almost never emit is unjustified cost with no measured payoff.
2. `clone()` node kind + `_materialize` case + `_hydrateNode` skip case (arbor).
3. Codegen emission reusing `ssr_string_emit` in `__h = false` mode, respecting
   the ratified `is_inert` rules for SVG-root vs. SVG-descendant and the
   `<pre>`/`<textarea>` exclusion (Founder decision 4), plus golden fixtures in
   `bench/compiler-conformance` and the sandwiched-hydration differential test
   (including the text-adjacency fixture from the corrected §SSR and hydration
   analysis above).

### Phase 4 — conditional, gated on Phase 3 data

Only with a number attached, from the Phase-0 bench:

- **Static attribute-object hoisting.** `{ class: 'col-md-1' }` literals
  re-allocate per row today. But tree allocation is *4%* of mount (M2), and attr
  objects are a fraction of that — **estimated < 2%**, and clone units already
  absorb the inert ones. Low priority; do not assume it is free to implement.
- **Event delegation.** krausest attaches 2 listeners/row. My M1 arms both
  include `addEventListener`, so the delegation win is **not isolated by any
  measurement in this plan** — it must be measured before it is designed. Do not
  cite a number for it.
- **`SVG_TAGS.has(tag)` per element** (`materialize.ts:168`): the compiler knows
  statically whether a tag is SVG and could emit a flag. Sub-1%. Mentioned for
  completeness only.
- **Rust allocation cleanups** — one `oxc` `Allocator` reset per file instead of
  per expression, and threading a `&mut String` through `template_emit.rs`'s
  recursive owned-`String` emitter. Both are genuine inefficiencies. Both target
  the 1–3 ms compute that M4 shows is ~1% of today's per-file cost and would be
  ~20% of it *after* Phase 2. Worth doing eventually, worthless to do now, and
  not without the criterion harness from Phase 2.

## Not doing

- **`rayon` / `par_iter` in the compiler crate.** The Vite plugin's
  `transform(code, id)` hook fires once per module and there is no batch entry
  point in the crate or its JS bindings, so every invocation has exactly one
  file's serial work. Parallelism, if ever needed, belongs in a JS-side worker
  pool over the napi calls.
- **A Rust-side content-hash compile cache.** `packages/compiler/js/transform-memo.ts`
  already implements one (SHA-256 keyed, FIFO-bounded, fingerprinted on the
  binary's mtime+size). Its only gap is that it is process-local and cannot help
  across CI jobs — a disk-persistence question, not a Rust question.
- **Bulk `innerHTML` list rendering.** Measured 21.5% *slower* than
  `createElement` (M1). Dead.
- **Compile-time node-path indices / `firstChild` chains.** Measured
  indistinguishable from `querySelector` (M1: 25.3 ms vs 24.9 ms), and made
  entirely unnecessary by restricting clone units to fully-inert subtrees. This
  is the machinery that usually sinks this kind of migration; the design avoids
  needing it rather than building it well.
- **Cloning partly-dynamic subtrees (the Solid model).** It is what forces
  path indices back in, it is what entangles conditional and keyed-list
  boundaries, and it is where the hydration miscount risk lives — for a measured
  7–19% of the DOM portion, i.e. roughly 5–11% of mount. Revisit only with
  Phase-3 numbers in hand.
- **Optimizing the declarative tree itself.** It is 4% of mount (M2). Replacing
  `branch()/leaf()` with a DOM-instruction codegen would be a rewrite of the
  compiler's output contract to chase a 4% line item.
- **Stripping `data-aihu-path` from inert SSR subtrees.** Real dead weight, but
  it changes the wire grammar pinned by the differential suite. Separate
  proposal.

## Risks

- **Hydration path desynchronization (highest).** A clone unit that consumes the
  wrong number of path indices silently mis-binds *later siblings* rather than
  failing loudly. Mitigated by the one-element-one-index invariant and gated on
  the sandwiched-hydration differential test; that test is the Phase-3
  merge condition, not a follow-up.
- **Bench noise producing false confidence in either direction.** The M3 first
  attempt showed a 2–8x "regression" that was pure contention. The in-band
  control workloads in Phase 0 exist specifically for this and should be
  mandatory in every run, including CI.
- **Phase 1's ceiling is an ablation, not an implementation.** 14.4% comes from
  removing the strings entirely; `registry != null` is not a usable gate
  because `mount()`/`hydrate()` unconditionally allocate the registry on every
  top-level client mount (see Phase 1). The mechanism is now ratified
  (Founder decision 1: opt-in `trackSignals`), but it still needs its own
  before/after measurement once implemented — treat the 14.4%/5.5% figures as
  an upper bound on Phase 1, not a committed number. If the realized number
  lands materially below ~8%, re-price Phase 3 against it before proceeding.
  Separately, the `bridge-client.ts` / `store/src/ssr.ts` audit (Phase 1,
  Founder decision 1) is merge-blocking: shipping the opt-in default without
  it silently breaks any caller of `serialize()` that assumed a populated
  registry.
- **The light-DOM leaf flip (`data-a` scoping) and Phase 3 can invalidate each
  other if unsequenced.** `template_emit.rs` and `ssr_string_emit.rs` are
  separate emitters; if the flip's stamping pass isn't unified across both
  before clone units reuse `ssr_string_emit`, clone-lowered markup can silently
  drop scoped styles that branch-lowered markup keeps. **Ratified as a hard
  sequencing edge (Founder decision 3): PR #540 gates Phase 3**, not merely a
  risk to manage in parallel. See §Interaction with the light-DOM leaf flip.
- **`__tpl`'s parsing contract is now specified (Founder decision 4)** — a real
  `<template>` element, root-is-svg allowed, svg-descendant-root refused,
  `<pre>`/`<textarea>` excluded from `is_inert` in v1 — but it still must be
  pinned by conformance fixture before Phase 3's codegen-emission step, not
  merely documented in this plan. Read naively (a `div.innerHTML` shim, or a
  blanket "no SVG" rule instead of the precise root-vs-descendant rule), the
  unspecified version mis-renders SVG-rooted clone units or forfeits the
  large-inert icon-block case entirely.
- **Corpus may not contain many large inert subtrees.** Phase 3 step 1 is
  explicitly a stop-or-go measurement for exactly this reason: a codebase of
  small, densely-bound templates gets little from clone units regardless of how
  well the mechanism is built. The ratified threshold (Founder decision 2:
  ≥5-node subtrees in ≥30% of components, ≥25% aggregate inert-node share) is
  what the census is checked against — it does not guarantee the corpus clears
  it, only that the bar can't be moved after the fact.
- **`bench/compiled-mount` depends on the release binary and a real browser**,
  making it heavier than the existing JSDOM benches. It should stay a
  non-required CI job like `bench` and `bench-arbor`, run on demand, with the
  `[bench-bump]` override honored.
- **Two arbor node kinds for the same markup** (`clone` on fresh mount, adopted
  DOM on hydrate) is a permanent branch in `_materialize`/`_hydrateNode`. Small,
  but it is new surface in the most correctness-sensitive file in the runtime.
