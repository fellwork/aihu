# Template Attribute Syntax — `@aihu/compiler`

**Status:** Ratified 2026-05-02 (v1 reconciliation session); Amendment 04 applied 2026-05-09
**Spec version:** 0.1.1-draft (Amendment 04 applied)
**Phase:** N+M (assigned at scoping pass)
**Author:** Architect
**Depends on:** `@aihu/signals` (stable), `@aihu/arbor` (stable), `@aihu/runtime` (stable)
**Consumes:** Macro vocabulary spec (separate document), `aihu.config.ts` plugin and scope registrations
**Related specs:** Plugin Contract Spec, Macro Vocabulary Spec, Block Structure Spec

> **Ratification note:** Migrated from `docs/spec-template-attribute-syntax.md` to `docs/superpowers/specs/` on 2026-05-02.
>
> **Amendment 04 applied 2026-05-09 (v1.0.8 cutover round):** Reactive HTML attribute bindings MUST be `$`-prefixed (`$attr={expression}`). Plain curly form (`attr={expression}` without `$` prefix) becomes a hard parse error (C306) in v1.0+. The Vue-shape `:attr="expr"` and `@event="fn"` legacy aliases are also rejected as hard errors (C304 / C305 respectively). See §11 "Deprecation policy" for the full error-code table and migration targets. Authority: user pick of Option B from Architect R5.2-research (`e8589e43-7bbf-4b87-8c26-1ee83e948c08`); routed by Director r5-sup-2 (`a4cc0505-88fb-40ac-9410-5835cc922e52`).

---

## 0. Posture

This spec defines the syntax for attribute values inside `@template` blocks of `.aihu` files. It is the binding contract between SFC source code and the compiler's parser.

The rule is intentionally restrictive. The goal is **maximum visual clarity at the cost of some flexibility**. Attribute values follow exactly two forms; bare unquoted values are forbidden; inline JSX in attributes is forbidden in v1.

Restrictions stay in this spec. Plugins MAY NOT relax them. The plugin contract permits new macros and new attributes, but those macros MUST conform to this spec's value-form rules.

---

## 1. The Two Forms

Every attribute value in a `@template` block MUST be expressed in one of two forms:

### 1.1 Quoted form

```
attr="value"
```

The value is a double-quoted string. The contents represent either:
- An identifier reference (a name in scope)
- A property path (dotted access on an in-scope value)
- A literal string (passed through as-is)
- A structured token (e.g. iteration syntax for `$each`)

Each macro and attribute declares which interpretation applies in its own spec entry.

### 1.2 Curly form

Reactive HTML attribute bindings MUST be `$`-prefixed:

```
$attr={expression}
```

Macro attributes that accept curly expressions (e.g. `$if={…}`, `$show={…}`, `$memo={…}`, `$on.click={…}`) also use the curly form per their existing `$`-prefixed names — these were already `$`-prefixed before Amendment 04 and are unaffected. The Amendment 04 change applies to **bindings on standard HTML attributes** (`class`, `href`, `value`, `checked`, `disabled`, `aria-*`, `data-*`, …) which previously used plain curly form `attr={expression}`.

The contents are a JavaScript expression evaluated at the binding site. The expression MAY:
- Reference identifiers from the SFC's scope
- Apply operators (negation, comparison, ternary, etc.)
- Call functions
- Construct objects or arrays
- Embed JSX (only inside fallback-bearing constructs, and only with explicit allowance — see §6)

Curly expressions are reactive: signal reads inside them subscribe the consuming binding to those signals.

> **Amendment 04 (2026-05-09):** Plain curly form on standard HTML attributes (e.g. `class={dynamic}`, `href={url}`, `checked={done}`) is a hard parse error (**C306**) in v1.0+. Use the `$`-prefixed form: `$class={dynamic}`, `$href={url}`, `$checked={done}`. The migrate tool (`npx aihu migrate`) performs this rewrite mechanically. Rationale: every reactive surface form in v1 (`$if`, `$each`, `$show`, `$on.`, `$bind.`, `$html`, `$ref`, `$once`, `$memo`, `$class`, `$raw`) is `$`-prefixed; making reactive HTML attribute bindings `$`-prefixed too gives uniform "reactive things start with `$`" mental model and grep-cleanliness (`\$\w+=\{` finds every reactive HTML binding with zero false positives against component prop-passes).
>
> **Component prop-passing is unchanged:** `<UserCard user={u} />` continues to use plain curly form because it is JSX-style prop passing on a custom component, not a reactive binding on a DOM element. The discriminator is element-kind (HTML element vs component), checked by the compiler at parse time.

### 1.3 Bare values are forbidden

Attributes with `=` MUST have a value in one of the two forms above. Unquoted values such as `attr=value` or `attr=isEditing` are NOT permitted in v1. The compiler MUST reject them with a clear error.

```
✗ <button $on:click=save>           ← parse error
✓ <button $on:click="save">          ← quoted form
✓ <button $on:click={() => save()}>  ← curly form
```

### 1.4 Boolean-only attributes

Some attributes take no value at all. They are present-or-absent, never quoted, never curly. Boolean-only attributes follow HTML's native form:

```
✓ <button disabled>           ← HTML boolean attribute
✓ <div $once>                 ← aihu boolean macro
✓ <pre $raw>                  ← aihu boolean macro
```

Boolean-only attributes are listed in their respective macro specs. The compiler MUST treat boolean-only attributes as exempt from the `=`-requires-quote-or-curly rule.

---

## 2. Identifier Reference Resolution

When an attribute's quoted form is declared as an **identifier reference**, the compiler resolves the string at build time against the SFC's scope.

### 2.1 Scope lookup order

The compiler resolves identifiers in this order:

1. Local declarations in the SFC's `@state` block (signals, computeds, resources, props, actions, lifecycle hooks)
2. Slot-exposed context (`shield.error`, `guard.user`, etc. — see §5.3)
3. Plugin-contributed values made available to all SFCs (per the Plugin Contract Spec §3)
4. Project-level imports declared in `aihu.config.ts`

Identifiers not found in any scope MUST cause a compile error citing the SFC line and the attempted lookup chain.

### 2.2 Property paths

Quoted identifier references MAY include dotted property access:

```
✓ $bind:value="user.profile.name"
✓ error="shield.error"
✓ retry="shield.retry"
```

Dotted paths resolve as nested property access on the root identifier. The root identifier MUST be in scope per §2.1; deeper segments are resolved at runtime via standard property access.

Computed access (bracket notation, function calls, conditional access) is NOT permitted in quoted form. Such access MUST use the curly form:

```
✗ $bind:value="users[0].name"           ← bracket access, parse error
✓ $bind:value={users[0].name}           ← curly required

✗ $bind:value="getUser().name"          ← function call, parse error
✓ $bind:value={getUser().name}          ← curly required
```

### 2.3 Optional chaining and nullish coalescing

Optional chaining (`?.`) and nullish coalescing (`??`) are operators, not identifier syntax. They require curly form:

```
✗ $bind:value="user?.name"              ← parse error
✓ $bind:value={user?.name}              ← curly required
```

### 2.4 Whitespace in quoted identifiers

Quoted identifier references MUST NOT contain whitespace except as part of structured tokens (e.g. `$each="posts as p, i"`). The compiler MUST reject leading/trailing whitespace in identifier references with a clear error.

---

## 3. Macro and Attribute Type Declarations

Each macro and attribute declares its expected value type. The compiler uses these declarations to interpret quoted and curly forms.

### 3.1 Type categories

| Category | Quoted means | Curly means |
|---|---|---|
| `identifier` | Reference to in-scope name | Expression evaluating to the same target |
| `signal-ref` | Reference to a writable signal | Forbidden (must be writable lvalue) |
| `function-ref` | Reference to a function | Inline arrow function or function expression |
| `component-ref` | Reference to a component name | Forbidden (use slot for inline JSX) |
| `string` | Literal string passed through | Expression evaluating to a string |
| `iteration` | Structured iteration syntax | Forbidden (string form only) |
| `selector` | CSS selector string | Expression evaluating to a selector |
| `scope-name` | Reference to a config-defined scope | Expression evaluating to a scope name |
| `path` | Route path string | Expression evaluating to a path |
| `object` | Forbidden (objects need expressions) | Object literal or expression |
| `expression` | Forbidden (always curly) | Any expression |

### 3.2 Forbidden combinations

The compiler MUST reject these combinations with specific error messages:

- Quoted form on `expression`-typed attributes (e.g. `$memo="..."`) — error: "expected expression, use {curly} form"
- Curly form on `iteration`-typed attributes (e.g. `$each={...}`) — error: "iteration syntax must use quoted form"
- Curly form on `signal-ref`-typed attributes (e.g. `$bind.value={...}`) — error: "binding requires writable identifier reference"
- Curly form with inline JSX on `component-ref` attributes (v1) — error: "inline JSX in attributes not permitted; use slot or extract component"
- **Plain curly form on a standard HTML attribute (e.g. `class={dynamic}`, `href={url}`)** — error code **C306**: "plain `attr={expression}` form is not permitted in v1.0; reactive HTML attribute bindings must be `$`-prefixed. Use `$attr={expression}`. Run: `npx aihu migrate <file>`" (added by Amendment 04; see §11 for full deprecation policy)
- **Vue-shape colon-form attribute binding alias `:attr="expr"`** — error code **C304**: "`:<attr>=` binding alias is removed in v1.0. Use `$<attr>={expression}` (one-way) or `$bind.<attr>=` (two-way) instead. Run: `npx aihu migrate <file>`" (added by Amendment 04; see §11)
- **Vue-shape at-form event binding alias `@event="fn"`** — error code **C305**: "`@<event>=` event-binding alias is removed in v1.0. Use `$on.<event>=` instead. Run: `npx aihu migrate <file>`" (added by Amendment 04; see §11)

### 3.3 Per-macro type matrix

This matrix is the source of truth. Each macro spec entry MUST cite this section.

#### Template attribute macros

| Macro | Type | Quoted form valid | Curly form valid |
|---|---|---|---|
| `$if` | `signal-ref \| expression` | Identifier only | Any boolean expression |
| `$show` | `signal-ref \| expression` | Identifier only | Any boolean expression |
| `$each` | `iteration` | Required form | Forbidden |
| `$bind:*` | `signal-ref` | Required form | Forbidden |
| `$on:*` | `function-ref \| expression` | Function name | Inline function expression |
| `$key` | `identifier \| expression` | Identifier or path | Any expression |
| `$html` | `identifier \| expression` | Identifier or path | Any expression |
| `$raw` | (boolean-only) | N/A | N/A |
| `$once` | (boolean-only) | N/A | N/A |
| `$memo` | `expression` | Forbidden | Required form |
| `$action` | `function-ref \| expression` | Function name | Inline function expression |

#### Structural element attributes

| Element | Attribute | Type |
|---|---|---|
| `<$suspense>` | `fallback` | `component-ref` |
| `<$suspense>` | `fallbackProps` | `object` |
| `<$shield>` | `fallback` | `component-ref` |
| `<$shield>` | `onError` | `function-ref` |
| `<$guard>` | `scope` | `scope-name` |
| `<$guard>` | `permissions` | `string` |
| `<$guard>` | `rateLimit` | `string` |
| `<$guard>` | `fallback` | `component-ref` |
| `<$guard>` | `redirect` | `path` |
| `<$guard>` | `onDeny` | `function-ref` |
| `<$slot>` | `name` | `string` |
| `<$slot>` | `expose` | `string` |
| `<$warp>` | `to` | `selector \| expression` |

#### HTML attributes on real elements

| Attribute kind | Type | Notes |
|---|---|---|
| Standard HTML attrs (`class`, `id`, `href`, `value`, `aria-*`, `data-*`, etc.) | `string \| expression` | Quoted = literal (`class="todo"`); `$`-prefixed curly = computed reactive binding (`$class={dynamic}`); **plain curly (`attr={…}`) is error C306** per Amendment 04 — use the `$`-prefixed form |
| Boolean HTML attrs (`disabled`, `required`, etc.) | `(boolean-only)` | Bare presence-only; for reactive boolean control use `$disabled={…}` etc. |
| Component props (e.g. `<UserCard user={…}>`) | Per component declaration | Quoted = identifier ref / string literal; curly = expression. **Component prop-passing keeps plain curly form** — the `$`-prefix rule applies only to bindings on standard HTML elements, not to props passed to author-defined components. Discriminator: element-kind at parse time. |

---

## 4. The Slot/Fallback Hybrid Pattern

Structural elements that take fallback content support two forms: a `fallback` attribute for simple cases, and a named slot child for complex cases. They are mutually exclusive.

### 4.1 Simple form: `fallback` attribute

```
<$suspense fallback="Skeleton">
  <UserProfile />
</$suspense>
```

Use when the fallback is a single component with no props (or default props only) and does not require access to the parent's exposed context (error, retry, denial reason, etc.).

### 4.2 With props: `fallback` + `fallbackProps`

```
<$suspense fallback="Skeleton" fallbackProps={{ size: 'lg', delay: 300 }}>
  <UserProfile />
</$suspense>
```

Use when static props are needed but the fallback still doesn't require parent context.

### 4.3 Slot form: child `<$slot name="fallback">`

```
<$shield>
  <UserProfile />
  <$slot name="fallback">
    <ErrorPage error="shield.error" retry="shield.retry" />
  </$slot>
</$shield>
```

Use when:
- The fallback needs access to context exposed by the parent (e.g. `shield.error`, `guard.reason`)
- The fallback is multi-element
- The fallback contains conditional logic
- The fallback has reactive bindings

### 4.4 Mutual exclusion

A structural element MUST have either a `fallback` attribute OR a `<$slot name="fallback">` child, not both. The compiler MUST reject the combination with an error citing both source locations.

```
✗ <$suspense fallback="Skeleton">
    <UserProfile />
    <$slot name="fallback"><Spinner /></$slot>      ← compile error
  </$suspense>
```

### 4.5 Default rendering when neither is present

For each structural element, the spec defines whether absence of both is permitted:

| Element | Fallback required? |
|---|---|
| `<$suspense>` | Yes — must have one |
| `<$shield>` | Yes — must have one |
| `<$guard>` | One of `fallback`, `redirect`, or slot — must have one |
| `<$slot>` | N/A (slot is itself the fallback mechanism) |
| `<$warp>` | N/A (no fallback concept) |

### 4.6 Inline JSX in attributes is forbidden in v1

The form `fallback={<Skeleton />}` is forbidden by this spec. The compiler MUST reject it with an error directing the user to either:
- Extract the inline element to a named component file, then use `fallback="ComponentName"`
- Use the slot form

This restriction prevents nested-JSX-in-attribute patterns that lead to curly-heavy templates. It is a v1 strictness; v2 may relax it if real-world usage shows the slot form is too verbose for genuine one-off cases.

---

## 5. Slot Context Exposure

Structural elements that expose context to their fallback slots use a documented identifier convention. The fallback slot can reference these identifiers as if they were in scope.

### 5.1 Exposed context per structural element

| Element | Exposed identifiers |
|---|---|
| `<$suspense>` | `suspense.loading` (boolean) |
| `<$shield>` | `shield.error` (Error), `shield.retry` (function) |
| `<$guard>` | `guard.user` (User \| null), `guard.reason` (string), `guard.path` (string) |

### 5.2 Reference syntax in slot content

Slot content references exposed context using property paths in quoted form:

```
<$slot name="fallback">
  <ErrorPage error="shield.error" retry="shield.retry" />
</$slot>
```

### 5.3 Custom slot exposure for user components

User components MAY expose context to their slot consumers using the `expose` attribute on a `<$slot>` declaration:

```
<!-- In UserList.aihu template -->
<$slot name="row" expose="user, index">
  <!-- default content -->
</$slot>

<!-- In consumer -->
<UserList>
  <$slot name="row" expose="user, index">
    <li>{user.name} — #{index}</li>
  </$slot>
</UserList>
```

The consumer's slot uses curly expressions to reference exposed identifiers in its content (since exposed values are dynamic).

---

## 6. JSX Restrictions

### 6.1 JSX in curly attribute values

JSX inside `={...}` is permitted ONLY in attributes whose declared type is `expression`. As of v1, no such attribute exists in the structural element list. The `fallback` attribute on `<$suspense>`, `<$shield>`, and `<$guard>` is `component-ref`, not `expression`.

This means inline JSX in attributes is effectively forbidden in v1.

### 6.2 JSX in template body

JSX (using HTML-style angle brackets) is the standard form for the entire `@template` block body. It is unrelated to the attribute-value rules; templates ARE JSX-shaped at their structural level.

### 6.3 JSX in curly text interpolation

Curly text interpolation in template body MAY contain JSX expressions:

```
<div>
  {isEditing ? <input $bind:value="editedName" /> : <span>{user.name}</span>}
</div>
```

This is permitted because the curly is in template body, not in an attribute value. The discriminator is location, not syntax.

---

## 7. Error Messages

Error messages for attribute syntax violations MUST follow this template:

```
error: invalid attribute value form
   src/pages/users/[id].aihu:14:21
   
   12 |   @template {
   13 |     <button 
   14 |       $on:click=save
                    ^^^^ this value must be quoted (identifier reference) or in curly braces (expression)
   15 |     >
   
   help: For an identifier reference, use $on:click="save"
         For an inline expression, use $on:click={() => save()}
```

Specific error message templates are catalogued in the Compiler Error Reference (separate doc). Every error in this spec MUST have an entry there.

---

## 8. Examples

### 8.1 Minimum viable component using all forms

```
@state {
  $prop title: string
  count: number = 0
  isVisible: boolean = true
  
  $action increment() { count++ }
  $action reset() { count = 0 }
}

@template {
  <article>
    <h1 $show="isVisible">{title}</h1>
    
    <button $on:click="increment">
      Count: {count}
    </button>
    
    <button $on:click={() => count -= 1}>
      Decrement
    </button>
    
    <button $if={count > 0} $on:click="reset">
      Reset
    </button>
    
    <ul>
      <li $each="items as item, i" $key="item.id">
        {i}: {item.name}
      </li>
    </ul>
  </article>
}
```

Audit:
- 5 quoted identifier references (`isVisible`, `increment`, `reset`, `items as item, i`, `item.id`)
- 3 curly expressions (`count > 0`, `() => count -= 1`, text interpolations)
- 0 bare unquoted values
- 0 inline JSX in attributes

### 8.2 Full structural element nesting

```
@template {
  <$guard scope="admin" fallback="UnauthorizedPage">
    <$shield>
      <$suspense fallback="Skeleton">
        <UserProfile />
      </$suspense>
      
      <$slot name="fallback">
        <ErrorPage error="shield.error" retry="shield.retry" />
      </$slot>
    </$shield>
  </$guard>
}
```

Audit:
- 4 quoted identifier references (`admin`, `UnauthorizedPage`, `Skeleton`, `shield.error`, `shield.retry`)
- 0 curly expressions (the slot form removed the need for any)
- All structural elements use bare quoted forms for simple cases
- The complex case (error fallback needing context) uses the slot form

### 8.3 When to use slot vs attribute

```
<!-- Simple: fallback attribute -->
<$suspense fallback="Spinner">
  <DataTable />
</$suspense>

<!-- Static props: fallback + fallbackProps -->
<$suspense fallback="Spinner" fallbackProps={{ color: 'blue' }}>
  <DataTable />
</$suspense>

<!-- Context-aware: slot -->
<$shield>
  <DataTable />
  <$slot name="fallback">
    <ErrorBanner error="shield.error" />
  </$slot>
</$shield>

<!-- Multi-element fallback: slot -->
<$suspense>
  <DataTable />
  <$slot name="fallback">
    <h2>Loading data...</h2>
    <Spinner />
    <p>This may take a moment</p>
  </$slot>
</$suspense>

<!-- Reactive fallback: slot -->
<$suspense>
  <DataTable />
  <$slot name="fallback">
    {loadAttempts > 3 ? <SlowConnection /> : <Spinner />}
  </$slot>
</$suspense>
```

---

## 9. Edge Cases

### 9.1 Empty quoted strings

```
✗ $on:click=""               ← compile error: empty identifier reference
✗ class=""                   ← compile error: empty string literal (use absent attr)
✓ class={someClass || ''}    ← curly with explicit empty fallback
```

Empty quoted strings are forbidden because their semantic meaning is ambiguous.

### 9.2 Whitespace handling

Leading and trailing whitespace inside quoted attribute values is preserved for `string`-typed attributes (e.g. `placeholder`) and stripped-with-error for `identifier`-typed attributes:

```
✓ placeholder=" Enter your name "      ← preserved as-is
✗ $on:click=" save "                   ← compile error: whitespace in identifier
```

### 9.3 Component props with mixed types

A component may declare props that accept either string literals or identifier references. The component's prop declaration determines which:

```
<!-- UserCard.aihu declares: -->
@state {
  $prop name: string                          ← string-typed prop
  $prop user: Resource<User>                  ← identifier-ref prop (resource)
}

<!-- Consumer: -->
<UserCard 
  name="Static title"                         ← string literal
  user="currentUser"                          ← identifier reference (resource binding)
/>
```

The compiler resolves quoted props against the prop's declared type.

### 9.4 Attributes with default values

Some attributes have default values when omitted. The defaults are documented per macro and never trigger the empty-string error:

```
<$slot />                    ← name defaults to "default"
<$once />                    ← boolean-only, presence is the value
```

### 9.5 HTML compatibility

Standard HTML attributes (not aihu macros) preserve HTML semantics. Static values use bare-named quoted form; reactive computed values use the `$`-prefixed curly form (Amendment 04):

```
<a href="/about">About</a>             ← static literal href (quoted)
<a $href={dynamicUrl}>About</a>        ← reactive computed href ($-prefixed curly)
<input type="text" required />         ← boolean attribute, no value
<img src="/logo.png" alt="Logo" />     ← static string attributes
<img $src={user.avatarUrl} $alt={user.displayName} />   ← reactive attributes
```

The `=quoted` rule applies. Bare values are forbidden everywhere, including HTML attributes. Plain curly form on HTML attributes (e.g. `<a href={dynamicUrl}>` without the `$` prefix) is rejected as error C306 — see §11 Deprecation policy.

---

## 10. Migration from Other Frameworks

This section provides translation rules for developers coming from Vue, React, or Svelte.

### 10.1 From Vue

| Vue | Aihu |
|---|---|
| `v-if="condition"` | `$if="condition"` (signal) or `$if={expr}` (expression) |
| `v-for="item in items"` | `$each="items as item"` |
| `v-model="signal"` | `$bind.value="signal"` (dot-form macro, two-way) |
| `v-on:click="fn"` or `@click="fn"` | `$on.click="fn"` |
| `:class="dynamic"` | `$class={dynamic}` (Amendment 04) |
| `:href="url"` | `$href={url}` (Amendment 04) |

> **Amendment 04:** The Vue-shape aliases `:attr="…"` (one-way binding) and `@event="…"` (event handler) are NOT silently translated by the compiler — they are hard parse errors C304 and C305 respectively (see §3.2 and §11). The migrate tool (`npx aihu migrate`) performs the mechanical rewrite. The target form for `:attr="x"` is `$attr={x}` (preserves one-way computed-binding semantics; matches the parser's pre-existing `Attr::Binding` AST node). The target form for `@event="fn"` is `$on.event="fn"` (dot-form macro per B3c colon→dot ratification).

### 10.2 From React/JSX

| React | Aihu |
|---|---|
| `onClick={fn}` | `$on.click="fn"` (preferred) or `$on.click={fn}` |
| `value={state}` (controlled) | `$bind.value="state"` (dot-form macro, two-way) |
| `className={cls}` | `$class={cls}` (Amendment 04) |
| `{cond && <Comp />}` (conditional) | `<Comp $if="cond" />` |
| `{items.map(i => ...)}` | `<element $each="items as i">...` |
| `<Suspense fallback={<Skel />}>` | `<$suspense fallback="Skel">` |
| `<input checked={done} />` | `<input $checked={done} />` (Amendment 04 — plain curly form on HTML attrs is error C306) |
| `<UserCard user={u} />` (component prop) | `<UserCard user={u} />` (unchanged — `$`-prefix rule does NOT apply to component props) |

### 10.3 From Svelte

| Svelte | Aihu |
|---|---|
| `bind:value={signal}` | `$bind.value="signal"` (dot-form macro, two-way) |
| `on:click={fn}` | `$on.click="fn"` |
| `class:active={isActive}` | `$class={isActive ? 'active' : ''}` (Amendment 04 — no per-class macro; use the `$class={…}` ternary form) |
| `{#if cond}...{/if}` | `<element $if="cond">...` |
| `{#each items as item}` | `<element $each="items as item">` |

---

## 11. Deprecation policy

> **Added by Amendment 04 (2026-05-09).** This section catalogues the legacy attribute and tag forms that the v1.0 cutover rejects as hard parse errors, with migration targets. All listed errors point at `npx aihu migrate` for mechanical rewrite.

The v1.0 cutover (rounds R5.2a and R5.2b of the aihu-v1-framework topic) removes four legacy surface forms inherited from the v0.1.x grammar. Each is documented as a hard parse error with a stable error code, a migration target, and an authority citation. There is no deprecation-with-warning period: v1.0 is the cutover round, the in-repo `.aihu` corpus is rewritten by the migrate tool, and external consumers run `npx aihu migrate <file>` to obtain the same rewrite.

| Code | Rejected form | Removed in | Migration target | Authority |
|------|---------------|------------|------------------|-----------|
| **C107** | `<script setup>`, `<template>`, `<style>`, `<agent>` HTML-tag SFC framing (Vue/Svelte-shape) | v1.0.7 (R5.2a, landed in PR #168) | `@state { … }`, `@template { … }`, `@style { … }`, `@agent { … }` `@`-block framing | R5.2a Builder manifest (`928bb5b9-3464-4635-9995-aef685ff48a7`); fixtures at `bench/compiler-conformance/v1-rejections/01-html-script-setup.aihu` through `04-html-agent.aihu` |
| **C304** | `:attr="expr"` Vue-shape one-way attribute-binding alias | v1.0.8 (R5.2b, this round) | `$attr={expr}` (one-way reactive HTML attribute binding); for two-way, use `$bind.attr="signal"` | Director r5-sup-2 (`a4cc0505-88fb-40ac-9410-5835cc922e52`) §3 + Investigator R5.1 (`3025c0c2-19c9-4c63-a183-7613f83d4c21`) §2 + this Amendment 04 |
| **C305** | `@event="fn"` Vue-shape event-binding alias | v1.0.8 (R5.2b, this round) | `$on.event="fn"` (dot-form event macro per B3c colon→dot ratification) | Director r5-sup-2 (`a4cc0505-...`) §3 + Investigator R5.1 (`3025c0c2-...`) §2 + this Amendment 04 |
| **C306** | `attr={expr}` plain-curly form on standard HTML attributes (no `$` prefix) | v1.0.8 (R5.2b, this round) | `$attr={expr}` (reactive HTML attribute binding, Amendment 04 canonical form) | Architect R5.2-research (`e8589e43-7bbf-4b87-8c26-1ee83e948c08`) §3.B + §4 (recommendation); user pick of Option B; Director r5-sup-2 (`a4cc0505-...`) §3.1 (call to hard-error in v1.0); this Amendment 04 |

### 11.1 Error message conventions

Every error in the table above MUST emit a message that:

1. Identifies the error code (e.g. `C306:`).
2. Names the rejected form verbatim.
3. Names the migration target verbatim.
4. References the migrate tool: `Run: npx aihu migrate <file>`.

Reference wording for each:

- **C107:** "`<{tag}>` HTML-tag SFC framing was removed in v1.0.7. Use the `@{block}` block form. Run: `npx aihu migrate <file>`"
- **C304:** "`:<attr>=` binding alias is removed in v1.0. Use `$<attr>={expression}` (one-way) or `$bind.<attr>=` (two-way) instead. Run: `npx aihu migrate <file>`"
- **C305:** "`@<event>=` event-binding alias is removed in v1.0. Use `$on.<event>=` instead. Run: `npx aihu migrate <file>`"
- **C306:** "`<attr>={expression}` plain-curly form is not permitted in v1.0; reactive HTML attribute bindings must be `$`-prefixed. Use `$<attr>={expression}`. Run: `npx aihu migrate <file>`"

### 11.2 Component prop-passing is unaffected

The C306 rule applies **only to standard HTML elements** (`<input>`, `<a>`, `<div>`, `<button>`, …). JSX-style prop-passing on author-defined components is unchanged:

```
✓ <UserCard user={u} count={n} />          ← component props (plain curly, allowed)
✗ <input checked={done} />                 ← C306: must be `$checked={done}`
✓ <input $checked={done} />                ← reactive HTML attribute binding
```

The parser discriminator is element-kind, determined by the leading-character convention (lowercase = HTML element, capitalized or `<$…>` = component / structural). This convention pre-dates Amendment 04 and is unchanged.

### 11.3 Migration tool guarantees

The `npx aihu migrate` command (introduced in v1.0.7, extended in v1.0.8) MUST be idempotent for all four error classes: running it twice on the same file produces zero additional changes on the second run. Mechanical rewrite rules:

- C107: block-rewrite from HTML-tag framing to `@`-block framing (extends across multi-line tag bodies; see R5.2a Builder manifest item 5).
- C304: regex pass — `:<attr>="x"` → `$<attr>={x}`; quotes swap to curlies; a leading-whitespace guard skips XML/SVG `xmlns:` and `xlink:` namespaces.
- C305: regex pass — `@<event>="fn"` → `$on.<event>="fn"`; quote style preserved.
- C306: regex pass — `(<lowercase-tag … )(\b<attr>)={expr}` → `…$<attr>={expr}`; the leading-tag-name lookbehind guards against rewriting JSX-style prop-passes on capitalized component names.

If the migrate tool ever fails on a real-world `.aihu` file for one of these four classes, the failure is a tool bug (file a Mode 3 defect-investigation cycle), not a spec gap.

### 11.4 No silent deprecation

Amendment 04 does NOT introduce a deprecation-with-warning period. The four legacy forms reject as hard parse errors from the v1.0 cutover onward. The in-repo `.aihu` workspace (83 plain-curly sites + the small `:attr=` / `@event=` populations) is rewritten by R5.2b-3 (Builder dogfood pass). External consumers obtain the same rewrite from `npx aihu migrate`. There is no externally-shipped v0.1.x artifact that consumers depend on; v1.0 is the first stable release line.

---

## 12. Open Questions

These remain unresolved at draft v0.1:

### 12.1 Allow inline JSX in v2?

The v1 ban on `fallback={<Component />}` is strict. Real-world usage may show that the slot form is too verbose for trivial one-off cases. v2 should re-evaluate based on:
- Frequency of trivial inline fallback usage
- Whether the slot form's verbosity is a real adoption blocker
- Whether the curly noise it would reintroduce outweighs the convenience

**Proposed resolution:** Defer to v1+1. Collect usage data from the slice and early adopters before deciding.

### 12.2 Conditional attribute presence

Currently no syntax for "include this attribute only if condition." Vue uses `:attr={cond ? value : null}`. React passes `null` props. Aihu could:

- Permit null/undefined-valued attributes to be elided (silent)
- Add a `$attr-if` macro for explicit conditional presence
- Require ternary in curly form: `class={isActive ? 'active' : ''}`

**Proposed resolution:** Permit elision of curly attributes whose value evaluates to `null` or `undefined`. Document as part of attribute lowering rules. Defer `$attr-if` to v2 if real demand emerges.

### 12.3 Class and style binding shortcuts

Vue offers `:class="{ active: cond }"` and `:style="{ color: red }"`. Aihu currently requires the `$`-prefixed curly expression (Amendment 04): `$class={cond ? 'active' : ''}` or `$style={ { color: 'red' } }`.

**Proposed resolution:** Defer to v2. The straightforward `$`-prefixed curly forms work for v1; shortcuts can be evaluated if usage shows real need.

### 12.4 Computed attribute names

There's no syntax for dynamic attribute names (e.g. `data-${key}={value}`). React and Vue both have escape hatches.

**Proposed resolution:** Defer. If needed, `$dataAttrs={{ [key]: value }}` macro could be added in v2.

---

## 13. Verification

Compiler implementations MUST pass conformance tests covering:

- All bare-value rejection cases (parse errors with correct messages)
- All forbidden-combination rejections (per §3.2)
- Identifier resolution against scope (correct lookup order per §2.1)
- Property path resolution (dotted access works; computed access errors)
- Slot vs fallback mutual exclusion (per §4.4)
- Inline JSX rejection in attributes (v1)
- Empty string handling (per §9.1)
- Whitespace handling (per §9.2)
- Amendment 04 rejections per §11: C107 (HTML-tag SFC framing), C304 (`:attr=` alias), C305 (`@event=` alias), C306 (plain `attr={…}` on HTML elements). Conformance fixtures live in `bench/compiler-conformance/v1-rejections/` (R5.2a shipped fixtures 01-04 for C107; R5.2b will ship fixtures 05-07 for C304/C305/C306 per §11).

The conformance suite lives in `bench/compiler-conformance/template-attrs/` (positive cases) and `bench/compiler-conformance/v1-rejections/` (negative cases per Amendment 04 §11). Every error message in §7 and §11 has a fixture asserting the exact wording.

---

## 14. Sign-off

Spec is binding once approved. Changes require an amendment with version bump.

**Spec version:** 0.1.1-draft (Amendment 04 applied 2026-05-09)
**Stable from:** TBD
**Reviewed by:** TBD
**Approved by:** TBD

### 14.1 Amendment history

| Amendment | Date | Summary | Authority |
|-----------|------|---------|-----------|
| 04 | 2026-05-09 | Always-`$`-prefix reactive HTML attribute bindings (`$attr={expr}`). Plain `attr={expr}` rejected (C306). `:attr=` rejected (C304). `@event=` rejected (C305). New §11 Deprecation policy section. | User pick of Option B; Architect R5.2-research (`e8589e43-...`); Director r5-sup-2 (`a4cc0505-...`) |
