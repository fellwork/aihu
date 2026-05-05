# Template Attribute Syntax — `@aihu/compiler`

**Status:** Ratified 2026-05-02 (v1 reconciliation session)
**Spec version:** 0.1.0-draft (no amendments applied)
**Phase:** N+M (assigned at scoping pass)
**Author:** Architect
**Depends on:** `@aihu/signals` (stable), `@aihu/arbor` (stable), `@aihu/runtime` (stable)
**Consumes:** Macro vocabulary spec (separate document), `aihu.config.ts` plugin and scope registrations
**Related specs:** Plugin Contract Spec, Macro Vocabulary Spec, Block Structure Spec

> **Ratification note:** Migrated from `docs/spec-template-attribute-syntax.md` to `docs/superpowers/specs/` on 2026-05-02. No amendments target this spec.

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

```
attr={expression}
```

The contents are a JavaScript expression evaluated at the binding site. The expression MAY:
- Reference identifiers from the SFC's scope
- Apply operators (negation, comparison, ternary, etc.)
- Call functions
- Construct objects or arrays
- Embed JSX (only inside fallback-bearing constructs, and only with explicit allowance — see §6)

Curly expressions are reactive: signal reads inside them subscribe the consuming binding to those signals.

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
- Curly form on `signal-ref`-typed attributes (e.g. `$bind:value={...}`) — error: "binding requires writable identifier reference"
- Curly form with inline JSX on `component-ref` attributes (v1) — error: "inline JSX in attributes not permitted; use slot or extract component"

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
| Standard HTML attrs (`class`, `id`, `href`, etc.) | `string \| expression` | Quoted = literal; curly = computed |
| Boolean HTML attrs (`disabled`, `required`, etc.) | `(boolean-only)` | Bare presence-only |
| Component props (e.g. `<UserCard user="...">`) | Per component declaration | Quoted = identifier ref; curly = expression |

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

Standard HTML attributes (not aihu macros) preserve HTML semantics:

```
<a href="/about">About</a>            ← string href
<a href={dynamicUrl}>About</a>        ← curly expression
<input type="text" required />        ← boolean attribute, no value
<img src="/logo.png" alt="Logo" />    ← string attributes
```

The `=quoted` rule applies. Bare values are forbidden everywhere, including HTML attributes.

---

## 10. Migration from Other Frameworks

This section provides translation rules for developers coming from Vue, React, or Svelte.

### 10.1 From Vue

| Vue | Aihu |
|---|---|
| `v-if="condition"` | `$if="condition"` (signal) or `$if={expr}` (expression) |
| `v-for="item in items"` | `$each="items as item"` |
| `v-model="signal"` | `$bind:value="signal"` |
| `v-on:click="fn"` or `@click="fn"` | `$on:click="fn"` |
| `:class="dynamic"` | `class={dynamic}` |
| `:href="url"` | `href={url}` |

### 10.2 From React/JSX

| React | Aihu |
|---|---|
| `onClick={fn}` | `$on:click="fn"` (preferred) or `$on:click={fn}` |
| `value={state}` (controlled) | `$bind:value="state"` |
| `className={cls}` | `class={cls}` |
| `{cond && <Comp />}` (conditional) | `<Comp $if="cond" />` |
| `{items.map(i => ...)}` | `<element $each="items as i">...` |
| `<Suspense fallback={<Skel />}>` | `<$suspense fallback="Skel">` |

### 10.3 From Svelte

| Svelte | Aihu |
|---|---|
| `bind:value={signal}` | `$bind:value="signal"` |
| `on:click={fn}` | `$on:click="fn"` |
| `class:active={isActive}` | `class={isActive ? 'active' : ''}` (no aihu equivalent) |
| `{#if cond}...{/if}` | `<element $if="cond">...` |
| `{#each items as item}` | `<element $each="items as item">` |

---

## 11. Open Questions

These remain unresolved at draft v0.1:

### 11.1 Allow inline JSX in v2?

The v1 ban on `fallback={<Component />}` is strict. Real-world usage may show that the slot form is too verbose for trivial one-off cases. v2 should re-evaluate based on:
- Frequency of trivial inline fallback usage
- Whether the slot form's verbosity is a real adoption blocker
- Whether the curly noise it would reintroduce outweighs the convenience

**Proposed resolution:** Defer to v1+1. Collect usage data from the slice and early adopters before deciding.

### 11.2 Conditional attribute presence

Currently no syntax for "include this attribute only if condition." Vue uses `:attr={cond ? value : null}`. React passes `null` props. Aihu could:

- Permit null/undefined-valued attributes to be elided (silent)
- Add a `$attr-if` macro for explicit conditional presence
- Require ternary in curly form: `class={isActive ? 'active' : ''}`

**Proposed resolution:** Permit elision of curly attributes whose value evaluates to `null` or `undefined`. Document as part of attribute lowering rules. Defer `$attr-if` to v2 if real demand emerges.

### 11.3 Class and style binding shortcuts

Vue offers `:class="{ active: cond }"` and `:style="{ color: red }"`. Aihu currently requires curly expression: `class={cond ? 'active' : ''}` or `style={ { color: 'red' } }`.

**Proposed resolution:** Defer to v2. The straightforward curly forms work for v1; shortcuts can be evaluated if usage shows real need.

### 11.4 Computed attribute names

There's no syntax for dynamic attribute names (e.g. `data-${key}={value}`). React and Vue both have escape hatches.

**Proposed resolution:** Defer. If needed, `$dataAttrs={{ [key]: value }}` macro could be added in v2.

---

## 12. Verification

Compiler implementations MUST pass conformance tests covering:

- All bare-value rejection cases (parse errors with correct messages)
- All forbidden-combination rejections (per §3.2)
- Identifier resolution against scope (correct lookup order per §2.1)
- Property path resolution (dotted access works; computed access errors)
- Slot vs fallback mutual exclusion (per §4.4)
- Inline JSX rejection in attributes (v1)
- Empty string handling (per §9.1)
- Whitespace handling (per §9.2)

The conformance suite lives in `bench/compiler-conformance/template-attrs/`. Every error message in §7 has a fixture asserting the exact wording.

---

## 13. Sign-off

Spec is binding once approved. Changes require an amendment with version bump.

**Spec version:** 0.1.0-draft
**Stable from:** TBD
**Reviewed by:** TBD
**Approved by:** TBD
