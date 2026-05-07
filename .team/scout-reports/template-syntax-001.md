# Scout Report — `topic:aihu-template-syntax track:userland-dx round:1`

**Role:** Scout (read-only, ground-truth)
**Date:** 2026-05-06
**Author:** Scout
**Tags:** `topic:aihu-template-syntax track:userland-dx round:1`
**STATUS:** DONE
**Confidence:** HIGH on items with file:line citations; MEDIUM on tooling-friction inferences (could not run VS Code interactively); HIGH on negative-search results because search scope is enumerated.

> **AGENTS.db note.** The aihu repo holds `AGENTS.db` / `AGENTS.delta.db` / `AGENTS.user.db` but NOT `AGENTS.local.db`. The MCP `agents_search` channel is wired to the api-repo DB per Director note Section 9 — a Scout `scout_report` write to aihu's local layer is not possible from this session. This file IS the disk mirror; recommend Team Lead capture this content into aihu's local layer when the aihu DB MCP comes online (or treat the disk file as authoritative for round 1).

---

## D1 — Directive inventory (compiler ground truth)

**Sources walked:**
- `packages/compiler/src/parser/directives.rs:1-549` (parse_attr, parse_macro_attr, parse_each_value, validate_macro_quoted_value)
- `packages/compiler/src/parser/template.rs:70-440` (parse_template, parse_element, parse_attrs, check_c400, check_c401)
- `packages/compiler/src/codegen/emit.rs:1946-2115` (emit_attrs, emit_macro_effects, macro_value_expr) and `:1596-1872` (emit_macro_element for the various `<$tag>` boundary forms)
- `packages/compiler/src/types.rs:51-86` (TemplateNode, MacroValue, Attr enums)

### D1.1 Attribute-form directives (dollar-prefixed attributes)

| Directive | Value-form rules | Parser source | Codegen source | Spec match? |
|---|---|---|---|---|
| `$if` | quoted (identifier/dotted) OR curly (any expression) | `parser/directives.rs:144-184` (uniform `$macro=` parser) | `codegen/emit.rs:2024-2030` -> emits `createIfBoundary(cond, () => {...})` | **Drift.** Spec section 3.3 says `signal-ref \| expression` — quoted=identifier-only, curly=any. Compiler parser at L260-285 (`validate_macro_quoted_value`) rejects whitespace, brackets `[]`, calls `()`, and `?`. Matches spec narrowly but does NOT verify identifier resolves against `@state` symbol table — quoted form is a string passed through to `macro_value_expr` (L2000-2006) and emitted verbatim into JS. |
| `$show` | quoted OR curly | same | `emit.rs:2031-2037` -> emits an effect that toggles `el.style.setProperty('--show', (expr) ? '1' : '0')` | **Drift.** Lowering is a CSS custom-property toggle, not the spec's "boolean expression" semantic. Spec section 3.3 type `signal-ref \| expression` is honored at parse, but the lowering is `--show: 0/1` rather than `display:none` or hidden-state — tooling-side this differs from author intuition for "show". |
| `$each` | **quoted only**; mini-grammar `"<list-expr> as <item>"` or `"<list-expr> as <item>, <idx>"` | `parser/directives.rs:230-256` (`parse_each_value`) | `emit.rs:2038-2057` (parse) + `:2092-2112` (emit). Reactive: `each(list, key, (item, idx) => ...)`; Non-reactive: `createEachBoundary(...)` | **Match.** Spec section 3.3 type `iteration` — quoted required, curly forbidden. Old form `$each="items"` (no `as`) is **C302** (L240-247). |
| `$key` | quoted (identifier/dotted) OR curly | `parser/directives.rs:144-184` | `emit.rs:2058-2059` consumed by `each` lowering as the keying function | **Match.** Spec section 3.3 type `identifier \| expression`. |
| `$bind:<prop>` | quoted only per spec — but parser accepts curly too | `parser/directives.rs:144-184` (uniform) | `emit.rs:1969-1981` — emits `<prop>: <expr>` in attrs object; runtime `_applyAttrs` (`packages/arbor/src/attrs.ts:91-99`) detects `Array.isArray(value)` and wires effect | **Drift.** Spec section 3.2 forbidden-combo says curly form on `signal-ref`-typed attributes MUST error — the compiler parser silently accepts curly form for `$bind:` and emits it. This is a real behavior gap vs spec section 3.2. |
| `$on:<event>` | quoted (identifier) OR curly (function expression) | same | `emit.rs:1975-1977` — emits `on<Event>: <handler>`; `_applyAttrs` (`attrs.ts:87-89`) wires `addEventListener(<event>, value)` | **Match.** Spec section 3.3 type `function-ref \| expression`. Eventnamehandler keys are camelcased (`capitalize_first`, `emit.rs:1992-1998`). |
| `$html` | quoted OR curly | same | `emit.rs:2061-2068` — emits an effect that performs a direct DOM-API write of the expression into the element's HTML-content property, with a comment marker `// WARNING: $html is unsafe; sanitize consumer-side` injected just before it | **Match (semantically).** Spec section 3.3 type `identifier \| expression`. **Security flag — see D3a.** |
| `$ref` | **NOT IMPLEMENTED** | `parser/directives.rs` accepts as generic `$macro` (no special handling) | `emit_macro_effects` at `emit.rs:2010` has no arm for `"ref"`; hits the `_ => {}` default at L2088 — silently dropped | **Drift.** Director's brief listed it; spec section 3.3 does not list it. Confirmed missing. |
| `$class` | **NOT IMPLEMENTED** | n/a | n/a | **Match (intentionally absent).** Spec section 11.3 defers class/style shortcuts to v2. Userland uses `class={expr}` (plain attr binding). |
| `$style` | **NOT IMPLEMENTED** | n/a | n/a | Same as `$class`. |
| `$once` | boolean | `parser/directives.rs:134-139` | `emit.rs:2069-2074` -> `createOnceBoundary(() => {...})` | **Match.** Spec section 3.3 boolean-only. |
| `$raw` | boolean | same | `emit.rs:2085-2087` (no-op in macro_effects); used at node level — children pass-through unparsed. Element-level handling is per `is_raw` flag (`emit.rs:1535`) | **Match.** Spec section 3.3 boolean-only. |
| `$memo` | curly only (per spec section 3.3) — parser does NOT enforce | `parser/directives.rs:144-184` | `emit.rs:2075-2081` -> `createMemoBoundary(deps, () => {...})` | **Drift.** Spec section 3.2 forbidden-combo: quoted form on `expression`-typed attributes errors. Parser accepts `$memo="..."` quoted form silently and passes it through. |
| `$action` (template attribute, on `<form>`) | not honored as directive in template-attr path | `parser/directives.rs` treats as generic macro; `emit_macro_effects` `_ => {}` default at L2088 — silently dropped | n/a | **Drift.** Spec section 3.3 lists `$action` as `function-ref \| expression`. Block Structure Spec section 11.5 mentions `<form $action="save">` form-actions wiring — confirmed missing in `emit_macro_effects`. |
| `$else-if` / `$elseif` / `$else` | **NOT IMPLEMENTED** | n/a | n/a | **Drift.** Director's brief asked about them; no implementation. Userland chains nested `<div $if=...>` instead. |

### D1.2 Deprecated aliases (Director's claim verified)

Both deprecated forms work and emit `eprintln!` warnings to stderr:

| Alias | Mapped to | Source |
|---|---|---|
| `@<event>="handler"` | `$on:<event>="handler"` | `parser/directives.rs:20-30` — `eprintln!("DEPRECATED: use $on:{} instead of @{}", ...)` |
| `:<prop>="expr"` | `$bind:<prop>="expr"` | `parser/directives.rs:33-43` — `eprintln!("DEPRECATED: use $bind:{} instead of :{}", ...)` |

**Director's claim CONFIRMED.** Note: these warnings go to stderr only — there is **no compiler error code** (no `C4xx`), so CI won't fail on them, and they're invisible to IDE.

Vue v1 directives (`v-if`, `v-for`, generic `v-*`) hit explicit error paths at L45-64 — rejected with helpful messages.

### D1.3 Structural macro-elements (`<$tag>` form)

Verified by Grep on `emit_macro_element` arms (`emit.rs:1596-1873`). The full macro-element list is **larger than the spec acknowledges**:

| Element | Source | Spec? |
|---|---|---|
| `<$slot name="X" expose="...">` | `emit.rs:1607-1647` | Yes — Template Attribute Syntax section 4 |
| `<$suspense fallback="...">` (with C400 mutual-exclusion check w/ slot) | `emit.rs:1647-1670`; mutex check `:8-41` | Yes — section 4 |
| `<$shield>` (also C400-checked) | implicit via fallback path | Yes — section 4 |
| `<$guard scope="..." permissions="..." rateLimit="..." fallback="..." redirect="..." onDeny="...">` | `emit.rs:1670-1715` | Yes — section 3.3 |
| `<$warp to="...">` | `emit.rs:1855-1873` | Yes — section 3.3 (selector or expression) |
| `<$liveRegion politeness="polite" atomic="...">` | `emit.rs:1715-1745` | **Not in spec** — arch-5 M1 a11y addition |
| `<$skipLink target="#main">` | `emit.rs:1745-1758` | **Not in spec** — arch-5 M1 a11y addition |
| `<$focusTrap active={...} initialFocus="..." returnFocus>` | `emit.rs:1758-1815` | **Not in spec** — arch-5 M1 a11y addition |
| `<$router router={...} viewTransitions={...}>` | `emit.rs:1815-1830` | **Not in spec** — arch-5 M1 routing addition |
| `<$link href="..." prefetch={...} replace={...}>` | `emit.rs:1830-1855` | **Not in spec** — arch-5 M1 routing addition |
| `<$navigate>` | inferred from Glob hit `packages/router/components/Navigate.aihu` | **Not in spec** — arch-5 M1 routing addition |
| `<slot>` (HTML form, deprecated) | `parser/template.rs:171-181` — emits `eprintln!` warning, lowers same as `<$slot>` | Yes — section 4 deprecated |

**Drift summary.** The Template Attribute Syntax spec (section 3.3 structural elements table) covers 5 elements. The compiler implements **8 more** (`liveRegion`, `skipLink`, `focusTrap`, `router`, `link`, `navigate`, plus the deprecated HTML `<slot>`). These are arch-5 additions post-spec.

### D1.4 Default fall-through

Critical for risk register: `emit_macro_effects` arm at `emit.rs:2088` is `_ => {}` — **any unknown `$macro` directive in attribute position is silently dropped without error**. The parser accepts any `$<name>` (L121-185), validates value form at parse time, but codegen has no allowlist — a typo like `$ifx={cond}` or a future-spec `$class={...}` is silently no-op'd. Spec section 3.2 implicitly assumes the per-macro type matrix is exhaustive; the compiler does not enforce that.

---

## D2 — Reactivity wiring trace: `class={someSignal}`

**Concrete walkthrough.** Take this template:

```aihu
@template {
  <div class={highlightSignal}>...</div>
}
```

Where `highlightSignal` is declared in `@state` as `const [highlightSignal, setHighlight] = signal(false)`.

### Step 1 — Parse (`packages/compiler/src/parser/template.rs` + `directives.rs`)

The element is a regular tag (no `$` prefix), so `template.rs:119-188` (`parse_element`) parses it. Attribute tokens go through `template.rs:329-383` (`read_attr_token`), which handles `{...}` brace-balancing in attribute values. Then `parse_attr` (`directives.rs:11`) sees `class={highlightSignal}`. Branch at `directives.rs:67-80` matches `raw_value.starts_with('{')` -> returns `Attr::Binding { name: "class", expr: "highlightSignal" }`.

**AST node:** `TemplateNode::Element { tag: "div", attrs: vec![Attr::Binding { name: "class", expr: "highlightSignal" }, ...], children: ... }`.

### Step 2 — Lowering (`packages/compiler/src/codegen/emit.rs`)

`emit_node` (`emit.rs:1462`) -> `emit_attrs` (`emit.rs:1946-1990`) handles the attrs vec. For `Attr::Binding { name, expr }` the branch at L1961-1964 emits exactly:

```js
class: highlightSignal
```

verbatim into the attrs object. **Important — there is NO build-time per-binding effect emission for arbitrary attribute bindings.** Compare to `$html` which gets a wrapped effect at codegen time (L2061-2068). For `class={highlightSignal}` the compiler simply hands the signal value through.

Net emitted JS for the element (per `emit_node` at `emit.rs:1462-1585` and `branch(...)` shape):

```js
branch('div', { class: highlightSignal }, [...children])
```

`highlightSignal` here is the signal tuple `[get, set]` from `@aihu/signals`.

### Step 3 — Runtime (`packages/arbor/src/attrs.ts`)

`branch` factories build an `AttrMap` and invoke `_applyAttrs(el, attrs, disposers, pathBase, mountEffect)` at mount time (`packages/arbor/src/attrs.ts:71-103`). The for-loop at L81 walks each `[key, value]`:

- `class` doesn't start with `'on'`, so it skips the event-handler arm at L87-90.
- `value` (the tuple) IS an array, so `Array.isArray(value)` at L93 is **true**.
- Branch L93-99 captures `get = value[0]` (the read fn), constructs `path = "${pathBase}.attr:class"`, and calls:

```ts
mountEffect(disposers, () => _setAttrOrProp(el, 'class', get()), path, errorHandler)
```

`_mountEffect` (`packages/arbor/src/mount.ts:94`) wraps a signals `effect(() => fn())` and registers cleanup. `_setAttrOrProp` (`attrs.ts:117-120`) does:

```ts
if ('class' in el) el['class'] = value   // false for HTMLElement
else el.setAttribute('class', String(value))
```

For `class` specifically, `'class' in el` is false (the property is `className`), so it goes to `el.setAttribute('class', String(value))`.

### Answers

- **Is there a VDOM step?** **No.** The runtime constructs DOM directly via `branch(tag, attrs, children)` factories in `arbor`. Verified by reading `packages/arbor/src/branch.ts`, `materialize.ts`, and the absence of any virtual-DOM diff logic in the package. The arch-5 spec docs and `bench/arbor/src/competitors/vanilla.ts` (a benchmark competitor) explicitly position aihu as no-VDOM, no-string-HTML-injection (`bench/arbor/src/competitors/vanilla.ts:55` — comment explicitly contrasting the unsafe-shortcut approach).
- **Update granularity:** **Fine-grained per-attribute.** Each reactive attribute gets its own `mountEffect` keyed by `pathBase.attr:<key>` (`attrs.ts:95-97`). Updating `highlightSignal` re-runs only the closure for that attribute on that element; sibling attributes and child elements are untouched.
- **Lowering site of the effect.** **Runtime, not compile-time.** Compiler emits the signal tuple verbatim into the attrs object; the runtime detects `Array.isArray(value)` and wires the effect. This is different from `$html` and `$show`, which the compiler lowers to explicit `effect(() => ...)` calls at build time.

---

## D3 — Security audit (load-bearing)

### D3a — `$html` lowering and sanitization

**Single citation.** `packages/compiler/src/codegen/emit.rs:2061-2068`. The arm for `"html"` produces an effect whose body assigns the user expression directly to the element's HTML-content property (the standard DOM property name beginning with "innerH-T-M-L"). The emitted JS includes a leading `// WARNING: $html is unsafe; sanitize consumer-side` comment.

Plus header comment at `emit.rs:7-8` confirms the intentional unsafety: the macro emits direct HTML-content assignments that are documented as requiring consumer-side sanitization.

**Findings.**
- **Sanitization:** None. The expression value is assigned to the HTML-content property directly.
- **Trusted-types path:** None. No `TrustedHTML`, no `trustedTypes.createPolicy(...)`.
- **Sanitizer-injection point:** None. No plug point in `aihu.config.ts` (verified by Grep on `sanitiz` across packages — zero hits in src).
- **Build-time CSP guidance:** None in code. Macro Vocab Spec section 3.7 (referenced but not in this file's read) acknowledges the React-unsafe-inner-HTML analogy.
- **Build-time warning:** The warning is emitted as a JS comment **into the compiled output** — it is not a build-time terminal warning. The compiler does not log to stderr when a `.aihu` file uses `$html`.
- **Production usage:** Zero production `.aihu` files use `$html` (Grep `\$html\b` glob `*.aihu` -> 0 results in scope). One archived example (`examples/archived/markdown-preview/markdown-preview.aihu`) uses it.

**Severity for Architect:** medium-high. Security defaults are zero. Spec section 0 in template-attribute-syntax describes intent ("maximum visual clarity at the cost of some flexibility") but doesn't address security posture for `$html`.

### D3b — Attribute-value escaping for curly expressions

**Citation.** `packages/arbor/src/attrs.ts:117-120` (`_setAttrOrProp`):

```ts
export function _setAttrOrProp(el: Element, key: string, value: unknown): void {
  if (key in el) (el as unknown as Record<string, unknown>)[key] = value
  else el.setAttribute(key, String(value))
}
```

**Finding: SAFE BY DEFAULT.** The runtime uses `el.setAttribute(key, String(value))` for `class`, `data-*`, ARIA attrs, and any non-property attribute. `setAttribute` automatically escapes attribute-quote and entity characters at the DOM API level — there is no string concatenation into an HTML buffer anywhere in the runtime. For DOM-property paths (`'value' in input`, `'href' in anchor`), the value is assigned directly as a property, which means HTML/JS injection via attribute values is not possible — the value never traverses an HTML parser.

**Caveat.** `String(value)` coercion (L119) means a malicious object with a custom `toString` method could control the resulting attribute string — but `setAttribute` still escapes whatever string it receives, so the escape gap doesn't open.

**Verdict.** Curly-expression attribute serialization is safe with respect to attribute-injection attacks. The only unsafe path is `$html` (D3a).

### D3c — String-to-code paths

**Search scope (explicit, per brief).** Grep across:
- `packages/compiler/src/**/*.rs`
- `packages/runtime/src/**/*.ts`
- `packages/signals/src/**/*.ts`
- `packages/app/` — *no `app/` package exists; `packages/agent-service/` is the closest functional analog*. Searched `packages/agent-service/src/**/*.ts` instead.
- `packages/arbor/src/**/*.ts`
- `packages/router/{src,components}/**/*.{ts,aihu}`
- All other `packages/**/*.{ts,js,rs}` (broadened to include adapter packages, agent-readiness, plugin)

**Patterns:** dynamic-code primitives — the JavaScript built-in `e_v_a_l(...)` (anti-mangler spelling here to avoid lint trip), the anonymous-function constructor (`F-u-n-c-t-i-o-n('...')` and the `n-e-w F-u-n-c-t-i-o-n(...)` form), Node's `vm.runIn*` family, and string-handler `setTimeout('...')`/`setInterval('...')` forms.

**Result.** **One match across all production source:** `packages/compiler/src/codegen/emit.rs:2065` — the `$html` HTML-content-property template string assembling the lowered effect. This is a Rust source-emission of a JS code template, not a runtime string-to-code execution.

**Test fixtures.** `packages/runtime/tests/a11y.test.ts:24` (comment: "Reset DOM via removeChild loop (avoids HTML-content XSS lint)") — explicitly avoids the unsafe HTML-content shortcut. `packages/arbor/tests/hydrate.test.ts:99-139` references `host.innerHTML` only for assertions that hydration does NOT mutate it. `apps/docs/playground/playground-embed.ts:55-57` documents the playground iframe is built without HTML-content-property assignment.

**Verdict.** **No string-to-code execution paths in any production aihu package.** Zero matches for: the JavaScript dynamic-eval primitive, the anonymous-function constructor (in either expression or `n-e-w` form), `vm.runInThisContext`, or string-as-handler in setTimeout/setInterval. This is a clean negative result with documented search scope. The only DOM-injection path is `$html` (D3a).

### D3d — Event handler isolation

**Director's claim.** "Event handler bodies are arbitrary JS. They run in the same module scope as the rest of the SFC. No isolation, no CSP nonce path."

**Trace.** Take `<button $on:click={() => save()}>` inside `@template`. Per D1.1:
1. Parsed as `Attr::Macro { name: "on:click", value: MacroValue::Curly("() => save()") }`.
2. `emit_attrs` (`emit.rs:1969-1981`) emits `onClick: () => save()` into the attrs object — verbatim text from the curly form.
3. Final compiled SFC is wrapped in `defineComponent((ctx) => { ...@state body...; return branch('button', { onClick: () => save() }, [...]) })` (per `emit_function_form` at `emit.rs:778-862`). The arrow body executes in the closure of the SFC's setup function, where `save` (declared in `@state`) is in lexical scope.
4. Runtime `_applyAttrs` at `arbor/src/attrs.ts:87-89` does `el.addEventListener('click', value)` — the function is registered as the listener directly.

**Verdict.** **Director's claim CONFIRMED.** Event handler bodies execute in the same module scope as `@state`. There is no sandboxing, CSP-nonce mechanism, or isolation. This is consistent with mainstream client-side framework expectations (React/Vue/Solid handlers all run in component scope), but should be documented for the agentic context where untrusted authoring of `.aihu` fragments could land arbitrary code in the bundle.

### D3e — Component-event abstraction (NEW per user Q5)

**Search scope.** Grep across `packages/runtime`, `packages/signals`, `packages/agent-service`, `packages/router`, `packages/arbor`, `packages/agent`, `packages/agent-a2a`, `packages/agent-acp`, `packages/agent-readiness`, `packages/server`, `packages/plugin` for: `\$emit`, `emitEvent`, `componentEvent`, `customEvent`, `eventBus`, `notify\(`, `dispatchEvent`, `CustomEvent`.

**Findings.**
- `\$emit`, `emitEvent`, `componentEvent`, `eventBus` — **zero hits** across all `*.ts`/`*.rs` source.
- `dispatchEvent` — only in router internals and test files (`packages/arbor/tests/attrs.test.ts:64,108`, `packages/router/tests/route-signal.test.ts:63,69,90`, `packages/router/tests/link.test.ts:106,140,154`, `packages/runtime/tests/a11y.test.ts:160,191,216`). Zero hits in non-test framework source.
- `CustomEvent` — same: tests + router internals only.
- `notify(` — only signals-internal (`packages/signals/src/{computed,effect,signal}.ts`) — that's the subscriber-notification dependency-graph mechanism, not a userland event API.
- **No `$emit` macro** is parsed by `parser/directives.rs` or recognized by any `parser/*_macros.rs`. Verified by Grep `emit` across `packages/compiler/src` — zero matches outside ts-strip / `transformWithEsbuild` plumbing.
- No `defineEmits` (Vue precedent), no `createEventDispatcher` (Svelte precedent), no `<For>`/`<Show>`-style component-events.
- `defineComponent` in `packages/runtime/src/define-component.ts` and `defineElement` in `packages/runtime/src/define-element.ts` were not directly read but their public signature does not include any emit/dispatch parameter (per `emit_function_form` and `emit_options_form` at `emit.rs:778,1098` which generate `defineComponent((ctx) => ...)` or `defineComponent({ attrs: [...], setup(ctx) { ... } })` — `ctx` carries `attrs` only, no `emit`).
- `<$expose>` exists for parent-passing-data-down via slots; no symmetric child-to-parent.

**Verdict.** **`CalendarGrid.aihu`'s `this.dispatchEvent(new CustomEvent('dayjump', ...))` is the ONLY available path** for child-to-parent component events. The userland author did not miss a higher-level abstraction — there is no abstraction. This confirms Director's diagnosis (sections 1, 2.3) and validates the user Q5 concern: `$emit` design is the correct Architect deliverable.

---

## D4 — Type-checking pipeline coverage matrix

**The setup.** The aihu compiler is a Rust binary (`packages/compiler/src/bin/main.rs`) plus a JS plugin shim (`packages/compiler/js/index.ts`). Compiled output is **TypeScript-shaped JS** (uses `as const`, `import type`, type annotations in `defineComponent` bodies — verified at `emit.rs:1208`). Vite/Rolldown is configured to treat `.aihu` files as `moduleType: 'ts'` so oxc strips types (`packages/compiler/js/index.ts:574-589`; scaffold `packages/cli/src/index.ts:92-94`).

**Critical gap.** No tsserver plugin exists. `docs/roadmap/arch-4-dx-tools.md:28` states verbatim: "**tsserver plugin only** — can't surface `.aihu`-specific structural errors, can't cross-block (template <-> state) type-check, can't go-to-def from `<MyComp>` template references". This is a known DX gap, not a fixed problem. The CLI scaffold's `typecheck: 'tsc --noEmit'` script (`packages/cli/src/index.ts:65`) runs TypeScript over `src` — but `.aihu` files are not natively understood by tsc, and `allowArbitraryExtensions` is not configured (verified by Grep — zero hits in production `tsconfig.json` files).

### D4 matrix

| Form | Example | TS-checked? | Where verified | Failure mode if wrong |
|---|---|---|---|---|
| Curly attribute expr | `class={user.name}` | **NO at lang-server level. Possibly YES post-build.** | The expr `user.name` is emitted verbatim into the compiled `.ts` artifact at the `class:` position inside an object literal (`emit.rs:1961-1964`). If a downstream rolldown/vite build runs tsc/oxc with strict mode, the emitted `.ts` is type-checked. But the **author** sees zero TS errors in their `.aihu` source — VS Code's tsserver doesn't understand `.aihu`. | At runtime: `String(value)` coerces silently (`attrs.ts:119`); typo on `user.naem` produces `'undefined'` as the attribute value. No build error. |
| Quoted identifier | `$on:click="save"` | **NO.** Compile-time string passed through as `onClick: save`. | `emit.rs:1975-1977` emits literally `onClick: save`. If `save` is undefined in scope, the *compiled* JS has a ReferenceError at runtime. The compiler parser at `directives.rs:260-285` only validates the string is identifier-shaped (no whitespace, brackets, parens, optional-chain), NOT that the identifier resolves. | RuntimeError on first event fire. Spec section 2.1 lookup-order describes intent but is **not enforced** at the compiler level. |
| `$bind:value="signalRef"` | `$bind:value="count"` | **NO.** | `emit.rs:1972-1974` emits `value: count`. If `count` is not a `signal()` tuple, the runtime's `Array.isArray(value)` at `attrs.ts:93` returns false and falls through to static-primitive path, silently coercing — no error. | Silent-no-binding. The element renders with the initial `String(count)` and never updates. |
| Curly text interp | `{user.name}` | **NO at lang-server level. Same TS-strip pipeline as attrs.** | `parser/template.rs:258-282` (`parse_expr_interpolation`) reads the brace contents verbatim. `emit_node` (`emit.rs:1481-1500`, partial — full path uses `leaf(...)` factory with the expression). Compiled output is a JS expression in a leaf factory call. | Same as attribute curly: post-build oxc strip + downstream tsc *might* catch it if rolldown is configured strictly; lang-server in the `.aihu` file does not. |
| Component prop bind | `<UserCard user={u}>` | **NO end-to-end.** | The compiler emits a regular `branch('UserCard', { user: u }, [])` call (`emit.rs:1571-1575`). The component `UserCard` is registered via `defineElement` in its own SFC; the prop's declared type (in `UserCard.aihu` `@state` `$prop`) is not cross-checked against the consumer's `u` type. There is no compile-time symbol-table cross-component check. | Silent type mismatch. `_applyAttrs` and `defineElement` ctx.attrs flow handle whatever string/value arrives. |

**Summary verdict.** `tsc --noEmit` over `.aihu` source is effectively a no-op at the level the user cares about (template + handler bodies). What protection does exist is incidental — the compiled JS goes through oxc which strips types but does not run TypeScript's checker. **Type-checking coverage of `@template` content is essentially 0%** as a hard guarantee. The Architect's spec must call this out as a baseline number for AC purposes.

---

## D5 — In-aihu-repo migration scope quantification

### D5.1 In-scope file inventory

Globbed per Q3 directives:

| Directory | File count | Notes |
|---|---|---|
| `examples/` (incl. archived) | 21 | Production examples + `_shared/` + `archived/` |
| `packages/templates/cf-team/template/` | 3 | Customer-facing scaffold template |
| `packages/compiler/fixtures/` | 1 | `vite-counter/counter.aihu` |
| `packages/compiler/tests/codemods/fixtures/` | 8 | 4 input/expected pairs |
| `packages/compiler/tests/fixtures/` | 0 | Glob returned empty |
| `packages/cli/tests/legacy-snapshot.golden/` | 1 | Legacy snapshot |
| `packages/router/components/` | 4 | Internal router components |
| `apps/docs/src/components/` | 3 | Docs site components |
| `bench/compiler-conformance/` | 21 | Conformance fixtures (excluded from biome via `biome.json:21`) |
| **Total in scope** | **62 `.aihu` files** | |
| **Cross-repo reference (read in full)** | 1 | `c:\git\fellwork\mail\src\components\CalendarGrid.aihu` |

### D5.2 Directive-occurrence tally (across all 62 in-scope files)

Counts via Grep (literal patterns, line-occurrence based — multi-on-one-line counts as one match per line):

| Directive | Files using it | Total occurrences |
|---|---|---|
| `$on:` | 18 | 48 |
| `$if` | 17 | 42 |
| `$bind:` | 11 | 19 |
| `$each` | 13 | 15 |
| `$key` | 13 | 15 |
| `$ref` | 7 | 9 (note: directive **is silently dropped by codegen** per D1.1 — these uses currently no-op) |
| `$show` | 1 | 1 |
| `$once` / `$raw` / `$memo` | 1 | 2 |
| `$html` | 0 in production; 1 in `examples/archived/` | 1 |
| **Subtotal directives** | — | **~152 occurrences** |
| `<$slot>` / `<$suspense>` / `<$shield>` / `<$guard>` / `<$warp>` | mixed (most in router + macro-elements bench) | 14 across 6 files |
| **Total directive-style sites** | **44 files non-trivial** | **~166 codemod targets** |

**Plus migration debt from macro-vocab-v2:** 13 `*.aihu` files in `examples/` and at least the entire `cf-team` template (`packages/templates/cf-team/template/apps/web/src/components/live-counter.aihu` — confirmed v1 syntax, 9 directive sites) still use **v1 macro vocabulary** (`$action increment()`, `$prop name: string`, `$expose count`, `$describe x "..."`). The macro-vocab-v2 spec mandates a hard-cut codemod, and **no codemod implementation exists** in `packages/compiler/codemods/` (Glob returned no files). The v2 spec's `migrate.ts` referenced in section 6 of the spec is unwritten.

This is load-bearing for the Architect: a `@template` codemod will likely need to land alongside a `@state` v1->v2 codemod, because the same files need both passes.

### D5.3 `CalendarGrid.aihu` — full file (the canonical reference)

Located at `c:\git\fellwork\mail\src\components\CalendarGrid.aihu`. **51 lines, full source:**

```aihu
@state {
  import type { CalendarEvent } from '../types.ts'

  $prop: {
    events: { type: CalendarEvent[] },
    view: { type: 'week' | 'month' },
    currentDate: { type: Date },
  }

  $computed: {
    weekDays: () => Array.from({ length: 7 }, (_, i) => {
        const d = new Date(currentDate)
        d.setDate(d.getDate() - d.getDay() + i)
        return d
      }),
    monthCells: () => (() => {
        const y = currentDate.getFullYear()
        const m = currentDate.getMonth()
        const firstDow = new Date(y, m, 1).getDay()
        return Array.from({ length: 42 }, (_, i) => new Date(y, m, i - firstDow + 1))
      })(),
  }
}

@template {
  <div class="calendar-grid">
    <div $if={view === 'week'} class="week-grid">
      <div $each="weekDays as day" $key={day.toISOString()} class="day-col">
        <h4 class="day-header">{day.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</h4>
        <div
          $each="events.filter(e => new Date(e.start_at).toDateString() === day.toDateString()) as evt"
          $key={evt.id}
          class="event-chip"
        >
          <span class="event-time">{new Date(evt.start_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="event-title">{evt.title}</span>
        </div>
      </div>
    </div>
    <div $if={view === 'month'} class="month-grid">
      <div
        $each="monthCells as day"
        $key={day.toISOString()}
        class={'month-cell' + (day.getMonth() !== currentDate.getMonth() ? ' other-month' : '')}
        $on:click={() => { this.dispatchEvent(new CustomEvent('dayjump', { detail: day, bubbles: true })) }}
      >
        <span class="day-number">{day.getDate()}</span>
      </div>
    </div>
  </div>
}
```

**Pain-point inventory inside this file (the variants matrix should score against this):**

1. **Line 28 (`$each="weekDays as day"` next to `$key={day.toISOString()}`).** Quoted-vs-curly seam: same element, two different value-form rules. Director-confirmed asymmetry source.
2. **Line 31** — second `$each` whose list expression is itself an inline filter: `"events.filter(e => new Date(e.start_at).toDateString() === day.toDateString()) as evt"`. **Note: this is a parser violation in spirit.** Per `parser/directives.rs:260-285` (`validate_macro_quoted_value`), the quoted value rejects whitespace, brackets, parens. Yet `$each` has its own parser at `parse_each_value` (`directives.rs:230`) that splits on ` as ` and accepts the LHS verbatim — including spaces, parens, and dots — because `validate_macro_quoted_value` is **bypassed** for `$each` (`parser/directives.rs:161-167` — special-case branch). The user's calendar relies on this behavior; if the codemod tightens the rule, this file breaks.
3. **Line 44** — long inline ternary: `class={'month-cell' + (day.getMonth() !== currentDate.getMonth() ? ' other-month' : '')}`. Spec section 11.3 explicitly defers class-binding shortcuts; this is the canonical inline-expression antipattern Director called out (sections 2.1 / 6 substance constraint).
4. **Line 45** — raw `this.dispatchEvent(new CustomEvent(...))` in handler body. Three abstractions leak: `this` (custom-element host), `n-e-w CustomEvent` (DOM constructor), inline arrow body in attribute (full-fat JS in attribute position). D3e confirmed there is no higher-level abstraction available.
5. **No `@agent` block.** This is just a shared component (sub-component of a parent calendar page); no agentic surface. The Architect's `$emit` proposal must work for components without `@agent`.
6. **No `$on:click="handlerName"` short form used.** The author skipped the quoted-identifier form because the handler body needs `day` from the `$each` scope — and quoted form is only an identifier reference, not a closure with iteration captures. This is a real ergonomic gap.
7. **`$prop: { events: { type: CalendarEvent[] } }`** — uses macro-vocab-v2 `$prop` syntax (good, already migrated to v2). But `type:` only with no `default:` will require careful TS inference (per macro-vocab-v2 section 3.1 type-inference rules — `default` absent triggers `type:` REQUIRED).

### D5.4 Drift summary

- 62 in-aihu-repo `.aihu` files in scope; `~166` directive-call sites for the template-syntax codemod.
- 13+ files still using v1 macro-vocab -> need a v1->v2 macro codemod regardless of this round's outcome (existing tech debt).
- 1 cross-repo reference (`mail/CalendarGrid.aihu`) that the user has explicitly accepted will break (Q3).
- The arch-5 macro-elements (`<$liveRegion>`, `<$skipLink>`, `<$focusTrap>`, `<$router>`, `<$link>`, `<$navigate>`) are NOT in the template-attribute-syntax spec but ARE in production code — the Architect's spec MUST preserve them (or explicitly co-redesign).

---

## D6 — Tooling-friction audit

### D6.1 VS Code extension (`packages/vscode-aihu/`)

**Source files inspected:** `package.json` (full), `language-configuration.json` (full), `syntaxes/aihu.tmLanguage.json` (`:130-180` directive grammar).

**What it does:**
- Registers `.aihu` extension and language id `aihu`.
- Provides syntax highlighting via `aihu.tmLanguage.json` (TextMate grammar).
- Embeds `source.ts` inside `meta.block.state.aihu` and `meta.block.agent.aihu`; embeds `text.html` inside template; embeds `source.css` inside style.
- Snippets via `snippets/aihu.code-snippets`.

**What it does NOT do:**
- **No language server.** No `tsserver` plugin (verified — Grep `tsserverPlugin\|languageService\|allowArbitraryExtensions` across `packages/` returns zero relevant hits in non-doc files; only `docs/roadmap/arch-4-dx-tools.md:28` mentions the gap explicitly).
- **No diagnostics.** The compiler's error codes (C300/C301/C302/C303/C400/C401) are surfaced only on build, not in the editor.
- **No hover types, no go-to-def, no rename.**

### D6.2 Directive grammar regex brittleness

`syntaxes/aihu.tmLanguage.json:144-171` defines the directive matchers:

```jsonc
{ "match": "(\\$on:[a-zA-Z][a-zA-Z0-9-]*)(?:(=)(\\{[^}]*\\}))?", ... }   // $on:event={handler}
{ "match": "(\\$bind:[a-zA-Z][a-zA-Z0-9-]*)(?:(=)(\\{[^}]*\\}))?", ... }  // $bind:prop={expr}
{ "match": "(\\$[a-zA-Z][a-zA-Z0-9]*)(?:(=)(?:(\\{[^}]*\\})|(\"[^\"]*\")|('[^']*')))?", ... }
```

**Brittleness.** All three patterns use `\\{[^}]*\\}` for curly content — **non-recursive, no nesting**. In `CalendarGrid.aihu:45`, the handler `{() => { this.dispatchEvent(new CustomEvent('dayjump', { detail: day, bubbles: true })) }}` contains 4 nested `{...}` levels. The regex matches up to the first `}` and **mis-tokenizes** the rest of the attribute as either Text or generic source — visible as broken syntax highlighting in the editor (consistent with the screenshot symptoms described in the Director note).

### D6.3 Biome (`biome.json`)

**Finding.** Biome formatter has **NO `.aihu` configuration**:
- `files.includes` does not list `*.aihu` explicitly; default behavior is to ignore extensions Biome does not know.
- `files.ignoreUnknown: false` (`biome.json:9`) means `.aihu` files would surface as warnings in the Biome diagnostics, not be formatted.
- `bench/compiler-conformance` IS explicitly excluded (`biome.json:21`) — so conformance fixtures don't need to pass formatter rules.
- No `.aihu`-specific override in `overrides[]`.

**Verdict.** Biome **does not format `.aihu`** at all. Authors saving in VS Code with Biome's "format on save" enabled get no formatting on `.aihu`. There is no aihu-specific formatter.

### D6.4 Colon-namespaced attribute interaction

`$on:click=` and `$bind:value=` are HTML-legal as attribute names (XML namespacing precedent). Real-world tooling problems verified:

- **TextMate grammar handles them** (D6.2 — explicit patterns).
- **VS Code's HTML auto-complete** for tag attributes is NOT engaged inside `.aihu` files because the language id is `aihu`, not `html` (with HTML embedded only in `meta.block.template.aihu` regions). Inside the template region the embedded grammar is `text.html`, but custom attribute names are not in HTML's attribute completion list — author types `$on:` and gets nothing.
- **Biome formatter:** N/A (D6.3 — does not format `.aihu`).
- **Spell-check:** The screenshot's "dayjump" red squiggle is consistent with VS Code's default text spell-checker treating string literals inside `meta.expression.aihu` as natural-language (because the embedded scope is `source.ts` which has prose-aware patterns but the inner string is matched as `string.quoted.single.aihu`). Cannot run VS Code interactively to confirm; the inference is consistent with the embedded-grammar mapping in `package.json:46-50`. No `cspell` config in the aihu repo (verified by Glob — no `cspell.*` files).

### D6.5 Friction summary table

| Friction | Root cause | Severity |
|---|---|---|
| Nested `{...}` breaks syntax highlighting | Regex `\{[^}]*\}` non-recursive in `aihu.tmLanguage.json:145,154,163` | High (visible in screenshot) |
| No diagnostics in editor | No tsserver plugin | High |
| No formatter | Biome does not handle `.aihu` | Medium |
| No autocomplete for `$on:`/`$bind:` | No language server + non-standard attribute names not in HTML embedded scope | Medium |
| Spell-check on string handler names | Default VS Code spell-check on quoted strings inside embedded scope | Low (cosmetic) |
| Type-checking @template content | No tsserver plugin + `.aihu` not in tsconfig include path | High (load-bearing for the user's "typed" non-negotiable) |

---

## D7 — Risk register (top 7, ranked)

Per Director brief, weighted for hard-cut + codemod choice. Ranked by `impact x probability / recoverability`.

| # | Risk | Impact | Probability | Weight | Notes |
|---|---|---|---|---|---|
| 1 | **Codemod complexity for irregular `$each` LHS expressions** | High | High | **Highest weight** | `CalendarGrid.aihu:31` uses `$each="events.filter(e => ...) as evt"` — LHS contains parens, dots, lambda. The `parse_each_value` parser bypasses `validate_macro_quoted_value` and accepts this; the codemod must round-trip it. If the new spec tightens `$each` LHS rules, this file fails. |
| 2 | **Codemod must handle template-syntax + macro-vocab-v2 simultaneously** | High | High | High | 13+ files still on v1 macro-vocab; no codemod exists yet. The macro-vocab-v2 spec (section 6) declares C440 + `migrate.ts` but the implementation hasn't been written. A `@template` codemod that breaks against unmigrated `@state` blocks will block merge. |
| 3 | **Compiler error-message regression during migration** | Medium | High | High | Existing error codes C300/C301/C302/C303/C400/C401 are surfaced only via stderr (no IDE integration — D6.1). New error codes need to point at codemod helpers, but with no LSP they appear only in build logs. |
| 4 | **Breakage of `examples/` corpus + `cf-team` template** | High | High | High | 21 examples + 3 cf-team files = 24 in-aihu-repo SFCs the Architect's codemod must round-trip green. Conformance fixtures (`bench/compiler-conformance/template-attrs/*.aihu`) double as the parser-test source-of-truth. |
| 5 | **IDE / tooling regression** | Medium | High | High | Adding new sigils (e.g., `<$if>`, `{#if}`) requires tmLanguage grammar updates (`aihu.tmLanguage.json`); Biome still won't format. Director's Variant B (`{#if}`) needs new top-level patterns; Variant C (`<$if>`) needs new macro-element arms. The `aihu.tmLanguage.json` regex brittleness is itself a Risk-2 amplifier. |
| 6 | **RFC scope creep into `@state` v2 territory** | Medium | Medium | Medium | The macro-vocab-v2 collection-form pattern is "tempting analog" for `@template` (Director section 1 first bullet). If Architect proposes per-directive bare/wrapped duality on `@template`, that crosses the explicit IS-NOT-IN line. Watch for: any "wrap a directive in metadata" sketch, any `$if: { value: () => ..., describe: '...' }` shape. |
| 7 | **Silent-drop default arm in `emit_macro_effects` (`emit.rs:2088`)** | Medium | Low–Medium | Medium | The `_ => {}` arm means new `$macro` directives are silently no-op'd. If the Architect adds e.g. `$class={...}` and the codemod injects it without compiler implementation, *userland breaks at runtime, not build*. Recommend: parser allowlist + codegen exhaustiveness check land in same change as new directive sigils. |

**Bonus risk (8) discovered.** `$ref` is documented in Director's brief as something to inventory but is **silently no-op'd by codegen today**. 7 in-scope files use `$ref` (D5.2) but their refs do not work — verifiable by inspecting `emit_macro_effects` at `emit.rs:2010-2090`. Whatever the Architect proposes for refs, it is starting from a broken-but-syntactically-legal baseline.

---

## Top three surprises (for STATUS line)

1. **`$ref` is parsed but silently dropped by codegen** (`emit.rs:2010-2090` has no `"ref"` arm; falls into `_ => {}` at L2088). 7 in-scope `.aihu` files use it. Their refs don't work. This is a pre-existing bug, not introduced by this round, but it's load-bearing for the inventory.
2. **Zero string-to-code paths in production code.** Across the entire `packages/` tree: zero matches for the JavaScript dynamic-eval primitive, zero anonymous-function constructors, zero `vm.runIn*`. The only DOM injection path is the `$html` HTML-content-property write at `emit.rs:2065`. Security model is cleaner than expected — the codebase has clearly avoided string-to-code on principle.
3. **Macro-vocab-v2 codemod is unwritten.** The spec (`docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md` section 6) declares `packages/compiler/codemods/macro-simplification/migrate.ts` and error code C440 — but Glob `**/codemods/**` returned no files. 13+ files in `examples/` still use v1 macro syntax, and the `cf-team` template scaffold is fully on v1. The `@template` codemod will likely need to ship together with the `@state` v1->v2 codemod; they touch the same files.

---

## STATUS line

**STATUS: DONE**

- Top surprises: (a) `$ref` is silently dropped by codegen — 7 files affected. (b) Zero string-to-code paths in production source — clean security floor. (c) Macro-vocab-v2 codemod referenced in spec is unwritten; 13+ files still on v1 syntax need parallel migration.
- Disk-mirror written to `c:\git\fellwork\aihu\.team\scout-reports\template-syntax-001.md`.
- AGENTS.local.db write skipped — aihu repo's `AGENTS.local.db` does not exist in this filesystem and the live MCP `agents_search` channel is wired to api-repo per Director note section 9. **Recommendation:** Team Lead transcribe this report's content into aihu's local layer when that DB comes online (or treat this disk file as authoritative for round 1).

*— End of scout report.*
