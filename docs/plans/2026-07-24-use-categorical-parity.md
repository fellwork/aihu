# `@aihu/use` Categorical Parity Roadmap

**Date:** 2026-07-24
**Status:** Founder rulings ratified 2026-07-23/24 (recorded below) — namespace architecture,
placement calls, the parity bar, and skip list are authorized. Wave 0 (open blockers) must
land before any wave that depends on it; everything else is sequencing, not a re-litigation.
**Scope:** `@aihu/use` (namespace split into CORE + `/math`, `/motion`, `/integrations`,
`/router` family subpaths), the `check:deps` gate, `@aihu/primitives` (focus-trap shadow-DOM
fix, `createSortableRoot` spike, gesture pointer-capture factories, `createMotion` on
`AihuPresenceGate`), `@aihu/router` (composable subpath + non-composable internals),
`@aihu/seo` (title/favicon/head).
**Depends on / extends:**
[`2026-07-22-effect-scope-and-composables.md`](./2026-07-22-effect-scope-and-composables.md)
(the `@aihu/use`/`@aihu/primitives` split and `create*` vs `use*` naming this doc's
placement calls build on) and
[`2026-07-23-use-parity-and-daisyui.md`](./2026-07-23-use-parity-and-daisyui.md) (sibling
plan — the daisyUI/Option-4 css-engine integration and the primitives-first sequencing for
drawer/dropdown/tabs/accordion; that doc's Tier 0–3 roadmap is superseded for `@aihu/use`
composable scope by this doc's category tables, but its `@aihu/primitives`/`@aihu/css-engine`
recommendations stand independently).

Synthesizes two source-driven research streams (see Sources) run against the actual repo:
a category-by-category coverage matrix enumerating reactuse + VueUse + `@vueuse/motion`
against aihu's shipped surface, and a VueUse-ecosystem survey (integrations, router, math,
gesture, and the sibling repos: rxjs, firebase, electron, nuxt, head, schema-org, sound).
Both were fable-reviewed; findings from that review are folded into the tables and callouts
below rather than repeated as a separate appendix.

---

## Founder rulings (ratified 2026-07-23/24)

These are constraints. They resolve every placement and scope question below and are not
reopened by this doc.

**A. Namespace architecture.** `@aihu/use` becomes a namespace: a dep-free **CORE** plus
**FAMILY SUBPATHS**:

| Subpath | Contents |
|---|---|
| `@aihu/use/math` | Dep-free pure computed derivations: `useClamp`, `useSum`, `useMin`/`useMax`, `usePrecision`, `useRound`/`useFloor`/`useCeil`/`useAbs`/`useTrunc`/`useAverage`, `logicAnd`/`logicOr`/`logicNot`, `useProjection`. |
| `@aihu/use/motion` | `useReducedMotion`, `useSpring`, a MotionValue-equivalent (velocity-tracked signal), variant resolution, `useElementStyle` / `useElementTransform` / `useMotionProperties` / `useMotionControls`. |
| `@aihu/use/integrations` | Third-party wrappers behind **optional peers**: `useAxios`, `useCookies`, `useJwt`, `useDrauu`, `useAsyncValidator`. |
| `@aihu/use/router` | All router **composables** (`useRoute`, `useRouteParams`/`Query`/`Hash`, `useHash`, `useUrlSearchParams`, `useBrowserLocation`, `useLink` active-state, nav-guard wrapper, `useScrollReset`), behind an optional peer on `@aihu/router`. |
| CORE (`@aihu/use`, no subpath) | Everything else. |

**Contract change (must be implemented, not just documented):** the old rule "`@aihu/use`
depends on `@aihu/signals` ONLY" is **revised** to: *the `@aihu/use` CORE surface is
dependency-free (signals-only); FAMILY SUBPATHS may declare optional peer dependencies
(`peerDependenciesMeta.optional`), isolated per-subpath so non-users never resolve them.*
See §2 for exactly what changes in `check:deps` and why the gate as it exists today does not
already give this for free.

**B. Placement rulings.**
- `useFocusTrap` → `@aihu/primitives` (not `@aihu/use`). The existing `createFocusTrap`
  (`packages/primitives/src/dialog/focus-trap.ts`) has a shadow-boundary bug — verified in
  this repo: it walks with `container.querySelectorAll<HTMLElement>(FOCUSABLE)`, which stops
  at shadow roots — fix with a composed-tree tabbable walk (`TreeWalker`/shadow-root drilling),
  then expose it. Do not duplicate into `@aihu/use`.
- `useChangeCase` → CORE, implemented **natively** dep-free (case conversion is trivial to
  write; no reason to carry the `change-case` peer for this one).
- `useAsyncValidator` → `/integrations` (reimplementing a validator natively is too large a
  lift to justify going native).
- SortableJS → attempt a **native** dep-free port first, as an `@aihu/primitives`
  `createSortableRoot` (pointer capture + DOM reorder). Spike feasibility FIRST; only fall
  back to an `/integrations` `useSortable` wrapper if a native port proves infeasible.
- Gesture (`@vueuse/gesture`) → **split**: read-only/derivation parts (velocity/displacement
  math, rubberband/overscroll clamping, axis-lock) distribute into their natural `@aihu/use`
  categories (chiefly `/math`); pointer-capture behaviors (`useDrag`, `usePinch`, `useWheel`,
  `useMove`) go to `@aihu/primitives` as `create*` factories (`createDragRoot`,
  `createPinchRoot`, `createWheelRoot`, `createMoveRoot`). Do **not** port the `v-drag`/
  `GesturePlugin` directive layer — Vue app-instance ceremony, no aihu analog.
- Motion enter/leave **presence** lifecycle (`createMotion`) → `@aihu/primitives`, built
  **on** the already-shipped `AihuPresenceGate` (`packages/primitives/src/presence-gate`).
  `@aihu/use/motion` supplies the values (spring, MotionValue, variants); presence-gate
  drives the mount/unmount-deferral lifecycle. Do not fork presence-gate — this was a fable
  finding against the matrix's original Phase-2 proposal, which risked a second unmount-
  deferral path.
- `unhead` / `schema-org` → `@aihu/seo`. Both upstream VueUse wrapper packages
  (`@vueuse/head`, `@vueuse/schema-org`) are **sunset** — treat `unhead`'s current API as
  reference only; do not port the sunset wrappers' shape.
- Router internals that are **not** composables (scroll-restoration/`scrollBehavior` policy,
  history/nav plumbing) stay in `@aihu/router` itself; only composables live in
  `@aihu/use/router`. Verified in this repo: `packages/router/src` has no composable exports
  and no scroll-restoration code today (`grep -rn scroll packages/router/src` returns
  nothing) — this is real, unbuilt work on both sides of the split, not a doc-only
  reorganization. Re-scope the existing router-scroll issue (tracked as FEL-346) to this
  split: the composable half (`useScrollReset`) is `@aihu/use/router`; the policy half
  (deciding *when*/*where* to scroll on navigation) is `@aihu/router`.
- `useReducedMotion` and `usePreferredReducedMotion` are the same `matchMedia` query —
  implement **once**, re-export from both the Motion and User-preferences families (see the
  Time/User-preferences table below).

**C. Explicit skips.** `@vueuse/rxjs`, `@vueuse/firebase`, `@vueuse/electron`, `@vueuse/nuxt`,
`@vueuse/sound`; `@vueuse/components` (a Vue-specific renderless-component/directive shim —
`.aihu` SFCs already have first-class directive/template syntax, no analog needed); gesture's
`v-drag`/`v-pinch`/etc. directive layer and `GesturePlugin` global-registration pattern; the
sunset `@vueuse/head`/`@vueuse/schema-org` wrappers (their *replacement*, `unhead`'s current
API, is in scope via `@aihu/seo` — see ruling B).

**D. The parity bar.** Build out **P1 + P2 + P3, minus the broad integrations sweep**. The
five integrations named in ruling A (`useAxios`/`useCookies`/`useJwt`/`useDrauu`/
`useAsyncValidator`) **are** in scope; the rest of the P3 Integrations category
(`useFuse`, `useQRCode`, `useIDBKeyval`, `useNProgress`, `useSortable`-as-a-wrapper, etc.) is
**out of scope for now** — see §5 non-goals.

**E. Still-open blockers.** Record as OPEN — do not invent answers here. See §6.

---

## 1. Where we stand

Across reactuse + VueUse + `@vueuse/motion`, roughly **350–400 distinct composable concepts**
exist after de-duplication (many names repeat verbatim between reactuse and VueUse —
`useMouse`, `useClipboard`, `useGeolocation`, etc.).

- **aihu ships 24** as of `origin/main` (verified against `packages/use/src/index.ts` on this
  branch's base commit, PR #532): the 22 pre-existing composables plus `watch()` and
  `useEventListenerMap`, which just landed.
- **~19 more are already filed** as issues (excluded from the "missing" counts below per the
  source matrix's own convention — they're tracked, just not yet built).
- **~173 real, portable gaps** remain, spread across 19 functional categories.
- A dozen-plus items are structurally React-render-model or Vue-template-model specific and
  have **no aihu target at all** — see §5.

Five categories (Browser device/feature APIs, Sensors, Elements, State, Time/User-preferences)
are near-structural-duplicates of the pattern the 24 shipped composables already prove
(`isClient`-guarded API wrapper returning named getters) — highest volume, lowest technical
risk. Animation & Motion is a complete zero today (no shipped composable, no filed issue
beyond `spring`/`tween`) and is the most founder-visible gap — it gets its own namespace
subpath, not a few loose `@aihu/use` entries.

**Reviewer corrections (fable) folded into this doc**, so they aren't silently dropped or
relitigated by a future reader of the raw matrix:
1. Several items the raw matrix filed under `@aihu/use` actually require `@aihu/runtime`
   (`useFetch`, `useMounted`, `useCurrentElement`, `useAsyncEffect`, the real
   `tryOnMounted`/`tryOnUnmounted` family) — this is exactly open blocker E2, not resolved
   by this doc. They're marked **BLOCKED (E2)** in the tables below rather than scheduled.
2. Shadow-DOM event **retargeting** makes `useClickOutside`, `useActiveElement`, `useHover`,
   `useMouseInElement` (and `useContextMenu`) non-trivial ports in a custom-elements target —
   `el.contains(event.target)` and `document.activeElement` both silently fail across shadow
   boundaries. These need `composedPath()`-based hit-testing and recursive
   `shadowRoot.activeElement` traversal, factored as shared substrate, not five one-off
   fixes. Flagged **"composed-tree adaptation required"** below, not "near-zero-risk."
3. The P1 Browser batch was padded with exotic hardware APIs (`useBluetooth`, `useGamepad`,
   `useMemory`, and similarly `useEyeDropper`, `useOtpCredential`, `useWakeLock`,
   `usePictureInPicture`, `useVirtualKeyboard`) — down-ranked to an on-demand tail (Wave 12)
   rather than treated as P1 volume.
4. `usePortal` is **not** already covered by an existing primitive (the matrix's original
   claim was false — verified: no portal/top-layer mechanism exists in
   `packages/primitives/src`, only the compiler's `<portal>` known-tag). Not in this doc's
   scope (no P1–P3 category calls for it), but flagged here so it isn't assumed solved.
5. `unrefElement` is already publicly exported from `@aihu/use`'s barrel (verified:
   `packages/use/src/index.ts`) — the matrix's "consider exposing it" note is stale.
6. `useCached` largely overlaps `@aihu/signals`' existing `equals` option on `signal()`/
   `computed()` — before filing it, confirm it adds anything beyond
   `signal(v, {equals})`/`computed(fn, {equals})`; likely a documentation recipe, not new
   code. Listed in Wave 4 with this caveat attached rather than as a clean new deliverable.
7. `useMediaControls`/`useMask` write persistent state onto a caller-provided DOM element the
   same way `useTextareaAutosize` does — moved to `@aihu/primitives` in the tables below for
   consistency (the raw matrix left them in `@aihu/use` inconsistently).
8. `useAutoScroll` is a persistent scroll-follow behavior, not the one-shot imperative call
   `useScrollTo`/`useScrollIntoView` are — moved to `@aihu/primitives` (Wave 6) to resolve the
   raw matrix's internal contradiction (Elements category vs. its own Wave 6 listing).

### Sources
- Coverage matrix (JSON): `/private/tmp/claude-501/-Users-smcguirt-conductor-workspaces-data-islamabad/5a8cdcf8-e5d4-458a-8324-1e4e3f8dc186/tasks/w5xn6n80q.output` — 19 categories, ~173 missing composables, fable-reviewed.
- VueUse ecosystem report: `/private/tmp/claude-501/-Users-smcguirt-conductor-workspaces-data-islamabad/5a8cdcf8-e5d4-458a-8324-1e4e3f8dc186/tasks/aff2c23af0d3d7015.output` — add-on packages, gesture, sibling repos, per-package aihu mapping.

---

## 2. Namespace architecture + the `check:deps` gate

### What changes

`@aihu/use` stays **one npm package** (matches its existing per-composable subpath-export
convention — `./useClipboard`, `./useMouse`, etc. already exist in `packages/use/package.json`).
Four new subpath groups are added: `@aihu/use/math`, `@aihu/use/motion`,
`@aihu/use/integrations` (+ per-integration subpaths, e.g. `@aihu/use/integrations/useAxios`,
matching the existing per-composable convention), `@aihu/use/router`. The barrel
(`@aihu/use`, i.e. `.`) and all non-family subpaths remain CORE — dependency-free, signals-only.

### Why the gate isn't already sufficient — verified against `scripts/dep-check.ts`

Read the actual gate before scoping this as "just flip a flag": `scripts/dep-check.ts` checks
**at the whole-`package.json` level**. It requires `dependencies` to be `@aihu/*`-only, and
requires `peerDependencies`/`optionalDependencies` to match `@aihu/*`/`@aihu-plugin/*`/`vite`
**unless** the peer is marked `optional: true` in `peerDependenciesMeta` — in which case the
pattern check is skipped entirely, for any package, today. That means a naive fix (add
`axios`/`jwt-decode`/`drauu`/`async-validator`/`@aihu/router` as optional peers on `@aihu/use`'s
`package.json`) would already pass the gate as it exists — but it would **not** deliver the
actual guarantee ruling A asks for: that importing `@aihu/use` (bare) or any CORE subpath never
pulls a peer, while only `/integrations` and `/router` subpath imports do. The gate has no
concept of "subpath" at all — it can't tell a CORE file from a family-subpath file within one
`package.json`.

**Required work** (call out explicitly, this is real engineering, not a one-line config edit):
1. Declare the five optional peers (`axios`, `universal-cookie` or equivalent for
   `useCookies`, `jwt-decode`, `drauu`, `async-validator`) plus `@aihu/router` as
   `peerDependenciesMeta.optional: true` on `@aihu/use`'s `package.json` — this part the
   current gate already tolerates.
2. Extend `dep-check.ts` (or add a sibling check) with a **subpath-level static import scan**:
   walk the source files reachable from the barrel and each non-family subpath entry, and
   fail if any of them transitively imports a peer-only module (i.e., anything living under
   the `/integrations` or `/router` source directories, which are the only places the
   declared peers may legally be imported from). This is the actual isolation guarantee;
   declaring the peer as optional alone does not enforce it.
3. Extend the `.size-limit.json`-style per-entry bundle check (already used for the existing
   per-composable subpaths) to cover the new family subpath entries, so a regression that
   accidentally drags a peer's code into a CORE bundle shows up as a size-budget failure, not
   just a lint warning.
4. Update the `check:deps` gate's pass message / docs (`.size-limit.README.md` references the
   "dep-free thesis" as a browser-bundle contract) to state the revised two-tier contract
   verbatim, so the next person reading the gate's source doesn't reintroduce the "signals-only,
   full stop" framing this doc revises.

---

## 3. The full category roadmap

Every category from the source matrix (19 total), exhaustively named, with every founder
ruling (B) and skip (C) applied. `targetLayer` reflects the **post-ruling** placement, which in
several categories differs from the raw matrix (see the fable-correction callouts in §1).
Items blocked by an open blocker (§6) are marked **BLOCKED (E1/E2/E3)** rather than scheduled.

### Animation & Motion — P1 → `@aihu/use/motion` (new subpath) + `@aihu/primitives`

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| — | `spring`/`tween` (transition math) | `useReducedMotion` (shared impl, ruling B — also satisfies User-preferences' `usePreferredReducedMotion`) | `/motion` (+ re-export from User-prefs) | Trivial `matchMedia` port; sequence first, it unblocks the rest of the family. |
| | | `useSpring` | `/motion` | Signals-only physics engine; DOM-free. |
| | | MotionValue-equivalent (velocity-tracked signal) | `/motion` | Zero DOM dependency. |
| | | Motion-variants resolution helper | `/motion` | Pure `computed()`-over-lookup. |
| | | `useElementStyle` / `useElementTransform` / `useMotionProperties` / `useMotionControls` | `/motion` (ruling A explicitly places these in the subpath, not primitives, despite writing `el.style`) | Family subpath is allowed DOM writes; CORE is not. |
| | | `useMotions` global instance registry | `@aihu/primitives` | Cross-component coordination — primitives territory. |
| | | `createMotion` (initial/enter/leave, visible/visibleOnce) | `@aihu/primitives`, built **on** `AihuPresenceGate` (ruling B) | Do not fork presence-gate. |
| | | `useAnimate` (Web Animations API) | `@aihu/primitives` | DOM ownership. |
| | | `useInterval`/`useTimeout` (reactive tick/boolean, distinct from shipped `useIntervalFn`/`useTimeoutFn`) | `@aihu/use` CORE | Naming-adjacent, not motion-specific. |
| | | `useTimestamp` (numeric sibling of shipped `useNow`) | `@aihu/use` CORE | |

### Array utilities — P2 → `@aihu/use` CORE

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| — | — | `useArrayDifference`, `useArrayEvery`, `useArrayFilter`, `useArrayFind`, `useArrayFindIndex`, `useArrayFindLast`, `useArrayIncludes`, `useArrayJoin`, `useArrayMap`, `useArrayReduce`, `useArraySome`, `useArrayUnique`, `useSorted` | CORE | Built on `computed()` over array reads, not Proxy — portable, but only under a "replace, don't mutate" contract (push-in-place won't auto-track under reference-compared signals). Document the contract explicitly per-composable; see E1. |

### Async / Data fetching — P2 → `@aihu/use` CORE (partially BLOCKED)

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| — | `useAsync`/`useAsyncAbortable` (covers `useQuery`/`computedAsync`/`useAsyncState`) | `useLockCallback` (prevent callback re-entry mid-flight) | CORE | Signals-only, no core-lib dependency — buildable now. |
| | | `useFetch` | **BLOCKED (E2)** | Should be a thin wrapper over `@aihu/runtime`'s `createResource`, not a fresh implementation — but `@aihu/runtime` is off-limits to `@aihu/use` per the current hard rule. Do not build until E2 resolves. |

### Browser device/feature APIs — P1 → mostly `@aihu/use` CORE, several relocated

The largest single category (39 reactuse + 45 VueUse names, heavy overlap). Split by
fable-correction #3: demand-backed items scheduled now, exotic hardware down-ranked to Wave 12.

| We ship | Filed | Missing (demand-backed, scheduled) | Target |
|---|---|---|---|
| `useClipboard` | `useBroadcastChannel`, `useWebSocket`/`useSSE`, `useGeolocation`/`usePermission`/`useVibrate`, `useTheme` (covers `useColorMode`/`useDark`), `useLocalStorage`-pluggable-storage | `useFullscreen`, `useShare`, `useObjectUrl`, `useWebWorker`/`useWebWorkerFn`/`useWebWorkerCallback`, `usePostMessage`, `useCssSupports`, `useClipboardItems`, `useDeviceList`/`useDevicesList` | CORE |

| Missing (relocated — DOM/document ownership) | Target |
|---|---|
| `useCssVar` | `@aihu/primitives` (writes `el.style`) |
| `useScriptTag`/`useScript`, `useStyleTag` | `@aihu/primitives` (injects DOM nodes) |
| `useFileDialog` | `@aihu/primitives` (creates hidden input + triggers dialog) |
| `useMediaControls` | `@aihu/primitives` (fable-corrected — writes `.currentTime`/`.volume`, calls `play()`/`pause()` on caller's element, same class as `useTextareaAutosize`) |
| `useMediaStream`/`useUserMedia`, `useDisplayMedia` | `@aihu/primitives` |
| `useDocumentTitle`/`useTitle`, `useFavicon` | `@aihu/seo` (see SEO category) |
| `useBrowserLocation` | `@aihu/use/router` (router-model access, ruling B's router-layering rule) |

| Missing (down-ranked — exotic hardware, Wave 12 on-demand, not scheduled P1) | Target |
|---|---|
| `useBattery`, `useBluetooth`, `useGamepad`, `useMemory`, `useEyeDropper`, `useOtpCredential`, `useWakeLock`, `usePictureInPicture`, `useVirtualKeyboard`, `useSpeechRecognition`, `useSpeechSynthesis`, `usePointerLock`, `useScreenSafeArea`, `useSSRWidth`, `useCopy` (low-value near-dup of shipped `useClipboard`) | CORE, deferred |

`useScreenOrientation` is a duplicate of Sensors' `useOrientation` — list once, under Sensors.

### Component lifecycle — P2 → mostly BLOCKED (E2 and/or E3)

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| — | — | `tryOnMounted` (real fix) | **BLOCKED (E3)** | Currently an interim client-immediate stub, not a real `connectedCallback`-backed hook. |
| | | `tryOnBeforeMount`/`tryOnBeforeUnmount`/`tryOnUnmounted` | **BLOCKED (E3)** | Same real-lifecycle-wiring gap; cannot ship until `tryOnMounted` is fixed. |
| | | `useMounted` | **BLOCKED (E2)** | Fable-flagged as needing `@aihu/runtime`. |
| | | `useCurrentElement` | **BLOCKED (E2)** | Same. |
| | | `useAsyncEffect` | **BLOCKED (E2 + E3)** | Needs effectScope cancellation (E3-adjacent) and is fable-flagged E2. |
| | | `useDidUpdate` (skip-first-run effect) | CORE, buildable once `watch()`/effectScope substrate is proven | React's commit-phase technique doesn't transfer; needs reimplementing, not porting. |
| | | `useVirtualList` | `@aihu/primitives` | Renders only visible items + manages scroll container — real DOM ownership. |
| | | `computedInject`-equivalent | `@aihu/primitives` | aihu's context system (`dom-context.ts`) already lives there. |

Do not propose `useFocusTrap`/`useRovingFocus`/`useDisclosure`-shaped state/`usePortal`/
`useFormField` here — `useFocusTrap`, `useRovingFocus`, and `useFormField`'s equivalents
already exist as `create*`/`Aihu*Root` primitives (`focus-trap`, `roving-focus`,
`form-control`); `usePortal` does **not** exist anywhere yet (fable correction #4) and is out
of this doc's scope entirely.

### Debug / dev tools — P3 → `@aihu/use` CORE

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| — | — | `useLogger` (logs mount/unmount/update via `effect()`) | CORE | Smallest real category. `useRenderCount`/`useRenderInfo`/`useRerender` are React-render-model-specific — see §5 cannotMap. |

### Elements (DOM interaction & gesture) — P1 → split CORE / primitives, shadow-DOM caveat

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| `useElementSize`, `useElementVisibility` | `useFocusWithin`, `useMeasure` (covers `useElementBounding`) | `useActiveElement`, `useHover`, `useMouseInElement`/`useElementByPoint`, `useClickOutside`/`onClickOutside` | CORE, **composed-tree adaptation required** (fable correction #2) | Not near-zero-risk straight ports — `el.contains()`/`document.activeElement` fail across shadow boundaries; build a shared composed-tree helper first. |
| | | `useSticky` (IntersectionObserver-based, same shape as `useElementVisibility`) | CORE | |
| | | `useDoubleClick`, `useLongPress`, `useKeyModifier`, `useParentElement` | CORE | |
| | | `useSwipe`/`usePointerSwipe` | CORE, needs plain-getter redesign | VueUse flags both `[PROXY]` on the public return. |
| | | `useMagicKeys` | CORE, needs plain-getter redesign | VueUse flags `[PROXY]`/native-Proxy return; port as per-key signals on demand instead. |
| | | `useScrollTo` / `useScrollIntoView` | CORE | One-shot imperative calls, same pattern as shipped `useClipboard.copy()`. |
| | | `useImage` | CORE | Can use `new Image()`, no persistent DOM ownership. |

| Missing (relocated — DOM ownership / primitives) | Target |
|---|---|
| `useLockScroll`/`useScrollLock` → `createScrollLock` | `@aihu/primitives` |
| `useFocus` | `@aihu/primitives` (imperative focus management; `useFocusTrap` is dialog's job, see ruling B) |
| `useDraggable` | `@aihu/primitives` (pointer capture + position writes) |
| `useDropZone` | `@aihu/primitives` (drag/drop DOM coordination) |
| `useContextMenu` | `@aihu/primitives`, **composed-tree adaptation required** (custom overlay UI ownership + shadow-DOM hit-testing) |
| `usePaint` | `@aihu/primitives` (canvas ownership) |
| `useTextareaAutosize` | `@aihu/primitives` (writes element height style) |
| `useMask` | `@aihu/primitives` (fable correction #7 — writes an input's value, same class as `useTextareaAutosize`) |
| `useAutoScroll` | `@aihu/primitives` (fable correction #8 — persistent scroll-follow, not one-shot) |

`useTextDirection` is already covered by the config-provider primitive's `dir` propagation —
don't re-propose.

### Math — P3 → `@aihu/use/math` (new subpath)

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| — | — | `createGenericProjection`/`createProjection`/`useProjection`, `logicAnd`/`logicNot`/`logicOr`, `useAbs`/`useCeil`/`useFloor`/`useRound`/`useTrunc`, `useAverage`, `useClamp`, `useMath`, `useMax`/`useMin`, `usePrecision`, `useSum` | `/math` | Zero presence today; pure `computed()`-over-numeric-inputs, no DOM/browser dependency, trivial to build. Also the landing zone for gesture's velocity/rubberband/axis-lock math (ruling B split). |

### Network — P2 → `@aihu/use` CORE

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| — | `useNetworkState`, `useWebSocket`/`useSSE` (`useEventSource`), `useBroadcastChannel` | `useFetch` | **BLOCKED (E2)**, same item as Async category — implement once. | |

### Reactivity (ref/signal utilities) — P2 → `@aihu/use` CORE (largely BLOCKED by E1)

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| — | watch-family wrappers (13-item VueUse Watch block) | `computedEager`, `computedWithControl` | `@aihu/signals` (core-adjacent, not `@aihu/use`) | |
| | | `refAutoReset`/`autoResetRef`, `refDefault`, `refManualReset`, `refWithControl`/`controlledRef`, `syncRef`/`syncRefs` | CORE | Timer/cross-signal-sync composition over the shipped pattern. |
| | | `useToNumber`/`useToString` | CORE | Trivial computed conversion. |
| | | `useCached` | CORE, **caveat** (fable correction #6) | Largely redundant with `signal()`/`computed()`'s existing `equals` option — verify it adds anything before filing as new work; likely a doc recipe. |
| | | `reactiveComputed`/`reactiveOmit`/`reactivePick`/`toReactive`-equivalents | **BLOCKED (E1)** | Need a deep/structural-reactivity primitive `@aihu/signals` does not have. |

### Sensors (observers, keyboard, device, breakpoints) — P1 → `@aihu/use` CORE

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| `useMouse`, `useScroll`, `useElementVisibility`, `useMediaQuery`, `useDocumentVisibility`, `useWindowSize` | `useIdle`, `useGeolocation` | `useBreakpoints` (extends shipped `useMediaQuery`) | CORE | |
| | | `useDeviceMotion`/`useDeviceOrientation`, `useDevicePixelRatio` | CORE | |
| | | `useHotkeys`/`useKeyPress`/`useKeyboard`/`useKeysPressed` | CORE | |
| | | `useIntersectionObserver`/`useMutationObserver`/`useResizeObserver`/`usePerformanceObserver` | CORE | Expose the raw Observer primitives `useElementVisibility`/`useElementSize` presumably already wrap internally — real gap even with similar sensors shipped. |
| | | `useOrientation`/`useScreenOrientation` | CORE | |
| | | `usePageLeave`, `useWindowFocus` | CORE | |
| | | `useParallax` | CORE | VueUse confirms plain-refs return (not Proxy) — portable as-is. |
| | | `useFps` | CORE | Orphan item surfaced by the matrix's own review (finding: absent from every category list despite being cited in a wave) — trivial sibling of shipped `useRafFn`; filed here under Sensors. |

`useDocumentEvent`/`useWindowEvent` are largely redundant with shipped `useEventListener`'s
Window/Document overloads — document as a usage pattern, not a new composable.
`useWindowScroll` is redundant with shipped `useScroll({target: window})` — skip.

### State (storage/form/collection/history) — P1 → `@aihu/use` CORE, partially BLOCKED

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| `useLocalStorage`, `useCounter`, `useToggle` | `useMap`/`useSet`, `StateHistory` (covers `useStateHistory`/`useRefHistory`/`useManualRefHistory`/`useDebouncedRefHistory`/`useThrottledRefHistory`), `FiniteStateMachine` (partial overlap with `useStep`/`useStepper`/`useWizard`), `useDisclosure`, `boolAttr`, `useLocalStorage`-pluggable-storage | `useSessionStorage` | CORE | Likely resolved by the filed pluggable-storage issue; confirm scope before filing separately. |
| | | `useCookie`/`useCookies` (Storage-interface, distinct from `/integrations`' `useCookies` wrapper) | CORE | |
| | | `useHash`, `useUrlSearchParams` | `@aihu/use/router` | Router-model access, ruling B; VueUse's `useUrlSearchParams` is also `[PROXY]`-flagged, needs redesign. |
| | | `useList`/`useQueue` | CORE | Portable if returning a new array reference per mutation. |
| | | `useObject` | **PARTIALLY BLOCKED (E1)** | Field-level reactivity needs the same deep-reactivity primitive gap. |
| | | `useField` | CORE | Single form-field value + validation signal. |
| | | `useForm` (value/validation half) | CORE | ARIA/disabled/required coordination is already covered by the existing form-control primitive — don't duplicate; full field-aggregation is **PARTIALLY BLOCKED (E1)**. |
| | | `useValidatedState`/`useMask` (state-shape half, distinct from the DOM-writing `useMask` in Elements) | CORE | |
| | | `useCycleList`, `useDefault`, `useOffsetPagination` | CORE | Trivial; VueUse confirms `useOffsetPagination` is not `[PROXY]`-flagged. |

Only 3 of ~30 VueUse/reactuse state composables are shipped today — the biggest
founder-visible app-building gap outside Browser/Sensors. `useStep`/`useWizard` overlap the
already-filed `FiniteStateMachine` issue — don't re-propose as new; note the linear-stepper
wrapper as an optional follow-on once FSM lands.

### Time — P1 → `@aihu/use` CORE

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| `useNow` | — | `useCountdown`/`useTimer`, `useDateFormat`, `useTimeAgo`/`useTimeAgoIntl`, `useProgress`, `useStopwatch`, `useTime` (multi-format sibling of `useNow`) | CORE | Extremely close structural match to shipped `useNow`/`useIntervalFn`/`useRafFn` — near-zero risk, currently under-filled relative to how proven the pattern already is. |

### User preferences / locale — P1 → `@aihu/use` CORE

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| `usePreferredDark`, `useColorScheme` | `useTheme` | `useBrowserLanguage`/`useNavigatorLanguage`, `useOperatingSystem`, `usePreferredContrast`, `usePreferredLanguages`, `usePreferredReducedTransparency` | CORE | Trivial `matchMedia`/`navigator` reads, identical shape to shipped `usePreferredDark`. |
| | | `usePreferredReducedMotion` | Re-export of `/motion`'s `useReducedMotion` (ruling B — implement once) | Cross-category unblocker for the Motion wave; sequence early. |

### Utilities (callback debounce/throttle, memoize, misc) — P2 → `@aihu/use` CORE

| We ship | Filed | Missing | Target | Notes |
|---|---|---|---|---|
| — | watch-family wrappers | `useDebounceFn`/`useDebounceCallback`, `useThrottleFn`/`useThrottleCallback` | CORE | Complements shipped `useDebounced`/`useThrottle` (which debounce a *value*) with the callback-debounce/throttle split — the clear standout gap in this category. |
| | | `useDebounceEffect`/`useThrottleEffect`, `useBatchedCallback`, `useMemoize` | CORE | |
| | | `useEventBus`/`createEventHook` | CORE | Signals-only pub/sub, no DOM. |
| | | `useConst`, `useLastChanged`, `useBase64` | CORE | Trivial. |
| | | `useCloned` | CORE, **PARTIAL blocker (E1)** | Deep-watching a caller-mutated source needs the same deep-reactivity gap. |
| | | `useAsyncQueue` | CORE, needs array-of-signals redesign | VueUse flags `[PROXY]` on the public return — not a straight port. |
| | | `useChangeCase` | CORE, **native** implementation (ruling B) | Case conversion is trivial to write dep-free — do not wrap the `change-case` npm package. |

`useDebounceState`/`useThrottleState`/`useDebounceValue`/`useThrottleValue` are redundant with
shipped `useDebounced`/`useThrottle` — don't re-propose as distinct composables.

### Integrations (third-party library wrappers) — P3 → `@aihu/use/integrations` (5 named only, ruling D)

| Missing (IN scope per ruling A/D) | Target | Notes |
|---|---|---|
| `useAxios` | `/integrations` | Optional peer `axios`. |
| `useCookies` | `/integrations` | Optional peer (e.g. `universal-cookie`) — distinct from State category's native `useCookie`. |
| `useJwt` | `/integrations` | Optional peer `jwt-decode`. |
| `useDrauu` | `/integrations` | Optional peer `drauu` (SVG drawing). |
| `useAsyncValidator` | `/integrations` | Optional peer `async-validator` (ruling B — reimplementing natively is too large a lift). |

| Missing (OUT of scope for now, ruling D — do not build this wave) |
|---|
| `useFuse` (fuzzy search), `useQRCode`, `useIDBKeyval`, `useNProgress`, `useSortable`-as-wrapper (superseded by the native `createSortableRoot` spike, ruling B — an `/integrations` wrapper is only the fallback if that spike fails) |

`useFocusTrap` and (native-attempt) `useSortable`/`createSortableRoot` are explicitly **not**
part of this category's `/integrations` scope — see ruling B, they're primitives work.

### Router-scoped (URL / route model / navigation) — P2 → `@aihu/use/router` + `@aihu/router`

| Missing | Target | Notes |
|---|---|---|
| `useRoute`, `useRouteHash`, `useRouteParams`, `useRouteQuery` | `@aihu/use/router` | |
| `useHash` (cross-referenced from State category) | `@aihu/use/router` | |
| `useUrlSearchParams` (cross-referenced from State/Browser categories) | `@aihu/use/router`, needs `[PROXY]` redesign | |
| `useBrowserLocation` (cross-referenced from Browser category) | `@aihu/use/router`, needs `[PROXY]` redesign | |
| `useLink` active-state | `@aihu/use/router` | |
| Nav-guard wrapper composable | `@aihu/use/router` | |
| `useScrollReset` (composable half) | `@aihu/use/router` | |
| Scroll-restoration policy (`scrollBehavior`, when/where to scroll on nav) | `@aihu/router` (non-composable internals, ruling B) | Confirmed absent in this repo today — real, unbuilt work, re-scoping FEL-346. |
| History/nav plumbing | `@aihu/router` (non-composable internals) | Stays where it is; only the composable surface moves to the new subpath. |

### SEO (title / favicon / head meta) — P3 → `@aihu/seo`

| Missing | Target | Notes |
|---|---|---|
| `useTitle`/`useDocumentTitle` (cross-referenced from Browser) | `@aihu/seo` | |
| `useFavicon` (cross-referenced from Browser) | `@aihu/seo` | |
| `useHead`/`createHead`-equivalent | `@aihu/seo` | Reference `unhead`'s **current** API, not the sunset `@vueuse/head` wrapper (ruling B). |
| Schema.org helper | `@aihu/seo` (or a thin sibling `@aihu/schema-org`) | Reference `unhead`'s current schema-org package, not the sunset `@vueuse/schema-org` wrapper. |

### Humor (joke hooks) — skip, not a real category

`reactuse`'s `useFul`/`useLess`/`useOnce` are explicitly non-production joke hooks
("so useless", "don't use in production") — no action, not a P1–P3 category.

---

## 4. Delivery waves

Adapted from the matrix's `recommendedWaves`, resequenced to the ratified bar (D) and with
Wave 0 as the open-blockers prerequisite (E) plus the namespace/gate infrastructure (§2) that
every family-subpath wave depends on.

- **Wave 0 — prerequisites (blocks Waves 3, 5, and parts of 4/6/9/11).**
  Resolve E1 (deep-reactivity story or ratify "replace, don't mutate"), E2 (the
  `@aihu/runtime` exception — relocate or sanction one isolated entry), and E3 (real
  `tryOnMounted`/`tryOnUnmounted`, not the interim stub). Stand up the namespace: add
  `/math`, `/motion`, `/integrations`, `/router` subpath exports to `packages/use/package.json`,
  and land the `check:deps` subpath-level static-import-scan + size-limit rows described in §2.
- **Wave 1 (P1, near-zero risk, CORE).** Time family (`useTimer`/`useCountdown`/`useStopwatch`/
  `useDateFormat`/`useTimeAgo`/`useProgress`/`useTime`) + User-preferences family
  (`usePreferredContrast`/`usePreferredReducedTransparency`/`usePreferredLanguages`/
  `useBrowserLanguage`/`useOperatingSystem`) + Sensors observer/keyboard/device family
  (`useBreakpoints`/`useIntersectionObserver`/`useResizeObserver`/`useMutationObserver`/
  `usePerformanceObserver`/`useDeviceMotion`/`useDeviceOrientation`/`useDevicePixelRatio`/
  `useOrientation`/`usePageLeave`/`useHotkeys` family/`useFps`).
- **Wave 2 (P1, Elements + State + demand-backed Browser).** Elements read-only sensors
  behind the composed-tree helper (`useActiveElement`/`useHover`/`useMouseInElement`/
  `useSticky`/`useClickOutside`/`useDoubleClick`/`useLongPress`/`useSwipe`-redesigned/
  `useMagicKeys`-redesigned) + State completeness (`useSessionStorage`/`useCookie`/`useList`/
  `useQueue`/`useField`/`useCycleList`/`useDefault`/`useOffsetPagination`) + demand-backed
  Browser batch (`useFullscreen`/`useShare`/`useObjectUrl`/`useWebWorker`/`usePostMessage`/
  `useCssSupports`/`useClipboardItems`/`useDeviceList`).
- **Wave 3 (P1, Motion Phase 1 — `@aihu/use/motion`).** `useReducedMotion` + `useSpring` +
  MotionValue-equivalent + variant-resolution helper + `useElementStyle`/`useElementTransform`/
  `useMotionProperties`/`useMotionControls`. Requires Wave 0's namespace infrastructure.
- **Wave 4 (P2, Reactivity + Array + Network — partially blocked).** Array family
  (`useArrayFilter`/`Map`/`Reduce`/`Find`/etc. + `useSorted`), ref-utility ports
  (`refAutoReset`/`refDefault`/`refManualReset`/`syncRef`/`syncRefs`/`useToNumber`/
  `useToString` + `useCached` with the equals-option caveat + `computedEager`/
  `computedWithControl` into `@aihu/signals`), `useLockCallback`. `useFetch` stays
  **BLOCKED (E2)** and does not ship in this wave.
- **Wave 5 (P2, Component lifecycle — gated on Wave 0).** Once E3's `tryOnMounted` fix lands:
  `tryOnBeforeMount`/`tryOnBeforeUnmount`/`tryOnUnmounted`, `useDidUpdate`. `useMounted`,
  `useCurrentElement`, and `useAsyncEffect` stay **BLOCKED (E2)** even after E3 resolves — they
  need the separate runtime-dependency decision.
- **Wave 6 (P2, DOM-owning primitives batch).** `useDraggable`, `useDropZone`, `useFocus`,
  `useFileDialog`, `useCssVar`, `useScriptTag`, `useStyleTag`, `useTextareaAutosize`,
  `useMask` (DOM half), `useMediaControls`, `usePaint`, `useContextMenu` (composed-tree),
  `useVirtualList`, `createScrollLock`, `useAutoScroll`, plus ruling B's gesture pointer-capture
  factories (`createDragRoot`/`createPinchRoot`/`createWheelRoot`/`createMoveRoot`), the
  `useFocusTrap` shadow-DOM fix + expose, the `createSortableRoot` native spike (fallback:
  `/integrations` `useSortable` wrapper), and Motion Phase 2's `createMotion` composed on
  `AihuPresenceGate` — all land in `@aihu/primitives`.
- **Wave 7 (P2, router-scoped — `@aihu/use/router` + `@aihu/router` internals).**
  `useRoute`/`useRouteHash`/`useRouteParams`/`useRouteQuery`/`useHash`/`useUrlSearchParams`/
  `useBrowserLocation`/`useLink`-active-state/nav-guard wrapper/`useScrollReset` (composable
  half) in the new subpath; scroll-restoration policy + history/nav plumbing in
  `@aihu/router` itself (re-scoped FEL-346). Requires Wave 0's namespace infrastructure.
- **Wave 8 (P3, SEO).** `useTitle`/`useFavicon`/`useHead`-equivalent → `@aihu/seo`, referencing
  `unhead`'s current API. Optional follow-on: a schema.org helper.
- **Wave 9 (P3, utilities polish, CORE).** `useDebounceFn`/`useThrottleFn`/
  `useBatchedCallback`/`useDebounceEffect`/`useThrottleEffect`/`useMemoize`/`useEventBus`/
  `useConst`/`useLastChanged`/`useBase64`/`useAsyncQueue`-redesigned/`useLogger`/
  `useChangeCase` (native). `useCloned` stays **PARTIALLY BLOCKED (E1)**.
- **Wave 10 (P3, Math — `@aihu/use/math`).** All 13 math items, plus gesture's velocity/
  rubberband/axis-lock math split in from ruling B. Requires Wave 0's namespace
  infrastructure.
- **Wave 11 (P3, the five named integrations only — `@aihu/use/integrations`).** `useAxios`,
  `useCookies`, `useJwt`, `useDrauu`, `useAsyncValidator`. Requires Wave 0's namespace
  infrastructure. The rest of the P3 Integrations category is explicitly out of scope (§5) —
  do not schedule `useFuse`/`useQRCode`/`useIDBKeyval`/`useNProgress` here or later without a
  fresh founder call.
- **Wave 12 (P3, on-demand tail, not scheduled).** The down-ranked exotic Browser batch
  (`useBattery`/`useBluetooth`/`useGamepad`/`useMemory`/`useEyeDropper`/`useOtpCredential`/
  `useWakeLock`/`usePictureInPicture`/`useVirtualKeyboard`/`useSpeechRecognition`/
  `useSpeechSynthesis`/`usePointerLock`/`useScreenSafeArea`/`useSSRWidth`/`useCopy`) plus
  `useMediaStream`/`useUserMedia`/`useDisplayMedia`. Build only on real demand.

---

## 5. Explicit non-goals

### cannotMap — no aihu target exists (verbatim from the source matrix)

- `useRerender` (reactuse) — exists only to force a React re-render; aihu has no render
  function to re-invoke.
- `useRenderCount`/`useRenderInfo` (reactuse) — count/inspect React re-renders; the metric
  doesn't exist in aihu.
- `useIsFirstRender` (reactuse) — tracks first-vs-subsequent React render via a ref; no render
  counter to key off.
- `useShallowEffect` (reactuse) — shallow-compares a manual dependency array; aihu has no
  dependency arrays at all (auto-tracked signal reads), superseded by default `effect()`.
- `useIsomorphicLayoutEffect` (reactuse) — dodges React's SSR warning; aihu's `effect()` is
  already `isClient`-guarded, the sync/async split doesn't exist.
- `useEvent` (reactuse) — solves React's stale-closure-in-handler problem; signals are read
  live via getters, so aihu handlers don't go stale the same way.
- `useMergedRef` (reactuse/VueUse templateRef family) — merges multiple React/Vue ref
  objects; aihu's `$ref` is a different, non-multi-consumer system.
- `useControllableState` (reactuse) — React's controlled/uncontrolled-per-render precedence
  idiom; a straight port collides with the known prop-coercion footgun. The underlying
  *concept* (controlled/uncontrolled value precedence) does map for Radix-style primitives
  internally — but as a `@aihu/primitives` internal pattern, not a public `use*` composable.
- `useOptimistic` (reactuse) — wraps React 19's concurrent-renderer/transitions machinery; no
  concurrent-mode scheduler in aihu.
- `useRefState`/`useRafState` (reactuse) — dodge React's whole-component re-render cost; aihu
  never re-renders a whole component on signal write.
- `templateRef`/`useTemplateRefsList`/`useVModel`/`useVModels`/`createReusableTemplate`/
  `createTemplatePromise` (VueUse Component) — Vue SFC-template/`v-model`/slot-as-value sugar
  tied to Vue's compiler; no compiler-level equivalent exists yet (would be new compiler
  grammar, not a composable port). `useTemplateRefsList`'s job is already covered by
  `@aihu/primitives`' `collection` substrate.
- `toRef`/`toRefs`/`createRef`/`extendRef`/`reactify`/`reactifyObject`/`get`/`set`/
  `isDefined`/`makeDestructurable`/`createUnrefFn` (VueUse Reactivity/Utilities) — normalize
  Vue's dual ref-vs-reactive-object shapes; aihu's single signal-tuple primitive has no such
  duality to bridge.
- `v-motion` directive / `<Motion>` / `<MotionGroup>` components (`@vueuse/motion`) — Vue
  directive/render-function syntax; no SFC-compiler equivalent exists yet.
- `@vueuse/electron` (`useIpcRenderer`, `useIpcRendererInvoke`, `useIpcRendererOn`,
  `useZoomFactor`, `useZoomLevel`) — Electron-process-specific.

### Ruling C skips (ecosystem-level, restated)

`@vueuse/rxjs` (no aihu-native reason to bridge to RxJS — aihu's signal graph is a complete
reactive model on its own), `@vueuse/firebase` (vertical-specific, no evidence of demand),
`@vueuse/electron` (no Electron target), `@vueuse/nuxt` (build-tool auto-import shim, no
analog — aihu's compiler does its own import/registration at the SFC level), `@vueuse/sound`
(Howler wrapper, no aihu-native need); `@vueuse/components` (renderless-component/directive
shim — `.aihu` SFCs already have first-class directive syntax); gesture's `v-drag`/`v-pinch`/
etc. directive layer and `GesturePlugin`; the sunset `@vueuse/head`/`@vueuse/schema-org`
wrapper packages (their replacement, `unhead`'s current API, **is** in scope via `@aihu/seo`).

### Ruling D scope cut (P3 Integrations, minus the five named)

`useFuse`, `useQRCode`, `useIDBKeyval`, `useNProgress`, and a `useSortable`-as-wrapper (the
native `createSortableRoot` spike is the primary path; the wrapper is only a fallback) are
explicitly deferred, not roadmapped. If ever built, they should be separate opt-in surfaces
so consumers who don't use library X pay zero bundle cost — consistent with how VueUse itself
ships `@vueuse/integrations` as a non-core package.

### Humor category

`useFul`/`useLess`/`useOnce` (reactuse) are explicit non-production joke hooks — not a real
category, no action.

---

## 6. Open blockers (OPEN — not resolved by this doc)

**E1 — Deep/structural reactivity.** `@aihu/signals` has none: signals are reference-compared
tuples with an `Object.is`-by-default (custom-`equals`-capable) comparison, no Proxy/
`reactive()` layer. Either build a deep-reactivity story, or ratify "replace, don't mutate" as
the **permanent** composable contract. Blocks `reactiveComputed`/`reactivePick`/
`reactiveOmit`/`toReactive`-equivalents outright; partially blocks `useObject` and full
`useForm` field-aggregation (need field-level reactivity, not whole-value replacement) and
`useCloned`. Confirmed by the shipped `useLocalStorage`, which already replaces the whole
value per write rather than diffing fields — the existing shipped pattern is consistent with
"replace, don't mutate" already, for what that's worth to the decision, but the decision
itself is not made here.

**E2 — The `@aihu/runtime` exception.** `useFetch`, `useMounted`, `useCurrentElement`, and the
real (non-stub) lifecycle hooks (`tryOnMounted`/`tryOnUnmounted` family, `useAsyncEffect`)
need `@aihu/runtime`, which the signals-only CORE forbids. `packages/use/src/shared/index.ts`
itself documents "`@aihu/use` deliberately does not depend on `@aihu/runtime`." Either these
composables relocate (to `@aihu/runtime` itself, re-exported), or one isolated
runtime-importing entry point is sanctioned as a deliberate, documented exception alongside
the CORE/family-subpath split ruling A already establishes. **UNRESOLVED** — do not schedule
any of the affected composables (marked BLOCKED (E2) throughout §3–4) until this is decided.

**E3 — `tryOnMounted` is a stub, not a real lifecycle hook.** Today it only runs the callback
immediately on the client (since setup runs inside `connectedCallback`) — it is not backed by
a real lifecycle hook. This blocks a clean Component-lifecycle category:
`tryOnBeforeMount`/`tryOnBeforeUnmount`/`tryOnUnmounted` have no real hook to wire into until
this is fixed properly (not just documented as a known limitation).

---

## Appendix — matrix `coreBlockers` not otherwise covered above

Two additional structural notes from the source matrix, kept for completeness since they
affect sequencing even though they aren't blocking any single named composable the way
E1–E3 are:

- **No scheduler beyond synchronous, explicit-call `batch()`** — no microtask auto-batching,
  no `requestIdleCallback` primitive. Doesn't block anything currently proposed, but would
  gate any future composable needing coalesced scheduling across multiple sources.
- **`effect()` has no lazy/manual-trigger mode** — always runs synchronously on creation;
  composables wanting "define now, arm later" (e.g. `useIntervalFn`'s `immediate: false`)
  hand-roll a signal flag at the composable layer today. Minor friction, not a hard blocker
  for anything in this roadmap.
