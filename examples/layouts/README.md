# layouts — aihu example

Runtime **layout rendering** + **dynamic layout switching**.

Each page declares a layout in its `@route` block:

```
@route { path: "/", name: "home-page", layout: "app" }
```

At runtime `@aihu/app`'s client renderer reads the matched route's `layout`,
loads the layout SFC from `virtual:aihu-layouts`, renders it into the root
outlet, and mounts the page into the layout's `<outlet>` (`data-aihu-outlet`)
marker. Pages with no `layout` mount directly into the root outlet.

## What it shows

- **`src/layouts/`** — two layouts (`app`, `compact`), each with a `<outlet>`.
  A layout SFC compiles to a custom element registered as `aihu-layout-<name>`
  with a passive outlet marker the client renderer fills.
- **`src/pages/`** — two routes (`/`, `/dashboard`) that switch layouts **by
  navigation** (each declares a different `layout`).
- **Dynamic switching** — the bottom-right toolbar calls `app.setLayout(name)`
  (from the handle `createApp()` returns) to swap the current route's layout
  **without navigating**. `setLayout(null)` renders with no layout. The override
  resets on the next navigation. This is the same entry point an `@agent` action
  would use.

## Run

```bash
bun install
bun run --filter @aihu/example-layouts dev
```
