# aihu `@template` — template grammar

The template grammar is **prefix-less**: naked framework keywords, colon
directives, and `{expr}` braces. The `$` sigil never appears in a template
attribute (C606/C607), and Vue/Svelte aliases (`@click`, `:value`, `v-if`) are
compile errors that point at the correct form.

## Text and attribute values

- Interpolation is single braces: `{count}`, `{JSON.stringify(data.value)}`.
  `{{ … }}` is C604. An expression that *starts with* an object literal needs a
  space: `{ {…} }`.
- Attribute values have exactly three shapes:
  - `attr="text"` — static string (quoted; never reactive)
  - `attr={expr}` — reactive binding, on every element (`disabled={loading}`,
    `aria-selected={activeId === tab.id}`, `data-id={id}`)
  - bare `attr` — boolean presence (`disabled`, `data-x`)
  - anything else (`class=myClass`) is C300.
- `class={…}` accepts arrays with conditionals:
  `class={['tab-btn', activeId === tab.id && 'active']}`.
- Boolean-attribute trap: `disabled="false"` is truthy HTML (W602). Bind it:
  `disabled={cond}`.

## Control flow — naked keywords, reserved on every element

| Form | Meaning |
|---|---|
| `if={expr}` / `elseif={expr}` / bare `else` | conditional chain on consecutive sibling elements |
| `each={item of items}` | keyed list; head is item-first, `of`-separated |
| `each={item, i of items}` | with index (index is a plain identifier) |
| `each={[k, v] of entries}` | destructuring binders allowed |
| `key={expr}` | identity key for `each` rows |
| bare `empty` | sibling rendered when the `each` list is empty |
| `show={expr}` | keep in DOM, toggle visibility |
| `html={expr}` | set raw innerHTML (there is no `on:html`; W210 catches that) |
| `ref={expr}` | element reference |
| `memo={deps}`, bare `once`, bare `raw` | render refinements (sparse example coverage) |

`each="items as item"` (string DSL) and `$let` are removed — C606 with the
rewrite in the error. `else`/`empty` take no value (C302 if given one).

`<group>` is the invisible fragment element for control flow without a wrapper
element:

```aihu
@state {
  let items = state(['alpha', 'beta'])
  let query = state('')

  const filtered = derived(() => items.filter(x => x.includes(query)))
}

@template {
  <div>
    <input bind:value={query} placeholder="Filter…" aria-label="Filter items" />
    <ul>
      <group each={item, i of filtered} key={item}>
        <li>{i + 1}. {item}</li>
      </group>
      <li empty>No matches.</li>
    </ul>
  </div>
}
```

(Note: current compilers print a spurious "'item' … not declared in '@state'"
warning for `each` binders read bare in the row — the cookbook's own recipes
trigger it too. It is harmless today; filed as a compiler issue.)

## Colon directives

| Directive | Meaning |
|---|---|
| `on:<event>={handler}` | event listener: `on:click={increment}`, `on:keydown={onKeydown}`, inline `on:click={() => selectTab(tab.id)}` |
| `on:<event>.<mod>` | modifiers `.prevent` `.stop` `.self` `.once`: `on:submit.prevent={save}` |
| `bind:value={name}` | two-way binding to a `state`/`prop` declaration |
| `class:active={cond}` | conditional class toggle |
| `attr:<name>` | escape hatch emitting a literal attribute when the name collides with a framework word: `attr:if="config"` |

Values must be braced — `on:click="handler"` is C302. Custom event names are
fine (`on:user-login`, `on:valueChanged`); an all-lowercase unknown single word
(`on:foo`) draws warning W210 because it compiles to a dead `onfoo` attribute.

## Expressions read state bare

Inside `{…}` — including inline arrow handlers — read `state`/`prop`/`derived`
names bare: `{count}`, `if={items.length > 0}`,
`on:click={() => selectTab(tab.id)}`. The compiler auto-derives the reactive
read. Only composable getters (from `@aihu/use` etc.) need parens: `{x()}`.

## Slots and composition

- `<slot />` projects host children; named slots follow the platform
  (`<slot name="footer" />`).
- Other aihu components are used by their custom-element tag (filename stem):
  `<product-list></product-list>`. Tags must contain a hyphen — name component
  files kebab-case (`my-widget.aihu`), or the element cannot be registered.
- Enhanced `<a>` navigation and `<outlet>` exist for routed apps (see
  `examples/layouts`, `examples/hacker-news`).

## Worked example — tabs

```aihu
@state {
  const tabs = prop({
    default: [
      { id: 'one', label: 'One', content: 'First panel' },
      { id: 'two', label: 'Two', content: 'Second panel' },
    ],
  })

  let activeId = state('')

  const selected = derived(() => tabs.find(t => t.id === activeId) ?? tabs[0] ?? null)

  onMount(() => {
    if (tabs.length > 0) activeId = tabs[0].id
  })

  const selectTab = action((id) => { activeId = id })
}

@template {
  <div>
    <div role="tablist">
      <group each={tab of tabs} key={tab.id}>
        <button
          role="tab"
          class={['tab', activeId === tab.id && 'active']}
          aria-selected={activeId === tab.id}
          on:click={() => selectTab(tab.id)}
        >
          {tab.label}
        </button>
      </group>
    </div>
    <div role="tabpanel">
      <group if={selected}><p>{selected.content}</p></group>
      <group else><p>No tab selected.</p></group>
    </div>
  </div>
}

@style {
  .tab.active { font-weight: 600; }
}
```

## `@style`

`@style` is plain CSS, scoped to the component. Design-token custom properties
with fallbacks (`var(--border, #ccc)`) are the cookbook convention. Utility-CSS
integration exists via `@aihu/css-engine` (see `cookbook/tailwind-style.aihu`).
