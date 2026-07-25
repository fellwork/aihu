# Composed-tree event substrate for `@aihu/use` Wave 2

**Date:** 2026-07-24
**Status:** Design ratified by evidence below; **implemented and verified** (PR #564) — see §8.
**Scope:** ONE shared substrate module unblocking Wave 2's five shadow-DOM-blocked composables.
Substrate only — none of the five composables ship here.
**Parent plan:** [`2026-07-24-use-categorical-parity.md`](./2026-07-24-use-categorical-parity.md)
— §3 Elements ("CORE, **composed-tree adaptation required**"), fable correction #2, founder
rulings A + B, Wave 2.

---

## 0. TL;DR

| Question | Answer |
|---|---|
| Does `@aihu/primitives/composed-tree.ts` already cover this? | **Partially — and NOT the part that matters most.** Its `composedActiveElement` is exactly right. Its `composedContains` is the **wrong tool** for event hit-testing and does not fix `useClickOutside` (proof in §2). The `composedPath()` hit-tester the plan actually calls for **exists nowhere in the repo as a helper** — it is hand-rolled inline in four places. |
| Extend it, or write new? | **Both, deliberately.** Extend `@aihu/primitives/composed-tree.ts` with the missing event layer (unblocks `useContextMenu`, which lives in primitives). Add a CORE-legal sibling in `@aihu/use` — because `@aihu/use` CORE **cannot** import `@aihu/primitives` and never will (§3). |
| Home | `packages/use/src/shared/composed-tree.ts` (CORE-internal; no rolldown entry, no export-map entry, no size row) + a matching event layer in `packages/primitives/src/composed-tree.ts`. |
| Size budget | **Zero rows touched.** Both modules are internal + tree-shaken; the `@aihu/use` copy has no consumer until Wave 2, the primitives additions are unused exports in an already-bundled internal module. Per-function budget for Wave 2 authors in §5. |
| Duplication risk | Neither copy has **any module-level mutable state** (verified §4) — the cost is bytes, not ownership. Drift is contained by a **semantic parity test** that runs one behavioural table against **both** implementations. |

---

## 1. The problem, restated precisely

Per fable correction #2 (parent plan, lines ~140-144), five Wave 2 composables —
`useClickOutside`, `useActiveElement`, `useHover`, `useMouseInElement` (CORE) and
`useContextMenu` (`@aihu/primitives`) — all block on the same two facts:

1. **Event retargeting.** An event that crosses an open shadow boundary has its `target`
   (and `relatedTarget`) rewritten to the outermost host visible to the listener's root.
   A `document`-level listener therefore *never* sees the real originating node.
2. **`activeElement` stops at the first host.** `document.activeElement` returns the
   outermost shadow host, not the actually-focused leaf.

Both are the **default** case in a custom-elements framework, not an edge case.

### Measured in this repo's own test environment (jsdom, `vitest.config.ts` `environment: 'jsdom'`)

A probe run against `<div id=host>` (open shadow root) → `<div id=panel>` → `<button>`,
clicking the button, listening on `document`:

```
RETARGETED  event.target === host              → true      (the real target is gone)
            panel.contains(event.target)       → false     ← the canonical click-outside bug
            event.composedPath()               → BUTTON > DIV(panel) > ShadowRoot > DIV(host) > BODY > HTML > Document > Window
            composedPath().includes(panel)     → true      ← the fix
CLOSED root event.target === host2             → true
            composedPath().includes(inner)     → false     (path truncated at the closed host — documented limitation)
ACTIVE (2×nested open roots, innermost button focused)
            document.activeElement === outerHost → true    ← the canonical useActiveElement bug
            outerRoot.activeElement === midHost   → true
            midRoot.activeElement === button      → true    ← recursive drill reaches the leaf
```

jsdom implements retargeting, `composedPath()`, closed-root path truncation, and per-root
`activeElement` faithfully. **Every acceptance test in this design is expressible against
real shadow boundaries, not a mock.**

---

## 2. Reuse-vs-new: the decision, with evidence

### 2a. What `packages/primitives/src/composed-tree.ts` already gives us

Landed #538 (`6c4d9cbe`), hardened #543 (`aff5bf37`). It is a genuinely good substrate and is
already the repo's reference-correct **tree** walk:

| Export | Wave 2 relevance |
|---|---|
| `composedActiveElement(root?)` (`:195`) | **Exactly what `useActiveElement` needs.** Recursive drill through open roots. Reuse the semantics verbatim. |
| `composedParent(node)` (`:95`) | Needed as the fallback up-walk (slot-aware, `ShadowRoot -> .host`). Reuse verbatim. |
| `composedContains(container, node)` (`:179`) | **Necessary but NOT sufficient — see 2b.** Correct for non-event containment (e.g. a `relatedTarget` already resolved to a real node). |
| `composedChildren` / `walkComposedTree` / `composedQuerySelector(All)` / `composedClosest` / `composedCompareOrder` | Not needed by any of the five. Down-walk + ordering machinery for focus-trap/form-control. |
| `isTabbable` / `queryTabbables` / `orderScope` | Not needed by any of the five. ~180 lines of focus-navigation-order machinery. |

**Roughly 60% of the file is focus-order machinery none of the five composables want.**
That matters for the placement decision: even if CORE *could* import it, a CORE composable
should not be reaching into a module whose centre of gravity is `useFocusTrap`.

### 2b. Evidence that `composedContains` does NOT fix `useClickOutside`

This is the load-bearing finding, and it is the reason "just reuse `composed-tree.ts`" is the
wrong answer.

`composedContains(container, node)` walks **UP** from `node` via `composedParent`. But
`event.target` has already been retargeted **UP** to the outermost host. In the probe above,
walking up from `host` goes `host → BODY → HTML → Document`. `panel` is *below* `host`, so it
is never on that chain:

```
composedContains(panel, event.target)  →  false      (same wrong answer as panel.contains())
composedPath().includes(panel)         →  true
```

An up-walk can never recover information that retargeting destroyed. Only
`event.composedPath()` — which the *browser* builds before retargeting — can. The two are not
interchangeable, and swapping `Element.contains` for `composedContains` in `useClickOutside`
would ship a fix that measurably does not work. (This is precisely the failure mode the repo's
standing lesson warns about: a green unit test over light DOM, broken behaviour in the app.)

### 2c. Evidence that the `composedPath()` hit-tester does not exist anywhere

There is **no** `composedPath` helper in the repo. There are **four independent inline
hand-rolls**, each solving a slice of the same problem:

| Site | Inline form |
|---|---|
| `packages/app/src/client.ts:341` | `e.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement)` |
| `packages/runtime/src/a11y.ts:204` | `!e.composedPath().includes(host)` |
| `packages/primitives/src/label/index.ts:143` | `ev.composedPath()` → `path[0]` as the true target |
| `packages/use/src/useFocusWithin/index.ts:85` | `e.composedPath()[0]` as the real focused node |

`useFocusWithin` is already a shipped `@aihu/use` CORE composable hand-rolling this. Without a
substrate, Wave 2 adds four or five more hand-rolls — the exact outcome fable correction #2
told us to avoid.

Separately, `composedActiveElement` **already has a second copy**: `_deepActiveElement()` in
`packages/runtime/src/a11y.ts:131`, whose own docstring says it "mirrors
`@aihu/primitives/composed-tree.ts`'s". So the recursive-`activeElement` drill is already
duplicated 2× in the repo today, before Wave 2 adds a consumer.

### 2d. Verdict

> **Reuse the semantics; do not reuse the module.** Extend `@aihu/primitives/composed-tree.ts`
> with the missing event layer (it is the correct home for `useContextMenu`'s needs), and add a
> minimal CORE-legal sibling under `packages/use/src/shared/` for the four CORE composables,
> bound to the primitives copy by a mechanical parity test.

"Don't build it, `composed-tree.ts` already covers this" was a live candidate and is
**rejected on measured evidence** (§2b): the single highest-value composable in the batch,
`useClickOutside`, is not fixed by anything currently in that file.

---

## 3. Chosen layer, and why every alternative loses

`@aihu/use` CORE's dependency contract is enforced in code, not just prose.
`scripts/dep-check.ts` → `allowedExternals()`:

```ts
const out = new Set<string>(['@aihu/signals'])
if (cls.kind === 'family-member') { /* … families.json peers … */ }
```

A CORE entry gets `{'@aihu/signals'}` and nothing else. Combined with founder **ruling A**
("the `@aihu/use` CORE surface is dependency-free (signals-only)"), which the parent plan marks
as *not reopened*, this closes the door on every cross-package option below.

| Option | Verdict |
|---|---|
| **A. CORE imports `@aihu/primitives`** | **FAIL.** `check:deps` errors (`'useClickOutside' imports '@aihu/primitives', which is not in its allowed externals (@aihu/signals)`). Also drags `@aihu/arbor` + `@aihu/css-engine` into `@aihu/use`'s `dependencies`, killing ruling A outright. |
| **B. `@aihu/signals/composed-tree` subpath** | **Mechanically legal post-#562** — `isAllowedExternal()` now does package-BOUNDARY matching, so `@aihu/signals/composed-tree` passes exactly like `@aihu/signals/lifecycle`. The brief asked me to re-check this specifically; I did, and it is the one option #562 genuinely opened. **REJECT anyway, on architecture:** `packages/signals/src/` contains **zero** references to `document`, `window`, `HTMLElement`, or `Element` (verified by grep — not one file). `@aihu/signals` is the DOM-free reactivity core; `@aihu/signals/lifecycle`'s own alias comment in `vitest.config.ts` calls it "the DOM-free ownership contract module". Putting a shadow-DOM tree walk there is a category error, forces `lib.dom` into the package that ships to Workers/SSR, and adds a row to the tightest budget in the repo (`@aihu/signals` 2350 B). |
| **C. New leaf package `@aihu/composed-tree`** | Architecturally the *cleanest* end-state, and the only option that yields one copy repo-wide. But it is still not `@aihu/signals`, so it needs (i) a `dep-check.ts` change to widen CORE's allowed set and (ii) a founder amendment to ruling A. Plus a new npm publish surface and new size rows. **Deferred, recommended as follow-up if a third consumer appears** (§7). |
| **D. `@aihu/use/elements` family with `@aihu/primitives` as an optional peer** | Mechanically legal (`families.json` peers). **REJECT:** it demotes the four most-commonly-reached-for composables out of CORE into a subpath, contradicting §3 Elements' explicit `CORE` target, and makes a peer that is mandatory-in-practice look optional. |
| **E. Move the five to `@aihu/primitives`** | **REJECT:** contradicts the ratified §3 Elements table (`useClickOutside`/`useActiveElement`/`useHover`/`useMouseInElement` → CORE). Rulings are not reopened here. |
| **F. Invert: `@aihu/primitives` depends on `@aihu/use`** | One copy repo-wide without touching ruling A, and package-level `check:deps` would allow it (`@aihu/*`). **REJECT:** inverts the intuitive layering (composables depending on nothing vs. primitives depending on composables), and the blast radius is `focus-trap.ts`, `label/`, `form-control/`, `dialog/` plus `ignore:` edits on ~20 `@aihu/primitives` size rows. Wrong risk profile for a substrate PR. |
| **G. CORE-internal `src/shared/composed-tree.ts`** | **CHOSEN.** `dep-check.ts`'s subpath walk explicitly permits a CORE entry to reach `core files, and shared/`. No package dep, no gate change, no ruling amendment, no new publish surface, zero size rows. |

### Why `src/shared/` and not `src/shared/index.ts`

`shared/index.ts` is a real rolldown entry with its own public subpath (`@aihu/use/shared`) and
a **320 B** size row. The composed-tree substrate is *internal plumbing*, not public API, and
folding it into that barrel would (a) blow the 320 B row and (b) publish a surface we do not
want to support. It lands as a **sibling file with no rolldown entry and no export-map entry**,
inlined + tree-shaken into each importing composable — which is exactly the model
`packages/use/rolldown.config.ts` already documents:

> "Shared substrate is double-counted across importing rows on purpose: budgets stay honest
> per import path."

---

## 4. Why duplication is acceptable here (and how it is contained)

The brief's hard constraint is *"do NOT duplicate module-level state across bundles; a second
instance breaks ownership silently."* That constraint **does not bind** here, verified:

- `packages/primitives/src/composed-tree.ts` has exactly one module-level binding —
  `const FOCUSABLE_SELECTOR` (a string literal). **No mutable state, no registry, no
  `WeakMap`, no counter, no singleton.** Every export is a pure function of its arguments.
- The `@aihu/use` module is specified the same way: pure functions only, no module state.

Two instances of a pure function are a **byte cost**, not an ownership hazard. (And an app
consuming both `@aihu/use` and `@aihu/primitives` from npm already receives two independently
published bundles regardless of what we do at the source level.)

**Drift is the real risk, and it is mechanically contained:** `packages/use/tests/composed-tree-parity.test.ts`
runs a single behavioural table against **both** implementations. A semantic divergence is a
red test, not a silent one. This satisfies the parent plan's "ONE shared helper, not five
one-off fixes" — one *semantics*, enforced by a gate, rather than five ad-hoc `composedPath()`
inlines.

`@aihu/primitives` is added to `@aihu/use`'s **`devDependencies` only**. `dep-check.ts` reads
`dependencies` / `peerDependencies` / `optionalDependencies` and never `devDependencies`, so
this is invisible to the gate — correctly, since a test-only import ships no bytes.

---

## 5. API surface

### 5a. `packages/use/src/shared/composed-tree.ts` (new, CORE-internal)

```ts
/** Retargeting-proof event path. `[]` for events that predate/lack composedPath. */
export function composedPathOf(event: Event): EventTarget[]

/** The TRUE originating node (`composedPath()[0]`), before retargeting. */
export function composedEventTarget(event: Event): EventTarget | null

/** Did `event` originate inside `node`'s composed subtree? THE hit-tester.
 *  Falls back to a `composedContains` up-walk when composedPath is unavailable. */
export function isEventInside(event: Event, node: Node | null | undefined): boolean

/** `isEventInside` over several nodes — `useClickOutside`'s `ignore` list. */
export function isEventInsideAny(event: Event, nodes: Iterable<Node | null | undefined>): boolean

/** Composed-tree parent hop (slot-aware; `ShadowRoot -> .host`). */
export function composedParent(node: Node): Node | null

/** Up-walk containment across shadow boundaries. For already-real nodes only —
 *  NOT for `event.target` (see §2b). */
export function composedContains(container: Node, node: Node | null | undefined): boolean

/** Recursively drills open shadow roots' own `.activeElement` to the focused leaf. */
export function composedActiveElement(root?: Document | ShadowRoot): Element | null
```

### 5b. `packages/primitives/src/composed-tree.ts` (extended)

The same four **event-layer** functions (`composedPathOf`, `composedEventTarget`,
`isEventInside`, `isEventInsideAny`) added alongside the existing tree walk. The tree
functions are already there and are not touched. This is what unblocks `useContextMenu`
without it becoming hand-roll #5.

### 5c. A constraint discovered during implementation — binding on all five consumers

`composedPath()` is **only populated during dispatch**. Once the event finishes propagating
the platform returns an empty array, so:

> `isEventInside` / `composedEventTarget` must be called **synchronously inside the
> listener**. A deferred call (`setTimeout`, microtask, or a stashed event object) degrades
> **silently** back to the `event.target` up-walk — i.e. back to the broken behaviour, with no
> error.

This was found by an initially-failing test that read the substrate after `dispatchEvent`
returned, and is now (a) documented on both module headers, (b) asserted by an executable test
(`'DOCUMENTED GOTCHA: after dispatch ends the path empties and precision is lost'`). Every
Wave 2 composable must hit-test in the handler and store the **boolean**, never the event.
`useClickOutside`'s `pointerdown`/`pointerup` pairing in particular must record two booleans,
not two events.

### Deliberate non-goals

- No `queryTabbables` / focus-order port into `@aihu/use`. Focus-navigation order belongs to
  `@aihu/primitives`; none of the four CORE composables need it.
- No fix to `packages/runtime/src/a11y.ts:167,174` (light-DOM-only, Linear **FEL-397**). Out of
  scope per the brief, and nothing here builds on those two lines. `a11y.ts` is untouched by
  this PR (a concurrent agent owns that file).
- No change to `dep-check.ts`, `families.json`, `rolldown.config.ts`, `package.json` exports,
  or `.size-limit.json`.

---

## 6. What each Wave 2 composable gets — and what it still owes

| Composable | Target | Unblocked by | Still needs (NOT in this PR) |
|---|---|---|---|
| `useClickOutside` / `onClickOutside` | CORE | `isEventInsideAny` — the whole reason the composable was blocked | `pointerdown`/`pointerup` pairing (ignore drags that *start* inside) storing **booleans, not events** (§5c), capture-phase document listener, `ignore` target resolution (`MaybeElementGetter`), `isClient` no-op guard, `onScopeDispose` teardown |
| `useActiveElement` | CORE | `composedActiveElement` — complete, drop-in | `focusin`/`focusout` listeners on `document`, signal wiring, initial read, SSR static getter. Also owes a decision on collapsing `runtime`'s `_deepActiveElement` (3rd copy) — track separately |
| `useHover` | CORE | `isEventInside` on `pointerover`/`pointerout` | `relatedTarget` handling (also retargeted — resolve via `composedContains`, §2b's *correct* use), `delayEnter`/`delayLeave`, touch/pen suppression |
| `useMouseInElement` / `useElementByPoint` | CORE | `isEventInside` + `composedEventTarget` | `getBoundingClientRect` math, `elementX`/`elementY`/`isOutside` getters, scroll/resize invalidation. `elementsFromPoint` does **not** pierce shadow roots — that sub-feature needs its own design |
| `useContextMenu` | `@aihu/primitives` | primitives-side `isEventInside` (5b) | overlay ownership, positioning (reuse `tooltip`'s `position()`), dismiss-on-outside (uses the same hit-tester), keyboard menu semantics |

Also unblocked, opportunistically: `useFocusWithin` (shipped) can drop its inline
`composedPath()[0]` for `composedEventTarget` — **not done here** (it would move a green size
row for no behavioural gain).

---

## 7. Size budget

**Rows touched by this PR: zero — measured, not asserted.** A full `bun run build` +
`bun run size` was run against a baseline (this branch with `packages/primitives/src/composed-tree.ts`
reverted) and again with the change applied; the two reports are **byte-identical**
(`diff` returns nothing). Reported explicitly because the brief asks for the budget being
worked within:

| Row | Limit | Why unmoved |
|---|---|---|
| `@aihu/use/shared` | 320 B | Substrate is a *sibling file*, not part of the `shared` barrel |
| every `@aihu/use/use*` row | 200–1200 B | No existing composable imports the substrate |
| every `@aihu/primitives/*` row | — | The four added exports are unused by any current primitive; rolldown tree-shakes unused exports from an internal module to zero |
| `@aihu/runtime` (4735/4750 B), `@aihu/arbor` (3.10 kB/3200 B) | — | **Not touched.** Neither has headroom (arbor has ~25 B spare), which is a second, independent reason the substrate is not going anywhere near them |
| `@aihu/signals` | 2350 B | Not touched — see option B |

**Forward budget for Wave 2 authors.** The `@aihu/use` copy costs (gzipped, measured in §8):
the event layer alone is the cheap part; `composedParent` + `composedContains` +
`composedActiveElement` are the bulk. A composable importing only `isEventInside` pays for the
event layer *and* the `composedContains` fallback it references. Wave 2 rows should be sized
with that in mind rather than copied from the light-DOM VueUse equivalents.

## 8. Verification — results

| Gate | Result |
|---|---|
| `bun run build` | **0** |
| `bun run typecheck` | **0** (59 tasks) |
| `bun run check:deps` | **0** — "All packages pass dep-free check (v3 thesis)" |
| `bun run check:lint` | **0** — 35 warnings, identical to base |
| `bun run size` | **0** — report byte-identical to the baseline build |
| Scoped tests (`packages/use` + `packages/primitives`) | **0** — 96 files, 789 tests |
| Substrate tests alone | **0** — 41 tests across 3 files |

**Naive-vs-substrate proof.** `packages/use/tests/composed-tree-naive-proof.test.ts` runs the
same two assertions against either implementation, selected by `AIHU_NAIVE=1`:

```
$ AIHU_NAIVE=1 bunx vitest run packages/use/tests/composed-tree-naive-proof.test.ts
  Tests  2 failed (2)
    ✗ a click inside a shadow-hosted panel counts as INSIDE that panel
        expected false to be true
    ✗ the focused element is the deep leaf, not the outermost shadow host
        expected <div></div> to be <input></input>

$ bunx vitest run packages/use/tests/composed-tree-naive-proof.test.ts
  Tests  2 passed (2)
```

`AIHU_NAIVE=1` is the reviewer's one-command re-confirmation that the bug is real. The default
path is the substrate, so the file is a normal green test in CI.

**Shadow-boundary coverage** (`composed-tree.test.ts`, 25 tests): single and doubly-nested open
roots, slotted light content projected into a shadow wrapper, unslotted light children of a
shadow host, closed roots (path truncation, the closed-host fallback, and its bounds), the
post-dispatch degradation, and negative controls asserting that `Element.contains` **and**
`composedContains` both give the wrong answer where `isEventInside` gives the right one.

**Parity** (`composed-tree-parity.test.ts`, 14 tests): one behavioural table run against both
implementations via `describe.each`.

**Pre-existing, unrelated:** `packages/compiler/tests/state-model-sidecar-tsc.test.ts` and
`packages/css-engine/tests/resolve-binary.test.ts` fail identically on base and on this branch
(compiler binary resolution). A further ~12 compiler/language-server files fail only under the
full parallel `bun run test` and pass in isolation on both base and branch — resource
contention, not a regression.
