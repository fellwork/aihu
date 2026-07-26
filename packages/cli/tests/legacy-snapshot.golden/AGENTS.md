# legacy-snapshot — agent guide

This is an aihu application: `.aihu` single-file components compiled to vanilla
custom elements. The rules below are the patterns coding agents most often get
wrong in `.aihu` files — follow them exactly. When unsure whether generated
source compiles, use the `aihu_validate` MCP tool (registered in `.mcp.json`);
for a canonical example of a pattern, use `aihu_example`.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Vite dev server with hot reload |
| `bun run build` | Static production build to dist/ |
| `bun run preview` | Serve the production build locally |
| `bun run typecheck` | aihu-tsc — type-checks inside .aihu files (plain tsc cannot) |

## Project map

| Path | What it is |
| --- | --- |
| `src/pages/*.aihu` | Pages — file path is the route; @route names the custom-element tag |
| `src/main.ts` | Entry: createApp() mounts the router into #outlet |
| `vite.config.ts` | viteAihuPlugin (compiler + router) and the agent-readiness pass |
| `index.html` | Document shell and <head> defaults |

## 5 rules for .aihu files

1. **Signal mutation goes through the setter, never direct assignment.** Signals
   declared with `const [value, setValue] = signal(initial)` are read-only tuples:
   `value` is a getter function, `setValue` is the only way to update it. To update
   from the previous value, use the updater form: `setValue(prev => prev + 1)`.
   Never write `value = newVal`, and never assign `$prop` values directly.

   ```ts
   // Wrong
   count = 5
   items = [...items, newItem]

   // Correct
   setCount(5)
   setItems(prev => [...prev, newItem])
   ```

2. **Use v2 collection-form macros in `@state`, not v1 statement macros.** The v1
   syntax used top-level statements (`$action name() { }`, `$computed name = expr`,
   `$lifecycle.mount(() => { })`). Current v2 syntax groups these into object-literal
   collection blocks. Never generate v1 statement macros; run `npx aihu migrate` to
   upgrade old sources.

   ```ts
   // Wrong (v1)
   $action increment() { setCount(count() + 1) }
   $computed doubled = count() * 2

   // Correct (v2)
   $action: {
     increment: {
       describe: 'Add 1 to the value',
       handler: () => setCount(count() + 1),
     },
   }
   $computed: {
     doubled: () => count() * 2,
   }
   ```

3. **Import from `@aihu/*`, never `@scribe/*`.** The framework was renamed from
   Scribe to aihu; there is no `@scribe/` scope. Any `@scribe/*` import is a build
   failure.

   ```ts
   import { signal } from '@aihu/signals'      // correct
   import { branch, leaf, mount } from '@aihu/arbor'
   ```

4. **Read signals as function calls in script; use bare names in template
   expressions.** Inside `@state`, signals are getters — always call them:
   `count()`, `items()`. In `@template` expressions the compiler auto-invokes
   getters, so use the bare name: `{count}`, `if={items.length > 0}`. Exception:
   inside inline JS expressions in templates (an event handler arrow), call them:
   `on:click={() => setCount(count() + 1)}`.

5. **Template directives are prefix-less colon forms; `$` belongs to `@state`
   macros only.** Event handlers are `on:click`, `on:input`, `on:keydown` (dotted
   modifiers allowed: `on:click.prevent`); two-way binding is `bind:value`. Control
   flow is naked attributes: `if={…}`, `elseif={…}`, `else`, `each={item, i of items}`,
   `key={…}`, `empty`. Reactive attribute values are plain braces
   (`disabled={loading}`); quoted strings are static. Generating `$on:click`,
   `$on.click`, `$bind:value`, `$if=`, or `$each=` as template attributes is always
   wrong (compile errors C606/C607).

   ```html
   @template {
     <!-- Correct -->
     <input bind:value={draft} on:keydown={(e) => e.key === 'Enter' && submit()} />
     <button on:click={submit}>Submit</button>
     <li each={item, i of items} key={item.id}>{item.text}</li>

     <!-- Wrong — $-prefixed forms are @state macros, not template attributes -->
     <button $on:click={submit}>Submit</button>
     <input $bind:value="draft" />
   }
   ```
