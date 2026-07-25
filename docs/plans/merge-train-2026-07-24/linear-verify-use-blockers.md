# Verification — does PR #549 resolve `@aihu/use` blockers E1/E2/E3?

**Verifier pass, read-only.** Repo `/Users/smcguirt/conductor/repos/aihu`, branch `main`, clean.
**Subject:** `ad6921a0` — `feat(signals): lifecycle ownership contract + runtime host attachment (#549)`
**Sibling context:** `dbf0bc7a` — `feat(reactive): @aihu/reactive — Proxy-backed fine-grained reactive tree (#548)`
**Issues:** FEL-391 (E1), FEL-392 (E2), FEL-393 (E3) — all `Backlog` at time of writing.

---

## 0. Headline

**#549 shipped the *enabling primitive* for E2/E3. It did not adopt it.**
`packages/use/` is not touched by the diff — not one line. The changeset says so in its own
words: *"scoped to `@aihu/signals` + `@aihu/runtime` only."*

Concretely, three things are still true on `main` after #549:

1. `tryOnMounted` is still the byte-for-byte stub (`if (isClient) fn()`), and the governing
   design says it should be **deleted**, not fixed — that deletion has not happened.
2. `@aihu/use` **cannot import `@aihu/signals/lifecycle` today**: the `check:deps`
   subpath-purity gate does an *exact-string* allowlist match against `@aihu/signals`, and the
   package's rolldown `external` array is likewise exact-match. Both must be widened first.
3. The two E2 items that are *not* lifecycle hooks — `useFetch` and `useCurrentElement` — get
   **no path at all** from #549. The `LifecycleHost` contract is DOM-free by construction
   (booleans and callbacks only, no element reference, no `createResource`).

---

## 1. What #549 actually shipped

`git show ad6921a0 --stat` → 38 files, +1228/−61. Substantive code:

| File | What |
| --- | --- |
| `packages/signals/src/lifecycle.ts` | **new** — 65 lines, the whole contract |
| `packages/signals/package.json` | **new `./lifecycle` subpath export** (`dist/lifecycle.{d.ts,js}`) |
| `packages/signals/rolldown.config.ts` | two independent single-entry builds; `dist/index.js` stays byte-identical to `main` |
| `packages/runtime/src/define-component.ts` | `_installLifecycle()` — attaches the host on **both** build paths |
| `packages/runtime/src/commit.ts` | **new** — rAF-coalesced commit queue + `_dropCommitsFor(scope)` |
| `packages/runtime/src/types.ts` | `SetupContext.connected: () => boolean` (**required**, not optional) |
| `packages/runtime/src/index.ts` | `+ _onCommit as onCommit` (one new bare export) |
| `.size-limit.json` | new row `@aihu/signals/lifecycle` @ 300 B; `@aihu/runtime` 4500 → **4750 B**, with `ignore: ["@aihu/signals/lifecycle"]` |

**Exported API surface, exhaustively** (`packages/signals/src/lifecycle.ts`):

```ts
export interface LifecycleHost {
  readonly connected: () => boolean
  onCommit(fn: () => void | (() => void)): void
}
export function _attachLifecycleHost(scope: EffectScope, host: LifecycleHost): void  // @internal
export function getLifecycleHost(): LifecycleHost | undefined
```

Plus, from `@aihu/runtime`: the bare `onCommit` export, and `SetupContext.connected`.

That is the entire new surface. Note what is **not** in `LifecycleHost`: no element, no
`ShadowRoot`, no resource/fetch primitive, no before-unmount hook, no unmount hook. The module
docstring is explicit: *"This module is NOT a lifecycle implementation — it carries no DOM, no
rAF, no custom-element code, not even a `signal()` call."*

Runtime side is genuinely wired (`define-component.ts:135-144`, called at `:353` on the normal
path and `:666` on the hydration path), so the mechanism is live, not shelfware.

---

## 2. E2 (FEL-392) — can `@aihu/use` get real lifecycle without importing `@aihu/runtime`?

### Verdict: **PARTIAL.** The layering answer is decided and built; the adoption is not, and two of the four named composables remain with no path.

**Mechanism: yes, in principle.** `getLifecycleHost()` lives on `@aihu/signals/lifecycle`, and
`@aihu/use` already declares `"@aihu/signals": "workspace:*"` as its sole dependency. At the npm
resolution level a subpath import is free — no new dependency, no `@aihu/runtime`. This is
exactly the governing design's **Option C** (`docs/plans/2026-07-24-lifecycle-ownership-dx.md`
§0 row 6, §6.3), and it is the ratified-by-merge answer to the layering question. That much of
E2 is genuinely settled.

**Adoption: no. `@aihu/use` is currently *forbidden* from importing it by the repo's own gate.**

`scripts/dep-check.ts` (`check:deps`, wired into `check:ci` and `.github/workflows/plan-a.yml`)
does exact-string matching:

```ts
export function allowedExternals(cls, families) {
  const out = new Set<string>(['@aihu/signals'])      // <- exact specifier, no prefix logic
  ...
}
// ... in walk():
} else if (!allowed.has(spec)) {
  errors.push(`FAIL [@aihu/use] '${entryKey}' imports '${spec}', which is not in its allowed externals ...`)
}
```

Empirically confirmed by invoking the exported functions directly:

```
index                  {"kind":"core"} -> @aihu/signals | has @aihu/signals/lifecycle? false
shared                 {"kind":"core"} -> @aihu/signals | has @aihu/signals/lifecycle? false
useMounted             {"kind":"core"} -> @aihu/signals | has @aihu/signals/lifecycle? false
router/useRouteParams  {"family":"router"} -> @aihu/signals, @aihu/router, @aihu/context | has @aihu/signals/lifecycle? false
```

So the first `@aihu/use` PR that writes `import { getLifecycleHost } from '@aihu/signals/lifecycle'`
**reddens CI**. Second, smaller trap: `packages/use/rolldown.config.ts:75` sets
`external: ['@aihu/signals', ...Object.keys(pkg.peerDependencies ?? {})]` — also exact-match — so
the lifecycle module would be **inlined** into every consuming `@aihu/use` entry's bundle and
silently inflate that entry's `.size-limit.json` row rather than being externalized. Both are
one-line fixes, but both are unlanded and neither is tracked by an existing Linear issue.

**And two of E2's four named composables are still unaddressed:**

- `useFetch` — FEL-374 says it should be *"a thin wrapper over `@aihu/runtime`'s
  `createResource`."* `LifecycleHost` exposes no resource primitive. The lifecycle-ownership
  doc never mentions `useFetch` or `createResource` — grep returns zero hits. **Still fully
  blocked.**
- `useCurrentElement` — needs an element reference. `LifecycleHost` deliberately has none; the
  doc even leans on that fact as an argument (§4.2(b): *"it requires an element reference,
  which composables in `@aihu/use` do not have"*). **Still fully blocked.**
- `useMounted` — resolved by **ruling, not by mechanism**: the doc's §5.1 says do not ship it
  (*"a constant `true` wearing an API costume"*); `useConnected()` ships instead. That is a
  decision, and it is a good one, but FEL-377 still lists `useMounted` as a deliverable and has
  not been amended.
- Real lifecycle hooks — **unblocked** (see E3).

**Remaining work for E2:** (a) widen `allowedExternals` + the rolldown `external` array;
(b) add `@aihu/use/useConnected` + `tryOnCommit` in `src/shared/` per doc §6.3; (c) add
size-limit rows; (d) make a separate ruling for `useFetch`/`useCurrentElement`, which Option C
does not cover.

---

## 3. E3 (FEL-393) — is `tryOnMounted` backed by a real hook?

### Verdict: **STILL OPEN.** The stub is unchanged, and the design's chosen remedy (delete it) has not been executed.

Current implementation, `packages/use/src/shared/index.ts:90-104` — verbatim from `main` today:

```ts
/**
 * Run `fn` on the client; no-op under SSR.
 *
 * Interim stub (effect-scope plan §5): `@aihu/use` deliberately does not
 * depend on `@aihu/runtime`, so this cannot defer to the runtime's
 * `onMount`. ...
 */
export function tryOnMounted(fn: () => void): void {
  if (isClient) fn()
}
```

Byte-identical to what FEL-393 describes. Still re-exported from `packages/use/src/index.ts:18`,
still covered by `packages/use/tests/shared.test.ts:99` and `tests/ssr-safety.test.ts:576`.

The design ruling is *not* "fix it" — `docs/plans/2026-07-24-lifecycle-ownership-dx.md` §5.3:

> **Recommendation: delete `tryOnMounted` from `@aihu/use` (root + `/shared`).** … The stub is
> not broken; the *name* is. … This is a **breaking change to `@aihu/use@0.3.0`**.

Replacement is `tryOnCommit(fn): boolean` (host-routed / rAF-fallback / SSR no-op). **Neither
the deletion nor `tryOnCommit` exists on `main`.**

This is the sharpest instance of the enabler-vs-blocker distinction: `LifecycleHost.onCommit` —
the exact primitive `tryOnCommit` is specified to sit on — shipped in #549 and is live in the
runtime. The consumer side is zero percent done.

**Remaining work for E3:** delete `tryOnMounted` (barrel + shared + 2 test files), land
`tryOnCommit` on `getLifecycleHost()`, cut the `@aihu/use` breaking-minor, then build the
`tryOnBeforeMount`/`tryOnBeforeUnmount`/`tryOnUnmounted` family. Note the family itself needs a
*disposal-side* hook that `LifecycleHost` also does not expose — unmount teardown is expected to
route through the existing `onScopeDispose`/`tryOnScopeDispose`, which is fine, but it is a
design detail nobody has written down as settled.

---

## 4. E1 (FEL-391) — deep/structural reactivity

### Verdict: **PARTIAL — and not touched by #549 at all.** The *primitive* landed in #548; the *`@aihu/use` contract ruling* is still unmade.

#549 has no bearing on E1 whatsoever. The relevant commit is **`dbf0bc7a` (#548)**, which landed
`packages/reactive/` — `@aihu/reactive@0.1.0`, `@aihu/signals` as sole dependency, two entries:

- `.` → `reactive` / `isReactive` / `unwrap` / `mutate` / `reconcile` (1900 B row)
- `./helpers` → `toSignal` / `toSignals` / **`toReactive`** / **`reactivePick`** / **`reactiveOmit`** / **`reactiveComputed`** (700 B row)

That is *literally* FEL-391's "blocks outright" list, shipped. So E1's option (a) — "build a
deep-reactivity story" — is **built**.

But E1 as written is a **decision** issue, and the decision has two halves. The second half is
unresolved:

- `docs/plans/2026-07-24-deep-reactivity.md` header still reads **"Status: PROPOSED — awaiting
  founder approval, not ratified."** So does the lifecycle doc. Both were merged as
  implementations while their governing docs still say un-ratified — approval-by-merge, with no
  document reflecting it. Nothing in `docs/plans/2026-07-24-use-categorical-parity.md` §6 has
  been amended; it still reads "OPEN — not resolved by this doc" for all three.
- The deep-reactivity doc's own executive summary ratifies "replace, don't mutate" as the
  standing contract for `@aihu/use`: *"Breaking changes: None. `signal()`, `useLocalStorage`,
  every shipped composable keep the replace contract verbatim. Purely additive."* That is the
  substantive answer FEL-391 asked for — but it lives only in an un-ratified design doc.
- **`@aihu/use` cannot import `@aihu/reactive`.** Same exact-match `allowedExternals` gate as
  E2, and `@aihu/reactive` is not in `packages/use/package.json` deps *or* peers *or*
  `families.json`. So the E1-blocked composables in `@aihu/use` (`useObject`, `useCloned`, full
  `useForm` field-aggregation) are **still blocked in their filed location** — the primitive
  exists, one package over, behind a purity wall. The doc's own §5 recipe for `useForm` calls
  `reactiveComputed(...)` directly, which `check:deps` would reject today.
- Doc line 177 explicitly concedes the split: the base primitive *"does **not** unblock
  `useForm`/`useObject`"* on its own.

**Remaining work for E1:** write the ruling down (amend parity-plan §6 + flip both plan docs off
"PROPOSED"), then decide the packaging question for `useObject`/`useCloned`/`useForm` — either a
`@aihu/reactive` optional-peer family in `families.json`, or relocate those composables into
`@aihu/reactive` itself. Note `@aihu/store`'s `isReactive()` gap (deep-reactivity doc §7.2 item 2,
called "not optional cleanup") also has no Linear issue.

---

## 5. Downstream gating map

Derived from the Linear `[use]` family descriptions (39 issues, FEL-347..FEL-406, all `Backlog`)
cross-checked against `docs/plans/2026-07-24-use-categorical-parity.md` §4 waves.

### Gated on E1 (FEL-391)

| Issue | Items gated | State after #548 |
| --- | --- | --- |
| **FEL-375** Reactivity family | `reactiveComputed`/`reactiveOmit`/`reactivePick`/`toReactive` (explicit "BLOCKED (E1)" block) | **Implemented in `@aihu/reactive/helpers`.** Issue should be re-scoped: these are done-elsewhere, and the rest of the issue (`refAutoReset`, `refDefault`, `refManualReset`, `refWithControl`, `syncRef(s)`, `useToNumber`/`useToString`, `useCached`) was never E1-blocked and is buildable now. |
| **FEL-370** State family | `useObject` (PARTIAL), `useForm` field-aggregation (PARTIAL) | Still blocked *in `@aihu/use`* pending the packaging ruling. The rest of FEL-370 (`useSessionStorage`, `useCookie`, `useList`, `useQueue`, `useField`, `useCycleList`, `useDefault`, `useOffsetPagination`) is unblocked and always was. |
| **FEL-373** Array family | Whole family, contract-caveat only ("working default under E1, not a final ruling") | Unblocked once "replace, don't mutate" is written down — nothing to build against `@aihu/reactive`. |
| **FEL-376** Utilities family | `useCloned` (PARTIAL) | Still blocked pending the packaging ruling; the other ~10 items in FEL-376 were never E1-blocked. |

### Gated on E2 (FEL-392)

| Issue | Items gated | State after #549 |
| --- | --- | --- |
| **FEL-374** Async/data-fetching | `useFetch` | **Still blocked** — no `createResource` path in `LifecycleHost`. (`useLockCallback`, the issue's other item, was never blocked.) |
| **FEL-377** Component lifecycle | `useMounted`, `useCurrentElement`, `useAsyncEffect` (E2+E3) | `useMounted` → **ruled out, don't ship** (doc §5.1). `useCurrentElement` → **still blocked**. `useAsyncEffect` → E3 half now enabled via `connected()`/`onCommit`, E2 half unresolved. |

### Gated on E3 (FEL-393)

| Issue | Items gated | State after #549 |
| --- | --- | --- |
| **FEL-377** Component lifecycle | `tryOnMounted` real fix, `tryOnBeforeMount`/`tryOnBeforeUnmount`/`tryOnUnmounted` | **Enabler landed, adoption pending.** This is the entirety of Wave 5's gate (parity plan §4: *"Once E3's `tryOnMounted` fix lands: …"*). |

### Not gated on any of E1/E2/E3 — startable today, unchanged by either PR

FEL-347..FEL-369, FEL-371, FEL-372, FEL-378..FEL-390, FEL-394..FEL-406. Waves 1 and 2 in
particular (Time, User-preferences, Sensors, Elements, State-completeness, Browser batch) never
depended on these blockers.

---

## 6. Skeptical summary — enabler vs. resolution

| Blocker | Enabling primitive | Consumer adoption | Gate widened | Ruling written down | Verdict |
| --- | --- | --- | --- | --- | --- |
| **E1** | ✅ `@aihu/reactive` (#548) | ❌ `@aihu/use` cannot import it | ❌ | ❌ doc still "PROPOSED" | **PARTIAL** |
| **E2** | ✅ `@aihu/signals/lifecycle` (#549) | ❌ zero lines in `packages/use` | ❌ `check:deps` still rejects | ⚠️ doc still "PROPOSED"; `useFetch`/`useCurrentElement` uncovered | **PARTIAL** |
| **E3** | ✅ `LifecycleHost.onCommit` (#549) | ❌ stub verbatim, `tryOnCommit` absent | ❌ | ⚠️ doc says "delete", undone | **STILL OPEN** |

**Untracked follow-up work surfaced by this verification** (no Linear issue exists for any of
these):

1. `allowedExternals` in `scripts/dep-check.ts` must admit `@aihu/signals/lifecycle` (and
   whatever `@aihu/reactive` arrangement E1 lands on).
2. `packages/use/rolldown.config.ts:75` `external` array — same exact-match problem; without it
   the lifecycle module inlines into every consuming entry's size row.
3. Both `docs/plans/2026-07-24-{deep-reactivity,lifecycle-ownership-dx}.md` still say
   "PROPOSED — awaiting founder approval, not ratified" after their implementations merged.
4. `docs/plans/2026-07-24-use-categorical-parity.md` §6 (lines ~652-678) is now stale — it still
   frames all three as fully open.
5. `@aihu/store`'s missing `isReactive()` in `collectSetupShape`/`SetupStateKeys`
   (deep-reactivity doc §7.2 item 2, flagged as required, not optional).
6. `useFetch` / `useCurrentElement` need their own ruling — Option C does not reach them.
