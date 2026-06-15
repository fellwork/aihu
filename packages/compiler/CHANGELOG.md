# @aihu/compiler

## 0.9.4

### Patch Changes

- [#360](https://github.com/fellwork/aihu/pull/360) [`63fd311`](https://github.com/fellwork/aihu/commit/63fd3119947cbf0405a371afe099075bcbcac289) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Close the remaining `.aihu.ts` sidecar `TS2304` gaps after 0.9.3. 0.9.3 put
  top-level `@state` consts in scope but three classes of template-referenceable
  name were still missing, so regenerated sidecars still failed `tsc`:

  - **Signal setters.** `const [view, setView] = signal()` declared the getter
    `view` but not `setView`; a handler like `$on.click={() => setSel(x)}` then
    `TS2304`'d on the setter. Setters (`resolve_signals` values) are now in scope.
  - **`$each` / `{#each}` loop aliases.** Loop vars (`sections() as s`,
    `s.books as b`, and crucially `chaptersOf(selBook()) as c` — an iterable with
    a nested call) were never declared. All `item`/`index` aliases from both the
    attribute and block forms are now collected from the template AST. The
    attribute-form `$each` list expression is also collected now (mirroring the
    block form), so an outer alias referenced only inside an inner each's iterable
    (`s` in `s.books as b`) still counts as referenced.
  - **`@state` imports used directly in the template.** Names brought in via
    `import { closeNav } from '…'` and read in the template (not re-bound to a
    local const) are now collected from the import statements.

  All names are emitted as `any` parameters of `__aihu_template` only when
  referenced by a template expression — so no unused parameters and no collision
  with DOM globals. Verified end-to-end: the real fellwork-web passage-picker
  sidecar (which exercises all three classes, including the nested-call each)
  now passes `tsc --noEmit --strict` with zero errors.

## 0.9.3

### Patch Changes

- [#358](https://github.com/fellwork/aihu/pull/358) [`08ba1a7`](https://github.com/fellwork/aihu/commit/08ba1a7a2fb5cba9f6ce1b4bfddf666264b45277) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix repo-wide `TS2304: Cannot find name` errors in generated `.aihu.ts`
  type-check sidecars. The sidecar emits `void (expr)` checks for every
  `@template` expression, but since [#129](https://github.com/fellwork/aihu/issues/129) (which stopped embedding the raw
  `@state` script to avoid `TS1128` macro-syntax noise) it declared only the
  framework globals — never the user's `@state` bindings. So any SFC whose
  template read a `@state` const (`{label()}`, `$on.click={toggle}`, …) produced
  a sidecar that failed `tsc`. The breakage was latent: it only surfaced when
  sidecars were regenerated against a current compiler (hit across consuming
  projects once that happened).

  The generator now declares each `@state` binding **referenced by the template**
  (signals, computeds, plain consts, and `$prop`/`$computed`/`$action`/`$resource`
  collection names) as a parameter of `__aihu_template`, typed `any`. Parameters
  rather than module-scope `declare const` so a binding that shadows a DOM global
  (`open`, `close`, `name`, `status`, `location`, …) doesn't collide with
  `lib.dom` (`TS2451`); only referenced names are emitted, so there are no unused
  parameters. Precise per-binding typing remains a watched follow-up — `any` is
  enough to resolve the reference while genuine template-shape errors still
  surface. Verified end-to-end: a regenerated sidecar now passes
  `tsc --noEmit --strict` with zero errors.

## 0.9.2

### Patch Changes

- [#356](https://github.com/fellwork/aihu/pull/356) [`fba3f04`](https://github.com/fellwork/aihu/commit/fba3f04eb986fa0540c1424296b81d75556794ad) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `<$link href={expr}>` non-reactivity. A dynamic href was evaluated once at
  the `createLinkBoundary` call site and baked into the rendered `<a>`, so a link
  whose href derived from a signal (e.g. `href={readHref()}` over a selection)
  never updated — Read/Study links stayed pointed at the whole chapter regardless
  of the verse selection, even though the label and highlight updated reactively.

  The compiler now passes a dynamic href as a thunk (`() => (expr)`) instead of
  its evaluated value, and `createLinkBoundary` binds a function href via the
  reactive thunk-array attribute form (`href: [() => href()]`) — the same shape a
  plain `<a $href={…}>` produces — while reading the live value for SPA
  navigation and `aria-current`. Static hrefs (`href="/x"`) stay plain quoted
  strings, so they pay no per-link effect. Bare getter reads inside the href
  expression are rewritten to calls (consistent with the FEL-172 fix), so
  `href={study.url}` reads the value, not the signal function.

## 0.9.1

### Patch Changes

- [#353](https://github.com/fellwork/aihu/pull/353) [`4306589`](https://github.com/fellwork/aihu/commit/4306589e75aab21d7f6ebc323abc3209091312ce) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix the June 2026 fellwork-web bug-ledger family — five compiler bugs around
  reactive lowering and template-expression handling:

  - **Getter-call interpolations are now reactive (FEL-228).** `{selBookLabel()}`
    as a sole text child lowered to an eager `leaf(expr)` — a static text node
    evaluated once that never re-rendered on signal change. It now lowers to the
    reactive thunk-leaf shape `leaf([() => (expr), () => {}])`. Loop-var
    projections (`{item.title}`) and plain consts stay eager (no per-row effect).
  - **Structural directives on macro elements emit their helper definitions
    (FEL-230).** `<$link $each="…">` emitted the `createEachBoundary(...)` call
    site without its inlined definition → `ReferenceError` at mount (blank page).
    The helper collector now scans macro-element attributes the same way it scans
    plain elements.
  - **Multiple effect directives on one element compose (FEL-238).** An element
    carrying `$each` plus a second effect directive (`$show` / `$class:` / `$if` /
    `$html` / `$ref`) silently dropped all but the first — `$each` was always the
    one dropped, so the element rendered exactly once with its loop alias
    dangling and descendant `$on` handlers captured an undefined loop variable.
    Directives now nest into a single wrapper with `$each` outermost.
  - **Bare getter reads in template expressions are rewritten to calls
    (FEL-172, FEL-173).** Props and signals compile to getter functions, but
    `$if` / `$each` / `$on.*` / attr-binding / complex-interpolation expressions
    were emitted verbatim into thunks: `$if={section.kind === 'prose'}` read
    `.kind` off the signal function → always `undefined` → the branch silently
    never rendered. A conservative token-based rewrite now turns bare reads of
    registered getters into calls across all template expression contexts
    (member accesses, existing calls, object keys/shorthand, string literals,
    and arrow-param shadows are skipped — existing `section().data` workarounds
    keep compiling, un-double-called). Interpolations are rewritten before the
    has-call check, so `{count + 1}` now takes the reactive thunk-leaf path.
  - **The cross-block checker no longer flags `$each` loop aliases (FEL-184).**
    `$each="chaptersOf(b) as c"` produced `warning: '@template' references 'c'
which is not declared in '@state'` for every aliased interpolation — and the
    planned v0.4 promotion of that warning to a hard error would have broken
    valid builds. Aliases from both the attribute and `{#each}` block forms are
    now registered before validating; genuinely undeclared refs still warn.

## 0.9.0

### Minor Changes

- [#348](https://github.com/fellwork/aihu/pull/348) [`dbc0903`](https://github.com/fellwork/aihu/commit/dbc09031f22ee93d9e5c9a46fea2ca2409463e90) Thanks [@srmcguirt](https://github.com/srmcguirt)! - §9.4 recipe class-extension + per-file shadow mode. Two new `@state` macros:
  `$extends: Identifier` threads `base: <Ident>` into the emitted
  `defineComponent({ base, ... })` so the registered element extends a primitive
  base class (malformed → C470), and `$shadow: 'open' | 'closed' | 'none'` emits
  a leading `// @aihu:shadow <mode>` marker (malformed → C471). The Vite plugin
  reads the marker to override its global `shadowMode` per file — driving both
  shadow attachment and the css-engine light-DOM fold — redirects the authored
  `@style` sheet to `document.adoptedStyleSheets` under light DOM
  (`_globalizeAuthoredStyle`), and force-routes base-extending components past
  the static-island path (the shim cannot extend a base).

## 0.8.1

### Patch Changes

- [#344](https://github.com/fellwork/aihu/pull/344) [`e2ba914`](https://github.com/fellwork/aihu/commit/e2ba9143f410196f84501f9386aa69b0729d158f) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Template parser: support HTML comments (`<!-- … -->`). Comments are parsed and dropped — authoring annotations only, never emitted to the compiled output. An unclosed comment is a compile error.

## 0.8.0

### Minor Changes

- [#339](https://github.com/fellwork/aihu/pull/339) [`fb436ac`](https://github.com/fellwork/aihu/commit/fb436ac2a1ecb6f9d570ccc05beeeab666c3ad6d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Full per-route metadata (`head`/`middleware`/`params`/`ssr`) now reaches
  `virtual:aihu-routes` in a normal SPA build. Previously only `name`+`layout`
  survived (via an `@route` source regex): the compiler compiles `.aihu` via
  stdin and writes no `.route.json` sidecar, and `genR` runs before pages are
  lazily transformed — so nested metadata like per-route `<head>` SEO tags were
  silently dropped unless the app was prerendered/SSG'd.

  - **@aihu/compiler** — new `--route-json` binary flag (prints the computed
    route sidecar to stdout) and a `compileRouteMeta(source, id)` export that
    wraps it (mirrors `compileToAst`).
  - **@aihu/router** — `genR` accepts a `compileRouteMeta` option and uses it to
    recover full `@route` metadata for `.aihu` pages (precedence: disk sidecar →
    `compileRouteMeta` → `name`+`layout` regex fallback when no compiler is
    wired, so standalone `viteRouterIntegration` still works).
  - **@aihu/app** — wires the compiler's `compileRouteMeta` into the router
    integration, so SPA apps get per-route `<head>` without prerendering.

### Patch Changes

- [#341](https://github.com/fellwork/aihu/pull/341) [`fc5fa49`](https://github.com/fellwork/aihu/commit/fc5fa49688ee8aca8ad5de0a513dca1e648a00f3) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix two `.aihu` codegen bugs surfaced by layouts + `<$link>`:

  - **`<$link>` inside `$each`/`$if` threw `onMount: no owner`.** `createLinkBoundary`
    wired its click handler via `addEventListener` inside `onMount`, which needs the
    component-setup owner — absent in an each/if item factory — so a looped
    `<$link>` crashed the whole component. Click is now an owner-agnostic arbor
    `onClick` attr (and composes any author `$on.click`); the prefetch/aria-current
    `onMount` is guarded so looped links degrade gracefully (still navigate) instead
    of throwing.
  - **Complex attribute bindings compiled eager (non-reactive).** `$class={fn() ? a : b}`
    (e.g. reading an imported/provided reactive getter the compiler can't see in
    `@state`) was emitted as a one-shot value and never re-ran — freezing layout
    toggles. Complex binding expressions are now thunk-wrapped like `$if`/`$show`;
    bare non-reactive identifiers and static literals stay eager.

## 0.7.1

### Patch Changes

- [#338](https://github.com/fellwork/aihu/pull/338) [`62e2f97`](https://github.com/fellwork/aihu/commit/62e2f9738870e8c28af6221d65f674b259510478) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `<$link>` dropping everything except `href`. The `<$link>` codegen path
  forwarded only `href`/`prefetch`/`replace` and never ran the generic
  attribute/directive lowering, so:

  - `class`, `$class`, `id`, `aria-*`, and `$on.click` were silently dropped from
    the rendered `<a>` — and because a handler's only references lived in the
    dropped `$on.click`, the "unused" import then got pruned;
  - structural directives (`$each`, `$if`, `$key`) on a `<$link>` were dropped
    entirely — `$each` left a dangling loop variable (`ReferenceError: b is not
defined`).

  `<$link>` now forwards the author's attributes onto the `<a>` and composes
  structural directives like a plain element. Its click handler also guards on
  `useRouter()`: with no reactive `<$router>` context (e.g. a `createApp` SPA) it
  no longer hard-`location.assign`s — it defers to `@aihu/app`'s document-level
  link delegation, so in-layout `<$link>` navigation stays client-side.

## 0.7.0

### Minor Changes

- [#334](https://github.com/fellwork/aihu/pull/334) [`eaadd45`](https://github.com/fellwork/aihu/commit/eaadd459118055e422e4ae025ceaa72be39ee17c) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Runtime layout rendering + dynamic layout switching.

  A page's `@route { layout: "<name>" }` now actually renders that layout around
  the page at runtime. Previously the layout metadata was emitted by the compiler
  and scanned by the router, but nothing rendered the layout — pages mounted
  straight into the root outlet.

  These three packages MUST ship in lockstep — the compiler emits what the router
  generates and `@aihu/app` consumes:

  - **@aihu/compiler** — layout SFCs (under the layouts dir) compile in layout
    mode: registered under a valid `aihu-layout-<name>` custom-element tag, with a
    passive `data-aihu-outlet` marker instead of the reactive route-driven
    boundary (which the imperative client renderer would otherwise fight).
  - **@aihu/router** — `virtual:aihu-layouts` now yields runtime
    `{ tag, load }` entries (a dynamic-import loader + the registered tag) instead
    of bare path strings; new `layoutTagFor()` shares the tag convention with the
    compiler. `genR` also recovers `layout` directly from the `@route` block so it
    flows through a normal (sidecar-less) Vite build.
  - **@aihu/app** — `createApp()` reads the matched route's `layout`, loads it,
    and mounts the page into the layout's outlet marker (falling back to the root
    outlet when there is no layout). It now returns an `AppHandle` with
    `setLayout(name | null)` to switch the current route's layout without
    navigating (resets on navigation) — wireable to a UI toggle or an `@agent`
    action.

  Scope: a single layout per route, client-side rendering. Nested layouts and
  SSR/prerender layout parity are follow-ups.

  See `examples/layouts` for a working demo (layouts by navigation + a
  dynamic-switch toolbar).

## 0.6.0

### Minor Changes

- [#320](https://github.com/fellwork/aihu/pull/320) [`a54ca1b`](https://github.com/fellwork/aihu/commit/a54ca1b8874583a0301e84c91f2d25713908e41f) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add @aihu/agent-server: a server-mediated capability bridge for live agent dispatch. The compiler emits a narrow opaque-ID client dispatcher (not the raw `__agentBinding`); the browser mounts the real visible component and registers it; the server holds all policy (auth/scope/rate-limit via @aihu/agent-service) and forwards only approved invocations to the browser over a WebSocket bridge. The opaque-ID dispatcher exposes no policy, so the server-side gate is the sole enforcement point.

  - New package `@aihu/agent-server` — `createAgentServer`, `createComponentMcpServer`/`serveComponentMcp` (lazy MCP SDK), `createBridgeClient` (browser), opaque-ID helpers, and the bridge protocol types + `BRIDGE_PROTOCOL_VERSION`.
  - `@aihu/agent-service` — drive a server-mounted component over the bridge.
  - `@aihu/compiler` — emit the client-safe opaque-ID agent dispatcher.

  Follow-up hardening (WS auth/origin checks, server→client invocation signing) is deferred per the go-public eng review.

- [#327](https://github.com/fellwork/aihu/pull/327) [`1132357`](https://github.com/fellwork/aihu/commit/113235708bac1e8f9263d35feb865af8f8127f86) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix server/universal `@agent` builds: lower `@state` macros and enable headless dispatch.

  Previously the server/universal path (`emit_options_form`) did **not** run `process_state_body`, so `$prop`/`$action`/`$computed` were emitted as raw JS labeled statements and the module-scope `__agentBinding` referenced undeclared symbols — any real compiled `@agent` component was undrivable server-side (only the browser capability-bridge path worked).

  `@agent` SFC emission is now unified on the function form (which already lowers macros and handles props/magna/`$auth`/form/aria), and `emit_options_form` is removed. For the server, the compiler injects an in-setup `_registerAgentServerBinding(ctx.element, …)` (new in `@aihu/runtime`, mirroring the client's `_registerAgentDispatcher`) that registers a full per-instance `LiveBinding` — with the live setup-scope reads/writes/actions plus `scope`/`rateLimit` — into arbor's `componentInstanceRegistry`. So `@aihu/agent-service`'s gate (`getRegistry`) can drive a real compiled component **headless** (no browser bridge).

  The compiler emits `import { …, _registerAgentServerBinding } from '@aihu/runtime'`, so these publish in lockstep. The client/bridge path (`_registerAgentDispatcher`, opaque-ID dispatcher, client-elided raw `__agentBinding`) and the `batch`-returns-value / `$prop` `.set(v)` fixes are preserved. Proven by `packages/agent-server/tests/headless-compiled-dispatch.test.ts`, which compiles a real SFC `--target server` and drives it.

### Patch Changes

- [#326](https://github.com/fellwork/aihu/pull/326) [`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix agent-driven `$action`/`$prop` lowering on the capability-bridge (client) path:

  - `batch(fn)` now returns its callback's value (was typed and implemented as `void`). The compiler lowers a `$action` handler to `return batch(() => { … })`, so an agent driving the action now receives the handler's return value instead of `undefined`. Callers that batch purely for side effects are unaffected.
  - The compiler emits writable-`$prop` write invokers as `(v) => name.set(v)` (the prop signal's setter) instead of `(v) => { name = v }`, which reassigned the `const` prop binding — a `TypeError` that also never reached the signal. Applied across the server `__agentBinding`, the client `__agentDispatcher` export, and the in-setup `_registerAgentDispatcher`.

  Net: over the capability bridge an agent can now read computed/prop state, drive actions and receive their return values, and write props — no `serialize()`-snapshot workaround. (A separate, deeper gap — `@state` macros not lowered at all in the server/universal build, breaking headless `__agentBinding` dispatch — is tracked in TODOS.md.)

- [#328](https://github.com/fellwork/aihu/pull/328) [`7ec7155`](https://github.com/fellwork/aihu/commit/7ec71553722eaa4e3f6814e79ec747db68b72451) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix plain `$resource`: emit the `createResource` import + add the runtime primitive.

  The compiler lowered a plain (non-magna) `$resource` entry to `const x = createResource(() => …)` but never emitted the import — the `needs_create_resource` flag was set yet never pushed to the `@aihu/runtime` import list — so any `$resource` produced a bare `ReferenceError: createResource is not defined`. And `@aihu/runtime` had no `createResource` to import (it was meant to live there parallel to `createStream`; only a magna-internal copy in `@aihu-plugin/data` existed).

  - **`@aihu/runtime`**: add `createResource(factory)` next to `createStream` — a reactive async resource with `loading` / `data` / `error` getters + `refetch()`, with a sequence guard so a superseded run never clobbers fresher data. Exported from the barrel.
  - **`@aihu/compiler`**: push `createResource` into the `@aihu/runtime` import when a plain `$resource` is used (`emit.rs`), mirroring `createStream`.

  The compiler emits the runtime import, so these publish in lockstep. Magna-backed `$resource` (`createMagnaResource` from `@aihu/magna`) is unaffected.

## 0.5.4

### Patch Changes

- [#258](https://github.com/fellwork/aihu/pull/258) [`74273e0`](https://github.com/fellwork/aihu/commit/74273e0a015805f3c878c9b2c7890ed0c80a23fd) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix Bug 6: utility CSS from `@aihu/css-engine` now lands in the bundled `dist/assets/*.css` asset when `viteAihuPlugin({ css: { shadowMode: 'none' } })` is set, so utility classes like `.flex`, `.gap-6`, `.text-lg` actually take effect in the document cascade.

  - `@aihu/compiler`: `aihuCompilerPlugin` now branches on `shadowMode === 'none'` and routes utility CSS through Vite's CSS pipeline via a `virtual:aihu-utility/<hash>.css` virtual import (resolved by the plugin's new `resolveId` + `load` hooks). The `'open' | 'closed'` shadow paths still fold into `host.adoptedStyleSheets` as before — only the no-shadow case changes. Also makes the compiler-binary path resolution lazy (call-time) so the `SCRIBE_COMPILE_BIN` handshake with `@aihu/css-engine`'s bundled `compileToAst` actually fires.
  - `@aihu/css-engine`: rebuild against the deferred compiler-bin resolver so `compileSfc()` no longer ENOENTs against the missing `packages/css-engine/bin/aihu-compile` on the first call (the SCRIBE_COMPILE_BIN env var is now read at every call, not captured at module load).

- Updated dependencies [[`74273e0`](https://github.com/fellwork/aihu/commit/74273e0a015805f3c878c9b2c7890ed0c80a23fd), [`c6860e0`](https://github.com/fellwork/aihu/commit/c6860e022a374b3c5e35aaf8775cbb6332b1b75d), [`5f21125`](https://github.com/fellwork/aihu/commit/5f211252c7500973c6976ca48f29b09ea8aa049b)]:
  - @aihu/css-engine@0.2.5

## 0.5.3

### Patch Changes

- [#253](https://github.com/fellwork/aihu/pull/253) [`d42793b`](https://github.com/fellwork/aihu/commit/d42793b8258d723ae7c80179dcc82e2db8d0afc4) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Forward `shadowMode` through `viteAihuPlugin` for utility-class CSS frameworks.

  - **`@aihu/app`** — new `css.shadowMode` option on `AihuConfig`. When set, it
    forwards to the compiler's per-plugin `shadowMode` injection
    (`'open' | 'closed' | 'none'`). Required for consumers of
    `@aihu/css-engine` (and other cascade-dependent CSS frameworks) so the
    utility classes the compiler folds in are not trapped inside a shadow root.
    Default behaviour is unchanged.
  - **`@aihu/compiler`** — `_maybeCompileUtilityCss` now emits a one-shot
    `console.warn` when `@aihu/css-engine` resolves but `compileSfc()` throws
    (typically: the native `aihu-css-core` binary is unresolvable). Build is
    still non-fatal; previously this case was completely silent and users
    could not discover why their utility classes never emitted.
  - **`@aihu/css-engine`** — README now documents the canonical
    `viteAihuPlugin({ css: { shadowMode: 'none' } })` wiring and points to the
    new `examples/css-engine-utility/` end-to-end example.

- [#254](https://github.com/fellwork/aihu/pull/254) [`52a7ee6`](https://github.com/fellwork/aihu/commit/52a7ee600c1f94ac741c01d6d9c0a4a203fc0ef3) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Preserve same-line significant whitespace between a text node and an inline
  element sibling in `@template { ... }` blocks.

  Previously, `emit_node` for `TemplateNode::Text` called `s.trim()`
  unconditionally, deleting the single space required by HTML/JSX rules between
  a text run and an adjacent inline tag. Templates like
  `<p>foo <code>bar</code> baz</p>` compiled to
  `leaf('foo'), branch('code',…), leaf('baz')` — losing both spaces and
  running the text together at render time.

  Now leading/trailing whitespace on the same line as content is preserved as a
  single space (per JSX semantics). Multi-line surrounding whitespace
  (template indentation/newlines) is still stripped as before. Internal
  whitespace runs are still collapsed to a single space.

- Updated dependencies [[`d42793b`](https://github.com/fellwork/aihu/commit/d42793b8258d723ae7c80179dcc82e2db8d0afc4)]:
  - @aihu/css-engine@0.2.4

## 0.5.2

### Patch Changes

- [#249](https://github.com/fellwork/aihu/pull/249) [`6ed33f8`](https://github.com/fellwork/aihu/commit/6ed33f80bfdf193382e9fb1d192c0c1d4e6ef069) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Tighten `validate_macro_quoted_value` to enforce its documented contract: identifier-start (`[A-Za-z_$]`) followed by `[A-Za-z0-9_$.]`, with no `..` or trailing `.`. Previously the validator rejected only whitespace, brackets, parens, and `?`, quietly allowing `!`, `&`, `|`, comparison and arithmetic operators, leading digits, and dotted-path malformations. Codegen wrapped those non-simple-identifier values in `[() => (…)]`; when the expression referenced a signal getter (e.g. `!loading`), the thunk read the getter as a function value — always truthy — instead of calling it (silent wrong-result). C302 error now carries a structured migration target pointing at the curly form (`$<name>={expr}`).

- [#249](https://github.com/fellwork/aihu/pull/249) [`6ed33f8`](https://github.com/fellwork/aihu/commit/6ed33f80bfdf193382e9fb1d192c0c1d4e6ef069) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Reject unreserved `$<name>="quoted"` template attributes at parse time with a hard C500 error (Risk-7 closure from spec-template-syntax-v2 §"Codegen hardening — silent-drop fix"). Previously these silently fell through codegen's `emit_macro_effects` default arm — the attribute was dropped and the layout/component rendered without the intended prop. Error now points authors at the curly form (`$<name>={expr}`), which routes to `Attr::Binding` via Amendment 04 and emits as a real prop on a component.

- Updated dependencies []:
  - @aihu/css-engine@0.2.3

## 0.5.1

### Patch Changes

- [#231](https://github.com/fellwork/aihu/pull/231) [`e31df0b`](https://github.com/fellwork/aihu/commit/e31df0bbf43cca38d55528bf31d00088897e5579) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Stop shipping a host-arch `aihu-compile` binary inside the npm tarball, and
  arch-validate any pre-existing binary before short-circuiting postinstall.

  Two independent bugs colluded in `@aihu/compiler@0.5.0`: the `files` array in
  `package.json` included `"bin"`, so whatever `bin/aihu-compile` the publisher's
  machine had on disk (a Linux x86-64 ELF on the publishing host) got packed into
  the tarball. Postinstall's idempotency check then saw `bin/aihu-compile` already
  present and skipped the GitHub Releases download — without ever validating that
  the on-disk binary matched the host arch. macOS arm64 consumers ran the Linux
  ELF and got `spawnSync ... Unknown system error -8` (ENOEXEC) on every `.aihu`
  file in their Vite dev server.

  Fixes:

  - `"bin"` removed from `files`. The tarball ships no binary; postinstall always
    populates `bin/aihu-compile<ext>` (the directory is created on demand).
  - Postinstall now reads the first 20 bytes of any existing `bin/aihu-compile`
    or `target/release/aihu-compile`, identifies the file format (ELF / Mach-O /
    Mach-O FAT / PE) and arch (where cheaply available), and rejects mismatches —
    deleting `bin/aihu-compile` and falling through to the download path. Unknown
    formats (e.g. shell wrappers) are accepted to preserve exotic dev setups.

- Updated dependencies []:
  - @aihu/css-engine@0.2.2

## 0.5.0

### Minor Changes

- [#222](https://github.com/fellwork/aihu/pull/222) [`574af6d`](https://github.com/fellwork/aihu/commit/574af6d4214889e9b3f7c407a42aa2e53252fddc) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Wire `@aihu/css-engine` into the `.aihu` SFC compile so utility classes
  actually scope and emit. Previously `compileSfc()` existed but nothing in the
  build called it, so Tailwind-style utility classes written in `@template` (e.g.
  `<div class="flex gap-2 p-4">`) compiled to nothing. `aihuCompilerPlugin`'s
  `.aihu` transform now folds the scoped utility CSS into each component's shadow
  `<style>`.

  css-engine is wired in via a GUARDED, LAZY `await import('@aihu/css-engine')`
  and declared an OPTIONAL `peerDependency` (`peerDependenciesMeta.optional`).
  This avoids a dependency cycle: css-engine already depends on `@aihu/compiler`
  (for the SFC AST), so the compiler must not hard-depend on css-engine. When
  css-engine is present the hook compiles the SFC's utilities to scoped CSS
  (`:host` theme tokens + utility rules + the folded authored `@style` block) and
  adopts it as the component's single shadow stylesheet; when css-engine is
  absent the dynamic import throws, the hook no-ops, and the build still succeeds
  (utility classes simply don't emit — the prior behaviour). The authored
  `@style` block continues to emit exactly once in both paths.

- [#217](https://github.com/fellwork/aihu/pull/217) [`55298d5`](https://github.com/fellwork/aihu/commit/55298d51f9c6a3723a441d18a71b458e9f2cd035) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add optional per-route `head:` metadata to the `@route` SFC block and emit it
  into the `.route.json` sidecar (B1, foundation of the per-route-`<head>` SEO
  arc). The `@route` block gains an optional `head` key carrying `title`,
  `description`, `canonical`, nested `og` (`title`/`description`/`image`/`type`/
  `url`) and `twitter` (`card`/`title`/`description`/`image`/`site`) objects, and
  a raw `jsonld` JSON-LD object. All fields are optional and the existing
  `@route` keys (`path`, `name`, `layout`, `ssr`, `middleware`) are unchanged —
  a route without a `head` key emits a sidecar with no `head` member, so the
  shape is fully backward-compatible.

  Both route parsers are updated: the production `sfc.rs::parse_route_body` path
  and the parallel `route.rs::parse_route` path share a single head
  implementation (a new string/comment-aware balanced-literal capture mode), so
  the two cannot drift. `og`/`twitter` are parsed into typed sub-objects;
  `jsonld` is captured VERBATIM as the balanced `{...}` literal and spliced into
  the sidecar as raw JSON rather than re-serialized. Adds a
  `03-route-with-head` conformance fixture and round-trip tests asserting the
  emitted sidecar is valid JSON.

### Patch Changes

- Updated dependencies [[`a866af7`](https://github.com/fellwork/aihu/commit/a866af78d41931e28c5b19084342e566ca47bdee), [`45b393c`](https://github.com/fellwork/aihu/commit/45b393c3f48758bf82c152bbe6088c63edaa68a6)]:
  - @aihu/css-engine@0.2.0

## 0.4.1

### Patch Changes

- [#205](https://github.com/fellwork/aihu/pull/205) [`55ce81c`](https://github.com/fellwork/aihu/commit/55ce81ca9ff6e63b0ba7d9eb878f175704096140) Thanks [@srmcguirt](https://github.com/srmcguirt)! - render hint/fix/codeframe in human diagnostics

  The `aihu-compile` binary already computed rich `CompileError` data (`hint`, `fix`, `from`, `to`) but the human (non-`--machine-errors`) stderr emitted a single `file:LINE: message` line and discarded the rest. AIs and humans reading the dev overlay / build log got a bare message with no source context or remedy.

  `bin/main.rs` now renders, when present: the message header, a **codeframe** (the offending source line with a caret underline), a `hint:` line (why it's wrong), a `fix:` line (the remedy), and the machine `replace:`/`with:` rewrite. The codeframe anchors on the unique `from` literal in the source where one exists — so it points at the _real_ offending line even for codes whose internal `line` is template-block-relative (e.g. C305's `@click=`) — and degrades to message + hint + fix where no trustworthy position exists (the ~142 `line:0` sites are left for a later pass per scope).

  High-traffic codes upgraded with `hint`/`fix` (and, for the migration codes, `from`/`to` so the LSP can offer code actions): C204, C205, C304, C305, C306, W210. The `--machine-errors` JSON _shape_ (`{code, message, from, to, range}`) is unchanged; only previously-`null` `from`/`to` values for C304/C305/C306 are now populated with their correct rewrite text (the LSP types these `string | null` and consumes them for code actions).

## 0.4.0

### Minor Changes

- [#184](https://github.com/fellwork/aihu/pull/184) [`173705b`](https://github.com/fellwork/aihu/commit/173705bde39bdd5b79b7e3665bb91719e0a74e63) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the AST-export hook (`v1.0.10a`) — a purely-additive public API that
  serializes the parsed `.aihu` SFC AST.

  New surface:

  - **Rust:** `compile_to_ast(source, file_path) -> Result<SfcAstOwned, CompileError>`
    in a new `src/ast_export.rs`, plus the owned `Serialize` mirror types
    (`SfcAstOwned`, `SfcNodeOwned`, `SfcAttrOwned`, `SfcMacroValueOwned`,
    `SfcStyleBlockOwned`, …). Uses an owned mirror struct (not a serde-borrow on
    the internal AST) so the v1.0 wire shape stays decoupled from the parser
    representation.
  - **CLI:** a new `--ast-json` flag on `aihu-compile` that runs parse →
    `compile_to_ast` → emits the AST as JSON to stdout and short-circuits before
    codegen. Existing flags/behavior are untouched.
  - **TS:** `compileToAst(source, id?): SfcAst` plus the `SfcAst` type family,
    exported from the package entry. Thin wrapper over `aihu-compile --ast-json`.

  This is the contract the CSS engine's AST scanner (`css-2-ast-scanner`)
  consumes — it freezes the three `Attr` class-forms (Static / Binding / Macro)
  as part of the v1.0 stability contract.

  Adds `serde_json` to the crate's dependencies (used by the binary to serialize
  the AST). No grammar, parser, or existing-function behavior changed — additive
  only. Per the round-7 lesson, any `packages/compiler/src/**` change ships with
  a changeset so the npm-published binary stays in sync with the source.

### Patch Changes

- [#196](https://github.com/fellwork/aihu/pull/196) [`faca280`](https://github.com/fellwork/aihu/commit/faca2804cf62c05ffc90ef867faa2058b5e267ad) Thanks [@srmcguirt](https://github.com/srmcguirt)! - 0.3.0 migration diagnostics fixes (downstream-reported, lehman-realty):

  - **C204** — error on an unknown top-level SFC block (e.g. a removed
    `@props { }` block) instead of silently dropping it, which previously turned
    an authoring mistake into a blank production page. (Bug 5)
  - **Cross-block reference diagnostic** now recognizes `$prop:` keys,
    `$computed:` keys, and plain `@state` `const`/`let` bindings as declared, and
    scans v1 single-curly `{ }` interpolations (not only legacy `{{ }}`) — no more
    false positives on correctly-migrated code (which would otherwise become a
    v0.4 hard error). (Bug 7)
  - **C205** — error when a plain `@state` `const` reads a prop (a temporal
    dead-zone trap), directing authors to read props in `$computed`. (Bug 8)
  - **W210** — warn on `$on.<non-event>` (e.g. `$on.html`) dead attributes, and
    make `C305` point at `$html={…}` for innerHTML intent. (Bug 9a/9b)

## 0.3.0

### Minor Changes

- [#178](https://github.com/fellwork/aihu/pull/178) [`1e8f8bd`](https://github.com/fellwork/aihu/commit/1e8f8bd580744f9da3daae01336f12585edf9ccb) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Republish the compiler with v1.0.7 + v1.0.8 grammar work.

  The v1.0.7 (dual-grammar deprecation removal, C107) and v1.0.8 (Amendment 04 —
  `$attr={expr}` canonical, C304/C305/C306 rejections, Attr::Binding routing for
  arbitrary attribute names) parser work was merged via PRs [#168](https://github.com/fellwork/aihu/issues/168) and [#170](https://github.com/fellwork/aihu/issues/170) earlier
  this session but no changeset ever targeted `@aihu/compiler` — so the package
  stayed at 0.2.0 on npm. Downstream consumers installing `@aihu/compiler@latest`
  got the pre-v1.0.7 binary that silently drops `$<arbitrary-attr>={expr}` bindings.

  This bump triggers the republish so the new grammar (parser + emit path) reaches
  consumers. No source changes — the code is already on main; only the version
  bump is needed.

## 0.1.9

### Patch Changes

- [#121](https://github.com/fellwork/aihu/pull/121) [`6319de1`](https://github.com/fellwork/aihu/commit/6319de1c2b23cfb82b02d19edc2bb760cae864b7) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `$each="items as item"` against an explicit signal now passes the signal
  tuple `[items, setItems]` to arbor's `each()` (or `[items]` for computed
  signals) instead of the bare getter.

  **Why this matters:** arbor's `each()` expects a `Signal<T[]>` shape and
  reads `items[0]()` inside the reconciler. Passing the bare getter function
  made `items[0]` an undefined string-indexed access on a function value, then
  `(items[0])()` threw `TypeError: t[0] is not a function` on every render
  of a non-empty list — same shape as the R5c $if fix.

  Same per-source dedup concern as before: arbor's published bundle minifies
  internal property names (`structuralKind` → `sk`, etc.), so the compiler
  delegates to arbor's exported `each()` rather than synthesizing the
  structural node literal. The fix only changes the call-site argument to
  match arbor's `Signal<T[]>` contract.

  Surfaced by mail dogfooding: inbox crashed with `t[0] is not a function`
  the moment a real mail row was returned (empty arrays didn't trip it
  because the iterator never enters the body).

## 0.1.8

### Patch Changes

- [#118](https://github.com/fellwork/aihu/pull/118) [`a241966`](https://github.com/fellwork/aihu/commit/a241966d55b41057b7aa23d17f396419c8afe517) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Template-side reactivity for **explicit-signal** state references in
  attribute bindings, `$if` conditions, and `$effect.on(...)` deps.

  Previously, every attribute and `$if` cond went through a generic
  `[() => (expr)]` thunk wrap. When `expr` was a simple identifier
  referencing an explicit signal getter (`const [loading, setLoading] =
signal(true)`), the thunk evaluated to the getter _function_
  (truthy/non-Signal-shaped), so:

  - `class={view === 'week' ? 'active' : ''}` worked but
    `class={loading}` produced `[() => loading]` ⇒ runtime received the
    getter function as a thunk result, not the tracked value.
  - `<div $if={loading}>` produced `[() => loading]` ⇒ `cond[0]()` returned
    the getter function (truthy), so the conditional was always true and
    never re-rendered when `loading` flipped.
  - `$effect.on(activeTab) { ... }` emitted `effect(() => { activeTab; ... })`
    where `activeTab;` read the getter function reference and never
    registered the effect as a subscriber.

  Fix:

  - `lower_attr_expr`: when the expression is a simple identifier matching
    a registered signal, emit the signal tuple directly (`[name, setter]`
    for `signal()` or `[name]` for `computed`). arbor's `_applyAttrs`
    takes its reactive Path 2 with a real getter at `value[0]`.
  - `$if` cond emission: same treatment — emit the signal tuple directly
    so `when()` receives a Signal-shaped argument and `cond[0]()` reads
    the tracked value.
  - `$effect.on(name)` and `$watch`: when `name` is a simple signal
    identifier, emit `effect(() => { name(); body })` instead of
    `effect(() => { name; body })` so the read tracks.
  - Also: `resolve_signals` now matches the TS-type-parameterized form
    `signal<T>(...)` (previously only `signal(...)` was recognized).

  Surfaced by mail dogfooding: `inbox.fellwork.com/inbox` showed
  `Loading…` indefinitely after a successful empty Supabase fetch.
  Plain `let`-state still relies on the open follow-up of
  class-property → signal lifting; this patch unblocks any page that
  opts into explicit `signal()` declarations today.

## 0.1.7

### Patch Changes

- [#115](https://github.com/fellwork/aihu/pull/115) [`d9d51a6`](https://github.com/fellwork/aihu/commit/d9d51a64bb46b6015e92037bc0554c248b0291c7) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `$if` and `$each` now import + delegate to arbor's exported `when()` and
  `each()` instead of synthesizing the structural node literal directly.

  **Why this matters:** the published `@aihu/arbor` bundle uses oxc-minify
  with property-name mangling (`structuralKind` → `sk`, `condition` → `cn`,
  `keyFn` → `kf`, `listGrow` → `lg`). The R5 first-pass fix synthesized the
  node literally with full property names; the bundled reconciler then read
  the mangled names off it, found `undefined`, and crashed with
  `TypeError: Cannot read properties of null (reading '0')` inside `gs`
  (the `_reconcileEach` shim) on first mount.

  **Fix:** the compiler now adds `when` to the `@aihu/arbor` import list
  when `$if` is present (and `each` when `$each` is present), and the
  inlined boundary helpers delegate: `createIfBoundary = (cond, grow) =>
when(cond, grow)`. Because `when()`/`each()` ship in the same minified
  bundle as the reconciler, the property names match by construction.

  **Surfaced by:** mail dogfooding immediately after the R5 first-pass
  ship — `/inbox` threw the gs/null crash on every load.

## 0.1.6

### Patch Changes

- [#113](https://github.com/fellwork/aihu/pull/113) [`0c2aa00`](https://github.com/fellwork/aihu/commit/0c2aa005967f7d04dcd0636186b499313eb51f12) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `$if` and `$each` template directives are now reactive — UI updates when the
  condition or list mutates after mount.

  Previously, `$if={loading}` compiled to `createIfBoundary(loading, () => ...)`
  where the helper was a plain ternary `cond ? b() : empty`. The condition
  was evaluated **once at component mount time** and snapshotted into the
  DOM tree. When state mutated later (`loading = false`), the UI never
  re-rendered. Same shape for `$each` against plain class-property arrays
  (authored signals via `signal()` already worked through arbor's `each()`).

  Fix:

  - Both inlined helpers now return arbor structural nodes
    (`{ kind: 'structural', structuralKind: 'conditional' | 'list', ... }`)
    whose `condition`/`list` field is a thunk array `[() => expr]`. The
    arbor reconciler sets up an effect that swaps / re-keys the rendered
    subtree whenever the tracked expression changes.
  - The compiler's emit pass for `$if` and the non-signal `$each` fallback
    now wraps the expression in `[() => (expr)]` to match the thunk-array
    shape arbor's `_reconcileWhen` / `_reconcileEach` expect.

  Surfaced by mail dogfooding: `inbox.fellwork.com/inbox` showed
  `Loading…` indefinitely after a successful Supabase fetch resolved with
  zero rows — the `loading=true` snapshot stayed visible because
  `$if={loading}` never re-evaluated.

  This is the matching template-directive fix to R2 Defect B (reactive
  attribute bindings). Together they make all template-side reactivity
  honor state mutations from action / lifecycle / effect bodies.

## 0.1.5

### Patch Changes

- [#111](https://github.com/fellwork/aihu/pull/111) [`c1fa2c7`](https://github.com/fellwork/aihu/commit/c1fa2c7a937bf7186a64dd15661a4f9fbd08ed18) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `$prop` collection-form now emits primitive-type-aware attribute reads.
  Previously, every `$prop: { name: { type: T } }` declaration unconditionally
  wrapped the attribute value in `JSON.parse(... ?? '{}')`. For string-typed
  props sourced from route parameters (router stamps `<el id="abc-123">`), the
  raw attribute value is not valid JSON, so the `try { JSON.parse } catch`
  fell through to `{}` — the prop bound to an empty object instead of the
  intended string. Subsequent reads (`$effect.on(id) { eq('id', id) }`) then
  queried with `[object Object]` instead of the route id.

  New emission per declared type:

  - `type: string` ⇒ `getAttribute(name) ?? ''`
  - `type: number` ⇒ `Number(getAttribute(name) ?? 0)`
  - `type: boolean` ⇒ attribute presence + non-`'false'`
  - complex types (objects, arrays, custom types) ⇒ existing `JSON.parse(...)`
    with `{}` fallback (unchanged)

  Surfaced by mail's `/contact/:id` and `/thread/:id` routes after the A4
  flat-per-attribute router protocol replaced the legacy JSON `route`
  attribute. Mail also migrated authoring from `$prop route: { params: ... }`
  to `$prop id: { type: string }` to match the new contract.

## 0.1.4

### Patch Changes

- [#109](https://github.com/fellwork/aihu/pull/109) [`82954a5`](https://github.com/fellwork/aihu/commit/82954a576a3f558133ee9cdb18df233c3b991972) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Round 2 SPA emit-correctness fixes — three layered defects surfaced by
  fellwork/mail dogfooding.

  - **Defect B (`@aihu/compiler` — runtime crash)**: template attribute bindings
    that reference any name declared in `@state` are now lowered to a
    single-element thunk array `[() => (expr)]`. Previously, an attribute like
    `<CalendarGrid events={events}>` where `events: any[] = []` emitted the raw
    array as the attribute value. arbor's `_applyAttrs` discriminates reactive
    bindings via `Array.isArray(value)`, so an empty-array state value was
    mis-detected as a Signal tuple and the runtime threw
    `TypeError: c is not a function` when it invoked `value[0]() as () =>
unknown`. The thunk-array form makes the discriminant explicit:
    `value[0]` is a getter, `mountEffect` reads the current value reactively.
    Static literals (`class="static"`), event handlers (`on*`), and locally
    declared `<script setup>` consts continue to pass through unwrapped.

  - **Defect A (`@aihu/compiler` — runtime crash)**: state declarations from
    `@state` blocks are now emitted _before_ the action / effect / lifecycle
    registration code in the setup body. `effect(...)`, `onMount(...)`, and
    `onCleanup(...)` synchronously invoke their callbacks once at registration
    time to track dependencies, so any reference to a state variable declared
    later hit the temporal dead zone and threw
    `ReferenceError: Cannot access 'n' before initialization`. Bare class-property
    declarations (`count: number = 0`) now lower to `let`, not `const`, so
    reassignments from action / lifecycle bodies (`count = count + 1`) don't
    throw `Assignment to constant variable`.

  - **Defect C (`@aihu/app` — stale published artifact)**: republish to ensure
    the round-1 `viteAihuPlugin({ islands: false })` plumbing actually ships in
    the consumed package. SPA route components are top-level mounts that should
    always go through `defineComponent`; the Round 1 fix made
    `viteAihuPlugin()` pass `islands: false` to `aihuCompilerPlugin()`, but the
    npm artifact for `@aihu/app@0.1.1` did not pick up the rebuilt `dist/`.
    Bumping the patch republishes with the corrected plumbing — login (and
    any route without `signal`/`computed`/`effect`/`onMount`/`onCleanup`) now
    emits a `defineElement(... defineComponent(...))` chunk shape instead of
    the static-island `customElements.define(...)` shim that strips the runtime.

## 0.1.3

### Patch Changes

- [`4dea3a4`](https://github.com/fellwork/aihu/commit/4dea3a4d98509742553dc654ef023cd6f8189edb) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `RuntimeError: SCR-R0010 'no owner'` when `.aihu` route components use
  `$lifecycle.mount` / `$lifecycle.dispose` (or any `onMount` / `onCleanup`
  call) without also using `signal()`. Two changes:

  - **`@aihu/compiler`**: `_classifyIsland` now treats `onMount(` and
    `onCleanup(` as interactive primitives. Previously only
    `signal/computed/effect/setSignal` flipped a module to interactive, so a
    page that only used lifecycle hooks was mis-classified as static — the
    static-island shim then stripped `defineComponent`, leaving the lifecycle
    call without an owner. The compiler also now lifts `import` statements
    from `@state` blocks to module scope (deduped against framework-emitted
    imports) so consumed identifiers actually resolve at runtime.
  - **`@aihu/app`**: `viteAihuPlugin()` now passes `{ islands: false }` to
    `aihuCompilerPlugin()`. SPA route components are top-level mounts that
    should always go through the full reactive pipeline; the static-island
    optimization is for MPA-style mixed-island layouts and saves ~0 B in an
    SPA where the runtime is already shared in the main bundle. Set
    `islands: true` on the compiler plugin directly if you genuinely need
    per-component static-island emission.
  - **`@aihu/app`**: `createApp()` accepts a `provide` config and hoists
    the values into `globalThis` before any component runs, so app-level
    singletons (db clients, auth helpers) resolve as bare identifiers in
    `@state` blocks without manual `window.*` wiring. Mirrored on
    `AihuConfig` for build-time documentation.
