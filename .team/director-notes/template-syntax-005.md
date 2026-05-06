# Director Note — topic:aihu-template-syntax track:userland-dx — Round 5 (User-Directed Scope Adjustment 2)

**Mode:** 2 (build/refactor — research/governance phase, fifth pass)
**Iteration counter:** 0 of 5 (no Builder ↔ Verifier yet — Builder phase begins post-user-approval)
**Date:** 2026-05-06
**Author:** Director
**Tags:** `topic:aihu-template-syntax track:userland-dx round:5 user-directed-scope-adjustment-2`

**STATUS:** R5 RATIFIED — manifest revised: **7 RATIFY-now / 3 DEFER-v0.4 / 8 DEFER-v0.5+ / 1 REJECT.** Codemod budget unchanged at 560 LOC; compiler/runtime grows ~270-390 LOC over r3's projection (+70-110 LOC for R7 atop r4). Builder seam plan = **5 rounds (Option A: R7 folded into B5 alongside R6)** — at iteration ceiling, but compatible. Synthesizer doc + topic_summary still stale on three rows (D2 → R5, D3 → R6, D4 → R7); Team Lead patches per §6.

---

## §1 — Trigger + decision

After r4's RATIFY-now expansion landed, the user issued a one-word directive: **"and context"**. This pulls **D4 ($context, WICG-Context-aligned tree-scoped DI) into RATIFY-now** alongside r4's R5 ($aria) and R6 ($controller). Reason: user-directed; pattern-continuation from r4. The three pulls (D2 → R5, D3 → R6, D4 → R7) form a coherent sugar-additions-via-`@state`-v2-collection-form bundle: each is a new collection-form macro alongside `$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event`; each lowers to a well-understood platform mechanism (ElementInternals for $aria; per-instance registry + lifecycle hooks for $controller; WICG Context Protocol for $context); each lands additively with zero codemod cost. **Manifest now 7 RATIFY-now total.** User has NOT green-lit Builder dispatch — curation continues. Refined user-surface message expected per §7.

---

## §2 — Spec-section text for $context collection (R7)

### §2.a — Surface (provider side)

Userland writes:

```aihu
@state {
  $context: {
    provide: {
      theme: $computed(() => isDark() ? darkTheme : lightTheme),
      user: currentUser,                          // signal reference
      locale: 'en-US',                            // static value
      router: { value: () => routerInstance, describe: 'App router instance' },
    }
  }
}
```

`$context` is a new `@state` v2 collection-form macro per macro-vocab-v2 §2 grammar. The collection has **two reserved sub-keys** at the top level: `provide:` and `consume:`. Both are sub-collections (object literals). At least one must be present; an empty `$context: {}` (or one with only empty sub-collections) is a parse warning per macro-vocab-v2 §2.1.

Inside `provide:`, each entry's value is one of:

- **Bare static value** (`locale: 'en-US'`) — provides the value as-is, non-reactive. Re-providing requires a re-render, which in aihu-land means a new SFC instance.
- **Bare signal reference** (`user: currentUser`) — when the value is a `Signal<T>` reference, the framework reads it through the consumer-side accessor; consumer re-reads automatically pick up signal changes.
- **Bare thunk via `$computed`** (`theme: $computed(() => …)`) — preferred shape for derived reactive providers. Per macro-vocab-v2 §3.2 grammar, `$computed` returns a signal-equivalent that the provider re-emits on dependency change.
- **Wrapped form** (`{ value: () => …, describe?: '…' }`) — when metadata coexists with the running code. Mirrors `$computed` shape. Forbidden keys for provider entries: `default`, `handler`, `on`, `expose`, `type` (provided values are tree-scoped, not agent-exposed surface).

### §2.b — Surface (consumer side) — canonical form

Userland writes:

```aihu
@state {
  $context: {
    consume: {
      theme: { type: ThemeToken, describe: 'Active theme from <ThemeProvider> ancestor' },
      user: { type: User },
      locale: { type: Locale, default: 'en-US' },
    }
  }
}
```

**Decision: the wrapped form is canonical.** Consumer entries are **always wrapped**; bare entries are forbidden. Two reasons:

1. **Type-safety requires it.** The `type:` key is the declaration-site type binding — Auditor B §2 explicitly cited Vue's `inject('foo'): unknown` foot-gun and called for "typed at the declaration site, not at the consumer." Bare entries can't carry a `type:` key.
2. **Default-value semantics matter.** `default:` is the value used when no ancestor provides the key. Components mounted outside any provider (which is always possible — consumers do not constrain their mount location) must specify what happens. Without `default:`, the consumer reads `undefined`; with `default:`, the consumer reads the fallback. Making this explicit per-entry beats hiding it.

Valid keys for consumer entries: `type` (REQUIRED), `default?`, `describe?`. Forbidden: `value`, `handler`, `on`, `expose`, `provide` (the `provide:` sub-collection is the producer side, not a per-entry key).

The consumer-side accessor is generated as a per-name signal: in `@template`, `<div data-theme={theme()}>` (call-syntax — same as `$computed`); in body code, `theme()` reads the current value, tracking through the standard signals pipeline (Scout D2).

### §2.c — Lookup semantics

Tree-scoped, **DOM-walking, Shadow-DOM-piercing.** When a consumer's `connectedCallback` fires:

1. Consumer dispatches a **`ContextRequestEvent`** (per WICG Context Protocol — name: `'context-request'`; bubbles: `true`; composed: `true`; cancelable: `false`).
2. Event payload: `{ context: <key>, callback: (value, unsubscribe?) => void, subscribe: true }`.
3. The first ancestor element whose `$context.provide` declares that key handles the event by calling the callback synchronously with the current value AND registering the consumer for future updates.
4. If no ancestor handles the event before it reaches the document root, the consumer falls through to its declared `default:` (or `undefined` if absent).

`composed: true` on the event means the request **walks up across Shadow DOM boundaries** via `composedPath()`-style propagation — the standard mechanism. This is what makes context work for Web-Components-native frameworks where every SFC instantiates its own Shadow root.

**Re-evaluation cadence.** Lookup happens **once per consumer mount** (subscribe = true), and the provider re-invokes the callback on every value change. Consumers do NOT re-walk the tree on every read; the ancestor binding is captured at mount time and held until disconnect. This matches Lit `@lit/context` semantics and is the standards-track answer.

### §2.d — Platform-alignment story

**Decision: Option (i) — implement the WICG Context Protocol directly.**

Auditor B §2 stated explicitly: "Lowering should use the WICG Context proposal (`@lit/context` is a polyfill) — Auditor A owns the lowering, but the design prescription is: tree-scoped (DOM-event-driven), typed end-to-end via `consume.<name>.type`, opt-in (no implicit context)." Three reasons to commit fully:

1. **Interop is non-negotiable for a Web-Components-native framework.** Per Director r4 §1 headline finding, aihu IS Web-Components-native (16/38 already-integrated). An aihu-only context protocol would be a regression on the platform-integration thesis. A WICG-aligned protocol means an aihu consumer reads from a Lit provider (and vice versa) with zero shim — that's load-bearing for the marketing story.
2. **The `@lit/context` polyfill is small and stable.** Aihu can ship its own minimal WICG-Context implementation in `@aihu/runtime` (~30-50 LOC for the event class + provider-registration pattern + consumer-subscribe plumbing) without a runtime dep on `@lit/context`. We adopt the **protocol shape**, not the package.
3. **Future-proofing.** ChromeStatus tracks "Context Protocol" as a Working-Draft proposal. Building on it now means aihu lands on the right side of the platform when it ships.

**Auditor A reference check.** Auditor A's report does not have a dedicated $context section (their pass focused on platform-mechanism for the 38-row matrix; WICG Context did not surface in their callouts). The lowering is fresh ground for Builder. Director r5 prescribes: ship our own minimal WICG-Context-Protocol-shaped implementation; do NOT depend on `@lit/context` as a runtime package. **Builder owns the lowering details; r5 sets the protocol target.**

Escape hatch: userland that needs to interop with a non-WICG provider can attach a custom event listener via `$lifecycle.mount` + `$ref` for full manual control.

### §2.e — Type-safety

Each context entry is keyed by **string** at the runtime layer (the WICG standard uses string keys — or richer "Context" instances; aihu starts with strings for simplicity). Type-safety lands at **compile-time** via the `.aihu.ts` sidecar (Architect spec §7):

- Provider side: each `$context.provide.<name>` entry's TypeScript type is inferred from the value (signal/computed/static).
- Consumer side: each `$context.consume.<name>.type` declaration is the contract. The sidecar emits a per-context-key registry interface; provider and consumer SFCs that share a key must agree.
- **Cross-SFC type matching:** the sidecar emits a global `interface AihuContextRegistry { theme: ThemeToken; user: User; locale: Locale; ... }` aggregated across all SFCs in the project. Provider declarations contribute entries; consumer declarations type-check against entries. A consumer requesting a key not registered by any provider in the project is a `tsc` error (configurable; default warn in v0.3, error in v0.4 once the LSP lands).

Runtime cast is a fallback for cases where the sidecar can't see the producer (third-party Web Components, dynamic import boundaries). Document this explicitly.

### §2.f — Reactivity

When a provider's value changes (signal updates), all currently-subscribed consumers reactively update. Wiring (per Scout D2 + standard signals plumbing):

- Provider's `$computed`/signal value is dependency-tracked. The provider has a `mountEffect` that re-fires on change, iterating its consumer-callback-registry and calling each callback with the new value.
- Consumer-side: the `(value, unsubscribe) => …` callback writes to a per-consumer `Signal` allocated at consumer mount. Consumer's `@template` references read that signal; the standard signals pipeline handles re-renders.

This means consumers update synchronously-within-microtask on provider changes — same cadence as any other signal-driven update.

### §2.g — Lifecycle interaction

- **Consumer registers on `connectedCallback`** by dispatching the `ContextRequestEvent` once. The provider's response includes the unsubscribe handle, which the consumer captures.
- **Consumer deregisters on `disconnectedCallback`** by invoking the captured unsubscribe handle.
- **Mount-order edge case (consumer mounts before provider):** within the same render burst, when the consumer's `connectedCallback` fires before the ancestor provider's, the dispatched event has no handler and falls through to default. **Solution:** the consumer's mount-time event dispatch is wrapped in a `queueMicrotask` defer when no synchronous handler responds. This gives the provider a chance to register before the consumer falls through. Deferred dispatch is single-shot — if no provider responds within one microtask, the consumer commits to the default. Document this magic-behind-it explicitly.
- **Reconnection:** consumer disconnects (unsubscribes) → reconnects (re-dispatches `ContextRequestEvent`). Provider lookup is fresh — if the consumer was moved to a different subtree, it picks up the new ancestor's provider. No stale binding.

### §2.h — IS-NOT-IN

- `$context` does **NOT** replace `$emit` (parent↔child events). `$emit` is for explicit, typed event flow up the tree; `$context` is for ambient values walked across the tree.
- `$context` does **NOT** replace global state. Module-scope-signal pattern (per Auditor B §2 recommendation 2; r3 §3 note) remains the documented answer for app-level singletons. Userland imports a signal directly: `import { currentUser } from '@/stores/auth'`.
- `$context` does **NOT** support cross-document propagation. `composed: true` walks up the host document; it does not cross iframe or document boundaries. Use `BroadcastChannel` for cross-document state.
- `$context` does **NOT** magically thread props. Use `$prop` + `$emit` combination for explicit data flow between known parent/child pairs. `$context` is for the case where the producer and consumer are arbitrary distance apart and the intermediate components don't care about the value.
- `$context` does **NOT** ship batteries-included context keys (no built-in `$context.theme` / `.locale` / `.router`). Userland or library code declares its own.

### §2.i — Acceptance criteria (Builder will run)

1. **Provider mutates → all descendant consumers reactively update.** Test SFC: `<ProviderRoot>` declares `$context.provide.count: $computed(() => signal())`; three nested `<ConsumerLeaf>` SFCs each declare `$context.consume.count: { type: number, default: 0 }`. Mutate the signal; verify all three leaves' templates re-render to the new value within one microtask.
2. **Consumer mounted outside any provider falls through to default.** Same `<ConsumerLeaf>` SFC, mounted directly under `<body>` with no `<ProviderRoot>` ancestor. Verify the consumer reads the declared `default:` value.
3. **Two ancestors providing the same key — nearest wins.** `<OuterProvider count=1>` > `<InnerProvider count=2>` > `<ConsumerLeaf>`. Verify the consumer reads `2`.
4. **Consumer survives reconnection.** Mount → unmount → remount the consumer under a different provider tree. Verify the consumer's value reflects the new ancestor's provider on remount.
5. **WICG Context Protocol interop.** Pick the simpler direction for round-3: **consumer-aihu × provider-Lit**. Mount a `LitElement` ancestor that uses `@lit/context`'s `provide` controller with key `'theme'`. Mount an aihu `<ConsumerLeaf>` consuming `theme`. Verify the aihu consumer reads from the Lit provider. (Provider-aihu × consumer-Lit is symmetric and adds confidence; defer to v0.4 follow-up if scope creeps in B5.)

### §2.j — Estimated LOC

~70-110 compiler + runtime additions:

- Parser for `$context` collection with `provide` / `consume` sub-collections: ~20-30 LOC
- Runtime `ContextRequestEvent` class + provider event handler installation: ~15-25 LOC
- Provider-side registry + signal-update propagation to subscribed callbacks: ~15-25 LOC
- Consumer-side per-key signal allocation + microtask-deferred-dispatch on mount: ~15-25 LOC
- Sidecar `.aihu.ts` registry emit (cross-SFC `AihuContextRegistry` aggregation): ~5-15 LOC

**0 LOC codemod** (additive — existing `.aihu` files don't reference `$context`; new collection slots in cleanly).

---

## §3 — Builder seam re-evaluation

r4 settled on a 5-round Builder plan (B1-B5). With R7 ($context) added, four options:

- **Option A** — fold R7 into B5 alongside R6 ($controller).
- **Option B** — add B6 as $context-only (busts the 5-round ceiling).
- **Option C** — re-cut B3 into B3a/B3b (compiler+runtime / codemod+sidecar), reaching 6 rounds with cleaner seams; R7 becomes B6 naturally.
- **Option D** — move R7 to a pre-B1 round (B0) since $context is the most independent of the seven items.

**Decision: Option A — fold R7 into B5 with $controller.**

Defense:

1. **Architectural symmetry.** R6 ($controller) and R7 ($context) are both new `@state` v2 collection-form extensions. Both lower through similar runtime patterns (per-SFC instance registry; lifecycle-hook integration via `connectedCallback` / `disconnectedCallback`). They share the same parser-extension shape (a new collection-keyword in the macro-vocab-v2 §2 grammar). Combining them in one round caches the parser-extension setup cost, the test-harness setup cost, and the integration-test run cost.
2. **LOC budget headroom.** B5 grows from r4's ~60-100 LOC ($controller alone) to ~130-210 LOC ($controller + $context). Tests roughly double (~120 LOC + ~150 LOC). **Combined round ~250-360 LOC src + ~270 LOC tests.** Still well under the 500-LOC-per-round playbook ceiling. B3 (Variant B template syntax + 560 LOC codemod) remains the largest round; B5 stays second-largest.
3. **No runtime overlap concerns.** $controller and $context register against different platform mechanisms ($controller: lifecycle-callback queue with declaration-order mount + LIFO dispose; $context: WICG ContextRequestEvent dispatch). No shared state; they don't interfere in tests or codegen.
4. **5-round ceiling preserved.** Per playbook lessons (`scope-too-big-stall-r-002-re-cut-playbook`), 5 rounds correlates with stall risk but is not a hard rule. Breaking the ceiling (Option B/C) without a stronger reason than "we have one more thing" is a discipline trip. The overhead of an additional round (state-handoff between B5 and B6, additional Verifier setup, extended user-attention) is real cost.
5. **Risk mitigation.** B5's brief specifies sample-based acceptance criteria covering both collections — the Builder runs the $controller AC suite (r4 §3.h, four cases) and the $context AC suite (r5 §2.i, five cases) as separate test groups within the same round. If either suite fails, the seam stays at B5; it does NOT auto-trigger a B5/B6 split.

**Rejected alternatives:**
- **Option B** busts the 5-round ceiling without a load-bearing reason — see above.
- **Option C** is architecturally clean, but B3 is already structured around the `B3.1 split if scope creeps` escape hatch (per r4 §5). Pre-emptively splitting B3 trades known-good plan for hypothetical future cleanliness.
- **Option D** disrupts r4's "B1 = canonical correctness fix" framing. R1 ($prop reactivity) is the correctness bug; it goes first. Anything before B1 is process noise.

---

## §4 — Updated ratify-now manifest (replaces r4 §4)

| ID | Proposal | Verdict | Spec section affected | LOC delta | Notes |
|---|---|---|---|---|---|
| R1 | `$prop` reactivity fix + optional `attribute`/`reflect`/`converter` keys | RATIFY now | new spec §X.1 | +50 LOC compiler emit, +20 LOC runtime | CORRECTNESS bug — Auditor A row 11 |
| R2 | `$lifecycle` four-callback extension | RATIFY now | spec §X.2 | +10 LOC runtime dispatcher | additive — Auditor A row 16 |
| R3 | `$show` → `hidden` attribute | RATIFY now | §3.D.27 (existing) | +5 LOC compiler emit | semantics-preserving — Auditor A row 27 |
| R4 | `$bind` write-side verify | RATIFY now | §11 acceptance criterion | 0 LOC if present; +30 LOC if absent | verification only — Auditor A row 22 |
| R5 | `$aria` + auto-keyboard-promotion | RATIFY now | new spec §X.4 (r4 §2) | +80-120 LOC compiler/runtime | r4 pull-in — Auditor B §4.1+§4.2 |
| R6 | `$controller` collection | RATIFY now | new spec §X.5 (r4 §3) | +60-100 LOC compiler/runtime | r4 pull-in — Auditor B §5.2 + Auditor A §A10.4 |
| **R7** | **`$context` collection (provide/consume, WICG-aligned)** | **RATIFY now** (was DEFER v0.4) | **new spec §X.6 (r5 §2)** | **+70-110 LOC compiler/runtime** | **r5 pull-in (this note)** — Auditor B §2.1 |
| D1 | DSD in SSR | DEFER v0.4 | new spec | – | unchanged |
| D5 | $form / @form (form-associated) | DEFER v0.4 | paired w/ R5 (shares `attachInternals()`) | – | unchanged |
| D6 | LSP / IDE story | DEFER v0.4 | tooling | – | unchanged |
| L1-L8 | (lower priority) | DEFER v0.5+ | – | – | unchanged from r3 |
| X1 | Customized built-ins | REJECT | n/a | – | unchanged from r3 |

**Total RATIFY-now LOC delta:** ~270-390 LOC compiler/runtime additions (was +200-280 in r4, was +85-115 in r3); **0 LOC codemod** (still 560 LOC base — all R1-R7 amendments are strictly additive).

**Re-cut threshold check.**
- Architect spec base: 540 lines (under 600 ceiling — pass).
- Variant B trigger categories: 3 of 4 unchanged (sigil change, value-form change, structural addition; runtime contract preserved). r2 override stands — R5/R6/R7 add new collections within the existing collection-form shape, not new sigils/value-forms/template-side structural changes.
- Compiler/runtime LOC: ~50% larger than r3's projection, but still under per-round 500-LOC ceiling when split across B1-B5 seams (B5 is ~250-360 LOC src — see §3 defense).
- **No formal re-cut required.** User-gate remains the binding constraint.

**Renumbering note.** r4 §4's manifest had D2/D3/D4 as "in v0.4 deferral" rows (D4 = $context). r5's pull-in eliminates D4 from the deferral list. The remaining v0.4 deferrals are D1 (DSD), D5 ($form), D6 (LSP) — three rows. The DEFER-v0.4 row count drops from 4 to 3.

---

## §5 — Builder seam plan (refined per §3 decision = Option A)

### B1 — R1 (`$prop` reactivity fix + optional keys)
Single-defect, isolatable, affects every SFC with props. **Canonical first round.**
- ~50-80 LOC src + ~100-150 LOC tests
- Tests synthetic: parent sets attribute → child signal updates; parent sets property → child signal updates; reflect roundtrips; converter roundtrip on Date.
- Branch: `feat/template-syntax-v2-b1`

### B2 — R2 + R3 + R4 (additive @state v2 + emit fixes)
Small additive items in @state v2 collection-form parser + emit.
- ~30-50 LOC src + tests
- R4 may be 0 LOC if write-side already wires; Builder verifies.
- Branch: `feat/template-syntax-v2-b2`

### B3 — Variant B template syntax (parser + codegen + runtime + codemod)
The largest single Builder round; the spec's core.
- ~250-300 LOC src (parser + codegen + runtime for `{#if}`/`{#each}`/`{:else if}`/`{:else}`/`{:empty}` + `$on.click` rename)
- ~200 LOC tests
- ~560 LOC codemod (all of the budget)
- Sidecar `.aihu.ts` for type-safety lands within B3, or splits as B3.1 if scope creeps.
- Branch: `feat/template-syntax-v2-b3` (with optional `feat/template-syntax-v2-b3-1` sub-branch)

### B4 — R5 (`$aria` + auto-keyboard + default-tabindex)
ElementInternals path. `attachInternals()` cached call + per-aria-key emit + role-based key dispatch + default-tabindex codegen pass.
- ~80-120 LOC src + ~150 LOC tests including axe-core integration if available.
- Tests synthetic: keyboard role components respond to Enter/Space; double-fire suppression on `<button>`; reactive aria-pressed update; default-tabindex injection.
- Branch: `feat/template-syntax-v2-b4`

### B5 — R6 (`$controller`) + R7 (`$context`) — combined collection round
Two new `@state` v2 collection-form extensions sharing the parser-extension and test-harness setup. **Depends on B1 completing** (R6 acceptance criterion (iv) requires R1's reactive `attributeChangedCallback` wiring; R7 has no B1 dependency but co-rounds with R6 per §3).
- ~130-210 LOC src + ~270 LOC tests
- Tests synthetic — $controller suite (r4 §3.h): declaration-order mount; LIFO dispose; reactive state from controller in @template; `attributeChange` fires on $prop update.
- Tests synthetic — $context suite (r5 §2.i): provider mutation propagates to all consumers; default fallback; nearest-ancestor-wins; reconnection; WICG interop with Lit provider.
- Branch: `feat/template-syntax-v2-b5`

### Round bounds and discipline

5 rounds total — at the iteration ceiling. Each round bounded ≤500 LOC src + tests per playbook lessons. B3 is biggest (~750 LOC including codemod, but codemod is partition-able). B5 is second-biggest (~250-360 LOC src + ~270 LOC tests = ~520-630 LOC); the test count is the variable load. **If B5's combined-test runtime triggers a Builder ↔ Verifier ping-pong loop (e.g., flaky WICG interop test against Lit's provider), Director surfaces immediately for B5 → B5a/B5b split (R6/R7 separation).** The fallback path is named so Builder doesn't have to ask.

### Codemod work

Lands as part of B3 only. R1-R7 are all pure-additive. Existing `.aihu` files don't break; the codemod only touches Variant B template-syntax migration.

### Branch convention

Feature branch `feat/template-syntax-v2` off main; sub-branches `-b1`...`-b5`. PR each into the parent feature branch; final merge of `feat/template-syntax-v2` to main as one Variant-B-as-shipped commit.

---

## §6 — Synthesizer + master-doc patch instructions

The Synthesizer landed BEFORE r4 OR r5 changes were known. The master doc + topic_summary are now stale on three rows (D2 → R5, D3 → R6, D4 → R7). Team Lead applies patches mechanically.

### Master audit doc patches

File: `c:\git\fellwork\aihu\docs\superpowers\specs\2026-05-06-spec-template-syntax-v2-platform-audit.md`

1. **§1 — Headline finding.** "16 already-integrated / 6 integrable / 13 extrapolating / 3 platform-is-worse" framing remains accurate. **Add a paragraph noting R5 + R6 + R7 are RATIFY-now sugar additions on top of the matrix, not re-categorizations.**
2. **§3 — Sugar proposals (consolidated).** Move D2 ($aria) → R5, D3 ($controller) → R6, D4 ($context) → R7 from "deferred-to-v0.4" treatment to full RATIFY-now status. Pull spec-section text from r4 §2 (R5), r4 §3 (R6), and **r5 §2 (R7) verbatim** into the master doc's §3. Remove the v0.4-deferral framing from these three rows.
3. **§5 — Ratify-now manifest table.** Replace the four-row table (R1-R4) with the **seven-row table from r5 §4 above**. Update LOC totals: ~270-390 compiler/runtime; 0 codemod (560 unchanged).
4. **§6 — Deferred items.** Remove D2, D3, D4 from the v0.4 deferred-items roadmap. Note that D5 ($form) shares `attachInternals()` cache with R5 (work reduction in v0.4). **No other v0.4 dependency reductions from R6 or R7.** Remaining v0.4 entries: D1 (DSD), D5 ($form), D6 (LSP).

### Topic summary patches

File: `c:\git\fellwork\aihu\docs\topic-summaries\template-syntax-summary.md`

1. **Round-3-audit-reconciliation section.** Update RATIFY-now manifest from 4/6/8/1 to **7/3/8/1** (RATIFY-now / DEFER-v0.4 / DEFER-v0.5+ / REJECT).
2. **Durably-true facts.** Add `$aria` + `$controller` + `$context` collections to the v0.3 ship list.
3. **Open-items.** Remove v0.4 deferral notation for these three rows.
4. **User-gate-question.** Replace with r5 §7 verbatim (paste the <400-word user-surface block).
5. **Citations.** Cite r4 (record 2048522989) + r5 (this record's id, returned in the AGENTS.delta.db write companion) as corrective notes.

---

## §7 — Updated user-surface message (replaces r4 §7)

**To paste verbatim (Team Lead):**

> **Round-5 update on aihu template-syntax v2: `$context` pulled into the v0.3 ship per your direction.**
>
> Updated manifest: **7 RATIFY-now / 3 DEFER-v0.4 / 8 DEFER-v0.5+ / 1 REJECT.** The seven round-3 amendments now include `$context` (provide/consume) — WICG-Context-Protocol-aligned tree-scoped DI, the Vue/Solid-shaped data-flow gap closer that walks across Shadow DOM boundaries via `composedPath()`-style event propagation. This means an aihu consumer reads from a Lit provider (and vice versa) with zero shim — load-bearing for the Web-Components-native marketing story.
>
> **Spec-section text drafted** at `.team/director-notes/template-syntax-005.md` §2 (R7: `$context`). The section covers provider/consumer surface (collection-form, wrapped consumer entries canonical), tree-scoped lookup semantics, WICG Context Protocol alignment (we ship our own implementation, not a `@lit/context` runtime dep), compile-time type-safety via the `.aihu.ts` sidecar's `AihuContextRegistry` aggregation, lifecycle/reconnection edge cases (microtask-deferred dispatch handles consumer-mounts-before-provider), IS-NOT-IN scope, and Builder acceptance criteria including a Lit-interop test.
>
> **Three remaining v0.4 deferrals:** DSD-in-SSR (D1, the Vite-elimination connection), `$form` (D5, pairs with `$aria` via shared `attachInternals()`), LSP (D6, single largest devex gap). Confirm these stay deferred, or call them out individually for a r6 pull-in.
>
> **Codemod budget unchanged at 560 LOC.** Compiler/runtime grows to ~270-390 LOC additions across all seven RATIFY-now items. All additive — existing `.aihu` files keep working.
>
> **Builder seam plan: 5 rounds (Option A — R7 folded into B5 alongside R6).** B1: $prop reactivity fix (canonical first). B2: $lifecycle/$show/$bind small additive. B3: Variant B template syntax + codemod (largest round). B4: $aria + auto-keyboard. B5: $controller + $context (combined collection round, ~520-630 LOC src+tests; B5a/B5b split named as fallback if WICG interop test goes flaky). At 5-round iteration ceiling.
>
> **Synthesizer doc + topic_summary still stale on three rows** — Team Lead patches per r5 §6 post-this-round.
>
> **Go/no-go:** "Ratify the 7 round-3 amendments (R1-R7), accept the 5-round Builder seam plan with R7 folded into B5 alongside `$controller`, and dispatch B1 (`$prop` reactivity fix) — yes/no?"
>
> **Optional clause:** if you want to pull D5 (`$form`) or D1 (DSD-in-SSR) too, say so and I'll re-cut. Otherwise these stay v0.4.

(Word count: 365.)

---

## §8 — Continuity check + iteration discipline

Round 5 of governance. **Three rounds of substantive user-directed scope adjustment after the original Variant B reconciliation:**

- r2: variant choice (Variant B over Architect's Variant A).
- r4: ratify-now expansion to D2 + D3 → R5 + R6.
- r5: ratify-now expansion to D4 → R7 (this round).

**Cadence is high — 5 governance rounds before any Builder dispatch.** The audit-driven approach has produced high-signal proposals: each pull-in addressed a coherent ergonomic concern. R5 is a11y, R6 is composition (cross-SFC behavior reuse), R7 is data flow (DI). These are the three bedrock UI-framework axes after props/events; pulling them all into v0.3 means the v0.3 ship is the framework's full-fledged SFC story, not a partial one.

**Flag for Historian retro:** was this signal-of-curation healthy or noise? My read: **healthy.** Indicators:

1. Each pull-in came from the user with a concrete signal (one-word "aria", one-word "controller", one-word "context"), not from director vacillation.
2. Each pull-in had spec-section text mostly pre-designed by Auditor A (ElementInternals lowering for $aria) or Auditor B (data-flow design for $context, lifecycle composability for $controller). Director's r4 + r5 work was reconciliation + edge-case design (auto-keyboard-promotion's double-fire guard; consumer-mounts-before-provider's microtask defer), not greenfield design.
3. The codemod budget stayed locked at 560 LOC across all five rounds. No userland breakage was added.
4. The Builder seam plan stayed at 5 rounds (Option A defended in §3). No round-count creep.

**Counter-signal to watch:** the round count itself. If a r6 pull-in lands ($form is the most likely candidate; user might pull D5 next), Director must re-justify the depth. **Hard gate per Director r1 §7:** Builder dispatch blocked until user approves. The user-surface go/no-go in §7 is the binding question.

**Counter still 0 of 5 (Builder ↔ Verifier sense).** Builder phase begins post-user-approval.

**Re-cut paths:**
- User approves R1-R7 + green-lights B1: round 6 = Builder B1 dispatch; counter goes to 1/5.
- User pulls another v0.4 deferral (D1/D5/D6) into round-5 RATIFY-now: Director r6 with revised manifest. Compiler/runtime LOC delta would approach the ~500-LOC-per-round ceiling on a combined B5; **likely triggers Option B (add B6) or Option C (re-cut B3) re-evaluation.**
- User defers Variant B and wants v0.4 spike on DSD or LSP first: Director r6 captures that; counter stays 0/5; new track.

---

*End of round 5 director-note. Synthesizer doc + topic_summary patches per §6 (Team Lead applies post-this-round). STATUS line + AGENTS.delta.db record below in companion outputs.*
