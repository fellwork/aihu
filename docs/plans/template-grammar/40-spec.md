# The Prefix-less Template — normative grammar specification

**Status:** NORMATIVE — founder-ratified 2026-07-21. This document transcribes the ratified
design; it is the single source of truth for the builders. It does not redesign.
**Branch:** `docs/template-grammar-spec` off `origin/main@d5b3242f`.
**Charter:** `00-charter.md`. **Verification note:** every `file:line` reference in this
document was read against this worktree at `d5b3242f` on 2026-07-21; the migration counts
in §6 were measured by grep on the same tree.

**Provenance markers used throughout:**
- **[R]** — founder-enumerated, verbatim from the ratified design.
- **[R→]** — not separately enumerated by the founder, but mechanically entailed by the
  one rule applied to vocabulary that already exists in the compiler. These are
  transcriptions, not additions; each is individually flagged so ratification review can
  veto any of them without touching the rest.
- **[S]** — a shape this spec was directed to pick and justify (the escape hatch, the
  `<a>` opt-out attribute name, diagnostic code numbers).

---

## §1 The one rule

> **Naked keywords + naked HTML attributes + naked framework vocabulary. `{expr}` braces
> mean expression; quoted strings mean static. `$` retreats to `@state` macros only.** [R]

Normatively:

1. **In `@template`, no attribute and no element may begin with `$`.** This is a
   **grammar** rule about attribute and element names — it is **not an identifier ban**.
   `$`-named bindings remain reachable inside expressions: `onclick={() => $emit.save(x)}`
   is legal, because `$emit` there is an identifier in an expression, not a grammar word.
   (The sidecar already derives a typed `$emit`/`$event` from the `$event:` collection —
   `packages/compiler/src/codegen/emit.rs:348–402` — and that stays.) [R]
2. **Braces = expression.** A `{…}` attribute value or text-position `{…}` holds exactly
   one JS/TS expression, validated by the oxc layer (`packages/compiler/src/expr/mod.rs`,
   C320/C321 contract) — except the control-flow heads of §2.3, which are **heads, not
   expressions** (§3.2). [R]
3. **Quoted strings = static.** A quoted attribute value is a static HTML attribute value,
   never an expression, never an identifier reference. The v1 quoted-macro forms
   (`$on.click="fetchForecast"`, `$bind.value="location"`, `$key="id"`) die with the `$`
   layer; their replacements use braces (§4). [R]
4. **The framework vocabulary is closed and compiler-owned.** The words in §2.4/§2.5 are
   reserved on every element; there is no runtime dictionary, no plugin extension point,
   no per-project configuration. Unknown framework-shaped words are compile errors (§2.8).

### Rationale (transcribed)

- **Compiler-owns-grammar.** aihu templates are compiled, not interpreted: an unknown word
  fails the build with a rich diagnostic instead of silently passing through to the DOM.
  That is what makes naked words safe where they would be ambiguous in a runtime-scanned
  template language. [R]
- **The custom-element hyphen rule.** User components MUST be hyphenated (custom-element
  platform rule; already enforced for component references —
  `packages/compiler/src/lib.rs:386` hard error "custom-element names require a hyphen",
  `codegen/emit.rs:119` emit-time warning, `emit.rs:1400` reference classifier). A
  non-hyphenated tag can therefore never be a user component, so the framework may claim
  naked single-word elements (`<group>`, `<suspense>`, `<outlet>`) forever without
  colliding with user code. [R]
- **Attachment, not integration-by-wrapping.** Control flow attaches to the element it
  governs (`<div if={…}>`) instead of wrapping it in a second, non-HTML block DSL. One
  grammar, one nesting structure — the HTML's own — instead of two interleaved ones
  (Marko's model). This also removes the v1 duplication where `$if=` attributes and
  `{#if}` blocks coexisted with subtly different emission paths
  (`emit.rs emit_macro_effects` vs the `IfBlock` arm). [R]

---

## §2 Grammar reference (normative)

All examples use the shipped `examples/weather-card/weather-card.aihu` and
`cookbook/agent-weather.aihu` shapes, rewritten into the new grammar.

### §2.1 Interpolation [R]

- `{expr}` at text position interpolates a single expression. Single-brace only.
- **The v0 `{{ident}}` double-brace form is removed** — a compile error (C604), not an
  object-literal interpolation: `{{` at text position is always the C604 diagnostic, whose
  fix hint covers both migrations (`{{count}}` → `{count}`; a leading object literal needs
  a space: `{ {a: 1}.a }`). This keeps the a21 hijack class (plan
  `advanced-js-template-expressions.md`, truth-table a21) impossible by construction.
- A literal `{` or `}` in text is authored as an expression: `{'{'}`. (The W1 lexical
  scanner already made braces inside string literals parse correctly.)

```aihu
<h2 class="title">Weather — {city}</h2>
<p class="location">{location}</p>
```

### §2.2 HTML attributes [R]

- **Static:** `class="story"`, `type="text"`, `placeholder="City name"` — plain HTML,
  emitted as-is.
- **Reactive:** braces. `disabled={loading}`, `href={x}`, `value={query}`. Bare signal
  reads are written bare; the compiler inserts calls (the W3 rewrite, §5 step 1).
- **Events are NOT this layer** — they are colon-namespace directives (`on:click`, §2.4).
  Rationale: aihu event binding is a real listener with lifecycle and modifiers, not HTML's
  string-valued `onclick` content attribute; a naked `onclick` would be a false friend
  (looks like the HTML attribute, behaves like a framework directive). Events are a
  name-parameterized framework capability HTML has no equivalent for, so they take the
  `word:param` colon form alongside `class:`/`bind:`/`attr:`.
- **Boolean attributes:** bare presence (`disabled`) or braces (`disabled={loading}`).

**Static-attribute typing is normative:** a static string value type-checks **as a string
literal** against the attribute's type. Under `--strict-templates`, `disabled="false"` is
a **type error** (a string literal is not assignable to a boolean attribute — the Angular
`strictAttributeTypes` precedent). Even without `--strict-templates`, a **non-empty static
string on a boolean attribute** raises advisory warning **W602** [S], because
`disabled="false"` is truthy in HTML and is a known author trap. Mechanism: §5 step 4.

```aihu
<input type="text" bind:value={location} placeholder="City name" />
<button on:click={fetchForecast} class="refresh-btn" disabled={loading}>Refresh</button>
```

### §2.3 Control flow — naked keyword attributes [R]

#### `if` / `elseif` / `else`

```aihu
<p class="loading"  if={loading}>Fetching forecast…</p>
<p class="error"    elseif={errorMsg}>{errorMsg}</p>
<p class="forecast" elseif={forecast}>{forecast}</p>
<p class="prompt"   else>Press Refresh to load forecast.</p>
```

- `if={expr}` renders its element when `expr` is truthy. `elseif={expr}` and bare `else`
  chain onto the **immediately preceding** `if`/`elseif` element (adjacency: §3.1).
- `else` takes no value; a valued `else` is a compile error.

#### `each` — the item-first `of` binder

```aihu
each={ <binder> [, <index-binder>] of <list-expr> }
```

```aihu
<li each={item of items}>{item.label}</li>
<li each={item, i of items} key={item.id}>{i}: {item.label}</li>
<li each={[k, v] of entries}>{k} = {v}</li>
<li each={{ name, id } of users} key={id}>{name}</li>
```

- **Item-first, `of`-separated — deliberately NOT a TS expression.** The v1 ` as ` form
  is retired because `as` collides with TS casts (a verified hazard —
  `advanced-js-template-expressions.md` §Options B). `of` reads as the JS `for…of` head it
  maps onto verbatim in the type sidecar (§5 step 3). [R]
- **The binder side parses as a real BindingPattern list**, not text: `binder` is a
  `BindingIdentifier`, `ArrayBindingPattern`, or `ObjectBindingPattern`; `index-binder`
  is a `BindingIdentifier`. Destructuring (`each={[k, v] of entries}`) works because the
  binder is a pattern parse (the validated `(alias) => 0` param-pattern trick,
  `expr/harvest.rs alias_bound_idents`), which kills the v1 `split_once(',')` tear
  (truth-table c10/c11) for good. [R]
- **`list-expr` is an ordinary expression** (oxc-validated, `ExprPosition::EachList`).
- Head-splitting rule: §3.2.

#### `key={expr}` — optional, linted [R]

- `key={expr}` on the `each` element; `expr` evaluates per item with the loop binders in
  scope (`key={item.id}`).
- Optional — but the compiler emits lint **W601** [S] when a keyless loop body contains
  **components or stateful elements** (elements carrying `bind:*`, `ref`, or component
  tags): Angular made `track` mandatory in `@for` on exactly this evidence; aihu softens
  mandatory to lint. [R]

#### `empty` — the loop empty state [R]

```aihu
<li each={item of items} key={item.id}>{item.label}</li>
<li empty class="none">No items yet.</li>
```

- Bare `empty` on the **immediately following element sibling** of the `each` element
  renders that element when the list is empty. Adjacency: §3.1.

#### Combining on one element

`if` and `each` may share an element (including `<group>`). Composition carries the
existing v1 semantics unchanged (`emit.rs emit_macro_effects`, FEL-238 comment,
`emit.rs:6954–6974`): **iteration is outermost**; the `if` condition evaluates per item
with the loop binders in scope.

### §2.4 Framework attribute vocabulary — naked words

Reserved on every element. Unknown-word protection: §2.8.

| Word | Value | Meaning | Provenance |
|---|---|---|---|
| `if` / `elseif` / `else` | expr / expr / bare | §2.3 | [R] |
| `each` | head (§3.2) | §2.3 | [R] |
| `empty` | bare | §2.3 | [R] |
| `key` | expr | §2.3 | [R] |
| `show` | expr | visibility toggle (lowers to `hidden` attr, unchanged from `$show` — `emit.rs` R3) | [R] |
| `html` | expr | set innerHTML from a trusted expression (unchanged lowering from `$html`) | [R] |
| `ref` | expr | element ref written at mount (unchanged from `$ref`) | [R] |
| `on:<event>` | handler expr | event listener: `on:click={fetchForecast}`, `on:input={(e) => …}`; modifiers via dots: `on:click.prevent`, `on:submit.once` (v1 `$on.click` / `on:`, de-`$`-ed; the colon form + dotted modifiers is the existing internal shape — `parser/directives.rs:32,37–40`) | [R→] |
| `bind:<prop>` | expr | two-way binding: `bind:value={location}`, `bind:checked={done}` (v1 `$bind.value` / `$bind:value`, de-`$`-ed; colon form is already the internal AST normalization — `parser/directives.rs:37–40`) | [R→] |
| `class:<name>` | expr | conditional class toggle: `class:active={isOn}` (v1 `$class:active`, de-`$`-ed) | [R→] |
| `once` | bare | render-once boundary (v1 `$once`) | [R→] |
| `memo` | expr | memo boundary with dep expression (v1 `$memo`) | [R→] |
| `raw` | bare | verbatim element, no macro processing (v1 `$raw`) | [R→] |

The [R→] rows are the existing reserved vocabulary
(`parser/directives.rs:32–40`: `if, each, key, show, once, memo, html, raw, ref` +
`on:, bind:, class:, emit:` prefixes) carried through the one rule by stripping `$`.
The `on:` prefix **is carried** as a colon-namespace directive (`on:click`, with dotted
modifiers) — events are name-parameterized framework listeners, not HTML's string `onclick`
attribute, so they join the `word:param` family (§2.2, founder-ratified 2026-07-21). The
`emit:` prefix has zero corpus usage and is dropped;
`$let={x}` (loop alias on the v1 attribute form, 4 corpus occurrences) is subsumed by
the `each` binder and gets a targeted fix hint (§4).

**`class` composition (normative).** The naked `class` attribute (static `class="card"` or
reactive whole-string `class={cls}`) and any number of `class:<name>={cond}` toggles
**coexist on one element** and compose: the naked attribute owns the base class list, the
colon directives own individual reactive toggles layered on top. This is the one attribute
that is legitimately both static-base and reactive-toggle at once. Precedence [S]: when a
reactive whole-string `class={expr}` and a `class:<name>` toggle both address the same
class name, the **toggle is authoritative** (applied after the base string resolves), so a
per-class directive always wins — matching Svelte's model. Static base + toggles (the
common case) never overlap.

### §2.5 Framework elements — naked tags

| Element | Meaning | Provenance |
|---|---|---|
| `<group>` | **New.** Invisible fragment carrier: renders no DOM element, exists to carry `each`/`key`/`if` (and the other §2.4 words) over a multi-element body — dodging JSX's keyed-fragment trap (`<React.Fragment key=…>` being the only attribute-capable fragment). | [R] |
| `<suspense>` | async boundary (v1 `<$suspense>`; the C400 fallback mutual-exclusion rule carries over — `parser/template.rs:6–36,444`) | [R] |
| `<outlet>` | router outlet (v1 `<$outlet>`) | [R] |
| `<slot>` | real content projection (v1 `<$slot>`; note the plain-HTML `<slot>` form already exists and currently warns "DEPRECATED … use `<$slot>`" — `parser/template.rs:459`. That warning inverts: `<slot>` becomes the only form.) | [R] |
| `<shield>` | error/guard boundary (v1 `<$shield>`) | [R→] |
| `<router>` | router boundary (v1 `<$router>`) | [R→] |
| `<navigate>` | declarative redirect (v1 `<$navigate>`) | [R→] |

```aihu
<group each={day of forecastDays} key={day.date}>
  <dt>{day.date}</dt>
  <dd>{day.temperature}°F</dd>
</group>
```

### §2.6 `<a>` enhanced; `<$link>` retired [R]

```aihu
<a href={`/city/${slug}`} prefetch="hover">Forecast for {city}</a>
```

- `<a>` gains the router behaviors `<$link>` carried: SPA navigation on click,
  `prefetch` (`"hover" | "visible" | "none"`), `replace`, `aria-current` maintenance.
  This is **pure sugar removal**: the compiled `<$link>` already renders
  `branch('a', { … })` with a composed click handler (`emit.rs:1769`,
  `createLinkBoundary`) — the element the author writes and the element the runtime
  renders become the same element.
- **Automatic opt-out** — a plain full-document navigation, no SPA interception, when any
  of: `target="_blank"`, `download` present, the href resolves to an **external origin**,
  or the href scheme is not http(s) (`mailto:`, `tel:`). [R]
- **Explicit opt-out attribute: `reload`** [S] — `<a href="/legacy" reload>` always
  performs a full document load. Shape justification: it names the observable behavior
  (the document reloads), follows the `data-sveltekit-reload` precedent while dropping
  the vendor prefix (the compiler owns the grammar, so no namespacing is needed), and is
  not a standard HTML attribute, so it cannot shadow platform meaning.

### §2.7 Escape hatch — literal attributes named with grammar words [R, shape S]

Third-party custom elements may legitimately define attributes named `if`, `key`, `ref`,
`show`, … The escape hatch is the **`attr:` prefix**:

```aihu
<x-legacy-widget attr:if="config-string" attr:key={dynamicVal}></x-legacy-widget>
```

- `attr:<name>` emits a literal attribute `<name>` on the element, bypassing framework
  interpretation entirely. Value rules are ordinary §2.2 rules (quoted = static,
  braces = reactive).
- Shape justification [S]: (i) it joins the **existing colon-namespace family** the
  parser already tokenizes (`bind:`, `class:` — `directives.rs:37–40`), so it needs no
  new lexer form; (ii) it matches the Angular `[attr.name]` precedent authors know;
  (iii) it is self-describing — "this is an attribute, nothing more"; (iv) it is total:
  it works for every current and **future** grammar word, so growing the vocabulary
  (§2.4) can never strand a third-party element.
- `attr:` is legal on any element but only *needed* where a grammar word collides.

### §2.8 The protection mechanism [R]

- **Elements:** a tag is (a) a known HTML element, (b) a §2.5 framework word, or (c) a
  hyphenated custom-element name (user component). A non-hyphenated unknown tag is a
  **compile error C611** [S] ("unknown element — framework elements are `<group>`,
  `<suspense>`, …; components must be hyphenated"). This upgrades today's emit-time
  warning (`emit.rs:119`) into the grammar's protection: a typo'd or future framework
  word can never silently reach the DOM.
- **Attributes:** the §2.4 vocabulary is reserved on all elements. Anything else is an
  ordinary HTML/custom attribute — validated by the type layer (§5 step 4) rather than
  the grammar, so `data-*`, `aria-*`, and custom-element attributes stay open.

---

## §3 Adjacency and parsing rules

### §3.1 Normative adjacency (Marko's model) [R]

**`elseif`, `else`, and `empty` must appear on the immediately-following element
sibling** of the element they chain from (`if`/`elseif` for the first two, `each` for
`empty`). Between the two elements only **whitespace text and comments** (HTML comments;
whitespace-only text nodes) may appear. Anything else — a non-whitespace text node, an
interpolation, another element — is compile error **C610** [S], naming both elements and
the offending node.

**Formatter safety is part of the contract:** formatters (including the future Prettier
plugin) MUST NOT reorder chained siblings or interpose nodes between them. Whitespace and
comments between chain members are format-stable by construction (they are the only legal
interstitial content). This clause is normative for any tool that rewrites templates.

### §3.2 Control-flow heads are heads, not expressions [R]

The `each` head (`item, i of items`) **is not a TS expression** and must never be handed
whole to a TS parser (where `of`/`as` forms misparse). This carve-out is named and
load-bearing for three consumers:

1. **C-diagnostics** — head syntax errors get head-specific messages ("expected
   `<binder> [, <index>] of <list>`"), never oxc's expression errors.
2. **The future Prettier plugin** — heads are formatted by head rules (binder list, `of`,
   expression), not expression rules.
3. **The sidecar generator** — the head maps structurally onto `for (const […] of …)`
   (§5 step 3), which requires knowing binder-vs-expression sides, not a token soup.

**Head-splitting rule (normative):** the head splits at the **first top-level ` of `** —
outside strings, template literals, comments, regex, and all bracket nesting — using the
shared lexical scanner (the same machinery as today's ` as ` locate,
`parser/template.rs:773 parse_each_header` / `parser/expr_scan::CodeScanner`). The left
side parses as the BindingPattern list; the right side parses as one oxc TS expression.
This split is sound because a BindingPattern cannot contain a top-level ` of `
(identifiers, `[…]`, `{…}` only — any interior `of` is inside brackets, hence not
top-level).

`if={…}`, `elseif={…}`, `key={…}`, and all §2.4 expression values ARE ordinary
expressions (oxc-validated as today).

### §3.3 Brace scanning

`{…}` boundaries in text and attribute positions use the W1-hardened lexical scanner
(strings, template literals, comments, regex — `advanced-js-template-expressions.md`
W1). No new scanner classes are introduced by this grammar; the naked-attribute forms
reuse the existing attribute-value brace extraction (`directives.rs:524/:539`).

---

## §4 The retirement table

**Every old form is a compile error with a `fix:` hint — the C471 pattern
(`parser/state_macros.rs:312`: `code` + `hint` + `fix` on `CompileError`). No deprecation
period; there are no external consumers.** [R] Codes C601–C611 and W601/W602 are assigned
by this spec [S] from the unused C6xx block (verified free at `d5b3242f`).

| Retired form | Code | `fix:` hint (normative content, wording may be polished) | Provenance |
|---|---|---|---|
| `{#if e}…{:else if e}…{:else}…{/if}` | C601 | rewrite as attribute control flow: `if={e}` on the governed element, `elseif={e}`/`else` on immediate siblings; wrap multi-element branches in `<group>` | [R] |
| `{#each list as item, i (key)}…{:empty}…{/each}` | C602 | rewrite as `each={item, i of list} key={keyExpr}` on the repeated element (or `<group>`); move the `{:empty}` body to an `empty` sibling | [R] |
| `{@html expr}` | C603 | use the `html={expr}` attribute on the containing element | [R→] — entailed by the one rule (a `{@…}` block is braces-that-are-not-expression); the naked `html` attribute [R] is its ratified successor |
| `{{ident}}` v0 double-brace | C604 | use single braces `{ident}`; an expression starting with an object literal needs a space: `{ {…} }` | [R] |
| `<$if test>` / `<$else>` elements | C605 | use `if={…}` / `else` attributes | [R] — zero corpus usage found; the code exists as a tripwire |
| `$if={e}` / `$each={…}` attributes, incl. string-DSL `$each="items as item"` and `$let={x}` | C606 | `$if={e}` → `if={e}`; `$each={list}` + `$let={item}` → `each={item of list}`; `$each="items as item"` → `each={item of items}` | [R] |
| any other `$`-prefixed attribute | C607 | per-name map: `$on.click={h}`/`$on:click`/quoted form → `onclick={h}`; `$class={e}` → `class={e}`; `$class:x={e}` → `class:x={e}`; `$bind.value="name"`/`$bind:value` → `bind:value={name}`; `$key="id"` → `key={item.id}`; `$show`/`$html`/`$ref`/`$once`/`$memo`/`$raw` → naked word; generic `$name={e}` → `name={e}` | [R] item 2 for events/attrs; [R→] for the §2.4 rule-carried rows |
| `<$link href prefetch replace>` | C608 | use `<a href={…} prefetch="…">`; `replace` carries over; add `reload` to opt out of SPA navigation | [R] |
| any other `$`-prefixed element | C609 | `<$slot>` → `<slot>`, `<$suspense>` → `<suspense>`, `<$shield>` → `<shield>`, `<$outlet>` → `<outlet>`, `<$router>` → `<router>`, `<$navigate>` → `<navigate>` | [R] for slot/suspense/outlet; [R→] for shield/router/navigate |
| adjacency violation (`elseif`/`else`/`empty` not the immediate element sibling) | C610 | move the branch element directly after its chain head; only whitespace/comments may sit between | [R] |
| unknown non-hyphenated element | C611 | §2.8 | [R] protection mechanism, code assignment [S] |

Warnings: **W601** keyless `each` whose body contains components/stateful elements (§2.3);
**W602** non-empty static string on a boolean attribute (§2.2).

Every C-code's diagnostic MUST carry `from:` with the verbatim offending text (the C320
anchoring pattern, `expr/mod.rs:329–351`) so `render_human_error` produces a real
codeframe.

---

## §5 Type architecture (ratified steps 1–5 — the plan the builders implement)

The Volar virtual-code architecture is **kept**: `.aihu` is presented to TypeScript as a
line-preserving virtual TS surface (`packages/tsc/src/language-plugin.ts`,
`compileSidecar` → `buildMappings`), diagnostics map back to authored lines. What is
replaced is the **flat-lift generator** inside it — today's sidecar lifts each template
expression as an isolated `void (expr);` statement (`emit.rs:336 emit_sidecar_ts`), which
cannot narrow, cannot type loop binders (they are `any` params — `emit.rs:507–526`), and
checks authored text whose bare signal reads have the wrong type.

**Step 1 — rewrite-before-lift.** Run the existing W3 AST rewrite
(`packages/compiler/src/expr/rewrite.rs`, `expr::rewrite_signal_reads` — scope-aware,
span-spliced, `RewriteResult`) over every collected expression **before** it enters the
sidecar, so `count + 1` is lifted as `count() + 1` and bare reads check at their authored
value types instead of as getter functions. Simultaneously **flip the `--expr-parser`
default from `legacy` to `ast`** (`expr/mod.rs:72–80`, `ExprParserMode::default` is
currently `Legacy`) so emit and typecheck share one expression semantics — the flip the
W3 plan already scheduled behind a clean corpus diff. Line mapping is unaffected: the
line-recovery cursor keeps searching the ORIGINAL text (the GX precedent,
`emit.rs:614–618`), and `language-plugin.ts buildMappings` already tolerates
rewritten spans (its `srcCol < 0` continue at `language-plugin.ts:109`) — step 1 should
extend the per-line matcher to map the pre-rewrite subexpressions.

**Step 2 — real `if`/`else` emission.** The guard machinery already exists:
`SidecarExpr.guards` (`emit.rs:1195–1198`) threads the stack of enclosing conditions
through `collect_template_exprs_guarded` (`emit.rs:1208`, branch guards built with
`!(prior)` negation at `emit.rs:1285–1298`) — but guards are **rendered only for
GX-governed routes**, filtered to entitlement guards (`emit.rs:625–633`). Step 2
generalizes rendering to ALL guards, emitting real `if (guard) { … }` blocks whose heads
sit on the control-flow source lines (the `if={…}` element's line), so TypeScript
**narrowing** flows into branch bodies for every discriminated union and null check —
`<p if={forecast !== null}>{forecast.resolvedName}</p>` checks `forecast` as non-null.
The GX `__gxEntitled` predicate rewrite (`emit.rs:604–624`) becomes one client of the
general mechanism instead of the only one.

**Step 3 — `for…of` + one overloaded `__aihu_each` helper.** The `of` head maps
verbatim: `each={item, i of items}` emits, on the loop's source lines,

```ts
for (const [item, i] of __aihu_each(items)) { …body statements… }
```

with one declared overloaded helper (the Vue-language-tools `__VLS_getVForSourceType` /
svelte2tsx `ensureArray` pattern):

```ts
declare function __aihu_each<T>(list: readonly T[]): ReadonlyArray<[T, number]>;
declare function __aihu_each<T>(list: Iterable<T>): ReadonlyArray<[T, number]>;
declare function __aihu_each(list: number): ReadonlyArray<[number, number]>;
```

Loop binders thereby get **inferred element types**, retiring the `any` loop-alias params
(`emit.rs:516–526` — the comment "an honest `any` beats a wrong type" retires with them).
Destructured binders map structurally (`each={[k, v] of entries}` →
`for (const [[k, v], __i] of __aihu_each(entries))`). Copy svelte2tsx's
**alias-shadows-iterable intermediate const**: when a binder name shadows a name the list
expression reads (`each={items of items}`), emit `const __list_N = __aihu_each(items);`
before the loop head so the expression is evaluated in the outer scope.

**Step 4 — attribute + component-prop layer**, gated behind `--strict-templates` (the
flag exists: `packages/tsc/bin/aihu-tsc.mjs:5,18`; `packages/tsc/src/index.ts:48,118` —
today a diagnostic filter; step 4 makes it a check level).
- **Dynamic attribute expressions** check against the element's attribute types via the
  `document.createElement('tag')` trick: the sidecar materializes
  `const __el_N = document.createElement('button')` (typed `HTMLButtonElement` through
  `HTMLElementTagNameMap`) and emits `__el_N.disabled = (expr);`-shaped statements on the
  attribute's source line — no handwritten attribute table.
- **Static strings check as string literals** against the same types (§2.2 normative
  typing; `disabled="false"` errors under strict).
- **Component props** derive from the child component's `$prop` declarations (the typed
  member the macro binds — the `macro_binding_decls` path, `emit.rs:464`), so
  `<weather-badge temp={x}>` checks `x` against the declared prop type.

**Step 5 — unify editor + CLI.** Point the language server at `compileSidecar` through
the existing `packages/tsc/src/language-plugin.ts` (`createAihuLanguagePlugin` is already
a self-contained Volar `LanguagePlugin`), and **retire
`packages/language-server/src/core/state-generator.ts`** — the parallel, weaker,
regex-based surface (`inferType` regex at `state-generator.ts:89–106`, `0 as any`
defaults at `:112–120`), currently wired via
`language-server/src/core/volar-plugin.ts:24`. After step 5 there is exactly one
type-check surface; an editor squiggle and a CI failure are the same diagnostic by
construction.

**Test spine:** the end-to-end harness pattern is
`packages/compiler/tests/gx-data-sidecar-tsc.test.ts` (`transform(src, id,
{ sidecarOut })` → real `tsc --noEmit`, asserting both the pass and the named failure).
Steps 1–4 each add fixtures to that lane (§8.2).

---

## §6 Migration inventory (measured at `d5b3242f`, 2026-07-21)

Counts are **files containing the form** (`grep -rlE`, node_modules excluded). Corpus:
`examples/` (38 `.aihu`), `cookbook/` (20), `bench/` (30), `apps/docs/` (3 `.aihu` +
content markdown), `packages/ui/registry/` (19), `packages/compiler/tests/`, `tests/`.

| Form (code) | Total files | Breakdown |
|---|---|---|
| `$if=` (C606) | 32 | examples 17 · bench 2 · apps/docs 1 · compiler tests 12 |
| `$each=` (C606) | 37 | examples 13 · cookbook 1 · bench 2 · apps/docs 3 · compiler tests 18 — of which **25** use the string-DSL `$each="… as …"` |
| `{#if}` blocks (C601) | 13 | cookbook 6 · bench 1 · compiler tests 6 |
| `{#each}` blocks (C602) | 11 | cookbook 4 · apps/docs 1 · compiler tests 6 |
| `{:else…}` | 9 | (within the above) |
| `{:empty}` | 3 | (within the above) |
| `{@html}` (C603) | 5 | |
| `<$link>` (C608) | 9 | examples 3 · compiler tests 6 |
| `<$if>`/`<$else>` (C605) | 0 | tripwire only |
| `{{ident}}` (C604) | 0 | `.aihu` corpus clean already |
| `$on.*` (C607) | 59 | highest-frequency single form: `$on.click` at 80 occurrences |
| `$key=` (C607) | 35 | 30 occurrences |
| `$class` forms (C607) | 40 | `$class=` 41 occ · `$class:active=` 34 occ |
| `$bind.*` (C607) | 23 | `$bind.value=` 22 occ + `$bind:value=` 5 occ |
| `$html=` (C607) | 12 | |
| `$show=` (C607) | 9 | |
| `$ref=` / `$once` / `$memo` (C607) | 1 / 4 / 4 | |
| `$let=` (C606) | 3 files | 4 occurrences (storefront, realtime-scores) |
| `<$slot>` (C609) | 14 | |
| `<$suspense>` / `<$shield>` / `<$outlet>` (C609) | 8 / 4 / 6 | |
| `<$router>` / `<$navigate>` (C609) | 2 / 2 | |

Additional surfaces:
- **`packages/ui/registry/`** (19 `.aihu`): only plain `$attr={…}` bindings (`$class=`,
  `$disabled=`, `$aria-label=`, …) — no control flow; pure mechanical C607 rewrites.
- **`apps/docs/src/content/`**: **7** markdown files carry old-form snippets
  (authoring-components, data-fetching, migration, cli, …). Prose migrates with the code.
- **`llms.txt` / `llms-full.txt`**: **0** occurrences — already clean.
- **bench goldens**: `.golden.js` files regenerate mechanically from the migrated
  fixtures (2 goldens carry old-form text today); the conformance lanes
  `bench/compiler-conformance/{blocks,macro-elements,template-attrs}` are themselves
  old-grammar fixture sets that convert wholesale, and `v1-rejections/` gains the
  C601–C611 rows (§8.1).
- **`tests/`** (integration root): 0 `.aihu` files — nothing to migrate.

The grep set used for this table is the **§8.4 completeness gate**: post-migration, the
same greps must return zero.

---

## §7 SSR interaction — the Structural-Node Independence invariant

**Invariant (named, normative): both grammars compile to the SAME arbor structural
nodes, and the SSR structural walk consumes only those nodes; therefore the grammar
redesign and the SSR walk land independently, in either order, with no coordination
beyond the existing arbor contract.**

Grounding: templates lower to `branch` / `leaf` / `slot` / `when(condition, grow)` /
`each(list, keyFn, listGrow)` (`packages/arbor/src/index.ts:1–7`,
`packages/arbor/src/structural.ts:11–36` — `structuralKind: 'conditional' | 'list'`).
`if={…}` lowers to the same `when()` call `{#if}` lowers to today; `each={item of list}`
lowers to the same `each()` call `{#each list as item}` does; `<group>` lowers to a
children array with structural wrappers and no `branch()` of its own. The SSR structural
walk (branch `feat/ssr-structural-walk`, same base `d5b3242f`) renders `StructuralNode`
trees — it never sees template syntax.

Consequences (normative):
1. Neither effort blocks the other; neither PR reviews the other's surface.
2. The grammar wave MUST NOT change the arbor structural contract. Any change it needs
   there is out of scope and requires its own ratification.
3. Old→new equivalence is **testable at the arbor layer**: a migrated fixture must emit
   the same structural calls as its old-form original (§8.5).

---

## §8 Acceptance criteria

The wave is done when ALL of the following hold:

1. **Compile-error coverage for every retired form.** One conformance fixture per
   C601–C611 row in `bench/compiler-conformance/v1-rejections/` (the existing rejection
   lane), each asserting the **code**, the **`fix:` text**, and the **`from:` anchor** —
   message-level assertions, the W1 precedent ("every fixed case asserts the *message*").
   C605's fixture asserts the tripwire fires even though corpus usage is zero.
2. **Sidecar-tsc tests** (the `gx-data-sidecar-tsc.test.ts` harness pattern) for:
   - **narrowing** — `if={x !== null}` body accessing `x.y` passes; the unguarded copy
     fails with the named TS error (step 2);
   - **loop inference** — `each={item of items}` binder typed from the list; destructured
     binder; alias-shadows-iterable; a wrong member access on the binder FAILS (step 3);
   - **static-attr typing** — `disabled="false"` fails under `--strict-templates`;
     W602 emitted non-strict; a correct `disabled={bool}` passes (step 4);
   - **rewrite-before-lift** — a bare signal read checks at its value type; the
     `--expr-parser` default is `ast` (step 1).
3. **Adjacency + formatter safety.** Fixtures: comment/whitespace between `if` and
   `elseif` compiles; an interposed element or non-whitespace text fails with C610. The
   Prettier-plugin contract of §3.1 is stated in the grammar docs page.
4. **Migration completeness = repo greps clean.** The §6 grep set returns zero across
   `examples/ cookbook/ bench/ apps/docs/ packages/ tests/`, enforced by a CI script so
   regression is impossible. Docs prose (7 md files) and `llms.txt` regeneration
   included.
5. **Structural equivalence.** For a representative migrated corpus (weather-card,
   agent-weather, storefront, realtime-scores, the conformance lanes), the emitted arbor
   structural calls are equivalent to the pre-migration goldens, with every intended diff
   named in the CHANGELOG (the W3 corpus-diff discipline).
6. **`<a>` behavior fixtures.** SPA navigation on plain internal `<a href>`; auto-opt-out
   for `target="_blank"`, `download`, external origin, non-http(s) scheme; explicit
   `reload`; `prefetch="hover"` parity with the retired `<$link prefetch>`.
7. **One type surface.** `state-generator.ts` is deleted; the language server and
   `aihu-tsc` both consume `compileSidecar` (step 5); an editor diagnostic and the CLI
   diagnostic for the same fixture are byte-identical.

---

## §9 Open questions — and the recorded backlog

**No true contradictions were found while specifying the ratified design.** Two
entailments the founder's enumeration did not separately list are transcribed with
provenance flags rather than opened as questions, because in each case the one rule
determines the outcome mechanically and any alternative would be a redesign:

- **C603 (`{@html}` retirement)** — keeping any `{@…}` block would violate "braces =
  expression"; the ratified naked `html` attribute is its successor. Flagged [R→] in §4.
- **The rule-carried vocabulary** (`bind:*`, `class:*`, `once`, `memo`, `raw`;
  `<shield>`, `<router>`, `<navigate>`) — the one rule bans their `$` forms; the minimal
  semantics-preserving transcription is the de-`$`-ed word. Flagged [R→] in §2.4/§2.5.
  Ratification review can veto any row individually.

### Backlog (recorded per the ratified design — deliberately NOT specified here) [R]

1. **`if={expr} as={x}` aliasing** — the Angular `@if (expr; as x)` steal;
   founder-flagged. Interacts with step-2 narrowing; design when the sidecar emits real
   `if` blocks.
2. **Attribute shorthand `{name}`** — `disabled={disabled}` → `{disabled}`.
3. **`{@const}`-style in-template locals** — a local-binding construct consistent with
   the attribute grammar (likely an attribute, not a block, when it comes).
4. **Macro-body typechecking (TS step 6)** — extending the sidecar into `$action`/
   `$computed` bodies and macro metadata; the `@state` emit-path audit half of the old
   TODOS item, still its own effort.
