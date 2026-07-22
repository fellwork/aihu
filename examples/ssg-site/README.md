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

## Known limitation (framework, tracked for Phase 2b/3)

`bun run build` currently exits 0 and produces the client SPA bundle, but the
SSG **prerender pass degrades**: `ssrLoadModule` evaluates compiled components
in Vite's SSR module-runner where `CSSStyleSheet` (and other custom-element DOM
globals) are undefined, so each route load fails with a **warning** and no
per-route `index.html` content is written. The build stays green — the same
"succeed-vacuously" class the cookbook-index guard exists to prevent, here in
the SSG path. Closing it needs an SSR DOM environment (or CSSStyleSheet /
customElements shim) in `@aihu/app`'s prerender module loader — a framework fix
outside the examples-governance phase. The SFCs themselves compile clean
(`check:emit-parses`) and the per-route head sidecars carry the full SEO
metadata, so the coverage claim is honest at the source level.
