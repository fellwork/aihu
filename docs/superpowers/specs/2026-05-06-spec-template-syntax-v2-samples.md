# Template Syntax v2 — Corpus Samples (Variant B)

Companion to [`2026-05-06-spec-template-syntax-v2.md`](./2026-05-06-spec-template-syntax-v2.md).
Real `.aihu` code from the in-repo corpus rendered in v1 form alongside the
recommended **Variant B** form, grouped by the three axes the user named in
review: **logic blocks**, **reactive properties**, **attribute handling**.
Each sample cites `path:line`.

**Status:** Variant B per Director r2 reconciliation
(`.team/director-notes/template-syntax-002.md`). Spec is **PROPOSED**;
samples illustrate the proposed end-state, not currently-shipping syntax.

**Authority order** for ambiguous transformations: (1) Architect spec §3.B
grammar — block-tag `{#if}`/`{#each}`, attr-form `$on.click`/`$bind.value`,
`{@html expr}` for raw HTML; (2) Director r2 — `:` → `.` rename for ALL
binding directives in Variant B (the Prober B-fixture left `$on:click`
colon form, which is **wrong** per Director r2 §2.3; every B sample below
uses the dot); (3) Prober fixtures — used for shape only.

---

## Coverage matrix

Every Scout-D1 directive plus every macro-vocab-v2 `@state` collection-form
listed at least once. **v2-B** column shows the form this doc illustrates.

| Construct | v1 form | Variant B form | Corpus example |
|---|---|---|---|
| Conditional | `$if={cond}` (attr) | `{#if cond}…{/if}` | `examples/todo-mvc/todo-mvc.aihu:123` |
| Else / else-if | (no v1; sibling `$if`) | `{:else if cond}` / `{:else}` | `mail/src/components/CalendarGrid.aihu:33,48` |
| List + key | `$each="xs as x" $key={x.id}` | `{#each xs as x (x.id)}…{/each}` | `examples/todo-mvc/todo-mvc.aihu:108` |
| List + idx | `$each="xs as x, idx"` | `{#each xs as x, i (x.id)}` | edge-case fixture (synthetic) |
| List empty fallback | (no v1 form) | `{:empty}` | (no corpus; synthetic) |
| Show | `$show={cond}` | `$show={cond}` (attr-form retained) | `bench/.../02-show.aihu:2` |
| Event handler | `$on:click={fn}` | `$on.click={fn}` | `examples/temperature-converter/...:47` |
| Event quoted-ident | `$on:click="handler"` | `$on.click={handler}` | `examples/live-counter/...:39-41` |
| Two-way bind | `$bind:value="sig"` | `$bind.value={sig}` | `examples/temperature-converter/...:40` |
| Class + condition | `class={'a' + (c ? ' b' : '')}` | `class={['a', c && 'b']}` | `mail/.../CalendarGrid.aihu:44` |
| Class collection sugar | `$class:active={cond}` | `class={[..., cond && 'active']}` | `apps/docs/.../docs-shell.aihu:34` |
| Style binding | `style={…}` | `style={…}` (object form ok) | (no corpus; synthetic) |
| Raw HTML | `$html={expr}` / `$html="expr"` | `{@html expr}` | `examples/hacker-news/.../Comment.aihu:24` |
| Ref | `$ref="ident"` (broken) | `$ref={ident}` (fixed) | edge-case fixture |
| Once / Memo | `$once` / `$memo={[deps]}` | unchanged | `bench/.../05-once-memo.aihu` |
| Component prop | `<X prop={u} />` | unchanged | `examples/.../Comment.aihu:26` |
| `@state $prop` | wrapped/bare object-literal | unchanged (v2 settled) | `examples/todo-mvc/todo-mvc.aihu:6-19` |
| `@state $computed` | wrapped/bare | unchanged | `examples/todo-mvc/todo-mvc.aihu:23-35` |
| `@state $action` | wrapped/bare | unchanged | `examples/todo-mvc/todo-mvc.aihu:37-67` |
| `@state $resource` | async-iife | unchanged | `packages/router/components/Outlet.aihu:14` |
| `@state $effect` | function or `.on(dep)` | unchanged | `examples/todo-mvc/todo-mvc.aihu:85-89` |
| `@state $lifecycle` | mount/dispose | unchanged | `examples/timer/timer.aihu:42-49` |
| `@state $event:` (NEW) | (none — raw `dispatchEvent`) | `$event: { dayjump: { payload: { … } } }` | `mail/.../CalendarGrid.aihu:45` |
| `$emit.<name>(…)` (NEW) | (none) | `$emit.dayjump({ day })` | spec §5.b |
| Component event listener | (raw `addEventListener`) | `$on.dayjump={handler}` | spec §5.c |

---

## §1 — Logic blocks

Variant B lifts control flow OUT of the attribute slot into block tags. The
`$if` / `$each` / `$key` / `$elseif` / `$else` attribute family is removed.
Binding directives stay attribute-form (covered in §3).

### §1.1 Conditional — `{#if cond}…{/if}`

**v1** (`examples/todo-mvc/todo-mvc.aihu:123-139` — nested `$if`):

```html
<footer $if={todos.length > 0}>
  …
  <button $if={todos.length - remaining > 0} class="clear-completed" $on:click="clearCompleted">
    Clear completed
  </button>
</footer>
```

**Variant B** (per `.team/prober-fixtures/todo-mvc.variantB.aihu:119-138`):

```html
{#if todos.length > 0}
  <footer>
    …
    {#if todos.length - remaining > 0}
      <button class="clear-completed" $on.click={clearCompleted}>
        Clear completed
      </button>
    {/if}
  </footer>
{/if}
```

**What changed.** The structural directive lifts out of the attribute
slot into a block tag. Nested `$if` becomes nested `{#if}`. The
`$on:click="clearCompleted"` quoted shortcut becomes dot-form curly
`{clearCompleted}` (§3.1).

### §1.2 Else-if / Else — `{:else if cond}` / `{:else}`

**v1** (`mail/src/components/CalendarGrid.aihu:25-50` — sibling `$if`s, no else):

```html
<div $if={view === 'week'} class="week-grid">…</div>
<div $if={view === 'month'} class="month-grid">…</div>
```

**Variant B** (Architect spec §3.B.6 in-block sibling form). Note: the
Prober B-fixture left these as two sibling `{#if}` blocks, but the spec
specifies the `{:else if}` chain — Director r2 §4 sample-level finding 2:

```html
{#if view === 'week'}
  <div class="week-grid">…</div>
{:else if view === 'month'}
  <div class="month-grid">…</div>
{/if}
```

**What changed.** Two sibling `<div $if>` collapse into one `{#if}` chain
with `{:else if}`. The runtime evaluates exactly one branch. Codemod's
`{:else if}` round-trip is unproven in Prober fixtures — Builder
synthetic acceptance test required.

### §1.3 List with key — `{#each xs as x (key)}…{/each}`

**v1** (`examples/todo-mvc/todo-mvc.aihu:108-121`):

```html
<li $each="visible as todo" $key="todo.id" class={todo.done ? 'completed' : ''}>
  …
</li>
```

**Variant B** (per `.team/prober-fixtures/todo-mvc.variantB.aihu:106-116`):

```html
{#each visible as todo (todo.id)}
  <li class={todo.done ? 'completed' : ''}>…</li>
{/each}
```

**What changed.** Three v1 directives (`$each` quoted, `$key` quoted, the
sibling element holding both) collapse into one `{#each … (key)}` block
tag. The `(todo.id)` parenthetical is a TS expression in the iteration
scope; spec §7 lifts it through `tsc` via the `.aihu.ts` sidecar.

### §1.4 List with idx — `{#each xs as x, i (key)}`

**v1** (`.team/prober-fixtures/template-syntax-edge-cases.v1.aihu:35` —
hidden landmine: `$each` LHS with parens, `as` substrings, lambda):

```html
<li
  $each="posts.filter(p => p && p.title.includes(query)).map(m => ({ id: m.id, title: m.title })) as item, idx"
  $key={item.id} …
>…</li>
```

**Variant B** (per `template-syntax-edge-cases.variantB.aihu:50` — lambda
LHS hoisted to `$computed.filtered`; codemod errors C501 if it cannot
hoist):

```html
{#each filtered as item, idx (item.id)}
  <li class={['row', item.id === selected && 'selected']} $on.click={() => select(item.id)}>
    <span>{idx}: {item.title}</span>
  </li>
{/each}
```

**What changed.** Block-tag form takes a simple-identifier LHS; complex
LHS expressions hoist to `$computed`. Closes the v1 hidden landmine
(parser bypass of `validate_macro_quoted_value` — Scout D5.3).

### §1.5 List empty fallback — `{:empty}`

**No corpus example found.** v1 had no `$each-empty` form; userland paired
`$each` with a sibling `$if={!list.length}`. Variant B's `{:empty}` is new.

**Synthetic minimal demo** (per Architect spec §3.B.1):

```html
{#each todos as todo (todo.id)}
  <li>{todo.text}</li>
{:empty}
  <li class="empty">No todos yet.</li>
{/each}
```

### §1.6 Show — `$show={cond}` (attribute-form retained)

**v1 + Variant B** (`bench/compiler-conformance/template-attrs/02-show.aihu:2`):

```html
<span $show={count > 0}>items</span>
```

**What changed.** Nothing. `$show` lowers to a CSS custom-property toggle
(not DOM mount/unmount); spec §3.B.1 keeps it as an attribute directive
even in Variant B.

---

## §2 — Reactive properties (`@state` collection-form)

The `@state` block is settled at v2 (macro-vocab-v2, 2026-05-05) and is
explicit IS-NOT-IN per spec §10. §2.1–2.6 are short anchors so the
template samples have something to bind against. **Only addition this
round: `$event:`** (§2.7).

### §2.1–2.6 Existing collection-form macros (all unchanged)

All six existing collection-form macros use object-literal shape with
bare/wrapped duality and per-name `describe:` / `expose:` metadata.
Concrete corpus citations:

| Macro | Citation | Shape |
|---|---|---|
| `$prop` | `examples/todo-mvc/todo-mvc.aihu:6-19` | `{ name: { type, default, describe, expose } }` |
| `$computed` | `examples/todo-mvc/todo-mvc.aihu:23-35` | `{ name: () => …, name: { value: …, describe, expose } }` |
| `$action` | `examples/todo-mvc/todo-mvc.aihu:37-67` | `{ name: (args) => …, name: { handler, describe, expose } }` |
| `$resource` | `packages/router/components/Outlet.aihu:14-24` | `{ name: () => (async () => …)() }` (IIFE returning Promise) |
| `$effect` | `examples/todo-mvc/todo-mvc.aihu:85-89` | `() => { … }` (with optional `$effect.on(dep) { … }` form) |
| `$lifecycle` | `examples/timer/timer.aihu:42-49` | `{ mount, dispose }` |

Sample shape (`$prop`, `examples/todo-mvc/todo-mvc.aihu:6-19`):

```aihu
$prop: {
  todos: {
    type: Array<{ id: string; text: string; done: boolean }>,
    default: [],
    describe: 'Array of todo items with id, text, done fields',
    expose: { read: true },
  },
  filter: { type: 'all' | 'active' | 'completed', default: 'all', expose: { read: true } },
}
```

Bare-form `$computed` (`examples/todo-mvc/todo-mvc.aihu:24`):

```aihu
$computed: {
  visible: () => filter === 'all' ? todos : filter === 'active' ? todos.filter(t => !t.done) : todos.filter(t => t.done),
  allDone: () => todos.length > 0 && remaining === 0,
}
```

Wrapped-form with metadata (`examples/todo-mvc/todo-mvc.aihu:29-33`):

```aihu
$computed: {
  remaining: {
    describe: 'Count of incomplete todos',
    expose: { read: true },
    value: () => todos.filter(t => !t.done).length,
  },
}
```

`$lifecycle` mount/dispose (`examples/timer/timer.aihu:42-49`):

```aihu
$lifecycle: {
  mount: () => { intervalId = setInterval(() => tick(), 100) as unknown as number },
  dispose: () => { if (intervalId !== null) clearInterval(intervalId) },
}
```

None of these change in Variant B; they are illustrated only so that
references in the template samples (e.g., `signIn`, `decrement`,
`addTodo`, `toggle`, `setFilter`) resolve against a known declaration
shape. See macro-vocab-v2 spec for the full grammar.

### §2.7 `$event:` + `$emit` — typed component events (NEW)

**v1** (`mail/src/components/CalendarGrid.aihu:45` — raw DOM dispatch is
the only path; Scout D3e confirmed zero `$emit` precedent in production):

```html
<div
  $each="monthCells as day" $key={day.toISOString()}
  $on:click={() => { this.dispatchEvent(new CustomEvent('dayjump', { detail: day, bubbles: true })) }}
>…</div>
```

**Variant B — declaration site** (Architect spec §5.a; per
`.team/prober-fixtures/CalendarGrid.variantB.aihu:26-28` with the
spec-aligned `payload:` key, NOT the fixture's `type:` shorthand):

```aihu
@state {
  $event: {
    dayjump: { payload: { day: Date }, describe: 'User selected a day cell.' },
  }
}
```

**Variant B — emit site** (per spec §5.b; Prober fixture used the
function-call form `$emit('dayjump', day)`, but spec specifies the proxy
form):

```html
{#each monthCells as day (day.toISOString())}
  <div
    class={['month-cell', day.getMonth() !== currentDate.getMonth() && 'other-month']}
    $on.click={() => $emit.dayjump({ day })}
  >
    <span class="day-number">{day.getDate()}</span>
  </div>
{/each}
```

**Variant B — listen site at parent** (spec §5.c):

```html
<CalendarGrid events={events} view={view} currentDate={currentDate} $on.dayjump={({ day }) => focusDate(day)} />
```

**What changed.** Three things land in one round:
1. New `$event:` collection joins the `$prop`/`$computed`/`$action`/
   `$resource`/`$effect`/`$lifecycle` family. Wrapped form only;
   required key `payload`; optional `describe`/`bubbles`/`composed`.
2. `$emit.<name>(payload)` proxy in handler bodies. Compiler resolves
   `<name>` against the `$event` collection at compile time; missing
   names error with **C501**.
3. Listen site uses `$on.<name>={fn}` — same syntax as DOM events. The
   compiler distinguishes DOM-vs-component at type resolution: if
   `<Tag>` declares `dayjump` in `$event`, the listener's destructure
   pattern gets the typed payload (`{ day }: { day: Date }`).

Eliminates raw `this.dispatchEvent(new CustomEvent(…))` from userland
template handlers (codemod pass `liftInlineDispatch` rewrites the
canonical shape; nested/conditional dispatch falls through with a
warning per spec §9 pass 6).

---

## §3 — Attribute handling

Binding directives stay attribute-form. Two structural changes vs v1:
**dot, not colon** for namespaced directives (`$on.click`,
`$bind.value`); **single-form-per-directive curly is canonical** (the
`$on:click="ident"` quoted shortcut is rewritten to curly).

### §3.1 Event handlers — `$on.<event>={…}`

Three corpus shapes, all rewritten the same way (colon → dot;
quoted-identifier → curly):

**v1**:

```html
<!-- inline arrow (examples/temperature-converter/...:47) -->
<input type="number" $on:input={(e) => setFromF(Number(e.target.value))} />

<!-- quoted-identifier shortcut (examples/live-counter/...:39-41) -->
<button $on:click="decrement">-</button>
<button $on:click="reset">Reset</button>
<button $on:click="increment">+</button>

<!-- keyboard predicate (examples/todo-mvc/...:102) -->
<input class="new-todo" $on:keydown={(e) => e.key === 'Enter' && addTodo()} autofocus />
```

**Variant B**:

```html
<input type="number" $on.input={(e) => setFromF(Number(e.target.value))} />

<button $on.click={decrement}>-</button>
<button $on.click={reset}>Reset</button>
<button $on.click={increment}>+</button>

<input class="new-todo" $on.keydown={(e) => e.key === 'Enter' && addTodo()} autofocus />
```

**What changed.** Colon → dot; quoted-identifier short form normalized
to curly (codemod passes 1+2). Compiler emits `addEventListener(<event>,
value)` at runtime — purely syntactic.

**Modifiers** (`.prevent`, `.stop`, `.once`) — not introduced this
round. `$once` is a separate boolean directive (§3.7). Userland calls
`e.preventDefault()` inline.

### §3.2 Property bindings (two-way) — `$bind.<prop>={…}`

Six corpus uses across temperature/weather/timer/currency converters,
all the same shape.

**v1**:

```html
<!-- examples/temperature-converter/...:40 -->
<input type="number" $bind:value="celsius" />
<!-- examples/currency-converter/...:53 -->
<select $bind:value="from">…</select>
<!-- examples/timer/...:67 -->
<input type="range" $bind:value="duration" />

<!-- Drift case (curly form, Scout D1.1 — parser accepts but spec forbids):
     .team/prober-fixtures/template-syntax-edge-cases.v1.aihu:30 -->
<input $bind:value={query} placeholder="curly-bind drift" />
```

**Variant B**:

```html
<input type="number" $bind.value={celsius} />
<select $bind.value={from}>…</select>
<input type="range" $bind.value={duration} />

<input $bind.value={query} placeholder="curly-bind drift" />  <!-- legalized -->
```

**What changed.** Colon → dot + quoted → curly. Runtime path
(`packages/arbor/src/attrs.ts:91-99` — `Array.isArray(value)` detects
the signal tuple and wires `mountEffect`) unchanged.

### §3.3 Class binding — array form (the inline-ternary lift)

The user's canonical pain point. Two corpus shapes, same rewrite.

**v1**:

```html
<!-- mail/src/components/CalendarGrid.aihu:44 -->
<div class={'month-cell' + (day.getMonth() !== currentDate.getMonth() ? ' other-month' : '')}>

<!-- examples/todo-mvc/todo-mvc.aihu:111, 128-130 -->
<li class={todo.done ? 'completed' : ''}>…</li>
<button class={filter === 'all' ? 'selected' : ''}>All</button>
<button class={filter === 'active' ? 'selected' : ''}>Active</button>
```

**Variant B**:

```html
<div class={['month-cell', day.getMonth() !== currentDate.getMonth() && 'other-month']}>

<li class={[todo.done && 'completed']}>…</li>
<button class={[filter === 'all' && 'selected']}>All</button>
<button class={[filter === 'active' && 'selected']}>Active</button>
```

**What changed.** Plain `class={…}` accepts `string` OR
`Array<string | false | null | undefined>`; runtime joins truthy entries
with space. Mirrors clsx / Solid idiom. No new sigil.

### §3.4 Class collection sugar — `$class:active={cond}` rewrite

**v1** (`apps/docs/src/components/docs-shell.aihu:34-57`, repeated 11×):

```html
<a class="nav-link" href="#introduction" $class:active={activePage() === 'introduction'}>Introduction</a>
```

**Variant B** (collapsed into the array form per §3.3):

```html
<a class={['nav-link', activePage() === 'introduction' && 'active']} href="#introduction">Introduction</a>
```

**What changed.** The `$class:<name>={cond}` namespaced directive (Scout
D1.1 lists as **NOT IMPLEMENTED** but leaks past codegen via the
silent-drop fall-through — Risk-7) is replaced by an entry in the
`class={[…]}` array. Codemod converts each `$class:X={c}` on an element
into one `c && 'X'` entry.

### §3.5 Style binding — `style={…}` (object form)

**No corpus example found** — userland uses static `style="…"` strings or
scoped CSS. Spec §3.A.1 says `style={{ color: 'red' }}` is accepted
(object form joined to `prop: value;` pairs at runtime).

**Synthetic minimal demo**:

```html
<div style={{
  '--accent': primary,
  color: lightness < 60 ? 'white' : 'black',
}}>…</div>
```

### §3.6 Raw HTML — `{@html expr}` (renamed)

Five corpus uses (3 quoted, 2 curly):

**v1**:

```html
<div class="text" $html="comment.text"></div>                            <!-- Comment.aihu:24 -->
<div class="text" $if={!!route.data.story.text} $html="route.data.story.text"></div>  <!-- item/[id].aihu:57 -->
<div $html="route.data.user.about"></div>                                <!-- user/[id].aihu:39 -->
<article $html={activeHtml()}></article>                                 <!-- docs-shell.aihu:62 -->
<article class="output" $html={rendered}></article>                      <!-- markdown-preview.aihu:39 -->
```

**Variant B** — block expression `{@html expr}` per spec §3.B.1
(Svelte-flavored, NOT Variant A's `$html.unsafe={…}`):

```html
<div class="text">{@html comment.text}</div>
{#if !!route.data.story.text}<div class="text">{@html route.data.story.text}</div>{/if}
<div>{@html route.data.user.about}</div>
<article>{@html activeHtml()}</article>
<article class="output">{@html rendered}</article>
```

**What changed.** The unsafe operation moves from an attribute to an
explicit block expression at the call site. The leading `@` is the
Svelte-style warning sigil. Security floor preserved per spec §6.
Optional `aihu.config.ts` `templates.htmlSanitizer` defaults to identity
(Director r2 §5).

### §3.7 Refs — `$ref={…}` (FIXED this round)

**v1** (`.team/prober-fixtures/template-syntax-edge-cases.v1.aihu:45` —
Scout D5.2: 7 in-repo files use `$ref`; their refs **do not work today**
because `emit_macro_effects` has no `"ref"` arm — `emit.rs:2088`
`_ => {}` default, Scout D1.4):

```html
<div $ref="selectedNode" class="preview">…</div>
```

**Variant B** (per spec §3.B.3 / §11.h — `$ref` stays attribute-form;
Builder ships `"ref"` arm + C500 exhaustiveness check this round):

```html
<div $ref={selectedNode} class="preview">…</div>
```

`selectedNode` is a writable signal-tuple in `@state`.

**What changed.** `$ref` actually works for the first time. The
quoted-to-curly normalization applies; the load-bearing change is the
codegen fix. Per Director r2 §4: ~10 LOC codegen + ~20 LOC test,
strictly additive.

### §3.8 Boolean directives — `$once` and `$memo` (unchanged)

**v1 + v2** (`bench/compiler-conformance/template-attrs/05-once-memo.aihu`):

```html
<div>
  <header $once><h1>Static Header</h1></header>
  <section $memo={[count, name]}><p>memoized</p></section>
</div>
```

**What changed.** Nothing. `$once` is boolean (no value); `$memo={[deps]}`
is curly-canonical.

### §3.9 Component prop binding (cross-component data)

**v1** (`examples/hacker-news/src/components/Comment.aihu:26` — recursive
list using `$each` ON the component element):

```html
<Comment $each="comment.children as item" $key={item.id} comment={item} />
```

**Variant B** (structural directives lift; prop binding unchanged):

```html
{#each comment.children as item (item.id)}
  <Comment comment={item} />
{/each}
```

**What changed.** §1.3 lift; `comment={item}` untouched. Per spec §7,
the generated `.aihu.ts` sidecar cross-checks `item: CommentNode`
against `Comment`'s `$prop.comment.type: CommentNode`.

---

## §4 — Cross-cutting full-file samples

Two end-to-end transformations so the reader sees how multiple constructs
compose.

### §4.1 `examples/live-counter/live-counter.aihu` — full v1 + Variant B

Smallest representative example. State + actions + three event handlers
in quoted-identifier short form.

**v1 → Variant B** (`examples/live-counter/live-counter.aihu:35-44`,
`@state` is v2-settled, unchanged):

```html
@template {
  <section class="counter">
    <h1>Count: {count}</h1>
    <div class="controls">
-     <button $on:click="decrement">-</button>
-     <button $on:click="reset">Reset</button>
-     <button $on:click="increment">+</button>
+     <button $on.click={decrement}>-</button>
+     <button $on.click={reset}>Reset</button>
+     <button $on.click={increment}>+</button>
    </div>
  </section>
}
```

**Diff summary.** Three sites: `$on:click="ident"` →
`$on.click={ident}`. Codemod passes 1 (colonToDot) + 2 (quotedToCurly).
No structural changes.

### §4.2 `mail/src/pages/login.aihu` — cross-repo coverage

Single file with `@route` + `@state` (with `$action`) + `@template`
(`$on:submit`, `$bind:value`, `$if`, `$on:click`) + `@style` — broadest
coverage in one file. Showing only the lines that change.

**v1 → Variant B** (`mail/src/pages/login.aihu:52-65`, ellipsis = unchanged):

```html
- <form class="login-form" $on:submit={signIn}>
+ <form class="login-form" $on.submit={signIn}>
    …
-   <input type="email" $bind:value="email" autocomplete="email" required>
+   <input type="email" $bind.value={email} autocomplete="email" required>
    …
-   <input type="password" $bind:value="password" autocomplete="current-password" required>
+   <input type="password" $bind.value={password} autocomplete="current-password" required>
    …
- <p $if={error} class="login-error" role="alert">{error}</p>
+ {#if error}
+   <p class="login-error" role="alert">{error}</p>
+ {/if}
    …
- <button type="button" class="btn-google" disabled={loading} $on:click={signInWithGoogle}>
+ <button type="button" class="btn-google" disabled={loading} $on.click={signInWithGoogle}>
```

**Diff summary.** 4 binding-directive sites colon→dot (`$on:submit`,
two `$bind:value`, `$on:click`); 2 `$bind:value` quoted → curly;
1 `$if` lift to `{#if}/{/if}` block-tag wrapping `<p>`. No class-array
opportunities. No `$each`, no `$emit` (auth flow uses imperative
`dispatchEvent` to the window for routing — out of SFC scope).

### §4.3 `mail/src/components/CalendarGrid.aihu` — pointer

Already transformed across all three variants by Prober. **Read
`.team/prober-fixtures/CalendarGrid.variantB.aihu`** for the shape, but
correct three issues this doc and Director r2 flag:

1. `$on:click` on line 53 should be `$on.click` (colon → dot).
2. `$emit('dayjump', day)` should be `$emit.dayjump({ day })` per spec
   §5.b proxy form (the fixture used the function-call form).
3. The two sibling `{#if view === 'week'}` / `{#if view === 'month'}`
   blocks (lines 33, 48) should collapse to one `{#if}/{:else if}/{/if}`
   chain per spec §3.B.6 — Director r2 §4 sample-level finding 2.

---

## §5 — Constructs out of scope this round

Spec §10 IS-NOT-IN entries that appear in corpus but Variant B does not
change: slots `<$slot>`, boundary primitives (`<$suspense>`,
`<$shield>`, `<$guard>`, `<$warp>`), arch-5 a11y/routing macro-elements
(`<$liveRegion>`, `<$skipLink>`, `<$focusTrap>`, `<$router>`, `<$link>`,
`<$navigate>`), `@route` block, `@style` block + `$reactive()` /
`$global` / `$media` macros, `@agent` block. Deprecated `@<event>=` and
`:<prop>=` aliases (Scout D1.2) are covered by codemod pass 1 and
become hard-error C500 if bypassed (spec §6 silent-drop closure).

---

## §6 — Coverage gaps

Constructs with no in-repo `.aihu` corpus example; synthetic demos
shown where practical:

- **`{:empty}`** (§1.5) — new; synthetic shown.
- **`{:else if}` chain** (§1.2) — corpus has the *pattern* (sibling
  `$if`s) but no v1 syntax. Prober B-fixture left it as two sibling
  `{#if}` (Director r2 §4 finding 2). Spec §3.B.6 exemplifies; Builder
  synthetic acceptance test required.
- **`style={…}` object form** (§3.5) — corpus uses static strings or
  `@style $reactive(...)`. Synthetic shown.
- **`$on.<event>` modifiers** (`.prevent`/`.stop`/`.once`) — not in
  this round.
- **`$show` block-tag form** — spec §3.B.1 keeps attribute-form.
- **`<$for>` empty-state** — Variant C territory.

**Builder regression-matrix recommendations** for
`packages/compiler/tests/codemods/fixtures/`:

1. `{:else if}` chain with 3+ branches (Director r2 §4 finding 2).
2. `{:empty}` fallback.
3. `$ref={signal}` round-trip: refs work post-mount (spec §11.h).
4. `$emit.<name>(payload)` typed-payload mismatch surfaces tsc error
   (spec §11.c, §11.d).
5. `class={[…]}` all-falsy returns empty class.

---

*End of corpus samples — companion to 2026-05-06-spec-template-syntax-v2.md.*
