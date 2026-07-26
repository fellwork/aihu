# aihu compiler diagnostics — what you will see and how to fix it

Every diagnostic carries `hint:`, `fix:`, and usually a machine rewrite
(`replace:` / `with:`). Apply the printed `with:` line verbatim — it is
generated from your own source. `aihu_validate` returns the same diagnostics as
structured JSON.

## Before / after — the canonical wrong file

This is what an agent writing from Vue/v1 memory produces:

```aihu-error
@state {
  let count = state(0)
  const increment = action(() => { count++ })
}

@template {
  <button $on.click={increment} $if={count > 0}>Count: {{count}}</button>
}
```

Real compiler output (first error; fix, recompile, repeat):

```text
<stdin>:7:11: C607: `$on.click` is removed — template attributes are prefix-less. fix: rewrite as `on:click={increment}`.
7 |   <button $on.click={increment} $if={count > 0}>Count: {{count}}</button>
              ^^^^^^^^^^^^^^^^^^^^^
  hint: the `$` attribute layer is retired: naked keywords (`if`, `each`, `key`,
  `show`, …), colon directives (`on:click`, `bind:value`, `class:active`), and
  plain `{expr}` bindings replace it. `$` now belongs to `@state` macros only.
  replace: $on.click={increment}
  with:    on:click={increment}
```

The corrected file compiles clean:

```aihu
@state {
  let count = state(0)
  const increment = action(() => { count++ })
}

@template {
  <button on:click={increment} if={count > 0}>Count: {count}</button>
}
```

## Error code reference

| Code | Trigger | Fix |
|---|---|---|
| C300 | bare attribute value: `class=myClass` | quote it (`class="x"`) or brace it (`class={x}`) |
| C301 | unclosed `{` in an attribute expression | balance the braces |
| C302 | quoted/missing value on a framework word (`if="x"`, `on:click="fn"`), value on a bare word (`else={x}`), bad `each` head, unknown event modifier | brace expressions: `if={x}`, `on:click={fn}`; bare `else`; `each={item, i of items}`; modifiers are `.prevent` `.stop` `.self` `.once` |
| C303 | unclosed `{` in a plain attribute binding | balance the braces |
| C304 | Vue `:value="x"` binding alias | `value={x}` |
| C305 | Vue `@click="fn"` event alias (`@html` → `html={expr}`) | `on:click={fn}` |
| C440 | v1 statement macro `$action name() { }` | wrapper dialect: `const name = action(() => { })` |
| C500 | `@route` block outside `src/pages/` | move the file or drop `@route` |
| C604 | `{{count}}` mustache interpolation | single braces `{count}`; leading object literal needs a space `{ {…} }` |
| C606 | retired `$`-control-flow: `$if`, `$each="xs as x"`, `$let` | `if={…}`, `each={x of xs}` |
| C607 | any other retired `$`-attribute: `$on.click`, `$bind.value`, `$key`, `$show`, `$href`… | prefix-less form printed in the error (`on:click={…}`, `bind:value={…}`, …) |
| C622 | wrapper args swapped: `action(fn, config)` | config bag FIRST: `action(config, fn)` |
| C624 | wrapper nature/role mismatch (e.g. non-function where a function is required) | follow the printed hint |
| C625 | `$`-macros mixed with wrapper intrinsics in one `@state` | migrate the whole file to wrappers |
| C629 | malformed wrapper call | follow the printed hint |
| W210 | `on:foo` where `foo` is not a DOM event (compiles to a dead attribute) | real event name, or `html={…}` if you meant innerHTML |
| W602 | non-empty string on a boolean attribute: `disabled="false"` (truthy!) | bare `disabled` to enable, omit to disable, `disabled={cond}` to bind |

Other families you may encounter: C0xx (file/block structure — unknown block,
duplicate block, unclosed brace), C1xx–C2xx (block parsing), C4xx (`@state`
macro/wrapper validation), C55x–C56x (agent/GX surface), C9xx (internal).
The compiler also warns on undeclared cross-block references
("`@template` references 'x' which is not declared in `@state`") — declare the
name or fix the typo; this becomes an error in a future version.

## Workflow when a compile fails

1. Read the FIRST error only — later ones are often cascades.
2. Apply the `replace:`/`with:` rewrite if present; it is exact.
3. Recompile (`aihu_validate` or the compiler binary).
4. If the same code errors twice, stop guessing: fetch a working pattern with
   `aihu_example` or from `cookbook/` and diff against it.
