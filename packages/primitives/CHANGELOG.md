# @aihu/primitives

## 0.2.2

### Patch Changes

- Updated dependencies [[`ac9c045`](https://github.com/fellwork/aihu/commit/ac9c04599b2fbf57c9f39a39e1c9db7fe1388028), [`ac9c045`](https://github.com/fellwork/aihu/commit/ac9c04599b2fbf57c9f39a39e1c9db7fe1388028), [`ac9c045`](https://github.com/fellwork/aihu/commit/ac9c04599b2fbf57c9f39a39e1c9db7fe1388028)]:
  - @aihu/arbor@4.1.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`c38072f`](https://github.com/fellwork/aihu/commit/c38072f95ca4887c2968d7dabee176f577b44e6e)]:
  - @aihu/css-engine@0.6.0

## 0.2.0

### Minor Changes

- [#710](https://github.com/fellwork/aihu/pull/710) [`19af14c`](https://github.com/fellwork/aihu/commit/19af14c0989fcae8eed344c119ba91894e13c776) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Dedupe the two focus-trap implementations onto one (FEL-397 / [#537](https://github.com/fellwork/aihu/issues/537)), and fix
  the escape guard that could never fire.

  `@aihu/runtime`'s `<focusTrap>` helper carried its own trap — private focusable
  selector, its own shadow-aware DOM walk, its own Tab/Shift+Tab edge handling —
  in parallel with `@aihu/primitives`' `createFocusTrap`. It is now a thin
  reactive adapter: it locates the emitted host and maps the compiler's reactive
  `active` flag onto `activate()` / `deactivate()`. `createFocusTrap(active,
returnFocus, initialFocus, childFn)` keeps its exact signature, so no compiler
  change is needed.

  This also fixes the asymmetric escape guard rather than papering over it. The
  old code bound `keydown` to the trap host and tested
  `!e.composedPath().includes(host)` — which can never be true, because a
  `composedPath()` IS the event's propagation path and a listener only runs when
  its own node is on that path. The guard was unreachable in both directions, so
  merely adding the missing forward-Tab copy would have been a no-op. The shared
  implementation binds `keydown` on `document` in the CAPTURE phase, where it
  observes keydowns originating anywhere — so `composedContains(container,
current)` is a genuinely reachable "focus escaped the trap" state, symmetric
  across Tab and Shift+Tab.

  New in `@aihu/primitives`:

  - `createFocusTrap(container, options?)` accepts `initialFocus` (a selector
    resolved across the COMPOSED subtree, so it reaches into open shadow roots)
    and `returnFocus` (opt out of restoring the previously-focused element).
    `FocusTrapOptions` is exported; the existing no-options call is unchanged.
  - A dedicated `@aihu/primitives/focus-trap` subpath entry (1.31 kB gz), so
    consumers get the trap without pulling in the whole dialog primitive.
  - A trap whose container is detached without `deactivate()` no longer hijacks
    Tab page-wide (nor reads `activeElement` off a detached root).

## 0.1.6

### Patch Changes

- Updated dependencies [[`3ac389f`](https://github.com/fellwork/aihu/commit/3ac389f55b9f8a2a956122d394639d3f9bf21bef), [`bba7e84`](https://github.com/fellwork/aihu/commit/bba7e8441a836b01a5927e5f7e3b8870b3d8c3ac)]:
  - @aihu/css-engine@0.5.0

## 0.1.5

### Patch Changes

- [#538](https://github.com/fellwork/aihu/pull/538) [`6c4d9cb`](https://github.com/fellwork/aihu/commit/6c4d9cbef430e33456370f82c0310444c43f1325) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `composed-tree.ts`'s upward walk (`composedParent`) to consult
  `assignedSlot`, so it agrees with the slot-aware downward walk
  (`composedChildren`/`walkComposedTree`). Previously, `composedParent` only
  hopped `ShadowRoot -> .host`, never resolving a slotted node to its `<slot>` —
  so `composedContains`, `composedClosest`, and `composedCompareOrder` (all
  built on `composedParent`) silently disagreed with `queryTabbables` for any
  slotted subtree.

  This broke `createFocusTrap` in exactly the shadow-DOM-opt-in scenario it
  exists to support: a focus-trap container living inside a shadow tree that
  receives its content via `<slot>`. `queryTabbables` found the slotted
  focusable, but `composedContains`'s `!composedContains` guard fired on every
  Tab press, force-refocusing the first element and trapping the user on it —
  Tab could never reach the other slotted controls.

  It also silently degraded `<aihu-collection>`'s DOM-order sort
  (`sortDomOrder` / `composedCompareOrder`, used by `roving-focus` and
  `radio-group`) for light-DOM siblings slotted under a single shadow host: the
  ancestor chains diverged at the host with no common ancestor found, and the
  comparator fell back to `0`, silently reverting to registration order instead
  of rendered order.

  Added upward-walk slot-boundary tests (`composedContains`/`composedClosest`
  across a `<slot>`, and a `composedCompareOrder` probe for two slotted
  siblings under a shared shadow host) — the existing slot-boundary coverage
  only exercised the downward walk (`walkComposedTree`).

- [#543](https://github.com/fellwork/aihu/pull/543) [`aff5bf3`](https://github.com/fellwork/aihu/commit/aff5bf37a1b2358f8e7e9dcd71551a6afa8118d5) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `queryTabbables`' tab-order reconstruction to match the real HTML
  sequential-focus-navigation algorithm instead of reordering each
  focus-navigation scope in place at its original composed-DFS position.

  Previously, a nested shadow root's content stayed pinned at the document
  position its host originally occupied, rather than traveling WITH the host
  once the host's own scope was reordered by tabindex. This diverged from the
  platform's real Tab sequence in exactly the scenario this module exists to
  get right — a positive-`tabindex` element and a shadow host interacting in
  the same scope:

  - A natural host before a positive-`tabindex` sibling: returned `[b, x, a]`
    where the browser visits `[b, a, x]`.
  - A positive-`tabindex` host: returned `[host, a, x]` where the browser
    enters the host's shadow tree immediately after the host, visiting
    `[host, x, a]`.

  Both cases made `createFocusTrap`'s first/last-tabbable bookkeeping disagree
  with native Tab traversal, causing the trap to wrap at the wrong edges.

  `queryTabbables` now builds a real scope tree during the walk: each open
  shadow root is a nested scope whose HOST is a member of the parent scope
  (ordered there by the host's own `tabindex`, even when the host itself isn't
  tabbable); each scope's direct members are ordered by tab rules (positive
  `tabindex` ascending, ties in tree order, then naturals in tree order); and
  each host's already-ordered nested scope is spliced in immediately after it
  in the parent's ordered sequence — not left at its original DFS slot.

  Corrected the `orderScope` doc comment's cross-scope invariant claim
  accordingly (a nested scope moves with its host; it does not keep its
  original relative document position) and added regression tests for both
  confirmed cases.

- Updated dependencies [[`2f24fa3`](https://github.com/fellwork/aihu/commit/2f24fa3fdc592c85e39f500a48a7e4d3ff67c86d), [`a993aa1`](https://github.com/fellwork/aihu/commit/a993aa19d402c221faa463dfb5d94c86cc87b670), [`edc15f2`](https://github.com/fellwork/aihu/commit/edc15f2a2de541fa8f7ffd6266ad984446206257), [`ad6921a`](https://github.com/fellwork/aihu/commit/ad6921a018ef4a479f6540278e549aa9a8cab387)]:
  - @aihu/arbor@4.0.0
  - @aihu/signals@0.5.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2), [`ea8d2eb`](https://github.com/fellwork/aihu/commit/ea8d2ebb91c28132f399a708e2bd88877072d1db)]:
  - @aihu/signals@0.4.0
  - @aihu/arbor@3.0.0

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @aihu/css-engine@0.4.6

## 0.1.2

### Patch Changes

- Updated dependencies [[`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3)]:
  - @aihu/signals@0.3.0
  - @aihu/arbor@2.0.0
  - @aihu/css-engine@0.4.5

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @aihu/css-engine@0.4.4

## 0.1.0

### Minor Changes

- [#348](https://github.com/fellwork/aihu/pull/348) [`03fa951`](https://github.com/fellwork/aihu/commit/03fa951c00ddf1da8e594b022cf1b1b0be22b189) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Phase 2 headless primitives (spec §7.7): `Separator`, `Label`, `Input`,
  `Textarea`, `Checkbox`, `Switch`, `RadioGroup`. Each is a light-DOM, zero-CSS
  custom element with full WAI-ARIA APG keyboard + ARIA behavior, exported from
  its own subpath (`@aihu/primitives/<name>`).

  - Form participation via a visually-hidden native input (`attachHiddenInput`,
    re-exported from `@aihu/primitives/form-control`); Input/Textarea wrap a real
    native control directly. Values ride native `FormData` / submission.
  - Labelling ARIA (`aria-label`/`aria-labelledby`/`aria-describedby`) on Input/
    Textarea hosts is forwarded to the native control; the form-association input
    is placed as the host's sibling to avoid `nested-interactive` on roled hosts.
  - `form-control` exposes `labelId` and wires `aria-labelledby` for non-native
    (`[data-fc-label]`) labels; `roving-focus` `setCurrent(i, focus=false)` moves
    the tab stop without stealing focus (RadioGroup selection-follows-focus).

### Patch Changes

- Updated dependencies [[`cc24673`](https://github.com/fellwork/aihu/commit/cc246732d7dce820ee6abdc1dc86d391a228d7cf)]:
  - @aihu/css-engine@0.4.3

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @aihu/css-engine@0.4.2

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @aihu/css-engine@0.4.1

## 0.0.10

### Patch Changes

- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f), [`7e1f1fe`](https://github.com/fellwork/aihu/commit/7e1f1fe0ef1be17b5ea928727252d849f48c46ef), [`8f56e88`](https://github.com/fellwork/aihu/commit/8f56e881e500df7c237f996c319f04dedab3cd7e)]:
  - @aihu/signals@0.2.0
  - @aihu/css-engine@0.4.0
  - @aihu/arbor@1.0.0

## 0.0.9

### Patch Changes

- Updated dependencies [[`1a3a857`](https://github.com/fellwork/aihu/commit/1a3a85792ef0f21611184ff6ea84a5a2a63d09af), [`38a6dc5`](https://github.com/fellwork/aihu/commit/38a6dc5f9531d82b57081562d81a6b6c6d4cae21), [`6322593`](https://github.com/fellwork/aihu/commit/63225938452ef14e4e5f86b56a252a2c9d526265), [`4b90dfa`](https://github.com/fellwork/aihu/commit/4b90dfa1c22243bc5de9c31cb6e406ab83381bfb), [`6a84dbb`](https://github.com/fellwork/aihu/commit/6a84dbb5298fd86d715d3ccbf0b88511803980d9), [`14f3a3e`](https://github.com/fellwork/aihu/commit/14f3a3e4b12a09d396cbe3a537ee67a5cc512049), [`3089577`](https://github.com/fellwork/aihu/commit/30895777d91823005805c66a2f06c2afcf443dde)]:
  - @aihu/css-engine@0.3.0

## 0.0.8

### Patch Changes

- Updated dependencies [[`74273e0`](https://github.com/fellwork/aihu/commit/74273e0a015805f3c878c9b2c7890ed0c80a23fd), [`c6860e0`](https://github.com/fellwork/aihu/commit/c6860e022a374b3c5e35aaf8775cbb6332b1b75d), [`5f21125`](https://github.com/fellwork/aihu/commit/5f211252c7500973c6976ca48f29b09ea8aa049b)]:
  - @aihu/css-engine@0.2.5

## 0.0.7

### Patch Changes

- Updated dependencies [[`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a), [`d42793b`](https://github.com/fellwork/aihu/commit/d42793b8258d723ae7c80179dcc82e2db8d0afc4)]:
  - @aihu/arbor@0.1.5
  - @aihu/css-engine@0.2.4

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @aihu/css-engine@0.2.3

## 0.0.5

### Patch Changes

- Updated dependencies []:
  - @aihu/css-engine@0.2.2

## 0.0.4

### Patch Changes

- Updated dependencies [[`71ca28e`](https://github.com/fellwork/aihu/commit/71ca28ece93dfcfdad4bd9edda2a2ead415d26f2)]:
  - @aihu/css-engine@0.2.1

## 0.0.3

### Patch Changes

- Updated dependencies [[`a866af7`](https://github.com/fellwork/aihu/commit/a866af78d41931e28c5b19084342e566ca47bdee), [`45b393c`](https://github.com/fellwork/aihu/commit/45b393c3f48758bf82c152bbe6088c63edaa68a6)]:
  - @aihu/css-engine@0.2.0

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @aihu/css-engine@0.1.1

## 0.0.1

### Patch Changes

- Updated dependencies [[`31a37ef`](https://github.com/fellwork/aihu/commit/31a37eff5506f913c7081698745eac5092e04463), [`eed6ce6`](https://github.com/fellwork/aihu/commit/eed6ce6d600c06d3fa22ea228f3f370c6cebb2dc)]:
  - @aihu/css-engine@0.1.0
