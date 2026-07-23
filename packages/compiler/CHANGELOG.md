# @aihu/compiler

## 1.1.0

### Minor Changes

- [#526](https://github.com/fellwork/aihu/pull/526) [`68957ca`](https://github.com/fellwork/aihu/commit/68957caa33616b7eee7b05dc55ebd051e603a9fc) Thanks [@srmcguirt](https://github.com/srmcguirt)! - feat(compiler): auto-import @aihu/use composables

  When a `.aihu` `@state` block calls a bare `useMouse()` (or any known
  `@aihu/use` composable) without importing it, the compiler now injects the
  per-subpath `import { useMouse } from '@aihu/use/useMouse'` into the emitted JS
  (and an ambient declaration into the `.aihu.ts` sidecar for type-check
  coherence) — mirroring how it already provides the `@state` vocabulary, and
  preserving per-composable tree-shaking (granular specifier, never the barrel).

  Detection is guarded so it never fires for a name the author already imported
  (any source), declared, or shadowed (`const`/`let`/`var`/`function`/`class`/
  destructure) — one shared authority drives both the emit injection and the
  sidecar declaration, so they can never disagree. Comments and string/template
  literals are masked before scanning, so a name mentioned in a comment can't
  inject a spurious import. Registry lives in `codegen/use_registry.rs`, kept in
  sync with `packages/use/package.json` exports (grows with the composable set).

- [#510](https://github.com/fellwork/aihu/pull/510) [`aac7624`](https://github.com/fellwork/aihu/commit/aac762460619d060e9d1030c86b52231dcb88df3) Thanks [@srmcguirt](https://github.com/srmcguirt)! - In-process napi compile backend + single-parse envelope API.

  - New Rust `compile_envelope()` (envelope.rs): parse + validate + lower ONCE,
    emit per requested target (`client|server|universal`), and serialize every
    requested artifact (`js|ast|route|manifest`) into one JSON envelope. Exposed
    on the CLI as `--envelope <options-json>` — so even the spawn path gets
    single-parse, multi-output compiles.
  - New napi addon (`packages/compiler/src-native`, shipped as
    `@aihu/compiler-native-<platform>` optionalDependencies):
    `compileEnvelope(source, optionsJson) → envelopeJson`, one boundary crossing
    per file, eliminating the per-file process spawn on the build path.
  - `transform()` / `compileToAst()` / `compileRouteMeta()` now route
    memo → native addon → envelope CLI spawn → legacy per-output spawn, and one
    `transform()` seeds the memo entries for the AST and route artifacts from the
    SAME parse — css-engine's AST pass and the router's route scan become cache
    hits instead of re-parses. Output is byte-identical to the legacy spawn
    (differential-tested per target across representative fixtures).
  - Escape hatches: `AIHU_COMPILER_NATIVE=0` disables the addon;
    `AIHU_COMPILER_NATIVE_ADDON=<path>` pins one (fail-loud); an explicit
    `AIHU_COMPILE_BIN` binary pin keeps the spawn backend.

- [#518](https://github.com/fellwork/aihu/pull/518) [`d56a1f5`](https://github.com/fellwork/aihu/commit/d56a1f5569982d30e1924bd48b8cdda8d4ad4e82) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Island classification is now authoritative in the Rust codegen (wave 3c).

  The compiler decides whether a component is a **static** island (server-render
  only, zero client hydration) or an **interactive** island at emit time, from
  the IR — the same fact-set that already decides which owner-context primitives
  (`signal`/`computed`/`effect`/`onMount`/`onCleanup`) to import. It records the
  verdict three ways: a `// @aihu:island static|interactive` code marker,
  `EmitResult.island`, and the envelope's `TargetEmit.island`.

  This RETIRES the `_classifyIsland` JS post-pass, which re-derived the answer by
  regexing generated code for `signal(`/`effect(`/… — a Derived-property
  violation (the compiler already knew). The Vite plugin now reads the marker via
  `_parseIslandMarker`.

  The move also fixes a latent bug: a `$prop`-only component (options-form,
  no `signal(` call in its body) was mis-classified `static` by the old regex and
  routed through the static-island shim, which cannot lower
  `defineComponent({ props, setup })`. Reactive props are parent-driven inputs, so
  the compiler now classifies such a component **interactive** (conservative: only
  truly inert components are `static`).

  Static islands continue to ship the zero-runtime shim (no `@aihu/runtime`
  import, no `defineComponent` hydration walk); interactive components keep the
  full runtime path. Physically code-splitting a purely-static route so its chunk
  graph excludes `@aihu/runtime` + `@aihu/signals` (~5.9 kB gzip) remains a
  scoped follow-up in `@aihu/app`'s route bundling.

- [#514](https://github.com/fellwork/aihu/pull/514) [`061eefb`](https://github.com/fellwork/aihu/commit/061eefb3e94fdbbe9e6f5d5301db3bcdd3fa3b22) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Compile-time SSR string-template emit target (wave-3 keystone).

  - `--target server` artifacts now additionally export `__ssrString(props,
{ hydratable })` — a compiled string renderer of straight-line
    concatenation with interpolated dynamic holes and static-subtree constant
    folding (Svelte/Solid-SSR style), byte-identical to the tree-walk renderer
    including the full hydration wire grammar (`data-aihu-path`,
    `<!--aihu:s:PATH-->` structural markers, `<!--|-->` text-leaf boundaries).
    Templates using constructs outside the lowerable set (suspense/shield/
    guard/warp/focusTrap/router-macro elements, duplicate attr keys) simply
    ship without the export and keep the walker.
  - New `@aihu/runtime/ssr` subpath entry with the SSR string helpers
    (`__aihu_stext`, `__aihu_sattr`, …) mirroring the walker's escaping —
    server-only bytes on their own entry, so the client bundle size gate is
    untouched.
  - `@aihu/server` renderToString/renderToStream take the string fast path when
    the component carries a compiled renderer (`AIHU_SSR_STRING=0` opts out);
    new `attachSsrString` carries the renderer across props-binding wrappers
    (used by the router's governed path).
  - SSR walker fix: reactive attribute tuples/thunks now serialize their
    CURRENT VALUE (previously the getter's function source was printed into the
    attribute) and function-valued attrs (event handlers) never serialize.
  - Compiler fixes surfaced by the differential gate: `show`/`class:`/`ref`/
    `html` effect IIFEs guard their `onMount` registration (host-less SSR and
    loop-item factories previously crashed with SCR-R0010 'no owner'), and an
    `each`+`empty` chain now emits the `createIfBoundary` helper it references.

### Patch Changes

- [#519](https://github.com/fellwork/aihu/pull/519) [`2ef2830`](https://github.com/fellwork/aihu/commit/2ef2830aa737906d09a5d870176da34a22f20b99) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Rename the remaining legacy `SCRIBE_*` environment variables and markers to the
  `AIHU_*` family (following `SCRIBE_VERSION` → `AIHU_VERSION` in [#516](https://github.com/fellwork/aihu/issues/516)). No
  deprecated aliases — aihu has no external consumers.

  - `SCRIBE_NATIVE_SKIP` → `AIHU_NATIVE_SKIP` (documented SSR native-loader escape
    hatch), plus the internal `SCRIBE_NATIVE_MISSING` / `SCRIBE_NATIVE_LOAD_FAILED`
    diagnostic codes → `AIHU_NATIVE_MISSING` / `AIHU_NATIVE_LOAD_FAILED`.
  - `SCRIBE_COMPILE_BIN` → `AIHU_COMPILE_BIN`, **consolidated with** the existing
    `AIHU_COMPILE_BIN` drive-test override into a single variable. The sidecar
    `resolveBinPath()` / `resolveSpawnBinPath()` resolution and the drive/differential
    tests now both read one `AIHU_COMPILE_BIN`.
  - `SCRIBE_STATIC_ISLAND` audit marker → `AIHU_STATIC_ISLAND`.

- [#515](https://github.com/fellwork/aihu/pull/515) [`8924c51`](https://github.com/fellwork/aihu/commit/8924c51da6e6c25fb2664a7ab6fe9c628895161d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Retire the `$server` macro and its `createServerCall` client RPC bridge.

  The feature was half-wired and effectively broken: the compiler recognized
  `$server` only as a substring and, on a `--target client` build, emitted a
  `// [client build] $server macro reference elided` comment while leaving the
  `$server.*` reference untouched in the output — no server artifact and no
  `createServerCall` stub were ever generated, so any reference resolved to an
  undefined identifier. The whole surface is removed rather than finished:

  - `@aihu/server`: delete `createServerCall` (`src/client.ts`) and its barrel
    re-export.
  - `@aihu/compiler`: drop the `$server` client-build elision branch from
    `codegen/emit.rs`. A stray `$server` is no longer special-cased — it passes
    through as an ordinary (undefined) identifier and surfaces as a normal
    type-check / runtime error, instead of a misleading "elided" comment.
  - `@aihu/language-server`: remove the `$server` hover entry.
  - Spec: Macro Vocabulary §2.12 marked **RETIRED** (no drop-in replacement).

  Platform binary packages bumped 0.1.24 → 0.1.25 (Rust source changed).

## 1.0.0

### Major Changes

- [#479](https://github.com/fellwork/aihu/pull/479) [`9dd7654`](https://github.com/fellwork/aihu/commit/9dd7654678da1149705e21324f6b30e9baafcd4b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - DA4 ([#437](https://github.com/fellwork/aihu/issues/437)): the binary shadow API (`'light' | 'shadow'`) and light-DOM-by-default pages — one breaking change.

  **The API.** `ShadowMode` collapsed to a BINARY `'light' | 'shadow'`; the
  `'open'`, `'closed'`, and `'none'` tokens are retired everywhere (the
  `$shadow` macro, the plugin-global `shadowMode` config /
  `css: { shadowMode }`, the runtime `defineElement` options, and the CLI
  `--shadow` flag). `'shadow'` attaches an OPEN root internally — open is the
  only browser mode aihu's composition/hydration can use; `'closed'` was
  self-contradictory (a closed root nulls `this.shadowRoot`, so light-DOM
  detection misclassified it and content rendered into the host anyway).
  `'light'` attaches no root, so `this.shadowRoot === null` is an unambiguous
  detection. Migration: `'open'` → `'shadow'`, `'none'` → `'light'`,
  `'closed'` → `'shadow'`.

  **The defaults.** Page-level components — those with an `@route` block — and
  layout SFCs (files under the configured layouts dir, default `src/layouts/`)
  now default to `'light'`, so server-rendered page content is reachable by
  crawlers and agents that do not execute JavaScript. Leaf components (no
  `@route`) default to `'shadow'` (behaviorally the old `'open'` default).

  Precedence, in order: a per-file `$shadow` pin > an explicit plugin-global
  `shadowMode` config > the page/layout default `'light'` > the leaf default
  `'shadow'`. An unpinned page carries a new `// @aihu:shadow-default light`
  marker (distinct from the `$shadow` pin marker) so the implicit default ranks
  below an explicit plugin-global config.

  Breaking implications:

  - Retired tokens fail loudly: `$shadow` with an old token is a C471 compile
    error; `css.shadowMode` with one throws at config validation; `--shadow`
    with one warns and falls back to the default.
  - A `$shadow`-less `@route` page's `@style` block now joins the global
    cascade instead of being trapped in a shadow root — scope bare element
    selectors under a page root class (see the migration guide §8).
  - W472 (the phase-1 advisory that announced this flip) is retired.
  - The static-island fast path is skipped for light-DOM components — the shim
    cannot honor `shadowMode: 'light'`; such components keep the full runtime
    path.
  - css-engine scaffolds now always emit an explicit `css: { shadowMode }`
    block carrying the wizard's `--shadow` choice (default `'shadow'`), since
    the page default would otherwise override it.

- [#489](https://github.com/fellwork/aihu/pull/489) [`80531dc`](https://github.com/fellwork/aihu/commit/80531dcc4dfc43bc9cd399bbb8ab4520efb8f15a) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Template grammar v2 — the prefix-less template (founder-ratified 40-spec).

  One rule: naked keywords + naked HTML attributes + naked framework vocabulary;
  `{expr}` braces mean expression, quoted strings mean static; `$` retreats to
  `@state` macros only.

  **New grammar:** `if={…}`/`elseif={…}`/`else` attribute chains (adjacency-checked),
  the item-first `each={item, i of items}` `of`-binder with destructuring, `key={…}`,
  `empty` siblings, colon directives `on:<event>` (with `.prevent`/`.stop`/`.self`/`.once`
  modifiers), `bind:<prop>`, `class:<name>`, the `attr:<name>` literal escape hatch,
  naked `show`/`html`/`ref`/`once`/`memo`/`raw`, the NEW `<group>` fragment carrier,
  naked framework elements (`<slot>` is now THE projection form), and the enhanced
  `<a>` (SPA navigation, `prefetch`, `replace`, `aria-current`, auto-opt-out +
  explicit `reload`) replacing `<$link>`.

  **Retired (compile errors with fix hints):** `{#if}` C601, `{#each}` C602,
  `{@html}` C603, `{{ident}}` C604, `<$if>`/`<$else>` C605, `$if=`/`$each=`/`$let=`
  C606, every other `$`-attribute C607, `<$link>` C608, other `<$…>` elements C609,
  adjacency violations C610, unknown non-hyphenated elements C611. New lints:
  W601 (keyless stateful `each`), W602 (non-empty string on a boolean attribute).

  **Intended emission diffs:** internal `<a href>` links now lower to
  `createLinkBoundary` (the retired `<$link>` lowering) with a runtime
  origin/scheme auto-opt-out; everything else lowers through the same arbor
  structural calls as v1 (`when`/`each`/fragment branches).

  `aihu migrate --v2` now lands on this grammar (new final codemod pass:
  `compiler/js/codemods/template-grammar-v2`).

### Minor Changes

- [#435](https://github.com/fellwork/aihu/pull/435) [`c3381b9`](https://github.com/fellwork/aihu/commit/c3381b92c3d356d6f78f9db0e8130a9e7a466269) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `expose:` is now the agent opt-in. An `@agent` block is no longer required.

  Every agent artifact was gated on the presence of an `@agent` block. That
  contradicted the documented contract (`docs/site/authoring-agents.md`: "No
  `@agent` block needed") and had a concrete consequence: the `aihu create`
  scaffold and `cookbook/agent-weather.aihu` both write `expose:` and `describe:`
  with no `@agent` block, and both compiled to **zero** agent artifacts. The
  scaffold's own comment that "`$action` is the single source of truth for the
  agent surface" was false at the compiler level.

  A component is now agent-enabled when it exposes anything. `@agent` keeps its
  v2 job: carrying policy (`$scope`, `$rate-limit`). A component with exposed
  members and no block gets no policy — unscoped and unthrottled, which is what
  declaring nothing means.

  This does not widen the exposed surface. `expose: { read: true }` is already an
  explicit, per-member opt-in, and unexposed members remain excluded. Requiring a
  second opt-in only made the first one silently inert. A component that exposes
  nothing stays inert whether or not it declares `@agent`.

  **Behavior change to expect:** any component with `expose:` and no `@agent`
  block now emits `registerAgentMetadata`, `__agentBinding`, the server binding
  registration, and a manifest on server/universal builds — and, on client builds,
  the narrow opaque-ID dispatcher needed by the capability bridge. That last one
  is new client-side weight for such components, where previously there was none.
  Ten components in `cookbook/` and `examples/` are affected, including
  `live-counter`, `todo-mvc`, and `weather-card`.

  If a component should NOT be agent-reachable, remove `expose:` from its
  entries — that is now the only switch, rather than one of two that had to agree.

- [#435](https://github.com/fellwork/aihu/pull/435) [`30ed2b5`](https://github.com/fellwork/aihu/commit/30ed2b51c215512f840b113afaa1636378e31407) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `describe:` now reaches agents. The compiler emits `registerAgentMetadata`.

  `$action` / `$prop` / `$computed` entries have accepted a `describe:` key since the
  v2 macro vocabulary landed — it was parsed, validated, and parser-tested, then
  dropped. It reached no emitted artifact, so MCP tools shipped with a synthesized
  description ("Invoke the `bump` action on a live `<tag>` instance.") regardless of
  what the author wrote.

  Two independent breaks, both fixed:

  - The compiler **never emitted `registerAgentMetadata` anywhere**, so the
    `@aihu/agent` registry that `@aihu/agent-server`'s `buildToolDefinitions` reads
    was empty in every real app. `registry.ts`'s doc comment described a wire that
    was never built. Server and universal builds now emit
    `registerAgentMetadata({ tag, state, actions })` at module scope. The payload is
    pure data — it closes over no setup locals, unlike `__agentBinding` — so it is
    safe there and readable on import without a live instance. Client builds elide
    it along with the rest of the agent surface.

  - `emit_manifest` read only the retired **v1** `@agent { input / action }`
    keywords, so a v2 component's `agent-manifest.json` came out with empty
    `inputs` and `actions`. It now derives from the same `collect_agent_members`
    walk that feeds `__agentBinding` and the registry, so the sidecar cannot drift
    from the live surface again. It also gained a `state` key mirroring the
    registry payload.

  `ActionSchema` gains an optional `describe`. `buildToolDefinitions` prefers the
  authored text over its synthesized string, for both action tools and state-read
  tools — the state map's values were previously ignored entirely.

  Descriptions are collected only for members that clear the `expose` gate, so an
  unexposed member's prose (which may describe internals) never reaches a public
  artifact.

  Not covered: MCP `inputSchema` is still `args: { type: 'array' }`. Real parameter
  schemas need handler-signature extraction and are tracked separately.

- [#461](https://github.com/fellwork/aihu/pull/461) [`0db5827`](https://github.com/fellwork/aihu/commit/0db58275ecabf2d3e49431c810885e1ebfb5a9b6) Thanks [@srmcguirt](https://github.com/srmcguirt)! - GX Phase 1 — the `extract:` two-axis governed-extractability vocabulary
  ([#437](https://github.com/fellwork/aihu/issues/437)-GX, spec `docs/plans/governed-extractability/40-spec.md` §2–§3, §12
  Phase 1). Parse, validate, store, fan out; **no enforcement** — the principal
  gate, compliance derivation, and the bundle/data boundary are later phases.

  **The declaration (one, two positions):**

  - `@route { extract: { read: ..., call: ... } }` — routes.
  - `$extract: { read: ..., call: ... }` in `@state` — non-route components.

  Both lower to the same `ExtractDecl`. `read` (crawl-visibility) ∈ `'all' |
'agents' | 'search' | 'none' | 'verified' | 'human' | { scope: '<name>' }`;
  `call` (agent-callability) ∈ `'none' | 'anonymous' | 'verified' |
{ scope: '<name>' }`. The `{ scope }` value shape carries its scope, making
  "gated without a scope" (design A's C482) unrepresentable.

  **Resolution:** explicit declaration → component-`$scope` derives a
  fail-closed `read: { scope }` → the ratified default
  `{ read: 'agents', call: 'anonymous' }`. Behavior is byte-identical to today
  for humans, search, and user-directed fetchers — this phase only records the
  posture.

  **Compile errors / warnings:** C481 (an `expose:`d member under
  `call: 'none'`), C483 (malformed policy value), C484 (more than one
  declaration per surface), C485 (unknown `@`-class-scope on `$scope` —
  `@human`/`@verified` are the reserved vocabulary), W480 (explicit public-tier
  `read` overriding the component-`$scope` derivation), W481 (`call: { scope }`
  with nothing exposed).

  **Three-artifact fan-out:** the resolved policy is computed once per compile
  and rendered into (1) a `// @aihu:extract read=<v> call=<v>` code marker
  beside the shadow marker (server/universal artifacts only — policy never
  reaches client bundles), (2) an `"extract"` member on the `.route.json`
  sidecar, and (3) an `"extract"` member on the agent-meta manifest — agreement
  by construction, asserted by tests. The Vite plugin prints a per-value census
  (`[aihu] extract census — N surface(s)`) at the end of every build.

### Patch Changes

- [#435](https://github.com/fellwork/aihu/pull/435) [`2660a52`](https://github.com/fellwork/aihu/commit/2660a52223193eb724450e4b6e9dce32e15ae83b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix: css-engine scoped-utility fold no-opped on agent components. The
  `_foldCssEngineStyles` Shape-2 pass anchored on a literal `defineComponent((ctx) => {`,
  but a component with an exposed member emits `(__aihu_ctx__)` (so
  `_registerAgentServerBinding` can read `__aihu_ctx__?.element`). The pass now
  captures the actual setup param and injects the `adoptedStyleSheets` adoption
  against it, so an agent component using css-engine utilities gets its shadow
  stylesheet instead of silently shipping none.

- [#435](https://github.com/fellwork/aihu/pull/435) [`a195b80`](https://github.com/fellwork/aihu/commit/a195b8093e639c96b8471ea3567267ca8c11c269) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Five codegen bugs that emitted invalid JavaScript.

  Found by syntax-checking every component in `cookbook/` and `examples/` with
  esbuild — 5 of 32 did not parse. No test caught any of them: the compiler
  reported success, and the failure surfaced later in the bundler or not at all.

  - **Async `$action` handlers.** `handler: async () => …` lowered to
    `function name(async ()) { … }`. `arrow_args` saw a leading `a` rather than
    `(`, took the single-identifier branch, and returned everything before `=>`.
    Async handlers now lower to `async function name(args) { … }` and are no
    longer wrapped in `batch` — `batch` takes a plain arrow (so `await` in the
    body was a syntax error), and it flushes synchronously, so it would have
    covered only the prefix before the first `await` while looking atomic.

  - **Block-bodied `$computed` / `$resource`.** `arrow_body` strips the braces
    off a block body, which `$action` relies on because it re-wraps in its own
    `{ … }` — but `$computed` and `$resource` splice straight into `() => <expr>`,
    yielding `computed(() => if (x) return y)`. Added `arrow_body_spliceable`,
    which re-wraps block bodies and leaves expression bodies (including object
    literals like `({ a: 1 })`) alone.

  - **Async propagation.** `$computed`, `$resource`, `$effect`, and `$lifecycle`
    dropped the `async` keyword, so any awaiting body became a syntax error.
    Async `$effect` tracks dependencies only up to the first `await` — a real
    caveat, but the author's to make; emitting a non-async arrow around an
    awaiting body is simply broken.

  - **`$form` leaked into the component body.** It was the one `CollectionKind`
    missing from the plain-body skip list, so its entries reached the
    `name: type` declaration scanner and `value: () => value,` was rewritten to
    `let value: () => value,`, leaving a dangling `}`.

  - **Destructured `$each` aliases tore.** `as [name, desc]` split on the first
    comma — the one inside the pattern — producing `([name) => name`. The split
    was duplicated in three places; the `emit.rs` copy was the one the
    `$each="…"` attribute form actually reaches. A depth-aware
    `split_each_alias` now backs all three. This also removes the need for the
    `rejoin_alias_list` workaround downstream, whose comment already documented
    the tearing as expected behavior.

  All 32 cookbook and example components now emit parseable JavaScript, covered
  by five regression tests.

- [#505](https://github.com/fellwork/aihu/pull/505) [`dd8cfd6`](https://github.com/fellwork/aihu/commit/dd8cfd639f42ddb05468fe07b6d4f4420a80a8bf) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix the codemod and sidecar defects surfaced by the v2 canary migration
  ([#502](https://github.com/fellwork/aihu/issues/502), [#503](https://github.com/fellwork/aihu/issues/503), [#504](https://github.com/fellwork/aihu/issues/504)).

  - `aihu migrate` (macro-simplification): consume a multi-line `import { … }`
    as a single statement so its members are no longer orphaned below the
    closing brace and single-line imports are no longer hoisted into the open
    brace (the import-scrambling defect).
  - `aihu migrate --state` (state-wrapper): de-call prop reads (`name()` →
    `name`) after `$prop` → `prop()`, since `prop()` returns a value in the
    wrapper model rather than a callable signal.
  - `aihu migrate --v2` (template-grammar): accept the dot spelling
    `$class.modifier` in addition to `$class:modifier`.
  - Type-check sidecar: `__aihu_each` over an `any` iterable now types loop
    bindings as `any` instead of `unknown` (one conditional-typed generic with
    an IsAny guard).
  - `aihu-tsc`: surface the first real compile error when a file cannot be
    compiled (a stale-compiler error immediately reveals a version mismatch),
    and document version-aligning `@aihu/tsc` with `@aihu/compiler`.

- [#463](https://github.com/fellwork/aihu/pull/463) [`bc0f289`](https://github.com/fellwork/aihu/commit/bc0f289ee38871cda8002e56fba3e3b8b7e34d84) Thanks [@srmcguirt](https://github.com/srmcguirt)! - GX Phase 3 ([#437](https://github.com/fellwork/aihu/issues/437)-GX) — derive robots.txt, noindex, and discovery output from
  the compiled `extract.read` axis.

  - `@aihu/server`: new `deriveReadPolicy` / `extractReadValue` /
    `isCallAdvertised` — the one read-axis derivation table (crawl access per
    bot tier, robots advertisability, noindex, discovery membership), fail-closed
    on malformed values. `AgentReadinessConfig` gains `routes` (the compiled
    route table conduit).
  - `@aihu-plugin/agent-readiness`: `generateRobotsTxt` accepts `routes` and
    derives per-path directives per route `read:` value over the tiered bot
    registry (`'all'` → all tiers; `'agents'` → the [#430](https://github.com/fellwork/aihu/issues/430) tiered default, now
    derived per route; `'search'` → searchers only; `'none'` → all crawlers
    disallowed; hard values → not advertised at all). llms.txt gains a derived
    `## Routes` section and filters its components section by the declared
    policy; MCP server-card tools are filtered by read + call advertisability.
    With no routes declared, robots.txt is byte-identical to the shipped [#430](https://github.com/fellwork/aihu/issues/430)
    default.
  - `@aihu/router`: `RouteDefinition`/`RouteSidecar` carry the compiled
    `extract` member; `createServerRouter.handle` sends `X-Robots-Tag: noindex`
    for `read:'none'`/hard/malformed routes.
  - `@aihu/compiler`: `RouteMeta` types the `extract` member the binary already
    emits (type-only).

  All of this is compliance-tier: advisory signals honored by compliant,
  self-identifying crawlers. Hard-tier enforcement (SSR withholding, the
  bundle/data boundary) is Phase 4 and is not part of this change.

## 0.11.0

### Minor Changes

- [#414](https://github.com/fellwork/aihu/pull/414) [`df40c34`](https://github.com/fellwork/aihu/commit/df40c34526e985ce656a6a5650ac1d83ebef3a80) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Component tag naming: PascalCase→kebab normalization + C450 validation.

  Custom-element names require a hyphen, so the compiler now normalizes every
  component tag to its valid custom-element form — consistently across reference
  emission (`branch('user-card', …)`), the route manifest's `components` array,
  and the `customElements.define` name:

  - Multi-word PascalCase kebab-cases automatically: `<UserCard>` → `user-card`,
    `<APIClient>` → `api-client`, `<HTMLParser>` → `html-parser`.
  - Already-hyphenated tags pass through lowercased: `<Aihu-Button>` → `aihu-button`.
  - **Single-word component names are a new hard compile error (C450)** — a
    single word (`<Comment>`, or a file stem like `Comment.aihu` with no
    hyphenated `@meta name`) can never become a valid custom-element name. Fix by
    using a hyphenated tag (e.g. `<x-comment>`) or an explicit hyphenated
    `@meta name`.
  - Plain lowercase HTML/SVG tags (`div`, `linearGradient`) are untouched, and a
    plain lowercase hyphen-less define-name (e.g. `timer.aihu`) keeps its
    existing warning.

  The JS driver mirrors the same normalization for file stems, so the define-name
  agrees between the Rust CLI and the Vite plugin.

- [#417](https://github.com/fellwork/aihu/pull/417) [`b279f74`](https://github.com/fellwork/aihu/commit/b279f74b34cd4e901be1cfa5d70c212cf604dfc1) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `$context` now lowers onto `@aihu/context`'s prototype-chain provide/inject DI
  instead of the old DOM-CustomEvent mechanism.

  - `@aihu/context` gains `contextKey(key)`: an interning helper that returns one
    stable `ContextToken` per string key, module-global, so the string-keyed
    `$context` macro and separately compiled components all resolve the same
    token.
  - The compiler emits synchronous setup-body calls —
    `provide(contextKey('theme'), (factory)())` for `provide` entries and
    `const locale = inject(contextKey('locale'))` for `consume` entries — plus a
    single combined `import { provide, inject, contextKey } from '@aihu/context'`
    (deduped with the magna `inject` import). The `__aihu_ctx_provide` /
    `__aihu_ctx_request` event contract is removed, and `$context` no longer
    forces an `onMount` import.
  - Because the new lowering rides the hierarchical DI added in [#411](https://github.com/fellwork/aihu/issues/411) (with its
    SSR flat-map fallback), `$context` now works under SSR and is no longer
    timing-fragile on the client — unlike the old client-only event path, which
    required the consumer to be listening before the provider fired.

- [#409](https://github.com/fellwork/aihu/pull/409) [`38652d5`](https://github.com/fellwork/aihu/commit/38652d544fd1001e42d505627de88976d69c1710) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Route manifest: the compiler now lists each page's component dependencies.

  `.route.json` gains a `components` member — the custom-element tags a page's
  template references (hyphenated names and PascalCase component references, from
  nested elements and inside `{#if}`/`{#each}`; plain HTML tags and `<$macro>`
  intrinsics are excluded). This is the per-route component graph the router needs
  to import and register exactly a page's components on demand, instead of the app
  eagerly importing every component at boot.

  Additive and backward-compatible: a page that references no components omits the
  `components` member entirely, so existing consumers and no-component pages are
  byte-identical. Emitted runtime JS is unchanged.

### Patch Changes

- [#418](https://github.com/fellwork/aihu/pull/418) [`212e3e3`](https://github.com/fellwork/aihu/commit/212e3e38ae57de7e38c3211ef0223729ba1511e1) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `$context` provide: static `value:` expressions are provided verbatim, not
  called. Stacked on the O2 prototype-chain lowering ([#417](https://github.com/fellwork/aihu/issues/417)), which wrapped every
  provide `value:` in `({expr})()` — correct for arrow factories
  (`value: () => themeSignal`), but a runtime TypeError for static values
  (`value: 'light'` lowered to `('light')()`).

  The lowering now only wraps-and-calls function-shaped values (`function …` or
  an arrow containing `=>`); everything else — string/number literals,
  identifiers, object literals — is passed through as-is:

  - `value: () => themeSignal` → `provide(contextKey('theme'), (() => themeSignal)())` (unchanged)
  - `value: 'light'` → `provide(contextKey('theme'), 'light')`
  - `value: themeSignal` → `provide(contextKey('theme'), themeSignal)`

  Edge to note: an identifier that happens to name a factory function is NOT
  called — "value is the value". Write `value: () => makeThing()` when you want
  a call at provide time.

  Both lowering paths (codegen/emit.rs and the legacy parser/state_macros.rs
  path) are fixed identically. The cookbook context-provider/context-consumer
  pair is reworked to be a correct static-value example.

- [#418](https://github.com/fellwork/aihu/pull/418) [`212e3e3`](https://github.com/fellwork/aihu/commit/212e3e38ae57de7e38c3211ef0223729ba1511e1) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Nested `<$outlet>` component registration (F1): the compiler-emitted `createOutletBoundary` now loads the matched route's referenced components alongside its page module — `Promise.all([m.route.module(), ...(globalThis.__aihuRegisterRouteComponents?.(m.route) ?? [])])` — so pages rendered through a layout's nested outlet get the same route-scoped registration as the top-level render path (O1c). `@aihu/app` publishes the registrar as `globalThis.__aihuRegisterRouteComponents` at module load; a standalone `@aihu/router` app without `@aihu/app` leaves it undefined and the outlet simply skips registration, unchanged from before.

## 0.10.2

### Patch Changes

- [#403](https://github.com/fellwork/aihu/pull/403) [`6334637`](https://github.com/fellwork/aihu/commit/6334637c00e68dec8ba52c6633f229a79fae00a1) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Actually ship the compiled binary. The Rust `aihu-compile` binary is delivered via
  the `@aihu/compiler-<platform>` packages, whose version is independent of this JS
  glue package. Those platform packages were pinned at `0.1.1`, and `release.yml`
  skips any version already on npm — so every Rust fix since `0.1.1` was rebuilt but
  never published, and consumers kept loading the stale `0.1.1` binary (published
  before any of them).

  This bumps all five platform packages to `0.1.2` and repoints the glue's
  `optionalDependencies` at `0.1.2`, so the current binary finally installs. That
  binary carries **three** fixes that had silently not shipped:

  - regex-aware block delimiting (`/\{/`, `/}/`, `//` in HTML/CSS) — 0.10.0
  - `$prop` typed as a Signal accessor in the type-check surface — 0.10.0
  - the `{a} {b}` whitespace-preservation fix ([#400](https://github.com/fellwork/aihu/issues/400)) — 0.10.1

  Same failure mode as the earlier "ship spread fix by bumping platform binary
  packages" — the platform bump is a manual step that is easy to miss.

## 0.10.1

### Patch Changes

- [#401](https://github.com/fellwork/aihu/pull/401) [`d6c252f`](https://github.com/fellwork/aihu/commit/d6c252f0cc16ee494c303d83c6e4c19d60c5469a) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Template: preserve the space in `{a} {b}`.

  A whitespace-only text node flanked by dynamic boundaries — an interpolation
  `{…}` or a child element — was dropped entirely at compile time, fusing the two
  values whose only separator was that space: `<p>{count()} {label()}</p>` rendered
  `400attestations` instead of `400 attestations`, and `{a} <span>{b}</span>` lost
  the space before the element. Whitespace inside a larger literal-text run (`count
{a} of {b}`) was unaffected — only the pure-whitespace node hit the early elision.

  A whitespace-only node on a single line is now preserved as a single space, per
  HTML's inline whitespace model. A run that spans lines (template-body indentation
  between block-level siblings) is still stripped, so no spurious spaces are
  injected. Fixes [#400](https://github.com/fellwork/aihu/issues/400).

## 0.10.0

### Minor Changes

- [#395](https://github.com/fellwork/aihu/pull/395) [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Advanced JS in template expressions, waves 1–3 (opt-in via `--expr-parser ast`
  or `AIHU_EXPR_PARSER=ast`; default behavior unchanged):

  - **Shared lexical scanner** for `{expr}` boundaries — strings, template
    literals (with nested `${}` holes), comments, and regex are understood by
    every brace scanner, closing the whole brace-in-literal misparse class
    (`'}'` in strings, regex after `{`, quotes inside attribute braces).
    Rejection diagnostics now state the allowed expression forms and suggest
    hoisting to `$computed`.
  - **oxc-powered expression validation** (`ast` mode): every captured template
    expression is parsed in TS mode; syntax errors become C320 diagnostics with
    codeframes, statements/sequences/`await` get C321 steering.
  - **Scope-aware AST signal rewrite** (`ast` mode): spread arguments, template
    literal holes, arrow bodies, and param defaults now rewrite signal reads
    correctly; `{#each}` aliases that shadow a signal no longer emit the signal
    tuple; write targets are left alone (legacy emitted invalid `count() = 5`).
    Corpus-verified: legacy emit stays byte-identical; the only `ast`-mode diffs
    are fixes to previously silent miscompiles.

  Note: the toolchain now pins rustc 1.95 and wasm-opt is re-enabled with
  bulk-memory flags (it had been silently skipped, shipping unoptimized wasm).

- [#395](https://github.com/fellwork/aihu/pull/395) [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418) Thanks [@srmcguirt](https://github.com/srmcguirt)! - **`.aihu` files are now type-checked.** They were not before — at all.

  The type-check sidecar declared every template-referenced binding as an `any`
  parameter and never emitted the `@state` body, so TypeScript was handed a file
  that could not disagree with the author about anything. A `const x: number =
'a string'` inside `@state`, or a typo'd property, passed `tsc --noEmit` clean.
  The green check was over code TypeScript had never seen.

  Two things change:

  **`@aihu/compiler`** now inlines the `@state` body into the type-check surface, at
  its real source lines. Bindings carry their true types instead of `any`, imports
  resolve so call sites are checked, and a diagnostic inside `@state` cites the
  `.aihu` line the author wrote it on. Only loop aliases remain `any` — `{#each xs
as m}` binds `m` in the template, so there is no declaration to borrow a type
  from.

  **`@aihu/tsc`** (new) provides `aihu-tsc`, which projects each `.aihu` into the
  TypeScript program as a VIRTUAL file via Volar's `proxyCreateProgram`. No
  `.aihu.ts` sidecar is written to disk any more: the Vite plugin no longer emits
  them, and consumers can delete the ones they have and drop `*.aihu.ts` from
  `.gitignore`.

  **Migration.** Replace `tsc --noEmit` with `aihu-tsc` in your `typecheck` script
  (`@aihu/cli` now scaffolds this for new projects). Plain `tsc` cannot see inside a
  `.aihu` file, so it will keep reporting a clean pass over every SFC in your
  project without having checked one.

  Expect real diagnostics the first time you run it — this is code that has never
  been type-checked. Implicit-`any` inside `.aihu` files is suppressed by default,
  since no corpus has ever been annotated for it; `aihu-tsc --strict-templates`
  turns it on.

### Patch Changes

- [#395](https://github.com/fellwork/aihu/pull/395) [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Template parser: a JS comment opening a `{expr}` interpolation (`{/* note */ count}`,
  `{// note` …`}`) was misclassified as a `{/if}` / `{/each}` block tail and errored
  with "unexpected `{:` or `{/`". Block tails are always `{/` + letter, so `{//` and
  `{/*` now fall through to expression parsing. Comments inside expressions were
  already handled downstream (`{count /* trailing */}` worked); only the
  comment-first form was affected.

- [#398](https://github.com/fellwork/aihu/pull/398) [`250dbbf`](https://github.com/fellwork/aihu/commit/250dbbf4024f77ddfe41cf9d04b14ad5266ccfee) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Type-check surface: type a `$prop` binding as a Signal accessor (`() => T`), not a
  plain value.

  At runtime `ctx.props.<name>` is a `Signal`, read via the getter call
  (`props.title()`), so a template reads a prop as `language()`. The sidecar typed
  the binding as a plain `T`, which made every such call a `TS2349` "not callable".
  This also correctly flags the inverse — a prop read _without_ a call
  (`route.data`) — as the bug it is.

- [#395](https://github.com/fellwork/aihu/pull/395) [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Block delimiting: lex regex literals, and stop treating `//` as a comment in HTML
  and CSS.

  The block scanners counted raw bytes. They knew strings and comments, but not
  regex literals, so a regex's braces and quotes were read as structure:

  - `/\{/` opened a depth that never closed — `@state` swallowed the template and
    the parser died on markup the author never wrote.
  - `/}/` closed `@state` EARLY, silently dropping every statement after it and
    emitting a truncated `const re = /` — while exiting 0.
  - `/['"]/` — the quote opened string mode and ate the rest of the block.
  - A regex inside a `$action` handler ran the collection splitter past the comma
    that ended the entry (C447).

  `//` was also treated as a line comment inside `@template` and `@style`. Neither
  language has one — HTML uses `<!-- -->`, CSS uses `/* */` — so any `https://` URL
  commented out the rest of its line, closing brace included. A CSS
  `background: url(https://…)` was enough to fail the build.

## 0.9.11

### Patch Changes

- [#393](https://github.com/fellwork/aihu/pull/393) [`6ff3759`](https://github.com/fellwork/aihu/commit/6ff375925256e5ac7be91a301bb01e9ce2c5e1c9) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix: ship the spread-of-signal rewrite in the platform binary

  The spread-rewrite fix (0.9.10) lives in the Rust `aihu-compile` binary, which
  distributes via the `@aihu/compiler-<platform>` packages — but those were pinned
  at `0.1.0`, so the release's idempotency guard skipped republishing them and the
  new binary never reached consumers. Bump the five platform binary packages to
  `0.1.1` and point the glue's `optionalDependencies` at them so the rebuilt
  compiler (with the spread fix) actually installs.

## 0.9.10

### Patch Changes

- [#391](https://github.com/fellwork/aihu/pull/391) [`444be87`](https://github.com/fellwork/aihu/commit/444be87ddbabd874fe4479dff260063f8bee8c95) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix: rewrite signal reads inside spread expressions

  A spread of a signal in a template expression (e.g. `{ [...a, ...b].length }`)
  silently miscompiled: because `...` ends in a `.`, the identifier after it was
  misclassified as member access (`obj.a`) and skipped by the signal-read
  rewriter — so the emitted code spread the getter **functions** instead of their
  values, and as a non-reactive eager leaf. Spread idents are now distinguished
  from real member access (look-back over whitespace for a `...` run); `...a` and
  object spread `{...o()}` rewrite to their called forms and stay reactive.

## 0.9.9

### Patch Changes

- [#370](https://github.com/fellwork/aihu/pull/370) [`6f845bf`](https://github.com/fellwork/aihu/commit/6f845bf56784b188abf3a3cac1df4b6cc31e7c3b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Stop force-packing a publisher-arch native binary into the `@aihu/compiler` npm
  tarball. The `bin` target is now a committed ESM shim (`bin/aihu-compile.mjs`)
  that resolves the platform `aihu-compile` executable at runtime; the native
  binaries ship via per-platform `optionalDependencies`
  (`@aihu/compiler-<platform>`), mirroring `@aihu/css-engine`. The published
  tarball now contains the JS shim and no native binary. The `postinstall`
  download hook is removed in favor of optionalDependency resolution.

## 0.9.7

### Patch Changes

- [#366](https://github.com/fellwork/aihu/pull/366) [`0ba842f`](https://github.com/fellwork/aihu/commit/0ba842fa22eb752e71460b369cc99e506f1b9ef0) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix non-ASCII string literals inside `{}` expressions being latin-1-mangled at
  compile. The expression-lowering passes (`rewrite_signal_reads_to_calls` —
  FEL-172/173 — and `lower_emit_calls`) rebuilt expression strings byte-by-byte
  via `out.push(byte as char)`, which reinterprets each UTF-8 byte as a latin-1
  code point. So any non-ASCII string literal reached through an expression —
  `{someGloss}`, a ternary picking a lemma (`{cond ? 'λόγος' : 'word'}`), a
  `$class` with a glyph (`'on ▾' : 'off ▸'`), an `$each` list, a `$on` handler, or
  a `$emit('…')` payload — was corrupted into mojibake (`λόγος` → `Î»ÏÎ³Î¿Ï`).
  Static template text and `@style` were unaffected, which masked the bug. This
  is a serious landmine for any app rendering Greek/Hebrew/glyphs through
  expressions (e.g. a Bible app).

  Both passes now copy verbatim regions as whole UTF-8 string slices (flush-slice
  rewriting) instead of byte-by-byte. All tokenizing still keys on ASCII bytes, so
  every flush boundary lands on a char boundary and multibyte characters pass
  through intact. Verified end-to-end and across a real component corpus: zero
  mojibake, intact `λόγος` / `שלום` / `▾` / `▸` / `→` in every expression context.

## 0.9.6

### Patch Changes

- [#364](https://github.com/fellwork/aihu/pull/364) [`72596d3`](https://github.com/fellwork/aihu/commit/72596d3ae9757fd763bb428628aa594ca414b4a1) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Error (C447) on comma-less collection entries instead of silently dropping
  them. `@state` collection blocks (`$action`/`$prop`/`$event`/`$computed`/…) are
  comma-separated, JS-object syntax. A missing comma between wrapped entries —
  e.g.

  ```
  $action: {
    increment: { handler: () => { count++ } }
    decrement: { handler: () => { count-- } }   // ← no comma
  }
  ```

  previously collapsed the entries into one chunk and kept only the **first**,
  silently discarding `decrement` and everything after. That produced wrong
  runtime codegen (the template references `decrement` → `ReferenceError` at
  mount) and broken type-check sidecars, with **no diagnostic**. The parser now
  detects the glued-on entry (any non-whitespace after a wrapped value's closing
  brace) and emits a clear `C447` naming the dropped entry and the missing comma.
  The canonical comma-separated form (including trailing commas) is unaffected,
  and bare arrow values with legitimate top-level return-type colons
  (`(t: number): string => …`) are not false-flagged.

## 0.9.5

### Patch Changes

- [#362](https://github.com/fellwork/aihu/pull/362) [`0775478`](https://github.com/fellwork/aihu/commit/077547892ab14c9bfde96a102fbaab4c30d9dccc) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Close the last two `.aihu.ts` sidecar gaps after 0.9.4 (26 → 0 across the
  consuming projects):

  - **Imported / single-element-destructure symbols used in templates (TS2304).**
    Names brought in via a **multi-line** `import { … }` block were missed by the
    previous line-at-a-time scan, so imported handlers (`closeNav`, `toggleTheme`,
    …) referenced directly in the template still `TS2304`'d. Import statements are
    now reassembled across lines before parsing. Single-element destructures
    (`const [showLine] = signal(false)` — `resolve_signals` only seeds two-element
    getter/setter pairs) are now collected too, along with general
    array/object destructure bindings.

  - **Inline event-handler params are untyped (TS7006).** `$on.click={(e) => …}`
    emitted `void ((e) => …)` in the sidecar — `e` had no contextual type, so
    `noImplicitAny` flagged it. Handler expressions are now emitted in call
    position to a typed helper (`declare function __handler(h: (...args: any[]) =>
any): void;` → `__handler((e) => …)`), which gives inline arrow params a
    contextual `any` type. Plain value expressions still use `void (…)`. A
    non-function handler still type-errors, as intended.

  Verified end-to-end: the real fellwork-web `passage-picker.aihu` plus a repro
  exercising all three classes (multi-line import, single-element destructure,
  handler param) pass `tsc --noEmit --strict --noUnusedLocals --noUnusedParameters`
  with zero errors.

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
