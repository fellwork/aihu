# Architecture Spec — SFC Component Primitives: Audit + 7-Dimension Design

**Author:** Architect A5 · **Date:** 2026-05-05 · **Branch:** `feat/arch-5-sfc-primitives`
**Companion inputs:** spec-block-structure.md · spec-template-attribute-syntax.md · spec-macro-vocabulary.md · spec-plugin-contract.md · spec-live-binding.md · arch-1..4 · _user-directives.md
**Consumes:** `packages/arbor/src/types.ts` · `packages/router/src/router.ts` · `packages/data/src/resource.ts` · `packages/agent-readiness/src/content-negotiation.ts`
**Coordinates with:** arch-3 (`@aihu/auth`, `@aihu/magna`, `@aihu/i18n` proposed) · arch-4 (LSP macro surface) · arch-1 (website) · arch-2 (examples portfolio)

---

## §0 Orientation

Aihu's value proposition is "agentic discovery and interaction, for human purpose" (Directive 0, `_user-directives.md:6`). The built-in SFC primitives — macro elements in `@template`, macro declarations in `@state`, style macros in `@style` — are the surface every developer touches first. They must be excellent.

This spec audits the 39 shipped macro forms across 4 blocks (`spec-macro-vocabulary.md:36–42`), identifies gaps across 7 dimensions, and proposes new primitives with concrete contracts. The 7 dimensions are: **Design**, **Styles**, **Data**, **Auth**, **Internationalization (i18n)**, **Accessibility (a11y)**, and **Routing**.

Three constraint envelopes govern every proposal:

1. **Macro vocabulary is closed.** `spec-macro-vocabulary.md:17` — "New macros require an RFC and version bump." All 25 new primitives map to RFC stubs in §5.
2. **Block grammar is closed.** `spec-block-structure.md:19` — "The four-block model is closed in v1." No new core blocks proposed. Plugin blocks use namespaced form (`spec-block-structure.md:269`). The `@route` block carries no macros (`spec-macro-vocabulary.md:44`).
3. **Dep-free thesis.** `@aihu/*` packages have zero non-`@aihu/*` runtime deps (`arch-3-plugins.md:§0`). Any ICU library lives in the plugin or the user's app — never in core.

**Relationship to plugin suite:** Five of the seven proposed primitive groups coordinate with plugins. `@aihu/auth` gates auth primitive enforcement. `@aihu/i18n` (new, §4) is the i18n runtime. Routing primitives live in `@aihu/router`. A11y primitives require no plugin — they are runtime-free Web API wrappers. Data primitives extend `@aihu/data`.

**Gate dependency:** `<$guard>` enforcement depends on live-binding RFC ratification (`spec-live-binding.md:§0` — APPROVED, security review pending). Until RATIFIED, `<$guard>` renders fallback UI correctly but `checkScope` is not wired (`spec-live-binding.md:§5` step 3). Known gap, not a bug.

---

## §1 Current State Inventory

Status: **Shipped** = compiled and runtime-wired; **Shipped (partial)** = compiled, runtime behavior incomplete.

| Primitive | Block | Kind | Status | Notes | Plugin coordination |
|---|---|---|---|---|---|
| `$prop` | `@state` | declaration | Shipped | Full | none |
| `$computed` | `@state` | declaration | Shipped | Full | none |
| `$resource` | `@state` | declaration | Shipped | Full | `@aihu/data` runtime |
| `$effect` | `@state` | statement | Shipped | Full | none |
| `$effect.on` | `@state` | statement | Shipped | Full | none |
| `$watch` | `@state` | statement | Shipped | Full | none |
| `$action` | `@state` | declaration | Shipped | Full | none |
| `$lifecycle.mount` | `@state` | statement | Shipped | Full | none |
| `$lifecycle.dispose` | `@state` | statement | Shipped | Full | none |
| `$expose` | `@state` | statement | Shipped | Full | none |
| `$shared` | `@state` | declaration | Shipped | Full | none |
| `$cookie` | `@state` | declaration | Shipped | Full | none |
| `$server` | `@state` | declaration | Shipped | Full | none |
| `$meta` | `@state` | statement | Shipped | Full | `@aihu/seo` augments |
| `$if` | `@template` | attribute | Shipped | Full | none |
| `$show` | `@template` | attribute | Shipped | Full | none |
| `$each` | `@template` | attribute | Shipped | Full | none |
| `$bind:*` | `@template` | attribute | Shipped | Full | none |
| `$on:*` | `@template` | attribute | Shipped | Full | none |
| `$key` | `@template` | attribute | Shipped | Full | none |
| `$html` | `@template` | attribute | Shipped | Full | none |
| `$raw` | `@template` | boolean attr | Shipped | Full | none |
| `$once` | `@template` | boolean attr | Shipped | Full | none |
| `$memo` | `@template` | attribute | Shipped | Full | none |
| `$action` (form) | `@template` | attribute | Shipped | Full | none |
| `<$slot>` | `@template` | element | Shipped | Full | none |
| `<$suspense>` | `@template` | element | Shipped | Full | none |
| `<$shield>` | `@template` | element | Shipped | Full | none |
| `<$guard>` | `@template` | element | **Shipped (partial)** | UI boundary renders; `checkScope`/`checkRateLimit` are stubs pending live-binding RATIFY (`spec-live-binding.md:§1`) | `@aihu/auth` (enforcement) |
| `<$warp>` | `@template` | element | Shipped | Full | none |
| `$reactive` | `@style` | function | Shipped | Expression form only; function form `$reactive(() => expr)` proposed as RFC-A5-025 | none |
| `$tokens` | `@style` | statement | Shipped | Full | none |
| `$global` | `@style` | block | Shipped | Full | none |
| `$media` | `@style` | block | Shipped | Full | none |
| `$when` | `@style` | block | Shipped | Full | none |
| `$expose` | `@agent` | statement | Shipped | Full | none |
| `$expose.write` | `@agent` | statement | Shipped | Full | none |
| `$action` (agent) | `@agent` | statement | Shipped | Full | none |
| `$scope` | `@agent` | statement | **Shipped (partial)** | Parsed; enforcement blocked on live-binding RATIFY | `@aihu/auth` |
| `$rate-limit` | `@agent` | statement | **Shipped (partial)** | Parsed; rate counter blocked on live-binding RATIFY | `@aihu/scraping` |
| `$describe` | `@agent` | statement | Shipped | Full | none |

**Shipped-partial callout:** `<$guard>`, `$scope`, `$rate-limit` — parsed correctly, valid AST output. Runtime enforcement stubs at `packages/arbor/src/types.ts:127` (frozen `AgentContext` sentinel). RATIFICATION of the live-binding RFC unblocks all three.

---

## §2 Per-Dimension Gap Analysis

### §2.1 Design

**Exists today:** `$tokens()` in `@style` imports design tokens as CSS custom properties. `$reactive(expr)` binds CSS values to signals. `$media(query)` and `$when(expr)` apply conditional styles. No framework-level theme provider. Dark-mode detection requires `$media(prefers-color-scheme: dark)` per component, repeated across every component that cares about theme.

**Missing:** No declarative theme provider scoping CSS custom properties to a subtree. No `prefers-color-scheme`-aware provider exposing a reactive signal. No mechanism for component library authors to supply branded tokens to descendants without global CSS.

**`<$theme>` — ACCEPT.** Core template element. Wraps a subtree with a named theme context. Reads `prefers-color-scheme` by default; accepts explicit `mode` prop. Sets CSS custom properties from `aihu.config.ts` `style.themes[tokens]` on its root DOM element. Reactive: `mode` changes update properties without remounting children. No plugin required. RFC-A5-001.

```
@state {
  $prop mode?: 'light' | 'dark' | 'auto' = 'auto'
}
@template {
  <$theme mode="mode" tokens="brand">
    <$slot />
  </$theme>
}
```

Props: `mode: 'light' | 'dark' | 'auto'` (default `'auto'`); `tokens: string` (key into `aihu.config.ts` `style.themes`). Slot context: `theme.resolved` (`'light' | 'dark'`), `theme.toggle` (function).

**`<$tokens>` as template element — REJECT.** Naming collision with the existing `$tokens()` style macro (`spec-macro-vocabulary.md:§4.2`). `<$theme>` covers the scoped-tokens-to-subtree use case. No second primitive needed.

**`$brand` macro — DEFER to v1.2.** Reactive brand asset swapping is design-system-specific. Implement as a plugin-contributed component.

**New `@design` block — REJECT.** Block grammar is closed (`spec-block-structure.md:19`). Use namespaced plugin blocks.

### §2.2 Styles

**Exists today:** All five `@style` macros shipped (`spec-macro-vocabulary.md:§4`): `$reactive`, `$tokens`, `$global`, `$media`, `$when`.

**Missing:** Container queries have no dedicated macro — authors write raw `@container` inside `$global {}`, losing scoped context and macro consistency. No `prefers-*` shorthand. No explicit-dependency function form for `$reactive`.

**`$reactive(() => expr)` function form — ACCEPT** as a backward-compatible amendment to the existing macro. The current `$reactive(signal)` auto-tracks all reads. The function form `$reactive(() => expr)` makes the dependency boundary explicit, matching `$effect.on` semantics. Amendment to `spec-macro-vocabulary.md:§4.1`. RFC-A5-025.

**`$container(name?, query)` — ACCEPT.** New `@style` block macro for container queries. Lowers to `@container name (query) { rules }`. Symmetric with `$media`. Browser support: `@container` is Baseline 2023 — safe to default-on. RFC-A5-022.

```
@style {
  $container(sidebar, inline-size > 400px) {
    .label { display: block }
  }
}
```

**`$prefers(feature)` — ACCEPT.** `@style` block macro shorthand for `prefers-*` media features. Lowers to `@media (prefers-feature: value) { rules }`. RFC-A5-023.

```
@style {
  $prefers(reduced-motion) {
    * { transition: none !important }
  }
}
```

### §2.3 Data

**Exists today:** `$resource name = fetcherCall(args)` in `@state` (`spec-macro-vocabulary.md:§2.3`). `createResource` at `packages/data/src/resource.ts:31`. Stale-while-revalidate via `invalidate()`. No optimistic mutation, no pagination cursor management, no interval polling.

**`<$mutation>` — ACCEPT for v1.2.** Template element managing a mutation lifecycle (idle/loading/error/success) with optimistic update slots. Deferred: requires mutation protocol design and `@aihu/data` extension. RFC-A5-024 (deferred stub).

```
<$mutation action="createPost">
  <$slot name="idle">
    <button $on:click="triggerMutation">Post</button>
  </$slot>
  <$slot name="loading"><Spinner /></$slot>
  <$slot name="error">
    <ErrorBanner error="mutation.error" />
  </$slot>
</$mutation>
```

Slot context: `mutation.loading`, `mutation.error`, `mutation.data`, `mutation.trigger(args)`.

**`<$paginated>` — DEFER to v1.2.** Cursor-based pagination is tightly coupled to data source cursor protocols. Defer until `@aihu/magna` bridge patterns emerge.

**`<$polling>` — DEFER to v1.2.** Address as `$resource.interval` sub-form noted in `spec-macro-vocabulary.md:§9.2`.

**`<$resource name="x" url="...">` declarative form — REJECT.** `$resource` in `@state` is the single mental model. A template element form creates a second mental model for the same concept.

### §2.4 Auth

**Exists today:** `<$guard scope="X" fallback="Y">` shipped (`spec-macro-vocabulary.md:§3.15`). Slot context: `guard.user`, `guard.reason`, `guard.path`. Enforcement is stubbed pending live-binding RATIFY.

**`<$guard>` enforcement (post-RFC #56 RATIFY):** The existing props shape is correct and complete. `scope` maps to `binding.scope()` in `spec-live-binding.md:§5` step 3. No props changes needed. `@aihu/auth` before-handler middleware injects `JwtClaims` before `handleToolCall` runs (`arch-3-plugins.md:§2.4`). No template attribute syntax changes required.

**Surface condition — security model alignment:** `<$guard>` enforcement does NOT conflict with live-binding RFC §6 security model (`spec-live-binding.md:§6.1–§6.5`). The UI boundary (`<$guard>`) and server dispatch boundary (`handleToolCall`) enforce the same scope via the same auth state. They are complementary layers, not conflicting ones.

**`$user` — ACCEPT.** `@state` macro declaring a reactive current-user signal, lowered by `@aihu/auth`. Returns `User | null` matching the claims shape from `auth({ scopes })`. Compile error when `@aihu/auth` not registered. RFC-A5-009.

```
@state {
  $user currentUser
}
@template {
  <p $if={currentUser !== null}>Hello, {currentUser.name}</p>
  <$guard scope="admin" redirect="/403">
    <AdminPanel />
  </$guard>
}
```

Lowering: `const currentUser = useCurrentUser()` injected by `@aihu/auth`; lowers to `$shared` + server-side JWT claim extraction per `arch-3-plugins.md:§2.4`.

**`<$signin>` and `<$signout>` — ACCEPT as `@aihu/auth` plugin-contributed components**, not core primitives. SFC files in `packages/auth/components/` per `spec-plugin-contract.md:§6.1`. No core RFC required.

### §2.5 Internationalization

**Exists today:** Nothing. i18n is entirely absent from the framework and plugin suite.

**Surface condition — ICU footprint:** Full ICU MessageFormat 2.0 is ~100 kB min+gzip. This violates the dep-free thesis and the `<1 MB` playground bundle budget (Directive 1, `_user-directives.md:93`). Decision: `@aihu/i18n` ships a **~2 kB zero-dep ICU subset** covering named placeholders `{name}`, select `{gender, select, ...}`, and plural `{count, plural, ...}`. Full ICU MessageFormat 2.0 is opt-in via `icuParser: (pattern, params) => string` in plugin config. The plugin never bundles a parser.

**Surface condition — plugin split:** One plugin (`@aihu/i18n`) is sufficient. The Plugin Contract already separates build-time vs. runtime contributions (`spec-plugin-contract.md:§6.5`). No split into `@aihu/i18n-runtime` + `@aihu/i18n-build`.

**Message catalog format:** JSON (`{ "key.path": "message {var}" }`). PO format user opt-in via `icuParser`.

**Server vs. client locale negotiation:** `@aihu/i18n` registers a before-handler middleware that reads `Accept-Language`, negotiates against `config.locales`, injects resolved locale into request context. `<$locale>` reads this on SSR; client hydrates from the serialized locale signal (same `$shared` hydration pattern).

**Bundle splitting:** `beforeCompile` emits one locale bundle per configured locale at `dist/i18n/{locale}.json`. Only the active locale bundle loads on the client.

**All six i18n primitives require `@aihu/i18n` registered. Compile error if absent.**

**`<$locale>` — ACCEPT.** Root locale provider. RFC-A5-002.

```
<$locale locale="currentLocale">
  <$slot />
</$locale>
```

Props: `locale: string` (BCP 47). Slot context: `locale.current`, `locale.dir` (`'ltr' | 'rtl'`), `locale.set(tag)`.

**`<$translate id="...">` — ACCEPT.** Translates a message key. Falls back to key in dev, silently passes in production. RFC-A5-003.

```
<$translate id="welcome.message" params={{ name: currentUser.name }} />
```

**`$t` — ACCEPT.** Terse translation function call recognized in `@template` expressions. NOT a declaration macro — recognized inside interpolations. Compile error if no `<$locale>` ancestor. RFC-A5-008.

```
@template {
  <h1>{$t('page.title')}</h1>
}
```

Lowering: `$t('key', params)` → `i18n.translate('key', params)` where `i18n` is injected from `<$locale>` context.

**`<$plural>` — ACCEPT.** Explicit plural rules via `Intl.PluralRules`. RFC-A5-004.

```
<$plural count="itemCount">
  <$slot name="zero">No items</$slot>
  <$slot name="one">One item</$slot>
  <$slot name="other">{itemCount} items</$slot>
</$plural>
```

**`<$relativeTime>` — ACCEPT.** Wraps `Intl.RelativeTimeFormat`. Props: `value: Date | number`; `style?: 'long' | 'short' | 'narrow'`. RFC-A5-005.

**`<$dateTime>` — ACCEPT.** Wraps `Intl.DateTimeFormat`. Props: `value: Date | number`; `options?: Intl.DateTimeFormatOptions`. RFC-A5-006.

**`<$number>` — ACCEPT.** Wraps `Intl.NumberFormat`. Props: `value: number`; `options?: Intl.NumberFormatOptions`. RFC-A5-007.

All four formatting elements read locale from nearest `<$locale>` ancestor via context injection. All use platform `Intl.*` APIs — zero external deps.

### §2.6 Accessibility

**Exists today:** `$on:*` supports key modifiers (`spec-macro-vocabulary.md:§3.5`). No a11y-specific template elements. No focus management, live regions, skip navigation, or screen-reader helpers.

**Plugin decision — `@aihu/a11y`: REJECT as a separate package.** A11y primitives use only Web APIs. Shipping in core makes accessible-by-default the default path. Cost: ~800 bytes compiled runtime.

**Keyboard nav extension:** `$on:keydown.enter`, `$on:keydown.escape`, `$on:keydown.tab` already work. This is a documentation gap, not a primitive gap.

**`<$liveRegion>` — ACCEPT.** Core template element. `aria-live` wrapper with reactive content. RFC-A5-017.

```
<$liveRegion politeness="polite">
  {statusMessage}
</$liveRegion>
```

Props: `politeness: 'polite' | 'assertive'` (default `'polite'`); `atomic?: boolean` (default `true`). Lowers to `<div role="status" aria-live="{politeness}" aria-atomic="{atomic}">`.

**`<$focusTrap>` — ACCEPT.** Core template element. Constrains keyboard focus to a subtree while active. RFC-A5-018.

```
<$focusTrap active="isModalOpen" returnFocus>
  <dialog $show="isModalOpen">
    <button $on:click="closeModal">Close</button>
  </dialog>
</$focusTrap>
```

Props: `active: boolean | signal-ref`; `returnFocus?: boolean` (default `true`); `initialFocus?: string` (CSS selector). Runtime: focusable-element query inline, ~150 bytes.

**`<$skipLink>` — ACCEPT.** Core template element. Skip-to-main-content link, visually hidden until focused. RFC-A5-019.

```
<$skipLink target="#main-content">Skip to main content</$skipLink>
```

Props: `target: string`. Pure HTML/CSS — no JS runtime.

**`<$visuallyHidden>` — ACCEPT.** Core template element. Screen-reader-only content wrapper. RFC-A5-020.

```
<$visuallyHidden>Sort by date, ascending</$visuallyHidden>
```

No props. Lowers to `<span>` with `.sr-only` CSS injected into scoped stylesheet (~8 bytes CSS, zero JS).

**`<$announce>` — ACCEPT.** Programmatic ARIA live region for action-triggered announcements. RFC-A5-021.

```
@state {
  $action async save() {
    await api.save(data)
    $announce('Changes saved')
  }
}
```

`$announce` is a framework-provided function call recognized inside `@state` action bodies. Not a declaration macro. Compiler recognizes it in action bodies and emits an announce runtime import. Runtime: text injected into a module-level singleton `<div aria-live="polite" aria-atomic="true">` (appended to `<body>` once, reused). Messages cleared after 2 seconds.

**Coordinate with `agent-readiness`:** `packages/agent-readiness/src/content-negotiation.ts` handles bot vs. human distinction at the HTTP middleware layer. `<$liveRegion>` and `<$visuallyHidden>` content is present in the serialized DOM — no special handling needed for AI scrapers. No coordination change required.

### §2.7 Routing

**Exists today:** `packages/router/src/router.ts` — `createRouter`, `Router`, `MatchResult` (line 24: `route`, `params`, `pathname`). `packages/router/src/vite-plugin.ts` — file-system routing via virtual modules. `@route` block for page routing metadata (`spec-block-structure.md:§7.3`). No reactive current-route signal. No `<$link>` component. No `<$outlet>`. No navigation guards.

**Constraint:** Navigation guards live in `@state`, not `@route` (`spec-macro-vocabulary.md:44`).

**`$route` — ACCEPT.** `@state` macro declaring a reactive signal providing the current route. RFC-A5-010.

```
@state {
  $route currentRoute
}
@template {
  <h1>{currentRoute.params.slug}</h1>
}
```

Lowering: `const currentRoute = useRoute()` — injects from `<$router>`'s reactive `MatchResult` signal. Shape matches `packages/router/src/router.ts:24`.

**`<$router>` — ACCEPT.** Root router component. Replaces manual `createRouter` setup. Picks up routes from existing virtual module. Provides route context to descendants. RFC-A5-011.

```
<$router>
  <AppShell>
    <$outlet />
  </AppShell>
</$router>
```

**`<$link href="...">` — ACCEPT.** Accessible navigation link with prefetch. RFC-A5-012.

```
<$link href={`/users/${userId}`} prefetch="hover">Profile</$link>
```

Props: `href: string | expression`; `prefetch?: 'none' | 'hover' | 'visible'` (default `'none'`); `replace?: boolean`. Lowers to `<a>` with click intercepted for SPA navigation. Sets `aria-current="page"` on active match. View transitions: when `aihu.config.ts` `router.viewTransitions: true`, navigation wraps in `document.startViewTransition()` — no new primitive required.

**`<$outlet>` — ACCEPT.** Renders matched route content inside `<$router>`. No props. RFC-A5-013.

**`<$navigate to="..." />` — ACCEPT.** Programmatic redirect component. Renders nothing; triggers navigation on mount. RFC-A5-014.

```
<$navigate $if="shouldRedirect" to="/login" replace />
```

Props: `to: string`; `replace?: boolean`.

**`$beforeNavigate` — ACCEPT.** Navigation guard in `@state`. Runs before route changes; can cancel or redirect. RFC-A5-015.

```
@state {
  $beforeNavigate((to, from, next) => {
    if (hasUnsavedChanges) {
      if (!confirm('Leave page?')) return next(false)
    }
    next()
  })
}
```

Valid in `@state` only. Multiple guards run in declaration order. Registered on nearest router context's guard chain.

**`$afterNavigate` — ACCEPT.** Post-navigation callback in `@state`. RFC-A5-016.

```
@state {
  $afterNavigate((to, from) => {
    analytics.pageview(to.pathname)
  })
}
```

**`<$breadcrumbs>` — DEFER to v1.2.** `MatchResult` (`packages/router/src/router.ts:24`) has no parent route concept. Defer until nested routing and route metadata APIs stabilize.

---

## §3 Plugin Coordination Matrix

| New Primitive | Plugin | Dependency | Ships |
|---|---|---|---|
| `<$theme>` | Core | — | v1.1 M2 |
| `$reactive(() => expr)` | Core amendment | — | v1.1 M2 |
| `$container(...)` | Core | — | v1.1 M2 |
| `$prefers(...)` | Core | — | v1.1 M2 |
| `<$mutation>` | `@aihu/data` | Required | v1.2 |
| `<$guard>` enforcement | `@aihu/auth` | Hard gate: live-binding RATIFY | v1.1 M2 |
| `$user` | `@aihu/auth` | Required; compile error if absent | v1.1 M2 |
| `<$signin>` / `<$signout>` | `@aihu/auth` (components) | Required | v1.1 M2 |
| `<$locale>` | `@aihu/i18n` | Required | v1.1 M2 |
| `<$translate>` | `@aihu/i18n` | Required | v1.1 M2 |
| `$t` | `@aihu/i18n` | Required; compile error if absent | v1.1 M2 |
| `<$plural>` | `@aihu/i18n` | Required | v1.1 M2 |
| `<$relativeTime>` | `@aihu/i18n` | Required | v1.1 M2 |
| `<$dateTime>` | `@aihu/i18n` | Required | v1.1 M2 |
| `<$number>` | `@aihu/i18n` | Required | v1.1 M2 |
| `<$liveRegion>` | Core | — | v1.1 M1 |
| `<$focusTrap>` | Core | — | v1.1 M1 |
| `<$skipLink>` | Core | — | v1.1 M1 |
| `<$visuallyHidden>` | Core | — | v1.1 M1 |
| `<$announce>` | Core | — | v1.1 M1 |
| `$route` | `@aihu/router` | Required | v1.1 M1 |
| `<$router>` | `@aihu/router` | Required | v1.1 M1 |
| `<$link>` | `@aihu/router` | Required | v1.1 M1 |
| `<$outlet>` | `@aihu/router` | Required | v1.1 M1 |
| `<$navigate>` | `@aihu/router` | Required | v1.1 M1 |
| `$beforeNavigate` | `@aihu/router` | Required | v1.1 M1 |
| `$afterNavigate` | `@aihu/router` | Required | v1.1 M1 |

---

## §4 New Plugin Proposals

### `@aihu/i18n` — ACCEPT

**Rationale:** i18n is entirely absent. Seven i18n primitives require a locale runtime, catalog loading, and bundle splitting. Too substantial for core (any real ICU support exceeds the dep-free budget); too framework-specific to ask users to wire manually.

**Package:** `packages/i18n/` · **Namespace:** `i18n` · **Dep-free:** Yes — all formatting via `Intl.*` platform APIs, zero external deps.

**Config:** `i18n({ locales: ['en', 'es', 'fr'], defaultLocale: 'en', messageDir: './locales/', icuParser?: fn })`.

**Contributions:**
- Server-side: before-handler middleware for `Accept-Language` negotiation, locale injection into request context.
- Build-time `beforeCompile`: validates message catalogs for missing keys. `afterCompile`: emits `dist/i18n/{locale}.json` per locale.
- Components: `<$locale>`, `<$translate>`, `<$plural>`, `<$relativeTime>`, `<$dateTime>`, `<$number>` via `contributes.components`.
- Macros: `$t` function call lowering in `@template` via `contributes.macros`.

**ICU policy:** ~2 kB zero-dep subset (named placeholders, select, plural). Full MessageFormat 2.0 is opt-in via `icuParser: (pattern, params) => string`. Plugin never bundles a parser.

**Updated arch-3 plugin matrix row to add:**

| Domain | Package | Magna integration | Browser budget | Spec status | Live-binding required |
|---|---|---|---|---|---|
| Internationalization | `@aihu/i18n` | DATA-SOURCE (locale in user profile) | ~2 kB ICU subset | A5 — GREEN | No |

### `@aihu/a11y` — REJECT

A11y primitives use only Web APIs. Ship in core. No plugin warranted.

---

## §5 RFC Requirements

25 RFCs total per `spec-macro-vocabulary.md:§0`. RFC-A5-001, RFC-A5-017 through RFC-A5-023, and RFC-A5-025 require core vocabulary amendments. RFC-A5-002 through RFC-A5-016 are plugin spec entries (no core vocabulary amendment). RFC-A5-024 is deferred.

**RFC-A5-001 — `<$theme>`:** Core template element. Provides theme context (light/dark/auto) and CSS custom property scope to a subtree. Valid in `@template`. No naming conflict with `$tokens` (`@style` statement, different block). Rationale: developers need a first-class theme provider reading `prefers-color-scheme` reactively; per-component `$media` workarounds are insufficient for component libraries.

**RFC-A5-002 — `<$locale>`:** Plugin element (`@aihu/i18n`). Root locale provider. Valid in `@template`. Rationale: i18n requires SSR-serializable locale context reacting to locale changes without remount. No existing primitive covers this.

**RFC-A5-003 — `<$translate>`:** Plugin element (`@aihu/i18n`). Message key lookup with ICU params. Valid in `@template`. Rationale: declarative translation integrated with ICU subset. Falls back to key in dev; never throws.

**RFC-A5-004 — `<$plural>`:** Plugin element (`@aihu/i18n`). Multi-element plural rendering via `Intl.PluralRules`. Valid in `@template`. Rationale: ICU subset handles inline plural strings; `<$plural>` handles complex multi-element plural UI that `<$translate>` cannot express.

**RFC-A5-005 — `<$relativeTime>`:** Plugin element (`@aihu/i18n`). Wraps `Intl.RelativeTimeFormat`. Valid in `@template`. Rationale: relative time ("3 hours ago") is universally needed; platform API keeps bundle zero.

**RFC-A5-006 — `<$dateTime>`:** Plugin element (`@aihu/i18n`). Wraps `Intl.DateTimeFormat`. Valid in `@template`. Rationale: locale-aware date formatting cannot be done with static strings.

**RFC-A5-007 — `<$number>`:** Plugin element (`@aihu/i18n`). Wraps `Intl.NumberFormat`. Valid in `@template`. Rationale: currency, percentage, compact notation require locale-specific formatting.

**RFC-A5-008 — `$t`:** Plugin macro (`@aihu/i18n`). Terse translation function call in `@template` interpolations. NOT a declaration. Compile error without `<$locale>` ancestor. Rationale: `{$t('key')}` is the common terse case; `<$translate>` is verbose for inline use. No conflict with `$tokens` (different block, different form).

**RFC-A5-009 — `$user`:** Plugin macro (`@aihu/auth`). Reactive current-user signal in `@state`. Valid in `@state`. Rationale: auth state is reactive cross-cutting data; imperative `getAuthState()` breaks reactive contract. Compile error when `@aihu/auth` absent. No conflict with any existing `@state` macro.

**RFC-A5-010 — `$route`:** Plugin macro (`@aihu/router`). Reactive `MatchResult` signal in `@state`. Valid in `@state`. Rationale: route params and pathname are reactive data; prop-drilling from page to component is insufficient. `@route` block is non-macro-bearing (`spec-macro-vocabulary.md:44`) — `$route` in `@state` is the correct location. No naming conflict.

**RFC-A5-011 — `<$router>`:** Plugin element (`@aihu/router`). Root router component. Valid in `@template`. Rationale: wraps `createRouter` with reactive context provision; SFC-first design.

**RFC-A5-012 — `<$link>`:** Plugin element (`@aihu/router`). Accessible SPA navigation link with prefetch. Valid in `@template`. Rationale: SPA navigation, `aria-current`, and prefetch cannot be provided by raw `<a>` without boilerplate.

**RFC-A5-013 — `<$outlet>`:** Plugin element (`@aihu/router`). Route content slot inside `<$router>`. Valid in `@template`. Rationale: nested layouts need a designated route content mount point, distinct from `<$slot>` (component slots) semantics.

**RFC-A5-014 — `<$navigate>`:** Plugin element (`@aihu/router`). Programmatic redirect on mount. Valid in `@template`. Rationale: `<$navigate $if="condition" to="/login" />` is declarative; replaces `$lifecycle.mount` + `history.pushState` boilerplate.

**RFC-A5-015 — `$beforeNavigate`:** Plugin macro (`@aihu/router`). Navigation guard in `@state`. Valid in `@state`. Rationale: unsaved-changes guards and auth redirects need to run before navigation commits. Cannot live in `@route` (non-macro-bearing).

**RFC-A5-016 — `$afterNavigate`:** Plugin macro (`@aihu/router`). Post-navigation callback in `@state`. Valid in `@state`. Rationale: analytics pageviews and scroll restoration need a reliable post-navigation hook. Distinct from `$lifecycle.mount` (runs once at component mount, not on each navigation).

**RFC-A5-017 — `<$liveRegion>`:** Core template element. `aria-live` wrapper with reactive content. Valid in `@template`. Rationale: WCAG 2.1 SC 4.1.3 requires status messages to be programmatically determined; a core primitive makes this the default path.

**RFC-A5-018 — `<$focusTrap>`:** Core template element. Focus containment for modal surfaces. Valid in `@template`. Rationale: WCAG 2.1 SC 2.1.2 requires focus containment in modal dialogs; preventing every developer from reimplementing the focusable-element query is a core responsibility.

**RFC-A5-019 — `<$skipLink>`:** Core template element. Skip-to-main-content link. Valid in `@template`. Rationale: WCAG 2.1 SC 2.4.1 requires a bypass block mechanism; a one-line primitive ships this for free.

**RFC-A5-020 — `<$visuallyHidden>`:** Core template element. Screen-reader-only content wrapper. Valid in `@template`. Rationale: icon buttons, decorative images, and supplementary labels universally need visually-hidden text; eliminates copy-pasting the `.sr-only` CSS pattern.

**RFC-A5-021 — `<$announce>`:** Core function call recognized in `@state` action bodies. Programmatic ARIA announcement queue. Valid in `@state` action bodies. Rationale: form submission feedback, async operation completion, and error notifications must reach screen readers without a visible DOM change. Singleton queued live region prevents collision.

**RFC-A5-022 — `$container(...)`:** Core `@style` block macro. Container query wrapper. Valid in `@style`. Rationale: `@container` is Baseline 2023; a first-class macro makes container queries consistent with `$media`. No naming conflict.

**RFC-A5-023 — `$prefers(...)`:** Core `@style` block macro. `prefers-*` feature shorthand. Valid in `@style`. Rationale: `prefers-reduced-motion`, `prefers-color-scheme`, `prefers-contrast` are accessibility-critical; a shorthand promotes correct use. Symmetric with `$media`.

**RFC-A5-024 — `<$mutation>` (deferred):** Plugin element (`@aihu/data`). Mutation lifecycle manager with optimistic update slots. Valid in `@template`. Deferred to v1.2. Requires `@aihu/data` extension spec and mutation protocol design.

**RFC-A5-025 — `$reactive(() => expr)` amendment:** Core `@style` macro amendment. Extends `$reactive` with explicit function-form dependency boundary. Valid in `@style`. Backward compatible: `$reactive(signal)` unchanged. Rationale: explicit deps match `$effect.on` mental model; prevents over-subscription in complex style expressions.

---

## §6 Phased Delivery

### v1.1 M1 (Week 1–2)

Ship with no external plugin dependencies. Unblock the most other work-streams.

- **A11y core elements:** `<$liveRegion>`, `<$focusTrap>`, `<$skipLink>`, `<$visuallyHidden>`, `<$announce>`. ~800 bytes compiled runtime. No plugin. Zero risk.
- **Routing primitives:** `$route`, `<$router>`, `<$link>`, `<$outlet>`, `<$navigate>`, `$beforeNavigate`, `$afterNavigate`. Coordinates with existing `@aihu/router`. File-system routing is already shipped; these wrap it ergonomically.
- **`<$guard>` enforcement readiness:** No API change needed. When live-binding RATIFIES, one wiring call in `createGuardBoundary` activates enforcement.

### v1.1 M2 (Week 3–5)

Requires live-binding RATIFY and corresponding plugin ships.

- **Design:** `<$theme>`.
- **Styles:** `$reactive(() => expr)` amendment, `$container(...)`, `$prefers(...)`.
- **Auth:** `$user`, `<$signin>`, `<$signout>` — with `@aihu/auth` M2 ship.
- **i18n:** `<$locale>`, `<$translate>`, `$t`, `<$plural>`, `<$relativeTime>`, `<$dateTime>`, `<$number>` — with `@aihu/i18n` initial ship.

### v1.2 (M3+)

- `<$mutation>` — requires RFC-A5-024 ratification and `@aihu/data` mutation protocol.
- `<$paginated>`, `<$polling>` / `$resource.interval` — address per `spec-macro-vocabulary.md:§9.2`.
- `<$breadcrumbs>` — deferred pending route hierarchy API.
- Full ICU MessageFormat 2.0 — user opt-in via `icuParser`; no framework change needed.

---

## §7 Acceptance Criteria per Primitive

| Primitive | Runnable check |
|---|---|
| `<$theme>` | Mount with `mode="dark"` → root element `color-scheme: dark`; `prefers-color-scheme` media change updates `theme.resolved` signal without component remount |
| `$reactive(() => expr)` | Snapshot: emits same CSS var + effect as expression form; disabling unrelated signals confirms no re-run (explicit boundary) |
| `$container(...)` | Snapshot: `$container(inline-size > 400px) { .x {} }` → `@container (inline-size > 400px) { .x {} }` in scoped CSS output |
| `$prefers(reduced-motion)` | Snapshot: lowers to `@media (prefers-reduced-motion: reduce) { ... }` |
| `<$guard>` enforcement | Integration (post-RATIFY): non-admin JWT + `<$guard scope="admin">` → fallback renders; `checkScope` returns false per `spec-live-binding.md:§9` test (f) |
| `$user` | Compile error when `@aihu/auth` absent; renders `null` before auth loads; reactive on sign-in/sign-out |
| `<$locale>` | `locale.current` updates on `locale.set('es')`; `<$translate>` descendants re-render with Spanish strings |
| `<$translate>` | Falls back to key in dev when key missing; never throws; compile error if `@aihu/i18n` absent |
| `$t` | Compile error without `<$locale>` ancestor; `{$t('x', {n:1})}` matches catalog output |
| `<$plural>` | Correct slot for `count=0,1,2`; uses `Intl.PluralRules` with resolved locale |
| `<$relativeTime>` | Output matches `Intl.RelativeTimeFormat` with resolved locale; reactive on `value` change |
| `<$dateTime>` | Output matches `Intl.DateTimeFormat` with resolved locale and `options` |
| `<$number>` | Output matches `Intl.NumberFormat` with resolved locale and `options` |
| `<$liveRegion>` | DOM has `aria-live="polite"` and `aria-atomic="true"`; axe-core audit passes; content change triggers screen reader queue |
| `<$focusTrap>` | Tab cycles within children when `active=true`; focus returns to trigger on deactivation when `returnFocus=true` |
| `<$skipLink>` | Visually hidden until focused; Enter on focused link moves focus to `target` element |
| `<$visuallyHidden>` | Not visible to sighted users; in DOM; passes screen reader accessibility audit |
| `<$announce>` | `$announce('Saved')` in action body → text in singleton live region within one frame; cleared after 2 s |
| `$route` | Signal updates on popstate; `params` matches `MatchResult.params` from `packages/router/src/router.ts:24` |
| `<$router>` | Renders matched route on mount; updates on popstate; 404 falls through to `<$shield>` |
| `<$link>` | Renders `<a>` with correct `href`; click triggers SPA navigation; `aria-current="page"` on active match; `prefetch="hover"` prefetches on mouseenter |
| `<$outlet>` | Renders matched route component in-place; updates on route change |
| `<$navigate>` | On mount: `history.pushState` (or `replaceState`) and router update triggered |
| `$beforeNavigate` | `next(false)` cancels navigation; `next('/x')` redirects; multiple guards run in declaration order |
| `$afterNavigate` | Receives `to` and `from`; runs after DOM updated for new route |

---

## §8 Coordination with arch-1..4

**arch-1 (`arch-1-website.md`):** `<$link>` replaces raw `<a>` tags in docs site navigation. `<$theme>` provides light/dark context for the docs site, replacing the current `$shared theme + $cookie` pattern in `theme-toggle.aihu`. A11y primitives ship in `AppLayout.aihu` at launch: `<$skipLink>` in the layout header, `<$liveRegion>` in the live demo feedback area. i18n primitives power a future `aihu.dev` localization effort.

**arch-2 (`arch-2-examples.md`):** One canonical example per dimension:
- Design: `color-theme` (EX-05) extended with `<$theme>` + `$container` demo.
- Styles: `color-theme` adds `$prefers(reduced-motion)` (addresses coverage gap in arch-2 §2 matrix).
- Data: `blog-loader` (EX-09) extended with `<$mutation>` in v1.2.
- Auth: `weather-card` (EX-06) extended with `$user` + `<$guard scope="authenticated">` post-RATIFY.
- i18n: New **EX-14 `i18n-demo`** — `<$locale>` provider, `<$translate>`, `$t`, `<$plural>`, locale switcher.
- a11y: New **EX-15 `a11y-kit`** — `<$focusTrap>` modal, `<$liveRegion>` status bar, `<$skipLink>`, `<$visuallyHidden>` icon labels.
- Routing: `blog-router` refactored to use `<$router>` + `<$link>` + `<$outlet>`.

**arch-3 (`arch-3-plugins.md`):** Plugin matrix in `arch-3-plugins.md:§1` gets one new row: `@aihu/i18n` (see §4). `@aihu/auth` M2 ship includes `$user` macro lowering and `<$signin>/<$signout>` components. `@aihu/router` ships routing primitives as plugin elements and macros.

**arch-4 (`arch-4-dx-tools.md`):** Language server M2 hover doc sourcing (`arch-4-dx-tools.md:§2.5`) must extend to plugin spec documents in addition to `spec-macro-vocabulary.md`. All 27 proposed primitives need hover docs and completion items. Virtual file generator (`arch-4-dx-tools.md:§2.3`) must produce correct virtual TSX types for new structural elements: `<$theme>`, `<$locale>`, `<$router>`, `<$link>`, `<$outlet>`, `<$liveRegion>`, `<$focusTrap>`. Each needs a type definition entry in the global component registry consumed by the virtual file generator.

---

## §9 Risk Register

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-A5-01 | ICU subset insufficient for complex real-world i18n (ordinals, gender, edge-case plural rules) | MEDIUM | User opt-in `icuParser` covers all cases. Document subset clearly. Expand based on actual demand signals. |
| R-A5-02 | `<$guard>` enforcement gated on live-binding RATIFY; security review timeline is open-ended | HIGH | All other primitives proceed independently. `<$guard>` fallback UI renders correctly regardless. Enforcement activates via single wiring change post-RATIFY — zero API changes, zero migration cost. |
| R-A5-03 | `$container` browser support gap in older embedded WebViews | LOW | `@container` is Baseline 2023. Aihu implies modern browser targets. Rules simply do not apply in unsupported browsers — graceful degradation. Document minimum browser matrix. |
| R-A5-04 | SSR locale hydration mismatch: server negotiates `en-US`, client browser prefers `es-ES` | MEDIUM | `@aihu/i18n` serializes the server-resolved locale in SSR payload (same `$shared` hydration pattern). Client reads serialized locale before rendering. Flash and hydration errors prevented at framework level. |
| R-A5-05 | RFC discipline at scale: 25 RFCs proposed in one spec; amendment process untested at this volume | MEDIUM | Only 8 require core vocabulary amendments. Plugin macros file against plugin specs. Batch core amendments per milestone to avoid sequential version bumps. |
| R-A5-06 | `$beforeNavigate` guard ordering ambiguous in pages with multiple guard-registering components | LOW | Guards run innermost-first, declaration order within each component. First `next(false)` wins. Document clearly. Complex guard chain semantics are a v1.2 design concern. |
| R-A5-07 | `<$announce>` singleton conflicts with user-placed `aria-live` regions | LOW | Singleton identified by `data-aihu-announce` attribute. Users who place their own live regions do not call `$announce`. No conflict. |
| R-A5-08 | `<$focusTrap>` misses custom elements or shadow DOM in focusable query | LOW | Document focusable query pattern. `initialFocus` prop is the escape hatch. Shadow DOM pierce is a v1.2 enhancement. |

---

## §10 Implementation Map

### Create

- `packages/i18n/` — `@aihu/i18n` plugin: locale runtime with `Intl.*` wrappers, ~2 kB ICU subset parser, `<$locale>/<$translate>/<$plural>/<$relativeTime>/<$dateTime>/<$number>` SFC components, `$t` macro lowering, `beforeCompile` catalog validation, `afterCompile` locale bundle emission, before-handler `Accept-Language` middleware.
- `packages/router/components/Router.aihu`, `Link.aihu`, `Outlet.aihu`, `Navigate.aihu` — SFC components contributed by `@aihu/router`.
- `packages/compiler/src/elements/a11y.ts` — Compiler lowering for `<$liveRegion>`, `<$focusTrap>`, `<$skipLink>`, `<$visuallyHidden>`, `<$announce>` as core elements.
- `packages/compiler/src/elements/theme.ts` — Compiler lowering for `<$theme>`.
- `packages/compiler/src/macros/style-extensions.ts` — `$container`, `$prefers` lowering; `$reactive` function-form amendment.
- `examples/i18n-demo/` (EX-14), `examples/a11y-kit/` (EX-15) — new canonical examples per arch-2.

### Modify

**`packages/arbor/src/types.ts:127`** — After live-binding RATIFY: evolve `AgentContext` from frozen sentinel to the full interface specified in `spec-live-binding.md:§4.2`. Unblocks `<$guard>` enforcement and `$scope`/`$rate-limit` enforcement.

**`packages/router/src/router.ts`** — Add `RouteContext` provide/inject token for reactive `MatchResult` signal. Add `createRouteSignal(router): Signal<MatchResult | null>`. `$route` macro lowering reads this signal.

**`packages/router/src/vite-plugin.ts`** — Add `<$router>` virtual component generation alongside existing routes virtual module.

**`packages/compiler/src/macros/style.ts`** — Add `$container` and `$prefers` macro lowering. Amend `$reactive` to accept function form.

**`docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md`** — After RFC ratification per batch, append entries for: `<$theme>` (§3), `$reactive(() => expr)` amendment (§4.1), `$container` (§4), `$prefers` (§4), `<$liveRegion>`, `<$focusTrap>`, `<$skipLink>`, `<$visuallyHidden>`, `<$announce>` (§3). Version bump required per batch of amendments.

**`docs/roadmap/arch-3-plugins.md`** — Add `@aihu/i18n` row to plugin matrix (§1). Update §6 RFC list to note RFC-A5-001 through RFC-A5-025.

**`docs/roadmap/SUMMARY.md`** — Add arch-5 reference in §3 cross-cutting priorities (M2 block: "SFC primitive extensions per arch-5").

**`packages/language-server/src/completions.ts`** and **`hover.ts`** (arch-4 coordinates) — Register hover docs and completion items for all 27 proposed primitives once RFCs ratify. Each new structural element needs a type definition in the global component registry consumed by the virtual file generator (`arch-4-dx-tools.md:§2.3`).

---

*Every primitive in this spec — from `<$skipLink>` for keyboard users to `$route` for navigation guards to `<$translate>` for global reach — expands what "for human purpose" means in practice. The agent surface is always in service of a human's intent. — Directive 0, `_user-directives.md:6`.*
