# The @state Reactive-Declaration Model — normative specification

**Status:** NORMATIVE — founder-ratified 2026-07-21. This document transcribes the ratified
design; it is the single source of truth for the builders. It does not redesign.
**Branch:** `docs/state-model-spec` off `origin/main@9e6ddbfd`.
**Charter:** `00-charter.md`. **Tracking:** #487.
**Verification note:** every `file:line` reference in this document was read against this
worktree at `9e6ddbfd` on 2026-07-21; the migration counts in §7 were measured by grep on
the same tree (and on the fellwork-web tree for the cross-repo numbers).

**Provenance markers used throughout:**
- **[R]** — founder-enumerated, verbatim from the ratified design.
- **[R→]** — not separately enumerated by the founder, but mechanically entailed by the
  ratified axes applied to vocabulary that already exists in the compiler. These are
  transcriptions, not additions; each is individually flagged so ratification review can
  veto any of them without touching the rest. Entailments substantial enough to warrant an
  explicit founder look are additionally listed in §9.
- **[S]** — a shape this spec was directed to pick and justify (exact statement-call
  spellings, diagnostic code numbers, severity choices).

---

## §1 The two axes and the one rule

> **A `@state` declaration factors into two orthogonal axes: nature — `const` (read-only)
> or `let` (mutable), the TS keyword, the same vocabulary `@template` uses — and role —
> expressed by compiler-recognized wrapper functions, not `$`-macros. Every declaration is
> valid TypeScript. `$` retires from `@state` entirely.** [R]

```ts
@state {
  const city = prop<string>({ default: 'London', describe: 'City to forecast' })
  const withTax = derived(() => price * 1.2)
  const fetchForecast = action({ describe: 'Fetch the forecast' }, async () => { … })
  let loading = state(false)

  let rowKey = null            // bare let: plain JS, inert — untouched (§1.3)
  const FMT = { unit: '°F' }   // bare const: plain JS, inert — untouched
}
```

Normatively:

1. **Nature is the keyword.** `const` declares a binding that is never assigned inside the
   component; `let` declares one that is. This is the same axis the template grammar
   ratified for `@template` locals — one vocabulary, both surfaces. Role wrappers
   constrain which natures are legal (§2 per-wrapper; violations are C624).
2. **Role is a wrapper function.** `state(…)`, `prop(…)`, `derived(…)`, `action(…)`,
   `resource(…)`, `stream(…)`, `controller(…)` are **compiler-intrinsic** identifiers,
   recognized in `@state` binding position. They are valid TS call expressions — the
   Svelte-5-runes / SolidJS pattern — so the file parses with any TS tooling, and the
   sidecar type-checks them via declared intrinsic signatures (§5). There is no runtime
   dictionary and no import required for the intrinsics; an authored import that shadows
   an intrinsic name is respected (the wrapper is then NOT recognized — plain JS wins,
   same shadowing discipline as `expr/rewrite.rs`). [R]
3. **One signature: `wrapper(config?, valueOrFn)`.** The optional metadata bag comes
   FIRST, the running code LAST — the `node:test`/`Deno.test` precedent, chosen because
   action/resource bodies routinely run tens of lines and a trailing config after a long
   body is invisible at the call site. This is deliberately NOT the options-last
   convention Solid and Vue use, so the compiler ships a swapped-args diagnostic with
   auto-fix (§4.5, C622). [R]
4. **Explicit reactivity.** Reactive mutable state is declared `let x = state(v)` —
   naked, no `$`. Bare `let` is NOT auto-reactive. [R] Rationale, as ratified:
   - Svelte 4→5 **reversed** magic-`let` into opt-in runes; the lesson recorded by the
     Svelte team is that "the magic is `count += 1`, not `let count`" — the write is the
     interesting event, the declaration should say what it is.
   - Vue proposed and then **withdrew** `$ref` reactivity transform for the same
     reason: invisible reactivity at the declaration site does not survive contact with
     plain-JS refactoring.
   - aihu's own corpus depends on inert `let`: ~1,896 plain `let`/`const` declarations
     across the two repos (grep, §7.1), including a render-time memo-cache idiom
     (fellwork-web `apps/web/src/components/study/syntax-tree.aihu:33–48`: `let rowKey`,
     `let rowVal` mutated inside `rowsOf()` during render) that is correct ONLY because
     bare `let` is inert today. Auto-reactive `let` would turn that cache into an
     infinite invalidation loop. [R]
5. **Writes stay plain assignment.** `loading = true`, `count++`, `items.push` on a
   `state`-declared array followed by reassignment — authors write ordinary JS. No
   setters, no `.set`, no `setX(v)` in authored code. The compiler makes this true via a
   new write-rewrite pass (§4.3). [R]
6. **Bare `let`/`const` stay plain JS.** Inert, non-reactive, spliced verbatim —
   exactly today's behavior for keyword-declared bindings. A diagnostic (W627, §4.4)
   flags the silent-staleness case: a bare `let` that is both mutated and read by the
   template. [R]

### §1.1 What "compiler-recognized" means

A wrapper call is recognized when ALL hold:
- it appears in `@state` at **statement level** (top level of the block body) — either as
  the complete initializer of a `const`/`let` declaration (binding wrappers, §2) or as a
  bare expression statement (statement-position calls, §3.2);
- the callee is a bare intrinsic identifier not shadowed by an authored import or
  declaration;
- the argument shapes match §2/§3 (checked; mismatches are diagnostics, not silent
  pass-through).

A recognized call is **lowered** by the compiler (it never reaches the runtime as a call
to an undefined function). An intrinsic-named call in any other position — nested in a
function body, inside a conditional, in an argument list — is C623: wrappers declare
component structure, and structure is static. (Same reasoning as runes' top-level rule and
today's macro-line discipline.)

### §1.2 What retires

Every `$`-form in `@state` retires (dispositions per kind in §3), the aihu-only bare
*typed* declaration (`loading: boolean = false`) retires [R→ §3 row 21], and the
signal-tuple idiom (`const [x, setX] = signal(0)`) retires after a compat window (§7).
End state: an `@state` block is a plain TypeScript statement list in which certain calls
are compiler-recognized. `$` appears nowhere in an `.aihu` file (completing the grammar
arc's one rule — `docs/plans/template-grammar/40-spec.md` §1).

---

## §2 The wrapper reference (binding position)

Every wrapper: `wrapper(config?, valueOrFn)`. Config keys are the SAME keys the v2
metadata bags carry today (`packages/compiler/src/parser/state_macros.rs` — `describe`,
`expose`, `default`, `type`-via-generics, `attribute`, `reflect`, `on`, …); the redesign
moves them from string-parsed macro bags into type-checked TS object literals (§5.3).
Lowerings target the exact runtime primitives today's macros lower to
(`codegen/emit.rs emit_state_macro_code`) — **no new runtime semantics**.

Worked examples throughout use the agent-weather / weather-card shapes
(`cookbook/agent-weather.aihu`, `examples/weather-card/weather-card.aihu`).

### §2.1 `state` — mutable reactive value [R]

```ts
let loading = state(false)
let forecast = state<Forecast | null>(null)
```

- **Signature:** `state<T>(initial: T): T` — value-typed (identity), no config today.
  A config bag is reserved (`state(cfg, initial)` parses, unknown keys error) so
  `describe`/`expose` can extend to raw state later without a signature break. [S]
- **Nature:** `let` only. `const x = state(v)` can never be written and is C624 with
  fix → "use a plain `const`" (a state that never changes is not state).
- **Lowering:** registers `x` in the `SignalMap` and emits the tuple the runtime already
  serves (`const [__x_get, __x_set] = signal(initial)`); all reads/writes of `x` in
  `@state` scope and template scope are rewritten per §4.2–§4.3.
- Replaces: `const [x, setX] = signal(v)` tuples AND the bare typed colon-form
  declaration (§3 rows 20–21).

### §2.2 `prop` — externally-supplied binding, one per prop [R]

```ts
const city = prop<string>({ default: 'London',
                            describe: 'City name to retrieve weather forecast for',
                            expose: 'read' })
const nodes = prop<SyntaxNode[]>({ default: [] })
const rtl   = prop<boolean>({ default: false, attribute: 'rtl' })
```

- **Signature:** `prop<T>(config?: PropConfig<T>): T | undefined` with the §5.2
  overloads: `default: T` present → `T`; `required: true` → `T`; neither → `T | undefined`
  (Solid's `props` optionality model, stolen as directed). [R]
- **Config keys:** `default`, `describe`, `expose`, `attribute` (`false` | string |
  `true`), `reflect`, `required` — the first five exactly as today
  (`state_macros.rs:1023–1037, 1177–1199`); `required` is new (§5.2). The v2 `type:`
  key retires: the generic parameter (or the inferred `default` type) IS the type, and
  the runtime attribute-coercion hint that `type: Boolean/Number/String` provided is
  derived from the generic by the sidecar/emitter instead of authored twice. [R→]
- **Per-binding is structural.** One `const x = prop(…)` per prop; there is NO props
  object, so the destructure-loses-reactivity trap (Solid's top documented footgun,
  Svelte 5's `$props()` caveat list) cannot be written. [R]
- **Nature:** `const` for a prop the component never writes (the common case — "a prop
  is const"). `let city = prop(…)` declares an **internally writable** prop: the §4.3
  write-rewrite lowers its assignments to the `.set` writer exactly as CO1 does for
  `$prop` writes today (`expr/prop_write.rs`) — this is how the shipped counter idiom
  (`$prop count` incremented by an action) keeps compiling. [R→ — the nature axis
  applied to the shipped CO1 machinery; flagged §9.1]
- **Lowering:** unchanged — `const <name> = ctx.props.<name>` callable getter with
  `.set` writer (`prop_write.rs:3–7`), registered computed-style in the `SignalMap`
  (`emit.rs:1921–1931`); observed-attribute derivation and the C445/C446 checks
  (`state_macros.rs:107–201`) carry over verbatim on the new config keys.

### §2.3 `derived` — read-only computed value [R]

```ts
const status = derived({ describe: 'Request status: idle | loading | ready | error',
                         expose: 'read' },
                       () => statusValue)
const withTax = derived(() => price * 1.2)
```

- **This IS `$computed`** — a derived const; the rename says what the binding is (a
  value derived from others) rather than how it is produced. [R]
- **Signature:** `derived<T>(fn: () => T): T` | `derived<T>(config, fn: () => T): T`.
  Config keys: `describe`, `expose` (read-only — `write` on a derived is rejected, the
  same rule `collect_agent_members` applies today, `emit.rs:4191–4196`).
- **Nature:** `const` only (`let` is C624 — a derived is definitionally not assignable).
- **Lowering:** `const <name> = computed(() => …)` (`state_macros.rs:1818`) with
  `SignalMap` registration as today (`emit.rs:1914–1919`).

### §2.4 `action` — batched imperative entry point [R]

```ts
const fetchForecast = action(
  { describe: 'Geocode the city, then fetch temperature + weather code',
    expose: 'public' },
  async () => {
    loading = true
    try { … } finally { loading = false }
  })

const reset = action(() => { forecast = null })   // zero-config — MUST stay legal
```

- **Signature:** `action<F extends (...args: any[]) => any>(fn: F): F` |
  `action<F>(config, fn: F): F`. Config keys: `describe`, `expose`.
- **Zero-config `action(fn)` is normative** [R]: an action carries semantics beyond
  metadata — its body is wrapped in `batch(…)` (`state_macros.rs:1851`: `function
  name(args) { return batch(() => { body }) }`) and it is the unit of MCP-eligibility. A metadata-less
  action must not silently lose the batch wrapping `$action` bodies get today, so the
  wrapper (not a plain function declaration) remains the way to declare one.
- Plain `function` / `const f = () => {}` declarations in `@state` remain legal plain
  JS — helpers, not actions: no batch, never MCP-eligible, exactly today.
- **Nature:** `const` only (C624 on `let`).
- **Lowering:** unchanged batch-wrapped function; DE5 MCP param-schema derivation reads
  the SAME function expression via `expr/handler_parse.rs` (§6.2).

### §2.5 `resource` — async read model [R]

```ts
const raw = resource(() => fetch(`/api/weather?city=${city}`).then(r => r.json()))
const forecast = resource({ describe: 'Open-Meteo forecast for the current city' },
                          () => data.weather.query({ city }))   // magna origin (`data.*` client)
```

- **Signature:** `resource<T>(fn: () => T | Promise<T>): Resource<T>` |
  `resource<T>(config, fn): Resource<T>`. Config keys: `describe`, `expose` (read).
  `Resource<T>` is the runtime's existing resource view type — the wrapper is
  identity-shaped over the runtime's return, not a new type (§5.1).
- **Nature:** `const` only.
- **Lowering:** `createResource(...)`; a thunk body that is a magna client call lowers
  to `createMagnaResource(inject(MagnaFetchToken), …)` via the SAME `is_magna_origin`
  sniff shipping today (`emit.rs:1938–1958`). This is what retires `$query` (§3 row 14):
  the dedicated form was only ever sugar for a magna-origin resource.

### §2.6 `stream` — incremental async source [R→]

```ts
const ticker = stream({ describe: 'Live price ticks' },
                      () => fetch('/api/stream').then(r => r.body))
const clock = stream(() => everySecond())
```

- **Signature:** `stream<T>(sourceFn: () => StreamSource<T>): Stream<T>` |
  `stream<T>(config, sourceFn): Stream<T>`. The v2 required `source:` key
  (C553/C554, `state_macros.rs:1051–1175`) becomes the positional `valueOrFn` — the
  one-signature rule makes the required-key check structural.
  Config keys: `describe`.
- **Nature:** `const` only. **Lowering:** `createStream` + `onCleanup` registration,
  as today (`emit.rs:1960–1966`). The `@agent`-side `$stream <name>` result wire
  (`agent_macros.rs:69–76`) is untouched and refers to the binding name.

### §2.7 `controller` — host-lifecycle-coupled object [R→]

```ts
const mouse = controller(() => new MouseController())
const anchor = controller({ describe: 'Popover anchor controller' },
                          () => new AnchorController(opts))
```

- **Signature:** `controller<C>(factory: () => C): C` |
  `controller<C>(config, factory): C`. The v2 required `value:` factory key
  (C444, `state_macros.rs:995–1008`) becomes the positional `valueOrFn`.
  Config keys: `describe`. [S]
- **Nature:** `const` only. **Lowering:** unchanged IIFE-factory with
  `hostConnected`/`hostDisconnected` wired to `onMount`/`onCleanup`
  (`state_macros.rs:1905–1922`).

---

## §3 The full vocabulary — every kind, one disposition

The survey ground truth: `@state` today has **12 collection kinds**
(`parser/state_macros.rs:720–752` — `prop`, `computed`, `action`, `resource`, `effect`,
`lifecycle`, `event`, `aria`, `controller`, `context`, `stream`, `form`), plus the
dedicated/preserved forms (`$route`, `$query`, `$auth`, `$watch`, `$effect.on`,
`$beforeNavigate`, `$afterNavigate`, `$extends`, `$shadow`, `$extract` —
`state_macros.rs:241–708`), plus two non-`$` declaration idioms (signal tuples, bare
typed declarations), plus the `@agent` member macros. "**`$` retires**" is normative for
ALL of them; the table gives each its disposition.

| # | Today | Disposition | New spelling | Prov. |
|---|-------|-------------|--------------|-------|
| 1 | `$prop: { … }` | **wrapper** | `const x = prop<T>(cfg?)` (§2.2) | [R] |
| 2 | `$computed: { … }` | **wrapper** | `const x = derived(cfg?, fn)` (§2.3) | [R] |
| 3 | `$action: { … }` | **wrapper** | `const f = action(cfg?, fn)` (§2.4) | [R] |
| 4 | `$resource: { … }` | **wrapper** | `const r = resource(cfg?, fn)` (§2.5) | [R] |
| 5 | `$stream: { source: … }` | **wrapper** | `const s = stream(cfg?, fn)` (§2.6) | [R→] |
| 6 | `$controller: { value: … }` | **wrapper** | `const c = controller(cfg?, fn)` (§2.7) | [R→] |
| 7 | `$effect: () => …` / `$effect: { name: fn }` / `$effect.on(dep) { }` / `$watch name { }` | **statement call** | `effect(fn)` / `effect({ on: [dep] }, fn)` (§3.2.1) | [R] |
| 8 | `$lifecycle: { mount, dispose, adopt, attributeChange }` | **statement calls** | `onMount(fn)`, `onDispose(fn)`, `onAdopt(fn)`, `onAttributeChange(fn)` (§3.2.2) | [R] |
| 9 | `$aria: { … }` | **statement call** | `aria({ role: 'button', label: () => … })` (§3.2.3) | [R→] |
| 10 | `$context: { provide, consume }` | **split**: provide = statement call, consume = binding | `provide(key, fn)` / `const v = consume<T>(key)` (§3.2.4) | [R→ §9.4] |
| 11 | `$form: { value, validity }` | **statement call** | `form({ value: …, validity: … })` (§3.2.5) | [R→] |
| 12 | `$event: { name: { payload } }` | **statement call** (compile-time-only, as today) | `event<Payload>('name', cfg?)` (§3.2.6) | [S] |
| 13 | `$route name` | **binding wrapper** (no config) | `const r = route()` (§3.3.1) | [R→] |
| 14 | `$query name = data.X.query(v)` | **retire into `resource`** — magna sniff already decides the lowering | `const q = resource(() => data.X.query(v))` (§2.5) | [R→] |
| 15 | `$auth name = $auth.session()` / `.currentUser()` | **retire to the runtime import it already lowers to** | `import { useCurrentUser } from '@aihu/auth'; const u = useCurrentUser()` (§3.3.2) | [R→ §9.5] |
| 16 | `$beforeNavigate(fn)` / `$afterNavigate(fn)` | **statement calls** | `beforeNavigate(fn)` / `afterNavigate(fn)` (§3.3.3) | [R→] |
| 17 | `$extends: Ident` | **directive**, renamed — `extends` is a TS reserved word and cannot be a label | `base: AihuCheckboxRoot` (§6.4) | [S §9.3] |
| 18 | `$shadow: 'light'\|'shadow'` | **directive**, naked spelling | `shadow: 'light'` (§6.4) | [R] |
| 19 | `$extract: { read, call }` | **directive**, naked spelling; shares `parse_extract_literal`; one-per-surface C484 | `extract: { read: 'agents', call: 'anonymous' }` (§6.4) | [R] |
| 20 | `const [x, setX] = signal(0)` (runtime tuples) | **retire into `state`** after the compat window | `let x = state(0)` (§7) | [R] |
| 21 | bare typed decl `loading: boolean = false` (aihu-only syntax, `emit.rs:2361–2413`) | **retire into `state`** — not valid TS, and its semi-reactive lowering (template thunks re-read, writes never notify) is exactly the silent-staleness class §4.4 exists to kill | `let loading = state(false)` (§7) | [R→ §9.2] |
| 22 | bare `let` / `const` plain JS | **stays**, inert, verbatim — plus diagnostic W627 (§4.4) | unchanged | [R] |
| 23 | `@agent` `$scope`, `$rate-limit`, `$stream <name>` | **untouched** — `@agent` is outside this arc (`agent_macros.rs:1–8`) | unchanged | [R] |

### §3.2 Statement-position calls (no binding)

Kinds that declare no name become plain statement-position calls at `@state` top level —
already valid TS; the Solid `createEffect` / Vue `watchEffect` precedent. [R] Same
recognition rules as §1.1; same config-first signature where a config exists.

#### §3.2.1 `effect`
`effect(fn)` — re-runs on any dependency read inside `fn` (auto-tracked, unchanged).
`effect({ on: [depA, depB] }, fn)` — explicit-deps form; lowers exactly as today's
`on:` key / `$effect.on` / `$watch` do — deps prepended as a tracking read
(`state_macros.rs:1864–1877`, `emit.rs:2842–2860`). This single form absorbs three of today's spellings
(`$effect`, `$effect.on(dep) { }`, `$watch name { }` — the latter two were "preserved
v1 forms" whose lowerings are already byte-identical to the `on:` path). Anonymous
multiplicity is unlimited (C441 dies with the collection form: named keys existed only
to disambiguate object-literal entries).

#### §3.2.2 Lifecycle
`onMount(fn)`, `onDispose(fn)`, `onAdopt(fn)`, `onAttributeChange(fn)` — the four
callbacks `$lifecycle` accepts today (`state_macros.rs:1088–1114`), each a direct
statement call. `onMount`/`onDispose` lower to the runtime's `onMount`/`onCleanup` as
today; `onAdopt`/`onAttributeChange` to the R2 wiring. Spelling note [S]: author-facing
`onDispose` (matching the macro key `dispose`) lowers to runtime `onCleanup`; the
author-facing name follows the macro vocabulary, not the runtime primitive.

#### §3.2.3 `aria`
`aria({ role: 'button', label: () => currentLabel })` — one config object, values
static or thunked, exactly the key set `emit_aria_wiring` consumes today. SFC-level
lowering unchanged (ElementInternals + per-key mount effects).

#### §3.2.4 `context`
Provide is a statement: `provide('theme', () => themeSignal)`. Consume BINDS a value
and is therefore a binding wrapper despite the kind's no-binding grouping:
`const locale = consume<Locale>('locale')`. [R→ — a consume that binds nothing is
useless; flagged §9.4.] Lowering: the shipped synchronous `provide`/`inject`
prototype-chain DI (`emit.rs` CollectionKind::Context lowering), unchanged.

#### §3.2.5 `form`
`form({ value: current, validity: () => ({ valueMissing: !current }) })` — the two keys
`$form` accepts today (`state_macros.rs:1115–1134`); one call per surface (multiplicity
check carried over). SFC-level `emit_form_wiring` lowering unchanged.

#### §3.2.6 `event`
`event<{ id: string }>('select', { bubbles: true, composed: true, describe: '…' })` —
compile-time-only, as today (`emit.rs:1983–1987`: no runtime code; feeds `$emit`
resolution and the sidecar's typed-payload interface). The payload moves from the v2
`payload:` value-position type (not valid TS) to the type parameter — which is the
load-bearing win: the payload type now lives where tsc can check `$emit` call sites
against it. Name is the positional argument; config keys `bubbles`, `composed`,
`describe`. [S]

### §3.3 Dedicated forms — naked dispositions

#### §3.3.1 `route`
`$route name` binds a reactive route view (`const name = computed(() =>
__aihuRouter.useRoute())`, `emit.rs:2862–2866`). Disposition: binding wrapper with no
config — `const r = route()`, `const` nature, same lowering. [R→]

#### §3.3.2 `auth`
`$auth name = $auth.session()` and `$auth name = $auth.currentUser()` both lower to
`const name = useCurrentUser()` from `@aihu/auth` (`emit.rs:2884–2889`); the macro adds
only the deferred-SSR TODO marker for `session()`. Disposition: retire the macro; authors
write the runtime import directly (already valid TS, already the lowering). The compiler
keeps emitting the session-SSR marker keyed on the `useCurrentUser` import until the M3
SSR work lands. The C461 method-vocabulary gate is lost with the macro — accepted, since
the import surface is the runtime package's public API and tsc checks it. [R→ §9.5]

#### §3.3.3 Navigation hooks
`beforeNavigate(fn)` / `afterNavigate(fn)` — statement calls, lowering unchanged
(`__aihuRouter.__router_registerBeforeGuard/AfterGuard`, `emit.rs:2867–2876`). [R→]

---

## §4 Reactivity semantics

### §4.1 The rule
`state()` is the ONLY way a `let` becomes reactive. `prop`/`derived`/`resource`/
`stream`/`route` bindings are reactive by role. Everything else in `@state` is plain
JS with plain-JS semantics. [R]

### §4.2 Reads
Unchanged machinery. Recognized reactive bindings register in the `SignalMap`; template
expressions get the shipped scope-aware AST read-rewrite (`expr/rewrite.rs` — bare read →
getter call for JS emission, → `__aihu_ctx.<name>` for the type-check sidecar,
`rewrite.rs:96–126`). Inside `@state`-scope code (action bodies, effects, helpers), bare
reads of `state`-declared names are rewritten to getter calls by the same pass extended
to macro-body position — scope-aware, span-spliced, never reprinted (the
`prop_write.rs` parse strategy: synthetic-function wrap via `handler_parse`).

### §4.3 Writes — the new write-rewrite pass [R]
`expr/rewrite.rs` deliberately refuses assignment/update WRITE targets today
(`rewrite.rs:38–43`: "splicing `()` would emit invalid JS … template-position signal
writes go through setters/actions"). Plain-assignment-to-state therefore requires a
**new compiler pass**, specified here:

- **Model:** CO1's `expr/prop_write.rs` generalized. A single scope-aware AST pass over
  every `@state`-scope code body (action/effect/lifecycle bodies, top-level statements,
  and helper functions declared in `@state`) rewrites writes whose target resolves to a
  **registered `state` `let`** (and to a **`let`-natured `prop`**, absorbing CO1):
  - `x = v` → `__x_set(v)`
  - `x op= v` → `__x_set(x_get() op v)` (compound forms desugared, as CO1 §4.5)
  - `x++` / `--x` → the update-helper form CO1 ships (`__aihu_prop_upd` pattern),
    including the numeric-literal-initializer fast path.
- **Scope discipline:** shadowing wins — a local `let x` inside a handler makes inner
  `x = v` a plain local write (oxc scope model, identical to `prop_write.rs`'s primary
  guard). Enclosing-arrow params seed the outermost shadow frame.
- **Containment:** all oxc types stay inside `src/expr/`; `codegen` sees `String →
  String` (the CO1/W3 containment rule, `prop_write.rs:13–14`).
- **Failure posture:** parse failure returns the body unrewritten (`Ok(None)` — emit
  never panics), and the sidecar surfaces the type error instead; strictly
  non-regressive, as CO1.
- **Template position:** writes remain legal only in handler position (`onclick={() =>
  count++}`); the handler-position rewrite goes through the same pass. Non-handler
  template expressions stay read-only (unchanged refusal).
- **Batching:** individual rewritten writes notify immediately outside actions (today's
  signal-set semantics); action bodies keep their `batch()` wrapper so multi-write
  actions coalesce — including zero-config `action(fn)` [R, §2.4].

### §4.4 Inert-`let` staleness diagnostic — W627 [R]
Trigger: a bare (non-`state`) `@state` top-level `let` that is BOTH (a) assigned
anywhere in `@state`-scope code or template handlers, AND (b) read by a template
expression. Message shape:

> W627: `x` is mutated and read by the template, but isn't reactive — the template will
> not update when it changes. Did you mean `let x = state(…)`? (If the non-reactivity is
> intentional, read it through a function or mark the read site.)

Severity: **warning** [S §9.6] — the memo-cache idiom (§1 point 4) never fires it (its `let`s
are read only inside functions, not by the template), but setup-then-render-once
patterns are legitimate; a warning turns Svelte 4's silent staleness into a visible
compile-time catch without forbidding deliberate non-reactivity. Escalation to error is
a later, evidence-driven decision.

### §4.5 Swapped-args diagnostic — C622 [R]
Trigger: a wrapper called with a function-typed first argument AND a second argument
present (`action(async () => {…}, { describe })`). Error with machine-readable
`from`/`to` and **auto-fix** that swaps the arguments (the C440 fix-hint pattern). The
one-arg forms (`action(fn)`, `derived(fn)`, `state(v)`) are of course legal and never
trigger it.

### §4.6 Nature/role mismatches — C624
`let` on `derived`/`action`/`resource`/`stream`/`controller`/`route`; `const` on
`state`; assignment to a `const`-natured `prop`. Each errors with the corrected
declaration in the `fix:`.

---

## §5 Types

### §5.1 Identity-typed intrinsics [R]
The wrappers are declared (not implemented) for the sidecar and editors:

```ts
declare function state<T>(initial: T): T
declare function prop<T>(config: PropConfig<T> & { default: T }): T
declare function prop<T>(config: PropConfig<T> & { required: true }): T
declare function prop<T>(config?: PropConfig<T>): T | undefined
declare function derived<T>(fn: () => T): T
declare function derived<T>(config: DerivedConfig, fn: () => T): T
declare function action<F extends (...args: any[]) => any>(fn: F): F
declare function action<F extends (...args: any[]) => any>(config: ActionConfig, fn: F): F
declare function resource<T>(fn: () => T | Promise<T>): Resource<T>
declare function resource<T>(config: ResourceConfig, fn: () => T | Promise<T>): Resource<T>
declare function stream<T>(source: () => StreamSource<T>): Stream<T>
declare function stream<T>(config: StreamConfig, source: () => StreamSource<T>): Stream<T>
declare function controller<C>(factory: () => C): C
declare function controller<C>(config: ControllerConfig, factory: () => C): C
declare function consume<T>(key: string): T
declare function route(): RouteView
```

Identity typing (`state<T>(v: T): T` — the binding types as the VALUE) is what makes
the shipped TS-generator compose for free [R]: the binding a wrapper declares carries
the author-facing value type directly.

### §5.2 `PropConfig<T>` and defaultless props [R]

```ts
interface PropConfig<T> {
  default?: T
  required?: boolean
  describe?: string
  expose?: ExposeShorthand | { read?: boolean; write?: boolean }   // §6.1
  attribute?: string | boolean
  reflect?: boolean
}
```

`prop<string>()` with neither `default` nor `required: true` types as
`string | undefined` — Solid's model, as directed. `required: true` is new surface: it
asserts the host always supplies the prop; the runtime dev-mode warns when it doesn't.
[R]

### §5.3 Configs are type-checked for the first time
Today config bags are string-parsed macro metadata (`parse_meta_pairs`) — a typo'd key
(`descripe:`) is silently dropped. Under the redesign the config object is a real TS
expression checked against `PropConfig<T>` etc. in the sidecar: unknown keys,
wrong-typed `default`s, and malformed `expose` values become tsc errors on the authored
line. The compiler's own structural parse of the config (it still needs `describe`/
`expose` values at emit time) remains, but is now a parse of valid TS — shared
infrastructure with the DE5 `handler_parse` approach.

### §5.4 Threading into `__aihu_ctx` [R]
The sidecar's value view (`emit.rs:562–588`) declares
`__aihu_ctx: { k: ReturnType<typeof k> }` because today's registered bindings are
getters. Wrapper-declared bindings are value-typed (§5.1), so their members become
`k: typeof k` — one authored type, no parallel table, and property-chain narrowing
(`rewrite.rs:83–95`) keeps working unchanged. During the §7 compat window the member
type is per-origin: `typeof k` for wrapper bindings, `ReturnType<typeof k>` for
legacy signal-tuple getters. Macro-line blanking (`emit.rs:520–557`) shrinks to the
directive lines (§6.4) — wrapper declarations are valid TS and are checked in place,
which is the point.

---

## §6 Composition with shipped machinery

### §6.1 GX `expose:` — shorthand aligned with the axes [R]
The GX resolved shape is boolean `{ read, write }` and is UNCHANGED. The wrapper
configs accept:

```
expose: 'read'          → { read: true }
expose: 'write'         → { write: true }
expose: 'read write'    → { read: true, write: true }
expose: 'public'        → { read: true, write: true }   // documented alias, same desugar
expose: { read: true, write: true }                     // structured form, unchanged
```

The vocabulary is the axes' own words — `read`/`write` — NOT a third vocabulary;
`'public'` survives as an alias because it names the common intent. [R] Desugaring
happens at parse; everything downstream keys off resolved booleans exactly as today:
opaque member IDs, DE5 MCP schema derivation, the write-exposed-props-are-never-tools
rule, the unexposed-`describe`-never-emitted rule (`emit.rs:4200–4210`), and the
`has_exposed_agent_members` predicate behind C481/W481 (`emit.rs:4126–4134`) are all
untouched.

**Mandated cleanup:** `collect_agent_members` currently resolves `expose` by
string-contains (`emit.rs:4151–4153`: `expose_raw.contains("read: true")`). The rewrite
is the moment this becomes a structured parse of the (now type-checked) config value —
the shorthand desugar and the boolean resolution live in ONE function consumed by both
the server `__agentBinding` export and the client dispatcher, preserving the
single-source-of-truth property the current comment demands (`emit.rs:4094–4101`).

### §6.2 MCP/DE5
`action`'s function expression is the SAME node CO1/DE5 already parse via
`expr/handler_parse.rs` (one parser, one signature — `prop_write.rs:24–32`); param
schema derivation, graceful positional-`args` degrade, and async detection carry over
byte-for-byte. The config-first signature keeps the handler in a fixed argument
position, so `arrow_args`/`arrow_is_async` extraction gets simpler, not harder.

### §6.3 TS-generator
§5.4. Additionally: `transform_bare_declaration` (`emit.rs:2368–2413`) and its sidecar
twin retire with the colon-form declaration (§3 row 21) at window close — one less
aihu-only lowering in both emit paths.

### §6.4 Directives — component config stays config [R]
`$shadow` and `$extract` are **not bindings** — they configure the component/surface —
and stay directives with naked spellings:

- `shadow: 'light' | 'shadow'` — binary vocabulary per DA4 (#437), C471 semantics
  unchanged (`state_macros.rs:283–317`). The naked spelling is, incidentally, a valid
  TS labeled statement — it needs no sidecar blanking.
- `extract: { read: …, call: … }` — GX policy declaration; parses via the SHARED
  `extract::parse_extract_literal` from both positions (this and `@route { extract: }`),
  C483 malformed / C484 one-per-surface both carried over
  (`state_macros.rs:319–380, 92–105`). Not always valid TS in label position — the
  directive line keeps today's sidecar blanking (`emit.rs:520–557`).
- `base: Identifier` — the `$extends` recipe-class extension (`state_macros.rs:247–281`),
  renamed because `extends` is a TS reserved word and cannot be a label. C470 semantics
  unchanged; codegen still threads `defineComponent({ base })`. [S §9.3]

Member-level `$scope` / `$rate-limit` live in `@agent` and are untouched. [R]

---

## §7 Migration — incremental, with the tuple-compat window [R]

`signal()` is a runtime import, not grammar — the compiler lifts authored tuples by
recognition (`resolve_signals`), so old and new files coexist and migration is
**per-file**, not atomic. This is the ratified posture and differs deliberately from the
grammar wave's no-deprecation-runway posture.

### §7.1 Census (measured at `9e6ddbfd`, 2026-07-21)

| | aihu | fellwork-web | total |
|---|---|---|---|
| `.aihu` files | 162 | 53 | 215 |
| `= signal(` tuple declarations (files) | 65 (42) | 133 (32) | **198 (74)** |
| `$<kind>:` collection-macro lines | 138 | 22 | **160** |
| plain `let`/`const` lines in `.aihu` | — | — | ~1,896 |

Two workstreams fall out: (a) ~160 macro blocks — the `macro-simplification` codemod
pattern (`packages/compiler/js/codemods/macro-simplification/`) inverts mechanically
(collection entry → wrapper declaration; it wrote these shapes forward, it can write
them back); (b) ~198 signal-tuple declarations plus their call sites — `x()` reads and
`setX(v)` writes — which is **new codemod work** (reads drop the call, writes become
assignments; scope-aware, reusing the `expr/` AST machinery), plus golden-fixture
regeneration.

### §7.2 Waves

- **Wave 0 — capability.** Compiler recognizes wrappers, statement calls, directives;
  new write-rewrite pass (§4.3); identity-typed intrinsics in the sidecar; W627/C622–
  C626 diagnostics. `$`-forms still compile. **Per-file exclusivity:** a file mixing
  `$`-collection forms and new wrappers is C625 — every lexer/emitter branch stays
  two-dialect, never blended. Signal tuples remain accepted everywhere (they are
  orthogonal to the dialect flag). Corpus stays green untouched.
- **Wave 1 — macro codemod.** Extend `macro-simplification` to emit wrapper
  declarations; migrate both repos' ~160 macro lines per-directory; regenerate goldens
  as directories convert.
- **Wave 2 — tuple codemod.** New codemod: tuple declaration → `let x = state(v)`;
  call-site rewrite (`x()` → `x`, `setX(v)` → `x = v`, compound patterns flagged for
  review); migrate the 74 files; W628 deprecation nudge turns on for any remaining
  authored tuples.
- **Wave 3 — close the window.** `$`-forms in `@state` hard-retire (C620, the
  C440-pattern error with `fix:` → codemod path); authored signal-tuple declarations in
  `@state` hard-retire (C621). C621 is an ERROR, not a silent un-lift: if
  `resolve_signals` simply stopped lifting, stale tuples would still compile and render
  getters as text — the failure must be loud. The colon-form bare typed declaration and
  `transform_bare_declaration` retire in the same wave (C620 family, own `fix:`).

Old-form error messages follow the shipped C440 anatomy: corrected form inline,
machine-readable `from`/`to`, codemod pointer (`state_macros.rs:794–860`).

### §7.3 Invariants during the window
- Serving corpus builds green after every wave (the compat test, as the grammar arc).
- GX emitted artifacts are byte-stable across a file's migration when its `expose`
  metadata is semantically unchanged (§6.1's resolver is shared by both dialects).
- The sidecar type-checks BOTH dialects throughout (per-origin `__aihu_ctx` member
  typing, §5.4).

---

## §8 Acceptance criteria (checkable)

1. A component using every wrapper (§2) and every statement call (§3.2) compiles, runs,
   and type-checks with zero macro-blanked lines except directives.
2. `let loading = state(false)` + `loading = true` in an action updates a template
   `if={loading}` — no setter appears anywhere in authored source. (agent-weather
   rewritten in the new dialect is the golden.)
3. Bare `let` mutated at render time (the syntax-tree memo-cache, verbatim) compiles
   unchanged, stays inert, and does NOT trigger W627.
4. A bare `let` mutated in an action and read by the template triggers W627 with the
   `state(…)` suggestion.
5. `action(async () => {…}, { describe: '…' })` triggers C622 and the auto-fix produces
   the config-first form.
6. Zero-config `action(fn)`'s emitted body is `batch()`-wrapped, byte-equal to the
   configured form's wrapping.
7. `let count = prop({ default: 0 })` + `count++` in an action emits the CO1 `.set`
   form; the same write under `const count = prop(…)` is C624.
8. `prop<string>()` types as `string | undefined`; adding `default:` or
   `required: true` narrows to `string`; a wrong-typed `default` is a tsc error on the
   authored line.
9. `expose: 'read'`, `'write'`, `'read write'`, `'public'`, and the structured object
   all resolve through ONE function; `collect_agent_members` no longer contains a
   string-`contains` on `expose`; server export and client dispatcher member sets
   remain identical; unexposed `describe` text appears in no artifact.
10. An MCP param schema derived from a wrapper `action` is identical to the one derived
    from the equivalent `$action` entry.
11. `shadow: 'light'`, `extract: { read: 'agents' }`, `base: Foo` parse; two `extract`
    declarations on one surface is still C484; `@route`-position extract still shares
    `parse_extract_literal`.
12. A file mixing `$`-forms and wrappers is C625; a signal-tuple file and a wrapper
    file compile side-by-side in one build with correct sidecar types for both.
13. After wave 3: any `$`-form in `@state` is C620 with a working codemod pointer; an
    authored signal tuple in `@state` is C621; the full corpus (215 files) builds green
    in the new dialect and `grep -r '\$' --include='*.aihu'` finds no aihu grammar
    (only user identifiers in expressions).
14. `cargo test --workspace` green at every wave boundary; goldens regenerated only for
    migrated directories.

---

## §9 Ratified (founder, 2026-07-21)

All six entailments below are **RATIFIED as written** unless noted:
1. **`let`-natured props — ACCEPTED.** The nature axis governs prop writability: `const x =
   prop(…)` read-only, `let x = prop(…)` internally writable (CO1 lowering). Extends "a prop
   is const" through the axes.
2. **Retire the bare typed colon-declaration into `state()` — ACCEPTED.**
3. **`$extends` → `base:` — ACCEPTED.**
4. **`provide(…)` statement / `const x = consume(key)` binding split — ACCEPTED.**
5. **`$auth` → plain runtime import (drop C461) — ACCEPTED.** The C461 method-vocabulary gate
   is redundant: the lowering is `const user = useCurrentUser()` from `@aihu/auth`, and tsc
   already checks the import surface. Not a wrapper. (Keeps the session-SSR marker.)
6. **W627 staleness diagnostic severity — WARNING** (not error), so deliberate inert-`let`
   mutate-before-mount idioms stay legal.

---

### (original §9, for the record) Open questions surfaced while making the ratified points precise

1. **`let`-natured props (§2.2).** The ratified example is `const city = prop(…)` and
   the founder insight is "a prop is const" — but the shipped CO1 machinery exists
   because components DO write props internally (the counter idiom). This spec resolves
   it with the axes themselves: `const` prop = internally read-only, `let` prop =
   internally writable (CO1 lowering). Alternative reading: props are always `const`
   and internal prop writes become illegal (breaks the counter idiom; requires a state+
   effect mirror pattern instead). **Needs a call.**
2. **Retiring the bare typed colon-declaration (§3 row 21).** `loading: boolean = false`
   was not enumerated in the ratification, but it is not valid TS (violating the
   ratified valid-TS doctrine) and its current lowering is semi-reactive in exactly the
   silent-staleness way point 3's diagnostic exists to catch. The spec retires it into
   `state()`. Veto would leave one aihu-only spelling alive in `@state` and keep
   `transform_bare_declaration` in both emit paths.
3. **`$extends` → `base:` (§6.4).** `extends` is a TS reserved word, so the naked label
   spelling is impossible; the spec renames the directive to `base:` (matching the
   `defineComponent({ base })` codegen it threads into). Alternatives: keep `$extends`
   as the single surviving `$` (breaks "`$` retires entirely"), or another word
   (`inherits:`).
4. **`consume` is a binding, not a statement (§3.2.4).** The ratified grouping put
   `context` under no-binding statement calls; consume inherently binds. The spec
   splits: `provide(…)` statement, `const x = consume<T>(key)` binding. Flagged in case
   the grouping was intentional (e.g. a different consume design was in mind).
5. **`$auth` retires to plain runtime imports (§3.3.2).** The macro's only value-add
   over its own lowering is the C461 method-vocabulary gate and the session-SSR TODO
   marker; the spec keeps the marker (keyed on the import) and drops the gate. Veto
   would mean an `auth()` wrapper instead.
6. **W627 severity (§4.4).** Spec says warning; the ratified text ("compile-time
   catch") is satisfiable by either. Escalating to error would forbid deliberate
   mutate-before-mount non-reactive reads.

No ratified point proved internally contradictory when specified precisely; item 1 is
the closest call and is resolved within the ratified axes rather than against them.
