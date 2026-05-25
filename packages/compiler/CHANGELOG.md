# @aihu/compiler

## 1.0.0

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
