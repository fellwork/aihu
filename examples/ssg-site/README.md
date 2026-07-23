# ssg-site — governed example (G8, SSG / static output)

The designated live exerciser for aihu's **static output** build path and the
hydration-lifecycle callbacks. Before the governed set, `output: 'static'` had
**zero** examples and `onAdopt` / `onAttributeChange` had zero coverage anywhere.

## What it exercises

| Surface | Where |
|---|---|
| `output: 'static'` (SSG) | `aihu.config.ts` |
| `site.url` (absolute canonical/og resolution) | `aihu.config.ts` |
| per-route SEO `<head>` — title / description / canonical / og / twitter / json-ld | `src/pages/index.aihu` `@route{head}` |
| SSR structural walk (`each`) → hydration adoption | `src/pages/index.aihu` |
| `onAdopt` (adoptedCallback) | `src/components/theme-badge.aihu` |
| `onAttributeChange` (attributeChangedCallback) | `src/components/theme-badge.aihu` |
| reflected `prop` attribute surface (`attribute:` / `reflect:`) | `src/components/theme-badge.aihu` |

## Build

```bash
bun run build      # client bundle + SSG prerender pass (closeBundle)
```

`bun run build` produces the client SPA bundle **and** prerenders every static
route to a content-ful `<pattern>/index.html` (`dist/index.html`,
`dist/about/index.html`) — real headings, list items, and the per-route
`<head>` (title / description / canonical / og / twitter / json-ld), each
carrying `data-aihu-path` hydration markers so the SPA adopts the prerendered
DOM in place on load. The governed-examples build lane
(`scripts/build-governed-examples.ts`, `coverage.manifest.json` `prerender`
block) asserts that content is really in the bytes, so a regression back to an
empty SPA shell is RED, not silently green.

### How the prerender renders without a DOM

The SSG pass loads each route through Vite's SSR module-runner
(`ssrLoadModule`). Compiled components are loaded with the compiler's **server
target**, which guards its custom-element registration behind
`typeof customElements` and exports a host-less `__ssr` factory plus the
compile-time `__aihu_ssr_string__` string renderer. `@aihu/server`'s
`renderToString` prefers that string fast path — pure string concatenation with
no `CSSStyleSheet` / `customElements` / DOM — so the render never touches the
browser globals the SSR runner lacks. (Earlier this example degraded to a green
-but-vacuous SPA shell because the runner evaluated the *client* target and hit
`CSSStyleSheet is not defined`; the server-target switch closed that.)
