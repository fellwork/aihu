---
"@aihu/app": patch
---

SSG/prerender layout parity (composition). When a static route declares a
`layout` and that layout module exposes an SSR-renderable `default`, the
prerender now renders the layout shell and injects the page content into its
`data-aihu-outlet` marker — so prerendered HTML matches the client's layout
wrapping. Layouts that aren't server-renderable (compiled SFCs, which register a
side-effect custom element with no `default`) are unchanged: the page ships the
SPA shell and the layout is applied client-side on hydration. A layout that
renders no `<$outlet>` marker warns and ships the page unwrapped.
