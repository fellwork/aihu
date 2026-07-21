# aihu — CSS Framework Pluggability

A worked example showing how to plug **Tailwind CSS** into a aihu app, plus
documented swap paths to **UnoCSS**, **Pico CSS**, and **vanilla `@style { }`**.

> The research that picked this approach lives at
> [`.team/followup-6track/T4-E3-css-pluggability-research.md`](../../.team/followup-6track/T4-E3-css-pluggability-research.md).

---

## Run it

```bash
cd examples/css-pluggability
bun install
bun run build      # compiles .aihu + bundles JS + runs Tailwind CLI
bun run start      # serves at http://localhost:3457/
```

You'll see two aihu components — `<pluggable-card>` and `<pluggable-button>` — styled
entirely by Tailwind utility classes written directly on elements inside the
`@template { }` block.

---

## How it works

aihu SFCs default to **shadow-DOM** custom elements with scoped styles via
Constructable Stylesheets (`@style { }` lowers to `adoptedStyleSheets` on the
shadow root). That gives you free style isolation but blocks global utility
stylesheets from reaching your components.

For Tailwind / UnoCSS / Pico to work, components mount in **light DOM**
instead, and the framework's stylesheet is loaded once globally. This example
uses `aihuCompilerPlugin({ shadowMode: 'light' })` (or in this case the
direct `_injectShadowMode(code, 'light')` post-process — see `build.ts`) to
register every component with `defineElement(tag, ctor, { shadowMode: 'light' })`.

The pipeline:

1. **Compile** each `.aihu` file with `@aihu/compiler`'s `transform()`.
2. **Post-process** the compiled JS with `_injectShadowMode(code, 'light')`
   so emitted `defineElement` calls register components in light DOM.
3. **Bundle** the JS with Bun's bundler.
4. **Compile Tailwind** with `bunx tailwindcss`, scanning the `.aihu`
   sources for class names.
5. **Serve** `index.html` with `<link rel="stylesheet" href="dist/tailwind.css">`.

---

## Why Tailwind?

Tailwind is the most-used CSS framework on npm (>11M weekly downloads) and
its integration exercises every surface aihu exposes for CSS pluggability:

- A build-time CSS pipeline.
- The runtime light-DOM opt-out (`shadowMode: 'light'`).
- A global stylesheet pattern.
- The trade-off between style isolation and utility-class ergonomics.

UnoCSS and Pico both *simplify* from this baseline rather than adding new
surface, so picking Tailwind as the worked example covers the most ground.

---

## Swap to UnoCSS

UnoCSS is a faster, more-flexible alternative to Tailwind with the same
utility-class shape. To swap:

1. Replace `tailwindcss` with `unocss` in `package.json` devDependencies.
2. Replace `tailwind.config.ts` with `uno.config.ts`:

   ```ts
   // uno.config.ts
   import { defineConfig, presetUno } from 'unocss'
   export default defineConfig({
     content: { filesystem: ['src/components/*.aihu', 'index.html'] },
     presets: [presetUno()],
   })
   ```

3. Swap the Tailwind CLI step in `build.ts` to UnoCSS CLI:

   ```diff
   - 'bunx', ['tailwindcss', '-i', '...', '-o', 'dist/tailwind.css', '-c', '...']
   + 'bunx', ['unocss', 'src/components/*.aihu', '-o', 'dist/tailwind.css', '-c', 'uno.config.ts']
   ```

4. Replace `@tailwind base/components/utilities;` directives in
   `src/styles/tailwind.css` with `@unocss;` — or skip the input file
   entirely (UnoCSS generates from scanned classes alone).

The components themselves don't change — Tailwind and UnoCSS share the same
utility class names for the subset used here.

---

## Swap to Pico CSS (classless)

Pico styles raw HTML elements. No utility classes; just include its
stylesheet and write semantic markup.

1. Drop `tailwindcss` from devDependencies; add `@picocss/pico`.
2. Drop the Tailwind CLI step from `build.ts` entirely.
3. Replace the `<link>` in `index.html`:

   ```html
   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
   ```

4. Strip class attributes from the `.aihu` files. For example, the Card
   becomes:

   ```
   @template {
     <article>
       <header>
         <h2>Card</h2>
         <p>A aihu component styled by Pico.</p>
       </header>
       <p>Click count: {{ count }}</p>
       <button onclick="increment">Increment</button>
     </article>
   }
   ```

5. Keep `shadowMode: 'light'` so Pico's global rules reach the components.

Pico is the **lowest-friction** integration — pick this if you want a polished
look with zero per-component styling work.

---

## Swap to vanilla `@style { }` (no framework)

This is what aihu ships out-of-box. Each component carries its own
scoped stylesheet via `@style { }`.

1. Drop `tailwindcss` from devDependencies.
2. Drop the Tailwind CLI step from `build.ts`.
3. Drop the `_injectShadowMode(..., 'light')` post-process step (so components
   default back to shadow DOM).
4. Drop the `<link rel="stylesheet">` from `index.html`.
5. Add an `@style { }` block to each component:

   ```
   @template {
     <article class="card">
       <h2>Card</h2>
       <button class="btn" onclick="increment">+</button>
     </article>
   }

   @style {
     .card { padding: 1rem; border: 1px solid #ccc; border-radius: 8px; }
     .btn { background: #10b981; color: white; padding: 0.25rem 0.75rem; }
   }
   ```

The `@style { }` block is scoped to the component's shadow root via
Constructable Stylesheets — your CSS doesn't leak.

For app-wide global rules, use `@style { $global { ... } }`:

```
@style {
  $global {
    body { font-family: system-ui; margin: 0; }
  }
}
```

---

## Trade-offs

| Concern | Tailwind / UnoCSS | Pico | Vanilla `@style { }` |
|---|---|---|---|
| Shadow-DOM scoping | Lost (light DOM required) | Lost (light DOM required) | Preserved (default) |
| Build step | Tailwind/UnoCSS CLI | None | None |
| Per-component CSS auth | Inline class attrs | None (semantic HTML) | `@style { }` block |
| CSS payload | One global file | One global file | Per-component sheets |
| Dynamic / reactive CSS | Class-list signals | Class-list signals | `$reactive(...)` macro |
| Framework lock-in | High | Low (Pico is small) | None |

A pragmatic split many apps land on:
- Use `@style { $global { ... } }` for design tokens / typography baseline.
- Use `@style { }` per-component for component-specific layout.
- Drop in Pico (or skip a framework entirely) for the long tail.
- Reach for Tailwind when class-utility ergonomics matter and isolation doesn't.

---

## Future direction — Plugin Contract integration

The Plugin Contract spec
([`docs/superpowers/specs/2026-05-02-spec-plugin-contract.md`](../../docs/superpowers/specs/2026-05-02-spec-plugin-contract.md))
declares a `transformBlock` hook that lets a plugin rewrite block contents
before lowering. A future `@aihu/plugin-tailwind` would run Tailwind's
PostCSS pipeline inside `@style { }` blocks, restoring `@apply` ergonomics
and per-component scoping with utility-class authoring.

That plugin is **not implemented yet** — the lowering pipeline for plugin
blocks is post-v1 work. Until then, the global-stylesheet + light-DOM pattern
demonstrated here is the production path.

---

## Files

- `src/components/pluggable-card.aihu` — Tailwind-styled card with a counter signal.
- `src/components/pluggable-button.aihu` — Tailwind-styled toggle button.
- `src/styles/tailwind.css` — Tailwind input file (`@tailwind base/components/utilities`).
- `src/main.ts` — wires `_setMount(mount)` and imports the compiled components.
- `tailwind.config.ts` — Tailwind config; scans `.aihu` files for class names.
- `build.ts` — pipeline (compile → post-process → bundle → Tailwind CLI).
- `server.ts` — minimal Bun.serve for viewing.
- `index.html` — host page with `<link>` to `dist/tailwind.css`.
