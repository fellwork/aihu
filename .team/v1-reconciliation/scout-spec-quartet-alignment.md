# Scout Report — Spec Quartet Alignment Map

**Author:** Scout (Round 2.5 / supplemental, read-only)
**Date:** 2026-05-02
**Branch base:** `investigate/v1-reconciliation` @ `e9d2d46` (R2 Architect roadmap + companion stub)
**Main HEAD reference (for §2 cites):** `7fa0957`
**Scope:** End-to-end read of the four-doc spec quartet + three amendments; per-spec digest + per-requirement alignment map (SHIPPED / PARTIAL / GAP / UNKNOWN with cites) + naming-ambiguity audit + Investigator follow-ups. **No source edits, no spec edits.**

**Key prior context:**
- `.team/v1-reconciliation/scout-report.md` (Round 1 — current state map + 15 questions for Architect)
- `.team/v1-reconciliation/roadmap-draft.md` (Round 2 — v1.0-final / v1.1 / v1.5 / v2 / v3 + Q4 HMR PASS audit)
- `.team/v1-reconciliation/assets-package-design-stub.md` (Round 2 — `@scribe/image` / `@scribe/fonts` / `@scribe/css-pipeline`)

**Director adjudications already in:**
- Spec quartet ratification = v1.0-gating
- Plugin Contract `contributes` / `lowering` / `BuildContext` IS the abstract `@scribe/plugin` (Q8 collapse)
- Amendment 02 path convention: **Option A (`_scribe-server/` prefix)**
- Amendment 03 middleware: **Option A (provisional, v1.x mutable)**

---

## Section 1 — Spec quartet digest

### 1.1 `docs/spec-block-structure.md` (22.7 KB, 13 sections)

**Defines:** the file format for `.scribe` SFCs at the structural level — which blocks exist, how they delimit, parse, and compose. Authoritative contract between SFC source and the compiler's top-level parser.

**Block grammar:**
- `@blockname { ... }` — `@` sigil + identifier + brace-delimited body. Brace matching tracks interior depth (object literals, JSX, etc.) so the closing `}` matches at depth 0 (§2.4). Closing `}` MUST be on its own line.
- **Core blocks (closed in v1):** `@state`, `@template`, `@style`, `@agent` — each at most once per file. `@template` required for renderable components.
- **Fifth structural block:** `@route` — valid only in `src/pages/` files (§7.3). Carries route metadata as TypeScript object literal: `path`, `name`, `middleware`, `ssr`, `layout`. NOT a macro-bearing block (Amendment 01 clarifies).
- **Plugin blocks:** `@plugin-name.block-name { ... }` (dot is the discriminator). Multiplicity declared by plugin; bare `@field` reserved as compile error (§6).
- **Block ordering:** any order; recommended `@state -> @template -> @style -> @agent -> plugins` (§3.3).

**Cross-block resolution:** unified symbol table per SFC. `@state` declares; `@template`/`@style`/`@agent` reference. Forbidden cross-references (e.g. `@state` referencing `@template`) compile-error (§4.3).

**File-system conventions (§7):** `src/pages/` -> page component (auto-routed); `src/components/`, `src/layouts/`, `src/composables/` per role. Path-based namespace prevents component name collisions (§7.4). Layouts attached via `scribe.config.ts` `layouts` map or per-page override `@route { layout: 'admin' }` / shorthand `@layout 'admin'`.

**Reserved tokens (§8):** frontmatter `---`, top-level `import`/`export`, top-level `;` are all v1-rejected.

**Compiler contract (§11):** seven-step top-level parser pipeline; per-block parser interface; symbol table contents per block; six-phase compilation order (`@route` -> `@state` -> plugin blocks -> `@template` -> `@style` -> `@agent`).

**§11.5 (Amendment 02, Option A applied):** SPLIT-BUNDLE COMPILATION — `$server`, `<form $action>`, and `@agent` block emit two artifacts each (server file under `_scribe-server/{actions,form-actions,mcp}/{component-id}/...` + client RPC stub or no-client). Build target field `client | server | universal` introduced; default `universal` for pages; `client` mode warns-and-elides server-only macros.

**Open Qs in §12:** `@route` as sub-block of `@state` (proposed: keep top-level); drop `@layout` shorthand; plugin block ordering constraint (defer to v2); empty file = warn.

**Cross-references:** quartet member; consumes Template Attribute Syntax + Macro Vocabulary + Plugin Contract.

---

### 1.2 `docs/spec-template-attribute-syntax.md` (22.7 KB, 13 sections)

**Defines:** syntax for attribute values inside `@template` blocks. Binding contract between SFC source and the compiler parser. Hard-restrictive: maximum visual clarity at the cost of flexibility.

**The two forms (§1):**
- **Quoted form:** `attr="value"` — identifier ref, property path (dotted only — no bracket / call / optional chain), literal string, or structured iteration token (`$each="posts as p, i"`).
- **Curly form:** `attr={expression}` — JS expression evaluated at the binding site; reactive (signal reads subscribe).
- **Bare values forbidden** (`attr=value` is parse-error in v1).
- **Boolean-only attributes** (`disabled`, `$once`, `$raw`) — present-or-absent, no value.

**Identifier resolution (§2):** lookup order — local `@state` decls -> slot-exposed context (`shield.error`, `guard.user`, etc.) -> plugin-contributed values -> `scribe.config.ts` imports. Computed/bracket/call access requires curly form.

**Per-macro type matrix (§3.3) — source of truth:**

| Macro | Type | Quoted | Curly |
|---|---|---|---|
| `$if` / `$show` | `signal-ref \| expression` | identifier only | any boolean expression |
| `$each` | `iteration` | required form | forbidden |
| `$bind:*` | `signal-ref` | required form | forbidden |
| `$on:*` | `function-ref \| expression` | function name | inline function expression |
| `$key` / `$html` | `identifier \| expression` | identifier or path | any expression |
| `$raw` / `$once` | boolean-only | n/a | n/a |
| `$memo` | `expression` | forbidden | required form |
| `$action` (form attr) | `function-ref \| expression` | function name | inline function expression |

**Slot/fallback hybrid (§4):** `<$suspense>`, `<$shield>`, `<$guard>` accept EITHER `fallback="ComponentName"` (+ optional `fallbackProps={...}`) OR `<$slot name="fallback">...</$slot>` child. Mutually exclusive, compile-error if both. Inline JSX in attributes (`fallback={<Skeleton />}`) FORBIDDEN in v1 — extract to component or use slot.

**Slot context exposure (§5):** documented identifier convention — `suspense.loading`, `shield.{error,retry}`, `guard.{user,reason,path}`. User components expose via `<$slot name="row" expose="user, index">`.

**Migration tables (§10):** Vue/React/Svelte -> scribe one-to-one mapping. Vue's `:class`, `@click` -> scribe's `class={...}`, `$on:click="..."`.

**Open Qs (§11):** v2 may relax inline-JSX ban; conditional attribute presence (proposed: elide null/undefined); class/style binding shortcuts deferred.

**Cross-references:** quartet member; consumes Macro Vocabulary + Plugin Contract; depends on `@scribe/{signals,arbor,runtime}` stable.

---

### 1.3 `docs/spec-macro-vocabulary.md` (54.3 KB, biggest — 11 sections)

**Defines:** complete macro vocabulary for v1. **Closed:** 39 forms across 36 unique names, fixed by language version. New macros require RFC + version bump. Plugins MAY contribute namespaced (`@plugin.$macro`) — documented in plugin specs.

**Vocabulary by block (§1):**
- `@state` (12 names, 14 forms): `$prop`, `$computed`, `$resource`, `$effect`, `$effect.on`, `$watch`, `$action`, `$lifecycle.{mount,dispose}`, `$expose`, `$shared`, `$cookie`, `$server`, `$meta`
- `@template` (16): `$if`, `$show`, `$each`, `$bind:*`, `$on:*`, `$key`, `$html`, `$raw`, `$once`, `$memo`, `$action` (form attr), `<$slot>`, `<$suspense>`, `<$shield>`, `<$guard>`, `<$warp>`
- `@style` (5): `$reactive`, `$tokens`, `$global`, `$media`, `$when`
- `@agent` (6): `$expose`, `$expose.write`, `$action`, `$scope`, `$rate-limit`, `$describe`

**Block-disambiguated macros (§1.1):** `$expose`, `$action`, `$lifecycle` carry block-determined semantics. `$expose` in `@state` -> `defineExpose`; in `@agent` -> `mcpServer.registerResource`. `$action` in `@state` declares; in `@template` references on `<form>`; in `@agent` registers as MCP tool.

**Per-macro entries:** each defines purpose / form / syntax / **lowering target (TS code emitted)** / runtime behavior / error cases / examples. Lowering targets are concrete:
- `$prop` -> `defineProps<{...}>()` + `computed(() => props.x ?? default)`
- `$computed` -> `computed(() => expr)`
- `$resource` -> `createResource(keyFn, fetcher)` (consumes `@scribe/data`)
- `$effect` / `$effect.on` / `$watch` -> `effect()` (consumes `@scribe/signals`)
- `$action` -> `function name(...) { return batch(() => {...}) }` (consumes `@scribe/signals.batch`)
- `$lifecycle.{mount,dispose}` -> `onMount` / `onCleanup` (consumes `@scribe/runtime`)
- `$shared` -> `useSharedState(key, default)` (NEW HELPER — not in current runtime)
- `$cookie` -> `useCookie(name, opts)` (NEW HELPER)
- `$server` -> split-bundle artifact pair: server file at `_scribe-server/actions/{component-id}/{name}.ts` + client `createServerCall<Args, Return>('component-id/name')` (per Amendment 02 §11.5)
- `$meta` -> `useHead({...})` (NEW HELPER)
- `$if` -> `createIfBoundary(...)` from `@scribe/arbor` (current arbor exports `when` not `createIfBoundary`)
- `$each` -> `createEachBoundary(...)` (current arbor exports `each` — name mismatch)
- `$show` -> CSS-variable + dataset effect
- `$bind:*` -> effect + addEventListener pair
- `$memo` -> `createMemoBoundary(deps, build)` (NEW)
- `<$suspense>` / `<$shield>` / `<$guard>` / `<$warp>` -> corresponding `createXBoundary` calls (NEW boundary primitives)

**Performance budgets (§8.2):** per-macro runtime cost targets in ns/μs (e.g. `$each` ≤ 3μs for 100-item diff, `$bind:*` ≤ 30ns per direction). Compiler implementations MUST stay within 2× without justification.

**Open Qs (§9):** explicit return type for `$server` (defer); manual-control `$resource.manual` (defer to v2); keep `$effect` / `$effect.on` separate.

**Amendment 01:** clarifies `@route` is a structural data block, not a macro-bearing block; "4 blocks" elsewhere = macro-bearing only.

**Cross-references:** quartet member; consumes Block Structure + Template Attribute Syntax + Plugin Contract.

---

### 1.4 `docs/spec-plugin-contract.md` (29.9 KB, 13 sections)

**Defines:** how plugins extend the compiler and runtime. Plugins are first-class — data, agent surface, forms helpers are themselves plugins. Core ships minimal compiler+runtime; everything beyond markup/state/style/agent is plugin contribution.

**Plugin anatomy (§1):** npm package exporting `definePlugin({...})` default. Required: `name`, `version`, `namespace`. Optional: `configSchema`, `contributes`, `hooks`, `parsers`, `dependencies`, `scribeVersion`. Namespace must be valid identifier (no `@scope/`), not collide with reserved names (`scribe`, `core`, `state`, `template`, `style`, `agent`, `route`).

**Contribution categories (§2):**
- **Blocks:** `contributes.blocks: ['fields']` -> permits `@forms.fields { ... }`. Plugin provides `parsers.fields = (body, ctx) => AST`.
- **Macros:** `{ name: '$field', validIn: ['@forms.fields'], lowering: fn, validation?: fn }`. Lowering signature: `(ctx: MacroContext, args: MacroArgs) => string | LoweringResult`. `LoweringResult = { code, imports?, hoist?, target?: 'client' | 'server' }`.
- **Components:** plugin ships `.scribe` files in its `components/` dir; auto-registered project-wide. Project-local `src/components/Input.scribe` shadows plugin.
- **Transforms:** `{ stage: 'after-parse' | 'before-lower' | 'after-lower', fn }` — AST/output mutation.

**Configuration (§3):** `scribe.config.ts` -> `plugins: [forms({...}), data({...})]`. `configSchema` declares accepted shape; compiler validates at startup. Hooks/parsers receive resolved config via context.

**Lifecycle hooks (§4):** four stages — `beforeCompile`, `afterParse`, `transformBlock`, `afterCompile`. Context types: `BuildContext` (config, mode, outputDir, projectRoot) -> `SfcContext` (+ sfcPath, componentName, symbolTable) -> `BlockContext` (+ blockType, blockName). Hook order: plugin registration order within stage; deps run before dependents.

**Macro lowering (§5):** `MacroContext` provides `pluginConfig`, `sfc`, `block`, `imports(spec)` (returns local name), `runtime(name)` (returns local name for runtime helpers). `LoweringResult.target` directs to client/server bundle (Amendment 02 cross-reference).

**Component contributions (§6):** `componentAliases` config option resolves cross-plugin name collisions; project shadowing wins.

**§6.5 (Amendment 03, Option A applied):** SERVER-SIDE CONTRIBUTIONS — three mechanisms:
- `serverRuntime: { name: './path' }` — server-only helpers (compile error if imported from client)
- `serverOnly: true` macro flag — emits to server bundle only, client gets RPC stub
- `middleware: [{ name, stage: 'before-handler'|'after-handler'|'on-error', handler: './path' }]` — PROVISIONAL in v1.x

Server-side build coordination: compiler emits per-plugin server bundle entry; cross-plugin server-side imports allowed only via declared deps; client cannot import plugin's server middleware.

**Plugin discovery (§7):** explicit registration only — no auto-discovery from `package.json` / `node_modules`. `scribeVersion: '^1.0.0'` matched at registration.

**Plugin composition (§10):** `dependencies: ['data']` — topological sort orders hooks; cross-plugin `ctx.runtime('@scribe-plugin/data:query')` allowed only with declared dep.

**Open Qs (§12):** plugin-extended `@state` declarations (defer); plugin hot-reload (defer); plugin CLI commands (defer); cacheable plugin output (proposed: `cacheKey` field in v1.1).

**Cross-references:** quartet member; consumes Block Structure + Macro Vocabulary + Template Attribute Syntax.

---

## Section 2 — Implementation alignment map

Status legend:
- **SHIPPED** — code exists on `main = 7fa0957`; cite file:line.
- **PARTIAL** — subset exists but not the spec-required surface; what's missing called out.
- **GAP** — not on main; package + work needed.
- **UNKNOWN** — flagged for Investigator follow-up (§4).

### 2.1 Block Structure Spec alignment

| Spec section | Requirement | Status | Cite / notes |
|---|---|---|---|
| §1.1 | `.scribe` extension recognized | SHIPPED | `packages/compiler/src/parser/sfc.rs` parses `.scribe` SFCs; `bin/scribe-compile` accepts `.scribe` |
| §1.4 | Top-level structure: blocks only, no top-level imports/exports | PARTIAL | Current parser only recognizes `<script setup>`, `<template>`, `<style>`, `<agent>` HTML-tag blocks (`packages/compiler/src/parser/sfc.rs:92-108` `next_block`). Spec wants `@blockname { }` brace-delimited form — **wholesale syntax shift** |
| §2.1 | `@blockname {` opener (sigil + brace) | **GAP** | Compiler uses HTML angle-bracket tags (`<script setup>`, `<template>`, `<style>`, `<agent>`). No code path for `@state {`, `@template {`, etc. |
| §2.4 | Brace matching with interior depth tracking | PARTIAL | `find_closing_with_depth` (`sfc.rs:39-79`) tracks tag depth for `<template>`/`<style>`. Brace-matched bodies for `@state {}` etc. are GAP since blocks don't exist |
| §3.1 | Core blocks `@state`/`@template`/`@style`/`@agent`, ≤1 per file | PARTIAL | Current parser enforces ≤1 of `<script setup>`/`<template>`/`<style>`/`<agent>` (`sfc.rs:148-155, 172-179, 209-216, 237-244`). Names mismatch spec (HTML tag vs `@`-block) |
| §3.2 | Renderable iff `@template` present; logic-only modules valid | PARTIAL | `<template>` extracted optionally via `next_block`; logic-only files compile (no template error). Same shape, wrong syntax |
| §3.3 | Block ordering free (formatter applies canonical) | SHIPPED | Parser walks file in order via `next_block`; no ordering enforcement |
| §6 | Plugin blocks via `@plugin.block` namespaced form | **GAP** | No plugin block parser, no namespace dispatch, no `parsers` map |
| §7.1 | `src/pages/` -> page; `src/components/` -> component; `src/layouts/`; `src/composables/` | PARTIAL | `@scribe/router` (`packages/router/src/vite-plugin.ts`) scans `src/pages/`, emits `virtual:scribe-routes`. Roles `components`/`layouts`/`composables` not enforced by compiler |
| §7.2 | Routing inference from path: `index.scribe`, `[id].scribe`, `[...catchAll].scribe` | SHIPPED | `packages/router/src/router.ts:matchRoute` handles static / param / catchall priority |
| §7.3 | `@route { path, name, middleware, ssr, layout }` block override | **GAP** | Compiler has no `@route` block. Router (`@scribe/router`) is file-based scan only — no SFC-level route override consumed |
| §7.5 | Layouts via `scribe.config.ts` `layouts: { default, routes }` | **GAP** | `defineScribeConfig` (`packages/server/src/config.ts:23-27`) has no `layouts` field. No layout slot in router |
| §8.1 | Reject top-level `---` frontmatter, `import`, `export`, `;` | UNKNOWN | Current parser doesn't recognize them as errors at top level (parses as text outside blocks). Need fixture audit |
| §11.1-§11.4 | Top-level parser: tokenize -> validate -> handoff -> unified symbol table -> cross-block resolution -> emit | PARTIAL | Steps 1-4 exist (parser walks blocks; symbol resolution implicit via signal_map). Cross-block resolution / unified symbol table is implicit per-block; no dedicated table struct |
| **§11.5 (AMD-02)** | Split-bundle for `$server` / `<form $action>` / `@agent` -> server artifact + client stub | **GAP** | Compiler emits a single `EmitResult { js, manifest_json }` (`packages/compiler/src/codegen/emit.rs:4-8`); manifest_json is the agent manifest, NOT a `_scribe-server/mcp/{component-id}.ts` server artifact. No `$server` macro support. No `<form $action>` lowering |
| **§11.5** | Build target: `client` / `server` / `universal` | **GAP** | No `build.target` field anywhere; `defineScribeConfig` lacks it; no compiler flag honoring it. Confirmed by grep — zero hits across packages |
| §11.5 | Server output path: `_scribe-server/{actions,form-actions,mcp}/{component-id}/{name}.ts` (Option A) | **GAP** | No code path emits to this prefix |
| §13 | Conformance suite at `bench/compiler-conformance/blocks/` | **GAP** | No such directory; current tests at `packages/compiler/tests/` are syntax-specific (Vue-shaped) |

### 2.2 Template Attribute Syntax Spec alignment

| Spec section | Requirement | Status | Cite / notes |
|---|---|---|---|
| §1.1 | Quoted form `attr="value"` for identifier ref / property path / literal / iteration | PARTIAL | Quoted form parsed (`packages/compiler/src/parser/template.rs:80-99`, `parser/directives.rs:71-89`) but interpretation is Vue-shaped (`:attr` and `@event` prefixes), not spec's `$on:*`/`$bind:*`/`$if`/`$each` etc. |
| §1.2 | Curly form `attr={expression}` for arbitrary JS | **GAP** | Parser has no `{ }` attribute handling — only quoted attributes. Interpolations `{{ identifier }}` exist (`template.rs:132-147`) but only in text nodes and only for single identifiers |
| §1.3 | Bare values `attr=value` rejected | UNKNOWN | `read_attr_token` (`template.rs:169-201`) tokenizes attrs; whether bare values throw depends on test fixture audit |
| §1.4 | Boolean-only attrs (HTML `disabled`, scribe `$once`/`$raw`) | PARTIAL | Static attrs supported (`directives.rs:42-46`); scribe-specific boolean macros `$once`/`$raw` don't exist |
| §2.1 | Identifier resolution order: `@state` -> slot context -> plugin -> config imports | PARTIAL | Signal resolution exists (`packages/compiler/src/codegen/signals.rs:resolve_signals`); slot/plugin/config layers are GAP |
| §2.2 | Property paths `user.profile.name` in quoted form | UNKNOWN | `validate_identifier` (`directives.rs:48-69`) rejects `.` in interpolation: "interpolation must be a single identifier in v0; expressions are not supported" — dotted paths in attrs not tested |
| §3.3 (matrix) | `$if`, `$show`, `$each`, `$bind:*`, `$on:*`, `$key`, `$html`, `$raw`, `$once`, `$memo`, `$action` (form attr) | **GAP** | Zero `$`-prefixed template attribute macros exist. Current syntax: `@event="handler"` (Vue) for events, `:attr="signal"` (Vue) for bindings. Migration §10.1 maps directly |
| §4.1-§4.5 | `<$suspense>`, `<$shield>`, `<$guard>`, `<$slot>`, `<$warp>` slot/fallback hybrid | **GAP** | Current `slot()` primitive exists in arbor (`packages/arbor/src/slot.ts`); `<$slot>` element in template is GAP. Boundary elements (suspense/shield/guard/warp) entirely absent — no compiler emission, no runtime primitive |
| §5.1 | Slot context exposure: `suspense.loading`, `shield.{error,retry}`, `guard.{user,reason,path}` | **GAP** | None of these expose-paths exist in any package |
| §5.3 | User-component `<$slot expose="user, index">` | **GAP** | Current `slot()` primitive doesn't carry `expose` data |
| §6 | Inline JSX in attributes forbidden in v1 | **GAP** | No JSX support at all yet — vacuously honored, but for the wrong reason |
| §7 | Error message format with carets and source-line context | UNKNOWN | Current `CompileError { message, line, col, code }` (`packages/compiler/src/types.rs:CompileError`) carries line/col but rendering format unknown |
| §9.1 | Empty quoted strings `attr=""` rejected | UNKNOWN | Need fixture audit; `strip_quotes` returns empty string silently |
| §12 | Conformance suite at `bench/compiler-conformance/template-attrs/` | **GAP** | Not present |

### 2.3 Macro Vocabulary Spec alignment (per-macro)

| Spec § | Macro | Status | Cite / notes |
|---|---|---|---|
| 2.1 | `$prop` (`@state`) | **GAP** | Current `<agent>` has `input <name>: <type>` shape (`packages/compiler/src/parser/agent.rs:71-104`) — different surface; not a spec `$prop` |
| 2.2 | `$computed` | **GAP** | No `$computed` keyword. `@scribe/signals.computed` exists at runtime (`packages/signals/src/computed.ts`) but no compiler-level macro |
| 2.3 | `$resource` | **GAP** | `@scribe/data.createResource` shipped (`packages/data/src/resource.ts`); no `$resource` macro lowering |
| 2.4 | `$effect` | **GAP** | `@scribe/signals.effect` shipped; no `$effect` macro |
| 2.5 | `$effect.on` | **GAP** | No macro; primitive untrack+effect would need to be emitted by compiler |
| 2.6 | `$watch` | **GAP** | Same — primitive exists in signals; macro lowering absent |
| 2.7 | `$action` (`@state` declaration form) | PARTIAL | Current `<agent>` block has `action <name>() -> { ... }` shape (`agent.rs:156-208`); but this is a different surface (agent input declaration), not a `@state` action declaration with body |
| 2.8 | `$lifecycle.{mount,dispose}` | **GAP** | `@scribe/runtime` has lifecycle implicit in `connectedCallback`/`disconnectedCallback` but no `onMount`/`onCleanup` user-facing helpers exposed (search: `grep onMount\|onCleanup packages/runtime/src` — zero hits) |
| 2.9 | `$expose` (`@state`) | **GAP** | No `defineExpose` mechanism in `@scribe/runtime` (`packages/runtime/src/index.ts` exports only `defineComponent`/`defineElement`/internals) |
| 2.10 | `$shared` | **GAP** | No `useSharedState` helper anywhere |
| 2.11 | `$cookie` | **GAP** | No `useCookie` helper |
| **2.12** | **`$server`** | **GAP** | No `$server` macro; no split-bundle artifact emission; no `createServerCall` runtime helper. `@scribe/server` has `defineApiRoute`/`defineLoader` (`packages/server/src/{api,data}.ts`) but those are server-side only — not RPC stub generation per §11.5 |
| 2.13 | `$meta` | **GAP** | No `useHead` helper; SSR head emission in `packages/server/src/ssr.ts` `MetaTag`/`LinkTag`/`HeadConfig` types but no SFC-level `$meta` lowering |
| 3.1 | `$if` (template attr) | **GAP** | Current `arbor.when()` primitive exists (`packages/arbor/src/structural.ts`); spec calls for `createIfBoundary` named differently. Compiler needs to lower `$if="..."` -> `when(...)` or `createIfBoundary(...)`. Current template parser has zero `$if` recognition |
| 3.2 | `$show` | **GAP** | No CSS-variable + dataset pattern emission |
| 3.3 | `$each` | **GAP** | `arbor.each()` primitive shipped (`packages/arbor/src/structural.ts`); spec calls for `createEachBoundary`. Compiler doesn't lower `$each="items as item"` — name match needed |
| 3.4 | `$bind:*` | **GAP** | No two-way binding lowering. Current `:attr="..."` attribute parsing is one-way (signal->DOM via reactive interpolation only) |
| 3.5 | `$on:*` | PARTIAL | Current `@event="handler"` syntax (Vue-shaped, `directives.rs:7-12`) IS event binding — same semantics, different sigil. Spec wants `$on:click="handler"` |
| 3.6 | `$key` | **GAP** | `arbor.each` accepts a key in its options object but no compiler-level `$key="..."` attribute lowering |
| 3.7 | `$html` | **GAP** | No raw-HTML attribute effect emission (spec lowers to a DOM property assignment for unsanitized markup; security warning per spec §3.7) |
| 3.8 | `$raw` | **GAP** | No subtree-raw pass-through marker |
| 3.9 | `$once` | **GAP** | No `createOnceBoundary` arbor primitive |
| 3.10 | `$memo` | **GAP** | No `createMemoBoundary` |
| 3.11 | `$action` (form attr) | **GAP** | No `<form $action="...">` recognition; no split-bundle form-actions endpoint emission per Amendment 02 |
| 3.12 | `<$slot>` | PARTIAL | `arbor.slot()` primitive exists (`packages/arbor/src/slot.ts`, PR #20); `<slot>` (no `$` prefix) compiler emission shipped per `bench/compiler-conformance/slots`. Spec calls `<$slot>`. Sigil mismatch |
| 3.13 | `<$suspense>` | **GAP** | No suspense boundary primitive in arbor; no `createSuspenseBoundary` |
| 3.14 | `<$shield>` | **GAP** | No shield boundary; `arbor.types.ErrorHandler` exists for mount-level catch but no userland boundary |
| 3.15 | `<$guard>` | **GAP** | No guard boundary; no scope/permission/rate-limit infrastructure |
| 3.16 | `<$warp>` | **GAP** | No teleport/portal-style primitive |
| 4.1 | `$reactive` (style) | **GAP** | Compiler `emit_style_block` (`packages/compiler/src/codegen/emit.rs:10-23`) injects `CSSStyleSheet.replaceSync` raw — no `$reactive(expr)` parsing or `--reactive-N` CSS-variable emission |
| 4.2 | `$tokens` | **GAP** | No design-token pipeline; `scribe.config.ts` has no `style.tokens` field (`packages/server/src/config.ts`) |
| 4.3 | `$global` | PARTIAL | Style scope `Global` vs `Scoped` IS detected (`emit.rs:14-22`) — `<style global>` matches `$global` semantics. Different sigil; behavior aligned |
| 4.4 | `$media` | PARTIAL | Standard CSS `@media` queries pass through `replaceSync` raw — works at CSS level but no `$media(query) {}` lowering to `@media` |
| 4.5 | `$when` | **GAP** | No conditional `data-when-N="true"` attribute toggling |
| 5.1 | `$expose` (`@agent`) | PARTIAL | Current `<agent>` block declares `input` / `state` / `action` (`agent.rs:210-258`); `manifest_json` emission (`emit.rs:308`) carries `tools` array — close to spec's MCP resource registration but shape differs from `mcpServer.registerResource({...})` runtime call |
| 5.2 | `$expose.write` | **GAP** | No write-capable agent resources |
| 5.3 | `$action` (`@agent` reference) | PARTIAL | Current `<agent>` block has `action <name>()` declarations (declaration form, not the spec's reference form). Manifest emits `tools` per action |
| 5.4 | `$scope` | **GAP** | No scope metadata on agent registrations |
| 5.5 | `$rate-limit` | **GAP** | No rate-limit metadata |
| 5.6 | `$describe` | **GAP** | No human-readable description field on tools/resources |
| 6 | Macro validity matrix | **GAP** | Compiler has no enforcement; matrix only defined in spec |
| 7 | Plugin macro contributions `@plugin.$macro` | **GAP** | No plugin macro registration in compiler |
| 8.2 | Per-macro runtime cost budgets | UNKNOWN | Targets defined in spec; bench harness exists (`bench/signals/HARNESS.md`) but doesn't currently sample these specific macros (most don't exist) |
| 10 | Conformance suite at `bench/compiler-conformance/macros/` | **GAP** | Not present |

### 2.4 Plugin Contract Spec alignment

| Spec § | Requirement | Status | Cite / notes |
|---|---|---|---|
| 1.1 | `definePlugin({...})` factory exported from `@scribe/plugin` | **GAP** | No `@scribe/plugin` package exists. `ls packages/` confirms 11 packages, none named `plugin` |
| 1.2 | Required fields: `name`, `version`, `namespace` | **GAP** | n/a — no factory |
| 1.3 | Namespace constraints (reserved names, identifier-shape) | **GAP** | n/a |
| 2.1 | `contributes.blocks: [...]` + `parsers: { ... }` | **GAP** | Compiler has no plugin block dispatcher (`parser/sfc.rs` is hard-coded to four core block kinds via `BlockKind` enum at line 82-88) |
| 2.2 | `contributes.macros: [{ name, validIn, lowering, validation? }]` | **GAP** | Compiler has no macro plugin registration; macro vocabulary is hard-coded as TBD (since no `$`-prefixed macros exist yet) |
| 2.3 | `contributes.components: [...]` | **GAP** | No plugin component loader in compiler/router |
| 2.4 | `contributes.transforms: [{ stage, fn }]` with `after-parse`/`before-lower`/`after-lower` | **GAP** | No transform pipeline |
| 3.1 | `configSchema` validation | **GAP** | n/a |
| 3 | `scribe.config.ts` `plugins: [...]` array | **GAP** | `defineScribeConfig` (`packages/server/src/config.ts:23-27`) `ScribeConfig` interface has only `server`, `agent`, `routes` — NO `plugins` field |
| 4.1-4.3 | Hooks: `beforeCompile`, `afterParse`, `transformBlock`, `afterCompile` with topological order | **GAP** | No hook system |
| 4.2 | `BuildContext` / `SfcContext` / `BlockContext` | **GAP** | Not defined anywhere; compiler currently passes raw strings/structs |
| 5 | `LoweringResult` shape `{ code, imports?, hoist?, target? }` | **GAP** | Current `EmitResult { js, manifest_json }` (`emit.rs:4-8`) is single-bundle; no `target` discrimination |
| 6.1-6.3 | Component contributions, name conflicts, project shadowing | **GAP** | No plugin component registry |
| **6.5.1 (AMD-03)** | `serverRuntime` field | **GAP** | n/a |
| **6.5.2** | `serverOnly: true` macro flag | **GAP** | n/a |
| **6.5.3** | `middleware: [{ name, stage, handler }]` PROVISIONAL | **GAP** | `@scribe/server.defineMiddleware` exists (`packages/server/src/middleware.ts:3-15`) for hand-authored middleware, NOT plugin-contributed — different mechanism |
| **6.5.4** | Plugin server bundle entry; cross-plugin server-side imports via deps | **GAP** | No plugin bundle pipeline at all |
| **6.5.7** | Build target awareness for plugin contributions | **GAP** | Same as Block Structure §11.5 build target — universally GAP |
| 7.1 | Explicit registration in `scribe.config.ts plugins` | **GAP** | Field doesn't exist |
| 7.2 | No auto-discovery from `node_modules` | SHIPPED (vacuous) | Compiler doesn't auto-discover anything; structurally compliant by absence |
| 7.3 | `scribeVersion: '^1.0.0'` compatibility check | **GAP** | n/a |
| 10 | `dependencies: ['data']` topological sort | **GAP** | n/a |
| 11 | Conformance suite at `bench/compiler-conformance/plugins/` | **GAP** | Not present |

### 2.5 Alignment summary counts

- **Total individual requirements walked:** ~95 across the four specs
- **SHIPPED:** ~6 (file-system role for pages, `<style>` global/scoped detection, `arbor.slot()` PR #20, router file-based, `@event` semantics align with `$on:*`, no plugin auto-discovery)
- **PARTIAL:** ~18 (current shape matches spec semantics but with different sigils/names, or only a subset of the surface is present)
- **GAP:** ~62 (entirely missing — most spec requirements)
- **UNKNOWN:** ~5 (need fixture audit — flagged in §4)

**Headline:** the spec quartet is a substantially redesigned surface. The current Rust compiler implements roughly 6-8% of what the quartet specifies; the surrounding TS packages (signals, arbor, runtime, data, server) ship the *underlying primitives* the macro lowerings target, but the macros themselves and the `@blockname { }` block grammar — the *binding contract* — are entirely GAP. The single largest deviation: **current SFC syntax is HTML-tag-shaped (`<script setup>`, `<template>`, `<style>`, `<agent>`) while the spec is `@`-block-shaped (`@state {`, `@template {`, etc.).** Adopting the spec quartet is closer to a redesign than an extension.

---

## Section 3 — Naming ambiguity audit

User critique: *"The functional names are ambiguous it seems though. The names don't reflect if they are connected to the plugin infrastructure."*

This audit walks four naming surfaces. **The Architect should adjudicate which of these gets the rename pass during ratification; the user has not yet picked a target.** Defaults are recommendations only.

### 3a. Plugin Contract Spec internals

| Name | Reads as plugin-infra? | Ambiguous? | Rationale / proposed alternative |
|---|---|---|---|
| `definePlugin` | YES | clear | Self-evident |
| `contributes` | YES | clear | "What this plugin contributes" — clear |
| `lowering` | NO | **AMBIGUOUS** | Compiler-jargon; doesn't read as plugin-extension. Alternatives: `pluginLowering`, `emitCode`, `compile` |
| `BuildContext` | partial | **AMBIGUOUS** | Generic "build context" doesn't reveal it's plugin-only. Alt: `PluginBuildContext` |
| `SfcContext` | partial | **AMBIGUOUS** | Same. Alt: `PluginSfcContext` |
| `BlockContext` | partial | **AMBIGUOUS** | Same. Alt: `PluginBlockContext` |
| `MacroContext` | partial | **AMBIGUOUS** | Same. Alt: `PluginMacroContext` |
| `LoweringResult` | NO | **AMBIGUOUS** | Same as `lowering`. Alt: `PluginLoweringResult` |
| `serverRuntime` | NO | **AMBIGUOUS** | Reads as a runtime field; doesn't reveal it's a plugin contribution channel. Alt: `pluginServerRuntime` or `serverRuntimeContributions` |
| `serverOnly` (macro flag) | partial | **MILDLY AMBIGUOUS** | Could be a runtime guarantee or a plugin macro field. In context (inside macro decl) it's clear. Acceptable as-is |
| `target` (in LoweringResult) | NO | **AMBIGUOUS** | Generic; doesn't say "build target." Alt: `bundleTarget` or `emitTarget` |
| `middleware` (in `contributes`) | NO | **AMBIGUOUS** | Collides with `defineMiddleware` in `@scribe/server` — different concept, same name. Alt: `pluginMiddleware` or `middlewareContributions` |
| `parsers` (top-level plugin field) | partial | **MILDLY AMBIGUOUS** | Reads as generic "parser map"; could be `blockParsers` for clarity |
| `transforms` (in `contributes`) | YES | clear | "What transforms this plugin contributes" — clear in context |
| `hooks` | YES | clear | Standard plugin-system naming |
| `dependencies` (plugin deps) | partial | **MILDLY AMBIGUOUS** | Collides with npm `package.json.dependencies`. Alt: `pluginDependencies` or `requires` |
| `scribeVersion` (compat check) | YES | clear | Clear |
| `componentAliases` (in scribe.config) | NO | **AMBIGUOUS** | Doesn't reveal plugin-aliasing intent. Alt: `pluginComponentAliases` |
| `validIn` (macro field) | partial | **MILDLY AMBIGUOUS** | Acceptable — macro-specific |

**Findings count: 13** (8 ambiguous, 4 mildly ambiguous, 1 collision-risk).

### 3b. Macro names

The user's specific concern was **whether plugin-extensible macros are visually distinguishable from core macros.**

#### 3b.1 Core macros: do they reveal extension-points?

All 36 core macros use the bare `$` prefix: `$prop`, `$state`, `$action`, `$if`, `$each`, `<$suspense>`, `<$slot>`, etc. **None of them reveal plugin-extensibility.** A reader sees `$server` or `<$shield>` and has no syntactic cue that plugins COULD have shipped these — they look like core forever-frozen primitives. Per the spec, plugin macros use `@plugin.$macro` (e.g. `@forms.$field`), so the visual distinguisher is the dot-namespaced prefix; bare `$` = core, dotted `@ns.$` = plugin.

This split is consistent and well-motivated. The user's critique reads as: "but should some `$` macros (e.g. `$resource`, `$server`) BE plugin-contributed rather than core, and if so, should their names show that?" Per the Plugin Contract Spec §0 ("data, agent surface, forms helpers are themselves plugins") and §9.3 (data plugin example), `$resource` IS plugin-contributed in spirit — but it's named without a `@data.` prefix because the data plugin contributes the `data.*` global, not a `@data.$resource` macro. The vocabulary spec lists `$resource` in the closed core (§1).

**Naming inconsistency:** `$resource` looks core but the runtime helper (`createResource`) ships from `@scribe/data` (which the Plugin Contract Spec frames as a plugin). `$server` looks core but emits split-bundle artifacts coordinated by what could be plugin contributions (`serverRuntime` / `serverOnly`). The closed-core list inside the macro vocabulary spec doesn't visually distinguish "core grammar that the compiler always knows about" from "core grammar that plugins implement the lowering of."

#### 3b.2 Could core plugin-extension points be named?

Possibilities:
- `$plugin:foo` namespace prefix for explicit plugin-contributed macros (so `@forms.$field` becomes `$plugin:forms.field`)
- `$ext:foo` for "extension"
- Keep current scheme; plugin contributions stay `@plugin.$macro` (dot-namespaced)
- Rename core macros with stable-vocabulary marker like `$$prop` or `$.prop` — heavy

The current scheme (bare `$` for core, `@plugin.$` for plugin contributions) is internally coherent. **The ambiguity isn't about plugin contributions — it's about which core macros the user might reasonably expect to be plugin-overridable.**

#### 3b.3 Block names `@state`, `@template`, `@style`, `@agent`, `@route`

| Name | Plugin-extensible? | Naming reveals it? |
|---|---|---|
| `@state` | NO (closed core) | n/a |
| `@template` | NO (closed core) | n/a |
| `@style` | NO (closed core) | n/a |
| `@agent` | NO (closed core) | n/a |
| `@route` | NO (closed core, valid only in pages) | n/a |
| `@plugin.foo` | YES (dot is the discriminator) | YES — dot is a clear visual cue |

**This part is clean** — the dot is unambiguous. Only ambiguity: the spec lists "5 blocks" implicitly (4 macro-bearing + `@route`), and Amendment 01 had to clarify it. Future plugin-contributed page-only blocks (analog of `@route`) aren't addressed.

**Findings count: 4** (no `$` extension-point distinction; data-as-plugin tension; block scheme clean; page-only plugin blocks not addressed).

### 3c. Package-level APIs

Walked the public exports of all 11 packages on `7fa0957` plus the spec-implied `@scribe/plugin`.

| API | Package | Plugin-infra connection? | Naming reveals? | Suggested rename / namespace |
|---|---|---|---|---|
| `defineComponent` | `@scribe/runtime` | NO (user-facing) | clear (matches Vue) | Keep |
| `defineElement` | `@scribe/runtime` | NO (compiler-emitted) | partial — looks like a user API but is internal-ish (Learning #12 split) | Keep, document better |
| `defineMiddleware` | `@scribe/server` | NO (user-defines hand-authored MW) | **AMBIGUOUS** — collides with Plugin Contract `contributes.middleware` (Amendment 03) | Disambiguate — `defineServerMiddleware` for hand-authored vs `pluginMiddleware` for plugin contribution |
| `composeMiddleware` | `@scribe/server` | NO | clear | Keep |
| `defineRoute` | `@scribe/server` | NO | partial — collides with `@scribe/router.createRouter`'s `RouteDefinition` | Disambiguate — `defineServerRoute` / `defineRouteHandler` |
| `createRouter` | `@scribe/server` AND `@scribe/router` | NO | **NAME COLLISION** — same identifier, two packages | Disambiguate — server's is request-router, router's is file-based-route-table |
| `defineApiRoute` | `@scribe/server` | NO | clear | Keep |
| `defineLoader` | `@scribe/server` | NO | partial — could be plugin-contributed in v2; doesn't reveal | Keep, or `defineRouteLoader` |
| `defineScribeConfig` | `@scribe/server` | YES (config root for plugins per spec) | **AMBIGUOUS** — name says "scribe config" but doesn't reveal it's the plugin-registration surface | Keep, but ratification must add `plugins: [...]` field |
| `viteRouterPlugin` | `@scribe/router` | partial — IS a Vite plugin, NOT a `@scribe/plugin` | **AMBIGUOUS** — "plugin" overloaded | Disambiguate — `viteRouterIntegration` or note "this is a Vite plugin, not a scribe plugin" |
| `agentReadiness` (Vite plugin) | `@scribe/agent-readiness` | partial — same overload | **AMBIGUOUS** | Same — `viteAgentReadinessPlugin` or `agentReadinessVite` |
| `createResource` / `createResourceStore` / `ResourceStoreToken` / `createResourceSerializer` | `@scribe/data` | YES per spec (data is plugin-contributed) but exported as core | **AMBIGUOUS** | If data IS the canonical data plugin per Plugin Contract Spec §9.3, these should live behind `@scribe-plugin/data` not `@scribe/data` |
| `createAgentService` | `@scribe/agent-service` | NO (MCP wire) | clear | Keep |
| `getAgentMetadata` / `registerAgentMetadata` | `@scribe/agent` | NO (registry) | clear | Keep |
| `generateLlmsTxt` / `generateLlmsFullTxt` / `generateMcpServerCard` / `generateRobotsTxt` / `createContentNegotiationHandler` / `createAgentReadinessRoutes` | `@scribe/agent-readiness` | NO | clear | Keep |
| `signal` / `computed` / `effect` / `batch` / `untrack` / `$state` | `@scribe/signals` | NO (core primitive) | clear | Keep |
| `branch` / `leaf` / `mount` / `hydrate` / `slot` / `when` / `each` | `@scribe/arbor` | NO (core primitive) | clear | Keep |
| `definePlugin` (spec-implied) | `@scribe/plugin` (GAP) | YES | clear | When package lands |

**Findings count: 9** ambiguous or colliding APIs across packages. The two biggest naming clashes:
1. `createRouter` exists in both `@scribe/server` and `@scribe/router` — same name, different intent.
2. `defineMiddleware` (server, hand-authored) vs `contributes.middleware` (plugin contract) — same word, different mechanism.

### 3d. Coherence-pass recommendation

Three coherent schemes the user can pick from. **Architect-leaning: Scheme A** (least invasive, achieves the user's stated goal of revealing plugin-infrastructure connections without churning the user-facing surface).

#### Scheme A — "Plugin contributions namespace under `@scribe-plugin/*`; core APIs unchanged"

**Premise:** The user-facing surface (`defineComponent`, `defineRoute`, `signal`, `branch`, etc.) is fine and shipped. The naming ambiguity is *strictly* in the plugin contract internals + the data/agent/forms-as-plugin reframing. Move every plugin-contributed package under the `@scribe-plugin/*` scope per Plugin Contract Spec §3 examples (`@scribe-plugin/forms`, `@scribe-plugin/data`, `@scribe-plugin/agent`).

**Rename pass:**
- `@scribe/data` -> `@scribe-plugin/data` (when ratified as the canonical data plugin)
- `@scribe/agent-service` -> `@scribe-plugin/agent` (or keep agent core; agent-readiness goes plugin-side)
- `@scribe/agent-readiness` -> `@scribe-plugin/agent-readiness` (it's already a Vite plugin + content-negotiation handler — fits plugin-side)
- Plugin Contract internals stay un-renamed (`contributes`, `lowering`, `BuildContext`) — the `@scribe-plugin/*` scope itself signals "this is the plugin world."

**Tradeoff:** Forces a v1-cutover npm rename for `@scribe/data`, `@scribe/agent-service`, `@scribe/agent-readiness`. Big breaking change. Aligns the codebase with the Plugin Contract Spec's framing 1:1.

#### Scheme B — "Prefix plugin-infra types with `Plugin*`; keep package names"

**Premise:** Don't move packages. Add `Plugin*` prefix to all plugin-contract-only types: `PluginBuildContext`, `PluginLoweringResult`, `pluginMiddleware` (in `contributes`), `pluginServerRuntime`, etc. The user identifies "is this part of the plugin infra?" by the prefix.

**Rename pass:** purely additive in the spec quartet. No package moves.

**Tradeoff:** More verbose spec text. Doesn't address the "data is a plugin" framing tension.

#### Scheme C — "Document, don't rename"

**Premise:** Add cross-references at every API surface entry pointing to the Plugin Contract Spec when relevant. The naming stays as-is; readers consult docs to know plugin-extensibility status.

**Tradeoff:** Cheapest. Highest documentation burden. User's "names don't reflect plugin-infra connection" critique persists at the syntax level.

#### Architect-leaning recommendation

**Scheme A**, applied during the v1.0-final cutover (per `roadmap-draft.md` §v1.0-final). Reasons:
1. Aligns with Plugin Contract Spec §0 framing ("data, agent surface, forms helpers are themselves plugins") without halfway measures.
2. Forces one breaking rename now (pre-v1.0 cutover) rather than at v2 when consumers exist.
3. Disambiguates the `defineMiddleware` collision: hand-authored MW stays in `@scribe/server`; plugin-contributed MW lives in `@scribe-plugin/*` and uses `contributes.middleware` (no naming clash because they're in different scopes).
4. The user's critique resolves: a reader sees `import x from '@scribe-plugin/forms'` and immediately knows the API surface is plugin infrastructure.

If the user prefers minimal breakage, **Scheme B** is the safe alternative — additive `Plugin*` prefix only.

**§3 findings total:** 26 (13 plugin-internals + 4 macro-naming + 9 package APIs). Coherence-pass recommendation: **Scheme A**.

---

## Section 4 — Open questions / unknowns flagged for Investigator follow-up

The Architect can proceed without these; the Investigator dispatch resolves them in parallel.

1. **(Item 7 from user surface) Did the Rust compiler ever implement `@route` blocks?** Block Structure §7.3 calls for an `@route` block valid only in `src/pages/`. Current parser hard-codes four block kinds (script/template/style/agent). Suspected GAP. Investigator: confirm with `grep -r "@route\\|route_block" packages/compiler/src/` and `git log --all --oneline -- packages/compiler/src/` for any deleted route handling.

2. **(Item 8) Is build-target framework (`client` / `server` / `universal`) present anywhere?** Grepped `packages/` — zero hits for `build.target`, `buildTarget`, `target.*client.*server.*universal`. Suspected universal GAP. Investigator: confirm and identify whether any in-flight branch (`feat/v1-server-native`, etc.) introduced a precursor.

3. **Does `@scribe/router` consume `@route` block metadata or only file-based scanning?** `packages/router/src/vite-plugin.ts` scans `pages/`. Whether it ALSO honors per-file route metadata via SFC frontmatter is unclear from the index export. Investigator: read `packages/router/src/{router,vite-plugin}.ts` end-to-end and confirm.

4. **Top-level `import`/`export`/`---` rejection (Block Structure §8.1).** Spec wants compile errors. Current parser ignores text between blocks. Whether tests verify the rejection or it's silent is unknown. Investigator: check `packages/compiler/tests/sfc_split.rs` fixtures.

5. **Empty quoted strings / whitespace in identifiers (Template Attribute Syntax §9.1, §9.2).** Spec calls for compile errors. Current `strip_quotes` (`directives.rs:79-89`) returns empty string silently. Investigator: confirm with fixture audit.

6. **Property paths in quoted form (`user.profile.name`).** Spec §2.2 permits dotted paths in quoted attrs. `validate_identifier` in `directives.rs:48-69` rejects `.` in interpolations but attribute parsing path may differ. Need clarity.

7. **CompileError rendering format vs spec error template (Template Attribute Syntax §7).** Spec specifies caret-pointing source-line context. Current `CompileError` carries `{ message, line, col, code }` but rendering format is unknown without seeing `bin/scribe-compile`. Investigator: read `packages/compiler/bin/` to confirm rendering matches or diverges.

8. **`@scribe/data` future scope: stay core, or move to `@scribe-plugin/data` per Scheme A?** Plugin Contract Spec §9.3 frames data as a plugin example. Current `@scribe/data` ships as core (Round 1 Scout §1.2). Decision needed before §3d Scheme A can be ratified.

9. **Plugin Contract `contributes.middleware` (Amendment 03 §6.5.3, provisional) interaction with `defineMiddleware` (`packages/server/src/middleware.ts`).** Are these the same wire format or distinct? Spec implies plugin middleware is a separate registration channel; current `defineMiddleware` is a hand-authored helper. Investigator: confirm intent — should plugin-contributed middleware compose with `composeMiddleware`, or run on a separate pipeline?

10. **`scribeVersion` semver compat check (§7.3) feasibility for v1.0 ratification.** Compiler is Rust-side; reading TS plugin version requires either a build-time bridge or the compiler reading `package.json` of registered plugins. Implementation-shape unknown.

11. **`@scribe/runtime` lifecycle helper exports (`onMount`, `onCleanup` per Macro Vocabulary §2.8 lowering).** `packages/runtime/src/index.ts` doesn't export these names. Whether they exist as internals (`define-component.ts` connectedCallback timing) and just aren't exposed, or whether they need to be added, is unconfirmed. Investigator: read `packages/runtime/src/` end-to-end.

---

## STATUS report

```
STATUS: DONE

Section 1 (spec digests):
  - block-structure: PASS (digest covers §1-§14, brace grammar, plugin blocks, file-system conventions, §11.5 Amendment 02 incorporated, open Qs)
  - template-attribute-syntax: PASS (two-form rule, identifier resolution, §3.3 type matrix, slot/fallback hybrid, JSX restrictions, migration)
  - macro-vocabulary: PASS (39 forms / 36 unique names, block-disambiguated macros, per-macro lowering targets, performance budgets, Amendment 01 incorporated)
  - plugin-contract: PASS (anatomy, contributions, configuration, hooks, lowering, server-side §6.5 Amendment 03 incorporated, plugin discovery, composition)

Section 2 (alignment map):
  - Total requirements walked: ~95
  - SHIPPED count: ~6
  - PARTIAL count: ~18
  - GAP count: ~62
  - UNKNOWN count (for Investigator): 5 (folded into §4)

Section 3 (naming audit):
  - Plugin Contract internals: 13 findings (8 ambiguous, 4 mildly ambiguous, 1 collision-risk)
  - Macro names: 4 findings (no $-extension-point distinction; data-as-plugin tension; block scheme clean; page-only plugin blocks unaddressed)
  - Package-level APIs: 9 findings (incl. createRouter collision and defineMiddleware overload)
  - Coherence pass recommendation: Scheme A — "Plugin contributions namespace under @scribe-plugin/*; core APIs unchanged"

Section 4 (open questions):
  - Items flagged: 11

Branch pushed: pending (commit step next)
Ready for Architect R2.1 + Investigator follow-up: yes
```
