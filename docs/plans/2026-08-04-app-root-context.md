# App-root context — closing the `createApp` / `@aihu/context` gap

**Status:** draft for review · **Date:** 2026-08-04 · **Trigger:** aihu#744 fallout

## 1. The symptom that started this

`apps/docs-next` needed active-nav highlighting. The obvious implementation —
`inject(RouteContext)` + `ctx.current()?.pathname`, mirroring `@aihu/use`'s
shipped `useRouteParams` — produced **no error and no active class**. Every nav
link silently rendered inert.

That is not a bug in the composable. It is the framework's primary app model
having no connection to the framework's context system.

## 2. Current state (verified, file:line)

### 2.1 `provideRouteContext` has exactly two callers, both the `<router>` path

| Caller | What it is |
|---|---|
| `packages/compiler/src/codegen/emit.rs:707` | `createRouterBoundary`, emitted when a template contains a `<router>` element |
| `packages/router/components/aihu-router.aihu:47` | the `<router>` SFC itself |

Neither `packages/app/src/client.ts` (`createApp`) nor
`packages/app/src/prerender.ts` provides it. So `RouteContext` is absent on
**both** the client and the SSG prerender path.

### 2.2 Consequence: three shipped public APIs are no-ops in `createApp` apps

`useRoute()` and `useRouter()` (`packages/router/src/runtime.ts:97,104`) and
`useRouteParams()` (`packages/use/src/router/useRouteParams/index.ts`) all
resolve via `inject(RouteContext)`. In a `createApp` app all three return
`null` / `{}` forever. `inject` falls back to the token default rather than
throwing, so the failure is silent by construction.

### 2.3 There are two parallel routing architectures

| | provides `RouteContext` | `useRoute` / `useRouteParams` |
|---|---|---|
| `<router>` element | yes | work |
| `createApp()` + file router | **no** | **dead** |

`createApp` manages routing itself and renders into `#outlet`; it never renders
a `<router>`. Nothing bridges the two.

### 2.4 `createApp({ provide })` is a DIFFERENT mechanism with the same name

`packages/app/src/client.ts:138` — `Object.assign(globalThis, config.provide)`.
It hoists values onto `globalThis` so `@state` blocks can reference them as bare
identifiers. It never touches `@aihu/context`. Reading the source, "provide" is
right there and looks like the context seam. It is not.

### 2.5 The blocking constraint: the flat-map fallback is CONDITIONAL

> **Corrected after review.** The first draft claimed `inject` is flatly
> "exclusive" — that a component in setup always has `_activeProvides` non-null
> and therefore never reaches `_activeContextMap`. **That is wrong.**
> `_enterOwnerContext` (`packages/runtime/src/define-component.ts:213-229`)
> walks ancestors for `PROVIDES_SYM` and passes `parent = null` when nothing has
> ever provided; `_enterContext` then assigns `_activeProvides = parent`
> (`packages/context/src/index.ts:133`). So in exactly the docs-next case — no
> `<router>`, nothing providing anywhere — `_activeProvides` IS null and `inject`
> DOES consult the flat map. "Have `createApp` set the SSR map" would have
> appeared to work.
>
> The real defect is worse, because it is conditional: **`inject` has no
> fall-through from an `_activeProvides` MISS to the flat map.** The moment any
> ancestor provides anything — a `$context provide` (the compiler emits
> `provide(contextKey(...))`, `packages/compiler/src/parser/state_macros.rs:2054`),
> a `<router>`, any wrapper component — `_activeProvides` becomes non-null and
> the flat map is shadowed *wholesale*, so every app-level token silently
> reverts to its default. A fix built on the flat map would work until someone
> added an unrelated `$context`, then break far from the cause. That is
> precisely the class of footgun this plan exists to avoid.

`packages/context/src/index.ts:104`:

```ts
export function inject<T>(token: ContextToken<T>): T | undefined {
  if (_activeProvides !== null) {
    return (token._id in _activeProvides ? _activeProvides[token._id] : token._default) as …
  }
  if (_activeContextMap === null) return token._default
  …
}
```

Two independent paths:
- `_activeProvides` — client hierarchical, a prototype-chain object the runtime
  installs during a component's setup (`define-component.ts` wraps `_build()` in
  `_enterOwnerContext`/`_exitContext`). **Null when no ancestor has ever
  provided** — that is the conditional-fallback case above.
- `_activeContextMap` — flat, module-level, SSR/request-oriented
  (`setSsrContextMap` / `runWithContext`)

The consequence for design: an app-root mechanism built on the flat map is
correct **only while nothing else provides anything**, which is not a property
any app can be asked to maintain. So the fix must put the app root on the
hierarchical path (where a miss walks the prototype chain and cannot be shadowed
wholesale) — or `inject` must gain a fall-through. §3 chooses the former.

### 2.6 Other tokens document an app root that does not exist

| Token | Doc says | Reality in a `createApp` app |
|---|---|---|
| `MagnaFetchToken` (`packages/magna/src/context.ts:10`) | "Provide at app root: `provide(MagnaFetchToken, createMagnaFetch(options))`" | no app root participates in context → `inject` → `undefined` |
| `ResourceStoreToken` (`packages/plugin-data/src/store.ts:60`) | same instruction | same; degrades to a module-level singleton, so never per-app scoped |
| `RegistryToken` (`packages/store/src/registry.ts:45`) | client deliberately uses the module singleton | **not a bug** — intentional, leave alone |

So this is not "we forgot to wire `RouteContext`". **App authors cannot wire
their own tokens either.** That is the actual defect.

`@aihu/primitives` deliberately uses a separate DOM-based context
(`packages/primitives/src/dom-context.ts:11`, `injectContext` not
`createContext`) to avoid symbol collisions — out of scope here, but worth an
explicit decision on whether two context systems is intended long-term.

### 2.7 Why tests did not catch it

- `packages/use/tests/router/use-route-params.test.ts` hand-builds the context
  and installs it via `_enterContext`. It proves *"given a context, the
  composable reads it"* — correct, and green throughout.
- `packages/app/tests/create-app.test.ts` exercises `createApp`'s wiring,
  outlet, and rendering modes — but never with a route-consuming component.

Both sides unit-tested; **the seam between them untested**. The `@aihu/use`
test mocks precisely the thing that was missing in production.

## 3. Options considered

**A — root provider component.** `createApp` renders an internal component that
`provide()`s during setup. Works with `inject` untouched; same mechanism
`<router>` uses. The first draft dismissed this on hydration risk — **that was
wrong**: `createApp` does `outlet.replaceChildren(el)` (`client.ts:310`), so the
prerendered DOM in `#outlet` is discarded and hydration is per-element signal
pre-seeding, not adoption. A was viable; it just adds an element and an ordering
question.

**B — layered `inject` + module-global `_appProvides`.** Rejected. It changes
resolution for every token (`ResourceStoreToken`'s documented
undefined→singleton behaviour would shift the moment anything writes the slot),
costs bytes in a hot path with only 30 B of budget headroom, and a module-global
slot inherits the dual-copy hazard `packages/runtime/rolldown.config.ts:27`
warns about — plus leaking between the ~30 `createApp()` calls in
`packages/app/tests/create-app.test.ts`.

**C — converge the two routing architectures.** Right end state, too large now.
Kept in view so the smaller fix does not foreclose it.

**D — root the provides chain on a real DOM node. ← CHOSEN.** The provides chain
is keyed on **DOM nodes**, not on component-ness: `_enterOwnerContext`
(`define-component.ts:213-229`) walks `parentNode` / shadow `host` looking for
any node carrying `PROVIDES_SYM`. So an ordinary element can own a context scope.
`createApp` opens one on **the outlet element** — a DOM ancestor of every page
and layout it renders — and installs `RouteContext` there.

## 4. Decision

**Option D.** It beats B on every risk B raised, and beats A by needing no extra
element:

- `inject` is byte-for-byte unchanged — no hot-path cost, no new precedence rule.
- **No module-global.** The scope is owned by the outlet node, so nothing leaks
  between tests or between two apps on a page, and the dual-copy hazard does not
  apply.
- SSR/prerender surface untouched; the `<router>` SFC path untouched.
- Shadowing stays correct via the existing `in` check: a descendant that
  deliberately provides `undefined` still shadows the app value.

Implemented and verified (see §6). Two additions beyond the bug fix:

- `AppConfig.context?: () => void` — **the general app-root DI seam**, run after
  the framework's own providers so an app can override. This is what makes
  `MagnaFetchToken` / `ResourceStoreToken`'s "provide at app root" instructions
  true for the first time.
- `bindRouteSignalWriter(routeContext, renderNav)` — programmatic `navigate()`
  now re-renders instead of falling back to a hard navigation.

## 5. Footgun prevention

Revised after review; two of the original guardrails were not implementable as
written.

1. **Seam tests, not mocked ones — the one that would have caught this.**
   `packages/use/tests/router/use-route-params.test.ts:51,114` hand-installs
   *both* the provides object and the flat map, proving both paths work, which is
   exactly what made the missing wiring invisible. Every context-consuming public
   API needs at least one test through the real `createApp()` bootstrap.
   **Done** — `packages/app/tests/route-context.test.ts`, 10 tests, and verified
   to fail 9/10 with the source change stashed.
2. **~~Automatic token-reachability gate~~ → a maintained framework-token
   checklist.** Not implementable as first written: tokens are runtime values,
   `contextKey('x')` is minted at runtime from compiler-emitted strings
   (`state_macros.rs:1896,2070,2205`), and userland `createContext()` is
   unbounded. The honest version is a hand-maintained list of *framework* tokens
   with a test asserting each resolves under a real `createApp` — a checklist
   test, not a static gate. Say that plainly rather than implying automation.
3. **~~Warn on any unprovided framework token~~ → opt-in per token.** Blanket
   warning guarantees false positives: `ResourceStoreToken` documents
   undefined→singleton, `MagnaFetchToken` is legitimately absent in non-magna
   apps, `RegistryToken` is exempt by design. Make it a token-level opt-in
   (`createContext(default, { requiredAtAppRoot: true })`) so only tokens that
   genuinely must be provided can warn.
4. **Fix docs that cannot be followed.** `magna/src/context.ts:10` and
   `plugin-data/src/store.ts:60` now name the concrete seam. **Done.**
5. **Resolve the `provide` naming collision.** `createApp({ provide })` is
   globalThis hoisting; `config.context` is context DI. Same word, different
   systems (§2.4). Document loudly, and consider renaming `provide:` in a future
   major.

## 6. Verification status

Implemented in worktree `w-route-context` (uncommitted):

- `packages/app/tests/route-context.test.ts` — 10 tests through the REAL
  `createApp()` (only the three `virtual:` modules mocked; router/runtime/arbor/
  signals/context all real). Covers resolution, resolution through a layout
  shadow host, params tracking a popstate re-render, `config.context` injection
  and override, and degrading to `null`/`{}` with no app.
- **Guard proof:** with `client.ts` + `define-component.ts` + `runtime/index.ts`
  stashed → **9 failed / 1 passed**. Independently re-run, not taken on report.
- `vitest run packages/app packages/router packages/use` → 1062 passed, 0 failed.
  Wider sweep (adds runtime/magna/plugin-data) → 1285 passed, 0 failed.
- Full-suite before/after failing-file sets identical — zero new failures.
- `check:lint` → 0 errors (3 pre-existing infos).

**Open decision — size budget.** `@aihu/app` client grew 1817 → 1910 B gz
(+93 B) and `.size-limit.json` was raised 1900 → 2000 B. That is a deliberate,
visible budget change and needs a maintainer's call, not an agent's.

## 7. Remaining work, in order

1. **SSR/prerender route context — not fixed, and it has a visible symptom.**
   `prerender.ts` never wires `_setContextFns`/`runWithContext`, and
   `@aihu/server`'s `contextSetup` seam (`packages/server/src/ssr.ts:45`) is
   unwired on this path. Because `renderToString` never runs
   `_enterOwnerContext`, `_activeProvides` is always null there and the flat map
   is the correct mechanism — so this is a **smaller, different fix** than the
   client half (one `runWithContext(map, …)` per page render), not the same
   change. Consequence today: active-nav is absent in prerendered HTML and
   appears on hydration — a flash, not a break.
2. **`_activeProvides`-miss → flat-map fall-through** as its own ticket (§2.5).
   It is a real SSR bug independent of this work.
3. Guardrail 2 (framework-token checklist test) and guardrail 3 (opt-in
   `requiredAtAppRoot`).
4. Revert the `apps/docs-next` workaround
   (`src/lib/route-path.ts`'s `pushState` patching) back to `inject(RouteContext)`
   once 1 lands — until SSR is wired, the workaround avoids the hydration flash.
