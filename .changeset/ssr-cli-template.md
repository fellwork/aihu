---
'@aihu/cli': minor
---

Add a real `ssr` template — `npm create aihu -- --template ssr` scaffolds a
Cloudflare Worker that server-renders.

`output: 'ssr'` was reachable from **no** scaffold. The only consumer-shaped
tree that exercised it was a post-scaffold patch inside the DX-matrix harness:
scaffold `minimal`, then rewrite its `vite.config.ts` and inject
`@aihu/adapter-cloudflare` before install. That was the right stopgap while the
SSR build was being fixed — the gate needed a consumer tree, and designing the
scaffold as a side effect of building a CI gate was the wrong order — but a
harness patch is not a product surface. No user could ask for it, and nothing
about it was typed or reviewable as a template.

The template bakes in the three options `output: 'ssr'` actually requires, each
commented in place because each fails differently:

- `output: 'ssr'` — without it there is no server build and no `_worker.js`.
- `css: { shadowMode: 'light' }` — **required**, not a style preference: a
  shadow leaf exports no `__aihu_shadow__`, so every nested component renders
  empty server-side. The build refuses rather than shipping blank children.
- `adapter: cloudflare({ name })` — what makes the SSR bundle a Worker
  (`export default { fetch }` + the ASSETS fallthrough) instead of a bare node
  bundle. It also writes `wrangler.toml` on the first build (never overwriting
  one), so the next step is literally `npx wrangler deploy`.

It ships **no `preview` script** and **no `wrangler` dependency**, both
deliberate. `vite preview` serves the client `dist/` as static files, so under
`output: 'ssr'` it answers 200 on a page the Worker never rendered — the wrong
artifact reported as success; `npx wrangler dev` runs the real one, and the
emitted README and AGENTS.md say so. `wrangler` stays out of `devDependencies`
because `npx` runs it without adding ~100MB and a second native-binary delivery
mechanism to every scaffold.

Verified end to end, not asserted: scaffolded through `create-aihu`, installed
fresh on bun against `npm pack` tarballs of this checkout, typechecked, built,
and then the built `dist-server/_worker.js` **imported and called** with a
stubbed `ASSETS` binding — 200 `text/html`, 2.4 kB, outlet rendered — on vite 6
and vite 8. The import is bounded by a timeout, because the SSR defect this
covers was a deadlock: a Worker that built green and could not be loaded at all.

The harness's `minimal-ssr` pseudo-template, its `ssr-config` step and its
config patcher are deleted; the row is now `{ id: 'ssr', kind: 'create' }`,
exactly as that code's own docblock promised.
